// Tip and sales tax calculator for restaurants and shops in BC and Alberta,
// with prices in Canadian or US dollars.
// Tax: GST 5% everywhere; BC adds 7% PST on most goods (restaurant food is exempt).
// Tip: a share of the pre-tax price, 18% being the usual default.
(() => {
  const $ = id => document.getElementById(id);
  const input = $('tipInput'), sum = $('tipSum'), note = $('tipNote');
  const TAX = {
    BC: { meal: [['GST', 5]], shop: [['GST', 5], ['PST', 7]] },
    AB: { meal: [['GST', 5]], shop: [['GST', 5]] },
  };
  const TIPS = [0, 15, 18, 20];
  let place = 'BC', kind = 'meal', tip = 18, people = 1, cur = 'CAD';
  try { if (localStorage.getItem('tip.cur') === 'USD') cur = 'USD'; } catch {}

  // Default the region from today's place in the trip (Vancouver = BC, otherwise Alberta).
  try {
    const trip = JSON.parse(localStorage.getItem('trip.schedule') || 'null') || window.__sharedTrip;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
    const tz = trip?.timezones?.[today];
    if (tz === 'America/Edmonton') place = 'AB';
  } catch {}

  const dollars = n => (cur === 'USD' ? 'US$' : 'C$') + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const won = n => Math.round(n).toLocaleString('ko-KR') + '원';

  function renderTips() {
    const box = $('tipPct');
    box.innerHTML = '';
    for (const p of TIPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p ? p + '%' : '없음';
      b.classList.toggle('on', p === tip);
      b.onclick = () => { tip = p; renderTips(); update(); };
      box.appendChild(b);
    }
  }

  function row(label, value, cls = '') {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value;
    if (cls) { dt.className = cls; dd.className = cls; }
    sum.append(dt, dd);
  }

  function update() {
    document.querySelectorAll('#tipPlace button').forEach(b => b.classList.toggle('on', b.dataset.place === place));
    document.querySelectorAll('#tipKind button').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
    document.querySelectorAll('#tipCur button').forEach(b => b.classList.toggle('on', b.dataset.cur === cur));
    $('tipSym').textContent = cur === 'USD' ? 'US$' : 'C$';
    $('tipLabel').textContent = `메뉴 가격 합계 (세금 전, ${cur === 'USD' ? '미국 달러' : '캐나다 달러'})`;
    $('tipRow').hidden = kind !== 'meal';
    $('tipPeople').textContent = people;

    const price = Number(input.value.replace(/,/g, '')) || 0;
    const taxes = TAX[place][kind].map(([name, pct]) => [name, pct, price * pct / 100]);
    const taxTotal = taxes.reduce((a, t) => a + t[2], 0);
    const tipAmt = kind === 'meal' ? price * tip / 100 : 0;
    const total = price + taxTotal + tipAmt;
    const rate = window.FX?.rate(cur) || 0;

    sum.innerHTML = '';
    row('메뉴 가격', dollars(price));
    for (const [name, pct, amt] of taxes) row(`세금 ${name} ${pct}%`, dollars(amt));
    if (kind === 'meal') row(`팁 ${tip}%`, dollars(tipAmt));
    row('총 내는 돈', dollars(total), 'total');
    if (rate) row('', '약 ' + won(total * rate), 'won');
    if (people > 1) {
      row(`한 사람당 (${people}명)`, dollars(total / people));
      if (rate) row('', '약 ' + won(total / people * rate), 'won');
    }

    note.textContent = kind === 'meal'
      ? '카드 단말기에서 팁 %를 고르라고 나오면 위에서 고른 %를 누르면 돼요. 단말기는 세금 포함 금액에 %를 붙이기도 해서 금액이 조금 다를 수 있어요. 영수증에 "Gratuity"나 "Service charge"가 이미 있으면 팁을 또 낼 필요 없어요.'
      : place === 'BC'
        ? '밴쿠버(BC주) 쇼핑은 가격표에 세금이 빠져 있어서 계산할 때 12%가 더 붙어요.'
        : '앨버타주(로키, 캘거리)는 주 세금이 없어서 5%만 더 붙어요.';
  }

  input.addEventListener('input', () => {
    const raw = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    const [i, d] = raw.split('.');
    input.value = (i ? Number(i).toLocaleString('en-US') : '') + (d !== undefined ? '.' + d.slice(0, 2) : '');
    update();
  });
  document.querySelectorAll('#tipPlace button').forEach(b => { b.onclick = () => { place = b.dataset.place; update(); }; });
  document.querySelectorAll('#tipKind button').forEach(b => { b.onclick = () => { kind = b.dataset.kind; update(); }; });
  document.querySelectorAll('#tipCur button').forEach(b => {
    b.onclick = () => { cur = b.dataset.cur; try { localStorage.setItem('tip.cur', cur); } catch {} update(); };
  });
  $('tipMinus').onclick = () => { people = Math.max(1, people - 1); update(); };
  $('tipPlus').onclick = () => { people = Math.min(10, people + 1); update(); };
  document.addEventListener('fxchange', update);

  renderTips();
  update();
})();
