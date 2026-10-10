// 게시판 seed JSON(data/posts.seed.json, data/comments.seed.json) 무결성 검사
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { CATEGORIES } = require('../db/posts');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readSeed = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));

const posts = readSeed('posts.seed.json');
const comments = readSeed('comments.seed.json');
const postsBySeedId = new Map(posts.map((p) => [p.seed_id, p]));
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe('게시판 seed 데이터', () => {
  it('seed_id 가 파일 안에서 중복되지 않는다', () => {
    assert.equal(postsBySeedId.size, posts.length);
    assert.equal(new Set(comments.map((c) => c.seed_id)).size, comments.length);
  });

  it('게시글은 필수 필드와 올바른 카테고리를 가진다', () => {
    for (const post of posts) {
      assert.ok(CATEGORIES.includes(post.category), post.seed_id);
      assert.ok(post.author && post.title && post.content, post.seed_id);
      assert.match(post.created_at, DATETIME_RE, post.seed_id);
      assert.ok(Number.isInteger(post.views) && post.views >= 0, post.seed_id);
    }
  });

  it('카테고리마다 글이 있어 화면이 비지 않는다', () => {
    for (const category of CATEGORIES) {
      assert.ok(posts.some((p) => p.category === category), category);
    }
  });

  it('공지는 관리자(admin)만 작성자로 둔다', () => {
    for (const post of posts.filter((p) => p.category === 'notice')) {
      assert.equal(post.author, 'admin', post.seed_id);
    }
  });

  it('댓글은 존재하는 게시글을 가리키고, 게시글보다 늦게 작성된다', () => {
    for (const comment of comments) {
      const post = postsBySeedId.get(comment.post);
      assert.ok(post, `${comment.seed_id} → ${comment.post}`);
      assert.ok(comment.author && comment.content, comment.seed_id);
      assert.match(comment.created_at, DATETIME_RE, comment.seed_id);
      assert.ok(comment.created_at > post.created_at, comment.seed_id);
    }
  });

  it('users.seed.json 이 있으면, 작성자가 모두 그 안에 있다', (t) => {
    const usersPath = path.join(DATA_DIR, 'users.seed.json');
    if (!fs.existsSync(usersPath)) return t.skip('users.seed.json 이 아직 없음');

    const userSeedIds = new Set(readSeed('users.seed.json').map((u) => u.seed_id));
    for (const item of [...posts, ...comments]) {
      assert.ok(userSeedIds.has(item.author), `${item.seed_id} → ${item.author}`);
    }
  });
});
