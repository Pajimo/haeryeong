// First Day (첫날): a gentle checklist that teaches the main verbs by doing them.
const STEPS = [
  { id: 'select', text: 'Click a family portrait (top left) to select someone', hint: 'Each family member lives their own life. Selecting one shows their needs.' },
  { id: 'eat', text: 'Give an order: click a need bar (like Hunger) in the panel', hint: 'They go and fix it. You can also click the ground, a cookpot or the jumak tavern.' },
  { id: 'chat', text: 'Click a villager and choose Chat or Greet', hint: 'Friendships, rivalries and romance all grow from small talk.' },
  { id: 'goal', text: 'Choose a life goal (🎯 Goals button)', hint: 'Goals give long-term purpose and unlock perks.' },
  { id: 'warrior', text: 'Press V to take direct control and walk with WASD', hint: 'Mouse or drag to look. Press V again to return to the overseer view.' },
  { id: 'calendar', text: 'Open the 📅 Almanac to see what is coming', hint: 'Festivals, tournaments and exams fall on fixed days each season.' },
  { id: 'mission', text: 'Take a job: press M for missions', hint: 'Missions build your reputation along your path in life.' },
];

export function createTutorialSystem(G) {
  const S = {
    id: 'tutorial', done: {}, dismissed: false, min: innerWidth < 760, el: null, firstSel: null, t: 0, flags: {},
    init() {
      const el = document.createElement('div'); el.id = 'tutorial'; el.className = 'panel lacquer hidden'; document.getElementById('ui').appendChild(el); this.el = el;
      el.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) { this.dismissed = true; this.render(); } if (e.target.closest('[data-min]')) { this.min = !this.min; this.render(); } });
      // listen for verbs
      const orig = G.socialExchange; G.socialExchange = (sp, li, c, f) => { if ((sp.household || li.household) && (sp.controlled || li.controlled || G.player.mode === 'overseer')) this.flags.chat = true; return orig(sp, li, c, f); };
      const ui = G.ui; const ok = ui.openKingdom.bind(ui); ui.openKingdom = (...a) => { this.flags.kingdom = true; return ok(...a); };
      const pc = G.player.command.bind(G.player); G.player.command = (sim, a, q) => { if (sim?.household) this.flags.order = true; return pc(sim, a, q); };
      const fn = G.ui.fixNeed.bind(G.ui); G.ui.fixNeed = (s, k) => { this.flags.order = true; return fn(s, k); };
      const al = G.systems.find((x) => x.id === 'almanac'); if (al) { const o = al.open.bind(al); al.open = () => { this.flags.calendar = true; return o(); }; }
    },
    check() {
      const hh = G.household, D = this.done;
      if (!D.select && G.selected && this.firstSel && G.selected !== this.firstSel && G.selected.household) D.select = true;
      if (!this.firstSel && G.selected) this.firstSel = G.selected;
      if (!D.eat && this.flags.order) D.eat = true;
      if (!D.chat && this.flags.chat) D.chat = true;
      if (!D.goal) { const a = G.systems.find((x) => x.id === 'aspirations'); if (a && hh.some((s) => a.data?.[s.id]?.asp)) D.goal = true; }
      if (!D.warrior && G.player.mode === 'warrior') D.warrior = true;
      if (!D.calendar && this.flags.calendar) D.calendar = true;
      if (!D.mission) { const m = G.systems.find((x) => x.id === 'missions'); if (m?.active || m?.history?.length) D.mission = true; }
    },
    update(dt) {
      if (!G.started || this.dismissed || this.finished) { this.el?.classList.add('hidden'); return; }
      this.t -= dt; if (this.t > 0) return; this.t = 0.6;
      const before = Object.keys(this.done).length;
      this.check();
      const n = Object.keys(this.done).length;
      if (n > before) {
        const hero = G.household[0]; if (hero) hero.coins += 10 * (n - before);
        G.audio?.ui?.();
        if (n >= STEPS.length) {
          this.finished = true;
          G.ui.toast('🎉 First day complete! The valley is yours to live in. (+30 nyang)', 'festival'); if (hero) hero.coins += 30;
          for (const s of G.household) s.addMoodlet('settled', 'Settled into the valley', 10, 1440);
        }
      }
      this.render();
    },
    render() {
      const el = this.el; if (!el) return;
      if (this.dismissed || this.finished || !G.started) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const next = STEPS.find((s) => !this.done[s.id]);
      const key = Object.keys(this.done).join() + (this.min ? 'm' : '');
      if (key === this._key) return; this._key = key;
      el.innerHTML = `<div class="tu-h"><b>First Day · 첫날</b><span>${Object.keys(this.done).length}/${STEPS.length}</span><button data-min title="Collapse">${this.min ? '▸' : '▾'}</button><button data-x title="Dismiss tutorial">✕</button></div>
        ${this.min ? '' : `<ol>${STEPS.map((s) => `<li class="${this.done[s.id] ? 'done' : s === next ? 'next' : ''}">${this.done[s.id] ? '✔' : s === next ? '▶' : '·'} ${s.text}${s === next ? `<small>${s.hint}</small>` : ''}</li>`).join('')}</ol><div class="tu-f">+10 nyang per step</div>`}`;
    },
    serialize() { return { done: this.done, dismissed: this.dismissed, finished: this.finished }; },
    restore(d) { Object.assign(this.done, d?.done || {}); this.dismissed = !!d?.dismissed; this.finished = !!d?.finished; },
  };
  return S;
}
