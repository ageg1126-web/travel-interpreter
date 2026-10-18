// The full-screen "voice orb": a soft circle that ripples with the microphone
// level while listening, pulses while the phone speaks, and shimmers while thinking.
class VoiceOrb {
  static PALETTES = {
    listening: [[150, 196, 255], [64, 120, 255], [24, 40, 120]],
    hearing: [[150, 196, 255], [64, 120, 255], [24, 40, 120]],
    thinking: [[206, 190, 255], [128, 96, 255], [44, 28, 112]],
    speaking: [[255, 190, 160], [255, 96, 64], [120, 30, 20]],
  };

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'listening';
    this.target = 0;
    this.level = 0;
    this.colors = VoiceOrb.PALETTES.listening.map(c => c.slice());
    this.raf = null;
  }

  setState(s) { this.state = s; }
  setLevel(v) { this.target = v; }

  start() {
    if (this.raf) return;
    const t0 = performance.now();
    const loop = now => { this.draw((now - t0) / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = null; }

  draw(t) {
    const c = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(c.clientWidth * dpr);
    if (c.width !== size) { c.width = c.height = size; }
    const W = c.width, cx = W / 2, R = W * 0.27;

    // Pick the driving level for the current state, then ease toward it.
    let target = this.target;
    if (this.state === 'speaking') target = 0.35 + 0.3 * Math.abs(Math.sin(t * 5.1) * Math.sin(t * 1.9 + 1));
    else if (this.state === 'thinking') target = 0.12;
    else if (this.state === 'listening') target = Math.max(0.04, this.target);
    this.level += (target - this.level) * (target > this.level ? 0.35 : 0.08);

    const pal = VoiceOrb.PALETTES[this.state] || VoiceOrb.PALETTES.listening;
    this.colors.forEach((col, i) => col.forEach((v, j) => { col[j] = v + (pal[i][j] - v) * 0.06; }));
    const rgb = (k, a = 1) => `rgba(${this.colors[k].map(Math.round).join(',')},${a})`;

    ctx.clearRect(0, 0, W, W);
    const breathe = 1 + 0.02 * Math.sin(t * 1.4);
    const spin = this.state === 'thinking' ? t * 1.2 : 0;

    // Three translucent layers with different ripples read as a living surface.
    const layers = [
      { amp: 1.0, phase: 0, scale: 1.08, alpha: 0.28 },
      { amp: 0.8, phase: 2.1, scale: 1.0, alpha: 0.55 },
      { amp: 0.55, phase: 4.2, scale: 0.9, alpha: 1 },
    ];
    for (const L of layers) {
      const amp = (0.025 + this.level * 0.2) * L.amp;
      ctx.beginPath();
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const w = 0.55 * Math.sin(3 * a + t * 1.7 + L.phase + spin)
                + 0.30 * Math.sin(5 * a - t * 2.4 + L.phase * 1.7)
                + 0.15 * Math.sin(8 * a + t * 3.3 - L.phase);
        const r = R * L.scale * breathe * (1 + amp * w + this.level * 0.18);
        const x = cx + r * Math.cos(a), y = cx + r * Math.sin(a);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(cx - R * 0.35, cx - R * 0.4, R * 0.1, cx, cx, R * 1.35);
      g.addColorStop(0, rgb(0, L.alpha));
      g.addColorStop(0.55, rgb(1, L.alpha));
      g.addColorStop(1, rgb(2, L.alpha));
      ctx.fillStyle = g;
      ctx.shadowColor = rgb(1, 0.6);
      ctx.shadowBlur = W * (0.06 + this.level * 0.1);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // A soft highlight keeps the orb looking glassy.
    const hl = ctx.createRadialGradient(cx - R * 0.35, cx - R * 0.45, 0, cx - R * 0.35, cx - R * 0.45, R * 0.7);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cx, R * 0.92 * breathe, 0, Math.PI * 2);
    ctx.fill();
  }
}
