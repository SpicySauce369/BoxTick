const { openDatabase, initSchema } = require('./db/database');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  if (isProduction) {
    console.error('SESSION_SECRET 환경변수가 필요합니다.');
    process.exit(1);
  }
  console.warn('[server] SESSION_SECRET 이 없어 임시 값을 사용합니다. 서버를 재시작하면 로그인이 풀립니다.');
}

const db = openDatabase();
initSchema(db);

const app = createApp({
  db,
  sessionSecret: process.env.SESSION_SECRET,
  secureCookie: isProduction,
});

app.listen(PORT, () => {
  console.log(`[server] BoxTick http://localhost:${PORT}`);
});
