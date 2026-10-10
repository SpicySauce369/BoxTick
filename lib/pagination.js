const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * 쿼리스트링의 page / size 를 안전한 정수로 바꾼다.
 * 잘못된 값은 기본값으로 돌린다 (page 1, size 20, size 최대 100).
 */
function parsePagination(query, { defaultSize = DEFAULT_PAGE_SIZE } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawSize = Number.parseInt(query.size, 10) || defaultSize;
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));
  return { page, size, offset: (page - 1) * size };
}

/** LIKE 검색어의 %, _ , \ 를 이스케이프한다. SQL 에서 ESCAPE '\' 와 함께 쓴다. */
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

module.exports = { parsePagination, escapeLike, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
