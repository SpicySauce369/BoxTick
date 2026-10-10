// 마이페이지: 트레이너 카드 + [내 정보] / [내가 쓴 글] 탭
(async () => {
  const { api, el, initPage, setText, replaceChildren, formatDate, showFieldErrors, toast, getMe, HINT_BACK } = BoxTick;

  const CATEGORY_LABELS = { free: '자유', price: '시세', brag: '자랑', notice: '공지' };
  const PAGE_SIZE = 10;
  const params = new URLSearchParams(location.search);
  let tab = params.get('tab') === 'posts' ? 'posts' : 'info';
  let page = Math.max(1, Number(params.get('page')) || 1);

  const user = await initPage({
    auth: 'login',
    hints: [
      { key: 'A', label: '결정' },
      HINT_BACK,
      { key: 'X', label: '탭 전환', onClick: () => showTab(tab === 'info' ? 'posts' : 'info') },
      { key: 'Y', label: '글쓰기', href: '/write.html' },
    ],
  });

  /* ---------- 트레이너 카드 ---------- */

  function renderCard(me) {
    setText(document.getElementById('my-nickname'), me.nickname);
    setText(document.getElementById('my-username'), '@' + me.username);
    setText(document.getElementById('my-joined'), formatDate(me.created_at));
    setText(document.getElementById('my-role'), me.role === 'admin' ? '관리자' : '트레이너');
    // 헤더의 닉네임도 같이 바꾼다
    const headerName = document.querySelector('.site-user');
    if (headerName) setText(headerName, me.nickname);
  }

  function renderPostCount(total) {
    setText(document.getElementById('my-post-count'), total + '개');
    setText(document.getElementById('tab-posts-count'), String(total));
  }

  renderCard(user);
  document.getElementById('nickname').value = user.nickname;
  document.querySelector('#password-form [name="username"]').value = user.username;

  /* ---------- 탭 ---------- */

  const tabs = [...document.querySelectorAll('.my-tabs [role="tab"]')];

  function syncUrl() {
    const query = new URLSearchParams();
    if (tab === 'posts') {
      query.set('tab', 'posts');
      if (page > 1) query.set('page', page);
    }
    const qs = query.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function showTab(name, { focus = false } = {}) {
    tab = name;
    for (const button of tabs) {
      const selected = button.dataset.tab === name;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) button.focus();
    }
    syncUrl();
  }

  tabs.forEach((button, index) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
    // 방향키로 탭 이동 (WAI-ARIA tabs 패턴)
    button.addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length];
      showTab(next.dataset.tab, { focus: true });
    });
  });

  /* ---------- 내가 쓴 글 ---------- */

  const list = document.getElementById('my-post-list');
  const prev = document.getElementById('prev-page');
  const next = document.getElementById('next-page');

  // 모바일에서는 연도를 숨겨 제목 자리를 넓힌다 (2026.09.12 → 09.12)
  function dateParts(value) {
    const text = formatDate(value);
    return [el('span', { class: 'my-post__year' }, text.slice(0, 5)), text.slice(5)];
  }

  function postRow(post) {
    return el('li', null, el('a', { class: 'list-row my-post', href: '/post.html?id=' + post.id }, [
      el('span', { class: 'list-row__main' }, [
        el('span', { class: 'chip' + (post.category === 'notice' ? ' chip--sword' : '') }, CATEGORY_LABELS[post.category] || post.category),
        el('span', { class: 'my-post__title' }, post.title),
        post.comment_count ? el('span', { class: 'my-post__comments', 'aria-label': '댓글 ' + post.comment_count + '개' }, '[' + post.comment_count + ']') : null,
      ]),
      el('span', { class: 'list-row__aside' }, dateParts(post.created_at)),
    ]));
  }

  async function loadPosts() {
    replaceChildren(list, el('li', { class: 'loading-state' }, '불러오는 중입니다.'));
    try {
      const data = await api(`/api/auth/me/posts?page=${page}&size=${PAGE_SIZE}`);
      const maxPage = Math.max(1, Math.ceil(data.total / data.size));
      // 글을 지워 마지막 페이지가 사라졌다면 끝 페이지로 다시 불러온다
      if (data.page > maxPage) {
        page = maxPage;
        return loadPosts();
      }
      renderPostCount(data.total);
      replaceChildren(list, data.posts.length
        ? data.posts.map(postRow)
        : el('li', { class: 'empty-state' }, ['아직 작성한 글이 없습니다. ', el('a', { href: '/write.html' }, '첫 글 쓰기')]));
      setText(document.getElementById('page-label'), `${data.page} / ${maxPage}`);
      prev.disabled = data.page <= 1;
      next.disabled = data.page >= maxPage;
      syncUrl();
    } catch (err) {
      replaceChildren(list, el('li', { class: 'empty-state' }, '글 목록을 불러오지 못했습니다.'));
      BoxTick.handleError(err);
    }
  }

  prev.addEventListener('click', () => { if (page > 1) { page -= 1; loadPosts(); } });
  next.addEventListener('click', () => { page += 1; loadPosts(); });

  /* ---------- 내 정보 수정 ---------- */

  // 버튼을 잠가 중복 제출을 막는다
  async function submitting(form, task) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await task();
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) showFieldErrors(form, err.fields);
      else BoxTick.handleError(err);
    } finally {
      button.disabled = false;
    }
  }

  const nicknameForm = document.getElementById('nickname-form');
  nicknameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const nickname = nicknameForm.nickname.value.trim();
    const fields = {};
    if (nickname.length < 2 || nickname.length > 20) fields.nickname = '닉네임은 2~20자여야 합니다.';
    showFieldErrors(nicknameForm, fields);
    if (Object.keys(fields).length) return;

    submitting(nicknameForm, async () => {
      const { user: updated } = await api('/api/auth/me', { method: 'PUT', body: { nickname } });
      await getMe({ refresh: true });
      renderCard(updated);
      nicknameForm.nickname.value = updated.nickname;
      toast('닉네임을 변경했습니다.', 'success');
    });
  });

  const passwordForm = document.getElementById('password-form');
  passwordForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const body = {
      currentPassword: passwordForm.currentPassword.value,
      newPassword: passwordForm.newPassword.value,
    };
    const fields = {};
    if (!body.currentPassword) fields.currentPassword = '현재 비밀번호를 입력해 주세요.';
    if (body.newPassword.length < 8) fields.newPassword = '비밀번호는 8자 이상이어야 합니다.';
    else if (body.newPassword !== passwordForm.newPasswordConfirm.value) {
      fields.newPasswordConfirm = '새 비밀번호가 일치하지 않습니다.';
    }
    showFieldErrors(passwordForm, fields);
    if (Object.keys(fields).length) return;

    submitting(passwordForm, async () => {
      await api('/api/auth/me', { method: 'PUT', body });
      passwordForm.reset();
      passwordForm.username.value = user.username;
      toast('비밀번호를 변경했습니다.', 'success');
    });
  });

  showTab(tab);
  loadPosts();
})();
