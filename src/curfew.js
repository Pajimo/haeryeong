// The night curfew (인정 · 파루). In Joseon the great bell was struck twenty-eight times at nightfall —
// 인정, one stroke for each of the lunar mansions — and the gates were shut; thirty-three strokes before
// dawn — 파루, for the thirty-three heavens — opened them again. Between the two the watch (순라) walked
// the lanes with lanterns, and anyone abroad without good reason was stopped and questioned.

const CLOSE = 22, OPEN = 4;

export function createCurfewSystem(G) {
  const st = { night: false, fined: -1 };
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const inCurfew = (h) => h >= CLOSE || h < OPEN;
  const live = (s) => s && !s.dead && !s.removed;
  let lastH = null;

  function toll(n) {
    // a handful of real strokes, spaced as the ringer would — the chronicle counts the rest
    const a = G.audio; if (!a?.ctx) return;
    for (let i = 0; i < n; i++) a.bell(0.32, i * 4.2);
  }
  function close() {
    st.night = true; G.curfew = true;
    G.log('🔔 인정 — the great bell is struck twenty-eight times. The gates are shut; the night watch takes up its lanterns.', 'info');
    toll(4);
  }
  function open() {
    st.night = false; G.curfew = false;
    G.log('🔔 파루 — thirty-three strokes before dawn. The gates open, and the first kitchen smoke rises over the roofs.', 'info');
    toll(4);
  }

  // the watch: police and the odd soldier walk the lanes between the bells
  const LANES = () => {
    const sp = G.world?.spots || {};
    return [sp.plaza, sp.market, sp.police, sp.well, sp.palaceGate, [0, 40], [-30, 20], [30, -10], [20, 60]].filter(Boolean);
  };
  const watchman = (s) => live(s) && !s.hidden && !s.household && !s.controlled && !s.missionLock && !s.jailed && !s.royalGuard
    && (s.job === 'police' || (s.job === 'soldier' && s.id % 4 === 0));

  const S = {
    id: 'curfew', st,
    update() {
      if (!G.started) return;
      const h = G.env.hour;
      if (lastH == null) { lastH = h; st.night = inCurfew(h); G.curfew = st.night; return; }
      if (lastH < CLOSE && h >= CLOSE) close();
      else if (lastH < OPEN && h >= OPEN && st.night) open();
      lastH = h;
    },
    simAction(s) {
      if (!st.night || !watchman(s)) return false;
      if (s.needs.energy < 30 || s.needs.hunger < 25) return false;   // the watch changes; the tired go to bed
      if (!chance(0.35)) return false;
      const p = pick(LANES()); if (!p) return false;
      s.char?.setProp?.('lantern');
      s.startAction({ type: 'goto', dest: [p[0] + (Math.random() - 0.5) * 10, p[1] + (Math.random() - 0.5) * 10], label: 'Walking the night watch (순라)', then: (z) => { if (z.char?.propName === 'lantern') z.char.setProp(null); } });
      return true;
    },
    onEvent(name) {
      // once a night, a member of your household caught abroad by the watch is questioned
      if (name !== 'day' && name !== 'actionEnd') return;
      if (!st.night || st.fined === G.env.day) return;
      for (const me of G.household) {
        if (!live(me) || me.hidden || me.away) continue;
        const w = G.sims.find((s) => watchman(s) && s.action?.label?.startsWith('Walking the night watch') && s.pos.distanceTo(me.pos) < 7);
        if (!w) continue;
        st.fined = G.env.day;
        const exempt = ['king', 'queen', 'prince', 'princess', 'official', 'noble', 'police', 'soldier', 'general'].includes(me.job) || (me.factions?.court?.rank || 0) >= 3;
        w.say(exempt ? 'Your pardon — a safe night to you.' : 'Halt! Curfew! What business have you abroad?', exempt ? 'talk' : 'shout', 3);
        if (!exempt) {
          const fine = Math.min(Math.floor(me.coins), 3);
          me.coins -= fine;
          G.ui?.toast(`🏮 The night watch stops ${me.name.given} after curfew${fine ? ` — a ${fine} nyang fine` : ''}. Home before the bell next time.`);
        }
        return;
      }
    },
    status() { return [st.night ? '🔔 Curfew: the gates are shut until the 파루 bell before dawn.' : '']; },
    serialize() { return { fined: st.fined }; },
    restore(d) { if (d) st.fined = d.fined ?? -1; },
  };
  return S;
}
