// Horses on the road. People who can afford a horse ride it on long journeys: generals, ministers,
// rich householders, merchants and the police chief. A groom leads the horse home when the owner
// leaves it somewhere. Royal couriers (파발), travelling merchants and yangban on a journey ride
// through the valley along the high roads.
import { ROADS } from './terrain.js';

export function createRidingSystem(G) {
  const st = { given: false };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const sys = (id) => G.systems.find((x) => x.id === id);
  const travellers = [];
  const camPos = () => G.player?.camera?.position;
  const ROYAL = ['king', 'queen', 'prince', 'princess'];

  function yard(s) { const h = s.home; if (!h || h.virtual) return null; const d = h.door || [h.x, h.z]; const f = h.fwd || [0, 1]; return [d[0] + f[1] * 3, d[1] - f[0] * 3]; }
  function giveHorse(s) {
    const A = G.animals; if (!A || (s.horse && !s.horse.dead)) return null;
    const y = yard(s) || [s.pos.x + 3, s.pos.z + 2];
    const h = A.spawn('horse', y[0], y[1], { home: y, range: 3, variant: Math.floor(Math.random() * 6) });
    A.giveHorse(s, h); h.ownerId = s.id; return h;
  }
  function equip() {
    if (st.given) return; st.given = true;
    const O = sys('officials'); const pm = O?.pm?.(); const chief = O?.chief?.();
    const riders = G.sims.filter((s) => !s.dead && !s.household && s.age !== 'child' && !ROYAL.includes(s.job) && !s.royalGuard && !s.merc && (
      s.job === 'general' || s === pm || s === chief || (s.factions?.court?.rank || 0) >= 5 ||
      (s.home?.tier === 'mansion' && s.home.residents.find((r) => !r.dead && !r.serf && r.age !== 'child') === s) ||
      (s.home?.tier === 'house' && Math.random() < 0.3 && s.home.residents.find((r) => !r.dead && !r.serf && r.age !== 'child') === s) ||
      (s.job === 'merchant' && s.coins > 150 && Math.random() < 0.5)));
    for (const s of riders.slice(0, 16)) giveHorse(s);
  }
  // a groom brings a left-behind horse home when nobody is looking
  function stable() {
    const cp = camPos();
    for (const a of G.animals?.list || []) {
      if (a.type !== 'horse' || a.dead || a.rider || !a.owner || a.owner.household) continue;
      const o = a.owner; if (o.dead) { a.owner = null; continue; }
      const y = yard(o); if (!y) continue;
      const far = Math.hypot(a.pos.x - y[0], a.pos.z - y[1]) > 30; const ownerAway = o.pos.distanceTo(a.pos) > 45;
      const unseen = !cp || (cp.distanceTo(a.pos) > 90 && Math.hypot(cp.x - y[0], cp.z - y[1]) > 90);
      if (far && ownerAway && unseen) { a.pos.x = y[0]; a.pos.z = y[1]; a.home = y; a.range = 3; a.state = 'graze'; }
    }
  }
  // travellers ride in from the edge of the map, call at the palace or the market, and ride away
  function traveller() {
    if (travellers.length >= 3 || !G.animals) return;
    const road = pick(ROADS); const fromEnd = Math.random() < 0.5; const ends = fromEnd ? [road[road.length - 1], road[road.length - 2]] : [road[0], road[1]];
    const [sx, sz] = ends[0]; const kind = pick(['courier', 'merchant', 'yangban', 'merchant']);
    const spots = G.world.spots; const dest = kind === 'courier' ? [G.vhouses?.royal?.door?.[0] ?? 0, G.vhouses?.royal?.door?.[1] ?? 0] : kind === 'merchant' ? (spots.market || [0, 70]) : spots.jumak || [27, 22];
    const s = G.spawn({ sex: 'm', age: 'adult', job: kind === 'courier' ? 'soldier' : kind === 'yangban' ? 'noble' : 'merchant', x: sx, z: sz, coins: 40 + Math.floor(Math.random() * 80), traits: [pick(['Brave', 'Cheerful', 'Cunning', 'Gentle'])] });
    s.missionLock = true; s.traveller = kind; s.faction = 'village';
    if (kind === 'courier') { s.uniform = { outfit: 'soldier', colors: { top: '#8a2a1e', bottom: '#2a2420' }, hat: 'jeonrip' }; s.rebuildModel(); }
    const h = G.animals.spawn('horse', sx, sz, { home: [sx, sz], range: 3, variant: Math.floor(Math.random() * 6) });
    G.animals.giveHorse(s, h); G.animals.mount(s, h);
    const rec = { s, h, kind, home: [sx, sz], t: 0, phase: 'in' };
    travellers.push(rec);
    s.startAction({ type: 'goto', dest: [dest[0] + (Math.random() - 0.5) * 6, dest[1] + 4], run: kind === 'courier', label: kind === 'courier' ? 'Galloping with a dispatch for the palace' : kind === 'merchant' ? 'Riding in to the market with goods' : 'Travelling through the valley' });
    if (kind === 'courier') { G.log(`🐎 A royal courier (파발) gallops up the road with a sealed dispatch for the palace.`, 'decree', s.pos); s.say('Make way! Royal dispatch!', 'shout', 3); }
  }
  function tendTravellers(dt) {
    for (const r of [...travellers]) {
      const { s, h } = r; r.t += dt;
      if (s.dead || h.dead) { done(r); continue; }
      if (r.phase === 'in' && !s.action) { r.phase = 'stay'; r.t = 0; if (s.mount) G.animals.dismount(s); s.startAction({ type: 'event', dest: [s.pos.x + 1, s.pos.z + 1], anim: r.kind === 'merchant' ? 'talk' : 'idle', dur: 40, label: r.kind === 'courier' ? 'Delivering the dispatch' : 'Trading and resting' }); }
      else if (r.phase === 'stay' && r.t > 45) { r.phase = 'out'; r.t = 0; s.cancelAction(); if (!s.mount && h.pos.distanceTo(s.pos) < 6) G.animals.mount(s, h); s.startAction({ type: 'goto', dest: r.home, label: 'Riding on along the high road' }); }
      else if (r.phase === 'out' && (!s.action || r.t > 400)) done(r);
      else if (r.t > 600) done(r);
    }
  }
  function done(r) {
    travellers.splice(travellers.indexOf(r), 1);
    const { s, h } = r;
    if (s.mount) G.animals.dismount(s);
    if (!h.dead) { G.scene.remove(h.root); h.removed = true; h.dead = true; h.deadT = 999; }
    if (!s.dead) { s.dispose?.(); s.removed = true; s.dead = true; s.hidden = true; }
  }

  const S = {
    id: 'riding', st,
    onEvent(name) { if (name === 'ready') setTimeout(equip, 2500); },
    update(dt, gm) {
      if (!G.started) return;
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 3;
      stable(); tendTravellers(3);
      const hr = G.env.hour;
      this._tr = (this._tr ?? 30) - 3; void gm;
      if (this._tr <= 0 && hr > 6 && hr < 19) { this._tr = 70 + Math.random() * 90; traveller(); }
    },
    serialize() { return st; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
