// Packing checklists for each stage of the trip. Ticks, added items and
// removed items stay on this phone; the hotel checkout list can be reset for
// every hotel.
(() => {
  const box = document.getElementById('packList');
  const KEY = 'pack.v1';
  const LISTS = [
    { id: 'before', title: '출국 전 준비', items: [
      '여권 (남은 기간 6개월 이상)', '캐나다 eTA 승인 메일 확인', '항공권과 여행사 일정표', '여행자 보험 가입',
      '해외 로밍 또는 eSIM', '해외 결제 되는 카드와 캐나다 달러 조금', '평소 드시는 약 (넉넉히)', '멀티 어댑터 (캐나다는 미국식 11자 콘센트)',
      '보조배터리 (꼭 기내에 들고 타기)', '이 앱에 OpenAI 키와 내 정보 넣기',
    ] },
    { id: 'clothes', title: '옷과 용품', items: [
      '경량 패딩이나 따뜻한 겉옷 (로키 아침과 빙하 위는 추워요)', '바람막이나 우비', '편한 운동화', '선글라스, 모자, 선크림',
      '수영복 (밴프 온천)', '긴바지', '작은 배낭', '물병',
    ] },
    { id: 'train', title: '기차 1박 가방 (7/19)', note: '큰 가방은 객실에 두기 어려워요. 하룻밤 짐은 작은 가방에 따로 챙기세요.', items: [
      '갈아입을 옷과 잠옷', '세면도구', '오늘 밤과 내일 아침 약', '휴대폰 충전기', '따뜻한 겉옷', '실내용 슬리퍼', '여권과 지갑',
    ] },
    { id: 'checkout', title: '호텔 나올 때', reset: true, note: '호텔마다 다시 시작을 누르고 확인하세요.', items: [
      '여권과 지갑', '휴대폰과 충전기 (콘센트에 꽂힌 것)', '객실 금고', '냉장고', '욕실 (세면도구, 약)', '옷장과 서랍', '침대 주변과 베개 밑',
    ] },
    { id: 'home', title: '귀국 전', items: [
      '여권과 귀국 항공권', '액체류는 100ml 이하로 지퍼백에', '보조배터리는 기내에', '선물 무게 확인 (수하물 23kg)', '남은 캐나다 달러 정리',
    ] },
  ];

  let state = { checked: {}, custom: {}, removed: {} };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
  // Added items get ids that never change; older saves kept plain strings.
  for (const [list, arr] of Object.entries(state.custom)) {
    state.custom[list] = arr.map((it, i) => (typeof it === 'string' ? { id: list + ':c' + i, text: it } : it));
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  function render() {
    box.innerHTML = '';
    for (const list of LISTS) {
      const items = [...list.items.map((t, i) => ({ id: list.id + ':' + i, text: t })),
        ...(state.custom[list.id] || []).map(it => ({ ...it, custom: true }))].filter(it => !state.removed[it.id]);
      const removedCount = list.items.filter((t, i) => state.removed[list.id + ':' + i]).length;
      const done = items.filter(it => state.checked[it.id]).length;
      const card = document.createElement('div');
      card.className = 'card pack';
      card.innerHTML = `<div class="card-head"><h2></h2><span class="chip ${done === items.length ? 'ok' : ''}">${done}/${items.length}</span></div>`;
      card.querySelector('h2').textContent = list.title;
      if (list.reset) {
        const b = document.createElement('button');
        b.className = 'text-btn pack-reset';
        b.textContent = '다시 시작';
        b.onclick = () => { items.forEach(it => delete state.checked[it.id]); save(); render(); };
        card.querySelector('.card-head').appendChild(b);
      }
      if (list.note) {
        const p = document.createElement('p');
        p.className = 'muted small';
        p.textContent = list.note;
        card.appendChild(p);
      }
      const ul = document.createElement('ul');
      ul.className = 'pack-items';
      for (const it of items) {
        const li = document.createElement('li');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!state.checked[it.id];
        cb.onchange = () => { if (cb.checked) state.checked[it.id] = true; else delete state.checked[it.id]; save(); render(); };
        const span = document.createElement('span');
        span.textContent = it.text;
        label.append(cb, span);
        li.appendChild(label);
        const del = document.createElement('button');
        del.className = 'icon-btn sm';
        del.setAttribute('aria-label', it.text + ' 지우기');
        del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg>';
        del.onclick = () => {
          delete state.checked[it.id];
          if (it.custom) state.custom[list.id] = state.custom[list.id].filter(c => c.id !== it.id);
          else state.removed[it.id] = true;
          save(); render();
        };
        li.appendChild(del);
        ul.appendChild(li);
      }
      card.appendChild(ul);
      if (removedCount) {
        const back = document.createElement('button');
        back.className = 'text-btn pack-restore';
        back.textContent = `지운 기본 항목 ${removedCount}개 되살리기`;
        back.onclick = () => { list.items.forEach((t, i) => delete state.removed[list.id + ':' + i]); save(); render(); };
        card.appendChild(back);
      }
      const add = document.createElement('form');
      add.className = 'pack-add';
      add.innerHTML = '<input type="text" placeholder="항목 추가" aria-label="항목 추가"><button class="pill sm">추가</button>';
      add.onsubmit = e => {
        e.preventDefault();
        const v = add.querySelector('input').value.trim();
        if (!v) return;
        (state.custom[list.id] = state.custom[list.id] || []).push({ id: list.id + ':c' + Date.now().toString(36), text: v });
        save(); render();
      };
      card.appendChild(add);
      box.appendChild(card);
    }
  }
  render();
})();
