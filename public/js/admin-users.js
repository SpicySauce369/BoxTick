// 관리자 — 회원 관리 (/admin/users.html)
(async () => {
  const { api, el, setText, replaceChildren, formatDate, toast, handleError } = BoxTick;
  const { urlState, renderFilter, recordButton, renderPager, revealDetail } = BoxTickManage;

  const PAGE_SIZE = 10;
  const STATUS_FILTERS = [
    { value: '', label: '전체' },
    { value: 'active', label: '활동 중' },
    { value: 'banned', label: '정지' },
  ];
  const searchInput = document.getElementById('q');

  const me = await BoxTickAdmin.initAdminPage({
    active: 'users',
    hints: [
      { key: 'A', label: '결정' },
      { key: 'B', label: '대시보드', href: '/admin/' },
      { key: 'X', label: '검색', onClick: () => searchInput.focus() },
    ],
  });

  const { state, update } = urlState(['status', 'q']);
  if (!STATUS_FILTERS.some((f) => f.value === state.status)) state.status = '';
  searchInput.value = state.q;

  const list = document.getElementById('item-list');
  const pager = { prev: document.getElementById('prev-page'), next: document.getElementById('next-page'), label: document.getElementById('page-label') };
  let users = [];
  let selectedId = null;

  /* ---------- 목록 ---------- */

  function statusText(user) {
    return user.status === 'banned' ? '정지' : '활동';
  }

  function renderList() {
    replaceChildren(list, users.length
      ? users.map((user) => recordButton({
          title: [
            user.nickname,
            user.role === 'admin' ? el('span', { class: 'chip chip--signal manage-chip' }, '관리자') : null,
          ],
          meta: `@${user.username} · 가입 ${formatDate(user.created_at)} · 글 ${user.post_count}`,
          aside: statusText(user),
          asideClass: user.status === 'banned' ? 'manage-aside--banned' : '',
          selected: user.id === selectedId,
          onClick: () => select(user.id, { reveal: true }),
        }))
      : el('div', { class: 'empty-state' }, state.q ? '검색 결과가 없습니다.' : '해당하는 회원이 없습니다.'));
  }

  async function load() {
    renderFilter(document.getElementById('status-filter'), STATUS_FILTERS, state.status, (value) => {
      update({ status: value });
      load();
    });
    replaceChildren(list, el('div', { class: 'loading-state' }, '불러오는 중…'));
    try {
      const query = new URLSearchParams({ page: state.page, size: PAGE_SIZE });
      if (state.status) query.set('status', state.status);
      if (state.q) query.set('q', state.q);
      const data = await api('/api/admin/users?' + query);
      const last = Math.max(1, Math.ceil(data.total / data.size));
      // 주소의 page 가 범위를 넘으면 마지막 페이지로
      if (data.page > last) {
        update({ page: last });
        return load();
      }
      users = data.users;
      setText(document.getElementById('result-count'), data.total + '명');
      renderList();
      renderPager(pager, data.page, data.total, data.size, (page) => {
        update({ page });
        load();
      });
    } catch (err) {
      replaceChildren(list, el('div', { class: 'empty-state' }, '회원 목록을 불러오지 못했습니다.'));
      handleError(err);
    }
  }

  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    update({ q: searchInput.value.trim() });
    load();
  });

  /* ---------- 상세 · 정지/해제 ---------- */

  const statusButton = document.getElementById('status-button');

  function renderDetail(user) {
    document.getElementById('detail-empty').hidden = true;
    document.getElementById('detail').hidden = false;
    setText(document.getElementById('detail-state'), user.status === 'banned' ? 'BANNED' : 'ACTIVE');
    setText(document.getElementById('detail-name'), user.nickname);
    setText(document.getElementById('detail-id'), '#' + user.id);
    setText(document.getElementById('detail-username'), '@' + user.username);
    setText(document.getElementById('detail-role'), user.role === 'admin' ? '관리자' : '일반 회원');
    replaceChildren(document.getElementById('detail-status'),
      el('span', { class: user.status === 'banned' ? 'price-up' : '' }, user.status === 'banned' ? '이용 정지' : '활동 중'));
    setText(document.getElementById('detail-joined'), formatDate(user.created_at, { withTime: true }));
    const listed = users.find((u) => u.id === user.id);
    setText(document.getElementById('detail-posts'), listed ? listed.post_count + '개' : '-');
    document.getElementById('detail-posts-link').href = '/admin/posts.html?userId=' + user.id;

    // 서버 규칙과 같게: 본인과 다른 관리자는 상태를 바꿀 수 없다
    const note = document.getElementById('detail-note');
    let reason = '';
    if (user.id === me.id) reason = '본인 계정의 상태는 변경할 수 없습니다.';
    else if (user.role === 'admin') reason = '관리자 계정의 상태는 변경할 수 없습니다.';
    note.hidden = !reason;
    setText(note, reason);

    statusButton.hidden = Boolean(reason);
    const banned = user.status === 'banned';
    setText(statusButton, banned ? '정지 해제' : '이용 정지');
    statusButton.className = 'btn ' + (banned ? 'btn--primary' : 'btn--danger');
    statusButton.onclick = () => changeStatus(user, banned ? 'active' : 'banned');
  }

  async function select(id, { reveal = false } = {}) {
    selectedId = id;
    renderList();
    try {
      const { user } = await api('/api/admin/users/' + id);
      if (selectedId !== id) return; // 그 사이 다른 회원을 골랐다면 무시
      renderDetail(user);
      if (reveal) revealDetail(document.getElementById('detail-panel'));
    } catch (err) {
      handleError(err);
    }
  }

  async function changeStatus(user, status) {
    const message = status === 'banned'
      ? `${user.nickname}(@${user.username}) 님의 이용을 정지할까요? 정지된 회원은 바로 로그아웃되고 다시 로그인할 수 없습니다.`
      : `${user.nickname}(@${user.username}) 님의 정지를 해제할까요?`;
    if (!(await BoxTick.confirm(message, { okText: status === 'banned' ? '정지' : '해제', danger: status === 'banned' }))) return;
    statusButton.disabled = true;
    try {
      const { user: updated } = await api(`/api/admin/users/${user.id}/status`, { method: 'PATCH', body: { status } });
      toast(status === 'banned' ? '이용을 정지했습니다.' : '정지를 해제했습니다.', 'success');
      await load();
      if (selectedId === updated.id) renderDetail(updated);
    } catch (err) {
      handleError(err);
    } finally {
      statusButton.disabled = false;
    }
  }

  load();
})();
