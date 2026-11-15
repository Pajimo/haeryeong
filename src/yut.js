// Yut-nori (윷놀이): the New Year board game, playable against any villager for a stake.
// Four sticks: do 1 · gae 2 · geol 3 · yut 4 · mo 5 (yut and mo throw again; a capture throws again).
// Two pieces each. Land on a corner to take the shortcut across the board. Pieces that meet stack and
// travel together. First to bring both pieces home takes the pot.
const THROWS = [['do', '도', 1, 4], ['gae', '개', 2, 6], ['geol', '걸', 3, 4], ['yut', '윷', 4, 1], ['mo', '모', 5, 1]];
// nodes: outer ring 0..19 (0 = start/home corner, bottom-right), corners 5, 10, 15; centre C; diagonals
const N = {};
(() => {
  const P = (i) => { // outer square, counter-clockwise from bottom-right
    const s = Math.floor(i / 5), k = i % 5, L = 300, o = 20;
    if (s === 0) return [o + L, o + L - k * 60];
    if (s === 1) return [o + L - k * 60, o];
    if (s === 2) return [o, o + k * 60];
    return [o + k * 60, o + L];
  };
  for (let i = 0; i < 20; i++) N['o' + i] = P(i);
  N.C = [170, 170];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  N.a1 = lerp(N.o5, N.C, 1 / 3); N.a2 = lerp(N.o5, N.C, 2 / 3); N.a3 = lerp(N.C, N.o15, 1 / 3); N.a4 = lerp(N.C, N.o15, 2 / 3);
  N.b1 = lerp(N.o10, N.C, 1 / 3); N.b2 = lerp(N.o10, N.C, 2 / 3); N.b3 = lerp(N.C, N.o0, 1 / 3); N.b4 = lerp(N.C, N.o0, 2 / 3);
})();
// route a piece takes from where it stands
function route(at, entry) {
  const outer = []; for (let i = 1; i <= 19; i++) outer.push('o' + i); outer.push('HOME');
  if (at === 'start') return outer;
  if (at === 'o5' || entry === 'A') return ['a1', 'a2', 'C', 'b3', 'b4', 'HOME']; // from the first corner: straight across to home
  if (at === 'o10' || entry === 'B') return ['b1', 'b2', 'C', 'b3', 'b4', 'HOME'];
  if (at === 'C') return ['b3', 'b4', 'HOME'];
  const seqs = [['a1', 'a2', 'C', 'b3', 'b4', 'HOME'], ['b1', 'b2', 'C', 'b3', 'b4', 'HOME'], ['a3', 'a4', 'o15', 'o16', 'o17', 'o18', 'o19', 'HOME'], outer];
  for (const sq of seqs) { const i = sq.indexOf(at); if (i >= 0) return sq.slice(i + 1); }
  return outer;
}
function dest(at, steps) { const r = route(at); return r[Math.min(steps, r.length) - 1]; }
function roll() { let t = Math.random() * 16; for (const th of THROWS) { t -= th[3]; if (t <= 0) return th; } return THROWS[0]; }

export function createYutSystem(G) {
  let el = null, game = null;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function start(me, npc, stake) {
    G.household[0].coins -= stake; npc.coins = Math.max(0, (npc.coins || 0) - stake);
    for (const s of [me, npc]) { s.cancelAction(); s.missionLock = true; s.action = { type: 'event', phase: 'do', anim: 'yut', dur: 99999, t: 0, look: [(me.pos.x + npc.pos.x) / 2, (me.pos.z + npc.pos.z) / 2], label: 'Playing yut-nori' }; }
    npc.pos.set(me.pos.x + Math.sin(me.heading) * 1.6, npc.pos.y, me.pos.z + Math.cos(me.heading) * 1.6);
    game = { me, npc, pot: stake * 2, pieces: { me: ['start', 'start'], ai: ['start', 'start'] }, turn: 'me', phase: 'throw', moves: [], log: [], over: false };
    el.classList.remove('hidden'); document.exitPointerLock?.();
    say(`${npc.name.given} grins and shakes the sticks: "Loser buys the makgeolli!"`);
    render();
  }
  function say(t) { game.log.unshift(t); game.log.length = Math.min(game.log.length, 5); }
  function piecesAt(side, node) { return game.pieces[side].map((p, i) => (p === node ? i : -1)).filter((i) => i >= 0); }
  function canMove(side, i, steps) { const p = game.pieces[side][i]; return p !== 'HOME' && !!dest(p, steps); }
  function move(side, i, mi) {
    const steps = game.moves[mi][2]; const from = game.pieces[side][i];
    const group = from === 'start' ? [i] : piecesAt(side, from); // stacked pieces travel together
    const to = dest(from, steps);
    for (const j of group) game.pieces[side][j] = to;
    game.moves.splice(mi, 1);
    const who = side === 'me' ? game.me.name.given : game.npc.name.given;
    let extra = false;
    if (to !== 'HOME') {
      const other = side === 'me' ? 'ai' : 'me'; const hit = piecesAt(other, to);
      if (hit.length) { for (const j of hit) game.pieces[other][j] = 'start'; say(`💥 ${who} captures ${hit.length > 1 ? 'two pieces' : 'a piece'} and throws again!`); extra = true; G.audio?.drumHit?.('ta', 0.5); }
      if (piecesAt(side, to).length > 1 && group.length === 1) say(`${who} stacks pieces (업기).`);
    } else say(`${who} brings ${group.length > 1 ? 'two pieces' : 'a piece'} home!`);
    if (game.pieces[side].every((p) => p === 'HOME')) return finish(side);
    if (extra) game.extra = true;
    afterMove(side);
  }
  function afterMove(side) {
    if (game.moves.length) { if (side === 'ai') setTimeout(aiStep, 650); render(); return; }
    if (game.extra) { game.extra = false; game.phase = 'throw'; if (side === 'ai') setTimeout(aiStep, 700); render(); return; }
    game.turn = side === 'me' ? 'ai' : 'me'; game.phase = 'throw';
    if (game.turn === 'ai') setTimeout(aiStep, 800);
    render();
  }
  function throwSticks(side) {
    const th = roll(); game.moves.push(th); G.audio?.drumHit?.('ta', 0.35);
    const who = side === 'me' ? game.me.name.given : game.npc.name.given;
    say(`${who} throws: ${th[1]} ${th[0].toUpperCase()} (${th[2]})${th[2] >= 4 ? ' — throw again!' : ''}`);
    if (th[2] >= 4) { game.phase = 'throw'; if (side === 'ai') setTimeout(aiStep, 700); render(); return; }
    game.phase = 'move';
    // no legal move at all (cannot happen with HOME clamp, but be safe)
    if (side === 'ai') setTimeout(aiStep, 700);
    render();
  }
  function aiStep() {
    if (!game || game.over) return;
    if (game.turn !== 'ai') return;
    if (game.phase === 'throw') return throwSticks('ai');
    // choose best (piece, move) by a simple score: capture > reach home > land on a corner > progress
    let best = null, bs = -1e9;
    game.moves.forEach((m, mi) => [0, 1].forEach((i) => {
      if (!canMove('ai', i, m[2])) return;
      const from = game.pieces.ai[i]; const to = dest(from, m[2]);
      let sc = m[2];
      if (to === 'HOME') sc += 30;
      if (to !== 'HOME' && piecesAt('me', to).length) sc += 40;
      if (['o5', 'o10', 'C'].includes(to)) sc += 8;
      if (from === 'start') sc += 2;
      if (sc > bs) { bs = sc; best = [i, mi]; }
    }));
    if (!best) { game.moves = []; return afterMove('ai'); }
    move('ai', best[0], best[1]);
  }
  function finish(side) {
    game.over = true; const { me, npc, pot } = game;
    if (side === 'me') { G.household[0].earn(pot); me.needs.fun = 100; me.addMoodlet('yutwin', 'Won at yut-nori', 10, 480); npc.changeRel(me, 3); say(`🏆 ${me.name.given} wins the pot of ${pot} nyang!`); G.log(`${me.name.full} beats ${npc.name.full} at yut-nori and sweeps up ${pot} nyang.`, 'festival', me.pos); }
    else { npc.earn(pot); me.needs.fun = Math.min(100, me.needs.fun + 30); npc.changeRel(me, 5); say(`${npc.name.given} wins the pot. "Again tomorrow?"`); }
    render();
  }
  function close() {
    if (game) for (const s of [game.me, game.npc]) { s.missionLock = false; s.cancelAction(); }
    game = null; el.classList.add('hidden');
  }
  function render() {
    if (!game) return;
    const mine = game.turn === 'me';
    const node = (k, r = 9) => { const [x, y] = N[k]; const big = ['o0', 'o5', 'o10', 'o15', 'C'].includes(k); return `<circle cx="${x}" cy="${y}" r="${big ? 13 : r}" class="yn ${big ? 'big' : ''}"/>`; };
    const lines = `<path d="M${N.o0} L${N.o5} L${N.o10} L${N.o15} Z M${N.o5} L${N.o15} M${N.o10} L${N.o0}" class="yl"/>`;
    const pc = (side) => {
      const by = {}; game.pieces[side].forEach((p, i) => { (by[p] ||= []).push(i); });
      return Object.entries(by).map(([p, idx]) => {
        if (p === 'HOME') return '';
        const [x, y] = p === 'start' ? (side === 'me' ? [360, 360] : [360, 20]) : N[p];
        const dx = side === 'me' ? -6 : 6;
        const clickable = mine && side === 'me' && game.phase === 'move' && game.moves.some((m) => canMove('me', idx[0], m[2]));
        return `<g class="yp ${side} ${clickable ? 'go' : ''}" data-p="${idx[0]}"><circle cx="${x + dx}" cy="${y}" r="11"/><text x="${x + dx}" y="${y + 4}">${idx.length > 1 ? '×' + idx.length : side === 'me' ? '말' : '말'}</text></g>`;
      }).join('');
    };
    const home = (side) => game.pieces[side].filter((p) => p === 'HOME').length;
    el.innerHTML = `<div class="mg-head"><b>윷놀이 · Yut-nori</b><small>${esc(game.me.name.given)} (red) vs ${esc(game.npc.name.given)} (blue) · pot ${game.pot} nyang</small><button class="mg-x">✕</button></div>
      <div class="yut-wrap"><svg viewBox="0 0 380 380" class="yut-board">${lines}${Object.keys(N).map((k) => node(k)).join('')}<text x="${N.o0[0] - 4}" y="${N.o0[1] + 30}" class="yt">출발 · home</text>${pc('ai')}${pc('me')}</svg>
      <div class="yut-side"><div class="yut-score">Home: <b class="r">${home('me')}/2</b> · <b class="b">${home('ai')}/2</b></div>
        <div class="yut-moves">${game.moves.map((m, i) => `<span class="${game.sel === i ? 'on' : ''}" data-m="${i}">${m[1]} ${m[0]} · ${m[2]}</span>`).join('') || '<small>—</small>'}</div>
        ${game.over ? '<button class="yut-btn" data-again>Play again</button>' : mine ? (game.phase === 'throw' ? '<button class="yut-btn" data-throw>Throw the sticks 🥢</button>' : `<small>Pick a move${game.moves.length > 1 ? ' (tap one above)' : ''}, then click one of your red pieces.</small>`) : `<small>${esc(game.npc.name.given)} is thinking…</small>`}
        <div class="yut-log">${game.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div></div></div>`;
    el.querySelector('.mg-x').onclick = close;
    el.querySelector('[data-throw]')?.addEventListener('click', () => throwSticks('me'));
    el.querySelector('[data-again]')?.addEventListener('click', () => { const { me, npc } = game; const stake = game.pot / 2; close(); if (G.household[0].coins >= stake) start(me, npc, stake); });
    el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { game.sel = +b.dataset.m; render(); }));
    el.querySelectorAll('.yp.me.go').forEach((g) => (g.onclick = () => {
      const i = +g.dataset.p; let mi = game.sel ?? 0; if (!game.moves[mi] || !canMove('me', i, game.moves[mi][2])) mi = game.moves.findIndex((m) => canMove('me', i, m[2]));
      if (mi < 0) return; game.sel = null; move('me', i, mi);
    }));
  }
  const S = {
    id: 'yut',
    init() { el = document.createElement('div'); el.id = 'yut'; el.className = 'hidden'; document.body.appendChild(el); },
    get active() { return !!game; },
    start, close,
    simMenuItems(me, o) {
      if (!me.household || o.household || o.age === 'child' || o.dead || o.job === 'king' || o.combat.target) return [];
      return [5, 20].map((st) => ({ label: `🥢 Play yut-nori (stake ${st})`, disabled: G.household[0].coins < st || (o.coins || 0) < st && st > 5, fn: () => start(me, o, st) }));
    },
    update() { if (game && (game.me.dead || game.npc.dead)) close(); },
  };
  return S;
}
