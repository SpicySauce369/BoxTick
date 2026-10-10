// 게시판 (/api/posts)
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { parsePagination } = require('../lib/pagination');
const { parseId } = require('../lib/params');
const Posts = require('../db/posts');

const router = express.Router();

const TITLE_MAX = 100;
const CONTENT_MAX = 10000;
const COMMENT_MAX = 1000;

const NOT_FOUND = { error: '게시글을 찾을 수 없습니다.' };

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

/** 작성·수정 공통 검증. 통과하면 { values }, 실패하면 { errors }. */
function validatePost(body) {
  const errors = {};
  const category = body.category;
  const title = trimString(body.title);
  const content = trimString(body.content);

  if (!Posts.CATEGORIES.includes(category)) {
    errors.category = '카테고리를 선택해 주세요.';
  }
  if (!title) errors.title = '제목을 입력해 주세요.';
  else if (title.length > TITLE_MAX) errors.title = `제목은 ${TITLE_MAX}자 이하여야 합니다.`;
  if (!content) errors.content = '내용을 입력해 주세요.';
  else if (content.length > CONTENT_MAX) errors.content = `내용은 ${CONTENT_MAX}자 이하여야 합니다.`;

  return Object.keys(errors).length ? { errors } : { values: { category, title, content } };
}

function badRequest(res, errors) {
  return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });
}

const NOTICE_FORBIDDEN = { error: '공지는 관리자만 작성할 수 있습니다.' };

/** :id 게시글을 찾아 req.post 에 넣는다. 없으면 404. */
function loadPost(req, res, next) {
  const id = parseId(req.params.id);
  const post = id && Posts.findPost(req.app.locals.db, id);
  if (!post) return res.status(404).json(NOT_FOUND);
  req.post = post;
  next();
}

// GET /api/posts?category=&q=&page=&size= — 목록 (본문 제외)
router.get('/', (req, res) => {
  const { page, size, offset } = parsePagination(req.query);
  const category = Posts.CATEGORIES.includes(req.query.category) ? req.query.category : undefined;
  const q = trimString(req.query.q) || undefined;

  const { posts, total } = Posts.listPosts(req.app.locals.db, { category, q }, { size, offset });
  res.json({ posts, page, size, total });
});

// GET /api/posts/:id — 상세 (조회수 1 증가)
router.get('/:id', loadPost, (req, res) => {
  const db = req.app.locals.db;
  Posts.incrementViews(db, req.post.id);
  res.json({ post: Posts.findPost(db, req.post.id) });
});

// POST /api/posts — 작성
router.post('/', requireLogin, (req, res) => {
  const { values, errors } = validatePost(req.body || {});
  if (errors) return badRequest(res, errors);
  if (values.category === 'notice' && req.user.role !== 'admin') {
    return res.status(403).json(NOTICE_FORBIDDEN);
  }

  const post = Posts.createPost(req.app.locals.db, { userId: req.user.id, ...values });
  res.status(201).json({ post });
});

// PUT /api/posts/:id — 수정 (작성자 본인만)
router.put('/:id', requireLogin, loadPost, (req, res) => {
  if (req.post.author_id !== req.user.id) {
    return res.status(403).json({ error: '본인이 쓴 글만 수정할 수 있습니다.' });
  }
  const { values, errors } = validatePost(req.body || {});
  if (errors) return badRequest(res, errors);
  if (values.category === 'notice' && req.user.role !== 'admin') {
    return res.status(403).json(NOTICE_FORBIDDEN);
  }

  res.json({ post: Posts.updatePost(req.app.locals.db, req.post.id, values) });
});

// DELETE /api/posts/:id — 삭제 (작성자 또는 관리자)
router.delete('/:id', requireLogin, loadPost, (req, res) => {
  if (req.post.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '본인이 쓴 글만 삭제할 수 있습니다.' });
  }
  Posts.deletePost(req.app.locals.db, req.post.id);
  res.status(204).end();
});

// GET /api/posts/:id/comments — 댓글 목록 (작성순)
router.get('/:id/comments', loadPost, (req, res) => {
  res.json({ comments: Posts.listComments(req.app.locals.db, req.post.id) });
});

// POST /api/posts/:id/comments — 댓글 작성
router.post('/:id/comments', requireLogin, loadPost, (req, res) => {
  const content = trimString((req.body || {}).content);
  if (!content) return badRequest(res, { content: '댓글 내용을 입력해 주세요.' });
  if (content.length > COMMENT_MAX) return badRequest(res, { content: `댓글은 ${COMMENT_MAX}자 이하여야 합니다.` });

  const comment = Posts.createComment(req.app.locals.db, {
    postId: req.post.id,
    userId: req.user.id,
    content,
  });
  res.status(201).json({ comment });
});

module.exports = router;
