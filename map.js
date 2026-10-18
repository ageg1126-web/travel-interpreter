// 지도: today's places from the schedule, each with a short guide we checked
// against official sources (spots.json), directions through the Google Maps
// app, an address card to show a driver, and restaurants nearby.
// Without a Google key (or offline) the same places show as a list.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = n => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY_COLORS = ['#00696B', '#2F6FC9', '#7356D1', '#B23A73', '#E8603F', '#A66300', '#3E7D32', '#6B7774'];
  const tab = $('tab-map');
  let data = null, model = [];
  const st = { day: null, note: '', view: 'list', mapState: 'none', sel: 1, me: null };

  // ---------- data ----------
  async function loadData() {
    try { const r = await fetch('spots.json', { cache: 'no-cache' }); if (r.ok) data = await r.json(); } catch {}
  }
  function build() {
    const items = window.Trip?.items() || [];
    const byDate = {};
    for (const it of items) (byDate[it.date] ||= []).push(it);
    const dates = Object.keys(byDate).sort();
    model = dates.map(date => {
      const stops = [], other = [];
      for (const it of Trip.sortDay(byDate[date])) {
        const link = data?.links?.[it.id];
        if (link && link.match === it.place) {
          for (const id of link.spots) if (data.spots[id]) stops.push({ id, s: data.spots[id], it, date });
        } else if (data?.routes?.[it.id] && it.place) other.push({ it, kind: 'route' });
        else if (it.type === 'activity' && it.place) other.push({ it, kind: link ? 'changed' : 'unlinked' });
      }
      stops.forEach((x, i) => { x.n = i + 1; });
      return { date, no: Trip.daysBetween(dates[0], date) + 1, stops, other };
    }).filter(d => d.stops.length || d.other.length);
  }
  const dayOf = date => model.find(d => d.date === date);
  function pickToday() {
    const today = Trip.todayIn(Trip.currentTz());
    if (dayOf(today)) return { date: today, note: '' };
    const next = model.find(d => d.date > today);
    if (next) return { date: next.date, note: model[0] && today < model[0].date ? '아직 여행 전이에요. 1일차를 보여 드려요.' : '오늘은 지도에 표시할 곳이 없어요. 다음 날을 보여 드려요.' };
    return { date: model[model.length - 1]?.date, note: '' };
  }
  const md = date => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };
  const wd = date => { const [y, m, d] = date.split('-').map(Number); return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
  // "스탠리 파크로", "멀린 캐니언으로": pick 로/으로 from the last syllable.
  const toward = w => {
    const c = w.trim().slice(-1).charCodeAt(0);
    if (c < 0xAC00 || c > 0xD7A3) return w + '(으)로';
    const jong = (c - 0xAC00) % 28;
    return w + (jong === 0 || jong === 8 ? '로' : '으로');
  };
  const hasPin = s => typeof s.lat === 'number' && typeof s.lng === 'number';
  function km(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const distText = k => (k < 1 ? `${Math.max(10, Math.round(k * 100) * 10)}m` : `${k < 10 ? k.toFixed(1) : Math.round(k)}km`);

  // ---------- Google Maps URLs (no key needed) ----------
  function dirUrl(dest, placeId, mode) {
    const p = new URLSearchParams({ api: '1', destination: dest, travelmode: mode });
    if (placeId) p.set('destination_place_id', placeId);
    return 'https://www.google.com/maps/dir/?' + p;
  }
  function searchUrl(q, placeId) {
    const p = new URLSearchParams({ api: '1', query: q });
    if (placeId) p.set('query_place_id', placeId);
    return 'https://www.google.com/maps/search/?' + p;
  }
  function openOut(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- screen ----------
  tab.innerHTML = `
    <div class="gmap" id="gmap" hidden></div>
    <header class="map-head"><h1>지도</h1><button type="button" class="pill" id="mapToggle" hidden></button></header>
    <nav class="map-days" id="mapDays" aria-label="날짜"></nav>
    <div class="map-ctrl" id="mapCtrl" hidden>
      <div class="grp glass"><button type="button" id="mapList">${svg('note')}<span>목록</span></button></div>
      <div class="grp glass"><button type="button" id="mapZoomIn" aria-label="크게 보기"><b>＋</b><span>크게</span></button><button type="button" id="mapZoomOut" aria-label="작게 보기"><b>－</b><span>작게</span></button></div>
      <div class="grp glass"><button type="button" id="mapMe">${svg('pin')}<span>내 위치</span></button></div>
    </div>
    <main class="map-list" id="mapMain"></main>
    <div class="map-cards" id="mapCards" hidden>
      <div class="pager glass"><button type="button" id="cardPrev" aria-label="앞 장소">${svg('back')}</button><span id="cardPos"></span><button type="button" id="cardNext" aria-label="다음 장소">${svg('chevron')}</button></div>
      <div class="car" id="carousel"></div>
    </div>
    <div class="map-toast" id="mapToast" hidden></div>
    <section class="sheet-page" id="spotPage" hidden></section>
    <section class="sheet-page" id="foodPage" hidden></section>`;

  function toast(text) {
    const t = $('mapToast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  function renderDays() {
    const nav = $('mapDays');
    const today = Trip.todayIn(Trip.currentTz());
    const chips = [`<button type="button" data-day="today"${st.dayIsToday ? ' class="sel"' : ''}>오늘</button>`]
      .concat(model.map(d => `<button type="button" data-day="${d.date}"${!st.dayIsToday && st.day === d.date ? ' class="sel"' : ''}${d.date === today ? ' data-today' : ''}>${d.no}일차<small>${md(d.date)} ${wd(d.date)}</small></button>`))
      .concat(st.view === 'map' ? [`<button type="button" data-day="all"${st.day === 'all' ? ' class="sel"' : ''}>전체</button>`] : []);
    nav.innerHTML = chips.join('');
    nav.querySelector('.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    nav.onclick = e => {
      const b = e.target.closest('[data-day]'); if (!b) return;
      if (b.dataset.day === 'today') { const p = pickToday(); st.day = p.date; st.note = p.note; st.dayIsToday = true; }
      else { st.day = b.dataset.day; st.note = ''; st.dayIsToday = false; }
      st.sel = 1;
      render();
    };
  }

  const kick = x => (x.s.kind === 'train-view' ? '기차 창밖으로 봐요' : `${x.n}번째 장소`);
  function card(x, { full }) {
    const s = x.s;
    const noPin = st.view === 'map' && !hasPin(s);
    return `<article class="sc${x.n === st.sel ? ' sel' : ''}" data-n="${x.n}">
      <div class="sc-top"><span class="num shape">${x.n}</span><div class="sc-name"><div class="kick">${esc(kick(x))}</div><h3>${esc(s.ko)}</h3><div class="en">${esc(s.local)}</div></div></div>
      ${full && s.about ? `<p>${esc(s.about)}</p>` : ''}
      ${noPin ? '<div class="tag-row"><span class="tag2 warn">위치 확인 중 · 지도에 아직 없어요</span></div>' : ''}
      <div class="btns"><button type="button" class="tonal" data-act="spot">설명 보기</button>${s.kind === 'train-view' ? '' : `<button type="button" class="primary" data-act="go">${svg('pin')}길찾기</button>`}</div>
    </article>`;
  }
  function otherRow(o) {
    const it = o.it;
    if (o.kind === 'route') return `<div class="orow"><span class="num shape plain">${svg('bus')}</span><div><b>${esc(it.title)}</b><small>${esc(data.routes[it.id])} · ${esc(it.memo || '')}</small></div></div>`;
    const why = o.kind === 'changed' ? '일정에서 장소가 바뀌어서 확인이 필요해요' : '지도 설명이 아직 없는 일정이에요';
    return `<div class="orow"><span class="num shape plain">${svg('note')}</span><div><b>${esc(it.title)}</b><small>${why}</small></div><button type="button" class="pill sm" data-search="${esc(it.place)}">Google 지도</button></div>`;
  }

  function notices() {
    const out = [];
    if (st.note) out.push(`<div class="map-note">${esc(st.note)}</div>`);
    if (!navigator.onLine) out.push(`<div class="map-banner warn">${svg('note')}<div><b>인터넷이 안 돼요</b><small>지도와 식당은 연결되면 다시 보여요. 저장된 설명은 볼 수 있어요.</small></div></div>`);
    else if (st.mapState === 'nokey') out.push(`<div class="map-banner">${svg('key')}<div><b>Google 지도를 보려면 키가 필요해요</b><small>설정에서 키를 넣으면 지도가 나와요. 설명과 길찾기는 지금도 쓸 수 있어요.</small></div><button type="button" class="pill sm" data-goto="settings">설정</button></div>`);
    else if (st.mapState === 'error') out.push(`<div class="map-banner warn">${svg('note')}<div><b>지도를 불러오지 못했어요</b><small>키 설정이나 인터넷을 확인해 주세요. 설명과 길찾기는 쓸 수 있어요.</small></div><button type="button" class="pill sm" id="mapRetry">다시 시도</button></div>`);
    return out.join('');
  }

  function renderList() {
    const main = $('mapMain');
    const days = st.day === 'all' ? model : [dayOf(st.day)].filter(Boolean);
    main.innerHTML = notices() + days.map(d => `
      <section class="map-day" data-date="${d.date}"><h2>${d.no}일차 <span class="muted">${esc(Trip.dayLabel(d.date))}</span></h2>
        ${d.stops.map(x => card(x, { full: true })).join('')}
        ${d.other.map(otherRow).join('')}
      </section>`).join('') + (data ? '' : '<p class="muted">장소 정보를 불러오지 못했어요. 인터넷 연결 뒤 다시 열어 주세요.</p>');
    main.onclick = onAction;
  }

  function stopsNow() { return st.day === 'all' ? model.flatMap(d => d.stops) : (dayOf(st.day)?.stops || []); }
  function find(date, n) { return dayOf(date)?.stops.find(x => x.n === n); }

  function onAction(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.goto) { document.querySelector(`.tabbar [data-tab="more"]`).click(); document.querySelector(`[data-go="${b.dataset.goto}"]`)?.click(); return; }
    if (b.id === 'mapRetry') { st.mapState = 'none'; start(); return; }
    if (b.dataset.search) { openOut(searchUrl(b.dataset.search)); return; }
    const c = b.closest('.sc'); if (!c) return;
    const x = find(c.closest('[data-date]')?.dataset.date || st.day, +c.dataset.n);
    if (!x) return;
    if (b.dataset.act === 'spot') openSpot(x);
    if (b.dataset.act === 'go') chooseMode(x);
  }

  // ---------- Google map view ----------
  let gmap = null, markers = [], Marker = null;
  async function ensureMap() {
    if (gmap) return gmap;
    await Places.load();
    const { Map } = await google.maps.importLibrary('maps');
    ({ AdvancedMarkerElement: Marker } = await google.maps.importLibrary('marker'));
    gmap = new Map($('gmap'), {
      mapId: Places.mapId(), center: { lat: 51.2, lng: -118.5 }, zoom: 6,
      disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', keyboardShortcuts: false,
    });
    return gmap;
  }
  function pinEl(x, color, label) {
    const el = document.createElement('div');
    el.className = 'mp' + (x.n === st.sel && st.day !== 'all' ? ' sel' : '') + (st.day === 'all' ? ' dot' : '');
    el.style.setProperty('--c', color || 'var(--primary)');
    el.innerHTML = `<div class="h">${label ?? x.n}</div><div class="t"></div><div class="nm">${esc(x.s.ko.split(' · ')[0])}</div>`;
    return el;
  }
  function drawPins() {
    markers.forEach(m => { m.map = null; }); markers = [];
    if (!gmap) return;
    const bounds = new google.maps.LatLngBounds();
    const list = st.day === 'all' ? model.flatMap((d, i) => d.stops.map(x => ({ x, color: DAY_COLORS[i % DAY_COLORS.length], label: d.no }))) : stopsNow().map(x => ({ x }));
    let count = 0;
    for (const { x, color, label } of list) {
      if (!hasPin(x.s)) continue;
      const el = pinEl(x, color, label);
      const m = new Marker({ map: gmap, position: { lat: x.s.lat, lng: x.s.lng }, content: el, title: x.s.ko, zIndex: x.n === st.sel ? 10 : 1 });
      el.addEventListener('click', () => { if (st.day === 'all') { st.day = x.date; st.dayIsToday = false; st.sel = x.n; render(); } else select(x.n, true); });
      m.n = x.n;
      markers.push(m); bounds.extend({ lat: x.s.lat, lng: x.s.lng }); count++;
    }
    if (count > 1) gmap.fitBounds(bounds, st.day === 'all' ? { top: 110, bottom: 130, left: 30, right: 80 } : { top: 150, bottom: 300, left: 50, right: 90 });
    else if (count === 1) { gmap.setCenter(bounds.getCenter()); gmap.setZoom(13); }
  }
  function renderCards() {
    const list = stopsNow();
    const car = $('carousel');
    car.dataset.date = st.day;
    car.innerHTML = list.map(x => card(x, { full: false })).join('') || '<article class="sc empty"><h3>이날은 지도에 표시할 곳이 없어요</h3></article>';
    car.onclick = onAction;
    $('cardPos').textContent = list.length ? `${st.sel} / ${list.length}` : '';
    $('cardPrev').disabled = st.sel <= 1; $('cardNext').disabled = st.sel >= list.length;
    requestAnimationFrame(() => car.querySelector('.sc.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }
  function select(n, pan) {
    st.sel = n;
    $('carousel').querySelectorAll('.sc').forEach(c => c.classList.toggle('sel', +c.dataset.n === n));
    const list = stopsNow();
    $('cardPos').textContent = `${n} / ${list.length}`;
    $('cardPrev').disabled = n <= 1; $('cardNext').disabled = n >= list.length;
    $('carousel').querySelector(`.sc[data-n="${n}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    markers.forEach(m => { const sel = m.n === n; m.content.classList.toggle('sel', sel); m.zIndex = sel ? 10 : 1; });
    const x = list.find(s => s.n === n);
    if (pan && gmap && x && hasPin(x.s)) gmap.panTo({ lat: x.s.lat, lng: x.s.lng });
  }
  $('cardPrev').onclick = () => select(Math.max(1, st.sel - 1), true);
  $('cardNext').onclick = () => select(Math.min(stopsNow().length, st.sel + 1), true);
  let scrollT = null;
  $('carousel').addEventListener('scroll', () => {
    clearTimeout(scrollT);
    scrollT = setTimeout(() => {
      const car = $('carousel'), mid = car.scrollLeft + car.clientWidth / 2;
      let best = null, bd = Infinity;
      car.querySelectorAll('.sc[data-n]').forEach(c => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = +c.dataset.n; } });
      if (best && best !== st.sel) select(best, true);
    }, 140);
  }, { passive: true });
  $('mapZoomIn').onclick = () => gmap?.setZoom(gmap.getZoom() + 1);
  $('mapZoomOut').onclick = () => gmap?.setZoom(gmap.getZoom() - 1);
  $('mapList').onclick = () => { st.view = 'list'; if (st.day === 'all') { const p = pickToday(); st.day = p.date; } render(); };
  $('mapToggle').onclick = () => { st.view = st.view === 'map' ? 'list' : 'map'; render(); };
  let meMarker = null;
  $('mapMe').onclick = () => {
    if (!navigator.geolocation) return toast('이 휴대폰에서는 위치를 쓸 수 없어요.');
    toast('내 위치를 찾고 있어요…');
    navigator.geolocation.getCurrentPosition(p => {
      st.me = { lat: p.coords.latitude, lng: p.coords.longitude };
      $('mapToast').hidden = true;
      if (!gmap) return;
      if (meMarker) meMarker.map = null;
      const el = document.createElement('div'); el.className = 'me-dot';
      meMarker = new Marker({ map: gmap, position: st.me, content: el, title: '내 위치' });
      gmap.panTo(st.me);
    }, () => toast('위치를 쓸 수 없어요. 지도와 장소 설명은 그대로 쓸 수 있어요.'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };

  // ---------- one place ----------
  function hero(art) {
    const lake = '<rect y="190" width="390" height="70" style="fill:var(--h-water)"/><path d="M30 210h70M160 222h90M270 212h80" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>';
    const trees = '<rect y="170" width="390" height="28" style="fill:var(--h-near)"/><path d="M0 178l10-26 10 26 8-20 9 20 10-30 11 30 8-18 9 18 12-34 12 34 8-22 10 22 11-28 10 28 9-16 8 16 12-30 11 30 9-20 9 20 11-26 10 26 8-18 9 18 12-32 11 32 9-20 8 20 11-28 10 28 8-14 9 14 12-30 10 30 9-22 10 22V200H0Z" style="fill:var(--h-near)"/>';
    const mountains = '<path d="M0 140L60 60 110 110 170 30 240 105 290 60 350 115 390 80V200H0Z" style="fill:var(--h-far)" opacity=".85"/><path d="M0 168L50 126 100 156 150 112 210 158 270 122 330 164 390 136V210H0Z" style="fill:var(--h-mid)"/>';
    const sky = '<rect width="390" height="260" fill="url(#hsky)"/><circle cx="92" cy="70" r="24" style="fill:var(--h-sun)"/>';
    const defs = '<defs><linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--h-sky2)"/><stop offset="1" style="stop-color:var(--h-sky1)"/></linearGradient></defs>';
    const body = {
      city: sky + '<path d="M0 200V150h30v-30h24v40h20v-60h28v70h22v-40h30v-24h26v64h24v-50h30v70h22v-36h28v46h26V130h30v70h26V200Z" style="fill:var(--h-mid)"/><rect y="196" width="390" height="70" style="fill:var(--h-near)"/>',
      forest: sky + mountains + trees + lake,
      bridge: sky + mountains + '<path d="M0 150C40 158 80 168 110 260H0ZM390 150C350 158 310 168 280 260H390Z" style="fill:var(--h-near)"/><path d="M60 146Q195 206 330 146" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3"/>',
      falls: sky + mountains + '<path d="M170 120h50v140h-50z" style="fill:var(--h-water)"/><path d="M180 120v140M196 120v140M210 120v140" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>' + trees,
      lake: sky + mountains + trees + lake,
      mountain: sky + mountains + '<path d="M140 64l30-34 30 34-14-6-16 10-14-10z" fill="#fff" opacity=".9"/>' + trees,
    }[art] || (sky + mountains + trees);
    return `<svg viewBox="0 0 390 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs}${body}</svg>`;
  }

  function openSpot(x) {
    const s = x.s, d = dayOf(x.date);
    const page = $('spotPage');
    const facts = s.facts?.length ? `<div class="lbl2">알아 두면 좋아요</div><div class="facts">${s.facts.map((f, i) => `<div><span class="n">${i + 1}</span><span>${esc(f)}</span></div>`).join('')}</div>` : '';
    const sights = s.sights?.length ? `<div class="lbl2">볼거리</div><div class="chips2">${s.sights.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : '';
    const tips = s.tips?.length ? `<div class="tipcard"><b>${svg('sparkle')}방문 팁</b>${s.tips.map(t => `<div>${esc(t)}</div>`).join('')}</div>` : '';
    const memo = x.it.memo ? `<div class="memo-card"><b>일정 메모</b>${esc(x.it.memo)}</div>` : '';
    const empty = !s.about && !facts ? '<p class="muted lead">이곳 설명은 공식 자료를 확인한 뒤에 넣어 드릴게요.</p>' : '';
    const srcs = s.sources?.length ? `<details class="srcs"><summary>출처 ${s.sources.length}곳 · ${esc(s.sources[0].checked)} 확인</summary>${s.sources.map(r => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`).join('')}</details>` : '';
    const train = s.kind === 'train-view';
    page.innerHTML = `
      <div class="sp-hero">${hero(s.art)}</div>
      <div class="sp-top"><button type="button" class="icon-btn round glass" data-close aria-label="닫기">${svg('back')}</button><button type="button" class="pill glass" data-say>${svg('speaker')}이름 듣기</button></div>
      <div class="sp-body">
        <div class="kick">${d ? `${d.no}일차 · ` : ''}${esc(kick(x))}</div>
        <h1>${esc(s.ko)}</h1><div class="en">${esc(s.local)}</div>
        ${s.about ? `<p class="lead">${esc(s.about)}</p>` : ''}${empty}
        ${facts}${sights}${tips}${memo}${srcs}
      </div>
      <div class="dock glass">
        ${train ? '' : `<button type="button" class="go" data-go>${svg('pin')}길찾기</button><button type="button" class="sm" data-food>${svg('meal')}근처 음식점</button>`}
        <button type="button" class="sm" data-addr>${svg('card')}${s.address ? '주소 보여주기' : '이름 보여주기'}</button>
      </div>`;
    page.hidden = false;
    page.scrollTop = 0;
    page.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-close')) page.hidden = true;
      if (b.hasAttribute('data-say')) speak(s.local, 'en');
      if (b.hasAttribute('data-go')) chooseMode(x);
      if (b.hasAttribute('data-food')) openFood(x);
      if (b.hasAttribute('data-addr')) window.ShowCard?.show({ en: 'Could you please take me here?', lines: [s.local, s.address].filter(Boolean), ko: `${toward(s.ko.split(' · ')[0])} 가 주세요.` });
    };
  }

  // ---------- directions: the person picks how to go ----------
  function chooseMode(x) {
    const s = x.s, dlg = $('travelDialog');
    const far = st.me && hasPin(s) ? km(st.me, s) : null;
    $('travelDest').textContent = s.ko;
    $('walkNote').textContent = far == null ? '먼 곳은 걷기 힘들어요' : far > 2 ? `직선 약 ${distText(far)} · 걷기엔 멀어요` : `직선 약 ${distText(far)}`;
    $('walkNote').classList.toggle('w', far != null && far > 2);
    dlg.onclick = e => {
      const b = e.target.closest('[data-mode]');
      if (b) { openOut(dirUrl(s.query || s.local, s.placeId, b.dataset.mode)); dlg.close(); }
      if (e.target.closest('[data-cancel]') || e.target === dlg) dlg.close();
    };
    dlg.showModal();
  }

  // ---------- restaurants near a place ----------
  const TYPES = { restaurant: '식당', cafe: '카페', coffee_shop: '카페', korean_restaurant: '한식', japanese_restaurant: '일식', chinese_restaurant: '중식', sushi_restaurant: '스시', ramen_restaurant: '라멘',
    seafood_restaurant: '해산물', steak_house: '스테이크', pizza_restaurant: '피자', italian_restaurant: '이탈리아 음식', mexican_restaurant: '멕시코 음식', vietnamese_restaurant: '베트남 음식',
    thai_restaurant: '태국 음식', indian_restaurant: '인도 음식', hamburger_restaurant: '햄버거', fast_food_restaurant: '패스트푸드', breakfast_restaurant: '아침 식당', brunch_restaurant: '브런치',
    bakery: '빵집', american_restaurant: '미국식 식당', canadian_restaurant: '캐나다 음식', bar: '바', pub: '펍', vegetarian_restaurant: '채식' };
  const food = { seq: 0, x: null, type: 'restaurant', step: 0, list: [], status: 'idle' };
  const steps = s => { const r0 = s.food?.radius || 800; return [r0, ...[1500, 3000, 10000].filter(v => v > r0)].slice(0, 3); };
  const hm = (h, m) => `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
  function hoursOn(hours, date) {
    if (!hours?.periods?.length) return null;
    const [y, m, d] = date.split('-').map(Number), day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const ps = hours.periods.filter(p => p.open?.day === day);
    if (!ps.length) return '쉬는 날일 수 있어요';
    return ps.map(p => (p.close ? `${hm(p.open.hour, p.open.minute)}~${hm(p.close.hour, p.close.minute)}` : '24시간')).join(', ');
  }

  function openFood(x) {
    food.x = x; food.step = 0; food.list = []; food.type = 'restaurant';
    $('foodPage').hidden = false;
    searchFood();
  }
  async function searchFood() {
    const x = food.x, s = x.s, seq = ++food.seq, radius = steps(s)[food.step];
    food.status = 'loading'; food.list = [];
    renderFood();
    if (!Places.key()) { food.status = 'nokey'; return renderFood(); }
    if (!navigator.onLine) { food.status = 'offline'; return renderFood(); }
    if (!hasPin(s)) { food.status = 'nopin'; return renderFood(); }
    let tries = 0;
    for (;;) {
      try {
        const list = await Places.nearby({ lat: s.lat, lng: s.lng }, food.type, radius);
        if (seq !== food.seq) return; // a newer search replaced this one
        food.list = list.map(p => ({ ...p, km: km(s, p) })).sort((a, b) => a.km - b.km).slice(0, 5);
        food.status = food.list.length ? 'ok' : 'empty';
        break;
      } catch (e) {
        if (seq !== food.seq) return;
        if (e.code === 'error' && tries++ < 1) continue; // one quiet retry
        food.status = e.code === 'nokey' ? 'nokey' : e.code === 'quota' ? 'quota' : e.code === 'offline' ? 'offline' : 'error';
        break;
      }
    }
    renderFood();
    if (food.status === 'ok' && x.date === Trip.todayIn(Trip.currentTz())) {
      for (const p of food.list) p.open = await p.isOpen();
      if (seq === food.seq) renderFood();
    }
  }
  function renderFood() {
    const x = food.x, s = x.s, radius = steps(s)[food.step], page = $('foodPage');
    const label = `${x.date ? `${Number(x.date.slice(5, 7))}월 ${Number(x.date.slice(8))}일(${wd(x.date)})` : ''}`;
    const own = s.food?.note ? `<div class="own"><b>미리 확인한 안내</b>${esc(s.food.note)}</div>` : '';
    const google = `<button type="button" class="widen solid" data-gsearch>${svg('pin')}Google 지도에서 근처 ${food.type === 'cafe' ? '카페' : '식당'} 찾기</button>`;
    let body = '';
    if (food.status === 'loading') body = '<div class="cam-loading">근처를 찾고 있어요…</div>';
    else if (food.status === 'nokey') body = `<div class="map-banner">${svg('key')}<div><b>식당 목록은 Google 지도 키가 있어야 보여요</b><small>대신 Google 지도 앱에서 바로 찾아볼 수 있어요.</small></div></div>${google}`;
    else if (food.status === 'offline') body = `<div class="map-banner warn">${svg('note')}<div><b>인터넷이 안 돼요</b><small>연결되면 다시 찾아 주세요.</small></div></div><button type="button" class="widen" data-retry>다시 찾기</button>`;
    else if (food.status === 'quota') body = `<div class="map-banner warn">${svg('note')}<div><b>오늘은 더 찾을 수 없어요</b><small>Google 지도에서 직접 찾아 주세요.</small></div></div>${google}`;
    else if (food.status === 'error') body = `<div class="map-banner warn">${svg('note')}<div><b>식당을 찾지 못했어요</b><small>잠시 뒤에 다시 해 보세요.</small></div></div><button type="button" class="widen" data-retry>다시 찾기</button>${google}`;
    else if (food.status === 'nopin') body = `<div class="map-banner">${svg('note')}<div><b>이곳 위치를 아직 확인하는 중이에요</b><small>Google 지도에서 찾아볼 수 있어요.</small></div></div>${google}`;
    else if (food.status === 'empty') body = `<div class="empty"><span class="shape flower">${svg('meal')}</span><h3>${distText(radius / 1000)} 안에서 못 찾았어요</h3><p>국립공원 안이라면 주변에 가게가 거의 없을 수 있어요.</p></div>`;
    else body = food.list.map((p, i) => {
      const hours = hoursOn(p.hours, x.date);
      const meta = [p.rating != null ? `${svg('star')}${p.rating.toFixed(1)}` : '평점 정보 없음', p.reviews != null ? `리뷰 ${p.reviews.toLocaleString('ko-KR')}` : '', p.price || ''].filter(Boolean);
      return `<div class="fc" data-i="${i}">
        <div class="top"><div><div class="name">${esc(p.name)}</div><div class="kind">${esc(TYPES[p.type] || (food.type === 'cafe' ? '카페' : '식당'))}</div></div><div class="dist"><b>${distText(p.km)}</b><small>직선거리</small></div></div>
        <div class="meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>
        <div class="hours">${p.open === true ? '<b>지금</b> 영업 중<br>' : p.open === false ? '<b>지금</b> 문 닫았어요<br>' : ''}<b>${label} 예상</b> ${hours ? esc(hours) + ' · 바뀔 수 있어요' : '정보 없음 · Google 지도에서 확인해 주세요'}</div>
        <div class="acts"><button type="button" class="primary" data-fgo="${i}">${svg('pin')}길찾기</button><button type="button" class="tonal" data-fmap="${i}">Google 지도</button></div>
        ${p.attributions.length ? `<div class="attr">${p.attributions.map(a => esc(a.provider || '')).join(', ')}</div>` : ''}
      </div>`;
    }).join('');
    const more = ['ok', 'empty'].includes(food.status) && food.step < steps(s).length - 1
      ? `<button type="button" class="widen" data-wider>더 넓게 찾기 · ${distText(steps(s)[food.step + 1] / 1000)}</button>` : '';
    page.innerHTML = `
      <header><button type="button" class="icon-btn round back-btn" data-close aria-label="닫기">${svg('back')}</button><div class="fh"><h1>${esc(s.ko)} 근처</h1><small>직선 ${distText(radius / 1000)} 안 · 가까운 순${['ok', 'empty'].includes(food.status) ? ' · 자료 Google Maps' : ''}</small></div></header>
      <main>
        <div class="seg"><button type="button" data-type="restaurant" class="${food.type === 'restaurant' ? 'on' : ''}">식당</button><button type="button" data-type="cafe" class="${food.type === 'cafe' ? 'on' : ''}">카페</button></div>
        ${own}${body}${more}
        ${food.status === 'ok' ? '<p class="gattr">자료: Google Maps · 가게 정보는 바뀔 수 있어요</p>' : ''}
      </main>`;
    page.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-close')) { food.seq++; page.hidden = true; }
      if (b.dataset.type && b.dataset.type !== food.type) { food.type = b.dataset.type; food.step = 0; searchFood(); }
      if (b.hasAttribute('data-wider')) { food.step++; searchFood(); }
      if (b.hasAttribute('data-retry')) searchFood();
      if (b.hasAttribute('data-gsearch')) openOut(searchUrl(`${food.type === 'cafe' ? 'cafes' : 'restaurants'} near ${s.query || s.local}`));
      if (b.dataset.fgo) { const p = food.list[+b.dataset.fgo]; openOut(dirUrl(p.name, p.id, 'walking')); }
      if (b.dataset.fmap) { const p = food.list[+b.dataset.fmap]; openOut(p.url || searchUrl(p.name, p.id)); }
    };
  }

  // ---------- render & start ----------
  function render() {
    if (!data || !model.length) build();
    if (!st.day) { const p = pickToday(); st.day = p.date; st.note = p.note; st.dayIsToday = true; }
    const mapMode = st.view === 'map' && st.mapState === 'ready';
    tab.classList.toggle('mapmode', mapMode);
    $('gmap').hidden = !mapMode; $('mapCtrl').hidden = !mapMode; $('mapCards').hidden = !mapMode;
    $('mapMain').hidden = mapMode;
    $('mapToggle').hidden = mapMode || st.mapState !== 'ready' || !navigator.onLine;
    $('mapToggle').innerHTML = `${svg('pin')}지도 보기`;
    renderDays();
    if (mapMode) {
      if (st.day === 'all') $('mapCards').hidden = true; else renderCards();
      drawPins();
    } else renderList();
  }
  async function start() {
    if (st.mapState === 'loading') return;
    if (!Places.key()) { st.mapState = 'nokey'; st.view = 'list'; return render(); }
    if (!navigator.onLine) { st.mapState = 'offline'; st.view = 'list'; return render(); }
    st.mapState = 'loading'; render();
    try { await ensureMap(); st.mapState = 'ready'; st.view = 'map'; }
    catch (e) { st.mapState = e?.code === 'nokey' ? 'nokey' : 'error'; st.view = 'list'; }
    render();
  }
  document.addEventListener('mapsauthfail', () => { st.mapState = 'error'; st.view = 'list'; render(); });
  document.addEventListener('mapkeychange', () => { if (window.google?.maps) toast('키를 바꿨어요. 앱을 닫았다가 다시 열면 적용돼요.'); else { st.mapState = 'none'; } });
  window.addEventListener('online', () => { if (!tab.hidden) start(); });
  window.addEventListener('offline', () => { if (!tab.hidden) { st.view = 'list'; render(); } });

  let started = false;
  document.addEventListener('tabchange', e => {
    if (e.detail !== 'map') { $('spotPage').hidden = true; $('foodPage').hidden = true; return; }
    build();
    if (!started || st.mapState === 'none' || st.mapState === 'nokey') { started = true; start(); } else render();
  });

  // Schedule cards get a "지도" button when the place has a guide.
  function decorateSchedule() {
    if (!data) return;
    document.querySelectorAll('#schedList .item[data-id]').forEach(el => {
      const link = data.links?.[el.dataset.id];
      const it = window.Trip?.items().find(i => i.id === el.dataset.id);
      if (!link || !it || link.match !== it.place || el.querySelector('.to-map')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'to-map'; b.innerHTML = svg('pin') + '지도';
      b.onclick = ev => {
        ev.stopPropagation();
        st.day = it.date; st.dayIsToday = false; st.note = '';
        const d = (build(), dayOf(it.date));
        st.sel = d?.stops.find(x => x.it.id === it.id)?.n || 1;
        document.querySelector('.tabbar [data-tab="map"]').click();
      };
      el.appendChild(b);
    });
  }
  document.addEventListener('tripchange', () => { build(); decorateSchedule(); if (!tab.hidden) render(); });

  // Same guide for the AI helper and others, if they want it.
  window.MapScreen = { get data() { return data; } };

  (async () => {
    await loadData();
    await window.Trip?.ready;
    build(); decorateSchedule();
    if (!tab.hidden) { started = true; start(); }
  })();
})();
