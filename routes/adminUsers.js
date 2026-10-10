// 관리자 — 회원 관리 (/api/admin/users)
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { PUBLIC_COLUMNS, findById, setStatus } = require('../db/users');
const { parsePagination, escapeLike } = require('../lib/pagination');

const router = express.Router();
router.use(requireAdmin);

const STATUSES = ['active', 'banned'];
const ROLES = ['user', 'admin'];

function parseId(raw) {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

// GET /api/admin/users?q=&status=&role=&page=&size=
// q 는 아이디·닉네임 부분 검색
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { page, size, offset } = parsePagination(req.query);
  const where = [];
  const params = {};

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    where.push("(username LIKE @q ESCAPE '\\' OR nickname LIKE @q ESCAPE '\\')");
    params.q = `%${escapeLike(q)}%`;
  }
  if (STATUSES.includes(req.query.status)) {
    where.push('status = @status');
    params.status = req.query.status;
  }
  if (ROLES.includes(req.query.role)) {
    where.push('role = @role');
    params.role = req.query.role;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users ${whereSql}`).get(params);
  const users = db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS},
              (SELECT COUNT(*) FROM posts p WHERE p.user_id = users.id) AS post_count
         FROM users ${whereSql}
        ORDER BY id
        LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: size, offset });

  res.json({ users, page, size, total });
});

// GET /api/admin/users/:id — 회원 상세
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const user = id && findById(req.app.locals.db, id);
  if (!user) return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
  res.json({ user });
});

// PATCH /api/admin/users/:id/status — 정지 / 해제
// body: { status: 'active' | 'banned' }
router.patch('/:id/status', (req, res) => {
  const db = req.app.locals.db;
  const id = parseId(req.params.id);
  const target = id && findById(db, id);
  if (!target) return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });

  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "status 는 'active' 또는 'banned' 여야 합니다." });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: '자기 자신의 상태는 변경할 수 없습니다.' });
  }
  if (target.role === 'admin') {
    return res.status(403).json({ error: '관리자 계정의 상태는 변경할 수 없습니다.' });
  }

  // 정지된 회원의 기존 세션은 requireLogin 이 다음 요청에서 폐기한다.
  res.json({ user: setStatus(db, id, status) });
});

module.exports = router;
