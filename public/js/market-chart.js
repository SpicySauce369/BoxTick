(function(root){
  'use strict';
  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }
  function render(target, items, { dateKey = 'recorded_at', valueKey = 'price' } = {}) {
    target.replaceChildren();
    if (!items || !items.length) {
      target.append(BoxTick.el('div', { class:'empty-state' }, '표시할 시세 기록이 없습니다.'));
      return;
    }
    const width = 760, height = 260, pad = { l:54, r:18, t:24, b:44 };
    const values = items.map((item) => Number(item[valueKey]));
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min = min * 0.95; max = max * 1.05 || 1; }
    const span = max - min || 1;
    const x = (index) => pad.l + (width - pad.l - pad.r) * (items.length === 1 ? 0.5 : index / (items.length - 1));
    const y = (value) => pad.t + (height - pad.t - pad.b) * (1 - (value - min) / span);
    const svg = svgEl('svg', { viewBox:'0 0 ' + width + ' ' + height, role:'img', 'aria-label':'시세 변화 그래프' });

    for (let i = 0; i < 4; i += 1) {
      const yy = pad.t + (height - pad.t - pad.b) * i / 3;
      svg.append(svgEl('line', { x1:pad.l, y1:yy, x2:width-pad.r, y2:yy, class:'market-chart__grid' }));
      const value = Math.round(max - (span * i / 3));
      const label = svgEl('text', { x:pad.l-8, y:yy+4, 'text-anchor':'end', class:'market-chart__label' });
      label.textContent = BoxTick.formatPrice(value).replace('원','');
      svg.append(label);
    }

    const points = items.map((item, index) => [x(index), y(Number(item[valueKey]))]);
    svg.append(svgEl('polyline', { points:points.map((point)=>point.join(',')).join(' '), class:'market-chart__line' }));

    points.forEach(([px, py], index) => {
      const circle = svgEl('circle', { cx:px, cy:py, r:5, class:'market-chart__point' });
      const title = svgEl('title');
      title.textContent = BoxTick.formatDate(items[index][dateKey]) + ' · ' + BoxTick.formatPrice(items[index][valueKey]);
      circle.append(title);
      svg.append(circle);
    });

    const first = svgEl('text', { x:pad.l, y:height-14, class:'market-chart__label' });
    first.textContent = BoxTick.formatDate(items[0][dateKey]);
    const last = svgEl('text', { x:width-pad.r, y:height-14, 'text-anchor':'end', class:'market-chart__label' });
    last.textContent = BoxTick.formatDate(items[items.length - 1][dateKey]);
    svg.append(first, last);
    target.append(svg);
  }
  root.BoxTickMarketChart = { render };
})(window);