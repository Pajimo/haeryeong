// Deck: the wide world — war, trade, craft, the hunt and the weather.
// Iron against bronze, salt roads and silk gluts, steel that will not shatter, tigers in the passes,
// floods and frosts. See sagas.js for the event schema and the `c` helper object.

// ---------- small local helpers (no imports) ----------
const sk = (s, k) => (s && s.skills ? s.skills[k] || 0 : 0);
const nm = (s, d = 'a stranger') => (s && s.name ? s.name.given : d);
const best = (c, k) => { const a = c.adults().slice().sort((x, y) => sk(y, k) - sk(x, k)); return a[0] || null; };
const REALM = { seorang: 'Seorang', hwaru: 'Hwaru', heukpa: 'Heukpa' };
const foe = (c) => { const w = (c.G.systems || []).find((x) => x && x.id === 'war'); return REALM[w?.st?.war?.realm] || 'the enemy'; };
const isWinter = (c) => c.season === 'winter';
const kingName = (c) => (c.king() ? `King ${nm(c.king(), '')}`.trim() : 'the throne');
const inv = (s, k) => (s && s.inv ? s.inv[k] || 0 : 0);
const hasFarmer = (c) => c.adults().some((s) => s.job === 'farmer');

export default [
  // =====================================================================
  // WAR
  // =====================================================================
  {
    id: 'war_bronze_shatter', tag: 'war', title: 'Bronze Against Iron', cooldown: 10,
    weight: (c) => (c.atWar() ? 2 : 0),
    who: (c) => best(c, 'sword'),
    text: (c) => `At the ford the levies met ${foe(c)} spearmen carrying grey iron. ${c.me.name.given} watched a neighbour's bronze blade ring once and snap clean at the hilt. The line is wavering; men are looking over their shoulders at the willows.`,
    choices: [
      { label: 'Sound the retreat before the line breaks',
        do: (c) => { c.honor(c.me, -4); c.mood(c.me, 'Ordered a retreat', -4); c.flag('saw_iron', true); return 'You pull the levies back in good order. Few are lost, but the village mutters that you ran.'; } },
      { label: 'Fall back into the willows and ambush them',
        do: (c) => { const p = 0.3 + sk(c.me, 'sword') * 0.05 + sk(c.me, 'archery') * 0.03;
          if (c.chance(p)) { c.fame(c.me, 'blade', 6); c.honor(c.me, 6); c.item(c.me, 'deerHide', 1); return 'The pursuers blunder into the reeds and your bows empty their saddles. The ford is yours again by dusk.'; }
          c.hurt(c.me, 0.3); c.honor(c.me, -2); return 'They are wiser than you hoped and flank the willows. You escape with a gash across the ribs.'; } },
      { label: 'Strip the fallen of their iron to study it',
        do: (c) => { const p = 0.4 + sk(c.me, 'sword') * 0.04;
          if (c.chance(p)) { c.flag('enemy_iron', (c.flag('enemy_iron') || 0) + 1); c.coins(15); c.mood(c.me, 'Carried home enemy iron', 6); return 'You drag three iron swords out of the mud under arrow-fire. Every smith in the valley will want to see them. +15 nyang in scrap besides.'; }
          c.hurt(c.me, 0.25); return 'An arrow takes you in the shoulder before you reach the bodies. You come back empty-handed and bleeding.'; } },
    ],
  },
  {
    id: 'war_winter_siege', tag: 'war', title: 'The Frozen Fort', cooldown: 12,
    weight: (c) => (c.atWar() && isWinter(c) ? 2.5 : 0),
    who: (c) => best(c, 'sword'),
    text: (c) => `Snow has piled to the battlements of the border fort, and ${foe(c)} has camped below it for twelve days. The well is frozen solid, the arrows are counted, and the garrison commander asks ${c.me.name.given} what should be burned next for warmth — the gate, the granary or the shrine.`,
    choices: [
      { label: 'Melt snow, ration rice, and hold',
        do: (c) => { c.need(c.me, 'hunger', -25); if (c.chance(0.55 + sk(c.me, 'charisma') * 0.03)) { c.honor(c.me, 10); c.favour(8); c.fame(c.me, 'blade', 5); return 'You keep the men singing through the worst nights. When the thaw comes, the enemy leaves first.'; }
          c.hurt(c.me, 0.2); c.honor(c.me, 2); return 'Frostbite takes two of your fingers’ feeling and three men’s lives, but the fort does not fall.'; } },
      { label: 'Lead a sortie under cover of a blizzard',
        do: (c) => { const p = 0.3 + sk(c.me, 'sword') * 0.06;
          if (c.chance(p)) { c.fame(c.me, 'blade', 10); c.honor(c.me, 12); c.coins(40); c.item(c.me, 'rice', 4); return 'You fall on their cook-fires out of the whiteness and come back dragging their supplies. +40 nyang and four sacks of their rice.'; }
          c.hurt(c.me, 0.45); c.honor(c.me, -3); return 'The blizzard turns on you too. Half the sortie loses its way; you crawl back to the gate badly wounded.'; } },
      { label: 'Send to the capital for relief', cost: 30,
        do: (c) => { c.court(c.me, 2); c.favour(3); return 'Your runner, paid well, gets through. A relief column arrives in nine days and the siege lifts, though the credit goes to its general.'; } },
    ],
  },
  {
    id: 'war_levy_call', tag: 'war', title: 'The Levy Call', cooldown: 14,
    weight: (c) => (c.atWar() && c.adults().length >= 2 ? 2 : 0),
    who: (c) => c.adults().slice().sort((a, b) => sk(b, 'sword') - sk(a, 'sword'))[0] || null,
    text: (c) => `A magistrate's runner nails a notice to the shrine gate: every household must send one fighter to the muster by the new moon. The war with ${foe(c)} goes poorly. Everyone in the house knows ${c.me.name.given} is the strongest of you.`,
    choices: [
      { label: (c) => `Send ${c.me.name.given}, the best of you`,
        do: (c) => { c.honor(c.me, 10); c.favour(5); c.court(c.me, 2); c.skill(c.me, 'sword', 0.3); for (const s of c.adults()) if (s !== c.me) c.mood(s, 'Fears for a kinsman at war', -6, 48); return `${c.me.name.given} marches with the levy. The house is quieter and prouder.`; } },
      { label: 'Hire a substitute from the inn', cost: 60,
        do: (c) => { c.honor(c.me, -3); return 'A scarred drifter takes your name and your coin to the muster. Nobody asks too many questions — this time.'; } },
      { label: 'Hide your fighters in the hill caves',
        do: (c) => { if (c.chance(0.55)) { c.honor(c.me, -6); return 'The recruiters search the house and find only old women and steaming rice pots. You were not caught — but neighbours who sent sons remember.'; }
          c.crime(c.me, 40, 'dodging the royal levy'); c.honor(c.me, -12); c.favour(-6); return `A neighbour points the way to the caves. ${c.me.name.given} is dragged out and posted as a levy-dodger.`; } },
    ],
  },
  {
    id: 'war_depot_raid', tag: 'war', title: 'Night Raid on the Depot', cooldown: 10,
    weight: (c) => (c.atWar() && c.night ? 2.5 : c.atWar() ? 0.6 : 0),
    who: (c) => best(c, 'sword'),
    text: (c) => `A scout crawls in with mud to his eyebrows: the empire's commandery has stocked a supply depot for ${foe(c)} behind the ridge — grain, iron arrowheads and a stockade of our own captured farmers. Twenty guards, and half of them drunk. ${c.me.name.given} has a handful of willing men and one moonless night.`,
    choices: [
      { label: 'Burn it to the ground',
        do: (c) => { const p = 0.45 + sk(c.me, 'sword') * 0.04 + sk(c.me, 'archery') * 0.02;
          if (c.chance(p)) { c.fame(c.me, 'blade', 7); c.favour(6); c.honor(c.me, 6); return 'Fire arrows find the grain sheds. The glow can be seen from the capital; the enemy will march hungry.'; }
          c.hurt(c.me, 0.3); return 'A dog barks too soon. You loose your fire arrows anyway, but most fall short, and you run with a spear-cut on your thigh.'; } },
      { label: 'Steal what you can carry',
        do: (c) => { const p = 0.4 + sk(c.me, 'sword') * 0.03 + sk(c.me, 'charisma') * 0.02;
          if (c.chance(p)) { c.item(c.me, 'rice', 6); c.item(c.me, 'salt', 3); c.flag('enemy_iron', (c.flag('enemy_iron') || 0) + 1); return `Ox-carts roll home before dawn: six sacks of rice, three of salt and a crate of iron arrowheads. ${c.coins(25)} from the rest.`; }
          c.hurt(c.me, 0.25); c.honor(c.me, -2); return 'The carts bog down in a ditch. You abandon them and run.'; } },
      { label: 'Break open the stockade and free the prisoners',
        do: (c) => { const p = 0.35 + sk(c.me, 'sword') * 0.05;
          if (c.chance(p)) { c.honor(c.me, 14); c.fame(c.me, 'heart', 8); const n = c.newcomer({ job: 'farmer' }); if (n) c.rel(c.me, n, 30); return `You cut the ropes and lead forty farmers home through the reeds. One of them, ${nm(n, 'a grateful farmer')}, swears to repay you.`; }
          c.hurt(c.me, 0.35); return 'The guards are not as drunk as promised. You free a dozen before you are driven off, bleeding.'; } },
    ],
  },
  {
    id: 'war_horse_archers', tag: 'war', title: 'Mounted Archery Drills', cooldown: 8,
    weight: (c) => (c.atWar() ? 1.3 : 0.4),
    who: (c) => best(c, 'archery'),
    text: (c) => `The garrison captain sets straw targets along the river flats and calls for anyone who can shoot from the saddle. Hwaru riders do it from childhood, he says — "we will learn it in a month or die learning." ${c.me.name.given} eyes the half-broken ponies.`,
    choices: [
      { label: 'Ride the course at full gallop',
        do: (c) => { const p = 0.35 + sk(c.me, 'archery') * 0.06;
          if (c.chance(p)) { c.skill(c.me, 'archery', 0.6); c.honor(c.me, 5); c.fame(c.me, 'blade', 3); return 'Three arrows, three straw heads. The captain writes your name on his roll.'; }
          c.hurt(c.me, 0.15); c.skill(c.me, 'archery', 0.3); c.mood(c.me, 'Thrown from a pony', -5); return 'The pony shies and you go over its ears. You learn something anyway — mostly about falling.'; } },
      { label: 'Train slowly, on foot first',
        do: (c) => { c.skill(c.me, 'archery', 0.35); return 'Unglamorous days of drawing and loosing on foot. Your arm grows steadier.'; } },
      { label: 'Teach the young ones instead', req: (c) => sk(c.me, 'archery') >= 5 || 'Needs archery 5',
        do: (c) => { c.honor(c.me, 6); c.favour(3); c.coins(20); return 'The captain pays you a drill-master’s wage and the village boys follow you like ducklings. +20 nyang.'; } },
    ],
  },
  {
    id: 'war_deserter', tag: 'war', title: 'The Deserter', cooldown: 10,
    weight: (c) => (c.atWar() ? 1.4 : 0),
    text: (c) => { const n = c.npc(); c.vars.d = n; return `Two watchmen drag in ${n ? n.name.full : 'a ragged boy'}, caught sleeping in your barn in a torn levy coat. He says his whole company broke when the ${foe(c)} cavalry came, and he ran home to his mother. The watchmen look to ${c.me.name.given}: hand him to the magistrate, or not?`; },
    choices: [
      { label: 'Hand him to the magistrate',
        do: (c) => { c.court(c.me, 3); c.favour(2); c.honor(c.me, 2); const d = c.vars.d; if (d) { c.rel(c.me, d, -40); c.memory(d, c.me, 'handed me over as a deserter', -20); } return 'The law is satisfied. Whatever becomes of him now, his mother will not look you in the eye again.'; } },
      { label: 'Give him food and send him back to the line',
        do: (c) => { c.item(c.me, 'rice', -1); c.honor(c.me, 4); const d = c.vars.d; if (d) c.rel(c.me, d, 15); return 'He goes back, shamed but fed. Perhaps he will stand next time.'; } },
      { label: 'Hide him and say nothing',
        do: (c) => { const d = c.vars.d; if (d) { c.rel(c.me, d, 35); c.memory(d, c.me, 'hid me when I deserted', 20); }
          if (c.chance(0.3)) { c.crime(c.me, 30, 'harbouring a deserter'); return 'Someone talks. You are posted for harbouring a deserter.'; } c.fame(c.me, 'heart', 4); return 'The watchmen are paid off with wine and go away. The boy will never forget it.'; } },
    ],
  },
  {
    id: 'war_champion', tag: 'war', title: 'The Challenge of the Champion', cooldown: 14,
    weight: (c) => (c.atWar() && sk(c.me, 'sword') >= 4 ? 1.6 : 0),
    who: (c) => best(c, 'sword'),
    text: (c) => `Across the field a giant of ${foe(c)} rides out alone, plants his spear and roars for a champion to meet him — "or let the whole army know you are rabbits." Every face in the line turns toward ${c.me.name.given}.`,
    choices: [
      { label: 'Step forward and fight him', req: (c) => sk(c.me, 'sword') >= 6 || 'Needs sword 6',
        do: (c) => { c.honor(c.me, 8); c.fame(c.me, 'blade', 4); c.ambush(c.me, 1, 'Champion', 8); return 'The armies fall silent. He comes at you with his blade drawn — fight!'; } },
      { label: 'Send your best soldier in your place',
        do: (c) => { if (c.chance(0.45)) { c.honor(c.me, 3); c.favour(3); return 'Your man is quick and the giant is slow. The enemy line groans as their champion falls.'; } c.honor(c.me, -6); c.mood(c.me, 'Sent a man to die', -10, 48); return 'Your champion falls in three passes. The enemy jeers until nightfall.'; } },
      { label: 'Ignore the bellowing fool',
        do: (c) => { c.honor(c.me, -8); c.mood(c.me, 'Mocked as a coward', -8, 24); return 'The line holds — but the jeering follows you for days.'; } },
    ],
  },
  {
    id: 'war_captive_general', tag: 'war', title: 'A General in Chains', once: false, cooldown: 16,
    weight: (c) => { const w = (c.G.systems || []).find((x) => x && x.id === 'war'); const wins = w?.st?.war?.wins || 0; return c.atWar() ? (wins > 0 ? 2 : 0.7) : 0; },
    who: (c) => best(c, 'sword'),
    text: (c) => `After the victory your company leads home its spoils: carts of armour, a string of horses — and a ${foe(c)} general, bound on a mule, who has not lowered his eyes once. The village wants a parade; the court wants to know what is to be done with him; and he is, by right, ${c.me.name.given}'s captive.`,
    choices: [
      { label: 'Ransom him back to his own people',
        do: (c) => { const n = Math.round(c.rand(80, 160)); c.coins(n); c.honor(c.me, 2); return `His family pays in silver ingots, +${n} nyang — though some say he will be back with a new army by spring.`; } },
      { label: 'Offer him a place among your own',
        do: (c) => { if (c.chance(0.3 + sk(c.me, 'charisma') * 0.06)) { const g = c.newcomer({ job: 'soldier', sex: 'm', age: 'adult' }); if (g) c.rel(c.me, g, 25); c.fame(c.me, 'blade', 5); c.flag('turned_general', true); return 'After three nights of wine and argument he kneels. A seasoned general now drills your levies.'; }
          c.favour(-4); c.honor(c.me, -2); return 'He spits at your feet. The court hears you tried to recruit an enemy general and is not amused.'; } },
      { label: 'Present him to the king at the victory parade',
        do: (c) => { c.favour(12); c.court(c.me, 6); c.honor(c.me, 8); c.item(c.me, 'silk', 2); return `${kingName(c)} receives him before the whole court and rewards you with two bolts of silk. The parade drums last until dawn.`; } },
      { label: 'Execute him at the crossroads',
        do: (c) => { c.honor(c.me, -4); c.fame(c.me, 'blade', 4); c.mood(c.me, 'Blood on the crossroads', -6, 48); c.flag('executed_general', true); return 'It is done quickly. The levies cheer; the elders do not. His people will remember your name.'; } },
    ],
  },
  {
    id: 'war_scorched_retreat', tag: 'war', title: 'Scorched Earth', cooldown: 14,
    weight: (c) => (c.atWar() && (c.season === 'summer' || c.season === 'autumn') ? 1.4 : 0),
    text: (c) => `Orders come down from the general: the army is falling back past the valley, and nothing must be left that ${foe(c)} can eat. The barley stands golden in the fields. Soldiers wait at the gate with torches, and look to ${c.me.name.given}.`,
    choices: [
      { label: 'Burn your own fields first, as an example',
        do: (c) => { c.honor(c.me, 10); c.favour(8); c.item(c.me, 'rice', -3); for (const s of c.adults()) c.mood(s, 'Burned our own harvest', -10, 72); return 'The smoke hangs over the valley for three days. The enemy finds nothing — and neither will you, this winter.'; } },
      { label: 'Hide grain in pits before the torches come',
        do: (c) => { if (c.chance(0.6)) { c.item(c.me, 'rice', 3); c.honor(c.me, 2); return 'Sealed jars go into the earth under the persimmon tree. When the soldiers leave, your winter is safe.'; } c.honor(c.me, -6); c.favour(-5); return 'An officer spots the fresh earth and digs it up himself, cursing you for a hoarder.'; } },
      { label: 'Bribe the torch-bearers to skip your land', cost: 40,
        do: (c) => { if (c.chance(0.7)) return 'They burn your neighbours’ fields and pass yours by. Your neighbours notice.'; c.crime(c.me, 25, 'bribing royal soldiers'); return 'Their sergeant takes your coin, burns the fields anyway, and reports you.'; } },
    ],
  },

  // =====================================================================
  // TRADE
  // =====================================================================
  {
    id: 'trd_guild_patron', tag: 'trade', title: 'The Guild Mistress', cooldown: 20,
    weight: (c) => (c.wealth() > 40 || c.me.job === 'merchant' ? 1.2 : 0.4),
    who: (c) => c.adults().slice().sort((a, b) => sk(b, 'charisma') - sk(a, 'charisma'))[0] || null,
    text: (c) => `A palanquin stops at your gate and out steps the head of the Southern Merchants' Guild — a widow in plain grey silk whose ledgers, they say, are longer than the king's. She has heard of ${c.me.name.given}. "I fund people who will be useful later," she says. "Will you be useful?"`,
    choices: [
      { label: 'Accept her silver and her terms',
        do: (c) => { c.coins(120); c.flag('guild_debt', true); c.fame(c.me, 'trade', 6); return '+120 nyang in a lacquered box. She will ask something of you one day; you both know it.'; } },
      { label: 'Negotiate for a partnership instead', req: (c) => sk(c.me, 'charisma') >= 3 || 'Needs charisma 3',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'charisma') * 0.06)) { c.coins(70); c.fame(c.me, 'trade', 10); c.flag('guild_partner', true); return 'She laughs, and agrees. +70 nyang as a partner, not a debtor — her guild’s caravans will carry your goods.'; } c.mood(c.me, 'Outplayed by a merchant', -4); return 'She smiles politely and leaves. You suspect you were weighed and found wanting.'; } },
      { label: 'Decline politely',
        do: (c) => { c.honor(c.me, 2); return 'She bows exactly as deeply as you do. "Another season, perhaps."'; } },
    ],
  },
  {
    id: 'trd_salt_route', tag: 'trade', title: 'The Salt Road', cooldown: 10,
    weight: (c) => (c.season !== 'winter' ? 1.2 : 0.3),
    who: (c) => best(c, 'sword'),
    text: (c) => `Salt costs three times as much in the mountain villages as on the Heukpa coast. A caravan of salt-carts leaves at dawn along the cliff road, and its master wants one more sword for the escort — or one more partner for the profit. The road, everyone knows, has bandits.`,
    choices: [
      { label: 'Buy a cart share and ride with it', cost: 50,
        do: (c) => { const ambush = c.chance(0.4); if (!ambush) { c.coins(105); c.fame(c.me, 'trade', 4); return 'Twelve days of dust and no trouble. The mountain villages pay in silver. +105 nyang.'; }
          if (c.chance(0.35 + sk(c.me, 'sword') * 0.06)) { c.coins(110); c.fame(c.me, 'blade', 3); return 'Bandits drop from the rocks at the gorge — and are sent running. The salt arrives, and so does your share. +110 nyang.'; }
          c.hurt(c.me, 0.3); c.item(c.me, 'salt', 2); return 'Bandits take the carts at the gorge. You limp home with two sacks of salt and a lesson.'; } },
      { label: 'Hire on as escort only',
        do: (c) => { if (c.chance(0.3)) { if (c.chance(0.4 + sk(c.me, 'sword') * 0.05)) { c.coins(45); c.skill(c.me, 'sword', 0.3); return 'An ambush in the gorge; you hold the carts. The master pays a bonus. +45 nyang.'; } c.hurt(c.me, 0.25); c.coins(15); return 'An ambush; you are cut and the master pays only half. +15 nyang.'; } c.coins(30); return 'An uneventful road. +30 nyang for your trouble.'; } },
      { label: 'Stay home',
        do: () => 'The carts creak away without you. You hear later they arrived — or did not, depending on who tells it.' },
    ],
  },
  {
    id: 'trd_silk_crash', tag: 'trade', title: 'A Glut of Silk', cooldown: 14,
    weight: (c) => (inv(c.me, 'silk') > 0 || c.me.job === 'merchant' ? 1.6 : c.rival() ? 0.5 : 0),
    text: (c) => { const r = c.rival(); return `The market is drowning in cheap silk. ${r ? `The ${r.clan} clan` : 'A rival trading house'} has dumped a whole warehouse of Seorang bolts at half price — to ruin anyone holding stock. ${c.me.name.given}'s own silk is worth half what it was yesterday.`; },
    choices: [
      { label: 'Sell now before it falls further', req: (c) => inv(c.me, 'silk') > 0 || 'You hold no silk',
        do: (c) => { const n = inv(c.me, 'silk'); c.item(c.me, 'silk', -n); c.coins(n * 8); return `You sell ${n} bolt${n > 1 ? 's' : ''} at a miserable price. +${n * 8} nyang.`; } },
      { label: 'Buy the cheap silk and wait it out', cost: 40,
        do: (c) => { c.item(c.me, 'silk', 4); c.flag('silk_hoard', true); return 'Four bolts at a bargain. When the glut clears — if it clears — you will be glad.'; } },
      { label: 'Expose the dumping to the market officials',
        do: (c) => { if (c.chance(0.3 + sk(c.me, 'charisma') * 0.05 + sk(c.me, 'scholarship') * 0.03)) { c.enmity(10); c.evidence(1); c.fame(c.me, 'trade', 5); c.coins(20); return 'The officials fine the dumpers and fix a floor price. The traders’ hall sends you a gift. +20 nyang.'; } c.enmity(8); return 'The officials take the rival’s gift and your complaint goes nowhere — except to the rival’s ears.'; } },
    ],
  },
  {
    id: 'trd_ginseng_contract', tag: 'trade', title: 'The Ginseng Contract', cooldown: 16,
    weight: (c) => (c.season === 'autumn' ? 1.8 : 0),
    who: (c) => c.adults().slice().sort((a, b) => (sk(b, 'hunting') + sk(b, 'farming')) - (sk(a, 'hunting') + sk(a, 'farming')))[0] || null,
    text: (c) => `An apothecary from the capital wants six-year mountain ginseng — the wild kind, with the forked "man" root — and pays in advance. The best patches grow on the north slopes, where a tiger has been seen this autumn. ${c.me.name.given} is offered the contract.`,
    choices: [
      { label: 'Go up the north slopes',
        do: (c) => { const p = 0.35 + sk(c.me, 'farming') * 0.04 + sk(c.me, 'hunting') * 0.05;
          if (c.chance(0.15)) { c.hurt(c.me, 0.5); c.mood(c.me, 'Fled from a tiger', -12, 48); return 'Striped shadows in the oaks. You drop your basket and run, the tiger’s cough echoing behind you. You live — barely.'; }
          if (c.chance(p)) { const n = c.chance(0.3) ? 3 : 2; c.item(c.me, 'ginseng', n); c.coins(60); c.fame(c.me, 'trade', 3); return `You find a patch under a fallen pine and dig ${n} roots with a deer-horn pick. +60 nyang advance kept, and ginseng to spare.`; }
          c.coins(15); return 'Ten days of scrambling turns up only spindly roots. The apothecary takes back most of his advance. +15 nyang.'; } },
      { label: 'Hire a mountain-man guide', cost: 30,
        do: (c) => { if (c.chance(0.75)) { c.item(c.me, 'ginseng', 3); c.coins(60); return 'The old guide knows every patch and every tiger trail. Three fine roots and +60 nyang.'; } c.coins(20); return 'The guide gets drunk and lost. +20 nyang salvaged.'; } },
      { label: 'Refuse — the tiger is not worth it',
        do: () => 'You let another family take the contract. Rumour says only half of them came back down.' },
    ],
  },
  {
    id: 'trd_fur_fair', tag: 'trade', title: 'The Winter Fur Fair', cooldown: 12,
    weight: (c) => (isWinter(c) ? 2 : 0),
    text: (c) => `At the frontier post, Hwaru horse-traders have pitched felt tents beside our peddlers, and the snow is trampled brown. Fox and sable hang from every pole. ${c.me.name.given} has come with what the house can spare.`,
    choices: [
      { label: 'Sell your furs and hides', req: (c) => ['foxFur', 'rabbitFur', 'deerHide', 'boarHide', 'tigerPelt'].some((k) => inv(c.me, k) > 0) || 'Nothing to sell',
        do: (c) => { const P = { foxFur: 18, rabbitFur: 6, deerHide: 10, boarHide: 9, tigerPelt: 90 }; let t = 0; for (const k in P) { const n = inv(c.me, k); if (n) { t += n * P[k]; c.item(c.me, k, -n); } } t = Math.round(t * 1.3); c.coins(t); c.fame(c.me, 'trade', 3); return `Steppe buyers pay fair-day prices. +${t} nyang.`; } },
      { label: 'Trade salt for a fine fox coat', req: (c) => inv(c.me, 'salt') >= 2 || 'Needs 2 salt',
        do: (c) => { c.item(c.me, 'salt', -2); c.item(c.me, 'foxFur', 2); c.mood(c.me, 'Warm in fox fur', 8, 72); return 'Two sacks of salt for two fox pelts — the steppe has no sea, and they know it.'; } },
      { label: 'Just drink with the horse-traders',
        do: (c) => { c.coins(-5); c.skill(c.me, 'charisma', 0.3); c.mood(c.me, 'Mare’s-milk wine', 6); return 'Fermented mare’s milk and loud songs. You learn a little Hwaru and a lot about horses.'; } },
    ],
  },
  {
    id: 'trd_tax_collector', tag: 'trade', title: 'The Collector at the Gate', cooldown: 16,
    weight: (c) => (c.season === 'autumn' || isWinter(c) ? 1.2 : 0.4),
    who: (c) => c.hh[0] && c.hh[0].age !== 'child' ? c.hh[0] : c.adults()[0] || null,
    text: (c) => `A county clerk with a brush and a bored bodyguard stands at the gate. "Hemp-cloth tax, six bolts per household, or forty nyang in lieu. And your arrears from last year." Behind him a moneylender's man is waiting his own turn. ${c.me.name.given} counts what is in the chest.`,
    choices: [
      { label: 'Pay in full', cost: 40,
        do: (c) => { c.honor(c.me, 3); c.court(c.me, 1); return 'The clerk ticks your name. The moneylender’s man looks disappointed.'; } },
      { label: 'Pay in silk instead', req: (c) => inv(c.me, 'silk') >= 1 || 'Needs 1 silk',
        do: (c) => { c.item(c.me, 'silk', -1); return 'He holds the silk up to the light, sniffs, and accepts it. Silk is worth more than hemp, after all.'; } },
      { label: 'Plead poverty and a bad harvest',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'charisma') * 0.06)) { c.honor(c.me, -2); return 'He looks at the children and the empty rice jar and writes "deferred". You owe it next year.'; } c.coins(-30); c.honor(c.me, -5); return 'He seizes a cooking pot and the good bowls, and fines you besides. -30 nyang.'; } },
      { label: 'Slip the clerk a "gift"', cost: 15,
        do: (c) => { if (c.chance(0.75)) return 'Fifteen nyang vanish into his sleeve and your name vanishes from his list.'; c.crime(c.me, 20, 'bribing a tax clerk'); return 'He takes it, then reports you anyway. A clever man.'; } },
    ],
  },
  {
    id: 'trd_mirror_stall', tag: 'trade', title: 'A Stall at the Market', cooldown: 14,
    weight: (c) => (c.me.job === 'merchant' ? 1.6 : 0.7),
    who: (c) => c.adults().slice().sort((a, b) => sk(b, 'charisma') - sk(a, 'charisma'))[0] || null,
    text: (c) => `A stall has come free at the five-day market, by the well where the crowds are thickest. A smooth-talking pedlar offers ${c.me.name.given} a crate of bronze mirrors "from the empire's own workshops" to stock it — cheap, very cheap. Their backs look oddly fresh.`,
    choices: [
      { label: 'Rent the stall with honest stock', cost: 30,
        do: (c) => { const n = Math.round(30 + sk(c.me, 'charisma') * 8 + c.rand(0, 20)); c.coins(n); c.fame(c.me, 'trade', 5); return `Rice cakes, straw sandals and honest bargaining. By evening the stall has paid for itself. +${n} nyang.`; } },
      { label: 'Buy the cheap mirrors and sell them as genuine', cost: 25,
        do: (c) => { if (c.chance(0.5)) { c.coins(90); c.honor(c.me, -4); return 'The mirrors sell to farm wives before anyone notices the green bloom on the bronze. +90 nyang, and an uneasy conscience.'; } c.crime(c.me, 35, 'selling counterfeit mirrors'); c.honor(c.me, -10); return 'A buyer’s mirror cracks in half at the well. A market officer arrests you for counterfeiting.'; } },
      { label: 'Denounce the pedlar to the market officer',
        do: (c) => { c.honor(c.me, 5); c.fame(c.me, 'law', 5); c.coins(15); return 'The officer finds a whole cart of fakes under the pedlar’s straw. You get a reward and a good name. +15 nyang.'; } },
    ],
  },
  {
    id: 'trd_iron_embargo', tag: 'trade', title: 'The Iron Embargo', cooldown: 18,
    weight: (c) => (c.atWar() ? 1.6 : 0.5),
    text: (c) => `The empire's commandery has forbidden iron to cross the river, and the forges of the valley are going cold. Plough-shares cannot be mended; arrowheads cannot be made. ${c.me.name.given} hears whispers of three ways around it.`,
    choices: [
      { label: 'Smuggle iron ingots across by night', cost: 30,
        do: (c) => { if (c.chance(0.5 + sk(c.me, 'charisma') * 0.03)) { c.coins(110); c.fame(c.me, 'shadow', 4); c.flag('enemy_iron', (c.flag('enemy_iron') || 0) + 1); return 'A fisher’s boat, a moonless night, and the smiths pay double. +110 nyang.'; } c.crime(c.me, 45, 'smuggling iron'); c.hurt(c.me, 0.15); return 'A patrol boat’s lantern finds you mid-river. You swim for it; the iron goes to the bottom and your name goes on a notice.'; } },
      { label: 'Search the hills for bog-iron and red ore',
        do: (c) => { if (c.chance(0.3 + sk(c.me, 'scholarship') * 0.05 + sk(c.me, 'farming') * 0.03)) { c.flag('local_ore', true); c.favour(6); c.fame(c.me, 'trade', 8); c.coins(40); return 'Rust-red water in a mountain stream leads you to a seam. The valley has its own iron now. +40 nyang finder’s fee.'; } c.mood(c.me, 'Wasted days in the hills', -3); return 'Weeks of red mud and nothing worth smelting.'; } },
      { label: 'Bribe a commandery clerk for a permit', cost: 70,
        do: (c) => { if (c.chance(0.65)) { c.coins(120); return 'A stamped permit for twenty carts. The forges roar again, and they pay you well for it. +120 nyang.'; } return 'The clerk is transferred the next day, your silver with him.'; } },
    ],
  },

  // =====================================================================
  // CRAFT
  // =====================================================================
  {
    id: 'cft_steel_trials', tag: 'craft', title: 'Iron That Will Not Shatter', cooldown: 10,
    weight: (c) => (c.flag('steel') || c.flag('steel_pending') ? 0 : c.atWar() ? 1.8 : c.flag('enemy_iron') ? 1.4 : 0.6),
    who: (c) => c.adults().slice().sort((a, b) => (sk(b, 'scholarship') + sk(b, 'sword')) - (sk(a, 'scholarship') + sk(a, 'sword')))[0] || null,
    text: (c) => `The village smith has worked through the night on a blade "like the enemy's". At dawn he strikes it on the anvil and it snaps like a dry twig. Bronze is too soft, our iron too brittle. ${c.me.name.given} turns the shards over: grey and coarse inside, like broken rice cake.`,
    choices: [
      { label: 'Fold charcoal into the iron, again and again', cost: 20,
        do: (c) => { c.flag('steel_pending', true); c.flag('steel_tries', 1); c.skill(c.me, 'scholarship', 0.3); c.chain('cft_steel_temper', 30); return 'You and the smith fold the bloom fifteen times with charcoal dust. The next blade bends before it breaks — progress. Another firing is set for tomorrow night.'; } },
      { label: 'Study the captured enemy blades first', req: (c) => (c.flag('enemy_iron') || 0) > 0 || 'Needs captured enemy iron',
        do: (c) => { c.flag('steel_pending', true); c.flag('steel_tries', 2); c.skill(c.me, 'scholarship', 0.5); c.chain('cft_steel_temper', 20); return 'You saw an enemy sword in half and stare at the bright, fine grain inside. The secret is in the carbon and the quench. You know what to try next.'; } },
      { label: 'Give up — bronze served our fathers',
        do: (c) => { c.mood(c.me, 'Gave up on steel', -3); return 'The forge cools. Somewhere across the river, the enemy keeps hammering.'; } },
    ],
  },
  {
    id: 'cft_steel_temper', tag: 'craft', title: 'The Quench', chainOnly: true, cooldown: 0,
    weight: () => 1,
    text: (c) => `The forge glows white in the dark and the new blade lies across the coals, singing faintly. Everything depends on the quench. The smith holds out the tongs to ${c.me.name.given}: water, brine, or warm oil?`,
    choices: [
      { label: 'Plunge it into cold brine',
        do: (c) => { const tries = c.flag('steel_tries') || 1; if (tries >= 3 || c.chance(0.25 + tries * 0.12)) return steelWin(c); c.flag('steel_tries', tries + 1); c.chain('cft_steel_temper', 36); return 'It hisses, warps and cracks along the spine. But the crack is finer than before. Again.'; } },
      { label: 'Quench in warm oil, then temper slowly',
        do: (c) => { const tries = c.flag('steel_tries') || 1; if (tries >= 3 || c.chance(0.4 + tries * 0.1 + sk(c.me, 'scholarship') * 0.04)) return steelWin(c); c.flag('steel_tries', tries + 1); c.chain('cft_steel_temper', 36); return 'The oil flares; the blade comes out sound but too soft. Close — so close. The smith is already stoking the fire again.'; } },
      { label: 'Stop here; the cost is too great',
        do: (c) => { c.flag('steel_pending', false); return 'You bank the forge. Perhaps another year.'; } },
    ],
  },
  {
    id: 'cft_smith_taken', tag: 'craft', title: 'The Master Smith Is Taken', cooldown: 30,
    weight: (c) => (c.flag('smith_taken') ? 0 : c.flag('steel') ? 1.4 : c.atWar() ? 0.6 : 0),
    who: (c) => best(c, 'sword'),
    text: (c) => `Master Dolsoe's forge stands open and cold; his apprentice, sobbing, says riders came at midnight with sacks and rope and took the old man "because he knows the iron". Hoofprints lead north toward the ${foe(c) === 'the enemy' ? 'Hwaru' : foe(c)} border. ${c.me.name.given} knows what that knowledge is worth in the wrong hands.`,
    choices: [
      { label: 'Track them tonight',
        do: (c) => { c.flag('smith_taken', true); c.flag('smith_way', 'track'); c.chain('cft_smith_rescue', 8); return 'You take two torches, a bow and the apprentice. The trail is fresh.'; } },
      { label: 'Send word you will pay ransom', cost: 80,
        do: (c) => { c.flag('smith_taken', true); if (c.chance(0.7)) { c.honor(c.me, 4); c.flag('smith_saved', true); return 'A one-eyed go-between takes the silver. Three days later Dolsoe walks home, thinner and furious.'; } return 'The go-between takes your silver and vanishes. Of Dolsoe there is no word.'; } },
      { label: 'Report it to the magistrate and wait',
        do: (c) => { c.flag('smith_taken', true); c.court(c.me, 1); return 'The magistrate writes it down. Nothing more happens. The forge stays cold.'; } },
    ],
  },
  {
    id: 'cft_smith_rescue', tag: 'craft', title: 'The Kidnappers’ Camp', chainOnly: true, cooldown: 0,
    weight: () => 1,
    text: (c) => `By the second watch the trail ends at a ruined charcoal-burners' hut. Five men around a fire, horses tethered, and an old man trussed against a post — Dolsoe, alive and cursing. ${c.me.name.given} crouches in the bracken.`,
    choices: [
      { label: 'Charge in with steel drawn',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'sword') * 0.06)) { c.flag('smith_saved', true); c.fame(c.me, 'blade', 6); c.honor(c.me, 8); c.favour(4); return 'Two fall before they reach their spears; the rest flee into the dark. You carry Dolsoe home on your back.'; } c.ambush(c.me, 2, 'Kidnapper', 5); return 'They are quicker than you thought. Two come at you out of the firelight — fight!'; } },
      { label: 'Creep in and cut him loose',
        do: (c) => { if (c.chance(0.4 + sk(c.me, 'archery') * 0.03 + (c.night ? 0.15 : 0))) { c.flag('smith_saved', true); c.fame(c.me, 'shadow', 4); c.honor(c.me, 6); return 'A knife through rope, a hand over a mouth, and you are gone before the fire burns down.'; } c.hurt(c.me, 0.3); return 'A horse whinnies. You are spotted, slashed, and driven off. Dolsoe’s shout follows you into the trees.'; } },
      { label: 'Bargain from the darkness',
        do: (c) => { if (c.chance(0.3 + sk(c.me, 'charisma') * 0.06)) { c.coins(-30); c.flag('smith_saved', true); return 'Thirty nyang and a promise of no pursuit. They leave the old man by the road. -30 nyang.'; } c.mood(c.me, 'Failed to save the smith', -10, 72); return 'They laugh, mount up and ride for the border with him across a saddle.'; } },
    ],
  },
  {
    id: 'cft_furnace_collapse', tag: 'craft', title: 'The Furnace Collapses', cooldown: 18,
    weight: (c) => (c.flag('steel_pending') || c.flag('steel') || c.flag('royal_order') ? 1.2 : 0.3),
    text: (c) => `A roar, a cloud of sparks, and the clay bloomery behind the smithy folds in on itself. An apprentice is screaming under the hot bricks. ${c.me.name.given} is the first one there.`,
    choices: [
      { label: 'Pull him out with your bare hands',
        do: (c) => { c.hurt(c.me, 0.2); c.honor(c.me, 10); c.fame(c.me, 'heart', 6); c.mood(c.me, 'Burned saving a boy', -4, 48); return 'Your palms blister and your sleeves smoke, but the boy lives. The village will tell it for years.'; } },
      { label: 'Organise a bucket line and ropes',
        do: (c) => { if (c.chance(0.5 + sk(c.me, 'charisma') * 0.05)) { c.honor(c.me, 6); return 'Water, ropes, and twenty hands. The boy is out in minutes, singed but whole.'; } c.honor(c.me, 2); c.mood(c.me, 'Too slow to save him', -10, 72); return 'It takes too long. The boy lives, but he will never hold tongs again.'; } },
      { label: 'Pay to rebuild the furnace properly', cost: 50,
        do: (c) => { c.flag('good_furnace', true); c.fame(c.me, 'trade', 3); return 'A taller furnace, with a fired-brick lining and a proper bellows. It will run hotter than ever.'; } },
    ],
  },
  {
    id: 'cft_royal_commission', tag: 'craft', title: 'A Hundred Swords by the Full Moon', cooldown: 25,
    weight: (c) => (c.king() && (c.flag('steel') || c.atWar()) && !c.flag('royal_order') ? 1.3 : 0),
    text: (c) => `A palace eunuch unrolls a scroll sealed in red: ${kingName(c)} requires one hundred swords by the full moon, "of a quality that does not shame the throne". It is an honour. It is also impossible, unless every forge in the valley works day and night.`,
    choices: [
      { label: 'Accept and drive every forge in the valley',
        do: (c) => { c.flag('royal_order', true); const p = (c.flag('steel') ? 0.55 : 0.3) + (c.flag('smith_saved') ? 0.1 : 0) + (c.flag('good_furnace') ? 0.1 : 0) + (c.flag('local_ore') ? 0.1 : 0);
          if (c.chance(p)) { c.coins(200); c.favour(15); c.court(c.me, 6); c.fame(c.me, 'trade', 12); return `The hundredth sword is wrapped in oiled cloth on the eve of the full moon. ${kingName(c)} pays royally. +200 nyang.`; }
          c.favour(-10); c.honor(c.me, -8); c.coins(40); return 'You deliver sixty-two. The eunuch sniffs, pays for those, and lets it be known you failed the throne. +40 nyang.'; } },
      { label: 'Accept only fifty, honestly',
        do: (c) => { c.coins(80); c.favour(4); c.honor(c.me, 3); return 'The eunuch is displeased, but fifty good blades arrive on time. +80 nyang.'; } },
      { label: 'Decline the commission',
        do: (c) => { c.favour(-6); return 'The eunuch rolls up the scroll very slowly. The palace will remember.'; } },
    ],
  },
  {
    id: 'cft_horn_bow', tag: 'craft', title: 'The Horn-and-Sinew Bow', cooldown: 30,
    weight: (c) => (c.flag('bow_started') || inv(c.me, 'hornBow') ? 0 : sk(c.me, 'archery') >= 3 ? 1.1 : 0),
    who: (c) => best(c, 'archery'),
    text: (c) => `An old bowyer, his hands knotted like mulberry roots, offers to teach ${c.me.name.given} the great bow of our people: water-buffalo horn on the belly, deer sinew on the back, mulberry in the core, all bound in fish-bladder glue. "It takes a year," he says. "Most people quit by the winter."`,
    choices: [
      { label: 'Begin the year-long work', cost: 40,
        do: (c) => { c.flag('bow_started', true); c.skill(c.me, 'archery', 0.3); c.chain('cft_horn_bow_done', 288); return 'You split horn in autumn, chew sinew through the winter, and leave the glue to cure into spring. The bow will be ready when it is ready.'; } },
      { label: 'Buy a finished bow from him instead', cost: 180,
        do: (c) => { c.item(c.me, 'hornBow', 1); c.skill(c.me, 'archery', 0.2); return 'He sells you one of his own, grumbling that you have bought a bow but not learned one.'; } },
      { label: 'Not now',
        do: () => 'The old man shrugs and goes back to his glue pots.' },
    ],
  },
  {
    id: 'cft_horn_bow_done', tag: 'craft', title: 'The Bow Is Strung', chainOnly: true, cooldown: 0,
    weight: () => 1,
    text: (c) => `After a year of horn, sinew and glue, the old bowyer hands ${c.me.name.given} a heated cord. The bow is a reversed curl like a sleeping cat. Strung, it could crack a man's arm if handled wrongly. Its first arrow will tell whether the year was wasted.`,
    choices: [
      { label: 'Draw it to the ear and loose at the far target',
        do: (c) => { if (c.chance(0.55 + sk(c.me, 'archery') * 0.04)) { c.item(c.me, 'hornBow', 1); c.skill(c.me, 'archery', 1); c.fame(c.me, 'hunt', 8); c.mood(c.me, 'A masterwork bow', 15, 96); return 'The arrow passes clean through the far target and lodges in the dyke beyond. The old man weeps. The bow is yours.'; }
          c.item(c.me, 'hornBow', 1); c.skill(c.me, 'archery', 0.5); c.hurt(c.me, 0.1); return 'The string slaps your forearm raw and the arrow flies wide — but the bow holds. It needs a hand that has grown into it.'; } },
      { label: 'Present it to the king',
        do: (c) => { c.favour(15); c.court(c.me, 5); c.honor(c.me, 8); c.coins(60); return `${kingName(c)} draws it once, laughs, and hangs it in the throne room. +60 nyang and royal favour.`; } },
    ],
  },
  {
    id: 'cft_kiln_contest', tag: 'craft', title: 'The Palace Kiln Contest', cooldown: 20,
    weight: (c) => (c.season === 'spring' || c.season === 'autumn' ? 1 : 0.3),
    text: (c) => `The palace will choose a kiln to make its ritual vessels, and every potter in three counties is firing pieces for the judging. Our village potter has asked ${c.me.name.given} to help — with money, with hands, or with a word at court.`,
    choices: [
      { label: 'Fund the best clay and pine-wood', cost: 35,
        do: (c) => { if (c.chance(0.45 + sk(c.me, 'scholarship') * 0.03)) { c.item(c.me, 'porcelain', 2); c.coins(80); c.fame(c.me, 'trade', 6); c.favour(4); return 'The kiln opens on a pale blue-green glaze like spring water over stone. The palace chooses it. +80 nyang and two vessels of your own.'; } c.item(c.me, 'porcelain', 1); return 'A crack runs through the best vase. You keep one passable bowl.'; } },
      { label: 'Tend the fire through the night yourself',
        do: (c) => { c.need(c.me, 'energy', -30); if (c.chance(0.4)) { c.item(c.me, 'porcelain', 1); c.honor(c.me, 4); return 'Three nights without sleep, and a bowl that rings like a bell when flicked. The potter gives it to you.'; } c.mood(c.me, 'Exhausted by the kiln', -5); return 'You doze at the wrong moment and the temperature drops. The glaze comes out muddy.'; } },
      { label: 'Speak for him at court', req: (c) => c.courtRank() >= 0 || 'Needs a court rank',
        do: (c) => { c.court(c.me, -1); c.favour(2); c.coins(40); return 'Your word carries weight; the judges look twice at his work. He shares the commission. +40 nyang.'; } },
    ],
  },
  {
    id: 'cft_formula_stolen', tag: 'craft', title: 'The Stolen Formula', cooldown: 25,
    weight: (c) => (c.flag('steel') && !c.flag('formula_lost') ? 1.3 : c.flag('local_ore') ? 0.4 : 0),
    text: (c) => { const n = c.npc(); c.vars.t = n; return `The forge-book is gone — the notes of the steel quench, the charcoal ratios, all of it. ${n ? n.name.full : 'A new worker'}, hired at the spring fair, is gone too. Someone saw him on the river road with a satchel, heading toward ${c.rival() ? `the ${c.rival().clan} estate` : 'the ferry'}.`; },
    choices: [
      { label: 'Ride him down on the river road',
        do: (c) => { if (c.chance(0.4 + sk(c.me, 'sword') * 0.04 + sk(c.me, 'archery') * 0.03)) { c.fame(c.me, 'law', 6); const t = c.vars.t; if (t) c.memory(t, c.me, 'caught me with the forge-book', -15); return 'You catch him at the ferry landing with the book in his satchel. He begs; you take the book back.'; } c.flag('formula_lost', true); c.enmity(5); return 'The ferry is already midstream when you reach the landing. Your secret is out.'; } },
      { label: 'Let it go — the real secret is in the hands',
        do: (c) => { c.flag('formula_lost', true); c.honor(c.me, 2); return 'Ink cannot teach a quench. Whoever reads it will waste a year finding that out.'; } },
      { label: 'Accuse your rival before the magistrate', req: (c) => !!c.rival() || 'No rival clan',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'scholarship') * 0.05)) { c.evidence(1); c.enmity(12); c.fame(c.me, 'law', 4); return 'The magistrate searches their storehouse and finds your forge-book under the rice. A scandal.'; } c.enmity(10); c.honor(c.me, -5); return 'Nothing is found. Your rival smiles at you across the market square.'; } },
    ],
  },

  // =====================================================================
  // HUNT
  // =====================================================================
  {
    id: 'hnt_spring_hunt', tag: 'hunt', title: 'The Royal Spring Hunt', cooldown: 16,
    weight: (c) => (c.season === 'spring' && c.king() ? 2 : 0),
    who: (c) => best(c, 'archery'),
    text: (c) => `Drums on the hill: ${kingName(c)} rides out for the spring hunt, and every family of note may send an archer. Beaters drive deer from the oak woods into the meadow below the royal pavilion. ${c.me.name.given} is chosen to shoot — ${c.rival() ? `beside a ${c.rival().clan} archer who has not stopped smiling` : 'among nobles who sneer at village bows'}.`,
    choices: [
      { label: 'Shoot for the great stag',
        do: (c) => { if (c.rival() && c.chance(0.2)) { c.hurt(c.me, 0.25); c.enmity(5); c.mood(c.me, 'Shot by an "accident"', -10, 72); return 'An arrow from the rival line takes you in the arm — "a terrible accident." You do not shoot again today.'; }
          if (c.chance(0.3 + sk(c.me, 'archery') * 0.06)) { c.item(c.me, 'venison', 3); c.item(c.me, 'deerHide', 1); c.favour(10); c.fame(c.me, 'hunt', 8); if (c.chance(0.5)) { c.item(c.me, 'hawk', 1); return 'The stag falls at the pavilion steps. The king laughs, and gives you a goshawk from his own mews.'; } return 'The stag drops at a hundred paces. The king asks your name — twice.'; }
          c.honor(c.me, -2); return 'Your arrow skims the stag’s back. A noble’s son takes it with his next shot.'; } },
      { label: 'Shoot safely at the does and hares',
        do: (c) => { c.item(c.me, 'venison', 1); c.item(c.me, 'rabbitFur', 2); c.skill(c.me, 'archery', 0.3); c.favour(2); return 'A modest bag, but no misses. Nobody laughs at you.'; } },
      { label: 'Watch the rival archer instead',
        do: (c) => { if (c.chance(0.5)) { c.evidence(1); return 'You see him nock an arrow pointed nowhere near the deer. You make sure a royal guard sees it too.'; } return 'He sees you watching and behaves himself all day.'; } },
    ],
  },
  {
    id: 'hnt_maneater', tag: 'hunt', title: 'The Man-Eater of the Pass', cooldown: 25,
    weight: (c) => (c.season === 'winter' || c.season === 'autumn' ? 1.3 : 0.5),
    who: (c) => c.adults().slice().sort((a, b) => (sk(b, 'archery') + sk(b, 'hunting')) - (sk(a, 'archery') + sk(a, 'hunting')))[0] || null,
    text: (c) => `A tiger has taken four people from the charcoal village up the pass — a woodcutter, two children, a monk on the road. The village headman arrives on his knees with a string of coins. "You are the only one who might. Please." ${c.me.name.given} has heard it hunts at dusk along the stream.`,
    choices: [
      { label: 'Lead the hunt yourself',
        do: (c) => { const p = 0.25 + sk(c.me, 'archery') * 0.05 + sk(c.me, 'hunting') * 0.05 + sk(c.me, 'sword') * 0.02 + (inv(c.me, 'hornBow') ? 0.1 : 0);
          if (c.chance(p)) { c.item(c.me, 'tigerPelt', 1); c.item(c.me, 'tigerBone', 2); c.fame(c.me, 'hunt', 18); c.honor(c.me, 12); c.coins(50); return 'At dusk it comes down the stream exactly as they said. Your arrow finds the heart. The village carries you home on its shoulders. +50 nyang.'; }
          c.hurt(c.me, c.chance(0.3) ? 0.6 : 0.35); c.fame(c.me, 'hunt', 4); return 'It comes from behind, not from the stream. You drive it off with a torch and your blade, but its claws open your back.'; } },
      { label: 'Set pit-traps and spikes along the stream',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'hunting') * 0.05 + sk(c.me, 'farming') * 0.02)) { c.item(c.me, 'tigerPelt', 1); c.fame(c.me, 'hunt', 10); c.honor(c.me, 6); return 'Four days later, a roar in the night. The tiger lies impaled at the bottom of your third pit.'; } c.mood(c.me, 'The tiger outwitted me', -6); return 'The tiger steps around every pit and takes a goat from beside the last one.'; } },
      { label: 'Hire professional tiger-hunters', cost: 70,
        do: (c) => { c.honor(c.me, 4); c.fame(c.me, 'heart', 4); return 'Three hard men from the northern hills go up the pass. They come back with the pelt and keep it — but the village is safe.'; } },
      { label: 'Refuse',
        do: (c) => { c.honor(c.me, -5); return 'The headman walks away bent double. You hear later the tiger took a fifth.'; } },
    ],
  },
  {
    id: 'hnt_white_deer', tag: 'hunt', title: 'The White Deer', once: true,
    weight: (c) => (c.season !== 'winter' ? 0.5 : 0.2),
    who: (c) => best(c, 'archery'),
    text: (c) => `Deep in the woods, ${c.me.name.given} sees a deer as white as hoarfrost standing in a shaft of light. It does not run. It turns, looks back, and walks slowly up a path that was not there a moment ago.`,
    choices: [
      { label: 'Follow it',
        do: (c) => { if (c.chance(0.5)) { c.skill(c.me, 'scholarship', 0.8); c.heal(c.me); c.mood(c.me, 'Blessed by a mountain hermit', 18, 120); c.item(c.me, 'ginseng', 1); c.memory(c.me, null, 'followed the white deer to the hermit', 15); return 'It leads you to a hut where a white-haired hermit pours tea as if expecting you. You talk until moonrise; you come home healed, wiser, with a root of ginseng in your sleeve.'; }
          c.mood(c.me, 'Lost in the deep woods', -6, 24); c.need(c.me, 'hunger', -30); c.honor(c.me, 2); return 'It leads you to a mossy shrine and vanishes. You spend the night lost, and find your way home at dawn with a strange calm.'; } },
      { label: 'Shoot it — a white pelt is worth a fortune',
        do: (c) => { c.honor(c.me, -6); c.mood(c.me, 'Cursed by the mountain', -14, 120); c.hurt(c.me, 0.2); return 'Your arrow passes through it like mist. A branch whips your face; you stumble home with a fever and a feeling you were judged.'; } },
      { label: 'Bow to it and leave it in peace',
        do: (c) => { c.honor(c.me, 4); c.mood(c.me, 'Saw the white deer', 10, 48); return 'It inclines its head, as if in return. Old women say that is a sign of luck.'; } },
    ],
  },
  {
    id: 'hnt_poachers', tag: 'hunt', title: 'Poachers in the Royal Forest', cooldown: 14,
    weight: (c) => (isWinter(c) || c.season === 'spring' ? 1.2 : 0.4),
    text: (c) => { const n = c.npc(); c.vars.p = n; return `In the king's forest ${c.me.name.given} comes upon ${n ? n.name.full : 'a tenant farmer'} and his half-grown son skinning a roe deer. They are thin as rakes. Poaching royal game is a flogging offence — or worse. The man looks up and does not even try to run.`; },
    choices: [
      { label: 'Report them to the forest wardens',
        do: (c) => { c.court(c.me, 2); c.fame(c.me, 'law', 4); c.favour(2); const p = c.vars.p; if (p) { c.rel(c.me, p, -40); c.memory(p, c.me, 'reported me for poaching', -25); } return 'The wardens take them away. The law is served; the village is colder toward you.'; } },
      { label: 'Help them hide the carcass',
        do: (c) => { const p = c.vars.p; if (p) { c.rel(c.me, p, 30); c.memory(p, c.me, 'helped me hide a royal deer', 20); } c.item(c.me, 'venison', 1); if (c.chance(0.25)) { c.crime(c.me, 25, 'aiding poachers'); return 'A warden on the ridge saw everything. Now you are a poacher too.'; } c.fame(c.me, 'heart', 4); return 'Snow covers the blood. They press a haunch on you in thanks.'; } },
      { label: 'Give them rice and send them off', req: (c) => inv(c.me, 'rice') >= 1 || 'Needs rice',
        do: (c) => { c.item(c.me, 'rice', -1); c.honor(c.me, 5); const p = c.vars.p; if (p) c.rel(c.me, p, 20); return 'They leave the deer for the crows and take your rice home instead.'; } },
    ],
  },
  {
    id: 'hnt_bear', tag: 'hunt', title: 'The Bear', cooldown: 18,
    weight: (c) => (c.season === 'spring' || c.season === 'autumn' ? 0.9 : c.season === 'summer' ? 0.4 : 0),
    who: (c) => c.adults().slice().sort((a, b) => (sk(b, 'sword') + sk(b, 'hunting')) - (sk(a, 'sword') + sk(a, 'hunting')))[0] || null,
    text: (c) => `The hunting party has stopped for rice balls by a stream when the dogs go silent. A black bear rises on its hind legs out of the bramble, taller than a man, a cub bawling somewhere behind it. ${c.me.name.given} is closest.`,
    choices: [
      { label: 'Stand your ground and drive it off',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'sword') * 0.05 + sk(c.me, 'hunting') * 0.04)) { c.fame(c.me, 'hunt', 6); c.honor(c.me, 6); return 'You roar back, wave your spear, and the bear drops to all fours and crashes away after its cub.'; } c.hurt(c.me, 0.45); c.fame(c.me, 'hunt', 2); return 'It swats you into the stream like a sack of rice before lumbering off. Ribs cracked, but alive.'; } },
      { label: 'Kill it for the gall and hide',
        do: (c) => { if (c.chance(0.25 + sk(c.me, 'archery') * 0.05 + sk(c.me, 'hunting') * 0.05)) { c.item(c.me, 'boarHide', 2); c.coins(60); c.fame(c.me, 'hunt', 10); c.mood(c.me, 'Orphaned a cub', -4); return 'Three arrows and a spear. The bear gall alone fetches sixty nyang from the apothecary.'; } c.hurt(c.me, 0.55); c.mood(c.me, 'Mauled by a bear', -12, 96); return 'Wounded, the bear is twice as dangerous. Your companions drag you away bleeding.'; } },
      { label: 'Back away slowly, eyes down',
        do: (c) => { if (c.chance(0.8)) return 'Step by step, you all back away. The bear watches, snorts, and turns back to its cub.'; c.hurt(c.me, 0.25); return 'One of the dogs breaks and barks; the bear charges through you and is gone.'; } },
    ],
  },

  // =====================================================================
  // NATURE
  // =====================================================================
  {
    id: 'nat_flood', tag: 'nature', title: 'The Great Flood', cooldown: 30,
    weight: (c) => (c.season === 'summer' ? (c.G.env?.weather === 'rain' ? 2 : 0.6) : 0),
    text: (c) => `After nine days of monsoon rain the river climbs over the dykes in the night. By dawn the paddies are a brown lake, roof-ridges stick out of the water like turtle backs, and a neighbour's ox floats by bellowing. ${c.me.name.given} stands knee-deep in the courtyard.`,
    choices: [
      { label: 'Save the grain stores first',
        do: (c) => { if (c.chance(0.6)) { c.honor(c.me, -2); return 'You haul sacks up into the rafters and save most of the winter rice. Others were not so lucky, and they saw you looking after yourself.'; } c.item(c.me, 'rice', -3); return 'The water rises faster than you can carry. Three sacks are lost.'; } },
      { label: 'Take the boat out for stranded neighbours',
        do: (c) => { c.item(c.me, 'rice', -2); if (c.chance(0.85)) { c.honor(c.me, 12); c.fame(c.me, 'heart', 10); c.favour(3); return 'You pull eleven people off roofs and out of trees. Your own grain rots in the water, but nobody in the valley will forget.'; } c.hurt(c.me, 0.3); c.honor(c.me, 8); return 'The current flips the boat. You save two and are pulled out yourself, half drowned.'; } },
      { label: 'Open your stores to the flooded families', req: (c) => inv(c.me, 'rice') >= 3 || 'Needs 3 rice',
        do: (c) => { c.item(c.me, 'rice', -3); c.honor(c.me, 10); c.fame(c.me, 'heart', 8); return 'Your gate stands open and your rice pots never cool. The valley calls your house generous.'; } },
    ],
  },
  {
    id: 'nat_early_frost', tag: 'nature', title: 'The Early Frost', cooldown: 30,
    weight: (c) => (c.season === 'autumn' ? (hasFarmer(c) ? 1.2 : 0.5) : 0),
    who: (c) => c.adults().find((s) => s.job === 'farmer') || c.adults()[0] || null,
    text: (c) => `${c.me.name.given} wakes to a white world a full month too soon. The rice heads in the paddies are rimed with frost and bowed like old men. If the sun comes out strong, some may be saved; if it does not, the whole harvest blackens.`,
    choices: [
      { label: 'Harvest everything now, green or not',
        do: (c) => { c.item(c.me, 'rice', 2); c.skill(c.me, 'farming', 0.3); c.need(c.me, 'energy', -25); return 'Every hand in the house cuts until dark. Half a harvest of thin, green rice — but it is in.'; } },
      { label: 'Light smudge-fires along the paddies tonight',
        do: (c) => { if (c.chance(0.35 + sk(c.me, 'farming') * 0.06)) { c.item(c.me, 'rice', 5); c.fame(c.me, 'heart', 3); return 'Smoke hangs over the fields all night and the second frost never settles. Your harvest is nearly whole; your neighbours copy you next year.'; } c.item(c.me, 'rice', 1); c.mood(c.me, 'Lost the harvest', -10, 96); return 'The wind blows the smoke away. By morning the rice is black.'; } },
      { label: 'Sell the standing crop to a speculator',
        do: (c) => { c.coins(45); return 'A grain broker from the capital buys the frozen field as it stands. +45 nyang — less than it was worth, more than nothing.'; } },
    ],
  },
  {
    id: 'nat_landslide', tag: 'nature', title: 'The Pass Is Closed', cooldown: 25,
    weight: (c) => (c.season === 'summer' || c.season === 'spring' ? 0.9 : 0.3),
    text: (c) => `A night of thunder and the whole face of the mountain comes down across the pass road. Carts are trapped on the far side, the salt merchants cannot get through, and prices in the village have doubled overnight. The headman calls a meeting; ${c.me.name.given} is asked to speak.`,
    choices: [
      { label: 'Rally the village to dig it out',
        do: (c) => { c.need(c.me, 'energy', -30); if (c.chance(0.5 + sk(c.me, 'charisma') * 0.05)) { c.honor(c.me, 8); c.fame(c.me, 'heart', 5); return 'Thirty families with baskets and mattocks, and the road is open in six days. You carried more stones than anyone.'; } c.hurt(c.me, 0.2); c.honor(c.me, 4); return 'A second slide buries the work and bruises half the diggers. It will take weeks yet.'; } },
      { label: 'Hire labourers out of your own pocket', cost: 60,
        do: (c) => { c.honor(c.me, 6); c.court(c.me, 2); c.fame(c.me, 'trade', 4); return 'Paid crews clear the pass in three days. The merchants remember who opened the road.'; } },
      { label: 'Profit from the shortage — sell your salt dear', req: (c) => inv(c.me, 'salt') >= 1 || 'Needs salt',
        do: (c) => { const n = inv(c.me, 'salt'); c.item(c.me, 'salt', -n); c.coins(n * 18); c.honor(c.me, -5); return `You sell ${n} sack${n > 1 ? 's' : ''} of salt at triple price. +${n * 18} nyang. The headman does not greet you on the road.`; } },
    ],
  },
  {
    id: 'nat_bumper_harvest', tag: 'nature', title: 'A Wondrous Harvest', cooldown: 30,
    weight: (c) => (c.season === 'autumn' ? (hasFarmer(c) ? 1.4 : 0.6) : 0),
    who: (c) => c.adults().find((s) => s.job === 'farmer') || c.adults()[0] || null,
    text: (c) => `The rice stands so heavy this year that the stalks lean on one another, and old men say they have not seen ears like it since their grandfathers' time. The granaries will not hold it all. ${c.me.name.given} walks the dykes at sunset, counting sheaves.`,
    choices: [
      { label: 'Hold a harvest feast for the whole village',
        do: (c) => { c.item(c.me, 'rice', 3); c.item(c.me, 'kimchi', 2); c.honor(c.me, 8); c.fame(c.me, 'heart', 6); for (const s of c.hh) c.mood(s, 'Harvest feast', 12, 48); return 'Drums, rice wine, and farmer’s dances until the moon sets. Every house sends home leftovers.'; } },
      { label: 'Sell the surplus at market',
        do: (c) => { const n = Math.round(60 + sk(c.me, 'farming') * 8 + sk(c.me, 'charisma') * 4); c.coins(n); c.item(c.me, 'rice', 4); c.fame(c.me, 'trade', 3); return `Ox-carts to market every day for a week. +${n} nyang and four sacks kept back.`; } },
      { label: 'Send the finest sheaves to the royal ancestral shrine',
        do: (c) => { c.item(c.me, 'rice', 3); c.favour(8); c.court(c.me, 2); c.honor(c.me, 5); return 'The shrine priests accept the offering and the king hears of your piety.'; } },
    ],
  },
];

// shared outcome for the steel chain
function steelWin(c) {
  c.flag('steel', true); c.flag('steel_pending', false);
  c.fame(c.me, 'blade', 12); c.favour(10); c.honor(c.me, 10); c.skill(c.me, 'scholarship', 0.5);
  c.mood(c.me, 'Forged true steel', 20, 120);
  c.log(`${c.me.name.full} has forged steel that does not shatter. The valley's levies will carry it into the next war.`);
  return 'The blade comes out dark and bright at once. The smith strikes it on the anvil with all his strength — and it rings, and bends, and springs back true. From now on the valley’s soldiers will carry iron that does not break.';
}
