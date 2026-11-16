import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { NEEDS, TRAITS, JOBS, hourName, FACTIONS } from './data.js';
import { GOODS, ITEMS } from './economy.js';
import { heightAt, WATER_LEVEL, ROADS, RIVER, LAYOUT, roadDist } from './terrain.js';
import { clamp } from './noise.js';
import { talkTopics } from './talk.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Renders small Sims-style portraits of characters
class Portraitist {
  constructor() {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setSize(128, 128); this.r.setPixelRatio(1);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404050, 1.6));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.2); key.position.set(1, 1.5, 2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa0c0ff, 1.2); rim.position.set(-2, 1, -1); this.scene.add(rim);
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.01, 10);
    this.cache = new Map();
  }
  get(sim) {
    if (this.cache.has(sim.id)) return this.cache.get(sim.id);
    const hm = sim.hitMesh; hm?.parent?.remove(hm);
    // portraits always use the full-detail sculpt, even for villagers far from the camera
    const lod = sim.char.lod; if (lod) sim.char.setLOD(0);
    const clone = SkeletonUtils.clone(sim.char.root);
    if (lod) sim.char.setLOD(lod);
    if (hm) sim.char.root.add(hm);
    clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.visible = true;
    clone.traverse((o) => { if (o.isBone && ['neck', 'head', 'spine', 'chest'].includes(o.name)) o.rotation.set(0, 0, 0); if (o.name === 'body') o.position.set(0, 0, 0); });
    const body = clone.children.find((c) => c.isGroup || c.type === 'Group'); if (body) { body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); }
    this.scene.add(clone); clone.updateMatrixWorld(true);
    const head = clone.getObjectByName('head');
    const hp = new THREE.Vector3(); head.getWorldPosition(hp); hp.y += 0.1 * sim.char.scale;
    this.cam.position.set(hp.x + 0.16, hp.y + 0.02, hp.z + 0.78); this.cam.lookAt(hp.x, hp.y - 0.03, hp.z);
    this.r.render(this.scene, this.cam);
    const url = this.r.domElement.toDataURL();
    this.scene.remove(clone);
    this.cache.set(sim.id, url);
    return url;
  }
}

export class UI {
  constructor(G, ai) {
    this.G = G; this.ai = ai; this.root = $('#ui');
    this.bubbles = new Map(); this.floaters = [];
    this.portraits = new Portraitist();
    this.panelT = 0; this.tab = 'needs';
    this.v = new THREE.Vector3();
    this.build();
  }

  build() {
    const R = this.root;
    R.innerHTML = `
      <div id="topbar" class="panel lacquer">
        <div class="clock"><div class="day" id="ui-day"></div><div class="hour" id="ui-hour"></div></div>
        <div class="speed" id="ui-speed">
          <button data-s="0" title="Pause (Space)">❚❚</button><button data-s="1" title="Normal (1)">▶</button><button data-s="3" title="Fast (2)">▶▶</button><button data-s="8" title="Ultra (3)">▶▶▶</button>
        </div>
        <div class="weather" id="ui-weather"></div>
      </div>
      <div id="modebar" class="panel lacquer">
        <button id="mode-ov" class="active" title="Overseer mode (V)">觀 Overseer</button><button id="mode-wa" title="Warrior mode (V)">劍 Warrior</button>
        <button id="btn-factions" class="iconbtn" title="Kingdom & factions (K)">⚑</button><button id="btn-save" title="Save">💾</button><button id="btn-help" title="Help (H)">?</button><button id="btn-settings" title="Settings">⚙</button>
      </div>
      <div id="household" class="panel lacquer"></div>
      <div id="event" class="hidden"></div>
      <div id="chronicle" class="panel hanji">
        <div class="ch-head"><span>年代記 Chronicle</span><div><button id="ch-annal" title="AI annal (needs API key)">✒</button><button id="ch-min">–</button></div></div>
        <div class="ch-list" id="ch-list"></div>
      </div>
      <div id="simpanel" class="panel hanji hidden"></div>
      <div id="minimap" class="panel lacquer"><canvas width="200" height="200"></canvas></div>
      <div id="combat" class="hidden">
        <div class="cb-bars"><div class="bar hp"><i></i></div><div class="bar ki"><i></i></div></div>
        <div class="cb-hint">WASD move · Mouse look (or drag) · LMB slash · RMB block (tap to parry) · R heavy · Space dodge · T lock · F standoff · B bow · E interact · X draw · V overseer</div>
      </div>
      <div id="target" class="hidden"><div class="tname"></div><div class="bar hp"><i></i></div></div>
      <div id="bubbles"></div>
      <div id="pie" class="hidden"></div>
      <div id="toast"></div>
      <div id="help" class="panel hanji hidden"></div>
      <div id="dialogue" class="panel hanji hidden"></div>
      <div id="settings" class="panel hanji hidden"></div>
      <div id="modal" class="panel hanji hidden"></div>
      <div id="marker"></div>`;
    $('#ui-speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const s = +b.dataset.s; if (s === 0) this.G.paused = true; else { this.G.paused = false; this.G.timeScale = s; } this.refreshSpeed(); });
    $('#mode-ov').onclick = () => this.G.player.mode !== 'overseer' && this.G.player.toggleMode('overseer');
    $('#mode-wa').onclick = () => this.G.player.mode !== 'warrior' && this.G.player.toggleMode('warrior');
    $('#btn-help').onclick = () => this.toggleHelp();
    $('#btn-settings').onclick = () => this.openSettings();
    $('#btn-factions').onclick = () => this.openKingdom();
    $('#btn-save').onclick = () => this.G.save();
    $('#ch-min').onclick = () => this.toggleChronicle();
    $('#ch-annal').onclick = () => this.writeAnnal();
    $('#help').innerHTML = `
      <h2>How to live in Haeryeong · 해령</h2>
      <div class="cols"><div>
      <h3>覀 Overseer (Sims mode)</h3>
      <ul><li><b>Click</b> a household member (top-left portraits) to select.</li>
      <li><b>Click ground</b> to walk there, <b>Shift-click</b> to run, <b>Ctrl-click</b> to queue.</li>
      <li><b>Click a villager</b> for social actions: chat, flirt, insult, duel, or <i>Speak freely (AI)</i>.</li>
      <li><b>Click a family member</b> to talk to them, court your spouse or help them — <i>👤 Control</i> switches to them (or click their portrait, top-left).</li>
      <li><b>Click yourself</b> or press <b>☰ Options</b> in your panel for your own options: housing office, matchmaker, offices, family rites, “I’m stuck”.</li>
      <li><b>Click objects</b> — cook pots, wells, the jumak, training dummies, shrines — to use them.</li>
      <li><b>Trackpad:</b> two-finger swipe <b>sideways to turn</b>, <b>up/down to tilt</b> · <b>pinch to zoom</b> · click-drag to move the map · <b>⌥ Option-drag</b> to turn</li>
      <li><b>Mouse:</b> drag to move · right-drag to turn · wheel to zoom</li>
      <li><b>Keys:</b> WASD / arrows move · Q E turn · R T tilt · Z X or + − zoom · F follow · or use the <b>camera pad</b> by the map</li>
      <li>Space: pause · 1 2 3: speed · C: chronicle · G: spirit wind · K: kingdom · <b>P: photo mode</b></li></ul>
      </div><div>
      <h3>劍 Warrior (V)</h3>
      <ul><li>Take direct control of the selected household member.</li>
      <li>Move the camera by moving the mouse (or a two-finger swipe on a trackpad); <b>pinch</b> to pull the camera in or out</li>
      <li><b>LMB</b> slash (chain 3) · <b>R</b> heavy (breaks guards)</li>
      <li><b>Hold RMB</b> to block · <b>tap RMB</b> just before a hit to <b>parry</b></li>
      <li><b>Space</b> dodge · <b>T</b> lock-on · <b>X</b> draw/sheathe · <b>E</b> interact</li>
      <li>Attacking innocents makes you an outlaw — the guards will come.</li></ul>
      <h3>The living kingdom</h3>
      <h3>Life, kingdom &amp; legacy</h3>
      <ul><li><b>Life tab</b>: everyone ages — child → young → adult → elder. Married couples can <i>Try for a baby</i>; children grow up and inherit traits. When your last household member dies, the line continues through their heirs.</li>
      <li><b>⚑ Kingdom (K)</b>: join the Royal Court, Hwarang, Merchants' Guild, Temple — or the secret Black Lotus and the bandits — at their banner halls. Finish tasks to rise in rank. Click the King for an audience; marry the princess, take the Gwageo exam, or seize the throne.</li>
      <li><b>Animals</b>: click stray dogs and cats to adopt a pet, buy a Jindo puppy at the market, hunt deer and boar — and beware the tiger.</li>
      <li><b>Money &amp; status</b>: your wealth class (Destitute → Rich) shows under the mood. Trade rice, salt, silk, ginseng and celadon at the market — prices change daily. Buy a stall for daily income, borrow from the moneylender at the jumak, buy or rent out houses (🏠), renovate your home, or purchase a yangban title from the King.</li>
      <li><b>Jobs</b>: click any workplace (stalls, paddies, river, jumak, school, palace gate, temple, Podocheong) to change career.</li>
      <li><b>Police</b>: constables of the Podocheong patrol and arrest pickpockets, debtors and murderers. Join them to hunt bounties, or pay bail if you're caught.</li>
      <li><b>Horses</b>: buy one at the stable south-east of the plaza or tame a wild one in the silver grass. In warrior mode: <b>E</b> mount/dismount, <b>Shift</b> gallop, <b>H</b> whistle for your horse.</li>
      <li><b>Seasons</b>: spring blossoms, summer monsoon, autumn maples, winter snow — each lasting 4 days, each with its own festival (Lantern Festival, Dano, Chuseok, Seollal).</li>
      <li><b>💾</b> saves your dynasty (it also autosaves every dawn). Choose <i>Continue</i> on the title screen.</li></ul>
      <p>Every villager has needs, traits, a job, a home and relationships. They decide for themselves, fall in love, hold grudges, duel, marry and die. A storyteller stirs bandit raids, lantern festivals, tournaments and royal decrees. Follow the <b>spirit wind (G)</b> to whatever is happening.</p>
      </div></div><button class="close">Close</button>`;
    $('#help .close').onclick = () => this.toggleHelp();
    this.mm = $('#minimap canvas'); this.mmBase = this.renderMinimapBase();
    this.buildCamPad();
    this.mm.addEventListener('click', (e) => { const r = this.mm.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width - 0.5) * 1000, z = ((e.clientY - r.top) / r.height - 0.5) * 1000; const p = this.G.player; p.focusTarget.set(x, 0, z); p.follow = false; });
    this.refreshSpeed();
  }

  // ---------- Household ----------
  refreshHousehold() {
    const el = $('#household'); el.innerHTML = '<div class="hh-title">家 Household</div>';
    for (const s of this.G.household) {
      const b = h('button', 'hh-member' + (s === this.G.selected ? ' sel' : '') + (s.dead ? ' dead' : '') + (s.away ? ' away' : ''));
      b.innerHTML = `<img src="${this.portraits.get(s)}"><span>${esc(s.name.given)}</span><i class="moodring"></i>`;
      if (s.away) b.title = `${s.name.given} is away with the caravan`;
      b.onclick = () => { if (s.away) { this.toast(`${s.name.given} is away with the trade caravan.`); return; } this.G.select(s); this.G.player.follow = true; };
      b.dataset.id = s.id; el.appendChild(b);
    }
  }

  onSelect(s) { this.refreshHousehold(); this.renderPanel(true); }

  renderPanel(force) {
    const s = this.G.selected; const el = $('#simpanel');
    if (!s) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const [ml, mc] = s.moodLabel;
    const ownable = s.household;
    const tabs = ['needs', 'traits', 'people', 'life', 'path'];
    let body = '';
    if (this.tab === 'needs') {
      body = '<div class="needs">' + NEEDS.map((n) => {
        const v = s.needs[n.key]; const col = v > 60 ? '#7fbf5a' : v > 30 ? '#d9b44a' : '#d0503a';
        return `<div class="need ${v < 15 ? 'crit' : ''}" data-need="${n.key}" title="Click to fix ${n.en.toLowerCase()}"><label>${n.en} <em>${n.ko}</em></label><div class="nbar"><i style="width:${v}%;background:${col}"></i></div></div>`;
      }).join('') + '</div>';
      body += `<div class="moodlets">${s.moodlets.slice(0, 4).map((m) => `<span class="ml ${m.v >= 0 ? 'pos' : 'neg'}">${esc(m.label)} ${m.v > 0 ? '+' : ''}${Math.round(m.v)}</span>`).join('')}</div>`;
    } else if (this.tab === 'traits') {
      body = `<div class="traits">${s.traits.map((t) => `<span class="trait" style="border-color:${TRAITS[t]?.color}" title="${esc(TRAITS[t]?.desc || '')}">${t}</span>`).join('')}</div>`;
      body += '<div class="skills">' + Object.entries(s.skills).map(([k, v]) => `<div class="skill"><label>${k[0].toUpperCase() + k.slice(1)}</label><div class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.floor(v) ? 'on' : ''}"></i>`).join('')}</div></div>`).join('') + '</div>';
      { const inv = Object.entries(s.inv || {}).filter(([, n]) => n > 0); const owned = this.G.world.houses.filter((h) => h.owner === s.id); body += `<div class="facts">${inv.length ? '🎒 ' + inv.map(([k, n]) => `${n}× ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ') + '<br>' : ''}${owned.length ? '🏠 Owns ' + owned.length + ' house' + (owned.length > 1 ? 's' : '') + '<br>' : ''}${s.stall ? '🏪 Owns a market stall<br>' : ''}${s.horse && !s.horse.dead ? `🐎 Horse: ${esc(s.horse.petName)}<br>` : ''}${s.debt ? `💸 Debt: ${s.debt.amount} nyang, due day ${s.debt.due}<br>` : ''}</div>`; }
      body += this.G.systems.map((x) => { try { return x.panelHtml?.(s) || ''; } catch { return ''; } }).join('');
      body += `<div class="facts">❤ HP ${Math.round(s.hp)}/${s.maxHp} · 냥 ${Math.floor(s.coins)} nyang${s.spouse ? ` · Spouse: ${esc(s.spouse.name.given)}` : ''}${s.champion ? ' · 🏆 Champion' : ''}${s.outlaw ? ' · <b style="color:#e66">Outlaw</b>' : ''}</div>`;
    } else if (this.tab === 'life') {
      const G = this.G; const stage = { child: 3, young: 5, adult: 7, elder: 6 }[s.age];
      const nm = (o) => (o ? `<a data-id="${o.id}" class="lnk">${esc(o.name.full)}${o.dead ? ' †' : ''}</a>` : '—');
      body = `<div class="life">
        <div class="lrow"><b>Life stage</b> ${{ child: 'Child 아이', young: 'Young adult 청년', adult: 'Adult 장년', elder: 'Elder 노인' }[s.age]} <small>(${s.ageDays.toFixed(1)} / ${stage} days)</small></div>
        <div class="lbar2"><i style="width:${Math.min(100, s.ageDays / stage * 100)}%"></i></div>
        <div class="lrow"><b>Generation</b> ${s.generation} of the ${esc(s.name.surname)} line</div>
        <div class="lrow"><b>Parents</b> ${s.parents.length ? s.parents.map(nm).join(', ') : '—'}</div>
        <div class="lrow"><b>Spouse</b> ${nm(s.spouse)}</div>
        <div class="lrow"><b>Children</b> ${s.children.length ? s.children.map(nm).join(', ') : '—'}</div>
        ${s.pregnant ? `<div class="lrow preg">🤰 Expecting — ${Math.round(Math.min(1, s.pregnant.t / 2880) * 100)}% of the way</div>` : ''}
        <div class="lrow"><b>Pet</b> ${s.pet && !s.pet.dead ? `${esc(s.pet.petName)} the ${s.pet.def.name}` : '—'}</div>
        ${s.tigerSlayer ? '<div class="lrow">🐯 Tiger Slayer</div>' : ''}${s.royalConsort ? '<div class="lrow">👑 Royal consort</div>' : ''}
      </div>`;
    } else if (this.tab === 'path') {
      const F = this.G.factions; const FS = FACTIONS;
      const mine = Object.keys(s.factions);
      body = '<div class="path">' + (mine.length ? mine.map((fid) => { const m = s.factions[fid]; const t = s.tasks[fid]; const need = (m.rank + 1) * 60;
        return `<div class="fac" style="border-color:${FS[fid].color}"><div class="fh"><span class="fi" style="background:${FS[fid].color}">${FS[fid].icon}</span><b>${FS[fid].name}</b> <em>${FS[fid].ko}</em></div>
          <div class="fr">${esc(F.rankTitle(s, fid))}</div><div class="lbar2"><i style="width:${Math.min(100, m.rep / need * 100)}%;background:${FS[fid].color}"></i></div>
          ${s.household && t ? `<div class="ft">▸ ${esc(t.text)} <small>${Math.floor(Math.min(t.progress, t.goal))}/${t.goal}</small></div>` : ''}
          ${s.household ? `<div class="fb">${fid === 'temple' ? `<button data-donate="1">Donate 25</button>` : ''}<button data-leave="${fid}">Leave</button></div>` : ''}</div>`; }).join('') : '<p class="empty">Sworn to no one. Open ⚑ Kingdom to see who you could join.</p>') + '</div>';
      if (s.job === 'king' && s.household) body += `<div class="decrees"><b>Royal Decrees</b>${[['lowerTax', 'Lower taxes'], ['raiseTax', 'Raise taxes'], ['festival', 'Declare a festival'], ['tournament', 'Hold a tournament'], ['hunt', 'March on the bandits'], ['amnesty', 'Grant amnesty']].map(([k, l]) => `<button data-decree="${k}">${l}</button>`).join('')}</div>`;
    } else {
      const rels = [...s.rel.entries()].map(([id, r]) => [this.G.sims.find((x) => x.id === id), r]).filter(([o, r]) => o && r.met).sort((a, b) => Math.abs(b[1].f) + b[1].r - Math.abs(a[1].f) - a[1].r).slice(0, 8);
      body = '<div class="rels">' + (rels.map(([o, r]) => { const [lab, col] = s.relLabel(o); return `<div class="rel" data-id="${o.id}"><img src="${this.portraits.get(o)}"><div><b>${esc(o.name.full)}</b><small style="color:${col}">${lab}${o.dead ? ' † ' : ''}</small><div class="rbar"><i style="left:50%;width:${Math.abs(r.f) / 2}%;${r.f < 0 ? 'transform:translateX(-100%);background:#c04a3a' : 'background:#7fbf5a'}"></i>${r.r > 5 ? `<i class="rom" style="width:${r.r}%"></i>` : ''}</div></div></div>`; }).join('') || '<p class="empty">No one yet.</p>') + '</div>';
    }
    const queue = [s.action ? (s.currentLabel || s.action.type) : 'Idle', ...s.queue.map((q) => q.label || q.type)];
    el.innerHTML = `
      <div class="sp-head">
        <img class="portrait" src="${this.portraits.get(s)}">
        <div class="sp-names"><div class="hangul">${s.name.hangul}</div><div class="roman">${esc(s.name.full)}</div>
        <div class="sub">${{ elder: 'Elder', young: 'Young', adult: 'Adult', child: 'Child' }[s.age]} ${s.sex === 'f' ? '♀' : '♂'} · ${JOBS[s.job].title} <em>${JOBS[s.job].ko}</em></div>
        <div class="mood" style="color:${mc}">● ${ml}</div>${(() => { const [wl, wc, wv] = this.G.economy.wealthClass(s); return `<div class="wealth" style="color:${wc}">◆ ${wl} · ${Math.floor(s.coins)} nyang${wv !== Math.floor(s.coins) ? ` (worth ${wv})` : ''}</div>`; })()}${s.jailed ? `<div class="jailed">⛓ In jail (${Math.max(0, Math.round((s.jailed.dur - s.jailed.t) / 60))}h left)${s.household ? ' <button id="bail">Pay bail (40)</button>' : ''}</div>` : s.outlaw ? `<div class="jailed">⚠ Wanted — bounty ${s.bounty || 0} nyang</div>` : ''}</div>
      </div>
      <div class="queue">${queue.map((q, i) => `<span class="q ${i ? '' : 'cur'}">${esc(q)}${ownable && i < 2 && (i || s.action) ? `<b data-q="${i}">✕</b>` : ''}</span>`).join('')}</div>
      <div class="tabs">${tabs.map((t) => `<button class="${t === this.tab ? 'on' : ''}" data-t="${t}">${{ needs: 'Needs', traits: 'Self', people: 'People', life: 'Life', path: 'Path' }[t]}</button>`).join('')}</div>
      <div class="sp-body">${body}</div>
      ${ownable ? `<div class="sp-actions"><label><input type="checkbox" id="fw" ${s.freeWill ? 'checked' : ''}> Free will</label><button id="prop">🏠</button><button id="opts" title="Your own options: housing office, matchmaker, offices, family…">☰ Options</button><button id="take">劍 Take control (V)</button></div>` : '<div class="sp-actions muted">Not of your household — click them with a household member selected to interact.</div>'}`;
    el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.renderPanel(); }));
    el.querySelectorAll('.queue b').forEach((b) => (b.onclick = () => { const i = +b.dataset.q; if (i === 0) s.cancelAction(); else s.queue.splice(i - 1, 1); this.renderPanel(); }));
    el.querySelectorAll('[data-leave]').forEach((b) => (b.onclick = () => { this.G.factions.leave(s, b.dataset.leave); this.renderPanel(); }));
    el.querySelectorAll('[data-donate]').forEach((b) => (b.onclick = () => { if (s.coins < 25) return this.toast('Not enough nyang.'); s.coins -= 25; s.needs.honor = Math.min(100, s.needs.honor + 10); this.G.factions.notify(s, { type: 'donate', amount: 25 }); this.toast('The monks bow in gratitude.'); this.renderPanel(); }));
    el.querySelectorAll('[data-decree]').forEach((b) => (b.onclick = () => { this.G.factions.decree(s, b.dataset.decree); this.renderPanel(); }));
    el.querySelectorAll('.lnk').forEach((a) => (a.onclick = () => { const o = this.G.sims.find((x) => x.id === +a.dataset.id); if (o) { this.G.player.focusTarget.copy(o.pos); this.G.player.follow = false; } }));
    el.querySelectorAll('.rel').forEach((r) => (r.onclick = () => { const o = this.G.sims.find((x) => x.id === +r.dataset.id); if (o) { this.G.player.focusTarget.copy(o.pos); this.G.player.follow = false; } }));
    const fw = $('#fw', el); if (fw) fw.onchange = () => (s.freeWill = fw.checked);
    if (ownable) el.querySelectorAll('[data-need]').forEach((b) => (b.onclick = () => this.fixNeed(s, b.dataset.need)));
    const tk = $('#take', el); if (tk) tk.onclick = () => this.G.player.toggleMode('warrior');
    const pr = $('#prop', el); if (pr) pr.onclick = () => this.openProperty(s);
    const op = $('#opts', el); if (op) op.onclick = () => this.openPie(innerWidth / 2, innerHeight / 2, this.G.player.selfMenu(s));
    const bl = $('#bail', el); if (bl) bl.onclick = () => { this.G.economy.payBail(s); this.renderPanel(); };
  }

  fixNeed(s, key) {
    const G = this.G; let best = null, bs = 0;
    for (const o of G.world.objects) {
      const d = o.def; if (!d || !d.adv || !(d.adv[key] > 0) || d.work || d.menuOnly) continue;
      if (o.users.size >= d.cap) continue; if (d.home && (!s.home || o.house !== s.home.id)) continue; if (d.camp && s.faction !== 'bandit') continue;
      if (d.cost && s.coins < d.cost) continue; if (d.available && !d.available(s, o)) continue; if (d.royal && s.job !== 'king') continue;
      const sc = d.adv[key] / (1 + Math.hypot(o.x - s.pos.x, o.z - s.pos.z) / 40); if (sc > bs) { bs = sc; best = o; }
    }
    if (!best) return this.toast('Nothing nearby can help with that right now.');
    G.player.command(s, { type: 'use', obj: best, label: best.def.label });
    this.toast(`${s.name.given} → ${best.title || best.def.label}`);
  }

  refreshSpeed() {
    const G = this.G;
    document.querySelectorAll('#ui-speed button').forEach((b) => b.classList.toggle('on', G.paused ? b.dataset.s === '0' : +b.dataset.s === G.timeScale));
  }
  setMode(m) {
    $('#mode-ov').classList.toggle('active', m === 'overseer'); $('#mode-wa').classList.toggle('active', m === 'warrior');
    $('#combat').classList.toggle('hidden', m !== 'warrior');
    document.body.classList.toggle('warrior', m === 'warrior');
  }
  toggleHelp() { $('#help').classList.toggle('hidden'); }
  toggleChronicle() { $('#chronicle').classList.toggle('min'); this.unread = 0; $('#ch-min').textContent = '–'; }

  // ---------- Chronicle ----------
  onChronicle(e) {
    const list = $('#ch-list'); if (!list) return;
    const icon = { danger: '⚔', combat: '⚔', duel: '⚔', death: '✝', festival: '🏮', tournament: '🏆', love: '❀', story: '◈', decree: '📜', omen: '☯', info: '·' }[e.kind] || '·';
    const row = h('div', 'ch-row k-' + e.kind, `<span class="ic">${icon}</span><div><small>Day ${e.day} · ${e.time}</small><p>${esc(e.text)}</p></div>`);
    if (e.pos) { row.classList.add('link'); row.onclick = () => { const p = this.G.player; p.focusTarget.set(e.pos[0], 0, e.pos[1]); p.follow = false; if (p.mode === 'overseer') p.distTarget = Math.min(p.distTarget, 40); }; }
    list.prepend(row);
    while (list.children.length > 80) list.lastChild.remove();
    const G = this.G; const fam = G.household || [];
    const mine = fam.some((h) => e.text.includes(h.name.full) || e.text.includes(h.name.given + ' '));
    const near = e.pos && G.player && Math.hypot(e.pos[0] - G.player.focus.x, e.pos[1] - G.player.focus.z) < 60;
    const big = ['festival', 'tournament', 'decree'].includes(e.kind) || /war|raid|King|Long live|realm|siege|Spring arrives|Summer settles|Autumn paints|Winter descends/i.test(e.text);
    if (['danger', 'festival', 'tournament', 'love', 'death', 'duel', 'decree', 'story'].includes(e.kind) && (mine || big || (near && e.kind !== 'story'))) this.toast(e.text, e.kind);
    else if ($('#chronicle').classList.contains('min')) { this.unread = (this.unread || 0) + 1; $('#ch-min').textContent = `– ${this.unread}`; }
  }
  async writeAnnal() {
    if (!this.ai.enabled) { this.openSettings(); this.toast('Add a Claude API key in settings to have the royal historian write annals.'); return; }
    this.toast('The historian dips his brush…');
    try { const t = await this.ai.annals(this.G); this.G.log('📜 Annal: ' + t, 'decree'); } catch (err) { this.toast('The historian is silent: ' + (err?.message || err)); }
  }

  setEvent(ev) {
    const el = $('#event');
    if (!ev) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="ev-ko">${ev.ko}</div><div class="ev-en">${ev.title}</div><div class="ev-hint">Press <b>G</b> — follow the spirit wind</div>`;
  }

  toast(msg, kind = 'info') {
    const t = h('div', 'toast k-' + kind, esc(msg)); $('#toast').appendChild(t);
    setTimeout(() => t.classList.add('out'), 4500); setTimeout(() => t.remove(), 5200);
    while ($('#toast').children.length > 4) $('#toast').firstChild.remove();
  }

  // ---------- Speech bubbles ----------
  bubble(sim, text, kind = 'talk', dur = 3.5) {
    let b = this.bubbles.get(sim.id);
    if (!b) { b = { el: h('div', 'bubble'), sim }; $('#bubbles').appendChild(b.el); this.bubbles.set(sim.id, b); }
    b.el.className = 'bubble k-' + kind; b.el.textContent = text; b.t = dur; b.el.style.opacity = 1;
  }
  floatText(sim, text, color) {
    const el = h('div', 'floater', esc(text)); el.style.color = color; $('#bubbles').appendChild(el);
    this.floaters.push({ el, sim, t: 0, off: (Math.random() - 0.5) * 40 });
  }
  onSocial() {}

  marker(dest) {
    if (!dest) return; this.markerPos = new THREE.Vector3(dest[0], heightAt(dest[0], dest[1]), dest[1]); this.markerT = 1.2;
  }

  // ---------- Pie menu ----------
  openPie(x, y, menu) {
    const el = $('#pie'); el.classList.remove('hidden');
    el.innerHTML = `<div class="pie-title"><b>${esc(menu.title)}</b><small>${esc(menu.sub || '')}</small></div>`;
    const n = menu.items.length; const R = Math.max(110, 22 * n);
    menu.items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const b = h('button', 'pie-item' + (it.danger ? ' danger' : '') + (it.ai ? ' ai' : '') + (it.disabled ? ' disabled' : ''), esc(it.label));
      b.style.left = Math.cos(a) * R + 'px'; b.style.top = Math.sin(a) * R * 0.8 + 'px';
      b.onclick = (e) => { e.stopPropagation(); if (it.disabled) return; this.closePie(); it.fn(); };
      el.appendChild(b);
    });
    // keep the whole ring (and its longest labels) on screen
    const wide = Math.max(90, ...menu.items.map((it) => Math.min(220, String(it.label).length * 3.6)));
    const cx = clamp(x, R + wide, innerWidth - R - wide), cy = clamp(y, R * 0.8 + 40, innerHeight - R * 0.8 - 40);
    el.style.left = cx + 'px'; el.style.top = cy + 'px';
    setTimeout(() => (this.pieOpen = true), 0);
  }
  closePie() { $('#pie').classList.add('hidden'); this.pieOpen = false; }

  // ---------- AI Dialogue ----------
  openDialogue(me, npc) {
    const el = $('#dialogue'); el.classList.remove('hidden');
    document.exitPointerLock?.();
    const hist = []; const G = this.G; const topics = talkTopics(G, me, npc); const used = new Set();
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    // bring them together
    if (me.pos.distanceTo(npc.pos) > 3 && !me.controlled) { me.queue = []; me.cancelAction(); me.startAction({ type: 'goto', dest: [npc.pos.x + 1.2, npc.pos.z], label: `Approaching ${npc.name.given}` }); }
    if (!npc.controlled && !npc.combat.target) { npc.cancelAction(); npc.startAction({ type: 'event', phase: 'do', anim: 'talk', dur: 9999, look: [me.pos.x, me.pos.z], label: `Speaking with ${me.name.given}` }); npc.action.until = () => el.classList.contains('hidden'); }
    const render = () => {
      el.innerHTML = `<div class="dl-head"><img src="${this.portraits.get(npc)}"><div><b>${npc.name.hangul} · ${esc(npc.name.full)}</b><small>${esc(npc.title)} — ${npc.relLabel(me)[0]}</small></div><button class="close">✕</button></div>
      <div class="dl-log">${hist.map((m) => `<div class="msg ${m.me ? 'me' : ''}"><b>${esc(m.who)}</b> ${esc(m.text)}</div>`).join('') || `<p class="muted">${this.ai.enabled ? 'Pick a topic, or say anything. They will answer as themselves, remembering their needs, mood, and the village’s recent events.' : 'Pick a topic. Their answers come from their own life: needs, memories, family and the news of the valley.'}</p>`}</div>
      <div class="dl-topics">${topics.filter((t) => !used.has(t.id)).map((t) => `<button data-topic="${t.id}">${esc(t.label)}</button>`).join('')}<button data-topic="bye">Farewell</button></div>
      ${this.ai.enabled ? `<form class="dl-input"><input placeholder="Or speak freely as ${esc(me.name.given)}…" maxlength="240"><button>Say</button></form>` : '<p class="dl-tip">Tip: add a Claude API key in ⚙ Settings to speak freely in your own words.</p>'}`;
      $('.close', el).onclick = () => { el.classList.add('hidden'); };
      el.querySelectorAll('[data-topic]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.topic;
        if (id === 'bye') { npc.say(pick(['Go well.', 'Until next time.', 'Safe travels!', '살펴 가세요.']), 'talk', 3); el.classList.add('hidden'); return; }
        const t = topics.find((x) => x.id === id); if (!t) return; used.add(id);
        hist.push({ who: me.name.given, text: t.label.replace(/^\S+ (?=[A-Z])/u, ''), me: true });
        const r = t.reply(); npc.changeRel(me, r.att || 0);
        hist.push({ who: npc.name.given, text: r.text + (r.note ? ` (${r.note})` : '') });
        npc.say(r.text.slice(0, 140), r.att > 3 ? 'happy' : r.att < 0 ? 'angry' : 'talk', 6); npc.char.setAnim(r.att > 4 ? 'laugh' : 'talk');
        me.needs.social = Math.min(100, me.needs.social + 4);
        render(); const lg = $('.dl-log', el); lg.scrollTop = 1e9;
      }));
      const form = $('form', el); const inp = $('input', el); if (!form) return; inp.focus();
      form.onsubmit = async (e) => {
        e.preventDefault(); const text = inp.value.trim(); if (!text) return;
        hist.push({ who: me.name.given, text, me: true }); me.say(text, 'talk', 4); render();
        const log = $('.dl-log', el); log.scrollTop = 1e9;
        let reply, att = 0;
        if (this.ai.enabled) {
          try { const r = await this.ai.converse(G, me, npc, hist.slice(0, -1).map((x) => ({ who: x.who, text: x.text })), text); reply = r.reply; att = r.attitude; }
          catch (err) { reply = '*seems distracted* …'; this.toast('AI error: ' + (err?.message || err)); }
        } else {
          const r = npc.getRel(me).f; reply = r > 30 ? 'Ha, you always know what to say, friend.' : r < -20 ? 'Hmph. Say what you want and be gone.' : 'I see… Is that so?';
          att = 1;
        }
        npc.changeRel(me, att); hist.push({ who: npc.name.given, text: reply }); npc.say(reply.replace(/\*[^*]+\*/g, '').slice(0, 140) || reply, att < -3 ? 'angry' : att > 3 ? 'happy' : 'talk', 6);
        npc.char.setAnim(att < -3 ? 'angry' : att > 5 ? 'laugh' : 'talk');
        me.needs.social = Math.min(100, me.needs.social + 6); render(); $('.dl-log', el).scrollTop = 1e9;
      };
    };
    render();
  }

  addTopButton(label, title, fn) { const b = document.createElement('button'); b.textContent = label.split(' ')[0]; b.title = `${label.slice(label.indexOf(' ') + 1)} — ${title}`; b.setAttribute('aria-label', b.title); b.className = 'iconbtn'; b.onclick = fn; let dock = document.getElementById('dock'); if (!dock) { dock = document.createElement('div'); dock.id = 'dock'; dock.className = 'panel lacquer'; document.getElementById('ui').appendChild(dock); } dock.appendChild(b); return b; }

  modal(html) { const el = $('#modal'); el.classList.remove('hidden', 'recap'); el.innerHTML = html + '<button class="mclose">Close</button>'; $('.mclose', el).onclick = () => el.classList.add('hidden'); document.exitPointerLock?.(); return el; }

  openKingdom() {
    const G = this.G; const me = G.selected?.household ? G.selected : G.household[0];
    const k = G.king && !G.king.dead ? G.king : null;
    const rows = Object.entries(FACTIONS).map(([fid, F]) => {
      const mem = G.factions.members(fid); const lead = G.factions.leader(fid);
      const req = me ? G.factions.requirement(me, fid) : null; const isIn = me?.factions[fid];
      const known = !F.secret || isIn || me?.has('Cunning');
      return `<div class="kf" style="border-left-color:${F.color}"><div class="kfh"><span class="fi" style="background:${F.color}">${F.icon}</span><b>${known ? F.name : '??? (a whisper of a secret society)'}</b> <em>${known ? F.ko : ''}</em> <small>${known ? mem.length + ' members' : ''}</small></div>
        <p>${known ? F.desc : 'Some say a secret society meets at the old village shrine on the western road… at night.'}</p>
        ${known ? `<small>Leader: ${lead ? esc(lead.name.full) : '—'} · Ranks: ${F.ranks.join(' → ')}</small>` : ''}
        <div class="kfb">${isIn ? `<span class="badge">Member — ${esc(G.factions.rankTitle(me, fid))}</span>` : `<span class="req">${req ? esc(req) : 'You may join at their hall.'}</span>`}<button data-go="${fid}">Show hall</button></div></div>`;
    }).join('');
    const el = this.modal(`<h2>The Kingdom of Haeryeong · 해령국</h2>
      <div class="krow">${k ? `<img src="${this.portraits.get(k)}"><div><b>King ${esc(k.name.full)}</b> <em>${k.name.hangul}</em><br><small>${{ child: 'Child', young: 'Young', adult: 'In his prime', elder: 'Aged' }[k.age]} · Heir: ${esc(G.sims.find((s) => s.job === 'prince' && !s.dead)?.name.full || 'none named')}</small><br><small>Visit the throne in the palace and click the King to request an audience.</small></div>` : '<b>The throne stands empty.</b>'}</div>
      <h3>Factions</h3>${rows}`);
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const h = G.world.spots.halls[b.dataset.go]; G.player.focusTarget.set(h[0], 0, h[1]); G.player.follow = false; G.env.spiritWindTarget = { x: h[0], z: h[1] }; G.env.spiritWindTimer = 5; el.classList.add('hidden'); }));
  }

  openAudience(me) {
    const G = this.G; const k = G.king; if (!k || k.dead) return this.toast('There is no king.');
    const render = (reply) => {
      const opts = G.factions.audienceOptions(me);
      const el = this.modal(`<div class="aud"><img src="${this.portraits.get(k)}"><div><h2>Royal Audience · 알현</h2><small>His Majesty King ${esc(k.name.full)} regards ${esc(me.name.given)} — ${k.relLabel(me)[0]}</small>
        <p class="kreply">${esc(reply || `“Speak, ${me.name.given}. What brings you before the throne?”`)}</p></div></div>
        <div class="aopts">${opts.map((o) => `<button data-o="${o.id}" ${o.ok ? '' : 'disabled'}>${esc(o.label)}</button>`).join('')}<button data-ai="1">Speak freely (AI)</button></div>`);
      el.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => { me.char.setAnim('bow'); render(G.factions.audience(me, b.dataset.o)); }));
      $('[data-ai]', el).onclick = () => { el.classList.add('hidden'); this.openDialogue(me, k); };
    };
    render();
  }

  openMarket(me) {
    const E = this.G.economy;
    const render = () => {
      const el = this.modal(`<h2>Market Street · 장터</h2><p>${esc(me.name.given)} has <b>${Math.floor(me.coins)} nyang</b>. ${E.wealthClass(me)[0]}.</p>
        <h3>Goods for trade <small>— prices change every day; buy low, sell high</small></h3>
        <table class="mkt"><tr><th>Good</th><th>Today</th><th>Buy</th><th>Sell</th><th>Owned</th><th></th></tr>${Object.entries(GOODS).map(([k, g]) => { const p = E.prices[k]; const trend = p > g.base * 1.15 ? '▲' : p < g.base * 0.85 ? '▼' : '·'; return `<tr><td>${g.name} <em>${g.ko}</em></td><td>${trend} ${p}</td><td>${E.buyPrice(me, k)}</td><td>${E.sellPrice(me, k)}</td><td>${me.inv?.[k] || 0}</td><td><button data-b="${k}">Buy</button><button data-s="${k}" ${me.inv?.[k] ? '' : 'disabled'}>Sell</button><button data-sa="${k}" ${me.inv?.[k] ? '' : 'disabled'}>Sell all</button></td></tr>`; }).join('')}</table>
        <h3>For yourself</h3><div class="items">${ITEMS.map((it) => `<button data-i="${it.id}">${it.name} <em>${it.ko}</em><small>${it.price} nyang</small></button>`).join('')}</div>
        <h3>Business</h3><div class="items"><button data-stall="1" ${me.stall ? 'disabled' : ''}>Buy a market stall <small>200 nyang — earns income every day, more when you work it</small></button><button data-puppy="1">Jindo puppy <small>15 nyang</small></button></div>`);
      el.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { E.buyGood(me, b.dataset.b); render(); }));
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { E.sellGood(me, b.dataset.s); render(); }));
      el.querySelectorAll('[data-sa]').forEach((b) => (b.onclick = () => { E.sellGood(me, b.dataset.sa, 999); render(); }));
      el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { E.buyItem(me, b.dataset.i); render(); }));
      $('[data-stall]', el).onclick = () => { E.buyStall(me); render(); };
      $('[data-puppy]', el).onclick = () => { this.G.animals.buyPuppy(me); render(); };
    };
    render();
  }

  openProperty(me) {
    const E = this.G.economy; const G = this.G;
    const render = () => {
      const hs = G.world.houses.slice().sort((a, b) => (a.owner === me.id ? -1 : 0) - (b.owner === me.id ? -1 : 0) || E.houseValue(a) - E.houseValue(b));
      const el = this.modal(`<h2>Property · 집</h2><p>${esc(me.name.given)} has <b>${Math.floor(me.coins)} nyang</b> · net worth ${E.netWorth(me)}. Empty houses can be bought to live in or to rent to newcomers (rent paid daily).</p>
        <table class="mkt"><tr><th>House</th><th>Value</th><th>Status</th><th></th></tr>${hs.map((h) => { const occ = h.residents.filter((r) => !r.dead); const mine = h.owner === me.id; const owner = h.owner != null ? G.sims.find((x) => x.id === h.owner) : null;
          return `<tr class="${mine ? 'mine' : ''}"><td>${h.noble ? 'Tiled hanok 기와집' : 'Thatched house 초가집'} ${'★'.repeat(h.level || 0)}</td><td>${E.houseValue(h)}</td><td>${mine ? (h === me.home ? 'Your home' : 'Yours' + (occ.length ? ' — rented' : ' — empty')) : occ.length ? esc(occ[0].name.surname) + ' family' : 'For sale'}${owner && !mine ? '' : ''}</td><td>${!occ.length && !mine ? `<button data-buy="${h.id}">Buy & move in</button><button data-rent="${h.id}">Buy to rent</button>` : ''}${mine ? `<button data-ren="${h.id}">Renovate</button>${h !== me.home ? `<button data-sell="${h.id}">Sell</button><button data-move="${h.id}">Move in</button>` : ''}` : ''}<button data-see="${h.id}">👁</button></td></tr>`; }).join('')}</table>`);
      const hid = (b, k) => G.world.houses.find((h) => h.id === +b.dataset[k]);
      el.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => { E.buyHouse(me, hid(b, 'buy')); render(); }));
      el.querySelectorAll('[data-rent]').forEach((b) => (b.onclick = () => { E.buyHouse(me, hid(b, 'rent'), true); render(); }));
      el.querySelectorAll('[data-ren]').forEach((b) => (b.onclick = () => { E.renovate(me, hid(b, 'ren')); render(); }));
      el.querySelectorAll('[data-sell]').forEach((b) => (b.onclick = () => { E.sellHouse(me, hid(b, 'sell')); render(); }));
      el.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => { const h = hid(b, 'move'); if (h.residents.some((r) => !r.dead && !G.household.includes(r))) return this.toast('Tenants live there.'); h.owner = null; me.coins += E.houseValue(h); E.buyHouse(me, h); render(); }));
      el.querySelectorAll('[data-see]').forEach((b) => (b.onclick = () => { const h = hid(b, 'see'); G.player.focusTarget.set(h.x, 0, h.z); G.player.follow = false; el.classList.add('hidden'); }));
    };
    render();
  }

  openStable(me) {
    const G = this.G; const A = G.animals;
    const render = () => {
      const sale = A.list.filter((a) => a.type === 'horse' && a.forSale && !a.dead);
      const el = this.modal(`<h2>Stable · 마구간</h2><p>Korean ponies, sure-footed in the mountains. ${me.horse && !me.horse.dead ? `Your horse: <b>${esc(me.horse.petName)}</b>. Press <b>H</b> in warrior mode to whistle for it, <b>E</b> to mount or dismount.` : 'You have no horse.'}</p>
        <div class="items">${sale.map((h) => `<button data-h="${h.id}">${['Chestnut', 'Bay', 'Grey', 'Black', 'White', 'Dun'][h.variant % 6]} horse <small>${h.forSale} nyang</small></button>`).join('') || '<p class="muted">No horses for sale today. Wild horses roam the silver-grass fields to the south-east — try to tame one.</p>'}</div>`);
      el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { A.buyHorse(me, A.list.find((a) => a.id === +b.dataset.h)); render(); }));
    };
    render();
  }

  openPolice(me) {
    const G = this.G; const E = G.economy;
    const render = () => {
      const wanted = G.sims.filter((s) => s.outlaw && !s.dead && s.faction !== 'bandit');
      const jailed = G.sims.filter((s) => s.jailed && !s.dead);
      const el = this.modal(`<h2>Podocheong · 포도청</h2><p>The police bureau keeps the peace: constables patrol the village, chase thieves and murderers, and throw them into the jail cage.</p>
        <h3>Wanted 수배</h3>${wanted.length ? wanted.map((w) => `<div class="wrow"><img src="${this.portraits.get(w)}"><b>${esc(w.name.full)}</b> — bounty ${w.bounty || 0} nyang ${me.job === 'police' ? `<button data-go="${w.id}">Hunt</button>` : ''}</div>`).join('') : '<p class="muted">No one is wanted. The village sleeps soundly.</p>'}
        <h3>In the cage</h3>${jailed.length ? jailed.map((w) => `<div class="wrow"><b>${esc(w.name.full)}</b> — ${Math.max(0, Math.round((w.jailed.dur - w.jailed.t) / 60))}h left ${G.household.includes(w) ? `<button data-bail="${w.id}">Pay bail (40)</button>` : ''}</div>`).join('') : '<p class="muted">The cage is empty.</p>'}
        <div class="items">${me.job === 'police' ? '<p>You serve as a constable. Patrol to earn wages; arrest outlaws (click them → Arrest) for half their bounty.</p>' : `<button data-join="1">Join as a constable <small>${E.jobRequirement(me, 'police') || 'salary 11 nyang/hour on patrol'}</small></button>`}${me.outlaw ? `<button data-surr="1">Turn yourself in</button>` : ''}</div>`);
      el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const w = G.sims.find((x) => x.id === +b.dataset.go); me.startFight(w, true); me.arresting = w; el.classList.add('hidden'); }));
      el.querySelectorAll('[data-bail]').forEach((b) => (b.onclick = () => { E.payBail(G.sims.find((x) => x.id === +b.dataset.bail)); render(); }));
      const j = $('[data-join]', el); if (j) j.onclick = () => { E.changeJob(me, 'police'); render(); };
      const su = $('[data-surr]', el); if (su) su.onclick = () => { me.bounty = Math.round((me.bounty || 20) * 0.5); E.jail(me, null); el.classList.add('hidden'); };
    };
    render();
  }

  openLender(me) {
    const E = this.G.economy;
    const el = this.modal(`<h2>The Moneylender · 사채업자</h2><p>A thin man with a jade abacus. “Coin now, coin later — with a little extra for my trouble.”</p>
      ${me.debt ? `<p>You owe <b>${me.debt.amount} nyang</b>, due on day ${me.debt.due}. Default, and the constables will come.</p><div class="items"><button data-pay="1">Repay ${me.debt.amount}</button></div>` : `<div class="items"><button data-l="50">Borrow 50 <small>repay 65 in 3 days</small></button><button data-l="100">Borrow 100 <small>repay 130</small></button><button data-l="300">Borrow 300 <small>repay 390</small></button></div>`}`);
    el.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { E.borrow(me, +b.dataset.l); el.classList.add('hidden'); }));
    const p = $('[data-pay]', el); if (p) p.onclick = () => { E.repay(me); el.classList.add('hidden'); };
  }

  openLegacyPicker() {
    const G = this.G;
    const fams = G.world.houses.filter((h) => h.residents.some((s) => !s.dead)).slice(0, 18);
    const el = this.modal(`<h2>Choose a family to continue</h2><p>Your line has ended, but Haeryeong lives on. Whose story will you follow?</p><div class="fams">${fams.map((h) => { const r = h.residents.filter((s) => !s.dead); return `<button class="famb" data-h="${h.id}"><b>${esc(r[0].name.surname)} family</b><small>${r.map((s) => esc(s.name.given) + ' (' + JOBS[s.job].title + ')').join(', ')}</small></button>`; }).join('')}</div>`);
    el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { const h = fams.find((x) => x.id === +b.dataset.h); G.adoptHousehold(h.residents.find((s) => !s.dead)); el.classList.add('hidden'); }));
  }

  openSettings() {
    const el = $('#settings'); el.classList.toggle('hidden');
    el.innerHTML = `<h2>Settings · 설정</h2>
      <label>Claude API key <small>(optional — enables “Speak freely” AI dialogue and the royal annals. Stored only in this browser.)</small><input id="st-key" type="password" placeholder="sk-ant-…" value="${esc(this.ai.key)}"></label>
      <label>Model <small>(claude-haiku-5-5 is the cheapest and fastest; claude-sonnet-5-5 or claude-opus-5-5 write richer replies but cost more per message)</small><input id="st-model" value="${esc(this.ai.model)}"></label>
      <label>Frame rate <small>(lower is quieter and cooler; 60 is smooth, 30 is fine for village life)</small><select id="st-fps"><option value="30">30 fps — quiet</option><option value="60">60 fps — smooth (default)</option><option value="0">Unlimited — as fast as the screen allows</option></select></label>
      <label class="chk"><input type="checkbox" id="st-saver"> Battery saver <small>(30 fps, lower resolution, shadows refreshed less often — best on a laptop)</small></label>
      <label>Graphics <small>(Automatic watches how hard your machine is working and keeps the picture as rich as it can run smoothly)</small><select id="st-quality"><option value="auto">Automatic (recommended)</option><option value="0">Full — every shadow and bloom</option><option value="1">High</option><option value="2">Balanced</option><option value="3">Smooth — fewer effects, longer view</option><option value="4">Bare — for older machines</option></select></label>
      <div class="small" id="st-perf" style="opacity:.7;margin:-4px 0 8px"></div>
      <label>Two-finger swipe on a trackpad <select id="st-swipe"><option value="rotate">turns and tilts the camera (pinch zooms)</option><option value="zoom">zooms in and out</option></select></label>
      <div class="row"><button id="st-save">Save</button><button id="st-close">Close</button></div>`;
    try { $('#st-swipe').value = localStorage.getItem('hr_swipe') || 'rotate'; } catch {}
    const PW = window.__power;
    if (PW) { $('#st-fps').value = String(PW.cap); $('#st-saver').checked = PW.saver;
      const applyPower = () => { PW.set(+$('#st-fps').value, $('#st-saver').checked); this.toast(PW.saver ? '🔋 Battery saver on.' : `Frame rate: ${+$('#st-fps').value || 'unlimited'}.`); };
      $('#st-fps').onchange = applyPower; $('#st-saver').onchange = applyPower; }
    $('#st-swipe').onchange = (e) => { try { localStorage.setItem('hr_swipe', e.target.value); } catch {} };
    const PF = this.G?.perf;
    if (PF) {
      $('#st-quality').value = PF.mode === 'auto' ? 'auto' : String(PF.tier);
      $('#st-quality').onchange = (e) => {
        const v = e.target.value;
        if (v === 'auto') { PF.setMode('auto'); this.toast('Graphics set automatically.'); }
        else { PF.setMode('manual', +v); this.toast(`Graphics: ${PF.t.name}.`); }
        showPerf();
      };
      const showPerf = () => {
        const el = $('#st-perf'); if (!el) return;
        const st = PF.status();
        el.textContent = st.frameMs == null ? `Now showing: ${st.name}.` : `Now showing: ${st.name} — ${st.frameMs} ms a frame (aiming under ${st.budgetMs} ms).`;
      };
      showPerf(); clearInterval(this._perfT); this._perfT = setInterval(() => { if (document.querySelector('#st-perf')) showPerf(); else clearInterval(this._perfT); }, 1000);
    }
    $('#st-save').onclick = () => { this.ai.setKey($('#st-key').value, $('#st-model').value); this.toast(this.ai.enabled ? 'AI voices enabled.' : 'AI voices disabled.'); el.classList.add('hidden'); };
    $('#st-close').onclick = () => el.classList.add('hidden');
  }

  // ---------- Camera pad: hold a button to turn, tilt or zoom; no trackpad gestures needed ----------
  buildCamPad() {
    const pad = document.createElement('div'); pad.id = 'campad'; pad.className = 'panel lacquer';
    pad.innerHTML = `<button data-k="yaw" data-v="1" title="Turn left (Q)">⟲</button><button data-k="pitch" data-v="1" title="Tilt down (R)">▲</button><button data-k="yaw" data-v="-1" title="Turn right (E)">⟳</button>
      <button data-k="zoom" data-v="-1" title="Zoom in (Z or +)">＋</button><button data-a="home" title="Back to my character (F)">◎</button><button data-k="zoom" data-v="1" title="Zoom out (X or −)">－</button>
      <button data-a="drag" title="Switch what dragging does">✋ Drag: move</button><button data-k="pitch" data-v="-1" title="Tilt up (T)">▼</button><button data-a="help" title="Camera controls">?</button>`;
    this.root.appendChild(pad);
    const P = () => this.G.player;
    const stop = () => { if (P()) P().pad = null; };
    pad.querySelectorAll('[data-k]').forEach((b) => {
      const go = (e) => { e.preventDefault(); const p = P(); if (!p) return; p.pad = { [b.dataset.k]: +b.dataset.v }; };
      b.addEventListener('pointerdown', go); b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
    });
    pad.querySelector('[data-a="home"]').onclick = () => { const p = P(), s = this.G.selected || this.G.household[0]; if (p && s) { this.G.select?.(s); p.follow = true; p.focusTarget.copy(s.pos); p.distTarget = Math.min(p.distTarget, 18); } };
    const dragBtn = pad.querySelector('[data-a="drag"]');
    dragBtn.onclick = () => { const p = P(); if (!p) return; p.dragRotates = !p.dragRotates; dragBtn.textContent = p.dragRotates ? '🔄 Drag: turn' : '✋ Drag: move'; this.toast(p.dragRotates ? 'Dragging now turns the camera. Tap again to drag the map instead.' : 'Dragging now moves the map.'); };
    pad.querySelector('[data-a="help"]').onclick = () => this.cameraTips(true);
    setTimeout(() => this.cameraTips(false), 9000);
  }
  cameraTips(force) {
    try { if (!force && localStorage.getItem('hr_camtips')) return; localStorage.setItem('hr_camtips', '1'); } catch {}
    this.toast('🎥 Camera: two-finger swipe to turn and tilt · pinch to zoom · drag to move the map · ⌥ Option-drag to turn · or hold the buttons on the camera pad by the map.', 'story');
  }

  // ---------- Minimap ----------
  renderMinimapBase() {
    const c = document.createElement('canvas'); c.width = c.height = 200; const g = c.getContext('2d'); const img = g.createImageData(200, 200);
    for (let j = 0; j < 200; j++) for (let i = 0; i < 200; i++) {
      const x = (i / 200 - 0.5) * 1000, z = (j / 200 - 0.5) * 1000; const hh = heightAt(x, z);
      let r, gg, b;
      if (hh < WATER_LEVEL) { r = 40; gg = 70; b = 80; }
      else { const t = clamp(hh / 120, 0, 1); r = 150 - t * 60; gg = 140 - t * 40; b = 100 - t * 30; if (roadDist(x, z) < 3) { r = 190; gg = 170; b = 130; } }
      const o = (j * 200 + i) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(40,30,25,0.8)';
    for (const hs of this.G.world.houses) g.fillRect(100 + hs.x / 5 - 1.5, 100 + hs.z / 5 - 1.5, 3, 3);
    return c;
  }
  drawMinimap() {
    const g = this.mm.getContext('2d'); g.drawImage(this.mmBase, 0, 0);
    for (const s of this.G.sims) {
      if (s.dead || s.hidden) continue;
      g.fillStyle = s.household ? '#ffd76a' : s.faction === 'bandit' ? '#ff4a3a' : s.job === 'soldier' || s.job === 'general' ? '#6aa0ff' : '#f2ece0';
      const r = s.household ? 2.6 : 1.4; g.beginPath(); g.arc(100 + s.pos.x / 5, 100 + s.pos.z / 5, r, 0, 7); g.fill();
    }
    const p = this.G.player; const cam = this.G.camera;
    const fx = 100 + p.focus.x / 5, fz = 100 + p.focus.z / 5;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir); const a = Math.atan2(dir.x, dir.z);
    g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(fx, fz); g.lineTo(fx + Math.sin(a - 0.5) * 14, fz + Math.cos(a - 0.5) * 14); g.moveTo(fx, fz); g.lineTo(fx + Math.sin(a + 0.5) * 14, fz + Math.cos(a + 0.5) * 14); g.stroke();
    const ev = this.G.director.active; if (ev?.pos) { g.strokeStyle = '#ff6a4a'; g.lineWidth = 2; g.beginPath(); g.arc(100 + ev.pos[0] / 5, 100 + ev.pos[1] / 5, 5 + Math.sin(performance.now() / 200) * 2, 0, 7); g.stroke(); }
  }

  // ---------- Per-frame ----------
  project(p, yoff) {
    this.v.set(p.x, p.y + yoff, p.z).project(this.G.camera);
    return { x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight, vis: this.v.z < 1 && this.v.z > -1 };
  }

  update(dt) {
    const G = this.G; const env = G.env;
    const [hEn, hKo] = hourName(env.hour);
    const se = G.seasons?.current; $('#ui-day').textContent = se ? `${se.icon} ${se.en} ${se.ko} · Day ${G.seasons.dayOfSeason}/4 · Year ${Math.floor((env.day - 1 + G.seasons.offset * 4) / 16) + 1}` : `Day ${env.day}`;
    $('#ui-hour').innerHTML = `<b>${hKo}</b> Hour of the ${hEn} · ${env.timeLabel}`;
    $('#ui-weather').textContent = { clear: '☀ Clear', cloudy: '☁ Cloudy', rain: '☂ Rain', mist: '〰 Mist', windy: '🍃 Windy', snow: '❄ Snow' }[env.weather] + (env.isNight ? ' · ☾' : '');
    // bubbles
    const cam = G.camera.position;
    for (const [id, b] of this.bubbles) {
      b.t -= dt;
      const s = b.sim; const d = cam.distanceTo(s.pos);
      if (b.t <= 0 || s.dead || s.hidden || d > 70) { b.el.remove(); this.bubbles.delete(id); continue; }
      const p = this.project(s.pos, 2.25 * s.char.scale + 0.1);
      b.el.style.display = p.vis ? 'block' : 'none';
      b.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${clamp(28 / d, 0.55, 1)})`;
      b.el.style.opacity = Math.min(1, b.t * 2);
    }
    for (const f of this.floaters) {
      f.t += dt; const p = this.project(f.sim.pos, 2.1 + f.t * 1.2);
      f.el.style.transform = `translate(${p.x + f.off}px, ${p.y}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.3 - f.t)})`; f.el.style.opacity = 1 - f.t / 1.1;
      if (f.t > 1.1) f.el.remove();
    }
    this.floaters = this.floaters.filter((f) => f.t <= 1.1);
    // Sims-style thought bubbles for nearby villagers
    this.thoughtT = (this.thoughtT ?? 3) - dt;
    if (this.thoughtT <= 0) {
      this.thoughtT = 2.5 + Math.random() * 3;
      const near = G.sims.filter((x) => !x.dead && !x.hidden && x.pos.distanceTo(cam) < 35 && !this.bubbles.has(x.id));
      const s = near[Math.floor(Math.random() * near.length)];
      if (s) {
        const ICON = { hunger: '🍚', energy: '💤', social: '💬', fun: '🎶', hygiene: '💧', honor: '🏯' };
        let low = null, lv = 101; for (const k in ICON) if (s.needs[k] < lv) { lv = s.needs[k]; low = k; }
        let icon = lv < 35 ? ICON[low] : null;
        const a = s.action?.type;
        if (!icon) icon = a === 'fight' ? '⚔' : a === 'converse' ? (s.getRel(s.action.partner || s).r > 30 ? '💕' : '💬') : s.pregnant ? '👶' : s.outlaw ? '😰' : s.mood > 30 ? ['😊', '🌸', '✨'][Math.floor(Math.random() * 3)] : s.mood < -20 ? ['😞', '🌧', '💢'][Math.floor(Math.random() * 3)] : s.coins > 400 ? '💰' : null;
        if (icon) this.bubble(s, icon, 'thought', 2.6);
      }
    }
    // marker
    const mk = $('#marker');
    if (this.markerT > 0) { this.markerT -= dt; const p = this.project(this.markerPos, 0.2); mk.style.display = 'block'; mk.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${1 + (1.2 - this.markerT)})`; mk.style.opacity = this.markerT; } else mk.style.display = 'none';
    // panels (throttled)
    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.3;
      if (G.selected && !$('#simpanel').matches(':hover')) this.renderPanel();
      document.querySelectorAll('.hh-member').forEach((b) => { const s = G.household.find((x) => x.id === +b.dataset.id); if (s) { b.querySelector('.moodring').style.background = s.moodLabel[1]; b.classList.toggle('sel', s === G.selected); b.title = `${s.name.full} — ${s.currentLabel}`; } });
      this.drawMinimap();
    }
    // combat HUD
    if (G.player.mode === 'warrior' && G.selected) {
      const s = G.selected;
      $('#combat .hp i').style.width = (s.hp / s.maxHp) * 100 + '%'; $('#combat .ki i').style.width = s.stamina + '%'; $('#combat .ki').classList.toggle('low', s.stamina < 22);
      const t = G.player.lockTarget || s.combat.target;
      const tel = $('#target');
      if (t && !t.dead) { tel.classList.remove('hidden'); $('.tname', tel).textContent = `${t.name.hangul} · ${t.name.full} — ${t.title}`; $('.hp i', tel).style.width = (t.hp / t.maxHp) * 100 + '%'; }
      else tel.classList.add('hidden');
    } else $('#target').classList.add('hidden');
  }
}
