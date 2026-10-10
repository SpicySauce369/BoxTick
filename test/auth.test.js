const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createUser } = require('../db/users');
const { SESSION_COOKIE_NAME } = require('../app');
const { PASSWORD, setup, login } = require('./helpers');

describe('회원가입', () => {
  let db, app;
  beforeEach(() => ({ db, app } = setup()));

  it('성공하면 201 과 회원 정보를 돌려주고, 비밀번호는 bcrypt 해시로 저장한다', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ash_ketchum', password: PASSWORD, nickname: '지우' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.username, 'ash_ketchum');
    assert.equal(res.body.user.nickname, '지우');
    assert.equal(res.body.user.role, 'user');
    assert.equal(res.body.user.password_hash, undefined, '해시를 응답에 노출하면 안 된다');

    const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('ash_ketchum');
    assert.notEqual(row.password_hash, PASSWORD);
    assert.match(row.password_hash, /^\$2[aby]\$10\$/);
  });

  it('요청에 role 을 넣어도 관리자로 가입되지 않는다', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'sneaky', password: PASSWORD, nickname: '해커', role: 'admin' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'user');
  });

  it('이미 있는 아이디는 대소문자와 상관없이 409', async () => {
    await createUser(db, { username: 'misty', password: PASSWORD, nickname: '이슬' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'MISTY', password: PASSWORD, nickname: '이슬2' });

    assert.equal(res.status, 409);
    assert.ok(res.body.fields.username);
  });

  it('잘못된 입력은 400 과 필드별 오류를 돌려준다', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'a!', password: 'short', nickname: '' });

    assert.equal(res.status, 400);
    assert.ok(res.body.fields.username);
    assert.ok(res.body.fields.password);
    assert.ok(res.body.fields.nickname);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  });
});

describe('로그인 / 로그아웃', () => {
  let db, app;
  beforeEach(async () => {
    ({ db, app } = setup());
    await createUser(db, { username: 'brock', password: PASSWORD, nickname: '웅' });
  });

  it('비밀번호가 틀리면 401 이고 세션 쿠키를 주지 않는다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'brock', password: 'wrong-password' });

    assert.equal(res.status, 401);
    assert.equal(res.headers['set-cookie'], undefined);
  });

  it('없는 아이디도 같은 401 메시지를 돌려준다', async () => {
    const wrongPw = await request(app).post('/api/auth/login').send({ username: 'brock', password: 'nope-nope' });
    const noUser = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'nope-nope' });

    assert.equal(noUser.status, 401);
    assert.equal(noUser.body.error, wrongPw.body.error);
  });

  it('아이디나 비밀번호가 비어 있으면 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'brock' });
    assert.equal(res.status, 400);
  });

  it('성공하면 httpOnly 세션 쿠키가 발급되고 /me 로 내 정보를 볼 수 있다', async () => {
    const { agent, res } = await login(app, 'brock');

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'brock');
    assert.equal(res.body.user.password_hash, undefined);

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(cookie, '세션 쿠키가 있어야 한다');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, 'brock');
  });

  it('로그아웃하면 같은 쿠키로 더 이상 /me 에 접근할 수 없다', async () => {
    const { agent } = await login(app, 'brock');

    const out = await agent.post('/api/auth/logout');
    assert.equal(out.status, 204);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 401);
  });

  it('정지된 회원은 로그인할 수 없다 (403)', async () => {
    db.prepare("UPDATE users SET status = 'banned' WHERE username = 'brock'").run();
    const { res } = await login(app, 'brock');
    assert.equal(res.status, 403);
  });

  it('로그인 중에 정지되면 다음 요청부터 401', async () => {
    const { agent } = await login(app, 'brock');
    db.prepare("UPDATE users SET status = 'banned' WHERE username = 'brock'").run();

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 401);
  });
});

describe('권한 미들웨어', () => {
  let db, app;
  beforeEach(async () => {
    ({ db, app } = setup());
    await createUser(db, { username: 'member', password: PASSWORD, nickname: '회원' });
    await createUser(db, { username: 'boss', password: PASSWORD, nickname: '관리자', role: 'admin' });
  });

  it('비로그인 상태로 회원 전용 API 를 부르면 401', async () => {
    assert.equal((await request(app).get('/api/auth/me')).status, 401);
    assert.equal((await request(app).post('/api/auth/logout')).status, 401);
  });

  it('비로그인 상태로 관리자 API 를 부르면 401', async () => {
    const res = await request(app).get('/api/admin/users');
    assert.equal(res.status, 401);
  });

  it('일반 회원이 관리자 API 에 접근하면 403', async () => {
    const { agent } = await login(app, 'member');
    const res = await agent.get('/api/admin/users');
    assert.equal(res.status, 403);
  });

  it('관리자는 관리자 API 에 접근할 수 있고 해시는 노출되지 않는다', async () => {
    const { agent } = await login(app, 'boss');
    const res = await agent.get('/api/admin/users');

    assert.equal(res.status, 200);
    assert.equal(res.body.users.length, 2);
    for (const user of res.body.users) {
      assert.equal(user.password_hash, undefined);
    }
  });

  it('관리자 권한을 회수하면 기존 세션으로도 바로 403', async () => {
    const { agent } = await login(app, 'boss');
    db.prepare("UPDATE users SET role = 'user' WHERE username = 'boss'").run();

    const res = await agent.get('/api/admin/users');
    assert.equal(res.status, 403);
  });

  it('위조한 세션 쿠키로는 접근할 수 없다', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', `${SESSION_COOKIE_NAME}=s%3Afake.signature`);
    assert.equal(res.status, 401);
  });
});

describe('기타 응답', () => {
  it('없는 API 는 JSON 404', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('깨진 JSON 본문은 400', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');
    assert.equal(res.status, 400);
  });
});
