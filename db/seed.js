// npm run db:init — 스키마를 만들고 초기 관리자 계정을 생성한다.
// 카드·세트·시세·게시글 샘플 데이터는 해당 기능 구현 시 이 파일에 추가한다.
const { openDatabase, initSchema } = require('./database');
const { createUser } = require('./users');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const ADMIN_NICKNAME = process.env.ADMIN_NICKNAME || '관리자';

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
  db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedAdmin };
