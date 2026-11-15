import * as THREE from 'three';

// Shared season uniforms read by vegetation, terrain and building shaders.
export const SEASON_U = {
  uSpring: { value: 0 }, uSummer: { value: 0 }, uAutumn: { value: 1 }, uWinter: { value: 0 },
  uSnow: { value: 0 },
};
export const SEASONS = [
  { key: 'spring', en: 'Spring', ko: '봄', icon: '🌸' },
  { key: 'summer', en: 'Summer', ko: '여름', icon: '☀' },
  { key: 'autumn', en: 'Autumn', ko: '가을', icon: '🍁' },
  { key: 'winter', en: 'Winter', ko: '겨울', icon: '❄' },
];
export const SEASON_DAYS = 4;

export const SEASON_GLSL = `
uniform float uSpring; uniform float uSummer; uniform float uAutumn; uniform float uWinter; uniform float uSnow;`;

// Adds snow on upward-facing surfaces (object space == world space for static merged meshes)
export function addSnow(mat, strength = 1.0, key = 'snow') {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, SEASON_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSnowN; varying vec3 vSnowP;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvSnowN = normalize(objectNormal).y;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SEASON_GLSL + '\nvarying float vSnowN; varying vec3 vSnowP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float snN = fract(sin(dot(floor(vSnowP.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
        float snowAmt = uSnow * smoothstep(0.35, 0.75, vSnowN + (snN - 0.5) * 0.15) * ${strength.toFixed(2)};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), snowAmt);`);
  };
  const pk = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (pk ? pk() : '') + key;
  mat.needsUpdate = true;
  return mat;
}

// ---------- Season controller ----------
export class Seasons {
  constructor(G, offset = 2) {
    this.G = G; this.offset = offset; // 0 spring, 1 summer, 2 autumn, 3 winter
    this.snow = 0; this.lastSeason = -1;
  }
  index(day = this.G.env.day) { return (Math.floor((day - 1) / SEASON_DAYS) + this.offset) % 4; }
  get current() { return SEASONS[this.index()]; }
  get dayOfSeason() { return ((this.G.env.day - 1) % SEASON_DAYS) + 1; }

  weights() {
    const env = this.G.env;
    const t = (env.day - 1) + env.hour / 24; // continuous days
    const pos = t / SEASON_DAYS + this.offset; // continuous season position
    const i = Math.floor(pos) % 4; const f = pos - Math.floor(pos);
    // cross-fade into the next season during the last 25% of each season
    const k = Math.max(0, (f - 0.75) / 0.25);
    const w = [0, 0, 0, 0];
    w[i] = 1 - k; w[(i + 1) % 4] += k;
    return w;
  }

  update(dt, gm) {
    const G = this.G; const env = G.env;
    const w = this.weights();
    SEASON_U.uSpring.value = w[0]; SEASON_U.uSummer.value = w[1]; SEASON_U.uAutumn.value = w[2]; SEASON_U.uWinter.value = w[3];
    // snow accumulates through winter (faster while it snows) and melts in spring
    const snowing = env.weather === 'snow';
    if (w[3] > 0.5) this.snow = Math.min(1, this.snow + gm * (snowing ? 0.004 : 0.0006));
    else this.snow = Math.max(0, this.snow - gm * 0.0012);
    if (w[3] > 0.8 && this.snow < 0.25) this.snow = 0.25;
    SEASON_U.uSnow.value = this.snow; env.snowCover = this.snow;
    if (env.day !== this.moodDay && env.hour > 7) { this.moodDay = env.day; this.dailyMoods(); }
    env.season = this.current.key; env.seasonW = w;
    // water freezes over in deep winter
    const water = G.water;
    if (water) {
      const ice = Math.min(1, this.snow * w[3] * 1.2);
      water.material.color.set('#1f4a52').lerp(new THREE.Color('#a8c4d0'), ice * 0.8);
      water.material.roughness = 0.06 + ice * 0.35;
      water.material.normalScale.set(0.35 * (1 - ice * 0.85), 0.35 * (1 - ice * 0.85));
      water.material.opacity = 0.86 + ice * 0.12;
    }
    // season change announcements & effects
    const si = this.index();
    if (si !== this.lastSeason) {
      const first = this.lastSeason === -1;
      this.lastSeason = si;
      G.fx?.setSeason?.(this.current.key);
      env.seasonKey = this.current.key;
      if (!first) G.emit?.('season', { season: this.current.key });
      if (!first) {
        const msg = {
          spring: 'Spring arrives! Plum and cherry blossoms burst open across the valley, and the paddies are flooded for planting.',
          summer: 'Summer settles over Haeryeong. The monsoon rains come, the rice grows tall, and the cicadas sing.',
          autumn: 'Autumn paints the mountains red and gold. The rice ripens and the harvest begins.',
          winter: 'Winter descends. Frost grips the river, and the first snow falls on the tiled roofs.',
        }[this.current.key];
        G.log(`${this.current.icon} ${msg}`, 'omen');
        G.ui?.toast(`${this.current.icon} ${this.current.en} · ${this.current.ko}`, 'festival');
        if (this.current.key === 'winter') env.setWeather('snow');
        if (this.current.key === 'spring') env.setWeather('clear');
      }
    }
  }

  // daily effects on villagers
  dailyMoods() {
    const G = this.G; const key = this.current.key;
    for (const s of G.sims) {
      if (s.dead) continue;
      if (key === 'spring') s.addMoodlet('season', 'Spring blossoms', 6, 1440);
      if (key === 'summer') s.addMoodlet('season', G.env.weather === 'rain' ? 'Muggy monsoon' : 'Long summer days', G.env.weather === 'rain' ? -3 : 4, 1440);
      if (key === 'autumn') s.addMoodlet('season', 'Harvest season', 5, 1440);
      if (key === 'winter') s.addMoodlet('season', s.coins < 20 ? 'Cold and hungry winter' : 'Winter chill', s.coins < 20 ? -12 : -3, 1440);
    }
  }
}
