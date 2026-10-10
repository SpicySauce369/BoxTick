// 관리자 공통 틀: 메뉴 정의와 정적 파일 제공 확인
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { MENU } = require('../public/js/admin.js');
const { setup } = require('./helpers');

const items = MENU.flatMap((group) => group.items);

describe('관리자 메뉴 정의', () => {
  it('합의한 7개 메뉴가 순서대로 있다', () => {
    assert.deepEqual(items.map((item) => item.label), [
      '대시보드', '회원 관리', '게시글 관리', '세트 관리', '카드 관리', '카드 시세', '박스 시세',
    ]);
  });

  it('key 와 주소가 겹치지 않고 모두 /admin/ 아래에 있다', () => {
    assert.equal(new Set(items.map((item) => item.key)).size, items.length);
    assert.equal(new Set(items.map((item) => item.href)).size, items.length);
    for (const item of items) assert.match(item.href, /^\/admin\//, item.key);
  });
});

describe('관리자 정적 파일', () => {
  const { app } = setup();

  it('/admin/ 은 대시보드 HTML 을 돌려주고 공통 CSS·JS 를 불러온다', async () => {
    const res = await request(app).get('/admin/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /html/);
    for (const asset of ['/css/base.css', '/css/admin.css', '/js/common.js', '/js/admin.js']) {
      assert.ok(res.text.includes(asset), asset);
    }
    assert.match(res.text, /data-stage="neutral"/);
  });

  it('관리자 CSS·JS 파일이 제공된다', async () => {
    assert.equal((await request(app).get('/css/admin.css')).status, 200);
    assert.equal((await request(app).get('/js/admin.js')).status, 200);
  });
});

describe('관리자 회원 · 게시글 관리 화면', () => {
  const { app } = setup();

  for (const [path, ids, script] of [
    ['/admin/users.html', ['admin-sidebar', 'status-filter', 'item-list', 'detail-panel', 'status-button'], '/js/admin-users.js'],
    ['/admin/posts.html', ['admin-sidebar', 'category-filter', 'item-list', 'detail-panel', 'delete-button'], '/js/admin-posts.js'],
  ]) {
    it(`${path} 는 관리자 공통 틀과 필요한 요소 · 스크립트를 포함한다`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 200);
      assert.match(res.text, /data-stage="neutral"/);
      for (const id of ids) assert.ok(res.text.includes(`id="${id}"`), id);
      for (const asset of ['/css/base.css', '/css/admin.css', '/css/admin-manage.css', '/js/common.js', '/js/admin.js', '/js/admin-manage.js', script]) {
        assert.ok(res.text.includes(asset), asset);
      }
    });
  }

  it('메뉴의 회원 관리 · 게시글 관리 주소가 실제 파일과 이어진다', async () => {
    for (const key of ['users', 'posts']) {
      const item = items.find((i) => i.key === key);
      assert.equal((await request(app).get(item.href)).status, 200, item.href);
    }
  });
});
