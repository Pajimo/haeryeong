// Conversation topics that work without any API key: every answer is built from what the
// villager actually knows and feels in the simulation (needs, moodlets, memories, family, news).
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function needLine(n) {
  const k = Object.entries(n.needs).sort((a, b) => a[1] - b[1])[0];
  if (k[1] > 55) return null;
  return {
    hunger: pick(['My stomach has been growling since dawn.', 'I could eat a whole pot of gukbap right now.']),
    energy: pick(['I can barely keep my eyes open.', 'I need a long sleep on a warm ondol floor.']),
    social: pick(['It’s been lonely lately. It’s good to talk.', 'Nobody has said two words to me all day.']),
    fun: pick(['Every day is the same. I need some excitement.', 'I’d give a week’s pay for a festival.']),
    hygiene: pick(['Don’t stand too close… I haven’t washed in days.', 'I need a dip in the stream.']),
    honor: pick(['People look at me differently these days.', 'My name isn’t worth much in this valley lately.']),
  }[k[0]] || null;
}

export function talkTopics(G, me, npc) {
  const rel = npc.getRel(me); const T = [];
  const fond = rel.f > 30, cold = rel.f < -20;
  const rival = G.systems.find((x) => x.id === 'rivals');
  const memAboutMe = (npc.memories || []).filter((m) => m.about === me.id).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];

  T.push({ id: 'how', label: 'How are you?', reply: () => {
    const ml = npc.moodlets.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
    const mood = npc.mood;
    let t = mood > 25 ? pick(['Wonderful, truly.', 'I can’t complain — the gods are kind today.']) : mood < -15 ? pick(['Not well, if I’m honest.', 'Some days are heavy.']) : pick(['Well enough.', 'Getting by.']);
    if (ml) t += ` ${ml.v > 0 ? 'I’m still glowing from' : 'I can’t stop thinking about'}: ${ml.label.toLowerCase()}.`;
    const n = needLine(npc); if (n) t += ' ' + n;
    return { text: t, att: 1 };
  } });

  T.push({ id: 'news', label: 'Any news in the valley?', reply: () => {
    const items = G.chronicle.filter((c) => !c.text.includes(npc.name.full) && !/Market rumour|steps up|Next bout/.test(c.text)).slice(0, 12);
    const v = (rival?.clan && !rival.allied && Math.random() < 0.35) ? `They say the ${rival.clan} clan has been ${rival.enmity > 60 ? 'sharpening knives and spreading lies' : 'muttering about your family'}.` : null;
    const vend = (G.systems.find((x) => x.id === 'memories')?.vendettas || []).find((x) => x.state !== 'done');
    if (vend && Math.random() < 0.5) return { text: `Keep this quiet… ${vend.avenger.name.given} has sworn to settle a blood debt with ${vend.target.name.given}.`, att: 2 };
    if (v) return { text: v, att: 1 };
    if (!items.length) return { text: 'Quiet days. Nothing worth repeating.', att: 0 };
    const c = pick(items.slice(0, 6));
    const lead = pick(['Did you hear? ', 'The washerwomen say ', 'Word at the jumak is that ', 'I heard this morning — ']);
    return { text: lead + (/^(The|A|An|Some|Word|Rumour) /.test(c.text) ? c.text.charAt(0).toLowerCase() + c.text.slice(1) : c.text), att: 1 };
  } });

  T.push({ id: 'self', label: 'Tell me about yourself', reply: () => {
    const royal = { king: 'I am the King of Haeryeong. The weight of this crown never leaves me.', queen: 'I am the Queen of Haeryeong.', prince: 'I am a prince of the royal house — and they never let me forget it.', princess: 'I am a princess of the royal house.' }[npc.job];
    const bits = [royal || `I’m a ${npc.title.toLowerCase()}${npc.age === 'elder' ? ', and I’ve been one longer than you’ve been alive' : ''}.`];
    if (npc.spouse && !npc.spouse.dead) bits.push(`${npc.spouse.name.given} is my ${npc.spouse.sex === 'f' ? 'wife' : 'husband'}${npc.getRel(npc.spouse).r > 60 ? ' — the light of my days' : ''}.`);
    const kids = (npc.children || []).filter((c) => !c.dead); if (kids.length) bits.push(`${kids.length === 1 ? 'My child' : 'My children'}: ${kids.map((c) => c.name.given).join(', ')}.`);
    const t = npc.traits[0]; if (t) bits.push({ Brave: 'I don’t run from trouble.', Gentle: 'I hate to see anyone hurt.', 'Hot-headed': 'People say I’m quick to anger. They’re right.', Lazy: 'Honestly? I’d rather nap than work.', Ambitious: 'I mean to be someone in this kingdom.', Greedy: 'Coin is the only friend that never lies.', Pious: 'I pray at the shrine every morning.', Cunning: 'I always know more than I say.', Cheerful: 'Life’s too short to frown!', Romantic: 'I’m a fool for poetry and moonlight.', Loyal: 'I never abandon my own.', Scholarly: 'Give me a book over a banquet.' }[t] || '');
    const m = (npc.memories || []).slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
    if (m && Math.abs(m.v) >= 10) bits.push(`I’ll never forget it: ${m.text}.`);
    return { text: bits.filter(Boolean).join(' '), att: 2 };
  } });

  T.push({ id: 'me', label: 'What do you think of me?', reply: () => {
    let t = rel.r > 50 ? pick(['…You know what I think. My heart races when you’re near.', 'Must you ask? I think of you more than I should.'])
      : fond ? pick(['You’re a true friend. I’d stand beside you in any fight.', 'One of the good ones, you are.'])
        : cold ? pick(['I don’t trust you.', 'Honestly? I’d rather you kept walking.'])
          : pick(['I don’t know you well yet.', 'You seem decent enough.']);
    if (memAboutMe) t += ` ${memAboutMe.v > 0 ? 'I remember' : 'And I haven’t forgotten'}: ${memAboutMe.text}.`;
    return { text: t, att: fond ? 2 : 0 };
  } });

  // favours: help with a pressing need
  const lowest = Object.entries(npc.needs).sort((a, b) => a[1] - b[1])[0];
  if (lowest[1] < 40 && me.coins >= 6 && !npc.household && !['king', 'queen', 'prince', 'princess'].includes(npc.job)) {
    const what = { hunger: ['Buy them a hot meal (6 nyang)', 'hunger', 'A meal! You’re too kind — I’ll remember this.'], energy: ['Pay for a room at the jumak (6 nyang)', 'energy', 'A real bed tonight… thank you, truly.'], hygiene: ['Pay for the bathhouse (6 nyang)', 'hygiene', 'Ha! Was it that bad? Thank you.'], fun: ['Buy them a round of makgeolli (6 nyang)', 'fun', 'To your health! 건배!'], social: ['Sit and keep them company', 'social', 'It means more than you know.'], honor: ['Speak up for them in the square', 'honor', 'You’d put your name next to mine? Thank you.'] }[lowest[0]];
    if (what) T.push({ id: 'favour', label: '🤝 ' + what[0], reply: () => {
      if (what[0].includes('nyang')) { me.coins -= 6; npc.earn?.(0); }
      npc.needs[what[1]] = Math.min(100, npc.needs[what[1]] + 45); npc.addMoodlet('kindness', `${me.name.given} helped me`, 10, 720);
      G.systems.find((x) => x.id === 'memories')?.remember?.(npc, me, `${me.name.given} helped me when I needed it`, 12, 'helped');
      return { text: what[2], att: 8 };
    } });
  }

  if (rival?.clan && !npc.household && npc.name.surname !== rival.clan) T.push({ id: 'rival', label: `What do you make of the ${rival.clan} clan?`, reply: () => {
    const h = rival.head; const r2 = h ? npc.getRel(h).f : 0;
    const t = r2 > 30 ? `${h.name.given}? A fine family head. Your quarrel isn’t mine.` : r2 < -20 ? `Snakes in silk. ${h?.name.given || 'Their head'} would sell his mother for a rice field.` : pick(['Proud people. Too proud, maybe.', 'I keep out of the feuds of great houses.']);
    if (rival.evidence < 3 && r2 < 0 && Math.random() < 0.4) { rival.evidence++; return { text: t + ' …And I saw one of their servants lurking by your storehouse. I’d swear to it.', att: 1, note: `Evidence ${rival.evidence}/3` }; }
    return { text: t, att: 0 };
  } });

  if (npc.sex !== me.sex && !npc.spouse && !me.spouse && rel.r > 15 && npc.age !== 'child' && me.age !== 'child') T.push({ id: 'walk', label: '🌸 Ask them to walk with you by the river', reply: () => {
    const yes = rel.r > 30 || Math.random() < 0.5 + rel.f / 200;
    if (yes) { npc.changeRel(me, 4, 10); me.changeRel(npc, 4, 10); npc.addMoodlet('courted', `A walk with ${me.name.given}`, 12, 600); return { text: pick(['…I’d like that very much.', 'Only if you promise to tell me about your travels.']), att: 4 }; }
    return { text: pick(['Perhaps another day.', 'People would talk…']), att: -1 };
  } });

  return T;
}
