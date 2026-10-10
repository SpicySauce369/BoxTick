// npm run db:init — 스키마, 관리자, 카드/박스 샘플, 회원·게시글·댓글 샘플 데이터를 만든다.
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

/**
 * users.seed.json → users. seed_id → users.id 맵을 돌려준다.
 * - managed_by_env 항목(admin)은 seedAdmin 이 만든 ADMIN_USERNAME 계정에 매핑한다.
 * - 일반 회원은 username 으로 찾고, 없을 때만 createUser()(bcrypt)로 만든다.
 *   이미 있으면 그대로 둔다 (회원이 바꾼 닉네임·비밀번호를 덮어쓰지 않는다).
 */
async function seedUsers(db) {
  const users = loadJson('users.seed.json');
  const userIds = new Map();
  let created = 0;

  for (const item of users) {
    if (item.managed_by_env) {
      const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
      if (!admin) throw new Error(`관리자 계정이 없습니다: ${ADMIN_USERNAME} (seedAdmin 을 먼저 실행하세요)`);
      userIds.set(item.seed_id, admin.id);
      continue;
    }

    let row = db.prepare('SELECT id FROM users WHERE username = ?').get(item.username);
    if (!row) {
      row = await createUser(db, {
        username: item.username,
        password: item.password,
        nickname: item.nickname,
        role: item.role || 'user',
      });
      if (item.status && item.status !== 'active') {
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(item.status, row.id);
      }
      created += 1;
    }
    userIds.set(item.seed_id, row.id);
  }

  return { userIds, total: users.length, created };
}

/**
 * posts.seed.json, comments.seed.json → posts, comments.
 * posts 에는 seed 키 컬럼이 없으므로 (작성자, 작성 시각, 제목) / (게시글, 작성자, 작성 시각, 내용)으로
 * 이미 들어간 seed 를 찾는다. 있으면 건너뛰므로 재실행해도 중복되지 않고, 회원이 수정한 내용도 유지된다.
 */
function seedBoard(db, userIds) {
  const posts = loadJson('posts.seed.json');
  const comments = loadJson('comments.seed.json');

  const userIdOf = (seedId, owner) => {
    const id = userIds.get(seedId);
    if (!id) throw new Error(`seed 회원을 찾을 수 없습니다: ${seedId} (${owner})`);
    return id;
  };

  const transaction = db.transaction(() => {
    const postIds = new Map();
    let createdPosts = 0;
    let createdComments = 0;

    const findPost = db.prepare('SELECT id FROM posts WHERE user_id = ? AND created_at = ? AND title = ?');
    const insertPost = db.prepare(
      `INSERT INTO posts (user_id, category, title, content, views, created_at, updated_at)
       VALUES (@user_id, @category, @title, @content, @views, @created_at, @created_at)`
    );
    for (const item of posts) {
      const userId = userIdOf(item.author, item.seed_id);
      let row = findPost.get(userId, item.created_at, item.title);
      if (!row) {
        row = {
          id: insertPost.run({
            user_id: userId,
            category: item.category,
            title: item.title,
            content: item.content,
            views: item.views ?? 0,
            created_at: item.created_at,
          }).lastInsertRowid,
        };
        createdPosts += 1;
      }
      postIds.set(item.seed_id, row.id);
    }

    const findComment = db.prepare(
      'SELECT id FROM comments WHERE post_id = ? AND user_id = ? AND created_at = ? AND content = ?'
    );
    const insertComment = db.prepare(
      'INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const item of comments) {
      const postId = postIds.get(item.post);
      if (!postId) throw new Error(`seed 게시글을 찾을 수 없습니다: ${item.post} (${item.seed_id})`);
      const userId = userIdOf(item.author, item.seed_id);
      if (!findComment.get(postId, userId, item.created_at, item.content)) {
        insertComment.run(postId, userId, item.content, item.created_at);
        createdComments += 1;
      }
    }

    return { posts: posts.length, comments: comments.length, createdPosts, createdComments };
  });

  return transaction();
}

/** db:init 전체 순서: 관리자 → 카드/세트/시세 → 회원 → 게시글 → 댓글 */
async function seedAll(db) {
  const adminCreated = await seedAdmin(db);
  const catalog = seedCatalog(db);
  const users = await seedUsers(db);
  const board = seedBoard(db, users.userIds);
  return { adminCreated, catalog, users: { total: users.total, created: users.created }, board };
}

async function main() {
  const db = openDatabase();
  initSchema(db);
  console.log(`[db:init] 스키마 적용 완료: ${db.name}`);

  const { adminCreated, catalog, users, board } = await seedAll(db);

  if (adminCreated) {
    console.log(`[db:init] 관리자 계정 생성: ${ADMIN_USERNAME}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[db:init] 기본 관리자 비밀번호(admin1234)를 사용했습니다. 배포 전 ADMIN_PASSWORD 로 변경하세요.');
    }
  } else {
    console.log(`[db:init] 관리자 계정이 이미 있습니다: ${ADMIN_USERNAME}`);
  }
  console.log(
    `[db:init] 샘플 데이터: 세트 ${catalog.sets}, 카드 ${catalog.cards}, 카드 시세 ${catalog.cardPrices}, 박스 시세 ${catalog.boxPrices}`
  );
  console.log(
    `[db:init] 회원 ${users.total}명(새로 ${users.created}), 게시글 ${board.posts}(새로 ${board.createdPosts}), 댓글 ${board.comments}(새로 ${board.createdComments})`
  );
  db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedAdmin, seedCatalog, seedUsers, seedBoard, seedAll };
