import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, rr } from './noise.js';
import { heightAt, groundAt, isWater } from './terrain.js';
import { planPath } from './sim.js';
import { FACTIONS, JOBS } from './data.js';
import { JOB_SPOTS } from './economy.js';

export class Player {
  constructor(G, camera, dom) {
    this.G = G; this.camera = camera; this.dom = dom;
    this.mode = 'overseer'; // or 'warrior' | 'title'
    this.focus = new THREE.Vector3(0, 2, 10); this.focusTarget = this.focus.clone();
    this.yaw = 0.6; this.pitch = 0.75; this.dist = 34; this.distTarget = 34; this.yawT = this.yaw; this.pitchT = this.pitch;
    this.keys = {}; this.mouse = { x: 0, y: 0, down: [false, false, false] }; this.follow = false;
    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2();
    this.camYaw = 0; this.camPitch = 0.25; this.lockTarget = null; this.shake = 0;
    this.titleT = 0;
    this.bind();
  }

  bind() {
    const d = this.dom;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Escape always dismisses an open dialog first, so a modal can never trap the controls
      const m = document.getElementById('modal');
      if (e.code === 'Escape' && m && !m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
      this.keys[e.code] = true; this.onKey(e);
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'KeyF' && this.mode === 'warrior') {} });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; this.G.ui?.toast('Mouse lock unavailable — drag with the mouse to look around.'); });
    d.addEventListener('mousedown', (e) => {
      this.mouse.down[e.button] = true; this.mouse.sx = e.clientX; this.mouse.sy = e.clientY; this.dragged = false;
      if (this.mode === 'warrior') {
        this.mouse.lx = e.clientX; this.mouse.ly = e.clientY;
        if (document.pointerLockElement !== d && !this.lockFailed) {
          try { const p = d.requestPointerLock?.(); p?.catch?.(() => { this.lockFailed = true; }); } catch { this.lockFailed = true; }
          return;
        }
        const s = this.G.selected; if (!s || s.dead) return;
        if (this.G.archery?.mouseDown?.(e)) return;
        if (e.button === 0) this.warriorAttack(e.shiftKey ? 'heavy' : 'light');
        if (e.button === 1) this.warriorAttack('heavy');
        if (e.button === 2) { s.combat.blocking = true; s.combat.blockStart = performance.now(); }
      }
    });
    addEventListener('mouseup', (e) => {
      this.mouse.down[e.button] = false;
      if (this.mode === 'warrior') { if (this.G.archery?.mouseUp?.(e)) return; if (e.button === 2 && this.G.selected) this.G.selected.combat.blocking = false; return; }
      if (this.mode === 'overseer' && e.button === 0 && !this.dragged && e.target === d) this.click(e);
    });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.mode === 'warrior') {
        const locked = document.pointerLockElement === d;
        // without pointer lock (embedded browsers, lock refused) any held-button drag turns the camera
        const dragLook = !locked && (this.mouse.down[0] || this.mouse.down[2]);
        if (locked || dragLook) {
          const mx = locked ? e.movementX : e.clientX - (this.mouse.lx ?? e.clientX), my = locked ? e.movementY : e.clientY - (this.mouse.ly ?? e.clientY);
          this.camYaw -= mx * (locked ? 0.0025 : 0.005); this.camPitch = clamp(this.camPitch + my * (locked ? 0.002 : 0.004), -0.5, 1.1);
        }
        this.mouse.lx = e.clientX; this.mouse.ly = e.clientY;
        return;
      }
      if (this.mode !== 'overseer') return;
      const dx = e.clientX - (this.mouse.lx ?? e.clientX), dy = e.clientY - (this.mouse.ly ?? e.clientY);
      this.mouse.lx = e.clientX; this.mouse.ly = e.clientY;
      if (Math.hypot(e.clientX - (this.mouse.sx || 0), e.clientY - (this.mouse.sy || 0)) > 5) this.dragged = true;
      // turn: right-drag (two-finger click-drag), or ⌥ Option / Alt + drag, or the rotate mode on the camera pad
      const turning = this.mouse.down[2] || (this.mouse.down[0] && (e.altKey || this.dragRotates));
      if (turning) { this.yawT -= dx * 0.006; this.pitchT = clamp(this.pitchT + dy * 0.004, 0.18, 1.45); }
      else if (this.mouse.down[1] || (this.mouse.down[0] && this.dragged)) { this.pan(-dx * this.dist * 0.0018, dy * this.dist * 0.0025); this.follow = false; }
    });
    // Scroll and gestures, made for a Mac trackpad as well as a mouse:
    //   pinch                    -> zoom (smooth)
    //   two-finger swipe         -> turn the camera around (sideways) and tilt it (up/down)
    //   a mouse wheel's clicks   -> zoom
    // (⚙ Settings can switch the two-finger swipe to zoom instead)
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.mode !== 'overseer' && this.mode !== 'warrior') return;
      const pinch = e.ctrlKey; // macOS reports a pinch as ctrl+wheel
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const dx = e.deltaX * lines, dy = e.deltaY * lines;
      // a classic mouse wheel sends big round vertical steps with no sideways component
      const wheelStep = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));
      const swipeZooms = (() => { try { return localStorage.getItem('hr_swipe') === 'zoom'; } catch { return false; } })();
      if (this.mode === 'warrior') {
        if (pinch || wheelStep || swipeZooms) { this.warriorZoom = clamp((this.warriorZoom ?? 1) * Math.exp(dy * (pinch ? 0.01 : 0.0015)), 0.55, 2.4); return; }
        this.camYaw -= dx * 0.004; this.camPitch = clamp(this.camPitch - dy * 0.003, -0.5, 1.1); return;
      }
      if (pinch) { this.distTarget = clamp(this.distTarget * Math.exp(dy * 0.009), 4, 160); return; }
      if (wheelStep || swipeZooms) { this.distTarget = clamp(this.distTarget * Math.exp(clamp(dy, -120, 120) * 0.0015), 4, 160); if (swipeZooms && dx) this.yawT -= dx * 0.004; return; }
      this.yawT -= dx * 0.0045;
      this.pitchT = clamp(this.pitchT - dy * 0.0035, 0.18, 1.45);
    }, { passive: false });
    // Safari's own pinch gesture events (so a pinch never zooms the whole page)
    let gs = 1;
    d.addEventListener('gesturestart', (e) => { e.preventDefault(); gs = e.scale || 1; });
    d.addEventListener('gesturechange', (e) => { e.preventDefault(); const k = gs / (e.scale || 1); gs = e.scale || 1; if (this.mode === 'overseer') this.distTarget = clamp(this.distTarget * k, 4, 160); else this.warriorZoom = clamp((this.warriorZoom ?? 1) * k, 0.55, 2.4); });
    d.addEventListener('dblclick', () => { if (this.mode === 'overseer' && this.G.selected) this.follow = true; });
  }

  pan(right, fwd) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.focusTarget.x += rx * right + fx * fwd; this.focusTarget.z += rz * right + fz * fwd;
    this.focusTarget.x = clamp(this.focusTarget.x, -470, 470); this.focusTarget.z = clamp(this.focusTarget.z, -470, 470);
  }

  onKey(e) {
    const G = this.G; const ui = G.ui;
    if (this.mode === 'title') return;
    if (e.code === 'KeyV' || e.code === 'Tab') { e.preventDefault(); this.toggleMode(); }
    if (e.code === 'KeyH' && this.mode !== 'warrior') ui.toggleHelp();
    if (e.code === 'KeyC') ui.toggleChronicle();
    if (e.code === 'KeyG') this.spiritWind();
    if (e.code === 'KeyK') ui.openKingdom();
    if (this.mode === 'overseer') {
      if (e.code === 'Space') { e.preventDefault(); G.paused = !G.paused; ui.refreshSpeed(); }
      if (e.code === 'Digit1') { G.timeScale = 1; G.paused = false; ui.refreshSpeed(); }
      if (e.code === 'Digit2') { G.timeScale = 3; G.paused = false; ui.refreshSpeed(); }
      if (e.code === 'Digit3') { G.timeScale = 8; G.paused = false; ui.refreshSpeed(); }
      if (e.code === 'KeyF' && G.selected) this.follow = !this.follow;
      if (e.code === 'Escape') ui.closePie();
    } else {
      const s = G.selected; if (!s) return;
      if (e.code === 'Space') { e.preventDefault(); this.warriorDodge(); }
      if (e.code === 'KeyR' || e.code === 'KeyQ') this.warriorAttack('heavy');
      if (e.code === 'KeyX') { if (s.char.swordDrawn) s.char.sheathe(); else s.char.draw(); }
      if (e.code === 'KeyT') this.toggleLock();
      if (e.code === 'KeyE') { if (s.mount) this.G.animals.dismount(s); else { const h = s.horse; if (h && !h.dead && h.pos.distanceTo(s.pos) < 3.5) this.G.animals.mount(s, h); else this.interactNearest(); } }
      if (e.code === 'KeyH') this.G.animals.whistle(s);
    }
  }

  toggleMode(force) {
    const G = this.G; const s = G.selected;
    const next = force || (this.mode === 'overseer' ? 'warrior' : 'overseer');
    if (next === 'warrior') {
      if (!s || !s.household || s.dead) { G.ui.toast('Select one of your household to take control.'); return; }
      document.getElementById('modal')?.classList.add('hidden'); G.ui.closePie?.();
      this.mode = 'warrior'; s.cancelAction(); s.queue = []; s.controlled = true; s.setHidden(false);
      this.camYaw = s.heading + Math.PI; this.camPitch = 0.25; this.prevScale = G.timeScale; G.timeScale = 1; G.paused = false;
      this.dom.requestPointerLock?.();
      G.ui.closePie();
    } else {
      this.mode = 'overseer';
      if (s) { s.controlled = false; s.combat.blocking = false; }
      document.exitPointerLock?.();
      this.focusTarget.copy(s ? s.pos : this.focus); this.yawT = this.camYaw + Math.PI; this.follow = true;
      this.lockTarget = null; if (this.prevScale) G.timeScale = this.prevScale;
    }
    G.ui.setMode(this.mode);
  }

  spiritWind() {
    const env = this.G.env; const ev = this.G.director.active;
    let target = ev?.pos;
    if (!target) { const last = this.G.chronicle.find((c) => c.pos); target = last?.pos; }
    if (!target) { this.G.ui.toast('The wind is still. Nothing calls to you.'); return; }
    env.spiritWindTarget = { x: target[0], z: target[1] }; env.spiritWindTimer = 6;
    // in overseer view the wind carries the camera straight there (follow your character again with F or ◎)
    if (this.mode === 'overseer') { this.follow = false; this.focusTarget.set(target[0], 0, target[1]); this.distTarget = Math.min(Math.max(this.distTarget, 22), 40); this.G.ui.toast('🍃 The spirit wind carries you to what is happening. Press F or ◎ to return to your character.'); }
    else this.G.ui.toast('🍃 The spirit wind shows the way — follow the drifting leaves.');
  }

  // ---------- Overseer clicks ----------
  pick(e) {
    const r = this.dom.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    const hits = this.ray.intersectObjects([...this.G.sims.filter((s) => !s.hidden && s.char.root.visible).map((s) => s.hitMesh), ...(this.G.animals?.list || []).filter((a) => !a.dead && a.root.visible).map((a) => a.hitMesh)], false);
    if (hits.length) return hits[0].object.userData.sim ? { sim: hits[0].object.userData.sim } : { animal: hits[0].object.userData.animal };
    const th = this.ray.intersectObject(this.G.terrainMesh, false);
    const ground = th.length ? th[0].point : null;
    if (!ground) return {};
    let obj = null, bd = 2.6;
    for (const o of this.G.world.objects) { const d = Math.hypot(o.x - ground.x, o.z - ground.z); if (d < bd) { bd = d; obj = o; } }
    return { ground, obj };
  }

  click(e) {
    const G = this.G; const ui = G.ui;
    ui.closePie();
    const p = this.pick(e);
    const sel = G.selected;
    if (p.animal) { if (sel && sel.household && !sel.dead) ui.openPie(e.clientX, e.clientY, this.animalMenu(sel, p.animal)); return; }
    if (p.sim) {
      const s = p.sim;
      if (!sel || !sel.household || sel.dead) { G.select(s); return; }
      // clicking yourself opens your own options (housing office, matchmaker, offices, "I'm stuck"…)
      if (s === sel) { ui.openPie(e.clientX, e.clientY, this.selfMenu(s)); return; }
      // clicking family opens their menu — talk, court, give an allowance… — with "control them" first
      if (s.household) { const m = this.simMenu(sel, s); m.items.unshift({ label: `👤 Control ${s.name.given}`, fn: () => G.select(s) }); ui.openPie(e.clientX, e.clientY, m); return; }
      ui.openPie(e.clientX, e.clientY, this.simMenu(sel, s));
      return;
    }
    if (!sel || !sel.household || sel.dead) { if (p.ground) { this.focusTarget.copy(p.ground); this.follow = false; } return; }
    if (p.obj) { ui.openPie(e.clientX, e.clientY, this.objMenu(sel, p.obj, p.ground)); return; }
    if (p.ground && !isWater(p.ground.x, p.ground.z)) this.command(sel, { type: 'goto', dest: [p.ground.x, p.ground.z], label: 'Go here', run: e.shiftKey }, e.ctrlKey || e.metaKey);
  }

  command(sim, action, queue = false) {
    if (!queue) { sim.queue = []; sim.cancelAction(); }
    sim.queue.push(action);
    if (!sim.action) { sim.thinkT = 0; }
    this.G.ui.marker(action.dest || (action.obj ? [action.obj.x, action.obj.z] : null));
    this.G.audio.ui();
  }

  selfMenu(me) {
    const items = this.G.menuItems('simMenuItems', me, me);
    if (!items.length) items.push({ label: 'Nothing to do here just now', disabled: true });
    return { title: me.name.full, sub: 'Your options', items };
  }

  simMenu(me, o) {
    const r = me.getRel(o); const items = [];
    const elig = me.sex !== o.sex && me.age !== 'elder' && o.age !== 'elder';
    const mk = (label, kind, extra = {}) => ({ label, fn: () => this.command(me, { type: 'interact', target: o, kind, forced: true, label: `${label}: ${o.name.given}`, ...extra }) });
    items.push(mk('Chat', 'chat'), mk('Greet / Bow', 'greet'), mk('Joke', 'joke'), mk('Compliment', 'compliment'), mk('Gossip', 'gossip'));
    if (elig) items.push(mk('Flirt', 'flirt'));
    if (elig && r.r >= 60 && !me.spouse && !o.spouse) items.push(mk('Propose Marriage', 'propose'));
    if (o.mood < -10) items.push(mk('Comfort', 'comfort'));
    if (me.spouse === o && ![me, o].some((x) => x.pregnant || x.age === 'elder') && me.sex !== o.sex) items.push(mk('Try for a baby ❤', 'tryBaby'));
    if (o.job === 'king' && !o.dead && me !== o) items.push({ label: '👑 Request an audience', fn: () => { if (me.pos.distanceTo(o.pos) < 6) this.G.ui.openAudience(me); else this.command(me, { type: 'goto', dest: [o.pos.x, o.pos.z + 2.5], label: 'Approaching the throne', then: () => this.G.ui.openAudience(me) }); } });
    for (const fid in o.factions) { const F = this.G.factions; if (!me.factions[fid] && F.leader(fid) === o && (!FACTIONS[fid].secret || me.factions.lotus)) items.push({ label: `Ask to join the ${FACTIONS[fid].name}`, fn: () => F.join(me, fid) }); }
    if (!o.household) items.push(mk('Pickpocket', 'steal'));
    if (o.outlaw && (me.job === 'police' || me.job === 'soldier')) items.push({ label: `⛓ Arrest (bounty ${o.bounty || 0})`, danger: true, fn: () => { me.queue = []; me.startFight(o, true); me.arresting = o; } });
    if (me.coins >= 10 && o.coins < 15 && !o.household) items.push({ label: 'Give 10 nyang', fn: () => { me.coins -= 10; o.earn(10); me.changeRel(o, 12); me.needs.honor = Math.min(100, me.needs.honor + 5); o.say('Bless you, kind soul!', 'happy'); } });
    items.push(mk('Insult', 'insult'));
    if (me.fighter && o.fighter) items.push(mk('Challenge to Duel', 'challenge'));
    items.push({ label: '💬 Talk…', fn: () => this.G.ui.openDialogue(me, o) });
    if (me.fighter) items.push({ label: 'Attack!', danger: true, fn: () => { me.queue = []; me.startFight(o); } });
    items.push({ label: `Inspect ${o.name.given}`, fn: () => this.G.select(o, true) });
    items.push(...this.G.menuItems('simMenuItems', me, o));
    return { title: `${o.name.full} · ${o.name.hangul}`, sub: `${o.title} — ${me.relLabel(o)[0]}`, items };
  }

  objMenu(me, o, ground) {
    const d = o.def; const items = [];
    const ok = !(d.home && (!me.home || o.house !== me.home.id)) && !(d.camp && me.faction !== 'bandit');
    if (ok && !d.work) items.push({ label: `${d.label}${d.cost ? ` (${d.cost} nyang)` : ''}`, fn: () => this.command(me, { type: 'use', obj: o, label: d.label }) });
    if (ok && d.work) items.push({ label: d.label + ' (work)', fn: () => this.command(me, { type: 'use', obj: o, label: d.label, work: true }) });
    if (!ok) items.push({ label: d.home ? 'Not your home' : 'Not for you', disabled: true });
    if (o.kind === 'hall') {
      const F = FACTIONS[o.faction]; const isIn = me.factions[o.faction];
      items.length = 0;
      if (isIn) items.push({ label: `New task (${F.name})`, fn: () => { this.G.factions.newTask(me, o.faction); this.G.ui.toast(me.tasks[o.faction].text); } }, { label: `Leave the ${F.name}`, danger: true, fn: () => this.G.factions.leave(me, o.faction) });
      else items.push({ label: `Join the ${F.name}`, fn: () => { const go = () => this.G.factions.join(me, o.faction); if (me.pos.distanceTo(new THREE.Vector3(o.x, me.pos.y, o.z)) < 8) go(); else this.command(me, { type: 'goto', dest: [o.x, o.z], label: `To the ${F.name} hall`, then: go }); } });
      items.push({ label: 'About this faction', fn: () => this.G.ui.openKingdom() });
      return { title: `${F.name} · ${F.ko}`, sub: isIn ? this.G.factions.rankTitle(me, o.faction) : 'Faction hall', items };
    }
    if (o.kind === 'shop' || o.kind === 'stallWork') items.unshift({ label: '🛒 Browse the market', fn: () => this.G.ui.openMarket(me) });
    if (o.kind === 'policeHall') { items.length = 0; items.push({ label: 'Enter the Podocheong', fn: () => this.G.ui.openPolice(me) }); }
    if (o.kind === 'stableHall') { items.length = 0; items.push({ label: 'Visit the stable', fn: () => this.G.ui.openStable(me) }, { label: 'Whistle for your horse', fn: () => this.G.animals.whistle(me) }); }
    if (o.kind === 'lender') { items.length = 0; items.push({ label: 'Speak to the moneylender', fn: () => this.G.ui.openLender(me) }); }
    const jobHere = JOB_SPOTS[o.kind];
    if (jobHere && me.job !== jobHere && !d.menuOnly) items.push({ label: `Work here as a ${JOBS[jobHere].title.toLowerCase()}`, fn: () => this.G.economy.changeJob(me, jobHere) });
    if (jobHere === 'police' && me.job !== 'police') items.push({ label: 'Apply as a constable', fn: () => this.G.economy.changeJob(me, 'police') });
    if (o.kind === 'bed' && me.home && o.house === me.home.id && !me.home.virtual) items.push({ label: 'Renovate home', fn: () => this.G.economy.renovate(me, me.home) }, { label: 'Property & houses…', fn: () => this.G.ui.openProperty(me) });
    if (o.kind === 'bed' && o.house !== undefined && typeof o.house === 'number' && me.home?.id !== o.house) {
      const h = this.G.world.houses.find((x) => x.id === o.house);
      if (h && !h.residents.some((r) => !r.dead)) items.push({ label: `Buy this house (${this.G.economy.houseValue(h)} nyang)`, fn: () => this.G.economy.buyHouse(me, h) });
    }
    items.push({ label: 'Go here', fn: () => this.command(me, { type: 'goto', dest: [ground.x, ground.z], label: 'Go here' }) });
    items.push(...this.G.menuItems('objMenuItems', me, o));
    return { title: `${o.title || d.label} · ${d.ko}`, sub: o.sub || (o.users.size ? `${o.users.size} using` : 'Available'), items };
  }

  animalMenu(me, a) {
    const items = [];
    const D = a.def;
    if (a.type === 'horse') {
      if (a.owner === me) { items.push({ label: me.mount === a ? 'Dismount' : `Ride ${a.petName}`, fn: () => { if (me.mount === a) this.G.animals.dismount(me); else this.command(me, { type: 'goto', dest: [a.pos.x, a.pos.z], label: 'Going to the horse', then: () => this.G.animals.mount(me, a) }); } }); items.push({ label: 'Pat its neck', fn: () => { me.needs.fun = Math.min(100, me.needs.fun + 8); } }); }
      else if (a.forSale) items.push({ label: `Buy this horse (${a.forSale} nyang)`, fn: () => this.G.animals.buyHorse(me, a) });
      else if (!a.owner) items.push({ label: 'Try to tame it', fn: () => this.command(me, { type: 'goto', dest: [a.pos.x, a.pos.z], label: 'Approaching the wild horse', then: () => this.G.animals.tame(me, a) }) });
      else items.push({ label: `${a.petName} belongs to ${a.owner.name.given}`, disabled: true });
      return { title: a.petName ? `${a.petName} · Horse` : 'Horse', sub: '말' + (a.forSale ? ` — for sale` : a.owner ? '' : ' — wild'), items };
    }
    if (a.owner === me) {
      items.push({ label: `Pet ${a.petName}`, fn: () => this.G.animals.petInteract(me, a, 'pet') }, { label: 'Play fetch', fn: () => this.G.animals.petInteract(me, a, 'play') }, { label: 'Let it go free', fn: () => { a.owner = null; me.pet = null; a.state = 'idle'; } });
    } else if (D.pet && !a.owner) items.push({ label: `Adopt as pet`, fn: () => { this.command(me, { type: 'goto', dest: [a.pos.x, a.pos.z], label: `Approaching the ${D.name.toLowerCase()}`, then: () => this.G.animals.adopt(me, a) }); } });
    else if (a.owner) items.push({ label: `${a.petName} belongs to ${a.owner.name.given}`, disabled: true });
    if (D.pet || D.farm) items.push({ label: 'Pet it', fn: () => this.command(me, { type: 'goto', dest: [a.pos.x, a.pos.z], label: 'Petting an animal', then: () => { me.needs.fun = Math.min(100, me.needs.fun + 8); me.say('Aww…', 'happy'); } }) });
    if (me.fighter && a.owner !== me) items.push({ label: D.wild ? `Hunt the ${D.name.toLowerCase()}` : 'Attack', danger: true, fn: () => { me.queue = []; me.startFight(a); } });
    items.push(...this.G.menuItems('animalMenuItems', me, a));
    return { title: a.petName ? `${a.petName} · ${D.name}` : D.name, sub: D.ko + (D.hostile ? ' — dangerous!' : D.wild ? ' — wild' : ''), items };
  }

  buyHouse(me, h) {
    if (me.coins < 150) return this.G.ui.toast('A house costs 150 nyang.');
    me.coins -= 150;
    for (const s of this.G.household) { if (s.home && s.home !== h) s.home.residents = s.home.residents.filter((x) => x !== s); if (s.job === 'king' || s.job === 'queen') continue; s.home = h; h.residents.push(s); }
    this.G.homeHouse = h;
    this.G.log(`The ${me.name.surname} family moves into a new ${h.noble ? 'tiled hanok' : 'thatched house'}.`, 'story', { x: h.x, z: h.z });
  }

  // ---------- Warrior mode ----------
  warriorAttack(kind) {
    const s = this.G.selected; if (!s || s.dead) return;
    if (s.action) s.cancelAction();
    if (!this.lockTarget) s.heading = this.camYaw + Math.PI;
    else s.heading = Math.atan2(this.lockTarget.pos.x - s.pos.x, this.lockTarget.pos.z - s.pos.z);
    s.attack(kind);
  }
  warriorDodge() {
    const s = this.G.selected; if (!s || s.mount) return;
    const mv = this.moveInput();
    if (mv.lengthSq() > 0) s.heading = Math.atan2(mv.x, mv.z);
    if (s.dodge(mv.lengthSq() > 0 ? 1 : -1)) { s.dodgeVec = mv.lengthSq() > 0 ? [mv.x * 7.5, mv.z * 7.5] : [-Math.sin(s.heading) * 7, -Math.cos(s.heading) * 7]; }
  }
  toggleLock() {
    const s = this.G.selected;
    if (this.lockTarget) { this.lockTarget = null; return; }
    let best = null, bd = 18;
    for (const o of this.G.sims) { if (o === s || o.dead || o.hidden) continue; const d = o.pos.distanceTo(s.pos); const hostile = s.isHostile(o) || o.combat.target === s; if (d < bd && (hostile || d < 6)) { bd = d; best = o; } }
    this.lockTarget = best;
  }
  interactNearest() {
    const G = this.G, s = G.selected;
    let best = null, bd = 3.5, bo = null, bod = 3;
    for (const o of G.sims) { if (o === s || o.dead || o.hidden) continue; const d = o.pos.distanceTo(s.pos); if (d < bd) { bd = d; best = o; } }
    for (const o of G.world.objects) { const d = Math.hypot(o.x - s.pos.x, o.z - s.pos.z); if (d < bod) { bod = d; bo = o; } }
    document.exitPointerLock?.();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    if (best && (!bo || bd < bod + 0.5)) G.ui.openPie(cx, cy, this.simMenu(s, best));
    else if (bo) G.ui.openPie(cx, cy, this.objMenu(s, bo, new THREE.Vector3(bo.x, 0, bo.z)));
  }
  moveInput() {
    const k = this.keys; let f = 0, r = 0;
    if (k.KeyW || k.ArrowUp) f += 1; if (k.KeyS || k.ArrowDown) f -= 1; if (k.KeyD || k.ArrowRight) r += 1; if (k.KeyA || k.ArrowLeft) r -= 1;
    const yaw = this.camYaw + Math.PI;
    const v = new THREE.Vector3(Math.sin(yaw) * f - Math.cos(yaw) * r, 0, Math.cos(yaw) * f + Math.sin(yaw) * r);
    if (v.lengthSq() > 1) v.normalize();
    return v;
  }

  updateWarrior(dt) {
    const G = this.G; const s = G.selected;
    if (!s || s.dead) { if (s?.dead) { G.ui.toast(`${s.name.full} has fallen…`); this.toggleMode('overseer'); } return; }
    if (G.standoffActive && this.camOverride) {
      s.controlled = true; const o = this.camOverride;
      if (!this.camPos) this.camPos = o.pos.clone();
      this.camPos.lerp(o.pos, 1 - Math.exp(-dt * 3));
      this.camera.position.copy(this.camPos);
      if (this.shake > 0) { this.shake -= dt; this.camera.position.x += rr(-1, 1) * this.shake * 0.15; this.camera.position.y += rr(-1, 1) * this.shake * 0.15; }
      this.camera.lookAt(o.look); this.focus.copy(s.pos); return;
    }
    // let auto actions (from E menu) run; movement cancels
    const mv = this.moveInput();
    if (s.action || s.queue.length) {
      s.controlled = false;
      if (mv.lengthSq() > 0) { s.queue = []; s.cancelAction(); s.controlled = true; }
    } else s.controlled = true;
    if (!s.controlled) return this.updateWarriorCam(dt, s);
    const c = s.combat;
    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight;
    const busy = c.atk || c.staggerT > 0 || c.hitT > 0 || c.dodgeT > 0;
    const blocking = c.blocking;
    let speed = blocking ? 1.2 : s.char.swordDrawn ? (sprint ? 5.2 : 2.6) : sprint ? 5.6 : 2.0;
    if (s.mount) speed = sprint ? 12 : 4.5;
    if (busy) speed = c.atk ? 0.4 : 0;
    if (this.lockTarget && (this.lockTarget.dead || this.lockTarget.hidden || this.lockTarget.pos.distanceTo(s.pos) > 25)) this.lockTarget = null;
    s.moving = false;
    if (mv.lengthSq() > 0.01 && speed > 0 && c.dodgeT <= 0) {
      const nx = s.pos.x + mv.x * speed * dt, nz = s.pos.z + mv.z * speed * dt;
      if (!isWater(nx, nz)) { s.pos.x = nx; s.pos.z = nz; }
      G.nav.pushOut(s.pos, 0.3);
      s.moving = true; s.curSpeed = speed;
      if (!this.lockTarget && !c.atk) s.heading = dampAngle(s.heading, Math.atan2(mv.x, mv.z), s.mount ? 4 : 12, dt);
    }
    if (this.lockTarget) s.heading = dampAngle(s.heading, Math.atan2(this.lockTarget.pos.x - s.pos.x, this.lockTarget.pos.z - s.pos.z), 12, dt);
    // auto-detect a combat target for the HUD
    if (!c.target || c.target.dead) { c.target = null; for (const o of G.sims) if (!o.dead && o.combat.target === s && o.pos.distanceTo(s.pos) < 20) { c.target = o; break; } }
    // animation
    if (c.staggerT > 0) s.char.setAnim('stagger');
    else if (c.hitT > 0) s.char.setAnim('hit');
    else if (c.dodgeT > 0) s.char.setAnim('dodge');
    else if (c.atk) {}
    else if (blocking) s.char.setAnim('block', 22);
    else if (s.moving) s.char.setAnim(speed > 4 ? 'run' : 'walk');
    else s.char.setAnim(s.char.swordDrawn ? 'stance' : 'idle');
    this.updateWarriorCam(dt, s);
  }

  updateWarriorCam(dt, s) {
    const az = this.aimZoom || 0;
    const back = (s.mount ? 6 : 4.3) * (1 - az * 0.3) * (this.warriorZoom ?? 1), h = (s.mount ? 2.5 : 1.75) - az * 0.05;
    const yaw = this.camYaw, p = this.camPitch;
    const tgt = new THREE.Vector3(s.pos.x, s.pos.y + h, s.pos.z);
    // shoulder offset
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    tgt.addScaledVector(right, 0.55 + az * 0.12);
    const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)).multiplyScalar(back);
    // pull the camera in front of walls / under-eave clipping
    let tFree = 1;
    for (let t = 0.25; t <= 1.001; t += 0.125) {
      const x = tgt.x + off.x * t, z = tgt.z + off.z * t;
      if (this.G.nav.blocked(x, z, 0.6) && !isWater(x, z)) { tFree = Math.max(0.2, t - 0.125); break; }
    }
    const cam = tgt.clone().addScaledVector(off, tFree);
    const gy = groundAt(cam.x, cam.z) + 0.4; if (cam.y < gy) cam.y = gy;
    if (!this.camPos) this.camPos = cam.clone();
    this.camPos.lerp(cam, 1 - Math.exp(-dt * 14));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; this.camera.position.x += rr(-1, 1) * this.shake * 0.15; this.camera.position.y += rr(-1, 1) * this.shake * 0.15; }
    let look = tgt.clone();
    if (this.lockTarget) look.lerp(new THREE.Vector3(this.lockTarget.pos.x, this.lockTarget.pos.y + 1.3, this.lockTarget.pos.z), 0.35);
    this.camera.lookAt(look);
    this.focus.copy(s.pos);
  }

  updateOverseer(dt) {
    const k = this.keys; const sp = this.dist * 0.9 * dt * (k.ShiftLeft ? 2.5 : 1);
    let moved = false;
    if (k.KeyW || k.ArrowUp) { this.pan(0, sp); moved = true; }
    if (k.KeyS || k.ArrowDown) { this.pan(0, -sp); moved = true; }
    if (k.KeyA || k.ArrowLeft) { this.pan(-sp, 0); moved = true; }
    if (k.KeyD || k.ArrowRight) { this.pan(sp, 0); moved = true; }
    if (k.KeyQ) this.yawT += dt * 1.6; if (k.KeyE) this.yawT -= dt * 1.6;
    if (k.KeyZ || k.Equal || k.NumpadAdd) this.distTarget = clamp(this.distTarget * (1 - dt * 1.5), 4, 160); if (k.KeyX || k.Minus || k.NumpadSubtract) this.distTarget = clamp(this.distTarget * (1 + dt * 1.5), 4, 160);
    if (k.PageUp || k.KeyR) this.pitchT = clamp(this.pitchT + dt * 1.2, 0.18, 1.45); if (k.PageDown || k.KeyT) this.pitchT = clamp(this.pitchT - dt * 1.2, 0.18, 1.45);
    if (this.pad) { if (this.pad.yaw) this.yawT += this.pad.yaw * dt * 1.6; if (this.pad.pitch) this.pitchT = clamp(this.pitchT + this.pad.pitch * dt * 1.2, 0.18, 1.45); if (this.pad.zoom) this.distTarget = clamp(this.distTarget * (1 + this.pad.zoom * dt * 1.5), 4, 160); }
    if (moved) this.follow = false;
    const s = this.G.selected;
    if (this.follow && s && !s.dead) this.focusTarget.set(s.pos.x, s.pos.y, s.pos.z);
    this.focusTarget.y = Math.max(groundAt(this.focusTarget.x, this.focusTarget.z), -0.5) + 1.2;
    this.focus.lerp(this.focusTarget, 1 - Math.exp(-dt * 6));
    this.yaw = damp(this.yaw, this.yawT, 8, dt); this.pitch = damp(this.pitch, this.pitchT, 8, dt); this.dist = damp(this.dist, this.distTarget, 7, dt);
    const p = this.pitch;
    const cam = new THREE.Vector3(this.focus.x + Math.sin(this.yaw) * Math.cos(p) * this.dist, this.focus.y + Math.sin(p) * this.dist, this.focus.z + Math.cos(this.yaw) * Math.cos(p) * this.dist);
    const gy = groundAt(cam.x, cam.z) + 1.0; if (cam.y < gy) cam.y = gy;
    this.camera.position.copy(cam);
    this.camera.lookAt(this.focus);
  }

  updateTitle(dt) {
    this.titleT += dt * 0.03;
    const a = this.titleT;
    const c = new THREE.Vector3(Math.sin(a) * 70, 0, Math.cos(a) * 70 + 10);
    c.y = Math.max(heightAt(c.x, c.z), 0) + 22;
    this.camera.position.copy(c);
    this.camera.lookAt(0, 6, 0);
    this.focus.set(0, 2, 0);
  }

  update(dt) {
    if (this.mode === 'title') this.updateTitle(dt);
    else if (this.mode === 'warrior') this.updateWarrior(dt);
    else this.updateOverseer(dt);
  }
}
