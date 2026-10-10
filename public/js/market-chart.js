(function(root){
  'use strict';
  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  // 눈금 간격을 1·2·2.5·5 × 10^n 으로 맞춘다 (9,167 같은 어정쩡한 숫자 방지)
  function niceStep(raw) {
    const power = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const unit = raw / power;
    const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
    return nice * power;
  }

  function draw(target, items, { dateKey, valueKey }) {
    target.replaceChildren();
    if (!items || !items.length) {
      target.append(BoxTick.el('div', { class:'empty-state' }, '표시할 시세 기록이 없습니다.'));
      return;
    }
    // 화면에 보이는 폭 그대로 그린다. viewBox 를 줄여 쓰지 않으므로 모바일에서도 글자 크기가 유지된다.
    const width = Math.max(240, Math.round(target.clientWidth || 760));
    const narrow = width < 520;
    const height = narrow ? 220 : 260;
    const pad = { l: narrow ? 50 : 60, r: narrow ? 12 : 18, t: 20, b: 40 };

    const values = items.map((item) => Number(item[valueKey]));
    const lo = Math.min(...values), hi = Math.max(...values);
    const step = niceStep((hi - lo || hi * 0.1 || 1) / 3);
    let min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
    if (min === max) { min -= step; max += step; }
    const span = max - min;
    const x = (index) => pad.l + (width - pad.l - pad.r) * (items.length === 1 ? 0.5 : index / (items.length - 1));
    const y = (value) => pad.t + (height - pad.t - pad.b) * (1 - (value - min) / span);
    const svg = svgEl('svg', { viewBox:'0 0 ' + width + ' ' + height, width, height, role:'img', 'aria-label':'시세 변화 그래프' });

    for (let value = max; value >= min - step / 2; value -= step) {
      const yy = y(value);
      svg.append(svgEl('line', { x1:pad.l, y1:yy, x2:width-pad.r, y2:yy, class:'market-chart__grid' }));
      const label = svgEl('text', { x:pad.l-8, y:yy+4, 'text-anchor':'end', class:'market-chart__label' });
      label.textContent = BoxTick.formatPrice(value).replace('원','');
      svg.append(label);
    }

    // 선 색: 기간 동안 올랐으면 상승색, 내렸으면 하락색 (디자인서 8장)
    const trend = values[values.length - 1] - values[0];
    const lineColor = trend > 0 ? 'var(--price-up)' : trend < 0 ? 'var(--price-down)' : 'var(--text-muted)';
    const points = items.map((item, index) => [x(index), y(Number(item[valueKey]))]);
    const line = svgEl('polyline', { points:points.map((point)=>point.join(',')).join(' '), class:'market-chart__line' });
    line.style.stroke = lineColor;
    svg.append(line);

    points.forEach(([px, py], index) => {
      const circle = svgEl('circle', { cx:px, cy:py, r: narrow ? 4 : 5, class:'market-chart__point' });
      const title = svgEl('title');
      title.textContent = BoxTick.formatDate(items[index][dateKey]) + ' · ' + BoxTick.formatPrice(items[index][valueKey]);
      circle.append(title);
      svg.append(circle);
    });

    const first = svgEl('text', { x:pad.l, y:height-12, class:'market-chart__label' });
    first.textContent = BoxTick.formatDate(items[0][dateKey]);
    const last = svgEl('text', { x:width-pad.r, y:height-12, 'text-anchor':'end', class:'market-chart__label' });
    last.textContent = BoxTick.formatDate(items[items.length - 1][dateKey]);
    svg.append(first, last);
    target.append(svg);
  }

  // 컨테이너 폭이 바뀌면(회전·창 크기 변경) 같은 데이터로 다시 그린다.
  const observed = new WeakMap();
  function render(target, items, { dateKey = 'recorded_at', valueKey = 'price' } = {}) {
    const state = { items, options: { dateKey, valueKey }, width: target.clientWidth };
    const isNew = !observed.has(target);
    observed.set(target, state);
    draw(target, items, state.options);
    if (isNew && 'ResizeObserver' in root) {
      new ResizeObserver(() => {
        const current = observed.get(target);
        if (Math.abs(target.clientWidth - current.width) < 8) return;
        current.width = target.clientWidth;
        draw(target, current.items, current.options);
      }).observe(target);
    }
  }
  root.BoxTickMarketChart = { render };
})(window);
