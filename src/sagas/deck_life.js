// Story deck: LIFE — family customs, romance, the spirits, prophecy, sickness and small mysteries
// of the old northern kingdoms (Buyeo / early Goguryeo). Schema: see src/sagas.js.

// ---------- local helpers (no imports) ----------
const nm = (s) => s?.name?.given || 'someone';
const full = (s) => s?.name?.full || s?.name?.given || 'someone';
const sk = (s, k) => s?.skills?.[k] || 0;
const alive = (L) => (L || []).filter((s) => s && !s.dead);
const unwed = (s) => !!s && !s.spouse && s.age !== 'child';
const M = (c, s, label, v, h) => { if (s) c.mood(s, label, v, h); };
const H = (c, s, n) => (s ? c.honor(s, n) : '');
const NEED = (c, s, k, n) => { if (s?.needs && k in s.needs) c.need(s, k, n); };
const mate = (c, s = c.me) => c.npc((o) => o.sex !== s?.sex && !o.spouse && !o.married && o.age !== 'elder');
const hhFind = (c, id) => c.hh.find((s) => s.id === id) || null;
const sexWord = (s, m, f) => (s?.sex === 'f' ? f : m);

export default [
  // =====================================================================
  // FAMILY
  // =====================================================================
  {
    id: 'fam_nurse_secret', tag: 'family', title: 'The Old Nurse\'s Secret', once: true,
    weight: (c) => (c.me && c.me.age !== 'child' && c.me.age !== 'elder' ? 0.8 : 0),
    text: (c) => `A bent old woman who once served as wet nurse (yumo) in your family's house catches ${nm(c.me)}'s sleeve at the well. "I swore to carry this into the grave," she whispers, "but the spirits will not let me sleep." The ones who raised ${nm(c.me)} are not the ones who gave ${sexWord(c.me, 'him', 'her')} life — the true parent was of a high house, and the babe was smuggled out in a rice basket during a purge.`,
    choices: [
      { label: 'Claim the bloodline openly', do: (c) => {
        if (c.chance(0.5)) { H(c, c.me, 12); c.favour(4); c.fame(c.me, 'heart', 4); M(c, c.me, 'Noble blood claimed', 10, 24); return `The elders weigh the nurse's oath and the birthmark she describes — they believe it. Doors open a little wider for ${nm(c.me)} now.`; }
        H(c, c.me, -8); M(c, c.me, 'Mocked as a pretender', -10, 24); return 'The village laughs at a peasant claiming noble blood, and the old nurse falls silent before the elders. The shame stings.';
      } },
      { label: 'Keep the secret buried', do: (c) => { M(c, c.me, 'A secret kept', 4, 24); c.memory(c.me, c.me, 'An old nurse told me who I truly am', 8); return `${nm(c.me)} presses a coin into the old woman's palm and asks her never to speak of it again. Some truths are safer in the ground.`; } },
      { label: 'Seek the true parent', cost: 15, do: (c) => { c.flag('nurse_parent', c.pick(['noble', 'general', 'shamaness'])); c.chain('fam_nurse_parent', 10); M(c, c.me, 'Searching for blood', 3, 12); return `${nm(c.me)} pays the nurse for every detail she remembers — a house with blue-tiled eaves, a scar shaped like a crescent. The trail leads beyond the river.`; } },
    ],
  },
  {
    id: 'fam_nurse_parent', tag: 'family', title: 'The Face of One\'s Blood', chainOnly: true,
    weight: () => 1,
    text: (c) => {
      const k = c.flag('nurse_parent') || 'noble';
      const who = k === 'general' ? 'a grey-bearded retired general' : k === 'shamaness' ? 'a shamaness who keeps a shrine of bells' : 'a widowed noble of a fallen house';
      return `At the end of the trail ${nm(c.me)} finds ${who}, with the very crescent scar the nurse described. The eyes that meet ${nm(c.me)}'s are frightened, then wet. "I gave you away so you would live," comes the whisper.`;
    },
    choices: [
      { label: 'Embrace them', do: (c) => { const k = c.flag('nurse_parent'); c.coins(k === 'noble' ? 60 : 25, c.me); M(c, c.me, 'Found my true parent', 18, 48); c.memory(c.me, c.me, 'I met the parent who gave me life', 15); if (k === 'general') c.skill(c.me, 'sword', 1); if (k === 'shamaness') c.skill(c.me, 'charisma', 1); return `They weep together in the courtyard, and ${nm(c.me)} leaves with a family heirloom, a blessing and a little silver.`; } },
      { label: 'Demand public acknowledgment', do: (c) => { if (c.chance(0.45)) { H(c, c.me, 15); c.favour(3); return 'Shamed by their own tears, they acknowledge the lost child before witnesses. The bloodline is restored.'; } H(c, c.me, -5); M(c, c.me, 'Rejected by blood', -14, 36); return 'Fear of old enemies wins. The door closes, and a servant says no one of that name lives here.'; } },
      { label: 'Walk away in silence', do: (c) => { M(c, c.me, 'Closure', 6, 24); H(c, c.me, 3); return `${nm(c.me)} bows once and leaves. Knowing is enough; the family that raised ${sexWord(c.me, 'him', 'her')} is family.`; } },
    ],
  },
  {
    id: 'fam_levirate', tag: 'family', title: 'Your Brother\'s Widow', once: true,
    weight: (c) => (c.me?.sex === 'm' && (c.me.age === 'adult' || c.me.age === 'young') ? 0.7 : 0),
    text: (c) => `Word comes that ${nm(c.me)}'s elder cousin-brother fell on the frontier, and his widow arrives at the gate with a single bundle. By the older custom of Buyeo, a younger brother takes in his elder brother's widow as his own household. The village elders watch to see what ${nm(c.me)} will do.`,
    choices: [
      { label: 'Let her stay under your roof', do: (c) => { const w = c.newcomer({ sex: 'f', age: 'adult', job: 'farmer' }); if (w) { c.adopt(w); c.rel(c.me, w, 15); } H(c, c.me, 8); M(c, c.me, 'Kept the old custom', 5, 24); return `She is given the warm room and a place at the table. The elders nod — ${nm(c.me)} has kept faith with the dead.`; } },
      { label: 'Return her to her own clan with gifts', cost: 30, do: (c) => { H(c, c.me, 4); return 'She is escorted home with cloth and rice. Her clan is grateful, and no one can say the family was mean.'; } },
      { label: 'Grant her independence', cost: 20, do: (c) => { const w = c.newcomer({ sex: 'f', age: 'adult', job: 'merchant' }); if (w) c.rel(c.me, w, 25); c.fame(c.me, 'heart', 5); H(c, c.me, -3); return 'The traditionalists grumble, but she opens a small stall in the market with the silver given her. She bows deeply whenever she passes.'; } },
    ],
  },
  {
    id: 'fam_seook', tag: 'family', title: 'The Son-in-law\'s Hut', once: true,
    weight: (c) => (c.me?.sex === 'm' && unwed(c.me) && c.me.age !== 'elder' ? 0.9 : 0),
    text: (c) => {
      const b = mate(c); c.vars.b = b;
      return `${b ? full(b) + '\'s' : 'A neighbour girl\'s'} family has let it be known they would accept ${nm(c.me)} — on the old terms. By Goguryeo custom (seo-ok), the groom builds a small hut behind the bride's house and lives there, serving her parents, until their first child is grown enough to carry home.`;
    },
    choices: [
      { label: 'Build the hut and serve', do: (c) => { NEED(c, c.me, 'energy', -25); H(c, c.me, 6); if (c.vars.b) c.rel(c.me, c.vars.b, 25, 20); M(c, c.me, 'Living in the seo-ok', 6, 48); return `${nm(c.me)} raises the little hut with his own hands and kneels before her father at dawn. The bride's family is won over.`; } },
      { label: 'Offer a bride-price instead', cost: 60, do: (c) => { if (c.vars.b) c.rel(c.me, c.vars.b, 15, 12); H(c, c.me, 2); return 'Her father accepts the silver and a fine ox-hide, though the grandmothers mutter that money is not service.'; } },
      { label: 'Decline politely', do: (c) => { M(c, c.me, 'Turned down a match', -3, 12); return 'The family takes it gracefully — mostly. Her mother no longer saves him the best rice cake at festivals.'; } },
    ],
  },
  {
    id: 'fam_inheritance', tag: 'family', title: 'The Favoured Child',
    weight: (c) => (alive(c.me?.children).length >= 2 && (c.me.age === 'adult' || c.me.age === 'elder') ? 1 : 0),
    text: (c) => {
      const k = alive(c.me.children); c.vars.a = k[0]; c.vars.b = k[1];
      return `Supper is eaten in sullen silence: ${nm(c.vars.a)} and ${nm(c.vars.b)} have quarrelled over who shall inherit the family's land and ancestral tablets. Everyone knows which of them ${nm(c.me)} quietly favours. Tonight the question must be answered.`;
    },
    choices: [
      { label: (c) => `Name the eldest, ${nm(c.vars.a)}`, do: (c) => { c.rel(c.me, c.vars.a, 10); c.rel(c.me, c.vars.b, -12); c.rel(c.vars.a, c.vars.b, -10); H(c, c.me, 4); return `Custom is satisfied. ${nm(c.vars.b)} bows stiffly and says nothing, which is worse than shouting.`; } },
      { label: (c) => `Name the favourite, ${nm(c.vars.b)}`, do: (c) => { c.rel(c.me, c.vars.b, 15); c.rel(c.me, c.vars.a, -18); c.rel(c.vars.a, c.vars.b, -20); H(c, c.me, -4); return `${nm(c.vars.a)} storms out into the night. The neighbours will talk of this for a season.`; } },
      { label: 'Divide it equally', do: (c) => { c.rel(c.me, c.vars.a, 3); c.rel(c.me, c.vars.b, 3); c.rel(c.vars.a, c.vars.b, 5); return 'Neither child is happy, which is how one knows the division is fair. In time, they may even laugh about it.'; } },
    ],
  },
  {
    id: 'fam_mother_sacrifice', tag: 'family', title: 'A Mother\'s Body as a Shield',
    who: (c) => c.adults().find((s) => s.sex === 'f' && alive(s.children).some((k) => k.age === 'child')) || null,
    weight: (c) => (c.bandits() > 0 || c.atWar() ? 1.2 : 0.4),
    text: (c) => {
      const k = alive(c.me.children).find((x) => x.age === 'child'); c.vars.k = k;
      return `Raiders burst through the fence at dusk, torches spitting. ${nm(c.me)} snatches up little ${nm(k)} as an arrow hisses past the eaves. There is the hay-loft, the back gate — or ${sexWord(c.me, 'his', 'her')} own body.`;
    },
    choices: [
      { label: 'Shield the child with your own body', do: (c) => { c.hurt(c.me, 0.55); H(c, c.me, 15); c.fame(c.me, 'heart', 10); if (c.vars.k) { c.rel(c.me, c.vars.k, 30); c.memory(c.vars.k, c.me, `${nm(c.me)} took the blow meant for me`, 25, 'saved'); } return `The club meant for the child falls across ${nm(c.me)}'s back. The raiders, unnerved by such fury, flee — and the village will sing of this mother.`; } },
      { label: 'Flee through the back gate', do: (c) => { if (c.chance(0.7)) { M(c, c.me, 'Escaped with my child', 4, 12); return 'Mother and child vanish into the millet field until the shouting stops. The house is looted, but both are whole.'; } c.hurt(c.me, 0.25); c.coins(-20); return 'A raider catches the hem of her skirt; she tears free, bleeding, while they strip the storeroom.'; } },
      { label: 'Scream for the neighbours', do: (c) => { if (c.chance(0.55)) { c.fame(c.me, 'heart', 2); return 'Gongs and dogs answer from every yard. The raiders lose their nerve and run.'; } c.ambush(c.me, 2, 'Raider', 4); return 'No one comes in time — two raiders turn on the screaming woman!'; } },
    ],
  },
  {
    id: 'fam_disowned_heir', tag: 'family', title: 'The Disowned Heir Returns', once: true,
    weight: (c) => (c.me?.age === 'adult' || c.me?.age === 'elder' ? 0.6 : 0),
    text: (c) => `A rider appears at the head of a dozen ragged followers: a nephew of ${nm(c.me)}'s house, cast out years ago for striking an elder. He has fought bandits in the north and returns with scars and loyal men. "I have come to bow at the ancestral shrine," he says, "and to be forgiven — or to be refused to my face."`,
    choices: [
      { label: 'Forgive and welcome him home', do: (c) => { const h = c.newcomer({ sex: 'm', age: 'young', job: 'swordsman', traits: ['Brave', 'Loyal'] }); if (h) { c.adopt(h); c.rel(c.me, h, 25); } c.coins(-15); H(c, c.me, 5); return 'He weeps at the shrine and moves in that night; his followers camp by the river and swear to guard your fields.'; } },
      { label: 'Give him silver and send him on', cost: 40, do: (c) => { H(c, c.me, 2); return 'He takes the silver without a word. His men grumble, but they ride on north.'; } },
      { label: 'Refuse him at the gate', do: (c) => { H(c, c.me, 3); if (c.chance(0.3)) { c.ambush(c.me, 2, 'Outcast\'s man', 5); return 'Two of his hot-blooded followers draw steel to avenge the insult!'; } M(c, c.me, 'Shut the gate on kin', -6, 24); return 'He spits once in the dust and rides off. Some doors, once shut, stay shut.'; } },
    ],
  },
  {
    id: 'fam_jealousy_law', tag: 'family', title: 'Accused under the Jealousy Law',
    who: (c) => c.adults().find((s) => s.spouse && !s.spouse.dead) || null,
    weight: () => 0.6,
    text: (c) => `Old Buyeo law was harsh on household discord: a wife or husband judged to have stirred jealous strife could be shamed before the village. A neighbour has gone to the elders claiming ${nm(c.me)} made a scene over ${nm(c.me.spouse)}'s friendliness with another. The elders summon ${nm(c.me)} to the meeting tree.`,
    choices: [
      { label: 'Defend yourself before the elders', do: (c) => { if (c.chance(0.3 + sk(c.me, 'charisma') * 0.07)) { H(c, c.me, 6); c.rel(c.me, c.me.spouse, 8); return `${nm(c.me)} speaks calmly and plainly; the elders dismiss the charge as gossip.`; } H(c, c.me, -10); M(c, c.me, 'Publicly shamed', -12, 24); return 'The elders rule against the household. The rebuke is spoken aloud beneath the tree.'; } },
      { label: 'Pay the elders a peace-fee', cost: 25, do: (c) => { H(c, c.me, -2); return 'The matter is "settled" with silver and wine. Few are fooled, but no one speaks of it again.'; } },
      { label: (c) => `Stand together with ${nm(c.me.spouse)}`, do: (c) => { c.rel(c.me, c.me.spouse, 15, 10); if (c.chance(0.6)) { H(c, c.me, 4); return 'The couple arrive hand in hand and laugh off the tale. The accuser looks a fool.'; } H(c, c.me, -4); return 'United they stand — but the elders still issue a mild warning about keeping a quiet house.'; } },
    ],
  },
  {
    id: 'fam_lost_child', tag: 'family', title: 'Lost in the Market Crowd',
    weight: (c) => (c.children().length ? (c.festival() ? 2.2 : 0.5) : 0),
    text: (c) => {
      const k = c.pick(c.children()); c.vars.k = k;
      return `Drums, mask-dancers, the smell of roasting chestnuts — and suddenly ${nm(k)}'s small hand is gone from ${nm(c.me)}'s grip. The market crowd swallows everything. Somewhere a child is crying, but not the right one.`;
    },
    choices: [
      { label: 'Search the stalls yourself', do: (c) => { NEED(c, c.me, 'energy', -15); if (c.chance(0.6)) { if (c.vars.k) c.rel(c.me, c.vars.k, 10); return `${nm(c.me)} finds ${nm(c.vars.k)} at a sugar-candy stall, sticky and unconcerned.`; } c.flag('lost_kid', c.vars.k?.id); c.chain('fam_lost_child_found', 5); M(c, c.me, 'My child is missing', -15, 6); return 'Hours pass and the lanterns are lit. No sign yet.'; } },
      { label: 'Pay the market crier', cost: 10, do: (c) => { if (c.chance(0.85)) return `The crier's bellow carries over the crowd; a fishwife brings ${nm(c.vars.k)} back within the hour.`; c.flag('lost_kid', c.vars.k?.id); c.chain('fam_lost_child_found', 5); return 'The crier shouts himself hoarse. No one answers.'; } },
      { label: 'Ask the temple monks to help', do: (c) => { c.flag('lost_kid', c.vars.k?.id); c.chain('fam_lost_child_found', 4); return 'The monks fan out among the stalls, ringing small bells. They promise word by nightfall.'; } },
    ],
  },
  {
    id: 'fam_lost_child_found', tag: 'family', title: 'Found by the River', chainOnly: true,
    weight: () => 1,
    text: (c) => { const k = hhFind(c, c.flag('lost_kid')); c.vars.k = k; return `A ferryman's boy runs up: a child matching ${nm(k)}'s description is sitting on the river steps with an old peddler, who has been feeding ${k?.sex === 'f' ? 'her' : 'him'} millet cakes and refusing to leave. The peddler wants to see the parent with his own eyes.`; },
    choices: [
      { label: 'Reward the peddler', cost: 15, do: (c) => { M(c, c.me, 'Child safe at home', 14, 24); c.fame(c.me, 'heart', 2); if (c.vars.k) c.memory(c.vars.k, c.me, 'The day I got lost at the festival', 6); return 'The old man bows, embarrassed by the silver. The child sleeps all the way home.'; } },
      { label: 'Thank him and scold the child', do: (c) => { M(c, c.me, 'Child safe at home', 10, 24); if (c.vars.k) c.rel(c.me, c.vars.k, -4); return 'Relief turns to scolding on the walk home. Little hands will hold on tighter next time.'; } },
    ],
  },
  {
    id: 'fam_ancestral_rites', tag: 'spirits', title: 'The Neglected Ancestors',
    weight: (c) => ((c.me?.needs?.honor ?? 50) < 45 ? 1.4 : 0.5),
    text: (c) => `The ancestral tablets have gathered dust since the busy season, and the rites (jesa) were forgotten on grandfather's death-day. Since then: a cracked water jar, a hen that stopped laying, and ${nm(c.me)} dreams of an old man turning away in silence.`,
    choices: [
      { label: 'Hold full rites with food and wine', cost: 20, do: (c) => { for (const s of c.hh) M(c, s, 'Ancestors appeased', 6, 24); H(c, c.me, 6); return 'The table is laid with rice, fish and persimmons; the family bows in the old order. That night the dreams turn warm.'; } },
      { label: 'A simple bow and a cup of water', do: (c) => { H(c, c.me, 2); return 'It is little, but it is sincere. The hen lays again by week\'s end.'; } },
      { label: 'Spirits are for old women', do: (c) => { c.coins(-c.pick([5, 10, 15])); M(c, c.me, 'Ill luck dogs the house', -8, 36); H(c, c.me, -4); return 'A storeroom jar of sesame oil topples and breaks. Then another. The grandmothers say "told you so."'; } },
    ],
  },
  {
    id: 'fam_twins', tag: 'family', title: 'Twins at the Neighbour\'s', once: true,
    weight: () => 0.6,
    text: (c) => `Two cries ring out from the neighbour's birthing room — twins (ssangdungi). Some old villagers mutter that twins split one soul and bring misfortune; the exhausted mother fears she cannot feed both through the winter. She looks at ${nm(c.me)} with desperate eyes.`,
    choices: [
      { label: 'Foster one of the twins', do: (c) => { const b = c.newcomer({ age: 'child', job: 'child' }); if (b) { c.adopt(b); c.rel(c.me, b, 25); } c.fame(c.me, 'heart', 6); M(c, c.me, 'A new little one', 10, 48); return 'The babe is swaddled and carried across the yard. Two households now share one joy.'; } },
      { label: 'Send rice and speak against the gossip', cost: 20, do: (c) => { H(c, c.me, 6); c.fame(c.me, 'heart', 3); return `${nm(c.me)} declares before the well that twins are a double blessing. The muttering stops — and the mother eats well.`; } },
      { label: 'Stay out of it', do: () => 'The family manages, somehow. The mother avoids your eyes at the well.' },
    ],
  },
  {
    id: 'fam_elder_wish', tag: 'family', title: 'The Elder\'s Last Wish',
    who: (c) => c.hh.find((s) => s.age === 'elder' && !s.dead) || null,
    weight: () => 0.9, cooldown: 20,
    text: (c) => {
      const w = c.pick(['to see the eastern sea once more', 'to be buried with the bow of their youth', 'to make peace with an estranged old friend across the valley']); c.vars.w = w;
      const kid = c.adults().find((s) => s !== c.me) || null; c.vars.kid = kid;
      return `${nm(c.me)} has grown frail; their breath rattles at night. Calling the family close, the elder speaks a final wish: ${w}. "Then I can go to the ancestors with a light heart."`;
    },
    choices: [
      { label: 'Fulfil the wish, whatever it costs', cost: 30, do: (c) => { M(c, c.me, 'Last wish granted', 25, 72); H(c, c.me, 8); for (const s of c.hh) if (s !== c.me) M(c, s, 'Honoured our elder', 8, 24); c.memory(c.me, c.vars.kid || c.me, 'My family granted my last wish', 20); return 'It is done, with oxcarts, borrowed silver and tears. The elder smiles in a way no one has seen in years.'; } },
      { label: 'Promise, and gather the family', do: (c) => { M(c, c.me, 'Surrounded by family', 12, 48); NEED(c, c.me, 'social', 30); return 'The children and grandchildren crowd the warm floor to tell old stories late into the night.'; } },
      { label: 'Gently say it is impossible', do: (c) => { M(c, c.me, 'A wish denied', -10, 48); return 'The elder nods, understanding. The silence afterward is long.'; } },
    ],
  },
  {
    id: 'fam_foundling', tag: 'family', title: 'A Basket at the Gate',
    weight: (c) => (c.season === 'winter' ? 1 : 0.5), cooldown: 15,
    text: (c) => `At dawn ${nm(c.me)} finds a reed basket at the gate: a child of three or four winters, wrapped in hemp, with only a carved wooden fish tied to the wrist. No note. Frost is already on the basket's rim.`,
    choices: [
      { label: 'Take the child in as your own', do: (c) => { const k = c.newcomer({ age: 'child', job: 'child' }); if (k) { c.adopt(k); c.rel(c.me, k, 30); c.memory(k, c.me, `${nm(c.me)} took me in from the cold`, 20, 'saved'); } c.fame(c.me, 'heart', 8); M(c, c.me, 'Adopted a foundling', 12, 48); return 'The child clutches the wooden fish and eats three bowls of porridge. The household has grown by one.'; } },
      { label: 'Carry the child to the temple', do: (c) => { H(c, c.me, 3); c.fame(c.me, 'heart', 2); return 'The monks take the little one in. Perhaps the temple will raise a scholar.'; } },
      { label: 'Pay a wet-nurse family to raise it', cost: 25, do: (c) => { c.fame(c.me, 'heart', 4); return 'A farming family with an empty cradle accepts gladly. The child will want for nothing.'; } },
    ],
  },

  // =====================================================================
  // ROMANCE
  // =====================================================================
  {
    id: 'rom_across_rank', tag: 'romance', title: 'Love Across Rank',
    who: (c) => c.adults().find((s) => unwed(s) && s.age !== 'elder') || null,
    weight: (c) => (c.me?.has?.('Romantic') ? 1.4 : 0.7),
    text: (c) => {
      const o = mate(c); c.vars.o = o;
      const low = ['noble', 'official', 'general', 'king', 'prince', 'princess'].includes(c.me.job);
      return low
        ? `${nm(c.me)} has fallen for ${o ? full(o) : 'a commoner'}, a farmer's child with mud on their hems and a laugh like spring water. A house of rank does not marry the fields; ${nm(c.me)}'s elders would sooner see the match drowned.`
        : `${nm(c.me)} has lost ${sexWord(c.me, 'his', 'her')} heart to the child of a noble house who passes the field each morning in a palanquin. A commoner does not look upward — yet a silk handkerchief was dropped, deliberately, at ${nm(c.me)}'s feet.`;
    },
    choices: [
      { label: 'Elope by moonlight', do: (c) => { if (c.vars.o) c.rel(c.me, c.vars.o, 30, 30); H(c, c.me, -12); M(c, c.me, 'Ran away with love', 18, 48); if (c.chance(0.35)) { c.crime(c.me, 30, 'eloping against rank'); return 'They flee into the hills — but the angry family names it abduction before the magistrate.'; } return 'Two figures slip over the ridge with one bundle between them. The scandal is enormous; so is the joy.'; } },
      { label: 'Court in secret', do: (c) => { if (c.vars.o) c.rel(c.me, c.vars.o, 15, 15); M(c, c.me, 'A secret sweetheart', 8, 24); if (c.chance(0.25)) { H(c, c.me, -5); return 'Notes hidden in a hollow pine... until a servant finds one. Tongues begin to wag.'; } return 'Notes in a hollow pine, meetings by the mill-race at dusk. No one knows. Yet.'; } },
      { label: 'Give it up for the family\'s sake', do: (c) => { H(c, c.me, 5); M(c, c.me, 'Heartbreak', -14, 48); return `${nm(c.me)} returns the handkerchief unopened. Duty is a cold bedfellow.`; } },
    ],
  },
  {
    id: 'rom_betrothed_rival', tag: 'romance', title: 'Promised to Another',
    who: (c) => c.adults().find((s) => unwed(s) && s.age !== 'elder') || null,
    weight: (c) => (c.rival() ? 1 : 0),
    text: (c) => {
      const o = mate(c); c.vars.o = o; const r = c.rival();
      return `${o ? full(o) : 'The one ' + nm(c.me) + ' loves'} has been promised by ${sexWord(o, 'his', 'her')} parents to a son of the ${r?.clan || 'rival'} clan — a match to settle a debt of grain. The betrothal gifts arrive in three days. ${nm(c.me)} has until then.`;
    },
    choices: [
      { label: 'Challenge the rival suitor openly', do: (c) => { c.enmity(15); if (c.vars.o) c.rel(c.me, c.vars.o, 20, 20); if (c.chance(0.3 + sk(c.me, 'sword') * 0.05)) { H(c, c.me, 10); return 'Before the whole village, the rival\'s son backs down. The betrothal is broken — and the clan is livid.'; } c.hurt(c.me, 0.25); H(c, c.me, -4); return 'The challenge ends in a sprawl in the dirt. The rival clan laughs, and the betrothal stands.'; } },
      { label: 'Pay off the family\'s grain debt', cost: 80, do: (c) => { c.enmity(8); if (c.vars.o) c.rel(c.me, c.vars.o, 30, 30); M(c, c.me, 'Bought back a heart', 12, 48); return 'With the debt cleared, the betrothal has no reason to stand. The rival clan notes who paid.'; } },
      { label: 'Let them go', do: (c) => { M(c, c.me, 'Lost love to a rival', -16, 48); c.enmity(-5); return 'The gifts arrive with drums. Watching from a distance, it hurts more than a sword wound.'; } },
    ],
  },
  {
    id: 'rom_royal_triangle', tag: 'romance', title: 'A Royal Rival in Love',
    who: (c) => c.adults().find((s) => unwed(s) && s.age !== 'elder') || null,
    weight: (c) => (c.royals().length ? 0.8 : 0),
    text: (c) => {
      const R = c.royals(); const p = R.find((s) => s.sex === c.me.sex && s.job !== 'queen') || R[0]; c.vars.p = p; const o = mate(c); c.vars.o = o;
      return `${o ? full(o) : 'The one ' + nm(c.me) + ' loves'} has caught the eye of ${p?.job === 'princess' ? 'the princess' : p?.job === 'queen' ? 'someone close to the queen' : 'the prince'} ${nm(p)} at the palace gate. Palace women have already come asking questions. To stand between a royal and their desire is to stand in front of a galloping horse.`;
    },
    choices: [
      { label: 'Step aside for royalty', do: (c) => { c.favour(5); M(c, c.me, 'Yielded to a royal', -10, 36); return 'The palace remembers who knows their place. Royal favour warms; the heart does not.'; } },
      { label: 'Declare your love anyway', do: (c) => { if (c.vars.o) c.rel(c.me, c.vars.o, 25, 25); if (c.vars.p) c.rel(c.me, c.vars.p, -20); c.favour(-6); H(c, c.me, 4); return 'The village is thrilled by the defiance; the palace is not. Doors at court quietly close.'; } },
      { label: 'Use the royal interest to your advantage', do: (c) => { c.favour(3); c.coins(40, c.me); H(c, c.me, -8); if (c.vars.o) c.rel(c.me, c.vars.o, -25, -20); return 'A word to the right eunuch, a gift received in return. It is profitable — and it is shameful.'; } },
    ],
  },
  {
    id: 'rom_token', tag: 'romance', title: 'The Bronze Hairpin',
    who: (c) => c.adults().find((s) => unwed(s)) || null,
    weight: (c) => (c.season === 'spring' ? 1.4 : 0.7),
    text: (c) => {
      const o = mate(c); c.vars.o = o;
      return `${o ? full(o) : 'Someone dear'} has lingered near ${nm(c.me)} at every well-trip this week. At the smith's stall lie the old courting tokens: a bronze hairpin (binyeo) with a plum blossom, and a jade pendant cut in two — one half to keep, one to give, so the pieces may someday find each other.`;
    },
    choices: [
      { label: 'Give the bronze hairpin', cost: 15, req: (c) => (c.vars.o ? true : 'No one to give it to'), do: (c) => { c.rel(c.me, c.vars.o, 20, 25); M(c, c.vars.o, 'Received a hairpin', 12, 48); return `${nm(c.vars.o)} turns pink and slides it into ${sexWord(c.vars.o, 'his topknot', 'her braid')} at once.`; } },
      { label: 'Split the jade pendant', cost: 25, req: (c) => (c.vars.o ? true : 'No one to give it to'), do: (c) => { c.item(c.me, 'halfPendant', 1); c.item(c.vars.o, 'halfPendant', 1); c.rel(c.me, c.vars.o, 15, 30); c.memory(c.vars.o, c.me, `${nm(c.me)} gave me half a jade pendant`, 15); return 'Each takes half. "If we are ever parted," the vow goes, "these will find their way home."'; } },
      { label: 'Keep your heart closed', do: () => 'The stall-keeper shrugs and polishes the pin for the next shy customer.' },
    ],
  },
  {
    id: 'rom_reunion', tag: 'romance', title: 'Reunited After Years',
    who: (c) => c.adults().find((s) => s.age !== 'young' && s.age !== 'child') || null,
    weight: () => 0.6,
    text: (c) => {
      const o = c.npc((s) => s.sex !== c.me.sex && s.age !== 'child'); c.vars.o = o;
      const wed = c.me.spouse ? `${nm(c.me)} is long married to ${nm(c.me.spouse)}` : `${full(o)} has since married another`;
      return `At the ferry, a face from youth: ${o ? full(o) : 'an old sweetheart'}, whom ${nm(c.me)} once swore to marry before war scattered everything. Years have passed; ${wed}. Their eyes meet across the boat, and neither looks away quickly enough.`;
    },
    choices: [
      { label: 'Talk of the old days', do: (c) => { if (c.vars.o) c.rel(c.me, c.vars.o, 15, 10); M(c, c.me, 'Old feelings stirred', 6, 24); if (c.me.spouse && c.chance(0.3)) { c.rel(c.me, c.me.spouse, -10); return 'An innocent hour by the ferry... that someone saw and reported home. Supper is frosty.'; } return 'They speak of the river, the war, the friends who are gone. It is sweet and it aches.'; } },
      { label: 'Bow and walk away', do: (c) => { H(c, c.me, 3); M(c, c.me, 'Let the past lie', -3, 12); return 'A polite bow, nothing more. Some roads are best left untravelled twice.'; } },
      { label: 'Tell your spouse about the meeting', req: (c) => (c.me.spouse ? true : 'You are unmarried'), do: (c) => { c.rel(c.me, c.me.spouse, 10, 8); return `${nm(c.me.spouse)} listens, then squeezes ${nm(c.me)}'s hand. Honesty binds tighter than any vow.`; } },
    ],
  },
  {
    id: 'rom_spy_love', tag: 'romance', title: 'The Spy Who Stayed',
    who: (c) => c.adults().find((s) => s.age !== 'elder') || null,
    weight: (c) => (c.rival() || c.atWar() ? 0.8 : 0),
    text: (c) => {
      const o = mate(c); c.vars.o = o; const r = c.rival();
      return `${o ? full(o) : 'A new friend'} has been sweet and attentive for weeks. Tonight, trembling, ${sexWord(o, 'he', 'she')} confesses: ${sexWord(o, 'he', 'she')} was sent by ${r ? 'the ' + r.clan + ' clan' : 'enemy agents'} to learn the household's secrets — and somewhere along the way fell truly in love with ${nm(c.me)}.`;
    },
    choices: [
      { label: 'Shelter them from their masters', do: (c) => { if (c.vars.o) { c.rel(c.me, c.vars.o, 25, 30); c.flag('spy_id', c.vars.o.id); } c.enmity(10); c.chain('rom_spy_hunted', 8); return 'The spy\'s handlers will not take betrayal kindly. The household bolts its doors.'; } },
      { label: 'Turn them in — use what they know', do: (c) => { c.evidence(1); if (c.vars.o) c.rel(c.me, c.vars.o, -40, -40); H(c, c.me, 4); M(c, c.me, 'Betrayed a lover', -8, 36); return 'The spy\'s confession becomes evidence. The look on that face as the guards come will not fade soon.'; } },
      { label: 'Let them leave quietly', do: (c) => { if (c.vars.o) c.rel(c.me, c.vars.o, 10, 5); M(c, c.me, 'Love and lies', -6, 24); return 'One last look, and the spy slips away before dawn. Maybe it was real. Maybe not.'; } },
    ],
  },
  {
    id: 'rom_spy_hunted', tag: 'romance', title: 'The Handlers Come Calling', chainOnly: true,
    weight: () => 1,
    text: (c) => `Shadows gather at the edge of the yard. The spy's former masters have come for their turncoat — and for whoever sheltered them. ${nm(c.me)} hears a sandal scrape on the wall.`,
    choices: [
      { label: 'Stand and fight', do: (c) => { c.ambush(c.me, 2, 'Handler', 5); return 'Two masked figures drop from the wall, knives drawn!'; } },
      { label: 'Smuggle the spy out by the river', do: (c) => { if (c.chance(0.6)) { M(c, c.me, 'Saved my beloved', 10, 24); return 'A fisherman\'s skiff, a reed hat, a long silent pole downriver. They are safe, for now.'; } c.hurt(c.me, 0.2); return 'The handlers catch them at the landing; there is a scuffle, and the spy is dragged away into the dark.'; } },
      { label: 'Bargain with the handlers', cost: 40, do: (c) => { c.enmity(-5); return 'Silver changes hands over the wall. The shadows withdraw — for now.'; } },
    ],
  },
  {
    id: 'rom_festival_song', tag: 'romance', title: 'Songs by the Bonfire',
    who: (c) => c.adults().find((s) => unwed(s)) || null,
    weight: (c) => (c.festival() ? 2.4 : c.night || c.hour >= 19 ? 0.6 : 0),
    text: (c) => {
      const o = mate(c); c.vars.o = o;
      return `Around the great fire, young men and women of the village sing call-and-answer songs, as their ancestors did at the harvest festival, ringed in a circle dance. ${o ? full(o) : 'A stranger'} has twice ended up beside ${nm(c.me)} in the ring — and is waiting for ${sexWord(c.me, 'him', 'her')} to sing the next verse.`;
    },
    choices: [
      { label: 'Sing a verse to them', do: (c) => { const ok = c.chance(0.35 + sk(c.me, 'charisma') * 0.06); if (c.vars.o) c.rel(c.me, c.vars.o, ok ? 20 : 5, ok ? 25 : 2); NEED(c, c.me, 'fun', 25); if (ok) { c.skill(c.me, 'charisma', 0.3); return 'The verse is clever and the voice is true. The answering verse is sung only to you.'; } return 'A voice cracks on the high note; the circle roars with laughter. Still, they smile.'; } },
      { label: 'Join the circle dance (ganggangsullae)', do: (c) => { NEED(c, c.me, 'fun', 30); NEED(c, c.me, 'social', 20); if (c.vars.o) c.rel(c.me, c.vars.o, 10, 10); return 'Hands linked, round and round under the moon — breathless and laughing.'; } },
      { label: 'Watch from the shadows', do: (c) => { NEED(c, c.me, 'fun', 8); return 'The songs are lovely from a distance, too.'; } },
    ],
  },
  {
    id: 'rom_matchmaker', tag: 'romance', title: 'The Matchmaker Calls',
    who: (c) => c.adults().find((s) => unwed(s) && s.age !== 'elder') || null,
    weight: () => 0.9,
    text: (c) => {
      const o = mate(c); c.vars.o = o;
      return `The village matchmaker (jungmae), a stout woman with a red sash and a fan, settles herself on the porch uninvited. She has the perfect match for ${nm(c.me)}: ${o ? full(o) + ', ' + (o.job || 'of good family') : 'a fine youth from the next valley'}. "Good teeth, good temper, good fields. A fee for my trouble, naturally."`;
    },
    choices: [
      { label: 'Agree to a meeting', cost: 10, do: (c) => { if (c.vars.o) { c.rel(c.me, c.vars.o, 15, 15); return `${nm(c.vars.o)} arrives in clean clothes and fidgets charmingly. A promising start.`; } return 'The match from the next valley never arrives. The matchmaker keeps the fee.'; } },
      { label: 'Ask for someone else', do: (c) => { const o = mate(c); if (o && o !== c.vars.o) { c.rel(c.me, o, 10, 10); return `With a sniff she offers ${full(o)} instead. Better, perhaps.`; } return 'She sniffs that there is no one else worthy in this village.'; } },
      { label: 'Send her away', do: (c) => { M(c, c.me, 'Pestered by matchmaker', -2, 6); return 'She leaves muttering that some people will die alone with their cats.'; } },
    ],
  },
  {
    id: 'rom_letter', tag: 'romance', title: 'An Intercepted Letter',
    weight: (c) => (c.hh.some((s) => unwed(s) && s !== c.me) ? 0.8 : 0),
    text: (c) => {
      const t = c.hh.find((s) => unwed(s) && s !== c.me) || null; c.vars.t = t; const o = c.npc(); c.vars.o = o;
      return `A courier boy hands ${nm(c.me)} a folded mulberry-paper letter meant for ${nm(t)}. The seal is pressed hastily, and the brushwork, peeking through, reads like poetry. It seems to be from ${o ? full(o) : 'an admirer'}.`;
    },
    choices: [
      { label: 'Deliver it unopened', do: (c) => { if (c.vars.t) { c.rel(c.me, c.vars.t, 8); M(c, c.vars.t, 'A love letter!', 10, 24); if (c.vars.o) c.rel(c.vars.t, c.vars.o, 10, 15); } H(c, c.me, 2); return `${nm(c.vars.t)} reads it three times and hides it under the sleeping mat.`; } },
      { label: 'Read it first', do: (c) => { if (c.chance(0.4)) { if (c.vars.t) c.rel(c.me, c.vars.t, -15); return `Caught red-handed with the seal broken. ${nm(c.vars.t)} does not speak to ${nm(c.me)} for days.`; } NEED(c, c.me, 'fun', 15); return 'The poetry is dreadful and wonderful. The seal is pressed back neatly.'; } },
      { label: 'Burn it — the match is unsuitable', do: (c) => { if (c.vars.t && c.vars.o) c.rel(c.vars.t, c.vars.o, -5, -10); H(c, c.me, -2); return 'The letter curls in the kitchen fire. The admirer, unanswered, assumes the worst.'; } },
    ],
  },

  // =====================================================================
  // RELIGION & SPIRITS
  // =====================================================================
  {
    id: 'rel_priestess_sign', tag: 'spirits', title: 'The Great Shaman\'s Sign',
    weight: (c) => (c.king() ? 0.8 : 0),
    text: (c) => {
      const d = c.pick(['to move the royal granary to the eastern hills', 'to raise a new levy of soldiers before the harvest', 'to marry a prince into a foreign house']); c.vars.d = d;
      return `The high priestess (keun mudang) of the realm emerges from three days of trance, bells shaking at her wrists. Before the whole crowd she declares that the heavens have sent a sign — a two-headed calf — against King ${nm(c.king())}'s decision ${d}. Every eye in the square turns to see who will kneel, and with whom.`;
    },
    choices: [
      { label: 'Kneel with the priestess', do: (c) => { c.favour(-6); H(c, c.me, 5); if (c.me.has?.('Pious')) M(c, c.me, 'Stood with the spirits', 10, 24); return 'The crowd follows the bells. The palace notes the names of those who knelt first.'; } },
      { label: 'Stand by the king\'s decree', do: (c) => { c.favour(6); if (c.me.has?.('Pious')) M(c, c.me, 'Defied the spirits', -10, 36); H(c, c.me, 1); return `${nm(c.me)} remains standing. A royal steward catches the gesture and nods.`; } },
      { label: 'Propose a compromise rite', do: (c) => { if (c.chance(0.25 + sk(c.me, 'charisma') * 0.07)) { c.favour(4); H(c, c.me, 8); c.fame(c.me, 'heart', 4); return 'A rite of cleansing before the decree is carried out — both priestess and palace accept. A crisis averted by a clever tongue.'; } c.favour(-2); return 'The priestess glares; the steward sneers. A compromise pleases no one this time.'; } },
    ],
  },
  {
    id: 'rel_heaven_sacrifice', tag: 'spirits', title: 'Offering to Heaven',
    weight: (c) => (c.season === 'winter' || c.season === 'autumn' ? 1.3 : 0), cooldown: 10,
    text: (c) => `It is the season of the great rite to heaven — Buyeo's yeonggo in the twelfth month, Goguryeo's dongmaeng in the tenth. The village headman goes door to door: every household must offer something for the altar on the hill, where an ox will be sacrificed and the people will drink and sing for days. ${nm(c.me)}'s house is next.`,
    choices: [
      { label: 'Offer a fine calf', cost: 50, do: (c) => { for (const s of c.hh) M(c, s, 'Heaven is pleased', 8, 48); H(c, c.me, 10); c.favour(2); return 'The calf leads the procession up the hill. The headman bows low to your house.'; } },
      { label: 'Offer rice and millet wine', cost: 15, do: (c) => { H(c, c.me, 3); NEED(c, c.me, 'fun', 15); return 'A modest offering, gladly given. The wine flows freely at the rite.'; } },
      { label: 'Offer nothing this year', do: (c) => { H(c, c.me, -8); M(c, c.me, 'Shunned at the rite', -8, 36); return 'The headman marks the gate with a frown. At the festival, people pass your family without greeting.'; } },
    ],
  },
  {
    id: 'rel_spirit_sickness', tag: 'spirits', title: 'The Spirit-Sickness', once: true,
    who: (c) => c.hh.find((s) => s.sex === 'f' && (s.age === 'young' || s.age === 'child') && !s.dead) || null,
    weight: () => 0.6,
    text: (c) => `${nm(c.me)} has not eaten in four days. She laughs at nothing, speaks in an old woman's voice, dreams of a general in red with a crescent sword. The village grandmother knows the signs at once: sinbyeong, the spirit-sickness — the gods are calling her to become a mudang.`,
    choices: [
      { label: 'Hold the initiation rite (naerim-gut)', cost: 40, do: (c) => { c.heal(c.me); c.skill(c.me, 'charisma', 2); M(c, c.me, 'Accepted the calling', 15, 72); c.fame(c.me, 'heart', 5); return 'Three days of drums and blades; on the last night she dances barefoot on the knife edges, unhurt. She wakes clear-eyed — and different.'; } },
      { label: 'Call the herbal physician', cost: 20, do: (c) => { if (c.chance(0.4)) { c.heal(c.me); return 'Bitter decoctions and acupuncture — the fever breaks. Whether the gods are done with her, no one can say.'; } NEED(c, c.me, 'energy', -30); M(c, c.me, 'Spirits will not let go', -12, 48); return 'The needles do nothing. She grows thinner still.'; } },
      { label: 'Refuse — no daughter of ours', do: (c) => { NEED(c, c.me, 'energy', -40); M(c, c.me, 'Spirit-sick and refused', -20, 72); c.hurt(c.me, 0.15); return 'The family bars the door to the shamans. The sickness worsens; the grandmother warns the gods do not take "no" for long.'; } },
    ],
  },
  {
    id: 'rel_ox_hoof', tag: 'spirits', title: 'The Ox-Hoof Divination',
    weight: (c) => (c.atWar() ? 1.6 : 0), cooldown: 8,
    text: (c) => `Before the army marches, the old Buyeo rite is held: an ox is slaughtered and its hoof examined. If the hoof is split, disaster; if joined, victory. The divining elder asks ${nm(c.me)}'s household to provide the beast — and to stand witness to the reading.`,
    choices: [
      { label: 'Provide the ox and read honestly', cost: 30, do: (c) => { if (c.chance(0.55)) { H(c, c.me, 8); c.favour(4); for (const s of c.hh) M(c, s, 'The hoof is joined', 10, 48); return 'The hoof is whole! The soldiers cheer, and your house is called lucky.'; } for (const s of c.hh) M(c, s, 'The hoof is split', -8, 48); H(c, c.me, 2); return 'Split. A groan runs through the ranks. Honest, but grim.'; } },
      { label: 'Provide the ox — and "help" the reading', cost: 30, do: (c) => { if (c.chance(0.75)) { c.favour(5); c.fame(c.me, 'shadow', 4); return 'A quick thumb presses the hoof closed. "Joined!" Morale soars, and no one saw.'; } H(c, c.me, -15); c.favour(-6); return 'The elder catches the thumb on the hoof. Disgrace, before the whole army.'; } },
      { label: 'Decline the honour', do: (c) => { H(c, c.me, -3); return 'Another house provides the ox. Yours is not mentioned in the victory songs.'; } },
    ],
  },
  {
    id: 'rel_rain_ritual', tag: 'spirits', title: 'Praying for Rain',
    weight: (c) => (c.season === 'summer' ? 1.3 : 0), cooldown: 8,
    text: (c) => `Not a drop in thirty days; the paddies crack like old pottery. The village gathers at the river for a rain rite (giu-je): a dragon of straw, a drum, a pig's head, a shamaness leaping and calling to the dragon king. Every family is expected to dance or give.`,
    choices: [
      { label: 'Dance until you drop', do: (c) => { NEED(c, c.me, 'energy', -30); H(c, c.me, 5); if (c.chance(0.45)) { for (const s of c.hh) M(c, s, 'The rains came!', 12, 48); return 'At dusk, a fat drop strikes the drum. Then another. The village weeps and laughs in the downpour.'; } return 'Hours of dancing in the dust. The sky stays brass. Perhaps tomorrow.'; } },
      { label: 'Give rice for the offering', cost: 15, do: (c) => { H(c, c.me, 3); return 'The rice is heaped on the altar, and the shamaness names your house in her chant.'; } },
      { label: 'Dig a deeper well instead', do: (c) => { NEED(c, c.me, 'energy', -20); c.skill(c.me, 'farming', 0.5); H(c, c.me, -2); return 'While others dance, you dig. The elders frown — but your paddy has water.'; } },
    ],
  },
  {
    id: 'rel_sacred_tree', tag: 'spirits', title: 'The Sacred Tree Desecrated',
    weight: () => 0.7, cooldown: 12,
    text: (c) => `The great zelkova at the village edge — the sindansu, hung with five-coloured cloth, where the mountain spirit is said to rest — has been hacked with an axe overnight. The cloth strips lie in the mud. The village shaman says the spirit will demand payment unless the culprit is found.`,
    choices: [
      { label: 'Track the culprit', do: (c) => { if (c.chance(0.3 + sk(c.me, 'archery') * 0.04 + sk(c.me, 'scholarship') * 0.03)) { c.fame(c.me, 'law', 6); H(c, c.me, 6); if (c.rival()) { c.evidence(1); return 'The axe-marks lead to a woodcutter in rival pay — they hoped the curse would fall on your fields. Evidence for the magistrate.'; } return 'A drunken charcoal-burner, wanting firewood. He is made to tie new cloth and pay a fine.'; } return 'The tracks vanish at the stream. The culprit is never found.'; } },
      { label: 'Pay for an appeasement rite', cost: 25, do: (c) => { H(c, c.me, 6); for (const s of c.hh) M(c, s, 'Spirit appeased', 5, 24); return 'New cloth, rice wine poured at the roots, and a long chant. The village breathes again.'; } },
      { label: 'It\'s only a tree', do: (c) => { M(c, c.me, 'Unease in the village', -4, 24); if (c.chance(0.4)) { c.hurt(c.me, 0.1); return 'That night a branch falls from nowhere and grazes your shoulder. The grandmothers nod knowingly.'; } return 'Nothing happens. The villagers still look at you sideways.'; } },
    ],
  },
  {
    id: 'rel_shaman_purge', tag: 'spirits', title: 'The Purge of the Shamans', once: true,
    weight: (c) => (c.king() ? 0.6 : 0),
    text: (c) => `King ${nm(c.king())}'s men are tearing down the spirit-shrines and arresting mudang who prophesied against the throne. In the night, a frightened shamaness with her drum wrapped in a skirt knocks on ${nm(c.me)}'s back door, begging to be hidden.`,
    choices: [
      { label: 'Hide her in the storeroom', do: (c) => { if (c.chance(0.7)) { H(c, c.me, 8); c.fame(c.me, 'heart', 6); if (c.me.has?.('Pious')) M(c, c.me, 'Saved a holy woman', 12, 48); return 'The soldiers search the yard and leave. At dawn she blesses every doorframe and vanishes into the mountains.'; } c.favour(-10); c.crime(c.me, 40, 'sheltering a proscribed shaman'); return 'A soldier\'s spear finds the rice sacks — and the drum behind them.'; } },
      { label: 'Turn her over to the soldiers', do: (c) => { c.favour(6); c.coins(30, c.me); H(c, c.me, -10); M(c, c.me, 'Betrayed a shamaness', -10, 48); return 'The reward is paid in clipped silver. Her drum is burned in the square.'; } },
      { label: 'Give her bread and send her off', do: (c) => { H(c, c.me, 2); return 'A bundle of bread and a whispered direction toward the hills. What happens next is up to the spirits.'; } },
    ],
  },
  {
    id: 'rel_possession', tag: 'spirits', title: 'Grandfather Speaks in the Night',
    weight: (c) => (c.night || c.hour >= 20 || c.hour <= 7 ? 1.2 : 0.2), cooldown: 12,
    text: (c) => {
      const p = c.pick(c.hh.filter((s) => s !== c.me)) || c.me; c.vars.p = p;
      return `Late in the evening, ${nm(p)} sits bolt upright, eyes rolled white, and speaks in a dead grandfather's gravel voice — complaining of hunger, naming a debt, and pointing at the north corner of the yard. The household lamps gutter all at once.`;
    },
    choices: [
      { label: 'Listen, and dig where he points', do: (c) => { if (c.chance(0.4)) { c.coins(c.pick([30, 45, 60])); return 'Beneath the north corner, a jar of old coins wrapped in rotted silk. "Pay my debt," the voice had said. Perhaps it was a gift.'; } NEED(c, c.me, 'energy', -15); return 'Only stones and an old ox-bone. By morning, the possessed one remembers nothing.'; } },
      { label: 'Summon the village mudang', cost: 20, do: (c) => { if (c.vars.p) c.heal(c.vars.p); for (const s of c.hh) M(c, s, 'The spirit is at peace', 6, 24); return 'Gongs and a rite of sending-off (jinogwi-gut): the grandfather is fed, thanked and guided onward.'; } },
      { label: 'Splash cold water and shout', do: (c) => { if (c.vars.p) { NEED(c, c.vars.p, 'energy', -20); M(c, c.vars.p, 'Possessed in the night', -8, 24); } return 'A gasp, a cough, and the eyes clear. But the dreams of the house are uneasy for days.'; } },
    ],
  },

  // =====================================================================
  // PROPHECY
  // =====================================================================
  {
    id: 'pro_birth_omen', tag: 'omen', title: 'An Omen at the Cradle', once: true,
    weight: (c) => (c.children().length ? 0.9 : 0),
    text: (c) => {
      const k = c.pick(c.children()); c.vars.k = k; const o = c.pick(['a light that hung over the roof all night', 'a white bird that sat on the cradle and would not leave', 'a dream of a great egg glowing in the river']); c.vars.o = o;
      return `Neighbours whisper of the night little ${nm(k)} was born: ${o}. Founders of kingdoms, the old tales say, came into the world exactly so. A wandering monk stops at the gate and stares at the child for a long, long time.`;
    },
    choices: [
      { label: 'Proclaim the omen proudly', do: (c) => { if (c.vars.k) { c.fame(c.vars.k, 'heart', 6); H(c, c.vars.k, 10); } c.fame(c.me, 'heart', 3); if (c.king() && c.chance(0.4)) { c.favour(-6); return 'The tale spreads to the palace, where kings do not love children born under omens. A chill wind blows from the capital.'; } return 'The village decides the child is blessed. Gifts of eggs and rice cakes pile at the gate.'; } },
      { label: 'Hush it up', do: (c) => { M(c, c.me, 'Guarding a secret', 2, 24); return 'The monk is paid to forget. The child will grow without the weight of prophecy — for now.'; } },
      { label: 'Make an offering at the mountain shrine', cost: 15, do: (c) => { if (c.vars.k) c.skill(c.vars.k, c.pick(['archery', 'scholarship', 'charisma']), 1); H(c, c.me, 4); return 'The mountain god accepts the rice. The child seems sharper, steadier, from that day.'; } },
    ],
  },
  {
    id: 'pro_north_ruler', tag: 'omen', title: 'A Ruler from the North',
    weight: (c) => (c.king() ? 0.6 : 0), cooldown: 15,
    text: (c) => `A blind singer at the jumak sings an old verse no one asked for: "When the three-legged crow flies south, a ruler from the north will come with a bow, and the old throne will crack." Drinkers glance nervously at the door. King ${nm(c.king())}'s informers are everywhere.`,
    choices: [
      { label: 'Report the singer to the palace', do: (c) => { c.favour(6); c.coins(15, c.me); H(c, c.me, -5); return 'The singer is hauled away. A small purse finds its way to you.'; } },
      { label: 'Buy him a drink and ask for more', cost: 5, do: (c) => { c.memory(c.me, c.me, 'A blind singer told me of a ruler from the north', 6); if (c.chance(0.3)) { c.favour(-3); return 'An informer overheard you asking. Your name is now on a list.'; } NEED(c, c.me, 'fun', 15); return 'He sings of crows and bows and a child born from an egg. A good story — or a warning.'; } },
      { label: 'Leave before trouble starts', do: () => 'You drain your cup and slip out. Behind you, someone starts an argument.' },
    ],
  },
  {
    id: 'pro_falling_star', tag: 'omen', title: 'A Star Falls',
    weight: (c) => (c.night || c.hour >= 20 ? 1.4 : 0), cooldown: 10,
    text: (c) => `A streak of white fire splits the evening sky and falls behind the eastern ridge, lighting the hills like noon for one heartbeat. The dogs howl. Elders mutter that a falling star means a great one will die — or be born.`,
    choices: [
      { label: 'Make a wish', do: (c) => { M(c, c.me, 'Wished on a star', 8, 24); NEED(c, c.me, 'fun', 10); return 'A quiet wish under the stars. No one need know what it was.'; } },
      { label: 'Ride for the ridge to find it', do: (c) => { NEED(c, c.me, 'energy', -25); if (c.chance(0.35)) { c.item(c.me, 'starIron', 1); c.fame(c.me, 'hunt', 4); return 'In a smoking crater lies a black, heavy stone that rings like a bell — sky-iron! The smiths will pay anything.'; } if (c.chance(0.3)) { c.hurt(c.me, 0.15); return 'A twisted ankle on the scree, and only scorched grass at the end.'; } return 'Hours of climbing, and only scorched grass at the end.'; } },
      { label: 'Ask the shaman what it means', cost: 5, do: (c) => { const good = c.chance(0.5); M(c, c.me, good ? 'A lucky star' : 'An ill star', good ? 6 : -6, 24); return good ? 'The shaman says a great fortune approaches your house.' : 'The shaman says someone great is passing from this world. Keep the old ones warm.'; } },
    ],
  },
  {
    id: 'pro_sacred_bow', tag: 'omen', title: 'The Bow No One Can Draw', once: true,
    who: (c) => c.adults().slice().sort((a, b) => sk(b, 'archery') - sk(a, 'archery'))[0] || null,
    weight: (c) => (sk(c.me, 'archery') >= 5 ? 1.2 : 0.4),
    text: (c) => `At the mountain shrine hangs a great horn-bow (gakgung), black with age, wrapped in birch bark. The shrine keeper says it belonged to the founder of a kingdom, and that only one destined to rule the hunt can draw it full. Champions have torn their shoulders trying. The keeper looks at ${nm(c.me)} and holds it out.`,
    choices: [
      { label: 'Draw it to the full', req: (c) => (sk(c.me, 'archery') >= 7 ? true : 'Needs archery 7'), do: (c) => { c.item(c.me, 'sacredBow', 1); c.fame(c.me, 'hunt', 25); H(c, c.me, 15); c.favour(3); M(c, c.me, 'Drew the sacred bow', 20, 72); return 'The bow groans, bends — and sings. The arrow vanishes into the clouds. The keeper falls to his knees and gives you the bow.'; } },
      { label: 'Try anyway', do: (c) => { if (c.chance(0.08)) { c.item(c.me, 'sacredBow', 1); c.fame(c.me, 'hunt', 20); return 'Against all expectation, it bends! Perhaps the bow chooses its own.'; } c.hurt(c.me, 0.2); H(c, c.me, -2); return 'The string barely moves; something in the shoulder tears. The keeper hangs the bow back, unsurprised.'; } },
      { label: 'Bow to it and leave an offering', cost: 5, do: (c) => { c.skill(c.me, 'archery', 0.5); return 'Paying respects to the old bow, you feel your own aim steady. Someday, perhaps.'; } },
    ],
  },
  {
    id: 'pro_sun_dream', tag: 'omen', title: 'A Dream of the Sun',
    who: (c) => c.hh.find((s) => s.pregnant && !s.dead) || null,
    weight: (c) => (c.me?.pregnant ? 2 : 0), once: true,
    text: (c) => `${nm(c.me)} wakes gasping: in the dream, the sun itself rolled down from the sky and into her skirt, warm as a hearth. In the old tales, such a taemong (conception dream) foretells a child who will lead armies or found a line of kings.`,
    choices: [
      { label: 'Tell the whole village', do: (c) => { H(c, c.me, 8); c.fame(c.me, 'heart', 3); if (c.king() && c.chance(0.35)) { c.favour(-5); return 'The tale reaches the palace. Some there do not welcome a child of the sun.'; } return 'Neighbours bring red beans and seaweed soup. The child is already a legend.'; } },
      { label: 'Keep it between husband and wife', do: (c) => { if (c.me.spouse) c.rel(c.me, c.me.spouse, 10, 10); M(c, c.me, 'A secret dream', 10, 48); return 'Whispered at night beneath the quilt — a hope shared by two.'; } },
      { label: 'Ask a shaman to read it', cost: 15, do: (c) => { M(c, c.me, 'A blessed pregnancy', 14, 72); NEED(c, c.me, 'energy', 15); return 'The shaman beams: a strong child, healthy birth. She ties a red thread around your wrist for protection.'; } },
    ],
  },
  {
    id: 'pro_false_prophet', tag: 'omen', title: 'The Prophet in the Market',
    weight: () => 0.7, cooldown: 12,
    text: (c) => `A man in a white robe preaches in the market that the world will end at the next new moon — and only those who give their silver to his "Heavenly Hall" will be spared. Two dozen villagers already follow him, glassy-eyed. ${c.hh.find((s) => s !== c.me) ? nm(c.hh.find((s) => s !== c.me)) + ' seems tempted.' : 'His eyes fall on you.'}`,
    choices: [
      { label: 'Expose him before the crowd', do: (c) => { if (c.chance(0.3 + sk(c.me, 'charisma') * 0.06 + sk(c.me, 'scholarship') * 0.03)) { c.fame(c.me, 'law', 8); H(c, c.me, 8); return 'You ask him to name the day the last prophet\'s world ended. He stammers. By noon, his followers are demanding their silver back.'; } H(c, c.me, -4); if (c.chance(0.3)) { c.hurt(c.me, 0.1); return 'His followers jostle and beat you out of the market.'; } return 'The crowd jeers you down. Faith is stubborn.'; } },
      { label: 'Report him to the magistrate', do: (c) => { c.fame(c.me, 'law', 4); c.coins(10, c.me); return 'The constables come for him at dawn — he has already vanished, with the silver.'; } },
      { label: 'Give a coin, just in case', cost: 10, do: (c) => { M(c, c.me, 'Fooled by a prophet', -4, 24); return 'The new moon passes. The world does not end. Neither does your embarrassment.'; } },
    ],
  },

  // =====================================================================
  // HEALTH & MYSTERY
  // =====================================================================
  {
    id: 'hea_plague', tag: 'health', title: 'Plague from the Garrison',
    weight: (c) => (c.atWar() ? 1 : 0.4), cooldown: 15,
    text: (c) => `Soldiers coming back from the garrison town bring a fever with black blisters. Three have died in the barracks; a family on the riverbank coughs blood. The headman calls a meeting: shut the road, send healers, or let people go where they will.`,
    choices: [
      { label: 'Argue for quarantine', do: (c) => { if (c.chance(0.4 + sk(c.me, 'charisma') * 0.05)) { H(c, c.me, 6); c.fame(c.me, 'law', 3); return 'The road is closed with ropes and straw-rope (geumjul). The fever burns itself out on the far side.'; } c.coins(-15); M(c, c.me, 'Fever in the village', -10, 36); return 'The vote fails; merchants want the road open. Fever reaches your street.'; } },
      { label: 'Pay a physician to tend the sick', cost: 40, do: (c) => { c.fame(c.me, 'heart', 10); H(c, c.me, 8); return 'The physician burns mugwort and lances the blisters. Many who would have died will see spring.'; } },
      { label: 'Nurse the sick yourself', do: (c) => { c.fame(c.me, 'heart', 12); H(c, c.me, 10); if (c.chance(0.35)) { c.hurt(c.me, 0.4); NEED(c, c.me, 'energy', -40); return 'You save lives — and catch the fever yourself. It is a long week in the dark.'; } NEED(c, c.me, 'energy', -30); return 'Days of cool cloths and boiled water. You are exhausted, but untouched.'; } },
      { label: 'Take the family up into the hills', do: (c) => { c.coins(-10); H(c, c.me, -6); for (const s of c.hh) M(c, s, 'Fled the plague', -4, 24); return 'Safe, cold and ashamed on a mountainside for three days, while others stayed and tended the dying.'; } },
    ],
  },
  {
    id: 'hea_poison_arrow', tag: 'health', title: 'The Wound That Festers',
    who: (c) => c.adults().find((s) => ['soldier', 'general', 'hunter', 'swordsman', 'police'].includes(s.job)) || null,
    weight: (c) => (c.atWar() ? 1.3 : c.bandits() > 0 ? 0.6 : 0.2),
    text: (c) => `The arrow graze ${nm(c.me)} took in a skirmish should have healed by now. Instead the flesh is purple-black and the fever climbs each evening — the arrowhead was dipped in wolfsbane (buja). Heat throbs up the arm.`,
    choices: [
      { label: 'Cut it out and cauterise', do: (c) => { c.hurt(c.me, 0.3); if (c.chance(0.75)) { H(c, c.me, 5); M(c, c.me, 'Survived the knife', 6, 24); c.chain('hea_poison_after', 12); return 'Teeth on a leather strap; the iron hisses. The black flesh is gone.'; } NEED(c, c.me, 'energy', -40); return 'The cut is clean, but the poison has gone deeper. Fever rages for days.'; } },
      { label: 'Fetch the royal physician', cost: 40, do: (c) => { c.heal(c.me); return 'Antidote of licorice root and black beans, a poultice of garlic — the swelling falls by morning.'; } },
      { label: 'A mudang\'s healing charm', cost: 10, do: (c) => { if (c.chance(0.35)) { c.heal(c.me); return 'Whether by charm or by luck, the fever breaks at the third crow.'; } c.hurt(c.me, 0.3); return 'The charm burns nicely. The arm gets worse.'; } },
    ],
  },
  {
    id: 'hea_poison_after', tag: 'health', title: 'The Scar Remembers', chainOnly: true,
    weight: () => 1,
    text: (c) => `The wound has scabbed into an ugly starburst scar. ${nm(c.me)} flexes the arm cautiously — it is weaker, but it is still there. The archer who loosed that arrow is said to drink at the jumak every market-day.`,
    choices: [
      { label: 'Seek out the archer', do: (c) => { if (c.chance(0.5)) { c.ambush(c.me, 1, 'Poisoner', 4); return 'He sees you coming and draws a knife!'; } c.fame(c.me, 'blade', 3); return 'He sees the scar, goes white and flees town. Reputation is a weapon too.'; } },
      { label: 'Rest and recover', do: (c) => { c.heal(c.me); NEED(c, c.me, 'energy', 30); return 'Three days of rice gruel and sleep. The arm is nearly whole again.'; } },
    ],
  },
  {
    id: 'hea_fever', tag: 'health', title: 'Fever in the House',
    who: (c) => c.pick(c.hh) || null,
    weight: (c) => (c.season === 'winter' ? 1.2 : 0.6), cooldown: 10,
    text: (c) => `${nm(c.me)} burns with fever, shivering under every quilt the house owns. ${c.me.age === 'child' ? 'The little one whimpers for mother' : 'Even water will not stay down'}. The ondol is stoked, but the heat inside the body is worse.`,
    choices: [
      { label: 'Brew willow-bark and ginger tea', do: (c) => { const helper = c.adults().find((s) => s !== c.me) || c.me; if (c.chance(0.45 + sk(helper, 'farming') * 0.04)) { c.heal(c.me); if (helper !== c.me) c.rel(helper, c.me, 8); return `${nm(helper)} sits up all night with the tea. By morning the fever breaks.`; } c.hurt(c.me, 0.15); return 'The tea helps a little, but the fever lingers for days.'; } },
      { label: 'Call the physician', cost: 25, do: (c) => { c.heal(c.me); NEED(c, c.me, 'energy', 20); return 'Needles at the wrist and a bitter herbal draught. The fever is gone by evening.'; } },
      { label: 'Hang charms and wait', do: (c) => { NEED(c, c.me, 'energy', -30); if (c.chance(0.5)) return 'The fever passes on its own after three miserable days.'; c.hurt(c.me, 0.3); return 'The fever worsens; the charms do not care.'; } },
    ],
  },
  {
    id: 'hea_miracle_cure', tag: 'health', title: 'The Miracle Elixir',
    weight: () => 0.7, cooldown: 10,
    text: (c) => `A travelling "physician" with a silk hat and a cart of jars has set up by the jumak. His elixir of deer antler, ginseng and "dragon bone" cures all ailments, he says, and grants long life. A hunchbacked woman stands up straight before the crowd, cured — though she looks a lot like his assistant.`,
    choices: [
      { label: 'Buy a jar', cost: 30, do: (c) => { if (c.chance(0.15)) { c.heal(c.me); NEED(c, c.me, 'energy', 30); return 'Astonishingly, it is real ginseng. You feel ten years younger.'; } M(c, c.me, 'Swindled', -6, 24); return 'Coloured water and rice wine. The cart is gone by morning.'; } },
      { label: 'Expose the trick', do: (c) => { if (c.chance(0.35 + sk(c.me, 'scholarship') * 0.05)) { c.fame(c.me, 'law', 6); c.coins(20, c.me); return 'You name the "dragon bone" as burnt cow\'s rib. The crowd turns on him; the grateful buyers reward you.'; } c.fame(c.me, 'law', 1); return 'He talks his way out of it smoothly and moves on to the next village.'; } },
      { label: 'Walk away', do: () => 'You leave him to his marks. Somewhere a fool is buying hope.' },
    ],
  },
  {
    id: 'mys_steward', tag: 'mystery', title: 'Who Killed the Steward?', once: true,
    weight: (c) => (c.me?.age !== 'child' ? 0.6 : 0),
    text: (c) => `The steward who kept the household's grain accounts is found face-down in the irrigation ditch. Clutched in his stiff hand: a tally stick, notched in a pattern that is not numbers — some kind of code. The constables call it drowning while drunk. The steward never drank.`,
    choices: [
      { label: 'Decipher the tally stick yourself', req: (c) => (sk(c.me, 'scholarship') >= 3 ? true : 'Needs scholarship 3'), do: (c) => { c.flag('steward_culprit', c.rival() ? 'rival' : 'moneylender'); c.chain('mys_steward_reveal', 8); c.skill(c.me, 'scholarship', 0.5); return 'By lamplight the notches resolve into a pattern: names, sums, dates. Someone has been stealing grain — and the steward caught them.'; } },
      { label: 'Pay a scribe to decode it', cost: 20, do: (c) => { c.flag('steward_culprit', c.rival() ? 'rival' : 'moneylender'); c.chain('mys_steward_reveal', 12); return 'The scribe squints, then pales. "Give me a day," he says.'; } },
      { label: 'Burn it and let the dead rest', do: (c) => { M(c, c.me, 'Unanswered questions', -6, 36); return 'The tally stick crackles in the stove. Whatever it said, the steward\'s ghost will have to bear it alone.'; } },
    ],
  },
  {
    id: 'mys_steward_reveal', tag: 'mystery', title: 'The Tally Stick Speaks', chainOnly: true,
    weight: () => 1,
    text: (c) => {
      const r = c.rival();
      return c.flag('steward_culprit') === 'rival' && r
        ? `The code is clear: the steward was being paid by the ${r.clan} clan to skim grain from your storehouse — until he got cold feet and threatened to confess. The last notch is a date: the night he died.`
        : 'The code is clear: a moneylender in the market had been squeezing the steward over gambling debts and forcing him to skim grain. When the steward threatened to talk, he ended up in the ditch.';
    },
    choices: [
      { label: 'Accuse them publicly', do: (c) => { c.fame(c.me, 'law', 10); H(c, c.me, 8); if (c.flag('steward_culprit') === 'rival' && c.rival()) { c.evidence(2); c.enmity(20); return 'Before the magistrate, the tally stick speaks louder than any witness. The rival clan is shaken — and furious.'; } c.coins(40, c.me); return 'The moneylender is dragged off in chains; part of the stolen grain-value is restored to you.'; } },
      { label: 'Use it as leverage', do: (c) => { c.coins(60, c.me); H(c, c.me, -8); c.fame(c.me, 'shadow', 6); if (c.flag('steward_culprit') === 'rival') c.enmity(10); return 'A quiet word: silver, monthly, or the tally goes to the magistrate. They pay — and hate you for it.'; } },
      { label: 'Give the steward a proper funeral and leave it', cost: 15, do: (c) => { H(c, c.me, 5); M(c, c.me, 'Laid him to rest', 4, 24); return 'Incense and paper money for the steward\'s journey. Justice can wait for another day.'; } },
    ],
  },
  {
    id: 'mys_stranger_secret', tag: 'mystery', title: 'The Stranger Who Knows',
    weight: () => 0.6, cooldown: 15,
    text: (c) => `A stranger in a bamboo hat sits on the bench outside your gate, whittling. When ${nm(c.me)} passes, he speaks without looking up — naming something only the family knows: ${c.pick(['where grandfather buried the silver during the last war', 'the true father of the eldest child', 'the night someone in your house killed a tax collector'])}. "Interesting thing to know," he says, and smiles.`,
    choices: [
      { label: 'Pay for his silence', cost: 30, do: (c) => { if (c.chance(0.3)) { c.coins(-20); return 'He takes the silver — and returns a week later for more. Silence is a rented thing.'; } return 'He pockets the coins and tips his hat. You never see him again.'; } },
      { label: 'Threaten him with steel', do: (c) => { if (c.chance(0.3 + sk(c.me, 'sword') * 0.06)) { c.fame(c.me, 'blade', 3); return 'At the sight of the blade he pales, swears on his ancestors, and is gone before nightfall.'; } c.ambush(c.me, 1, 'Stranger', 5); return 'He was waiting for that. A blade flashes out of his sleeve!'; } },
      { label: 'Ask what he really wants', do: (c) => { if (c.chance(0.5)) { c.coins(25, c.me); M(c, c.me, 'An unexpected ally', 6, 24); return 'He is a former servant of your house, come to warn, not threaten. He leaves a pouch of old wages, still owed.'; } c.enmity(5); return 'He shrugs. "Someone paid me to see if you would flinch. You did." He walks away whistling.'; } },
    ],
  },
];
