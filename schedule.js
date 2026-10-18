// Trip schedule. The shared plan lives in schedule.json (updated through the repo);
// edits made on the phone are saved on that phone and take priority.
(() => {
  const STORE = 'trip.schedule';
  const TYPES = { activity: '🎯', flight: '✈️', hotel: '🏨', meal: '🍽️', move: '🚌', etc: '📝' };
  const ICONS = { activity: 'mountain', flight: 'plane', hotel: 'bed', meal: 'meal', move: 'bus', etc: 'note' };
  const svg = n => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const $ = id => document.getElementById(id);
  const list = $('schedList'), dialog = $('itemDialog'), form = $('itemForm');
  let trip = { title: '캐나다 여행', timezone: 'America/Toronto', items: [] };
  let editingId = null;

  let shared = null;
  function save() {
    trip.modified = true;
    try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch {}
  }

  // Use the shared plan unless this phone has its own edits; if both exist and
  // the shared plan changed since, offer to load it.
  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
    try {
      const res = await fetch('schedule.json', { cache: 'no-store' });
      if (res.ok) { shared = await res.json(); window.__sharedTrip = shared; }
    } catch {}
    if (local?.modified) {
      trip = local;
      if (shared && shared.version !== local.version) showUpdateBanner();
    } else if (shared) {
      trip = { ...trip, ...shared };
    } else if (local) {
      trip = local;
    }
  }
  function showUpdateBanner() {
    const b = document.createElement('div');
    b.className = 'notice';
    b.innerHTML = '새로 공유된 일정이 있어요. 불러오면 이 폰에서 고친 내용은 사라져요.<br><button type="button">새 일정 불러오기</button>';
    b.querySelector('button').onclick = () => {
      trip = { ...shared };
      try { localStorage.removeItem(STORE); } catch {}
      b.remove(); render();
    };
    list.before(b);
  }
  function currentTz() {
    if (trip.timezone !== 'auto') return trip.timezone;
    const map = trip.timezones || {};
    const dates = Object.keys(map).sort();
    const today = todayIn('America/Vancouver');
    let tz = 'America/Vancouver';
    for (const d of dates) if (d <= today && map[d] !== 'Asia/Seoul') tz = map[d];
    return tz;
  }
  // Untimed items keep their written order and sit after the timed item before them.
  function sortDay(items) {
    let carry = '';
    return items.map((it, i) => { if (it.time) carry = it.time; return { it, key: it.time || carry, i }; })
      .sort((a, b) => a.key.localeCompare(b.key) || a.i - b.i).map(x => x.it);
  }

  // Date helpers work on plain YYYY-MM-DD strings in Canadian local time.
  function todayIn(tz) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function timeIn(tz) {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  }
  function dayLabel(date) {
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${m}월 ${d}일 (${WEEK[wd]})`;
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  function tickClocks() {
    $('clockCa').textContent = timeIn(currentTz());
    $('clockKr').textContent = timeIn('Asia/Seoul');
    const dates = trip.items.map(i => i.date).sort();
    const dd = $('dday');
    if (!dates.length) { dd.textContent = ''; return; }
    const today = todayIn('Asia/Seoul');
    const diff = daysBetween(today, dates[0]);
    const total = daysBetween(dates[0], dates[dates.length - 1]) + 1;
    const dayNo = daysBetween(dates[0], todayIn(currentTz())) + 1;
    dd.textContent = diff > 0 ? `출발 D-${diff}` : dayNo <= total ? `여행 ${dayNo}일째` : '여행 끝';
  }

  function render() {
    $('tripTitle').textContent = trip.title || '캐나다 여행';
    $('tzSelect').value = trip.timezone;
    list.innerHTML = '';
    if (trip.notes) {
      const n = document.createElement('p');
      n.className = 'muted small trip-notes';
      n.textContent = trip.notes;
      list.appendChild(n);
    }
    if (!trip.items.length) {
      list.innerHTML = '<div class="placeholder"><div class="ph-icon">' + svg('calendar') + '</div>'
        + '<p>아직 일정이 없어요.</p><p class="muted">오른쪽 아래 ＋ 버튼으로 항공편, 숙소, 관광 일정을 넣어 보세요.</p></div>';
      $('dayStrip').innerHTML = '';
      tickClocks();
      return;
    }
    const today = todayIn(currentTz());
    const byDate = {};
    for (const it of trip.items) (byDate[it.date] ||= []).push(it);
    const dates = Object.keys(byDate).sort();
    const first = dates[0];
    for (const date of dates) {
      const sec = document.createElement('section');
      sec.className = 'day' + (date === today ? ' today' : '');
      sec.id = 'day-' + date;
      const h = document.createElement('h3');
      h.innerHTML = `<span>${daysBetween(first, date) + 1}일차</span><span class="muted"></span>`;
      h.lastChild.textContent = dayLabel(date);
      sec.appendChild(h);
      for (const it of sortDay(byDate[date])) sec.appendChild(itemEl(it));
      list.appendChild(sec);
    }
    renderStrip(dates, today);
    tickClocks();
    scrollToToday();
    document.dispatchEvent(new Event('tripchange'));
  }

  // Row of day buttons above the list; tapping one jumps to that day.
  function renderStrip(dates, today) {
    const strip = $('dayStrip');
    strip.innerHTML = '';
    for (const date of dates) {
      const [y, m, d] = date.split('-').map(Number);
      const b = document.createElement('button');
      b.type = 'button';
      if (date === today) b.className = 'today';
      b.innerHTML = '<small></small><b></b>';
      b.querySelector('small').textContent = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      b.querySelector('b').textContent = d;
      b.setAttribute('aria-label', dayLabel(date));
      b.onclick = () => document.getElementById('day-' + date)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      strip.appendChild(b);
    }
  }

  function scrollToToday() {
    const el = list.querySelector('.day.today');
    if (el && !list.closest('.tab').hidden) setTimeout(() => el.scrollIntoView({ block: 'start' }), 0);
  }
  document.querySelector('.tabbar [data-tab=schedule]').addEventListener('click', scrollToToday);

  function itemEl(it) {
    const el = document.createElement('div');
    el.className = 'item';
    el.dataset.id = it.id;
    el.innerHTML = '<div class="ic"></div><div class="body"><div class="time"></div><div class="ttl"></div></div>';
    el.querySelector('.ic').innerHTML = svg(ICONS[it.type] || 'note');
    el.classList.add('t-' + (it.type || 'etc'));
    el.querySelector('.time').textContent = it.time || '';
    if (!it.time) el.querySelector('.time').hidden = true;
    el.querySelector('.ttl').textContent = it.title;
    const body = el.querySelector('.body');
    if (it.place) {
      const a = document.createElement('a');
      a.className = 'place';
      a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(it.place);
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = svg('pin');
      a.append(it.place);
      a.onclick = e => e.stopPropagation();
      body.appendChild(a);
    }
    if (it.memo) {
      const m = document.createElement('div');
      m.className = 'memo';
      m.textContent = it.memo;
      body.appendChild(m);
    }
    el.onclick = () => openDialog(it);
    return el;
  }

  function openDialog(it) {
    editingId = it ? it.id : null;
    $('itemDialogTitle').textContent = it ? '일정 수정' : '일정 추가';
    $('deleteItem').hidden = !it;
    const last = trip.items.map(i => i.date).sort().pop();
    form.date.value = it?.date || last || todayIn(currentTz());
    form.time.value = it?.time || '';
    form.type.value = it?.type || 'activity';
    form.title.value = it?.title || '';
    form.place.value = it?.place || '';
    form.memo.value = it?.memo || '';
    dialog.showModal();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      date: form.date.value, time: form.time.value, type: form.type.value,
      title: form.title.value.trim(), place: form.place.value.trim(), memo: form.memo.value.trim(),
    };
    if (!data.date || !data.title) return;
    if (editingId) Object.assign(trip.items.find(i => i.id === editingId), data);
    else trip.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
    save(); render(); dialog.close();
  });
  $('cancelItem').onclick = () => dialog.close();
  $('deleteItem').onclick = () => {
    if (!confirm('이 일정을 삭제할까요?')) return;
    trip.items = trip.items.filter(i => i.id !== editingId);
    save(); render(); dialog.close();
  };
  $('addItem').onclick = () => openDialog(null);
  $('tzSelect').onchange = e => { trip.timezone = e.target.value; save(); render(); };
  $('tripTitle').onclick = () => {
    const t = prompt('여행 이름', trip.title);
    if (t && t.trim()) { trip.title = t.trim(); save(); render(); }
  };

  // Share the whole plan as readable text (messenger, notes, etc.).
  $('shareTrip').onclick = async () => {
    const byDate = {};
    for (const it of trip.items) (byDate[it.date] ||= []).push(it);
    const lines = [trip.title];
    for (const date of Object.keys(byDate).sort()) {
      lines.push('', '■ ' + dayLabel(date));
      for (const it of sortDay(byDate[date])) {
        lines.push(`${it.time || '--:--'} ${TYPES[it.type] || ''} ${it.title}${it.place ? ' @ ' + it.place : ''}${it.memo ? '\n   ' + it.memo : ''}`);
      }
    }
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: trip.title, text });
      else { await navigator.clipboard.writeText(text); alert('일정을 복사했어요.'); }
    } catch {}
  };

  // Read-only view for the map screen: same plan, same "today", same order.
  window.Trip = {
    items: () => trip.items,
    sortDay, todayIn, dayLabel, daysBetween,
    currentTz: () => currentTz(),
    ready: null,
  };
  window.Trip.ready = load().then(render);
  setInterval(tickClocks, 30000);
})();
