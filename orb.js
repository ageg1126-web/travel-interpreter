// The voice orb: a clear glass marble with coloured liquid swirling inside
// (the user picked this "liquid glass" look in October 2026). Quiet, the
// liquid drifts slowly; with sound the surface wobbles and ripples spread out;
// while thinking a coral arc runs around it. Colours follow the theme tokens.
class VoiceOrb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'listening';
    this.target = 0;
    this.level = 0;
    this.raf = null;
    this.swirl = 0;
    this.rings = [];
    this.lastRing = 0;
    this.readColors();
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.readColors());
  }

  readColors() {
    const cs = getComputedStyle(this.canvas);
    const hex = (name, fallback) => {
      let h = (cs.getPropertyValue(name) || fallback).trim().replace('#', '');
      if (h.length === 3) h = [...h].map(c => c + c).join('');
      const n = parseInt(h, 16);
      return [n >> 16 & 255, n >> 8 & 255, n & 255];
    };
    this.P = hex('--primary', '#00696B');
    this.A = hex('--accent', '#E8603F');
    this.PC = hex('--pc', '#BFEBE6');
  }

  setState(s) { this.state = s; }
  setLevel(v) { this.target = v; }

  start() {
    if (this.raf) return;
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
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
    const W = c.width, cx = W / 2, cy = W * 0.47, R = W * 0.3;
    const rgba = (col, a) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const WHITE = [255, 255, 255], BLACK = [0, 0, 0], TAU = Math.PI * 2;

    // Driving level: microphone while listening, a speech-like pulse while the phone talks.
    let target = this.target;
    if (this.state === 'speaking') target = 0.45 + 0.4 * Math.abs(Math.sin(t * 4.3) * Math.sin(t * 1.7 + 1.3));
    else if (this.state === 'thinking' || this.state === 'idle') target = 0;
    this.level += (target - this.level) * (target > this.level ? 0.4 : 0.12);
    const L = this.level;
    this.swirl += dt * (0.25 + L * 2.2 + (this.state === 'thinking' ? 0.9 : 0));

    ctx.clearRect(0, 0, W, W);
    const box = [cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8];

    // soft glow and ripples outside the ball
    let g = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.65);
    g.addColorStop(0, rgba(this.P, 0.14 + L * 0.3)); g.addColorStop(1, rgba(this.P, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    if ((this.state === 'speaking' || L > 0.35) && t - this.lastRing > 0.5) { this.rings.push({ r: 1.02, a: 0.55 }); this.lastRing = t; }
    this.rings = this.rings.filter(r => { r.r += dt * 0.45; r.a -= dt * 0.5; return r.a > 0; });
    for (const r of this.rings) {
      ctx.beginPath(); ctx.arc(cx, cy, R * r.r, 0, TAU);
      ctx.strokeStyle = rgba(this.P, r.a * 0.55); ctx.lineWidth = W * 0.006; ctx.stroke();
    }

    // shadow on the ground
    ctx.save(); ctx.translate(cx, cy + R * 1.2); ctx.scale(1, 0.16);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, TAU); ctx.fill(); ctx.restore();

    // the wobbling outline
    const amp = 0.01 + L * 0.055, path = new Path2D(), N = 140;
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU;
      const r = R * (1 + L * 0.04 + amp * (Math.sin(3 * a + t * 1.3) * 0.6 + Math.sin(5 * a - t * 1.9) * 0.3 + Math.sin(2 * a + t * 0.7) * 0.4));
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    path.closePath();

    // liquid inside
    ctx.save(); ctx.clip(path);
    g = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    g.addColorStop(0, rgba(mix(this.PC, WHITE, 0.45), 1)); g.addColorStop(1, rgba(this.P, 1));
    ctx.fillStyle = g; ctx.fillRect(...box);
    ctx.filter = `blur(${W * 0.035}px)`;
    [[mix(this.A, WHITE, 0.2), 0.5, 0], [mix(this.P, WHITE, 0.4), 0.6, 2.1], [this.PC, 0.7, 4.2], [mix(this.P, BLACK, 0.25), 0.5, 1]].forEach(([col, rr, off], i) => {
      const a = this.swirl * (i % 2 ? 1 : -1) * (0.8 + i * 0.15) + off, d = R * (0.35 + 0.12 * Math.sin(t * 0.6 + i));
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, R * rr);
      gg.addColorStop(0, rgba(col, 0.8)); gg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gg; ctx.fillRect(...box);
    });
    ctx.filter = 'none';
    // glass: darker rim and light gathered at the bottom
    g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.2, cx, cy, R * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.72, 'rgba(255,255,255,0)'); g.addColorStop(1, rgba(mix(this.P, BLACK, 0.45), 0.38));
    ctx.fillStyle = g; ctx.fillRect(...box);
    g = ctx.createRadialGradient(cx, cy + R * 0.78, 0, cx, cy + R * 0.78, R * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(...box);
    ctx.restore();

    // highlight and rim
    ctx.save(); ctx.translate(cx - R * 0.36, cy - R * 0.5); ctx.rotate(-0.55); ctx.scale(1, 0.5);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.44);
    g.addColorStop(0, 'rgba(255,255,255,.92)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.44, 0, TAU); ctx.fill(); ctx.restore();
    ctx.lineWidth = W * 0.006; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke(path);

    if (this.state === 'thinking') {
      const a0 = t * 2.4;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, a0, a0 + 1.5);
      ctx.strokeStyle = rgba(this.A, 0.85); ctx.lineWidth = W * 0.014; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
}
