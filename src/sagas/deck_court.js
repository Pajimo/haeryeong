// Court, politics, diplomacy and rebellion — the deck of palaces, envoys, oaths and gates opened at night.
// Schema and the helper object `c` are documented in ../sagas.js (makeCtx).

const gv = (s, d = 'someone') => s?.name?.given || d;
const fv = (s) => s?.name?.full || gv(s);
const favourOf = (c, s = c.me) => { const k = c.king(); try { return k && s ? (k.getRel?.(s)?.f ?? 0) : 0; } catch { return 0; } };
const relOf = (a, b) => { try { return a && b ? (a.getRel?.(b)?.f ?? 0) : 0; } catch { return 0; } };
const sk = (c, k) => c.me?.skills?.[k] || 0;
const clanName = (c) => c.rival()?.clan || 'rival';
const kingWord = (c) => (c.king() ? fv(c.king()) : 'the throne');
const unmarriedAdult = (c) => c.adults().find((s) => !s.spouse && s.age !== 'elder') || null;

export default [
  // ============================== COURT ==============================
  {
    id: 'court_archery_trial', tag: 'court', title: 'The Royal Archery Trial', cooldown: 10,
    weight: (c) => (sk(c, 'archery') >= 2 ? (c.festival() ? 2.5 : 1) : 0),
    text: (c) => `Heralds nail a notice to the gate of the hwalteo (archery ground): any subject, high or low, may shoot before the King's judges at one hundred and forty-five paces. The sons of great houses laugh to see ${gv(c.me)} in a plain cotton jeogori among the silk. One judge's eyes linger on your purse.`,
    choices: [
      {
        label: 'Draw the bow and trust your arm',
        do: (c) => {
          const p = 0.25 + sk(c, 'archery') * 0.06;
          if (c.chance(p)) { c.coins(80); c.honor(c.me, 12); c.favour(8); c.fame(c.me, 'hunt', 6); c.skill(c.me, 'archery', 1); c.me.say?.('Five arrows, five in the gwanjung!', 'happy'); return `Five shafts hiss into the target's heart. The nobles fall silent; the King himself nods. (+80 nyang, +12 honor, royal favour +8)`; }
          c.honor(c.me, -3); c.skill(c.me, 'archery', 1); c.mood(c.me, 'Missed before the King', -8);
          return `A gust takes your third arrow and the laughter returns. Still, you learned the wind of that field. (-3 honor, archery practice)`;
        },
      },
      {
        label: 'Slip silver to the judge', cost: 40,
        do: (c) => {
          if (c.chance(0.65)) { c.coins(70); c.fame(c.me, 'shadow', 3); c.honor(c.me, -4); return `The judge calls even your wide shots "true". You walk off with the prize purse — and a secret. (+70 nyang, -4 honor)`; }
          c.honor(c.me, -15); c.favour(-6); c.court(c.me, -10); c.crime(c.me, 20, 'bribing a royal judge');
          return `A censor sees the silver change hands. The judge is flogged; you are named in the report. (-15 honor, royal favour -6)`;
        },
      },
      { label: 'Watch from the crowd this year', do: (c) => { c.skill(c.me, 'archery', 1); return `You study the champions' stance and draw. Next year, perhaps. (+archery)`; } },
    ],
  },
  {
    id: 'court_succession', tag: 'court', title: 'Two Heirs, One Throne', cooldown: 12,
    weight: (c) => (c.king() && c.royals().filter((r) => r.job === 'prince' || r.job === 'princess').length >= 2 && c.courtRank() >= 0 ? 1.4 : 0),
    text: (c) => {
      const h = c.royals().filter((r) => r.job === 'prince' || r.job === 'princess'); c.vars.a = h[0]; c.vars.b = h[1];
      return `${kingWord(c)} sets the royal heirs a test: whoever best governs a drought-struck county this season will be named Crown heir. ${fv(c.vars.a)} is bold and generous; ${fv(c.vars.b)} is careful and cold. Both have sent servants to ask where the ${c.me?.name?.surname || 'your'} household stands.`;
    },
    choices: [
      { label: (c) => `Back ${gv(c.vars.a, 'the elder heir')}`, do: (c) => { const a = c.vars.a, b = c.vars.b; c.rel(c.me, a, 20); c.rel(c.me, b, -15); c.backing('east', 8); c.court(c.me, 10); return c.chance(0.5) ? `${gv(a)} wins the people's love and remembers your grain carts. (+relation, +east backing)` : `${gv(a)}'s generosity empties the county stores; your name is tied to the failure. (east backing +8, but ${gv(b)} is cold to you)`; } },
      { label: (c) => `Back ${gv(c.vars.b, 'the younger heir')}`, do: (c) => { const a = c.vars.a, b = c.vars.b; c.rel(c.me, b, 20); c.rel(c.me, a, -15); c.backing('west', 8); c.court(c.me, 10); return `${gv(b)} thanks you with a single dry nod and a ledger entry in your favour. (+relation, +west backing)`; } },
      { label: 'Stay neutral and serve the King alone', do: (c) => { c.favour(5); c.honor(c.me, 4); c.rel(c.me, c.vars.a, -4); c.rel(c.me, c.vars.b, -4); return `You tell both servants the same thing: the household serves the throne, not its heirs. The King hears of it. (royal favour +5)`; } },
    ],
  },
  {
    id: 'court_seal_missing', tag: 'court', title: 'The Missing Seal', cooldown: 14,
    who: (c) => c.adults().find((s) => c.courtRank(s) >= 2) || null,
    weight: (c) => (c.courtRank() >= 2 ? 1 : 0),
    text: (c) => `${gv(c.me)} opens the lacquered box at dawn and finds it empty: the bronze gwanin (seal of office) is gone. Without it no order can be stamped — and with it, a thief can stamp anything in ${gv(c.me)}'s name. The office clerks are already whispering.`,
    choices: [
      { label: 'Report it at once to the Minister', do: (c) => { c.court(c.me, -15); c.honor(c.me, 3); c.favour(-3); c.chain('court_seal_found', 10); return `The Minister's face goes grey, but your honesty is recorded. A search begins. (court rep -15, +3 honor)`; } },
      { label: 'Hunt for it quietly yourself', do: (c) => { if (c.chance(0.45 + sk(c, 'scholarship') * 0.04)) { c.evidence(1); c.court(c.me, 5); return `You trace muddy footprints to a clerk in the ${clanName(c)} household's pay — the seal is under his mat. (+1 evidence)`; } c.chain('court_seal_found', 8); c.mood(c.me, 'Seal still missing', -12); return `Nothing. And each hour you hide it, the danger grows.`; } },
      { label: 'Have a copy carved in secret', cost: 30, do: (c) => { if (c.chance(0.6)) { c.fame(c.me, 'shadow', 3); return `A one-eyed engraver in the market alley cuts a perfect copy. No one need know. (-30 nyang)`; } c.crime(c.me, 40, 'forging a seal of office'); c.court(c.me, -20); return `The engraver sells your secret to the magistrate. Forgery of a royal seal! (-20 court rep)`; } },
    ],
  },
  {
    id: 'court_seal_found', tag: 'court', title: 'The Seal Turns Up', chainOnly: true,
    weight: () => 1,
    text: (c) => `The seal has been found — pressed onto a grain-release order that emptied a county storehouse into private carts. The order bears ${gv(c.me)}'s mark, and the court demands answers.`,
    choices: [
      { label: 'Point to the handwriting — it is not yours', req: (c) => (sk(c, 'scholarship') >= 4 ? true : 'Needs scholarship 4'), do: (c) => { c.evidence(1); c.court(c.me, 15); c.honor(c.me, 5); return `You show the clerks the forger's careless brushstrokes. Cleared, and the culprit's patron exposed. (+1 evidence, +15 court rep)`; } },
      { label: 'Repay the lost grain from your purse', cost: 90, do: (c) => { c.court(c.me, 5); c.favour(4); return `You make the county whole. Expensive, but the King calls it "the act of a true official". (royal favour +4)`; } },
      { label: 'Accept the demotion', do: (c) => { if (c.me.factions?.court) c.me.factions.court.rank = Math.max(0, c.me.factions.court.rank - 1); c.honor(c.me, -8); c.mood(c.me, 'Demoted', -15, 48); return `You are stripped of one rank and sent to a lesser office. (-1 court rank, -8 honor)`; } },
    ],
  },
  {
    id: 'court_council_vote', tag: 'court', title: "The Chieftains' Council", cooldown: 8,
    weight: (c) => (c.courtRank() >= 1 ? 1.4 : 0),
    text: (c) => `The five chieftains and the King's ministers sit cross-legged in the hall of the Hwabaek (council of consensus). ${c.atWar() ? 'With the enemy at the border, the question is whether to raise a war levy.' : 'The question is whether to march north before the enemy grows strong.'} Custom demands every voice be unanimous — and every eye turns to ${gv(c.me)}.`,
    choices: [
      { label: 'Speak for war and glory', do: (c) => { c.backing('east', 6); c.court(c.me, 8); c.fame(c.me, 'blade', 2); c.mood(c.me, 'Roused the hall', 6); return `Your words set the young chieftains drumming the floor. The hawks will remember you. (+east backing)`; } },
      { label: 'Speak for the farmers and a lighter tax', do: (c) => { c.backing('west', 6); c.court(c.me, 8); c.fame(c.me, 'heart', 3); return `The elders murmur approval; the village will hear that someone spoke for them. (+west backing)`; } },
      { label: 'Wait to see which way the King leans', do: (c) => { c.favour(3); c.honor(c.me, -2); return `You echo the King's opinion an instant after he gives it. Safe — and a little shameful. (royal favour +3)`; } },
    ],
  },
  {
    id: 'court_granary_blame', tag: 'court', title: 'The Empty Granary', cooldown: 20,
    weight: (c) => (c.season === 'autumn' && c.king() ? 1.6 : 0),
    text: (c) => `The harvest has failed in three counties. In the old way, when Heaven withholds rice, the people say it is the ruler's virtue that has failed — and a crowd with sickles gathers outside the granary demanding ${kingWord(c)} answer for it.`,
    choices: [
      { label: 'Open your own stores to the crowd', cost: 60, do: (c) => { c.fame(c.me, 'heart', 6); c.honor(c.me, 8); c.favour(4); return `Sacks of your barley calm the crowd. The people bless your house; the palace notes you saved its face. (+8 honor, +heart fame)`; } },
      { label: 'Defend the King before the crowd', do: (c) => { if (c.chance(0.3 + sk(c, 'charisma') * 0.06)) { c.favour(8); c.court(c.me, 10); return `"Heaven tests the King as it tests us all." The crowd grumbles but disperses. (royal favour +8)`; } c.hurt(c.me, 0.25); c.honor(c.me, -4); return `A thrown stone splits your brow. The crowd will not be lectured on empty stomachs.`; } },
      { label: 'Let them shout — it is not your quarrel', do: (c) => { c.favour(-2); return `The crowd breaks the granary door that night. Some say a loyal house would have stepped forward. (royal favour -2)`; } },
    ],
  },
  {
    id: 'court_lowly_birth', tag: 'court', title: 'A Sneer at Your Blood', cooldown: 10,
    who: (c) => c.adults()[Math.floor(Math.random() * Math.max(1, c.adults().length))] || null,
    weight: (c) => (c.standing().tier[2] <= 1 ? 1.4 : 0.4),
    text: (c) => { c.vars.noble = c.rival()?.head && !c.rival().head.dead ? c.rival().head : c.npc(); return `In front of the magistrate's gate, ${c.vars.noble ? fv(c.vars.noble) : 'a silk-robed noble'} flicks a fan toward ${gv(c.me)}: "Since when do the sons of sangmin (commoners) walk where yangban walk? Your grandmother sold radishes." Laughter ripples down the street.`; },
    choices: [
      { label: 'Demand satisfaction with the sword', do: (c) => { const p = 0.3 + sk(c, 'sword') * 0.06; if (c.chance(p)) { c.honor(c.me, 15); c.fame(c.me, 'blade', 5); c.enmity(8); if (c.vars.noble) c.rel(c.me, c.vars.noble, -20); return `Three passes and his fan lies in two pieces in the dust. No one laughs now. (+15 honor, +blade fame)`; } c.hurt(c.me, 0.4); c.honor(c.me, -6); return `He was trained by a palace master. You leave bleeding, your pride worse. (-6 honor)`; } },
      { label: 'Swallow it and bow', do: (c) => { c.honor(c.me, -5); c.mood(c.me, 'Swallowed an insult', -10, 24); c.need(c.me, 'social', -10); return `You bow low. It burns for days, but your house keeps its head. (-5 honor)`; } },
      { label: 'Take the insult to the magistrate', do: (c) => { if (c.chance(0.4 + c.standing().tier[2] * 0.15)) { c.honor(c.me, 8); c.fame(c.me, 'law', 4); c.enmity(5); return `The magistrate fines the noble for disturbing the peace. A small victory, written in ink. (+8 honor, +law fame)`; } c.honor(c.me, -3); return `The magistrate yawns: "Words are not crimes." The noble smirks on his way out.`; } },
    ],
  },
  {
    id: 'court_audience', tag: 'court', title: 'A Royal Audience', cooldown: 12,
    weight: (c) => (c.king() && favourOf(c) >= 30 ? 1.3 : 0),
    text: (c) => `${kingWord(c)} has granted ${gv(c.me)} a private audience beneath the painted rafters of the throne hall. "You have served well," he says. "Ask, and we shall consider it." The eunuch at his shoulder is already counting what the favour will cost.`,
    choices: [
      { label: 'Ask for land (granted as silver)', do: (c) => { const n = Math.round(c.rand(80, 160)); c.coins(n); c.favour(-6); return `A deed to rice paddies, which you lease out at once. (+${n} nyang, royal favour spent -6)`; } },
      { label: 'Ask pardon for a wanted kinsman', req: (c) => (c.hh.some((s) => s.outlaw) ? true : 'No one in your house is wanted'), do: (c) => { const o = c.hh.find((s) => s.outlaw); if (o) { o.outlaw = false; o.bounty = 0; } c.favour(-10); return `The King's brush strokes a single character: 赦 (pardon). ${gv(o)} is free. (royal favour -10)`; } },
      { label: 'Report corruption in the ministry', do: (c) => { c.evidence(1); c.court(c.me, 12); c.enmity(10); c.favour(3); return `The King's eyes narrow at the names you give. An inquiry opens — and your enemies learn who opened it. (+1 evidence, +enmity)`; } },
      { label: 'Ask nothing — "To serve is enough"', do: (c) => { c.favour(10); c.honor(c.me, 6); return `The King laughs, delighted. "A rare subject!" (royal favour +10, +6 honor)`; } },
    ],
  },
  {
    id: 'court_poison_cup', tag: 'court', title: 'The Poisoned Cup', cooldown: 16,
    weight: (c) => (c.courtRank() >= 0 && c.rival() ? 1 + (c.rival().enmity || 0) / 60 : 0),
    text: (c) => `At the spring banquet a servant fills ${gv(c.me)}'s cup with makgeolli. A silver hairpin dipped in it comes out black. Across the table, a member of the ${clanName(c)} clan lifts their own cup, smiling a little too carefully.`,
    choices: [
      { label: 'Accuse the rival clan before the court', do: (c) => { const r = c.rival(); if ((r?.evidence || 0) >= 2 || c.chance(0.35)) { c.evidence(1); c.enmity(15); c.court(c.me, 10); c.honor(c.me, 8); return `The servant breaks under questioning and names the ${clanName(c)} steward. (+1 evidence, +10 court rep)`; } c.honor(c.me, -8); c.court(c.me, -8); c.enmity(10); return `Without proof, your accusation looks like slander. The hall turns cold. (-8 honor)`; } },
      { label: 'Say nothing; investigate after', do: (c) => { if (c.chance(0.55)) { c.evidence(1); return `You pocket the hairpin and follow the servant home that night. A purse with the ${clanName(c)} crest. (+1 evidence)`; } c.chain('court_poison_cup2', 12); return `The servant vanishes before dawn. Someone was cleaning up.`; } },
      { label: 'Feign sickness and flee the banquet', do: (c) => { c.honor(c.me, -3); c.mood(c.me, 'Escaped poison', 5); c.need(c.me, 'fun', -15); return `You stagger out clutching your belly. Alive, at least — and they think the poison worked. (-3 honor)`; } },
    ],
  },
  {
    id: 'court_poison_cup2', tag: 'court', title: 'The Second Cup', chainOnly: true,
    weight: () => 1,
    text: (c) => `A message arrives, unsigned: "The one who poured your wine is in the river. Stop asking." That night, footsteps circle ${gv(c.me)}'s wall.`,
    choices: [
      { label: 'Wait for them with a blade', do: (c) => { c.ambush(c.me, 2, 'Assassin', 5); return `Two figures in black drop from the wall. Fight!`; } },
      { label: 'Hire guards for the week', cost: 50, do: (c) => { c.mood(c.me, 'Guarded', 6, 48); c.enmity(-5); return `Torches burn all night along the wall. The footsteps do not return.`; } },
      { label: 'Burn the message and drop the matter', do: (c) => { c.honor(c.me, -4); c.enmity(-8); return `You let it lie. The ${clanName(c)} clan relax — for now. (-4 honor)`; } },
    ],
  },
  {
    id: 'court_guard_post', tag: 'court', title: 'Captain of the Palace Gate', cooldown: 20,
    who: (c) => c.adults().filter((s) => (s.skills?.sword || 0) >= 5).sort((a, b) => b.skills.sword - a.skills.sword)[0] || null,
    weight: (c) => (c.king() && sk(c, 'sword') >= 5 ? 1 : 0),
    text: (c) => `The commander of the Naegeumwi (palace guard) has watched ${gv(c.me)} spar. "The east gate needs a captain who cannot be bought," he says. "The pay is poor and the hours are long. The honour is not."`,
    choices: [
      { label: 'Accept the post', do: (c) => { c.coins(40); c.favour(8); c.court(c.me, 15); c.honor(c.me, 8); c.fame(c.me, 'blade', 4); c.need(c.me, 'energy', -20); return `You take the red-tasselled spear. (+40 nyang stipend, royal favour +8, +15 court rep)`; } },
      { label: 'Recommend a friend instead', do: (c) => { const f = c.npc(); if (f) { c.rel(c.me, f, 25); return `${fv(f)} weeps with gratitude at the appointment. (+relation)`; } c.honor(c.me, 2); return `The commander shrugs and finds someone else.`; } },
      { label: 'Decline — your place is with the family', do: (c) => { c.need(c.me, 'social', 10); return `The commander frowns but respects it.`; } },
    ],
  },
  {
    id: 'court_physician', tag: 'court', title: "The King's Fever", cooldown: 18,
    who: (c) => c.adults().filter((s) => (s.skills?.scholarship || 0) >= 3 || s.job === 'doctor').sort((a, b) => (b.skills?.scholarship || 0) - (a.skills?.scholarship || 0))[0] || null,
    weight: (c) => (c.king() && (c.king().age === 'elder' || (c.king().hp || 100) < (c.king().maxHp || 100) * 0.7) ? 1.2 : c.king() ? 0.3 : 0),
    text: (c) => { const p = c.royals().find((r) => r.job === 'prince'); c.vars.prince = p; return `${kingWord(c)} burns with fever, and the royal uiwon (physicians) are at a loss. ${gv(c.me)} is summoned with a medicine chest. In the corridor, ${p ? fv(p) : 'a prince'} catches your sleeve: "Do not hurry the cure," he whispers. "Father has ruled long enough."`; },
    choices: [
      { label: 'Treat him honestly and well', do: (c) => { if (c.chance(0.4 + sk(c, 'scholarship') * 0.05)) { const k = c.king(); if (k) c.heal(k); c.favour(15); c.honor(c.me, 10); if (c.vars.prince) c.rel(c.me, c.vars.prince, -15); return `By the third night the fever breaks. The King grips your wrist: "We owe you our life." (royal favour +15)`; } c.favour(2); return `You do all you can; the fever lingers but does not worsen. The King notes your care. (royal favour +2)`; } },
      { label: "Slow the cure, as the prince asks", do: (c) => { if (c.vars.prince) c.rel(c.me, c.vars.prince, 30); c.honor(c.me, -12); c.backing('east', 10); if (c.chance(0.3)) { c.favour(-20); c.crime(c.me, 60, 'treason against the royal person'); return `A court lady sees you water the decoction. Treason! (-20 favour, wanted)`; } return `The fever drags on for weeks. The prince smiles at you in the corridors now. (-12 honor, +east backing)`; } },
      { label: 'Refuse the summons — too dangerous', do: (c) => { c.favour(-6); c.court(c.me, -5); return `Physicians who fail kings lose their heads. You keep yours — and lose favour. (royal favour -6)`; } },
    ],
  },

  // ============================== POLITICS ==============================
  {
    id: 'pol_forged_letter', tag: 'politics', title: 'A Letter You Never Wrote', cooldown: 20,
    weight: (c) => ((c.rival()?.enmity || 0) >= 60 || c.atWar() ? 1.2 : 0),
    text: (c) => `Soldiers of the Uigeumbu (State Tribunal) hammer at the gate holding a letter in ${gv(c.me)}'s hand, addressed to the enemy court and promising to open the northern pass. The brushwork is good — very good. Someone wants your household's heads on the city wall.`,
    choices: [
      { label: 'Submit to arrest and demand a trial', do: (c) => { c.honor(c.me, 5); c.mood(c.me, 'Accused of treason', -20, 48); c.chain('pol_forger_found', 8); return `You walk out with your hands bound and your back straight. The trial is set. (+5 honor)`; } },
      { label: 'Bribe the tribunal clerk to lose it', cost: 120, do: (c) => { if (c.chance(0.6)) { c.honor(c.me, -5); return `The letter "falls" into a brazier. The case is closed for lack of evidence.`; } c.crime(c.me, 80, 'bribing the State Tribunal'); return `The clerk takes the silver and reports you anyway. Now it is bribery AND treason.`; } },
      { label: 'Flee to the hills', do: (c) => { c.crime(c.me, 100, 'treason (fled arrest)'); c.honor(c.me, -15); c.favour(-15); c.enmity(-10); return `Flight looks like guilt. The ${clanName(c)} clan toast your ruin. (wanted, royal favour -15)`; } },
    ],
  },
  {
    id: 'pol_forger_found', tag: 'politics', title: 'The Forger', chainOnly: true,
    weight: () => 1,
    text: (c) => `On the eve of the trial a household servant brings news: a calligrapher in the paper-makers' lane was paid in new silver to copy ${gv(c.me)}'s hand. He is packing to leave town.`,
    choices: [
      { label: 'Seize him and drag him before the judges', do: (c) => { if (c.chance(0.5 + sk(c, 'sword') * 0.04)) { c.evidence(2); c.honor(c.me, 12); c.favour(8); c.fame(c.me, 'law', 6); return `The forger confesses all, naming his patron. The tribunal frees you with apologies. (+2 evidence, +12 honor)`; } c.ambush(c.me, 2, "Forger's hired blade", 5); return `He has hired guards — they turn on you in the lane!`; } },
      { label: 'Pay him to recant', cost: 60, do: (c) => { c.honor(c.me, 4); c.favour(3); return `For sixty nyang he swears the letter was a "practice piece". You go free, though doubts remain.`; } },
      { label: 'Let the trial take its course', do: (c) => { if (c.chance(0.5)) { c.honor(c.me, 6); return `The judges find the brushwork "suspicious" and acquit — barely.`; } c.honor(c.me, -12); c.favour(-10); c.coins(-80); return `Found guilty of "careless correspondence". Heavy fine and a stain on the family name. (-80 nyang, -12 honor)`; } },
    ],
  },
  {
    id: 'pol_marriage_alliance', tag: 'politics', title: 'A Great Clan Proposes', cooldown: 25,
    who: (c) => unmarriedAdult(c),
    weight: (c) => (unmarriedAdult(c) ? 0.8 + c.standing().tier[2] * 0.3 : 0),
    text: (c) => `A matchmaker (jungmae) arrives in a palanquin bearing the crest of one of the five great clans. Their ${c.me?.sex === 'f' ? 'second son' : 'eldest daughter'} is of age, and they find ${gv(c.me)} "of promising character". A wild goose carved of wood — the token of a betrothal — rests in her hands.`,
    choices: [
      { label: 'Accept the alliance', do: (c) => { const sp = c.newcomer({ sex: c.me.sex === 'f' ? 'm' : 'f', age: 'adult' }); c.adopt(sp); if (sp) { c.rel(c.me, sp, 30, 20); try { c.me.spouse = sp; sp.spouse = c.me; } catch { /* ignore */ } } c.coins(120); c.backing('east', 10); c.backing('west', 10); c.fame(c.me, 'heart', 5); return `A wedding of silk and drums. ${sp ? gv(sp) : 'Your new spouse'} joins the household with a dowry and powerful in-laws. (+120 nyang, +backing)`; } },
      { label: 'Negotiate a richer dowry', req: (c) => (sk(c, 'charisma') >= 4 ? true : 'Needs charisma 4'), do: (c) => { if (c.chance(0.5)) { c.coins(180); c.backing('east', 5); return `The clan grumbles, then pays — but the match is postponed while the families haggle. (+180 nyang in gifts)`; } c.honor(c.me, -5); return `"We are not fishmongers!" The matchmaker leaves in a huff. (-5 honor)`; } },
      { label: 'Decline with courtesy', do: (c) => { c.honor(c.me, 2); c.court(c.me, -3); return `You send back the wooden goose with a poem of regret. They are cool, but not offended.`; } },
    ],
  },
  {
    id: 'pol_spy_household', tag: 'politics', title: 'A Spy Under the Roof', cooldown: 15,
    weight: (c) => (c.rival() && c.courtRank() >= 0 ? 1.1 : c.rival() ? 0.6 : 0),
    text: (c) => `Your letters have been read — the seals lifted and pressed down again with a warm knife. Only someone inside the walls could manage it. The new kitchen girl, the old gatekeeper, the water-carrier who lingers too long: one of them sells your secrets to the ${clanName(c)} clan.`,
    choices: [
      { label: 'Set a trap with a false letter', do: (c) => { if (c.chance(0.6)) { c.evidence(1); c.chain('pol_spy_master', 6); return `The false letter vanishes overnight — and the water-carrier's sandals are wet with ink. You have your spy. (+1 evidence)`; } return `The trap catches nothing. Whoever it is, they are careful.`; } },
      { label: 'Interrogate the servants harshly', do: (c) => { c.honor(c.me, -4); for (const s of c.hh) c.mood(s, 'Fear in the house', -6, 24); if (c.chance(0.5)) { c.evidence(1); return `The gatekeeper breaks down weeping and confesses. (+1 evidence, the household is shaken)`; } return `Tears and denials, nothing more. The house feels colder.`; } },
      { label: 'Feed the spy lies', req: (c) => (sk(c, 'scholarship') >= 3 || sk(c, 'charisma') >= 4 ? true : 'Needs scholarship 3 or charisma 4'), do: (c) => { c.enmity(-5); c.evidence(1); c.fame(c.me, 'shadow', 4); return `You let the spy "discover" a plan that does not exist. The ${clanName(c)} clan waste a season chasing it. (+1 evidence)`; } },
    ],
  },
  {
    id: 'pol_spy_master', tag: 'politics', title: "The Spymaster's Offer", chainOnly: true,
    weight: () => 1,
    text: (c) => `With the spy caught, a stranger in a wide gat hat comes to your gate at dusk. "My employer would like the boy back unharmed," he says, setting down a heavy purse. "And would like to forget this happened."`,
    choices: [
      { label: 'Take the purse; return the spy', do: (c) => { c.coins(70); c.enmity(-10); c.honor(c.me, -3); return `Silver and a truce of sorts. (+70 nyang, enmity -10)`; } },
      { label: 'Hand the spy to the magistrate', do: (c) => { c.evidence(1); c.enmity(12); c.fame(c.me, 'law', 4); return `The spy talks in the magistrate's cellar. (+1 evidence, enmity rises)`; } },
    ],
  },
  {
    id: 'pol_exile', tag: 'politics', title: 'Sentence of Exile', cooldown: 15,
    who: (c) => c.hh.find((s) => s.outlaw && s.age !== 'child') || null,
    weight: (c) => (c.me?.outlaw ? 1.5 : 0),
    text: (c) => `The magistrate's runner reads the decree aloud at the well: ${fv(c.me)} is sentenced to yubae (exile) on a distant island for crimes against the peace. Unless the household can change minds, the boat leaves with the tide.`,
    choices: [
      { label: 'Pay the fine in lieu of exile', cost: 100, do: (c) => { c.me.outlaw = false; c.me.bounty = 0; c.honor(c.me, -3); return `The sentence is commuted. Expensive, but the family stays whole.`; } },
      { label: 'Petition the King for mercy', req: (c) => (c.king() && favourOf(c, c.hh[0]) >= 20 ? true : 'Needs royal favour 20'), do: (c) => { if (c.chance(0.6)) { c.me.outlaw = false; c.me.bounty = 0; c.favour(-8, c.hh[0]); return `The King commutes the sentence to a year's house arrest. (royal favour -8)`; } c.favour(-4, c.hh[0]); return `The petition is returned unread. The sentence stands.`; } },
      { label: 'Hide them in the mountains', do: (c) => { c.crime(c.me, 40, 'evading exile'); c.mood(c.me, 'Living in hiding', -10, 48); return `A cave above the waterfall becomes a second home. The bounty grows.`; } },
    ],
  },
  {
    id: 'pol_clan_decree', tag: 'politics', title: 'Decree of the Five Clans', cooldown: 25, once: false,
    weight: (c) => (c.king() ? 0.8 : 0),
    text: (c) => `A royal decree is read at every crossroads: the old five-clan system is to be reorganised. Small households must register under a great clan — paying it a tithe — or petition to be recognised as a clan of their own, which costs dearly.`,
    choices: [
      { label: 'Register under a great clan', do: (c) => { c.coins(-30); c.backing('east', 6); c.backing('west', 6); c.honor(c.me, -2); return `You pay the tithe and gain a patron. (-30 nyang, +backing)`; } },
      { label: 'Petition to found your own clan', cost: 120, req: (c) => (c.standing().tier[2] >= 1 ? true : 'Needs a respectable house'), do: (c) => { c.honor(c.me, 15); c.fame(c.me, 'law', 6); c.court(c.me, 10); return `The scribes enter your surname in the register of clans. Your descendants will bow to this day. (+15 honor)`; } },
      { label: 'Ignore it and hope they forget', do: (c) => { if (c.chance(0.5)) return `The decree drowns in paperwork. Nobody comes.`; c.coins(-40); return `A tax inspector comes after all, with a fine for non-registration. (-40 nyang)`; } },
    ],
  },
  {
    id: 'pol_hostage_prince', tag: 'politics', title: 'The Hostage Prince', cooldown: 30, once: true,
    weight: (c) => (c.courtRank() >= 1 && c.standing().tier[2] >= 1 ? 0.8 : 0),
    text: (c) => `By treaty, a young prince of a neighbouring kingdom must live as a hostage in the capital — and the court chooses your household to lodge him. He is fifteen, sharp-eyed, homesick, and certainly reporting to someone.`,
    choices: [
      { label: 'Treat him as a son', do: (c) => { const p = c.newcomer({ sex: 'm', age: 'young', job: 'scholar' }); if (p) { c.adopt(p); c.rel(c.me, p, 30); } c.favour(5); c.fame(c.me, 'heart', 4); c.vars.p = p; return `He eats at your table and, slowly, laughs there. One day he may rule a kingdom that remembers this kindness. (new household member)`; } },
      { label: 'Keep him under strict guard', do: (c) => { c.favour(8); c.court(c.me, 8); return `Locked doors and watchful servants. The court approves of your caution. (royal favour +8)`; } },
      { label: 'Pass the burden to another house', cost: 40, do: (c) => { c.court(c.me, -5); return `A few gifts in the right sleeves and the boy lodges elsewhere. (-5 court rep)`; } },
    ],
  },
  {
    id: 'pol_rumour_child', tag: 'politics', title: 'Poison in the Well-Talk', cooldown: 12,
    who: (c) => c.hh.filter((s) => s.age === 'young' || s.age === 'child').sort(() => Math.random() - 0.5)[0] || null,
    weight: (c) => (c.rival() ? 1 : 0.3),
    text: (c) => `At the washing stones the women whisper that ${gv(c.me)} ${c.me?.sex === 'f' ? 'meets a peddler at night behind the mill' : 'steals from the temple offering box'}. It is a lie, carefully planted — and lies grow faster than rice in the rainy season.`,
    choices: [
      { label: 'Confront the gossips publicly', do: (c) => { if (c.chance(0.5)) { c.honor(c.me, 6); return `The gossips stammer and cannot name their source. The rumour dies of embarrassment. (+6 honor)`; } c.honor(c.me, -4); return `Shouting only proves to some that there is something to hide. (-4 honor)`; } },
      { label: 'Trace the rumour to its source', do: (c) => { if (c.chance(0.55)) { c.evidence(1); c.enmity(5); return `Three mouths back, the story started with a ${clanName(c)} maid. (+1 evidence)`; } return `The trail goes cold at the tavern.`; } },
      { label: 'Let good deeds answer it', do: (c) => { c.coins(-20); c.fame(c.me, 'heart', 3); c.honor(c.me, 3); c.mood(c.me, 'Slandered', -6, 24); return `${gv(c.me)} carries rice to the widows' houses all week. The village decides for itself. (-20 nyang, +3 honor)`; } },
    ],
  },
  {
    id: 'pol_regent', tag: 'politics', title: 'The Regent Ascendant', cooldown: 25,
    weight: (c) => { const k = c.king(); return k && (k.age === 'elder' || (k.hp || 100) < (k.maxHp || 100) * 0.5) && c.courtRank() >= 0 ? 1 : 0; },
    text: (c) => `${kingWord(c)} sleeps more than he rules now, and the Queen Dowager's brother has begun signing edicts "on His Majesty's behalf". Officials who once bowed to the throne bow lower to the regent's door. He has asked to see ${gv(c.me)}.`,
    choices: [
      { label: "Kneel to the regent", do: (c) => { c.court(c.me, 15); c.coins(50); c.honor(c.me, -6); c.favour(-5); return `Gold and promotion flow to those who kneel. The old King, when lucid, will remember. (+50 nyang, +15 court rep, -6 honor)`; } },
      { label: 'Stay loyal to the King alone', do: (c) => { c.favour(8); c.honor(c.me, 6); c.court(c.me, -8); return `Your petitions stall on the regent's desk. But loyalty is a long investment. (royal favour +8)`; } },
      { label: 'Quietly gather the loyalists', do: (c) => { c.backing('west', 10); c.fame(c.me, 'shadow', 4); if (c.chance(0.2)) { c.ambush(c.me, 2, "Regent's man", 6); return `The regent has eyes everywhere. Two of his men waylay you!`; } return `Tea houses, temples, hunting parties: a quiet faction grows. (+west backing)`; } },
    ],
  },

  // ============================== DIPLOMACY ==============================
  {
    id: 'dip_tribute_envoy', tag: 'diplomacy', title: 'The Imperial Envoy', cooldown: 20,
    weight: (c) => (c.king() ? 0.9 : 0),
    text: (c) => `An envoy of the Han empire rides in under yellow banners, his horses better fed than your neighbours. The emperor demands tribute: fox furs, mountain ginseng — and young men and women to serve in the imperial palace. Every great house must contribute its share.`,
    choices: [
      { label: 'Give furs and ginseng', req: (c) => (c.hh.some((s) => (s.inv?.ginseng || 0) + (s.inv?.foxFur || 0) + (s.inv?.tigerPelt || 0) > 0) ? true : 'You have no furs or ginseng'), do: (c) => { const s = c.hh.find((x) => (x.inv?.ginseng || 0) + (x.inv?.foxFur || 0) + (x.inv?.tigerPelt || 0) > 0); if (s) { const k = (s.inv.ginseng > 0 && 'ginseng') || (s.inv.foxFur > 0 && 'foxFur') || 'tigerPelt'; c.item(s, k, -1); } c.favour(8); c.court(c.me, 6); return `The envoy weighs your gift and nods. The King is spared embarrassment. (royal favour +8)`; } },
      { label: 'Pay silver instead', cost: 70, do: (c) => { c.favour(5); return `Silver is less romantic than ginseng, but it spends. (royal favour +5)`; } },
      { label: 'Hide the village youth from the envoy', do: (c) => { c.fame(c.me, 'heart', 6); if (c.chance(0.35)) { c.favour(-10); c.honor(c.me, 5); return `The envoy notices the empty houses and complains to the King. Your village loves you; the palace does not. (royal favour -10)`; } c.honor(c.me, 8); return `The young ones spend a week in the bamboo groves. The envoy leaves none the wiser. (+8 honor)`; } },
    ],
  },
  {
    id: 'dip_interpreter', tag: 'diplomacy', title: 'Words Between Kingdoms', cooldown: 14,
    who: (c) => c.adults().filter((s) => (s.skills?.scholarship || 0) >= 5).sort((a, b) => b.skills.scholarship - a.skills.scholarship)[0] || null,
    weight: (c) => (sk(c, 'scholarship') >= 5 ? 1.1 : 0),
    text: (c) => `The court's yeokgwan (interpreter) has fallen from his horse, and an envoy from across the sea waits in the guest hall. ${gv(c.me)} is the only person in the district who reads classical characters well enough. Every word you choose will shape what two kings believe of each other.`,
    choices: [
      { label: 'Translate faithfully', do: (c) => { c.coins(50); c.court(c.me, 12); c.skill(c.me, 'scholarship', 1); c.fame(c.me, 'law', 4); return `Two days of careful speech. Both sides leave satisfied. (+50 nyang, +12 court rep)`; } },
      { label: "Soften the envoy's insults", do: (c) => { c.favour(8); c.honor(c.me, 2); c.skill(c.me, 'charisma', 1); return `"Your king is a barbarian" becomes "Your king is vigorous." War is avoided over lunch. (royal favour +8)`; } },
      { label: 'Slant it in favour of your patrons', do: (c) => { c.backing(c.chance(0.5) ? 'east' : 'west', 12); c.fame(c.me, 'shadow', 4); if (c.chance(0.25)) { c.honor(c.me, -15); c.favour(-12); return `A second interpreter catches your "errors". Disgrace. (-15 honor)`; } return `A word here and there, and a trade concession lands with your friends. (+backing)`; } },
    ],
  },
  {
    id: 'dip_treaty_feast', tag: 'diplomacy', title: 'The Border Treaty Feast', cooldown: 18,
    weight: (c) => (c.courtRank() >= 1 ? (c.atWar() ? 1.4 : 0.8) : 0),
    text: (c) => `Envoys of two kingdoms sit across a low table laden with grilled pheasant and pine-nut porridge, to fix the border at the river. ${gv(c.me)} is among the hosts. A hard-faced officer in your own army murmurs that a broken treaty would mean glory — and plunder — for brave men.`,
    choices: [
      { label: 'Host with grace and keep the peace', do: (c) => { c.favour(6); c.court(c.me, 10); c.fame(c.me, 'heart', 3); c.honor(c.me, 4); return `Toasts are drunk, the border is drawn. Peace, for a few seasons. (royal favour +6)`; } },
      { label: 'Sabotage the talks', do: (c) => { if (c.chance(0.5)) { c.backing('east', 12); c.fame(c.me, 'shadow', 5); return `A "careless" remark about the envoy's mother, and the table overturns. The hawks are grateful. (+east backing)`; } c.favour(-15); c.honor(c.me, -10); c.crime(c.me, 50, 'sabotaging a royal treaty'); return `You are seen tampering with the treaty scroll. (-15 favour, wanted)`; } },
      { label: 'Report the officer to the King', do: (c) => { c.favour(8); c.enmity(3); c.backing('east', -5); return `The officer is removed from his post, cursing your name. (royal favour +8)`; } },
    ],
  },
  {
    id: 'dip_coastal_tribute', tag: 'diplomacy', title: 'Tribute from the Coast', cooldown: 18,
    weight: (c) => (c.courtRank() >= 4 ? 1.2 : 0),
    text: (c) => `The sea tribes of the eastern coast arrive with dried abalone, salt, and pearls in lacquered boxes — tribute for the King, routed through ${gv(c.me)}'s office. The chief's son kneels, but his eyes are proud. Some officials skim a little from every box.`,
    choices: [
      { label: 'Deliver every pearl to the throne', do: (c) => { c.favour(8); c.honor(c.me, 6); c.fame(c.me, 'law', 3); return `The King is pleased; the coast tribes see an honest official. (royal favour +8, +6 honor)`; } },
      { label: 'Skim a tenth for yourself', do: (c) => { c.coins(Math.round(c.rand(60, 110))); c.honor(c.me, -6); if (c.chance(0.2)) { c.crime(c.me, 60, 'embezzling tribute'); c.court(c.me, -15); return `An auditor counts the pearls twice. Embezzlement! (wanted)`; } return `A few pearls fall into your sleeve. No one counts. (silver gained, -6 honor)`; } },
      { label: "Honour the chief's son at your own table", cost: 30, do: (c) => { c.fame(c.me, 'trade', 6); c.coins(60); return `Over soju he promises your house first pick of next year's catch. (+trade fame, +60 nyang in goods)`; } },
    ],
  },
  {
    id: 'dip_refugee_noble', tag: 'diplomacy', title: 'A Noble Begs Asylum', cooldown: 20,
    weight: () => 0.8,
    text: () => `At midnight a woman in torn silk falls through your gate, a child in her arms and soldiers' torches on the hill behind her. She is the widow of a lord from the next kingdom, purged in a palace coup. "Hide us," she begs, "and my family will never forget."`,
    choices: [
      { label: 'Take her into the household', do: (c) => { const s = c.newcomer({ sex: 'f', age: 'adult' }); if (s) { c.adopt(s); c.rel(c.me, s, 30); } c.honor(c.me, 10); c.fame(c.me, 'heart', 5); if (c.chance(0.35)) { c.ambush(c.me, 2, 'Foreign soldier', 5); return `You bar the gate — and the soldiers come over the wall!`; } return `The torches pass by. She and her child join your house. (+10 honor, new member)`; } },
      { label: 'Hand her to the magistrate', do: (c) => { c.favour(4); c.honor(c.me, -8); c.mood(c.me, 'Turned away the desperate', -10, 48); return `Proper procedure. You cannot sleep that night. (royal favour +4, -8 honor)`; } },
      { label: 'Give her silver and a guide south', cost: 40, do: (c) => { c.honor(c.me, 6); c.fame(c.me, 'heart', 2); return `She vanishes into the southern hills with your blessing. (+6 honor)`; } },
    ],
  },
  {
    id: 'dip_horse_lords', tag: 'diplomacy', title: 'Riders from the Steppe', cooldown: 18,
    weight: (c) => (c.atWar() ? 1.2 : 0),
    text: (c) => `Horse-lords from beyond the northern rivers camp outside town — felt tents, a thousand shaggy ponies, archers who can shoot backwards at a gallop. Their khan offers to ride against your enemy, for a price. He wants a guest from a respected house to seal the pact with blood and mare's milk.`,
    choices: [
      { label: 'Drink the oath with the khan', do: (c) => { c.favour(10); c.fame(c.me, 'blade', 5); c.need(c.me, 'energy', -25); c.skill(c.me, 'archery', 1); return `Three nights of feasting, wrestling and horse races. The khan calls you anda (sworn brother). (royal favour +10)`; } },
      { label: 'Haggle over their price', req: (c) => (sk(c, 'charisma') >= 4 ? true : 'Needs charisma 4'), do: (c) => { c.coins(60); c.court(c.me, 10); c.fame(c.me, 'trade', 4); return `You talk the khan down by a third and pocket a broker's fee. (+60 nyang)`; } },
      { label: 'Warn the court: they will turn on us', do: (c) => { if (c.chance(0.5)) { c.favour(8); c.honor(c.me, 4); return `Scouts confirm the khan was also talking to the enemy. Your caution is praised.`; } c.favour(-4); return `The pact goes ahead without you; the khan rides well. You look timid. (royal favour -4)`; } },
    ],
  },
  {
    id: 'dip_gift_exchange', tag: 'diplomacy', title: 'A Gift Requires a Gift', cooldown: 10,
    weight: (c) => (c.courtRank() >= 0 || c.standing().tier[2] >= 1 ? 1 : 0.3),
    text: (c) => { const n = c.npc(); c.vars.giver = n; return `${n ? fv(n) : 'A neighbouring lord'} has sent ${gv(c.me)} a celadon vase glazed the colour of a kingfisher's wing. Etiquette is merciless: return a lesser gift and you insult; an equal one and you are merely correct; a greater one and you assert precedence — or debt.`; },
    choices: [
      { label: 'Return a greater gift', cost: 80, do: (c) => { if (c.vars.giver) c.rel(c.me, c.vars.giver, 20); c.honor(c.me, 8); c.court(c.me, 6); return `A painted folding screen goes back, and the whole district talks of your generosity. (+8 honor)`; } },
      { label: 'Return an equal gift', cost: 35, do: (c) => { if (c.vars.giver) c.rel(c.me, c.vars.giver, 8); c.honor(c.me, 2); return `A fine inkstone, perfectly correct. Nothing gained, nothing lost.`; } },
      { label: 'Return a lesser gift', do: (c) => { c.coins(-5); if (c.vars.giver) c.rel(c.me, c.vars.giver, -15); c.honor(c.me, -5); return `A basket of dried persimmons. The sender's servants titter. (-5 honor)`; } },
    ],
  },

  // ============================== REBELLION ==============================
  {
    id: 'reb_hill_displaced', tag: 'rebellion', title: 'The Displaced of the Hills', cooldown: 16,
    weight: (c) => (c.atWar() || c.bandits() > 0 ? 1.1 : 0.5),
    text: () => `In the pine hills above the valley, families burned out by war and tax-collectors live in bark lean-tos. They are hungry and furious, and some have taken up spears. Their spokesman, a scarred former soldier, says they would follow anyone who fed them.`,
    choices: [
      { label: 'Feed them and form a band', cost: 60, do: (c) => { const s = c.newcomer({ sex: 'm', age: 'adult', job: 'swordsman' }); if (s) { c.adopt(s); c.skill(s, 'sword', 3); c.rel(c.me, s, 35); } c.fame(c.me, 'heart', 6); c.fame(c.me, 'blade', 2); return `The scarred soldier swears himself to your house; the others become your eyes in the hills. (new swordsman, +fame)`; } },
      { label: 'Link them to the mercenary trade', req: (c) => (c.mercs() > 0 || c.company() ? true : 'You have no mercenary contacts'), do: (c) => { c.coins(40); c.fame(c.me, 'shadow', 4); return `You broker them into a sword-company. They eat; you take a fee. (+40 nyang)`; } },
      { label: 'Report them to the garrison', do: (c) => { c.favour(5); c.honor(c.me, -6); c.fame(c.me, 'heart', -3); return `Soldiers clear the hills. Order is kept, and the valley calls you hard-hearted. (royal favour +5, -6 honor)`; } },
    ],
  },
  {
    id: 'reb_oath_brotherhood', tag: 'rebellion', title: 'The Peach-Grove Oath', cooldown: 30, once: true,
    weight: (c) => { const f = c.npc((s) => relOf(c.me, s) >= 30); return f ? 1 : 0; },
    text: (c) => { const f = c.npc((s) => relOf(c.me, s) >= 30) || c.npc(); c.vars.f = f; return `Under blossoming trees, ${f ? fv(f) : 'your oldest friend'} cuts a palm and offers ${gv(c.me)} the knife. "Born on different days, let us die on the same one." Sworn brotherhood (uihyeongje) binds harder than blood — in wealth, in vengeance, in rebellion.`; },
    choices: [
      { label: 'Swear the blood oath', do: (c) => { const f = c.vars.f; if (f) { c.rel(c.me, f, 40, 0); c.memory(c.me, f, `${gv(f)} and I swore brotherhood under the peach trees`, 20); } c.honor(c.me, 6); c.mood(c.me, 'Sworn sibling', 15, 48); return `Blood mingles over a bowl of wine. You will never stand alone again. (+relation, +6 honor)`; } },
      { label: 'Invite them to live under your roof', do: (c) => { const f = c.vars.f; if (f) { c.adopt(f); c.rel(c.me, f, 30); } return f ? `${gv(f)} moves in as a sworn sibling of the household.` : `The friend is moved, but has nowhere to come from.`; } },
      { label: 'Decline — oaths are dangerous', do: (c) => { if (c.vars.f) c.rel(c.me, c.vars.f, -10); return `The blossoms fall in silence. The friendship cools.`; } },
    ],
  },
  {
    id: 'reb_hidden_army', tag: 'rebellion', title: 'Soldiers in the Valley of Mist', cooldown: 20,
    weight: (c) => (c.mercs() >= 3 || c.company() ? 1.1 : 0),
    text: () => `Your hired swords have grown into something more: they drill each dawn in a hidden valley where mist pools until noon, practising formation and spear-wall like a royal army. A woodcutter has seen them. Hidden armies are hanging offences.`,
    choices: [
      { label: 'Pay the woodcutter for silence', cost: 30, do: (c) => { c.fame(c.me, 'shadow', 4); return `The woodcutter will see nothing more, ever. (Only that he is richer.)`; } },
      { label: 'Train harder — they must be ready', do: (c) => { c.skill(c.me, 'sword', 1); c.fame(c.me, 'blade', 4); if (c.chance(0.3)) { c.crime(c.me, 60, 'raising a private army'); return `Royal scouts find the camp. Your name is on a warrant. (wanted)`; } return `By the end of the month they move as one. (+sword, +blade fame)`; } },
      { label: 'Offer the force to the King', do: (c) => { c.favour(12); c.court(c.me, 15); c.fame(c.me, 'law', 3); return `"A loyal subject raises soldiers for the throne!" The King enlists them under your command. (royal favour +12)`; } },
    ],
  },
  {
    id: 'reb_new_settlement', tag: 'rebellion', title: 'A Town Beyond the River', cooldown: 40, once: true,
    weight: (c) => (c.standing().tier[2] >= 1 && c.wealth() >= 150 ? 0.6 : 0),
    text: (c) => `Beyond the river lies a broad plain — good water, fertile soil, no lord. Restless families keep asking ${gv(c.me)} to lead them there and found a new town, free of the old clans. Kingdoms have started this way.`,
    choices: [
      { label: 'Fund the founding', cost: 150, do: (c) => { c.fame(c.me, 'heart', 10); c.fame(c.me, 'law', 8); c.honor(c.me, 15); c.favour(-5); c.log(`${fv(c.me)} has founded a new settlement beyond the river.`, 'story'); return `Palisades rise, a well is dug, and the settlers name the square after your house. Your fame spreads to the capital. (+15 honor, great fame)`; } },
      { label: 'Ask the King to charter it', req: (c) => (c.king() ? true : 'There is no king to ask'), do: (c) => { if (c.chance(0.5)) { c.favour(6); c.fame(c.me, 'law', 6); c.coins(-60); return `The King grants a charter — and a royal tax collector. (-60 nyang, +law fame)`; } c.favour(-4); return `"No new towns without royal blood at their head." Refused.`; } },
      { label: 'Stay where you are', do: () => `The families go without you. You hear later they did well.` },
    ],
  },
  {
    id: 'reb_unite_chiefs', tag: 'rebellion', title: 'Five Chiefs, One Fire', cooldown: 25,
    weight: (c) => (sk(c, 'charisma') >= 4 || c.standing().tier[2] >= 2 ? 0.9 : 0),
    text: (c) => `The headmen of five scattered villages have quarrelled for generations over water and pasture. A bandit plague now threatens them all. They agree to meet at ${gv(c.me)}'s fire — if ${gv(c.me)} can keep them from killing each other long enough to agree.`,
    choices: [
      { label: 'Broker a pact of mutual defence', do: (c) => { const p = 0.3 + sk(c, 'charisma') * 0.06; if (c.chance(p)) { c.fame(c.me, 'law', 8); c.backing('west', 8); c.honor(c.me, 10); return `By dawn they share one cup. The five villages will answer your call. (+10 honor, +law fame)`; } c.honor(c.me, -4); return `Old grudges win; two headmen leave with daggers half-drawn. (-4 honor)`; } },
      { label: 'Win them with a hunt and a feast', cost: 50, do: (c) => { c.fame(c.me, 'hunt', 5); c.fame(c.me, 'heart', 4); c.court(c.me, 5); return `A boar on the spit loosens tongues. Not a pact — but friendship. (+fame)`; } },
      { label: 'Lead them against the bandits yourself', req: (c) => (sk(c, 'sword') >= 4 ? true : 'Needs sword 4'), do: (c) => { c.fame(c.me, 'blade', 6); c.ambush(c.me, 3, 'Bandit', 4); return `You ride at the head of the villagers. The bandits come screaming out of the trees!`; } },
    ],
  },
  {
    id: 'reb_tax_uprising', tag: 'rebellion', title: 'Sickles Against the Tax', cooldown: 18,
    weight: (c) => (c.season === 'autumn' || c.season === 'winter' ? 1.2 : 0.5),
    text: (c) => `The tax collectors demanded three measures of rice where the law allows one. Now the farmers have tied white cloths on their heads and marched on the magistrate's yamen with sickles and flails. They want ${gv(c.me)} to stand with them.`,
    choices: [
      { label: 'Lead the uprising', do: (c) => { c.fame(c.me, 'heart', 8); c.backing('west', 6); c.favour(-10); if (c.chance(0.4)) { c.crime(c.me, 70, 'leading a peasant revolt'); return `The yamen gates fall and the tax ledgers burn — and your name heads the arrest list. (wanted, royal favour -10)`; } c.honor(c.me, 8); return `The magistrate flees; the excess tax is cancelled. The farmers carry you on their shoulders. (+8 honor)`; } },
      { label: 'Help the soldiers suppress it', do: (c) => { c.favour(8); c.court(c.me, 10); c.honor(c.me, -8); c.fame(c.me, 'heart', -4); c.hurt(c.me, 0.15); return `The crowd scatters before the spears. The court commends you; the village spits. (royal favour +8, -8 honor)`; } },
      { label: 'Mediate between farmers and magistrate', do: (c) => { const p = 0.35 + sk(c, 'charisma') * 0.05; if (c.chance(p)) { c.fame(c.me, 'law', 6); c.honor(c.me, 10); c.favour(3); return `The tax returns to its lawful measure; no one hangs. Both sides grudgingly thank you. (+10 honor)`; } c.honor(c.me, -3); return `Neither side listens. The soldiers clear the square at dusk. (-3 honor)`; } },
    ],
  },
  {
    id: 'reb_coup_gate', tag: 'rebellion', title: 'Open the West Gate', cooldown: 30,
    weight: (c) => (c.king() && c.courtRank() >= 1 ? 0.7 : 0),
    text: (c) => `A cloaked general meets ${gv(c.me)} in a teahouse back-room. "In three nights we move against ${kingWord(c)}," he says. "You hold the key to the west gate. Open it at the hour of the rat, and you will be a minister in the new reign. Refuse — and forget you ever saw my face."`,
    choices: [
      { label: 'Join the plot', do: (c) => { c.vars.side = 'join'; c.flag('coup_side', 'join'); c.fame(c.me, 'shadow', 6); c.chain('reb_coup_night', 18); return `You take the general's hand. Three nights to wait.`; } },
      { label: 'Betray the plotters to the King', do: (c) => { c.flag('coup_side', 'betray'); c.favour(18); c.court(c.me, 20); c.honor(c.me, 6); c.chain('reb_coup_night', 18); return `By morning the general is in chains. The King summons you, red-eyed: "We will not forget." (royal favour +18)`; } },
      { label: 'Refuse and stay silent', do: (c) => { c.flag('coup_side', 'silent'); c.mood(c.me, 'Carrying a deadly secret', -10, 72); return `You leave the teahouse and say nothing to anyone. You do not sleep well.`; } },
    ],
  },
  {
    id: 'reb_coup_night', tag: 'rebellion', title: 'The Hour of the Rat', chainOnly: true,
    weight: () => 1,
    text: (c) => (c.flag('coup_side') === 'betray'
      ? `The general's men are not all in chains. On the third night, figures in black slip toward the ${c.me?.name?.surname || 'household'} compound seeking revenge for the betrayal.`
      : `The third night. A drum beats once in the dark. The west gate key is cold in ${gv(c.me)}'s hand, and torches gather beyond the wall.`),
    choices: [
      { label: (c) => (c.flag('coup_side') === 'betray' ? 'Defend the house' : 'Turn the key'), do: (c) => {
        if (c.flag('coup_side') === 'betray') { c.ambush(c.me, 3, 'Avenger of the general', 6); c.fame(c.me, 'blade', 3); return `They come over the wall. Fight for your life!`; }
        if (c.chance(0.35)) { c.favour(-40); c.court(c.me, 40); c.coins(200); c.fame(c.me, 'shadow', 10); return `The gate swings open; by dawn a new banner flies over the palace. You are named a minister — and the old King's loyalists will hunt you forever. (+200 nyang, +40 court rep)`; }
        c.crime(c.me, 150, 'high treason'); c.favour(-40); c.honor(c.me, -25); c.hurt(c.me, 0.5); return `The palace guard was waiting. The coup is crushed, and you barely escape over the rooftops. (wanted for high treason)`;
      } },
      { label: (c) => (c.flag('coup_side') === 'betray' ? 'Flee to the palace for protection' : 'Lose your nerve and lock the gate'), do: (c) => {
        if (c.flag('coup_side') === 'betray') { c.favour(4); c.honor(c.me, -2); return `You spend the night in the palace barracks. Your house is ransacked, but your family lives. (royal favour +4)`; }
        c.favour(6); c.enmity(5); c.mood(c.me, 'Narrow escape', 4); return `The plotters hammer at a locked gate until the guard arrives. No one knows how close it came — except you. (royal favour +6)`;
      } },
    ],
  },
];
