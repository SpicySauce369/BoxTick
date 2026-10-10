const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createUser } = require('../db/users');
const { PASSWORD, setup, login } = require('./helpers');

/** 회원 셋(작성자·다른 회원·관리자)과 로그인된 agent 를 준비한다. */
async function setupBoard() {
  const { db, app } = setup();
  const author = await createUser(db, { username: 'author', password: PASSWORD, nickname: '작성자' });
  const other = await createUser(db, { username: 'other', password: PASSWORD, nickname: '남' });
  const admin = await createUser(db, { username: 'boss', password: PASSWORD, nickname: '관리자', role: 'admin' });
  const agents = {
    author: (await login(app, 'author')).agent,
    other: (await login(app, 'other')).agent,
    admin: (await login(app, 'boss')).agent,
  };
  return { db, app, users: { author, other, admin }, agents };
}

const samplePost = (overrides = {}) => ({ category: 'free', title: '첫 글', content: '안녕하세요', ...overrides });

async function writePost(agent, overrides) {
  const res = await agent.post('/api/posts').send(samplePost(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.post;
}

describe('게시글 작성 (POST /api/posts)', () => {
  let ctx;
  beforeEach(async () => (ctx = await setupBoard()));

  it('회원은 글을 쓸 수 있고, 작성자 정보가 함께 온다', async () => {
    const res = await ctx.agents.author.post('/api/posts').send(samplePost({ title: '  공백 제목  ' }));

    assert.equal(res.status, 201);
    assert.equal(res.body.post.title, '공백 제목');
    assert.equal(res.body.post.author_id, ctx.users.author.id);
    assert.equal(res.body.post.author_nickname, '작성자');
    assert.equal(res.body.post.views, 0);
  });

  it('비로그인은 401', async () => {
    const res = await request(ctx.app).post('/api/posts').send(samplePost());
    assert.equal(res.status, 401);
  });

  it('제목·내용이 비었거나 카테고리가 잘못되면 400', async () => {
    const res = await ctx.agents.author.post('/api/posts').send({ category: 'etc', title: '  ', content: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.fields.category);
    assert.ok(res.body.fields.title);
    assert.ok(res.body.fields.content);
  });

  it('제목이 너무 길면 400', async () => {
    const res = await ctx.agents.author.post('/api/posts').send(samplePost({ title: 'ㄱ'.repeat(101) }));
    assert.equal(res.status, 400);
  });

  it('일반 회원은 공지를 쓸 수 없다 (403)', async () => {
    const res = await ctx.agents.author.post('/api/posts').send(samplePost({ category: 'notice' }));
    assert.equal(res.status, 403);
  });

  it('관리자는 공지를 쓸 수 있다', async () => {
    const post = await writePost(ctx.agents.admin, { category: 'notice', title: '공지입니다' });
    assert.equal(post.category, 'notice');
  });

  it('요청에 user_id 를 넣어도 로그인한 회원이 작성자가 된다', async () => {
    const post = await writePost(ctx.agents.author, { user_id: ctx.users.admin.id });
    assert.equal(post.author_id, ctx.users.author.id);
  });
});

describe('게시글 목록 / 상세', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await setupBoard();
    const insert = ctx.db.prepare(
      'INSERT INTO posts (user_id, category, title, content, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const a = ctx.users.author.id;
    insert.run(a, 'free', '자유 1', '아무 이야기', '2026-10-01 10:00:00');
    insert.run(a, 'price', '피카츄 시세 정보', '요즘 많이 올랐네요', '2026-10-02 10:00:00');
    insert.run(a, 'brag', '개봉 자랑', '리자몽 나왔어요', '2026-10-03 10:00:00');
    insert.run(ctx.users.admin.id, 'notice', '공지', '규칙 안내', '2026-10-04 10:00:00');
    insert.run(a, 'free', '100%_할인 이벤트?', '특수문자 제목', '2026-10-05 10:00:00');
  });

  it('비로그인도 목록을 볼 수 있고, 최신순이며 본문은 빠져 있다', async () => {
    const res = await request(ctx.app).get('/api/posts');

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 5);
    assert.equal(res.body.posts[0].title, '100%_할인 이벤트?');
    assert.equal(res.body.posts[0].content, undefined);
    assert.equal(res.body.posts[0].author_nickname, '작성자');
  });

  it('카테고리로 거른다', async () => {
    const res = await request(ctx.app).get('/api/posts?category=price');
    assert.deepEqual(res.body.posts.map((p) => p.title), ['피카츄 시세 정보']);
  });

  it('잘못된 카테고리 값은 무시하고 전체를 돌려준다', async () => {
    const res = await request(ctx.app).get('/api/posts?category=hack');
    assert.equal(res.body.total, 5);
  });

  it('제목과 본문에서 검색한다', async () => {
    const byTitle = await request(ctx.app).get(`/api/posts?q=${encodeURIComponent('피카츄')}`);
    assert.deepEqual(byTitle.body.posts.map((p) => p.title), ['피카츄 시세 정보']);

    const byContent = await request(ctx.app).get(`/api/posts?q=${encodeURIComponent('리자몽')}`);
    assert.deepEqual(byContent.body.posts.map((p) => p.title), ['개봉 자랑']);
  });

  it('검색어의 % 와 _ 는 글자 그대로 찾는다', async () => {
    const res = await request(ctx.app).get(`/api/posts?q=${encodeURIComponent('%_')}`);
    assert.deepEqual(res.body.posts.map((p) => p.title), ['100%_할인 이벤트?']);
  });

  it('카테고리 + 검색 + 페이지를 함께 쓸 수 있다', async () => {
    const page1 = await request(ctx.app).get('/api/posts?category=free&size=1&page=1');
    const page2 = await request(ctx.app).get('/api/posts?category=free&size=1&page=2');

    assert.equal(page1.body.total, 2);
    assert.equal(page1.body.posts[0].title, '100%_할인 이벤트?');
    assert.equal(page2.body.posts[0].title, '자유 1');
    assert.equal(page2.body.page, 2);
  });

  it('상세를 볼 때마다 조회수가 1 오르고 본문이 포함된다', async () => {
    const first = await request(ctx.app).get('/api/posts/1');
    const second = await request(ctx.app).get('/api/posts/1');

    assert.equal(first.status, 200);
    assert.equal(first.body.post.content, '아무 이야기');
    assert.equal(first.body.post.views, 1);
    assert.equal(second.body.post.views, 2);
  });

  it('없는 글이나 잘못된 id 는 404', async () => {
    assert.equal((await request(ctx.app).get('/api/posts/9999')).status, 404);
    assert.equal((await request(ctx.app).get('/api/posts/abc')).status, 404);
    assert.equal((await request(ctx.app).get('/api/posts/0')).status, 404);
  });
});

describe('게시글 수정 / 삭제 권한', () => {
  let ctx, post;
  beforeEach(async () => {
    ctx = await setupBoard();
    post = await writePost(ctx.agents.author);
  });

  it('작성자는 수정할 수 있다', async () => {
    const res = await ctx.agents.author
      .put(`/api/posts/${post.id}`)
      .send(samplePost({ category: 'price', title: '수정된 제목', content: '수정된 내용' }));

    assert.equal(res.status, 200);
    assert.equal(res.body.post.title, '수정된 제목');
    assert.equal(res.body.post.category, 'price');
    assert.equal(res.body.post.content, '수정된 내용');
  });

  it('다른 회원은 수정할 수 없다 (403)', async () => {
    const res = await ctx.agents.other.put(`/api/posts/${post.id}`).send(samplePost({ title: '탈취' }));
    assert.equal(res.status, 403);
  });

  it('관리자도 남의 글을 수정할 수는 없다 (403, 삭제만 가능)', async () => {
    const res = await ctx.agents.admin.put(`/api/posts/${post.id}`).send(samplePost({ title: '관리자 수정' }));
    assert.equal(res.status, 403);
  });

  it('일반 회원은 자기 글을 공지로 바꿀 수 없다 (403)', async () => {
    const res = await ctx.agents.author.put(`/api/posts/${post.id}`).send(samplePost({ category: 'notice' }));
    assert.equal(res.status, 403);
  });

  it('수정 검증 실패는 400 이고 글은 그대로다', async () => {
    const res = await ctx.agents.author.put(`/api/posts/${post.id}`).send(samplePost({ title: '' }));
    assert.equal(res.status, 400);
    const after = await request(ctx.app).get(`/api/posts/${post.id}`);
    assert.equal(after.body.post.title, '첫 글');
  });

  it('비로그인 수정·삭제는 401', async () => {
    assert.equal((await request(ctx.app).put(`/api/posts/${post.id}`).send(samplePost())).status, 401);
    assert.equal((await request(ctx.app).delete(`/api/posts/${post.id}`)).status, 401);
  });

  it('없는 글 수정·삭제는 404', async () => {
    assert.equal((await ctx.agents.author.put('/api/posts/9999').send(samplePost())).status, 404);
    assert.equal((await ctx.agents.author.delete('/api/posts/9999')).status, 404);
  });

  it('다른 회원은 삭제할 수 없다 (403)', async () => {
    const res = await ctx.agents.other.delete(`/api/posts/${post.id}`);
    assert.equal(res.status, 403);
    assert.equal((await request(ctx.app).get(`/api/posts/${post.id}`)).status, 200);
  });

  it('작성자는 삭제할 수 있고, 댓글도 함께 지워진다', async () => {
    await ctx.agents.other.post(`/api/posts/${post.id}/comments`).send({ content: '댓글' });

    const res = await ctx.agents.author.delete(`/api/posts/${post.id}`);
    assert.equal(res.status, 204);
    assert.equal((await request(ctx.app).get(`/api/posts/${post.id}`)).status, 404);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 0);
  });

  it('관리자는 남의 글을 삭제할 수 있다', async () => {
    const res = await ctx.agents.admin.delete(`/api/posts/${post.id}`);
    assert.equal(res.status, 204);
  });
});

describe('댓글', () => {
  let ctx, post;
  beforeEach(async () => {
    ctx = await setupBoard();
    post = await writePost(ctx.agents.author);
  });

  async function writeComment(agent, content = '좋은 글이네요') {
    const res = await agent.post(`/api/posts/${post.id}/comments`).send({ content });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.comment;
  }

  it('회원은 댓글을 쓰고, 누구나 작성순으로 볼 수 있다', async () => {
    await writeComment(ctx.agents.other, '첫 댓글');
    await writeComment(ctx.agents.author, '답글');

    const res = await request(ctx.app).get(`/api/posts/${post.id}/comments`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.comments.map((c) => [c.author_nickname, c.content]), [
      ['남', '첫 댓글'],
      ['작성자', '답글'],
    ]);

    const list = await request(ctx.app).get('/api/posts');
    assert.equal(list.body.posts[0].comment_count, 2);
  });

  it('비로그인은 댓글을 쓸 수 없다 (401)', async () => {
    const res = await request(ctx.app).post(`/api/posts/${post.id}/comments`).send({ content: '익명' });
    assert.equal(res.status, 401);
  });

  it('빈 댓글은 400', async () => {
    const res = await ctx.agents.other.post(`/api/posts/${post.id}/comments`).send({ content: '   ' });
    assert.equal(res.status, 400);
  });

  it('없는 글의 댓글 조회·작성은 404', async () => {
    assert.equal((await request(ctx.app).get('/api/posts/9999/comments')).status, 404);
    assert.equal((await ctx.agents.other.post('/api/posts/9999/comments').send({ content: 'x' })).status, 404);
  });

  it('댓글 작성자는 삭제할 수 있다', async () => {
    const comment = await writeComment(ctx.agents.other);
    assert.equal((await ctx.agents.other.delete(`/api/comments/${comment.id}`)).status, 204);
    const res = await request(ctx.app).get(`/api/posts/${post.id}/comments`);
    assert.equal(res.body.comments.length, 0);
  });

  it('글 작성자라도 남의 댓글은 삭제할 수 없다 (403)', async () => {
    const comment = await writeComment(ctx.agents.other);
    assert.equal((await ctx.agents.author.delete(`/api/comments/${comment.id}`)).status, 403);
  });

  it('관리자는 남의 댓글을 삭제할 수 있다', async () => {
    const comment = await writeComment(ctx.agents.other);
    assert.equal((await ctx.agents.admin.delete(`/api/comments/${comment.id}`)).status, 204);
  });

  it('비로그인 삭제는 401, 없는 댓글은 404', async () => {
    const comment = await writeComment(ctx.agents.other);
    assert.equal((await request(ctx.app).delete(`/api/comments/${comment.id}`)).status, 401);
    assert.equal((await ctx.agents.admin.delete('/api/comments/9999')).status, 404);
  });
});

describe('관리자 게시글 관리 (/api/admin/posts)', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await setupBoard();
    await writePost(ctx.agents.author, { title: '작성자 글' });
    await writePost(ctx.agents.other, { title: '남의 글', category: 'price' });
  });

  it('일반 회원은 403, 비로그인은 401', async () => {
    assert.equal((await ctx.agents.author.get('/api/admin/posts')).status, 403);
    assert.equal((await ctx.agents.author.delete('/api/admin/posts/1')).status, 403);
    assert.equal((await request(ctx.app).get('/api/admin/posts')).status, 401);
  });

  it('관리자는 전체 목록을 보고 작성자별로 거를 수 있다', async () => {
    const all = await ctx.agents.admin.get('/api/admin/posts');
    assert.equal(all.status, 200);
    assert.equal(all.body.total, 2);

    const byUser = await ctx.agents.admin.get(`/api/admin/posts?userId=${ctx.users.other.id}`);
    assert.deepEqual(byUser.body.posts.map((p) => p.title), ['남의 글']);
  });

  it('관리자는 게시글을 강제 삭제할 수 있고, 없는 글은 404', async () => {
    assert.equal((await ctx.agents.admin.delete('/api/admin/posts/1')).status, 204);
    assert.equal((await ctx.agents.admin.delete('/api/admin/posts/1')).status, 404);
    assert.equal((await request(ctx.app).get('/api/posts')).body.total, 1);
  });
});
