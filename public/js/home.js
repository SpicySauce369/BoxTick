(async()=> {
  const { api, initPage, formatPrice, formatChange } = BoxTick;
  const orb = document.getElementById('home-orb');
  if (orb) {
    orb.addEventListener('click', () => {
      const on = orb.getAttribute('aria-pressed') !== 'true';
      orb.setAttribute('aria-pressed', String(on));
      orb.setAttribute('aria-label', on ? '볼 닫기' : '볼 열기');
    });
  }
  const user = await initPage({ hints: [{ key:'A', label:'선택' }, { key:'Y', label:'카드 검색', href:'/cards.html' }] });
  if (user?.role === 'admin') document.getElementById('admin-menu-item').hidden = false;
  try {
    const [sets, cards] = await Promise.all([api('/api/sets'), api('/api/cards?size=1')]);
    document.getElementById('card-count').textContent = cards.total;
    document.getElementById('set-count').textContent = sets.sets.length;
    const latest = sets.sets.find((s) => s.current_box_price != null);
    document.getElementById('latest-box-price').textContent = latest ? formatPrice(latest.current_box_price) : '-';
    const top = [...sets.sets].filter((s) => s.box_change_rate != null).sort((a,b) => Math.abs(b.box_change_rate) - Math.abs(a.box_change_rate))[0];
    if (top) {
      const change = formatChange(top.box_change_rate);
      document.getElementById('home-info').textContent = top.name + ' 박스가 정가 대비 ' + change.text + ' 변동 중이에요.';
    } else {
      document.getElementById('home-info').textContent = '샘플 시세 데이터를 확인해보세요.';
    }
  } catch (err) {
    BoxTick.handleError(err);
    document.getElementById('home-info').textContent = '데이터를 불러오지 못했습니다.';
  }
})();