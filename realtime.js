// Live two-way interpreting with OpenAI's gpt-realtime-translate, a model made
// only for interpreting: it streams translated speech while the person is
// still talking and never answers on its own. Two sessions share the mic: one
// speaks English (for Korean speech), one speaks Korean (for English speech).
// Each stays quiet for speech already in its own language.
const LiveInterpreter = (() => {
  const BASE = 'https://api.openai.com/v1/realtime/translations';
  const HANGUL = /[가-힣]/;

  async function clientSecret(key, language) {
    const res = await fetch(BASE + '/client_secrets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          model: 'gpt-realtime-translate',
          audio: {
            input: { transcription: { model: 'gpt-realtime-whisper' }, noise_reduction: { type: 'near_field' } },
            output: { language },
          },
        },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j?.error?.message || 'HTTP ' + res.status), { status: res.status });
    const v = typeof j.client_secret === 'string' ? j.client_secret : j.client_secret?.value || j.value;
    if (!v) throw new Error('no client secret');
    return v;
  }

  const rms = analyser => {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return Math.sqrt(s / buf.length);
  };
  // Sentences of the transcript that are in the given language.
  function sentencesIn(text, lang) {
    return text.split(/(?<=[.!?。？！])\s+|\n+/)
      .filter(t => t.trim() && (lang === 'ko' ? HANGUL.test(t) : !HANGUL.test(t) && /[A-Za-z]/.test(t)))
      .join(' ').trim();
  }

  async function openSession(key, to, track, ac, events) {
    const s = { to, from: to === 'en' ? 'ko' : 'en', track, inText: '', outText: '', lastOut: 0, outLevel: 0, analyser: null };
    const secret = await clientSecret(key, to);
    const pc = new RTCPeerConnection();
    s.pc = pc;
    pc.addTrack(track, new MediaStream([track]));
    s.audio = new Audio();
    s.audio.autoplay = true;
    pc.ontrack = ({ streams }) => {
      s.audio.srcObject = streams[0];
      s.audio.play().catch(() => {});
      // Watch the translated voice's loudness (the orb, and muting the mic to the other session).
      const src = ac.createMediaStreamSource(streams[0]);
      s.analyser = ac.createAnalyser();
      s.analyser.fftSize = 1024;
      src.connect(s.analyser);
    };
    const dc = pc.createDataChannel('oai-events');
    dc.onmessage = ({ data }) => {
      let ev;
      try { ev = JSON.parse(data); } catch { return; }
      if (ev.type === 'session.output_transcript.delta') {
        s.outText += ev.delta || '';
        s.lastOut = performance.now();
        events.onText(s);
      } else if (ev.type === 'session.input_transcript.delta') {
        s.inText = (s.inText + (ev.delta || '')).slice(-800);
        events.onText(s);
      } else if (ev.type === 'error' || /error/.test(ev.type || '')) {
        events.onError(new Error(ev.error?.message || ev.message || 'translation error'));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') events.onError(new Error('connection ' + pc.connectionState));
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(BASE + '/calls', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });
    if (!res.ok) throw Object.assign(new Error('calls HTTP ' + res.status), { status: res.status });
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    return s;
  }

  // handlers: onLevel(v), onState(state), onCaption(src, dst, from), onEntry({from,to,src,dst}), onError(e), onIdle()
  async function start(key, handlers) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const mic = stream.getAudioTracks()[0];
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const micAnalyser = ac.createAnalyser();
    micAnalyser.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(micAnalyser);

    let closed = false, muted = false, timer = null, failed = false;
    const sessions = [];
    const finish = s => {
      const dst = s.outText.trim();
      if (dst) handlers.onEntry({ from: s.from, to: s.to, src: sentencesIn(s.inText, s.from), dst });
      s.outText = ''; s.inText = '';
    };
    const events = {
      onText(s) {
        if (s.outText.trim()) handlers.onCaption(sentencesIn(s.inText, s.from).slice(-160), s.outText.trim(), s.from);
        else {
          const src = sentencesIn(s.inText, s.from);
          if (src) handlers.onCaption(src.slice(-160), '', s.from);
        }
      },
      onError(e) { if (!closed && !failed) { failed = true; handlers.onError(e); } },
    };

    try {
      // Separate copies of the mic so each session can be muted on its own.
      const [toEn, toKo] = await Promise.all([
        openSession(key, 'en', mic.clone(), ac, events),
        openSession(key, 'ko', mic.clone(), ac, events),
      ]);
      sessions.push(toEn, toKo);
    } catch (e) {
      sessions.forEach(s => s.pc.close());
      stream.getTracks().forEach(t => t.stop());
      ac.close().catch(() => {});
      throw e;
    }

    let lastActive = performance.now();
    let gateUntil = { en: 0, ko: 0 };
    timer = setInterval(() => {
      const now = performance.now();
      const micLv = Math.min(1, rms(micAnalyser) * 9);
      let speaking = false;
      for (const s of sessions) {
        s.outLevel = s.analyser ? Math.min(1, rms(s.analyser) * 9) : 0;
        if (s.outLevel > 0.06) { speaking = true; gateUntil[s.to] = now + 450; }
        // A finished stretch of translation becomes one line in the record.
        if (s.outText && now - s.lastOut > 1600) finish(s);
      }
      // While the phone speaks English, the Korean session must not hear it (and the other way round).
      const [toEn, toKo] = sessions;
      toKo.track.enabled = !muted && now > gateUntil.en;
      toEn.track.enabled = !muted && now > gateUntil.ko;

      const out = Math.max(...sessions.map(s => s.outLevel));
      if (speaking) { handlers.onState('speaking'); handlers.onLevel(out); }
      else if (!muted && micLv > 0.12) { handlers.onState('hearing'); handlers.onLevel(micLv); }
      else { handlers.onState(muted ? 'idle' : 'listening'); handlers.onLevel(muted ? 0 : micLv); }
      if (speaking || micLv > 0.12) lastActive = now;
      // Billing runs while sessions are open, so close them after a long silence.
      if (now - lastActive > 5 * 60e3) handlers.onIdle();
    }, 50);

    return {
      setMuted(m) { muted = m; },
      stop() {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        sessions.forEach(s => { finish(s); s.pc.close(); s.audio.srcObject = null; s.track.stop(); });
        stream.getTracks().forEach(t => t.stop());
        ac.close().catch(() => {});
      },
    };
  }

  return { start };
})();
