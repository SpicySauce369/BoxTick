// 관리자 — 게시글 관리 (/admin/posts.html)
(async () => {
  const { api, el, setText, replaceChildren, formatDate, toast, handleError } = BoxTick;
  const { urlState, renderFilter, recordButton, renderPager, revealDetail } = BoxTickManage;
  const { CATEGORIES, categoryChip, categoryLabel, postUrl } = BoxTickBoard;

  const PAGE_SIZE = 10;
  const CATEGORY_FILTERS = [{ value: '', label: '전체' }, ...CATEGORIES.map((c) => ({ value: c.key, label: c.label }))];
  const searchInput = document.getElementById('q');

  await BoxTickAdmin.initAdminPage({
    active: 'posts',
    hints: [
      { key: 'A', label: '결정' },
      { key: 'B', label: '대시보드', href: '/admin/' },
      { key: 'X', label: '검색', onClick: () => searchInput.focus() },
      { key: 'Y', label: '공지 쓰기', href: '/write.html?category=notice' },
    ],
  });

  const { state, update } = urlState(['category', 'q', 'userId']);
  if (!CATEGORY_FILTERS.some((f) => f.value === state.category)) state.category = '';
  if (!/^\d+$/.test(state.userId)) state.userId = '';
  searchInput.value = state.q;

  const list = document.getElementById('item-list');
  const pager = { prev: document.getElementById('prev-page'), next: document.getElementById('next-page'), label: document.getElementById('page-label') };
  let posts = [];
  let selectedId = null;

  /* ---------- 작성자 필터 (?userId=) ---------- */

  async function renderAuthorFilter() {
    const box = document.getElementById('author-filter');
    box.hidden = !state.userId;
    if (!state.userId) return;
    let name = '#' + state.userId;
    try {
      const { user } = await api('/api/admin/users/' + state.userId);
      name = `${user.nickname} (@${user.username})`;
    } catch (err) {
      if (err.status !== 404) handleError(err);
    }
    replaceChildren(box, [
      el('span', null, ['작성자: ', el('strong', null, name)]),
      el('button', {
        type: 'button',
        class: 'manage-author-filter__clear',
        'aria-label': '작성자 필터 해제',
        onClick: () => {
          update({ userId: '' });
          renderAuthorFilter();
          load();
        },
      }, '✕ 해제'),
    ]);
  }

  /* ---------- 목록 ---------- */

  function renderList() {
    replaceChildren(list, posts.length
      ? posts.map((post) => recordButton({
          title: [categoryChip(post.category), post.title],
          meta: `No.${post.id} · ${post.author_nickname} · 조회 ${post.views} · 댓글 ${post.comment_count}`,
          aside: [el('span', { class: 'manage-year' }, formatDate(post.created_at).slice(0, 5)), formatDate(post.created_at).slice(5)],
          selected: post.id === selectedId,
          onClick: () => select(post, { reveal: true }),
        }))
      : el('div', { class: 'empty-state' }, state.q ? '검색 결과가 없습니다.' : '해당하는 게시글이 없습니다.'));
  }

  async function load() {
    renderFilter(document.getElementById('category-filter'), CATEGORY_FILTERS, state.category, (value) => {
      update({ category: value });
      load();
    });
    replaceChildren(list, el('div', { class: 'loading-state' }, '불러오는 중…'));
    try {
      const query = new URLSearchParams({ page: state.page, size: PAGE_SIZE });
      for (const key of ['category', 'q', 'userId']) if (state[key]) query.set(key, state[key]);
      const data = await api('/api/admin/posts?' + query);
      const last = Math.max(1, Math.ceil(data.total / data.size));
      if (data.page > last) {
        update({ page: last });
        return load();
      }
      posts = data.posts;
      setText(document.getElementById('result-count'), data.total + '건');
      renderList();
      renderPager(pager, data.page, data.total, data.size, (page) => {
        update({ page });
        load();
      });
    } catch (err) {
      replaceChildren(list, el('div', { class: 'empty-state' }, '게시글을 불러오지 못했습니다.'));
      handleError(err);
    }
  }

  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    update({ q: searchInput.value.trim() });
    load();
  });

  /* ---------- 상세 · 삭제 ---------- */

  function clearDetail() {
    selectedId = null;
    document.getElementById('detail').hidden = true;
    document.getElementById('detail-empty').hidden = false;
    setText(document.getElementById('detail-state'), '-');
  }

  function select(post, { reveal = false } = {}) {
    selectedId = post.id;
    renderList();
    document.getElementById('detail-empty').hidden = true;
    document.getElementById('detail').hidden = false;
    setText(document.getElementById('detail-state'), 'No.' + post.id);
    replaceChildren(document.getElementById('detail-chip'), categoryChip(post.category));
    setText(document.getElementById('detail-name'), post.title);
    setText(document.getElementById('detail-author'), post.author_nickname);
    const edited = post.updated_at && post.updated_at !== post.created_at;
    setText(document.getElementById('detail-date'), formatDate(post.created_at, { withTime: true }) + (edited ? ' (수정됨)' : ''));
    setText(document.getElementById('detail-views'), String(post.views));
    setText(document.getElementById('detail-comments'), post.comment_count + '개');
    document.getElementById('detail-author-link').href = '/admin/posts.html?userId=' + post.author_id;
    document.getElementById('detail-view-link').href = postUrl(post.id);
    document.getElementById('delete-button').onclick = () => remove(post);
    if (reveal) revealDetail(document.getElementById('detail-panel'));
  }

  async function remove(post) {
    const message = `[${categoryLabel(post.category)}] "${post.title}" 글을 삭제할까요? 댓글 ${post.comment_count}개도 함께 삭제되며 되돌릴 수 없습니다.`;
    if (!(await BoxTick.confirm(message, { okText: '삭제', danger: true }))) return;
    const button = document.getElementById('delete-button');
    button.disabled = true;
    try {
      await api('/api/admin/posts/' + post.id, { method: 'DELETE' });
      toast('게시글을 삭제했습니다.', 'success');
      clearDetail();
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      button.disabled = false;
    }
  }

  renderAuthorFilter();
  load();
})();
