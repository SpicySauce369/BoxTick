(async()=> {
  const { api, initPage, el, replaceChildren, formatPrice, formatDate, image, handleError } = BoxTick;
  await initPage({ active:'cards', hints:[{ key:'A', label:'상세 보기' }, { key:'B', label:'홈', href:'/' }] });

  const form = document.getElementById('card-filter');
  const list = document.getElementById('card-list');
  const params = new URLSearchParams(location.search);
  form.q.value = params.get('q') || '';
  form.rarity.value = params.get('rarity') || '';
  let page = Math.max(1, Number(params.get('page')) || 1);
  let cards = [];

  try {
    const sets = await api('/api/sets');
    for (const set of sets.sets) {
      document.getElementById('set-filter').append(el('option', { value:set.id }, set.name));
    }
    form.set.value = params.get('set') || '';
  } catch (err) {
    handleError(err);
  }

  function select(card, row) {
    for (const node of list.querySelectorAll('.list-row')) node.classList.remove('is-selected');
    if (row) row.classList.add('is-selected');
    document.getElementById('preview-number').textContent = card.card_number || '-';
    document.getElementById('preview-name').textContent = card.name;
    document.getElementById('preview-price').textContent = formatPrice(card.current_price);
    document.getElementById('preview-set').textContent = card.set_name;
    document.getElementById('preview-date').textContent = formatDate(card.latest_price_at) || '-';
    replaceChildren(document.getElementById('preview-image'), image(card.image_url, card.name));
    replaceChildren(document.getElementById('preview-chips'), [
      el('span', { class:'chip chip--sword' }, card.rarity || '미분류'),
      el('span', { class:'chip' }, card.set_name),
    ]);
    const link = document.getElementById('preview-link');
    link.href = '/card.html?id=' + card.id;
    link.removeAttribute('aria-disabled');
  }

  async function load() {
    replaceChildren(list, el('li', { class:'loading-state' }, '카드를 불러오는 중입니다.'));
    const query = new URLSearchParams();
    if (form.q.value.trim()) query.set('q', form.q.value.trim());
    if (form.set.value) query.set('set', form.set.value);
    if (form.rarity.value) query.set('rarity', form.rarity.value);
    query.set('page', page);
    query.set('size', '10');

    try {
      const data = await api('/api/cards?' + query.toString());
      cards = data.cards;
      document.getElementById('result-count').textContent = data.total + ' CARDS';
      const maxPage = Math.max(1, Math.ceil(data.total / data.size));
      document.getElementById('page-label').textContent = data.page + ' / ' + maxPage;
      document.getElementById('prev-page').disabled = data.page <= 1;
      document.getElementById('next-page').disabled = data.page * data.size >= data.total;

      const children = cards.length
        ? cards.map((card, index) => el('li', null,
            el('a', {
              class:'list-row' + (index === 0 ? ' is-selected' : ''),
              href:'/card.html?id=' + card.id,
              onMouseenter:(event) => select(card, event.currentTarget),
              onFocus:(event) => select(card, event.currentTarget),
            }, [
              el('span', { class:'list-row__main' }, [
                el('strong', null, card.name),
                el('span', { class:'text-small text-muted' }, ' · ' + (card.rarity || '-') + ' · ' + card.set_name),
              ]),
              el('span', { class:'list-row__aside' }, formatPrice(card.current_price)),
            ])
          ))
        : el('li', { class:'empty-state' }, '조건에 맞는 카드가 없습니다.');
      replaceChildren(list, children);

      if (cards[0]) select(cards[0], list.querySelector('.list-row'));
      history.replaceState(null, '', '/cards.html?' + query.toString());
    } catch (err) {
      handleError(err);
      replaceChildren(list, el('li', { class:'empty-state' }, '카드를 불러오지 못했습니다.'));
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); page = 1; load(); });
  document.getElementById('prev-page').addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  document.getElementById('next-page').addEventListener('click', () => { page += 1; load(); });
  load();
})();