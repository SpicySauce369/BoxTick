const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { openDatabase, initSchema } = require('../db/database');

describe('스키마 제약조건', () => {
  let db, setId;
  beforeEach(() => {
    db = openDatabase(':memory:');
    initSchema(db);
    setId = db
      .prepare("INSERT INTO card_sets (name, box_price, packs_per_box, external_id) VALUES ('테스트 세트', 50000, 30, 'sv1')")
      .run().lastInsertRowid;
  });

  const insertCard = (fields) =>
    db
      .prepare('INSERT INTO cards (set_id, name, card_number, external_id) VALUES (@set_id, @name, @card_number, @external_id)')
      .run({ set_id: setId, name: '피카츄', card_number: null, external_id: null, ...fields });

  it('initSchema 는 여러 번 실행해도 안전하다', () => {
    assert.doesNotThrow(() => initSchema(db));
  });

  it('같은 세트에 같은 카드 번호는 넣을 수 없다', () => {
    insertCard({ card_number: '025/165' });
    assert.throws(() => insertCard({ card_number: '025/165' }), /UNIQUE/);
  });

  it('카드 external_id 는 중복될 수 없지만 비어 있는 것은 여러 개 허용한다', () => {
    insertCard({ card_number: '001', external_id: 'sv1-1' });
    assert.throws(() => insertCard({ card_number: '002', external_id: 'sv1-1' }), /UNIQUE/);
    insertCard({ card_number: '003' });
    insertCard({ card_number: '004' });
  });

  it('세트 external_id 는 중복될 수 없다', () => {
    assert.throws(
      () => db.prepare("INSERT INTO card_sets (name, external_id) VALUES ('복제', 'sv1')").run(),
      /UNIQUE/
    );
  });

  it('박스 시세는 출처 기본값이 seed 이고 출처 URL·판매처를 저장한다', () => {
    db.prepare('INSERT INTO box_price_history (set_id, price, recorded_at) VALUES (?, 62000, ?)').run(setId, '2026-10-01');
    db.prepare(
      'INSERT INTO box_price_history (set_id, price, recorded_at, source, source_url, seller_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(setId, 65000, '2026-10-02', 'danawa-reference', 'https://example.com/box', '카드샵A');

    const rows = db.prepare('SELECT source, source_url, seller_name FROM box_price_history ORDER BY recorded_at').all();
    assert.deepEqual(rows, [
      { source: 'seed', source_url: null, seller_name: null },
      { source: 'danawa-reference', source_url: 'https://example.com/box', seller_name: '카드샵A' },
    ]);
  });

  it('정해지지 않은 박스 시세 출처는 거부한다', () => {
    assert.throws(
      () =>
        db.prepare("INSERT INTO box_price_history (set_id, price, recorded_at, source) VALUES (?, 1, '2026-10-01', 'coupang')").run(setId),
      /CHECK/
    );
  });

  it('카드가 남아 있는 세트는 삭제할 수 없다', () => {
    insertCard({ card_number: '001' });
    assert.throws(() => db.prepare('DELETE FROM card_sets WHERE id = ?').run(setId), /FOREIGN KEY/);
  });
});
