// The voice orb: a cloudy sphere whose uneven outline slowly breathes and
// shifts even when it is quiet. While someone talks a few large, sharp spikes
// jump out of the rim here and there, and each burst of sound pushes the
// nearest ones out further.
class VoiceOrb {
  // Each palette: top, middle, bottom of the sphere.
  static PALETTES = {
    listening: [[38, 84, 196], [118, 166, 242], [228, 238, 252]],
    hearing: [[38, 84, 196], [118, 166, 242], [228, 238, 252]],
    thinking: [[86, 64, 190], [160, 140, 240], [236, 232, 252]],
    speaking: [[30, 70, 180], [96, 150, 245], [214, 230, 255]],
    idle: [[150, 154, 162], [200, 203, 208], [236, 237, 240]],
  };

  static SPIKES = 16;

  constructor(canvas, { calm = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.calm = calm;
    this.state = 'listening';
    this.target = 0;
    this.level = 0;
    this.drift = 0;
    this.colors = VoiceOrb.PALETTES.listening.map(c => c.slice());
    this.raf = null;
    this.last = 0;
    this.prevTarget = 0;
    this.kicks = [];   // short-lived bursts on the edge: {a, life, h}
    this.flash = 0;
    // Pointed spikes around the rim; each one jumps to a new random length.
    this.spikes = Array.from({ length: VoiceOrb.SPIKES }, () => ({ v: 0, to: 0, next: 0 }));
    // Soft cloud puffs that float inside the sphere.
    this.puffs = Array.from({ length: 7 }, (_, i) => ({
      x: Math.cos(i * 2.4) * 0.45, y: -0.15 + Math.sin(i * 1.7) * 0.5, r: 0.38 + (i % 3) * 0.14,
      sx: 0.13 + i * 0.035, sy: 0.11 + (i % 4) * 0.03, p: i * 1.9, a: 0.35 + (i % 2) * 0.2,
    }));
  }

  setState(s) { this.state = s; }
  setLevel(v) { this.target = v; }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(now / 1000, dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = null; }

  draw(t, dt = 0.016) {
    const c = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round((c.clientWidth || c.width) * dpr);
    if (size && c.width !== size) { c.width = c.height = size; }
    const W = c.width, cx = W / 2, R = W * 0.36;

    // Driving level: microphone while listening, a speech-like pulse while the phone talks.
    let target = this.target;
    if (this.state === 'speaking') target = 0.45 + 0.4 * Math.abs(Math.sin(t * 4.3) * Math.sin(t * 1.7 + 1.3));
    else if (this.state === 'thinking' || this.state === 'idle') target = 0;
    // Snappy: jumps up at once with sound, falls back quickly.
    this.level += (target - this.level) * (target > this.level ? 0.55 : 0.16);
    const lv = this.calm ? this.level * 0.6 : this.level;

    // A sudden rise in loudness (a syllable hitting) shoots a cluster of long spikes.
    const rise = target - this.prevTarget;
    this.prevTarget = target;
    if (rise > 0.08 && target > 0.15 && this.kicks.length < 5) this.kick(Math.min(1, target + rise));
    this.flash = Math.max(0, this.flash - dt * 4);
    this.drift += dt * (0.3 + lv * 2);
    const d = this.drift;

    const pal = VoiceOrb.PALETTES[this.state] || VoiceOrb.PALETTES.listening;
    this.colors.forEach((col, i) => col.forEach((v, j) => { col[j] = v + (pal[i][j] - v) * 0.05; }));
    const rgb = (k, a = 1) => `rgba(${this.colors[k].map(Math.round).join(',')},${a})`;

    ctx.clearRect(0, 0, W, W);

    // Edge: an uneven rim that slowly shifts; large sharp spikes jump out with sound.
    const scale = 1 + lv * 0.04 + this.flash * 0.03 + (this.state === 'thinking' ? 0.015 * Math.sin(t * 3) : 0);
    const r0 = R * scale;
    for (const k of this.kicks) k.life -= dt * 3;
    this.kicks = this.kicks.filter(k => k.life > 0);
    const K = this.spikes.length, step = (Math.PI * 2) / K;
    const rot = d * 0.15; // the ring turns slowly so spikes never jump in the same places
    // The uneven rim: a few slow, overlapping bulges that never line up.
    const rim = a => r0 * (1 - lv * 0.02) * (1 + 0.055 * (
      0.50 * Math.sin(2 * a + 0.7 + t * 0.31)
      + 0.36 * Math.sin(3 * a + 2.1 - t * 0.23)
      + 0.24 * Math.sin(4 * a + 4.0 + t * 0.43)
      + 0.16 * Math.sin(6 * a + 1.3 - t * 0.37)));
    const at = (a, r) => ctx.lineTo(cx + r * Math.cos(a), cx + r * Math.sin(a));
    const arc = (from, to) => {
      for (let j = 0; j <= 6; j++) { const a = from + (to - from) * (j / 6); at(a, rim(a)); }
    };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + rim(rot) * Math.cos(rot), cx + rim(rot) * Math.sin(rot));
    for (let i = 0; i < K; i++) {
      const sp = this.spikes[i];
      // Only some spikes are out at any moment; each re-rolls every ~0.1–0.2 s.
      if (t > sp.next) {
        sp.to = Math.random() < 0.4 ? 0.45 + 0.55 * Math.random() : 0;
        sp.next = t + 0.1 + Math.random() * 0.1;
      }
      sp.v += (sp.to - sp.v) * 0.5;
      const a0 = rot + i * step, a1 = a0 + step, tip = a0 + step * 0.5;
      let len = lv * 0.42 * sp.v;
      for (const k of this.kicks) {
        const da = Math.atan2(Math.sin(tip - k.a), Math.cos(tip - k.a));
        len += k.h * k.life * Math.exp(-(da * da) / 0.25) * sp.v;
      }
      len = Math.min(len, 0.3);
      // Spikes snap in and out; tiny leftovers would only look like bumps.
      if (len < 0.08) { arc(a0, a1); continue; }
      // A sharp tooth across the middle of this slot, the uneven rim on either side.
      const w = step * 0.26;
      arc(a0, tip - w);
      at(tip, rim(tip) * (1 + len));
      arc(tip + w, a1);
    }
    ctx.closePath();
    ctx.clip();

    // Base: deep at the top, misty at the bottom.
    const base = ctx.createLinearGradient(0, cx - R * 1.2, 0, cx + R * 1.2);
    base.addColorStop(0, rgb(0));
    base.addColorStop(0.5, rgb(1));
    base.addColorStop(1, rgb(2));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, W);

    // Drifting clouds.
    const speed = 1 + lv * 2.5;
    for (const p of this.puffs) {
      const px = cx + R * (p.x + 0.28 * Math.sin(t * p.sx * speed + p.p));
      const py = cx + R * (p.y + 0.18 * Math.cos(t * p.sy * speed + p.p * 1.3));
      const pr = R * p.r * (1 + lv * 0.25);
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(255,255,255,${p.a})`);
      g.addColorStop(0.5, `rgba(255,255,255,${p.a * 0.35})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    // A gentle shade at the top gives the sphere depth.
    const shade = ctx.createLinearGradient(0, cx - R, 0, cx);
    shade.addColorStop(0, rgb(0, 0.55));
    shade.addColorStop(1, rgb(0, 0));
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, cx);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.22})`; ctx.fillRect(0, 0, W, W); }
    ctx.restore();

  }

  kick(h) {
    this.kicks.push({ a: Math.random() * Math.PI * 2, life: 1, h: 0.12 + h * 0.15 });
    this.flash = Math.min(1, this.flash + h * 0.5);
  }
}
