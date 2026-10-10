const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'boxtick.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * SQLite 연결을 연다. dbPath 에 ':memory:' 를 주면 메모리 DB (테스트용).
 */
function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/** schema.sql 을 실행해 테이블을 만든다. 이미 있으면 그대로 둔다. */
function initSchema(db) {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

module.exports = { openDatabase, initSchema, DEFAULT_DB_PATH };
