// The voice orb: a perfect, slowly drifting cloudy sphere at rest. While
// someone talks its edge snaps into sharp, irregular waves, every burst of
// sound kicks out a spike, and small sparks fly off the rim.
class VoiceOrb {
  // Each palette: top, middle, bottom of the sphere.
  static PALETTES = {
    listening: [[38, 84, 196], [118, 166, 242], [228, 238, 252]],
    hearing: [[38, 84, 196], [118, 166, 242], [228, 238, 252]],
    thinking: [[86, 64, 190], [160, 140, 240], [236, 232, 252]],
    speaking: [[30, 70, 180], [96, 150, 245], [214, 230, 255]],
    idle: [[150, 154, 162], [200, 203, 208], [236, 237, 240]],
  };

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
    this.kicks = [];   // short-lived spikes on the edge: {a, life, h}
    this.sparks = [];  // particles flying off the rim
    this.flash = 0;
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

    // A sudden rise in loudness (a syllable hitting) kicks the edge and throws sparks.
    const rise = target - this.prevTarget;
    this.prevTarget = target;
    if (rise > 0.08 && target > 0.15 && this.kicks.length < 6) this.kick(Math.min(1, target + rise));
    if (lv > 0.25 && Math.random() < lv * 0.5) this.spark(lv);
    this.flash = Math.max(0, this.flash - dt * 4);

    // Wave phases run faster the louder it is, so loud speech looks electric.
    this.drift += dt * (0.8 + lv * 9);
    const d = this.drift;

    const pal = VoiceOrb.PALETTES[this.state] || VoiceOrb.PALETTES.listening;
    this.colors.forEach((col, i) => col.forEach((v, j) => { col[j] = v + (pal[i][j] - v) * 0.05; }));
    const rgb = (k, a = 1) => `rgba(${this.colors[k].map(Math.round).join(',')},${a})`;

    ctx.clearRect(0, 0, W, W);

    // Edge: perfectly round at rest; irregular, large waves with sound.
    const amp = lv * 0.13;
    const scale = 1 + lv * 0.05 + this.flash * 0.03 + (this.state === 'thinking' ? 0.015 * Math.sin(t * 3) : 0);
    const N = 220;
    for (const k of this.kicks) k.life -= dt * 3.2;
    this.kicks = this.kicks.filter(k => k.life > 0);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = 0.42 * Math.sin(2 * a + d * 1.3) * Math.sin(d * 0.7 + 1)
              + 0.30 * Math.sin(3 * a - d * 1.9 + 2)
              + 0.18 * Math.sin(5 * a + d * 2.6) * Math.cos(d * 1.1)
              + 0.10 * Math.sin(7 * a - d * 3.4 + 4)
              + 0.12 * lv * Math.sin(11 * a + d * 5.1)
              + 0.08 * lv * Math.sin(17 * a - d * 7.3 + 1);
      // Sharpen the peaks so the edge looks crackly rather than wobbly.
      let e = Math.sign(w) * Math.pow(Math.abs(w), 0.6);
      for (const k of this.kicks) {
        const da = Math.atan2(Math.sin(a - k.a), Math.cos(a - k.a));
        e += k.h * k.life * k.life * Math.exp(-(da * da) / 0.012);
      }
      const r = R * scale * (1 + amp * e);
      const x = cx + r * Math.cos(a), y = cx + r * Math.sin(a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
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

    // Sparks fly off the rim and fade.
    if (this.sparks.length) {
      ctx.save();
      for (const sp of this.sparks) {
        sp.life -= dt / sp.ttl;
        sp.dist += dt * sp.v;
        if (sp.life <= 0) continue;
        const r0 = R * scale * (1 + sp.dist), r1 = r0 + R * 0.06 * sp.life;
        const ca = Math.cos(sp.a), sa = Math.sin(sp.a);
        ctx.strokeStyle = rgb(sp.deep ? 0 : 1, sp.life);
        ctx.lineWidth = Math.max(1, W * 0.007 * sp.life);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + r0 * ca, cx + r0 * sa);
        ctx.lineTo(cx + r1 * ca, cx + r1 * sa);
        ctx.stroke();
      }
      ctx.restore();
      this.sparks = this.sparks.filter(sp => sp.life > 0 && sp.dist < 0.36);
    }
  }

  kick(h) {
    this.kicks.push({ a: Math.random() * Math.PI * 2, life: 1, h: 0.9 + h * 0.8 });
    this.flash = Math.min(1, this.flash + h * 0.6);
    const n = 3 + Math.round(h * 4);
    for (let i = 0; i < n; i++) this.spark(h);
  }

  spark(lv) {
    if (this.calm || this.sparks.length > 40) return;
    this.sparks.push({
      a: Math.random() * Math.PI * 2, dist: 0.04 + Math.random() * 0.06,
      v: 0.35 + Math.random() * 0.5 + lv * 0.4, ttl: 0.35 + Math.random() * 0.35,
      life: 1, deep: Math.random() < 0.5,
    });
  }
}
