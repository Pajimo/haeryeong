import { pick, rand } from './noise.js';

export const SURNAMES = [
  ['Kim', '김'], ['Lee', '이'], ['Park', '박'], ['Choi', '최'], ['Jeong', '정'], ['Kang', '강'], ['Jo', '조'],
  ['Yun', '윤'], ['Jang', '장'], ['Im', '임'], ['Han', '한'], ['Oh', '오'], ['Seo', '서'], ['Shin', '신'],
  ['Kwon', '권'], ['Hwang', '황'], ['Ahn', '안'], ['Song', '송'], ['Yu', '유'], ['Hong', '홍'], ['Baek', '백'],
  ['Moon', '문'], ['Go', '고'], ['Nam', '남'],
];
export const M_SYL = [['ji', '지'], ['hyun', '현'], ['woo', '우'], ['jin', '진'], ['seok', '석'], ['min', '민'], ['tae', '태'],
  ['gyu', '규'], ['dong', '동'], ['sung', '성'], ['ho', '호'], ['yeong', '영'], ['jun', '준'], ['hwan', '환'],
  ['cheol', '철'], ['gwang', '광'], ['mu', '무'], ['gang', '강'], ['il', '일'], ['ryong', '룡'], ['hun', '훈'], ['beom', '범'], ['san', '산'], ['do', '도']];
export const F_SYL = [['seo', '서'], ['yeon', '연'], ['hwa', '화'], ['ji', '지'], ['su', '수'], ['hee', '희'], ['ha', '하'],
  ['eun', '은'], ['mi', '미'], ['ok', '옥'], ['sun', '순'], ['hyang', '향'], ['na', '나'], ['rin', '린'], ['ah', '아'],
  ['ran', '란'], ['ye', '예'], ['bin', '빈'], ['wol', '월'], ['seol', '설'], ['yun', '윤'], ['da', '다']];

const cap = (s) => s[0].toUpperCase() + s.slice(1);
export function makeName(sex) {
  const [sr, sh] = pick(SURNAMES);
  const syl = sex === 'f' ? F_SYL : M_SYL;
  const a = pick(syl); let b = pick(syl); while (b === a) b = pick(syl);
  return { surname: sr, given: `${cap(a[0])}-${b[0]}`, hangul: `${sh}${a[1]}${b[1]}`, full: `${sr} ${cap(a[0])}-${b[0]}` };
}

export const TRAITS = {
  Brave: { desc: 'Runs toward danger, not away.', color: '#c0553a' },
  'Hot-headed': { desc: 'Quick to anger, quicker to draw steel.', color: '#d2402e' },
  Gentle: { desc: 'Soft words, kind heart.', color: '#7fb07a' },
  Ambitious: { desc: 'Hungers for honor and rank.', color: '#d6a943' },
  Scholarly: { desc: 'Finds joy in brush and scroll.', color: '#6c8fc2' },
  Cheerful: { desc: 'Laughs easily; lifts every room.', color: '#e7b85a' },
  Greedy: { desc: 'Counts coins in their sleep.', color: '#a68b3b' },
  Loyal: { desc: 'Never forgets a friend.', color: '#5f8f9b' },
  Romantic: { desc: 'Heart flutters like a falling petal.', color: '#d97a9a' },
  Lazy: { desc: 'Why stand when one can sit?', color: '#8a8a7a' },
  Pious: { desc: 'Bows to the spirits of mountain and river.', color: '#b59adb' },
  Cunning: { desc: 'Smiles while weaving schemes.', color: '#7a6a9a' },
};
export const TRAIT_NAMES = Object.keys(TRAITS);
export const OPPOSED = { Brave: 'Lazy', Gentle: 'Hot-headed', 'Hot-headed': 'Gentle', Lazy: 'Ambitious', Ambitious: 'Lazy', Greedy: 'Pious', Pious: 'Greedy' };

export const JOBS = {
  farmer: { title: 'Farmer', ko: '농부', outfit: 'commoner', work: 'field', pay: 6 },
  merchant: { title: 'Merchant', ko: '상인', outfit: 'merchant', work: 'stall', pay: 10 },
  soldier: { title: 'Soldier', ko: '군사', outfit: 'soldier', work: 'guard', pay: 8, fighter: true },
  general: { title: 'General', ko: '장군', outfit: 'general', work: 'guard', pay: 18, fighter: true },
  scholar: { title: 'Scholar', ko: '선비', outfit: 'scholar', work: 'study', pay: 7 },
  innkeeper: { title: 'Innkeeper', ko: '주모', outfit: 'commoner', work: 'jumak', pay: 9 },
  monk: { title: 'Monk', ko: '스님', outfit: 'monk', work: 'shrine', pay: 3 },
  eunuch: { title: 'Palace Eunuch', ko: '내시', outfit: 'scholar', work: 'court', pay: 9 },
  servant: { title: 'Bondservant', ko: '노비', outfit: 'commoner', work: 'field', pay: 0 },
  farmhand: { title: 'Hired Hand', ko: '머슴', outfit: 'commoner', work: 'field', pay: 5 },
  noble: { title: 'Noble', ko: '양반', outfit: 'noble', work: 'pavilion', pay: 14 },
  swordsman: { title: 'Wandering Swordsman', ko: '검객', outfit: 'wanderer', work: 'dummy', pay: 4, fighter: true },
  hunter: { title: 'Hunter', ko: '사냥꾼', outfit: 'hunter', work: 'field', pay: 6, fighter: true },
  bandit: { title: 'Bandit', ko: '산적', outfit: 'bandit', work: 'camp', pay: 0, fighter: true },
  king: { title: 'King', ko: '왕', outfit: 'royal', work: 'throne', pay: 40, fighter: true },
  queen: { title: 'Queen', ko: '왕비', outfit: 'queen', work: 'pavilion', pay: 30 },
  prince: { title: 'Crown Prince', ko: '세자', outfit: 'prince', work: 'study', pay: 20, fighter: true },
  princess: { title: 'Princess', ko: '공주', outfit: 'princess', work: 'pavilion', pay: 20 },
  official: { title: 'Court Official', ko: '관리', outfit: 'scholar', work: 'pavilion', pay: 16 },
  fisher: { title: 'Fisher', ko: '어부', outfit: 'commoner', work: 'fish', pay: 7 },
  child: { title: 'Child', ko: '아이', outfit: 'child', work: 'school', pay: 0 },
  police: { title: 'Constable', ko: '포졸', outfit: 'police', work: 'patrol', pay: 11, fighter: true },
};

export const NEEDS = [
  { key: 'hunger', en: 'Hunger', ko: '배고픔' },
  { key: 'energy', en: 'Energy', ko: '기력' },
  { key: 'social', en: 'Social', ko: '정' },
  { key: 'fun', en: 'Fun', ko: '흥' },
  { key: 'hygiene', en: 'Hygiene', ko: '청결' },
  { key: 'honor', en: 'Honor', ko: '명예' },
];

// Traditional Korean double-hours (12 earthly branches)
export const HOURS = [
  ['Rat', '자시'], ['Ox', '축시'], ['Tiger', '인시'], ['Rabbit', '묘시'], ['Dragon', '진시'], ['Snake', '사시'],
  ['Horse', '오시'], ['Sheep', '미시'], ['Monkey', '신시'], ['Rooster', '유시'], ['Dog', '술시'], ['Pig', '해시'],
];
export function hourName(h) { const i = Math.floor(((h + 1) % 24) / 2); return HOURS[i]; }

export const LINES = {
  greet: ['Have you eaten yet? (밥 먹었어?)', 'Annyeong, {t}!', 'The spirits smile on you today, {t}.', 'Ah, {t}! Long time.', 'Peace be on your house, {t}.'],
  chat: ['The rice is heavy this autumn.', 'The maples are burning red on the ridge.', 'My back aches from the paddies.', 'They say the river spirit is restless.',
    'The jumak has fresh makgeolli today.', 'Did you see the lanterns last night?', 'The magistrate\'s men were asking about taxes.', 'Winter will come early, mark my words.'],
  gossip: ['Did you hear? {o} was seen by the bamboo grove at midnight.', 'They say {o} owes half the village money.', '{o} has been staring at the general\'s daughter...', 'I heard {o} lost a duel and wept like a child.', 'Bandits were spotted in the western woods.'],
  joke: ['Why did the ox refuse the yoke? It wanted to be a scholar!', 'My wife says my sword is sharper than my wit. She is right.', 'I asked the monk for wisdom. He gave me a broom.'],
  laugh: ['Hahaha!', 'Hoho, good one!', 'Ha! You fool!', 'Hehe…'],
  compliment: ['Your sword arm grows stronger, {t}.', 'Your words are like spring rain.', 'Your family is lucky to have you.'],
  flirt: ['Your hanbok matches the maple leaves today…', 'Would you walk with me by the river tonight?', 'When you smile, even the moon hides.'],
  flirtBad: ['…Please, be serious.', 'Not here, people are watching!', 'Hmph. Go flirt with a scarecrow.'],
  insult: ['You fight like a startled chicken.', 'Your family name shames this village.', 'Even the oxen are smarter than you, {t}.', 'Begone, peasant.'],
  angry: ['How dare you!', 'Watch your tongue!', 'You will regret that.', 'Insolent dog!'],
  challenge: ['Draw your blade, {t}! Let steel decide!', 'I challenge you! At the training ground, now!', 'Enough talk. Fight me!'],
  comfort: ['Do not worry, all will be well.', 'The mountain does not fear the wind.', 'I am here for you, {t}.'],
  bandit: ['Your coin or your life!', 'Burn it all!', 'Hah! Easy pickings!', 'Take everything!'],
  defend: ['Defend the village!', 'For Haeryeong!', 'Protect the people!', 'Drive them back!'],
  flee: ['Run! Bandits!', 'Aigoo! Help!', 'Hide the children!', 'Save us!'],
  victory: ['Victory!', 'It is finished.', 'Heaven favored my blade.'],
  hurt: ['Ugh!', 'Agh!', 'Hngh!'],
  bow: ['(bows respectfully)', 'Please take care of me.', 'It is an honor.'],
  festival: ['Look at the lanterns!', 'Dance with me!', 'What a night!', 'Make a wish on the lanterns!'],
};

export function line(kind, t = '', o = '') {
  return pick(LINES[kind] || ['…']).replace('{t}', t).replace('{o}', o);
}

export const PALETTES = {
  hanbokTop: ['#f4ead2', '#e9d8b4', '#f0c8c8', '#c8dbc4', '#e8c86b', '#f2f0ea', '#d6e3ef', '#f5d6b0'],
  hanbokSkirt: ['#a3262a', '#2e4f8a', '#c23b6d', '#3f7d63', '#7a3b8f', '#d1772c', '#1f5f6b', '#b8324a'],
  ribbon: ['#a3262a', '#7a2a6b', '#2e4f8a', '#2d6b4c', '#c49a2a'],
  commoner: ['#e8dfc8', '#d9ceb2', '#cfc4a6', '#bfb39a', '#e2d8c3', '#a89f8a'],
  noble: ['#3c5d8c', '#6b8fb5', '#e8e2d2', '#7a9c8a', '#8c6fa0', '#c9b98a', '#5b7d6f'],
  soldier: ['#2c3a5e', '#7d1f1f'],
  bandit: ['#3a3530', '#4a3f35', '#2f3a33', '#5a4a3a'],
  skin: ['#f3d2b3', '#eac39e', '#e0b48d', '#d6a67f', '#c99570', '#f6dcc3'],
  hair: ['#141110', '#1c1714', '#241c17', '#0f0d0d'],
};

export function randomColor(key) { return pick(PALETTES[key]); }
export { rand };


// ---------- Factions ----------
export const FACTIONS = {
  court: {
    name: 'Royal Court', ko: '조정', color: '#c0392b', hq: 'palaceGate', icon: '王',
    desc: 'Serve the King. Rise from clerk to Chief State Councillor — and perhaps marry into the royal house.',
    ranks: ['Retainer', 'Junior Clerk (종9품)', 'Clerk (정9품)', 'Secretary (정7품)', 'Magistrate (정5품)', 'Inspector (정3품)', 'Minister (정2품)', 'Chief State Councillor (영의정)'],
    enemies: ['lotus', 'bandits'],
  },
  hwarang: {
    name: 'Hwarang Order', ko: '화랑', color: '#d9a520', hq: 'training', icon: '劍',
    desc: 'A brotherhood of young warriors sworn to protect the valley. Duels, training and glory.',
    ranks: ['Initiate', 'Blade', 'Swordsman', 'Elite Hwarang', 'Master of the Order'], enemies: ['bandits'],
  },
  guild: {
    name: "Bobusang Merchants' Guild", ko: '보부상', color: '#3f7d63', hq: 'market', icon: '商',
    desc: 'Peddlers and traders who know every road. Profit, news and favours.',
    ranks: ['Peddler', 'Trader', 'Merchant', 'Master Merchant', 'Guild Elder'], enemies: [],
  },
  temple: {
    name: 'Temple of the Azure Cloud', ko: '청운사', color: '#6c8fc2', hq: 'temple', icon: '卍',
    desc: 'Monks and devotees seeking peace. Prayer, charity and healing.',
    ranks: ['Lay Devotee', 'Novice', 'Monk', 'Elder Monk', 'Abbot'], enemies: [],
  },
  lotus: {
    name: 'Black Lotus', ko: '흑련', color: '#5a2a6a', hq: 'shrine', icon: '蓮', secret: true,
    desc: 'A secret society that whispers of a new king. Theft, rumours and murder in the dark.',
    ranks: ['Whisper', 'Shadow', 'Blade of the Lotus', 'Lotus Master'], enemies: ['court'],
  },
  bandits: {
    name: 'Western Woods Bandits', ko: '산적', color: '#7a1f1f', hq: 'bandit', icon: '賊',
    desc: 'Outlaws who live by the blade. Rob, raid and answer to no king.',
    ranks: ['Lookout', 'Raider', 'Enforcer', 'Bandit Chief'], enemies: ['court', 'hwarang'],
  },
};

// Task templates: type matches events reported by the game (use/kill/duelWin/social/steal/coins/talk/donate)
export const TASKS = {
  court: [
    { text: 'Stand guard at the palace gate (60 min)', type: 'use', kind: ['guard'], goal: 60 },
    { text: 'Attend morning court (60 min)', type: 'use', kind: ['court'], goal: 60 },
    { text: 'Slay 2 bandits', type: 'kill', faction: 'bandit', goal: 2 },
    { text: 'Deliver a royal decree to {npc}', type: 'talk', goal: 1, needNpc: true },
    { text: 'Bow before His Majesty', type: 'social', kinds: ['greet', 'compliment', 'chat'], targetJob: ['king'], goal: 1 },
  ],
  hwarang: [
    { text: 'Train at the dummies (90 min)', type: 'use', kind: ['dummy', 'trainWork'], goal: 90 },
    { text: 'Win 2 duels', type: 'duelWin', goal: 2 },
    { text: 'Practice archery (45 min)', type: 'use', kind: ['target'], goal: 45 },
    { text: 'Slay a bandit', type: 'kill', faction: 'bandit', goal: 1 },
  ],
  guild: [
    { text: 'Sell goods at a market stall (90 min)', type: 'use', kind: ['stallWork', 'shop'], goal: 90 },
    { text: 'Earn 60 nyang', type: 'coins', goal: 60 },
    { text: 'Share news with 3 people', type: 'social', kinds: ['chat', 'gossip'], goal: 3 },
    { text: 'Deliver goods to {npc}', type: 'talk', goal: 1, needNpc: true },
  ],
  temple: [
    { text: 'Pray at a shrine (60 min)', type: 'use', kind: ['shrine', 'templeWork'], goal: 60 },
    { text: 'Comfort 2 troubled souls', type: 'social', kinds: ['comfort', 'compliment'], goal: 2 },
    { text: 'Donate 25 nyang to the temple', type: 'donate', goal: 25 },
    { text: 'Purify yourself in the stream (20 min)', type: 'use', kind: ['stream'], goal: 20 },
  ],
  lotus: [
    { text: 'Insult 2 nobles', type: 'social', kinds: ['insult'], targetJob: ['noble', 'official', 'queen', 'prince', 'princess'], goal: 2 },
    { text: 'Pickpocket 3 victims', type: 'steal', goal: 3 },
    { text: 'Spread rumours 3 times', type: 'social', kinds: ['gossip'], goal: 3 },
    { text: 'Silence {npc} forever', type: 'kill', goal: 1, needNpc: true, npcJob: ['noble', 'official', 'soldier'] },
  ],
  bandits: [
    { text: 'Rob 2 villagers', type: 'steal', goal: 2 },
    { text: 'Slay a soldier of the King', type: 'kill', job: ['soldier', 'general'], goal: 1 },
    { text: 'Sleep a night at the camp', type: 'use', kind: ['tent'], goal: 240 },
  ],
};

export const ANIMALS = {
  dog: { name: 'Jindo Dog', ko: '진돗개', pet: true, speed: 2.4, size: 0.55 },
  cat: { name: 'Cat', ko: '고양이', pet: true, speed: 1.8, size: 0.32 },
  deer: { name: 'Water Deer', ko: '고라니', wild: true, flee: true, speed: 5.5, size: 0.8 },
  rabbit: { name: 'Hare', ko: '산토끼', wild: true, flee: true, speed: 5, size: 0.25 },
  boar: { name: 'Wild Boar', ko: '멧돼지', wild: true, hostile: 0.25, speed: 4.2, size: 0.75, hp: 60 },
  tiger: { name: 'Korean Tiger', ko: '호랑이', wild: true, hostile: 1, speed: 6, size: 1.2, hp: 160 },
  fox: { name: 'Red Fox', ko: '여우', wild: true, flee: true, speed: 5, size: 0.45 },
  crane: { name: 'Red-crowned Crane', ko: '두루미', wild: true, flee: true, speed: 2.5, size: 1.0, bird: true },
  magpie: { name: 'Magpie', ko: '까치', wild: true, flee: true, speed: 3, size: 0.25, bird: true },
  ox: { name: 'Ox', ko: '황소', farm: true, speed: 1.0, size: 1.3 },
  chicken: { name: 'Chicken', ko: '닭', farm: true, speed: 1.2, size: 0.3 },
  horse: { name: 'Horse', ko: '말', farm: true, mount: true, speed: 4, size: 1.4, hp: 90 },
};
