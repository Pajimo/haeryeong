// Soundscape: positional ambient beds (river, rain on tiles, crowd murmur), temple bell, rooster,
// footsteps for the controlled character and short musical stingers for life events.
import { riverDist } from './terrain.js';

export function createSoundscapeSystem(G) {
  const A = () => G.audio;
  let beds = null, lastHour = -1, stepT = 0, sting = 0;

  function makeBeds() {
    const a = A(); if (!a?.ctx || beds) return;
    const ctx = a.ctx;
    const mk = (buf, type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(a.master); src.start();
      return { f, g };
    };
    const brown = a.noiseBuffer(5), white = a.white || (a.white = a.whiteBuffer(1));
    beds = {
      river: mk(brown, 'lowpass', 900, 0.4),
      river2: mk(white, 'bandpass', 2400, 0.8),
      rain: mk(white, 'highpass', 3500, 0.5),
      crowd: mk(brown, 'bandpass', 420, 1.6),
    };
    // crowd tremolo so it reads as voices, not wind
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3.3; const lg = ctx.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(beds.crowd.g.gain); lfo.start();
    beds.crowdLfo = lg;
  }

  function bell(vol) {
    const a = A(); const ctx = a.ctx, t = ctx.currentTime;
    // bronze temple bell (beomjong): low inharmonic partials with the famous slow beat
    for (const [r, v, d] of [[1, 1, 9], [2.0, 0.5, 6], [2.76, 0.35, 5], [5.4, 0.18, 3], [0.5, 0.6, 11]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 64 * r;
      const o2 = ctx.createOscillator(); o2.frequency.value = 64 * r + 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14 * v * vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0003, t + d);
      o.connect(g); o2.connect(g); g.connect(a.master); g.connect(a.reverb); o.start(t); o2.start(t); o.stop(t + d); o2.stop(t + d);
    }
  }
  function rooster(vol) {
    const a = A(); const ctx = a.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const seg = [[520, 0], [700, 0.12], [690, 0.35], [820, 0.5], [760, 0.9], [420, 1.25]];
    for (const [f, dt] of seg) o.frequency.linearRampToValueAtTime(f, t + dt);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1400; f1.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * vol, t + 0.06); g.gain.setValueAtTime(0.05 * vol, t + 1.0); g.gain.linearRampToValueAtTime(0, t + 1.3);
    o.connect(f1); f1.connect(g); g.connect(a.master); o.start(t); o.stop(t + 1.35);
  }
  function step(snow, run) {
    const a = A(); const ctx = a.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = a.white;
    const f = ctx.createBiquadFilter(); f.type = snow ? 'bandpass' : 'lowpass'; f.frequency.value = snow ? 1800 : 650 + Math.random() * 200; f.Q.value = snow ? 1.2 : 0.7;
    const g = ctx.createGain(); const v = (run ? 0.16 : 0.1) * (0.8 + Math.random() * 0.4);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (snow ? 0.14 : 0.08));
    n.connect(f); f.connect(g); g.connect(a.sfxBus); n.start(t); n.stop(t + 0.16);
  }
  function stinger(kind) {
    const a = A(); if (!a?.ctx) return; const now = performance.now(); if (now - sting < 4000) return; sting = now;
    const P = { joy: [587.33, 739.99, 880, 1174.66], sad: [293.66, 261.63, 220, 196], war: [146.83, 146.83, 220, 146.83], royal: [392, 523.25, 587.33, 783.99] }[kind];
    P.forEach((f, i) => a.pluck(f, kind === 'sad' ? 0.18 : 0.22, i * (kind === 'sad' ? 0.42 : 0.16)));
    if (kind === 'sad') a.flute(196, 3.5, 0.05, 1.6);
    if (kind === 'war') a.drum();
    if (kind === 'royal') a.flute(783.99, 2.5, 0.05, 0.6);
  }

  return {
    id: 'soundscape',
    update(dt) {
      const a = A(); if (!a?.ctx || a.ctx.state !== 'running') return;
      makeBeds(); if (!beds) return;
      const env = G.env, f = G.player.focus, t = a.ctx.currentTime;
      // river: louder the closer you stand; frozen rivers are silent
      const rd = riverDist(f.x, f.z), frozen = (G.seasons?.weights?.()?.[3] || 0) > 0.7;
      const rv = frozen ? 0 : Math.max(0, 1 - rd / 45) ** 1.6;
      beds.river.g.gain.setTargetAtTime(rv * 0.16, t, 0.6); beds.river2.g.gain.setTargetAtTime(rv * 0.025, t, 0.6);
      // rain patter on tiles (snow is hushed)
      const rain = env.weather === 'snow' ? 0 : env.rain || 0;
      beds.rain.g.gain.setTargetAtTime(rain * 0.045, t, 1.0);
      // crowd murmur from nearby people talking or gathering
      let n = 0; for (const s of G.sims) if (!s.dead && !s.hidden && s.age !== 'child' && Math.abs(s.pos.x - f.x) < 20 && Math.abs(s.pos.z - f.z) < 20) n++;
      const cv = Math.min(1, Math.max(0, n - 3) / 14) * (env.nightBlend > 0.6 ? 0.4 : 1);
      beds.crowd.g.gain.setTargetAtTime(cv * 0.05, t, 0.8); beds.crowdLfo.gain.setTargetAtTime(cv * 0.02, t, 0.8);
      // temple bell at 06:00 and 18:00, rooster at 05:00
      const hr = Math.floor(env.hour);
      if (hr !== lastHour) {
        if (lastHour >= 0) {
          if (hr === 6 || hr === 18) { const d = Math.hypot(f.x - 290, f.z + 70); const v = 0.35 + 0.65 * Math.max(0, 1 - d / 300); bell(v); setTimeout(() => bell(v * 0.8), 7000); setTimeout(() => bell(v * 0.6), 14000); }
          if (hr === 5 && env.weather !== 'snow') { rooster(1); setTimeout(() => rooster(0.6), 2600); }
        }
        lastHour = hr;
      }
      // footsteps for the controlled character
      const s = G.selected;
      if (G.player.mode === 'warrior' && s && s.controlled && s.moving && !s.mount) {
        const run = (s.curSpeed || 2) > 4; stepT -= dt;
        if (stepT <= 0) { stepT = run ? 0.3 : 0.48; step((G.seasons?.snow || 0) > 0.3, run); }
      } else stepT = 0;
    },
    onEvent(name, p) {
      if (name === 'birth' && (p.mother?.household || p.father?.household)) stinger('joy');
      else if (name === 'wedding' && (p.a.household || p.b.household)) stinger('joy');
      else if (name === 'death' && (p.sim.household || p.sim.job === 'king')) stinger('sad');
      else if (name === 'crowned') stinger('royal');
      else if (name === 'promoted' && p.sim.household) stinger('royal');
      else if (name === 'warDeclared') stinger('war');
    },
    // debugging/testing hooks
    _bell: () => bell(1), _rooster: () => rooster(1),
  };
}
