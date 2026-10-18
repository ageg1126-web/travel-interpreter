// Weather for the places on the trip (Open-Meteo, free and keyless) with a
// simple Korean tip on what to wear. The last result is kept for offline use.
(() => {
  const $ = id => document.getElementById(id);
  const CITIES = [
    { id: 'van', name: '밴쿠버', lat: 49.2827, lon: -123.1207, july: '7월 평균 아침 13°C, 낮 22°C' },
    { id: 'squ', name: '스쿼미시', lat: 49.7016, lon: -123.1558, july: '7월 평균 아침 11°C, 낮 25°C · 곤돌라 정상은 더 서늘해요' },
    { id: 'jas', name: '재스퍼', lat: 52.8737, lon: -118.0814, july: '7월 평균 아침 8°C, 낮 23°C' },
    { id: 'ice', name: '아이스필드', lat: 52.2193, lon: -117.2257, july: '7월에도 빙하 위는 0~10°C, 바람이 세요', cold: true },
    { id: 'llo', name: '레이크 루이스', lat: 51.4254, lon: -116.1773, july: '7월 평균 아침 4°C, 낮 21°C · 이른 아침은 쌀쌀해요' },
    { id: 'bnf', name: '밴프', lat: 51.1784, lon: -115.5708, july: '7월 평균 아침 7°C, 낮 22°C' },
    { id: 'cgy', name: '캘거리', lat: 51.0447, lon: -114.0719, july: '7월 평균 아침 10°C, 낮 23°C' },
  ];
  // Where they are on each trip day.
  const BY_DATE = { '2027-07-18': 'van', '2027-07-19': 'squ', '2027-07-20': 'jas', '2027-07-21': 'ice', '2027-07-22': 'llo', '2027-07-23': 'bnf', '2027-07-24': 'cgy' };
  const CODES = [
    [[0], '맑음'], [[1], '대체로 맑음'], [[2], '구름 조금'], [[3], '흐림'], [[45, 48], '안개'],
    [[51, 53, 55, 56, 57], '이슬비'], [[61, 63, 66, 80, 81], '비'], [[65, 67, 82], '강한 비'],
    [[71, 73, 75, 77, 85, 86], '눈'], [[95, 96, 99], '천둥번개'],
  ];
  const desc = c => (CODES.find(([cs]) => cs.includes(c)) || [0, '—'])[1];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' });
  let city = BY_DATE[today] || 'van';

  function tips(cur, days, c) {
    const d = days[0], out = [];
    const low = Math.min(d.min, cur?.feels ?? d.min);
    if (c.cold || low < 5) out.push('두꺼운 패딩이나 경량 패딩에 장갑까지 챙기세요.');
    else if (low < 12) out.push('아침저녁엔 쌀쌀해요. 경량 패딩이나 플리스를 꼭 챙기세요.');
    else if (low < 17) out.push('얇은 겉옷이나 가디건 하나 챙기세요.');
    if (d.max >= 26) out.push('낮엔 더워요. 반팔에 물을 자주 드세요.');
    if (d.rain >= 50) out.push('비 올 확률이 높아요. 우비나 우산을 챙기세요.');
    else if (d.rain >= 30) out.push('비가 올 수도 있어요. 접이식 우산이 있으면 좋아요.');
    if (d.uv >= 6) out.push('햇볕이 강해요. 선글라스, 모자, 선크림을 챙기세요.');
    if (cur?.wind >= 30) out.push('바람이 세요. 모자가 날아가지 않게 조심하세요.');
    if (!out.length) out.push('다니기 좋은 날씨예요. 편한 신발이면 충분해요.');
    return out;
  }

  function renderCities() {
    const box = $('wxCities');
    box.innerHTML = '';
    for (const c of CITIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.name;
      b.classList.toggle('on', c.id === city);
      b.onclick = () => { city = c.id; renderCities(); load(); };
      box.appendChild(b);
    }
  }

  function render(data, c, offline) {
    const body = $('wxBody');
    const cur = data.current && { t: data.current.temperature_2m, feels: data.current.apparent_temperature, code: data.current.weather_code, wind: data.current.wind_speed_10m };
    const days = data.daily.time.map((t, i) => ({
      date: t, code: data.daily.weather_code[i], max: data.daily.temperature_2m_max[i], min: data.daily.temperature_2m_min[i],
      rain: data.daily.precipitation_probability_max?.[i] ?? 0, uv: data.daily.uv_index_max?.[i] ?? 0,
    }));
    const r = Math.round;
    const dayName = t => new Date(t + 'T12:00').toLocaleDateString('ko-KR', { weekday: 'short', month: 'numeric', day: 'numeric' });
    body.innerHTML = `
      <div class="wx-now"><div class="wx-temp">${r(cur.t)}°</div>
        <div><div class="wx-desc">${desc(cur.code)}</div><div class="muted small">체감 ${r(cur.feels)}° · 오늘 ${r(days[0].min)}° / ${r(days[0].max)}° · 비 ${days[0].rain}%</div></div></div>
      <ul class="wx-tips">${tips(cur, days, c).map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="wx-days">${days.slice(1).map(d => `<div><b>${dayName(d.date)}</b><span>${desc(d.code)}</span><span>${r(d.min)}° / ${r(d.max)}°</span><span class="muted">비 ${d.rain}%</span></div>`).join('')}</div>
      <p class="muted small">${c.july}${offline ? ' · 인터넷이 안 돼서 마지막으로 받은 날씨예요' : ''}</p>`;
  }

  async function load() {
    const c = CITIES.find(x => x.id === city);
    const body = $('wxBody');
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('wx.' + c.id) || 'null'); } catch {}
    if (cached) render(cached, c, true); else body.innerHTML = '<p class="muted">날씨 불러오는 중…</p>';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
      + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max'
      + '&timezone=auto&forecast_days=4';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (city !== c.id) return;
      try { localStorage.setItem('wx.' + c.id, JSON.stringify(data)); } catch {}
      render(data, c, false);
    } catch (e) {
      console.warn('[weather]', e);
      if (!cached && city === c.id) body.innerHTML = `<p class="muted">날씨를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p><p class="muted small">${c.july}</p>`;
    }
  }

  renderCities();
  // Load when the weather tool is first shown, not on every app start.
  const maybeLoad = () => { if (!document.querySelector('#tab-tools [data-tool=weather]').hidden && !document.getElementById('tab-tools').hidden) load(); };
  document.addEventListener('toolchange', maybeLoad);
  document.addEventListener('tabchange', maybeLoad);
  maybeLoad();
})();
