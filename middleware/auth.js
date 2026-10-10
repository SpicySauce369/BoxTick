const { findById } = require('../db/users');

/**
 * 로그인 필수. 세션의 userId 로 매 요청마다 DB 에서 회원을 다시 읽어
 * 정지·탈퇴·권한 변경이 즉시 반영되도록 한다. 통과하면 req.user 를 채운다.
 */
function requireLogin(req, res, next) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  const user = findById(req.app.locals.db, userId);
  if (!user || user.status !== 'active') {
    // 탈퇴·정지된 회원의 세션은 폐기한다.
    return req.session.destroy(() => {
      res.status(401).json({ error: '로그인이 필요합니다.' });
    });
  }

  req.user = user;
  next();
}

/** 관리자 필수. 로그인하지 않았으면 401, 일반 회원이면 403. */
function requireAdmin(req, res, next) {
  requireLogin(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 접근할 수 있습니다.' });
    }
    next();
  });
}

module.exports = { requireLogin, requireAdmin };
