(async()=> {
  const { api, initPage, el, replaceChildren, formatPrice, formatChange, formatDate, handleError } = BoxTick;
  await initPage({ active:'boxes', hints:[{ key:'A', label:'상세 보기' }, { key:'B', label:'홈', href:'/' }] });

  const list = document.getElementById('box-list');

  try {
    const data = await api('/api/sets');
    document.getElementById('box-count').textContent = data.sets.length + ' BOXES';

    function select(set, row) {
      for (const node of list.querySelectorAll('.list-row')) node.classList.remove('is-selected');
      if (row) row.classList.add('is-selected');

      document.getElementById('box-preview-name').textContent = set.name;
      document.getElementById('box-preview-date').textContent = formatDate(set.latest_box_price_at) || '-';
      document.getElementById('box-current-price').textContent = formatPrice(set.current_box_price);
      document.getElementById('box-retail-price').textContent = formatPrice(set.box_price);

      const change = formatChange(set.box_change_rate);
      replaceChildren(document.getElementById('box-change-rate'), el('span', { class:change.className }, change.text));
      document.getElementById('box-packs').textContent = set.packs_per_box ? set.packs_per_box + '팩' : '-';
      document.getElementById('box-pack-price').textContent = formatPrice(set.pack_price);

      const link = document.getElementById('box-preview-link');
      link.href = '/box.html?id=' + set.id;
      link.removeAttribute('aria-disabled');
    }

    const children = data.sets.length
      ? data.sets.map((set, index) => el('li', null,
          el('a', {
            href:'/box.html?id=' + set.id,
            class:'list-row' + (index === 0 ? ' is-selected' : ''),
            onMouseenter:(event) => select(set, event.currentTarget),
            onFocus:(event) => select(set, event.currentTarget),
          }, [
            el('span', { class:'list-row__main' }, set.name),
            el('span', { class:'list-row__aside' }, formatPrice(set.current_box_price)),
          ])
        ))
      : el('li', { class:'empty-state' }, '등록된 박스가 없습니다.');

    replaceChildren(list, children);
    if (data.sets[0]) select(data.sets[0], list.querySelector('.list-row'));
  } catch (err) {
    handleError(err);
    replaceChildren(list, el('li', { class:'empty-state' }, '박스 정보를 불러오지 못했습니다.'));
  }
})();