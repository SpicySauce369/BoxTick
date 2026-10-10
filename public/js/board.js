// 게시판 목록: 카테고리 탭 + 검색 + 페이지 번호. 상태는 주소(?category=&q=&page=)에 둔다.
(async () => {
  const { api, el, initPage, setText, replaceChildren, formatDate } = BoxTick;
  const { CATEGORIES, categoryChip, avatar, postUrl } = BoxTickBoard;

  const PAGE_SIZE = 15;
  const params = new URLSearchParams(location.search);
  const category = CATEGORIES.some((c) => c.key === params.get('category')) ? params.get('category') : '';
  const q = (params.get('q') || '').trim();
  const page = Math.max(1, Number(params.get('page')) || 1);

  const searchInput = document.getElementById('q');

  await initPage({
    active: 'board',
    hints: [
      { key: 'A', label: '결정' },
      { key: 'B', label: '홈', href: '/' },
      { key: 'X', label: '검색', onClick: () => searchInput.focus() },
      { key: 'Y', label: '글쓰기', href: '/write.html' },
    ],
  });

  /** 현재 조건에서 일부만 바꾼 목록 주소 */
  function listUrl(changes) {
    const next = new URLSearchParams();
    const state = { category, q, page: 1, ...changes };
    if (state.category) next.set('category', state.category);
    if (state.q) next.set('q', state.q);
    if (state.page > 1) next.set('page', state.page);
    const qs = next.toString();
    return '/board.html' + (qs ? '?' + qs : '');
  }

  /* ---------- 카테고리 탭 · 검색 ---------- */

  replaceChildren(
    document.getElementById('category-tabs'),
    [{ key: '', label: '전체' }, ...CATEGORIES].map((c) =>
      el('li', null, el('a', { href: listUrl({ category: c.key }), 'aria-current': c.key === category ? 'page' : null }, c.label))
    )
  );

  if (category && category !== 'notice') document.getElementById('write-link').href = '/write.html?category=' + category;

  searchInput.value = q;
  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    location.href = listUrl({ q: searchInput.value.trim() });
  });

  /* ---------- 목록 ---------- */

  const list = document.getElementById('post-list');

  // 모바일에서는 연도를 숨겨 제목 자리를 넓힌다 (2026.09.12 → 09.12)
  function dateParts(value) {
    const text = formatDate(value);
    return [el('span', { class: 'board-row__year' }, text.slice(0, 5)), text.slice(5)];
  }

  function postRow(post) {
    return el('li', null, el('a', { class: 'list-row board-row', href: postUrl(post.id) }, [
      el('span', { class: 'board-row__num num' }, String(post.id)),
      el('span', { class: 'board-row__title' }, [
        categoryChip(post.category),
        el('span', { class: 'board-row__text' }, post.title),
        post.comment_count
          ? el('span', { class: 'board-row__comments', 'aria-label': '댓글 ' + post.comment_count + '개' }, '[' + post.comment_count + ']')
          : null,
      ]),
      el('span', { class: 'board-row__author' }, [avatar(post.author_nickname, post.author_id, { size: 'sm' }), el('span', null, post.author_nickname)]),
      el('span', { class: 'board-row__date num' }, dateParts(post.created_at)),
      el('span', { class: 'board-row__views num', 'aria-label': '조회 ' + post.views }, String(post.views)),
    ]));
  }

  // 1 … 4 5 [6] 7 8 … 20 처럼 현재 페이지 주변만 보여준다
  function pageNumbers(current, last) {
    const pages = new Set([1, last]);
    const spread = matchMedia('(max-width: 700px)').matches ? 1 : 2;
    for (let p = current - spread; p <= current + spread; p += 1) if (p >= 1 && p <= last) pages.add(p);
    const sorted = [...pages].sort((a, b) => a - b);
    const out = [];
    sorted.forEach((p, i) => {
      if (i && p - sorted[i - 1] > 1) out.push(null);
      out.push(p);
    });
    return out;
  }

  function renderPagination(current, last) {
    const nav = document.getElementById('pagination');
    if (last <= 1) return replaceChildren(nav, null);
    const arrow = (label, target, text) => target
      ? el('a', { class: 'board-pages__arrow', href: listUrl({ page: target }), 'aria-label': label }, text)
      : el('span', { class: 'board-pages__arrow', 'aria-hidden': 'true' }, text);
    replaceChildren(nav, [
      arrow('이전 페이지', current > 1 ? current - 1 : null, '◀'),
      el('ul', { class: 'round-select' }, pageNumbers(current, last).map((p) =>
        p === null
          ? el('li', { class: 'board-pages__gap', 'aria-hidden': 'true' }, '…')
          : el('li', null, el('a', { href: listUrl({ page: p }), 'aria-current': p === current ? 'page' : null, 'aria-label': p + '페이지' }, String(p)))
      )),
      arrow('다음 페이지', current < last ? current + 1 : null, '▶'),
    ]);
  }

  try {
    const query = new URLSearchParams({ page, size: PAGE_SIZE });
    if (category) query.set('category', category);
    if (q) query.set('q', q);
    const data = await api('/api/posts?' + query);
    const last = Math.max(1, Math.ceil(data.total / data.size));
    // 주소에 마지막 페이지보다 큰 번호가 들어오면 마지막 페이지로 바로잡는다
    if (data.page > last) {
      location.replace(listUrl({ page: last }));
      return;
    }

    setText(document.getElementById('board-total'), q ? `"${q}" 검색 ${data.total}건` : `${data.total}건`);
    replaceChildren(list, data.posts.length
      ? data.posts.map(postRow)
      : el('li', { class: 'empty-state' }, q ? '검색 결과가 없습니다.' : '아직 글이 없습니다. 첫 글을 남겨보세요!'));
    renderPagination(data.page, last);
  } catch (err) {
    replaceChildren(list, el('li', { class: 'empty-state' }, '게시글을 불러오지 못했습니다.'));
    BoxTick.handleError(err);
  }
})();
