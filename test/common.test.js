// public/js/common.js 의 순수 함수(표기·이스케이프) 테스트
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const BoxTick = require('../public/js/common.js');

describe('가격 · 등락 표기', () => {
  it('가격은 천 단위 쉼표와 원 단위를 붙이고, 값이 없으면 "-"', () => {
    assert.equal(BoxTick.formatPrice(125000), '125,000원');
    assert.equal(BoxTick.formatPrice(0), '0원');
    assert.equal(BoxTick.formatPrice('9800'), '9,800원');
    assert.equal(BoxTick.formatPrice(null), '-');
    assert.equal(BoxTick.formatPrice(undefined), '-');
    assert.equal(BoxTick.formatPrice('abc'), '-');
  });

  it('상승은 ▲ + price-up, 하락은 ▼ + price-down 으로 색과 기호를 함께 쓴다', () => {
    assert.deepEqual(BoxTick.formatChange(8.24), { text: '▲ 8.2%', className: 'price-up', direction: 'up' });
    assert.deepEqual(BoxTick.formatChange(-3), { text: '▼ 3.0%', className: 'price-down', direction: 'down' });
  });

  it('변동이 없거나 반올림해서 0 이면 보합, 값이 없으면 "-"', () => {
    assert.equal(BoxTick.formatChange(0).direction, 'flat');
    assert.equal(BoxTick.formatChange(0.04).direction, 'flat');
    assert.equal(BoxTick.formatChange(null).text, '-');
  });

  it('금액 차이는 ▲/▼ 와 원 단위로 표기한다', () => {
    assert.equal(BoxTick.formatPriceChange(12000).text, '▲ 12,000원');
    assert.equal(BoxTick.formatPriceChange(-500).text, '▼ 500원');
    assert.equal(BoxTick.formatPriceChange(0).text, '- 0원');
    assert.equal(BoxTick.formatPriceChange(null).text, '-');
  });

  it('날짜를 화면 형식으로 바꾼다', () => {
    assert.equal(BoxTick.formatDate('2026-10-10 14:20:00'), '2026.10.10');
    assert.equal(BoxTick.formatDate('2026-10-10 14:20:00', { withTime: true }), '2026.10.10 14:20');
    assert.equal(BoxTick.formatDate('2026-10-01'), '2026.10.01');
    assert.equal(BoxTick.formatDate(null), '');
  });
});

describe('escapeHtml', () => {
  it('HTML 특수문자를 모두 이스케이프한다', () => {
    assert.equal(
      BoxTick.escapeHtml(`<img src=x onerror="alert('x')">&`),
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'
    );
    assert.equal(BoxTick.escapeHtml(null), '');
  });
});

describe('조작 키 (ABXY)', () => {
  const hints = [{ key: 'A', label: '결정' }, { key: 'B', label: '돌아가기', href: '/' }, { key: 'Y', label: '검색' }];

  it('대소문자와 상관없이 같은 글자의 안내 항목을 찾는다', () => {
    assert.equal(BoxTick.findHint(hints, 'b').label, '돌아가기');
    assert.equal(BoxTick.findHint(hints, 'Y').label, '검색');
  });

  it('안내에 없는 키나 ABXY 이외의 키는 무시한다', () => {
    assert.equal(BoxTick.findHint(hints, 'x'), null);
    assert.equal(BoxTick.findHint(hints, 'Enter'), null);
    assert.equal(BoxTick.findHint(hints, 'c'), null);
  });

  it('입력칸에서 글을 쓰는 중이면 단축키로 보지 않는다', () => {
    assert.equal(BoxTick.isTyping({ tagName: 'INPUT' }), true);
    assert.equal(BoxTick.isTyping({ tagName: 'TEXTAREA' }), true);
    assert.equal(BoxTick.isTyping({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(BoxTick.isTyping({ tagName: 'A' }), false);
  });
});
