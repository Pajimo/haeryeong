// Deck of shadows (그림자): crime, bondage, festival nights and quiet mysteries.
// Schema and helpers: see makeCtx() in ../sagas.js. No imports by design.

// ---- small local utilities (plain functions, no game imports) ----
const nm = (s) => s?.name?.given || 'someone';
const full = (s) => s?.name?.full || s?.name?.given || 'a stranger';
const sk = (s, k) => s?.skills?.[k] || 0;
const odds = (base, s, k, per = 0.07) => Math.max(0.05, Math.min(0.92, base + sk(s, k) * per));
const others = (c) => (c.hh || []).filter((s) => s && s !== c.me);
const heirOf = (c) => {
  const kids = c.children ? c.children() : [];
  if (kids.length) return kids[0];
  const sp = c.me?.spouse;
  if (sp && !sp.dead && (c.hh || []).includes(sp)) return sp;
  return others(c).find((s) => s.age !== 'elder') || null;
};
const byId = (c, id) => (id == null ? null : (c.G?.sims || []).find((s) => s.id === id && !s.dead) || null);
const he = (s) => (s?.sex === 'f' ? 'she' : 'he');
const his = (s) => (s?.sex === 'f' ? 'her' : 'his');
const free = (c, n, o = {}) => { const out = []; for (let i = 0; i < n; i++) { const s = c.newcomer({ age: 'young', job: 'farmer', ...o }); if (s) out.push(s); } return out; };

export default [
  // ===================================================== CRIME =====================================================
  {
    id: 'crm_twelvefold', tag: 'crime', title: 'Twelvefold Restitution', cooldown: 10,
    weight: (c) => { c.vars.judge = c.courtRank() >= 4; return c.vars.judge ? 1.6 : 0.7; },
    text: (c) => {
      c.vars.thief = c.vars.thief || c.npc();
      const t = full(c.vars.thief);
      return c.vars.judge
        ? `A herdsman drags ${t} before you: three piglets stolen and already eaten. The old law of Buyeo is plain — a thief repays twelve times what he took, or his household goes into bondage to make it good. The thief's wife kneels in the dust behind him, and the whole lane waits on your word.`
        : `Your storehouse was short a sack of rice, and the constables have found it under ${t}'s floor. The old Buyeo law gives you, the wronged party, the right to demand twelvefold — more than his family will see in a year. His children watch you from the doorway.`;
    },
    choices: [
      { label: 'Enforce the law: twelvefold', do: (c) => { const t = c.vars.thief; c.fame(c.me, 'law', 6); c.honor(c.me, 4); if (!c.vars.judge) c.coins(36); if (t) { c.rel(c.me, t, -25); c.memory(t, c.me, 'Took twelvefold from my family', -40); } c.mood(c.me, 'Stern justice', -4, 12); return `The law is kept to the letter${c.vars.judge ? '' : ' and 36 nyang come your way'}. The family will be years paying it, and the lane goes quiet when you pass.`; } },
      { label: 'Show mercy: only what was taken', do: (c) => { const t = c.vars.thief; c.fame(c.me, 'heart', 6); c.honor(c.me, 3); if (t) { c.rel(c.me, t, 20, 5); c.memory(t, c.me, 'Spared my family ruin', 35); } c.mood(c.me, 'Merciful heart', 8, 24); return `You ask only for what was stolen. ${nm(t)} weeps openly; some elders mutter that mercy invites more thieves.`; } },
      { label: 'Accept a quiet bribe', do: (c) => { c.coins(25); c.fame(c.me, 'shadow', 4); c.honor(c.me, -6); if (c.chance(0.3)) { c.court(c.me, -5); return `+25 nyang. But the herdsman talks, and word of a judgement for sale reaches people who matter.`; } return `+25 nyang slips into your sleeve and the case is "dismissed for lack of proof". No one says it aloud — yet.`; } },
    ],
  },
  {
    id: 'crm_night_burglary', tag: 'crime', title: 'Footsteps in the Storehouse', cooldown: 8,
    weight: (c) => (c.night && c.wealth() >= 300 && !c.me.outlaw ? 1.8 : 0),
    text: (c) => `Past the hour of the Rat, ${nm(c.me)} wakes to the scrape of a bolt being worked loose. Shadows move in the storehouse — two, maybe three men with sacks, and the chest of coin is in there with the rice.`,
    choices: [
      { label: 'Take up a blade and confront them', do: (c) => { if (c.chance(odds(0.35, c.me, 'sword'))) { c.fame(c.me, 'blade', 5); c.honor(c.me, 3); c.skill(c.me, 'sword', 0.2); return `You burst in shouting and lay the first man flat; the rest scatter over the wall empty-handed.`; } c.hurt(c.me, 0.3); c.coins(-40); return `A cudgel finds your ribs in the dark. They flee with a sack of coin — 40 nyang gone.`; } },
      { label: 'Bang the gong and wake the lane', do: (c) => { c.coins(-15); c.fame(c.me, 'law', 2); return `Lamps flare up and down the lane. The thieves bolt with only a little — 15 nyang' worth of rice.`; } },
      { label: 'Lie still and let them take what they want', do: (c) => { c.coins(-60); c.mood(c.me, 'Robbed in the night', -12, 24); return `You listen to them work for what feels like hours. In the morning, 60 nyang' worth of goods are gone.`; } },
    ],
  },
  {
    id: 'crm_assassin_window', tag: 'crime', title: 'A Shadow at the Window', cooldown: 14,
    who: (c) => { const h = heirOf(c); if (!h) return null; c.vars.target = h; return c.adults().find((s) => s !== h) || c.me; },
    weight: (c) => (c.vars.target && (c.rival() || c.courtRank() >= 3 || c.wealth() >= 800) ? (c.night ? 2 : 0.8) : 0),
    text: (c) => `${nm(c.me)} catches a glint at the paper window of ${nm(c.vars.target)}'s room — a blade-edge, and the shape of a man in black crouched beneath the eaves. ${c.rival() ? 'Someone has paid well to end your line.' : 'Someone wants your heir gone.'}`,
    choices: [
      { label: (c) => `Throw yourself between the blade and ${nm(c.vars.target)}`, do: (c) => { const t = c.vars.target; c.hurt(c.me, 0.45); if (t) { c.rel(c.me, t, 35, 15); c.memory(t, c.me, 'Took a blade meant for me', 60); } c.honor(c.me, 8); c.fame(c.me, 'heart', 4); c.enmity(5); return `The knife opens your shoulder instead of ${nm(t)}'s throat. The assassin vanishes into the dark, but ${nm(t)} will never forget whose blood that was.`; } },
      { label: 'Raise a shout and draw them into the yard', do: (c) => { const t = c.vars.target || c.me; c.ambush(t, c.chance(0.5) ? 1 : 2, 'Assassin', 6); c.enmity(5); return `Your shout breaks their stealth — they come in the open now, steel drawn. Defend ${nm(t)}!`; } },
      { label: 'Hurry the household out the back gate', do: (c) => { const t = c.vars.target; if (c.chance(0.65)) { c.mood(c.me, 'Fled in the night', -8, 24); return `You bundle everyone out into the lane and hammer on a neighbour's gate until dawn. The assassin finds an empty room.`; } if (t) c.hurt(t, 0.25); return `Not fast enough — ${nm(t)} takes a shallow cut before the killer slips away into the night.`; } },
    ],
  },
  {
    id: 'crm_dice_den', tag: 'crime', title: 'Lost at the Dice Den', cooldown: 10,
    who: (c) => { const L = c.adults(); return L.length ? c.pick(L) : null; },
    weight: (c) => (c.wealth() >= 40 ? (c.me.has?.('Greedy') || c.me.has?.('Lazy') ? 1.5 : 0.8) : 0),
    text: (c) => `${nm(c.me)} stumbles home red-eyed from the dice den behind the jumak. Between rounds of makgeolli and bad luck, ${he(c.me)} wagered 80 nyang ${he(c.me)} does not have — and signed a marker in the household's name. The den's owner is not a patient man.`,
    choices: [
      { label: 'Pay the debt in full', cost: 80, do: (c) => { c.honor(c.me, -5); c.mood(c.me, 'Gambling shame', -10, 24); return `The marker is burned. The house is poorer, and ${nm(c.me)} cannot look anyone in the eye at supper.`; } },
      { label: 'Go back and win it back', do: (c) => { if (c.chance(odds(0.25, c.me, 'charisma', 0.05))) { c.coins(30); c.fame(c.me, 'shadow', 2); return `Unbelievably, the dice turn — the marker is torn up and you walk out 30 nyang ahead. You will never be this lucky again.`; } c.coins(-30); c.flag('crm_dice_who', c.me.id); c.chain('crm_dice_collectors', 8); return `The dice are loaded, of course. Another 30 nyang lost, and the marker still stands. The owner says his men will "call".`; } },
      { label: 'Refuse to pay a cheat', do: (c) => { c.flag('crm_dice_who', c.me.id); c.chain('crm_dice_collectors', 6); c.honor(c.me, 2); return `You declare the dice crooked and the marker void. Word comes back that the den will collect one way or another.`; } },
    ],
  },
  {
    id: 'crm_dice_collectors', tag: 'crime', title: 'The Collectors Come Calling', chainOnly: true,
    who: (c) => byId(c, c.flag('crm_dice_who')) || c.me,
    weight: () => 0,
    text: (c) => `Three men with cudgels lean on your gate, smiling. "${nm(c.me)}'s marker," says the biggest. "Eighty nyang, or we take it out of the furniture — and then out of ${nm(c.me)}."`,
    choices: [
      { label: 'Pay them off', cost: 80, do: (c) => { c.honor(c.me, -3); return `They count it twice, tip their hats, and leave. The lesson cost 80 nyang.`; } },
      { label: 'Fight them in the yard', do: (c) => { c.ambush(c.me, 2, 'Debt collector', 3); return `They wanted this. Cudgels come up — hold the gate!`; } },
      { label: 'Report the crooked den to the constables', do: (c) => { if (c.chance(odds(0.3, c.me, 'charisma'))) { c.fame(c.me, 'law', 4); return `The constables raid the den and find the weighted dice. The marker is void — and the owner is in the stocks.`; } c.coins(-20); c.hurt(c.me, 0.15); return `The constables drink at that den. The collectors break a chest and a few of ${nm(c.me)}'s ribs, then take 20 nyang for "interest".`; } },
    ],
  },
  {
    id: 'crm_rebel_weapons', tag: 'crime', title: 'Spears Under the Straw', cooldown: 14,
    weight: (c) => (c.wealth() >= 100 ? (c.atWar() ? 1.8 : 0.9) : 0),
    text: (c) => `Shifting bales in the storehouse, ${nm(c.me)} uncovers bundles wrapped in oilcloth — spearheads, bows, forty iron arrowheads. A frightened hired hand admits that men from the hills paid him to hide them. They mean to come for them in three nights.`,
    choices: [
      { label: 'Report it to the magistrate', do: (c) => { c.coins(30); c.fame(c.me, 'law', 6); c.court(c.me, 4); c.favour(4); return `Soldiers lie in wait and take the smugglers. The magistrate rewards your loyalty: +30 nyang, and your name is spoken well at court.`; } },
      { label: 'Say nothing — for a fee', do: (c) => { c.coins(60); c.fame(c.me, 'shadow', 5); if (c.chance(0.25)) return `+60 nyang. Then a soldier finds an arrowhead with your storehouse mark on it — ${c.crime(c.me, 50, 'hiding rebel weapons')}.`; return `+60 nyang in rebel silver. The weapons disappear on the third night, and you pray you never learn where they went.`; } },
      { label: 'Sink the bundles in the river', do: (c) => { c.honor(c.me, 2); if (c.chance(0.4)) { c.mood(c.me, 'Rebels angry', -10, 48); return `The iron is gone. But the hill men know who took it, and a dead crow appears on your gatepost.`; } return `The bundles sink without a ripple. Whoever comes for them in three nights finds only straw.`; } },
    ],
  },
  {
    id: 'crm_magistrate_bribe', tag: 'crime', title: 'The Magistrate\'s Price', cooldown: 12,
    weight: (c) => (['merchant', 'innkeeper', 'farmer', 'fisher'].includes(c.me.job) ? 1.4 : c.wealth() >= 150 ? 0.6 : 0),
    text: (c) => `${nm(c.me)}'s petition for a trading permit has sat on the county magistrate's desk for a month. His clerk finally explains: "His Honour's brush is very heavy. Forty nyang would make it lighter." Others in the queue have already paid.`,
    choices: [
      { label: 'Pay the "brush fee"', cost: 40, do: (c) => { c.honor(c.me, -3); c.coins(15); return `The permit is stamped that same afternoon. Business picks up at once (+15 nyang), though you feel the weight of what you fed.`; } },
      { label: 'Refuse and wait it out', do: (c) => { c.honor(c.me, 4); c.coins(-15); c.mood(c.me, 'Clean but poorer', -4, 24); return `You will not bribe. The permit stays unsigned and you lose a season's trade — 15 nyang at least.`; } },
      { label: 'Quietly record every bribe he takes', do: (c) => { if (c.chance(odds(0.35, c.me, 'scholarship'))) { c.fame(c.me, 'law', 5); c.flag('crm_mag_ledger', true); c.evidence(1); return `Within a week you have dates, sums and names. Tucked away, that ledger could ruin him — or anyone he answers to.`; } c.honor(c.me, -2); c.coins(-10); return `The clerk catches you copying his tallies. Your petition is "lost" for good and you are fined 10 nyang for loitering.`; } },
      { label: 'Denounce him at court', req: (c) => (c.courtRank() >= 1 ? true : 'Needs a court position'), do: (c) => { if (c.chance(0.5 + c.courtRank() * 0.08)) { c.court(c.me, 6); c.fame(c.me, 'law', 6); return `An inspector is sent. The magistrate is stripped of his seal, and your petition is signed by his replacement.`; } c.court(c.me, -4); c.enmity(5); return `The magistrate has friends above you. Your complaint is dismissed as spite, and powerful men note your name.`; } },
    ],
  },
  {
    id: 'crm_grave_robbers', tag: 'crime', title: 'The Opened Tomb', cooldown: 16,
    weight: (c) => (c.season === 'autumn' || c.season === 'winter' ? 1.1 : 0.6),
    text: (c) => `The burial mound of an old noble house on the hill has been tunnelled into overnight. Bronze mirrors, jade and a gilt crown are gone, and the family is wailing for vengeance. ${nm(c.me)} finds fresh cart tracks leading toward the main road — and a dropped lacquer token.`,
    choices: [
      { label: 'Follow the tracks yourself', do: (c) => { c.chain('crm_grave_clue', 5); c.fame(c.me, 'law', 2); return `You pocket the token and follow the ruts until dusk. You will need daylight to read the rest.`; } },
      { label: 'Hand the token to the constables', do: (c) => { c.fame(c.me, 'law', 3); c.honor(c.me, 2); return `The constables thank you and lose the token in a drawer within the day. The tomb stays empty.`; } },
      { label: 'Keep quiet and keep the token', do: (c) => { c.item(c.me, 'lacquerToken', 1); c.fame(c.me, 'shadow', 2); return `Some things are worth more as leverage than as evidence. You tuck the token away.`; } },
    ],
  },
  {
    id: 'crm_grave_clue', tag: 'crime', title: 'Whose Token Is This?', chainOnly: true,
    weight: () => 0,
    text: (c) => { const r = c.rival(); return `The cart tracks end at a warehouse by the ferry. Through a gap in the boards ${nm(c.me)} sees the gilt crown, wrapped in silk — and the lacquer token matches the crest painted on the crates: ${r ? 'the house of your rivals' : 'a powerful clan from the capital'}.`; },
    choices: [
      { label: 'Take the proof to the noble family', do: (c) => { c.evidence(1); c.enmity(10); c.fame(c.me, 'law', 6); c.honor(c.me, 5); return `The robbed family's gratitude is fierce, and their anger at the thieves fiercer. ${c.rival() ? 'Your rivals now have one more reason to hate you — and you, one more piece of evidence.' : 'A great clan is shamed.'}`; } },
      { label: 'Blackmail the clan', do: (c) => { if (c.chance(0.6)) { c.coins(90); c.enmity(15); c.fame(c.me, 'shadow', 6); return `A silent servant delivers 90 nyang and a look that promises they will not forget.`; } c.ambush(c.me, 2, 'Hired blade', 5); c.enmity(20); return `They answer your letter with steel.`; } },
      { label: 'Leave it alone', do: (c) => { c.mood(c.me, 'Swallowed truth', -6, 24); return `Some clans are too great to accuse. You walk home and say nothing.`; } },
    ],
  },
  {
    id: 'crm_stall_thugs', tag: 'crime', title: 'Thugs at the Stall', cooldown: 10,
    weight: (c) => (['merchant', 'innkeeper', 'fisher'].includes(c.me.job) ? 1.6 : 0),
    text: (c) => `Four men in rough hemp kick over ${nm(c.me)}'s baskets and grind the goods into the mud. "Market protection," their leader grins. "Ten nyang a week, or this happens every week."`,
    choices: [
      { label: 'Pay them', cost: 10, do: (c) => { c.honor(c.me, -3); c.flag('crm_protection', true); return `They leave you alone — this week. Other stallholders look away from you.`; } },
      { label: 'Stand and fight', do: (c) => { c.ambush(c.me, 2, 'Market thug', 3); return `You pick up a pole. Two of them come at you with fists and clubs.`; } },
      { label: 'Rally the other stallholders', do: (c) => { if (c.chance(odds(0.35, c.me, 'charisma'))) { c.fame(c.me, 'heart', 4); c.fame(c.me, 'law', 3); return `Twenty stallholders with poles and ladles drive the gang out of the market. They do not come back.`; } c.coins(-20); return `The others are too afraid. The gang smashes more stock out of spite — 20 nyang ruined.`; } },
    ],
  },
  {
    id: 'crm_royal_inspector', tag: 'crime', title: 'The Secret Inspector', cooldown: 20,
    weight: (c) => (c.me.outlaw ? 0 : 0.9),
    text: (c) => `A shabby traveller at the jumak asks too many careful questions about the county office. ${nm(c.me)} glimpses the bronze horse-tablet hidden in his sleeve: a secret royal inspector, sent to catch corrupt officials in the act.`,
    choices: [
      { label: 'Tell him what you know about local corruption', do: (c) => { c.fame(c.me, 'law', 6); c.favour(5); c.court(c.me, 3); if (c.flag('crm_mag_ledger')) { c.evidence(1); c.coins(40); return `You hand over your ledger of bribes. The inspector strikes within days; the king's reward is 40 nyang.`; } return `The inspector listens and memorises. When he reveals himself, the guilty are in chains and your name is noted kindly.`; } },
      { label: 'Tip off the officials — for a price', do: (c) => { c.coins(50); c.fame(c.me, 'shadow', 5); c.honor(c.me, -8); if (c.chance(0.3)) return `+50 nyang. But the inspector learns who warned them: ${c.crime(c.me, 40, 'obstructing a royal inspector')}.`; return `+50 nyang from grateful officials, who hide their ledgers in time. The inspector rides away empty-handed.`; } },
      { label: 'Blackmail the inspector', do: (c) => { if (c.chance(odds(0.2, c.me, 'charisma'))) { c.coins(60); c.fame(c.me, 'shadow', 6); return `You threaten to unmask him. He pays 60 nyang to keep his cover — and remembers your face.`; } c.court(c.me, -6); c.honor(c.me, -5); c.favour(-5); return `He laughs, shows you the tablet openly, and has you flogged for threatening the king's envoy.`; } },
      { label: 'Stay out of it', do: () => `You keep your head down and your cup full. Whatever the inspector finds, it is no concern of yours.` },
    ],
  },
  {
    id: 'crm_pickpocket_child', tag: 'crime', title: 'Little Hands', cooldown: 14,
    who: (c) => { const kids = c.children(); if (!kids.length) return null; c.vars.kid = c.pick(kids); return c.adults()[0] || c.me; },
    weight: (c) => (c.vars.kid ? 1.1 : 0),
    text: (c) => `${nm(c.vars.kid)} comes home with a silk purse that is not theirs. Pressed, the child admits that a gang of older boys under a one-eyed man teaches "games" behind the market — and pays in sweets and coppers.`,
    choices: [
      { label: 'Confront the one-eyed man', do: (c) => { if (c.chance(odds(0.4, c.me, 'sword'))) { c.fame(c.me, 'law', 4); c.honor(c.me, 3); return `One look at your face and the gang master decides your child is not worth the trouble.`; } c.ambush(c.me, 1, 'Gang master', 4); return `He doesn't scare. He comes at you with a knife.`; } },
      { label: 'Return the purse and talk with the child', do: (c) => { const k = c.vars.kid; if (k) { c.rel(c.me, k, 10, 5); c.mood(k, 'Learned a lesson', -4, 12); } c.honor(c.me, 2); return `The purse goes back to a very surprised merchant. ${nm(k)} sulks, then quietly promises.`; } },
      { label: 'Let the child keep "playing" — and report to you', do: (c) => { const k = c.vars.kid; c.fame(c.me, 'shadow', 4); if (k) c.skill(k, 'charisma', 0.3); c.coins(10); c.honor(c.me, -4); return `+10 nyang a week in gossip and coppers. ${nm(k)} is learning things no child should.`; } },
    ],
  },
  {
    id: 'crm_forged_ledger', tag: 'crime', title: 'The Forged Tax Ledger', cooldown: 14,
    weight: (c) => (c.wealth() >= 60 ? 0.9 : 0),
    text: (c) => `The tax clerk's ledger says ${nm(c.me)}'s household owes for six fields — you farm two. The ink on the new lines is fresher than the rest, and the clerk will not meet your eyes. Seventy nyang is due by the new moon.`,
    choices: [
      { label: 'Pay rather than fight it', cost: 70, do: (c) => { c.mood(c.me, 'Cheated by clerks', -8, 24); return `You pay. Somewhere in the county office, someone eats well tonight.`; } },
      { label: 'Prove the forgery yourself', do: (c) => { if (c.chance(odds(0.25, c.me, 'scholarship', 0.08))) { c.fame(c.me, 'law', 5); c.honor(c.me, 4); c.skill(c.me, 'scholarship', 0.2); return `You compare inks and brush-hands before the magistrate. The clerk is dismissed and your debt is struck.`; } c.coins(-70); c.honor(c.me, -3); return `Your case falls apart under questioning. You pay the 70 nyang, plus a scolding.`; } },
      { label: 'Bribe the clerk to "fix" it', cost: 20, do: (c) => { c.fame(c.me, 'shadow', 2); c.honor(c.me, -3); return `For 20 nyang the extra fields vanish as neatly as they appeared.`; } },
    ],
  },
  {
    id: 'crm_ginseng_smuggle', tag: 'crime', title: 'Ginseng Past the Border Post', cooldown: 12,
    weight: (c) => (c.me.job === 'merchant' || c.me.has?.('Greedy') || c.me.has?.('Cunning') ? 1.4 : 0.5),
    text: (c) => `A mountain digger offers ${nm(c.me)} a bundle of wild ginseng roots — gnarled, old, worth a fortune across the border, where the empire's merchants pay triple. The border post taxes ginseng heavily and searches carts. He wants 50 nyang now.`,
    choices: [
      { label: 'Smuggle it through hidden in a rice cart', cost: 50, do: (c) => { if (c.chance(odds(0.45, c.me, 'charisma', 0.05))) { c.coins(140); c.fame(c.me, 'shadow', 5); return `The guards poke the rice and wave you on. Across the border, the roots fetch 140 nyang.`; } c.honor(c.me, -5); return `A guard's spear finds the roots. They are seized — ${c.crime(c.me, 40, 'ginseng smuggling')}.`; } },
      { label: 'Bribe the border sergeant', cost: 70, do: (c) => { c.coins(140); c.fame(c.me, 'shadow', 3); return `The sergeant takes 20 nyang and looks at the clouds. The roots sell for 140.`; } },
      { label: 'Buy it and pay the tax honestly', cost: 50, do: (c) => { c.item(c.me, 'ginseng', 1); c.honor(c.me, 2); return `You keep one fine root, taxed and lawful. Less profit — no fear.`; } },
      { label: 'Decline', do: () => `You wave the digger away. He will find a hungrier buyer.` },
    ],
  },

  // ===================================================== SLAVERY =====================================================
  {
    id: 'slv_captive_convoy', tag: 'bondage', title: 'The Captive Convoy', cooldown: 18,
    weight: (c) => (c.me.outlaw ? 0.6 : 1.1) * (c.atWar() ? 1.6 : 1),
    text: (c) => `A convoy bound for the empire's commandery crawls along the river road: a dozen carts and forty captives roped neck to neck — farmers taken in border raids, a mother carrying a child, old men who can barely walk. Imperial guards drive them with staves. They will be sold far from home and never return.`,
    choices: [
      { label: 'Attack the convoy and free them', do: (c) => { const p = odds(0.25, c.me, 'sword', 0.06) + (c.mercs() ? 0.15 : 0); if (c.chance(p)) { free(c, 3); c.fame(c.me, 'heart', 12); c.fame(c.me, 'blade', 6); c.honor(c.me, 8); c.mood(c.me, 'Broke the chains', 20, 48); return `In a rush from the reeds you scatter the guards and cut the ropes. The freed scatter for home — three follow you, asking where to settle. ${c.crime(c.me, 40, 'attacking an imperial convoy')}`; } c.hurt(c.me, 0.4); c.mood(c.me, 'Failed them', -15, 48); return `The guards are too many. You are driven off bleeding, and the convoy rolls on.`; } },
      { label: 'Buy freedom for as many as you can', cost: 150, do: (c) => { free(c, 2); c.fame(c.me, 'heart', 10); c.honor(c.me, 6); c.mood(c.me, 'Bought their freedom', 12, 48); return `The convoy master haggles over each person like cattle — it sickens you. But two walk free on your silver, and stay in the valley.`; } },
      { label: 'Do nothing', do: (c) => { c.mood(c.me, 'Watched them pass', -14, 48); c.memory(c.me, null, 'Watched the captive convoy pass', -20); return `You stand aside. The rope-line passes, and a child looks at you the whole way.`; } },
    ],
  },
  {
    id: 'slv_debt_bondage', tag: 'bondage', title: 'A Child for a Debt', cooldown: 18,
    weight: (c) => (c.wealth() >= 100 ? 1.0 : 0),
    text: (c) => { c.vars.father = c.vars.father || c.npc(); return `${full(c.vars.father)} kneels at ${nm(c.me)}'s gate with a thin girl of eight. The harvest failed, the debt to your household is 60 nyang, and by custom he offers her as a bond-servant until it is worked off. His hands are shaking.`; },
    choices: [
      { label: 'Accept her as a bond-servant', do: (c) => { const k = c.newcomer({ age: 'child', job: 'child', sex: 'f' }); c.honor(c.me, -10); c.mood(c.me, 'Took a child for debt', -12, 48); c.fame(c.me, 'heart', -4); if (c.vars.father) c.rel(c.me, c.vars.father, -20); if (k) c.memory(k, c.me, 'Taken from my family for a debt', -40); return `The debt is "settled". The girl stays near your gate, silent; her father walks home alone. Few neighbours praise you for it.`; } },
      { label: 'Forgive the debt entirely', do: (c) => { c.honor(c.me, 8); c.fame(c.me, 'heart', 10); c.mood(c.me, 'Forgave the debt', 14, 48); if (c.vars.father) { c.rel(c.me, c.vars.father, 40, 10); c.memory(c.vars.father, c.me, 'Forgave my debt and kept my daughter home', 60); } return `You tear the bond in half. ${nm(c.vars.father)} presses his forehead to the ground; the whole village hears of it by nightfall.`; } },
      { label: 'Take her in as a ward, and forgive the debt', do: (c) => { const k = c.newcomer({ age: 'child', job: 'child', sex: 'f' }); if (k) { c.adopt(k); c.rel(c.me, k, 25, 10); } c.honor(c.me, 6); c.fame(c.me, 'heart', 8); if (c.vars.father) c.rel(c.me, c.vars.father, 25, 10); return `She will live with your family as a ward, schooled and fed, free to visit her father. The debt is forgotten.`; } },
    ],
  },
  {
    id: 'slv_runaway', tag: 'bondage', title: 'The Runaway and the Hunter', cooldown: 14,
    weight: (c) => 1.0,
    text: (c) => `${nm(c.me)} finds a young man shivering in the woodshed, his ankles raw from shackles, a slave's brand on his arm. By noon a slave-hunter rides up with a coiled rope and a warrant: "Runaway from the iron works. Thirty nyang to whoever hands him over."`,
    choices: [
      { label: 'Hide him and lie to the hunter', do: (c) => { if (c.chance(odds(0.4, c.me, 'charisma'))) { free(c, 1, { sex: 'm' }); c.fame(c.me, 'heart', 6); c.honor(c.me, 4); return `The hunter searches half-heartedly and rides on. At dusk you send the young man off with food and directions — he settles in a village nearby.`; } return `The hunter finds him behind the woodpile. ${c.crime(c.me, 25, 'harbouring a runaway')}`; } },
      { label: 'Buy his papers from the hunter', cost: 60, do: (c) => { free(c, 1, { sex: 'm' }); c.fame(c.me, 'heart', 8); c.honor(c.me, 5); return `The hunter tears up the warrant for twice the bounty. The young man is free, and he does not forget your face.`; } },
      { label: 'Drive the hunter off with steel', do: (c) => { c.ambush(c.me, 1, 'Slave-hunter', 5); c.fame(c.me, 'heart', 3); return `You step between them. The hunter draws.`; } },
      { label: 'Hand him over for the bounty', do: (c) => { c.coins(30); c.honor(c.me, -12); c.mood(c.me, 'Sold a runaway', -18, 72); c.fame(c.me, 'heart', -6); return `+30 nyang. They drag him off in chains, and the silver feels heavier than it should.`; } },
    ],
  },
  {
    id: 'slv_loyal_servant', tag: 'bondage', title: 'The Servant Who Dived In', cooldown: 30, once: true,
    who: (c) => { const k = c.children(); if (!k.length) return null; c.vars.kid = c.pick(k); return c.adults()[0] || c.me; },
    weight: (c) => (c.vars.kid ? 0.8 : 0),
    text: (c) => `${nm(c.vars.kid)} slipped into the river in spate, and it was a bond-servant from the neighbouring estate — a quiet woman everyone ignores — who dove in after the child and dragged them out half-drowned. Her master is already shouting at her for wasting work hours.`,
    choices: [
      { label: 'Buy her freedom and welcome her into your household', cost: 90, do: (c) => { const s = c.newcomer({ age: 'adult', job: 'farmer', sex: 'f' }); if (s) { c.adopt(s); if (c.vars.kid) c.rel(s, c.vars.kid, 30, 10); c.rel(c.me, s, 30, 10); } c.fame(c.me, 'heart', 10); c.honor(c.me, 6); return `Her bond is burned before witnesses. She joins your household as a free retainer — and ${nm(c.vars.kid)} follows her everywhere.`; } },
      { label: 'Buy her freedom and let her go where she wishes', cost: 90, do: (c) => { c.newcomer({ age: 'adult', job: 'farmer', sex: 'f' }); c.fame(c.me, 'heart', 8); c.honor(c.me, 5); return `She weeps when the bond is burned, then goes to find a family she has not seen in eleven years.`; } },
      { label: 'Thank her with a gift', cost: 10, do: (c) => { c.mood(c.me, 'Small thanks', -2, 12); return `She accepts the coins with a bow. Her master takes them from her before you reach your own gate.`; } },
    ],
  },
  {
    id: 'slv_mine_revolt', tag: 'bondage', title: 'Revolt in the Iron Mines', cooldown: 20,
    weight: (c) => (['soldier', 'police', 'general'].includes(c.me.job) ? 1.6 : 0.8),
    text: (c) => `Smoke rises from the iron mines in the hills. The bonded miners — convicts, war captives, debtors' sons — have risen against their overseers after a shaft collapse buried twelve of them. Soldiers are mustering, and the miners have barricaded the pit-head with ore carts.`,
    choices: [
      { label: 'March with the soldiers to crush it', req: (c) => (['soldier', 'police', 'general'].includes(c.me.job) || c.courtRank() >= 1 ? true : 'Only for soldiers or officials'), do: (c) => { c.fame(c.me, 'law', 6); c.court(c.me, 4); c.coins(30); c.honor(c.me, -4); c.mood(c.me, 'Put down the miners', -12, 48); return `The barricades fall by evening. You are paid 30 nyang and praised — but you saw what they were fighting for.`; } },
      { label: 'Ride in to negotiate', do: (c) => { if (c.chance(odds(0.25, c.me, 'charisma', 0.07))) { c.fame(c.me, 'heart', 8); c.court(c.me, 3); c.honor(c.me, 6); return `You win safer shafts and a pardon for the ringleaders. Both sides grudgingly call it fair.`; } c.hurt(c.me, 0.2); return `Neither side trusts you. A stone from the barricade opens your scalp, and the soldiers attack anyway.`; } },
      { label: 'Shelter fleeing miners', do: (c) => { free(c, 2, { sex: 'm' }); c.fame(c.me, 'heart', 6); if (c.chance(0.35)) return `Two miners slip into the valley under your hay. Someone saw: ${c.crime(c.me, 30, 'sheltering escaped miners')}.`; return `Two miners slip away under your hay to begin new lives in the valley.`; } },
      { label: 'Stay away', do: () => `You bar the gate and wait for the smoke to clear.` },
    ],
  },
  {
    id: 'slv_lost_sibling', tag: 'bondage', title: 'A Face Among the Captives', cooldown: 30, once: true,
    weight: (c) => 0.5,
    text: (c) => `On the slave-dealer's platform at the market stands a gaunt figure with a scar across the eyebrow that ${nm(c.me)} has not seen since childhood — ${his(c.me)} sibling, carried off by raiders twenty years ago. The dealer notices the look and smiles. "That one's special. Very special price."`,
    choices: [
      { label: 'Buy them at any price', req: (c) => (c.afford(60) ? true : 'Needs at least 60 nyang'), do: (c) => { const pay = Math.min(200, Math.max(60, Math.floor((c.G?.household?.[0]?.coins || 0) * 0.8))); c.coins(-pay); const s = c.newcomer({ age: 'adult', job: 'farmer', sex: c.chance(0.5) ? 'm' : 'f' }); if (s) { c.adopt(s); c.rel(c.me, s, 50, 20); } c.mood(c.me, 'Family restored', 30, 96); c.fame(c.me, 'heart', 6); return `${pay} nyang — most of what you have. Your sibling walks off the platform into your arms and comes home.`; } },
      { label: 'Steal them away at night', do: (c) => { if (c.chance(odds(0.3, c.me, 'sword', 0.05))) { const s = c.newcomer({ age: 'adult', job: 'farmer' }); if (s) { c.adopt(s); c.rel(c.me, s, 50, 20); } c.mood(c.me, 'Family restored', 30, 96); c.fame(c.me, 'shadow', 6); return `A cut rope, a bribed dog, a run through the rice paddies — your sibling is home. ${c.crime(c.me, 50, 'stealing a captive')}`; } c.hurt(c.me, 0.3); c.mood(c.me, 'Failed my sibling', -25, 96); return `The guards were waiting. You escape bruised; by dawn the dealer's cart has left for the coast.`; } },
      { label: 'You cannot act', do: (c) => { c.mood(c.me, 'Could not save them', -30, 120); c.memory(c.me, null, 'Saw my lost sibling sold at market and did nothing', -50); return `You walk away. That night, and many nights after, you see that scar when you close your eyes.`; } },
    ],
  },
  {
    id: 'slv_funeral_retainers', tag: 'bondage', title: 'Servants for the Tomb', cooldown: 30,
    weight: (c) => (c.courtRank() >= 1 || c.me.job === 'noble' ? 1.0 : 0.4),
    text: (c) => `An old lord of the district has died, and his heirs mean to honour him in the oldest Buyeo manner: his personal servants are to be sealed into the tomb "to attend him in the next world". Eight people, the youngest barely grown, sit under guard. The heirs ask ${nm(c.me)} to witness the rite.`,
    choices: [
      { label: 'Argue for clay figures instead', do: (c) => { if (c.chance(odds(0.35, c.me, 'charisma', 0.06) + (c.courtRank() >= 2 ? 0.2 : 0))) { c.fame(c.me, 'heart', 10); c.honor(c.me, 8); c.court(c.me, 2); c.mood(c.me, 'Spared the servants', 18, 72); return `You argue that the lord deserves an army of fired-clay servants that will never age. The heirs relent; eight people walk out of the courtyard alive.`; } c.mood(c.me, 'Could not stop it', -20, 96); c.honor(c.me, 2); return `The heirs hear you out and refuse. You leave before the rite, sick at heart.`; } },
      { label: 'Pay the heirs to release the servants', cost: 120, do: (c) => { free(c, 2); c.fame(c.me, 'heart', 12); c.honor(c.me, 8); c.mood(c.me, 'Spared the servants', 18, 72); return `You buy every bond and burn them on the spot. Two of the freed stay in the valley; the rest scatter home.`; } },
      { label: 'Follow the old custom', do: (c) => { c.honor(c.me, -30); c.fame(c.me, 'heart', -15); c.mood(c.me, 'Witnessed the burial rite', -35, 168); c.memory(c.me, null, 'Stood by as servants were sealed in a tomb', -70); c.court(c.me, 1); return `You stand by as the tomb is sealed. Monks and villagers alike turn from you in disgust; the heirs' thanks taste of ash.`; } },
      { label: 'Refuse to attend', do: (c) => { c.honor(c.me, 2); c.mood(c.me, 'Turned away', -10, 48); return `You will not witness it. You do not stop it either.`; } },
    ],
  },

  // ===================================================== FESTIVAL =====================================================
  {
    id: 'fst_midwinter_heaven', tag: 'festival', title: 'The Midwinter Heaven Rite', cooldown: 20,
    weight: (c) => (c.season === 'winter' ? (c.festival() ? 3 : 0.8) : 0),
    text: (c) => `It is the twelfth month and the heaven festival has begun: drums day and night, singing in every lane, oxen roasting whole in the plaza. By ancient custom the king pardons prisoners during the rite — and the vast crowds mean no one watches anyone too closely.`,
    choices: [
      { label: 'Petition for a prisoner\'s release', req: (c) => (c.courtRank() >= 1 || sk(c.me, 'charisma') >= 3 ? true : 'Needs court rank or charisma 3'), do: (c) => { const n = c.npc(); if (n) { c.rel(c.me, n, 30, 10); c.memory(n, c.me, 'Won my brother\'s release at the heaven rite', 50); } c.fame(c.me, 'heart', 8); c.favour(2); return `Your petition is read aloud before the altar. ${n ? full(n) + "'s brother" : 'A young prisoner'} walks free, and his family will remember you.`; } },
      { label: 'Host a great feast', cost: 80, do: (c) => { c.fame(c.me, 'heart', 8); c.honor(c.me, 8); for (const s of c.hh || []) c.mood(s, 'Heaven-rite feast', 15, 24); return `Pork, rice wine and songs until dawn. The whole village eats at your table.`; } },
      { label: 'Use the crowds to cover a scheme', do: (c) => { if (c.chance(odds(0.4, c.me, 'charisma', 0.05))) { c.coins(70); c.fame(c.me, 'shadow', 6); if (c.rival()) c.evidence(1); return `While the drums pound, you slip through a rival's storeroom: 70 nyang${c.rival() ? ' and a letter they will wish they had burned' : ''}.`; } return `A drunk watchman stumbles on you mid-job. ${c.crime(c.me, 30, 'theft during the sacred rite')}`; } },
      { label: 'Simply sing and dance', do: (c) => { c.need(c.me, 'fun', 30); c.need(c.me, 'social', 20); c.mood(c.me, 'Danced till dawn', 12, 24); return `You lose yourself in the drums for one long, cold night.`; } },
    ],
  },
  {
    id: 'fst_founders_rite', tag: 'festival', title: 'The Founders\' Procession', cooldown: 20,
    weight: (c) => (c.season === 'autumn' ? (c.festival() ? 3 : 0.8) : 0),
    text: (c) => `The tenth-month founders' rite: a great procession carries the spirit-tablet of the founding mother to the cave shrine by the river. Dance troupes compete for the honour of leading it, wrestlers grapple on the sand, and couples tie ribbons on the shrine rope praying for a child.`,
    choices: [
      { label: 'Sponsor a dance troupe', cost: 50, do: (c) => { c.fame(c.me, 'heart', 6); c.honor(c.me, 6); c.favour(2); return `Your troupe leads the procession in red and blue silks. Your household's name is on every tongue.`; } },
      { label: 'Compete in the wrestling', do: (c) => { if (c.chance(odds(0.3, c.me, 'sword', 0.06))) { c.coins(40); c.fame(c.me, 'blade', 6); c.honor(c.me, 4); return `You throw three men in a row and win the bullock prize — 40 nyang.`; } c.hurt(c.me, 0.1); c.mood(c.me, 'Thrown in the sand', -4, 12); return `A farmer twice your size throws you on the first grip. The crowd roars with laughter.`; } },
      { label: 'Tie a ribbon and pray for an heir', req: (c) => (c.me.spouse ? true : 'Needs a spouse'), do: (c) => { c.flag('fst_heir_prayer', c.day); c.mood(c.me, 'Prayed for an heir', 10, 72); if (c.me.spouse) c.rel(c.me, c.me.spouse, 10, 0); return `You and your spouse tie a red ribbon together. The shrine-keeper says the founding mother was smiling.`; } },
    ],
  },
  {
    id: 'fst_ssireum', tag: 'festival', title: 'The Ssireum Ring', cooldown: 12,
    weight: (c) => (c.festival() ? 2.4 : c.season === 'summer' || c.season === 'autumn' ? 0.5 : 0),
    text: (c) => { c.vars.champ = c.vars.champ || c.npc(); return `In the sand ring by the river, a barefoot farmhand — ${full(c.vars.champ)} — has thrown the garrison's champion twice. He is plainly no one, and the nobles in the stands are frowning. The crowd chants his name anyway.`; },
    choices: [
      { label: 'Offer him a place as your retainer', cost: 40, do: (c) => { const n = c.vars.champ; if (!n || n.household) { c.coins(40); return `The champion has already slipped away into the crowd. Your purse stays full.`; } (c.retainer ? c.retainer(n) : c.adopt(n)); c.rel(c.me, n, 40, 15); c.memory(n, c.me, 'Saw my strength when no one else would', 50); c.fame(c.me, 'heart', 4); return `${nm(n)} bows to the ground and swears to follow you as a retainer — a wrestler's arms at your back, no wages asked.`; } },
      { label: 'Step into the ring against him', do: (c) => { if (c.chance(odds(0.2, c.me, 'sword', 0.07))) { c.fame(c.me, 'blade', 8); c.coins(30); return `A long, straining bout — then he hits the sand. He grins and clasps your arm. +30 nyang.`; } c.mood(c.me, 'Lost the bout', -3, 12); if (c.vars.champ) c.rel(c.me, c.vars.champ, 15, 5); return `He throws you gently, almost politely. The crowd loves you both.`; } },
      { label: 'Bet on him', do: (c) => { if (c.chance(0.6)) { c.coins(35); return `He wins the bull. +35 nyang in your purse.`; } c.coins(-20); return `A sly elbow from the garrison man — he loses. -20 nyang.`; } },
    ],
  },
  {
    id: 'fst_mask_dance', tag: 'festival', title: 'The Mask Dance', cooldown: 14,
    weight: (c) => (c.festival() ? 2.2 : 0.4),
    text: (c) => `Under torches in the plaza, mask dancers play a fat yangban with a crooked hat who chases servant girls, falls in the dung heap and is outwitted by a monkey-faced servant. Everyone knows exactly which district noble the mask is meant to be.`,
    choices: [
      { label: 'Laugh along with the crowd', do: (c) => { c.need(c.me, 'fun', 25); c.mood(c.me, 'Laughed at the mask', 10, 12); return `You laugh until you cry. Even the sour-faced guard at the edge of the crowd is smiling.`; } },
      { label: 'Order the dancers arrested', req: (c) => (c.courtRank() >= 2 || ['police', 'official', 'noble'].includes(c.me.job) ? true : 'Needs authority'), do: (c) => { c.fame(c.me, 'law', 3); c.fame(c.me, 'heart', -6); c.court(c.me, 3); c.mood(c.me, 'Crowd hissed', -6, 12); return `The masks are torn off and the dancers dragged away. The noble sends thanks. The crowd hisses you all the way home.`; } },
      { label: 'Pay them to mock your rival next', cost: 30, req: (c) => (c.rival() ? true : 'You have no rival'), do: (c) => { c.enmity(10); c.fame(c.me, 'shadow', 4); c.mood(c.me, 'Rival mocked', 10, 24); return `Tomorrow night the fat yangban wears your rival's crest. The plaza howls; your rival will know who paid.`; } },
    ],
  },
  {
    id: 'fst_lantern_astray', tag: 'festival', title: 'A Wish Gone Astray', cooldown: 14,
    weight: (c) => (c.festival() && c.night ? 2.2 : c.festival() ? 1 : 0),
    text: (c) => `${nm(c.me)} wrote a secret wish on a paper lantern and set it on the wind — then watched it drift low, snag on a neighbour's thatch, and burst into flame. People are running with buckets, and the wish-paper, still legible, has fluttered into the lane.`,
    choices: [
      { label: 'Help fight the fire', do: (c) => { c.need(c.me, 'energy', -20); c.fame(c.me, 'heart', 4); c.honor(c.me, 2); return `You haul water until the thatch is out. The neighbour never asks whose lantern it was.`; } },
      { label: 'Admit it and pay for new thatch', cost: 25, do: (c) => { c.honor(c.me, 5); c.fame(c.me, 'heart', 3); return `The neighbour grumbles, then laughs. Your honesty costs 25 nyang and earns more than that.`; } },
      { label: 'Snatch the wish-paper before anyone reads it', do: (c) => { if (c.chance(0.7)) { c.mood(c.me, 'Secret kept', 4, 12); return `You crumple it into your sleeve. Your wish stays your own.`; } c.honor(c.me, -4); c.mood(c.me, 'Wish exposed', -10, 48); return `A gossiping auntie reads it aloud first. By morning the whole village knows what you wished for.`; } },
    ],
  },
  {
    id: 'fst_drunken_brawl', tag: 'festival', title: 'Brawl at the Festival', cooldown: 8,
    weight: (c) => (c.festival() ? 2 : 0.3),
    text: (c) => `Too much makgeolli and an old quarrel over a boundary stone: two families are swinging benches in the jumak yard, and ${nm(c.me)}'s cousin is somewhere in the middle of it. Somebody has already drawn a knife.`,
    choices: [
      { label: 'Wade in and break it up', do: (c) => { if (c.chance(odds(0.35, c.me, 'sword', 0.06))) { c.fame(c.me, 'law', 3); c.fame(c.me, 'heart', 2); c.honor(c.me, 3); return `You knock the knife from a hand and bellow until both sides back off. Order, of a sort, returns.`; } c.hurt(c.me, 0.15); return `A flying bench catches you square. The brawl burns out on its own, leaving you with a black eye.`; } },
      { label: 'Join in', do: (c) => { c.hurt(c.me, 0.12); c.need(c.me, 'fun', 25); c.honor(c.me, -3); c.mood(c.me, 'Glorious brawl', 6, 12); return `It is stupid and glorious. You wake up in a rice paddy with a split lip and no regrets.`; } },
      { label: 'Slip away before the constables come', do: () => `You leave by the back fence. Behind you, whistles and shouting.` },
    ],
  },

  // ===================================================== MYSTERY =====================================================
  {
    id: 'mys2_straw_hat', tag: 'mystery', title: 'The Man in the Straw Hat', cooldown: 20,
    weight: (c) => (c.night ? 1.4 : 0.6),
    text: (c) => { c.flag('mys2_hat_kind', c.pick(['kin', 'spy', 'inspector'])); return `For the third night running, a man in a wide straw hat stands under the persimmon tree across the lane, watching ${nm(c.me)}'s house. When a lamp is lit he steps back into darkness. When it goes out, he returns.`; },
    choices: [
      { label: 'Go out and confront him', do: (c) => { c.flag('mys2_hat_how', 'confront'); c.chain('mys2_straw_hat_reveal', 4); return `You step into the lane. He turns to go — then stops. "Tomorrow," he says. "After moonrise."`; } },
      { label: 'Set a watch and follow him', do: (c) => { c.flag('mys2_hat_how', 'follow'); c.chain('mys2_straw_hat_reveal', 6); c.fame(c.me, 'shadow', 2); return `You trail him through back lanes until he enters a lodging-house. You will learn more by day.`; } },
      { label: 'Bar the gate and ignore him', do: (c) => { c.mood(c.me, 'Watched at night', -8, 48); return `You sleep badly. On the fourth night, the persimmon tree is empty — for now.`; } },
    ],
  },
  {
    id: 'mys2_straw_hat_reveal', tag: 'mystery', title: 'Beneath the Straw Hat', chainOnly: true,
    weight: () => 0,
    text: (c) => { const k = c.flag('mys2_hat_kind') || 'kin'; if (k === 'kin') return `He takes off the hat. Lined, weathered — and with your father's jaw. "I am your uncle," he says. "I was sold away before you were born. I only wanted to see that the family lived."`; if (k === 'spy') return `In his room you find a letter in a careful hand: daily notes of who enters your house, when, and with whom. ${c.rival() ? 'It bears your rival\'s seal.' : 'It is unsigned, but the paper is court-grade.'}`; return `He shows you the bronze tablet of a royal inspector. "Your household has been accused," he says quietly. "I watch to learn whether it is true."`; },
    choices: [
      { label: 'Invite him in and speak openly', do: (c) => { const k = c.flag('mys2_hat_kind'); if (k === 'kin') { const s = c.newcomer({ age: 'elder', job: 'farmer', sex: 'm' }); if (s) { c.adopt(s); c.rel(c.me, s, 30, 10); } c.mood(c.me, 'Found lost kin', 20, 72); return `He weeps at your table. He will live out his days under your roof.`; } if (k === 'inspector') { c.favour(4); c.fame(c.me, 'law', 4); c.court(c.me, 2); return `You open every ledger. The inspector leaves satisfied — the accusation was false, and he will say so.`; } c.fame(c.me, 'shadow', 2); return `The spy pours tea, smiles, and tells you nothing. He is gone by morning.`; } },
      { label: 'Seize him', do: (c) => { const k = c.flag('mys2_hat_kind'); if (k === 'spy') { c.evidence(1); c.enmity(10); c.fame(c.me, 'law', 4); return `You drag him before witnesses with his letters in hand. ${c.rival() ? 'Your rivals\' spying is now on record.' : 'Someone at court has lost an informant.'}`; } if (k === 'inspector') { c.favour(-8); c.court(c.me, -6); c.honor(c.me, -5); return `You have laid hands on a royal inspector. The king will hear of it.`; } c.honor(c.me, -4); c.mood(c.me, 'Shamed an old man', -10, 48); return `You throw a grey old man into the dirt — and then he tells you who he is.`; } },
      { label: 'Let him go his way', do: (c) => { c.flag('mys2_hat_kind', null); return `The straw hat disappears down the road. You will always wonder.`; } },
    ],
  },
  {
    id: 'mys2_body_in_well', tag: 'mystery', title: 'The Body in the Well', cooldown: 24,
    weight: (c) => 0.8,
    text: (c) => `The bucket comes up from the village well tangled in long black hair. Beneath the water floats a peddler who passed through two days ago — and the bruises on his throat are not from drowning. The headman wants it covered up before the market spoils.`,
    choices: [
      { label: 'Investigate quietly', do: (c) => { const n = c.npc(); c.flag('mys2_well_culprit', n?.id ?? null); c.chain('mys2_well_culprit', 8); return `You ask where the peddler slept, who he argued with, whose sandals left the mud by the well-rim. One name keeps coming back.`; } },
      { label: 'Report it to the constables', do: (c) => { c.fame(c.me, 'law', 3); c.honor(c.me, 2); return `The constables take the body away and arrest a passing beggar. You doubt very much he did it.`; } },
      { label: 'Help the headman hush it up', do: (c) => { c.coins(20); c.honor(c.me, -8); c.mood(c.me, 'Buried the truth', -10, 48); return `+20 nyang from the headman. The peddler goes into an unmarked grave; the well is "purified".`; } },
    ],
  },
  {
    id: 'mys2_well_culprit', tag: 'mystery', title: 'The Killer at the Well', chainOnly: true,
    weight: () => 0,
    text: (c) => { const n = byId(c, c.flag('mys2_well_culprit')); return `The trail ends at ${n ? full(n) + "'s" : 'a respectable villager\'s'} door. Confronted, ${n ? nm(n) : 'the man'} breaks down: the peddler was a slave-catcher who recognised his wife as a runaway from years ago and demanded silver. There was a struggle by the well.`; },
    choices: [
      { label: 'Hand the killer to the magistrate', do: (c) => { const n = byId(c, c.flag('mys2_well_culprit')); if (n) { c.rel(c.me, n, -40); c.memory(n, c.me, 'Turned me in for the well', -60); } c.fame(c.me, 'law', 8); c.honor(c.me, 3); return `Justice is done by the letter. ${n ? nm(n) + "'s" : 'His'} wife is left alone, and some in the village think the wrong man hangs.`; } },
      { label: 'Keep the secret', do: (c) => { const n = byId(c, c.flag('mys2_well_culprit')); if (n) { c.rel(c.me, n, 40, 10); c.memory(n, c.me, 'Kept my secret about the well', 60); } c.fame(c.me, 'heart', 5); return `You say the peddler slipped. ${n ? nm(n) : 'He'} will be in your debt for the rest of his life.`; } },
      { label: 'Demand silver for your silence', do: (c) => { const n = byId(c, c.flag('mys2_well_culprit')); c.coins(45); c.fame(c.me, 'shadow', 6); c.honor(c.me, -8); if (n) { c.rel(c.me, n, -30); c.memory(n, c.me, 'Blackmailed me over the well', -50); } return `+45 nyang, every coin his family has. You have become the very thing the peddler was.`; } },
    ],
  },
  {
    id: 'mys2_tally_stick', tag: 'mystery', title: 'The Notched Tally Stick', cooldown: 16,
    weight: (c) => 0.8,
    text: (c) => `A courier collapsed of fever at the jumak, and in his bundle ${nm(c.me)} finds a split willow tally stick — notches in a pattern that isn't any count of rice or cloth. Someone will be missing it, and someone will be looking for its matching half.`,
    choices: [
      { label: 'Try to decode it', do: (c) => { if (c.chance(odds(0.25, c.me, 'scholarship', 0.08))) { c.skill(c.me, 'scholarship', 0.2); if (c.rival()) { c.evidence(1); return `The notches are dates and sums — payments to a corrupt general, matching your rival's known debts. That is evidence.`; } c.coins(50); return `The notches mark where a smuggler buried his silver. You dig up 50 nyang.`; } c.mood(c.me, 'Baffled', -3, 12); return `After two nights of staring you are no wiser. The stick goes into a drawer.`; } },
      { label: 'Sell it to the highest bidder', do: (c) => { c.coins(40); c.fame(c.me, 'shadow', 4); if (c.chance(0.3)) { c.ambush(c.me, 1, 'Courier\'s master', 5); return `+40 nyang — and the courier's master comes looking for whoever sold his secret.`; } return `A quiet buyer pays 40 nyang and asks no questions.`; } },
      { label: 'Return it to the courier', do: (c) => { c.honor(c.me, 3); c.fame(c.me, 'heart', 2); return `The courier, recovering, grips your wrist in thanks — and makes very sure you didn't look too closely.`; } },
      { label: 'Burn it', do: () => `Some secrets get people killed. The willow burns quickly.` },
    ],
  },
  {
    id: 'mys2_merchant_daughter', tag: 'mystery', title: 'The Vanished Daughter', cooldown: 20,
    weight: (c) => 0.9,
    text: (c) => `A silk merchant's daughter went to the river to wash cloth three days ago and never came back. Her basket was found on the bank. The merchant offers a reward, and the ferryman mentions that a closed cart with foreign drivers crossed that same evening — heading for the slave markets of the coast.`,
    choices: [
      { label: 'Track the cart into the hills', do: (c) => { if (c.chance(odds(0.25, c.me, 'hunting', 0.05) + sk(c.me, 'sword') * 0.03)) { c.coins(60); c.fame(c.me, 'heart', 8); c.fame(c.me, 'blade', 4); c.ambush(c.me, 1, 'Kidnapper', 4); return `You find the cart camped in a ravine and cut her free — one kidnapper gives chase. The merchant pays 60 nyang and weeps on your shoulder.`; } c.hurt(c.me, 0.15); c.mood(c.me, 'Too late', -14, 72); return `You lose the tracks in a stony stream. Days later the cart is said to have reached the coast.`; } },
      { label: 'Add your own silver to the reward', cost: 30, do: (c) => { if (c.chance(0.5)) { c.fame(c.me, 'heart', 6); return `The doubled reward loosens a tongue; the girl is found at an inn on the coast road and brought home.`; } c.fame(c.me, 'heart', 2); return `Many claim the reward with false tales. The girl is not found.`; } },
      { label: 'It is not your affair', do: (c) => { c.mood(c.me, 'Looked away', -5, 24); return `You leave the search to others. The merchant's lamps burn every night that month.`; } },
    ],
  },
];
