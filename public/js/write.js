// 글쓰기 · 수정 (?id= 가 있으면 수정)
(async () => {
  const { api, el, initPage, setText, replaceChildren, showFieldErrors, toast, HINT_BACK } = BoxTick;
  const { CATEGORIES, postUrl } = BoxTickBoard;

  const params = new URLSearchParams(location.search);
  const editId = params.has('id') ? Number(params.get('id')) : null;
  const form = document.getElementById('write-form');

  const user = await initPage({
    active: 'board',
    auth: 'login',
    hints: [
      { key: 'A', label: editId ? '수정' : '등록', onClick: () => form.requestSubmit() },
      { ...HINT_BACK, label: '취소' },
    ],
  });

  /* ---------- 카테고리 (공지는 관리자만) ---------- */

  let category = '';
  const hiddenCategory = el('input', { type: 'hidden', name: 'category' });
  const options = CATEGORIES.filter((c) => c.key !== 'notice' || user.role === 'admin');
  const buttons = options.map((c) =>
    el('button', { type: 'button', 'aria-pressed': 'false', dataset: { category: c.key }, onClick: () => selectCategory(c.key) }, c.label)
  );
  replaceChildren(document.getElementById('category-options'), [hiddenCategory, ...buttons]);

  function selectCategory(key) {
    category = key;
    hiddenCategory.value = key;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.category === key));
  }

  /* ---------- 글자 수 ---------- */

  const length = document.getElementById('content-length');
  const updateLength = () => setText(length, form.content.value.length + ' / 10000');
  form.content.addEventListener('input', updateLength);

  /* ---------- 수정 모드: 기존 글 불러오기 ---------- */

  if (editId !== null) {
    setText(document.getElementById('write-title'), '글 수정');
    setText(document.getElementById('write-head'), 'EDIT POST');
    setText(document.getElementById('submit-button'), '수정');
    document.title = '글 수정 · BoxTick';
    document.getElementById('cancel-link').href = postUrl(editId);

    let post;
    try {
      ({ post } = Number.isInteger(editId) && editId > 0 ? await api('/api/posts/' + editId) : {});
    } catch (err) {
      if (err.status !== 404) BoxTick.handleError(err);
    }
    if (!post) {
      toast('글을 찾을 수 없습니다.', 'error');
      setTimeout(() => location.replace('/board.html'), 800);
      return;
    }
    // 서버도 막지만, 남의 글이면 화면에서도 바로 돌려보낸다
    if (post.author_id !== user.id) {
      toast('본인이 쓴 글만 수정할 수 있습니다.', 'error');
      setTimeout(() => location.replace(postUrl(post.id)), 800);
      return;
    }
    selectCategory(post.category);
    form.title.value = post.title;
    form.content.value = post.content;
    updateLength();
  } else {
    // 게시판 탭에서 넘어왔다면 그 카테고리를 미리 고른다
    const preset = params.get('category');
    if (options.some((c) => c.key === preset)) selectCategory(preset);
  }

  /* ---------- 제출 ---------- */

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = { category, title: form.title.value.trim(), content: form.content.value.trim() };
    const fields = {};
    if (!body.category) fields.category = '카테고리를 선택해 주세요.';
    if (!body.title) fields.title = '제목을 입력해 주세요.';
    if (!body.content) fields.content = '내용을 입력해 주세요.';
    showFieldErrors(form, fields);
    if (Object.keys(fields).length) return;

    const button = document.getElementById('submit-button');
    button.disabled = true;
    try {
      const { post } = editId
        ? await api('/api/posts/' + editId, { method: 'PUT', body })
        : await api('/api/posts', { method: 'POST', body });
      toast(editId ? '글을 수정했습니다.' : '글을 등록했습니다.', 'success');
      location.replace(postUrl(post.id));
    } catch (err) {
      button.disabled = false;
      if (err.fields && Object.keys(err.fields).length) showFieldErrors(form, err.fields);
      else BoxTick.handleError(err);
    }
  });
})();
