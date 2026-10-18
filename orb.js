// The voice orb: a perfect, slowly drifting cloudy sphere at rest that breaks
// into large irregular waves around its edge while someone is talking.
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
    this.level += (target - this.level) * (target > this.level ? 0.3 : 0.06);
    const lv = this.calm ? this.level * 0.6 : this.level;

    // Wave phases run faster the louder it is, so loud speech looks turbulent.
    this.drift += dt * (0.6 + lv * 5);
    const d = this.drift;

    const pal = VoiceOrb.PALETTES[this.state] || VoiceOrb.PALETTES.listening;
    this.colors.forEach((col, i) => col.forEach((v, j) => { col[j] = v + (pal[i][j] - v) * 0.05; }));
    const rgb = (k, a = 1) => `rgba(${this.colors[k].map(Math.round).join(',')},${a})`;

    ctx.clearRect(0, 0, W, W);

    // Edge: perfectly round at rest; irregular, large waves with sound.
    const amp = lv * 0.14;
    const scale = 1 + lv * 0.06 + (this.state === 'thinking' ? 0.015 * Math.sin(t * 3) : 0);
    const N = 160;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const w = 0.42 * Math.sin(2 * a + d * 1.3) * Math.sin(d * 0.7 + 1)
              + 0.30 * Math.sin(3 * a - d * 1.9 + 2)
              + 0.18 * Math.sin(5 * a + d * 2.6) * Math.cos(d * 1.1)
              + 0.10 * Math.sin(7 * a - d * 3.4 + 4);
      const r = R * scale * (1 + amp * w);
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
    ctx.restore();
  }
}
