// db:init 전체 seed(seedAll) 통합 테스트: 회원 → 게시글 → 댓글 연결과 멱등성
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { seedAll } = require('../db/seed');
const { setup, login } = require('./helpers');
const usersSeed = require('../data/users.seed.json');
const postsSeed = require('../data/posts.seed.json');
const commentsSeed = require('../data/comments.seed.json');

const count = (db, sql, ...params) => db.prepare(sql).get(...params).n;

function snapshot(db) {
  return {
    users: count(db, 'SELECT COUNT(*) AS n FROM users'),
    posts: count(db, 'SELECT COUNT(*) AS n FROM posts'),
    comments: count(db, 'SELECT COUNT(*) AS n FROM comments'),
    sets: count(db, 'SELECT COUNT(*) AS n FROM card_sets'),
    cards: count(db, 'SELECT COUNT(*) AS n FROM cards'),
    prices: count(db, 'SELECT COUNT(*) AS n FROM price_history'),
    boxPrices: count(db, 'SELECT COUNT(*) AS n FROM box_price_history'),
  };
}

const regularUsers = usersSeed.filter((u) => !u.managed_by_env);

describe('seedAll: 회원·게시글·댓글 통합', () => {
  let db, app;
  before(async () => {
    ({ db, app } = setup());
    await seedAll(db);
  });

  it('관리자 1명 + 일반 회원이 만들어지고, 비밀번호는 bcrypt 해시로 저장된다', () => {
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM users'), 1 + regularUsers.length);
    for (const user of regularUsers) {
      const row = db.prepare('SELECT password_hash, role, status FROM users WHERE username = ?').get(user.username);
      assert.ok(row, user.username);
      assert.notEqual(row.password_hash, user.password);
      assert.match(row.password_hash, /^\$2[aby]\$10\$/);
      assert.equal(row.role, 'user');
      assert.equal(row.status, 'active');
    }
  });

  it('seed 회원으로 실제 로그인할 수 있다', async () => {
    const { username, password } = regularUsers[0];
    const { res } = await login(app, username, password);
    assert.equal(res.status, 200);
  });

  it('게시글·댓글이 모두 들어가고, 공지는 관리자(admin) 계정이 작성자다', () => {
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM posts'), postsSeed.length);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM comments'), commentsSeed.length);

    const noticeAuthors = db
      .prepare("SELECT DISTINCT u.username, u.role FROM posts p JOIN users u ON u.id = p.user_id WHERE p.category = 'notice'")
      .all();
    assert.deepEqual(noticeAuthors, [{ username: 'admin', role: 'admin' }]);
  });

  it('작성 시각·조회수가 seed 값 그대로 들어간다', () => {
    const seed = postsSeed[0];
    const row = db.prepare('SELECT views, created_at, updated_at FROM posts WHERE title = ?').get(seed.title);
    assert.deepEqual(row, { views: seed.views, created_at: seed.created_at, updated_at: seed.created_at });
  });

  it('seed 게시글과 댓글을 실제 API 로 조회할 수 있다', async () => {
    const list = await request(app).get('/api/posts?size=100');
    assert.equal(list.status, 200);
    assert.equal(list.body.total, postsSeed.length);

    // 댓글이 가장 많은 seed 게시글로 상세·댓글 API 확인
    const byPost = new Map();
    for (const c of commentsSeed) byPost.set(c.post, (byPost.get(c.post) || 0) + 1);
    const [topSeedId, topCount] = [...byPost].sort((a, b) => b[1] - a[1])[0];
    const topSeed = postsSeed.find((p) => p.seed_id === topSeedId);
    const listed = list.body.posts.find((p) => p.title === topSeed.title);
    assert.equal(listed.comment_count, topCount);

    const detail = await request(app).get(`/api/posts/${listed.id}`);
    assert.equal(detail.body.post.content, topSeed.content);

    const comments = await request(app).get(`/api/posts/${listed.id}/comments`);
    const expected = commentsSeed.filter((c) => c.post === topSeedId).map((c) => c.content);
    assert.deepEqual(comments.body.comments.map((c) => c.content), expected);
  });

  it('카테고리 필터로도 seed 공지가 조회된다', async () => {
    const res = await request(app).get('/api/posts?category=notice');
    assert.equal(res.body.total, postsSeed.filter((p) => p.category === 'notice').length);
  });
});

describe('seedAll: 멱등성', () => {
  it('두 번 실행해도 회원·게시글·댓글·카드 데이터가 늘지 않는다', async () => {
    const { db } = setup();
    await seedAll(db);
    const first = snapshot(db);

    const result = await seedAll(db);
    assert.deepEqual(snapshot(db), first);
    assert.equal(result.users.created, 0);
    assert.equal(result.board.createdPosts, 0);
    assert.equal(result.board.createdComments, 0);
  });

  it('재실행해도 회원이 바꾼 닉네임과 관리자 입력 시세·사용자 글은 그대로 남는다', async () => {
    const { db } = setup();
    await seedAll(db);

    const { username } = regularUsers[0];
    db.prepare("UPDATE users SET nickname = '바뀐닉네임' WHERE username = ?").run(username);
    const userId = db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
    db.prepare("INSERT INTO posts (user_id, category, title, content) VALUES (?, 'free', '직접 쓴 글', '내용')").run(userId);
    db.prepare("INSERT INTO price_history (card_id, price, recorded_at, source) VALUES (1, 12345, '2026-10-09', 'admin')").run();

    await seedAll(db);

    assert.equal(db.prepare('SELECT nickname FROM users WHERE id = ?').get(userId).nickname, '바뀐닉네임');
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM posts WHERE title = '직접 쓴 글'"), 1);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM posts'), postsSeed.length + 1);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM price_history WHERE source = 'admin'"), 1);
  });
});
