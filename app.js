const $ = id => document.getElementById(id);
const LANGS = {
  ko: { code: 'ko-KR', other: 'en', tag: 'KO', name: '한국어', tts: ['ko-KR'] },
  en: { code: 'en-US', other: 'ko', tag: 'EN', name: 'English', tts: ['en-CA', 'en-US', 'en-GB'] },
};
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const LATIN = /[A-Za-z]/;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const els = {
  log: $('log'), logHead: $('logHead'), notice: $('notice'),
  main: $('mainBtn'), logView: $('logView'), startBar: $('startBar'), logBtn: $('logBtn'), stage: $('stage'), stageMode: $('stageMode'), status: $('liveStatus'),
  stageSrc: $('stageSrc'), stageDst: $('stageDst'), hero: $('interpHero'), mic: $('micBtn'),
  heroQ: $('heroQ'), heroA: $('heroA'),
  optKey: $('optKey'), keyState: $('keyState'), optSpeak: $('optSpeak'), optVoice: $('optVoice'),
  optFont: $('optFont'), optRate: $('optRate'), optPause: $('optPause'),
};
const orb = new VoiceOrb($('orb'));
const heroOrb = new VoiceOrb($('heroOrb'));

// ---------- screens ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + name; });
  document.querySelectorAll('.sidebar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name !== 'interpret' && ctl.mode !== 'off') ctl.off();
  try { localStorage.setItem('app.tab', name); } catch {}
  document.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
}
document.querySelectorAll('.sidebar [data-tab]').forEach(b => { b.onclick = () => { showTab(b.dataset.tab); closeSidebar(); }; });

// ---------- sidebar ----------
const sidebar = $('sidebar'), scrim = $('sideScrim');
function openSidebar() { sidebar.classList.add('open'); scrim.hidden = false; }
function closeSidebar() { sidebar.classList.remove('open'); scrim.hidden = true; }
// Every screen gets the same menu button in its header.
document.querySelectorAll('.tab > header').forEach(h => {
  const b = document.createElement('button');
  b.className = 'icon-btn menu-btn';
  b.setAttribute('aria-label', '메뉴 열기');
  b.innerHTML = icon('menu');
  b.onclick = openSidebar;
  h.prepend(b);
});
$('sideClose').onclick = closeSidebar;
scrim.onclick = closeSidebar;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSidebar(); if (ctl.mode === 'interpret') ctl.stopInterpret(); } });
// Swipe left on the open sidebar to close it.
let touchX = null;
sidebar.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
sidebar.addEventListener('touchend', e => {
  if (touchX !== null && touchX - e.changedTouches[0].clientX > 50) closeSidebar();
  touchX = null;
});

// ---------- settings (stored on this phone only) ----------
const SETTINGS_KEY = 'interp.settings';
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if ('speak' in s) els.optSpeak.checked = s.speak;
    for (const k of ['font', 'rate', 'pause', 'voice']) if (s[k]) els['opt' + k[0].toUpperCase() + k.slice(1)].value = s[k];
    els.optKey.value = localStorage.getItem('interp.openaiKey') || '';
  } catch {}
  applySettings();
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      speak: els.optSpeak.checked, font: els.optFont.value, rate: els.optRate.value, pause: els.optPause.value, voice: els.optVoice.value,
    }));
    localStorage.setItem('interp.openaiKey', els.optKey.value.trim());
  } catch {}
}
function apiKey() { return els.optKey.value.trim(); }
function applySettings() {
  document.documentElement.style.setProperty('--font', els.optFont.value + 'px');
  const key = apiKey();
  els.keyState.textContent = key ? '키가 저장돼 있어요. 자동 언어 감지로 통역해요.' : '키가 없으면 기본 모드(한국어와 영어를 번갈아 듣기)로 동작해요.';
  els.keyState.classList.toggle('ok', !!key);
  if (!key) {
    els.notice.hidden = false;
    els.notice.innerHTML = '<b>기본 모드</b>예요. 한국어와 영어를 번갈아 들어요. 순서 없이 알아듣게 하려면 OpenAI 키를 넣어 주세요.'
      + '<button type="button" id="goSettings" class="pill sm">설정 열기</button>';
    $('goSettings').onclick = () => showTab('settings');
  } else {
    els.notice.hidden = true;
  }
}
for (const el of [els.optSpeak, els.optVoice, els.optFont, els.optRate, els.optPause, els.optKey]) {
  el.addEventListener('change', () => { saveSettings(); applySettings(); });
  el.addEventListener('input', applySettings);
}

// ---------- conversation record (kept on this phone) ----------
// kind "interp": {from, to, src, dst}; kind "ai": {q, a}
const LOG_KEY = 'interp.log';
let history = [];
try { history = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch {}
function saveHistory() {
  history = history.slice(-300);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(history)); } catch {}
}
function clearHistory() {
  if (history.length && !confirm('대화 기록을 모두 지울까요?')) return;
  history = []; viewLog = false; saveHistory(); renderHistory();
}
$('clearBtn').onclick = clearHistory;
$('clearLog').onclick = clearHistory;

function replayBtn(text, lang) {
  const b = document.createElement('button');
  b.className = 'icon-btn replay';
  b.setAttribute('aria-label', '다시 듣기');
  b.innerHTML = icon('speaker');
  b.onclick = () => speak(text, lang);
  return b;
}
function entryEl(h) {
  const li = document.createElement('li');
  const time = new Date(h.at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  if (h.kind === 'ai') {
    li.className = 'msg ai';
    li.innerHTML = '<div class="msg-meta"><span class="tag ai">AI 비서</span><time></time></div><div class="src"></div><div class="dst"></div>';
    li.querySelector('time').textContent = time;
    li.querySelector('.src').textContent = h.q;
    const dst = li.querySelector('.dst');
    dst.textContent = h.a || '생각하는 중…';
    dst.classList.toggle('pending', !h.a || h.failed);
    if (h.a && !h.failed) li.querySelector('.msg-meta').appendChild(replayBtn(h.a, 'ko'));
    return li;
  }
  li.className = 'msg ' + h.from;
  li.innerHTML = `<div class="msg-meta"><span class="tag ${h.from}"></span><span class="arrow">→</span><span class="tag ${h.to}"></span><time></time></div>`
    + '<div class="src"></div><div class="dst"></div>';
  const tags = li.querySelectorAll('.tag');
  tags[0].textContent = LANGS[h.from].tag; tags[1].textContent = LANGS[h.to].tag;
  li.querySelector('time').textContent = time;
  li.querySelector('.src').textContent = h.src;
  const dst = li.querySelector('.dst');
  dst.textContent = h.dst || '번역 중…';
  dst.classList.toggle('pending', !h.dst || h.failed);
  if (h.dst && !h.failed) li.querySelector('.msg-meta').appendChild(replayBtn(h.dst, h.to));
  return li;
}
function renderHistory(scroll = false) {
  els.log.innerHTML = '';
  for (const h of history) els.log.appendChild(entryEl(h));
  layout();
  if (scroll && els.log.lastChild) els.log.lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// Home: the orb in the middle, the mic switch and the start button at the
// bottom. While the mic is on there, the Korean-only AI helper listens.
// The record only shows under "원문 보기", and the mic is fully off there.
let viewLog = false;
function layout() {
  els.logView.hidden = !viewLog;
  els.hero.hidden = viewLog;
  els.mic.hidden = viewLog;
  els.logBtn.textContent = viewLog ? '닫기' : '원문 보기';
  els.logBtn.setAttribute('aria-pressed', String(viewLog));
  const on = ctl.mode === 'assistant';
  els.mic.classList.toggle('on', on);
  els.mic.setAttribute('aria-pressed', String(on));
  els.mic.setAttribute('aria-label', on ? '마이크 끄기' : '마이크 켜기');
  els.mic.innerHTML = icon(on ? 'mic' : 'micoff');
  els.hero.classList.toggle('mic-off', !on);
  if (els.hero.hidden || ctl.mode === 'interpret') heroOrb.stop(); else heroOrb.start();
}
function heroCaption(q, a) {
  els.heroQ.textContent = q || '';
  els.heroA.textContent = a || '';
}

// ---------- helpers ----------
function detectLang(text, fallback) {
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (hangul || latin) return hangul * 2 >= latin ? 'ko' : 'en';
  return fallback;
}

let voices = [];
if ('speechSynthesis' in window) {
  voices = speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => { voices = speechSynthesis.getVoices(); };
}
function pickVoice(lang) {
  for (const code of LANGS[lang].tts) {
    const v = voices.find(v => v.lang.replace('_', '-') === code);
    if (v) return v;
  }
  return voices.find(v => v.lang.toLowerCase().startsWith(lang));
}
// Speech out loud. With a key it uses OpenAI's natural voices (the same kind
// of voice as ChatGPT); without one, or if that fails, the phone's own voice.
const player = new Audio();
let speakId = 0;
function stopSpeaking() {
  speakId++;
  player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
async function openaiSpeak(text, lang, id) {
  const rate = Number(els.optRate.value);
  const pace = rate < 0.8 ? 'slowly and clearly' : rate > 1.05 ? 'a little briskly' : 'at a calm, natural pace';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey() },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: els.optVoice.value,
      input: text,
      response_format: 'mp3',
      instructions: lang === 'ko'
        ? `Speak natural, warm standard Korean (서울 표준어) ${pace}, like a friendly person talking face to face.`
        : `Speak natural, friendly Canadian English ${pace}, like a local talking face to face.`,
    }),
  });
  if (!res.ok) throw new Error('tts HTTP ' + res.status);
  const blob = await res.blob();
  if (id !== speakId) return;
  const url = URL.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => {
      player.onended = resolve;
      player.onpause = resolve;
      player.onerror = () => reject(new Error('play failed'));
      player.src = url;
      player.play().catch(reject);
    });
  } finally {
    player.onended = player.onpause = player.onerror = null;
    URL.revokeObjectURL(url);
  }
}
function deviceSpeak(text, lang) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
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
async function speak(text, lang) {
  if (!els.optSpeak.checked) return;
  stopSpeaking();
  const id = speakId;
  if (apiKey() && els.optVoice.value !== 'device') {
    try { return await openaiSpeak(text, lang, id); } catch (e) { console.warn('[tts]', e); }
    if (id !== speakId) return;
  }
  return deviceSpeak(text, lang);
}

function caption(src, dst, from) {
  els.stageSrc.textContent = src || '';
  els.stageDst.textContent = dst || '';
  els.stageSrc.dataset.lang = from || '';
}

// Interpret one utterance (translate only, never answer), show it, and record it.
async function interpretText(text, fallbackLang) {
  const from = detectLang(text, fallbackLang);
  const to = LANGS[from].other;
  const h = { kind: 'interp', at: Date.now(), from, to, src: text, dst: '' };
  history.push(h);
  caption(text, '', from);
  try {
    h.dst = await Translator.translate(text, from, to, apiKey());
    caption(text, h.dst, from);
    saveHistory();
    return { out: h.dst, to, from };
  } catch {
    h.dst = '번역하지 못했어요. 인터넷 연결을 확인해 주세요.';
    h.failed = true;
    caption(text, h.dst, from);
    saveHistory();
    return null;
  }
}

// Answer a Korean question in Korean (AI helper mode).
async function answerText(text) {
  const h = { kind: 'ai', at: Date.now(), q: text, a: '' };
  history.push(h);
  heroCaption(text, '');
  // Only the recent conversation, so old failed answers don't steer new ones.
  const turns = history.filter(x => x.kind === 'ai' && x.a && !x.failed && x !== h && Date.now() - x.at < 30 * 60e3).map(x => ({ q: x.q, a: x.a }));
  try {
    h.a = await Assistant.ask(text, apiKey(), turns);
  } catch (e) {
    h.a = e.status === 401 ? 'API 키가 맞지 않아요. 설정을 확인해 주세요.' : '답을 가져오지 못했어요. 인터넷 연결을 확인해 주세요.';
    h.failed = true;
  }
  saveHistory();
  heroCaption(text, h.a);
  return h.failed ? null : h.a;
}

// ---------- controller ----------
// mode "interpret": full screen, Korean <-> English translation only.
// mode "assistant": home screen with the mic on, Korean only, AI answers in Korean.
// mode "off": nothing listening.
const ctl = {
  mode: 'off',
  userMuted: false,
  setMuted(m) {
    this.userMuted = m;
    $('stageMute').classList.toggle('muted-on', m);
    $('stageMute').innerHTML = icon(m ? 'micoff' : 'mic');
    if (autoEngine.listener) autoEngine.listener.muted = m;
    if (m) { basicEngine.stop(); this.status('마이크를 잠시 껐어요', 'idle'); }
    else { this.status('듣고 있어요'); if (this.mode === 'interpret' && !apiKey()) basicEngine.listen(); }
  },
  status(text, state = 'listening') {
    if (this.mode === 'interpret') { els.status.textContent = text; orb.setState(state); }
    else if (this.mode === 'assistant') heroOrb.setState(state);
  },
  setLevel(v) { orb.setLevel(this.mode === 'interpret' ? v : 0); heroOrb.setLevel(this.mode === 'assistant' ? v : 0); },

  async startInterpret() {
    // iOS only allows speech output after a tap; a silent utterance unlocks it.
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    const prev = this.mode;
    this.mode = 'interpret';
    viewLog = false;
    layout();
    els.stageMode.textContent = apiKey() ? '통역 중 · 한국어 ⇄ English' : '기본 모드 · 번갈아 듣기';
    caption('', '말씀하시면 그대로 통역해요');
    this.setMuted(false);
    stopSpeaking();
    autoEngine.dropQueue('assistant');
    heroOrb.stop();
    els.stage.hidden = false;
    document.body.classList.add('staged');
    orb.setLevel(0);
    orb.start();
    this.status('듣고 있어요');
    try {
      if (apiKey()) { if (prev === 'off' || !autoEngine.listener) await autoEngine.start(); }
      else await basicEngine.start();
    } catch (e) {
      console.warn(e);
      this.off();
      alert('마이크를 켤 수 없어요. 브라우저 설정에서 이 사이트의 마이크 사용을 허용해 주세요.');
    }
  },

  // "통역 중단" (✕): back to the home screen with only the start button,
  // and the mic stays on there for the Korean-only AI helper.
  async stopInterpret() {
    this.setMuted(false);
    stopSpeaking();
    basicEngine.stop();
    orb.stop();
    els.stage.hidden = true;
    document.body.classList.remove('staged');
    heroCaption('', '');
    if (apiKey()) {
      this.mode = 'assistant';
      autoEngine.dropQueue('interpret');
      layout();
      if (!autoEngine.listener) {
        try { await autoEngine.start(); } catch { return this.off(); }
      }
      this.status('listening');
    } else {
      this.off();
    }
  },

  async startAssistant() {
    if (!apiKey()) { showTab('settings'); return; }
    this.mode = 'assistant';
    layout();
    try { await autoEngine.start(); } catch { alert('마이크를 켤 수 없어요. 브라우저 설정에서 이 사이트의 마이크 사용을 허용해 주세요.'); return this.off(); }
    this.status('listening');
  },

  off() {
    this.mode = 'off';
    autoEngine.stop();
    basicEngine.stop();
    stopSpeaking();
    orb.stop();
    els.stage.hidden = true;
    document.body.classList.remove('staged');
    heroOrb.setState('idle');
    heroOrb.setLevel(0);
    layout();
  },
};
els.main.onclick = () => ctl.startInterpret();
$('stageStop').onclick = () => ctl.stopInterpret();
$('stageMute').onclick = () => ctl.setMuted(!ctl.userMuted);
els.mic.onclick = () => (ctl.mode === 'assistant' ? ctl.off() : ctl.startAssistant());
// "원문 보기": the record only, with no microphone at all.
let micBeforeLog = false;
els.logBtn.onclick = () => {
  if (!viewLog) {
    micBeforeLog = ctl.mode === 'assistant';
    if (ctl.mode !== 'off') ctl.off();
    viewLog = true;
    renderHistory(true);
  } else {
    viewLog = false;
    layout();
    if (micBeforeLog) ctl.startAssistant();
  }
};

// With a key: the mic stays open and each sentence is cut out and sent to
// speech recognition with automatic language detection. Each clip remembers
// which mode it was spoken in, so a stop never mixes the two behaviors.
const autoEngine = {
  queue: [], busy: false, listener: null,
  async start() {
    if (this.listener) return;
    this.queue = [];
    const listener = new VoiceListener({
      pauseMs: Number(els.optPause.value),
      onLevel: lv => ctl.setLevel(lv),
      onSpeechStart: () => ctl.status('듣고 있어요…', 'hearing'),
      onSegment: blob => {
        if (!blob) return ctl.status(ctl.mode === 'assistant' ? '한국어로 물어보세요' : '듣고 있어요');
        this.queue.push({ blob, mode: ctl.mode });
        this.pump();
      },
    });
    this.listener = listener;
    try { await listener.start(); } catch (e) { this.listener = null; throw e; }
  },
  dropQueue(mode) { this.queue = this.queue.filter(q => q.mode !== mode); },
  idle() { ctl.status(ctl.mode === 'assistant' ? '한국어로 물어보세요' : '듣고 있어요'); },
  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length && this.listener) {
      const { blob, mode } = this.queue.shift();
      if (mode !== ctl.mode) continue;
      ctl.status('알아듣는 중…', 'thinking');
      let text = '';
      try {
        text = await STT.transcribe(blob, apiKey());
      } catch (e) {
        console.warn('[stt]', e);
        ctl.status(e.status === 401 ? 'API 키가 맞지 않아요. 설정을 확인해 주세요.' : '음성인식에 실패했어요. 인터넷을 확인해 주세요.');
        continue;
      }
      if (mode !== ctl.mode || !text || !(HANGUL.test(text) || LATIN.test(text))) { this.idle(); continue; }

      let out = null, lang = null;
      if (mode === 'interpret') {
        ctl.status('통역 중…', 'thinking');
        const res = await interpretText(text, 'ko');
        if (res) { out = res.out; lang = res.to; }
      } else {
        // AI helper hears Korean only; anything else is ignored.
        if (!Assistant.isKorean(text)) { ctl.status('한국어만 들어요'); setTimeout(() => this.idle(), 1500); continue; }
        ctl.status('생각하는 중…', 'thinking');
        out = await answerText(text);
        lang = 'ko';
      }
      if (out && mode === ctl.mode && this.listener) {
        // Stop listening while the phone speaks so it doesn't hear itself.
        this.listener.muted = true;
        ctl.status(lang === 'en' ? 'Speaking English' : '말하는 중', 'speaking');
        await speak(out, lang);
        await new Promise(r => setTimeout(r, 250));
        if (this.listener) this.listener.muted = ctl.userMuted;
      }
      if (this.listener && !ctl.userMuted) this.idle();
    }
    this.busy = false;
  },
  stop() {
    this.listener?.stop();
    this.listener = null;
    this.queue = [];
  },
};

// Without a key: the browser recognizer hears one language at a time,
// so it alternates Korean and English automatically after each translation.
const basicEngine = {
  lang: 'ko', rec: null,
  start() {
    if (!SR) throw new Error('no speech recognition');
    this.listen();
  },
  listen() {
    if (ctl.mode !== 'interpret' || apiKey() || ctl.userMuted) return;
    const rec = new SR();
    this.rec = rec;
    rec.lang = LANGS[this.lang].code;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    ctl.status(this.lang === 'ko' ? '한국어를 듣고 있어요' : 'Listening for English');
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      // No raw audio level here, so each partial result nudges the orb.
      orb.setLevel(0.5);
      setTimeout(() => orb.setLevel(0.1), 180);
      ctl.status('듣고 있어요…', 'hearing');
      caption((finalText + interim).trim(), '', this.lang);
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        ctl.off();
        alert('마이크 권한이 필요해요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.');
      }
    };
    rec.onend = async () => {
      if (this.rec !== rec) return;
      this.rec = null;
      const text = finalText.trim();
      if (ctl.mode !== 'interpret') return;
      if (!text) { this.lang = LANGS[this.lang].other; return setTimeout(() => this.listen(), 200); }
      ctl.status('통역 중…', 'thinking');
      const res = await interpretText(text, this.lang);
      if (res && ctl.mode === 'interpret') {
        ctl.status(res.to === 'en' ? 'Speaking English' : '말하는 중', 'speaking');
        await speak(res.out, res.to);
        this.lang = res.to;
      }
      this.listen();
    };
    try { rec.start(); } catch (e) { console.warn(e); setTimeout(() => this.listen(), 500); }
  },
  stop() {
    const rec = this.rec;
    this.rec = null;
    rec?.abort();
  },
};

loadSettings();
renderHistory();
try { const t = localStorage.getItem('app.tab'); if (t && $('tab-' + t)) showTab(t); } catch {}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
