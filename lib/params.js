/** URL 경로의 :id 를 양의 정수로 바꾼다. 형식이 맞지 않으면 null (→ 404 처리). */
function parseId(raw) {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

module.exports = { parseId };
