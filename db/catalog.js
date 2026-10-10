const { escapeLike } = require('../lib/pagination');

function round1(value) {
  return Math.round(value * 10) / 10;
}

function addSetMetrics(row) {
  if (!row) return row;
  const packPrice =
    row.box_price != null && row.packs_per_box
      ? Math.round(row.box_price / row.packs_per_box)
      : null;
  const boxChangeRate =
    row.current_box_price != null && row.box_price > 0
      ? round1(((row.current_box_price - row.box_price) / row.box_price) * 100)
      : null;

  return {
    ...row,
    pack_price: packPrice,
    box_change_rate: boxChangeRate,
  };
}

function listSets(db) {
  const rows = db
    .prepare(
      \`SELECT s.id, s.name, s.release_date, s.box_price, s.packs_per_box,
              s.image_url, s.external_id,
              (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count,
              (SELECT b.price
                 FROM box_price_history b
                WHERE b.set_id = s.id
                ORDER BY b.recorded_at DESC, b.id DESC
                LIMIT 1) AS current_box_price,
              (SELECT b.recorded_at
                 FROM box_price_history b
                WHERE b.set_id = s.id
                ORDER BY b.recorded_at DESC, b.id DESC
                LIMIT 1) AS latest_box_price_at
         FROM card_sets s
        ORDER BY COALESCE(s.release_date, '0000-00-00') DESC, s.id DESC\`
    )
    .all();

  return rows.map(addSetMetrics);
}

function getSetById(db, id) {
  const row = db
    .prepare(
      \`SELECT s.id, s.name, s.release_date, s.box_price, s.packs_per_box,
              s.image_url, s.external_id,
              (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count,
              (SELECT b.price
                 FROM box_price_history b
                WHERE b.set_id = s.id
                ORDER BY b.recorded_at DESC, b.id DESC
                LIMIT 1) AS current_box_price,
              (SELECT b.recorded_at
                 FROM box_price_history b
                WHERE b.set_id = s.id
                ORDER BY b.recorded_at DESC, b.id DESC
                LIMIT 1) AS latest_box_price_at
         FROM card_sets s
        WHERE s.id = ?\`
    )
    .get(id);

  if (!row) return null;

  const boxPrices = db
    .prepare(
      \`SELECT id, price, recorded_at, source, source_url, seller_name
         FROM box_price_history
        WHERE set_id = ?
        ORDER BY recorded_at ASC, id ASC\`
    )
    .all(id);

  return { ...addSetMetrics(row), box_prices: boxPrices };
}

function listCards(db, { q = '', setId = null, rarity = '', page, size, offset }) {
  const where = [];
  const params = { limit: size, offset };

  if (q) {
    where.push("(c.name LIKE @q ESCAPE '\\\\' OR c.card_number LIKE @q ESCAPE '\\\\')");
    params.q = \`%\${escapeLike(q)}%\`;
  }
  if (setId != null) {
    where.push('c.set_id = @setId');
    params.setId = setId;
  }
  if (rarity) {
    where.push('c.rarity = @rarity');
    params.rarity = rarity;
  }

  const whereSql = where.length ? \`WHERE \${where.join(' AND ')}\` : '';
  const { total } = db
    .prepare(\`SELECT COUNT(*) AS total FROM cards c \${whereSql}\`)
    .get(params);

  const cards = db
    .prepare(
      \`SELECT c.id, c.set_id, c.name, c.card_number, c.rarity,
              c.image_url, c.external_id, c.created_at,
              s.name AS set_name,
              (SELECT p.price
                 FROM price_history p
                WHERE p.card_id = c.id
                ORDER BY p.recorded_at DESC, p.id DESC
                LIMIT 1) AS current_price,
              (SELECT p.recorded_at
                 FROM price_history p
                WHERE p.card_id = c.id
                ORDER BY p.recorded_at DESC, p.id DESC
                LIMIT 1) AS latest_price_at
         FROM cards c
         JOIN card_sets s ON s.id = c.set_id
         \${whereSql}
        ORDER BY c.name COLLATE NOCASE ASC, c.id ASC
        LIMIT @limit OFFSET @offset\`
    )
    .all(params);

  return { cards, page, size, total };
}

function getCardById(db, id) {
  return db
    .prepare(
      \`SELECT c.id, c.set_id, c.name, c.card_number, c.rarity,
              c.image_url, c.external_id, c.created_at,
              s.name AS set_name, s.release_date AS set_release_date,
              s.box_price AS set_box_price, s.packs_per_box,
              (SELECT p.price
                 FROM price_history p
                WHERE p.card_id = c.id
                ORDER BY p.recorded_at DESC, p.id DESC
                LIMIT 1) AS current_price,
              (SELECT p.recorded_at
                 FROM price_history p
                WHERE p.card_id = c.id
                ORDER BY p.recorded_at DESC, p.id DESC
                LIMIT 1) AS latest_price_at
         FROM cards c
         JOIN card_sets s ON s.id = c.set_id
        WHERE c.id = ?\`
    )
    .get(id);
}

const RANGE_MODIFIERS = {
  '1w': '-7 days',
  '1m': '-1 month',
  '3m': '-3 months',
};

function calculateStats(prices) {
  if (!prices.length) {
    return {
      current: null,
      min: null,
      max: null,
      avg: null,
      change: null,
      change_rate: null,
    };
  }

  const values = prices.map((item) => item.price);
  const first = values[0];
  const current = values[values.length - 1];
  const change = current - first;

  return {
    current,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    change,
    change_rate: first > 0 ? round1((change / first) * 100) : null,
  };
}

function getCardPriceHistory(db, cardId, range = '1m') {
  const latest = db
    .prepare('SELECT MAX(recorded_at) AS latest FROM price_history WHERE card_id = ?')
    .get(cardId).latest;

  if (!latest) {
    return { prices: [], stats: calculateStats([]), latest_recorded_at: null };
  }

  let prices;
  if (range === 'all') {
    prices = db
      .prepare(
        \`SELECT id, price, recorded_at, source
           FROM price_history
          WHERE card_id = ?
          ORDER BY recorded_at ASC, id ASC\`
      )
      .all(cardId);
  } else {
    prices = db
      .prepare(
        \`SELECT id, price, recorded_at, source
           FROM price_history
          WHERE card_id = ?
            AND recorded_at >= date(?, ?)
          ORDER BY recorded_at ASC, id ASC\`
      )
      .all(cardId, latest, RANGE_MODIFIERS[range]);
  }

  return {
    prices,
    stats: calculateStats(prices),
    latest_recorded_at: latest,
  };
}

module.exports = {
  RANGE_MODIFIERS,
  addSetMetrics,
  calculateStats,
  listSets,
  getSetById,
  listCards,
  getCardById,
  getCardPriceHistory,
};
