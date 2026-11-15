// Character creator (인물 만들기): shape the head of your household before the story begins.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SURNAMES, TRAITS, OPPOSED, M_SYL, F_SYL, JOBS } from './data.js';
import { BIRTHS, applyBirth } from './birth.js';

const PATHS = {
  swordsman: { icon: '⚔', title: 'Wandering Swordsman', ko: '검객', desc: 'A blade for hire with a code of honour. Strong in duels and missions of the blade.', coins: 60, skills: { sword: 6.5 }, armed: true },
  hunter: { icon: '🏹', title: 'Hunter', ko: '사냥꾼', desc: 'Knows the woods, the bow and the tiger’s tracks. Earns from pelts and game.', coins: 50, skills: { sword: 4.5, archery: 6 }, armed: true },
  scholar: { icon: '📜', title: 'Scholar', ko: '선비', desc: 'Studies the classics and aims for the civil service exam and a place at court.', coins: 90, skills: { scholarship: 7, charisma: 4 } },
  merchant: { icon: '💰', title: 'Merchant', ko: '상인', desc: 'Buys low, sells high, and starts with a fat purse. Money opens every door.', coins: 220, skills: { charisma: 6 } },
  farmer: { icon: '🌾', title: 'Farmer', ko: '농부', desc: 'Humble and steady. Loved by neighbours, rich in harvests rather than coin.', coins: 40, skills: { farming: 7 } },
  fisher: { icon: '🎣', title: 'Fisher', ko: '어부', desc: 'Lives by the river’s moods. Quiet days, good stories, the occasional legendary catch.', coins: 45, skills: { fishing: 7 } },
};
const SKINS = ['#efc8a6', '#ecc19c', '#e2b18a', '#d8a47c', '#cc9470', '#c08660'];
const HAIRS = ['#0f0d0d', '#141110', '#1c1714', '#241c17', '#2a201a', '#3a2a20'];
const CLOTH = ['#e8e2d2', '#d8ccb0', '#3c5d8c', '#2c3a5e', '#5a2a2a', '#2d6b4c', '#7a3b8f', '#a3262a', '#c9b98a', '#2a2a32', '#c23b6d', '#e8c260'];
const cap = (w) => w[0].toUpperCase() + w.slice(1);

export function openCreator(G, done) {
  const hh = G.household; const hero = hh[0];
  const st = {
    surname: hero.name.surname, sex: hero.sex, given: hero.name.given, hangulGiven: hero.name.hangul.slice(1),
    birth: 'commoner', path: 'swordsman', traits: hero.traits.slice(0, 3), skin: hero.look?.skin || SKINS[1], hair: hero.look?.hair || HAIRS[1], cloth: null,
  };
  const el = document.createElement('div'); el.id = 'creator';
  document.body.appendChild(el);
  // preview renderer
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true }); R.setPixelRatio(Math.min(2, devicePixelRatio)); R.setSize(260, 360);
  R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403830, 1.5));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4); key.position.set(1.2, 2, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa0c0ff, 1.4); rim.position.set(-2, 1.4, -1.5); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(26, 260 / 360, 0.05, 20);
  let model = null, spin = 0.5, alive = true, zoom = 0;

  function name() {
    const syl = st.sex === 'f' ? F_SYL : M_SYL; const a = syl[Math.floor(Math.random() * syl.length)]; let b = a; while (b === a) b = syl[Math.floor(Math.random() * syl.length)];
    st.given = `${cap(a[0])}-${b[0]}`; st.hangulGiven = a[1] + b[1];
    if (hh.slice(1).some((s) => s.name.given === st.given)) return name(); // no two family members share a name
  }
  function apply(rebuild = true) {
    const P = PATHS[st.path];
    const kor = SURNAMES.find((x) => x[0] === st.surname)?.[1] || '';
    for (const s of hh) { s.name.surname = st.surname; s.name.full = `${st.surname} ${s.name.given}`; s.name.hangul = kor + s.name.hangul.slice(1); }
    hero.sex = st.sex; hero.name.given = st.given; hero.name.full = `${st.surname} ${st.given}`; hero.name.hangul = kor + st.hangulGiven;
    hero.job = st.path; hero.traits = st.traits.slice();
    hero.armed = !!P.armed; hero.coins = P.coins;
    for (const k in hero.skills) hero.skills[k] = Math.min(hero.skills[k], 2.5);
    Object.assign(hero.skills, P.skills);
    hero.maxHp = 100 + (JOBS[hero.job]?.fighter ? 30 : 0) + hero.skills.sword * 4; hero.hp = hero.maxHp;
    hero.look = { skin: st.skin, hair: st.hair, colors: st.cloth ? { top: st.cloth, robe: st.cloth } : hero.look?.colors };
    if (rebuild) { hero.rebuildModel(); if (!hero.look.colors) hero.look.colors = { ...hero.char.o.colors }; hero.look.hat = hero.char.o.hat; refreshModel(); }
  }
  function refreshModel() {
    if (model) scene.remove(model);
    const hm = hero.hitMesh; hm?.parent?.remove(hm);
    model = SkeletonUtils.clone(hero.char.root); if (hm) hero.char.root.add(hm);
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.visible = true;
    model.traverse((o) => { if (o.isBone && ['neck', 'head', 'spine', 'chest'].includes(o.name)) o.rotation.set(0, 0, 0); });
    scene.add(model);
  }
  function render() {
    if (!alive) return; requestAnimationFrame(render);
    spin += 0.006; if (model) model.rotation.y = Math.sin(spin) * 0.7;
    const h = (hero.char.scale || 1) * 1.62; const zz = zoom;
    cam.position.set(0, h * (0.6 + zz * 0.35), 4.3 - zz * 3.3); cam.lookAt(0, h * (0.55 + zz * 0.4), 0);
    R.render(scene, cam);
  }

  function html() {
    const P = PATHS[st.path];
    const traitChips = Object.keys(TRAITS).map((t) => { const on = st.traits.includes(t); const blocked = !on && st.traits.some((x) => OPPOSED[x] === t || OPPOSED[t] === x); return `<button class="tchip ${on ? 'on' : ''}" ${blocked ? 'disabled' : ''} data-trait="${t}" title="${TRAITS[t].desc}" style="--c:${TRAITS[t].color}">${t}</button>`; }).join('');
    return `<div class="cr-panel">
      <div class="cr-left"><div class="cr-view"></div><div class="cr-zoom"><button data-zoom="0" class="${zoom === 0 ? 'on' : ''}">Full</button><button data-zoom="1" class="${zoom === 1 ? 'on' : ''}">Face</button><button data-act="reroll">🎲 New look</button></div></div>
      <div class="cr-right">
        <h2>Your household · 집안</h2>
        <p class="cr-sub">You lead the house; ${hh.slice(1).map((s) => `${s.name.given} (${s.age === 'elder' ? 'grandmother' : s.sex === 'f' ? 'sister' : 'brother'})`).join(' and ')} live under your roof.</p>
        <div class="cr-row"><label>Family name</label><select data-k="surname">${SURNAMES.map(([r, k]) => `<option value="${r}" ${r === st.surname ? 'selected' : ''}>${r} ${k}</option>`).join('')}</select></div>
        <div class="cr-row"><label>Given name</label><input data-k="given" value="${st.given}" maxlength="16"><button data-act="name" title="Random name">🎲</button></div>
        <div class="cr-row"><label>Sex</label><div class="seg"><button data-sex="m" class="${st.sex === 'm' ? 'on' : ''}">Man</button><button data-sex="f" class="${st.sex === 'f' ? 'on' : ''}">Woman</button></div></div>
        <div class="cr-row top"><label>Birth</label><div class="paths births">${Object.entries(BIRTHS).map(([k, b]) => `<button data-birth="${k}" class="${k === st.birth ? 'on' : ''}">${b.icon} ${b.name}<small>${b.ko}</small></button>`).join('')}</div></div>
        <p class="cr-desc">${BIRTHS[st.birth].desc}</p>
        <div class="cr-row top"><label>Path</label><div class="paths">${Object.entries(PATHS).map(([k, p]) => `<button data-path="${k}" class="${k === st.path ? 'on' : ''}">${p.icon} ${p.title}<small>${p.ko}</small></button>`).join('')}</div></div>
        <p class="cr-desc">${P.desc} <b>${P.coins} nyang</b> to start.</p>
        <div class="cr-row top"><label>Traits <small>${st.traits.length}/3</small></label><div class="traits">${traitChips}</div></div>
        <div class="cr-row"><label>Skin</label><div class="sw">${SKINS.map((c) => `<button data-skin="${c}" class="${c === st.skin ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="cr-row"><label>Hair</label><div class="sw">${HAIRS.map((c) => `<button data-hair="${c}" class="${c === st.hair ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="cr-row"><label>Clothes</label><div class="sw">${CLOTH.map((c) => `<button data-cloth="${c}" class="${c === st.cloth ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="cr-actions"><button data-act="random">🎲 Surprise me</button><button class="go" data-act="go">Begin the story · 시작</button></div>
      </div></div>`;
  }
  function draw() {
    const view = el.querySelector('.cr-view')?.firstChild;
    el.innerHTML = html();
    el.querySelector('.cr-view').appendChild(view || R.domElement);
    el.onclick = onClick;
    el.querySelector('[data-k="surname"]').onchange = (e) => { st.surname = e.target.value; apply(false); };
    el.querySelector('[data-k="given"]').oninput = (e) => { const v = e.target.value.trim(); st.given = v ? cap(v) : st.given; st.hangulGiven = ''; apply(false); };
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.sex && d.sex !== st.sex) { st.sex = d.sex; name(); st.cloth = null; hero.look = { skin: st.skin, hair: st.hair }; apply(); }
    else if (d.birth) { st.birth = d.birth; }
    else if (d.path) { st.path = d.path; st.cloth = null; hero.look = { skin: st.skin, hair: st.hair }; apply(); }
    else if (d.trait) { const i = st.traits.indexOf(d.trait); if (i >= 0) st.traits.splice(i, 1); else { if (st.traits.length >= 3) st.traits.shift(); st.traits.push(d.trait); } apply(false); }
    else if (d.skin) { st.skin = d.skin; apply(); }
    else if (d.hair) { st.hair = d.hair; apply(); }
    else if (d.cloth) { st.cloth = d.cloth; hero.look.colors = { ...(hero.look.colors || {}), top: d.cloth, robe: d.cloth }; apply(); }
    else if (d.zoom) zoom = +d.zoom;
    else if (d.act === 'name') name(), apply(false);
    else if (d.act === 'reroll') { st.cloth = null; hero.look = { skin: st.skin, hair: st.hair }; apply(); }
    else if (d.act === 'random') {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      st.birth = 'fate'; st.sex = pick(['m', 'f']); st.surname = pick(SURNAMES)[0]; st.path = pick(Object.keys(PATHS)); st.skin = pick(SKINS); st.hair = pick(HAIRS); st.cloth = null; name();
      const pool = Object.keys(TRAITS).sort(() => Math.random() - 0.5); st.traits = [];
      for (const t of pool) { if (st.traits.length >= 3) break; if (!st.traits.some((x) => OPPOSED[x] === t || OPPOSED[t] === x)) st.traits.push(t); }
      hero.look = { skin: st.skin, hair: st.hair }; apply();
    } else if (d.act === 'go') { finish(); return; }
    draw();
  }
  function finish() {
    alive = false; apply(false);
    if (!hero.look.colors) hero.look.colors = { ...hero.char.o.colors };
    for (const s of hh) G.ui?.portraits.cache.delete(s.id);
    el.remove(); R.dispose();
    try { localStorage.setItem('haeryeong_lastHero', JSON.stringify(st)); } catch { /* ignore */ }
    try { applyBirth(G, st.birth); } catch (e) { console.error('[birth]', e); }
    done();
  }
  apply(); draw(); render();
}
