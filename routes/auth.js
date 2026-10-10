const express = require('express');
const bcrypt = require('bcrypt');
const { requireLogin } = require('../middleware/auth');
const { parsePagination } = require('../lib/pagination');
const {
  BCRYPT_ROUNDS,
  createUser,
  findByUsernameWithHash,
  findPasswordHashById,
  hashPassword,
  toPublicUser,
  updateProfile,
} = require('../db/users');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt 는 72바이트 이후를 무시한다
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;

// 존재하지 않는 아이디로 로그인할 때도 bcrypt 비교를 수행해 응답 시간 차이를 줄인다.
const DUMMY_HASH = bcrypt.hashSync('boxtick-dummy-password', BCRYPT_ROUNDS);

// 필드별 검증: 문제가 있으면 오류 문구, 없으면 null
function passwordError(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return '비밀번호가 너무 깁니다.';
  }
  return null;
}

function nicknameError(nickname) {
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자여야 합니다.`;
  }
  return null;
}

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

function validateRegister(body) {
  const errors = {};
  const { username, password } = body;
  const nickname = trimString(body.nickname);

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    errors.username = '아이디는 영문, 숫자, _ 로 4~20자여야 합니다.';
  }
  const pwError = passwordError(password);
  if (pwError) errors.password = pwError;
  const nickError = nicknameError(nickname);
  if (nickError) errors.nickname = nickError;

  return { errors, values: { username, password, nickname } };
}

// POST /api/auth/register — 회원가입 (가입 후 자동 로그인하지 않는다)
router.post('/register', async (req, res) => {
  if (req.session.userId) {
    return res.status(400).json({ error: '이미 로그인되어 있습니다.' });
  }

  const { errors, values } = validateRegister(req.body || {});
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });
  }

  try {
    const user = await createUser(req.app.locals.db, values);
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: '이미 사용 중인 아이디입니다.',
        fields: { username: '이미 사용 중인 아이디입니다.' },
      });
    }
    throw err;
  }
});

// POST /api/auth/login — 로그인
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해 주세요.' });
  }

  const user = findByUsernameWithHash(req.app.locals.db, username);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (user.status === 'banned') {
    return res.status(403).json({ error: '이용이 정지된 계정입니다.' });
  }

  // 세션 고정 공격 방지: 로그인 시 세션 ID 를 새로 발급한다.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    req.session.userId = user.id;
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
      res.json({ user: toPublicUser(user) });
    });
  });
});

// POST /api/auth/logout — 로그아웃
router.post('/logout', requireLogin, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: '로그아웃 처리 중 오류가 발생했습니다.' });
    res.clearCookie(req.app.locals.sessionCookieName);
    res.status(204).end();
  });
});

// GET /api/auth/me — 내 정보
router.get('/me', requireLogin, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/me — 내 정보 수정
// body: { nickname?, currentPassword?, newPassword? }
// 닉네임만, 비밀번호만, 또는 둘 다 바꿀 수 있다. 비밀번호 변경에는 현재 비밀번호가 필요하다.
router.put('/me', requireLogin, async (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};
  const wantsNickname = body.nickname !== undefined;
  const wantsPassword = body.newPassword !== undefined;

  if (!wantsNickname && !wantsPassword) {
    return res.status(400).json({ error: '변경할 항목이 없습니다.' });
  }

  const errors = {};
  const nickname = trimString(body.nickname);
  if (wantsNickname) {
    const nickError = nicknameError(nickname);
    if (nickError) errors.nickname = nickError;
  }
  if (wantsPassword) {
    const pwError = passwordError(body.newPassword);
    if (pwError) errors.newPassword = pwError;
    if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
      errors.currentPassword = '현재 비밀번호를 입력해 주세요.';
    }
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });
  }

  let newHash = null;
  if (wantsPassword) {
    const ok = await bcrypt.compare(body.currentPassword, findPasswordHashById(db, req.user.id));
    if (!ok) {
      // 401 은 "로그인 풀림" 으로 처리되므로 입력 오류(400)로 돌려준다.
      const message = '현재 비밀번호가 올바르지 않습니다.';
      return res.status(400).json({ error: message, fields: { currentPassword: message } });
    }
    newHash = await hashPassword(body.newPassword);
  }

  const user = updateProfile(db, req.user.id, {
    nickname: wantsNickname ? nickname : undefined,
    passwordHash: newHash || undefined,
  });
  res.json({ user });
});

// GET /api/auth/me/posts?page=&size= — 내가 쓴 글
router.get('/me/posts', requireLogin, (req, res) => {
  const db = req.app.locals.db;
  const { page, size, offset } = parsePagination(req.query);

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM posts WHERE user_id = ?').get(req.user.id);
  const posts = db
    .prepare(
      `SELECT p.id, p.category, p.title, p.views, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
         FROM posts p
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(req.user.id, size, offset);

  res.json({ posts, page, size, total });
});

module.exports = router;
