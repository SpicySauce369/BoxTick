// 관리자 회원·게시글 관리 화면 공용 (전역 BoxTickManage)
// 목록 상태는 주소(?status= / ?category= / ?q= / ?page=)에 두고, 행을 고르면 오른쪽 상세 패널을 채운다.
(function (root) {
  'use strict';
  const { el, replaceChildren, setText } = root.BoxTick;

  /** 주소의 목록 상태를 읽고, 바꾸고, 다시 쓰는 작은 저장소 */
  function urlState(keys) {
    const params = new URLSearchParams(location.search);
    const state = { page: Math.max(1, Number(params.get('page')) || 1) };
    for (const key of keys) state[key] = (params.get(key) || '').trim();

    return {
      state,
      /** 일부 값을 바꾸고 주소를 갱신한다. page 를 안 주면 1페이지로. */
      update(changes) {
        Object.assign(state, { page: 1 }, changes);
        const next = new URLSearchParams();
        for (const key of keys) if (state[key]) next.set(key, state[key]);
        if (state.page > 1) next.set('page', state.page);
        const qs = next.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
      },
    };
  }

  /** 알약 필터 버튼 묶음. options: [{ value, label }] */
  function renderFilter(target, options, current, onSelect) {
    replaceChildren(target, options.map((option) =>
      el('li', null, el('button', {
        type: 'button',
        'aria-pressed': String(option.value === current),
        onClick: () => onSelect(option.value),
      }, option.label))
    ));
  }

  /** 관리 목록의 한 행 (admin-catalog.css 의 admin-record 모양) */
  function recordButton({ title, meta, aside, asideClass, selected, onClick }) {
    return el('button', {
      type: 'button',
      class: 'admin-record' + (selected ? ' is-selected' : ''),
      'aria-pressed': String(Boolean(selected)),
      onClick,
    }, [
      el('span', { class: 'admin-record__main' }, [
        el('span', { class: 'admin-record__title' }, title),
        el('span', { class: 'admin-record__meta' }, meta),
      ]),
      el('span', { class: 'admin-record__aside' + (asideClass ? ' ' + asideClass : '') }, aside),
    ]);
  }

  /** 이전 / n / 전체 / 다음 */
  function renderPager({ prev, next, label }, page, total, size, onPage) {
    const last = Math.max(1, Math.ceil(total / size));
    prev.disabled = page <= 1;
    next.disabled = page >= last;
    setText(label, `${page} / ${last}`);
    prev.onclick = () => onPage(page - 1);
    next.onclick = () => onPage(page + 1);
    return last;
  }

  /** 모바일·태블릿(한 열)에서는 상세 패널로 스크롤해 준다 */
  function revealDetail(panel) {
    if (matchMedia('(max-width: 1024px)').matches) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  root.BoxTickManage = { urlState, renderFilter, recordButton, renderPager, revealDetail };
})(window);
