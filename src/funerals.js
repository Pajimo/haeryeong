// Funerals (장례): mourners in undyed hemp carry the dead on a painted bier to the burial hill,
// perform the rites and raise a grass mound with a stone tablet. Graves persist and can be visited.
import * as THREE from 'three';
import { KINDS } from './buildings.js';
import { groundAt, heightAt, roadDist, LAYOUT } from './terrain.js';
import { addSnow } from './season.js';
import { planPath } from './sim.js';

const HEMP = new THREE.Color('#ddd5c2');
const CLOTH = [1, 2, 3, 4, 5, 7, 8, 11]; // palette slots that are clothing

KINDS.grave = { label: 'Pay Respects', ko: '성묘', adv: { honor: 0.45, fun: 0.05, social: 0.1 }, dur: [12, 22], anim: 'kneel', cap: 2, outdoor: true };

const mats = {};
function M() {
  if (mats.grass) return mats;
  mats.grass = new THREE.MeshStandardMaterial({ color: '#5f7a3a', roughness: 0.95 }); addSnow(mats.grass, 1, 'grave-grass');
  mats.stone = new THREE.MeshStandardMaterial({ color: '#9a978e', roughness: 0.85 }); addSnow(mats.stone, 0.6, 'grave-stone');
  mats.wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.8 });
  mats.red = new THREE.MeshStandardMaterial({ color: '#a8261e', roughness: 0.6 });
  mats.blue = new THREE.MeshStandardMaterial({ color: '#1f4a7a', roughness: 0.6 });
  mats.gold = new THREE.MeshStandardMaterial({ color: '#d9a830', roughness: 0.5, metalness: 0.3 });
  mats.shroud = new THREE.MeshStandardMaterial({ color: '#eee8da', roughness: 0.9 });
  return mats;
}

function graveMesh(royal) {
  const m = M(); const g = new THREE.Group(); const k = royal ? 2.2 : 1;
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1.25 * k, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.grass);
  mound.scale.y = 0.62; mound.castShadow = mound.receiveShadow = true; g.add(mound); g.userData.mound = mound;
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.42 * k, 0.75 * k, 0.12 * k), m.stone); tab.position.set(0, 0.37 * k, 1.75 * k); tab.castShadow = true; g.add(tab);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55 * k, 0.08 * k, 0.2 * k), m.stone); cap.position.set(0, 0.78 * k, 1.75 * k); g.add(cap);
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.9 * k, 0.32 * k, 0.5 * k), m.stone); table.position.set(0, 0.16 * k, 2.25 * k); table.castShadow = true; g.add(table);
  // low crescent wall behind the mound (dullesuk)
  const wall = new THREE.Mesh(new THREE.TorusGeometry(1.75 * k, 0.16 * k, 6, 18, Math.PI), m.grass);
  wall.rotation.set(-Math.PI / 2, 0, 0); wall.scale.z = 0.5; wall.position.z = -0.1; g.add(wall);
  if (royal) for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 8), m.stone); st.position.set(sx * 2.6, 1.1, 4.4); st.castShadow = true; g.add(st); }
  return g;
}
function bierMesh() {
  const m = M(); const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 2.0), m.wood); base.position.y = 1.0; g.add(base);
  for (const sx of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.6, 6), m.wood); pole.rotation.x = Math.PI / 2; pole.position.set(sx * 0.48, 0.98, 0); g.add(pole); }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), m.shroud); body.rotation.x = Math.PI / 2; body.position.y = 1.25; g.add(body);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.5, 1.9), m.red); box.position.y = 1.4; g.add(box);
  for (const z of [-0.95, 0.95]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.52, 0.04), m.blue); p.position.set(0, 1.4, z); g.add(p); }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.62, 0.45, 4, 1), m.blue); roof.rotation.y = Math.PI / 4; roof.scale.z = 2.4; roof.position.y = 1.88; g.add(roof);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m.gold); fin.position.y = 2.14; g.add(fin);
  for (const sx of [-1, 1]) for (const z of [-0.95, 0.95]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), m.gold); t.position.set(sx * 0.4, 1.7, z); g.add(t); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createFuneralsSystem(G) {
  const day = () => G.env.day + G.env.hour / 24;
  let site = null;
  const graves = []; // { x, z, name, ko, day, royal, mesh, obj, simId }
  const pending = []; // deceased waiting for burial
  let fun = null; // the funeral in progress

  function findSite() {
    if (site) return site;
    const vc = LAYOUT.village; let best = null, bs = -1e9;
    const hAt = heightAt;
    for (let x = -240; x <= 240; x += 6) for (let z = -240; z <= 240; z += 6) {
      const d = Math.hypot(x - vc[0], z - vc[1]); if (d < 70 || d > 150) continue;
      const h = hAt(x, z); if (h < 1) continue;
      if (roadDist(x, z) < 10 || G.nav.blocked(x, z, 6)) continue;
      let ok = true; for (const [dx, dz] of [[12, 0], [-12, 0], [0, 10], [0, -14]]) if (Math.abs(hAt(x + dx, z + dz) - h) > 3 || G.nav.blocked(x + dx, z + dz, 3)) ok = false;
      if (!ok) continue;
      const south = hAt(x, z - 10) - hAt(x, z + 10); // higher behind (north) = faces the southern sun
      const score = south * 2 - Math.abs(d - 100) * 0.03 - Math.abs(hAt(x + 6, z) - hAt(x - 6, z));
      if (score > bs) { bs = score; best = [x, z]; }
    }
    site = best || [-70, -124];
    return site;
  }
  function slot(i, royal) {
    const [cx, cz] = findSite();
    if (royal) return [cx, cz - 14 - (graves.filter((g) => g.royal).length) * 9];
    const row = Math.floor(i / 5), col = i % 5;
    return [cx + (col - 2) * 5.2 + (row % 2) * 2.4, cz - row * 5.5];
  }
  function placeGrave(rec, grow) {
    const mesh = graveMesh(rec.royal);
    mesh.position.set(rec.x, groundAt(rec.x, rec.z) - 0.05, rec.z);
    G.scene.add(mesh);
    if (grow) mesh.userData.mound.scale.set(0.05, 0.03, 0.05);
    rec.mesh = mesh;
    rec.obj = G.addObject('grave', rec.x, rec.z + 2.8 * (rec.royal ? 2.2 : 1), { face: Math.PI, title: `Grave of ${rec.name}`, look: [rec.x, rec.z], prop: 'none', grave: rec });
    G.nav.addCircle?.(rec.x, rec.z, rec.royal ? 2.6 : 1.3);
    graves.push(rec);
    return rec;
  }

  function isMourner(o, d) {
    if (o.dead || o.hidden || o === d) return false;
    if (d.spouse === o || o.parents?.includes(d) || d.parents?.includes(o) || (d.children || []).includes(o)) return true;
    if (o.parents?.length && d.parents?.some((p) => o.parents.includes(p))) return true;
    if (d.household && o.household) return true;
    if (d.job === 'king' || d.job === 'queen') return o.job !== 'bandit' && o.faction !== 'bandit' && o.age !== 'child' && Math.random() < 0.5;
    return (o.getRel?.(d)?.f || 0) > 35;
  }
  function dress(s, on) {
    const pal = s.char.skinMat?.userData?.pal; if (!pal) return;
    if (on) { if (s._hemp) return; s._hemp = CLOTH.map((i) => pal[i].clone()); for (const i of CLOTH) pal[i].copy(HEMP).multiplyScalar(i === 4 ? 0.8 : 1); }
    else if (s._hemp) { CLOTH.forEach((i, k) => pal[i].copy(s._hemp[k])); s._hemp = null; }
  }

  function startFuneral(d) {
    const royal = d.job === 'king' || d.job === 'queen';
    const at = d.home?.door ? [d.home.door[0], d.home.door[1]] : [d.pos.x, d.pos.z];
    if (royal) { at[0] = LAYOUT.palaceGate[0]; at[1] = LAYOUT.palaceGate[1] + 6; }
    const mourners = G.sims.filter((o) => isMourner(o, d) && !o.controlled && !o.combat.target && !o.missionLock && o.action?.type !== 'flee').slice(0, royal ? 40 : 14);
    const [gx, gz] = slot(graves.filter((g) => !g.royal).length, royal);
    // few to mourn and none of ours: the temple monks bury them quietly
    if (mourners.length < 3 && !royal && !d.household && !mourners.some((o) => o.household)) {
      placeGrave({ x: gx, z: gz, name: d.name.full, ko: d.name.hangul, day: G.env.day, royal: false, simId: d.id, household: false }, false);
      G.log(`${d.name.full} was buried quietly on the burial hill by the temple monks${mourners.length ? `, ${mourners.map((o) => o.name.given).join(' and ')} weeping beside the mound` : ''}.`, 'story', { x: gx, z: gz });
      for (const o of mourners) { o.moodlets = o.moodlets.filter((m) => m.id !== 'grief'); o.addMoodlet('laidToRest', `Laid ${d.name.given} to rest`, 6, 1440); }
      if (d !== G.selected && !d.removed) { d.dispose?.(); d.removed = true; }
      return;
    }
    fun = { d, royal, at, grave: [gx, gz], mourners, phase: 'gather', t: 0, bier: bierMesh(), bearers: [] };
    fun.bier.position.set(at[0], groundAt(at[0], at[1]), at[1]); G.scene.add(fun.bier);
    if (!d.removed) d.setHidden?.(true);
    // bearers: able men among the mourners, topped up with whoever is near
    const able = (o) => !o.dead && o.age !== 'child' && o.age !== 'elder' && o.sex === 'm' && !o.controlled;
    fun.bearers = mourners.filter(able).slice(0, 4);
    if (fun.bearers.length < 4) fun.bearers.push(...G.sims.filter((o) => able(o) && !fun.bearers.includes(o) && !o.combat.target && !o.missionLock && o.faction !== 'bandit').sort((a, b) => a.pos.distanceTo(d.pos) - b.pos.distanceTo(d.pos)).slice(0, 4 - fun.bearers.length));
    fun.lead = mourners.find((o) => d.children?.includes(o) && o.age !== 'child') || d.spouse && !d.spouse.dead && mourners.includes(d.spouse) && d.spouse || mourners[0] || fun.bearers[0];
    for (const o of new Set([...mourners, ...fun.bearers])) {
      o.missionLock = true; o.cancelAction(); dress(o, mourners.includes(o));
      if (!fun.bearers.includes(o)) o.startAction({ type: 'goto', dest: [at[0] + (Math.random() - 0.5) * 8, at[1] + 3 + Math.random() * 5], label: `Mourning ${d.name.given}` });
    }
    const who = royal ? `His Majesty ${d.name.full}` : d.name.full;
    G.log(`${royal ? 'A state funeral (국장)' : 'A funeral (장례)'} for ${who}. ${mourners.length} mourner${mourners.length === 1 ? '' : 's'} in undyed hemp gather${royal ? ' at the palace gate' : ' at the house'}; the bier is painted red and blue.`, 'story', { x: at[0], z: at[1] });
    if (mourners.some((o) => o.household) || d.household) G.ui?.toast(`⚱ The funeral of ${d.name.given} begins.`, 'story');
    G.audio?.flute?.(220, 4, 0.05);
  }
  function endFuneral(ok) {
    const f = fun; fun = null; if (!f) return;
    G.scene.remove(f.bier);
    for (const o of new Set([...f.mourners, ...f.bearers])) {
      if (o.dead) continue; o.missionLock = false; dress(o, false); o.cancelAction();
      if (ok && f.mourners.includes(o)) { o.moodlets = o.moodlets.filter((m) => m.id !== 'grief' && m.id !== 'bereaved'); o.addMoodlet('laidToRest', `Laid ${f.d.name.given} to rest`, 6, 1440); o.needs.social = Math.min(100, o.needs.social + 25); }
    }
    if (ok) {
      const rec = f.rec;
      G.log(`${f.d.name.full} was laid to rest on the burial hill. ${f.mourners.length > 8 ? 'Few in the village have been so mourned.' : 'The mound is fresh; the tablet reads ' + f.d.name.hangul + '.'}`, 'story', { x: rec.x, z: rec.z });
      G.systems.find((x) => x.id === 'memories')?.remember && f.mourners.forEach((o) => G.systems.find((x) => x.id === 'memories').remember(o, f.d, `Burying ${f.d.name.given}`, 8, 'buried'));
      G.emit('funeral', { sim: f.d, mourners: f.mourners });
    }
    if (f.d !== G.selected && !f.d.removed) { f.d.dispose?.(); f.d.removed = true; }
  }

  return {
    id: 'funerals',
    graves,
    site: () => findSite(),
    current: () => fun,
    pending,
    update(dt, gm) {
      const h = G.env.hour;
      if (!fun) {
        if (!pending.length || h < 7 || h > 16.5 || G.raidActive || G.standoffActive) return;
        const d = pending.shift();
        if (!d || (d.removed && !d.household)) return;
        startFuneral(d);
        return;
      }
      const f = fun; f.t += gm;
      const bier = f.bier; const lead = f.lead;
      if (!lead || lead.dead) return endFuneral(false);
      if (G.raidActive) { G.log(`The funeral of ${f.d.name.given} scatters as raiders strike.`, 'danger'); pending.unshift(f.d); return endFuneral(false); }
      // bearers follow the bier, sway as they walk
      const placeBearers = (moving) => {
        const hd = Math.atan2(f.dir?.[0] || 0, f.dir?.[1] || 1);
        f.bearers.forEach((b, i) => {
          if (b.dead) return;
          const sx = i % 2 ? 0.48 : -0.48, sz = i < 2 ? 1.5 : -1.5;
          const x = bier.position.x + Math.cos(hd) * sx + Math.sin(hd) * sz, z = bier.position.z - Math.sin(hd) * sx + Math.cos(hd) * sz;
          b.pos.set(x, groundAt(x, z), z); b.heading = hd; b.moving = moving; b.curSpeed = 1.2;
          if (b.action?.type !== 'event') { b.cancelAction(); b.action = { type: 'event', phase: 'do', anim: () => (f.phase === 'procession' ? 'walk' : 'idle'), dur: 9999, t: 0, label: `Bearing ${f.d.name.given}'s bier` }; }
        });
      };
      if (f.phase === 'gather') {
        placeBearers(false);
        const here = f.mourners.filter((o) => !o.dead && o.pos.distanceTo(bier.position) < 12).length;
        if (f.t > 70 || here >= f.mourners.length * 0.7) {
          f.phase = 'procession'; f.t = 0;
          lead.char.setProp?.('banner'); lead.say('Aigo… aigo…', 'sad', 4);
          G.log(`The procession sets out for the burial hill, ${lead.name.given} walking ahead with the funeral banner (명정).`, 'story', bier.position);
          f.mourners.forEach((o, i) => { if (o === lead || f.bearers.includes(o) || o.dead) return; o.cancelAction(); });
        }
      } else if (f.phase === 'procession') {
        const [gx, gz] = f.grave;
        f.wp ||= planPath(bier.position.x, bier.position.z, gx, gz + 5);
        if (f.wp.length > 1 && Math.hypot(f.wp[0][0] - bier.position.x, f.wp[0][1] - bier.position.z) < 1.5) f.wp.shift();
        const [tx, tz] = f.wp[0];
        const dx = tx - bier.position.x, dz = tz - bier.position.z, dist = f.wp.length > 1 ? 99 : Math.hypot(dx, dz);
        // steer around walls and houses: try headings fanning out from the direct line
        let ang = Math.atan2(dx, dz);
        const free = (a) => { for (const k of [1.5, 3]) if (G.nav.blocked(bier.position.x + Math.sin(a) * k, bier.position.z + Math.cos(a) * k, 1.4)) return false; return true; };
        if (f.wp.length === 1 && Math.hypot(dx, dz) > 4 && !free(ang)) {
          f.side ||= 1; let found = false;
          for (let i = 1; i <= 8 && !found; i++) for (const sgn of [f.side, -f.side]) { const a = ang + sgn * i * 0.35; if (free(a)) { ang = a; f.side = sgn; found = true; break; } }
        }
        const want = [Math.sin(ang), Math.cos(ang)];
        f.dir = f.dir ? [f.dir[0] + (want[0] - f.dir[0]) * Math.min(1, dt * 3), f.dir[1] + (want[1] - f.dir[1]) * Math.min(1, dt * 3)] : want;
        { const l = Math.hypot(f.dir[0], f.dir[1]) || 1; f.dir = [f.dir[0] / l, f.dir[1] / l]; }
        const step = Math.min(Math.hypot(dx, dz) + 0.01, 1.15 * dt);
        bier.position.x += f.dir[0] * step; bier.position.z += f.dir[1] * step;
        bier.position.y = groundAt(bier.position.x, bier.position.z) + Math.sin(f.t * 6) * 0.03;
        bier.rotation.y = Math.atan2(f.dir[0], f.dir[1]);
        placeBearers(true);
        // the lead walks ahead, mourners trail behind in a loose column
        const ahead = (k) => [bier.position.x + f.dir[0] * k, bier.position.z + f.dir[1] * k];
        f.mourners.forEach((o, i) => {
          if (o.dead || f.bearers.includes(o)) return;
          const p = o === lead ? ahead(3.2) : ahead(-3.5 - Math.floor(i / 2) * 1.4); if (o !== lead) { p[0] += (i % 2 ? 0.7 : -0.7) * f.dir[1]; p[1] -= (i % 2 ? 0.7 : -0.7) * f.dir[0]; }
          const dd = Math.hypot(p[0] - o.pos.x, p[1] - o.pos.z);
          if (dd > 1.2) { if (o.action?.type !== 'goto' || (o._fT = (o._fT || 0) + dt) > 1.5) { o._fT = 0; o.cancelAction(); o.startAction({ type: 'goto', dest: p, run: dd > 8, label: `In ${f.d.name.given}'s funeral procession` }); } }
          if (Math.random() < 0.002) o.say(['Aigo… aigo…', `${f.d.name.given}-ya…`, '(weeps)', 'Go in peace.'][Math.floor(Math.random() * 4)], 'sad', 3);
        });
        if (dist < 0.2 || f.t > 300) {
          f.phase = 'rites'; f.t = 0;
          f.rec = placeGrave({ x: gx, z: gz, name: f.d.name.full, ko: f.d.name.hangul, day: G.env.day, royal: f.royal, simId: f.d.id, household: !!f.d.household }, true);
          G.scene.remove(bier);
          f.bearers.forEach((b) => { if (!b.dead) b.cancelAction(); });
          const all = [...new Set([...f.mourners, ...f.bearers])].filter((o) => !o.dead);
          all.forEach((o, i) => {
            const a = (i / all.length) * Math.PI - Math.PI; const r = f.royal ? 7 : 4.2;
            o.cancelAction(); o.startAction({ type: 'event', dest: [gx + Math.cos(a) * r * -1, gz + 3 + Math.abs(Math.sin(a)) * 2.5], phase: 'move', anim: (z) => (Math.sin(f.t * 0.2 + z.id) > 0.2 ? 'kneel' : 'bow'), dur: 70, look: [gx, gz], label: `Funeral rites for ${f.d.name.given}` });
          });
          lead.char.setProp?.(null);
        }
      } else if (f.phase === 'rites') {
        const m = f.rec.mesh.userData.mound; const k = Math.min(1, f.t / 50);
        m.scale.set(0.05 + k * 0.95, (0.03 + k * 0.97) * 0.62, 0.05 + k * 0.95);
        if (Math.random() < 0.004) { const o = f.mourners[Math.floor(Math.random() * f.mourners.length)]; o && !o.dead && o.say(['Aigo… aigo…', '(bows deeply)', `Rest well, ${f.d.name.given}.`, '(wails)'][Math.floor(Math.random() * 4)], 'sad', 3); }
        if (f.t > 75) endFuneral(true);
      }
    },
    onEvent(name, p) {
      if (name !== 'death') return;
      const d = p.sim;
      if (!d || d.faction === 'bandit' || d.faction?.startsWith?.('enemy') || d.assassin || d.missionTemp || d.isAnimal) return;
      if (pending.includes(d) || pending.length > 6) return;
      d.deadT = -99999; // keep the body until the funeral
      pending.push(d);
    },
    serialize() { return { site, graves: graves.map(({ x, z, name, ko, day, royal, household }) => ({ x, z, name, ko, day, royal, household })) }; },
    restore(d) {
      if (d?.site) site = d.site;
      for (const g of d?.graves || []) placeGrave({ ...g }, false);
    },
  };
}
