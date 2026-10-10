// 관리자 — 게시글 관리 (/api/admin/posts)
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { parsePagination } = require('../lib/pagination');
const { parseId } = require('../lib/params');
const Posts = require('../db/posts');

const router = express.Router();
router.use(requireAdmin);

// GET /api/admin/posts?category=&q=&userId=&page=&size= — 전체 게시글 (작성자별 필터 가능)
router.get('/', (req, res) => {
  const { page, size, offset } = parsePagination(req.query);
  const category = Posts.CATEGORIES.includes(req.query.category) ? req.query.category : undefined;
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
  const userId = parseId(req.query.userId) || undefined;

  const { posts, total } = Posts.listPosts(req.app.locals.db, { category, q, userId }, { size, offset });
  res.json({ posts, page, size, total });
});

// DELETE /api/admin/posts/:id — 게시글 강제 삭제 (댓글 포함)
router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !Posts.deletePost(req.app.locals.db, id)) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }
  res.status(204).end();
});

module.exports = router;
