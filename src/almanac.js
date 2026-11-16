// Almanac (책력): a fixed calendar so players can plan around festivals, tournaments and exams,
// plus ancestral rites at the graves on Chuseok and Seollal.
import { SEASON_DAYS } from './season.js';

const SEASON_NAMES = { spring: ['Spring', '봄', '🌸'], summer: ['Summer', '여름', '☀'], autumn: ['Autumn', '가을', '🍁'], winter: ['Winter', '겨울', '❄'] };
const FEST = { spring: ['Lantern Festival', '연등회'], summer: ['Dano Festival', '단오'], autumn: ['Chuseok', '추석'], winter: ['Seollal', '설날'] };
const ORDER = ['spring', 'summer', 'autumn', 'winter'];
const MAJOR = /raid|battle|war|siege|fire|flood|storm|plot|epidemic|wedding|funeral|hunt|tournament|festival|exam|archery/i;

// day-of-season → fixed events (hours are when they usually begin)
function plan(season) {
  return {
    1: [['🛒', 'Great market day', '장날', 'Morning · traders from the coast'], ['📜', 'Royal decrees are read', '', 'Late morning']],
    2: season === 'spring' || season === 'autumn' ? [['🏹', 'Archery contest', '활쏘기 대회', 'Late morning at the training ground · 60 nyang prize']] : [['⚔', 'Martial tournament', '무예 대회', 'Late morning at the training ground · 50 nyang prize']],
    3: [['🏮', FEST[season][0], FEST[season][1], 'Evening at the plaza'], ...(season === 'autumn' || season === 'winter' ? [['🙇', 'Ancestral rites at the graves', season === 'autumn' ? '성묘' : '차례', 'Morning on the burial hill']] : [])],
    4: [['📖', 'Civil service examination', '과거', 'Late morning at the seodang'], ['🍶', 'Royal banquet (if the King is pleased)', '연회', 'Evening at the palace']],
  };
}

export function createAlmanacSystem(G) {
  const D = () => G.director;
  let ritesDay = -1;
  const S = {
    id: 'almanac',
    init() {
      G.ui?.addTopButton('📅 Almanac', 'Calendar of festivals and events', () => this.open());
      // calendar events take priority on their day
      const d = D();
      d.registerEvent('calFestival', { weight: (g, h, day) => (G.seasons?.dayOfSeason === 3 && h > 18 && h < 21 && d.lastFestivalDay !== day ? 60 : 0), run: () => d.ev_festival() });
      d.registerEvent('calTourney', { weight: (g, h, day) => (G.seasons?.dayOfSeason === 2 && h > 9.5 && h < 14 && d.lastTourneyDay !== day ? 60 : 0), run: () => { const se = G.env.season; const ac = G.systems.find((x) => x.id === 'archeryContest'); if (ac && (se === 'spring' || se === 'autumn')) { d.lastTourneyDay = G.env.day; ac.start(); } else d.ev_tournament(); } });
      d.registerEvent('calExam', { weight: (g, h, day) => (G.seasons?.dayOfSeason === 4 && h > 9.5 && h < 13 && d.lastExamDay !== day ? 40 : 0), run: () => d.ev_exam() });
      d.registerEvent('calMarket', { weight: (g, h, day) => (G.seasons?.dayOfSeason === 1 && h > 8 && h < 12 && this.marketDay !== day ? 40 : 0), run: () => { this.marketDay = G.env.day; d.ev_market(); } });
    },
    update() {
      const d = D(); if (!d || !G.seasons) return;
      const day = G.env.day, ds = G.seasons.dayOfSeason;
      // keep the random storyteller from stealing the calendar's big events on other days
      if (ds !== 3) d.lastFestivalDay = day;
      if (ds !== 2) d.lastTourneyDay = day;
      if (ds !== 4) d.lastExamDay = day;
      // when a calendar event is due, clear the stage of minor happenings so it can begin
      const h = G.env.hour;
      const due = (ds === 2 && h > 9.5 && h < 13.5 && d.lastTourneyDay !== day) || (ds === 3 && h > 18 && h < 20.5 && d.lastFestivalDay !== day) || (ds === 4 && h > 9.5 && h < 12.5 && d.lastExamDay !== day) || (ds === 1 && h > 8 && h < 11.5 && this.marketDay !== day);
      if (due) {
        const a = d.active;
        if (a && !MAJOR.test(a.kind || '') && a.t > 3) d.stop();
        if (!d.active) d.cool = Math.min(d.cool, 0);
      }
      // ancestral rites: kin visit the graves on Chuseok and Seollal mornings
      const se = G.env.season;
      if (ds === 3 && (se === 'autumn' || se === 'winter') && G.env.hour > 8 && G.env.hour < 11 && ritesDay !== day) { ritesDay = day; this.rites(); }
    },
    rites() {
      const fs = G.systems.find((x) => x.id === 'funerals'); if (!fs?.graves.length) return;
      let n = 0;
      for (const g of fs.graves) {
        const kin = G.sims.filter((o) => !o.dead && !o.hidden && !o.controlled && !o.combat.target && !o.missionLock && o.age !== 'child' && (o.parents?.some((p) => p.id === g.simId) || o.spouse?.id === g.simId || (o.memories || []).some((m) => m.about === g.simId && m.v < -5) || (g.household && o.household)));
        for (const o of kin.slice(0, 5)) {
          n++; o.cancelAction();
          o.startAction({ type: 'event', phase: 'move', dest: [g.x + (Math.random() - 0.5) * 3, g.z + 3.2 + Math.random() * 1.5], anim: (z) => (Math.sin(z.id + performance.now() / 3000) > 0 ? 'kneel' : 'bow'), dur: 45, look: [g.x, g.z], adv: { honor: 0.3, social: 0.1 }, label: `Honouring ${g.name.split(' ').pop()} at the grave`, then: (z) => z.addMoodlet('ancestors', 'Honoured the ancestors', 8, 720) });
        }
      }
      if (n) G.log(`${G.env.season === 'autumn' ? 'Seongmyo (성묘)' : 'Charye (차례)'}: ${n} villagers climb the burial hill with rice wine and fruit to bow before their ancestors' graves.`, 'festival');
    },
    open() {
      const se = G.env.season || 'autumn', ds = G.seasons?.dayOfSeason || 1, i = ORDER.indexOf(se), next = ORDER[(i + 1) % 4];
      const [nm, ko, ic] = SEASON_NAMES[se];
      const P = plan(se);
      const rows = Array.from({ length: SEASON_DAYS }, (_, k) => {
        const dd = k + 1, past = dd < ds, today = dd === ds;
        return `<div class="alm-day ${today ? 'today' : ''} ${past ? 'past' : ''}"><div class="alm-d">${today ? 'Today' : `Day ${G.env.day + (dd - ds)}`}<small>${ic} ${nm} ${dd}</small></div><div class="alm-ev">${P[dd].map(([e, t, k2, w]) => `<div>${e} <b>${t}</b>${k2 ? ` <span class="ko">${k2}</span>` : ''}<small>${w}</small></div>`).join('')}</div></div>`;
      }).join('');
      const fs = G.systems.find((x) => x.id === 'funerals'); const mem = G.systems.find((x) => x.id === 'memories');
      const funeral = fs?.current?.(); const pend = fs?.pending?.length || 0;
      const vend = (mem?.vendettas || []).filter((v) => v.state !== 'done');
      const notes = [
        funeral ? `⚱ The funeral of <b>${funeral.d.name.full}</b> is under way.` : pend ? `⚱ ${pend} funeral${pend > 1 ? 's' : ''} will be held in the coming days (daylight hours).` : '',
        ...vend.slice(0, 4).map((v) => `🗡 Whispers: <b>${v.avenger.name.given}</b> means to settle a blood debt with <b>${v.target.name.given}</b>.`),
        G.systems.find((x) => x.id === 'rivals')?.status?.() || '',
        ...(G.systems.find((x) => x.id === 'expeditions')?.status?.() || []),
        ...(G.systems.find((x) => x.id === 'underworld')?.status?.() || []),
        ...(G.systems.find((x) => x.id === 'royalPower')?.status?.() || []),
        ...(G.systems.find((x) => x.id === 'royalGuard')?.status?.() || []),
        ...(G.systems.find((x) => x.id === 'ambition')?.status?.() || []).map((t) => `✦ ${t}`),
        ...(G.systems.find((x) => x.id === 'society')?.status?.() || []).map((t) => `🗣 ${t}`),
        ...(G.systems.find((x) => x.id === 'houses')?.status?.() || []).map((t) => `家 ${t}`),
        ...(G.systems.find((x) => x.id === 'inheritance')?.status?.() || []).map((t) => `巻 ${t}`),
        G.director?.active ? `🔔 Happening now: <b>${G.director.active.title || G.director.active.kind}</b>.` : '',
      ].filter(Boolean);
      G.ui.modal(`<h2>Almanac · 책력</h2><p class="alm-season">${ic} ${nm} <span class="ko">${ko}</span> — day ${ds} of ${SEASON_DAYS}. Next season: ${SEASON_NAMES[next][2]} ${SEASON_NAMES[next][0]} (${FEST[next][0]} on its 3rd day).</p>
        <div class="almanac">${rows}</div>
        ${notes.length ? `<h3>Rumours & happenings</h3><div class="alm-notes">${notes.map((x) => `<div>${x}</div>`).join('')}</div>` : ''}
        <p class="alm-foot">Raids, omens, plots, plagues and wars keep no calendar.</p>`);
    },
  };
  return S;
}
