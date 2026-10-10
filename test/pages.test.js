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

  it('회원가입 화면은 next를 이어받을 로그인 링크를 제공한다', async () => {
    const res = await request(app).get('/register.html');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('id="login-link"'));
  });
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
