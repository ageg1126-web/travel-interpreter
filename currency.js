// Canadian or US dollar <-> Korean won converter. Rates come from free keyless
// sources and are cached so it still works offline with the last rates.
(() => {
  const $ = id => document.getElementById(id);
  const input = $('fxInput'), output = $('fxOutput'), info = $('fxRateInfo'), manual = $('fxManual');
  const CACHE = 'fx.rates';
  const NAMES = { CAD: '캐나다 달러', USD: '미국 달러' };
  const QUICK = { USD: [5, 10, 20, 50, 100], KRW: [10000, 50000, 100000, 500000] };
  QUICK.CAD = QUICK.USD;
  // rates: won per one dollar of each currency.
  let rates = {}, updated = null, cur = 'CAD', from = 'CAD', lastTry = 0;

  // Each source returns won per CAD and per USD.
  const sources = [
    async () => {
      const d = await getJson('https://open.er-api.com/v6/latest/CAD');
      return { CAD: d.rates.KRW, USD: d.rates.KRW / d.rates.USD, updated: d.time_last_update_unix * 1000 };
    },
    async () => {
      const d = await getJson('https://api.frankfurter.app/latest?from=CAD&to=KRW,USD');
      return { CAD: d.rates.KRW, USD: d.rates.KRW / d.rates.USD, updated: Date.parse(d.date) };
    },
    async () => {
      const d = await getJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cad.json');
      return { CAD: d.cad.krw, USD: d.cad.krw / d.cad.usd, updated: Date.parse(d.date) };
    },
  ];
  async function getJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const manualKey = c => (c === 'CAD' ? 'fx.manual' : 'fx.manual.' + c);
  const manualRate = c => {
    try { return Number((localStorage.getItem(manualKey(c)) || '').replace(/,/g, '')) || 0; } catch { return 0; }
  };
  const rateOf = c => manualRate(c) || rates[c] || 0;

  async function loadRate() {
    lastTry = Date.now();
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c) { rates = c.rates; updated = c.updated; }
      // Older versions cached only the Canadian rate.
      const old = JSON.parse(localStorage.getItem('fx.cadkrw') || 'null');
      if (!rates.CAD && old) { rates.CAD = old.rate; updated = old.updated; }
    } catch {}
    update();
    for (const src of sources) {
      try {
        const r = await src();
        if (!(r.CAD > 0 && r.USD > 0)) continue;
        rates = { CAD: r.CAD, USD: r.USD }; updated = r.updated || Date.now();
        try { localStorage.setItem(CACHE, JSON.stringify({ rates, updated })); } catch {}
        break;
      } catch (e) { console.warn('[fx]', e); }
    }
    update();
    document.dispatchEvent(new Event('fxchange'));
  }

  // Shared with the AI helper and the tip calculator.
  window.FX = {
    async get() {
      if (!rates.CAD || Date.now() - lastTry > 30 * 60e3) await loadRate();
      return { rate: rateOf('CAD'), usd: rateOf('USD'), updated, manual: !!manualRate('CAD') };
    },
    rate: rateOf,
  };

  const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const dollars = n => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function update() {
    const r = rateOf(cur);
    const amount = Number(input.value.replace(/,/g, '')) || 0;
    if (!r) {
      output.textContent = '—';
      info.textContent = '환율을 불러오지 못했어요. 인터넷 연결을 확인하거나 아래에 환율을 직접 넣어 주세요.';
      return;
    }
    output.textContent = from === 'KRW' ? dollars(amount / r) : won(amount * r);
    const when = updated ? new Date(updated).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '';
    info.textContent = manualRate(cur)
      ? `직접 넣은 환율: 1 ${NAMES[cur]} = ${won(r)}`
      : `1 ${NAMES[cur]} = ${won(r)} · ${when} 기준 (실제 카드 결제 금액은 수수료 때문에 조금 더 나와요)`;
  }

  function renderDirection() {
    const dollarLabel = `${NAMES[cur]} ${cur}`;
    $('fxFromLabel').textContent = from === 'KRW' ? '원 KRW' : dollarLabel;
    $('fxToLabel').textContent = from === 'KRW' ? dollarLabel : '원 KRW';
    $('fxFromSym').textContent = from === 'KRW' ? '₩' : '$';
    $('fxManualLabel').textContent = '1 ' + NAMES[cur];
    manual.value = manualRate(cur) ? String(manualRate(cur)) : '';
    document.querySelectorAll('#fxCur button').forEach(b => b.classList.toggle('on', b.dataset.cur === cur));
    const q = $('fxQuick');
    q.innerHTML = '';
    for (const v of QUICK[from]) {
      const b = document.createElement('button');
      b.textContent = from === 'KRW' ? (v / 10000) + '만원' : '$' + v;
      b.onclick = () => { input.value = v.toLocaleString('en-US'); update(); };
      q.appendChild(b);
    }
    update();
  }

  input.addEventListener('input', () => {
    // Keep digits and one decimal point; show thousands separators as you type.
    const raw = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    const [i, d] = raw.split('.');
    input.value = (i ? Number(i).toLocaleString('en-US') : '') + (d !== undefined ? '.' + d : '');
    update();
  });
  manual.addEventListener('input', () => {
    try { localStorage.setItem(manualKey(cur), manual.value); } catch {}
    update();
    document.dispatchEvent(new Event('fxchange'));
  });
  $('fxSwap').onclick = () => {
    const r = rateOf(cur);
    const amount = Number(input.value.replace(/,/g, '')) || 0;
    const next = from === 'KRW' ? cur : 'KRW';
    if (amount && r) input.value = (next === 'KRW' ? Math.round(amount * r) : +(amount / r).toFixed(2)).toLocaleString('en-US');
    from = next;
    renderDirection();
  };
  document.querySelectorAll('#fxCur button').forEach(b => {
    b.onclick = () => {
      cur = b.dataset.cur;
      if (from !== 'KRW') from = cur;
      try { localStorage.setItem('fx.cur', cur); } catch {}
      renderDirection();
    };
  });

  try { const c = localStorage.getItem('fx.cur'); if (NAMES[c]) cur = from = c; } catch {}
  renderDirection();
  loadRate();
})();
