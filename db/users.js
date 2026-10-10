const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 10;

// 응답에 내보내도 되는 컬럼만 (password_hash 제외)
const PUBLIC_COLUMNS = 'id, username, nickname, role, status, created_at';

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function findById(db, id) {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
}

/** 로그인 검증용: password_hash 를 포함해 반환한다. 외부로 내보내지 말 것. */
function findByUsernameWithHash(db, username) {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE username = ?`).get(username);
}

async function createUser(db, { username, password, nickname, role = 'user' }) {
  const passwordHash = await hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)')
    .run(username, passwordHash, nickname, role);
  return findById(db, info.lastInsertRowid);
}

function toPublicUser(user) {
  const { password_hash: _omit, ...rest } = user;
  return rest;
}

module.exports = {
  BCRYPT_ROUNDS,
  PUBLIC_COLUMNS,
  hashPassword,
  findById,
  findByUsernameWithHash,
  createUser,
  toPublicUser,
};
