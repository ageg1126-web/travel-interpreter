// Continuous microphone listener with a simple voice-activity detector.
// It cuts the audio into one clip per spoken sentence and hands each clip
// over as a 16 kHz mono WAV blob, so nobody has to press a button per turn.
class VoiceListener {
  constructor({ onSegment, onLevel, onSpeechStart, pauseMs = 800 }) {
    this.onSegment = onSegment;
    this.onLevel = onLevel || (() => {});
    this.onSpeechStart = onSpeechStart || (() => {});
    this.pauseMs = pauseMs;
    this.muted = false;
    this.ctx = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but is the one option that works on every phone browser.
    this.proc = this.ctx.createScriptProcessor(2048, 1, 1);
    src.connect(this.proc);
    this.proc.connect(this.ctx.destination);

    const rate = this.ctx.sampleRate;
    const frameMs = (2048 / rate) * 1000;
    const preRollFrames = Math.ceil(350 / frameMs);
    const maxFrames = Math.ceil(20000 / frameMs);
    let noise = 0.01, speaking = false, loudRun = 0, quietRun = 0;
    let preRoll = [], clip = [], voicedFrames = 0;

    this.proc.onaudioprocess = e => {
      const input = e.inputBuffer.getChannelData(0);
      const out = e.outputBuffer.getChannelData(0);
      out.fill(0);
      if (this.muted) { this.onLevel(0); if (speaking) { speaking = false; clip = []; } return; }

      const frame = new Float32Array(input);
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);
      const threshold = Math.max(0.012, noise * 2.8);
      const loud = rms > threshold;
      this.onLevel(Math.min(1, rms / (threshold * 3)));

      if (!speaking) {
        // Track background noise only while nobody is talking.
        noise = noise * 0.95 + rms * 0.05;
        preRoll.push(frame);
        if (preRoll.length > preRollFrames) preRoll.shift();
        loudRun = loud ? loudRun + 1 : 0;
        if (loudRun >= 2) {
          speaking = true; quietRun = 0; voicedFrames = loudRun;
          clip = preRoll.slice(); preRoll = [];
          this.onSpeechStart();
        }
        return;
      }

      clip.push(frame);
      if (loud) { quietRun = 0; voicedFrames++; } else quietRun++;
      const ended = quietRun * frameMs >= this.pauseMs || clip.length >= maxFrames;
      if (ended) {
        speaking = false; loudRun = 0;
        const done = clip; clip = [];
        // Ignore coughs and clicks: need at least ~300 ms of actual voice.
        if (voicedFrames * frameMs >= 300) this.onSegment(encodeWav(done, rate));
        else this.onSegment(null);
      }
    };
  }

  stop() {
    if (this.proc) this.proc.onaudioprocess = null;
    try { this.proc?.disconnect(); } catch {}
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close();
    this.ctx = this.proc = this.stream = null;
  }
}

function encodeWav(frames, inRate, outRate = 16000) {
  const total = frames.reduce((n, f) => n + f.length, 0);
  const merged = new Float32Array(total);
  let o = 0;
  for (const f of frames) { merged.set(f, o); o += f.length; }
  const ratio = inRate / outRate;
  const len = Math.floor(total / ratio);
  const pcm = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    // Average the source samples covered by this output sample (cheap low-pass).
    const start = Math.floor(i * ratio), end = Math.min(total, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = start; j < end; j++) s += merged[j];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, end - start)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true); dv.setUint32(28, outRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}
