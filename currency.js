// Canadian dollar <-> Korean won converter. The rate is fetched from free
// keyless sources and cached so it still works offline with the last rate.
(() => {
  const $ = id => document.getElementById(id);
  const input = $('fxInput'), output = $('fxOutput'), info = $('fxRateInfo'), manual = $('fxManual');
  const CACHE = 'fx.cadkrw';
  const QUICK = { CAD: [5, 10, 20, 50, 100], KRW: [10000, 50000, 100000, 500000] };
  let rate = null, updated = null, from = 'CAD';

  const sources = [
    async () => {
      const d = await getJson('https://open.er-api.com/v6/latest/CAD');
      return { rate: d.rates.KRW, updated: d.time_last_update_unix * 1000 };
    },
    async () => {
      const d = await getJson('https://api.frankfurter.app/latest?from=CAD&to=KRW');
      return { rate: d.rates.KRW, updated: Date.parse(d.date) };
    },
    async () => {
      const d = await getJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cad.json');
      return { rate: d.cad.krw, updated: Date.parse(d.date) };
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

  async function loadRate() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c) { rate = c.rate; updated = c.updated; }
    } catch {}
    try { manual.value = localStorage.getItem('fx.manual') || ''; } catch {}
    update();
    for (const src of sources) {
      try {
        const r = await src();
        if (!(r.rate > 0)) continue;
        rate = r.rate; updated = r.updated || Date.now();
        try { localStorage.setItem(CACHE, JSON.stringify({ rate, updated })); } catch {}
        break;
      } catch (e) { console.warn('[fx]', e); }
    }
    update();
  }

  const currentRate = () => Number(manual.value.replace(/,/g, '')) || rate;
  const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const cad = n => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function update() {
    const r = currentRate();
    const amount = Number(input.value.replace(/,/g, '')) || 0;
    if (!r) {
      output.textContent = '—';
      info.textContent = '환율을 불러오지 못했어요. 인터넷 연결을 확인하거나 아래에 환율을 직접 넣어 주세요.';
      return;
    }
    output.textContent = from === 'CAD' ? won(amount * r) : cad(amount / r);
    const when = updated ? new Date(updated).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '';
    info.textContent = manual.value
      ? `직접 넣은 환율: 1달러 = ${won(r)}`
      : `1 캐나다 달러 = ${won(r)} · ${when} 기준 (실제 카드 결제 금액은 수수료 때문에 조금 더 나와요)`;
  }

  function renderDirection() {
    $('fxFromLabel').textContent = from === 'CAD' ? '🇨🇦 캐나다 달러' : '🇰🇷 원';
    $('fxToLabel').textContent = from === 'CAD' ? '🇰🇷 원' : '🇨🇦 캐나다 달러';
    $('fxFromSym').textContent = from === 'CAD' ? '$' : '₩';
    const q = $('fxQuick');
    q.innerHTML = '';
    for (const v of QUICK[from]) {
      const b = document.createElement('button');
      b.textContent = from === 'CAD' ? '$' + v : (v / 10000) + '만원';
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
    try { localStorage.setItem('fx.manual', manual.value); } catch {}
    update();
  });
  $('fxSwap').onclick = () => {
    const r = currentRate();
    const amount = Number(input.value.replace(/,/g, '')) || 0;
    from = from === 'CAD' ? 'KRW' : 'CAD';
    if (amount && r) input.value = (from === 'KRW' ? Math.round(amount * r) : +(amount / r).toFixed(2)).toLocaleString('en-US');
    renderDirection();
  };

  renderDirection();
  loadRate();
})();
