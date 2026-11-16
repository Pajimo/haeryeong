# 해령 HAERYEONG — A Living Kingdom

**▶ Play it: <https://pajimo.github.io/haeryeong/>** — no install, runs in any desktop browser.

A life-sim set in an original Joseon / Three-Kingdoms-inspired valley. It plays like The Sims: villagers have needs and make their own choices. It also has third-person sword combat. Runs in the browser with Three.js.

Every push to `main` rebuilds and redeploys the live version automatically
(`.github/workflows/deploy.yml`). The AI dialogue is optional — it asks for your own Anthropic API key
in ⚙ Settings, stores it only in your browser, and everything else works without it.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The title screen lets you pick graphics quality (High / Balanced) and a world seed.

## What's in it

**World.** A procedural 1 km valley: ridged mountains, a winding river with an arched bridge, golden rice paddies, silver-grass (억새) fields, bamboo groves, red pines, maples, ginkgo and persimmon trees. Grass and foliage move with the wind. There is a full day/night cycle with golden hours, a moon and stars, and weather (rain, mist, wind).

**Village.** The houses are hanok with curved, upturned tile roofs and lattice paper doors that glow at night, plus thatched choga. There is a walled palace with a double-roofed throne hall, a temple with a stone pagoda and bell pavilion, the jumak tavern, a market street, a training ground, jangseung totem guardians, onggi jar terraces, a riverside pavilion and a bandit camp in the western woods.

**People.** About 75 Sims-style characters wear hanbok: jeogori and chima, gat hats, topknots, braids with daenggi ribbons, satgat bamboo hats and soldier armor. Each has:
- 6 needs: Hunger, Energy, Social, Fun, Hygiene, Honor
- traits such as Brave, Hot-headed, Romantic or Cunning
- a job, a home, skills, coins, moodlets and relationships

**Utility AI.** Objects advertise what they satisfy, as in The Sims. Villagers weigh those offers against their needs, traits, distance and the time of day. They work shifts, eat, sleep, wash, pray, recite poetry and train. They also gossip, flirt, insult each other, fight duels over grudges, marry and grieve.

**The storyteller (AI director).** It triggers bandit raids, the Lantern Festival with rising sky lanterns, martial tournaments, wandering-master challenges, market days, royal decrees, omens and travelers. Everything is written to the Chronicle.

**Combat.** Light combos, heavy attacks that break guards, blocking, timed parries that stagger the attacker, dodges and lock-on. It also has sword trails, sparks, hit-stop and slow-motion finishing blows. Attacking innocents makes you an outlaw, and the guards will come after you.

**Optional Claude-powered dialogue.** Add your Anthropic API key in ⚙ Settings. You can then "Speak freely" with any villager, who answers in character and knows their mood, needs, relationships and recent village events. The royal historian (✒ in the Chronicle) can also write annals. The key is stored only in your browser's localStorage.

## Missions & fame (🗡 · M)
- GTA-style missions with stages, waypoint beacons, timers, stealth meters, escorts, chases, horse races and ambushes, with MISSION PASSED/FAILED title cards. Mission-givers show a ❗ above their heads.
- Each mission belongs to one of six paths. Doing missions on a path raises your fame there, gives you titles and better pay, and unlocks harder missions.
  - **Blade**: bounty on the Butcher, bodyguard a minister, duel three masters, rescue a kidnapped daughter.
  - **Shadow**: missions for the Black Lotus only. Kill a corrupt tax collector, steal the jade seal, poison the general.
  - **Trade**: rush ginseng to the temple before the bell, smuggle salt past the constables, the bridge horse race.
  - **Law**: chase the rooftop thief, solve "Death at the Well".
  - **Heart**: babysit the terrible twins, carry a love letter, find a lost dog, walk grandmother to the river.
  - **Hunt**: boars in the paddies, the man-eating tiger.

## More systems
- **⚔ Realms (wars)**: three rival powers with diplomacy, envoys, ultimatums, battles on the silver-grass plain (arrow volleys, cavalry, routs), sieges, tribute and peace treaties. You can counsel the King, join the army or lead the vanguard.
- **📜 Life events and requests**:
  - illness and epidemics, physicians and shamans;
  - house fires with bucket brigades;
  - thunderstorms, floods, drought, locusts, eclipses and comets;
  - folklore: gwishin ghosts, dokkaebi goblins, gumiho fox spirits;
  - personal luck: treasure, inheritance, kidnappings, matchmakers, foundlings;
  - a village notice board of requests.
- **🎨 Pastimes**: ink painting, gayageum music you can hear, tea, meditation, stargazing, kitchen gardens, cooking. Seasonal: kites, picnics, sledding, snowball fights, snowmen. Events: kimjang, the poetry contest, music nights.
- **🎯 Goals (J)**: aspirations, satisfaction rewards and 30 deeds.
- **📖 Album**: life's big moments become letterboxed cinematics saved to a family scrapbook.
- **📷 Photo mode (P)**: ambient occlusion, depth of field, filters, PNG export.

## Seasons

The year cycles through spring, summer, autumn and winter. Each season lasts 4 in-game days, so a year is 16 days. You can choose the starting season on the title screen.

- **Spring 🌸**: cherry and plum blossoms with fresh green leaves, green fields, falling pink petals, and short rice shoots in the paddies. Festival: the Lantern Festival.
- **Summer ☀**: lush deep greens, tall rice, monsoon rains, and fireflies at night. Festival: Dano, with the swing contest and ssireum wrestling.
- **Autumn 🍁**: red maples, golden ginkgo, ripe rice and silver grass, and falling leaves. Festival: the Chuseok harvest moon.
- **Winter ❄**: deciduous trees lose their leaves, and snow builds up on the ground, roofs, pine trees and rocks. Snow falls, the river freezes over, the sun sits low and the fog turns cold. People get hungry and tired faster. Festival: Seollal (Lunar New Year), when children receive coins.

Seasons blend smoothly into each other. They also change the weather and villagers' daily moods.

## Life, kingdom and legacy

**Characters.** Bodies, faces, hair and hands are sculpted procedurally and skinned to the skeleton, so limbs bend smoothly. They wear hanbok silhouettes:
- pleated chima skirts
- durumagi robes with V collars
- rainbow *saekdong* sleeves on children
- royal dragon robes

**Generations.** Everyone ages through child, young, adult and elder stages, then dies of old age.
- Married couples have babies, and children inherit traits from their parents.
- The Life tab shows each person's parents, spouse, children, pregnancy and pet.
- When your last household member dies, play continues with their heirs. If there are none, you pick a new family.

**The royal court.** The King sits on his throne before the *Irworobongdo* (Sun, Moon and Five Peaks) screen. The Queen, the Crown Prince and the Princess live in the palace.
- Click the King to request an audience. You can pledge loyalty, petition for a post, report the bandits, beg for silver, ask to be his champion or ask for the princess's hand.
- Other palace events: the Gwageo civil-service exam, royal banquets, Black Lotus assassination plots, and royal campaigns against the bandit camp.
- When the King dies, the crown passes by succession, through marriage to the princess, by vote of the ministers, or by a Lotus coup. Your character can become King and issue decrees.

**Factions** (open with ⚑ or K). You join each one at its banner hall:
- Royal Court
- Hwarang Order
- Bobusang Merchants' Guild
- Temple of the Azure Cloud
- the secret Black Lotus (meets at night)
- Western Woods Bandits

Each faction has rank titles and gives you tasks. Completing tasks earns pay and promotions.

**Activities.** You can fish in the river, bet on yut-nori, kick the jegi, ride the swing, attend lessons, buy a house or pickpocket.

**Animals.**
- Wild: water deer, hares, foxes, wild boar, cranes, magpies, and a roaming Korean tiger.
- Farm: oxen and chickens.
- Pets: adopt stray Jindo dogs and cats, or buy a puppy at the market. Pets follow you, can be petted or played with, and guard dogs fight anyone who attacks you. You can also hunt.

**Money and status.** Every person has a wealth class, from Destitute to Rich, based on their coins, houses, horse and goods.
- Trade five goods (rice, salt, silk, ginseng, celadon). Prices change every day.
- Buy a market stall for daily income.
- Borrow from the moneylender. If you miss the deadline, the police come after you.
- Beg at the plaza when you're broke.
- Buy, sell, rent out and renovate houses.
- Buy fine silk hanbok, jade ornaments or a master-forged sword.
- Purchase a yangban (noble) title from the King.

**Police (포도청).** Constables patrol the village and arrest pickpockets, murderers and debtors. Arrested people go to a wooden jail cage and pay a fine. You can join as a constable and collect bounties, pay bail, or turn yourself in.

**Jobs.** Click any workplace to change career: merchant, farmer, fisher, innkeeper, scholar, soldier, monk, constable or swordsman.

**Horses.** Buy one at the stable or tame a wild one in the silver-grass field. Horses come with a saddle, bridle and tassels. In warrior mode, **E** mounts and dismounts, **Shift** gallops and **H** whistles your horse to you. Characters also ride their own horse for long journeys.

**Saving.** Press 💾 to save; the game also autosaves every dawn. Choose **Continue Dynasty** on the title screen to pick up where you left off.

## Starting out

**Your birth (팔자).** In the character creator, choose where your family begins, or press 🎲 *Let fate decide*:

| Birth | Odds under fate | Where you start |
|---|---|---|
| 👑 The young King | 3% | Your father abdicates and you rule from day one, guard and all. |
| 🏯 Royal heir | 7% | A child of the King and Queen, guarded and next in line. Your sibling is a princess and your grandmother the dowager. |
| 🏛 Yangban house | 14% | A walled mansion, its servants, silver, and court entry as a Secretary. |
| 🏡 Commoners | 38% | A thatched cottage. |
| 🛖 Poor family | 20% | A leaking hut and a few coins. |
| ⛓ Born in bondage | 9% | A bondservant of a rich house. Buy your freedom for 150 nyang (click yourself), or find braver ways. |
| 🗡 Bandit camp | 9% | Raised among the outlaws with a price on your head. |


- **Character creator:** after Begin, shape the head of your household: family name, given name, sex, path in life (Swordsman, Hunter, Scholar, Merchant, Farmer or Fisher, each with its own starting skills and purse), up to three traits, and skin, hair and clothing colours. A live 3D preview turns as you choose. "Surprise me" rolls everything at random.
- **First Day checklist:** a small panel teaches the main controls by doing them: selecting family, giving an order, chatting, choosing a life goal, taking direct control, reading the almanac and taking a mission. Each step pays 10 nyang. It can be collapsed or dismissed.
- **Rival clan:** another proud family in the valley resents your rise. As their enmity grows, they slander you at the well, have a bribed clerk fine you, hire thugs to ambush you, send their champion to challenge you, court the one your sibling loves, and spoil your stores. Answer with peace gifts, duels, or a marriage alliance that ends the feud. Each scheme may be witnessed; with three pieces of evidence you can expose their head before the magistrate for a fine and public disgrace. The almanac and the Self tab show where the feud stands.

## Swords for hire, crime and the throne

- **Sellswords (at the jumak):** hire fighters with their own skill, traits, signing fee and daily wage. They follow whoever hired them, fight anyone who attacks you or your family, can be told to guard the house, and want paying every dawn. Unpaid swords grumble; greedy or hot-headed ones desert to the bandits.
- **Your own mercenary company:** with sword skill 5 and 150 nyang, found a company (the Black Crane Company, the Red Tiger Band…). Members wear its colours and take lower wages. From the jumak, send the company on contracts (escort convoys, clear the bandits, guard estates, collect debts, fight for the King in wartime), or lead them in person for better odds and more fame. Renown unlocks richer contracts; some members won't come home.
- **Getting away with it:** an outlaw can lie low at home for half a day (the bounty cools, and small ones are forgotten), flee the valley for two days, bribe a constable (honest ones arrest you for trying), or buy a disguise at the market (the warrant can't find you for a day, unless you spill blood). Bounties of 150 nyang or more draw bounty hunters.
- **The throne:** click the King and choose "Consider treason…" to see every road: marry a prince or princess, strike with the Black Lotus, strike with a company of 5+ swords, rise to the 5th court rank first, or pay a palace cook 500 nyang to poison him. Kill the King with none of these behind you and it's regicide: a 1000-nyang bounty, every soldier after you, and the Crown Prince reigns.

## Politics: the road to Prime Minister

- **Family standing** (poor commoners, respectable commoners, a yangban house, or a great house) comes from your household's wealth, honour, court ranks, royal marriages and fame. It sets the rank you enter court at: a poor house starts as a Retainer, a yangban house as a Secretary. Well-born families also gain court reputation faster.
- **Morning court (조회)** sits every other day at 9:00. Click the King to take your place, then support, oppose, stay silent on, or (with scholarship or charisma) broker a compromise on real issues of the day: war levies, grain taxes, bandit amnesty, academies, watchtowers, inquiries into the rival clan or the Chief State Councillor. The chamber's decisions change prices, moods, bandits and war tension.
- **Promotion** past Magistrate needs the King's favour and the backing of one of the court cliques (Easterners 동인 and Westerners 서인). The top seat, Chief State Councillor (영의정), must be empty first: outlive, out-argue or impeach whoever holds it. Ranks pay a daily salary, and a Magistrate can pardon family. Pick a clique; if it loses power, a purge can cost you your rank.

## The story deck

Every few hours the storyteller deals your family a situation from a deck of 152 scenarios inspired by Three Kingdoms–era sageuk: royal archery trials, framed treason, captive convoys, iron that won't shatter, omens at a birth, a widow's fate, high priestesses and purges, bandit ambushes on the salt road, hidden parentage and more. Each comes with choices whose consequences ripple through the simulation, and some unfold in two parts.

## Hunting, caravans and the family book

- **Hunting:** game your family brings down leaves meat and hides instead of instant coin: venison, boar meat, rabbit, deer and boar hides, fox fur, and the prize tiger pelt and bone. Sell them at the market (furs fetch far more in winter, meat in lean spring), cook the meat at a cookpot to feed the whole household, have a fur-lined coat made (3 furs + 20 nyang; it keeps the cold off in winter), or lay a tiger pelt before the King for 250 nyang and his favour. Herds slowly return to the hills, and now and then a new tiger comes down from the north.
- **Trade caravans (🐫 at the market):** load goods (rice, salt, silk, ginseng, celadon, paintings, kimchi, furs), pick a realm and a leader, and send them over the passes. Seorang pays well for rice and paintings, Hwaru for salt, silk and celadon, Heukpa for ginseng and furs. Letters arrive from the road: bandits, storms, toll-keepers, eager buyers. A fighter guards the goods better and a charming leader haggles better, and family members come home wiser with gifts and stories. A war closes that border and sends the caravan fleeing home.
- **Family book (🌳 Family):** a permanent family tree of your bloodline and everyone who married in, with portraits, titles, dates and how each life ended. It survives saves and generations.

## The power of the crown and the people's heart (민심)

The valley has a **people's heart** meter (민심, 0–100). It drifts every day with taxes, hunger, the war, the laws, festivals and the granary, and every royal command moves it. Check it in the Almanac, by asking the King "about the realm", or in your royal panel.

- **Beloved (75+):** villagers leave gifts at the palace gate and the treasury grows.
- **Content:** calm.
- **Restless:** crowds march on the palace gate with slogans.
- **Angry:** protests plus riots. The royal storehouse is looted, the market smashed, guards attacked.
- **On the brink of revolt:** a **peasant uprising**. The angriest villagers take up sickles and stolen swords behind a leader and march on the palace while the soldiers fight them. If they kill the King, their leader is crowned by the peasant army and taxes fall; if they're crushed, the survivors become outlaws.

**Royal commands (어명)**, for when your family wears the crown (click yourself → 👑 Royal duties & commands). Each has a cooldown, and some cost treasury silver.
- **Treasury & grain:** light, customary, heavy or crushing taxes; open the royal granaries to the hungry; requisition grain; debase the coinage (+300, but prices jump); charter the merchants.
- **Law & justice:** a general amnesty (jails emptied, warrants burned); harsh laws (twice the patrols, less crime, colder hearts) or merciful ones; a public execution; hearing the people's petitions at the petition drum (신문고). Three subjects kneel with real requests (a widow's relief, a flood-tax delay, a merchant's salt monopoly bribe, justice against a noble's son…) and you grant or refuse each.
- **War & peace:** declare war on a realm of your choosing, sue for peace, send tribute to the most dangerous realm, demand tribute from the weakest (they may pay or send back the envoy's beard), or conscript the young men.
- **Feasts & faith:** proclaim a festival, feast the nobles, lead a royal hunt, offer the great sacrifice to Heaven (a blessed harvest), or ban rice wine (금주령; the jumak is sealed).
- **Patronage:** reward the most honoured subject, raise a member of your house at court, banish the rival clan's head to an island, or name an heir.
- **The iron fist:** seize the richest house's fortune, or force villagers to labour on the royal works.

**Royal family duties:** a queen, prince or princess in your house can give alms, visit the villages, patronise the temple, or petition the King on the people's behalf. A princess or queen can found a school for girls and orphans. A prince can gather ministers to his cause, a step toward the throne.

**AI kings rule too.** When the King isn't yours, he governs by temperament every day or so: a gentle king opens granaries and pardons, a greedy one raises taxes and debases the coin, an ambitious one demands tribute and declares war, a hot-headed one passes harsh laws and executes. You live with the consequences, and the people may rise.

### The royal guard (내금위)

The King is never alone. Five elite swordsmen (sword skill 9–10, nearly triple a soldier's toughness), led by a red-armoured captain, shadow him in a loose fan and close on anyone who raises a blade against him. Killing a guarded King takes an army, a traitor or a very great sword. The King himself is a trained warrior and hard to fell. Fallen guards are replaced from the treasury.

- **Loyalty** rises when they are paid (12 nyang each a day from the treasury) and the people love the King. It falls when wages go unpaid and under a hated or cruel reign.
- **Broken loyalty:** guards desert in the night ("I swore to a king, not a tyrant"). In a revolt, a bitter guardsman may join the rebels.
- **Bribery:** click a guardsman to see how loyal he looks and quietly offer silver to stand aside (cheaper when his loyalty is low). A bought guard won't defend the King against you, and may even strike him himself. The Chief Eunuch may discover the bribe: the guard is executed and you are wanted for treason.
- **Royal commands:** dismiss the guard to save their wages ("I fear no one in my own kingdom"), raise a new one, or pay them a bonus. After a violent seizure of the throne, half the old guard may refuse to serve the usurper.

### Guards for the royal family, and real reasons to strike

- **The closer to the throne, the more swords:** the Queen and the heir each have two guards, other princes and princesses one, and more distant royals none. Fallen guards are replaced from the treasury within hours, and the King's own detail is topped back up every dawn.
- **Danger to the throne** is worked out from real causes, each with its own weight:
  - how much the people hate the throne
  - cruel decrees (seizures, executions, forced labour, banishments)
  - the strength of the Black Lotus
  - foreign war
  - an ambitious prince who covets the seat
  - families whose kin the King killed
  - a banished noble
  - a usurper's shaky legitimacy
  - a thin or disloyal guard

  The higher it climbs, the likelier an attempt on the King or a royal: Lotus assassins, a foreign killer, a prince's hired blades, avengers, or desperate men with knives. The Almanac and the eunuchs' gossip tell you how great the danger is and why.

### Your authority, as King and as master

- **As King, click any subject** to arrest them (constables run them down), pardon them, execute a prisoner, banish them to an island (their kin remember), summon them to the palace, reward them with treasury silver, grant them an empty house, appoint them to court, make them Chief State Councillor (the old one is removed), make a fighter General of the army, or take them into your royal guard. **Expand the royal guard** to as many as ten swords from the royal commands.
- **As a master, click your servants** to have them walk with you as an escort (they fight for you), go back and keep the house, run to the market for food, cook the family a feast, work the fields hard for extra income, or discipline them (it costs loyalty and honour, and the other servants notice). You can also free, sell, rest or dismiss them.
- **Choose whom you marry.** Click yourself → *Seek a spouse through the matchmaker (중매)*. She lists the best eligible matches in the valley with their traits, home, how well they know you and your chance of acceptance. A higher house marries up more easily, and a family that likes you may accept a humble suitor. Royalty holds a **bride selection (간택)** instead and chooses from the great houses (a King's bride becomes Queen). Parents can arrange matches for their grown children. Close relatives are never offered.

### Royal pilgrimage (어가 행렬)

Every few days an AI King goes up to the mountain temple to pray: for rain in a dry summer, for victory in war, for the health of the royal house, for an heir, or for the harvest. A player King can order it as a command. The Queen and royal children ride along with the royal guard, eight soldiers with a banner-bearer, and any of your family who serve at court (2nd rank and up), who win the King's notice and court reputation on the road. Villagers kneel as the procession passes, monks chant, and the great bell rings thirty-three times. Prayers lift the people's heart and bless the harvest; a prayer for rain is sometimes answered that evening. The mountain pass is lonely, and the more danger the throne is in, the more likely an ambush.

### Servants: bondservants (노비) and hired hands (머슴)

Mansions keep two bondservants and often a hired hand; some tiled houses keep one. Servants work the yard and fields (their labour enriches the master), haul water and firewood, keep the gate, and fight anyone who attacks the people of their house.
- **Hired hands** are paid 5 nyang a day by their master and quit if unpaid.
- **Bondservants** are owned, not paid. Their loyalty follows their master's character (a gentle master earns it, a hot-headed or greedy one loses it), and a despairing bondservant runs away in the night with a slave-catcher on their trail.
- **At the market or jumak** you can hire a farmhand or buy a bondservant's papers (at a cost to your honour).
- **Click your own bondservant** to burn their papers and set them free (면천: honour, fame and a grateful friend), sell their papers to a broker (a shame on the house), or give them a meal and a day of rest.

### Palace eunuchs (내시) and the temple's monks (스님)

- **Eunuchs** run the inner palace and attend the King wherever he goes within its walls. For a little silver they sell gossip: the King's real opinion of your house, his mood about taxes, which realm the generals fear, how many Black Lotus brothers are about, evidence against the rival clan, whether the Chief State Councillor keeps two sets of ledgers, how loyal the royal guard is. They can also arrange a private audience. The **Chief Eunuch (상선)** will put in a good word with the King for 60 nyang, and he watches for treason.
- **Monks** walk the morning alms round through the village every other dawn and accept gifts. Click a monk to ask for a blessing, seek **sanctuary** at the temple as an outlaw (a day and night where no constable may follow; small warrants are forgiven, large ones halved), **take monastic vows** (an unmarried family member becomes a monk, and can return to the world later), or train in the temple's staff-and-sword arts.

## Characters (MakeHuman faces, bodies and Joseon clothing)
Villagers are realistic East Asian MakeHuman characters, built in Blender with MPFB2 and the CC0 MakeHuman system assets.

**Faces**
- 48 heads: man and woman, each as child, young, adult and elder, each with 6 face shapes.
- Each has fitted eyes, one of 12 eyebrow styles, eyelashes, and an age- and sex-appropriate skin texture tinted to the villager's tone.
- Moustaches and goatees sit on each face's mouth, and the hair cap is enlarged to fit each skull.

**Bodies**
- Six bodies: man and woman, each as adult, elder and child.
- Each is posed into the game's bind pose and its skin weights are merged onto the game's own 17 bones, so all the procedural animation (walking, fighting, farming, riding, bowing) drives them unchanged.

**Clothing** (`charpipe/dress.py`)
- Each outfit is grown from the body, so it moves exactly with it:
  - **pants:** jeogori jacket with the white collar band (동정), puffed baji gathered into leg wraps, sash and shoes.
  - **chima:** short jeogori, a high-waisted bell-shaped chima, and the goreum ribbon.
  - **robe:** a scholar's dopo with wide sleeves and a long skirt over baji.
  - **armor:** a general's coat.
- Colours still come from each villager's palette (rank robes, finery, uniforms), and noble hems keep their gold border.
- Body skin covered by clothes is deleted, so nothing pokes through.

**Performance and size**
- Each body has a light mesh used from 16 m out, and distant villagers don't cast shadows. All 125 characters cost about 1 ms of a frame.
- Files: `public/chars/heads.glb` (2.1 MB) and `public/chars/bodies.glb` (1.8 MB, meshopt), plus about 1.4 MB of textures.
- `?oldfaces=1` and `?oldbodies=1` show the old sculpted versions.

**Rebuilding** (Blender 4.2+, the MPFB extension, and `makehuman_system_assets_cc0.zip` unzipped into MPFB's user data folder):
```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python charpipe/make_heads.py -- charpipe/out/heads.glb 6
/Applications/Blender.app/Contents/MacOS/Blender -b --python charpipe/make_bodies.py -- charpipe/out/bodies.glb
npx gltf-transform meshopt charpipe/out/heads.glb public/chars/heads.glb && npx gltf-transform meshopt charpipe/out/bodies.glb public/chars/bodies.glb && cp charpipe/out/*.json public/chars/
```
`headtest.html` previews every head.

## Textures
- Ground, roads, roofs, walls, timber and stonework use photographic CC0 textures from Poly Haven: 1K JPG colour and normal maps, about 9 MB in `public/tex/`.
- Each photo is a detail layer over the hand-picked vertex colours, so seasons, snow and the palette stay in control.
- Terrain layers (grass, forest floor, rock, river gravel, mud, dirt) are blended by slope, height, river, paddy and road masks, with two scales to hide tiling. Rock is projected from three sides.
- Buildings use world-space projection so the texture scale holds on every box. Giwa and thatch roofs use their own UVs with normal maps.
- Everything loads in the background and adds no draw calls.
- Known issue: grass streaks slightly on medium slopes.

## Animals
- Horses, water deer, foxes, Jindo dogs and oxen are animated low-poly models (`public/models/animals/`, meshopt-compressed) loaded at boot by `src/animalmodels.js`.
- Each animal has its own animation mixer for walk, trot, gallop, idle, grazing, attack and death.
- Owned horses wear a Joseon-style saddle, blanket, bridle and tassels that move with the gait.
- Other animals still use the procedural sculpted bodies, as does any model that fails to load.

## Your property on the map
- A gold "家" seal floats over your home, a green "貰" over houses you let out, and an orange "工" over houses being built for you. Matching symbols mark them on the minimap.

## Land, houses and money (the village economy)
- **Building plots (택지)** are staked out along the outer roads. A plot's price depends on how close it is to the village and whether there's room for a mansion. Anyone with silver can buy one and build a hut, thatched cottage, tiled house or walled mansion. Construction takes 1–5 days. Scaffolding goes up, and poor labourers are hired at 8 nyang a day, so building money flows down to the poor.
- **Rebuilding in place (증축):** a hut can become a cottage, and a cottage a tiled house, where it stands if there's room. A mansion needs a roomy plot.
- **Demand and supply:**
  - **Who wants a home:** families whose wealth has outgrown their house, crowded young couples, the evicted, and the homeless.
  - **How they get one:** buy an empty house, rebuild in place, or build on a plot. A poor family can always save up and build, so it doesn't need a rich family to fall first.
  - **Prices:** a price index rises when seekers outnumber empty houses and falls when houses stand empty. Investors build houses to let when demand runs hot.
- **Rent:** landlords collect daily rent (about 1.2% of a house's value). After 3 unpaid days the tenants are evicted, unless a gentle landlord relents. Evicted families go to their kin or sleep at the temple.
- **Land (토지) and tenancy (소작):** rich houses own the rice parcels. Landless farmers work them and hand over 30–50% of each day's harvest, depending on the landlord's character. A tenant who saves enough buys a parcel and keeps the whole harvest. Ruined owners sell land cheap.
- **Moneylending (고리대금):** families with no money left borrow 100 at 30% against their house. Default means foreclosure: the lender owns the house and the family pays rent to stay.
- **Inequality:** the Gini coefficient is measured daily. About 0.7 is normal for a Joseon village. Above 0.8 the people's heart sours and the desperate run to the bandits; below 0.6 it warms.
- **Your Land & Housing office** (on your own menu): build to live or to let, rebuild your home, buy empty houses, put houses up for rent, and buy rice land that tenants farm for you. You can also lend to struggling villagers, and forgive or evict your tenants.

## Horses on the road
- Generals, the Chief State Councillor, high ministers, the police chief, mansion heads and some merchants own horses. On a long trip they walk to the horse, mount it and ride. A groom leads a horse home if its owner left it somewhere.
- Royal couriers (파발), travelling merchants and yangban on a journey ride in along the high roads and ride out again.

## Getting around (pathfinding)
- When the straight way is blocked, people plan a real route with A* on a 1 m grid. The grid is built from the obstacle map as it's needed and refreshed whenever a house is built or rebuilt. Open-field walking stays as cheap as before.
- **Stuck detection:** if someone barely moves for 2 seconds, or paces back and forth for 8, they re-plan the route. Anyone wedged inside a wall or a rebuilt house is set free automatically.
- **Escorts:** escorted people start following when you're more than 3 m past their following distance and stop once you're within it, and only re-aim when you have actually moved. They no longer shuffle back and forth.
- Mansion compounds are wide enough to walk round the cook pot and the jar stand.
- **Your own menu has 🧭 "I'm stuck".** It steps you to clear ground and brings any escort or following servant with you.

## Comings and goings
- When houses stand empty and the realm is calm, families arrive from other provinces with their reasons for coming: flood, famine, work, kin. They rent the empty house from its owner or the magistrate, or the wealthy buy it.
- Ruined families with nothing left sometimes load a handcart and leave the valley.

## Officials, offices and elections
- **Court robes (관복):** officials wear robes by grade (green for the junior ranks, blue for the middle ranks, red for the high ministers) with a black gat. Office retinues: the Chief State Councillor (영의정) has two guards, high ministers and the police chief have one each, and the General rides with two.
- **The Chief State Councillor governs every day, according to his character.** A Greedy one skims the treasury and may be exposed. A Gentle or Pious one talks the King into relief or tax cuts. An Ambitious or Cunning one grows his clique and demotes rivals. If you hold the seat, his desk is yours: propose decrees to the King, appoint, purge, send relief inspectors, skim, or convene the court.
- **The police chief (포도대장):** a lazy chief slows the constables and a brave or loyal one speeds them up. As chief you can order a sweep for every outlaw, or take the bribes on your desk.
- **The village assembly (향회)** elects a headman (이장) on day 1 of each season. Votes depend on friendship, honour, fame, clan, a small edge for the incumbent, and bribes, though Loyal and Pious villagers refuse the silver. Stand for office from your own menu. The headman settles quarrels, raises a levy and calls festivals.
- **Status:** villagers bow to rank, honour and fame. Shopkeepers give the great a discount and charge the lowly more. The palace guard turns away anyone without office or a summons.

## Family: help and trouble
- About every other day something happens in your family. **Trouble:** gambling debts, a tavern brawl that ends in jail, an insult to a noble house, silver gone from the family chest, or a scandal. Each comes with choices: pay, refuse, stand by them, or turn them in. **Help:** kin share windfalls, put in a good word at court, nurse the wounded, teach the children, and introduce useful friends. When you are rich, poor relations come knocking.
- **Things you can do for or to kin:** an allowance, a tutor, an apprenticeship, a court recommendation, paying their debts or bail; or take their savings, turn them in, or disown them.
- **Raise the family's standing:** ancestral rites (제사), compiling the family genealogy (족보), and endowing a village school (서당). Your Family standing shows in the head of the household's panel.

## Rise and fall (흥망성쇠)
- Villagers have windfalls (a ginseng cargo, an inheritance, a giant wild root) and ruin (gambling, shipwreck, fire, tax fines).
- **Climbing families** buy silk, a horse, renovations and servants, then move up: into an empty finer house, or by buying out a struggling family, who take their old home. Some purchase a minor court rank (납속). Old yangban sneer, and the generous rich give alms.
- **Falling families** lose things in order: the farmhand, the bondservants, the horse, the silks, then the house. They move down, or creditors seize the house and they stay on as tenants. Fair-weather friends turn away, true friends and rich kinsmen help, and the desperate turn thief. You can help a fallen family, hire them, or ask the newly rich to invest in you.

## Houses, roads and neighbourhoods

Homes now come in four tiers: poor **huts** (움막) with a brushwood lean-to, **thatched cottages** (초가) in brushwood-fenced yards with low clay chimneys and woodpiles, **tiled houses** (기와집) behind dry-stone walls (돌담) with laundry poles, and walled **yangban mansions** (대감댁). A mansion has a raised main hall, plaster walls with tiled coping, a roofed gate and a guardian pine, plus servants and a rich noble family; huts house the poorest. House prices follow the tier.

Roads follow wealth. Dressed flagstone paves the streets where mansions and tiled houses cluster, around the palace and the plaza, with a paved approach to every mansion gate. Middling streets are cobbled, and the poor quarters and country roads are rutted earth tracks with grassy verges.

## The royal treasury and public works

Taxes flow into the royal treasury (국고) every dawn, more under a war levy and more again once a market arcade stands. The King, or any minister of the 6th rank or above, can open the treasury (click the King, or yourself once you hold power) and commission works. Each rises over one to three days on a site chosen near where it belongs, raised by hired villagers who are paid for their labour:

- **Beacon Watchtower (봉수대):** cools tension with every neighbouring realm.
- **Ever-Normal Granary (상평창):** the poor are fed in lean times.
- **Confucian Academy (서원):** children and scholars grow learned.
- **Stone Pagoda (석탑):** the pious are comforted.
- **Market Arcade (시전):** stallholders earn more and taxes rise.
- **Stele of the Founder (기념비):** your house's deeds carved in stone.

The commissioner gains honour and fame. Rulers can also quietly skim the treasury, but a censor may notice, and that costs honour, rank and the people's trust.

## The smithy and the horse-archery course

- **Smithy (대장간), by the market:** buy iron bars (2 per blade), then forge by hand in three stages. Pump the bellows to hold the bloom at welding heat; strike the anvil as the ring closes on the glowing spot (8 strikes); quench at cherry-red. The result is a Crude, Common, Fine or Master blade. A Legendary 명검 needs the steel secret from the story deck. Carry your best blade to hit harder (Fine +12%, Master +25%, Legendary +40%), or sell your work. Smithing skill grows as you forge.
- **Mounted archery (마상궁술), at the stable:** on your own horse, gallop the course past six straw targets on your left and loose as you pass. Each target scores its best arrow (rings 1–10), with a speed bonus for a fast run. Prize money and hunt fame follow, and scoring 50+ earns the name of a true horse-archer. Your best score is kept.

## Games of the village

- **Yut-nori (윷놀이):** click any villager and play for a stake of 5 or 20 nyang. Throw four sticks (do 1, gae 2, geol 3, yut 4, mo 5; yut and mo throw again), move your two pieces round the board, take the corner shortcuts, stack pieces (업기), and capture to throw again. First to bring both pieces home wins the pot.
- **Ssireum (씨름) wrestling:** challenge any villager. Hold Space to grip the satba belt, keep your balance against their shoves with A/D, and press Space to throw them when their balance leaves the green zone. Best of three falls. Strength comes from fitness, sword skill and wrestling experience.
- **The Dano contest:** during the summer (Dano) festival, enter from any villager's menu. Throw three of the valley's strongest men in a row to be crowned champion (천하장사) and lead home the prize bull.

## Archery and conversation

- **Bow (B in warrior mode):** hold the left mouse button to draw and release to loose; right-click cancels. Arrows are real projectiles that drop with gravity: a full draw flies farther and hits harder, the crosshair tightens as you draw, and headshots do double damage. Your archery skill steadies your aim and grows with every hit. It works on horseback too. Shooting an innocent is a crime, and a bystander who steps into your line will take the arrow.
- **Archery contest (활쏘기 대회):** on day 2 of spring and autumn (the martial tournament keeps summer and winter). Each archer looses five arrows at the training-ground target. Villagers are scored by their skill; when your character is in warrior mode, every ring is scored from where your own arrows actually land. Prize: 60 nyang and the title of champion archer.
- **Talk (💬 in the villager menu):** conversation topics that need no API key. Ask how they are (their real mood, moodlets and pressing needs), for news (recent events, whispered vendettas, the rival clan), about their life (job, family, traits, the memory they can't shake), what they think of you (including what they remember about you), what they make of the rival clan (they might hand you evidence), or ask a sweetheart to walk by the river. If they are hungry, tired or lonely, you can do them a favour, and they will remember it. With a Claude API key you can also speak freely in your own words.

## Funerals, vendettas and the almanac

- **Funerals (장례):** when a villager dies, their family and friends gather in undyed hemp. Four bearers carry a painted red-and-blue bier through the village (out by the palace gate if needed) to a south-facing burial hill, with the chief mourner ahead carrying the funeral banner. At the grave they bow and kneel while the mound is raised. Graves persist with a stone tablet and offering table. Anyone can "Pay Respects" there, and villagers sometimes visit on their own. Royals get a state funeral (국장) and a larger tomb. People with few mourners are buried quietly by the temple monks.
- **Vendettas (원수):** a villager who saw a relative or spouse killed may swear vengeance. Fighters hunt the killer down and challenge them; those with money hire a bandit; the poor and weak curse the killer at the shrine and turn their friends against them. Your own household never kills on autopilot: you are told who burns for revenge, and settling it is up to you.
- **Gaze and posture:** heads turn toward conversation partners, opponents and passers-by (villagers glance at you as you walk past), and posture follows mood.
- **Almanac (📅):** each four-day season has a fixed calendar. Day 1 is market day, day 2 the martial tournament, day 3 the seasonal festival (Lantern, Dano, Chuseok or Seollal), and day 4 the civil service exam. On Chuseok and Seollal mornings, families climb the burial hill for ancestral rites. Raids, plots, plagues and wars keep no calendar.

## Memories and soundscape

- Villagers remember what happens to them: kindness, insults, theft, duels, weddings, births, deaths they saw, and who killed their family. Strong memories change how they greet each other. They show in the Self tab and are given to the AI dialogue. Faint memories fade over days, and memories are saved with your game.
- The valley has its own sounds: a river that grows louder as you near it (and goes quiet when frozen), rain on the tiles, crowd murmur in busy places, the temple bell at 06:00 and 18:00, a rooster at dawn, footsteps in warrior mode, and short musical cues for births, weddings, deaths, coronations and declarations of war.

## Menus
- **Click a villager** for social actions.
- **Click a family member** for their menu: talk, court, try for a baby, allowance, tutor and so on. *👤 Control* switches to them; clicking their portrait (top left) also switches.
- **Click yourself, or press ☰ Options in your panel,** for your own options: Land & Housing office, matchmaker, offices you hold, standing for headman, family rites and "I'm stuck".

## Footsteps

Feet used to skate along the ground. Two separate causes, and the fix needed both — which matches the
published practice: IK only grounds a foot vertically, while horizontal sliding comes from the play rate
not matching travel speed.

**1. The stride now comes from distance covered, not elapsed time.** The walk advanced its phase as
`phase += dt * frequency`, with the rate clamped to 0.6–1.4x, so the legs cycled at a rate that had
nothing to do with how fast the body was actually moving — a slow walker's legs ran at the 0.6x floor
regardless. One full cycle now advances the body by exactly one stride
(`4 * legLength * sin(swingAngle)`), measured from the character root rather than from the requested
speed, so someone wedged against a fence stops stepping instead of marching on the spot.

**2. The standing foot is pinned where it landed.** Matching the stride fixes the average, but the leg
swings as a sine while the body travels at a constant rate, so a planted foot still drifted. At
heel-strike the foot's world position is remembered, and for the rest of the stance the leg is bent to
keep reaching it — an analytic two-bone solve (law of cosines) in the character's own sagittal plane,
which is the plane the walk animates in anyway. The correction eases in and out across the stance so
there is no pop at heel-strike or lift-off.

Measured over 24 walking villagers, median drift of the planted foot across one stance:
**14.5 cm → 6.8 cm**. The IK costs **0.057 ms a frame** and runs only on characters inside mid range —
past that nobody can see feet, so it is skipped.

## Taking work unasked

A free-willed member of your household will now accept a task that suits them instead of waiting to be
told. `missions.js` scores every open offer against the person: their life goal, their trade, their
temper and their skills all weight the six fame paths, and they take work on a path that fits. The
innkeeper grandmother takes the ginseng run; the swordsman takes the bounty.

It is gated entirely on the **Free will** switch in that person's panel — turn it off and nobody acts
without you. Only one mission runs at a time, as before, so this can never take one you wanted.
## The court governs itself

`politics.js` had a complete court: an agenda of real questions (a war levy, the grain tax, a new
Confucian academy, watchtowers, an inquiry into a corrupt Chief State Councillor), two cliques with
shifting strength, the King's own leaning, and an `effect` on every item that actually changes the
world. All of it resolved **only inside the player's court-session modal.** A player who never walked
into the throne hall left the kingdom in permanent suspension — the grain tax never moved, no academy
was ever built, no corrupt minister was ever investigated.

The chamber now sits on its own. Each minister of the second rank or above takes a stance from his
clique, his temper and whether he defers to the throne — the loyal and the pious read the King's mood,
the hot-headed and the ambitious vote their own way — and the measure passes or fails on the weighted
tally, with the effect applied either way.

> 조정: "Scholars petition to open a new Confucian academy (서원) at the crown's expense." — the court
> assents. Shin Mu-san spoke against it; Song Ji-tae spoke for it.
> 조정: "The granaries are full. Should the crown lower the grain tax this season?" — the court refuses.

Attending court yourself still matters: your voice is weighed into the same tally alongside theirs,
rather than being the only voice in the room.
## The palace · 宮

`src/palace.js`, with new grounds in `buildings.js`. The palace used to be a gate, a throne hall and two
empty side buildings. The king sat on his throne, four guards stood at the gate, and nothing else about
the place was alive — the grandest building in the valley had less going on inside it than a farmer's hut.

**The inner court (내전)**, laid out as at Gyeongbokgung: behind the throne hall there is now a council
hall where the day's business is done, the king's quarters and the queen's quarters flanking it, a royal
kitchen on one side and an infirmary on the other.

**품계석 — the rank stones.** Two files of them run down the courtyard from the gate to the throne hall.
At the dawn assembly every official walks to the stone of his own grade, the first grade nearest the
throne, so the whole hierarchy of the realm is legible at a glance from the steps.

> 조회: 16 officials stand at their rank stones before the throne hall as the sun comes up.

**The palace household.** Five **궁녀** court ladies who keep the inner court and attend the queen; an
**어의** royal physician who crosses the grounds to treat any of the royal family who is hurt; and a
**사관** court historian who follows the king about and writes down what he does. Ask the historian to
let you read the record and he will show you a line of it — unless you are the King, in which case he
bows low and refuses, exactly as his real counterparts did.

**신문고 — the petition drum**, standing just inside the gate. It is the one place in the palace an
ordinary villager may stand. Anyone ruined, robbed, hungry or wronged with no magistrate to hear them
walks to the palace and strikes it, and the court must answer:

> 🥁 Ahn Jin-ryong strikes the 신문고 at the palace gate. He says he was wronged and no magistrate would
> hear it.
> The petition of Han Mu-gwang was heard: Yi Hyun-gwang grants 38 nyang and orders the matter looked into.

A gentle or pious king grants relief; a greedy one usually does not. Ignoring the drum costs the throne
its standing, and the petitioner goes home with less honour than he came with — *"Nobody came. The drum
is quiet again."* You can take a grievance there yourself, from your own menu, if you hold no rank.

Measured over six days: 9 petitions heard, 1 left unanswered.

**경회루 — the banquet pavilion**, standing on twelve stone pillars out over a walled lotus pond west of
the palace, reached by a stone causeway. The one building in a Joseon palace meant purely for pleasure
and state occasions, and the court uses it:

> 🏮 A banquet at 경회루 — for the crowning of Yi San-gyu. 3 of the court sit out over the water while the
> musicians play.

**Envoys** arrive from Buyeo, Okjeo, the Khitan, Silla, the Jurchen hills or Wa across the water, wait at
the gate with gifts and a letter, and are received in the throne hall. How it goes depends on the King's
temper: a gracious one is left tribute and open roads, a greedy one demands more than they brought and
they leave before the second cup — which costs the throne its standing.

> The envoy of Wa across the water was received with honour. They leave 121 nyang in tribute and a
> promise of open roads.

**A coronation** is now a ceremony rather than a line of text. The new King takes the throne, every
official bows at the stone of his grade, the whole valley feels it, and a banquet follows.

> 👑 Yi San-gyu receives the mandate in the throne hall. 16 officials bow at their rank stones; the drums
> are heard in the village.
## Bug hunt

A systematic sweep for silently-broken code — conditions that can never be true, properties read but
never written, and cross-file contracts that JavaScript swallows. Confirmed and fixed:

**Save corruption.** Upgrading a house that the game itself built (a young couple's hut, anything built
on a plot) deleted the house's *creation* record and replaced it with an "upgrade" record. On reload
there was nothing to recreate it, so the building silently vanished and its residents came back with no
home at all. The creation record is now kept and its tier bumped.

**Inherited rent went to the crown.** My own inheritance system transferred `house.owner` but not
`housing.st.rent[id].owner`, which still named the dead man. That resolves to nobody, so every day's rent
on an inherited let house was quietly paid into the royal treasury — and if the heir moved in, they were
charged rent on their own house.

**The royal guard grew on every load.** `serialize()` saved each guard's `charge` and `official` fields;
`restore()` dropped them. Officials then counted zero existing retinue guards and recruited a whole fresh
retinue on top of the restored one, every single load.

**Corpses never cleaned up.** `funerals.js` skipped assassins and mission NPCs via `d.assassin`,
`d.missionTemp` and `d.isAnimal` — none of which are ever written anywhere. The real flags are
`isAssassin` and `missionSpawn`. Those bodies were given state funerals and exempted from cleanup forever.

**Animals killed by animals stayed alive.** `t.dieAnimal?.()` — a function that does not exist — left the
victim at zero health while its attacker wandered off.

**Bought votes were refunded by the autosave.** `officials.st.bribes` was spent on but never serialized.

**Smaller:** `G.bubbles` should have been `G.ui.bubbles`; society's "what changed yesterday" baseline and
rivalry count were not saved, so nothing that happened across a save was ever reported; the houses'
wedding counter reset each load; a swallowed error in a mission stage's end handler could leave an
escorted villager frozen out of all AI permanently; and three systems wrote a `status()` line the almanac
never asked for.

**Your own house now carries a marker whatever the deed says.** The seal only marked houses you *own*;
a household that starts as tenants had no marker over the one door they most need to find. The roof you
live under now gets a quieter seal (居) when it is not yours.
## The agricultural year

`src/harvest.js`. The valley talked about harvests and never had one. "The rice ripens and the harvest
begins" was a line of seasonal flavour text; the price of rice wandered at random by up to 30% a day
with no reference to anything that had happened; and whether the summer was a drought or a monsoon made
no difference to a single villager's life. There was no granary, no store of food, and no such thing as
a bad year.

Now the valley farms:

- **Rain through spring and summer decides the crop.** Rice wants about a third of the growing season in
  rain. A dry summer cracks the paddies; an endless monsoon lays the rice flat in the water.
- **The farmers and the land worked decide how much there is** — heads and parcels both count.
- **The harvest fills a granary** on the first day of autumn, and the village eats through it for the
  rest of the year.
- **The price of rice follows the store**, not a random walk. A full granary makes rice cheap; an empty
  one triples it.
- **A bad year bites.** Once the store falls under half what the year needs, hunger falls hardest on
  those who cannot buy their way out of it, patience with whoever rules runs out, and the headman starts
  losing the honour he was elected on.
- **And someone may open their stores.** The headman, the king, or simply a rich villager with a
  conscience buys rice for the village — which becomes news, and is remembered. You can do it yourself
  from your own menu when the valley is hungry.

> 🌾 Year 1: a fair harvest. The weather held. 236 sacks are in the granary — 193% of what the valley
> needs to see the year out.
> 🍚 Yi Ji-dong opened his stores and bought 40 sacks for the village. There was a queue at the gate
> before dawn.

### A correction: the season bug I reported was not real

While building this I reported that `env.season` was never defined and that eight files had been
branching on a permanent "autumn" for the life of the project. **That was wrong, and the fix I shipped
for it was actively harmful.**

`env.season` is assigned every frame by `Seasons.update()` (`season.js:73`). It was always working. My
test harness drives `G.update()` directly in a loop to fast-forward days, which bypasses the main loop's
separate `G.seasons.update(...)` call — and the browser pane I measure in throttles `requestAnimationFrame`
to nothing when it is not on screen, so the real loop was not running either. `env.season` read as
undefined because of how I was measuring, not because of the code.

The "fix" — defining `env.season` as a getter — made `season.js:73`'s assignment throw, because ES
modules are strict. That silently killed the rest of `Seasons.update()`: **snow accumulation, water
freezing over in deep winter, the seasonal shader weights and the daily seasonal moods**. A real
regression, introduced to fix an imaginary one. It is reverted, and `main.js` now carries a comment
warning against doing it again.

The lesson, recorded because it cost real work: a harness that drives subsystems directly is not the
game, and a value that looks undefined may just be one the loop had not set yet.

## What a life leaves behind

`src/inheritance.js`. Death used to destroy property. When a villager died the only thing that happened
was their name being struck from the house's resident list — their coins, the house they owned, their
rice land, their market stall and their horse all simply ceased to exist. A great house's entire fortune
evaporated the moment its head died, which meant the clan standing in `houses.js` could only ever be
built up, never passed on, and no villager was ever made by an inheritance or ruined by missing one.

An estate is now settled roughly as it was in later Joseon:

1. **Debts first.** If the estate cannot cover them, the creditor takes the roof.
2. **The widow is provided for** — 30% of the cash, before anything is divided.
3. **The eldest son takes a double portion and the family roof**, because the ancestral rites fall to
   him; the other sons take single portions and daughters a half portion. Verified: a 1,200 nyang estate
   between two sons gives 800 and 400, with the house and all four parcels of land to the elder.
4. **Failing children** it passes to the widow, then to brothers and sisters, then to the senior of the
   surname.
5. **Failing everyone**, the name dies out and the crown sells what is left.

> The estate of Yu Hun-seok — 1634 nyang all told — passes to Yu Ye-sun.
> Nam Ji-mu died with no one to inherit. The Nam name ends, and the crown will sell what is left.

Brothers do not always take the division well: a large estate split between several sons can leave the
younger ones convinced they were cheated, which costs the eldest dearly in the family. And coming into
money is reason to want something new of life — an heir who inherits well drops their old ambition and
picks another.

Click anyone to see what they would leave and to whom.

**A conflict worth recording:** `housing.js` already moved rice land on death, to `children[0]` — the
*first* child, not the principal heir. With both systems running, the house went to the eldest son and
the land to whichever child happened to be first in the array. Housing now defers to inheritance when it
is present, so the whole estate passes together, and keeps its own fallback for when it is not.

Measured over seven days of ordinary play: **18 estates settled, 5,920 nyang passed down, one name died
out.**
## Houses — 가문

`src/houses.js`. The valley had rivalry of two kinds and both were about the player: `rivals.js` gives
the player's household one scheming enemy clan, and `memories.js` gives individuals a blood-debt to
brood over. Between ordinary families there was nothing — a man could be robbed by his neighbour and his
brothers would greet the thief warmly the next morning, because a wrong was only ever a number between
two people.

A **house** is everyone in the village sharing a surname. Houses have standing of their own, computed
each morning from their members' honour, court rank, wealth, reputation and shame — so you can see at a
glance that the Hong are the first house in the valley and who is the poorest. Click anyone to see their
house, its rank, who it is at odds with and who it is bound to.

**Wrongs become collective.** A theft, a duel, an unlawful killing against one member is a grievance of
the whole house, and when it passes the threshold the two houses are at **feud**:

> ⚔ The Baek house and the Oh house are at odds over thieving — Oh Tae-gang and Baek Ye-wol. Neither
> will sit at the other's table.

Declaring a feud drops every relationship across both houses — in one test, 54 pairs fell from +0.8 to
−26 at a stroke. After that, members who have never met cut each other dead in the street
(*"We have nothing to say."*), turn away when they pass (*"Turning away from a Baek"*), refuse to court
across the quarrel, and their young men come to blows with fists.

**Feuds end** three ways: time wears them down; an elder pays **80 nyang in compensation**; or — far
better, and how such things were actually settled — the houses marry into each other:

> 🕊 The Jo and Kim houses have made their peace — the marriage of Jo Mi-ok and Kim Woo-hun. Old men on
> both sides say it was time.

A marriage also makes the two houses **allies**, who forgive each other far more readily thereafter.
You can step in yourself: click a member of a house yours is feuding with to pay the price of peace.

Tuned against measurement rather than taste. At a threshold of 55 with a 1.2/day decay, seven days of
ordinary village life left the worst grudge at 43 and no feud ever formed; at 48 with two thefts
weighing 26 each, the same week produced two live feuds. A feud is heavy — it should be something you
see, and still something that matters when you do.
## What the village knows about you

`src/society.js`. Gossip already existed as a conversation kind, but it was scenery: it picked a random
person the speaker happened to know, said a canned line, and docked the listener's opinion by four
points. Nothing true ever travelled, and nobody's standing was the product of what they had actually
done.

**News is real now.** Notable things — a rise in fortune, a ruin, a wedding, a birth, a theft, a
promotion, a new stall, a bought freedom, an outlawing, a killing — become items of news attached to the
person they are about. People carry up to ten things they have heard, pass them on when they gossip, and
think better or worse of the subject for it. When two villagers talk, one really does tell the other
something that happened, to someone who had not heard it yet.

So **reputation is emergent**: it is the average of what the valley has heard about you, and how far it
has spread — not a number any code sets. Click anyone to see where they stand (*well spoken of* down to
*badly spoken of*) and how many people have heard something about them.

Society watches the valley each morning and notices what changed, rather than asking every other system
to announce itself — so a villager who quietly bought a stall yesterday is being talked about today.

One thing worth getting right: a constable who cuts down a bandit has done his job. Killings are only
blackening when they are unlawful; a lawful killing of an outlaw is *creditable*. Before that
distinction, five days of raids branded every soldier in the valley a murderer — 18 of them.

**Friends** act, too. A villager will cross the valley simply to sit with a friend, and one with
something to spare will press coins into the hand of a friend who has fallen on hard times, unasked.

**Rivals** emerge from ambition. Two people chasing the same scarce prize — the headman's sash, the same
person's hand — come to resent each other, talk each other down when they gossip, and take a rival's
success badly. In one run, four villagers were competing for the sash at once.

### And the valley acts on it

A reputation nobody responds to is just a number, so standing (about -1 to +1, weak until word has
genuinely spread) now changes how people treat you:

- **Greetings.** Someone well spoken of gets a bow from people who owe them none. Someone the valley has
  turned against gets *"Hm."* — and if they are notorious enough and not already a friend, they are cut
  dead and the conversation ends there.
- **Prices.** A trader gives a good price to a name he likes and squeezes one he doesn't. Measured on the
  same farmer with standing varied: rice costs **12 at -1, 10 at 0, 9 at +1**, and sells for more as
  standing rises. This is the quietest consequence and probably the one you feel most often.
- **Distance.** Villagers physically give a wide berth to someone disgraced — *"Keeping clear of
  Gwang-ryong"* — though a friend stays a friend whatever is said.
- **Courtship.** What the valley says about someone counts when a villager sets their heart, and a suitor
  nobody speaks well of has to work harder to be accepted.
- **The election.** The headman vote now weighs what people have heard, alongside honour, friendship,
  surname and bribes.

Charity reaches further than friendship: a villager will help a well-disposed neighbour, not only a close
friend. That threshold matters — at the stricter one, no comfortable villager in the valley happened to
have a poor friend, and the mechanic never once fired.

Cost: the simulation step went from 0.9 ms to about 2.2 ms with ambition, family and society all running,
against roughly 5 ms of rendering — comfortable inside a 60 fps frame, and the quality governor scales
the graphics rather than the simulation on weaker machines.
## Family life

`src/family.js`. Spouses used to be independent atoms who shared an address and a `spouse` pointer and
nothing else. Nothing in `Sim.think()` ever consulted `spouse`, `children`, `parents` or `home`: a
husband was about 1.4x more likely to chat to his wife than to a stranger he liked equally, and only if
she happened to be within 40 metres. The only thing a couple could do *as a couple* was conceive.

Now a marriage has a shape:

- **They share an hour.** Couples (and parents, children and siblings under one roof) seek each other
  out and eat at the family cookpot, sit on the 평상 bench, pray side by side at the shrine, idle in the
  pavilion, share a cup at the jumak, or walk by the water. The partner is *asked*, not commandeered —
  if they are at work or in a fight the invitation quietly comes to nothing.
- **Parents walk small children to the school hall** in the morning.
- **Marriages warm and cool.** Time together warms them; neglect cools them at two points a day. Hunger,
  exhaustion, lost honour, poverty and a hot temper build strain until the couple quarrels, and a gentle
  spouse is the one who makes peace.
- **A marriage left cold becomes estranged** — the wife goes back to her own people, as she might have —
  and can still be mended later, at which point she comes home.
- Click anyone married to see how it stands: *devoted*, *content*, *cool*, *unhappy* or *estranged*, and
  how long since they last shared an hour.

### Villagers can finally have children

The three birth gates were `aliveCount < 105`, `< 110` and `< 105`, but the valley **starts at about
128**, so every one of them was false from the first frame and no villager could ever conceive. Every
child in the game was the player's. Worse, immigration was allowed up to 175, so newcomers pushed the
population *further* from the birth threshold — growth was immigration-only, and immigration structurally
suppressed births.

The cap is now **derived from the houses actually standing** (`G.popCap` in `game.js`: roughly 3–6 souls
per dwelling by tier, plus the palace, barracks, temple and bandit camp — about 176 for a 32-house
valley), and newcomers now stop at the same ceiling births respect. Building more houses genuinely makes
room for more families. Measured over four days: **13 children born, 6 more on the way**, against zero
before.

## Ambition — what a villager is trying to make of their life

`src/ambition.js`. Before this, every NPC ran a pure need-satisfaction loop — eat, sleep, work a shift,
chat, go home — and their station only ever moved when something happened *to* them: a random windfall,
a scripted exam, an inheritance, a system handing out a rank. Nothing in the game ever made a villager
*want* anything, so a farmer with 400 nyang in his chest sat on it forever.

Measured over nine days with 117 adults, before: **three job changes, all scripted** (an exam result, a
royal succession, a freed servant), **nobody bought a house, nobody opened a shop** — while the median
fortune grew sixfold and was never spent. After, over the same span: **12 job changes, 8 new market
stalls, 4 villagers into houses of their own, 2 bondservants who bought their freedom, 14 marriages that
began as courtship**, and 22 ambitions reached against 10 given up.

Each adult outside the player's household now carries an ambition: a goal they chose, a sum they are
saving toward, and actions they take to get there.

| Ambition | What they do about it | How it ends |
|---|---|---|
| Open a market stall (장사 밑천) | works extra shifts, saves 200 | buys a stall; a farmer becomes a merchant |
| Own rice land (전답) | works the paddies | buys a parcel off a landowner who needs silver |
| A roof of our own (내 집) | works and saves | buys an empty house, rebuilds a tier up, or buys a plot and hires builders |
| Rise by the classics (과거급제) | walks to the school hall and studies | reaches Scholarship 3, takes up the brush, becomes eligible for the Gwageo |
| Make a name with the sword (무명) | drills at the training posts | reaches Sword 3 and enlists as a soldier or constable |
| Be chosen headman (이장) | works the valley for goodwill, person by person | wins the seasonal election on honour and friendships |
| Win a particular heart (혼약) | courts **one chosen person** over days | proposes when the feeling is mutual |
| Buy my freedom (속량) | keeps back coins from side work | counts 150 nyang into the master's hands |
| Take what the world withheld (밤길) | follows people too closely | turns up respectable, with no one asking where the silver came from |

How it hangs together:
- **`G.simAction(sim)`** (`game.js`) is a new plugin hook, called from `Sim.think()` after the director
  and before the need-scoring loop. The first system to return truthy claims that sim's decision, so a
  villager chasing something acts on it rather than falling back to the utility AI.
- Pursuit never overrides a real need: it stands down when hunger, energy or hygiene drops under 28, and
  outside 06:00–21:00. Villagers only act on it a fraction of the time (more if Ambitious, less if Lazy),
  so they still have ordinary lives.
- Ambitions are **weighted by station and trait** — a bondservant wants freedom above all else, a Greedy
  farmer wants a stall, a Brave young man wants the sword. Only four may campaign for the headmanship at
  once, because there is one sash.
- They **give up**: 45 days without real progress (90 for the headmanship) and they let it go. Courting
  someone who marries another ends it too.
- Those who reach a goal often **take the next rung** — the new scholar keeps studying, the new soldier
  keeps drilling.
- A bondservant is paid nothing at all (`JOBS.servant.pay` is 0) and their labour's fruits go to the
  master, so the goal could never move an inch. Joseon *nobi* could hold property of their own, and that
  is what the trickle of side work represents — and a kind master leaves them more of it.
- Click any villager to see their ambition and how far along they are; the almanac counts how many are
  chasing something, and you can ask them about it or put 40 nyang toward it.

## Performance and battery

### Automatic quality (`src/perf.js`)
The game measures how long its own frames take to build and moves itself up and down a ladder of five
detail levels until they fit the budget, so it adapts to whatever machine opens the page instead of
asking the player to guess a setting.

| Level | Resolution | Shadow map | Bloom | Villagers drawn to | Villagers casting shadows |
|---|---|---|---|---|---|
| Full | 1.5× | 2048 | yes | 170 m | 45 m |
| High | 1.25× | 2048 | yes | 145 m | 38 m |
| Balanced | 1× | 1024 | yes | 115 m | 30 m |
| Smooth | 1× | 1024 | no | 90 m | 22 m |
| Bare | 0.8× | off | no | 70 m | — |

- It aims to finish a frame in **75% of the budget**, so the machine is never pinned at 100% — that
  headroom is what keeps a laptop's fan quiet.
- It drops a level as soon as frames overrun, but only climbs back after 12 quiet seconds, so a calm
  moment in an empty field doesn't promote a machine that will stutter again in the market square.
- Frames are only judged once play has begun, never while the world is still being generated, never in
  a hidden tab, and single stalls over 200 ms are thrown away.
- **⚙ Settings › Graphics** shows the current level and the measured frame time, and can pin a level by
  hand instead of leaving it on Automatic.

### Where the frame time went
Profiling a loaded village (131 villagers) found the cost was almost entirely in draw calls, not in the
simulation — one simulation step costs about **0.9 ms**. Two fixes cut the scene render from
**14.2 ms to 5.0 ms**:
- **Vegetation instancing** (`chunkedInstances`): trees were bucketed into fixed 120 m chunks, which put
  the valley's 2,688 trees out as **560 draw calls** — under five trees each, which defeats instancing
  entirely. Chunk size is now chosen from the density so each draw carries roughly 110 instances, while
  staying fine enough for close, dense things like grass to still cull well. Trees went 560 → 128 draws,
  flowers 90 → 16, pampas 58 → 21.
- **Sub-pixel character parts** (`Character._setTiny`): a villager 50 m away was still issuing a separate
  draw call for every belt loop, shoe, hairpin and topknot — 14 meshes and 20,000 triangles for something
  a few pixels tall. From mid range anything under 150 triangles is hidden, and the head stops casting a
  shadow. A distant villager is now **5 meshes instead of 14**; close up all 18 come back. Character cost
  fell from **8.75 ms to 1.72 ms**.

### Manual settings
- **Frame cap:** 60 fps by default, because a 120 Hz screen would otherwise draw twice as many frames for no visible gain. The game drops to 30 fps on the title screen, while paused, and when the window doesn't have focus.
- **⚙ Settings › Frame rate:** 30 (quiet), 60 (smooth) or unlimited.
- **⚙ Settings › Battery saver:** 30 fps, native resolution, and shadows refreshed every third frame. Best on a laptop.
- A hidden tab or browser pane doesn't render at all.

## Controls
**Camera (overseer)**
- **Trackpad:** two-finger swipe sideways to **turn**, up and down to **tilt**; **pinch** to zoom; click-drag to move the map; **⌥ Option-drag** to turn.
- **Mouse:** drag to move the map, right-drag to turn, wheel to zoom.
- **Keys:** WASD or arrows move · Q / E turn · R / T tilt · Z / X or + / − zoom · F follow the selected person.
- **Camera pad** above the minimap: hold ⟲ ⟳ ▲ ▼ ＋ － to turn, tilt and zoom; ◎ goes back to your character; "Drag: move / turn" switches what a one-finger drag does.
- ⚙ Settings can make the two-finger swipe zoom instead of turn.

**Warrior (V):** move the mouse or swipe to look · pinch to pull the camera in or out · WASD move · LMB slash · R heavy · hold RMB block · Space dodge · T lock-on · E interact or mount.

## Credits
- Ground, roof, wall, timber and stone textures: Poly Haven (polyhaven.com), CC0.
- Animal models: Quaternius (quaternius.com), CC0, via poly.pizza.
- MakeHuman / MPFB2 base mesh, targets, skins, eyes, eyebrows and eyelashes: MakeHuman Community (CC0). https://static.makehumancommunity.org

## Developer notes
- For testing while files are being edited, `npx vite build --outDir charpipe/dist-test` plus the `haeryeong-test` launch config (port 4174) gives a copy that doesn't hot-reload, and its storage is separate from the real game on 5173.
- `?test=1` disables saving, so test sessions never overwrite a real save. Houses built during play are rebuilt from the save in `preRestore`, before villagers' homes are restored.
- AI dialogue defaults to `claude-haiku-5-5`, the cheapest model. You can change it in ⚙ Settings.

- Story cards live in `src/sagas/deck_*.js` (152 cards). Each file is plain data plus functions, using the helper object documented in `src/sagas.js` (`makeCtx`). Add a card by appending an event object; set `chainOnly: true` for follow-ups triggered with `c.chain(id, hours)`.
- Character meshes are sculpted from signed distance fields at load. They are built in parallel Web Workers (`src/charworker.js`, `src/geocache.js`) and cached in the browser's IndexedDB, so the second visit loads in about 2 seconds. **Bump `GEO_VERSION` in `src/charbody.js` whenever you change any sculpt**, or players will keep seeing the old cached meshes.
