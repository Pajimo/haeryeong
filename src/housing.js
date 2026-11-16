// Land, houses and money: a small market economy for the valley.
//  • PLOTS (택지) along the outer roads are sold by the magistrate. Anyone with silver can buy one and
//    hire builders. Construction takes days, and the wages go to poor labourers, who are paid daily.
//  • UPGRADES (증축): a family can rebuild its hut as a cottage, or its cottage as a tiled house, in place.
//  • DEMAND AND SUPPLY: families who have outgrown their house, crowded young couples, the evicted and
//    newcomers all want homes. The more of them there are than empty houses, the higher prices and rents
//    climb (the price index), and investors build houses to rent out.
//  • RENT: landlords collect daily rent. Tenants who fall behind are evicted and sleep at the temple
//    until they find something.
//  • LAND (토지) and TENANCY (소작): rich houses own the rice parcels. Landless farmers work them and hand
//    over a share of every day's harvest. A farmer who saves enough buys a parcel and keeps it all.
//  • MONEYLENDING (고리대금): the desperate borrow against their house at harsh interest. Default means
//    foreclosure: the lender owns the house and the family pays him rent to stay.
//  • INEQUALITY: the village Gini coefficient is measured daily. Great inequality sours the people's
//    heart and drives the poor to banditry.
import * as THREE from 'three';
import { groundAt } from './terrain.js';

const ORDER = ['hut', 'cottage', 'house', 'mansion'];
const COST = { hut: 70, cottage: 220, house: 600, mansion: 1600 };
const DAYS = { hut: 1, cottage: 2, house: 3, mansion: 5 };
const KO = { hut: '움막', cottage: '초가', house: '기와집', mansion: '대감댁' };
const NAME = { hut: 'hut', cottage: 'thatched cottage', house: 'tiled house', mansion: 'walled mansion' };
const WAGE = 8;

export function createHousingSystem(G) {
  const st = { plots: {}, built: [], projects: [], rent: {}, land: {}, tenancy: {}, loans: [], forSale: {}, homeless: [], index: 1, gini: 0.4, hist: [], seq: 1000, landPrice: 90, seekers: 0 };
  const sys = (id) => G.systems.find((x) => x.id === id);
  const E = () => G.economy;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const ROYAL = ['king', 'queen', 'prince', 'princess'];
  const byId = (id) => G.sims.find((s) => s.id === id && !s.dead) || null;
  const houseById = (id) => G.world.houses.find((h) => h.id === id) || null;
  const tierIx = (t) => Math.max(0, ORDER.indexOf(t));
  const alive = (h) => (h.residents || []).filter((r) => !r.dead);
  const occupied = (h) => alive(h).length > 0;
  const villagers = () => G.sims.filter((s) => !s.dead && !s.hidden && s.faction === 'village' && !ROYAL.includes(s.job) && !s.royalGuard && !s.merc);
  const headOf = (h) => alive(h).find((r) => !r.serf && r.age !== 'child') || null;
  const isHead = (s) => s.home && !s.home.virtual && headOf(s.home) === s;
  const famOf = (s) => alive(s.home || { residents: [] }).filter((r) => !r.serf);
  const plotPrice = (p) => Math.round((40 + Math.max(0, 200 - Math.hypot(p.x, p.z)) * 0.5 + (p.roomy ? 40 : 0)) * st.index);
  const buildCost = (t) => Math.round(COST[t] * (0.6 + 0.4 * st.index));
  const rentOf = (h) => Math.max(1, Math.round(E().houseValue(h) * 0.012));
  const freePlots = () => G.world.plots.filter((p) => !st.plots[p.id]);
  const vacancies = () => G.world.houses.filter((h) => !h.virtual && !occupied(h) && h !== G.homeHouse && !st.projects.some((p) => p.houseId === h.id));

  // ---------------- geometry: plot stakes and scaffolding ----------------
  let stakes = null; const scaff = {};
  const woodM = new THREE.MeshStandardMaterial({ color: '#7a5236', roughness: 0.85 });
  const ropeM = new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.9 });
  const stoneM = new THREE.MeshStandardMaterial({ color: '#b8b0a2', roughness: 0.9 });
  function drawStakes() {
    if (stakes) { G.scene.remove(stakes); stakes.traverse((m) => m.geometry?.dispose?.()); }
    stakes = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5); const sign = new THREE.BoxGeometry(0.9, 0.5, 0.06);
    for (const p of freePlots()) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      for (const [lx, lz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) { const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c; const m = new THREE.Mesh(post, woodM); m.position.set(x, groundAt(x, z) + 0.5, z); stakes.add(m); }
      const fx = p.x + 6 * s, fz = p.z + 6 * c; const m = new THREE.Mesh(sign, woodM); m.position.set(fx, groundAt(fx, fz) + 1.2, fz); m.rotation.y = p.rot; stakes.add(m); const pm = new THREE.Mesh(post, woodM); pm.position.set(fx, groundAt(fx, fz) + 0.5, fz); stakes.add(pm);
    }
    G.scene.add(stakes);
  }
  function drawScaffold(pr) {
    const g = new THREE.Group(); const { x, z, rot } = pr.place; const w = { hut: 6, cottage: 9.5, house: 11.5, mansion: 14 }[pr.tier], d = { hut: 4.5, cottage: 6, house: 7, mansion: 7.5 }[pr.tier];
    const add = (geo, m, lx, y, lz, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(lx, y, lz); o.rotation.y = ry; o.castShadow = true; g.add(o); };
    add(new THREE.BoxGeometry(w + 1.2, 0.6, d + 1.2), stoneM, 0, 0.3, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 5), woodM, sx * w / 2, 2.1, sz * d / 2);
    for (const y of [1.4, 2.8]) { add(new THREE.BoxGeometry(w, 0.1, 0.1), woodM, 0, y, d / 2); add(new THREE.BoxGeometry(w, 0.1, 0.1), woodM, 0, y, -d / 2); add(new THREE.BoxGeometry(0.1, 0.1, d), woodM, w / 2, y, 0); add(new THREE.BoxGeometry(0.1, 0.1, d), woodM, -w / 2, y, 0); }
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.12, 0.12, 3, 6).rotateZ(Math.PI / 2), woodM, w / 2 + 2, 0.15 + (i % 3) * 0.24, -1 + Math.floor(i / 3) * 0.26);
    add(new THREE.BoxGeometry(1.2, 0.8, 1.2), ropeM, -w / 2 - 1.8, 0.4, 1);
    g.position.set(x, groundAt(x, z), z); g.rotation.y = rot; G.scene.add(g); scaff[pr.pid] = g;
  }
  function clearScaffold(pr) { const g = scaff[pr.pid]; if (g) { G.scene.remove(g); g.traverse((m) => m.geometry?.dispose?.()); delete scaff[pr.pid]; } }

  // ---------------- raising and placing houses ----------------
  function addToNav(res) { for (const b of res.obbs) G.nav.addObb(b); for (const c of res.circles) G.nav.addCircle(c.x, c.z, c.r); }
  function raise(rec) {
    // rec: { id, place, tier, dims?, upgrade? }
    if (rec.upgrade) {
      const old = houseById(rec.id); if (!old) return null;
      G.world.demolish(old);
      const res = G.world.buildHouse(rec.place, rec.tier, rec.id, rec.dims); addToNav(res);
      const keep = { residents: old.residents, owner: old.owner, level: 0 };
      Object.assign(old, res.house, keep); rec.dims = res.house.dims;
      return old;
    }
    const res = G.world.buildHouse(rec.place, rec.tier, rec.id, rec.dims); addToNav(res); rec.dims = res.house.dims;
    G.world.houses.push(res.house); res.house.owner = rec.owner ?? null; res.house.level = 0;
    return res.house;
  }
  function moveIn(fam, h) {
    for (const m of fam) { if (m.home?.residents) m.home.residents = m.home.residents.filter((x) => x !== m); m.home = h; h.residents.push(m); if (m.serf) m.serf.house = h.id; if (!m.action && !m.missionLock && !m.controlled) m.startAction({ type: 'goto', dest: h.door || [h.x, h.z], label: 'Moving house' }); }
    st.homeless = st.homeless.filter((id) => !fam.some((m) => m.id === id));
    if (fam.some((m) => m.household)) { G.homeHouse = h; G.ui?.refreshHousehold?.(); }
  }
  function canUpgrade(h) {
    if (!h || h.virtual || tierIx(h.tier) >= 2) return false; // mansions need a roomy new plot
    const pl = h.place || { x: h.x, z: h.z }; return G.world.houses.every((o) => o === h || Math.hypot(o.x - pl.x, o.z - pl.z) > 15);
  }

  // ---------------- projects ----------------
  function startProject(owner, tier, where, purpose) {
    const up = where.house; const plot = where.plot;
    const price = up ? Math.round(buildCost(tier) - buildCost(up.tier) * 0.3) : buildCost(tier) + plotPrice(plot);
    if (owner.coins < price) return false;
    owner.coins -= price;
    const pid = 'p' + (st.seq++);
    const place = up ? (up.place || { x: up.x, z: up.z, rot: up.rot }) : { x: plot.x, z: plot.z, rot: plot.rot };
    const pr = { pid, tier, owner: owner.id, purpose, place, start: G.env.day, done: G.env.day + DAYS[tier] + G.env.hour / 24, wagePool: Math.round(COST[tier] * 0.4), workers: [], houseId: up ? up.id : null, plot: plot ? plot.id : null };
    if (plot) { st.plots[plot.id] = { owner: owner.id }; drawStakes(); (G.reserved ||= []).push([plot.x, plot.z, 10]); }
    st.projects.push(pr); if (!up) drawScaffold(pr);
    log(`🏗 ${owner.name.full} ${up ? `begins rebuilding the family ${NAME[up.tier]} as a ${NAME[tier]}` : `buys a plot by the ${Math.hypot(place.x, place.z) > 140 ? 'outer road' : 'village road'} and hires builders for a ${NAME[tier]} (${KO[tier]})`}${purpose === 'rent' ? ' — to let to tenants' : ''}. ${price} nyang. Labourers will be paid ${WAGE} a day.`, 'story', { x: place.x, z: place.z });
    return true;
  }
  function finish(pr) {
    st.projects = st.projects.filter((p) => p !== pr); clearScaffold(pr);
    const owner = byId(pr.owner);
    let h;
    if (pr.houseId != null) {
      // Upgrading used to DELETE the house's creation record and replace it with an `upgrade` record.
      // For a world-generated house that is fine (preRestore's raise() finds the terrain-built house).
      // For a house housing itself built — the hut a young couple put up, anything built on a plot —
      // the creation record was the only thing that would ever recreate it, so after a save/load the
      // building silently vanished and its residents came back with no home at all. Keep the creation
      // record and just bump its tier, so a replay rebuilds it already upgraded.
      h = raise({ id: pr.houseId, place: pr.place, tier: pr.tier, upgrade: true });
      const prev = st.built.find((b) => b.id === pr.houseId && !b.upgrade);
      if (prev) { prev.tier = pr.tier; prev.place = pr.place; prev.dims = h?.dims; }
      else { st.built = st.built.filter((b) => b.id !== pr.houseId); st.built.push({ id: pr.houseId, place: pr.place, tier: pr.tier, upgrade: true, dims: h?.dims }); }
    }
    else { const rec = { id: st.seq++, place: pr.place, tier: pr.tier, owner: pr.owner, plot: pr.plot }; h = raise(rec); st.built.push(rec); if (st.plots[pr.plot]) st.plots[pr.plot].houseId = rec.id; }
    if (!h) return;
    for (const m of alive(h)) m.addMoodlet('newhome', 'A fine new home', 15, 4320);
    log(`🏠 The ${NAME[pr.tier]} of ${owner ? owner.name.full : 'its owner'} is finished. ${pr.purpose === 'rent' ? 'It is offered to tenants.' : pr.houseId != null ? 'The family sleeps under a new roof tonight.' : 'The family moves in.'}`, 'festival', { x: h.x, z: h.z });
    if (pr.purpose === 'live' && owner && pr.houseId == null) {
      const old = owner.home; moveIn(owner.household ? G.household.filter((s) => !s.dead && !['king', 'queen'].includes(s.job)) : famOf(owner).concat(alive(owner.home || { residents: [] }).filter((r) => r.serf)), h);
      // the old home is let or sold
      if (old && !old.virtual && old.owner === owner.id && !owner.household) { if (owner.coins > 300) { st.rent[old.id] = { owner: owner.id, tenant: null }; } else st.forSale[old.id] = true; }
    }
    if (pr.purpose === 'rent') st.rent[h.id] = { owner: pr.owner, tenant: null };
    if (owner?.household) G.ui?.toast(`🏠 Your ${NAME[pr.tier]} is finished!`, 'festival');
  }
  function staffSites(dt) {
    const h = G.env.hour; if (h < 7 || h > 18) return;
    for (const pr of st.projects) {
      pr.workers = pr.workers.filter((id) => { const w = byId(id); return w && w.action?.label?.startsWith('Building'); });
      if (pr.workers.length >= 3 || pr.wagePool < WAGE) continue;
      const cand = villagers().find((s) => !s.household && !s.missionLock && !s.serf && s.age !== 'child' && s.age !== 'elder' && s.coins < 160 && ['farmer', 'farmhand', 'fisher', 'hunter'].includes(s.job) && !s.combat.target && !st.projects.some((p) => p.workers.includes(s.id)) && Math.hypot(s.pos.x - pr.place.x, s.pos.z - pr.place.z) < 160);
      if (!cand) continue;
      pr.workers.push(cand.id); (pr.paid ||= {})[cand.id] = pr.paid?.[cand.id] || 0;
      const { x, z } = pr.place; cand.cancelAction();
      cand.startAction({ type: 'event', dest: [x + (Math.random() - 0.5) * 9, z + (Math.random() - 0.5) * 7], anim: () => (Math.random() < 0.5 ? 'farm' : 'carry'), dur: 120, look: [x, z], label: `Building a ${NAME[pr.tier]} (${WAGE} nyang a day)` });
    }
  }

  // ---------------- land and tenancy ----------------
  function initLand() {
    if (Object.keys(st.land).length) return;
    const owners = G.world.houses.filter((h) => !h.virtual && (h.tier === 'mansion' || h.tier === 'house')).map(headOf).filter((s) => s && !s.household);
    let parcels = 30;
    for (const o of owners) { const n = o.home.tier === 'mansion' ? 4 : 2; if (parcels < n) break; st.land[o.id] = n; parcels -= n; }
    const small = villagers().filter((s) => s.job === 'farmer' && isHead(s) && s.home.tier === 'cottage' && !s.household).slice(0, Math.min(parcels, 6));
    for (const s of small) { st.land[s.id] = 1; parcels--; }
    assignTenants();
  }
  function landowners() { return Object.entries(st.land).filter(([, n]) => n > 0).map(([id]) => byId(+id)).filter(Boolean); }
  function assignTenants() {
    const lords = landowners().filter((s) => st.land[s.id] >= 2); if (!lords.length) return;
    for (const f of villagers().filter((s) => s.job === 'farmer' && !st.land[s.id] && !s.household)) if (!byId(st.tenancy[f.id])) st.tenancy[f.id] = pick(lords).id;
  }
  function shareOf(lord) { return lord.has?.('Greedy') ? 0.5 : lord.has?.('Gentle') ? 0.3 : 0.4; }
  function sharecrop() {
    for (const [fid, lid] of Object.entries(st.tenancy)) {
      const f = byId(+fid), l = byId(lid); if (!f || !l) { delete st.tenancy[fid]; continue; }
      const wt = f.workedToday || 0; const last = f._wtSeen ?? 0; const delta = wt >= last ? wt - last : wt; f._wtSeen = wt;
      if (delta <= 0 || f.job !== 'farmer') continue;
      const cut = 6 * delta / 60 * shareOf(l); const take = Math.min(f.coins, cut); f.coins -= take; l.coins += take; (l._shareToday = (l._shareToday || 0) + take);
    }
  }

  // ---------------- the daily market ----------------
  function gini() {
    const w = villagers().filter((s) => s.age !== 'child').map((s) => Math.max(0, E().netWorth(s))).sort((a, b) => a - b); const n = w.length; if (n < 2) return 0;
    let cum = 0, sum = 0; for (let i = 0; i < n; i++) { cum += (i + 1) * w[i]; sum += w[i]; } return sum ? (2 * cum) / (n * sum) - (n + 1) / n : 0;
  }
  function desiredTier(s) { const w = E().netWorth(s) + s.coins; return w > 3500 ? 'mansion' : w > 1100 ? 'house' : w > 260 ? 'cottage' : 'hut'; }
  function daily() {
    initLand();
    const V = vacancies();
    // 1. rents
    for (const [hid, r] of Object.entries(st.rent)) {
      const h = houseById(+hid); if (!h) { delete st.rent[hid]; continue; }
      const head = headOf(h); if (!head) { r.tenant = null; continue; }
      if (r.owner === head.id || (head.household && G.household.some((x) => x.id === r.owner))) { r.tenant = null; continue; }
      r.tenant = head.id; const rent = rentOf(h); const payer = head.household ? G.household.filter((x) => !x.dead).sort((a, b) => b.coins - a.coins)[0] : head;
      const owner = r.owner === 'crown' ? null : byId(r.owner);
      if (payer.coins >= rent) { payer.coins -= rent; if (owner) owner.earn(rent); else { const RW = sys('royalWorks'); if (RW) RW.st.treasury += rent; } r.arrears = 0; }
      else { r.arrears = (r.arrears || 0) + 1; if (head.household) G.ui?.toast(`🏚 Your family is ${r.arrears} day${r.arrears > 1 ? 's' : ''} behind on the rent (${rent} a day)${r.arrears >= 2 ? '. One more and you are out!' : '.'}`, 'danger');
        if (r.arrears >= 3 && !(owner?.has?.('Gentle') && chance(0.5))) evict(h, owner); }
    }
    // 2. loans fall due
    for (const ln of [...st.loans]) {
      if (ln.due > G.env.day) continue; const b = byId(ln.borrower), l = ln.lender === 'player' ? G.household[0] : byId(ln.lender); st.loans = st.loans.filter((x) => x !== ln);
      if (!b) continue; const owe = Math.round(ln.principal * 1.3);
      if (b.coins >= owe) { b.coins -= owe; l?.earn(owe); log(`${b.name.full} repays ${owe} nyang to ${l ? l.name.full : 'the moneylender'}.`, 'story'); continue; }
      const h = houseById(ln.collateral);
      if (h && h.owner === b.id && l) { h.owner = l.id; st.rent[h.id] = { owner: l.id, tenant: b.id }; l.earn(b.coins); b.coins = 0; b.needs.honor = Math.max(0, b.needs.honor - 12); for (const m of famOf(b)) m.addMoodlet('foreclosed', 'The moneylender owns our house', -18, 4320); log(`⚖ ${b.name.full} cannot repay ${owe} nyang. ${l.name.full} forecloses: the ${NAME[h.tier] || 'house'} is now his, and the ${b.name.surname} family must pay him rent to stay.`, 'danger', { x: h.x, z: h.z }); }
      else if (l) { l.earn(b.coins); b.coins = 0; b.changeRel(l, -30); log(`${b.name.full} defaults on a debt to ${l.name.full}. Bad blood follows.`, 'danger'); }
    }
    // 3. who wants a home?
    let seekers = 0;
    const heads = villagers().filter((s) => isHead(s) && !s.household);
    // a. crowded young couples move out
    for (const s of villagers().filter((x) => !x.household && x.spouse && !x.spouse.dead && x.home && !x.home.virtual && !isHead(x) && famOf(x).length > 4)) {
      if (s.sex !== 'm' && s.spouse.home === s.home) continue; // move once per couple
      seekers++;
      const fam = [s, s.spouse, ...(s.children || []).filter((c) => !c.dead && c.home === s.home && c.age === 'child')].filter((m) => m.home === s.home);
      const v = V.filter((h) => rentOf(h) * 4 <= s.coins + s.spouse.coins + 40 && st.rent[h.id]).sort((a, b) => rentOf(a) - rentOf(b))[0] || V.find((h) => !st.rent[h.id] && h.owner == null);
      if (v) { if (!st.rent[v.id]) st.rent[v.id] = { owner: 'crown', tenant: null }; moveIn(fam, v); V.splice(V.indexOf(v), 1); log(`${s.name.full} and ${s.spouse.name.given} leave the crowded family home and take a ${NAME[v.tier] || 'house'} of their own${st.rent[v.id].owner === 'crown' ? ' (rented from the magistrate)' : ''}.`, 'story', s.pos); }
      else if (s.coins + s.spouse.coins >= buildCost('hut') + 60 && freePlots().length) { const pot = s.coins >= s.spouse.coins ? s : s.spouse; pot.coins += (pot === s ? s.spouse : s).coins; (pot === s ? s.spouse : s).coins = 0; const pl = freePlots().sort((a, b) => plotPrice(a) - plotPrice(b))[0]; startProject(pot, 'hut', { plot: pl }, 'live'); }
      else s.addMoodlet('crowded', 'Too many under one roof', -6, 1440);
    }
    // b. the homeless
    for (const id of [...st.homeless]) {
      const s = byId(id); if (!s) { st.homeless = st.homeless.filter((x) => x !== id); continue; } seekers++;
      const v = V.filter((h) => rentOf(h) * 3 <= s.coins + 20).sort((a, b) => rentOf(a) - rentOf(b))[0];
      if (v) { if (!st.rent[v.id] && v.owner == null) st.rent[v.id] = { owner: 'crown', tenant: null }; const fam = G.sims.filter((m) => !m.dead && m.home === s.home && (m === s || m.parents?.includes(s) || m.spouse === s)); moveIn(fam.length ? fam : [s], v); V.splice(V.indexOf(v), 1); log(`After nights at the temple, ${s.name.full} finds a roof again.`, 'story', s.pos); }
    }
    // c. families who have outgrown their house
    for (const s of heads) {
      const want = desiredTier(s); const cur = s.home.tier || 'cottage'; if (tierIx(want) <= tierIx(cur) || st.projects.some((p) => p.owner === s.id)) continue;
      seekers++; if (!chance(0.5)) continue;
      // buy an empty house of the right tier
      const forSale = V.filter((h) => tierIx(h.tier) > tierIx(cur) && tierIx(h.tier) <= tierIx(want) && (st.forSale[h.id] || h.owner == null) && E().houseValue(h) + 40 <= s.coins).sort((a, b) => tierIx(b.tier) - tierIx(a.tier))[0];
      if (forSale) { const price = E().houseValue(forSale); const seller = byId(forSale.owner); s.coins -= price; if (seller) seller.earn(price); else { const RW = sys('royalWorks'); if (RW) RW.st.treasury += Math.round(price * 0.5); } const old = s.home; forSale.owner = s.id; delete st.forSale[forSale.id]; delete st.rent[forSale.id]; moveIn(famOf(s).concat(alive(old).filter((r) => r.serf)), forSale); V.splice(V.indexOf(forSale), 1); if (old.owner === s.id) { if (s.coins > 300) st.rent[old.id] = { owner: s.id, tenant: null }; else st.forSale[old.id] = true; } log(`🏠 The ${s.name.surname} family buys a ${NAME[forSale.tier]} for ${price} nyang and moves up in the world${old.owner === s.id ? `; their old ${NAME[cur]} is ${st.rent[old.id] ? 'let to tenants' : 'up for sale'}` : ''}.`, 'story', s.pos); continue; }
      // rebuild in place
      const next = ORDER[tierIx(cur) + 1];
      if (s.home.owner === s.id && canUpgrade(s.home) && s.coins >= buildCost(next) - buildCost(cur) * 0.3 + 40) { startProject(s, next, { house: s.home }, 'live'); continue; }
      // build new on a plot
      const pl = freePlots().filter((p) => want !== 'mansion' || p.roomy).sort((a, b) => plotPrice(b) - plotPrice(a)).find((p) => plotPrice(p) + buildCost(want === 'mansion' && !p.roomy ? 'house' : want) + 60 <= s.coins);
      if (pl) startProject(s, want === 'mansion' && !pl.roomy ? 'house' : want, { plot: pl }, 'live');
    }
    // d. investors build to let when demand outruns supply
    st.seekers = seekers;
    if (seekers > V.length + 1) {
      const inv = heads.filter((s) => s.coins > 900 && (s.has?.('Greedy') || s.has?.('Ambitious') || s.job === 'merchant' || s.job === 'noble' || chance(0.3)) && !st.projects.some((p) => p.owner === s.id)).sort((a, b) => b.coins - a.coins)[0];
      const pl = inv && freePlots().sort((a, b) => plotPrice(a) - plotPrice(b))[0];
      if (inv && pl && chance(0.6)) startProject(inv, inv.coins > 1500 ? 'house' : 'cottage', { plot: pl }, 'rent');
    }
    // 4. prices follow demand and supply
    const pressure = (seekers - V.length) / Math.max(4, seekers + V.length);
    st.index = Math.max(0.7, Math.min(2.2, st.index * (1 + pressure * 0.06)));
    st.landPrice = Math.round(90 * st.index);
    // 5. land changes hands
    for (const f of villagers().filter((s) => st.tenancy[s.id] && s.coins >= st.landPrice + 40 && !s.household)) {
      const seller = landowners().filter((o) => st.land[o.id] >= 2 && (o.coins < 60 || chance(0.25))).sort((a, b) => a.coins - b.coins)[0]; if (!seller) break;
      st.land[seller.id]--; st.land[f.id] = (st.land[f.id] || 0) + 1; f.coins -= st.landPrice; seller.earn(st.landPrice); delete st.tenancy[f.id];
      f.addMoodlet('ownland', 'Our own rice field at last', 25, 4320); log(`🌾 ${f.name.full}, a tenant farmer, buys a rice parcel from ${seller.name.full} for ${st.landPrice} nyang. No more half the harvest to the landlord.`, 'story', f.pos);
      break; // one sale a day keeps the land market slow, as it was
    }
    for (const o of landowners().filter((s) => s.coins < 6 && !s.household)) {
      const buyer = villagers().filter((s) => s !== o && s.coins > st.landPrice + 100 && !s.household).sort((a, b) => b.coins - a.coins)[0]; if (!buyer) break;
      st.land[o.id]--; st.land[buyer.id] = (st.land[buyer.id] || 0) + 1; o.earn(Math.round(st.landPrice * 0.7)); buyer.coins -= Math.round(st.landPrice * 0.7);
      log(`${o.name.full}, short of silver, sells a rice parcel cheap to ${buyer.name.full}.`, 'story', o.pos);
    }
    assignTenants();
    // 6. moneylenders circle the desperate
    for (const s of villagers().filter((x) => isHead(x) && !x.household && x.coins < 8 && x.home.owner === x.id && !st.loans.some((l) => l.borrower === x.id))) {
      const lender = villagers().filter((o) => o !== s && o.coins > 500 && !o.household && (o.has?.('Greedy') || o.has?.('Cunning') || o.job === 'merchant')).sort((a, b) => b.coins - a.coins)[0];
      if (!lender || !chance(0.5)) continue; lender.coins -= 100; s.earn(100); st.loans.push({ lender: lender.id, borrower: s.id, principal: 100, due: G.env.day + 5, collateral: s.home.id });
      log(`${s.name.full} borrows 100 nyang from ${lender.name.full}, putting up the family house as surety. 130 is due in five days.`, 'story', s.pos);
    }
    // 7. inequality and its consequences (Joseon villages were very unequal: about 0.7 is the norm here)
    st.gini = gini(); const RP = sys('royalPower');
    if (st.gini > 0.8) { RP?.heart?.(-1, st.gini > 0.85 ? 'resented the great gap between rich and poor' : null); const poor = villagers().find((s) => s.coins < 5 && s.has?.('Hot-headed') && !s.household && !s.outlaw && s.age !== 'child'); if (poor && chance(0.2)) { poor.outlaw = true; poor.bounty = 15; log(`"The rich eat white rice while we boil bark." ${poor.name.full} runs off to the bandits in the hills.`, 'danger', poor.pos); } }
    else if (st.gini < 0.6) RP?.heart?.(+1);
    st.hist.push([G.env.day, +st.index.toFixed(2), +st.gini.toFixed(2)]); if (st.hist.length > 30) st.hist.shift();
  }
  function evict(h, owner) {
    const fam = alive(h).filter((r) => !r.serf); const head = headOf(h);
    const temple = G.vhouses?.temple;
    if (fam.some((m) => m.household)) {
      // the player's family: find the cheapest empty house, or the temple
      const v = vacancies().sort((a, b) => rentOf(a) - rentOf(b))[0];
      if (v && v.tier === 'hut') { st.rent[v.id] = { owner: 'crown', tenant: null }; moveIn(G.household.filter((s) => !s.dead), v); G.ui?.toast(`🏚 Evicted! Your family carries its bundles to a ${NAME[v.tier]}.`, 'danger'); }
      else if (temple) { moveIn(G.household.filter((s) => !s.dead), temple); G.ui?.toast('🏚 Evicted! The monks of the mountain temple take your family in for now.', 'danger'); }
    } else {
      // kin take them in, or the temple
      const kin = G.world.houses.find((o) => o !== h && !o.virtual && headOf(o) && headOf(o).name.surname === head?.name.surname && alive(o).length < 6);
      if (kin) moveIn(fam, kin); else if (temple) { moveIn(fam, temple); for (const m of fam) if (!st.homeless.includes(m.id) && m === head) st.homeless.push(m.id); }
    }
    delete st.rent[h.id]; st.rent[h.id] = { owner: owner?.id ?? 'crown', tenant: null };
    for (const m of fam) m.addMoodlet('evicted', 'Thrown out of our home', -25, 4320);
    log(`🏚 ${head ? `The ${head.name.surname} family is` : 'A family is'} evicted for unpaid rent${owner ? ` by ${owner.name.full}` : ''}. ${fam.some((m) => m.household) ? '' : 'They take shelter where they can.'}`, 'danger', { x: h.x, z: h.z });
  }

  // ---------------- the player's office ----------------
  function office(me) {
    const owned = G.world.houses.filter((h) => G.household.some((s) => s.id === h.owner));
    const myLand = G.household.reduce((a, s) => a + (st.land[s.id] || 0), 0);
    const myTenants = Object.entries(st.tenancy).filter(([, l]) => G.household.some((s) => s.id === l)).length;
    const plots = freePlots().sort((a, b) => plotPrice(a) - plotPrice(b));
    const home = me.home; const next = home && !home.virtual ? ORDER[tierIx(home.tier) + 1] : null;
    const rows = owned.map((h) => { const r = st.rent[h.id]; const ten = r?.tenant ? byId(r.tenant) : null; return `<tr><td>${NAME[h.tier] || 'house'}${h === G.homeHouse ? ' (home)' : ''}</td><td>${E().houseValue(h)}</td><td>${h === G.homeHouse ? '—' : ten ? `${esc(ten.name.full)} · ${rentOf(h)}/day${r.arrears ? ` · ${r.arrears} days behind` : ''}` : r ? 'to let — empty' : st.forSale[h.id] ? 'for sale' : 'empty'}</td></tr>`; }).join('');
    const loans = st.loans.filter((l) => l.lender === 'player').map((l) => { const b = byId(l.borrower); return `${esc(b?.name.full || '?')} owes 130 by day ${l.due}`; }).join(' · ');
    const el = G.ui.modal(`<h2>The Land & Housing Office · 호적·토지</h2>
      <p>House price index <b>${st.index.toFixed(2)}</b> · land ${st.landPrice} a parcel · ${vacancies().length} empty houses · ${st.seekers} families seeking homes · ${st.projects.length} houses under construction · inequality (Gini) <b>${st.gini.toFixed(2)}</b> ${st.gini > 0.8 ? '— dangerous: the poor are restless' : st.gini < 0.6 ? '— fair for these times' : '— the usual gulf between yangban and commoner'}</p>
      <h3>Your property</h3>
      <table class="ledger"><tr><th>House</th><th>Value</th><th>Tenant</th></tr>${rows || '<tr><td colspan=3>No houses</td></tr>'}</table>
      <p>Rice land: ${myLand} parcel${myLand === 1 ? '' : 's'}${myTenants ? ` · ${myTenants} tenant farmers pay you a share of each harvest` : ''}${loans ? `<br>Loans: ${loans}` : ''}</p>
      <h3>Build</h3><div class="po-ch">
        ${next && canUpgrade(home) && home.owner != null && G.household.some((s) => s.id === home.owner) ? `<button data-a="up">🔨 Rebuild your ${NAME[home.tier]} as a ${NAME[next]} (${Math.round(buildCost(next) - buildCost(home.tier) * 0.3)})</button>` : ''}
        ${plots.length ? ORDER.map((t) => { const p = t === 'mansion' ? plots.find((x) => x.roomy) : plots[0]; return p ? `<button data-a="build" data-t="${t}" data-p="${p.id}">🏗 Build a ${NAME[t]} to live in (${buildCost(t) + plotPrice(p)})</button><button data-a="rent" data-t="${t}" data-p="${p.id}">🏘 Build a ${NAME[t]} to let (${buildCost(t) + plotPrice(p)})</button>` : ''; }).join('') : '<p>No plots left for sale.</p>'}
      </div><h3>Buy, let and lend</h3><div class="po-ch">
        ${vacancies().filter((h) => (st.forSale[h.id] || h.owner == null) && !G.household.some((s) => s.id === h.owner)).slice(0, 5).map((h) => `<button data-a="buy" data-h="${h.id}">🏠 Buy an empty ${NAME[h.tier]} (${E().houseValue(h)})</button>`).join('')}
        ${owned.filter((h) => h !== G.homeHouse && !st.rent[h.id]).map((h) => `<button data-a="let" data-h="${h.id}">📜 Offer your ${NAME[h.tier]} to tenants</button>`).join('')}
        <button data-a="land">🌾 Buy a rice parcel (${st.landPrice}) — tenants will farm it for you</button>
      </div>`);
    const total = () => G.household.reduce((a, s) => a + (s.dead ? 0 : s.coins), 0);
    const payFrom = (n) => { let left = n; for (const s of G.household.filter((x) => !x.dead).sort((a, b) => b.coins - a.coins)) { const t = Math.min(s.coins, left); s.coins -= t; left -= t; } };
    // pool the family purse into the head's hands, then spend
    const withPurse = (n, fn) => { if (total() < n) return G.ui.toast(`You need ${n} nyang.`); payFrom(n); me.coins += n; fn(); };
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      el.classList.add('hidden'); const a = b.dataset.a;
      if (a === 'up') { const c = Math.round(buildCost(next) - buildCost(home.tier) * 0.3); withPurse(c, () => startProject(me, next, { house: home }, 'live')); }
      if (a === 'build' || a === 'rent') { const p = G.world.plots.find((x) => x.id === +b.dataset.p); const t = b.dataset.t; withPurse(buildCost(t) + plotPrice(p), () => startProject(me, t, { plot: p }, a === 'build' ? 'live' : 'rent')); }
      if (a === 'buy') { const h = houseById(+b.dataset.h); const price = E().houseValue(h); withPurse(price, () => { me.coins -= price; const seller = byId(h.owner); if (seller) seller.earn(price); h.owner = me.id; delete st.forSale[h.id]; delete st.rent[h.id]; G.ui.toast(`You own the ${NAME[h.tier]}. Move in from its door, or let it to tenants here.`); }); }
      if (a === 'let') { const h = houseById(+b.dataset.h); st.rent[h.id] = { owner: me.id, tenant: null }; G.ui.toast(`Your ${NAME[h.tier]} is offered at ${rentOf(h)} nyang a day.`); }
      if (a === 'land') withPurse(st.landPrice, () => { me.coins -= st.landPrice; st.land[me.id] = (st.land[me.id] || 0) + 1; const f = villagers().find((s) => s.job === 'farmer' && !st.land[s.id] && !st.tenancy[s.id] && !s.household) || villagers().find((s) => s.job === 'farmer' && st.tenancy[s.id] && !s.household); if (f) st.tenancy[f.id] = me.id; G.ui.toast(`You own ${st.land[me.id]} parcel${st.land[me.id] > 1 ? 's' : ''} of rice land${f ? `. ${f.name.given} will farm it as your tenant` : ''}.`); });
    }));
  }

  // ---------------- your property, marked in the world and on the map ----------------
  const seals = {}; const sealTex = {};
  function sealTexture(kind) {
    if (sealTex[kind]) return sealTex[kind];
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const col = kind === 'home' ? '#d9b44a' : kind === 'let' ? '#6ac0a0' : kind === 'live' ? '#c9d2dc' : '#e08a3a';
    g.fillStyle = 'rgba(20,14,10,0.78)'; g.beginPath(); g.arc(64, 58, 46, 0, 7); g.fill();
    g.lineWidth = 7; g.strokeStyle = col; g.beginPath(); g.arc(64, 58, 44, 0, 7); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(52, 100); g.lineTo(76, 100); g.lineTo(64, 124); g.fill();
    g.font = 'bold 52px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(kind === 'home' ? '家' : kind === 'let' ? '貰' : kind === 'live' ? '居' : '工', 64, 60);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (sealTex[kind] = t);
  }
  const mine = () => new Set(G.household.filter((s) => !s.dead).map((s) => s.id));
  function myProperty() {
    const ids = mine(); const out = [];
    for (const h of G.world.houses) if (!h.virtual && ids.has(h.owner)) out.push({ key: 'h' + h.id, x: h.x, z: h.z, y: (h.y0 ?? groundAt(h.x, h.z)) + (h.tier === 'mansion' ? 11 : h.tier === 'house' ? 9.5 : 7.5), kind: h === G.homeHouse ? 'home' : 'let', h });
    // The household starts as tenants: nobody sets an owner on the house they are given, so for the
    // whole game there was no marker over the player's own door — the one house they most need to find.
    // Mark the roof they live under too, with a quieter seal (居) when the deed is not theirs.
    const myHome = G.household.find((s) => !s.dead)?.home || G.homeHouse;
    if (myHome && !myHome.virtual && !ids.has(myHome.owner)) {
      out.push({ key: 'h' + myHome.id, x: myHome.x, z: myHome.z, y: (myHome.y0 ?? groundAt(myHome.x, myHome.z)) + (myHome.tier === 'mansion' ? 8.5 : 6.2), kind: 'live' });
    }
    for (const pr of st.projects) if (ids.has(pr.owner)) out.push({ key: 'p' + pr.pid, x: pr.place.x, z: pr.place.z, y: groundAt(pr.place.x, pr.place.z) + 7, kind: 'build' });
    return out;
  }
  function syncSeals() {
    const want = myProperty(); const keep = new Set();
    for (const p of want) {
      keep.add(p.key); let sp = seals[p.key];
      if (!sp || sp.userData.kind !== p.kind) { if (sp) G.scene.remove(sp); sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sealTexture(p.kind), depthWrite: false, transparent: true })); sp.userData.kind = p.kind; sp.renderOrder = 5; G.scene.add(sp); seals[p.key] = sp; }
      sp.position.set(p.x, p.y, p.z);
    }
    for (const k of Object.keys(seals)) if (!keep.has(k)) { G.scene.remove(seals[k]); delete seals[k]; }
  }
  function bobSeals() {
    const cp = G.player?.camera?.position; const t = performance.now() / 600;
    for (const sp of Object.values(seals)) { const d = cp ? cp.distanceTo(sp.position) : 50; const s = Math.max(1.6, Math.min(9, d * 0.045)); sp.scale.set(s, s, 1); sp.material.opacity = d < 14 ? 0.35 : 1; sp.position.y += Math.sin(t + sp.position.x) * 0.004; }
  }
  function hookMinimap() {
    const ui = G.ui; if (!ui?.drawMinimap || ui._propHook) return; ui._propHook = true;
    const orig = ui.drawMinimap.bind(ui);
    ui.drawMinimap = () => {
      orig(); const g = ui.mm?.getContext('2d'); if (!g) return;
      for (const p of myProperty()) {
        const x = 100 + p.x / 5, y = 100 + p.z / 5; const col = p.kind === 'home' ? '#ffd76a' : p.kind === 'let' ? '#7fe0b8' : p.kind === 'live' ? '#dfe6ee' : '#ff9a4a';
        g.fillStyle = 'rgba(20,14,10,0.85)'; g.fillRect(x - 4.5, y - 4.5, 9, 9); g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x - 4.5, y - 4.5, 9, 9);
        g.fillStyle = col; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x, y - 3); g.lineTo(x + 3, y); g.closePath(); g.fill(); g.fillRect(x - 2, y, 4, 2.5);
      }
    };
  }

  const S = {
    id: 'housing', st, rentOf, plotPrice, buildCost, startProject, office,
    init() {
      // house prices follow the market
      const Ec = G.economy; if (Ec) { const hv = Ec.houseValue.bind(Ec); Ec.houseValue = (h) => Math.round(hv(h) * st.index); }
    },
    preRestore(d) {
      if (!d) return; Object.assign(st, d);
      for (const rec of st.built) { try { raise(rec); } catch (e) { console.error('[housing] rebuild', e); } }
    },
    restore() { drawStakes(); for (const pr of st.projects) if (pr.houseId == null) drawScaffold(pr); },
    update(dt) {
      if (!G.started) return;
      if (!stakes) drawStakes();
      bobSeals();
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 2;
      staffSites(2); sharecrop(); syncSeals(); hookMinimap();
      for (const pr of [...st.projects]) if (G.env.day + G.env.hour / 24 >= pr.done) finish(pr);
    },
    onEvent(name, p) {
      if (name === 'day') {
        // pay the builders
        for (const pr of st.projects) for (const id of pr.workers) { const w = byId(id); if (w && pr.wagePool >= WAGE) { pr.wagePool -= WAGE; w.earn(WAGE); } }
        try { daily(); } catch (e) { console.error('[housing]', e); }
      }
      // src/inheritance.js settles the whole estate together (land, roof, coins, stall) so that the
      // land follows the same heir as everything else; this fallback only runs if that system is absent.
      if (name === 'death' && p?.sim && !G.systems.some((x) => x.id === 'inheritance')) { const id = p.sim.id; if (st.land[id]) { const heir = (p.sim.children || []).find((c) => !c.dead) || alive(p.sim.home || { residents: [] }).find((r) => !r.serf && r !== p.sim); if (heir) st.land[heir.id] = (st.land[heir.id] || 0) + st.land[id]; delete st.land[id]; } }
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      if (o === me) return [{ label: '🏘 Land & Housing office (build, buy, let, land)', fn: () => office(me) }];
      const out = [];
      const myRent = Object.entries(st.rent).find(([, r]) => r.tenant === o.id && G.household.some((s) => s.id === r.owner));
      if (myRent) { const h = houseById(+myRent[0]); const r = myRent[1]; out.push({ label: `🏘 Your tenant · ${rentOf(h)}/day${r.arrears ? ` · ${r.arrears} days behind` : ''}`, disabled: true }); if (r.arrears) out.push({ label: '🤲 Forgive their arrears', fn: () => { r.arrears = 0; o.changeRel(me, 20); me.needs.honor = Math.min(100, me.needs.honor + 4); } }); out.push({ label: '🚪 Evict them', danger: true, fn: () => { evict(h, me); me.needs.honor = Math.max(0, me.needs.honor - 6); } }); }
      if (st.tenancy[o.id] && G.household.some((s) => s.id === st.tenancy[o.id])) out.push({ label: `🌾 Your tenant farmer (they hand over ${Math.round(shareOf(me) * 100)}% of the harvest)`, disabled: true }, { label: '🌾 Lower their share as a kindness', fn: () => { o.changeRel(me, 15); o.earn(10); } });
      if (!o.household && o.coins < 30 && !st.loans.some((l) => l.borrower === o.id) && me.coins >= 100) out.push({ label: `💰 Lend ${o.name.given} 100 nyang at 30%${o.home?.owner === o.id ? ' (their house as surety)' : ''}`, fn: () => { me.coins -= 100; o.earn(100); st.loans.push({ lender: 'player', borrower: o.id, principal: 100, due: G.env.day + 5, collateral: o.home?.owner === o.id ? o.home.id : null }); o.say('I will pay it back, I swear it.', 'talk', 3); } });
      return out;
    },
    panelHtml(s) {
      const bits = [];
      if (st.land[s.id]) bits.push(`🌾 Owns ${st.land[s.id]} rice parcel${st.land[s.id] > 1 ? 's' : ''}`);
      if (st.tenancy[s.id]) { const l = byId(st.tenancy[s.id]); if (l) bits.push(`🌾 Tenant farmer of ${l.name.full}`); }
      const r = Object.values(st.rent).find((x) => x.tenant === s.id); if (r) { const l = r.owner === 'crown' ? null : byId(r.owner); bits.push(`🏘 Rents from ${l ? l.name.full : 'the magistrate'}`); }
      const lets = Object.values(st.rent).filter((x) => x.owner === s.id && x.tenant).length; if (lets) bits.push(`🏘 Landlord of ${lets} house${lets > 1 ? 's' : ''}`);
      if (st.homeless.includes(s.id)) bits.push('🏚 Homeless — sleeping at the temple');
      return bits.length ? `<div class="facts">${bits.join(' · ')}</div>` : '';
    },
    serialize() { return st; },
  };
  return S;
}
