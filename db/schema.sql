-- BoxTick 스키마 (docs/웹사이트설계.MD 4장 기준)
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS 를 사용한다.
-- 카드팩 개봉 시뮬레이션 테이블은 설계서 10장에 따라 포함하지 않는다.

-- 4-2. 회원
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  nickname      TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user'   CHECK (role IN ('user', 'admin')),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4-3. 카드 세트 (팩 정가 = box_price / packs_per_box, 저장하지 않고 계산)
CREATE TABLE IF NOT EXISTS card_sets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  release_date  DATE,
  box_price     INTEGER CHECK (box_price IS NULL OR box_price >= 0),
  packs_per_box INTEGER CHECK (packs_per_box IS NULL OR packs_per_box > 0),
  image_url     TEXT,
  external_id   TEXT UNIQUE -- 외부 카드 데이터 API(TCGdex) 세트 ID, seed 중복 방지
);

-- 4-4. 카드 (카드가 남아 있는 세트는 삭제할 수 없다)
CREATE TABLE IF NOT EXISTS cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id      INTEGER NOT NULL REFERENCES card_sets(id),
  name        TEXT    NOT NULL,
  card_number TEXT,
  rarity      TEXT,
  image_url   TEXT,
  external_id TEXT UNIQUE, -- 외부 카드 데이터 API(TCGdex) 카드 ID
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 같은 세트 안에서 카드 번호는 하나뿐이다 (seed 재실행 시 중복 방지, set_id 조회 인덱스 겸용)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cards_set_number ON cards (set_id, card_number);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards (name);

-- 4-5. 카드 시세 이력
CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  price       INTEGER NOT NULL CHECK (price >= 0),
  recorded_at DATE    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'admin' CHECK (source IN ('seed', 'admin', 'report', 'auto'))
);
CREATE INDEX IF NOT EXISTS idx_price_history_card_date ON price_history (card_id, recorded_at);

-- 4-6. 박스 시세 이력
-- 실시간 API 는 쓰지 않고, 네이버·다나와·카드샵 가격을 참고해 관리자가 대표 시세를 입력한다.
-- source: 참고한 곳의 분류 / source_url: 참고 페이지 / seller_name: 판매처 이름
CREATE TABLE IF NOT EXISTS box_price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id      INTEGER NOT NULL REFERENCES card_sets(id) ON DELETE CASCADE,
  price       INTEGER NOT NULL CHECK (price >= 0),
  recorded_at DATE    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'seed'
              CHECK (source IN ('seed', 'admin', 'naver-reference', 'danawa-reference', 'cardshop-reference', 'other')),
  source_url  TEXT,
  seller_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_box_price_history_set_date ON box_price_history (set_id, recorded_at);

-- 4-7. 찜
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, card_id)
);

-- 4-8. 게시글 (notice 는 관리자만 작성 — API 에서 검사)
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT    NOT NULL CHECK (category IN ('free', 'price', 'brag', 'notice')),
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  views      INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts (category, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_user_id          ON posts (user_id);

-- 4-9. 댓글 (게시글 삭제 시 함께 삭제)
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id);

-- 4-10. 거래가 제보 (선택 기능)
CREATE TABLE IF NOT EXISTS price_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price      INTEGER NOT NULL CHECK (price >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_price_reports_card_id ON price_reports (card_id);

-- 4-11. 내 포트폴리오 (선택 기능, 같은 카드 여러 행 허용)
CREATE TABLE IF NOT EXISTS portfolio (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id        INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio (user_id);
