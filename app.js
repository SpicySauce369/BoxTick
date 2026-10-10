const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminUsersRoutes = require('./routes/adminUsers');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const adminPostsRoutes = require('./routes/adminPosts');

const SESSION_COOKIE_NAME = 'boxtick.sid';

/**
 * Express 앱을 만든다. 서버 실행(server.js)과 테스트가 같은 앱을 사용한다.
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.db
 * @param {string} [options.sessionSecret]
 * @param {boolean} [options.secureCookie] HTTPS 에서만 쿠키 전송
 */
function createApp({ db, sessionSecret, secureCookie = false }) {
  const app = express();
  app.locals.db = db;
  app.locals.sessionCookieName = SESSION_COOKIE_NAME;

  if (secureCookie) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookie,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
      },
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/admin/users', adminUsersRoutes);
  app.use('/api/admin/posts', adminPostsRoutes);
  app.use('/api/admin', adminRoutes);

  // 정의되지 않은 API 는 HTML 대신 JSON 404 를 돌려준다.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: '요청한 API 를 찾을 수 없습니다.' });
  });

  app.use(express.static(path.join(__dirname, 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: '잘못된 JSON 형식입니다.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: '요청 본문이 너무 큽니다.' });
    }
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  });

  return app;
}

module.exports = { createApp, SESSION_COOKIE_NAME };
