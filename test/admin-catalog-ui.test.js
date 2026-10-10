const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setup } = require('./helpers');
const { MENU } = require('../public/js/admin.js');

const catalogPages = [
  { key: 'sets', path: '/admin/sets.html', mode: 'sets' },
  { key: 'cards', path: '/admin/cards.html', mode: 'cards' },
  { key: 'card-prices', path: '/admin/card-prices.html', mode: 'card-prices' },
  { key: 'box-prices', path: '/admin/box-prices.html', mode: 'box-prices' },
];

describe('관리자 카탈로그 UI', () => {
  const { app } = setup();

  it('관리자 메뉴 주소와 실제 파일 주소가 일치한다', () => {
    const items = MENU.flatMap((group) => group.items);
    for (const page of catalogPages) {
      const item = items.find((entry) => entry.key === page.key);
      assert.ok(item, page.key);
      assert.equal(item.href, page.path);
    }
  });

  for (const page of catalogPages) {
    it(page.path + ' 정적 화면을 제공한다', async () => {
      const res = await request(app).get(page.path);
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /html/);
      assert.match(res.text, /data-stage="neutral"/);
      assert.ok(res.text.includes('data-admin-catalog="' + page.mode + '"'));
      for (const asset of ['/css/base.css', '/css/admin.css', '/css/admin-catalog.css', '/js/common.js', '/js/admin.js', '/js/admin-catalog.js']) {
        assert.ok(res.text.includes(asset), asset);
      }
    });
  }

  it('관리자 카탈로그 전용 CSS·JS 파일을 제공한다', async () => {
    assert.equal((await request(app).get('/css/admin-catalog.css')).status, 200);
    assert.equal((await request(app).get('/js/admin-catalog.js')).status, 200);
  });

  it('시세 화면은 서버 허용 source만 선택지로 노출한다', async () => {
    const card = await request(app).get('/admin/card-prices.html');
    assert.doesNotMatch(card.text, /option value="seed"/);
    assert.match(card.text, /option value="admin"/);
    assert.match(card.text, /option value="report"/);
    assert.match(card.text, /option value="auto"/);

    const box = await request(app).get('/admin/box-prices.html');
    assert.doesNotMatch(box.text, /option value="seed"/);
    for (const source of ['admin', 'naver-reference', 'danawa-reference', 'cardshop-reference', 'other']) {
      assert.ok(box.text.includes('option value="' + source + '"'), source);
    }
  });
});
