/* =========================================================
   관리자 화면 공통 스크립트 (전역 BoxTickAdmin)
   common.js 다음에 불러온다.

   페이지 사용 예 (/admin/users.html):
     <body data-stage="neutral">
       <div id="site-header"></div>
       <main class="container admin-layout">
         <aside class="admin-sidebar" id="admin-sidebar"></aside>
         <section> … 페이지 내용 … </section>
       </main>
       <div id="site-footer"></div>
       <script>
         BoxTickAdmin.initAdminPage({ active: 'users' }).then((user) => { … });
       </script>
   ========================================================= */
(function (root) {
  'use strict';

  // 아이콘: 직접 그린 단순 선 SVG (게임 에셋 아님)
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    posts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M4 4h16v12H9l-5 4V4z"/></svg>',
    sets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/></svg>',
    'card-prices': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    'box-prices': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M3 9l9-4 9 4v9l-9 4-9-4V9z"/><path d="M8 14l3-3 2 2 3-3"/></svg>',
  };

  /**
   * 관리자 메뉴 (사이드바 순서 그대로).
   */
  const MENU = [
    {
      label: '운영',
      items: [
        { key: 'dashboard', label: '대시보드', href: '/admin/' },
        { key: 'users', label: '회원 관리', href: '/admin/users.html' },
        { key: 'posts', label: '게시글 관리', href: '/admin/posts.html' },
      ],
    },
    {
      label: '카탈로그 · 시세',
      items: [
        { key: 'sets', label: '세트 관리', href: '/admin/sets.html' },
        { key: 'cards', label: '카드 관리', href: '/admin/cards.html' },
        { key: 'card-prices', label: '카드 시세', href: '/admin/card-prices.html' },
        { key: 'box-prices', label: '박스 시세', href: '/admin/box-prices.html' },
      ],
    },
  ];

  /** 고정된 아이콘 문자열만 SVG 로 만든다 (사용자 입력은 여기에 오지 않는다). */
  function icon(key) {
    const span = document.createElement('span');
    span.className = 'admin-nav__icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = ICONS[key] || '';
    return span;
  }

  function renderSidebar(target, active) {
    const { el } = root.BoxTick;
    const groups = MENU.map((group) =>
      el('div', { class: 'admin-nav__group' }, [
        el('p', { class: 'admin-nav__group-label' }, group.label),
        el(
          'ul',
          { class: 'list' },
          group.items.map((item) =>
            el(
              'li',
              null,
              el('a', { class: 'list-row', href: item.href, 'aria-current': item.key === active ? 'page' : null }, [
                icon(item.key),
                el('span', { class: 'list-row__main' }, item.label),
              ])
            )
          )
        ),
      ])
    );

    root.BoxTick.replaceChildren(target, [
      el('p', { class: 'admin-sidebar__title' }, [el('span', { class: 'badge-admin' }, 'ADMIN'), '관리자 메뉴']),
      el('nav', { class: 'admin-nav', 'aria-label': '관리자 메뉴' }, groups),
    ]);
  }

  /**
   * 관리자 페이지 공통 초기화.
   * - 관리자가 아니면 common.js 의 initPage 가 로그인 페이지나 홈으로 보낸다.
   * - #admin-sidebar 에 메뉴를 그리고, 하단 조작 바를 붙인다.
   * options.active : MENU 의 key
   * options.hints  : 하단 조작 바 항목 (기본: B 사이트로)
   */
  async function initAdminPage({ active, hints } = {}) {
    const user = await root.BoxTick.initPage({
      auth: 'admin',
      hints: hints || [{ key: 'B', label: '사이트로', href: '/' }],
    });
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar) renderSidebar(sidebar, active);
    return user;
  }

  const BoxTickAdmin = { MENU, initAdminPage, renderSidebar };

  if (typeof module === 'object' && module.exports) {
    module.exports = BoxTickAdmin; // node:test 에서 메뉴 정의 확인용
  } else {
    root.BoxTickAdmin = BoxTickAdmin;
  }
})(typeof window !== 'undefined' ? window : globalThis);
