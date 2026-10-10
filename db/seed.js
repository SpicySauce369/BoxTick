// npm run db:init — 스키마, 관리자 계정, 카드/박스 샘플 데이터를 만든다.
const fs = require('node:fs');
const path = require('node:path');

const { openDatabase, initSchema } = require('./database');
const { createUser } = require('./users');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const ADMIN_NICKNAME = process.env.ADMIN_NICKNAME || '관리자';
const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

async function seedAdmin(db) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (exists) return false;
  await createUser(db, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    nickname: ADMIN_NICKNAME,
    role: 'admin',
  });
  return true;
}

function seedCatalog(db) {
  const sets = loadJson('sets.seed.json');
  const cards = loadJson('cards.seed.json');
  const cardPrices = loadJson('card-prices.seed.json');
  const boxPrices = loadJson('box-prices.seed.json');

  const transaction = db.transaction(() => {
    const setIds = new Map();
    const cardIds = new Map();

    const insertSet = db.prepare(
      `INSERT INTO card_sets (name, release_date, box_price, packs_per_box, image_url, external_id)
       VALUES (@name, @release_date, @box_price, @packs_per_box, @image_url, @external_id)`
    );
    const updateSet = db.prepare(
      `UPDATE card_sets
          SET name=@name, release_date=@release_date, box_price=@box_price,
              packs_per_box=@packs_per_box, image_url=@image_url, external_id=@external_id
        WHERE id=@id`
    );

    for (const item of sets) {
      let row = item.external_id
        ? db.prepare('SELECT id FROM card_sets WHERE external_id = ?').get(item.external_id)
        : null;
      if (!row) row = db.prepare('SELECT id FROM card_sets WHERE name = ?').get(item.name);

      let id;
      if (row) {
        id = row.id;
        updateSet.run({ ...item, id });
      } else {
        id = insertSet.run(item).lastInsertRowid;
      }
      setIds.set(item.seed_id, id);
    }

    const insertCard = db.prepare(
      `INSERT INTO cards (set_id, name, card_number, rarity, image_url, external_id)
       VALUES (@set_id, @name, @card_number, @rarity, @image_url, @external_id)`
    );
    const updateCard = db.prepare(
      `UPDATE cards
          SET name=@name, rarity=@rarity, image_url=@image_url, external_id=@external_id
        WHERE id=@id`
    );

    for (const item of cards) {
      const setId = setIds.get(item.set);
      if (!setId) throw new Error(`seed 세트를 찾을 수 없습니다: ${item.set}`);

      let row = item.external_id
        ? db.prepare('SELECT id FROM cards WHERE external_id = ?').get(item.external_id)
        : null;
      if (!row) {
        row = db.prepare('SELECT id FROM cards WHERE set_id = ? AND card_number = ?').get(setId, item.card_number);
      }

      let id;
      if (row) {
        id = row.id;
        updateCard.run({
          id,
          name: item.name,
          rarity: item.rarity,
          image_url: item.image_url,
          external_id: item.external_id,
        });
      } else {
        id = insertCard.run({
          set_id: setId,
          name: item.name,
          card_number: item.card_number,
          rarity: item.rarity,
          image_url: item.image_url,
          external_id: item.external_id,
        }).lastInsertRowid;
      }
      cardIds.set(item.seed_id, id);
    }

    const deleteSeedCardPrices = db.prepare("DELETE FROM price_history WHERE card_id = ? AND source = 'seed'");
    const insertCardPrice = db.prepare(
      'INSERT INTO price_history (card_id, price, recorded_at, source) VALUES (?, ?, ?, ?)'
    );
    for (const item of cardPrices) {
      const cardId = cardIds.get(item.card);
      if (!cardId) throw new Error(`seed 카드를 찾을 수 없습니다: ${item.card}`);
      deleteSeedCardPrices.run(cardId);
      for (const price of item.history) {
        insertCardPrice.run(cardId, price.price, price.date, price.source || 'seed');
      }
    }

    const deleteSeedBoxPrices = db.prepare("DELETE FROM box_price_history WHERE set_id = ? AND source = 'seed'");
    const insertBoxPrice = db.prepare(
      `INSERT INTO box_price_history
         (set_id, price, recorded_at, source, source_url, seller_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const item of boxPrices) {
      const setId = setIds.get(item.set);
      if (!setId) throw new Error(`seed 세트를 찾을 수 없습니다: ${item.set}`);
      deleteSeedBoxPrices.run(setId);
      for (const price of item.history) {
        insertBoxPrice.run(
          setId,
          price.price,
          price.date,
          price.source || 'seed',
          price.source_url ?? null,
          price.seller_name ?? null
        );
      }
    }

    return {
      sets: sets.length,
      cards: cards.length,
      cardPrices: cardPrices.reduce((sum, item) => sum + item.history.length, 0),
      boxPrices: boxPrices.reduce((sum, item) => sum + item.history.length, 0),
    };
  });

  return transaction();
}

async function main() {
  const db = openDatabase();
  initSchema(db);
  console.log(`[db:init] 스키마 적용 완료: ${db.name}`);

  if (await seedAdmin(db)) {
    console.log(`[db:init] 관리자 계정 생성: ${ADMIN_USERNAME}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[db:init] 기본 관리자 비밀번호(admin1234)를 사용했습니다. 배포 전 ADMIN_PASSWORD 로 변경하세요.');
    }
  } else {
    console.log(`[db:init] 관리자 계정이 이미 있습니다: ${ADMIN_USERNAME}`);
  }

  const counts = seedCatalog(db);
  console.log(
    `[db:init] 샘플 데이터: 세트 ${counts.sets}, 카드 ${counts.cards}, 카드 시세 ${counts.cardPrices}, 박스 시세 ${counts.boxPrices}`
  );
  db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedAdmin, seedCatalog };
