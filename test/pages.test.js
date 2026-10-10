// 정적 화면: 로그인 · 회원가입 페이지가 제공되고 공통 스크립트를 불러오는지
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setup } = require('./helpers');

describe('로그인 · 회원가입 화면', () => {
  const { app } = setup();

  for (const [path, formId] of [['/login.html', 'login-form'], ['/register.html', 'register-form']]) {
    it(`${path} 는 폼과 공통 스크립트를 포함한다`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 200);
      assert.ok(res.text.includes(`id="${formId}"`));
      for (const asset of ['/css/base.css', '/css/auth.css', '/js/common.js', '/js/auth-pages.js']) {
        assert.ok(res.text.includes(asset), asset);
      }
    });
  }
});

describe('마이페이지 화면', () => {
  const { app } = setup();

  it('/mypage.html 은 두 탭과 수정 폼, 전용 스크립트를 포함한다', async () => {
    const res = await request(app).get('/mypage.html');
    assert.equal(res.status, 200);
    for (const id of ['tab-info', 'tab-posts', 'nickname-form', 'password-form', 'my-post-list']) {
      assert.ok(res.text.includes(`id="${id}"`), id);
    }
    for (const asset of ['/css/base.css', '/css/mypage.css', '/js/common.js', '/js/mypage.js']) {
      assert.ok(res.text.includes(asset), asset);
    }
  });

  it('폼의 입력 이름이 PUT /api/auth/me 계약(nickname, currentPassword, newPassword)과 같다', async () => {
    const res = await request(app).get('/mypage.html');
    for (const name of ['nickname', 'currentPassword', 'newPassword']) {
      assert.ok(res.text.includes(`name="${name}"`), name);
      assert.ok(res.text.includes(`id="${name}-error"`), `${name}-error`);
    }
  });
});

describe('게시판 화면', () => {
  const { app } = setup();

  for (const [path, ids, script] of [
    ['/board.html', ['category-tabs', 'search-form', 'post-list', 'pagination'], '/js/board.js'],
    ['/post.html', ['post-title', 'post-content', 'comment-list', 'comment-form'], '/js/post.js'],
    ['/write.html', ['write-form', 'category-options', 'title', 'content'], '/js/write.js'],
  ]) {
    it(`${path} 는 Y-COMM 무대(shield)와 필요한 요소 · 스크립트를 포함한다`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('data-stage="shield"'));
      for (const id of ids) assert.ok(res.text.includes(`id="${id}"`), id);
      for (const asset of ['/css/base.css', '/css/board.css', '/js/common.js', '/js/board-common.js', script]) {
        assert.ok(res.text.includes(asset), asset);
      }
    });
  }

  it('글쓰기 폼의 입력 이름과 오류 칸이 POST /api/posts 계약(category, title, content)과 같다', async () => {
    const res = await request(app).get('/write.html');
    for (const name of ['title', 'content']) assert.ok(res.text.includes(`name="${name}"`), name);
    for (const name of ['category', 'title', 'content']) assert.ok(res.text.includes(`id="${name}-error"`), `${name}-error`);
  });

  it('카테고리 목록이 서버 CATEGORIES 와 같은 순서다', () => {
    const { CATEGORIES } = require('../db/posts');
    const source = require('node:fs').readFileSync(require.resolve('../public/js/board-common.js'), 'utf8');
    const keys = [...source.matchAll(/\{ key: '(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(keys, CATEGORIES);
  });
});
