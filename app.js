const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANGS = {
  ko: { code: 'ko-KR', label: '한국어', other: 'en', tts: ['ko-KR'] },
  en: { code: 'en-US', label: 'English', other: 'ko', tts: ['en-CA', 'en-US', 'en-GB'] },
};
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const LATIN = /[A-Za-z]/;

const $ = id => document.getElementById(id);
const els = {
  log: $('log'), live: $('live'), liveLang: $('liveLang'), liveText: $('liveText'),
  main: $('mainBtn'), mainIcon: $('mainIcon'), mainLabel: $('mainLabel'), hint: $('hint'),
  turnKo: $('turnKo'), turnEn: $('turnEn'), settings: $('settings'),
  optSpeak: $('optSpeak'), optAlternate: $('optAlternate'), optFont: $('optFont'), optRate: $('optRate'),
};

const state = { running: false, lang: 'ko', rec: null, busy: false };

// ---------- settings (per device) ----------
const SETTINGS_KEY = 'interp.settings';
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if ('speak' in s) els.optSpeak.checked = s.speak;
    if ('alternate' in s) els.optAlternate.checked = s.alternate;
    if (s.font) els.optFont.value = s.font;
    if (s.rate) els.optRate.value = s.rate;
  } catch {}
  applyFont();
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      speak: els.optSpeak.checked, alternate: els.optAlternate.checked,
      font: els.optFont.value, rate: els.optRate.value,
    }));
  } catch {}
}
function applyFont() { document.documentElement.style.setProperty('--font', els.optFont.value + 'px'); }

// ---------- language detection ----------
// The browser recognizer listens in one language at a time, so we also check the
// script of what it heard: Hangul means Korean, Latin-only means English.
function detectLang(text, listenedAs) {
  if (HANGUL.test(text)) return 'ko';
  if (LATIN.test(text)) return 'en';
  return listenedAs;
}

// ---------- text to speech ----------
let voices = [];
function refreshVoices() { voices = speechSynthesis.getVoices(); }
if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}
function pickVoice(lang) {
  for (const code of LANGS[lang].tts) {
    const v = voices.find(v => v.lang.replace('_', '-') === code);
    if (v) return v;
  }
  return voices.find(v => v.lang.toLowerCase().startsWith(lang));
}
function speak(text, lang) {
  return new Promise(resolve => {
    if (!els.optSpeak.checked || !('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[lang].code;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = Number(els.optRate.value);
    // Some browsers never fire onend; don't let that freeze the conversation.
    const fallback = setTimeout(resolve, 1500 + text.length * 120);
    u.onend = u.onerror = () => { clearTimeout(fallback); resolve(); };
    speechSynthesis.speak(u);
  });
}

// ---------- conversation log ----------
function addEntry(srcText, srcLang) {
  const li = document.createElement('li');
  li.className = 'msg ' + srcLang;
  li.innerHTML = '<div class="src"></div><div class="dst pending">번역 중… / Translating…</div>'
    + '<div class="actions" hidden><button data-act="replay">🔊 다시 듣기</button></div>';
  li.querySelector('.src').textContent = (srcLang === 'ko' ? '🇰🇷 ' : '🇨🇦 ') + srcText;
  els.log.appendChild(li);
  li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return li;
}
function fillEntry(li, text, lang, failed) {
  const dst = li.querySelector('.dst');
  dst.textContent = text;
  dst.classList.toggle('pending', !!failed);
  if (!failed) {
    const actions = li.querySelector('.actions');
    actions.hidden = false;
    actions.querySelector('[data-act=replay]').onclick = () => speak(text, lang);
  }
  li.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ---------- UI state ----------
function render() {
  const lang = state.lang;
  els.turnKo.classList.toggle('active', lang === 'ko');
  els.turnEn.classList.toggle('active', lang === 'en');
  els.main.classList.toggle('en', lang === 'en');
  els.main.classList.toggle('stopped', !state.running);
  els.main.classList.toggle('listening', state.running && !state.busy);
  if (!state.running) {
    els.mainIcon.textContent = '🎤';
    els.mainLabel.textContent = '통역 시작';
    els.hint.textContent = '버튼을 누르고 말씀하세요. 번역 후에는 자동으로 상대방 차례로 바뀝니다.';
  } else if (state.busy) {
    els.mainIcon.textContent = '⏳';
    els.mainLabel.textContent = '번역 중…';
  } else {
    els.mainIcon.textContent = '⏹';
    els.mainLabel.textContent = lang === 'ko' ? '듣는 중 (한국어) · 멈추기' : 'Listening (English) · Stop';
    els.hint.textContent = lang === 'ko'
      ? '한국어로 말씀하세요. 영어가 들리면 자동으로 알아들어요.'
      : 'Please speak in English. It will be translated into Korean.';
  }
}
function showLive(text, lang) {
  els.live.hidden = !text;
  els.liveLang.textContent = lang === 'ko' ? 'KO' : 'EN';
  els.liveLang.className = 'badge ' + lang;
  els.liveText.textContent = text;
}

// ---------- speech recognition loop ----------
function listen() {
  if (!state.running) return;
  const rec = new SR();
  state.rec = rec;
  rec.lang = LANGS[state.lang].code;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';

  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    showLive((finalText + interim).trim(), state.lang);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stop();
      alert('마이크 권한이 필요해요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.');
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.warn('[speech] error', e.error);
    }
  };
  rec.onend = async () => {
    if (state.rec !== rec) return; // replaced by a manual turn switch
    state.rec = null;
    const text = finalText.trim();
    showLive('', state.lang);
    if (!state.running) return;
    if (!text) return setTimeout(listen, 250); // silence: keep listening
    await handleUtterance(text, state.lang);
    if (state.running) listen();
  };

  try { rec.start(); } catch (e) { console.warn(e); setTimeout(listen, 500); }
  render();
}

async function handleUtterance(text, listenedAs) {
  const from = detectLang(text, listenedAs);
  const to = LANGS[from].other;
  state.busy = true; render();
  const li = addEntry(text, from);
  try {
    const out = await Translator.translate(text, from, to);
    fillEntry(li, out, to);
    await speak(out, to);
  } catch {
    fillEntry(li, '번역하지 못했어요. 인터넷 연결을 확인해 주세요. / Translation failed.', to, true);
  }
  state.busy = false;
  if (els.optAlternate.checked) state.lang = to;
  render();
}

function start() {
  state.running = true;
  // iOS only allows speech output after a tap; a silent utterance unlocks it.
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  listen();
}
function stop() {
  state.running = false;
  state.busy = false;
  const rec = state.rec;
  state.rec = null;
  if (rec) rec.abort();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  showLive('', state.lang);
  render();
}
function setTurn(lang) {
  state.lang = lang;
  if (state.running && !state.busy) {
    const rec = state.rec;
    state.rec = null;
    if (rec) rec.abort();
    listen();
  }
  render();
}

// ---------- wiring ----------
if (!SR) {
  $('unsupported').hidden = false;
  els.main.disabled = true;
}
els.main.onclick = () => (state.running ? stop() : start());
els.turnKo.onclick = () => setTurn('ko');
els.turnEn.onclick = () => setTurn('en');
$('settingsBtn').onclick = () => els.settings.showModal();
$('clearBtn').onclick = () => { els.log.innerHTML = ''; };
for (const el of [els.optSpeak, els.optAlternate, els.optFont, els.optRate]) {
  el.addEventListener('change', () => { applyFont(); saveSettings(); });
  el.addEventListener('input', applyFont);
}
loadSettings();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
