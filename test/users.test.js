const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createUser } = require('../db/users');
const { PASSWORD, setup, login } = require('./helpers');

describe('내 정보 수정 (PUT /api/auth/me)', () => {
  let db, app, agent;
  beforeEach(async () => {
    ({ db, app } = setup());
    await createUser(db, { username: 'gary', password: PASSWORD, nickname: '바람' });
    ({ agent } = await login(app, 'gary'));
  });

  it('비로그인이면 401', async () => {
    const res = await request(app).put('/api/auth/me').send({ nickname: '새닉' });
    assert.equal(res.status, 401);
  });

  it('닉네임을 바꾸면 앞뒤 공백을 지우고 저장한다', async () => {
    const res = await agent.put('/api/auth/me').send({ nickname: '  라이벌  ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.nickname, '라이벌');

    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.nickname, '라이벌');
  });

  it('닉네임 길이가 맞지 않으면 400', async () => {
    const res = await agent.put('/api/auth/me').send({ nickname: 'x' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.nickname);
  });

  it('바꿀 항목이 없으면 400', async () => {
    const res = await agent.put('/api/auth/me').send({});
    assert.equal(res.status, 400);
  });

  it('username, role, status 는 이 API 로 바꿀 수 없다', async () => {
    const res = await agent
      .put('/api/auth/me')
      .send({ nickname: '바람2', username: 'hacker', role: 'admin', status: 'active' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'gary');
    assert.equal(res.body.user.role, 'user');
  });

  it('현재 비밀번호가 맞으면 비밀번호를 바꾸고, 새 비밀번호로만 로그인된다', async () => {
    const res = await agent
      .put('/api/auth/me')
      .send({ currentPassword: PASSWORD, newPassword: 'new-password-456' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.password_hash, undefined);

    assert.equal((await login(app, 'gary', PASSWORD)).res.status, 401);
    assert.equal((await login(app, 'gary', 'new-password-456')).res.status, 200);
  });

  it('현재 비밀번호가 틀리면 400 이고 비밀번호는 그대로다', async () => {
    const res = await agent
      .put('/api/auth/me')
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-456' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.currentPassword);

    assert.equal((await login(app, 'gary', PASSWORD)).res.status, 200);
  });

  it('현재 비밀번호 없이 바꾸려 하면 400', async () => {
    const res = await agent.put('/api/auth/me').send({ newPassword: 'new-password-456' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.currentPassword);
  });

  it('새 비밀번호가 짧으면 400', async () => {
    const res = await agent.put('/api/auth/me').send({ currentPassword: PASSWORD, newPassword: 'short' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.newPassword);
  });

  it('검증에 실패하면 닉네임도 바뀌지 않는다', async () => {
    await agent.put('/api/auth/me').send({ nickname: '바뀌면안됨', currentPassword: 'wrong-password', newPassword: 'new-password-456' });
    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.nickname, '바람');
  });
});

describe('내가 쓴 글 (GET /api/auth/me/posts)', () => {
  let db, app;
  beforeEach(async () => {
    ({ db, app } = setup());
    const me = await createUser(db, { username: 'oak', password: PASSWORD, nickname: '오박사' });
    const other = await createUser(db, { username: 'elm', password: PASSWORD, nickname: '느릅' });

    const insertPost = db.prepare(
      "INSERT INTO posts (user_id, category, title, content, created_at) VALUES (?, 'free', ?, '내용', ?)"
    );
    for (let i = 1; i <= 3; i++) insertPost.run(me.id, `내 글 ${i}`, `2026-10-0${i} 12:00:00`);
    const otherPost = insertPost.run(other.id, '남의 글', '2026-10-05 12:00:00').lastInsertRowid;
    db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(1, other.id, '댓글');
    db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(otherPost, me.id, '댓글');
  });

  it('비로그인이면 401', async () => {
    assert.equal((await request(app).get('/api/auth/me/posts')).status, 401);
  });

  it('내 글만 최신순으로, 댓글 수와 함께 돌려준다', async () => {
    const { agent } = await login(app, 'oak');
    const res = await agent.get('/api/auth/me/posts');

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.deepEqual(res.body.posts.map((p) => p.title), ['내 글 3', '내 글 2', '내 글 1']);
    assert.equal(res.body.posts[2].comment_count, 1);
    assert.equal(res.body.posts[0].content, undefined, '목록에는 본문을 넣지 않는다');
  });

  it('페이지를 나눠 돌려준다', async () => {
    const { agent } = await login(app, 'oak');
    const res = await agent.get('/api/auth/me/posts?page=2&size=2');

    assert.equal(res.body.page, 2);
    assert.equal(res.body.size, 2);
    assert.equal(res.body.total, 3);
    assert.deepEqual(res.body.posts.map((p) => p.title), ['내 글 1']);
  });
});

describe('관리자 회원 관리 (/api/admin/users)', () => {
  let db, app, admin, member, otherAdmin;
  beforeEach(async () => {
    ({ db, app } = setup());
    admin = await createUser(db, { username: 'boss', password: PASSWORD, nickname: '관리자', role: 'admin' });
    otherAdmin = await createUser(db, { username: 'boss2', password: PASSWORD, nickname: '부관리자', role: 'admin' });
    member = await createUser(db, { username: 'member', password: PASSWORD, nickname: '피카츄덕후' });
    await createUser(db, { username: 'member2', password: PASSWORD, nickname: '꼬부기' });
  });

  const adminAgent = async () => (await login(app, 'boss')).agent;

  it('일반 회원은 회원 목록·상태 변경 모두 403', async () => {
    const { agent } = await login(app, 'member');
    assert.equal((await agent.get('/api/admin/users')).status, 403);
    assert.equal((await agent.get(`/api/admin/users/${member.id}`)).status, 403);
    assert.equal((await agent.patch(`/api/admin/users/${member.id}/status`).send({ status: 'banned' })).status, 403);
  });

  it('비로그인은 상태 변경 401', async () => {
    const res = await request(app).patch(`/api/admin/users/${member.id}/status`).send({ status: 'banned' });
    assert.equal(res.status, 401);
  });

  it('목록은 페이지 정보와 함께 오고 해시를 노출하지 않는다', async () => {
    const agent = await adminAgent();
    const res = await agent.get('/api/admin/users?size=2');

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 4);
    assert.equal(res.body.users.length, 2);
    for (const user of res.body.users) assert.equal(user.password_hash, undefined);
  });

  it('아이디·닉네임 검색과 상태·역할 필터', async () => {
    const agent = await adminAgent();

    const byNick = await agent.get(`/api/admin/users?q=${encodeURIComponent('꼬부')}`);
    assert.deepEqual(byNick.body.users.map((u) => u.username), ['member2']);

    const admins = await agent.get('/api/admin/users?role=admin');
    assert.deepEqual(admins.body.users.map((u) => u.username), ['boss', 'boss2']);

    db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(member.id);
    const banned = await agent.get('/api/admin/users?status=banned');
    assert.deepEqual(banned.body.users.map((u) => u.username), ['member']);
  });

  it('검색어의 % 와 _ 는 와일드카드가 아니라 글자로 취급한다', async () => {
    const agent = await adminAgent();
    assert.equal((await agent.get('/api/admin/users?q=%25')).body.total, 0);
    assert.equal((await agent.get('/api/admin/users?q=_')).body.total, 0);
  });

  it('회원 상세 조회, 없는 회원은 404', async () => {
    const agent = await adminAgent();
    const found = await agent.get(`/api/admin/users/${member.id}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.user.username, 'member');

    assert.equal((await agent.get('/api/admin/users/9999')).status, 404);
    assert.equal((await agent.get('/api/admin/users/abc')).status, 404);
  });

  it('회원을 정지하면 로그인이 막히고 기존 세션도 끊기며, 해제하면 다시 로그인된다', async () => {
    const { agent: memberAgent } = await login(app, 'member');
    const agent = await adminAgent();

    const ban = await agent.patch(`/api/admin/users/${member.id}/status`).send({ status: 'banned' });
    assert.equal(ban.status, 200);
    assert.equal(ban.body.user.status, 'banned');

    assert.equal((await memberAgent.get('/api/auth/me')).status, 401);
    assert.equal((await login(app, 'member')).res.status, 403);

    const unban = await agent.patch(`/api/admin/users/${member.id}/status`).send({ status: 'active' });
    assert.equal(unban.body.user.status, 'active');
    assert.equal((await login(app, 'member')).res.status, 200);
  });

  it('잘못된 status 값은 400', async () => {
    const agent = await adminAgent();
    const res = await agent.patch(`/api/admin/users/${member.id}/status`).send({ status: 'deleted' });
    assert.equal(res.status, 400);
  });

  it('없는 회원의 상태 변경은 404', async () => {
    const agent = await adminAgent();
    const res = await agent.patch('/api/admin/users/9999/status').send({ status: 'banned' });
    assert.equal(res.status, 404);
  });

  it('자기 자신은 정지할 수 없다 (400)', async () => {
    const agent = await adminAgent();
    const res = await agent.patch(`/api/admin/users/${admin.id}/status`).send({ status: 'banned' });
    assert.equal(res.status, 400);
  });

  it('다른 관리자는 정지할 수 없다 (403)', async () => {
    const agent = await adminAgent();
    const res = await agent.patch(`/api/admin/users/${otherAdmin.id}/status`).send({ status: 'banned' });
    assert.equal(res.status, 403);
    assert.equal(db.prepare('SELECT status FROM users WHERE id = ?').get(otherAdmin.id).status, 'active');
  });
});
