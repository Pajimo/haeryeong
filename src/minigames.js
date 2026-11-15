// Hands-on minigames: fishing (낚시) at the river spots and janggu drumming (장구) anywhere,
// with real timing and skill. Rewards feed the simulation: fish to sell or cook, fame, tips and moods.
const FISH = [
  { k: 'crucian', name: 'Crucian carp', ko: '붕어', w: 30, val: 4, str: 0.6, size: [0.2, 0.6] },
  { k: 'carp', name: 'Carp', ko: '잉어', w: 24, val: 9, str: 1.0, size: [1, 4] },
  { k: 'sweetfish', name: 'Sweetfish', ko: '은어', w: 14, val: 10, str: 0.9, size: [0.1, 0.3], season: ['summer'], fast: true },
  { k: 'catfish', name: 'Catfish', ko: '메기', w: 10, val: 13, str: 1.4, size: [1, 6], night: true },
  { k: 'trout', name: 'Cherry trout', ko: '송어', w: 10, val: 14, str: 1.1, size: [0.8, 3], season: ['spring', 'winter'] },
  { k: 'eel', name: 'Freshwater eel', ko: '뱀장어', w: 7, val: 18, str: 1.3, size: [0.5, 2], night: true, fast: true },
  { k: 'mandarin', name: 'Mandarin fish', ko: '쏘가리', w: 6, val: 26, str: 1.6, size: [0.6, 3], season: ['spring', 'autumn'] },
  { k: 'goldcarp', name: 'Golden carp', ko: '황금잉어', w: 0.8, val: 220, str: 2.3, size: [5, 12], legend: true },
];
const RHYTHMS = {
  gutgeori: { name: 'Gutgeori', ko: '굿거리', bpm: 84, bars: ['K..D..K.DD.D', 'K..D..KK.D.D', 'B..D..K.DD.D', 'K.DD.DK..D.D'] },
  semachi: { name: 'Semachi', ko: '세마치', bpm: 100, bars: ['K..K.D..D', 'K..K.DD.D', 'B..K.D..D', 'K.KK.D.DD'] },
  hwimori: { name: 'Hwimori', ko: '휘모리', bpm: 120, bars: ['K.D.K.D.', 'K.DDK.D.', 'B.D.K.DD', 'KKD.KKD.'] },
};

export function createMinigamesSystem(G) {
  let el = null, cur = null, keys = {};
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function overlay(html) { el.innerHTML = html; el.classList.remove('hidden'); document.exitPointerLock?.(); }
  function close() { el.classList.add('hidden'); el.innerHTML = ''; if (cur?.sim) { cur.sim.missionLock = false; cur.sim.cancelAction(); cur.sim.char.setProp(null); } cur = null; }
  function hold(sim, anim, prop, look, label) {
    sim.cancelAction(); sim.missionLock = true; sim.char.setProp(prop);
    sim.action = { type: 'event', phase: 'do', anim, dur: 99999, t: 0, look, label };
  }

  // ---------------- Fishing ----------------
  function pickFish() {
    const se = G.env.season, night = G.env.nightBlend > 0.5;
    const pool = FISH.filter((f) => (!f.season || f.season.includes(se)) && (!f.night || night || Math.random() < 0.25));
    const tot = pool.reduce((a, f) => a + f.w, 0); let r = Math.random() * tot;
    for (const f of pool) { r -= f.w; if (r <= 0) return f; } return pool[0];
  }
  function fishing(sim, spot) {
    const sk = sim.skills.fishing || 0;
    hold(sim, 'fish', 'rod', spot ? [spot.x + Math.sin(spot.face || 0) * 4, spot.z + Math.cos(spot.face || 0) * 4] : null, 'Fishing');
    cur = { type: 'fish', sim, phase: 'cast', t: 0, wait: 2.5 + Math.random() * 6, tension: 0.3, prog: 0, sk, caught: 0 };
    overlay(`<div class="mg-head"><b>낚시 · Fishing</b><small>Space (or hold the button) — wait for the bite, then keep the line taut</small><button class="mg-x">✕</button></div>
      <div class="mg-water"><span class="mg-bob">◉</span><div class="mg-ripples"></div></div>
      <div class="mg-msg">The line goes out… wait for a bite.</div>
      <div class="mg-bars"><div class="mg-tension"><div class="zone"></div><i></i><label>Tension</label></div><div class="mg-prog"><i></i><label>Reeling in</label></div></div>
      <button class="mg-act">Hook / Reel (Space)</button>`);
    el.querySelector('.mg-x').onclick = close;
    const act = el.querySelector('.mg-act');
    act.onpointerdown = () => press(true); act.onpointerup = act.onpointerleave = () => press(false);
  }
  function fishTick(dt) {
    const c = cur, q = (s) => el.querySelector(s);
    c.t += dt;
    const bob = q('.mg-bob'), msg = q('.mg-msg');
    if (c.phase === 'cast') {
      bob.style.transform = `translateY(${Math.sin(c.t * 2) * 2}px)`;
      if (c.t > c.wait) { c.phase = 'bite'; c.t = 0; c.fish = pickFish(); msg.textContent = '❗ A BITE! Strike now!'; msg.className = 'mg-msg hot'; G.audio?.tell?.(c.sim.pos, false); }
      else if (Math.random() < dt * 0.6) bob.style.transform = 'translateY(4px)'; // nibbles
    } else if (c.phase === 'bite') {
      bob.style.transform = `translateY(${8 + Math.sin(c.t * 40) * 3}px)`;
      if (c.t > 0.75 + c.sk * 0.04) { c.phase = 'miss'; c.t = 0; msg.textContent = 'Too slow — it stole the bait.'; msg.className = 'mg-msg'; }
    } else if (c.phase === 'reel') {
      const f = c.fish, zone = 0.22 + c.sk * 0.018; const lo = 0.5 - zone / 2, hi = 0.5 + zone / 2;
      // the fish runs in bursts; holding the line raises tension and reels it in
      c.run = (c.run ?? 0) - dt; if (c.run <= 0) { c.run = 0.4 + Math.random() * (f.fast ? 0.6 : 1.4); c.pull = (Math.random() * 0.9 + 0.2) * f.str; }
      c.tension += ((keys.space ? 0.85 : -0.7) + c.pull * (keys.space ? 0.55 : 0.25)) * dt;
      c.tension = Math.max(0, Math.min(1.05, c.tension));
      if (c.tension >= lo && c.tension <= hi) c.prog += dt * (0.16 + c.sk * 0.012) / Math.sqrt(f.str);
      else if (c.tension < lo) c.prog -= dt * 0.05;
      c.prog = Math.max(0, c.prog);
      q('.mg-tension .zone').style.cssText = `left:${lo * 100}%;width:${zone * 100}%`;
      q('.mg-tension i').style.left = `${c.tension * 100}%`;
      q('.mg-prog i').style.width = `${Math.min(100, c.prog * 100)}%`;
      bob.style.transform = `translate(${Math.sin(c.t * 6) * 18 * c.pull}px, ${10 + Math.sin(c.t * 11) * 3}px)`;
      if (c.tension >= 1.04) { c.phase = 'miss'; c.t = 0; msg.textContent = '💥 SNAP! The line broke.'; msg.className = 'mg-msg bad'; G.audio?.clash?.(c.sim.pos, false); }
      else if (c.t > 4 && c.prog <= 0 && c.tension < lo) { c.phase = 'miss'; c.t = 0; msg.textContent = 'The line went slack — it slipped the hook.'; msg.className = 'mg-msg'; }
      else if (c.prog >= 1) land(c);
    } else if (c.phase === 'miss' || c.phase === 'landed') {
      if (c.t > 2.2) { c.phase = 'cast'; c.t = 0; c.wait = 2.5 + Math.random() * 6; c.tension = 0.3; c.prog = 0; msg.textContent = 'The line goes out again… wait for a bite.'; msg.className = 'mg-msg'; }
    }
  }
  function land(c) {
    const f = c.fish, s = c.sim; const kg = +(f.size[0] + Math.random() * (f.size[1] - f.size[0])).toFixed(1);
    s.inv = s.inv || {}; s.inv['fish_' + f.k] = (s.inv['fish_' + f.k] || 0) + 1;
    s.skills.fishing = Math.min(10, (s.skills.fishing || 0) + (f.legend ? 1 : 0.15)); s.needs.fun = Math.min(100, s.needs.fun + 6);
    c.phase = 'landed'; c.t = 0; c.caught++;
    const msg = el.querySelector('.mg-msg'); msg.innerHTML = `🐟 ${f.legend ? '<b>LEGENDARY!</b> ' : ''}${esc(f.name)} <span class="ko">${f.ko}</span> — ${kg} kg`; msg.className = 'mg-msg good';
    G.audio?.ui?.();
    const best = (s.bestFish ||= {}); if (!best[f.k] || kg > best[f.k]) best[f.k] = kg;
    if (f.legend) { G.log(`✨ ${s.name.full} pulled a GOLDEN CARP from the river — ${kg} kg, glittering like a temple bell. Old fishermen weep at the sight.`, 'tournament', s.pos); G.systems.find((x) => x.id === 'missions')?.addFame?.(s, 'hunt', 15); s.addMoodlet('goldcarp', 'Caught the golden carp!', 30, 2880); }
    else if (kg >= f.size[1] * 0.9) G.log(`${s.name.full} landed a ${kg} kg ${f.name.toLowerCase()} — a beauty!`, 'story', s.pos);
  }

  // ---------------- Janggu ----------------
  function janggu(sim, rk = 'gutgeori') {
    const R = RHYTHMS[rk]; const beat = 60 / R.bpm / 3; // three pulses per beat
    const notes = []; let t = 2.0;
    const bars = [...R.bars, ...R.bars.slice().sort(() => Math.random() - 0.5)];
    for (const b of bars) for (const ch of b) { if (ch !== '.') notes.push({ t, k: ch, hit: false, judged: false }); t += beat; }
    hold(sim, 'drum', 'drum', null, 'Playing the janggu');
    cur = { type: 'drum', sim, notes, t: 0, end: t + 1.5, score: 0, combo: 0, best: 0, perfect: 0, good: 0, miss: 0, R, crowd: 0 };
    overlay(`<div class="mg-head"><b>장구 · Janggu — ${R.name} <span class="ko">${R.ko}</span></b><small><b>F</b> = kung (bass, left) · <b>J</b> = deok (crack, right) · both together for ●</small><button class="mg-x">✕</button></div>
      <div class="mg-lanes"><div class="lane l"><span>F 궁</span></div><div class="lane r"><span>J 덕</span></div><div class="hitline"></div><div class="notes"></div></div>
      <div class="mg-msg">Get ready…</div><div class="mg-score">0</div>
      <div class="mg-pads"><button data-pad="K">궁 F</button><button data-pad="D">덕 J</button></div>`);
    el.querySelector('.mg-x').onclick = close;
    el.querySelectorAll('[data-pad]').forEach((b) => (b.onpointerdown = () => drumHit(b.dataset.pad)));
  }
  function drumHit(side) {
    const c = cur; if (!c || c.type !== 'drum') return;
    G.audio?.drumHit?.(side === 'K' ? 'kung' : 'ta', 0.55);
    c.sim.char.animT += 0.3;
    // nearest unjudged note this side can satisfy
    let best = null, bd = 0.2;
    for (const n of c.notes) { if (n.judged) continue; const d = Math.abs(n.t - c.t); if (d < bd && (n.k === side || n.k === 'B')) { bd = d; best = n; } if (n.t > c.t + 0.3) break; }
    const msg = el.querySelector('.mg-msg');
    if (!best) { c.combo = 0; return; }
    if (best.k === 'B') { best.got = (best.got || '') + side; if (!(best.got.includes('K') && best.got.includes('D'))) return; }
    best.judged = true; best.hit = true;
    const grade = bd < 0.06 ? 'perfect' : bd < 0.13 ? 'good' : 'ok';
    c.combo++; c.best = Math.max(c.best, c.combo); c[grade === 'ok' ? 'good' : grade]++;
    c.score += (grade === 'perfect' ? 100 : grade === 'good' ? 60 : 30) * (1 + Math.min(c.combo, 30) / 30);
    msg.textContent = grade === 'perfect' ? `얼쑤! Perfect ×${c.combo}` : grade === 'good' ? `Good ×${c.combo}` : 'OK'; msg.className = 'mg-msg ' + (grade === 'perfect' ? 'good' : '');
  }
  function drumTick(dt) {
    const c = cur; c.t += dt;
    const box = el.querySelector('.notes'); const W = el.querySelector('.mg-lanes').clientWidth; const hitX = 60, speed = 260;
    let html = '';
    for (const n of c.notes) {
      if (!n.judged && c.t - n.t > 0.2) { n.judged = true; c.miss++; c.combo = 0; const m = el.querySelector('.mg-msg'); m.textContent = 'Miss'; m.className = 'mg-msg bad'; }
      const x = hitX + (n.t - c.t) * speed; if (x < -20 || x > W + 20 || n.hit) continue;
      html += n.k === 'B' ? `<i class="n b" style="left:${x}px"></i>` : `<i class="n ${n.k === 'K' ? 'k' : 'd'}" style="left:${x}px"></i>`;
    }
    box.innerHTML = html; el.querySelector('.mg-score').textContent = Math.round(c.score);
    // a crowd gathers for good playing
    if (c.combo > 8 && Math.random() < dt * 0.6) { const o = G.sims.find((x) => !x.dead && !x.hidden && !x.household && !x.action && x.pos.distanceTo(c.sim.pos) < 30); if (o) { c.crowd++; o.startAction({ type: 'event', dest: [c.sim.pos.x + (Math.random() - 0.5) * 6, c.sim.pos.z + 3 + Math.random() * 2], anim: () => (Math.random() < 0.02 ? 'cheer' : 'dance'), dur: 30, look: [c.sim.pos.x, c.sim.pos.z], adv: { fun: 1.5 }, label: 'Dancing to the janggu' }); } }
    if (c.t > c.end) finishDrum(c);
  }
  function finishDrum(c) {
    const total = c.notes.length, acc = (c.perfect + c.good * 0.6) / total;
    const s = c.sim; const grade = acc > 0.9 ? 'S' : acc > 0.75 ? 'A' : acc > 0.55 ? 'B' : acc > 0.35 ? 'C' : 'D';
    const festival = G.director?.active && /festival|music|banquet|kimjang/i.test(G.director.active.kind || '');
    const tips = Math.round((acc * 12 + c.crowd * 3) * (festival ? 2.5 : 1));
    s.earn(tips); s.needs.fun = 100; s.skills.music = Math.min(10, (s.skills.music || 0) + acc * 0.5);
    s.addMoodlet('drummed', `Played the janggu (${grade})`, grade === 'S' ? 18 : grade === 'A' ? 12 : 6, 600);
    if (acc > 0.75) G.systems.find((x) => x.id === 'missions')?.addFame?.(s, 'heart', grade === 'S' ? 6 : 3);
    if (grade === 'S' || grade === 'A') G.log(`${s.name.full} plays ${c.R.name.toLowerCase()} on the janggu ${grade === 'S' ? 'like a master of the court orchestra' : 'with fire'}. ${c.crowd ? c.crowd + ' villagers danced.' : ''}`, 'festival', s.pos);
    overlay(`<div class="mg-head"><b>장구 · ${esc(c.R.name)}</b><button class="mg-x">✕</button></div>
      <div class="mg-result"><div class="grade g${grade}">${grade}</div><div>Perfect ${c.perfect} · Good ${c.good} · Miss ${c.miss}<br>Best combo ${c.best} · Score ${Math.round(c.score)}<br>${c.crowd ? `${c.crowd} villagers danced · ` : ''}Tips: <b>${tips} nyang</b>${festival ? ' (festival crowd!)' : ''}</div></div>
      <div class="mg-pick">${Object.entries(RHYTHMS).map(([k, r]) => `<button data-r="${k}">Play ${r.name} <span class="ko">${r.ko}</span> · ${r.bpm} bpm</button>`).join('')}</div>`);
    el.querySelector('.mg-x').onclick = close;
    el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { const sim = c.sim; cur = null; janggu(sim, b.dataset.r); }));
    cur = { type: 'done', sim: s };
  }

  function press(down) {
    const c = cur; keys.space = down; if (!c || c.type !== 'fish' || !down) return;
    if (c.phase === 'bite') { c.phase = 'reel'; c.t = 0; c.tension = 0.45; c.prog = 0.05; const m = el.querySelector('.mg-msg'); m.textContent = `Hooked! Keep the needle in the green — ${c.fish.str > 1.5 ? 'it’s a fighter!' : 'reel it in.'}`; m.className = 'mg-msg hot'; }
    else if (c.phase === 'cast') { c.wait += 1.5; const m = el.querySelector('.mg-msg'); m.textContent = 'Too early — you spooked it. Patience…'; }
  }

  const S = {
    id: 'minigames',
    init() {
      el = document.createElement('div'); el.id = 'minigame'; el.className = 'hidden'; document.body.appendChild(el);
      // capture keys before the game's own controls while a minigame is open
      addEventListener('keydown', (e) => {
        if (!cur) return;
        if (e.code === 'Escape') { close(); e.stopImmediatePropagation(); return; }
        if (cur.type === 'fish' && e.code === 'Space') { if (!e.repeat) press(true); e.preventDefault(); e.stopImmediatePropagation(); }
        if (cur.type === 'drum' && (e.code === 'KeyF' || e.code === 'KeyJ')) { if (!e.repeat) drumHit(e.code === 'KeyF' ? 'K' : 'D'); e.preventDefault(); e.stopImmediatePropagation(); }
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyV', 'Tab', 'KeyE'].includes(e.code)) e.stopImmediatePropagation();
      }, true);
      addEventListener('keyup', (e) => { if (cur && e.code === 'Space') { press(false); e.stopImmediatePropagation(); } }, true);
      let last = performance.now();
      const loop = (now) => { requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!cur) return; if (cur.sim?.dead || cur.sim?.combat.target) return close(); if (cur.type === 'fish') fishTick(dt); else if (cur.type === 'drum') drumTick(dt); };
      requestAnimationFrame(loop);
      const P = G.economy?.prices; if (P) for (const f of FISH) P['fish_' + f.k] ??= f.val;
    },
    get active() { return !!cur; },
    fishing, janggu, close,
    objMenuItems(me, o) {
      if (!me.household) return [];
      const out = [];
      if (o.kind === 'fish' || o.kind === 'fishWork') out.push({ label: '🎣 Fish it yourself (minigame)', fn: () => { me.cancelAction(); me.pos.set(o.x, me.pos.y, o.z); if (o.look) me.heading = Math.atan2(o.look[0] - o.x, o.look[1] - o.z); fishing(me, o); } });
      if (o.kind === 'shop' || o.kind === 'stallWork') {
        const fish = Object.keys(me.inv || {}).filter((k) => k.startsWith('fish_') && me.inv[k] > 0);
        if (fish.length) { const P = G.economy.prices; const tot = fish.reduce((a, k) => a + (P[k] || 5) * me.inv[k], 0); out.push({ label: `🐟 Sell the catch (${fish.reduce((a, k) => a + me.inv[k], 0)} fish) — ${tot} nyang`, fn: () => { for (const k of fish) me.inv[k] = 0; me.earn(tot); G.ui.toast(`Sold the catch for ${tot} nyang.`); } }); }
      }
      if ((o.kind === 'cookpot' || o.kind === 'campfire') && Object.keys(me.inv || {}).some((k) => k.startsWith('fish_') && me.inv[k] > 0)) out.push({ label: '🐟 Grill fish for the family', fn: () => {
        const k = Object.keys(me.inv).find((x) => x.startsWith('fish_') && me.inv[x] > 0); me.inv[k]--;
        for (const s of G.household) if (!s.dead && s.pos.distanceTo(me.pos) < 30) { s.needs.hunger = Math.min(100, s.needs.hunger + 45); s.addMoodlet('grilledfish', 'Grilled river fish', 7, 480); }
      } });
      return out;
    },
    simMenuItems(me, o) { return me === o && me.household ? [{ label: '🥁 Play the janggu', fn: () => janggu(me) }] : []; },
    panelHtml(s) {
      const b = s.bestFish; const fish = Object.keys(s.inv || {}).filter((k) => k.startsWith('fish_') && s.inv[k] > 0);
      if (!b && !fish.length && !s.skills.music) return '';
      return `<div class="facts">🎣 Fishing ${(s.skills.fishing || 0).toFixed(1)}${s.skills.music ? ` · 🥁 Music ${s.skills.music.toFixed(1)}` : ''}${fish.length ? '<br>' + fish.map((k) => `${s.inv[k]}× ${FISH.find((f) => 'fish_' + f.k === k)?.name.toLowerCase()}`).join(', ') : ''}${b ? `<br>Best: ${Object.entries(b).map(([k, kg]) => `${FISH.find((f) => f.k === k)?.name} ${kg}kg`).join(', ')}` : ''}</div>`;
    },
  };
  return S;
}
