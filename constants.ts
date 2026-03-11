
import { BuildingType, ResourceType } from './types';

export const MAP_SIZE = 10400; // Zväčšené z 8000 o 30%
export const VIEW_DISTANCE = 800;
export const PLAYER_SPEED = 120; // Reduced from 180
export const RESOURCE_SPAWN_COUNT = 600;
export const RESOURCE_RESPAWN_THRESHOLD = 0.7;
export const RESOURCE_RESPAWN_INTERVAL = 60;
export const RESOURCE_SAFE_ZONE = 500;

// Konfigurácia ľadu a vody
export const ICE_MELT_THRESHOLD_TEMP = 20; // Teplota (K), pri ktorej sa začne ľad topiť
// 1.0 (plné roztopenie) / 1200 sekúnd (20 minút) = 0.0008333...
export const ICE_MELT_RATE = 0.000833;

export const PLAYER_MAX_HEALTH = 100;
export const COLLISION_DAMAGE_PER_SEC = 25; // Poškodenie za sekundu pri kontakte
export const RAM_DAMAGE_TO_PLAYER = 10;    // Okamžité poškodenie hráča pri úspešnom "prejdení" aliena
export const REPAIR_RATE_PER_SEC = 3.75;    // Rýchlosť opravy v hangári

export const BUILDING_ZONE_RADIUS = 500; // Rádius povoleného stavania okolo rakety

export const CREATURE_COUNT = 100;
export const CREATURE_SPEED = 0.84; // Increased by 20% from 0.7
export const CREATURE_DETECTION_RANGE = 500; // Rádius pre detekciu budov
export const CREATURE_PLAYER_AGGRO_RANGE = 400; // Rádius, kedy alieni začnú útočiť na hráča
export const CREATURE_DAMAGE_RATE = 0.05;
export const LASER_RANGE = 500;
export const LASER_COOLDOWN = 0.8;
export const LASER_ROTATION_SPEED = 1.5; // Reduced from 2.5
export const PROJECTILE_SPEED = 500; // Reduced from 800
// Laserové impulzy sú rýchlejšie

// --- HARVESTER CONFIG ---
export const HARVESTER_SPEED = 40; // Reduced from 60
export const HARVESTER_MINE_TIME = 5.0; // Seconds to mine
export const HARVESTER_CAPACITY = 1; // Currently carries 1 unit at a time

// --- WATER TANKER CONFIG ---
export const TANKER_CAPACITY = 50; // Koľko vody odnesie jedna cisterna
export const WATER_PUMP_CAPACITY = 1000; // Max kapacita budovy
export const TANKER_PUMP_TIME = 8.0; // Čas čerpania vody (sekundy)

// --- SYNTHESIZER CONFIG ---
export const SYNTHESIZER_TIME = 30.0; // Čas premeny zmenený z 5.0 na 30.0 sekúnd

// --- FOG OF WAR CONFIG ---
export const FOG_GRID_SIZE = 12.5; // Zmenšené na 12.5 pre veľmi hladký kruhový tvar
export const FOG_REVEAL_RADIUS = 18; // 18 * 12.5 = 225px polomer okolo hráča (zmenšené na 50%)

export const BUILDING_COSTS: Record<BuildingType, Record<string, number>> = {
  [BuildingType.SOLAR_PANEL]: { [ResourceType.IRON]: 2, [ResourceType.SILICON]: 1 },
  [BuildingType.HEATER]: { [ResourceType.IRON]: 1, [ResourceType.MAGNESIUM]: 1, [ResourceType.SILICON]: 1 },
  [BuildingType.DRILL]: { [ResourceType.IRON]: 2, [ResourceType.TITANIUM]: 1 },
  [BuildingType.VEGETUBE]: { [ResourceType.IRON]: 1, [ResourceType.MAGNESIUM]: 1, [ResourceType.SILICON]: 1 },
  [BuildingType.LASER_TOWER]: { [ResourceType.IRON]: 3, [ResourceType.TITANIUM]: 2, [ResourceType.SILICON]: 2 },
  [BuildingType.REFINERY]: { [ResourceType.IRON]: 4, [ResourceType.TITANIUM]: 3, [ResourceType.SILICON]: 3 },
  [BuildingType.WATER_PUMP]: { [ResourceType.IRON]: 5, [ResourceType.TITANIUM]: 3, [ResourceType.SILICON]: 3 },
  [BuildingType.SYNTHESIZER]: { [ResourceType.IRON]: 3, [ResourceType.SILICON]: 2, [ResourceType.TITANIUM]: 2 },
};

export const BUILDING_STATS: Record<BuildingType, any> = {
  [BuildingType.SOLAR_PANEL]: { power: 10, buildSpeed: 0.05 },
  [BuildingType.HEATER]: { heat: 0.05, heatCap: 10, powerReq: 10, buildSpeed: 0.03 }, // Increased rate slightly, added Cap 10
  [BuildingType.DRILL]: { pressure: 0.03, pressureCap: 5, powerReq: 10, buildSpeed: 0.02 },
  [BuildingType.VEGETUBE]: { oxygen: 0.02, oxygenCap: 10, biomass: 0.01, biomassCap: 5, powerReq: 10, buildSpeed: 0.02 },
  [BuildingType.LASER_TOWER]: { powerReq: 10, buildSpeed: 0.04, attackRange: LASER_RANGE },
  [BuildingType.REFINERY]: { powerReq: 20, buildSpeed: 0.02, heatCap: 2 }, // Small heat by-product? Let's genericize first.
  [BuildingType.WATER_PUMP]: { powerReq: 20, buildSpeed: 0.02, waterStorage: true, pressureCap: 2 }, // Small pressure by-product
  [BuildingType.SYNTHESIZER]: { powerReq: 30, buildSpeed: 0.02, heatCap: 5 },
};

export const UPGRADE_COSTS: Partial<Record<BuildingType, Record<number, Partial<Record<ResourceType, number>>>>> = {
  [BuildingType.SOLAR_PANEL]: {
    2: { [ResourceType.IRON]: 5, [ResourceType.SILICON]: 3 },
  },
};

export const UPGRADE_STATS: Partial<Record<BuildingType, Record<number, any>>> = {
  [BuildingType.SOLAR_PANEL]: {
    2: { power: 25 },
  },
};

export const BUILDING_UNLOCKS = [
  {
    minMissionIndex: 0,
    types: [BuildingType.SOLAR_PANEL, BuildingType.HEATER, BuildingType.DRILL, BuildingType.LASER_TOWER],
  },
  {
    minMissionIndex: 5, // Industrial era start
    types: [BuildingType.REFINERY],
  },
  {
    minMissionIndex: 10, // Hydrological era start
    types: [BuildingType.WATER_PUMP, BuildingType.SYNTHESIZER],
  },
  {
    minMissionIndex: 15, // Atmospheric era start
    types: [BuildingType.VEGETUBE],
  },
];

export const getUnlockedBuildings = (missionIndex: number): BuildingType[] => {
  const unlocked = new Set<BuildingType>();
  for (const entry of BUILDING_UNLOCKS) {
    if (missionIndex >= entry.minMissionIndex) {
      entry.types.forEach(t => unlocked.add(t));
    }
  }
  return Array.from(unlocked);
};

export const TERRAFORM_STAGES = [
  { name: 'Éra Prežitia', ti: 0, color: '#8c4524', description: 'Prvé kroky v nehostinnom svete. Zameraj sa na prežitie a núdzové systémy.' },
  { name: 'Éra Industrializácie', ti: 30, color: '#6e3b20', description: 'Základňa je stabilná. Čas na automatizáciu a masívnu ťažbu surovín.' },
  { name: 'Éra Vody', ti: 300, color: '#4a3828', description: 'Tlak a teplota umožňujú existenciu kvapalnej vody. Čas na prvý dážď.' },
  { name: 'Éra Atmosféry', ti: 1200, color: '#6b4a30', description: 'Vodný cyklus sa rozbieha. Zahusťujeme atmosféru a pripravujeme stabilné klimatické podmienky pre budúci život.' },
  { name: 'Éra Života', ti: 4000, color: '#3d5c3a', description: 'Mars ožíva. Prvé rastliny a ekosystémy začínajú pretvárať svet.' },
  { name: 'Éra Kolonizácie', ti: 8000, color: '#2d5a2a', description: 'Planéta je pripravená. Mars sa stáva druhým domovom ľudstva.' },
];

export const MISSIONS = [
  // --- SURVIVAL ERA ---
  {
    id: 'm1',
    title: 'Čierny Štart',
    description: 'Tvrdo sme dopadli a systémy ledva bežia. Bez energie dlho nevydržíme. Musíme okamžite postaviť solárny panel, ktorý zabezpečí núdzovú prevádzku systémov rakety.',
    goal: 'Aby sme prežili, musíme najprv postaviť Solárny panel, ktorý nám dodá potrebnú elektrinu',
    successMessage: 'Výborne, začalo sa nabíjanie batérií v rakete! Solárne panely pracujú a systém sa za chvíľku reštartuje. Pamätaj však na to, že každá budova ktorú plánuješ postaviť bude potrebovať energiu z jedného ďalšieho solárneho panelu',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.SOLAR_PANEL && b.progress >= 1)
  },
  {
    id: 'm2',
    title: 'Surovinová Núdza',
    description: 'Energia prúdi, no zásoby z modulu sa rýchlo míňajú. Musíš ihneď začať zbierať suroviny z okolia, potrebujeme železo a kremík.',
    goal: 'Prehľadaj okolie a nazbieraj do skladov 10 jednotiek železa a 10 jednotiek kremíka',
    successMessage: 'Skvelá práca! S týmito surovinami môžeme začať budovať základňu a expandovať ďalej.',
    check: (state: any) => state.player.inventory[ResourceType.IRON] >= 10 && state.player.inventory[ResourceType.SILICON] >= 10
  },
  {
    id: 'm3',
    title: 'Mráz Prichádza',
    description: 'Materiál máme, nanešťastie v noci tu mrzne. Potrebujeme ohrievač aby zvýšil teplotu o 5 Kelvinov. Postav ho. Mysli na to, že bude treba tiež postaviť ďalší solárny panel, aby nám nedošla energia.',
    goal: 'Zabezpeč teplo postavením Ohrievača a dosiahni úroveň piatich Kelvinov',
    successMessage: 'Cítiš to teplo? Teplota stúpa a senzory opäť fungujú. Zvládli sme prvú kritickú noc.',
    check: (state: any) => state.stats.temperature >= 5 && state.buildings.some((b: any) => b.type === BuildingType.HEATER && b.progress >= 1)
  },
  {
    id: 'm4',
    title: 'Prvý Kontakt',
    description: 'Zahriali sme sa, no radary niečo zachytili... Podivne malé tvory s ich nebezpečne vyzerajúcimi čeľusťami, ktoré môžu byť hrozbou pre našu malú základňu.',
    goal: 'Vybuduj obrannú Laserovú Vežu! Ale uisti sa, že máš dosť energie ešte predtým ako ju postavíš, aby ti mohla začať ihneď fungovať. Zlikviduj hrozbu piatich votrelcov',
    successMessage: 'Uf, to bolo tesné. Hrozba je zažehnaná a okolie je nateraz čisté. Dobrá muška!',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.LASER_TOWER && b.progress >= 1) && state.enemiesKilled >= 5
  },
  {
    id: 'm5',
    title: 'Signál Stabilizovaný',
    description: 'Votrelci sú preč. Teraz musíme stabilizovať planétu. Jeden ohrievač nestačí.',
    goal: 'Postav ďalšie panely a ohrievače tak, aby sme dosiahli teplotu 10 Kelvinov a atmosferický tlak 20 Pascalov',
    successMessage: 'To je ono. Základňa beží a planéta sa začína meniť. Prechádzame do ďalšej fázy.',
    check: (state: any) => state.stats.temperature >= 10 && state.stats.pressure >= 20
  },

  // --- INDUSTRIAL ERA ---
  {
    id: 'm6',
    title: 'Protokol Automatizácie',
    description: 'Prežili sme úvodnú fázu rastu našej budúcej kolónie! Teraz potrebujeme zautomatizovať zber surovín, aby sme sa mohli zamerať na ďalšie úlohy.',
    goal: 'Postav Rafinériu. Bude treba odhadom 20 kilowattov energie',
    successMessage: 'Rafinéria stojí a začína sa štartovať jej robotická linka! Teraz môžeme spracovávať rudu automaticky. Vitaj v Ére industrializácie našej kolónie!',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.REFINERY && b.progress >= 1)
  },
  {
    id: 'm7',
    title: 'Oceľová Flotila',
    description: 'Spracovanie beží. Každá Rafinéria má vlastného ťažobného drona - Harvester. Potrebujeme ale čo najrýchlejšie zvýšiť ťažbu.',
    goal: 'Rozšír flotilu: Postav druhú Rafinériu a maj aktívnych 2 Harvesterov',
    successMessage: 'Pozri na ne! Drony pracujú dňom i nocou. Tvoja flotila Harvesterov je veľmi produktívna.',
    check: (state: any) => state.harvesters.filter((h: any) => h.type === 'MINER').length >= 2
  },
  {
    id: 'm8',
    title: 'Hĺbkový Vrt',
    description: 'Suroviny pribúdajú do skladov! Seizmologický prieskum objavil pod povrchom planéty ložiská plynu, ktoré nám môžu pomôcť zvýšiť tlak v atmosfére.',
    goal: 'Postav toľko Vrtákov, aby sa nám pomocou nich podarilo zvýšiť atmosférický tlak na 25 Pascalov. Nezabudni pre ich správnu funkciu stavať aj solárne panely',
    successMessage: 'Vrtáky prerazili tvrdú kôru planéty a dostali sa do ložísk plynu! Cítiš tie otrasy? Tlak atmosféry konečne začína stúpať a dosiahol požadovanú hodnotu 25 Pascalov.',
    check: (state: any) => state.stats.pressure >= 25 && state.buildings.some((b: any) => b.type === BuildingType.DRILL && b.progress >= 1)
  },
  {
    id: 'm9',
    title: 'Obranná Línia',
    description: 'Vrtáky svojimi vibráciami lákajú pozornosť všetkých organizmov v okolí a viditeľne sa im naša prítomnosť nepáči. Treba posilniť obranu našej kolónie!',
    goal: 'Ochráň vrtnú zónu postavením ďalšej Laserovej Veže. Nezabudni, že bude potrebovať dosť energie na svoje fungovanie.',
    successMessage: 'Perfektné. Obranný perimeter je zabezpečený. Nech si len skúsia prísť bližšie.',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.LASER_TOWER && b.progress >= 1)
  },
  {
    id: 'm10',
    title: 'Priemyselná Revolúcia',
    description: 'Hrozba je zažehnaná a naša kolónia prosperuje. Teraz musíme sústrediť všetky sily na samotnú planétu. Buduj ďalšie ohrievače a vrtáky, aby sme zvýšili teplotu a tlak na požadovanú úroveň.',
    goal: 'Dosiahni teplotu 100 K a atmosférický tlak 200 Pascalov',
    successMessage: 'Dokázali sme to! Tlak a teplota stúpajú a ľad sa začína topiť. Vstupujeme do novej éry.',
    check: (state: any) => state.stats.temperature >= 100 && state.stats.pressure >= 200
  },

  // --- HYDROLOGICAL ERA ---
  {
    id: 'm11',
    title: 'Bod Topenia',
    description: 'Tlak a teplota už prekročili bod mrazu, čo znamená, že ľad sa začína topiť. Musíme lokalizovať zdroj kvapalnej vody. Použi rover a nájdi zatopený kráter.',
    goal: 'Preskúmaj mapu a objav Kráter so zásobami vody',
    successMessage: 'Našli sme ju! Kvapalná voda. Skutočné marťanské jazero. To je pohľad, na ktorý sme čakali.',
    check: (state: any) => state.envFeatures.some((f: any) => f.type === 'crater' && f.hasIce && (f.meltProgress || 0) > 0.1 && state.exploredChunks[`${Math.floor(f.x / FOG_GRID_SIZE)}_${Math.floor(f.y / FOG_GRID_SIZE)}`])
  },
  {
    id: 'm12',
    title: 'Vodná Logistika',
    description: 'Zdroj vody je potvrdený. Teraz musíme vybudovať infraštruktúru na jej ťažbu. Vodné Čerpadlo je energeticky náročné zariadenie (20 kW), preto sa uisti, že naša sieť zvládne túto záťaž.',
    goal: 'Postav Vodné Čerpadlo pri kráteri, kde sme našli ložiská ľadu',
    successMessage: 'Čerpadlo je online a voda prúdi potrubím. Počuješ ten zvuk? To je zvuk života, ktorý sa vracia na túto planétu.',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.WATER_PUMP && b.progress >= 1)
  },
  {
    id: 'm13',
    title: 'Aquifer',
    description: 'Voda prúdi do systému. Teraz musíme zabezpečiť jej distribúciu a skladovanie. Vyšli autonómne tankery a naplň nádrže čerpadla. Potrebujeme vytvoriť strategickú zásobu vody.',
    goal: 'Naplň cisterny a uskladni 500 jednotiek vody v Čerpadle',
    successMessage: 'Nádrže sú plné po okraj! S takýmto množstvom vody môžeme začať s pokročilými procesmi terraformácie.',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.WATER_PUMP && (b.storedWater || 0) >= 500)
  },
  {
    id: 'm14',
    title: 'Syntéza Hmoty',
    description: 'Disponujeme obrovskými zásobami vody, čo nám umožňuje nasadiť špičkovú technológiu. Molekulárny Syntetizátor dokáže transmutovať hmotu, no jeho prevádzka vyžaduje až 30 kW energie. Uisti sa, že máme dostatočný prebytok.',
    goal: 'Postav Molekulárny Syntetizátor pre pokročilú výrobu materiálov',
    successMessage: 'Syntetizátor je online a molekulárna rekonfigurácia prebieha úspešne. Otvárajú sa nám dvere k neobmedzeným materiálovým možnostiam.',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.SYNTHESIZER && b.progress >= 1)
  },
  {
    id: 'm15',
    title: 'Prvé Jazerá',
    description: 'Materiálová kríza je zažehnaná. Voda stúpa a začína vypĺňať údolia a krátery. Pokračuj v otepľovaní planéty, aby sa kvapalná voda udržala stabilne na povrchu.',
    goal: 'Zavlaž planétu a zvýš úroveň Terraformácie na 1 200',
    successMessage: 'Úroveň 1200! Na povrchu sa drží tekutá voda. Hydrosféra je stabilná. Teraz sa môžeme sústrediť na atmosféru.',
    check: (state: any) => (state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass) >= 1200
  },

  // --- ATMOSPHERIC ERA ---
  {
    id: 'm16',
    title: 'Skleníkový Efekt',
    description: 'Voda je dostupná, no atmosféra je stále riedka. Potrebujeme vytvoriť kontrolované prostredie pre prvé rastliny. Budeme musieť postaviť Skleník, ktorý vytvorí vyvážené a bezpečné podmienky.',
    goal: 'Naštartuj biologické procesy postavením Skleníka',
    successMessage: 'Vidíš tú zeleň? Prvý skleník funguje a rastliny začínajú produkovať kyslík. Konečne niečo živé!',
    check: (state: any) => state.buildings.some((b: any) => b.type === BuildingType.VEGETUBE && b.progress >= 1)
  },
  {
    id: 'm17',
    title: 'Fotosyntéza',
    description: 'Prvá zeleň sa ujala a riasy už pracujú, no to stále nestačí. Musíme výrazne zvýšiť hladinu kyslíka v atmosfére, ak sa tu chceme niekedy prechádzať bez skafandrov.',
    goal: 'Zvýš počet rastlín a dosiahni hladinu kyslíka aspoň 500 jednotiek',
    successMessage: 'Kyslík dosiahol 500 jednotiek! Vzduch začína byť redší, ale už začína pripomínať ten domáci. Dobrá práca.',
    check: (state: any) => state.stats.oxygen >= 500
  },
  {
    id: 'm18',
    title: 'Energetická Kríza',
    description: 'Atmosféra sa zlepšuje, no naša spotreba energie rastie. Každý nový stroj a rafinéria zaťažujú sieť. Musíme si vytvoriť energetickú rezervu rozšírením solárneho poľa.',
    goal: 'Stabilizuj energetickú sieť: Maj funkčné aspoň 3 Solárne Panely',
    successMessage: 'Svetlá opäť svietia naplno. Sieť je stabilná a máme dosť šťavy pre ďalšie stroje.',
    check: (state: any) => state.buildings.filter((b: any) => b.type === BuildingType.SOLAR_PANEL && b.progress >= 1).length >= 3
  },
  {
    id: 'm19',
    title: 'Hrozba z Nebies',
    description: 'Sieť je stabilizovaná, no senzory detegovali prítomnosť Heavy Votrelcov. Tieto odolné formy života budú vyžadovať silnejšiu obranu. Uisti sa, že máme dostatok energie a posilni obranu základne.',
    goal: 'Zabezpeč obranu základne vybudovaním aspoň dvoch Laserových Veží',
    successMessage: 'Tak, teraz sme pripravení. Nech si len skúsia zaútočiť proti takejto palebnej sile.',
    check: (state: any) => state.buildings.filter((b: any) => b.type === BuildingType.LASER_TOWER && b.progress >= 1).length >= 2
  },
  {
    id: 'm20',
    title: 'Modré Nebo',
    description: 'Útok sme úspešne odrazili. Keď sa pozrieš hore, uvidíš, že obloha už nie je čierna, ale začína modrať. Sme veľmi blízko k dokončeniu tejto fázy. Pokračuj v terraformácii.',
    goal: 'Dokonči atmosférickú fázu a zvýš úroveň Terraformácie na 4 000',
    successMessage: 'Úroveň 4000! Vidíš tú oblohu? Je modrá! Dokázali sme to... teraz prichádza život.',
    check: (state: any) => (state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass) >= 4000
  },

  // --- BIOSPHERE ERA ---
  {
    id: 'm21',
    title: 'Masívne Zalesňovanie',
    description: 'Máme stabilnú atmosféru aj hydrosféru. Teraz prichádza na rad biosféra. Lokálne experimenty nestačia, musíme začať s masívnou výsadbou. Vybuduj komplex skleníkov na naštartovanie ekosystému.',
    goal: 'Vytvor lesný ekosystém a maj rozmiestnené aspoň tri Skleníky',
    successMessage: 'Výsadba je úspešná. Prvé lesné porasty sa začínajú šíriť krajinou. Ekosystém začína vykazovať známky sebestačnosti.',
    check: (state: any) => state.buildings.filter((b: any) => b.type === BuildingType.VEGETUBE && b.progress >= 1).length >= 3
  },
  {
    id: 'm22',
    title: 'Terraformačný Vrchol',
    description: 'Vegetácia sa ujala, no pre plnohodnotnú biosféru potrebujeme dosiahnuť kritické množstvo biomasy. Zvýš produkciu na maximum, aby sa cyklus života stal nezvratným.',
    goal: 'Maximalizuj rast rastlín a dosiahni celkovú biomasu 2 000g',
    check: (state: any) => state.stats.biomass >= 2000,
    overrideGoalText: 'Dosiahni 2 000g Biomasy pre stabilizáciu biosféry',
    successMessage: 'Dosiahli sme kritický bod biomasy! Biosféra je stabilizovaná a planéta začína dýchať vlastným rytmom. Neuveriteľný úspech.'
  },
  {
    id: 'm23',
    title: 'Pevnosť Mars',
    description: 'Biosféra prospieva, čo žiaľ vyvolalo agresívnu reakciu miestnych foriem života. Predpokladáme masívny útok na naše pozície. Musíme opevniť základňu a zabezpečiť naše dielo.',
    goal: 'Priprav pevnosť na masívny útok a rozmiestni aspoň päť Laserových Veží',
    successMessage: 'Obranný perimeter drží. Naša sieť veží vytvorila nepreniknuteľný štít. Základňa je v bezpečí.',
    check: (state: any) => state.buildings.filter((b: any) => b.type === BuildingType.LASER_TOWER && b.progress >= 1).length >= 5
  },
  {
    id: 'm24',
    title: 'Zásobáreň',
    description: 'Bezpečnosť je zaistená. Blíži sa čas príchodu prvých kolonistov. Budeme potrebovať vybudovať ubytovacie kapacity a infraštruktúru, na čo je nevyhnutný Titán. Zabezpeč dostatočné zásoby.',
    goal: 'Priprav zásoby pre kolonistov a nazbieraj 50 Titánu',
    successMessage: 'Sklady sú naplnené. Máme dostatok titánu na vybudovanie prvého marťanského mesta.',
    check: (state: any) => state.player.inventory[ResourceType.TITANIUM] >= 50
  },
  {
    id: 'm25',
    title: 'Rajská Záhrada',
    description: 'Máme atmosféru, vodu, biosféru aj materiály. Sme vo finále. Stabilizuj všetky planetárne systémy a priprav Mars na príchod ľudstva.',
    goal: 'Zavŕš proces oživovania planéty a zvýš úroveň Terraformácie na 8 000',
    successMessage: 'Úroveň 8000 dosiahnutá! Dokázali sme to. Planéta je oficiálne terraformovaná a pripravená na život. Začína Éra Kolonizácie!',
    check: (state: any) => (state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass) >= 8000
  },

  // --- COLONIZATION ERA ---
  {
    id: 'm26',
    title: 'Maják Nádeje',
    description: 'Všetky systémy sú pripravené. Nastal čas kontaktovať Zem a oznámiť im, že Mars je pripravený na osídlenie. Potrebujeme značné množstvo kremíka na vybudovanie kvantového vysielača.',
    goal: 'Vybuduj vysielač a nazbieraj 100 Kremíka na kontaktovanie Zeme',
    successMessage: 'Spojenie so Zemou nadviazané! Hlásenie bolo prijaté s nadšením. Kolonizačná flotila "Artemis" práve zahájila sekvenciu štartu.',
    check: (state: any) => state.player.inventory[ResourceType.SILICON] >= 100
  },
  {
    id: 'm27',
    title: 'Príletový Vektor',
    description: 'Zem potvrdila ETA: 4 hodiny. Loď Artemis už vstupuje do orbity! Musíme pripraviť navádzacie systémy pre bezpečné pristátie. Aktivuj sieť solárnych panelov, ktoré poslúžia ako navádzacie majáky.',
    goal: 'Zničte 5 alienov (akumulované / simulované)', // Can't track kills easily. Check simplified condition: Surplus power for landing lights
    check: (state: any) => state.buildings.filter((b: any) => b.type === BuildingType.SOLAR_PANEL && b.progress >= 1).length >= 8,
    overrideGoalText: 'Vyčisti a osvetli dráhu postavením ôsmich Solárnych panelov',
    successMessage: 'Navádzacie systémy sú aktívne a dráha je plne osvetlená. Artemis zahajuje zostupový manéver. Vitajte doma.'
  },
  {
    id: 'm28',
    title: 'Posledný Vzdor',
    description: 'POPLACH! Vibrácie motorov flotily prebudili prastarého strážcu planéty. Leviatan bol detegovaný a blíži sa k našej pozícii. Toto je boj o všetko! Udržuj obranu, kým loď bezpečne nepristane!',
    goal: 'Preži útok Leviatana (Počkaj 1 minútu / Udrž zdravie)', // Check HP > 50 after some time? Let's keep it simple progression.
    check: (state: any) => state.stats.temperature > 500, // Arbitrary progress check or just next TI step
    overrideGoalText: 'Dosiahni Úroveň 10 000 a preži finálny útok Leviatana',
    successMessage: 'Cieľ eliminovaný! Leviatan padol. Najväčšia hrozba pre kolóniu bola zažehnaná. Cesta pre ľudstvo je voľná.'
  },
  {
    id: 'm29',
    title: 'Stabilizácia',
    description: 'Bitka skončila, obloha je čistá. Loď Artemis prechádza atmosférou. Posledná kontrola systémov – musíme stabilizovať všetky parametre na absolútne maximum pre hladké pristátie.',
    goal: 'Priprav podmienky na pristátie a zvýš úroveň Terraformácie na 12 000',
    successMessage: 'Všetky systémy nominálne. Podmienky na povrchu sú optimálne. Vitajte na Marse, pozemšťania.',
    check: (state: any) => (state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass) >= 12000
  },
  {
    id: 'm30',
    title: 'Nový Začiatok',
    description: 'Toto je ten moment. Roky tvrdej práce, boja a obetí viedli k tomuto okamihu. Prví kolonisti vystupujú na povrch zelenej planéty, ktorú si stvoril. Uži si svoj triumf, veliteľ.',
    goal: 'Privítaj kolonistov a dosiahni Finálnu úroveň 15 000',
    successMessage: 'Gratulujem, veliteľ. Misia splnená. Z mŕtvej skaly si vybudoval nový domov pre ľudstvo. Tvoje meno sa stane legendou.',
    check: (state: any) => (state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass) >= 15000
  }
];
