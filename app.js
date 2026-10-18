const $ = id => document.getElementById(id);
const LANGS = {
  ko: { code: 'ko-KR', other: 'en', flag: '🇰🇷', tts: ['ko-KR'] },
  en: { code: 'en-US', other: 'ko', flag: '🇨🇦', tts: ['en-CA', 'en-US', 'en-GB'] },
};
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const LATIN = /[A-Za-z]/;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const els = {
  log: $('log'), empty: $('emptyLog'), notice: $('notice'), badge: $('engineBadge'),
  main: $('mainBtn'), mainIcon: $('mainIcon'), mainLabel: $('mainLabel'), status: $('liveStatus'),
  optKey: $('optKey'), keyState: $('keyState'), optSpeak: $('optSpeak'),
  optFont: $('optFont'), optRate: $('optRate'), optPause: $('optPause'),
};

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + name; });
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name !== 'interpret' && interp.running) interp.stop();
  try { localStorage.setItem('app.tab', name); } catch {}
  document.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
}
document.querySelectorAll('.tabbar button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

// ---------- settings (stored on this phone only) ----------
const SETTINGS_KEY = 'interp.settings';
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if ('speak' in s) els.optSpeak.checked = s.speak;
    for (const k of ['font', 'rate', 'pause']) if (s[k]) els['opt' + k[0].toUpperCase() + k.slice(1)].value = s[k];
    els.optKey.value = localStorage.getItem('interp.openaiKey') || '';
  } catch {}
  applySettings();
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      speak: els.optSpeak.checked, font: els.optFont.value, rate: els.optRate.value, pause: els.optPause.value,
    }));
    localStorage.setItem('interp.openaiKey', els.optKey.value.trim());
  } catch {}
}
function apiKey() { return els.optKey.value.trim(); }
function applySettings() {
  document.documentElement.style.setProperty('--font', els.optFont.value + 'px');
  const key = apiKey();
  els.keyState.textContent = key ? '✓ 키가 저장돼 있어요. 자동 언어 감지로 통역해요.' : '키가 없으면 기본 모드(한국어와 영어를 번갈아 듣기)로 동작해요.';
  els.badge.textContent = key ? '자동 감지' : '기본 모드';
  if (!key) {
    els.notice.hidden = false;
    els.notice.innerHTML = '지금은 <b>기본 모드</b>예요. 한국어와 영어를 번갈아 들어요. 순서 없이 자동으로 알아듣게 하려면 설정에서 OpenAI 키를 넣어 주세요.<br><button type="button" id="goSettings">설정 열기</button>';
    $('goSettings').onclick = () => showTab('settings');
  } else {
    els.notice.hidden = true;
  }
}
for (const el of [els.optSpeak, els.optFont, els.optRate, els.optPause, els.optKey]) {
  el.addEventListener('change', () => { saveSettings(); applySettings(); });
  el.addEventListener('input', applySettings);
}
$('clearBtn').onclick = () => { els.log.innerHTML = ''; els.log.appendChild(els.empty); };

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

function addEntry(srcText, srcLang) {
  els.empty.remove();
  const li = document.createElement('li');
  li.className = 'msg ' + srcLang;
  li.innerHTML = '<div class="src"></div><div class="dst pending">번역 중…</div>';
  li.querySelector('.src').textContent = LANGS[srcLang].flag + ' ' + srcText;
  els.log.appendChild(li);
  li.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return li;
}
function fillEntry(li, text, lang, failed) {
  const dst = li.querySelector('.dst');
  dst.textContent = (failed ? '' : LANGS[lang].flag + ' ') + text;
  dst.classList.toggle('pending', !!failed);
  if (!failed) {
    const b = document.createElement('button');
    b.className = 'replay';
    b.textContent = '🔊 다시 듣기';
    b.onclick = () => speak(text, lang);
    li.appendChild(b);
  }
  li.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// Translate one utterance, show it and read it out.
async function interpretText(text, fallbackLang) {
  const from = detectLang(text, fallbackLang);
  const to = LANGS[from].other;
  const li = addEntry(text, from);
  try {
    const out = await Translator.translate(text, from, to, apiKey());
    fillEntry(li, out, to);
    return { out, to, from };
  } catch {
    fillEntry(li, '번역하지 못했어요. 인터넷 연결을 확인해 주세요.', to, true);
    return null;
  }
}

// ---------- interpreter controller ----------
const interp = {
  running: false,
  status(text, hearing = false) {
    els.status.textContent = text;
    els.main.classList.toggle('hearing', hearing);
  },
  render() {
    els.main.classList.toggle('on', this.running);
    els.main.setAttribute('aria-pressed', String(this.running));
    els.mainIcon.textContent = this.running ? '⏹' : '🎤';
    els.mainLabel.textContent = this.running ? '통역 멈추기' : '통역 시작';
    if (!this.running) { this.status('대기 중'); els.main.style.setProperty('--level', 0); }
  },
  async start() {
    // iOS only allows speech output after a tap; a silent utterance unlocks it.
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    this.running = true;
    this.render();
    try {
      this.engine = apiKey() ? autoEngine : basicEngine;
      await this.engine.start();
    } catch (e) {
      console.warn(e);
      this.stop();
      alert('마이크를 켤 수 없어요. 브라우저 설정에서 이 사이트의 마이크 사용을 허용해 주세요.');
    }
  },
  stop() {
    this.running = false;
    this.engine?.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.render();
  },
};
els.main.onclick = () => (interp.running ? interp.stop() : interp.start());

// Auto mode: always listening, language detected per sentence by OpenAI.
const autoEngine = {
  queue: [], busy: false, listener: null,
  async start() {
    this.queue = [];
    this.listener = new VoiceListener({
      pauseMs: Number(els.optPause.value),
      onLevel: lv => els.main.style.setProperty('--level', lv.toFixed(2)),
      onSpeechStart: () => interp.status('듣고 있어요…', true),
      onSegment: blob => {
        if (!blob) return interp.status('말씀하시면 바로 통역해요');
        this.queue.push(blob);
        this.pump();
      },
    });
    await this.listener.start();
    interp.status('말씀하시면 바로 통역해요 (한국어 · English)');
  },
  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length && interp.running) {
      const blob = this.queue.shift();
      interp.status('알아듣는 중…');
      let text = '';
      try {
        text = await STT.transcribe(blob, apiKey());
      } catch (e) {
        console.warn('[stt]', e);
        interp.status(e.status === 401 ? 'API 키가 맞지 않아요. 설정을 확인해 주세요.' : '음성인식에 실패했어요. 인터넷을 확인해 주세요.');
        continue;
      }
      if (!text || !(HANGUL.test(text) || LATIN.test(text))) continue;
      interp.status('통역 중…');
      const res = await interpretText(text, 'ko');
      if (res && interp.running) {
        // Stop listening while the phone speaks so it doesn't translate itself.
        this.listener.muted = true;
        interp.status('읽어주는 중…');
        await speak(res.out, res.to);
        await new Promise(r => setTimeout(r, 250));
        this.listener.muted = false;
      }
    }
    this.busy = false;
    if (interp.running) interp.status('말씀하시면 바로 통역해요 (한국어 · English)');
  },
  stop() {
    this.listener?.stop();
    this.listener = null;
    this.queue = [];
  },
};

// Basic mode (no key): the browser recognizer hears one language at a time,
// so it alternates Korean and English automatically after each translation.
const basicEngine = {
  lang: 'ko', rec: null,
  start() {
    if (!SR) throw new Error('no speech recognition');
    this.listen();
  },
  listen() {
    if (!interp.running) return;
    const rec = new SR();
    this.rec = rec;
    rec.lang = LANGS[this.lang].code;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    interp.status(this.lang === 'ko' ? '한국어를 듣고 있어요' : 'Listening for English', true);
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      interp.status((finalText + interim).trim() || '…', true);
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        interp.stop();
        alert('마이크 권한이 필요해요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.');
      }
    };
    rec.onend = async () => {
      if (this.rec !== rec) return;
      this.rec = null;
      const text = finalText.trim();
      if (!interp.running) return;
      if (!text) { this.lang = LANGS[this.lang].other; return setTimeout(() => this.listen(), 200); }
      interp.status('통역 중…');
      const res = await interpretText(text, this.lang);
      if (res && interp.running) {
        interp.status('읽어주는 중…');
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
interp.render();
try { const t = localStorage.getItem('app.tab'); if (t && $('tab-' + t)) showTab(t); } catch {}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
