// 게시판 화면(board · post · write) 공용: 카테고리 표기, 작성자 아바타
(function (root) {
  'use strict';
  const { el } = root.BoxTick;

  // 서버 CATEGORIES(db/posts.js) 와 같은 순서
  const CATEGORIES = [
    { key: 'free', label: '자유', chip: '' },
    { key: 'price', label: '시세 정보', chip: 'chip--signal' },
    { key: 'brag', label: '개봉 자랑', chip: 'chip--shield' },
    { key: 'notice', label: '공지', chip: 'chip--sword' },
  ];
  const byKey = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

  function categoryLabel(key) {
    return byKey[key] ? byKey[key].label : key;
  }

  function categoryChip(key) {
    const info = byKey[key];
    return el('span', { class: ('chip board-chip ' + (info ? info.chip : '')).trim() }, info ? info.label : key);
  }

  // Y-COMM 프로필처럼 닉네임 첫 글자를 원 안에 넣는다.
  // 색은 회원 번호로 고른다 (닉네임을 바꿔도 같은 색, 번호가 이어지므로 고르게 나뉜다)
  const AVATAR_COLORS = 4;
  function avatar(nickname, userId, { size = '' } = {}) {
    const color = Math.abs(Number(userId) || 0) % AVATAR_COLORS;
    return el('span', {
      class: `board-avatar board-avatar--c${color} ${size ? 'board-avatar--' + size : ''}`.trim(),
      'aria-hidden': 'true',
    }, Array.from(String(nickname || '?'))[0]);
  }

  /** 글 상세 주소 */
  function postUrl(id) {
    return '/post.html?id=' + encodeURIComponent(id);
  }

  root.BoxTickBoard = { CATEGORIES, categoryLabel, categoryChip, avatar, postUrl };
})(window);
