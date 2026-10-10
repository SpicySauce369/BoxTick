// 댓글 (/api/comments)
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { parseId } = require('../lib/params');
const Posts = require('../db/posts');

const router = express.Router();

// DELETE /api/comments/:id — 삭제 (작성자 또는 관리자)
router.delete('/:id', requireLogin, (req, res) => {
  const db = req.app.locals.db;
  const id = parseId(req.params.id);
  const comment = id && Posts.findComment(db, id);
  if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });

  if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '본인이 쓴 댓글만 삭제할 수 있습니다.' });
  }
  Posts.deleteComment(db, id);
  res.status(204).end();
});

module.exports = router;
