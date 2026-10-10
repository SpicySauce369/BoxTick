const express = require('express');
const { parsePagination } = require('../lib/pagination');
const {
  RANGE_MODIFIERS,
  listSets,
  getSetById,
  listCards,
  getCardById,
  getCardPriceHistory,
} = require('../db/catalog');

const router = express.Router();

function parseId(raw) {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

router.get('/sets', (req, res) => {
  res.json({ sets: listSets(req.app.locals.db) });
});

router.get('/sets/:id', (req, res) => {
  const id = parseId(req.params.id);
  const set = id && getSetById(req.app.locals.db, id);
  if (!set) return res.status(404).json({ error: '세트를 찾을 수 없습니다.' });
  res.json({ set });
});

router.get('/cards', (req, res) => {
  const { page, size, offset } = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rarity = typeof req.query.rarity === 'string' ? req.query.rarity.trim() : '';

  let setId = null;
  if (req.query.set !== undefined && req.query.set !== '') {
    setId = parseId(String(req.query.set));
    if (!setId) return res.status(400).json({ error: 'set은 양의 정수여야 합니다.' });
  }

  res.json(
    listCards(req.app.locals.db, {
      q,
      setId,
      rarity,
      page,
      size,
      offset,
    })
  );
});

router.get('/cards/:id', (req, res) => {
  const id = parseId(req.params.id);
  const card = id && getCardById(req.app.locals.db, id);
  if (!card) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });
  res.json({ card });
});

router.get('/cards/:id/prices', (req, res) => {
  const id = parseId(req.params.id);
  const card = id && getCardById(req.app.locals.db, id);
  if (!card) return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });

  const range = typeof req.query.range === 'string' ? req.query.range : '1m';
  if (!RANGE_MODIFIERS[range] && range !== 'all') {
    return res.status(400).json({ error: "range는 '1w', '1m', '3m', 'all' 중 하나여야 합니다." });
  }

  res.json({
    card: { id: card.id, name: card.name },
    range,
    ...getCardPriceHistory(req.app.locals.db, id, range),
  });
});

module.exports = router;
