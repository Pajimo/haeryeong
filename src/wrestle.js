// Ssireum (씨름): Korean belt wrestling. Grip the satba, keep your balance against the opponent's shoves
// (A / D or ← / →), and when their balance breaks, throw them (Space). Best of three falls.
// Challenge any fighter, or enter the Dano festival contest — the champion wins a bull (황소).
export function createWrestleSystem(G) {
  let el = null, m = null, keys = {};
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const str = (s) => 0.6 + (s.skills.sword || 0) * 0.06 + (s.age === 'elder' ? -0.25 : 0) + (s.has?.('Brave') ? 0.05 : 0) + (s.wrestling || 0) * 0.05;
  function start(me, foe, opts = {}) {
    for (const s of [me, foe]) { s.cancelAction(); s.missionLock = true; s.char.setProp(null); }
    foe.pos.set(me.pos.x + Math.sin(me.heading) * 0.9, foe.pos.y, me.pos.z + Math.cos(me.heading) * 0.9); foe.heading = me.heading + Math.PI;
    for (const s of [me, foe]) s.action = { type: 'event', phase: 'do', anim: 'block', dur: 99999, t: 0, label: 'Wrestling (ssireum)' };
    m = { me, foe, opts, my: 0, their: 0, vMy: 0, vTheir: 0, round: 1, wins: 0, losses: 0, t: 0, phase: 'grip', grip: 0, msg: 'Grip the satba belt… (hold Space)' };
    el.classList.remove('hidden'); document.exitPointerLock?.();
    G.audio?.drum?.();
  }
  function endRound(won) {
    if (won) m.wins++; else m.losses++;
    const loser = won ? m.foe : m.me; loser.char.setAnim('stagger', 30);
    m.msg = won ? `💪 ${m.foe.name.given} hits the sand! (${m.wins}–${m.losses})` : `😵 ${m.me.name.given} is thrown! (${m.wins}–${m.losses})`;
    G.audio?.hit?.(loser.pos, true); G.hitStop?.(0.12, 0.3);
    m.phase = 'between'; m.t = 0;
    if (m.wins === 2 || m.losses === 2) m.phase = 'done';
  }
  function finish() {
    const won = m.wins > m.losses, { me, foe, opts } = m;
    me.wrestling = Math.min(10, (me.wrestling || 0) + (won ? 0.6 : 0.3));
    if (won) { me.needs.honor = Math.min(100, me.needs.honor + 8); me.addMoodlet('ssireum', 'Won at ssireum', 10, 600); foe.changeRel(me, 4); G.systems.find((x) => x.id === 'missions')?.addFame?.(me, 'blade', 2); }
    else { me.addMoodlet('ssireumL', 'Thrown at ssireum', -4, 300); foe.changeRel(me, 3); }
    if (opts.onEnd) opts.onEnd(won);
    m.phase = 'over';
  }
  function close() { if (m) for (const s of [m.me, m.foe]) { s.missionLock = false; s.cancelAction(); } m = null; el.classList.add('hidden'); }
  function tick(dt) {
    const s = m; s.t += dt;
    if (s.phase === 'grip') { if (keys.space) s.grip += dt * 1.6; else s.grip = Math.max(0, s.grip - dt); if (s.grip >= 1) { s.phase = 'fight'; s.t = 0; s.my = 0; s.their = 0; s.vMy = 0; s.vTheir = 0; s.msg = 'Push! Keep your balance (A/D) — throw when they totter (Space)'; G.audio?.drumHit?.('kung', 0.5); } }
    else if (s.phase === 'fight') {
      const ps = str(s.me), fs = str(s.foe);
      // the opponent shoves you around in bursts; you counter with A/D
      s.shoveT = (s.shoveT ?? 0) - dt; if (s.shoveT <= 0) { s.shoveT = 0.35 + Math.random() * 0.7; s.shove = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.9) * fs; }
      const ctl = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      s.vMy += (s.shove * 1.9 - s.my * 0.8 + ctl * 2.4 * ps) * dt; s.vMy *= Math.pow(0.12, dt); s.my += s.vMy * dt;
      // your pressure unsettles them; their skill steadies them
      s.vTheir += ((Math.random() - 0.5) * 3.2 * ps + Math.sin(s.t * 2.3) * 0.8 * ps - s.their * 1.4 * fs) * dt; s.vTheir *= Math.pow(0.15, dt); s.their += s.vTheir * dt;
      if (Math.abs(s.my) > 1) endRound(false);
      else if (s.throwAt && s.t > s.throwAt) { s.throwAt = 0; if (Math.abs(s.their) > 0.62) endRound(true); else { s.my += Math.sign(s.their || 1) * 0.35 * fs; s.msg = 'Too soon — they countered your throw!'; } }
      else if (s.t > 25) endRound(Math.abs(s.their) > Math.abs(s.my)); // the referee calls it
      s.me.char.setAnim(Math.abs(s.my) > 0.6 ? 'stagger' : 'block', 18); s.foe.char.setAnim(Math.abs(s.their) > 0.6 ? 'stagger' : 'block', 18);
    } else if (s.phase === 'between') { if (s.t > 1.6) { s.round++; s.phase = 'grip'; s.grip = 0; s.msg = `Round ${s.round} — grip the satba (hold Space)`; } }
    else if (s.phase === 'done') { finish(); }
    render();
  }
  function render() {
    const s = m; if (!s) return;
    const bar = (v, cls) => `<div class="ws-bar ${cls}"><div class="safe"></div><i style="left:${50 + Math.max(-1, Math.min(1, v)) * 50}%"></i></div>`;
    el.innerHTML = `<div class="mg-head"><b>씨름 · Ssireum</b><small>${esc(s.me.name.given)} vs ${esc(s.foe.name.given)} · best of three${s.opts.title ? ' · ' + esc(s.opts.title) : ''}</small><button class="mg-x">✕</button></div>
      <div class="ws-score">${'●'.repeat(s.wins)}${'○'.repeat(2 - s.wins)} <span>falls</span> ${'●'.repeat(s.losses)}${'○'.repeat(2 - s.losses)}</div>
      ${s.phase === 'grip' ? `<div class="ws-grip"><i style="width:${Math.min(100, s.grip * 100)}%"></i></div>` : ''}
      <label class="ws-l">Your balance</label>${bar(s.my, 'me')}
      <label class="ws-l">${esc(s.foe.name.given)}'s balance — throw when it leaves the green</label>${bar(s.their, 'them')}
      <div class="mg-msg">${esc(s.msg)}</div>
      ${s.phase === 'over' ? `<div class="mg-msg ${s.wins > s.losses ? 'good' : 'bad'}">${s.wins > s.losses ? 'Victory!' : 'Defeat.'} ${esc(s.opts.after || '')}</div><button class="ws-btn" data-close>Bow and step back</button>` : `<div class="ws-pads"><button data-k="left">◀ A</button><button data-k="space">Grip / Throw (Space)</button><button data-k="right">D ▶</button></div>`}`;
    el.querySelector('.mg-x').onclick = close; el.querySelector('[data-close]')?.addEventListener('click', close);
    el.querySelectorAll('[data-k]').forEach((b) => { b.onpointerdown = () => press(b.dataset.k, true); b.onpointerup = b.onpointerleave = () => press(b.dataset.k, false); });
  }
  function press(k, down) {
    keys[k] = down;
    if (k === 'space' && down && m?.phase === 'fight' && !m.throwAt) { m.throwAt = m.t + 0.12; m.msg = 'Throw!'; }
  }
  // Dano festival contest: three bouts against the strongest villagers; the champion wins a bull
  function contest(me) {
    const foes = G.sims.filter((s) => !s.dead && !s.hidden && !s.household && s.faction === 'village' && s.sex === 'm' && ['young', 'adult'].includes(s.age) && !s.missionLock && !s.combat.target).sort((a, b) => str(b) - str(a)).slice(0, 6).sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => str(a) - str(b));
    if (foes.length < 3) return G.ui.toast('Not enough wrestlers today.');
    let i = 0;
    const next = () => {
      const f = foes[i];
      start(me, f, { title: `Dano contest — bout ${i + 1} of 3`, after: '', onEnd: (won) => {
        if (!won) { m.opts.after = `${me.name.given} is out of the contest.`; G.log(`${me.name.full} is thrown in the Dano ssireum, bout ${i + 1}.`, 'festival', me.pos); return; }
        i++;
        if (i < 3) { m.opts.after = `On to bout ${i + 1}!`; setTimeout(() => { if (m?.phase === 'over') { close(); next(); } }, 1800); return; }
        m.opts.after = 'Champion of the sand! The prize bull is yours.';
        me.wrestlingChampion = true; me.needs.honor = 100; me.addMoodlet('cheonha', 'Ssireum champion (천하장사)', 30, 2880);
        const ox = G.animals?.spawn?.('ox', me.pos.x + 3, me.pos.z + 2, { home: [me.home?.door?.[0] ?? me.pos.x, me.home?.door?.[1] ?? me.pos.z], range: 6 });
        if (ox) { ox.ownerId = me.id; ox.petName = 'Champion'; }
        (G.household[0] || me).earn(40);
        G.log(`🐂 ${me.name.full} throws three men in a row and is crowned ssireum champion (천하장사) of the Dano festival! The prize bull is led home with a red cloth on its horns.`, 'tournament', me.pos);
        G.systems.find((x) => x.id === 'missions')?.addFame?.(me, 'blade', 10);
      } });
    };
    next();
  }
  const S = {
    id: 'wrestle',
    get _m() { return m; },
    _tick: (dt) => m && m.phase !== 'over' && tick(dt),
    get active() { return !!m; },
    start, contest, close,
    init() {
      el = document.createElement('div'); el.id = 'wrestle'; el.className = 'hidden'; document.body.appendChild(el);
      const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'space' };
      addEventListener('keydown', (e) => { if (!m || !map[e.code]) return; if (!e.repeat) press(map[e.code], true); e.preventDefault(); e.stopImmediatePropagation(); }, true);
      addEventListener('keyup', (e) => { if (!m || !map[e.code]) return; press(map[e.code], false); e.stopImmediatePropagation(); }, true);
      let last = performance.now();
      const loop = (now) => { requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (m && m.phase !== 'over') { if (m.me.dead || m.foe.dead) return close(); tick(dt); } };
      requestAnimationFrame(loop);
    },
    simMenuItems(me, o) {
      if (!me.household || o.household || o.age === 'child' || o.dead || o.combat.target || ['king', 'queen', 'prince', 'princess'].includes(o.job) || me.age === 'child') return [];
      const out = [{ label: '🤼 Challenge to ssireum', fn: () => start(me, o) }];
      if (G.env.season === 'summer' && /festival/i.test(G.director?.active?.kind || '')) out.push({ label: '🐂 Enter the Dano ssireum contest (prize: a bull)', fn: () => contest(me) });
      return out;
    },
    objMenuItems(me, o) {
      const dano = G.env.season === 'summer' && /festival/i.test(G.director?.active?.kind || '');
      if (!me.household || !dano || me.age === 'child') return [];
      if (!['plaza', 'yut', 'well', 'pavilion'].includes(o.kind)) return [];
      return [{ label: '🐂 Enter the Dano ssireum contest (prize: a bull)', fn: () => contest(me) }];
    },
  };
  return S;
}
