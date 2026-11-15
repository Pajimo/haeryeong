// The royal treasury (국고) and public works (공사). Taxes flow into the treasury every dawn.
// Whoever holds power — the King, or a minister of the 6th rank and above — can commission works
// that rise in the world over several days, raised by villagers, and change life in the valley.
import * as THREE from 'three';
import { groundAt, roadDist, LAYOUT } from './terrain.js';

const WORKS = {
  tower: { name: 'Beacon Watchtower', ko: '봉수대', cost: 220, days: 2, desc: 'Signal fires on the ridge: raids are spotted early and the realms think twice.', near: 'ridge' },
  granary: { name: 'Ever-Normal Granary', ko: '상평창', cost: 260, days: 2, desc: 'Rice stored in good years and sold cheap in bad: famines bite less, and the poor bless your name.', near: 'market' },
  academy: { name: 'Confucian Academy', ko: '서원', cost: 300, days: 3, desc: 'Scholars gather to teach; the young grow learned and the court gains able officials.', near: 'village' },
  pagoda: { name: 'Stone Pagoda', ko: '석탑', cost: 180, days: 2, desc: 'A nine-storey pagoda by the temple road. Pilgrims come; hearts grow calm.', near: 'temple' },
  market: { name: 'Market Arcade', ko: '시전', cost: 280, days: 2, desc: 'Covered stalls by the plaza: merchants pay more rent, and every stall earns a little more.', near: 'market' },
  statue: { name: 'Stele of the Founder', ko: '기념비', cost: 150, days: 1, desc: 'A stone tortoise bearing a stele that records the deeds of your house for ever.', near: 'plaza' },
};

export function createRoyalWorksSystem(G) {
  const st = { treasury: 400, built: [], projects: [], lastTax: 0 };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const meshes = {};
  const has = (k) => st.built.some((b) => b.k === k);
  function ruler() { return G.household.find((s) => !s.dead && (s.job === 'king' || (s.factions?.court?.rank || 0) >= 6)) || null; }
  function site(k) {
    const anchors = { ridge: [LAYOUT.palace[0] + 60, LAYOUT.palace[1] + 40], market: G.world.spots.market || [0, 78], village: [LAYOUT.village[0] - 40, LAYOUT.village[1] - 30], temple: [LAYOUT.temple[0] - 30, LAYOUT.temple[1] + 10], plaza: [LAYOUT.plaza[0] + 14, LAYOUT.plaza[1] + 14] };
    const [ax, az] = anchors[WORKS[k].near] || [0, 0];
    for (let r = 6; r < 60; r += 3) for (let a = 0; a < Math.PI * 2; a += 0.4) { const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r; if (!G.nav.blocked(x, z, 5) && !(G.reserved || []).some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr + 5) && roadDist(x, z) > 6 && Math.abs(groundAt(x + 4, z) - groundAt(x - 4, z)) < 1.2) return [x, z]; }
    return [ax + 20, az + 20];
  }
  function mesh(k, done) {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#a8a296', roughness: 0.9 }), wood = new THREE.MeshStandardMaterial({ color: '#6b3a22', roughness: 0.8 }), tile = new THREE.MeshStandardMaterial({ color: '#3a4048', roughness: 0.7 }), red = new THREE.MeshStandardMaterial({ color: '#8a2a1e', roughness: 0.7 }), plaster = new THREE.MeshStandardMaterial({ color: '#ece4d2', roughness: 0.9 });
    const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    if (!done) { // scaffolding
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) add(new THREE.CylinderGeometry(0.06, 0.06, 4, 5), wood, x, 2, z);
      for (const y of [1.2, 2.6]) for (const r of [0, Math.PI / 2]) add(new THREE.BoxGeometry(4.2, 0.08, 0.08), wood, 0, y, 0, r).position.set(0, y, r ? 2 : -2);
      add(new THREE.BoxGeometry(2.4, 0.8, 2.4), stone, 0, 0.4, 0);
      return g;
    }
    if (k === 'tower') { add(new THREE.CylinderGeometry(1.6, 2.2, 5, 8), stone, 0, 2.5, 0); add(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 8), stone, 0, 5.4, 0); const fire = add(new THREE.ConeGeometry(0.5, 1, 8), new THREE.MeshBasicMaterial({ color: '#ff8a2a' }), 0, 6.3, 0); fire.userData.flame = true; }
    if (k === 'granary') { add(new THREE.BoxGeometry(7, 3, 4), plaster, 0, 1.9, 0); for (const x of [-3.2, 3.2]) for (const z of [-1.8, 1.8]) add(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 6), stone, x, 0.3, z); const roof = add(new THREE.CylinderGeometry(0.1, 3.4, 1.6, 4, 1), tile, 0, 4.2, 0, Math.PI / 4); roof.scale.set(1.45, 1, 0.85); }
    if (k === 'academy') { add(new THREE.BoxGeometry(9, 0.6, 5), stone, 0, 0.3, 0); add(new THREE.BoxGeometry(8, 2.6, 4), plaster, 0, 1.9, 0); for (let i = -3; i <= 3; i++) add(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8), red, i * 1.3, 1.9, 2.05); const roof = add(new THREE.CylinderGeometry(0.1, 4.2, 1.8, 4, 1), tile, 0, 4.1, 0, Math.PI / 4); roof.scale.set(1.5, 1, 0.75); }
    if (k === 'pagoda') { let y = 0, s = 1.6; for (let i = 0; i < 9; i++) { add(new THREE.BoxGeometry(s * 1.3, 0.15, s * 1.3), stone, 0, y + 0.08, 0); add(new THREE.BoxGeometry(s, 0.55, s), stone, 0, y + 0.43, 0); y += 0.7; s *= 0.9; } add(new THREE.ConeGeometry(0.25, 1.2, 8), new THREE.MeshStandardMaterial({ color: '#c49a2a', metalness: 0.5 }), 0, y + 0.6, 0); }
    if (k === 'market') { for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 3.2; add(new THREE.BoxGeometry(2.8, 0.9, 1.6), wood, x, 0.45, 0); for (const sx of [-1.3, 1.3]) add(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), wood, x + sx, 1.3, -0.6); const r = add(new THREE.BoxGeometry(3.1, 0.12, 2.4), tile, x, 2.65, 0); r.rotation.x = 0.15; } }
    if (k === 'statue') { add(new THREE.BoxGeometry(3, 0.5, 4), stone, 0, 0.25, 0); add(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone, 0, 0.5, 0).scale.set(1, 0.6, 1.4); add(new THREE.SphereGeometry(0.35, 8, 6), stone, 0, 0.9, 1.6); add(new THREE.BoxGeometry(1.4, 2.6, 0.35), stone, 0, 2.2, 0); add(new THREE.BoxGeometry(1.7, 0.5, 0.5), stone, 0, 3.7, 0); }
    return g;
  }
  function place(rec, done) {
    if (meshes[rec.id]) { G.scene.remove(meshes[rec.id]); }
    const g = mesh(rec.k, done); g.position.set(rec.x, groundAt(rec.x, rec.z), rec.z); g.rotation.y = rec.ry || 0; G.scene.add(g); meshes[rec.id] = g;
    if (done && !rec.navved) { rec.navved = true; G.nav.addCircle(rec.x, rec.z, rec.k === 'granary' || rec.k === 'academy' || rec.k === 'market' ? 4 : 2.2); }
  }
  function commission(k, who) {
    const W = WORKS[k]; if (st.treasury < W.cost) return G.ui.toast(`The treasury holds only ${st.treasury} nyang.`);
    st.treasury -= W.cost; const [x, z] = site(k);
    const rec = { id: k + '_' + G.env.day, k, x, z, ry: Math.random() * Math.PI, done: G.env.day + W.days + G.env.hour / 24, by: who.name.full };
    st.projects.push(rec); place(rec, false); (G.reserved ||= []).push([x, z, 5]);
    G.log(`🏗 By order of ${who.name.full}, work begins on the ${W.name} (${W.ko}). ${W.cost} nyang flow from the treasury; masons and labourers are hired from every village.`, 'decree', { x, z });
    G.ui.toast(`🏗 The ${W.name} will be finished in about ${W.days} day${W.days > 1 ? 's' : ''}.`, 'decree');
  }
  function finish(rec) {
    st.projects = st.projects.filter((p) => p !== rec); st.built.push(rec); place(rec, true);
    const W = WORKS[rec.k];
    G.log(`🏯 The ${W.name} (${W.ko}) stands complete. ${W.desc}`, 'tournament', { x: rec.x, z: rec.z });
    for (const s of G.sims) if (!s.dead && s.faction === 'village') s.addMoodlet('works_' + rec.k, `The new ${W.name.toLowerCase()}`, 6, 1440);
    const by = G.sims.find((s) => s.name.full === rec.by); if (by) { by.needs.honor = 100; G.systems.find((x) => x.id === 'missions')?.addFame?.(by, 'heart', 8); }
    if (rec.k === 'statue') for (const s of G.household) s.addMoodlet('stele', 'Our name carved in stone', 12, 4320);
  }
  function open(me) {
    const isRuler = ruler() === me || me.job === 'king';
    const el = G.ui.modal(`<h2>The Royal Treasury · 국고</h2>
      <p>The treasury holds <b>${st.treasury} nyang</b>. Every dawn the tax-collectors bring in about ${income()} nyang${G.systems.find((x) => x.id === 'politics')?.st?.taxes > 0 ? ' (war levy in force)' : ''}.</p>
      ${st.projects.length ? `<p>Under construction: ${st.projects.map((p) => `${WORKS[p.k].name} (day ${Math.ceil(p.done)})`).join(', ')}.</p>` : ''}
      ${st.built.length ? `<p>Standing works: ${st.built.map((b) => WORKS[b.k].name).join(', ')}.</p>` : ''}
      ${isRuler ? `<div class="rw-list">${Object.entries(WORKS).map(([k, W]) => { const done = has(k) || st.projects.some((p) => p.k === k); return `<div class="uw-row"><div><b>${W.name}</b> <span class="ko">${W.ko}</span><small>${W.desc}</small></div><button data-w="${k}" ${done || st.treasury < W.cost ? 'disabled' : ''}>${done ? 'Built' : `${W.cost} nyang`}</button></div>`; }).join('')}</div>
        <p class="po-hint">As ${me.job === 'king' ? 'King' : 'a high minister'}, you may also take from the treasury for yourself — at a price.</p><button data-skim class="rw-skim">Quietly take 100 nyang</button>`
      : `<p class="po-hint">Only the King, or a minister of the 6th rank or higher, may command public works.</p>`}`);
    el.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { commission(b.dataset.w, me); open(me); }));
    el.querySelector('[data-skim]')?.addEventListener('click', () => {
      if (st.treasury < 100) return; st.treasury -= 100; G.household[0].earn(100);
      if (Math.random() < 0.3) { G.log(`A censor discovers that 100 nyang have vanished from the treasury into ${me.name.full}'s coffers!`, 'danger'); me.needs.honor = Math.max(0, me.needs.honor - 30); const P = G.systems.find((x) => x.id === 'politics'); if (P && me.factions?.court && me.job !== 'king') { me.factions.court.rank = Math.max(0, me.factions.court.rank - 1); } for (const s of G.sims) if (!s.dead && s.faction === 'village') s.changeRel(me, -6); }
      open(me);
    });
  }
  function income() { const P = G.systems.find((x) => x.id === 'politics'); const n = G.sims.filter((s) => !s.dead && s.faction === 'village' && s.age !== 'child').length; return Math.round(n * 1.5 * (1 + (P?.st?.taxes || 0) * 0.25) + (has('market') ? 25 : 0)); }

  const S = {
    id: 'royalWorks', st, WORKS, has,
    onEvent(name) {
      if (name === 'ready') { for (const b of st.built) { place(b, true); (G.reserved ||= []).push([b.x, b.z, 5]); } for (const p of st.projects) { place(p, false); (G.reserved ||= []).push([p.x, p.z, 5]); } }
      if (name !== 'day') return;
      st.treasury += income();
      // ongoing effects of standing works
      if (has('granary')) for (const s of G.sims) if (!s.dead && s.faction === 'village' && s.coins < 15) { s.needs.hunger = Math.min(100, s.needs.hunger + 25); }
      if (has('academy')) for (const s of G.sims) if (!s.dead && (s.age === 'child' || s.job === 'scholar')) s.skills.scholarship = Math.min(10, (s.skills.scholarship || 0) + 0.15);
      if (has('tower')) { const w = G.systems.find((x) => x.id === 'war')?.st; if (w?.realms) for (const k in w.realms) w.realms[k].tension = Math.max(0, w.realms[k].tension - 2); }
      if (has('pagoda')) for (const s of G.sims) if (!s.dead && s.has?.('Pious')) s.addMoodlet('pagoda', 'Prayed at the pagoda', 5, 1440);
      if (has('market')) for (const s of G.sims) if (!s.dead && s.stall) s.earn(4);
    },
    update(dt) {
      for (const p of st.projects.slice()) {
        if (G.env.day + G.env.hour / 24 >= p.done) finish(p);
        else if (Math.random() < dt * 0.05) { // a few labourers at the site
          const w = G.sims.find((s) => !s.dead && !s.hidden && !s.household && s.faction === 'village' && ['farmer', 'merchant'].includes(s.job) && !s.action && s.age !== 'child');
          if (w) w.startAction({ type: 'event', dest: [p.x + (Math.random() - 0.5) * 5, p.z + (Math.random() - 0.5) * 5], anim: 'farm', dur: 60, look: [p.x, p.z], adv: { energy: -0.2 }, label: 'Labouring on the royal works', then: (z) => z.earn(3) });
        }
      }
      for (const b of st.built) if (b.k === 'tower') { const g = meshes[b.id]; const fl = g?.children.find((o) => o.userData.flame); if (fl) fl.scale.y = 1 + Math.sin(performance.now() / 150) * 0.2; }
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      if (o.job === 'king' || (o === me && (me.job === 'king' || (me.factions?.court?.rank || 0) >= 6))) return [{ label: `🏛 The royal treasury (${st.treasury} nyang)`, fn: () => open(me) }];
      return [];
    },
    serialize() { return { treasury: st.treasury, built: st.built.map(({ navved, ...r }) => r), projects: st.projects }; },
    restore(d) { if (d) { st.treasury = d.treasury ?? 400; st.built = d.built || []; st.projects = d.projects || []; } },
  };
  return S;
}
