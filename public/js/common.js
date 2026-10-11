/* =========================================================
   BoxTick 공통 스크립트 (전역 BoxTick)
   - <head> 에서 defer 없이 불러오면 테마가 첫 화면부터 적용된다.
   - 사용자 입력(글·댓글·닉네임)은 innerHTML 로 넣지 않는다. el() / setText() 를 쓴다.

   페이지 사용 예:
     <body data-accent="shield">
       <div id="site-header"></div> <main>…</main> <div id="site-footer"></div>
       <script>
         BoxTick.initPage({ active: 'board', auth: 'login' }).then((user) => { … });
       </script>
   ========================================================= */
(function (root) {
  'use strict';

  const THEME_KEY = 'boxtick-theme';

  // 헤더 메뉴. href 는 페이지 담당이 파일을 만들면 그대로 연결된다.
  const NAV_ITEMS = [
    { key: 'cards', label: '카드 시세', href: '/cards.html' },
    { key: 'boxes', label: '박스 시세', href: '/boxes.html' },
    { key: 'board', label: '커뮤니티', href: '/board.html' },
  ];

  const FOOTER_LINES = [
    '본 사이트는 비공식 팬 프로젝트이며 The Pokémon Company, Nintendo, Game Freak, Creatures와 관련이 없습니다. 카드 이미지의 저작권은 각 권리자에게 있습니다.',
    '시세 데이터는 기능 구현 및 테스트를 위한 샘플 데이터이며 실제 거래 가격을 보장하지 않습니다.',
  ];

  /* ---------- 안전한 DOM 생성 ---------- */

  /**
   * 요소를 만든다. children 의 문자열·숫자는 텍스트 노드가 되므로 HTML 로 해석되지 않는다.
   *   el('a', { href: url, class: 'btn' }, '보기')
   *   el('li', null, [el('strong', null, nickname), ' 님'])
   * attrs: class, dataset(객체), on<Event>(함수), 나머지는 setAttribute. 값이 null/false 면 생략.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    append(node, children);
    return node;
  }

  function append(parent, children) {
    if (children === null || children === undefined || children === false) return parent;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return parent;
  }

  /** 요소의 내용을 텍스트로 바꾼다 (HTML 해석 없음). */
  function setText(target, text) {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (node) node.textContent = text === null || text === undefined ? '' : String(text);
    return node;
  }

  /** 요소의 자식을 모두 지우고 children 으로 채운다. */
  function replaceChildren(target, children) {
    target.replaceChildren();
    return append(target, children);
  }

  /** 꼭 문자열 HTML 을 조립해야 할 때만 사용. 기본은 el()/setText(). */
  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- 숫자 · 시세 표기 ---------- */

  /** 125000 → "125,000원", 값이 없으면 "-" */
  function formatPrice(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '-';
    return `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
  }

  /**
   * 등락률 표기. 색만으로 의미를 전달하지 않도록 ▲/▼ 기호를 함께 붙인다.
   *   formatChange(8.24) → { text: '▲ 8.2%', className: 'price-up', direction: 'up' }
   *   formatChange(-3)   → { text: '▼ 3.0%', className: 'price-down', direction: 'down' }
   *   formatChange(0)    → { text: '- 0.0%', className: 'price-flat', direction: 'flat' }
   */
  function formatChange(rate, { digits = 1, suffix = '%' } = {}) {
    if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) {
      return { text: '-', className: 'price-flat', direction: 'flat' };
    }
    const value = Number(rate);
    const abs = Math.abs(value).toFixed(digits);
    if (Number(abs) === 0) return { text: `- ${abs}${suffix}`, className: 'price-flat', direction: 'flat' };
    return value > 0
      ? { text: `▲ ${abs}${suffix}`, className: 'price-up', direction: 'up' }
      : { text: `▼ ${abs}${suffix}`, className: 'price-down', direction: 'down' };
  }

  /** 금액 차이 표기: 12000 → "▲ 12,000원" */
  function formatPriceChange(diff) {
    const change = formatChange(diff, { digits: 0, suffix: '' });
    if (change.direction === 'flat') return { ...change, text: change.text === '-' ? '-' : '- 0원' };
    return { ...change, text: `${change.text.slice(0, 2)}${formatPrice(Math.abs(diff))}` };
  }

  /** 등락 표시 요소를 만든다: <span class="price-up num">▲ 8.2%</span> */
  function changeBadge(rate, options) {
    const change = formatChange(rate, options);
    return el('span', { class: `${change.className} num` }, change.text);
  }

  /** "2026-10-10 14:20:00" 또는 ISO 문자열 → "2026.10.10" (withTime 이면 "2026.10.10 14:20") */
  function formatDate(value, { withTime = false } = {}) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return String(value);
    const [, y, m, d, hh, mm] = match;
    return withTime && hh ? `${y}.${m}.${d} ${hh}:${mm}` : `${y}.${m}.${d}`;
  }

  /* ---------- API ---------- */

  class ApiError extends Error {
    constructor(status, message, fields) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.fields = fields || {};
    }
  }

  /**
   * JSON API 호출. 실패하면 ApiError(status, message, fields) 를 던진다.
   *   const { posts } = await BoxTick.api('/api/posts?page=2');
   *   await BoxTick.api('/api/posts', { method: 'POST', body: { title, content } });
   */
  async function api(path, { method = 'GET', body, headers } = {}) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...headers } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(path, init);
    } catch {
      throw new ApiError(0, '서버에 연결할 수 없습니다.');
    }

    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) cachedUser = null; // 세션이 끊겼다
      throw new ApiError(response.status, (data && data.error) || '요청을 처리하지 못했습니다.', data && data.fields);
    }
    return data;
  }

  /* ---------- 인증 상태 ---------- */

  let cachedUser; // undefined = 아직 모름, null = 비로그인

  /** 로그인한 회원 또는 null. 한 페이지에서 한 번만 요청한다 (refresh 로 다시 요청). */
  async function getMe({ refresh = false } = {}) {
    if (cachedUser !== undefined && !refresh) return cachedUser;
    try {
      cachedUser = (await api('/api/auth/me')).user;
    } catch (err) {
      if (err.status !== 401) throw err;
      cachedUser = null;
    }
    return cachedUser;
  }

  /** 현재 주소를 next 로 붙인 로그인 페이지 주소 */
  function loginUrl() {
    const next = location.pathname + location.search;
    return `/login.html?next=${encodeURIComponent(next)}`;
  }

  /** 로그인 후 돌아갈 주소. 다른 사이트로 가는 값은 무시한다 (open redirect 방지). */
  function nextUrl(fallback = '/') {
    const next = new URLSearchParams(location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      cachedUser = null;
      location.href = '/';
    }
  }

  /* ---------- 테마 ---------- */

  function readTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.dispatchEvent(new CustomEvent('boxtick:themechange', { detail: { theme } }));
  }

  function setTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 저장 불가(사생활 보호 모드 등)여도 현재 화면에는 적용 */
    }
    applyTheme(theme);
  }

  function toggleTheme() {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  /** CSS 변수 값을 읽는다 (Chart.js 색을 테마에 맞출 때). */
  function cssVar(name) {
    return getComputedStyle(document.body || document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------- toast ---------- */

  function toast(message, type = 'info', { duration = 3000 } = {}) {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(region);
    }
    const node = el('div', { class: `toast toast--${type}` }, message);
    region.append(node);
    setTimeout(() => node.remove(), duration);
    return node;
  }

  /** ApiError 를 토스트로 보여주고, 401 이면 로그인 페이지로 보낸다. */
  function handleError(err) {
    if (err && err.status === 401) {
      toast('로그인이 필요합니다.', 'error');
      setTimeout(() => (location.href = loginUrl()), 600);
      return;
    }
    toast((err && err.message) || '오류가 발생했습니다.', 'error');
    if (!(err instanceof ApiError)) console.error(err);
  }

  /** 폼 필드 오류 표시: fields = { title: '제목을 입력해 주세요.' } → #title-error, [name=title] */
  function showFieldErrors(form, fields = {}) {
    for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    for (const box of form.querySelectorAll('.field-error')) box.textContent = '';
    for (const [name, message] of Object.entries(fields)) {
      const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
      if (input) input.setAttribute('aria-invalid', 'true');
      const box = form.querySelector(`#${CSS.escape(name)}-error`);
      if (box) box.textContent = message;
    }
  }

  /* ---------- modal ---------- */

  /** 확인 창. 확인을 누르면 true. await BoxTick.confirm('삭제할까요?', { danger: true }) */
  function confirmDialog(message, { okText = '확인', cancelText = '취소', danger = false } = {}) {
    return new Promise((resolve) => {
      const ok = el('button', { type: 'submit', value: 'ok', class: `btn ${danger ? 'btn--danger' : 'btn--accent'}` }, okText);
      const cancel = el('button', { type: 'submit', value: 'cancel', class: 'btn btn--secondary' }, cancelText);
      const dialog = el('dialog', { class: 'modal' }, [
        el('form', { method: 'dialog', class: 'modal__body' }, [
          el('p', null, message),
          el('div', { class: 'modal__actions' }, [cancel, ok]),
        ]),
      ]);
      dialog.addEventListener('close', () => {
        resolve(dialog.returnValue === 'ok');
        dialog.remove();
      });
      document.body.append(dialog);
      dialog.showModal();
      (danger ? cancel : ok).focus(); // 위험한 작업은 Enter 한 번에 실행되지 않도록 취소에 포커스
    });
  }

  /* ---------- header / footer ---------- */

  function renderHeader(target, { active, user }) {
    const nav = el(
      'nav',
      { class: 'site-nav', 'aria-label': '주 메뉴' },
      NAV_ITEMS.map((item) =>
        el('a', { href: item.href, 'aria-current': item.key === active ? 'page' : null }, item.label)
      )
    );

    const searchInput = el('input', {
      type: 'search',
      name: 'q',
      placeholder: '카드 검색',
      'aria-label': '카드 검색',
      autocomplete: 'off',
    });
    const presetQuery = active === 'cards' ? new URLSearchParams(location.search).get('q') : null;
    if (presetQuery) searchInput.value = presetQuery;
    const search = el('form', { class: 'site-search', action: '/cards.html', method: 'get', role: 'search' }, searchInput);

    const isDark = document.documentElement.dataset.theme === 'dark';
    const themeButton = el(
      'button',
      {
        type: 'button',
        class: 'theme-toggle',
        'aria-label': isDark ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기',
        onClick: () => {
          toggleTheme();
          const dark = document.documentElement.dataset.theme === 'dark';
          themeButton.textContent = dark ? '☀' : '☾';
          themeButton.setAttribute('aria-label', dark ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기');
        },
      },
      isDark ? '☀' : '☾'
    );

    const actions = el('div', { class: 'site-actions' }, [themeButton]);
    if (user) {
      if (user.role === 'admin') {
        actions.append(el('a', { href: '/admin/', class: 'badge-admin', title: '관리자 페이지' }, 'ADMIN'));
      }
      actions.append(
        el('a', { href: '/mypage.html', class: 'site-user', title: '마이페이지' }, user.nickname),
        el('button', { type: 'button', class: 'btn btn--ghost', onClick: logout }, '로그아웃')
      );
    } else {
      actions.append(
        el('a', { href: loginUrl(), class: 'btn btn--ghost' }, '로그인'),
        el('a', { href: '/register.html', class: 'btn btn--accent' }, '회원가입')
      );
    }

    const logo = el('a', { href: '/', class: 'site-logo', 'aria-label': 'BoxTick 홈' }, [
      el('span', { class: 'site-logo__mark', 'aria-hidden': 'true' }),
      el('span', null, ['Box', el('span', { class: 'site-logo__tick' }, 'Tick')]),
    ]);

    const header = el('header', { class: 'site-header' }, el('div', { class: 'container site-header__inner' }, [logo, nav, search, actions]));
    target.replaceWith(header);
    return header;
  }

  function renderFooter(target) {
    const footer = el(
      'footer',
      { class: 'site-footer' },
      el('div', { class: 'container' }, [
        el('p', { class: 'site-footer__name' }, 'BoxTick — 포켓몬카드 시세 & 커뮤니티'),
        ...FOOTER_LINES.map((line) => el('p', null, line)),
      ])
    );
    target.replaceWith(footer);
    return footer;
  }

  /**
   * 화면 맨 아래 검정 조작 안내 바. 게임의 "Ⓐ 결정  Ⓑ 돌아가기" 자리.
   * hints: [{ key: 'A', label: '결정' }, { key: 'B', label: '돌아가기', onClick }, { key: 'Y', label: '글쓰기', href }]
   * href/onClick 이 있으면 실제로 누를 수 있는 버튼·링크가 된다.
   */
  /**
   * A 의 기본 동작: 포커스된 링크·버튼을 누르고, 없으면 화면에서 선택 표시된 항목을 연다.
   * (카드 목록의 검정 알약 행, 메인 메뉴의 선택된 원 등 — 페이지 코드를 고치지 않아도 동작)
   */
  function activateSelection() {
    const active = document.activeElement;
    if (active && active !== document.body && active.matches('a[href], button:not([disabled])') && !active.closest('.control-bar')) {
      active.click();
      return true;
    }
    const selected = document.querySelector(
      'main .is-selected, main [aria-current="page"]:not(.site-nav a), main [aria-selected="true"]'
    );
    const target = selected && (selected.matches('a[href], button') ? selected : selected.querySelector('a[href], button'));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }

  /** 하단 바 항목 하나의 실행: href → 이동, onClick → 호출, 둘 다 없고 A 면 선택 항목 열기 */
  function runHint(hint) {
    if (hint.href) location.href = hint.href;
    else if (hint.onClick) hint.onClick();
    else if (String(hint.key).toUpperCase() === 'A') activateSelection();
  }

  /** 눌린 키에 해당하는 안내 항목을 찾는다 (대소문자 무시, A·B·X·Y 만). */
  function findHint(hints, key) {
    const upper = String(key || '').toUpperCase();
    if (!['A', 'B', 'X', 'Y'].includes(upper)) return null;
    return hints.find((hint) => String(hint.key).toUpperCase() === upper) || null;
  }

  /** 글자를 입력 중이면 단축키를 쓰지 않는다. */
  function isTyping(target) {
    return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  /**
   * 화면 맨 아래 검정 조작 안내 바. 게임의 "Ⓐ 결정  Ⓑ 돌아가기" 자리.
   * hints: [{ key: 'A', label: '결정' }, { key: 'B', label: '돌아가기', onClick }, { key: 'Y', label: '글쓰기', href }]
   * 모든 항목은 마우스로 누를 수 있고, 키보드의 같은 글자 키로도 실행된다.
   */
  function renderControlBar(hints) {
    const items = hints.map((hint) => {
      const content = [el('span', { class: 'key', 'aria-hidden': 'true' }, hint.key), hint.label];
      const attrs = { class: 'control-hint', 'aria-keyshortcuts': hint.key };
      if (hint.href) return el('a', { ...attrs, href: hint.href }, content);
      return el('button', { ...attrs, type: 'button', onClick: () => runHint(hint) }, content);
    });

    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      const hint = findHint(hints, event.key);
      if (!hint) return;
      event.preventDefault();
      runHint(hint);
    });

    return el('nav', { class: 'control-bar', 'aria-label': '조작 안내' }, el('div', { class: 'container control-bar__inner' }, items));
  }

  /* ---------- 방향키로 항목 이동 ---------- */

  // 방향키로 옮겨 다닐 "메뉴 항목": 목록 행, 원형 메뉴, 관리 목록 행, 알약 버튼
  const NAV_ITEMS_SELECTOR = [
    'main .list-row',
    'main .circle-item',
    'main .admin-record',
    'main .round-select a',
    'main .round-select button',
  ].join(', ');

  const DIRECTIONS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };

  /**
   * from 위치에서 dir 방향으로 가장 가까운 후보의 번호를 고른다 (없으면 -1).
   * 위치는 화면 좌표의 중심점 { x, y }. 진행 방향 거리 + 옆으로 벗어난 거리 ×2 가 작은 쪽이 가깝다.
   * → 세로 목록에서는 바로 위·아래, 격자(원형 메뉴)에서는 같은 열·같은 줄을 먼저 고른다.
   */
  function pickNext(from, candidates, dir) {
    let best = -1;
    let bestScore = Infinity;
    candidates.forEach((point, index) => {
      const dx = point.x - from.x;
      const dy = point.y - from.y;
      const forward = dx * dir.x + dy * dir.y;
      if (forward <= 4) return; // 그 방향에 있지 않은 항목
      const side = Math.abs(dir.x ? dy : dx);
      const score = forward + side * 2;
      if (score < bestScore) {
        bestScore = score;
        best = index;
      }
    });
    return best;
  }

  function centerOf(node) {
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function visibleNavItems() {
    return [...document.querySelectorAll(NAV_ITEMS_SELECTOR)].filter((node) => {
      if (node.disabled || node.closest('[hidden]')) return false;
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function moveFocus(event) {
    const dir = DIRECTIONS[event.key];
    if (!dir || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isTyping(event.target) || document.querySelector('dialog[open]')) return;

    const items = visibleNavItems();
    if (!items.length) return;
    const active = document.activeElement;
    const hasFocus = active && active !== document.body && !active.closest('.control-bar, .site-header');

    // 아직 아무것도 고르지 않았다면: 지금 선택된 항목(없으면 첫 항목)에 먼저 자리를 잡는다
    if (!hasFocus) {
      const start = items.find((node) => node.matches('.is-selected, [aria-current="page"], [aria-pressed="true"]')) || items[0];
      event.preventDefault();
      start.focus();
      return;
    }

    const others = items.filter((node) => node !== active);
    const index = pickNext(centerOf(active), others.map(centerOf), dir);
    if (index < 0) return; // 그 방향에 항목이 없으면 원래대로 화면만 스크롤
    event.preventDefault();
    const target = others[index];
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * Tab · 방향키로 포커스가 옮겨 가면, 같은 묶음 안의 '선택 표시'(.is-selected)도 따라 옮긴다.
   * → 화면에 선택된 항목이 하나만 보이고, 그 항목이 곧 A 키로 열릴 항목이 된다.
   * (선택 표시가 없는 묶음은 CSS :focus-visible 이 같은 모양을 그린다. 관리 목록의 선택은 클릭으로만)
   */
  function followFocus(event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches('main .circle-item, main .list-row')) return;
    if (target.classList.contains('is-selected')) return;
    const group = target.closest('ul, ol');
    const marked = group && group.querySelector(':scope > li > .is-selected');
    if (marked) {
      marked.classList.remove('is-selected');
      target.classList.add('is-selected');
    }
  }

  /** 입력칸에서 Esc → 입력칸을 빠져나와 방향키 · ABXY 를 바로 쓸 수 있게 한다 (입력한 글자는 그대로) */
  function leaveInput(event) {
    if (event.key !== 'Escape' || !isTyping(event.target) || event.target.closest('dialog')) return;
    event.preventDefault(); // 검색칸(type=search)의 기본 Esc 동작(입력값 지우기)을 막는다
    event.target.blur();
  }

  let arrowNavInstalled = false;
  function installArrowNav() {
    if (arrowNavInstalled) return;
    arrowNavInstalled = true;
    document.addEventListener('keydown', moveFocus);
    document.addEventListener('keydown', leaveInput);
    document.addEventListener('focusin', followFocus);
  }

  /* ---------- 처음 접속 안내 (ABXY 조작 튜토리얼) ---------- */

  const TUTORIAL_KEY = 'boxtick-tutorial-seen';

  function showTutorialOnce() {
    try {
      if (localStorage.getItem(TUTORIAL_KEY)) return;
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      return; // 저장할 수 없는 환경에서는 매번 띄우지 않도록 생략
    }
    const rows = [
      ['↕', '방향키', '항목 이동 (← → 도 가능)'],
      ['A', 'A 키', '선택한 항목 열기 · 결정'],
      ['B', 'B 키', '돌아가기'],
      ['X', 'X 키', '화면마다 다른 기능 (아래 바 참고)'],
      ['Y', 'Y 키', '검색 · 바로가기 (아래 바 참고)'],
    ];
    const close = el('button', { type: 'submit', class: 'btn btn--primary' }, '알겠어요');
    const dialog = el('dialog', { class: 'modal tutorial', 'aria-labelledby': 'tutorial-title' }, [
      el('form', { method: 'dialog', class: 'modal__body' }, [
        el('h2', { id: 'tutorial-title', class: 'tutorial__title' }, '키보드로도 조작할 수 있어요'),
        el('p', { class: 'text-muted text-small' }, '게임처럼 방향키로 고르고 A · B · X · Y 키를 눌러 보세요. 화면 아래 검정 바의 버튼을 눌러도 똑같이 동작해요.'),
        el('ul', { class: 'tutorial__keys' }, rows.map(([key, name, label]) =>
          el('li', null, [el('span', { class: 'key', 'aria-hidden': 'true' }, key), el('span', null, [el('strong', null, name), ' ' + label])]))),
        el('div', { class: 'modal__actions' }, close),
      ]),
    ]);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
  }

  /** 자주 쓰는 안내: 뒤로 가기 */
  const HINT_BACK = { key: 'B', label: '돌아가기', onClick: () => history.back() };

  /**
   * 페이지 공통 초기화. 로그인한 회원(또는 null)을 돌려준다.
   * options.active : 헤더에서 강조할 메뉴 ('cards' | 'boxes' | 'board')
   * options.auth   : 'login' 이면 비로그인 시 로그인 페이지로, 'admin' 이면 관리자만 (아니면 홈으로)
   * options.hints  : 하단 조작 안내 바 항목 (renderControlBar 참고). 없으면 바를 그리지 않는다.
   */
  async function initPage({ active, auth, hints } = {}) {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }

    let user = null;
    try {
      user = await getMe();
    } catch (err) {
      handleError(err);
    }

    const headerSlot = document.getElementById('site-header');
    if (headerSlot) renderHeader(headerSlot, { active, user });
    const footerSlot = document.getElementById('site-footer');
    const footer = footerSlot ? renderFooter(footerSlot) : null;
    if (hints && hints.length) {
      installArrowNav();
      const bar = renderControlBar(hints);
      if (footer) footer.before(bar);
      else document.body.append(bar);
    }

    if ((auth === 'login' || auth === 'admin') && !user) {
      location.replace(loginUrl());
      return new Promise(() => {}); // 이동하는 동안 페이지 코드가 실행되지 않게 멈춘다
    }
    if (auth === 'admin' && user.role !== 'admin') {
      toast('관리자만 접근할 수 있습니다.', 'error');
      setTimeout(() => location.replace('/'), 800);
      return new Promise(() => {});
    }
    // 튜토리얼은 권한 검사를 통과해 이 페이지에 머무를 때만 띄운다
    // (로그인 페이지로 바로 넘어가는 경우 '본 것'으로 기록되지 않도록)
    if (hints && hints.length) showTutorialOnce();
    return user;
  }

  /* ---------- 이미지 ---------- */

  /** 카드·박스 이미지. 주소가 없거나 불러오지 못하면 자리표시로 바꾼다. */
  function image(src, alt, { className = '' } = {}) {
    const placeholder = () => el('div', { class: `img-placeholder ${className}`.trim(), role: 'img', 'aria-label': alt }, '이미지 없음');
    if (!src) return placeholder();
    const img = el('img', { src, alt, loading: 'lazy', class: className || null });
    img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
    return img;
  }

  /* ---------- 내보내기 ---------- */

  const BoxTick = {
    el,
    append,
    setText,
    replaceChildren,
    escapeHtml,
    formatPrice,
    formatChange,
    formatPriceChange,
    changeBadge,
    formatDate,
    ApiError,
    api,
    getMe,
    loginUrl,
    nextUrl,
    logout,
    setTheme,
    toggleTheme,
    cssVar,
    toast,
    handleError,
    showFieldErrors,
    confirm: confirmDialog,
    image,
    renderControlBar,
    findHint,
    isTyping,
    pickNext,
    HINT_BACK,
    initPage,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = BoxTick; // node:test 에서 순수 함수 테스트용
  } else {
    root.BoxTick = BoxTick;
    applyTheme(readTheme()); // 첫 화면부터 저장된 테마 적용 (깜빡임 방지)
  }
})(typeof window !== 'undefined' ? window : globalThis);
