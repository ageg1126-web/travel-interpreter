// Cards to show people: big, polite English on a full white screen, with the
// Korean meaning underneath. Personal details come from "내 정보".
(() => {
  const $ = id => document.getElementById(id);
  const INFO = 'cards.info', CUSTOM = 'cards.custom';
  const HANGUL = /[가-힣]/;
  let info = {}, custom = [];
  try { info = JSON.parse(localStorage.getItem(INFO) || '{}'); } catch {}
  try { custom = JSON.parse(localStorage.getItem(CUSTOM) || '[]'); } catch {}
  // English for a field; Korean entries are translated when saved.
  const en = k => info[k + 'En'] || info[k] || '';

  const PRESETS = [
    { ko: '이 호텔로 데려다 주세요', en: 'Could you please take me to this hotel?', extra: () => [en('hotel'), en('address')], need: ['hotel'] },
    { ko: '영어를 잘 못해요. 천천히 말하거나 적어 주세요', en: "Sorry, I don't speak much English. Could you please speak slowly, or write it down for me?" },
    { ko: '길을 잃었어요. 호텔로 돌아가게 도와주세요', en: "Excuse me, I'm lost. Could you help me get back to my hotel?", extra: () => [en('hotel'), en('address')] },
    { ko: '단체 여행 중이에요. 가이드에게 전화 좀 해 주세요', en: "I'm traveling with a tour group. Could you please call my guide for me?", extra: () => [en('guide')], need: ['guide'] },
    { ko: '알레르기와 드시는 약', en: 'Important health information', need: ['allergy', 'meds'], any: true,
      extra: () => [info.allergy ? 'Allergies: ' + en('allergy') : '', info.meds ? 'Medication / conditions: ' + en('meds') : '', info.name ? 'Name: ' + info.name : ''] },
    { ko: '911에 전화해 주세요. 도움이 필요해요', en: 'Please call 911. I need help right away.', urgent: true },
    { ko: '계산서 주세요', en: 'Could we have the bill, please?' },
    { ko: '카드로 낼게요', en: "I'll pay by card, please." },
  ];

  function list() {
    const box = $('cardList');
    box.innerHTML = '';
    const all = [...PRESETS.map(p => ({ ...p })), ...custom.map((c, i) => ({ ...c, custom: i }))];
    for (const c of all) {
      const missing = c.need && (c.any ? c.need.every(k => !info[k]) : c.need.some(k => !info[k]));
      const row = document.createElement('div');
      row.className = 'show-item' + (c.urgent ? ' urgent' : '');
      const open = document.createElement('button');
      open.className = 'show-open';
      open.innerHTML = '<span class="show-item-ko"></span><span class="show-item-en"></span>';
      open.querySelector('.show-item-ko').textContent = c.ko;
      open.querySelector('.show-item-en').textContent = missing ? '내 정보를 먼저 넣어 주세요' : c.en;
      open.onclick = () => (missing ? openInfo() : show(c));
      row.appendChild(open);
      if (c.custom !== undefined) {
        const del = document.createElement('button');
        del.className = 'icon-btn';
        del.setAttribute('aria-label', '카드 지우기');
        del.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg>';
        del.onclick = () => {
          if (!confirm('이 카드를 지울까요?')) return;
          custom.splice(c.custom, 1);
          try { localStorage.setItem(CUSTOM, JSON.stringify(custom)); } catch {}
          list();
        };
        row.appendChild(del);
      }
      box.appendChild(row);
    }
  }

  // Keep the screen on while a card is shown.
  let wake = null;
  async function show(c) {
    $('showEn').textContent = c.en;
    const extra = (c.extra ? c.extra() : []).filter(Boolean);
    $('showExtra').innerHTML = '';
    for (const line of extra) { const d = document.createElement('div'); d.textContent = line; $('showExtra').appendChild(d); }
    $('showKo').textContent = c.ko;
    $('showCard').classList.toggle('urgent', !!c.urgent);
    $('showCard').hidden = false;
    $('showSpeak').onclick = () => speak([c.en, ...extra].join('. '), 'en');
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  }
  function hide() {
    $('showCard').hidden = true;
    stopSpeaking();
    wake?.release().catch(() => {});
    wake = null;
  }
  $('showClose').onclick = hide;
  document.addEventListener('tabchange', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('showCard').hidden) hide(); });

  const toEnglish = text => Translator.translate(text, 'ko', 'en', apiKey());
  // Short details (allergies, a hotel name) stay short: words, not a sentence.
  async function fieldToEnglish(text) {
    if (apiKey()) {
      try {
        const out = await AI.chat([
          { role: 'system', content: 'Translate the Korean text into English exactly. It is a short detail for a travel card (a place, a name, an allergy, a medicine or a condition). Keep it short; do not make it a sentence or add anything. Output only the English.' },
          { role: 'user', content: text },
        ], apiKey(), { ms: 20000 });
        if (out && !HANGUL.test(out)) return out;
      } catch {}
    }
    return toEnglish(text);
  }

  // 내 정보
  const dlg = $('cardInfo'), form = $('cardInfoForm');
  function openInfo() {
    for (const el of form.elements) if (el.name) el.value = info[el.name] || '';
    dlg.showModal();
  }
  $('cardInfoBtn').onclick = openInfo;
  form.addEventListener('submit', async e => {
    if (e.submitter?.value !== 'save') return;
    e.preventDefault();
    const btn = $('cardInfoSave');
    btn.disabled = true; btn.textContent = '저장 중…';
    const next = {};
    for (const el of form.elements) if (el.name) next[el.name] = el.value.trim();
    for (const k of ['hotel', 'address', 'guide', 'allergy', 'meds']) {
      if (next[k] && HANGUL.test(next[k])) {
        if (info[k] === next[k] && info[k + 'En']) { next[k + 'En'] = info[k + 'En']; continue; }
        try { next[k + 'En'] = await fieldToEnglish(next[k]); } catch { next[k + 'En'] = ''; }
      }
    }
    info = next;
    try { localStorage.setItem(INFO, JSON.stringify(info)); } catch {}
    btn.disabled = false; btn.textContent = '저장';
    dlg.close();
    list();
  });

  // 직접 만들기
  $('cardMake').onclick = async () => {
    const ko = $('cardNew').value.trim();
    if (!ko) return;
    const btn = $('cardMake');
    btn.disabled = true; btn.textContent = '영어로 바꾸는 중…';
    try {
      const text = HANGUL.test(ko) ? await toEnglish(ko) : ko;
      custom.push({ ko, en: text });
      try { localStorage.setItem(CUSTOM, JSON.stringify(custom)); } catch {}
      $('cardNew').value = '';
      list();
    } catch {
      alert('영어로 바꾸지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
    btn.disabled = false; btn.textContent = '영어 카드 만들기';
  };

  list();
})();
