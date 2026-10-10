const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { PUBLIC_COLUMNS } = require('../db/users');

const router = express.Router();

// 이 라우터의 모든 API 는 관리자 전용이다.
router.use(requireAdmin);

// GET /api/admin/users — 회원 목록
router.get('/users', (req, res) => {
  const users = req.app.locals.db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`)
    .all();
  res.json({ users });
});

module.exports = router;
