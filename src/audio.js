// Procedural audio: wind, birds, crickets, gayageum-like plucks, janggu drums, steel.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.listener = { x: 0, z: 0 }; this.festivalOn = false; this.combatT = 0; }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    this.reverb = this.ctx.createConvolver(); this.reverb.buffer = this.impulse(2.8); const rg = this.ctx.createGain(); rg.gain.value = 0.35; this.reverb.connect(rg); rg.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.45; this.musicBus.connect(this.master); this.musicBus.connect(this.reverb);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master); this.sfxBus.connect(this.reverb);
    // wind bed
    const noise = this.noiseBuffer(4);
    const src = this.ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    this.windFilter = this.ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.1;
    src.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master); src.start();
    this.nextNote = 0; this.nextAmb = 0; this.step = 0;
  }
  impulse(sec) { const r = this.ctx.sampleRate, n = r * sec, b = this.ctx.createBuffer(2, n, r); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5); } return b; }
  noiseBuffer(sec) { const r = this.ctx.sampleRate, b = this.ctx.createBuffer(1, r * sec, r); const d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } return b; }
  whiteBuffer(sec) { const r = this.ctx.sampleRate, b = this.ctx.createBuffer(1, r * sec, r); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  // Always a finite 0..1. A NaN here (a sim mid-respawn with no position yet, a very long frame on a
  // slow machine) used to slip past a `v <= 0` guard — NaN fails every comparison — and reach the Web
  // Audio ramps, which throw on non-finite values and killed the whole frame.
  gainFor(pos) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
    if (!Number.isFinite(d)) return 0;
    const g = Math.max(0, 1 - d / 60) ** 1.5;
    return Number.isFinite(g) ? g : 0;
  }

  // Karplus-Strong pluck → gayageum
  pluck(freq, vol = 0.3, when = 0, bend = 0) {
    const ctx = this.ctx; const r = ctx.sampleRate; const len = Math.floor(r * 2.2); const buf = ctx.createBuffer(1, len, r); const d = buf.getChannelData(0);
    const N = Math.floor(r / freq); const ring = new Float32Array(N); for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0; for (let i = 0; i < len; i++) { const a = ring[idx], b = ring[(idx + 1) % N]; const v = (a + b) * 0.5 * 0.996; ring[idx] = v; d[i] = a; idx = (idx + 1) % N; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    if (bend) { src.playbackRate.setValueAtTime(1, ctx.currentTime + when + 0.15); src.playbackRate.linearRampToValueAtTime(1 + bend, ctx.currentTime + when + 0.5); src.playbackRate.linearRampToValueAtTime(1, ctx.currentTime + when + 1.0); }
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    src.connect(f); f.connect(g); g.connect(this.musicBus); src.start(ctx.currentTime + when);
  }
  flute(freq, dur, vol = 0.08, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = freq * 0.012; vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    const n = ctx.createBufferSource(); n.buffer = this.breath || (this.breath = this.whiteBuffer(2)); n.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 3; const ng = ctx.createGain(); ng.gain.value = vol * 0.5;
    n.connect(nf); nf.connect(ng); ng.connect(g);
    o.connect(g); g.connect(this.musicBus); o.start(t); vib.start(t); n.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  }
  drumHit(type = 'kung', vol = 0.5, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    if (type === 'kung') { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.25); const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.5); }
    else { const n = ctx.createBufferSource(); n.buffer = this.white || (this.white = this.whiteBuffer(1)); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); n.connect(f); f.connect(g); g.connect(this.musicBus); n.start(t); n.stop(t + 0.15); }
  }

  update(dt, env, focus, combatNear) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.listener = focus;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + env.windStrength * 0.06 + env.rain * 0.12, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(350 + env.windStrength * 250, t, 0.5);
    // music: pentatonic (pyeongjo) phrases
    const scale = [293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    if (combatNear) this.combatT = 6; else this.combatT -= dt;
    if (t > this.nextNote) {
      if (this.combatT > 0 || this.festivalOn) {
        // janggu rhythm (gutgeori-like 12/8 feel)
        const pat = this.festivalOn ? ['kung', 0, 'ta', 'kung', 0, 'ta', 'kung', 'ta', 'ta', 'kung', 0, 'ta'] : ['kung', 0, 0, 'ta', 0, 'kung', 'kung', 0, 'ta', 0, 'ta', 0];
        const p = pat[this.step % pat.length]; if (p) this.drumHit(p, this.combatT > 0 ? 0.5 : 0.4);
        if (this.step % 6 === 0 && Math.random() < 0.7) this.pluck(scale[Math.floor(Math.random() * 5)], 0.25);
        this.step++; this.nextNote = t + (this.combatT > 0 ? 0.16 : 0.2);
      } else {
        const se = env.season || 'autumn';
        const n = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < (se === 'winter' ? 0.55 : 0.3) ? 0.5 : 1) * (se === 'spring' && Math.random() < 0.3 ? 2 : 1);
        this.pluck(n, 0.22, 0, Math.random() < 0.25 ? 0.06 : 0);
        if (Math.random() < 0.35) this.pluck(n * 1.5, 0.12, 0.35);
        if (Math.random() < (se === 'winter' ? 0.2 : 0.08)) this.flute(scale[Math.floor(Math.random() * 5) + 2], se === 'winter' ? 5 : 3.5, 0.05);
        this.nextNote = t + (Math.random() < 0.3 ? 2.5 + Math.random() * 3 : 0.6 + Math.random() * 1.2) * (se === 'winter' ? 1.6 : se === 'summer' ? 0.85 : 1);
      }
    }
    // ambience
    if (t > this.nextAmb) {
      this.nextAmb = t + 0.5 + Math.random() * 3;
      const se = env.season || 'autumn';
      if (env.nightBlend > 0.5) { if (se !== 'winter') this.cricket(); }
      else if (se === 'summer' && Math.random() < 0.6) this.cicada();
      else if (se === 'winter') { if (Math.random() < 0.15) this.bird(); }
      else if (Math.random() < (se === 'spring' ? 0.85 : 0.6) && env.rain < 0.3) this.bird();
    }
  }
  bird() {
    const ctx = this.ctx, t = ctx.currentTime; const o = ctx.createOscillator(); const g = ctx.createGain();
    const f0 = 2500 + Math.random() * 2000; o.frequency.setValueAtTime(f0, t);
    for (let i = 0; i < 3; i++) { o.frequency.linearRampToValueAtTime(f0 * (1.2 + Math.random() * 0.3), t + 0.05 + i * 0.12); o.frequency.linearRampToValueAtTime(f0, t + 0.1 + i * 0.12); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.4);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.45);
  }
  cicada() {
    const ctx = this.ctx, t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 3800 + Math.random() * 600;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 38 + Math.random() * 10; const lg = ctx.createGain(); lg.gain.value = 0.012; lfo.connect(lg);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.01, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 2.6); lg.connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 4;
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 2.7); lfo.stop(t + 2.7);
  }
  cricket() {
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.frequency.value = 4200 + Math.random() * 300; const g = ctx.createGain(); const s = t + i * 0.09; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.015, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.05); o.connect(g); g.connect(this.master); o.start(s); o.stop(s + 0.06); }
  }
  // ---- SFX ----
  swing(pos, heavy) {
    if (!this.ctx) return; const v = this.gainFor(pos); if (!(v > 0)) return;
    const ctx = this.ctx, t = ctx.currentTime; const n = ctx.createBufferSource(); n.buffer = this.white || (this.white = this.whiteBuffer(1));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(heavy ? 1800 : 3000, t + 0.15);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35 * v, t + 0.05); g.gain.linearRampToValueAtTime(0, t + (heavy ? 0.3 : 0.18));
    n.connect(f); f.connect(g); g.connect(this.sfxBus); n.start(t); n.stop(t + 0.35);
  }
  clash(pos, parry) {
    if (!this.ctx) return; const v = this.gainFor(pos); if (!(v > 0)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const freqs = parry ? [1850, 2780, 4100, 5230] : [1400, 2230, 3550];
    for (const fr of freqs) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr * (0.98 + Math.random() * 0.04); const g = ctx.createGain(); g.gain.setValueAtTime(0.12 * v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + (parry ? 1.2 : 0.6)); o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 1.3); }
    const n = ctx.createBufferSource(); n.buffer = this.white || (this.white = this.whiteBuffer(1)); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000; const g = ctx.createGain(); g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08); n.connect(f); f.connect(g); g.connect(this.sfxBus); n.start(t); n.stop(t + 0.1);
  }
  tell(pos, heavy) {
    if (!this.ctx) return; const v = this.gainFor(pos); if (!(v > 0)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(heavy ? 880 : 3200, t); if (heavy) o.frequency.linearRampToValueAtTime(660, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((heavy ? 0.16 : 0.07) * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + (heavy ? 0.5 : 0.25));
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.55);
  }
  hit(pos, heavy) {
    if (!this.ctx) return; const v = this.gainFor(pos); if (!(v > 0)) return;
    const ctx = this.ctx, t = ctx.currentTime; const o = ctx.createOscillator(); o.frequency.setValueAtTime(heavy ? 120 : 180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.25);
    const n = ctx.createBufferSource(); n.buffer = this.white || (this.white = this.whiteBuffer(1)); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.3 * v, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12); n.connect(f); f.connect(g2); g2.connect(this.sfxBus); n.start(t); n.stop(t + 0.15);
  }
  drum() { if (!this.ctx) return; for (let i = 0; i < 6; i++) this.drumHit(i % 3 === 2 ? 'ta' : 'kung', 0.6, i * 0.18); }
  alarm() { if (!this.ctx) return; for (let i = 0; i < 10; i++) this.drumHit('kung', 0.7, i * 0.28); this.combatT = 8; }
  festival(on) { this.festivalOn = on; }
  ui() { if (!this.ctx) return; this.pluck(880, 0.08); }
}
