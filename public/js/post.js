// 게시글 상세 + 댓글 (Y-COMM 말풍선)
(async () => {
  const { api, el, initPage, setText, replaceChildren, formatDate, showFieldErrors, toast, loginUrl } = BoxTick;
  const { categoryChip, avatar } = BoxTickBoard;

  const id = Number(new URLSearchParams(location.search).get('id'));
  const commentInput = document.getElementById('comment-content');

  // 게시판 목록에서 왔다면 그 목록(카테고리·검색·페이지)으로 돌아간다
  let backUrl = '/board.html';
  try {
    const ref = new URL(document.referrer);
    if (ref.origin === location.origin && ref.pathname === '/board.html') backUrl = ref.pathname + ref.search;
  } catch (err) { /* referrer 없음 */ }
  document.getElementById('back-link').href = backUrl;

  const user = await initPage({
    active: 'board',
    hints: [
      { key: 'A', label: '결정' },
      { key: 'B', label: '목록', href: backUrl },
      { key: 'Y', label: '댓글 쓰기', onClick: () => (user ? commentInput.focus() : location.assign(loginUrl())) },
    ],
  });

  const status = document.getElementById('post-status');
  const showStatus = (text) => { status.hidden = false; setText(status, text); };

  if (!Number.isInteger(id) || id < 1) {
    showStatus('잘못된 주소입니다.');
    return;
  }

  /* ---------- 본문 ---------- */

  let post;
  try {
    ({ post } = await api('/api/posts/' + id));
  } catch (err) {
    showStatus(err.status === 404 ? '삭제되었거나 없는 게시글입니다.' : '게시글을 불러오지 못했습니다.');
    if (err.status !== 404) BoxTick.handleError(err);
    return;
  }

  document.title = post.title + ' · BoxTick';
  replaceChildren(document.getElementById('post-category'), categoryChip(post.category));
  setText(document.getElementById('post-number'), 'No.' + post.id);
  setText(document.getElementById('post-title'), post.title);
  replaceChildren(document.getElementById('post-author'), [avatar(post.author_nickname, post.author_id), el('strong', null, post.author_nickname)]);
  const edited = post.updated_at && post.updated_at !== post.created_at;
  setText(document.getElementById('post-date'), formatDate(post.created_at, { withTime: true }) + (edited ? ' (수정됨)' : ''));
  setText(document.getElementById('post-views'), '조회 ' + post.views);
  // 본문은 텍스트로만 넣고, 줄바꿈은 CSS(pre-wrap)로 살린다
  setText(document.getElementById('post-content'), post.content);

  const isAuthor = user && user.id === post.author_id;
  const isAdmin = user && user.role === 'admin';
  if (isAuthor || isAdmin) {
    document.getElementById('post-actions').hidden = false;
    const editLink = document.getElementById('edit-link');
    // 수정은 작성자 본인만 (서버 PUT 규칙과 동일), 삭제는 작성자 또는 관리자
    if (isAuthor) {
      editLink.hidden = false;
      editLink.href = '/write.html?id=' + post.id;
    }
    const deleteButton = document.getElementById('delete-post');
    deleteButton.hidden = false;
    deleteButton.addEventListener('click', async () => {
      const message = isAuthor ? '이 글을 삭제할까요? 댓글도 함께 삭제됩니다.' : '관리자 권한으로 이 글을 삭제할까요? 댓글도 함께 삭제됩니다.';
      if (!(await BoxTick.confirm(message, { okText: '삭제', danger: true }))) return;
      deleteButton.disabled = true;
      try {
        await api('/api/posts/' + post.id, { method: 'DELETE' });
        toast('글을 삭제했습니다.', 'success');
        setTimeout(() => location.replace(backUrl), 500);
      } catch (err) {
        deleteButton.disabled = false;
        BoxTick.handleError(err);
      }
    });
  }

  status.hidden = true;
  document.getElementById('post').hidden = false;

  /* ---------- 댓글 ---------- */

  document.getElementById('comments').hidden = false;
  const list = document.getElementById('comment-list');
  let comments = [];

  function commentItem(comment) {
    const mine = user && user.id === comment.author_id;
    const canDelete = mine || isAdmin;
    return el('li', { class: 'comment' + (mine ? ' comment--mine' : '') + (comment.author_id === post.author_id ? ' comment--writer' : '') }, [
      avatar(comment.author_nickname, comment.author_id),
      el('div', { class: 'comment__bubble' }, [
        el('div', { class: 'comment__meta' }, [
          el('strong', null, comment.author_nickname),
          comment.author_id === post.author_id ? el('span', { class: 'chip chip--shield comment__badge' }, '글쓴이') : null,
          el('span', { class: 'num text-small text-muted' }, formatDate(comment.created_at, { withTime: true })),
          canDelete
            ? el('button', { type: 'button', class: 'comment__delete', 'aria-label': comment.author_nickname + ' 님의 댓글 삭제', onClick: () => removeComment(comment) }, '삭제')
            : null,
        ]),
        el('p', { class: 'comment__text' }, comment.content),
      ]),
    ]);
  }

  function renderComments() {
    setText(document.getElementById('comment-count'), String(comments.length));
    replaceChildren(list, comments.length
      ? comments.map(commentItem)
      : el('li', { class: 'empty-state' }, '첫 댓글을 남겨보세요.'));
  }

  async function removeComment(comment) {
    if (!(await BoxTick.confirm('댓글을 삭제할까요?', { okText: '삭제', danger: true }))) return;
    try {
      await api('/api/comments/' + comment.id, { method: 'DELETE' });
      comments = comments.filter((c) => c.id !== comment.id);
      renderComments();
      toast('댓글을 삭제했습니다.', 'success');
    } catch (err) {
      BoxTick.handleError(err);
    }
  }

  try {
    ({ comments } = await api('/api/posts/' + post.id + '/comments'));
    renderComments();
  } catch (err) {
    replaceChildren(list, el('li', { class: 'empty-state' }, '댓글을 불러오지 못했습니다.'));
    BoxTick.handleError(err);
  }

  if (!user) {
    document.getElementById('comment-login').hidden = false;
    document.getElementById('comment-login-link').href = loginUrl();
    return;
  }

  const form = document.getElementById('comment-form');
  const length = document.getElementById('comment-length');
  form.hidden = false;
  commentInput.addEventListener('input', () => setText(length, commentInput.value.length + ' / 1000'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = commentInput.value.trim();
    if (!content) return showFieldErrors(form, { content: '댓글 내용을 입력해 주세요.' });
    showFieldErrors(form, {});
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { comment } = await api('/api/posts/' + post.id + '/comments', { method: 'POST', body: { content } });
      comments.push(comment);
      renderComments();
      form.reset();
      setText(length, '0 / 1000');
      list.lastElementChild.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      if (err.fields && err.fields.content) showFieldErrors(form, err.fields);
      else BoxTick.handleError(err);
    } finally {
      button.disabled = false;
    }
  });
})();
