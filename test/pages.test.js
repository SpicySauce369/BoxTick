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
