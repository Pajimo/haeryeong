// Memories (기억): villagers remember what happened to them and who did it.
// Memories colour greetings, feed the AI dialogue prompt and show in the Self tab.
import { Sim } from './sim.js';
const MAX = 12;

export function createMemoriesSystem(G) {
  const near = (p, r) => G.sims.filter((o) => !o.dead && !o.hidden && o.pos.distanceTo(p) < r);
  const day = () => G.env.day + G.env.hour / 24;

  function remember(s, about, text, v, tag) {
    if (!s || s.dead || s.age === 'child' && Math.abs(v) < 6) return;
    const m = (s.memories ||= []);
    const dup = m.find((x) => x.text === text && day() - x.day < 1);
    if (dup) { dup.v = Math.sign(v) * Math.min(30, Math.abs(dup.v) + Math.abs(v) * 0.5); return; }
    m.unshift({ about: about?.id ?? null, aboutName: about?.name?.given || null, text, v, day: day(), tag: tag || null });
    if (m.length > MAX) { m.sort((a, b) => Math.abs(b.v) / (1 + (day() - b.day) * 0.3) - Math.abs(a.v) / (1 + (day() - a.day) * 0.3)); m.length = MAX; }
  }
  function about(s, o) { return (s.memories || []).filter((m) => m.about === o.id).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0]; }

  // greetings shaped by a shared past
  function greetLine(sp, li, m) {
    const n = li.name.given;
    if (m.tag === 'comforted') return `${n}… I never thanked you properly for that day.`;
    if (m.tag === 'saved') return `${n}! I owe you my life — I have not forgotten.`;
    if (m.tag === 'insulted') return `${n}. I remember every word you said to me.`;
    if (m.tag === 'robbed') return `Keep your hands where I can see them, ${n}.`;
    if (m.tag === 'beaten') return `${n}… our last bout still aches. Next time will be different.`;
    if (m.tag === 'beatThem') return `Ah, ${n}. Come for another lesson?`;
    if (m.tag === 'killedKin') return `You… you killed my ${m.kin || 'kin'}. Do not speak to me.`;
    if (m.tag === 'wedding') return `${n}, my heart — every morning since our wedding has been sweeter.`;
    if (m.tag === 'praised') return `${n}! Your kind words stayed with me all week.`;
    return m.v > 0 ? `${n}, good to see you again — I still think of ${m.text.toLowerCase()}` : `${n}. I have not forgotten.`;
  }

  // social exchanges leave memories
  const origSocial = G.socialExchange.bind(G);
  G.socialExchange = function (sp, li, convo, forced) {
    const firstTurn = convo && convo.turn === 0 && !forced;
    const r = origSocial(sp, li, convo, forced);
    if (firstTurn) {
      const m = about(sp, li);
      if (m && Math.abs(m.v) >= 8 && Math.random() < 0.7) { sp.say(greetLine(sp, li, m), m.v > 0 ? 'happy' : 'angry'); }
    }
    return r;
  };

  const S = {
    id: 'memories',
    remember, about,
    init() {
      // patch Sim.addMoodlet on the prototype once: moodlets that imply a person become memories
      const proto = Sim.prototype;
      if (proto.addMoodlet && !proto._memPatched) {
        const orig = proto.addMoodlet; proto._memPatched = true;
        proto.addMoodlet = function (key, label, v, dur) {
          const r = orig.call(this, key, label, v, dur);
          const who = this._lastSocial;
          if (who && !who.dead && G.sims.includes(who)) {
            if (key === 'comforted') remember(this, who, `${who.name.given} comforted me when I was low`, 12, 'comforted');
            else if (key === 'complimented') remember(this, who, `${who.name.given}'s kind words`, 6, 'praised');
            else if (key === 'insulted') remember(this, who, `${who.name.given} insulted me`, -10, 'insulted');
            else if (key === 'heartbroken') remember(this, who, `${who.name.given} refused my hand`, -14);
          }
          return r;
        };
      }
      // remember who you last spoke with, so moodlets above can attribute themselves
      const origEx = G.socialExchange;
      G.socialExchange = function (sp, li, convo, forced) { li._lastSocial = sp; sp._lastSocial = li; return origEx(sp, li, convo, forced); };
    },
    onEvent(name, p) {
      if (name === 'death') {
        const v = p.sim, k = p.killer;
        for (const o of near(v.pos, 22)) {
          if (o === v || o === k) continue;
          const kin = v.spouse === o ? 'spouse' : o.parents?.includes(v) ? (v.sex === 'f' ? 'mother' : 'father') : v.parents?.includes(o) ? (v.sex === 'f' ? 'daughter' : 'son') : null;
          if (k && k.faction !== o.faction && v.faction === o.faction && kin) remember(o, k, `${k.name.given} killed my ${kin}, ${v.name.given}`, -30, 'killedKin');
          else if (k) remember(o, k, `I saw ${k.name.given} cut down ${v.name.given}`, v.faction === 'bandit' || v.faction?.startsWith?.('enemy') ? 4 : -8);
          else remember(o, v, `${v.name.given} died before my eyes`, -6);
        }
        // the grieving, wherever they are
        for (const o of G.sims) {
          if (o.dead || o === v) continue;
          const close = v.spouse === o || o.parents?.includes(v) || v.parents?.includes(o) || (o.getRel?.(v)?.f || 0) > 50;
          if (close) { const m = (o.memories || []).find((x) => x.about === v.id); remember(o, v, `Losing ${v.name.given}`, -20, 'grief'); if (k && !m) { const kin = v.spouse === o ? 'spouse' : 'friend'; remember(o, k, `${k.name.given} killed my ${kin}, ${v.name.given}`, -28, 'killedKin'); (o.memories[0]).kin = kin; } }
        }
        // someone saved from an attacker
        if (k && v.combat?.target && !v.combat.target.dead && v.combat.target !== k) remember(v.combat.target, k, `${k.name.given} saved me from ${v.name.given}`, 18, 'saved');
        if (k) remember(k, v, `I killed ${v.name.given}`, k.has?.('Gentle') ? -10 : 2);
        const debt = k && (k.memories || []).find((x) => x.tag === 'killedKin' && x.about === v.id);
        if (debt) { k.moodlets = k.moodlets.filter((x) => x.id !== 'vengeful'); k.addMoodlet('avenged', `Avenged my ${debt.kin || 'kin'}`, 20, 1440); G.log(`${k.name.full} has avenged their ${debt.kin || 'kin'}: ${v.name.full} lies dead. The debt of blood is paid.`, 'story', k.pos); }
      }
      if (name === 'duel') { remember(p.loser, p.winner, `${p.winner.name.given} beat me in a duel`, -8, 'beaten'); remember(p.winner, p.loser, `I bested ${p.loser.name.given}`, 6, 'beatThem'); }
      if (name === 'steal') remember(p.victim, p.thief, `${p.thief.name.given} picked my pocket`, -12, 'robbed');
      if (name === 'wedding') { remember(p.a, p.b, `Our wedding day`, 25, 'wedding'); remember(p.b, p.a, `Our wedding day`, 25, 'wedding'); for (const o of near(p.a.pos, 25)) if (o !== p.a && o !== p.b) remember(o, p.a, `${p.a.name.given} and ${p.b.name.given}'s wedding`, 5); }
      if (name === 'birth') { for (const par of [p.mother, p.father]) if (par) remember(par, p.child, `The day ${p.child.name.given} was born`, 25, 'born'); }
      if (name === 'promoted') remember(p.sim, null, `Rising to ${p.title}`, 12);
      if (name === 'crowned') for (const o of G.sims) if (!o.dead && o !== p.sim && (o.household || Math.random() < 0.3)) remember(o, p.sim, `The coronation of ${p.sim.name.given}`, 6);
      if (name === 'mission' && p?.sim && p.ok) remember(p.sim, null, p.title || 'A job well done', 10);
      if (name === 'day') this.planVendettas();
      if (name === 'day') {
        // old, faint memories fade
        for (const s of G.sims) if (s.memories) s.memories = s.memories.filter((m) => Math.abs(m.v) / (1 + (day() - m.day) * 0.5) > 1.2);
      }
    },
    // ---------- Vendettas (원수): the kin of the slain may seek blood ----------
    vendettas: [],
    planVendettas() {
      const now = day();
      for (const s of G.sims) {
        if (s.dead || s.hidden || s.age === 'child' || s.controlled) continue;
        if (s.household) {
          // your own family never kills on autopilot — the grudge is yours to act on
          const m = (s.memories || []).find((x) => x.tag === 'killedKin' && !x.told);
          if (m) { m.told = true; const t = G.sims.find((o) => o.id === m.about); if (t && !t.dead) { s.addMoodlet('vengeful', `Burns to avenge my ${m.kin || 'kin'}`, -10, 2880); G.ui?.toast(`🗡 ${s.name.given} burns for vengeance against ${t.name.given}. Take control (V) to settle it — or let it go.`, 'danger'); } }
          continue;
        }
        if (this.vendettas.some((v) => v.avenger === s)) continue;
        const m = (s.memories || []).find((x) => x.tag === 'killedKin' && !x.avenged && now - x.day < 6);
        if (!m) continue;
        const target = G.sims.find((o) => o.id === m.about);
        if (!target || target.dead) { m.avenged = true; continue; }
        const fury = 0.25 + (s.has('Hot-headed') ? 0.3 : 0) + (s.has('Brave') ? 0.15 : 0) - (s.has('Gentle') ? 0.2 : 0) - (s.has('Lazy') ? 0.1 : 0);
        if (Math.random() > fury) continue;
        m.avenged = true;
        const how = s.fighter ? 'blade' : s.coins >= 40 ? 'hire' : 'curse';
        const v = { avenger: s, target, kin: m.kin || 'kin', how, due: now + 0.4 + Math.random() * 1.2, state: 'brooding' };
        this.vendettas.push(v);
        s.addMoodlet('vengeful', `Swore vengeance on ${target.name.given}`, -6, 1440);
        G.log(`${s.name.full} has sworn vengeance on ${target.name.full} for the death of their ${v.kin}. 원수를 갚으리라.`, 'danger', s.pos);
        if (target.household) G.ui?.toast(`⚠ ${s.name.given} has sworn vengeance on ${target.name.given}!`, 'danger');
      }
    },
    update(dt) {
      if (!this.vendettas.length) return;
      const now = day();
      for (const v of this.vendettas) {
        const { avenger: a, target: t } = v;
        if (v.state === 'done') continue;
        if (a.dead || t.dead || now - v.due > 3) {
          if (t.dead && !a.dead && v.state !== 'brooding') { a.addMoodlet('avenged', `Avenged my ${v.kin}`, 18, 1440); G.log(`${a.name.full} has avenged their ${v.kin}. The debt of blood is paid.`, 'story', a.pos); }
          v.state = 'done'; a.missionLock = false; continue;
        }
        if (now < v.due || t.hidden || a.hidden || G.raidActive) continue;
        if (v.how === 'curse' && v.state === 'brooding') {
          v.state = 'done';
          a.say(`May the spirits never let ${t.name.given} rest!`, 'angry', 4);
          for (const o of G.sims) if (!o.dead && o !== t && o.getRel?.(a)?.f > 20) o.changeRel?.(t, -8);
          t.needs.honor = Math.max(0, t.needs.honor - 20); t.addMoodlet('cursed', `Cursed by ${a.name.given}`, -12, 1440);
          G.log(`Too poor and too weak for steel, ${a.name.full} curses ${t.name.full} before the village shrine. Their friends turn cold toward ${t.name.given}.`, 'omen', a.pos);
          continue;
        }
        if (v.how === 'hire' && v.state === 'brooding') {
          const blade = G.sims.filter((o) => !o.dead && !o.hidden && o.faction === 'bandit' && !o.isChief && !o.combat.target).sort((x, y) => x.pos.distanceTo(t.pos) - y.pos.distanceTo(t.pos))[0];
          if (!blade) { v.how = 'curse'; continue; }
          a.coins -= 40; blade.coins = (blade.coins || 0) + 40;
          G.log(`Coins change hands in the dark: ${a.name.full} has paid a cutthroat, ${blade.name.full}, to kill ${t.name.full}.`, 'danger', a.pos);
          v.hired = blade; v.avenger = blade; v.payer = a; v.state = 'hunting';
          if (t.household) G.ui?.toast(`🗡 A hired blade stalks ${t.name.given}!`, 'danger');
          continue;
        }
        if (v.state === 'brooding') v.state = 'hunting';
        if (v.state === 'hunting') {
          const hunter = v.avenger;
          if (hunter.combat.target === t) { v.state = 'fighting'; continue; }
          const d = hunter.pos.distanceTo(t.pos);
          hunter.missionLock = true;
          if (d < 7) {
            hunter.say(v.hired ? `${v.payer.name.given} sends regards.` : `For my ${v.kin}! Draw, ${t.name.given}!`, 'shout', 3);
            hunter.startFight(t); if (!t.controlled && !t.combat.target) t.startFight(hunter);
            v.state = 'fighting'; G.audio?.drum();
            G.log(v.hired ? `${hunter.name.full} falls upon ${t.name.full} with a hidden blade!` : `${hunter.name.full} confronts ${t.name.full}: blood for blood!`, 'danger', hunter.pos);
          } else if (!hunter.action || hunter.action.type !== 'goto' || (hunter._vt = (hunter._vt || 0) + dt) > 4) {
            hunter._vt = 0; hunter.cancelAction(); hunter.startAction({ type: 'goto', dest: [t.pos.x, t.pos.z], run: d < 30, label: `Hunting ${t.name.given}` });
          }
        } else if (v.state === 'fighting' && !v.avenger.combat.target && !t.dead && !v.avenger.dead) {
          v.state = 'done'; v.avenger.missionLock = false;
          G.log(`${v.avenger.name.full} failed to take ${t.name.full}'s life… this time.`, 'story', t.pos);
        }
      }
      this.vendettas = this.vendettas.filter((v) => v.state !== 'done' || false);
    },
    panelHtml(s) {
      const m = (s.memories || []).slice(0, 6);
      if (!m.length) return '';
      const ago = (d) => { const x = day() - d; return x < 0.05 ? 'just now' : x < 1 ? 'today' : `${Math.floor(x)}d ago`; };
      return `<div class="memories"><h4>Memories · 기억</h4>${m.map((x) => `<div class="mem ${x.v >= 0 ? 'pos' : 'neg'}"><span>${x.v >= 0 ? '◆' : '◇'}</span> ${x.text.replace(/</g, '&lt;')} <small>${ago(x.day)}</small></div>`).join('')}</div>`;
    },
    serialize() {
      const out = {};
      for (const s of G.sims) if (!s.dead && s.memories?.length) out[s.id] = s.memories;
      return out;
    },
    restore(d, get) {
      for (const [id, mem] of Object.entries(d || {})) { const s = get(+id); if (s) s.memories = mem; }
    },
  };
  return S;
}

// prompt text for the AI dialogue
export function memoryPrompt(npc, me) {
  const m = npc.memories || [];
  if (!m.length) return '';
  const aboutMe = m.filter((x) => x.about === me.id).map((x) => x.text);
  const other = m.filter((x) => x.about !== me.id).slice(0, 4).map((x) => x.text);
  return `${aboutMe.length ? `\nWhat you remember about ${me.name.given}: ${aboutMe.join('; ')}.` : ''}${other.length ? `\nOther things on your mind: ${other.join('; ')}.` : ''}`;
}
