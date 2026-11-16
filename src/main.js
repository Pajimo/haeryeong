import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { setSeed } from './noise.js';
import { buildHeightfield, buildTerrain, buildWater, buildFarMountains, heightAt as _hAt, roadDist as _rd } from './terrain.js';
import { Environment } from './sky.js';
import { buildVegetation, buildTrees, windUniforms } from './vegetation.js';
import { buildWorld } from './buildings.js';
import { Game } from './game.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { AIBrain } from './llm.js';
import { Factions } from './factions.js';
import { Animals } from './animals.js';
import { Economy } from './economy.js';
import { Seasons } from './season.js';
import { createWarSystem } from './war.js';
import { createLifeEventsSystem } from './lifeevents.js';
import { createPastimesSystem } from './pastimes.js';
import { createAspirationsSystem } from './aspirations.js';
import { createMissionsSystem } from './missions.js';
import { createAlbumSystem } from './album.js';
import { createStandoffSystem } from './standoff.js';
import { createMemoriesSystem } from './memories.js';
import { createSoundscapeSystem } from './soundscape.js';
import { createFuneralsSystem } from './funerals.js';
import { createAlmanacSystem } from './almanac.js';
import { openCreator } from './creator.js';
import { warmGeometry } from './geocache.js';
import { loadFaces } from './faces.js';
import { loadAnimalModels } from './animalmodels.js';
import { loadBodies } from './bodies.js';
import { BONE_ORDER } from './charbody.js';
import { createTutorialSystem } from './tutorial.js';
import { createRivalsSystem } from './rivals.js';
import { createArcherySystem } from './archery.js';
import { createArcheryContestSystem } from './archerycontest.js';
import { createHuntingSystem } from './hunting.js';
import { createDynastySystem } from './dynasty.js';
import { createExpeditionsSystem } from './expeditions.js';
import { createMinigamesSystem } from './minigames.js';
import { createUnderworldSystem } from './underworld.js';
import { createPoliticsSystem } from './politics.js';
import { createSagasSystem } from './sagas.js';
import { createYutSystem } from './yut.js';
import { createWrestleSystem } from './wrestle.js';
import { createForgeSystem } from './forge.js';
import { createHorseCourseSystem } from './horsecourse.js';
import { createRoyalWorksSystem } from './royalworks.js';
import { createRoyalPowerSystem } from './royalpower.js';
import { createRoyalGuardSystem } from './royalguard.js';
import { createCourtLifeSystem } from './courtlife.js';
import { createVillageDecorSystem } from './villagedecor.js';
import { createServantsSystem } from './servants.js';
import { createPilgrimageSystem } from './pilgrimage.js';
import { createAuthoritySystem } from './authority.js';
import { createOfficialsSystem } from './officials.js';
import { createFortuneSystem } from './fortune.js';
import { createKinSystem } from './kin.js';
import { createHousingSystem } from './housing.js';
import { createRidingSystem } from './riding.js';
import { createMigrationSystem } from './migration.js';
import { createAmbitionSystem } from './ambition.js';
import { createFamilySystem } from './family.js';
import { createSocietySystem } from './society.js';
import { createHousesSystem } from './houses.js';
import { createInheritanceSystem } from './inheritance.js';
import { createPerf } from './perf.js';

const params = new URLSearchParams(location.search);
const quality = params.get('q') || 'high';
let loadData = null;
if (params.get('load')) { try { loadData = JSON.parse(localStorage.getItem('haeryeong_save')); } catch { loadData = null; } }
const redirecting = !!(loadData && +(params.get('seed') || 1337) !== loadData.seed);
if (redirecting) { location.search = `?q=${loadData.quality || 'high'}&seed=${loadData.seed}&load=1`; }
const seed = +(params.get('seed') || 1337);
setSeed(seed);

const $ = (s) => document.querySelector(s);
const BOOT_T = []; window.__bootT = BOOT_T;
const lmsg = (t, p) => { BOOT_T.push([t || 'done', Math.round(performance.now())]); $('#lmsg').textContent = t; $('.lbar i').style.width = p + '%'; };
const tick = () => new Promise((r) => setTimeout(r, 16));

const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
// ---------- power: frame-rate cap and battery saver (⚙ Settings) ----------
// the automatic quality governor (src/perf.js); it owns pixel ratio, shadows and bloom once it exists
let perf = null;
const POWER = {
  get cap() { try { const v = localStorage.getItem('hr_fps'); return v == null ? 60 : +v; } catch { return 60; } },
  get saver() { try { return localStorage.getItem('hr_saver') === '1'; } catch { return false; } },
  set(cap, saver) { try { localStorage.setItem('hr_fps', String(cap)); localStorage.setItem('hr_saver', saver ? '1' : '0'); } catch {} this.apply(); },
  apply() {
    renderer.shadowMap.autoUpdate = !this.saver;
    if (perf) { perf.apply(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, this.saver ? 1 : quality === 'high' ? 1.5 : 1));
    renderer.setSize(innerWidth, innerHeight); composer?.setSize?.(innerWidth, innerHeight);
  },
};
renderer.setPixelRatio(Math.min(devicePixelRatio, POWER.saver ? 1 : quality === 'high' ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = !POWER.saver;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.5;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 6000);

// post-processing
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.6, 2.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.55 }, uSat: { value: 1.08 }, uTint: { value: new THREE.Vector3(1.03, 1.0, 0.96) }, uGrain: { value: 0.035 }, uCine: { value: 0 }, uFilter: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uSat, uGrain, uCine; uniform int uFilter; uniform vec3 uTint; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat * (1.0 - uCine*0.75));
      c.rgb *= uTint;
      c.rgb = mix(c.rgb, c.rgb*c.rgb*(3.0-2.0*c.rgb), 0.35);
      c.rgb = mix(c.rgb, vec3(l*1.1, l*0.85, l*0.8), uCine*0.35);
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - smoothstep(0.42, 0.95, d) * (uVig + uCine*0.4);
      float bars = step(abs(vUv.y-0.5), 0.5 - uCine*0.09); c.rgb *= bars;
      if (uFilter == 1) { float g = dot(c.rgb, vec3(0.3,0.59,0.11)); g = smoothstep(0.05, 0.95, g); vec3 paper = vec3(0.95,0.91,0.82); c.rgb = mix(vec3(0.08,0.07,0.07), paper, g); float e = fract(sin(dot(floor(vUv*vec2(600.,400.)), vec2(12.9,78.2)))*437.5); c.rgb *= 0.97 + e*0.03; }
      else if (uFilter == 2) { c.rgb = pow(c.rgb, vec3(0.92,1.0,1.12)) * vec3(1.08,1.0,0.86); c.rgb = mix(c.rgb, c.rgb*c.rgb*(3.0-2.0*c.rgb), 0.4); }
      else if (uFilter == 3) { c.rgb *= vec3(0.9,0.98,1.1); c.rgb = mix(vec3(dot(c.rgb, vec3(0.33))), c.rgb, 0.7); }
      else if (uFilter == 4) { c.rgb = mix(vec3(dot(c.rgb, vec3(0.33))), c.rgb, 1.35); }
      float n = fract(sin(dot(vUv*vec2(1789.3,1103.7)+fract(uTime), vec2(12.9898,78.233)))*43758.5453);
      c.rgb += (n-0.5)*uGrain;
      gl_FragColor = c; }`,
});
composer.addPass(grade);

// ---------- Photo mode: ambient occlusion, depth of field, filters, screenshots ----------
const photo = { on: false, gtao: null, bokeh: null, filter: 0, dof: true, aperture: 0.0006, capture: false };
const FILTERS = ['Natural', 'Ink wash 수묵화', 'Golden film', 'Winter blue', 'Vivid'];
function setPhoto(on) {
  photo.on = on;
  document.body.classList.toggle('photo', on);
  if (on && !photo.gtao) {
    photo.gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    photo.gtao.blendIntensity = 0.9;
    photo.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1.0 });
    photo.bokeh = new BokehPass(scene, camera, { focus: 30, aperture: photo.aperture, maxblur: 0.012 });
    composer.insertPass(photo.gtao, 1); composer.insertPass(photo.bokeh, 2);
  }
  if (photo.gtao) { photo.gtao.enabled = on; photo.bokeh.enabled = on && photo.dof; }
  grade.uniforms.uFilter.value = on ? photo.filter : 0;
  if (G) { if (on) { photo.wasPaused = G.paused; G.paused = true; } else G.paused = photo.wasPaused; }
  const bar = $('#photobar');
  if (on) {
    bar.classList.remove('hidden');
    bar.innerHTML = `<b>📷 Photo mode</b><button data-f="-1">◀</button><span id="pf">${FILTERS[photo.filter]}</span><button data-f="1">▶</button>
      <label><input type="checkbox" id="pdof" ${photo.dof ? 'checked' : ''}> Depth of field</label>
      <label>Blur <input type="range" id="pap" min="1" max="30" value="${Math.round(photo.aperture * 10000)}"></label>
      <label><input type="checkbox" id="pbars"> Cinema bars</label>
      <button id="psnap">Save image</button><button id="pexit">Exit (P)</button>`;
    bar.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { photo.filter = (photo.filter + +b.dataset.f + FILTERS.length) % FILTERS.length; grade.uniforms.uFilter.value = photo.filter; $('#pf').textContent = FILTERS[photo.filter]; }));
    $('#pdof').onchange = (e) => { photo.dof = e.target.checked; photo.bokeh.enabled = photo.dof; };
    $('#pap').oninput = (e) => { photo.aperture = +e.target.value / 10000; photo.bokeh.uniforms.aperture.value = photo.aperture; };
    $('#pbars').onchange = (e) => { photo.bars = e.target.checked; };
    $('#psnap').onclick = () => { photo.capture = true; };
    $('#pexit').onclick = () => setPhoto(false);
  } else bar.classList.add('hidden');
}
addEventListener('keydown', (e) => { if (e.code === 'KeyP' && started && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) setPhoto(!photo.on); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth / 2, innerHeight / 2);
});

window.__power = POWER; window.__frames = () => frameN;
let G, env, veg, world, fx, audio, player, ui, terrainMesh, water, selRing;
let started = false, freezeT = 0, slowT = 0, cineT = 0;

async function boot() {
  $('#title').classList.add('loading');
  lmsg('Raising mountains…', 5); await tick();
  buildHeightfield();
  terrainMesh = buildTerrain(); scene.add(terrainMesh);
  water = buildWater(); scene.add(water);
  const far = buildFarMountains(); scene.add(far);
  lmsg('Painting the sky…', 20); await tick();
  env = new Environment(scene, renderer, quality);
  // from here the governor decides pixel ratio, shadow map size and bloom from measured frame times
  perf = createPerf({ renderer, composer, bloom, sky: env, power: POWER });
  perf.onChange = (t) => ui?.toast?.(`Graphics: ${t.name} — kept smooth for your machine.`);
  window.__perf = perf;
  env.hour = 16.4;
  far.traverse((m) => { if (m.isMesh) { m.material.userData.base = m.material.color.clone(); env.farMats.push(m.material); } });
  lmsg('Raising hanok and palaces…', 35); await tick();
  world = buildWorld(scene, quality);
  lmsg('Planting pines, maples and silver grass…', 50); await tick();
  buildTrees(scene, world.isBlocked, quality, world.reserved);
  await tick();
  veg = buildVegetation(scene, world.isBlocked, quality);
  lmsg('Sculpting the villagers…', 55); await tick();
  if (!/[?&]oldfaces=1/.test(location.search)) { lmsg('Fitting faces…', 54); await loadFaces(); }
  await loadAnimalModels();
  if (!/[?&]oldbodies=1/.test(location.search)) { lmsg('Dressing the villagers…', 54); await loadBodies(BONE_ORDER); }
  try { const r = await warmGeometry((p) => lmsg(`Sculpting the villagers… ${Math.round(p * 100)}%`, 55 + p * 20)); console.info('[geo]', r); } catch (e) { console.warn('geometry warm-up skipped', e); }
  lmsg('Waking the villagers…', 75); await tick();
  audio = new Audio();
  fx = new FX(scene, world, env);
  G = new Game({ scene, env, world, fx, audio, camera, terrainMesh });
  G.seed = seed; G.quality = quality; G.water = water; G.perf = perf;
  const seasonParam = { spring: 0, summer: 1, autumn: 2, winter: 3 }[params.get('season') || 'autumn'];
  G.seasons = new Seasons(G, loadData?.env?.seasonOffset ?? seasonParam ?? 2);
  if (loadData?.env?.snow) G.seasons.snow = loadData.env.snow;
  if (G.seasons.index() === 3 && !loadData) { G.seasons.snow = 0.6; env.setWeather('snow'); }
  const ai = new AIBrain();
  player = new Player(G, camera, canvas); G.player = player;
  ui = new UI(G, ai); G.ui = ui;
  G.setupHouses();
  G.factions = new Factions(G);
  G.economy = new Economy(G);
  G.animals = new Animals(G);
  for (const make of [createAspirationsSystem, createAlbumSystem, createMissionsSystem, createWarSystem, createLifeEventsSystem, createPastimesSystem, createStandoffSystem, createMemoriesSystem, createSoundscapeSystem, createFuneralsSystem, createAlmanacSystem, createRivalsSystem, createArcherySystem, createArcheryContestSystem, createHuntingSystem, createDynastySystem, createExpeditionsSystem, createMinigamesSystem, createUnderworldSystem, createPoliticsSystem, createSagasSystem, createYutSystem, createWrestleSystem, createForgeSystem, createHorseCourseSystem, createRoyalWorksSystem, createRoyalPowerSystem, createRoyalGuardSystem, createCourtLifeSystem, createVillageDecorSystem, createServantsSystem, createPilgrimageSystem, createAuthoritySystem, createOfficialsSystem, createFortuneSystem, createKinSystem, createHousingSystem, createRidingSystem, createMigrationSystem, createAmbitionSystem, createFamilySystem, createSocietySystem, createHousesSystem, createInheritanceSystem, createTutorialSystem]) { try { G.registerSystem(make(G)); } catch (e) { console.error('system init failed', e); } }
  if (!loadData) G.populate(); else G.restore(loadData);
  G.animals.populate(loadData?.animals);
  G.economy.initHouses();
  G.emit('ready', { loaded: !!loadData });
  window.__R = renderer; window.__G = G; window.__player = player; window.__env = env; window.__hAt = _hAt; window.__rd = _rd;
  G.hitStop = (freeze, slow, cine) => { G.fovKick = Math.max(G.fovKick || 0, freeze * 45); freezeT = Math.max(freezeT, freeze); slowT = Math.max(slowT, slow); if (cine) cineT = 1.2; player.shake = Math.max(player.shake, freeze * 2.5); };
  const captureCbs = []; let cineHold = 0, cineSim = null;
  G.capture = (cb) => captureCbs.push(cb);
  G.cinematic = (sim, title, sub) => {
    if (photo.on || !sim || sim.hidden) return;
    cineHold = 4.5; cineSim = sim;
    if (player.mode === 'overseer') { player.follow = false; player.focusTarget.set(sim.pos.x, sim.pos.y, sim.pos.z); player.distTarget = 8.5; player.pitchT = 0.22; }
    const c = document.querySelector('#mission-card'); if (c) { c.className = 'pass'; c.innerHTML = `<div class="mc-top">${title}</div><div class="mc-sub">${sub || ''}</div>`; c.classList.remove('hidden'); setTimeout(() => c.classList.add('hidden'), 4200); }
  };
  G._cineTick = (dt) => { if (cineHold > 0) { cineHold -= dt; grade.uniforms.uCine.value = Math.min(1, grade.uniforms.uCine.value + dt * 3); if (player.mode === 'overseer' && cineSim) { player.yawT += dt * 0.25; player.focusTarget.set(cineSim.pos.x, cineSim.pos.y, cineSim.pos.z); } } };
  G._afterRender = () => {
    if (!captureCbs.length) return;
    const src = renderer.domElement; const w = 360, h = Math.round(360 * src.height / src.width);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(src, 0, 0, w, h);
    const url = cv.toDataURL('image/jpeg', 0.72);
    for (const cb of captureCbs.splice(0)) cb(url);
  };
  G.select = (s) => { G.selected = s; ui.onSelect(s); if (player.mode === 'warrior' && !s.household) player.toggleMode('overseer'); };
  // selection ring
  selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  selRing.rotation.x = -Math.PI / 2; scene.add(selRing);
  player.mode = 'title';
  lmsg('Lighting lanterns…', 92); await tick();
  // warm-up render (compile shaders)
  player.update(0.016); env.update(0.016, 0, player.focus);
  renderer.compile(scene, camera);
  lmsg('', 100);
  $('#loading').classList.add('hidden'); $('#t-menu').classList.remove('hidden'); $('#title').classList.remove('loading');
  $('#t-quality').value = quality; $('#t-seed').value = seed; $('#t-season').value = params.get('season') || 'autumn';
  $('#t-season').onchange = () => { location.search = `?q=${$('#t-quality').value}&seed=${$('#t-seed').value}&season=${$('#t-season').value}`; };
  $('#t-begin').onclick = begin;
  let hasSave = false; try { hasSave = !!localStorage.getItem('haeryeong_save'); } catch {}
  if (hasSave && !loadData) { const b = document.createElement('button'); b.id = 't-continue'; b.textContent = 'Continue Dynasty · 이어하기'; b.onclick = () => { const d = JSON.parse(localStorage.getItem('haeryeong_save')); location.search = `?q=${d.quality || 'high'}&seed=${d.seed}&load=1`; }; $('#t-begin').after(b); }
  if (loadData) { $('#t-begin').textContent = 'Continue · 이어하기'; }
  requestAnimationFrame(loop);
}

function begin() {
  const q = $('#t-quality').value, sd = +$('#t-seed').value;
  if (!loadData && (q !== quality || sd !== seed)) { location.search = `?q=${q}&seed=${sd}&season=${$('#t-season').value}`; return; }
  if (!loadData && !begin.created) { $('#title').classList.add('creating'); openCreator(G, () => { begin.created = true; $('#title').classList.remove('creating'); begin(); }); return; }
  audio.init(); audio.ctx?.resume();
  $('#title').classList.add('gone'); document.body.classList.add('started');
  started = true; G.started = true; G.lastSaveDay = G.env.day; perf?.begin();
  player.mode = 'overseer';
  const hero = G.household[0] || G.sims[0];
  G.select(hero);
  player.focusTarget.copy(hero.pos); player.focus.copy(player.camera.position).lerp(hero.pos, 0.5);
  player.yawT = player.yaw = 0.9; player.pitchT = 0.62; player.distTarget = 26; player.dist = 60; player.follow = true;
  ui.setMode('overseer'); ui.refreshHousehold();
  ui.toast(`You lead the ${hero.name.surname} household. Press H for help.`);
  if (!loadData) G.log(`${G.household.map((s) => s.name.full).join(', ')} — the ${hero.name.surname} household — begin a new chapter in Haeryeong.`, 'story', hero.pos);
}

let last = performance.now(), time = 0, frameN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  // frame-rate cap: 60 by default (a 120 Hz screen would otherwise draw twice as often for no gain), 30 on battery
  // saver, and 30 whenever nothing needs smoothness (title screen, paused, window in the background)
  const idle = !started || G?.paused || !document.hasFocus();
  const cap = POWER.saver ? 30 : idle ? Math.min(POWER.cap || 999, 30) : POWER.cap;
  if (cap && now - last < 1000 / cap - 1.5) return;
  frameN++;
  const frameT0 = performance.now();
  if (POWER.saver && frameN % 3 === 0) renderer.shadowMap.needsUpdate = true;
  const rdt = Math.min(0.05, (now - last) / 1000); last = now; time += rdt;
  // time scaling (pause / speed / hit-stop / slow-mo)
  let ts = started ? (G.paused ? 0 : player.mode === 'warrior' ? 1 : G.timeScale) : 0;
  let fxScale = 1;
  if (freezeT > 0) { freezeT -= rdt; ts *= 0.03; fxScale = 0.05; }
  else if (slowT > 0) { slowT -= rdt; ts *= 0.3; fxScale = 0.35; }
  if (G?.standoffActive) cineT = Math.max(cineT, 0.3);
  if (cineT > 0) cineT -= rdt;
  grade.uniforms.uCine.value += ((cineT > 0 ? 1 : 0) - grade.uniforms.uCine.value) * Math.min(1, rdt * 6);

  player.update(rdt);
  if (G) { G.fovKick = (G.fovKick || 0) * Math.exp(-rdt * 7); const f = (G.baseFov || 50) - G.fovKick; if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); } }
  if (started) {
    const dt = rdt * ts; const gm = dt; // 1 real second = 1 game minute at 1x
    const steps = Math.max(1, Math.ceil(dt / 0.05));
    for (let i = 0; i < steps; i++) {
      G.update(dt / steps, gm / steps);
      const w = env.advance(gm / steps);
      if (w) G.log({ clear: 'The skies clear over the valley.', cloudy: 'Clouds roll in from the eastern sea.', rain: `${{ spring: 'Spring', summer: 'Monsoon', autumn: 'Autumn', winter: 'Cold' }[env.season] || 'Soft'} rain begins to fall on the tiled roofs.`, mist: 'Mist creeps down from the mountains.', windy: 'A strong wind sweeps through the valley.', snow: 'Snow begins to fall, soft and silent.' }[w] || 'The weather turns.', 'omen');
    }
  } else env.advance(rdt * 0.4);
  const focus = player.focus;
  env.update(rdt, time, focus);
  G?.seasons?.update(rdt, started ? rdt * ts : rdt * 0.4);
  windUniforms.uTime.value = time;
  windUniforms.uWindDir.value.copy(env.windDir);
  windUniforms.uWindStrength.value = env.windStrength;
  if (G.selected && !G.selected.hidden) windUniforms.uPlayer.value.copy(G.selected.pos); else windUniforms.uPlayer.value.set(9999, 0, 9999);
  veg.update(camera.position);
  world.setNight(env.nightBlend, time);
  water.userData.update(time);
  fx.update(rdt * fxScale, camera, focus);
  if (started) {
    const combatNear = G.sims.some((s) => s.combat.target && !s.dead && s.pos.distanceTo(focus) < 45);
    audio.update(rdt, env, focus, combatNear);
    ui.update(rdt);
    // LOD: hide far characters
    const QT = perf ? perf.t : { charDist: 170, charShadow: 45 };
    for (const s of G.sims) { if (s.hidden) continue; const d = s.pos.distanceTo(camera.position); s.char.root.visible = d < QT.charDist; s.char.setLOD?.(d < 16 ? 0 : d < QT.charShadow ? 1 : 2); }
    const s = G.selected;
    selRing.visible = !!s && !s.hidden && !s.dead && player.mode === 'overseer';
    if (selRing.visible) { selRing.position.set(s.pos.x, s.pos.y + 0.06, s.pos.z); selRing.scale.setScalar(1 + Math.sin(time * 4) * 0.06); selRing.material.color.set(s.moodLabel[1]); }
    // pacing: whole household asleep at night -> fast-forward; something happens -> back to normal
    const fam = G.household.filter((h) => !h.dead);
    const asleep = fam.length && fam.every((h) => h.hidden && h.action?.obj?.def?.anim === 'sleep') && !G.director.active && player.mode === 'overseer';
    if (asleep && !G.nightFF && !G.paused) { G.nightFF = G.timeScale; G.timeScale = 12; ui.refreshSpeed(); ui.toast('☾ The household sleeps… night passes.'); }
    else if (G.nightFF && (!asleep)) { G.timeScale = G.nightFF; G.nightFF = null; ui.refreshSpeed(); }
    if (G.director.active && G.director.active !== G._lastEv) { G._lastEv = G.director.active; if (G.timeScale > 3 && !G.nightFF) { G.timeScale = 1; ui.refreshSpeed(); } }
  }
  grade.uniforms.uTime.value = time;
  if (photo.on && photo.bokeh) { photo.bokeh.uniforms.focus.value = camera.position.distanceTo(player.focus); }
  if (photo.on) grade.uniforms.uCine.value = photo.bars ? Math.max(grade.uniforms.uCine.value, 1) : grade.uniforms.uCine.value;
  G?._cineTick?.(rdt);
  composer.render();
  if (started) { perf?.sample(performance.now() - frameT0); perf?.update(rdt, now); }
  G?._afterRender?.();
  if (photo.capture) {
    photo.capture = false;
    const a = document.createElement('a'); a.download = `haeryeong-${G.env.day}-${G.env.timeLabel.replace(':', '')}.png`; a.href = renderer.domElement.toDataURL('image/png'); a.click();
    ui.toast('📷 Image saved.');
  }
}

if (!redirecting) boot().catch((e) => { console.error(e); lmsg('Error: ' + e.message, 100); });
