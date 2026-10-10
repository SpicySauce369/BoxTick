// 게시글 · 댓글 쿼리
const { escapeLike } = require('../lib/pagination');

const CATEGORIES = ['free', 'price', 'brag', 'notice'];

// 목록용 컬럼 (본문 제외) + 작성자 + 댓글 수
const LIST_COLUMNS = `
  p.id, p.category, p.title, p.views, p.created_at, p.updated_at,
  p.user_id AS author_id, u.nickname AS author_nickname,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count`;

/**
 * 게시글 목록. filters: { category?, q?, userId? }
 * q 는 제목·본문 부분 검색. 최신순.
 */
function listPosts(db, { category, q, userId } = {}, { size, offset }) {
  const where = [];
  const params = {};
  if (category) {
    where.push('p.category = @category');
    params.category = category;
  }
  if (q) {
    where.push("(p.title LIKE @q ESCAPE '\\' OR p.content LIKE @q ESCAPE '\\')");
    params.q = `%${escapeLike(q)}%`;
  }
  if (userId) {
    where.push('p.user_id = @userId');
    params.userId = userId;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM posts p ${whereSql}`).get(params);
  const posts = db
    .prepare(
      `SELECT ${LIST_COLUMNS}
         FROM posts p JOIN users u ON u.id = p.user_id
         ${whereSql}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: size, offset });
  return { posts, total };
}

function findPost(db, id) {
  return db
    .prepare(
      `SELECT ${LIST_COLUMNS}, p.content
         FROM posts p JOIN users u ON u.id = p.user_id
        WHERE p.id = ?`
    )
    .get(id);
}

function incrementViews(db, id) {
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
}

function createPost(db, { userId, category, title, content }) {
  const info = db
    .prepare('INSERT INTO posts (user_id, category, title, content) VALUES (?, ?, ?, ?)')
    .run(userId, category, title, content);
  return findPost(db, info.lastInsertRowid);
}

function updatePost(db, id, { category, title, content }) {
  db.prepare(
    `UPDATE posts
        SET category = ?, title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(category, title, content, id);
  return findPost(db, id);
}

/** 게시글 삭제. 댓글은 FK ON DELETE CASCADE 로 함께 지워진다. */
function deletePost(db, id) {
  return db.prepare('DELETE FROM posts WHERE id = ?').run(id).changes > 0;
}

const COMMENT_COLUMNS = `
  c.id, c.post_id, c.content, c.created_at,
  c.user_id AS author_id, u.nickname AS author_nickname`;

function listComments(db, postId) {
  return db
    .prepare(
      `SELECT ${COMMENT_COLUMNS}
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.post_id = ?
        ORDER BY c.created_at, c.id`
    )
    .all(postId);
}

function findComment(db, id) {
  return db
    .prepare(`SELECT ${COMMENT_COLUMNS} FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`)
    .get(id);
}

function createComment(db, { postId, userId, content }) {
  const info = db
    .prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(postId, userId, content);
  return findComment(db, info.lastInsertRowid);
}

function deleteComment(db, id) {
  return db.prepare('DELETE FROM comments WHERE id = ?').run(id).changes > 0;
}

module.exports = {
  CATEGORIES,
  listPosts,
  findPost,
  incrementViews,
  createPost,
  updatePost,
  deletePost,
  listComments,
  findComment,
  createComment,
  deleteComment,
};
