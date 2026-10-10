// 테스트 공용 도우미 (테스트 케이스 없음)
const request = require('supertest');
const { openDatabase, initSchema } = require('../db/database');
const { createApp } = require('../app');

const PASSWORD = 'password123';

/** 메모리 DB 로 새 앱을 만든다. 테스트마다 독립적인 상태를 갖는다. */
function setup() {
  const db = openDatabase(':memory:');
  initSchema(db);
  const app = createApp({ db, sessionSecret: 'test-secret' });
  return { db, app };
}

/** 로그인한 supertest agent 를 돌려준다 (쿠키 유지). */
async function login(app, username, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  return { agent, res };
}

module.exports = { PASSWORD, setup, login };
