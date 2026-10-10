const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createUser } = require('../db/users');
const { seedCatalog } = require('../db/seed');
const { PASSWORD, setup, login } = require('./helpers');

function setupCatalog() {
  const ctx = setup();
  seedCatalog(ctx.db);
  return ctx;
}

describe('카탈로그 seed', () => {
  it('세트 3개, 카드 24개와 시세 데이터를 넣는다', () => {
    const { db } = setupCatalog();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_sets').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 24);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM price_history WHERE source='seed'").get().n, 216);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM box_price_history WHERE source='seed'").get().n, 27);
  });

  it('두 번 실행해도 샘플 데이터가 중복되지 않는다', () => {
    const { db } = setupCatalog();
    seedCatalog(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_sets').get().n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 24);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM price_history WHERE source='seed'").get().n, 216);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM box_price_history WHERE source='seed'").get().n, 27);
  });

  it('관리자가 추가한 시세는 seed 재실행으로 지워지지 않는다', () => {
    const { db } = setupCatalog();
    const cardId = db.prepare("SELECT id FROM cards WHERE name='비크티니' ORDER BY id LIMIT 1").get().id;
    db.prepare(
      "INSERT INTO price_history (card_id, price, recorded_at, source) VALUES (?, 99999, '2026-10-02', 'admin')"
    ).run(cardId);

    seedCatalog(db);
    const row = db.prepare("SELECT price FROM price_history WHERE card_id=? AND source='admin'").get(cardId);
    assert.equal(row.price, 99999);
  });
});

describe('공개 세트/박스 API', () => {
  let db, app;
  beforeEach(() => ({ db, app } = setupCatalog()));

  it('세트 목록에 현재 박스 시세, 팩 정가, 상승률을 포함한다', async () => {
    const res = await request(app).get('/api/sets');
    assert.equal(res.status, 200);
    assert.equal(res.body.sets.length, 3);

    const black = res.body.sets.find((s) => s.name === '블랙볼트');
    assert.equal(black.card_count, 8);
    assert.equal(black.pack_price, 2500);
    assert.equal(black.current_box_price, 69000);
    assert.equal(black.box_change_rate, 38);
  });

  it('세트 상세에서 박스 시세 이력을 오래된 순서로 돌려준다', async () => {
    const id = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;
    const res = await request(app).get(`/api/sets/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.set.box_prices.length, 9);
    assert.equal(res.body.set.box_prices[0].recorded_at, '2026-05-01');
    assert.equal(res.body.set.box_prices.at(-1).recorded_at, '2026-10-01');
  });

  it('없는 세트는 404', async () => {
    assert.equal((await request(app).get('/api/sets/99999')).status, 404);
    assert.equal((await request(app).get('/api/sets/nope')).status, 404);
  });
});

describe('공개 카드 API', () => {
  let db, app;
  beforeEach(() => ({ db, app } = setupCatalog()));

  it('카드 목록은 페이지 정보와 현재가를 돌려준다', async () => {
    const res = await request(app).get('/api/cards?size=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 24);
    assert.equal(res.body.cards.length, 5);
    assert.ok(res.body.cards.every((c) => c.current_price !== null));
  });

  it('이름 검색, 희귀도, 세트 필터를 조합할 수 있다', async () => {
    const victini = await request(app).get('/api/cards?q=' + encodeURIComponent('비크티니'));
    assert.equal(victini.body.total, 2);

    const sar = await request(app).get('/api/cards?rarity=SAR');
    assert.equal(sar.body.total, 8);

    const setId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;
    const black = await request(app).get(`/api/cards?set=${setId}`);
    assert.equal(black.body.total, 8);
    assert.ok(black.body.cards.every((c) => c.set_name === '블랙볼트'));
  });

  it('검색어의 % 와 _ 는 와일드카드가 아니라 글자로 취급한다', async () => {
    assert.equal((await request(app).get('/api/cards?q=%25')).body.total, 0);
    assert.equal((await request(app).get('/api/cards?q=_')).body.total, 0);
  });

  it('잘못된 set 필터는 400', async () => {
    assert.equal((await request(app).get('/api/cards?set=abc')).status, 400);
  });

  it('카드 상세는 세트 정보와 최신 시세를 포함한다', async () => {
    const card = db.prepare("SELECT id FROM cards WHERE name='비크티니' AND rarity='AR'").get();
    const res = await request(app).get(`/api/cards/${card.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.card.name, '비크티니');
    assert.equal(res.body.card.rarity, 'AR');
    assert.equal(res.body.card.set_name, '블랙볼트');
    assert.equal(res.body.card.latest_price_at, '2026-10-01');
  });

  it('없는 카드는 404', async () => {
    assert.equal((await request(app).get('/api/cards/99999')).status, 404);
  });
});

describe('카드 시세 API', () => {
  let db, app, cardId;
  beforeEach(() => {
    ({ db, app } = setupCatalog());
    cardId = db.prepare("SELECT id FROM cards WHERE name='비크티니' AND rarity='AR'").get().id;
  });

  it('1주 범위는 최신 기록일 기준으로 계산하고 통계를 제공한다', async () => {
    const res = await request(app).get(`/api/cards/${cardId}/prices?range=1w`);
    assert.equal(res.status, 200);
    assert.equal(res.body.latest_recorded_at, '2026-10-01');
    assert.equal(res.body.prices.length, 2);
    assert.equal(res.body.prices[0].recorded_at, '2026-09-29');
    assert.equal(res.body.stats.current, res.body.prices.at(-1).price);
    assert.ok(Number.isFinite(res.body.stats.avg));
  });

  it('1개월, 3개월, 전체 범위가 각각 다른 개수를 돌려준다', async () => {
    const month = await request(app).get(`/api/cards/${cardId}/prices?range=1m`);
    const three = await request(app).get(`/api/cards/${cardId}/prices?range=3m`);
    const all = await request(app).get(`/api/cards/${cardId}/prices?range=all`);

    assert.equal(month.body.prices.length, 5);
    assert.equal(three.body.prices.length, 7);
    assert.equal(all.body.prices.length, 9);
  });

  it('잘못된 range는 400, 없는 카드는 404', async () => {
    assert.equal((await request(app).get(`/api/cards/${cardId}/prices?range=year`)).status, 400);
    assert.equal((await request(app).get('/api/cards/99999/prices')).status, 404);
  });
});

describe('관리자 카드/시세 API', () => {
  let db, app, adminAgent, userAgent;
  beforeEach(async () => {
    ({ db, app } = setupCatalog());
    await createUser(db, { username: 'catalogadmin', password: PASSWORD, nickname: '카드관리자', role: 'admin' });
    await createUser(db, { username: 'cataloguser', password: PASSWORD, nickname: '회원' });
    ({ agent: adminAgent } = await login(app, 'catalogadmin'));
    ({ agent: userAgent } = await login(app, 'cataloguser'));
  });

  it('비로그인은 401, 일반 회원은 403', async () => {
    assert.equal((await request(app).post('/api/admin/sets').send({ name: 'x' })).status, 401);
    assert.equal((await userAgent.post('/api/admin/sets').send({ name: 'x' })).status, 403);
  });

  it('관리자가 세트와 카드를 등록하고 수정할 수 있다', async () => {
    const setRes = await adminAgent.post('/api/admin/sets').send({
      name: '테스트 세트',
      box_price: 48000,
      packs_per_box: 20,
      release_date: '2026-10-10',
    });
    assert.equal(setRes.status, 201);

    const cardRes = await adminAgent.post('/api/admin/cards').send({
      set_id: setRes.body.set.id,
      name: '테스트몬 ex',
      card_number: '001/001',
      rarity: 'RR',
    });
    assert.equal(cardRes.status, 201);

    const update = await adminAgent.put(`/api/admin/cards/${cardRes.body.card.id}`).send({
      set_id: setRes.body.set.id,
      name: '테스트몬 ex',
      card_number: '001/001',
      rarity: 'SR',
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.card.rarity, 'SR');
  });

  it('같은 세트에 같은 카드 번호를 등록하면 409', async () => {
    const setId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;
    const first = await adminAgent.post('/api/admin/cards').send({
      set_id: setId,
      name: '중복 테스트',
      card_number: '099/100',
      rarity: 'R',
    });
    assert.equal(first.status, 201);

    const second = await adminAgent.post('/api/admin/cards').send({
      set_id: setId,
      name: '중복 테스트2',
      card_number: '099/100',
      rarity: 'R',
    });
    assert.equal(second.status, 409);
  });

  it('카드 시세와 박스 시세를 등록·수정·삭제할 수 있다', async () => {
    const cardId = db.prepare("SELECT id FROM cards WHERE name='비크티니' AND rarity='AR'").get().id;
    const setId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;

    const cardPrice = await adminAgent.post('/api/admin/prices').send({
      card_id: cardId,
      price: 22222,
      recorded_at: '2026-10-11',
      source: 'admin',
    });
    assert.equal(cardPrice.status, 201);

    const cardUpdate = await adminAgent.put(`/api/admin/prices/${cardPrice.body.price.id}`).send({
      price: 23000,
      recorded_at: '2026-10-11',
      source: 'admin',
    });
    assert.equal(cardUpdate.body.price.price, 23000);

    const boxPrice = await adminAgent.post('/api/admin/box-prices').send({
      set_id: setId,
      price: 71000,
      recorded_at: '2026-10-11',
      source: 'cardshop-reference',
      source_url: 'https://example.com/box',
      seller_name: '샘플 카드샵',
    });
    assert.equal(boxPrice.status, 201);
    assert.equal(boxPrice.body.price.seller_name, '샘플 카드샵');

    assert.equal((await adminAgent.delete(`/api/admin/prices/${cardPrice.body.price.id}`)).status, 204);
    assert.equal((await adminAgent.delete(`/api/admin/box-prices/${boxPrice.body.price.id}`)).status, 204);
  });

  it('카드를 삭제하면 카드 시세도 함께 삭제된다', async () => {
    const cardId = db.prepare("SELECT id FROM cards WHERE name='비크티니' AND rarity='AR'").get().id;
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM price_history WHERE card_id=?').get(cardId).n > 0);

    assert.equal((await adminAgent.delete(`/api/admin/cards/${cardId}`)).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM price_history WHERE card_id=?').get(cardId).n, 0);
  });

  it('카드가 남은 세트는 삭제할 수 없고 빈 세트는 삭제할 수 있다', async () => {
    const usedId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;
    assert.equal((await adminAgent.delete(`/api/admin/sets/${usedId}`)).status, 409);

    const created = await adminAgent.post('/api/admin/sets').send({
      name: '빈 세트',
      box_price: 10000,
      packs_per_box: 10,
    });
    assert.equal((await adminAgent.delete(`/api/admin/sets/${created.body.set.id}`)).status, 204);
  });


  it('잘못된 날짜와 존재하지 않는 날짜를 거부한다', async () => {
    const cardId = db.prepare("SELECT id FROM cards WHERE name='비크티니' AND rarity='AR'").get().id;
    const setId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;

    const badCard = await adminAgent.post('/api/admin/prices').send({
      card_id: cardId,
      price: 20000,
      recorded_at: 'abc',
      source: 'admin',
    });
    assert.equal(badCard.status, 400);
    assert.ok(badCard.body.fields.recorded_at);

    const impossibleBox = await adminAgent.post('/api/admin/box-prices').send({
      set_id: setId,
      price: 70000,
      recorded_at: '2026-02-30',
      source: 'admin',
    });
    assert.equal(impossibleBox.status, 400);
    assert.ok(impossibleBox.body.fields.recorded_at);

    const badSet = await adminAgent.post('/api/admin/sets').send({
      name: '날짜 오류 세트',
      release_date: '2026-13-01',
      box_price: 50000,
      packs_per_box: 20,
    });
    assert.equal(badSet.status, 400);
    assert.ok(badSet.body.fields.release_date);
  });

  it('관리자 API에서는 source=seed 를 사용할 수 없다', async () => {
    const cardId = db.prepare("SELECT id FROM cards WHERE name='비크티니' AND rarity='AR'").get().id;
    const setId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;

    const card = await adminAgent.post('/api/admin/prices').send({
      card_id: cardId,
      price: 22222,
      recorded_at: '2026-10-11',
      source: 'seed',
    });
    assert.equal(card.status, 400);
    assert.ok(card.body.fields.source);

    const box = await adminAgent.post('/api/admin/box-prices').send({
      set_id: setId,
      price: 70000,
      recorded_at: '2026-10-11',
      source: 'seed',
    });
    assert.equal(box.status, 400);
    assert.ok(box.body.fields.source);
  });

  it('허용되지 않은 시세 source는 400', async () => {
    const setId = db.prepare("SELECT id FROM card_sets WHERE name='블랙볼트'").get().id;
    const res = await adminAgent.post('/api/admin/box-prices').send({
      set_id: setId,
      price: 70000,
      recorded_at: '2026-10-11',
      source: 'unknown-market',
    });
    assert.equal(res.status, 400);
  });
});
