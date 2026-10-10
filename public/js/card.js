(async()=> {
  const { api, initPage, replaceChildren, image, el, formatPrice, formatPriceChange, formatChange, formatDate, handleError } = BoxTick;
  await initPage({ active:'cards', hints:[{ key:'B', label:'도감으로', href:'/cards.html' }] });

  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('/cards.html'); return; }

  let card;
  try {
    card = (await api('/api/cards/' + encodeURIComponent(id))).card;
  } catch (err) {
    handleError(err);
    return;
  }

  document.title = card.name + ' · BoxTick';
  document.getElementById('card-subtitle').textContent = card.set_name + ' · ' + (card.card_number || '번호 없음');
  document.getElementById('card-name-head').textContent = card.name;
  document.getElementById('card-number-head').textContent = card.card_number || '-';
  document.getElementById('set-box-price').textContent = formatPrice(card.set_box_price);
  replaceChildren(document.getElementById('card-image'), image(card.image_url, card.name));
  replaceChildren(document.getElementById('card-tags'), [
    el('span', { class:'chip chip--sword' }, card.rarity || '미분류'),
    el('span', { class:'chip' }, card.set_name),
  ]);

  async function loadRange(range) {
    try {
      const data = await api('/api/cards/' + encodeURIComponent(id) + '/prices?range=' + range);
      document.getElementById('latest-date').textContent = formatDate(data.latest_recorded_at) || '-';
      document.getElementById('current-price').textContent = formatPrice(data.stats.current);

      const diff = formatPriceChange(data.stats.change);
      const change = formatChange(data.stats.change_rate);
      replaceChildren(
        document.getElementById('change-price'),
        el('span', { class:diff.className }, diff.text + ' (' + change.text + ')')
      );

      document.getElementById('max-price').textContent = formatPrice(data.stats.max);
      document.getElementById('min-price').textContent = formatPrice(data.stats.min);
      document.getElementById('avg-price').textContent = formatPrice(data.stats.avg);
      BoxTickMarketChart.render(document.getElementById('price-chart'), data.prices);
    } catch (err) {
      handleError(err);
    }
  }

  document.getElementById('range-select').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-range]');
    if (!button) return;
    for (const item of document.querySelectorAll('#range-select button')) {
      item.setAttribute('aria-pressed', String(item === button));
    }
    loadRange(button.dataset.range);
  });

  loadRange('1m');
})();