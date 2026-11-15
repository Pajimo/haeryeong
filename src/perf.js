// Automatic quality governor.
//
// Haeryeong has to run on whatever machine opens the page — a desktop with a real graphics card, a
// thin laptop on battery, an old integrated chip. Rather than ask the player to guess a setting, the
// game watches how long its own frames take and moves itself up and down a ladder of detail levels
// until the frames fit the budget. A machine that can afford the full picture gets it; one that
// cannot quietly loses shadow resolution, then bloom, then draw distance, instead of stuttering.
//
// The sample we feed in is the CPU time spent building and submitting a frame, measured in main.js
// from the top of the loop to the end of composer.render(). That excludes the time the frame-rate cap
// spends idling, so a game sitting comfortably at its 60 fps ceiling still reads as cheap.

export const TIERS = [
  // name        pixel ratio  shadow map  bloom  characters visible  characters casting shadows
  { name: 'Full', pr: 1.5, shadow: 2048, bloom: true, charDist: 170, charShadow: 45, veg: 1 },
  { name: 'High', pr: 1.25, shadow: 2048, bloom: true, charDist: 145, charShadow: 38, veg: 1 },
  { name: 'Balanced', pr: 1.0, shadow: 1024, bloom: true, charDist: 115, charShadow: 30, veg: 0.8 },
  { name: 'Smooth', pr: 1.0, shadow: 1024, bloom: false, charDist: 90, charShadow: 22, veg: 0.6 },
  { name: 'Bare', pr: 0.8, shadow: 0, bloom: false, charDist: 70, charShadow: 0, veg: 0.45 },
];

export function createPerf({ renderer, composer, bloom, sky, power }) {
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} };

  const P = {
    // 'auto' lets the governor move; a number pins the tier by hand
    mode: read('hr_quality_mode', 'auto'),
    // Start one notch better than last session settled on. Conditions change between sittings — another
    // app was hogging the GPU, the laptop was on battery — so the game gives the machine the benefit of
    // the doubt and lets the measurements take it back down within a few seconds if it was right before.
    tier: Math.max(0, Math.min(TIERS.length - 1, (+read('hr_quality_tier', 0) || 0) - 1)),
    samples: [], lastMove: performance.now(), goodFor: 0, fps: 0, frameMs: 0,

    // Called the moment play actually begins. Everything before this — generating the terrain, building
    // the villages, decoding character meshes — runs frames that are slow for reasons the graphics
    // settings cannot fix, and judging the machine on those would start every player on a poor picture.
    begin() { this.samples.length = 0; this.goodFor = 0; this.lastMove = performance.now() + 4000; },
    get t() { return TIERS[this.tier]; },

    // One frame's worth of work, in milliseconds. Only frames drawn under normal conditions count: a
    // backgrounded or throttled tab reports times that have nothing to do with the machine's speed, and
    // a one-off stall (garbage collection, a world chunk being built, the player alt-tabbing back) would
    // otherwise drag the whole game down a tier it never needed to visit.
    sample(ms) {
      if (document.hidden) { this.samples.length = 0; return; }
      if (!(ms >= 0) || ms > 200) return;
      const S = this.samples; S.push(ms); if (S.length > 90) S.shift();
      this.frameMs += (ms - this.frameMs) * 0.08;
    },

    // the frame budget we are aiming at: the cap the player chose, with headroom so the machine is
    // never pinned at 100% — that headroom is what keeps a laptop's fan quiet
    get budget() {
      const cap = power?.saver ? 30 : (power?.cap || 60);
      return (1000 / cap) * 0.75;
    },

    median() {
      const S = this.samples; if (S.length < 30) return null;
      const a = S.slice().sort((x, y) => x - y); return a[a.length >> 1];
    },

    update(dt, now) {
      if (this.mode !== 'auto') return;
      if (document.hidden) return;
      const m = this.median(); if (m == null) return;
      if (now - this.lastMove < 2500) return;
      const b = this.budget;
      if (m > b * 1.2 && this.tier < TIERS.length - 1) {
        // too slow: drop a level straight away
        this.set(this.tier + 1, true); this.goodFor = 0;
      } else if (m < b * 0.5 && this.tier > 0) {
        // plenty of headroom — but only climb back after it has held for a while, so a quiet moment
        // in an empty field does not promote a machine that will stutter again in the market square
        this.goodFor += dt;
        if (this.goodFor > 12) { this.set(this.tier - 1, true); this.goodFor = 0; }
      } else this.goodFor = 0;
    },

    set(tier, auto = false) {
      tier = Math.max(0, Math.min(TIERS.length - 1, tier));
      if (tier === this.tier && this._applied) return;
      this.tier = tier; this._applied = true; this.lastMove = performance.now(); this.samples.length = 0;
      write('hr_quality_tier', tier);
      this.apply();
      if (auto && this.onChange) this.onChange(TIERS[tier], tier);
    },

    setMode(mode, tier) {
      this.mode = mode; write('hr_quality_mode', mode);
      if (mode !== 'auto' && tier != null) this.set(tier);
      else { this.samples.length = 0; this.lastMove = performance.now(); }
    },

    apply() {
      const t = this.t;
      const saver = !!power?.saver;
      renderer.setPixelRatio(Math.min(devicePixelRatio, saver ? Math.min(1, t.pr) : t.pr));
      renderer.setSize(innerWidth, innerHeight); composer?.setSize?.(innerWidth, innerHeight);
      bloom && (bloom.enabled = t.bloom);
      if (sky?.sun) {
        const s = sky.sun;
        if (!t.shadow) s.castShadow = false;
        else {
          s.castShadow = true;
          if (s.shadow.mapSize.x !== t.shadow) {
            s.shadow.mapSize.set(t.shadow, t.shadow);
            s.shadow.map?.dispose(); s.shadow.map = null; // forces three to rebuild at the new size
          }
        }
      }
    },

    status() {
      const m = this.median();
      return { tier: this.tier, name: this.t.name, mode: this.mode, frameMs: m == null ? null : +m.toFixed(1), budgetMs: +this.budget.toFixed(1) };
    },
  };

  P.apply();
  return P;
}
