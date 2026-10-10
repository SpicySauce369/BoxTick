const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { getCardById, getSetById } = require('../db/catalog');

const router = express.Router();
router.use(requireAdmin);

const CARD_PRICE_SOURCES = ['seed', 'admin', 'report', 'auto'];
const BOX_PRICE_SOURCES = ['seed', 'admin', 'naver-reference', 'danawa-reference', 'cardshop-reference', 'other'];

function parseId(raw) {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

function trimOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseNullableInteger(value, field, { min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return { value: null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) return { error: `${field} 값이 올바르지 않습니다.` };
  return { value: number };
}

function validateSet(body) {
  const errors = {};
  const name = trimOrNull(body.name);
  if (!name || name.length > 100) errors.name = '세트 이름은 1~100자여야 합니다.';

  const boxPrice = parseNullableInteger(body.box_price, 'box_price', { min: 0 });
  if (boxPrice.error) errors.box_price = boxPrice.error;
  const packs = parseNullableInteger(body.packs_per_box, 'packs_per_box', { min: 1 });
  if (packs.error) errors.packs_per_box = packs.error;

  return {
    errors,
    values: {
      name,
      release_date: trimOrNull(body.release_date),
      box_price: boxPrice.value,
      packs_per_box: packs.value,
      image_url: trimOrNull(body.image_url),
      external_id: trimOrNull(body.external_id),
    },
  };
}

function validateCard(body) {
  const errors = {};
  const setId = parseId(String(body.set_id ?? ''));
  const name = trimOrNull(body.name);
  if (!setId) errors.set_id = 'set_id는 양의 정수여야 합니다.';
  if (!name || name.length > 100) errors.name = '카드 이름은 1~100자여야 합니다.';

  return {
    errors,
    values: {
      set_id: setId,
      name,
      card_number: trimOrNull(body.card_number),
      rarity: trimOrNull(body.rarity),
      image_url: trimOrNull(body.image_url),
      external_id: trimOrNull(body.external_id),
    },
  };
}

function constraintResponse(err, res) {
  if (!String(err.code || '').startsWith('SQLITE_CONSTRAINT')) return false;
  res.status(409).json({ error: '중복되었거나 연결된 데이터 때문에 처리할 수 없습니다.' });
  return true;
}

router.post('/sets', (req, res) => {
  const { errors, values } = validateSet(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });

  try {
    const info = req.app.locals.db
      .prepare(
        `INSERT INTO card_sets (name, release_date, box_price, packs_per_box, image_url, external_id)
         VALUES (@name, @release_date, @box_price, @packs_per_box, @image_url, @external_id)`
      )
      .run(values);
    res.status(201).json({ set: getSetById(req.app.locals.db, info.lastInsertRowid) });
  } catch (err) {
    if (constraintResponse(err, res)) return;
    throw err;
  }
});

router.put('/sets/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !getSetById(req.app.locals.db, id)) return res.status(404).json({ error: '세트를 찾을 수 없습니다.' });

  const { errors, values } = validateSet(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });

  try {
    req.app.locals.db
      .prepare(
        `UPDATE card_sets
            SET name=@name, release_date=@release_date, box_price=@box_price,
                packs_per_box=@packs_per_box, image_url=@image_url, external_id=@external_id
          WHERE id=@id`
      )
      .run({ ...values, id });
    res.json({ set: getSetById(req.app.locals.db, id) });
  } catch (err) {
    if (constraintResponse(err, res)) return;
    throw err;
  }
});

router.delete('/sets/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !getSetById(req.app.locals.db, id)) return res.status(404).json({ error: '세트를 찾을 수 없습니다.' });

  try {
    req.app.locals.db.prepare('DELETE FROM card_sets WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    if (constraintResponse(err, res)) return;
    throw err;
  }
});

router.post('/cards', (req, res) => {
  const { errors, values } = validateCard(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });
  if (!getSetById(req.app.locals.db, values.set_id)) {
    return res.status(400).json({ error: '존재하지 않는 세트입니다.', fields: { set_id: '존재하지 않는 세트입니다.' } });
  }

  try {
    const info = req.app.locals.db
      .prepare(
        `INSERT INTO cards (set_id, name, card_number, rarity, image_url, external_id)
         VALUES (@set_id, @name, @card_number, @rarity, @image_url, @external_id)`
      )
      .run(values);
    res.status(201).json({ card: getCardById(req.app.locals.db, info.lastInsertRowid) });
  } catch (err) {
    if (constraintResponse(err, res)) return;
    throw err;
  }
});

router.put('/cards/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !getCardById(req.app.locals.db, id)) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });

  const { errors, values } = validateCard(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: '입력값을 확인해 주세요.', fields: errors });
  if (!getSetById(req.app.locals.db, values.set_id)) {
    return res.status(400).json({ error: '존재하지 않는 세트입니다.', fields: { set_id: '존재하지 않는 세트입니다.' } });
  }

  try {
    req.app.locals.db
      .prepare(
        `UPDATE cards
            SET set_id=@set_id, name=@name, card_number=@card_number,
                rarity=@rarity, image_url=@image_url, external_id=@external_id
          WHERE id=@id`
      )
      .run({ ...values, id });
    res.json({ card: getCardById(req.app.locals.db, id) });
  } catch (err) {
    if (constraintResponse(err, res)) return;
    throw err;
  }
});

router.delete('/cards/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !getCardById(req.app.locals.db, id)) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });
  req.app.locals.db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  res.status(204).end();
});

router.post('/prices', (req, res) => {
  const cardId = parseId(String(req.body?.card_id ?? ''));
  const price = Number(req.body?.price);
  const recordedAt = trimOrNull(req.body?.recorded_at);
  const source = trimOrNull(req.body?.source) || 'admin';

  if (!cardId || !getCardById(req.app.locals.db, cardId)) return res.status(400).json({ error: '존재하는 card_id가 필요합니다.' });
  if (!Number.isInteger(price) || price < 0) return res.status(400).json({ error: 'price는 0 이상의 정수여야 합니다.' });
  if (!recordedAt) return res.status(400).json({ error: 'recorded_at이 필요합니다.' });
  if (!CARD_PRICE_SOURCES.includes(source)) return res.status(400).json({ error: '허용되지 않은 source입니다.' });

  const info = req.app.locals.db
    .prepare('INSERT INTO price_history (card_id, price, recorded_at, source) VALUES (?, ?, ?, ?)')
    .run(cardId, price, recordedAt, source);
  const row = req.app.locals.db.prepare('SELECT * FROM price_history WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ price: row });
});

router.put('/prices/:id', (req, res) => {
  const id = parseId(req.params.id);
  const exists = id && req.app.locals.db.prepare('SELECT id FROM price_history WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: '카드 시세 기록을 찾을 수 없습니다.' });

  const price = Number(req.body?.price);
  const recordedAt = trimOrNull(req.body?.recorded_at);
  const source = trimOrNull(req.body?.source) || 'admin';
  if (!Number.isInteger(price) || price < 0 || !recordedAt || !CARD_PRICE_SOURCES.includes(source)) {
    return res.status(400).json({ error: '시세 입력값을 확인해 주세요.' });
  }

  req.app.locals.db
    .prepare('UPDATE price_history SET price=?, recorded_at=?, source=? WHERE id=?')
    .run(price, recordedAt, source, id);
  res.json({ price: req.app.locals.db.prepare('SELECT * FROM price_history WHERE id = ?').get(id) });
});

router.delete('/prices/:id', (req, res) => {
  const id = parseId(req.params.id);
  const info = id && req.app.locals.db.prepare('DELETE FROM price_history WHERE id = ?').run(id);
  if (!info || info.changes === 0) return res.status(404).json({ error: '카드 시세 기록을 찾을 수 없습니다.' });
  res.status(204).end();
});

router.post('/box-prices', (req, res) => {
  const setId = parseId(String(req.body?.set_id ?? ''));
  const price = Number(req.body?.price);
  const recordedAt = trimOrNull(req.body?.recorded_at);
  const source = trimOrNull(req.body?.source) || 'admin';
  const sourceUrl = trimOrNull(req.body?.source_url);
  const sellerName = trimOrNull(req.body?.seller_name);

  if (!setId || !getSetById(req.app.locals.db, setId)) return res.status(400).json({ error: '존재하는 set_id가 필요합니다.' });
  if (!Number.isInteger(price) || price < 0) return res.status(400).json({ error: 'price는 0 이상의 정수여야 합니다.' });
  if (!recordedAt) return res.status(400).json({ error: 'recorded_at이 필요합니다.' });
  if (!BOX_PRICE_SOURCES.includes(source)) return res.status(400).json({ error: '허용되지 않은 source입니다.' });

  const info = req.app.locals.db
    .prepare(
      'INSERT INTO box_price_history (set_id, price, recorded_at, source, source_url, seller_name) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(setId, price, recordedAt, source, sourceUrl, sellerName);
  const row = req.app.locals.db.prepare('SELECT * FROM box_price_history WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ price: row });
});

router.put('/box-prices/:id', (req, res) => {
  const id = parseId(req.params.id);
  const exists = id && req.app.locals.db.prepare('SELECT id FROM box_price_history WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: '박스 시세 기록을 찾을 수 없습니다.' });

  const price = Number(req.body?.price);
  const recordedAt = trimOrNull(req.body?.recorded_at);
  const source = trimOrNull(req.body?.source) || 'admin';
  const sourceUrl = trimOrNull(req.body?.source_url);
  const sellerName = trimOrNull(req.body?.seller_name);
  if (!Number.isInteger(price) || price < 0 || !recordedAt || !BOX_PRICE_SOURCES.includes(source)) {
    return res.status(400).json({ error: '시세 입력값을 확인해 주세요.' });
  }

  req.app.locals.db
    .prepare(
      'UPDATE box_price_history SET price=?, recorded_at=?, source=?, source_url=?, seller_name=? WHERE id=?'
    )
    .run(price, recordedAt, source, sourceUrl, sellerName, id);
  res.json({ price: req.app.locals.db.prepare('SELECT * FROM box_price_history WHERE id = ?').get(id) });
});

router.delete('/box-prices/:id', (req, res) => {
  const id = parseId(req.params.id);
  const info = id && req.app.locals.db.prepare('DELETE FROM box_price_history WHERE id = ?').run(id);
  if (!info || info.changes === 0) return res.status(404).json({ error: '박스 시세 기록을 찾을 수 없습니다.' });
  res.status(204).end();
});

module.exports = router;
