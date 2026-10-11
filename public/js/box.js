(async()=> {
  const { api, initPage, replaceChildren, el, formatPrice, formatChange, formatDate, handleError } = BoxTick;
  await initPage({ active:'boxes', hints:[{ key:'B', label:'박스 목록', href:'/boxes.html' }] });

  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!id) { location.replace('/boxes.html'); return; }

  let allSets, box;
  try {
    [allSets, box] = await Promise.all([api('/api/sets'), api('/api/sets/' + id)]);
    box = box.set;
  } catch (err) {
    handleError(err);
    return;
  }

  document.title = box.name + ' · BoxTick';
  document.getElementById('box-subtitle').textContent = box.name + ' · ' + box.card_count + ' cards';
  document.getElementById('box-name-head').textContent = box.name;
  document.getElementById('box-date-head').textContent = formatDate(box.latest_box_price_at) || '-';
  document.getElementById('box-latest-date').textContent = formatDate(box.latest_box_price_at) || '-';
  document.getElementById('box-step-name').textContent = box.name;
  document.getElementById('box-current').textContent = formatPrice(box.current_box_price);
  document.getElementById('box-retail').textContent = formatPrice(box.box_price);

  const rate = formatChange(box.box_change_rate);
  replaceChildren(document.getElementById('box-rate'), el('span', { class:rate.className }, rate.text));
  document.getElementById('box-pack-count').textContent = box.packs_per_box ? box.packs_per_box + '팩' : '-';
  document.getElementById('box-pack-retail').textContent = formatPrice(box.pack_price);
  document.getElementById('box-history-count').textContent = box.box_prices.length + ' RECORDS';

  BoxTickMarketChart.render(document.getElementById('box-price-chart'), box.box_prices);

  const sourceLabel = (source) => ({
    seed:'샘플',
    admin:'관리자',
    'naver-reference':'네이버 참고',
    'danawa-reference':'다나와 참고',
    'cardshop-reference':'카드샵 참고',
    other:'기타',
  }[source] || source);

  replaceChildren(
    document.getElementById('box-history-body'),
    box.box_prices.map((price) => el('tr', null, [
      el('td', null, formatDate(price.recorded_at)),
      el('td', { class:'num' }, formatPrice(price.price)),
      el('td', null, sourceLabel(price.source)),
      el('td', null, price.seller_name || '-'),
    ]))
  );

  const index = allSets.sets.findIndex((set) => set.id === box.id);
  const navigate = (offset) => {
    const target = allSets.sets[(index + offset + allSets.sets.length) % allSets.sets.length];
    location.href = '/box.html?id=' + target.id;
  };

  document.getElementById('prev-box').addEventListener('click', () => navigate(-1));
  document.getElementById('next-box').addEventListener('click', () => navigate(1));
})();