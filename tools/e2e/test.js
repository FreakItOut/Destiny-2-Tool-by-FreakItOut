// E2E-Test des Inventar-/Loadout-Drawers mit Fake-Inventar.
// Laeuft in Electron (siehe main.js) und schreibt das Ergebnis nach
// window.__INVTEST__.
import { createInventory } from '/renderer/js/inventory.js';
import { createDashboard } from '/renderer/js/dashboard.js';
import { createOverlayLoadouts } from '/renderer/js/overlay-loadouts.js';
import { createOnboarding } from '/renderer/js/onboarding.js';
import { qs, qsa, escapeHtml, deepMerge, toast, initNotificationCenter, isNotificationCenterOpen, closeNotificationCenter, positionFixedTip } from '/renderer/js/ui.js';

// Unerwartete Renderer-Fehler sammeln (Regression: CSS.escape wurde
// durch eine lokale CSS-Konstante überschrieben).
const pageErrors = [];
window.addEventListener('error', (event) => {
  pageErrors.push(String((event && (event.message || (event.error && event.error.message))) || 'Fehler'));
});
window.addEventListener('unhandledrejection', (event) => {
  pageErrors.push('Promise: ' + String((event && event.reason && (event.reason.message || event.reason)) || 'Fehler'));
});

const B = {
  SUBCLASS: 3284755031,
  KINETIC: 1498876634,
  ENERGY: 2465295065,
  POWER: 953998645,
  HELMET: 3448274439,
  ARMS: 3551918588,
  CHEST: 14239492,
  LEGS: 20886954,
  CLASS: 1585787867,
  GHOST: 4023194814,
  EMBLEM: 4274335291,
  SHIP: 284967655,
  SPARROW: 2025709351
};

// Armor 3.0: Waffen, Gesundheit, Klasse, Granate, Super, Nahkampf.
const STATS = [
  [2996146975, 'Waffen'],
  [392767087, 'Gesundheit'],
  [1943323491, 'Klasse'],
  [1735777505, 'Granate'],
  [144602215, 'Super'],
  [4244567218, 'Nahkampf']
];

function statList(values) {
  return STATS.map(([hash, label], i) => ({ hash, label, value: values[i] }));
}

function item(o) {
  return {
    hash: o.hash,
    instanceId: o.instanceId,
    name: o.name,
    typeName: o.typeName || 'Test',
    icon: '/common/destiny2_content/icons/test.png',
    rarity: o.rarity || 5,
    bucket: o.bucket,
    classType: o.classType == null ? 0 : o.classType,
    stats: o.stats || [],
    perks: o.perks || [],
    socketColumns: o.socketColumns || [],
    modSockets: o.modSockets || [],
    power: o.power || 1900,
    godRoll: Boolean(o.godRoll),
    godNotes: o.godNotes || '',
    godOptions: o.godOptions || [],
    godTags: o.godTags || [],
    equippable: true,
    element: o.element || 0,
    elementIcon: o.elementIcon || '',
    gearTier: o.gearTier || 0,
    baseStats: o.baseStats || {},
    statTotal: o.statTotal || 0,
    archetype: o.archetype || null,
    tertiaryStat: o.tertiaryStat || null,
    tunedStat: o.tunedStat || null,
    setInfo: o.setInfo || null
  };
}

const subclass = item({ hash: 1001, instanceId: 'i-sub', name: 'Prismatische Titanin', bucket: B.SUBCLASS, typeName: 'Unterklasse', classType: 3 });
const weapon = (hash, id, name, bucket) => item({ hash, instanceId: id, name, bucket, power: 1900 });
const armor = (hash, id, name, bucket, values) => item({
  hash,
  instanceId: id,
  name,
  bucket,
  stats: statList(values),
  baseStats: Object.fromEntries(STATS.map(([statHash], index) => [statHash, values[index]])),
  statTotal: values.reduce((sum, value) => sum + value, 0),
  power: 1900
});

const equipped = {
  c1: [
    subclass,
    weapon(3001, 'i-k', 'Testgewehr', B.KINETIC),
    weapon(3002, 'i-e', 'Testpuls', B.ENERGY),
    weapon(3003, 'i-p', 'Testrakete', B.POWER),
    armor(2001, 'i-helm', 'Testhelm', B.HELMET, [12, 18, 10, 8, 6, 4]),
    armor(2002, 'i-arms', 'Testarme', B.ARMS, [10, 14, 12, 9, 7, 5]),
    armor(2003, 'i-chest', 'Testbrust', B.CHEST, [8, 20, 9, 7, 6, 6]),
    armor(2004, 'i-legs', 'Testbeine', B.LEGS, [14, 12, 11, 6, 8, 7]),
    armor(2005, 'i-class', 'Testklasse', B.CLASS, [9, 16, 13, 5, 9, 8]),
    item({ hash: 4001, instanceId: 'i-ghost', name: 'Testgeist', bucket: B.GHOST }),
    item({ hash: 4002, instanceId: 'i-emblem', name: 'Testemblem', bucket: B.EMBLEM }),
    item({ hash: 4003, instanceId: 'i-ship', name: 'Testschiff', bucket: B.SHIP }),
    item({ hash: 4004, instanceId: 'i-sparrow', name: 'Testsparrow', bucket: B.SPARROW })
  ]
};
// Intrinsische Champion-Fähigkeiten an den ausgerüsteten Waffen.
equipped.c1[1].breakerType = 1;
equipped.c1[2].breakerType = 2;
equipped.c1[3].socketColumns = [{ idx: 0, cat: 'intrinsics', options: [{ hash: 9004, n: 'Mikro-Raketen-Gehäuse', i: '', p: 'intrinsics', selected: true }] }];
equipped.c1[1].perks = [{ n: 'Anti-Barriere', i: '', hash: 9002, idx: 0, breakerType: 1, d: 'Durchschlägt Barrieren von Champions.' }];
equipped.c1[2].perks = [{ n: 'Überladung', i: '', hash: 9003, idx: 0, breakerType: 2, d: 'Betäubt Überladung-Champions.' }];

// Testwaffe mit mehreren Perk-Optionen pro Socket (DIM-Spalten).
const perkWeapon = item({
  hash: 3102,
  instanceId: 'i-perks',
  name: 'Perk-Testwaffe',
  bucket: B.KINETIC,
  typeName: 'Pulvergewehr',
  rarity: 6,
  element: 3,
  godRoll: true,
  godNotes: 'PvE: Vorpal Weapon für Boss-Schaden',
  godOptions: ['Vorpal Weapon'],
  godTags: ['PvE'],
  perks: [
    { n: 'Adaptiver Rahmen', i: '', hash: 6101, idx: 0 },
    { n: 'Kleinkaliber', i: '', hash: 6111, idx: 1 },
    { n: 'Taktisches Magazin', i: '', hash: 6121, idx: 2 },
    { n: 'Vorpal Weapon', i: '', hash: 6131, idx: 3 }
  ],
  socketColumns: [
    { idx: 0, cat: 'intrinsics', options: [
      { hash: 6101, n: 'Adaptiver Rahmen', i: '', p: 'intrinsics', canInsert: true, selected: true, god: false }
    ] },
    { idx: 1, cat: 'barrels', options: [
      { hash: 6111, n: 'Kleinkaliber', i: '', p: 'barrels', canInsert: true, selected: true, god: false },
      { hash: 6112, n: 'Gezogener Lauf', i: '', p: 'barrels', canInsert: true, selected: false, god: true },
      { hash: 6113, n: 'Fester Lauf', i: '', p: 'barrels', canInsert: false, selected: false, god: false }
    ] },
    { idx: 2, cat: 'magazines', options: [
      { hash: 6121, n: 'Taktisches Magazin', i: '', p: 'magazines', canInsert: true, selected: true, god: false },
      { hash: 6122, n: 'Grosskaliber-Magazin', i: '', p: 'magazines', canInsert: true, selected: false, god: false }
    ] },
    { idx: 3, cat: 'weapon_perks', options: [
      { hash: 6131, n: 'Vorpal Weapon', i: '', p: 'weapon_perks', canInsert: true, selected: true, god: true, enh: true, d: 'Erhöht den Schaden gegen mächtige Ziele (Bosse, Champions und Mini-Bosse).' },
      { hash: 6132, n: 'Rampage', i: '', p: 'weapon_perks', canInsert: true, selected: false, god: false, d: 'Todesstöße erhöhen kurzzeitig den Schaden.' }
    ] }
  ],
  modSockets: [
    { idx: 4, hash: 6201, n: 'Waffenmod', i: '', p: 'v400.weapon.mod_guns', d: 'Verbesserte Werte für diese Waffe.' },
    { idx: 5, hash: 6202, n: 'Shader', i: '', p: 'shader', d: 'Ändert das Aussehen der Waffe.' }
  ]
});

const backpack = {
  c1: [
    armor(2101, 'i-helm2', 'Gesundheits-Helm', B.HELMET, [4, 30, 8, 6, 4, 4]),
    armor(2102, 'i-arms2', 'Granaten-Arme', B.ARMS, [6, 10, 8, 26, 4, 6]),
    armor(2103, 'i-chest2', 'Klassen-Brust', B.CHEST, [6, 20, 28, 8, 4, 6]),
    armor(2104, 'i-legs2', 'Nahkampf-Beine', B.LEGS, [8, 10, 8, 4, 6, 28]),
    armor(2105, 'i-class2', 'Super-Klasse', B.CLASS, [6, 10, 8, 6, 28, 4]),
    item({
      hash: 2106,
      instanceId: 'i-armor3',
      name: 'Armor-3.0-Test',
      bucket: B.HELMET,
      typeName: 'Helm',
      stats: statList([0, 0, 30, 25, 0, 20]),
      baseStats: { 2996146975: 0, 392767087: 0, 1943323491: 30, 1735777505: 25, 144602215: 0, 4244567218: 20 },
      statTotal: 75,
      gearTier: 5,
      archetype: { name: 'Test-Archetyp', primary: 1943323491, secondary: 1735777505, primaryLabel: 'Klasse', secondaryLabel: 'Granate' },
      tertiaryStat: { hash: 4244567218, label: 'Nahkampf', value: 20 },
      tunedStat: { hash: 2996146975, label: 'Waffen' },
      setInfo: { hash: 424242, name: 'Test-Set', perks: [{ count: 2, name: '2er-Bonus', description: 'Test 2er' }, { count: 4, name: '4er-Bonus', description: 'Test 4er' }] }
    }),
    perkWeapon,
    // Nicht-Inventar-Buckets (DIM blendet sie im Inventar aus).
    item({ hash: 3301, instanceId: 'i-quest', name: 'Test-Quest', bucket: 1345459588, typeName: 'Quest-Schritt' }),
    item({ hash: 3302, instanceId: 'i-mat', name: 'Test-Material', bucket: 3865314626, typeName: 'Material' }),
    item({ hash: 3303, instanceId: 'i-engram', name: 'Test-Engramm', bucket: 375726501, typeName: 'Engramm' }),
    item({ hash: 3304, instanceId: 'i-currency', name: 'Test-Währung', bucket: 3703306570, typeName: 'Währung' }),
    // Accessoires sind ein echtes Inventar-Bucket (DIM: Inventory).
    item({ hash: 3305, instanceId: 'i-acc', name: 'Test-Accessoire', bucket: 687325600, typeName: 'Accessoires' }),
    // Artefakt (darf nur einmal erscheinen, nicht zusätzlich als Extra-Zeile).
    item({ hash: 3306, instanceId: 'i-art', name: 'Test-Artefakt', bucket: 1506418338, typeName: 'Artefakt' })
  ]
};

backpack.c1[0].modSockets = [{ idx: 0, hash: 5001, n: 'Waffen-Mod', i: '', p: 'enhancements.armor', d: '+10 Waffen', s: [{ h: 2996146975, v: 10 }] }];
const armor3Fixture = backpack.c1.find((entry) => entry.instanceId === 'i-armor3');
if (armor3Fixture) {
  const classStat = armor3Fixture.stats.find((stat) => stat.hash === 1943323491);
  if (classStat) { classStat.base = 25; classStat.mod = 3; classStat.mw = 2; }
  armor3Fixture.baseStatTotal = 70;
  armor3Fixture.baseStats[1943323491] = 25;
}

const mods = [
  { h: 5001, n: 'Waffen-Mod', i: '', p: 'enhancements.armor', d: '+10 Waffen', s: [{ h: 2996146975, v: 10 }] },
  { h: 5002, n: 'Gesundheits-Mod', i: '', p: 'enhancements.armor', d: '+10 Gesundheit', s: [{ h: 392767087, v: 10 }] }
];
const emptyMod = { h: 1980618587, n: 'Leere Mod-Fassung', i: '', p: 'enhancements.armor', d: 'Zurzeit kein Mod ausgewählt.', s: [] };

const subclassPlugs = [
  { idx: 0, plugs: [{ h: 7001, n: 'Hammer des Zorns', i: '', p: 'supers', d: 'Super' }, { h: 7002, n: 'Klinge der Morgenröte', i: '', p: 'supers', d: 'Super' }] },
  { idx: 1, plugs: [{ h: 7101, n: 'Wurfhammer', i: '', p: 'melees', d: 'Nahkampf' }] },
  { idx: 2, plugs: [{ h: 7201, n: 'Thermitgranate', i: '', p: 'grenades', d: 'Granate' }] },
  { idx: 3, plugs: [{ h: 7301, n: 'Bollwerk', i: '', p: 'class_abilities', d: 'Klassen-Fähigkeit' }] },
  { idx: 4, plugs: [{ h: 7401, n: 'Aufladung', i: '', p: 'movement', d: 'Bewegung' }] },
  { idx: 5, plugs: [{ h: 7501, n: 'Inbrunst', i: '', p: 'aspects', d: 'Aspekt' }, { h: 7502, n: 'Ruf der Klinge', i: '', p: 'aspects', d: 'Aspekt' }] },
  { idx: 6, plugs: [{ h: 7601, n: 'Fragment der Wut', i: '', p: 'fragments', d: 'Fragment' }] }
];

const upgradePlugs = [
  { h: 6001, n: 'Rüstung verbessern', i: '', p: 'v460.plugs.armor.masterworks.stat.resilience', d: 'v460 plugs armor masterworks stat resilience', s: [] },
  { h: 6002, n: 'Rüstung verbessern', i: '', p: 'v460.plugs.armor.masterworks.stat.mobility', d: 'v460 plugs armor masterworks stat mobility', s: [] }
];
const artifactPerks = [
  { h: 8001, n: 'Artefakt-Mod: Überladung', i: '', p: 'artifact_perks', d: 'Saison-Perk', s: [] }
];
const sockDefs = {
  1001: subclassPlugs,
  3306: [{ idx: 0, plugs: artifactPerks }],
  2001: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2002: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2003: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2004: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2005: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2101: [{ idx: 0, plugs: [emptyMod, ...mods] }, { idx: 1, plugs: upgradePlugs }],
  2102: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2103: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2104: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }],
  2105: [{ idx: 0, plugs: mods }, { idx: 1, plugs: upgradePlugs }]
};

const payload = {
  ok: true,
  membershipType: 3,
  membershipId: 'm1',
  characters: [{ id: 'c1', classType: 0, raceType: 0, light: 1900, emblemPath: '', emblemBackgroundPath: '', lastPlayed: '2026-11-01T10:00:00Z', stats: { 392767087: 120, 4244567218: 45, 1735777505: 88, 144602215: 60, 1943323491: 72, 2996146975: 105 } }],
  equipped,
  backpack,
  vault: [
    item({ hash: 1002, instanceId: 'i-sub-w', name: 'Prismatische Warlock', bucket: B.SUBCLASS, typeName: 'Unterklasse', classType: 2 }),
    // Viele Tresor-Waffen für den „4 Zeilen + Aufklapper“-Test.
    ...Array.from({ length: 30 }, (_, i) => weapon(4100 + i, `i-vault-${i}`, `Tresor-Waffe ${i}`, B.KINETIC))
  ],
  postmaster: { c1: [] },
  currencies: [],
  materials: [
    { hash: 3155914962, name: 'Glimmer', icon: '', quantity: 123456 },
    { hash: 3853748946, name: 'Verbesserungskern', icon: '', quantity: 42 },
    { hash: 4257549984, name: 'Verbesserungsprisma', icon: '', quantity: 7 }
  ],
  activities: {
    c1: { hash: 1, name: 'Großmeister-Nightfall: Test', modeName: 'Nightfall', startedAt: '2026-11-01T10:05:00Z' }
  },
  craftables: [
    {
      hash: 3102, itemHash: 3103, name: 'Perk-Testwaffe', icon: '', typeName: 'Pulvergewehr',
      slot: 'Energie', ammoType: 'Spezial', damageType: 'Solar', rarity: 5,
      source: 'Saison der Prüfung', sourceGroup: 'Saisons', visible: true, failed: 0,
      pattern: { progress: 2, completion: 5, complete: false },
      deepsight: { progress: 1, completion: 5 }, crafted: null, craftedInstances: []
    },
    {
      hash: 3104, itemHash: 3105, name: 'Raid-Testwaffe', icon: '', typeName: 'Handfeuerwaffe',
      slot: 'Kinetik', ammoType: 'Primär', damageType: 'Kinetik', rarity: 5,
      source: 'Raid: Test-Raid', sourceGroup: 'Raids', visible: true, failed: 0,
      pattern: { progress: 5, completion: 5, complete: true },
      deepsight: null, crafted: null, craftedInstances: []
    },
    {
      hash: 3106, itemHash: 3107, name: 'Geschmiedete Testwaffe', icon: '', typeName: 'Pulvergewehr',
      slot: 'Power', ammoType: 'Schwer', damageType: 'Void', rarity: 5,
      source: 'Saison der Prüfung', sourceGroup: 'Saisons', visible: true, failed: 0,
      pattern: { progress: 5, completion: 5, complete: true },
      deepsight: null,
      crafted: { count: 1, level: 20, levelProgress: 55, masterworked: false },
      craftedInstances: [{ level: 20, levelProgress: 55, masterworked: false }]
    }
  ],
  sockDefs,
  charStatIcons: {},
  wishlist: { loaded: true, count: 1, sources: [] },
  godrolls: 1,
  godrollCount: 1
};

let clipboardText = '';
let inventoryCalls = 0;
let xurOverlayOpened = 0;
let statsHudPayload = null;
let insertPlugCalls = 0;
const api = {
  bungieInventory: async () => { inventoryCalls += 1; return JSON.parse(JSON.stringify(payload)); },
  bungieInventoryCached: async () => JSON.parse(JSON.stringify(payload)),
  bungieOAuthStatus: async () => ({ ok: true, apiKeyStored: true, apiKeyReadable: true, apiKeyLength: 32, loggedIn: true, displayName: 'Hüter#1', publicClient: false, hasClientSecret: true }),
  bungieQueueStatus: async () => ({ requests: 9, rateLimits: 0, waiting: 0 }),
  storageInfo: async () => ({ ok: true, total: 3355443, cache: 3145728, cacheCount: 3, manifest: 2097152, wishlists: 262144, backups: 4096, backupsCount: 1, logs: 1258291, logsCount: 2, snapshot: 512, config: 2048 }),
  bungieConnectionCheck: async () => ({ ok: true, steps: [{ state: 'ok', label: 'Anmeldung', hint: 'gültig' }] }),
  bungieSetApiKey: async () => ({ ok: true }),
  bungieXur: async () => ({
    ok: true,
    active: true,
    vendorName: 'Xûr',
    nextRefreshDate: '',
    sellers: ['Xûr', 'Seltsame Ausrüstungsangebote'],
    items: [
      { hash: 3102, name: 'Perk-Testwaffe', icon: '', typeName: 'Pulvergewehr', rarity: 6, description: 'Testbeschreibung', flavor: 'Testflavor', seller: 'Xûr', quantity: 1, costs: [{ hash: 1, name: 'Legendäre Splitter', icon: '', quantity: 23 }], godRoll: true, godNotes: 'PvE Godroll', betterThanOwned: true, affordable: false, missingCosts: [{ name: 'Legendäre Splitter', quantity: 23 }], stats: [{ hash: 2996146975, value: 42, label: 'Waffen' }], perks: [{ n: 'Testperk', p: 'barrels' }], socketColumns: [{ cat: 'Lauf', options: [{ n: 'Testperk', p: 'barrels', selected: true }, { n: 'Anderer Lauf', p: 'barrels', selected: false }] }] },
      { hash: 3101, name: 'Seltsames Angebot', icon: '', typeName: 'Handfeuerwaffe', rarity: 5, description: 'Weitere Details', flavor: '', seller: 'Seltsame Ausrüstungsangebote', quantity: 1, costs: [{ hash: 1, name: 'Seltsame Münze', icon: '', quantity: 1 }] }
    ],
    fetchedAt: Date.now()
  }),
  bungieMilestones: async () => ({ ok: true, items: [{ name: 'Wochen-Testaktion', quests: 2 }] }),
  bungieNews: async () => ({ ok: true, items: [{ title: 'Test-News', description: 'Test', link: 'https://www.bungie.net/', date: '2026-11-01T10:00:00Z' }] }),
  bungieIngameLoadouts: async () => ({ ok: true, loadouts: { c1: [{ index: 0, itemIds: ['i-helm2'] }] } }),
  bungieEquipIngameLoadout: async () => ({ ok: true }),
  bungieTriumphs: async () => ({
    ok: true,
    score: { active: 12345, lifetime: 23456, legacy: 100 },
    seals: [{ hash: 9500, name: 'Test-Siegel', progress: 4, completion: 5, complete: false }],
    completedSeals: 0,
    roots: [
      {
        hash: 700, title: 'Triumphs', name: 'Triumphe', progress: 5, completion: 10,
        records: [
          { hash: 9001, name: 'Test-Triumph Fast', description: 'Fast geschafft', icon: '', points: 10, progress: 4, completion: 5, complete: false, objectives: [{ description: 'Bosse besiegen', progress: 4, completion: 5, complete: false }], rewards: [{ name: 'Test-Belohnung', icon: '' }], loreHash: 123 },
          { hash: 9002, name: 'Test-Triumph Fertig', description: 'Erledigt', icon: '', points: 5, progress: 1, completion: 1, complete: true, objectives: [], rewards: [], loreHash: 0 }
        ],
        children: [
          { hash: 701, name: 'Welten', progress: 1, completion: 5, complete: false, records: [{ hash: 9003, name: 'Test-Triumph Welten', description: 'Weltenziel', icon: '', points: 0, progress: 1, completion: 5, complete: false, objectives: [], rewards: [], loreHash: 0 }], children: [] }
        ],
        collectibles: []
      },
      {
        hash: 702, title: 'Sammlungen', name: 'Sammlungen', progress: 1, completion: 2,
        records: [], children: [],
        collectibles: [
          { hash: 1, name: 'Test-Sammelstück', icon: '', description: 'Sammlungstest', source: 'Raid: Test', owned: true },
          { hash: 2, name: 'Fehlendes Stück', icon: '', description: '', source: '', owned: false }
        ]
      }
    ]
  }),
  bungieSeasonChallenges: async () => ({ ok: true, seasonName: 'Test-Saison', completed: 1, items: [{ name: 'Saison-Ziel Test', progress: 2, completion: 5, complete: false }] }),
  bungieActivitySummary: async () => {
    const base = new Date();
    const defs = [
      { name: 'Test-Aktivität', mode: 'Nightfall', modeType: 15, modeCategory: 1 },
      { name: 'Test-Raid', mode: 'Raid', modeType: 4, modeCategory: 1, activityType: '608898761' },
      { name: 'Test-Dungeon', mode: 'Dungeon', modeType: 82, modeCategory: 1, activityType: '2889152536' },
      { name: 'Großmeister-Nightfall', mode: 'Nightfall', modeType: 15, modeCategory: 1 },
      { name: 'Test-Nightfall', mode: 'Nightfall', modeType: 15, modeCategory: 1 },
      { name: 'Schmelztiegel', mode: 'Schmelztiegel', modeType: 5, modeCategory: 2 },
      { name: 'Gambit', mode: 'Gambit', modeType: 48, modeCategory: 3 },
      { name: 'Prüfungen', mode: 'Prüfungen', modeType: 84, modeCategory: 2 }
    ];
    const entries = [];
    for (let index = 0; index < 40; index += 1) {
      const def = defs[index % defs.length];
      entries.push({
        activityId: `e2e-act-${index}`,
        ...def,
        date: (() => { const date = new Date(base); date.setDate(date.getDate() - index); return date.toISOString(); })(),
        durationSeconds: 600 + index * 30,
        completed: true,
        kills: 20 + index,
        deaths: 2,
        assists: 5
      });
    }
    return { ok: true, entries };
  },
  bungieCraftables: async () => ({ ok: true, craftables: payload.craftables }),
  actionsRecent: async () => ({ ok: true, items: [{ at: Date.now(), kind: 'transfer', detail: { itemId: 'i-1' } }] }),
  bungieClan: async () => ({ ok: true, clan: { name: 'Test-Clan', motto: 'Hallo', memberCount: 2 }, members: [{ name: 'Hüter#1' }, { name: 'Hüter#2' }] }),
  bungieNightfall: async () => ({ ok: true, activity: 'Nightfall', items: [{ name: 'Nightfall: Test', milestone: 'Nightfall', modifiers: [{ name: 'Legendär', desc: 'Härtere Gegner' }] }] }),
  bungieLootSources: async () => ({
    ok: true,
    groups: [
      { source: 'Raid: Test-Raid', items: [{ hash: 5001, name: 'Test-Beute', icon: '' }, { hash: 5002, name: 'Fehlende Beute', icon: '' }] },
      { source: 'Saison der Prüfung', items: [{ hash: 5003, name: 'Saison-Beute', icon: '' }] },
      { source: 'Nightfall: Test', items: [{ hash: 5004, name: 'Nightfall-Beute', icon: '' }] }
    ],
    redBorder: [{ hash: 9001, name: 'Test-Beute', source: 'Raid: Test-Raid', icon: '', typeName: 'Waffe' }]
  }),
  bungieVendorOffers: async (hash) => {
    if (Number(hash) === 672118013) {
      return {
        ok: true,
        vendorName: 'Banshee-44',
        items: [{ hash: 3001, name: 'Testgewehr', typeName: 'Kinetik', icon: '/common/destiny2_content/icons/test.png', rarity: 5, bucket: 1498876634, costs: [{ hash: 1, name: 'Glimmer', icon: '/common/destiny2_content/icons/test.png', quantity: 25000 }], perks: [{ n: 'Flüchtiger Abschuss', p: 'barrels' }], socketColumns: [{ cat: 'Lauf', options: [{ n: 'Flüchtiger Abschuss', p: 'barrels', selected: true }, { n: 'Kleinkaliber', p: 'barrels', selected: false }] }], stats: [{ hash: 2996146975, value: 80, label: 'Waffen' }] }]
      };
    }
    return { ok: true, items: [] };
  },
  bungieVendors: async () => ({
    ok: true,
    characterId: 'c1',
    characters: [{ id: 'c1', classType: 0, light: 1900 }, { id: 'c2', classType: 1, light: 1890 }],
    fetchedAt: Date.now(),
    groups: [{
      hash: 1,
      name: 'Turm',
      order: 1,
      vendors: [
        {
          hash: 672118013,
          name: 'Banshee-44',
          icon: '/common/destiny2_content/icons/test.png',
          location: 'Die Letzte Stadt, Erde',
          nextRefreshDate: '2030-01-01T12:07:00Z',
          items: [
            { hash: 3001, name: 'Testgewehr', typeName: 'Kinetik', icon: '/common/destiny2_content/icons/test.png', costs: [{ hash: 1, name: 'Glimmer', icon: '/common/destiny2_content/icons/test.png', quantity: 25000 }], categoryName: 'Waffen', purchasable: true, perks: [{ n: 'Flüchtiger Abschuss', i: '', p: 'barrels' }], socketColumns: [{ cat: 'Lauf', options: [{ n: 'Flüchtiger Abschuss', i: '', p: 'barrels', selected: true }, { n: 'Kleinkaliber', i: '', p: 'barrels', selected: false }] }] },
            { hash: 1617663696, name: 'Mehr seltsame Angebote', typeName: 'Gegenstand', icon: '/common/destiny2_content/icons/test.png', costs: [{ hash: 1, name: 'Glimmer', icon: '/common/destiny2_content/icons/test.png', quantity: 1 }], categoryName: 'Angebote', purchasable: true },
            { hash: 3102, name: 'Perk-Testwaffe', typeName: 'Pulvergewehr', icon: '/common/destiny2_content/icons/test.png', costs: [{ hash: 2, name: 'Legendäre Splitter', icon: '/common/destiny2_content/icons/test.png', quantity: 25 }], categoryName: 'Waffen', purchasable: true }
          ],
          currencies: [{ hash: 1, name: 'Glimmer', icon: '/common/destiny2_content/icons/test.png', quantity: 123456 }]
        },
        {
          hash: 350061650,
          name: 'Ada-1',
          icon: '/common/destiny2_content/icons/test.png',
          location: 'Die Letzte Stadt, Erde',
          nextRefreshDate: '2030-01-01T12:07:00Z',
          items: [
            { hash: 3002, name: 'Testpuls', typeName: 'Energie', icon: '/common/destiny2_content/icons/test.png', costs: [{ hash: 2, name: 'Legendäre Splitter', icon: '/common/destiny2_content/icons/test.png', quantity: 10 }], categoryName: 'Fokussierte Dekodierung', purchasable: true }
          ],
          currencies: []
        },
        {
          hash: 537912098,
          name: 'Mehr seltsame Angebote',
          icon: '/common/destiny2_content/icons/test.png',
          location: 'Turm',
          nextRefreshDate: '2030-01-01T12:07:00Z',
          items: [
            { hash: 5001, name: 'Waffen-Mod', typeName: 'Mod', icon: '/common/destiny2_content/icons/test.png', costs: [{ hash: 1, name: 'Glimmer', icon: '/common/destiny2_content/icons/test.png', quantity: 5000 }], categoryName: 'Mods', purchasable: true },
            { hash: 2001, name: 'Händler-Testhelm', typeName: 'Helm', icon: '/common/destiny2_content/icons/test.png', bucket: 3448274439, rarity: 5, costs: [{ hash: 1, name: 'Glimmer', icon: '/common/destiny2_content/icons/test.png', quantity: 7000 }], categoryName: 'Rüstung', purchasable: true, stats: [{ hash: 2996146975, value: 20, label: 'Waffen' }, { hash: 392767087, value: 20, label: 'Gesundheit' }] }
          ],
          currencies: []
        }
      ]
    }]
  }),
  xurOpen: async () => { xurOverlayOpened += 1; return { ok: true, open: true }; },
  statsHudOpen: async (payload) => { statsHudPayload = payload; return { ok: true, open: true }; },
  bungieFarming: async () => { farmCalls += 1; return { ok: true, items: [...payload.backpack.c1, ...(farmExtra ? [farmExtra] : [])] }; },
  bungieTransfer: async () => transferResponse || { ok: true },
  bungieEquip: async () => ({ ok: true }),
  bungieInsertPlug: async () => { insertPlugCalls += 1; return { ok: true }; },
  bungieLock: async () => ({ ok: true }),
  bungieWishlistRefresh: async () => ({ ok: true }),
  bungieItemInfo: async (hashes) => ({ ok: true, items: { '3001': { n: 'Testgewehr', t: 'Kinetik', i: '/common/destiny2_content/icons/test.png', r: 5, b: 1498876634, c: 3, p: '', d: 'Ein Testgewehr mit Beschreibung.', f: 'Flavor-Text', s: [{ h: 155624089, v: 80 }] }, '2101': { n: 'Gesundheits-Helm', t: 'Helm', i: '', b: 3448274439, c: 0, p: '' }, '5001': { n: 'Waffen-Mod', t: 'Mod', i: '/mod.png', b: 0, c: 3, p: 'enhancements.armor', s: [{ h: 2996146975, v: 10 }] }, '1001': { n: 'Prismatische Titanin', t: 'Unterklasse', i: '', b: 3284755031, c: 3, p: '' }, '7001': { n: 'Hammer des Zorns', t: 'Super', i: '/hammer.png', b: 0, c: 3, p: 'supers' }, '9001': { n: 'Test-Artefakt', t: 'Artefakt', i: '/art.png', b: 1506418338, c: 3, p: '' }, '7002': { n: 'Artefakt-Perk', t: 'Perk', i: '/perk.png', b: 0, c: 3, p: 'artifact_perks', d: 'Perk' } } }),
  loadoutsImportLink: async () => ({ ok: true, source: 'dim.gg', loadout: { name: 'DIM-Import', classType: 0, equipped: [{ id: 'i-helm2', hash: 2101 }, { id: 'i-sub', hash: 1001, socketOverrides: { '0': 7001 } }, { id: 'i-art', hash: 9001, socketOverrides: { '0': 7002 } }], parameters: { mods: [5001] } } }),
  bungieWishlistHealth: async () => ({ ok: true, total: 123, sources: [{ url: 'https://example.com/list.txt', label: 'list.txt', count: 123, at: Date.now(), ok: true }] }),
  copyToClipboard: async (text) => { clipboardText = String(text || ''); return { ok: true }; },
  integrationsWeeklyDigest: async () => ({ ok: true, text: 'Digest' }),
  exportDiagnostics: async () => ({ ok: true, path: 'test.json' }),
  readClipboard: async () => ({ ok: true, text: clipboardText }),
  diagnosticCopy: async () => ({ ok: true, text: '{"test":true}' }),
  bungieOAuthStart: async () => ({ ok: true })
};
let farmExtra = null;
let farmCalls = 0;
let transferResponse = null;

let cfg = { bungie: { loadouts: [], itemSort: 'power', favs: {} }, overlay: {} };
const setConfig = (patch) => { cfg = deepMerge(cfg, patch); };

const result = { ok: false, steps: [], errors: [], toasts: [] };

function check(name, condition, detail) {
  result.steps.push({ name, ok: Boolean(condition), detail: detail == null ? '' : String(detail) });
  if (!condition) result.errors.push(name + (detail ? ': ' + detail : ''));
  return Boolean(condition);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    let value = null;
    try { value = fn(); } catch (error) { value = null; }
    if (value) return value;
    await wait(40);
  }
  return null;
}

const drawer = () => document.querySelector('.inv-dw-backdrop:not(.hidden)');
const sheet = () => document.querySelector('.inv-dw-sheet:not(.hidden)');

async function run() {
  // Persistente UI-Zustände aus früheren Läufen zurücksetzen.
  try {
    localStorage.removeItem('d2inv.expandedVaults');
    localStorage.removeItem('d2inv.searchHistory');
    localStorage.removeItem('d2notificationsMuted');
    localStorage.removeItem('d2inv.knownInstances');
  } catch (error) {
    // egal
  }
  const inv = createInventory({
    api,
    qs,
    toast: (message) => { result.toasts.push(String(message)); },
    escapeHtml,
    getCfg: () => cfg,
    setConfig,
    togglePage: () => {}
  });

  inv.open();
  check('Inventar geladen', await until(() => document.querySelector('.dinv-char-head')), document.querySelectorAll('.dinv-char-head').length);
  await wait(250);
  const firstRenderMs = Number(window.__D2_FIRST_RENDER_MS__) || 0;
  const renderBudget = Number(window.__D2_RENDER_BUDGET_MS__) || 3000;
  check('Erster Inventar-Render im Budget', firstRenderMs > 0 && firstRenderMs <= renderBudget, `${firstRenderMs} ms / ${renderBudget} ms`);
  const settingsTitle = document.querySelector('#settingsTitle');
  check('i18n verfügbar', Boolean(window.i18n && window.i18n.translate('Einstellungen') === 'Settings'));
  if (window.i18n && settingsTitle) {
    window.i18n.setLanguage('en');
    await wait(120);
    check('UI-Sprache EN', /Settings/.test(settingsTitle.textContent || ''), settingsTitle.textContent);
    const overflow = [...document.querySelectorAll('.dinv-tab, .btn, .dinv-searchchip')]
      .filter((element) => element.offsetParent !== null && element.scrollWidth > element.clientWidth + 2)
      .map((element) => `${element.className}:${element.textContent.trim().slice(0, 24)}`);
    check('EN: Bedienelemente laufen nicht über', overflow.length === 0, overflow.slice(0, 4).join(' | '));
    window.i18n.setLanguage('de');
    await wait(80);
    check('UI-Sprache DE', /Einstellungen/.test(settingsTitle.textContent || ''), settingsTitle.textContent);
  }
  const sortSelect = document.querySelector('.inventory-sort');
  check('Sortierung um Stat/Tier/Archetyp erweitert', Boolean(sortSelect) && ['stats', 'tier', 'archetype', 'stat:392767087'].every((value) => [...sortSelect.options].some((option) => option.value === value)),
    sortSelect && [...sortSelect.options].map((option) => option.value).join(','));
  const bannerMeter = document.querySelector('.dinv-char-stats .dinv-char-meter');
  check('Charakter-Stats mit 0–200-Balken', Boolean(bannerMeter), bannerMeter && bannerMeter.outerHTML.slice(0, 180));
  check('Charakter-Balken ohne 100er-Marke', Boolean(bannerMeter && !bannerMeter.querySelector('.mark')));
  const bannerBase = bannerMeter && bannerMeter.querySelector('.base');
  const bannerBonus = bannerMeter && bannerMeter.querySelector('.bonus');
  check('Charakter-Balken skaliert auf 200', Boolean(bannerBase && bannerBase.style.width === '60%' && !bannerBonus),
    bannerMeter && bannerMeter.innerHTML.slice(0, 160));
  const firstCharStat = document.querySelector('.dinv-char-stat');
  check('Charakter-Stat nennt Aufschlüsselung', /\/200/.test(firstCharStat?.getAttribute('title') || '') && /Rüstung/.test(firstCharStat?.getAttribute('title') || ''), firstCharStat && firstCharStat.getAttribute('title'));

  document.querySelector('[data-tab="loadouts"]').click();
  check('Loadout-Seite sichtbar', await until(() => document.querySelector('.inv-dw-page-head') && document.querySelector('.inv-dw-page-list')));

  document.querySelector('[data-ed-new]').click();
  check('Drawer offen', await until(() => drawer()));
  const sectionCount = document.querySelectorAll('.inv-dw-backdrop .inv-dw-section').length;
  check('7 Drawer-Sektionen', sectionCount === 7, sectionCount);

  // --- Ruestung: Item-Picker -------------------------------------------
  document.querySelector('[data-dw-slot="' + B.HELMET + '"]').click();
  const helmetPicks = await until(() => {
    const list = document.querySelectorAll('.inv-dw-sheet:not(.hidden) [data-dw-pick]');
    return list.length ? list : null;
  });
  check('Item-Picker zeigt Helme', helmetPicks && helmetPicks.length === 3, helmetPicks && helmetPicks.length);
  helmetPicks[0].click();
  check('Item-Picker schliesst', await until(() => !sheet()));
  const helmetTile = document.querySelector('.inv-dw-armor-slot [data-dw-slot="' + B.HELMET + '"] img');
  check('Helm im Drawer gesetzt', Boolean(helmetTile));

  // --- Hover-Overlay mit Werten und Perks -------------------------------
  const helmetHost = document.querySelector('.inv-dw-armor-slot [data-dw-tip-item]');
  if (helmetHost) helmetHost.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const helmetTip = await until(() => {
    const el = document.querySelector('#inventoryTooltip');
    return el && el.classList.contains('show') && /Testhelm/.test(el.textContent || '') ? el : null;
  });
  check('Overlay zeigt Item-Werte', Boolean(helmetTip && /Gesundheit/.test(helmetTip.textContent || '')), helmetTip && helmetTip.textContent);
  if (helmetHost) helmetHost.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  check('Overlay schliesst', await until(() => !document.querySelector('#inventoryTooltip.show')));

  // --- Fokus: Subklasse + Sockets --------------------------------------
  document.querySelector('[data-dw-slot="' + B.SUBCLASS + '"]').click();
  const subPicks = await until(() => document.querySelectorAll('.inv-dw-sheet:not(.hidden) [data-dw-pick]'));
  check('Subklassen-Picker', Boolean(subPicks && subPicks.length));
  const subPickerText = (document.querySelector('.inv-dw-sheet:not(.hidden)') || {}).textContent || '';
  check('Subklasse nur fuer gewaehlte Klasse', !/Warlock/.test(subPickerText), subPickerText.slice(0, 90));
  subPicks[0].click();
  const subSocks = await until(() => document.querySelectorAll('[data-dw-sub-sock]'));
  check('Subklassen-Sockets sichtbar', subSocks && subSocks.length === 7, subSocks && subSocks.length);
  const aspectSock = await until(() => document.querySelector('[data-dw-sub-sock="5"]'));
  aspectSock.click();
  const aspectPicks = await until(() => document.querySelectorAll('.inv-dw-sheet:not(.hidden) [data-dw-picksub]'));
  check('Aspekt-Picker gefuellt', Boolean(aspectPicks && aspectPicks.length === 2), aspectPicks && aspectPicks.length);
  aspectPicks[0].click();
  check('Aspekt-Sheet schliesst', await until(() => !sheet()));
  const aspectTileLabel = document.querySelector('.inv-dw-focus [data-dw-sub-sock="5"]');
  check('Aspekt gesetzt (Titel)', aspectTileLabel && /Inbrunst/.test(aspectTileLabel.getAttribute('title') || ''), aspectTileLabel && aspectTileLabel.getAttribute('title'));

  // --- Mods: allgemein + socket-spezifisch ------------------------------
  document.querySelector('[data-dw-mods-open]').click();
  const modPicks = await until(() => document.querySelectorAll('.inv-dw-sheet:not(.hidden) [data-dw-pickmod]'));
  check('Mod-Picker gefuellt', Boolean(modPicks && modPicks.length >= 1), modPicks && modPicks.length);
  const modSheetText = () => (document.querySelector('.inv-dw-sheet:not(.hidden)') || {}).textContent || '';
  check('Masterwork-Plugs nicht im Mod-Picker', !/Rüstung verbessern/.test(modSheetText()), modSheetText().slice(0, 80));
  check('Artefakt-Perks nicht im Mod-Picker', !/Artefakt-Mod/.test(modSheetText()), modSheetText().slice(0, 120));
  const modSlotCount = document.querySelectorAll('[data-dw-sock-open]').length;
  check('Nur echte Mod-Slots im Drawer', modSlotCount <= 1, String(modSlotCount));
  modPicks[0].click();
  const finished = await until(() => document.querySelector('.inv-dw-sheet-foot [data-dw-sheet-close]'));
  check('Mod-Picker Fussbutton', Boolean(finished));
  finished.click();
  check('Mod-Picker schliesst', await until(() => !sheet()));

  const sockOpen = await until(() => document.querySelector('[data-dw-sock-open]'));
  check('Mod-Sockets an Ruestung', Boolean(sockOpen));
  sockOpen.click();
  const sockPicks = await until(() => document.querySelectorAll('.inv-dw-sheet:not(.hidden) [data-dw-pickmod]'));
  check('Socket-Mod-Picker', Boolean(sockPicks && sockPicks.length), sockPicks && sockPicks.length);
  sockPicks[0].click();
  document.querySelector('.inv-dw-sheet-head [data-dw-sheet-close]').click();
  const assigned = await until(() => document.querySelector('.inv-dw-mod.assigned'));
  check('Mod als zugewiesen markiert', Boolean(assigned));
  if (assigned) assigned.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const modTip = await until(() => {
    const el = document.querySelector('#inventoryTooltip');
    return el && el.classList.contains('show') && /Mod/.test(el.textContent || '') ? el : null;
  });
  check('Overlay zeigt Mod-Details', Boolean(modTip && /\+10/.test(modTip.textContent || '')), modTip && modTip.textContent);

  // --- Optimierer -------------------------------------------------------
  document.querySelector('[data-dw-optimize]').click();
  const runBtn = await until(() => document.querySelector('[data-dw-opt-run]'));
  check('Optimierer-Sheet offen', Boolean(runBtn));
  runBtn.click();
  const applyBtn = await until(() => document.querySelector('[data-dw-opt-apply]'), 8000);
  check('Optimierer liefert Ergebnis', Boolean(applyBtn));
  if (applyBtn) applyBtn.click();
  check('Optimierer-Sheet schliesst', await until(() => !sheet()));
  const armorSlots = await until(() => {
    const list = document.querySelectorAll('.inv-dw-armor-slot [data-dw-slot] img');
    return list.length >= 5 ? list : null;
  });
  check('Optimierte Ruestung im Drawer', Boolean(armorSlots), armorSlots && armorSlots.length);

  // --- Fuellen + Speichern ---------------------------------------------
  document.querySelector('[data-dw-fill="equipped"]').click();
  const weaponImages = await until(() => {
    const list = document.querySelectorAll('[data-dw-slot="' + B.KINETIC + '"] img, [data-dw-slot="' + B.ENERGY + '"] img, [data-dw-slot="' + B.POWER + '"] img');
    return list.length === 3 ? list : null;
  });
  check('Waffen aufgefuellt', Boolean(weaponImages), weaponImages && weaponImages.length);

  const nameInput = document.querySelector('.inv-dw-name');
  nameInput.value = 'E2E-Loadout';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-dw-save]').click();
  check('Drawer schliesst nach Speichern', await until(() => !drawer()));
  const saved = (cfg.bungie.loadouts || [])[0];
  check('Loadout gespeichert', Boolean(saved), (cfg.bungie.loadouts || []).length);
  check('Loadout-Name', saved && saved.name === 'E2E-Loadout', saved && saved.name);
  check('Items gespeichert (>= 10)', saved && saved.items.length >= 10, saved && saved.items.length);
  check('Mods gespeichert', saved && saved.mods.length === 2, saved && saved.mods.length);
  check('Socket-Zuordnung gespeichert', saved && saved.mods.some((m) => Number(m.sb) === B.HELMET || Number(m.sb) > 0), JSON.stringify((saved && saved.mods || []).map((m) => [m.sb, m.si])));
  check('Fokus-Plogin gespeichert', saved && saved.subclassPlugs.length === 1, saved && saved.subclassPlugs.length);
  check('Loadout-Karte sichtbar', await until(() => document.querySelector('.inv-dw-card')));
  check('Loadout-Karte bietet Bild-Export', Boolean(document.querySelector('[data-loadout-image]')));
  check('Loadout-Karte bietet Teilen-Link', Boolean(document.querySelector('[data-loadout-deeplink]')));
  check('Loadout-Karte bietet Nur-Fehlende', Boolean(document.querySelector('[data-loadout-apply-missing]')));
  check('Loadout-Karte bietet Versionen', Boolean(document.querySelector('[data-loadout-versions]')));
  document.querySelector('[data-loadout-versions]')?.click();
  await wait(80);
  check('Loadout-Versionen öffnen', /Loadout-Versionen/.test(document.body.textContent || ''), 'kein Dialog');
  document.querySelector('[data-versions-close]')?.click();

  // --- Loadout-Warteschlange: Detailpanel und Fehlerbehandlung ----------
  cfg.bungie.loadouts = cfg.bungie.loadouts || [];
  if (!cfg.bungie.loadouts.some((entry) => entry.id === 'lo-queue-test')) {
    cfg.bungie.loadouts.push({ id: 'lo-queue-test', name: 'Queue-Test', classType: 0, characterId: '', items: [], mods: [] });
  }
  inv.renderLoadouts();
  await wait(150);
  inv.queueLoadout('lo-queue-test');
  await wait(300);
  let storedQueue = [];
  try { storedQueue = JSON.parse(localStorage.getItem('d2tool.loadoutQueue') || '[]'); } catch (error) { storedQueue = []; }
  check('Loadout-Warteschlange wird gespeichert', storedQueue.length >= 1, JSON.stringify(storedQueue));
  const queueBar = document.querySelector('#loadoutQueueBar');
  check('Loadout-Warteschlange sichtbar', Boolean(queueBar) && !queueBar.classList.contains('hidden'));
  document.querySelector('#loadoutQueueDetails')?.click();
  await wait(100);
  const queuePanelEl = document.querySelector('#loadoutQueuePanel');
  check('Loadout-Warteschlange Detailpanel offen', Boolean(queuePanelEl) && !queuePanelEl.classList.contains('hidden'));
  const queueRow = queuePanelEl?.querySelector('.loadout-queue-row');
  check('Loadout-Warteschlange listet Eintrag', Boolean(queueRow), queuePanelEl?.textContent?.slice(0, 120));
  check('Loadout-Warteschlange markiert Fehler', Boolean(queueRow?.querySelector('.loadout-queue-state.failed')), queueRow?.textContent);
  const retryBtn = queueRow?.querySelector('[data-loadout-retry]');
  check('Loadout-Warteschlange bietet Wiederholen', Boolean(retryBtn));
  retryBtn?.click();
  await wait(300);
  document.querySelector('#loadoutQueuePanel [data-loadout-remove]')?.click();
  await wait(100);
  check('Loadout-Warteschlange entfernt Eintrag', !document.querySelector('#loadoutQueuePanel .loadout-queue-row'));
  let storedAfter = [];
  try { storedAfter = JSON.parse(localStorage.getItem('d2tool.loadoutQueue') || '[]'); } catch (error) { storedAfter = []; }
  check('Loadout-Warteschlange aus Speicher entfernt', storedAfter.length === 0, JSON.stringify(storedAfter));
  document.querySelector('#loadoutQueueClose')?.click();
  cfg.bungie.loadouts = cfg.bungie.loadouts.filter((entry) => entry.id !== 'lo-queue-test');
  inv.renderLoadouts();

  // --- Bearbeiten (Persistenz) -----------------------------------------
  document.querySelector('[data-loadout-edit]').click();
  check('Drawer erneut offen', await until(() => drawer()));
  const nameAgain = document.querySelector('.inv-dw-name').value;
  check('Name wieder geladen', nameAgain === 'E2E-Loadout', nameAgain);
  const socksAgain = document.querySelectorAll('[data-dw-sub-sock]').length;
  check('Fokus wieder geladen', socksAgain === 7, socksAgain);
  document.querySelector('[data-dw-close]').click();
  check('Drawer schliesst', await until(() => !drawer()));

  // --- Farming-Modus: leichtes Refresh, kein Einfrieren ----------------
  document.querySelector('[data-tab="inventory"]').click();
  await until(() => !document.querySelector('#inventoryBody').classList.contains('hidden'));
  farmExtra = weapon(3101, 'i-farm', 'Farm-Beute', B.KINETIC);
  const farmBtn = document.querySelector('.inv-toolbar-farm');
  check('Farming-Button vorhanden', Boolean(farmBtn));
  if (farmBtn) farmBtn.click();
  const farmed = await until(() => document.querySelector('.dinv-tile[title^="Farm-Beute"]'), 8000);
  check('Farming verschiebt neue Beute', Boolean(farmed));
  if (farmBtn) farmBtn.click();
  await wait(300);
  check('Farming nutzt leichtes Refresh', farmCalls >= 1 && farmCalls <= 2, farmCalls);

  // --- Suche & Filter (DIM-Operatoren) ---------------------------------
  // Suche dimmt nicht passende Items, statt sie zu entfernen – die
  // Kacheln bleiben an ihrem Platz.
  let lastTotalTiles = 0;
  const setSearch = async (value) => {
    const input = document.querySelector('#inventorySearch');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(160);
    const tiles = [...document.querySelectorAll('#inventoryBody .dinv-tile')];
    lastTotalTiles = tiles.length;
    return tiles.filter((tile) => !tile.classList.contains('inv-dim')).length;
  };
  const allTiles = await setSearch('');
  check('Suche: alle Kacheln sichtbar', allTiles > 10, allTiles);
  const inventoryScrollBody = document.querySelector('#inventoryBody');
  inventoryScrollBody.scrollTop = 300;
  const inventoryScrollBefore = inventoryScrollBody.scrollTop;
  window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory' } }));
  await wait(140);
  check('Inventar hält die Scrollposition beim Neu-Rendern', inventoryScrollBefore < 40 || Math.abs(inventoryScrollBody.scrollTop - inventoryScrollBefore) <= 2,
    `vorher ${inventoryScrollBefore} · nachher ${inventoryScrollBody.scrollTop}`);
  // DIM-Inventar zeigt nur Inventar-Buckets: keine Quests, Materialien,
  // Engramme, Währungen, Clan-Banner; Accessoires und Artefakt schon.
  const hiddenBuckets = ['Test-Quest', 'Test-Material', 'Test-Engramm', 'Test-Währung'];
  check('Fremde Buckets (Quest/Material/Engramm/Währung) ausgeblendet',
    hiddenBuckets.every((name) => !document.querySelector(`.dinv-tile[title^="${name}"]`)),
    hiddenBuckets.map((name) => `${name}:${Boolean(document.querySelector(`.dinv-tile[title^="${name}"]`))}`).join(','));
  check('Accessoires im Inventar sichtbar', Boolean(document.querySelector('.dinv-tile[title^="Test-Accessoire"]')));
  check('Artefakt erscheint nur einmal', document.querySelectorAll('.dinv-tile[title^="Test-Artefakt"]').length === 1,
    document.querySelectorAll('.dinv-tile[title^="Test-Artefakt"]').length);
  // Tresor-Aufklapper: nur 4 Zeilen sichtbar, Rest per Button.
  const vaultCell = document.querySelector('.dinv-vault-cell[data-vault-collapse="w-1498876634"]');
  check('Tresor-Zelle fuer Aufklapper vorhanden', Boolean(vaultCell));
  if (vaultCell) {
    const vaultArea = vaultCell.querySelector('.dinv-vault-body');
    const vaultToggle = vaultCell.querySelector('[data-vault-toggle]');
    const fullHeight = vaultArea.scrollHeight;
    check('Tresor standardmaessig auf 4 Zeilen begrenzt',
      vaultArea.classList.contains('collapsed') && vaultArea.clientHeight < vaultArea.scrollHeight - 4,
      `${vaultArea.clientHeight}/${vaultArea.scrollHeight}`);
    check('Tresor-Aufklapper sichtbar', Boolean(vaultToggle && !vaultToggle.hidden), vaultToggle && vaultToggle.textContent);
    if (vaultToggle) vaultToggle.click();
    await wait(120);
    let expandedStore = [];
    try { expandedStore = JSON.parse(localStorage.getItem('d2inv.expandedVaults') || '[]'); } catch (error) { expandedStore = []; }
    check('Tresor-Aufklapper wird gespeichert', expandedStore.includes('w-1498876634'), JSON.stringify(expandedStore));
    check('Tresor-Aufklapper zeigt alle Items',
      !vaultArea.classList.contains('collapsed') && vaultArea.clientHeight >= fullHeight - 2,
      `${vaultArea.clientHeight}/${fullHeight}`);
    if (vaultToggle) vaultToggle.click();
    await wait(120);
    try { expandedStore = JSON.parse(localStorage.getItem('d2inv.expandedVaults') || '[]'); } catch (error) { expandedStore = []; }
    check('Tresor-Zuklappen wird gespeichert', !expandedStore.includes('w-1498876634'), JSON.stringify(expandedStore));
    check('Tresor-Aufklapper schliesst wieder', vaultArea.classList.contains('collapsed'));
  }
  // Controller-Hinweise: nur bei aktivem Pad sichtbar.
  const padHint = document.querySelector('.inventory-pad-hint');
  check('Controller-Hinweisleiste vorhanden', Boolean(padHint));
  document.body.classList.add('pad-active');
  check('Controller-Hinweise sichtbar', Boolean(padHint && getComputedStyle(padHint).display === 'flex'),
    padHint && getComputedStyle(padHint).display);
  const padRow = document.querySelector('.dinv-row');
  check('Pad-Modus layoutet auch Off-Screen-Zeilen',
    Boolean(!padRow || getComputedStyle(padRow).contentVisibility === 'visible'),
    padRow && getComputedStyle(padRow).contentVisibility);
  document.body.classList.remove('pad-active');
  // Mehrere normale Toasts hintereinander müssen alle verschwinden
  // (früher blieben ältere Toasts dauerhaft stehen).
  toast('Test-Toast A', 'info', 120);
  toast('Test-Toast B', 'info', 120);
  toast('Test-Toast C', 'info', 120);
  await wait(500);
  const stuckToasts = [...document.querySelectorAll('#toasts .toast')].filter((el) => /Test-Toast/.test(el.textContent || ''));
  check('Gestapelte Toasts verschwinden', stuckToasts.length === 0, stuckToasts.length);
  toast('Poststelle ist voll', 'info', 3000, true);
  await wait(100);
  const categoryToast = [...document.querySelectorAll('#toasts .toast')].find((el) => /Poststelle ist voll/.test(el.textContent || ''));
  check('Toast zeigt Kategorie-Aktion', Boolean(categoryToast && categoryToast.querySelector('.toast-action')), categoryToast && categoryToast.textContent);
  if (categoryToast) categoryToast.remove();
  // Benachrichtigungszentrum: Verlauf, Entfernen, Leeren.
  initNotificationCenter();
  const notifyBtn = document.querySelector('#notificationBtn');
  if (notifyBtn) notifyBtn.click();
  await wait(80);
  check('Benachrichtigungszentrum offen', isNotificationCenterOpen());
  const notifyRows = () => document.querySelectorAll('#notificationPanel .notification-row').length;
  const historyCount = notifyRows();
  check('Benachrichtigungsverlauf gefuellt', historyCount >= 3, historyCount);
  document.querySelector('#notificationPanel [data-notify-dismiss]')?.click();
  await wait(50);
  check('Benachrichtigung manuell entfernbar', notifyRows() === historyCount - 1, notifyRows());
  document.querySelector('#notificationPanel [data-notify-clear]')?.click();
  await wait(50);
  check('Benachrichtigungen alle löschbar', notifyRows() === 0, notifyRows());
  // Kategorien, Filter und „Nicht stören“.
  toast('Poststelle ist voll', 'warning', 200);
  await wait(60);
  const postRow = document.querySelector('#notificationPanel .notification-row');
  check('Benachrichtigung kategorisiert (Poststelle)',
    Boolean(postRow && /poststelle/.test(postRow.querySelector('.notification-category')?.textContent || '')),
    postRow && postRow.querySelector('.notification-category')?.textContent);
  const postFilter = document.querySelector('#notificationPanel [data-notify-filter="poststelle"]');
  check('Benachrichtigungsfilter vorhanden', Boolean(postFilter && document.querySelector('#notificationPanel [data-notify-mute]')));
  check('Benachrichtigungs-Suche vorhanden', Boolean(document.querySelector('#notificationSearch')));
  check('Alle-gelesen-Knopf vorhanden', Boolean(document.querySelector('[data-notify-read]')));
  check('Kategorie-Stumm vorhanden', Boolean(document.querySelector('[data-notify-mute-cat]')));
  if (postFilter) postFilter.click();
  await wait(40);
  check('Filter zeigt nur Poststelle', notifyRows() === 1 &&
    /poststelle/.test(document.querySelector('#notificationPanel .notification-row .notification-category')?.textContent || ''), notifyRows());
  document.querySelector('#notificationPanel [data-notify-filter="all"]')?.click();
  await wait(40);
  const muteBtn = document.querySelector('#notificationPanel [data-notify-mute]');
  if (muteBtn) muteBtn.click();
  await wait(40);
  const historyBeforeMute = notifyRows();
  toast('Stumm-Test', 'info', 200);
  await wait(60);
  const mutedToast = [...document.querySelectorAll('#toasts .toast')].some((el) => /Stumm-Test/.test(el.textContent || ''));
  check('Nicht stören unterdrückt Toast', !mutedToast);
  check('Nicht stören behält Verlauf', notifyRows() === historyBeforeMute + 1, `${notifyRows()}/${historyBeforeMute}`);
  const muteAgain = document.querySelector('#notificationPanel [data-notify-mute]');
  if (muteAgain) muteAgain.click();
  await wait(40);
  closeNotificationCenter();
  check('Benachrichtigungszentrum schliesst', !isNotificationCenterOpen());
  // Virtuelle Tastatur: öffnen, Buchstabe tippen, schließen.
  window.dispatchEvent(new CustomEvent('d2-open-keyboard'));
  await wait(100);
  const padKb = document.querySelector('.inv-pad-kb.open');
  check('Virtuelle Tastatur offen', Boolean(padKb));
  check('Tastatur-Vorschläge sichtbar', Boolean(document.querySelector('.inv-pad-kb-suggest')));
  const keyQ = document.querySelector('.inv-pad-kb-key[data-kb-key="q"]');
  if (keyQ) keyQ.click();
  await wait(80);
  check('Tastatur schreibt in die Suche', /q/.test(document.querySelector('#inventorySearch').value), document.querySelector('#inventorySearch').value);
  const suggestion = document.querySelector('.inv-pad-kb-suggest[data-kb-suggest="is:godroll"]');
  if (suggestion) suggestion.click();
  await wait(80);
  check('Vorschlag setzt die Suche', document.querySelector('#inventorySearch').value === 'is:godroll', document.querySelector('#inventorySearch').value);
  // Suchverlauf: „Fertig“ merkt die aktuelle Suche.
  document.querySelector('.inv-pad-kb-key[data-kb-action="done"]')?.click();
  await wait(160);
  let kbHistory = [];
  try { kbHistory = JSON.parse(localStorage.getItem('d2inv.searchHistory') || '[]'); } catch (error) { kbHistory = []; }
  check('Tastatur merkt Suchverlauf', kbHistory.includes('is:godroll'), JSON.stringify(kbHistory));
  // Fuzzy: Zeichenfolge „tw0“ findet „Tresor-Waffe 0“.
  window.dispatchEvent(new CustomEvent('d2-open-keyboard'));
  await wait(100);
  document.querySelector('.inv-pad-kb-key[data-kb-action="clear"]')?.click();
  for (const char of ['t', 'w', '0']) document.querySelector(`.inv-pad-kb-key[data-kb-key="${char}"]`)?.click();
  await wait(120);
  check('Tastatur: Fuzzy-Vorschlag', Boolean(document.querySelector('.inv-pad-kb-suggest[data-kb-suggest="Tresor-Waffe 0"]')), [...document.querySelectorAll('.inv-pad-kb-suggest')].map((el) => el.dataset.kbSuggest).join('|'));
  const kbBackEvent = new CustomEvent('d2-inventory-back', { cancelable: true });
  window.dispatchEvent(kbBackEvent);
  check('Controller-B schliesst Tastatur', kbBackEvent.defaultPrevented && !document.querySelector('.inv-pad-kb.open'));
  await setSearch('');
  // Schnellmenü (R3): Aktionen und B-Schließen.
  window.dispatchEvent(new CustomEvent('d2-inventory-quickmenu'));
  await wait(80);
  check('Schnellmenü offen', Boolean(document.querySelector('.inv-quickmenu.open')));
  check('Schnellmenü Aktionen', document.querySelectorAll('.inv-quickmenu-btn').length === 5, document.querySelectorAll('.inv-quickmenu-btn').length);
  const quickBack = new CustomEvent('d2-inventory-back', { cancelable: true });
  window.dispatchEvent(quickBack);
  check('Controller-B schliesst Schnellmenü', quickBack.defaultPrevented && !document.querySelector('.inv-quickmenu.open'));
  // Bestätigungsdialog (z. B. Loadout-Vorschau): B entspricht „Abbrechen“.
  const confirmBackdrop = document.createElement('div');
  confirmBackdrop.className = 'inv-confirm-backdrop open';
  confirmBackdrop.innerHTML = '<div class="inv-confirm"><div class="inv-confirm-actions">' +
    '<button type="button" class="btn ghost" data-confirm-cancel>Abbrechen</button>' +
    '<button type="button" class="btn primary" data-confirm-ok>OK</button></div></div>';
  document.querySelector('#inventoryView').appendChild(confirmBackdrop);
  confirmBackdrop.querySelector('[data-confirm-cancel]').addEventListener('click', () => confirmBackdrop.classList.remove('open'));
  const confirmBack = new CustomEvent('d2-inventory-back', { cancelable: true });
  window.dispatchEvent(confirmBack);
  check('Controller-B schliesst Bestätigungsdialog', confirmBack.defaultPrevented && !document.querySelector('.inv-confirm-backdrop.open'));
  confirmBackdrop.remove();
  const baselineTotalTiles = lastTotalTiles;
  const searchBox = document.querySelector('#inventorySearch').getBoundingClientRect();
  check('Suchfeld kompakt (max. 40px)', searchBox.height <= 40, Math.round(searchBox.height));
  const statTiles = await setSearch('stat:gesundheit:>=20');
  check('Suche: stat-Operator', statTiles === 3, statTiles);
  const armor3Tiles = await setSearch('is:armor3.0');
  check('Suche: is:armor3.0', armor3Tiles === 1, armor3Tiles);
  const tierTiles = await setSearch('is:tier5');
  check('Suche: is:tier5', tierTiles === 1, tierTiles);
  const baseTotalTiles = await setSearch('basestat:total:>=70');
  check('Suche: basestat:total', baseTotalTiles >= 1, baseTotalTiles);
  const statTotalTiles = await setSearch('stat:total:>=70');
  check('Suche: stat:total', statTotalTiles >= 1, statTotalTiles);
  const archetypeTiles = await setSearch('archetype:test');
  check('Suche: archetype', archetypeTiles === 1, archetypeTiles);
  const dupeStatTiles = await setSearch('dupe:stats');
  check('Suche: dupe:stats (keine Stat-Dupes)', dupeStatTiles === 0, dupeStatTiles);
  const notedTiles = await setSearch('is:noted');
  check('Suche: is:noted (noch keine Notiz)', notedTiles === 0, notedTiles);
  check('Suche verschiebt keine Items', lastTotalTiles === baselineTotalTiles, `${lastTotalTiles}/${baselineTotalTiles}`);
  const dupeTiles = await setSearch('is:dupe');
  check('Suche: is:dupe (keine Duplikate)', dupeTiles === 0, dupeTiles);
  const godTiles = await setSearch('is:godroll');
  check('Suche: is:godroll (Godroll-Treffer)', godTiles >= 1, godTiles);
  const textTiles = await setSearch('Gesundheit');
  check('Suche: Freitext', textTiles === 1, textTiles);
  const searchCount = document.querySelector('#inventorySearchCount');
  check('Trefferzahl sichtbar', Boolean(searchCount && /1 Treffer/.test(searchCount.textContent || '')), searchCount && searchCount.textContent);
  const searchForEnter = document.querySelector('#inventorySearch');
  searchForEnter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(120);
  check('Enter fokussiert ersten Treffer', Boolean(document.activeElement && document.activeElement.matches('.dinv-tile:not(.inv-dim)')), document.activeElement && document.activeElement.className);
  await setSearch('');
  check('Suche dimmt statt umzubrechen', lastTotalTiles === baselineTotalTiles, `${lastTotalTiles}/${baselineTotalTiles}`);
  await setSearch('');

  // --- Stat-Badge + Suchfavoriten -------------------------------------
  const statBadge = document.querySelector('.dinv-tile-stats');
  check('Stat-Summe auf Ruestungskachel', Boolean(statBadge), statBadge && statBadge.textContent);
  check('Element-Badge auf Waffe', Boolean(document.querySelector('.dinv-tag-elem')), 'kein Element-Badge');
  check('Element-Legende im Inventar', Boolean(document.querySelector('.inventory-legend')), 'keine Legende');
  check('Champion-Badge auf Waffe', Boolean(document.querySelector('.dinv-tag-champ:not(.none)')), 'kein Champion-Badge');
  const frameWeaponTile = document.querySelector('.dinv-tile[title^="Perk-Testwaffe"]');
  check('Champion aus Rahmen ohne Mod', Boolean(frameWeaponTile && frameWeaponTile.parentElement && frameWeaponTile.parentElement.querySelector('.dinv-tag-champ:not(.none)')), 'kein Rahmen-Badge');
  await setSearch('is:godroll');
  const dimWrap = document.querySelector('.dinv-tile-wrap.inv-dim');
  check('Suche zeigt standardmäßig nur Treffer',
    Boolean(document.querySelector('#inventorySearchOnly.active')) &&
      (!dimWrap || getComputedStyle(dimWrap).display === 'none'),
    dimWrap ? getComputedStyle(dimWrap).display : 'keine gedimmte Kachel');
  check('Aktive Such-Chips sichtbar', Boolean(document.querySelector('[data-search-remove]')), 'kein aktiver Chip');
  const removeChip = document.querySelector('[data-search-remove]');
  if (removeChip) removeChip.click();
  await wait(140);
  check('Such-Chip entfernt Filter', !String(document.querySelector('#inventorySearch').value || '').includes('is:godroll'), document.querySelector('#inventorySearch').value);
  await setSearch('');

  document.querySelector('#inventorySearch').value = 'Gesundheit';
  document.querySelector('#inventorySearch').dispatchEvent(new Event('input', { bubbles: true }));
  await wait(180);
  const saveChip = document.querySelector('[data-search-save]');
  if (saveChip) saveChip.click();
  await wait(120);
  check('Suchfavorit gespeichert', Array.isArray(cfg.bungie.savedSearches) && cfg.bungie.savedSearches.includes('Gesundheit'), JSON.stringify(cfg.bungie.savedSearches || []));
  check('Suchfavorit als Chip sichtbar', Boolean(document.querySelector('[data-search-chip="Gesundheit"]')));
  const viewsSelect = document.querySelector('[aria-label="Gespeicherte Ansichten"]');
  check('Gespeicherte Ansichten vorhanden', Boolean(viewsSelect));
  check('Keine Suchbaustein-Leiste mehr', !document.querySelector('[data-query-chip]'));
  check('Suchfeld ohne Baustein-Spalte', !(document.querySelector('#inventorySearch')?.nextElementSibling?.classList?.contains('inv-query-builder')));

  // Filter-Menü am Suchfeld (ersetzt die frühere Chip-Spalte).
  await setSearch('');
  const filterBtn = document.querySelector('#inventoryFilterBtn');
  check('Filter-Knopf vorhanden', Boolean(filterBtn));
  if (filterBtn) {
    filterBtn.click();
    await wait(200);
    const filterMenu = document.querySelector('.inv-filter-menu:not(.hidden)');
    check('Filter-Menü öffnet', Boolean(filterMenu));
    check('Filter-Menü bietet Schnellfilter', Boolean(filterMenu && filterMenu.querySelectorAll('[data-filter-apply]').length >= 6));
    check('Filter-Menü erklärt Operatoren', Boolean(filterMenu && filterMenu.querySelector('.inv-filter-help')) && /stat:gesundheit/.test(filterMenu.textContent || ''));
    const preset = filterMenu && filterMenu.querySelector('[data-filter-apply="is:godroll"]');
    if (preset) preset.click();
    await wait(250);
    check('Filter setzt die Suche', document.querySelector('#inventorySearch').value.includes('is:godroll'), document.querySelector('#inventorySearch').value);
    check('Filter-Menü schließt nach Auswahl', !document.querySelector('.inv-filter-menu:not(.hidden)'));
  }

  // Tippfehler-Toleranz im Suchfeld.
  await setSearch('Testwafe');
  await wait(250);
  check('Fuzzy-Suche findet Tippfehler', /Treffer/.test(document.querySelector('#inventorySearchCount')?.textContent || ''), document.querySelector('#inventorySearchCount')?.textContent);
  check('Such-Worker ist aktiv', window.__d2SearchWorkerActive === true, String(window.__d2SearchWorkerActive));
  check('Fuzzy-Suche wird gekennzeichnet', /unscharf/.test(document.querySelector('#inventorySearchCount')?.textContent || ''));

  // Treffer werden im Tooltip hervorgehoben.
  await setSearch('Testgewehr');
  await wait(200);
  const highlightTile = document.querySelector('.dinv-tile[title^="Testgewehr"]');
  if (highlightTile) {
    highlightTile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await wait(100);
  }
  check('Treffer im Tooltip markiert', Boolean(document.querySelector('#inventoryTooltip .dinv-mark')),
    document.querySelector('#inventoryTooltip')?.textContent?.slice(0, 80));
  await setSearch('Testgewehr OR Granaten-Arme');
  await wait(220);
  check('ODER-Suche findet beide Begriffe',
    Boolean(document.querySelector('.dinv-tile[title^="Testgewehr"]')) &&
    Boolean(document.querySelector('.dinv-tile[title^="Granaten-Arme"]')),
    document.querySelector('#inventorySearchCount')?.textContent);
  await setSearch('');

  // Champion-Prüfung: Waffe ohne Brecher auswählen und Override setzen.
  document.querySelector('#inventoryChampionAudit')?.click();
  await wait(150);
  const auditPanel = document.querySelector('#championAuditPanel');
  check('Champion-Prüfung öffnet', Boolean(auditPanel) && !auditPanel.classList.contains('hidden'));
  const auditInput = auditPanel?.querySelector('[data-champion-audit-key]');
  check('Champion-Prüfung listet Waffen ohne Brecher', Boolean(auditInput),
    auditPanel?.querySelector('#championAuditCount')?.textContent);
  if (auditInput) {
    auditInput.checked = true;
    document.querySelector('#championAuditType').value = '1';
    document.querySelector('#championAuditApply')?.click();
    await wait(180);
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem('d2tool.championOverrides') || '{}'); } catch (error) { overrides = {}; }
    check('Champion-Prüfung speichert Override', Object.keys(overrides).length >= 1, JSON.stringify(overrides));
    try { localStorage.removeItem('d2tool.championOverrides'); } catch (error) { /* egal */ }
    document.querySelector('#championAuditClose')?.click();
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory' } }));
    await wait(200);
  }

  await setSearch('');
  if (viewsSelect) {
    viewsSelect.value = 'p:preset-god';
    viewsSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(180);
  }
  check('Ansicht setzt Godroll-Suche', document.querySelector('#inventorySearch')?.value === 'is:godroll',
    document.querySelector('#inventorySearch')?.value);
  await setSearch('');
  const freshChip = document.querySelector('[data-search-chip="Gesundheit"]');
  if (freshChip) freshChip.click();
  await wait(200);
  check('Chip setzt die Suche', document.querySelector('#inventorySearch').value === 'Gesundheit', document.querySelector('#inventorySearch').value);
  await setSearch('is:exotic');
  await wait(200);
  const exoticTitles = [...document.querySelectorAll('.dinv-tile:not(.inv-dim)')].map((tile) => tile.title || '');
  check('Suche is:exotic findet Exoten', exoticTitles.length > 0 && exoticTitles.every((title) => /Perk-Testwaffe/.test(title)), exoticTitles.join(' | ').slice(0, 160));
  await setSearch('-is:exotic');
  await wait(200);
  const nonExoticTitles = [...document.querySelectorAll('.dinv-tile:not(.inv-dim)')].map((tile) => tile.title || '');
  check('Suche -is:exotic schließt Exoten aus', nonExoticTitles.length > 0 && !nonExoticTitles.some((title) => /Perk-Testwaffe/.test(title)), nonExoticTitles.length);
  await setSearch('stat:Gesundheit>=20');
  await wait(200);
  const statSearchTitles = [...document.querySelectorAll('.dinv-tile:not(.inv-dim)')].map((tile) => tile.title || '');
  check('Stat-Suche ohne Doppelpunkt', statSearchTitles.length > 0, statSearchTitles.join(' | ').slice(0, 160));
  await setSearch('is:spike20');
  await wait(200);
  check('Spike-Filter findet 20+-Rüstung', document.querySelectorAll('.dinv-tile:not(.inv-dim)').length > 0,
    document.querySelector('#inventorySearchCount')?.textContent);
  await setSearch('is:tunable');
  await wait(200);
  check('Suche is:tunable', document.querySelectorAll('.dinv-tile:not(.inv-dim)').length >= 1,
    document.querySelector('#inventorySearchCount')?.textContent);
  await setSearch('is:set');
  await wait(200);
  check('Suche is:set', document.querySelectorAll('.dinv-tile:not(.inv-dim)').length >= 1,
    document.querySelector('#inventorySearchCount')?.textContent);
  await setSearch('stat:any>=20');
  await wait(200);
  check('Suche stat:any', document.querySelectorAll('.dinv-tile:not(.inv-dim)').length >= 1,
    document.querySelector('#inventorySearchCount')?.textContent);
  await setSearch('');

  // --- Item-Popup: Perk-Spalten (DIM) ---------------------------------
  await setSearch('');
  const perkTile = document.querySelector('.dinv-tile[title^="Perk-Testwaffe"]');
  check('Perk-Testwaffe sichtbar', Boolean(perkTile));
  if (perkTile) perkTile.click();
  const perkPopup = await until(() => document.querySelector('.inv-popup-backdrop.open'));
  check('Item-Popup offen', Boolean(perkPopup));
  const perkColumns = document.querySelectorAll('.inv-popup .inv-perk-column');
  check('Perk-Spalten je Socket', perkColumns.length === 4, perkColumns.length);
  const barrelCells = document.querySelectorAll('.inv-popup .inv-perk-column[data-cat="barrels"] .inv-perk-cell');
  check('Alle Perk-Optionen sichtbar', barrelCells.length === 3, barrelCells.length);
  const selectedPerkCells = document.querySelectorAll('.inv-popup .inv-perk-cell.selected');
  check('Je Socket genau eine Auswahl', selectedPerkCells.length === 4, selectedPerkCells.length);
  const perkPopupText = (perkPopup && perkPopup.textContent) || '';
  check('Element im Item-Popup', /Element:/.test(perkPopupText), perkPopupText.slice(0, 120));
  check('Champion-Abdeckung im Item-Popup', /Champion \(Rahmen\):/.test(perkPopupText), perkPopupText.slice(0, 120));
  check('Ausgewaehlter Perk benannt', /Kleinkaliber/.test(perkPopupText) && /Vorpal Weapon/.test(perkPopupText), perkPopupText.slice(0, 120));
  const godCells = document.querySelectorAll('.inv-popup .inv-perk-cell.god');
  check('Godroll-Perk im Popup markiert', godCells.length === 2, godCells.length);
  check('Godroll-Alternative markiert (nicht nur gesteckt)', Boolean(document.querySelector('.inv-popup .inv-perk-cell.god:not(.selected)')));
  check('Godroll-Begruendung mit PvE-Tag', /Godroll · PvE/.test(perkPopupText), perkPopupText.slice(0, 180));
  check('Godroll-Begruendung nennt Treffer-Perk', /Treffer: .*Vorpal Weapon/.test(perkPopupText), perkPopupText.slice(0, 180));
  check('Warnung fuer hoechstes Slot-Item', Boolean(document.querySelector('.inv-popup .inv-popup-highest')), document.querySelector('.inv-popup .inv-popup-highest') && document.querySelector('.inv-popup .inv-popup-highest').textContent);
  const modCells = document.querySelectorAll('.inv-popup .inv-mod-socket');
  check('Mods in eigener Reihe', modCells.length === 2, modCells.length);
  check('Nicht gewaehlte Perks gedimmt', Boolean(document.querySelector('.inv-popup .inv-perk-cell:not(.selected)')), true);
  // Perk-Erklärung (DIM-Overlay): Hover zeigt Name, Beschreibung, Status.
  const perkCell = document.querySelector('.inv-popup .inv-perk-cell[data-inv-perk-opt="6131"]');
  check('Perk-Zelle fuer Overlay vorhanden', Boolean(perkCell));
  if (perkCell) perkCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const perkTip = await until(() => document.querySelector('.dinv-plug-tip.show'));
  check('Perk-Overlay zeigt Name', Boolean(perkTip && /Vorpal Weapon/.test(perkTip.textContent || '')), perkTip && perkTip.textContent);
  check('Perk-Overlay zeigt Beschreibung', Boolean(perkTip && /mächtige Ziele/.test(perkTip.textContent || '')), perkTip && perkTip.textContent);
  check('Perk-Overlay zeigt Verbessertes Attribut', Boolean(perkTip && /Verbessertes Attribut/.test(perkTip.textContent || '')));
  check('Perk-Overlay zeigt Status', Boolean(perkTip && /Ausgewählt/.test(perkTip.textContent || '') && /Godroll/.test(perkTip.textContent || '')));
  if (perkCell) perkCell.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  check('Perk-Overlay schliesst', await until(() => !document.querySelector('.dinv-plug-tip.show')));
  const modCell = document.querySelector('.inv-popup .inv-mod-socket');
  if (modCell) modCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const modOverlayTip = await until(() => document.querySelector('.dinv-plug-tip.show'));
  check('Mod-Overlay zeigt Beschreibung', Boolean(modOverlayTip && /Verbesserte Werte/.test(modOverlayTip.textContent || '')), modOverlayTip && modOverlayTip.textContent);
  if (modCell) modCell.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  check('Mod-Overlay schliesst', await until(() => !document.querySelector('.dinv-plug-tip.show')));
  // Suche bei offenem Popup: render() muss das gewählte Item wiederfinden
  // (Regression: lokale CSS-Konstante überschrieb window.CSS.escape).
  const popupSearchBox = document.querySelector('#inventorySearch');
  popupSearchBox.value = 'Gesundheit';
  popupSearchBox.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(250);
  check('Popup bleibt beim Suchen offen', Boolean(document.querySelector('.inv-popup-backdrop.open')));
  check('Ausgewaehlte Kachel bleibt markiert', Boolean(document.querySelector('.dinv-tile.selected')));
  await setSearch('');
  const favBefore = Boolean(cfg.bungie && cfg.bungie.favs && cfg.bungie.favs['i-perks']);
  window.dispatchEvent(new CustomEvent('d2-inventory-quick', { detail: { action: 'favorite' } }));
  await wait(120);
  check('Schnellaktion Favorit im Popup', Boolean(cfg.bungie && cfg.bungie.favs && cfg.bungie.favs['i-perks']) !== favBefore,
    JSON.stringify(cfg.bungie && cfg.bungie.favs));
  check('Popup-Schnellhinweise vorhanden', Boolean(document.querySelector('.inv-popup-pad-hint')));
  // Controller-B schließt zuerst das Popup (app.js-CustomEvent).
  const popupBackEvent = new CustomEvent('d2-inventory-back', { cancelable: true });
  window.dispatchEvent(popupBackEvent);
  check('Controller-B schliesst Item-Popup', popupBackEvent.defaultPrevented);
  check('Item-Popup schliesst', await until(() => !document.querySelector('.inv-popup-backdrop.open')));

  // --- Armor-3.0-Popup: 30er-Marke und leere Stats --------------------
  const armorTile = document.querySelector('.dinv-tile[title^="Armor-3.0-Test"]');
  check('Armor-3.0-Test sichtbar', Boolean(armorTile));
  if (armorTile) armorTile.click();
  const armorPopup = await until(() => document.querySelector('.inv-popup-backdrop.open'));
  check('Armor-Popup offen', Boolean(armorPopup));
  const armorRows = [...document.querySelectorAll('.inv-popup .inv-stat-row')];
  check('Armor-Popup zeigt 6 Stats', armorRows.length === 6, armorRows.length);
  check('Armor-Balken ohne 100er-Marke', document.querySelectorAll('.inv-popup .inv-stat-mark').length === 0, document.querySelectorAll('.inv-popup .inv-stat-mark').length);
  check('Popup zeigt 6 Statwerte', document.querySelectorAll('.inv-popup .inv-stat-value').length === 6, document.querySelectorAll('.inv-popup .inv-stat-value').length);
  const healthRow = armorRows.find((row) => /Gesundheit/.test(row.textContent || ''));
  const healthFill = healthRow && healthRow.querySelector('.inv-stat-bar span');
  check('Gesundheit zeigt Teilwert 0', /Gesundheit\s*0/.test(healthRow?.textContent || ''), healthRow && healthRow.textContent);
  check('Gesundheit-Balken leer', Boolean(healthFill && healthFill.style.width === '0%'), healthFill && healthFill.style.width);
  const classRow = armorRows.find((row) => /Klasse/.test(row.textContent || ''));
  const classFill = classRow && classRow.querySelector('.inv-stat-bar span');
  const classWidth = classRow
    ? [...classRow.querySelectorAll('.inv-stat-bar span')].reduce((sum, seg) => sum + (parseFloat(seg.style.width) || 0), 0)
    : 0;
  check('Klasse zeigt Teilwert 30', /Klasse\s*30/.test(classRow?.textContent || ''), classRow && classRow.textContent);
  check('Klasse-Balken bei 66,7 %', Boolean(classFill && Math.abs(classWidth - 66.67) < 0.5), classRow && `${classWidth}%`);
  check('Klasse-Balken zeigt Mod- und Masterwork-Segment', Boolean(classRow && classRow.querySelector('.seg-mod') && classRow.querySelector('.seg-mw')), classRow && classRow.innerHTML.slice(0, 200));
  check('Stat-Zeile nennt Basis, Mods und Masterwork', /Basis 25/.test(classRow?.getAttribute('title') || '') && /Mods \+3/.test(classRow?.getAttribute('title') || '') && /Masterwork \+2/.test(classRow?.getAttribute('title') || ''), classRow && classRow.getAttribute('title'));
  check('Stats-Summe 75 im Armor-Popup', /Stats 75/.test((armorPopup && armorPopup.textContent) || ''));
  check('Popup-Legende erklärt 0–200', /0–200/.test((armorPopup && armorPopup.textContent) || '') && !/Strich bei 100/.test((armorPopup && armorPopup.textContent) || ''));
  check('Armor-Popup zeigt Tier/Archetyp/Set', /T5/.test((armorPopup && armorPopup.textContent) || '') && /Test-Archetyp/.test((armorPopup && armorPopup.textContent) || '') && /Test-Set/.test((armorPopup && armorPopup.textContent) || ''));
  check('Armor-Popup zeigt Tertiär/Tuning', /Tertiär: Nahkampf/.test((armorPopup && armorPopup.textContent) || '') && /Tuning: Waffen/.test((armorPopup && armorPopup.textContent) || ''));
  const noteBox = document.querySelector('[data-inv-note]');
  if (noteBox) noteBox.value = 'Meine Testnotiz';
  document.querySelector('[data-inv-act="save-note"]')?.click();
  await wait(120);
  check('Item-Notiz gespeichert', Boolean(cfg.bungie && cfg.bungie.itemNotes && cfg.bungie.itemNotes['i-armor3'] === 'Meine Testnotiz'), JSON.stringify(cfg.bungie && cfg.bungie.itemNotes));
  const armorBack = new CustomEvent('d2-inventory-back', { cancelable: true });
  window.dispatchEvent(armorBack);
  check('Armor-Popup schliesst', await until(() => !document.querySelector('.inv-popup-backdrop.open')));
  const notedAfter = await setSearch('is:noted');
  check('Suche: is:noted nach Notiz', notedAfter === 1, notedAfter);
  await setSearch('');

  // --- Mehrfachauswahl + Bestaetigungs-Modal --------------------------
  const multiTiles = [...document.querySelectorAll('#inventoryBody [data-inv-kind="backpack"]')].slice(0, 2);
  check('Zwei Beutetaschen-Kacheln fuer Auswahl', multiTiles.length === 2, multiTiles.length);
  for (const tile of multiTiles) tile.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  await wait(80);
  const selectbar = document.querySelector('.dinv-selectbar');
  check('Auswahlleiste sichtbar', Boolean(selectbar && !selectbar.hidden), selectbar && selectbar.textContent);
  const vaultBtn = document.querySelector('[data-sel-action="vault"]');
  if (vaultBtn) vaultBtn.click();
  const modal = await until(() => document.querySelector('.inv-confirm-backdrop.open'), 3000);
  check('Bestaetigungs-Modal statt window.confirm', Boolean(modal));
  const okBtn = document.querySelector('[data-confirm-ok]');
  if (okBtn) okBtn.click();
  await wait(900);
  check('Auswahl verschoben', document.querySelector('.dinv-selectbar').hidden, document.querySelector('.dinv-selectbar').textContent);
  check('Auswahl-Ergebnis sichtbar', /Auswahl → Tresor/.test(document.querySelector('#inventoryResult').textContent || ''), document.querySelector('#inventoryResult').textContent.slice(0, 80));

  // --- Mods entpacken -------------------------------------------------
  const modTile = document.querySelector('.dinv-tile[title^="Gesundheits-Helm"]');
  check('Mod-Testitem sichtbar', Boolean(modTile));
  if (modTile) modTile.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  await wait(80);
  check('Alle-Treffer-Knopf vorhanden', Boolean(document.querySelector('[data-sel-action="select-matches"]')));
  const favAction = document.querySelector('[data-sel-action="favorite"]');
  if (favAction) favAction.click();
  await wait(120);
  check('Favorit setzen', Boolean(cfg.bungie && cfg.bungie.favs && cfg.bungie.favs['i-helm2']));
  check('Undo-Leiste sichtbar', Boolean(document.querySelector('.dinv-undobar:not([hidden])')));
  document.querySelector('[data-undo-run]')?.click();
  await wait(220);
  check('Favorit rückgängig', !(cfg.bungie && cfg.bungie.favs && cfg.bungie.favs['i-helm2']));
  const modTile2 = document.querySelector('.dinv-tile[title^="Gesundheits-Helm"]');
  if (modTile2) modTile2.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  await wait(80);
  const stripBtn = document.querySelector('[data-sel-action="stripmods"]');
  check('Mods-entpacken-Knopf vorhanden', Boolean(stripBtn));
  if (stripBtn) stripBtn.click();
  const stripConfirm = await until(() => document.querySelector('.inv-confirm-backdrop.open'));
  check('Mods-entpacken bestätigen', Boolean(stripConfirm));
  const stripOk = document.querySelector('[data-confirm-ok]');
  if (stripOk) stripOk.click();
  await wait(700);
  check('Mods entpackt (Bungie-Aktion)', insertPlugCalls >= 1, insertPlugCalls);

  // --- Loadout-Export/Import ------------------------------------------
  document.querySelector('[data-tab="loadouts"]').click();
  await wait(200);
  const exportBtn = document.querySelector('[data-ed-export]');
  check('Export-Knopf vorhanden', Boolean(exportBtn));
  if (exportBtn) exportBtn.click();
  await wait(150);
  check('Export in Zwischenablage', /d2tool-loadouts/.test(clipboardText), clipboardText.slice(0, 60));
  const fileImportBtn = document.querySelector('[data-ed-import-file]');
  check('Datei-Import-Knopf vorhanden', Boolean(fileImportBtn));
  const linkImportBtn = document.querySelector('[data-ed-import-link]');
  check('DIM-Link-Knopf vorhanden', Boolean(linkImportBtn));
  if (linkImportBtn) linkImportBtn.click();
  const linkInput = await until(() => document.querySelector('.inv-confirm-input'), 3000);
  check('DIM-Link-Modal offen', Boolean(linkInput));
  if (linkInput) {
    linkInput.value = 'https://dim.gg/4j5nz4q';
    linkInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const linkOk = document.querySelector('[data-input-ok]');
  if (linkOk) linkOk.click();
  const importModal = await until(() => document.querySelector('[data-confirm-ok]'), 4000);
  check('DIM-Import bestätigen', Boolean(importModal));
  const importOk = document.querySelector('[data-confirm-ok]');
  if (importOk) importOk.click();
  await wait(400);
  check('DIM-Loadout importiert', (cfg.bungie.loadouts || []).some((entry) => entry.name === 'DIM-Import'), (cfg.bungie.loadouts || []).map((entry) => entry.name).join(', '));
  check('Import sofort im Loadout-Editor sichtbar', /DIM-Import/.test((document.querySelector('.inv-dw-page-list') || {}).textContent || ''), ((document.querySelector('.inv-dw-page-list') || {}).textContent || '').slice(0, 80));
  check('Artefakt-Perks übernommen', /1 Artefakt-Perks/.test(document.querySelector('#inventoryResult').textContent || ''), (document.querySelector('#inventoryResult').textContent || '').slice(0, 120));

  // --- Bearbeiten des importierten Loadouts ---------------------------
  const importedCard = [...document.querySelectorAll('.inv-dw-card')].find((card) => /DIM-Import/.test(card.textContent || ''));
  const importedEdit = importedCard && importedCard.querySelector('[data-loadout-edit]');
  check('Importierte Karte hat Bearbeiten', Boolean(importedEdit));
  if (importedEdit) importedEdit.click();
  await wait(350);
  const editedName = document.querySelector('.inv-dw-name');
  check('Importierter Name im Editor', editedName && editedName.value === 'DIM-Import', editedName && editedName.value);
  const filledSlots = [...document.querySelectorAll('[data-dw-slot]')].filter((el) => el.querySelector('img')).length;
  check('Importierte Items im Editor gefuellt', filledSlots >= 1, filledSlots);
  const focusPlug = document.querySelector('[data-dw-sub-sock="0"]');
  check('Importierter Fokus-Plug sichtbar', Boolean(focusPlug && /Hammer des Zorns/.test(focusPlug.getAttribute('title') || '')), focusPlug && focusPlug.getAttribute('title'));
  check('Artefakt-Perk im Editor', / 1 Perks/.test((document.querySelector('.inv-dw-foot') || {}).textContent || ''), (document.querySelector('.inv-dw-foot') || {}).textContent);
  const modTiles = [...document.querySelectorAll('[data-dw-mod-edit]')];
  const mobilityModTile = modTiles.find((tile) => /Waffen-Mod/.test(tile.getAttribute('title') || ''));
  check('Importierte Mod-Icons sichtbar', Boolean(mobilityModTile && mobilityModTile.querySelector('img')), mobilityModTile && mobilityModTile.innerHTML.slice(0, 80));
  const closeImported = document.querySelector('[data-dw-close]');
  if (closeImported) closeImported.click();
  await wait(250);

  // --- Loadout-Vorschau (Modal) ---------------------------------------
  document.querySelector('[data-tab="inventory"]').click();
  await wait(200);
  document.querySelector('[data-tab="loadouts"]').click();
  await wait(200);
  const applyBtn2 = document.querySelector('[data-loadout-apply]');
  check('Anlegen-Knopf vorhanden', Boolean(applyBtn2));
  if (applyBtn2) applyBtn2.click();
  const preview = await until(() => document.querySelector('.inv-confirm-backdrop.open'), 3000);
  check('Vorschau-Modal vor dem Anlegen', Boolean(preview));
  check('Loadout-Vorschau pro Item', /Vorschau pro Item/.test(preview && preview.textContent || ''));
  check('Loadout-Vorschau zeigt Stat-Prognose', /Stat-Prognose/.test(preview && preview.textContent || ''), (preview && preview.textContent || '').slice(0, 240));
  const cancelBtn = document.querySelector('[data-confirm-cancel]');
  if (cancelBtn) cancelBtn.click();
  await wait(120);
  check('Vorschau abbrechbar', !document.querySelector('.inv-confirm-backdrop.open'));
  document.querySelector('[data-tab="inventory"]').click();

  // --- Werkzeuge: Power, Materialien, Wochen, Crafting, Xûr, Duplikate, Session ---
  // Der Build-Assistent startet den Picker, bevor die Werkzeuge jemals
  // geöffnet wurden – genau der Fall, in dem das Ereignis früher verloren ging.
  const toolsLoadedBefore = window.__d2ToolsLoaded === true;
  const toolsTabEl = document.querySelector('.inventory-tools-tab');
  const wizardButton = [...document.querySelectorAll('button')].find((button) => (button.textContent || '').trim() === 'Build-Assistent');
  check('Build-Assistent vorhanden', Boolean(wizardButton));
  if (wizardButton) {
    wizardButton.click();
    await wait(80);
    const wizard = document.querySelector('[aria-label="Build-Assistent"]');
    const activitySelect = wizard ? wizard.querySelector('[data-wiz-activity]') : null;
    check('Build-Assistent bietet Meta-Aktivitäten', Boolean(activitySelect) && activitySelect.options.length >= 8,
      activitySelect ? String(activitySelect.options.length) : 'kein Auswahlfeld');
    const wizardSummary = (wizard && wizard.querySelector('[data-wiz-summary]') && wizard.querySelector('[data-wiz-summary]').textContent) || '';
    check('Build-Assistent PvE ohne Gesundheit', /Waffen/.test(wizardSummary) && !/Gesundheit\s*\d/.test(wizardSummary), wizardSummary);
    wizard?.querySelector('[data-wiz-start]')?.click();
  }
  await until(() => toolsTabEl && toolsTabEl.querySelector('.armor-picker'));
  await wait(150);
  check('Build-Assistent öffnet den Picker', Boolean(toolsTabEl && toolsTabEl.querySelector('.armor-picker')) && !toolsTabEl.classList.contains('hidden'),
    toolsTabEl ? toolsTabEl.className : 'kein Tab');
  const toolsLoadedAfter = window.__d2ToolsLoaded === true;
  check('Werkzeuge werden erst bei Bedarf geladen', toolsLoadedBefore === false && toolsLoadedAfter === true,
    `${toolsLoadedBefore}/${toolsLoadedAfter}`);
  const toolsText = () => (toolsTabEl && toolsTabEl.textContent) || '';
  const openToolView = async (view) => {
    toolsTabEl.querySelector(`[data-tool-view="${view}"]`)?.click();
    await wait(120);
  };
  check('Werkzeuge-Tab offen', Boolean(toolsTabEl && !toolsTabEl.classList.contains('hidden')));
  check('Werkzeuge ohne Inventar-Suchleiste', Boolean(document.querySelector('.inventory-toolbar')?.classList.contains('hidden')) && Boolean(document.querySelector('.inventory-head-controls')?.classList.contains('hidden')));
  const renderBudgets = [];
  for (const view of ['overview', 'builds', 'week', 'collection', 'vendor']) {
    document.querySelector('[data-tool-view="' + view + '"]')?.click();
    await wait(220);
    renderBudgets.push({ view, ms: Number(window.__toolsRenderMs) || 0 });
  }
  const worstRender = renderBudgets.reduce((worst, entry) => (entry.ms > worst.ms ? entry : worst), { view: '-', ms: 0 });
  check('Render-Budget je Werkzeugseite (< 600 ms)', worstRender.ms < 600,
    renderBudgets.map((entry) => entry.view + ' ' + entry.ms + ' ms').join(' · '));
  document.querySelector('[data-tool-view="overview"]')?.click();
  await wait(200);
  check('Werkzeuge-Navigation vorhanden', toolsTabEl.querySelectorAll('[data-tool-view]').length === 5,
    toolsTabEl.querySelectorAll('[data-tool-view]').length);
  check('Werkzeug-Hero mit KPIs', /Werkzeugzentrale/.test(toolsText()) && toolsTabEl.querySelectorAll('[data-tool-kpi]').length === 5,
    toolsTabEl.querySelectorAll('[data-tool-kpi]').length);
  check('Fokus- und Schnellzugriff-Karten', /Heute im Fokus/.test(toolsText()) && /Schnellzugriff/.test(toolsText()));
  check('Post-Game-Karte vorhanden', /Nach dem Spiel/.test(toolsText()));
  document.querySelector('[data-tool-view="builds"]')?.click();
  await wait(260);
  check('Champion-Planer vorhanden', /Champion-Planer/.test(toolsText()));
  check('Build-Lückenanalyse vorhanden', /Build-Lückenanalyse/.test(toolsText()));
  document.querySelector('[data-tool-view="vendor"]')?.click();
  await wait(260);
  check('Händler-Beobachtung vorhanden', /Händler-Beobachtung/.test(toolsText()));
  document.querySelector('[data-tool-view="collection"]')?.click();
  await wait(220);
  document.querySelector('[data-collection-tab="crafting"]')?.click();
  await wait(220);
  check('Crafting-Materialplan vorhanden', /Crafting-Materialplan/.test(toolsText()));
  document.querySelector('[data-tool-view="overview"]')?.click();
  await wait(220);
  const diagFold = [...toolsTabEl.querySelectorAll('details[data-lazy-fold] > summary')].find((entry) => /Diagnose/.test(entry.textContent || ''));
  if (diagFold) diagFold.click();
  await wait(650);
  check('Sicherungskarte vorhanden', /Konfiguration sichern/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-config-backup]')));
  check('Selbsttest-Karte vorhanden', Boolean(toolsTabEl.querySelector('[data-selftest-run]')));
  check('Speicherkarte vorhanden', Boolean(toolsTabEl.querySelector('[data-storage-clean]')));
  check('Streamer-Modus verfügbar', Boolean(toolsTabEl.querySelector('[data-privacy-streamer]')));
  check('Datenintegrität verfügbar', Boolean(toolsTabEl.querySelector('[data-integrity-check]')));
  check('Zugangsdaten-Karte verfügbar', Boolean(toolsTabEl.querySelector('[data-secrets-refresh]')));
  check('Crash-Analyse verfügbar', Boolean(toolsTabEl.querySelector('[data-crash-load]')));
  check('Profilkarte vorhanden', /Profilkarte|Profile/.test(toolsText()));
  check('Offline-Warteschlange vorhanden', /Aktionswarteschlange|Offline-Warteschlange/.test(toolsText()));
  if (diagFold) diagFold.click();
  await wait(200);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await wait(140);
  check('Befehlspalette öffnet', Boolean(document.querySelector('.cmd-palette:not(.hidden) .cmd-input')));
  const cmdInput = document.querySelector('.cmd-input');
  if (cmdInput) {
    cmdInput.value = 'Woche';
    cmdInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await wait(120);
  check('Befehlspalette findet Woche', /Werkzeug: Woche/.test(document.querySelector('.cmd-list')?.textContent || ''));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(120);
  check('Befehlspalette schließt', !document.querySelector('.cmd-palette:not(.hidden)'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await wait(140);
  const wnInput = document.querySelector('.cmd-input');
  if (wnInput) {
    wnInput.value = 'Was ist neu';
    wnInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await wait(120);
  check('Palette findet Was-ist-neu', /Was ist neu/.test(document.querySelector('.cmd-list')?.textContent || ''));
  document.querySelector('.cmd-entry')?.click();
  await wait(260);
  check('Was-ist-neu-Panel öffnet', Boolean(document.querySelector('.wn-list .wn-item')));
  document.querySelector('[data-wn-close]')?.click();
  await wait(120);
  check('Übersicht-Werkzeugkarten', toolsTabEl.querySelectorAll('.overview-tool').length === 4 && /Bereiche/.test(toolsText()));
  check('Übersicht-Lage und Fokus', /Lage & Fokus/.test(toolsText()));
  const heroEl = toolsTabEl.querySelector('.inv-tools-hero');
  check('Werkzeug-Design geladen', Boolean(heroEl && heroEl.classList.contains('inv-tools-hero')));
  check('Sprungmarken vorhanden', Boolean(toolsTabEl.querySelector('.inv-tool-jump')));
  check('Übersicht zeigt wenige Karten', toolsTabEl.querySelectorAll('.inv-tool-grid > .inv-tool-card').length <= 20,
    toolsTabEl.querySelectorAll('.inv-tool-card').length);
  const expandBtn = toolsTabEl.querySelector('[data-tool-expand]');
  if (expandBtn) expandBtn.click();
  await wait(160);
  const folds = [...toolsTabEl.querySelectorAll('details.inv-tool-fold')];
  check('Alle Werkzeuge aufklappbar', folds.length > 0 && folds.every((fold) => fold.open), folds.length);
  toolsTabEl.querySelector('[data-tool-expand]')?.click();
  await wait(160);
  check('Alle Werkzeuge einklappbar', [...toolsTabEl.querySelectorAll('details.inv-tool-fold')].every((fold) => !fold.open));
  check('Aktivitaet erkannt', /Großmeister-Nightfall/.test(toolsText()), toolsText().slice(0, 120));
  check('Material-Dashboard in der Übersicht', /123\.456/.test(toolsText()) && /Glimmer/.test(toolsText()));
  check('Material-Ziele in der Übersicht', /Material-Ziele/.test(toolsText()));
  await openToolView('builds');
  check('Builds-Ansicht mit Build-Check', /Build-Check/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.armor-picker')));
  check('Rüstungs-Picker vorhanden', /Rüstungs-Picker/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.armor-picker')));
  check('Picker-Ziele und Mods', toolsTabEl.querySelectorAll('[data-picker-goal]').length === 6 && toolsTabEl.querySelectorAll('[data-picker-mod]').length === 6);
  check('Picker Erweiterungen', Boolean(toolsTabEl.querySelector('[data-picker-masterwork]')) && toolsTabEl.querySelectorAll('[data-picker-lock]').length === 5 && Boolean(toolsTabEl.querySelector('[data-picker-set]')) && Boolean(toolsTabEl.querySelector('[data-picker-sort]')));
  toolsTabEl.querySelector('[data-picker-reset]')?.click();
  await wait(120);
  toolsTabEl.querySelector('[data-picker-class="0"]')?.click();
  await wait(120);
  toolsTabEl.querySelector('[data-picker-find]')?.click();
  const pickerWaitStart = Date.now();
  while (Date.now() - pickerWaitStart < 3000 && !toolsTabEl.querySelector('.picker-best')) await wait(40);
  check('Picker findet Rüstungsset', Boolean(toolsTabEl.querySelector('.picker-best')) && /In Loadout übernehmen/.test(toolsText()),
    `${Boolean(toolsTabEl.querySelector('.picker-best'))}/${/In Loadout übernehmen/.test(toolsText())}/${(toolsTabEl.querySelector('.picker-best header')?.textContent || '').slice(0, 80)}`);
  check('Picker zeigt fünf Teile', toolsTabEl.querySelectorAll('.picker-piece').length >= 5);
  const pickerExotics = Math.max(0, ...[...toolsTabEl.querySelectorAll('.picker-best')].map((block) => block.querySelectorAll('[data-picker-exotic]').length));
  check('Picker maximal ein Exot pro Set', pickerExotics <= 1, String(pickerExotics));
  const pickerPerf = /(\d+) ms/.exec(toolsTabEl.querySelector('.picker-results-head small')?.textContent || '');
  check('Picker-Performance-Budget', Boolean(pickerPerf && Number(pickerPerf[1]) < 500), pickerPerf && pickerPerf[0]);
  check('Picker zeigt Alternativen pro Slot', Boolean(toolsTabEl.querySelector('[data-picker-candidate]')) || Boolean(toolsTabEl.querySelector('.picker-candidates')), String(toolsTabEl.querySelectorAll('[data-picker-candidate]').length));
  check('Picker nennt Stat-Tier und Aufschlüsselung', /T\d/.test(toolsTabEl.querySelector('.picker-stat small')?.textContent || ''), toolsTabEl.querySelector('.picker-stat small')?.textContent || '');
  check('Picker hat Exoten-Modus', Boolean(toolsTabEl.querySelector('[data-picker-exotic-mode]')));
  const pickerModeSelect = toolsTabEl.querySelector('[data-picker-exotic-mode]');
  if (pickerModeSelect) {
    pickerModeSelect.value = 'forbid';
    pickerModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await wait(160);
  let pickerSaved = {};
  try { pickerSaved = JSON.parse(window.localStorage.getItem('d2tool.armorPicker') || '{}'); } catch (error) { pickerSaved = {}; }
  check('Picker übernimmt Exoten-Modus', pickerSaved.exoticMode === 'forbid', String(pickerSaved.exoticMode));
  const pickerModeReset = toolsTabEl.querySelector('[data-picker-exotic-mode]');
  if (pickerModeReset) {
    pickerModeReset.value = 'allow';
    pickerModeReset.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await wait(160);
  toolsTabEl.querySelector('[data-picker-find]')?.click();
  const pickerRefindStart = Date.now();
  while (Date.now() - pickerRefindStart < 3000 && !toolsTabEl.querySelector('.picker-best')) await wait(40);
  check('Picker hat Vorlagen', Boolean(toolsTabEl.querySelector('[data-picker-preset]')));
  check('Picker hat Archetyp-Filter', Boolean(toolsTabEl.querySelector('[data-picker-archetype]')));
  check('Picker hat Gewichtung je Stat', Boolean(toolsTabEl.querySelector('[data-picker-weight]')));
  check('Picker zeigt Build-Score', /Build-Score/.test(toolsText()));
  check('Picker zeigt Stat-Breakpoints', Boolean(toolsTabEl.querySelector('.picker-breakpoints')) && /T\d/.test(toolsTabEl.querySelector('.picker-breakpoints')?.textContent || ''),
    toolsTabEl.querySelector('.picker-breakpoints')?.textContent?.slice(0, 140) || 'fehlt');
  const pickerTargetInput = toolsTabEl.querySelector('[data-picker-target-name]');
  if (pickerTargetInput) {
    pickerTargetInput.value = 'GM-Testziel';
    toolsTabEl.querySelector('[data-picker-target-save]')?.click();
    await wait(120);
  }
  let savedTargets = [];
  try { savedTargets = JSON.parse(localStorage.getItem('d2tool.pickerTargets') || '[]'); } catch (error) { savedTargets = []; }
  check('Picker speichert mehrere Ziel-Profile', Array.isArray(savedTargets) && savedTargets.some((target) => target.name === 'GM-Testziel'), JSON.stringify(savedTargets.map((target) => target.name)));
  const pickerTargetSelect = toolsTabEl.querySelector('[data-picker-target]');
  const pickerSavedTarget = savedTargets.find((target) => target.name === 'GM-Testziel');
  if (pickerTargetSelect && pickerSavedTarget) {
    pickerTargetSelect.value = pickerSavedTarget.id;
    pickerTargetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(160);
  }
  check('Picker wendet Ziel-Profil an', Boolean(toolsTabEl.querySelector('[data-picker-target]')) && /GM-Testziel/.test(toolsTabEl.querySelector('[data-picker-target]')?.textContent || ''));
  check('Picker hat DIM-Import', Boolean(toolsTabEl.querySelector('[data-picker-import]')));
  const presetSelect = toolsTabEl.querySelector('[data-picker-preset]');
  const presetNames = presetSelect ? [...presetSelect.options].map((option) => option.textContent || '') : [];
  check('Picker-Vorlagen folgen der Meta', presetNames.includes('PvE · Waffen + Granate') && !presetNames.some((name) => /PvE.*Gesundheit/.test(name)),
    presetNames.join(' | '));
  check('Picker bietet mehr Vorlagen', presetNames.filter((name) => name && !/Vorlage wählen/.test(name)).length >= 9,
    String(presetNames.length));
  const weightGoal = toolsTabEl.querySelector('[data-picker-weight="2996146975"]');
  if (weightGoal) {
    weightGoal.value = '3';
    weightGoal.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(100);
    let savedPicker = null;
    try { savedPicker = JSON.parse(localStorage.getItem('d2tool.armorPicker') || 'null'); } catch (error) { savedPicker = null; }
    check('Picker speichert Gewichtung', savedPicker && Number(savedPicker.weights && savedPicker.weights['2996146975']) === 3,
      savedPicker ? JSON.stringify(savedPicker.weights) : 'kein Speicherstand');
  }
  api.readClipboard = async () => ({
    ok: true,
    text: JSON.stringify({ classType: 0, stats: { Waffen: 120, Granate: 75 }, parameters: { mods: [] } })
  });
  toolsTabEl.querySelector('[data-picker-import]')?.click();
  await wait(450);
  const importedGoal = toolsTabEl.querySelector('[data-picker-goal="2996146975"]');
  check('Picker importiert DIM-/Picker-JSON', Boolean(importedGoal) && Number(importedGoal.value) === 120,
    importedGoal ? importedGoal.value : 'kein Ziel');
  const importedGranate = toolsTabEl.querySelector('[data-picker-goal="1735777505"]');
  check('Picker importiert mehrere Ziele', Boolean(importedGranate) && Number(importedGranate.value) === 75,
    importedGranate ? importedGranate.value : 'kein Ziel');
  check('Picker zeigt Energie-Vorschau', Boolean(toolsTabEl.querySelector('.picker-energy')));
  check('Picker teilt Set', Boolean(toolsTabEl.querySelector('[data-picker-share="text"]')));
  check('Picker zeigt Subklassen-Fragmente', Boolean(toolsTabEl.querySelector('[data-picker-subclass-use]')) || /Keine Subklasse/.test(toolsText()));
  check('Picker hat Tuning je Slot', Boolean(toolsTabEl.querySelector('[data-picker-tuning]')));
  check('Picker kann Loadout-Teile ausschließen', Boolean(toolsTabEl.querySelector('[data-picker-exclude-used]')));
  check('Picker erklärt das Set', /Warum dieses Set/.test(toolsText()));
  const pickerPiece = toolsTabEl.querySelector('.picker-piece');
  if (pickerPiece) {
    const rect = pickerPiece.getBoundingClientRect();
    pickerPiece.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: rect.left + 8, clientY: rect.top + 8 }));
  }
  await wait(160);
  const pickerTip = document.querySelector('#armorPickerTooltip.show');
  check('Picker zeigt Hover-Overlay', Boolean(pickerTip) && /Stats/.test(pickerTip.textContent || ''), pickerTip && pickerTip.textContent.slice(0, 120));
  toolsTabEl.querySelector('details[data-lazy-fold] > summary')?.click();
  await wait(420);
  check('Analyse-Fold lädt bei Bedarf', /Stat-Optimierer/.test(toolsText()), toolsText().length);
  check('Mod-Bibliothek vorhanden', /Mod-Bibliothek/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-mod-search]')));
  check('Rüstungs-Bewertung vorhanden', /Rüstungs-Bewertung/.test(toolsText()) && /Score/.test(toolsText()));
  check('Rüstungs-Duell mit zwei Auswahlen', Boolean(toolsTabEl.querySelector('[data-armor-duel-a]')) && Boolean(toolsTabEl.querySelector('[data-armor-duel-b]')));
  check('Rüstungs-Duell nennt Tuning-Empfehlung', /Tuning-Empfehlung|Tuning aktiv/.test(toolsText()));
  check('Stat-Ziel-Verlauf vorhanden', /Verlauf:/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-stat-history-reset]')));
  check('Optimierer verteilt Mod-Punkte automatisch', /automatisch auf freie Stats/.test(toolsText()));
  check('Set-Boni vorhanden', /Set-Boni/.test(toolsText()));
  const bonusLine = [...toolsTabEl.querySelectorAll('.inv-tool-statline')].find((el) => /120/.test(el.textContent || ''));
  check('Build-Check nutzt Profilwerte inkl. Mods', Boolean(bonusLine), bonusLine && bonusLine.textContent);
  const statMeter = bonusLine && bonusLine.querySelector('.inv-stat-meter');
  check('Statbalken ohne 100er-Marke', Boolean(statMeter && !statMeter.querySelector('.mark')));
  const baseSeg = statMeter && statMeter.querySelector('.base');
  const bonusSeg = statMeter && statMeter.querySelector('.bonus');
  check('Statbalken skaliert auf 200', Boolean(baseSeg && baseSeg.style.width === '60%' && !bonusSeg),
    statMeter && statMeter.innerHTML.slice(0, 160));
  check('Stat-Optimierer rechnet Stat-Mods ein', /5 Stat-Mods/.test(toolsText()));
  check('Optimierer nutzt Basis-Roll', /Basis-Roll ohne vorhandene Mods/.test(toolsText()));
  check('Stat-Abgleich zeigt Herkunft', /Stat-Abgleich/.test(toolsText()) && /Rüstung/.test(toolsText()) && /Fragmente/.test(toolsText()));
  const healthCard = [...document.querySelectorAll('.inv-tool-card')].find((card) => /Gesundheits-Rechner/.test(card.textContent || ''));
  check('Gesundheits-Rechner ohne alte Resilienz-Prozente', Boolean(healthCard) && !/% Schadensreduktion/.test(healthCard.textContent || ''), healthCard && healthCard.textContent.slice(0, 160));
  check('Set-Boni-Karte vorhanden', /Set-Boni/.test(toolsText()));
  check('Masterwork-/Tuning-Karte vorhanden', /Masterwork & Tuning/.test(toolsText()));
  check('Build-Karte-Knopf vorhanden', /Build-Karte \(PNG\)/.test(toolsText()));
  check('Optimierer zeigt fehlende Punkte', /bis 200|200 erreicht/.test(toolsText()));
  check('Optimierer nennt Fragmente', /Fragmente/.test(toolsText()));
  const pickerModSelect = toolsTabEl.querySelector('[data-picker-mod]');
  if (pickerModSelect) {
    pickerModSelect.value = '1';
    pickerModSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(140);
  }
  toolsTabEl.querySelector('[data-picker-find]')?.click();
  await wait(400);
  toolsTabEl.querySelector('[data-picker-apply]')?.click();
  await wait(600);
  const editorFootHint = document.querySelector('.inv-dw-foot-hint')?.textContent || '';
  check('Picker übergibt Stat-Mods', /Mods/.test(editorFootHint) && !/0 Mods/.test(editorFootHint), editorFootHint);
  const editorFootCheck = document.querySelector('.inv-dw-foot-check')?.textContent || '';
  check('Loadout-Editor prüft Anwendbarkeit', /anwendbar|fehlt|Energie/.test(editorFootCheck), editorFootCheck);
  check('Loadout-Editor bietet Energie-Ausgleich', Boolean(document.querySelector('[data-dw-energy-fix]')));
  check('Loadout-Editor zeigt Soll/Ist', document.querySelectorAll('.inv-dw-diff-row').length >= 5, String(document.querySelectorAll('.inv-dw-diff-row').length));
  document.querySelector('[data-dw-close]')?.click();
  await wait(220);
  document.querySelector('.dinv-tab[data-tab="tools"]')?.click();
  await wait(260);
  document.querySelector('.dinv-tab[data-tab="loadouts"]')?.click();
  await wait(420);
  check('Loadout-Bibliothek mit Suche', Boolean(document.querySelector('[data-loadout-search]')));
  check('Loadout-Ordner anlegbar', Boolean(document.querySelector('[data-loadout-folder-add]')));
  const folderInput = document.querySelector('[data-loadout-folder-name]');
  if (folderInput) folderInput.value = 'E2E-Ordner';
  document.querySelector('[data-loadout-folder-add]')?.click();
  await wait(220);
  check('Loadout-Ordner gespeichert', (((cfg.bungie && cfg.bungie.loadoutFolders) || []).some((folder) => folder.name === 'E2E-Ordner')));
  const loadoutTag = document.querySelector('[data-loadout-tag]');
  check('Loadout-Tags vorhanden', Boolean(loadoutTag));
  if (loadoutTag) loadoutTag.click();
  await wait(200);
  check('Loadout-Tag gespeichert', (((cfg.bungie && cfg.bungie.loadouts) || []).some((loadout) => Array.isArray(loadout.tags) && loadout.tags.length)));
  const compareBtn = document.querySelector('[data-loadout-compare]');
  check('Loadout-Vergleich vorhanden', Boolean(compareBtn));
  if (compareBtn && (((cfg.bungie && cfg.bungie.loadouts) || []).length >= 2)) {
    compareBtn.click();
    await wait(220);
    check('Loadout-Vergleich zeigt Tabelle', Boolean(document.querySelector('.cmp-table')));
    document.querySelector('[data-cmp-close]')?.click();
    await wait(120);
  }
  const chkBtn = document.querySelector('[data-loadout-checklist]');
  if (chkBtn) {
    chkBtn.click();
    await wait(220);
    check('Loadout-Checkliste öffnet', Boolean(document.querySelector('.chk-row')));
    document.querySelector('[data-chk-close]')?.click();
    await wait(120);
  }
  check('In-Game-Loadouts im Loadout-Editor', /In-Game-Loadouts/.test(document.body.textContent || '') && Boolean(document.querySelector('#editorIngame .inv-ed-ingame-panel')));
  document.querySelector('.dinv-tab[data-tab="tools"]')?.click();
  await wait(260);
  const hudButton = toolsTabEl.querySelector('[data-tool-stats-hud]');
  check('Stat-HUD-Knopf vorhanden', Boolean(hudButton));
  if (hudButton) hudButton.click();
  await wait(80);
  check('Stat-HUD erhält Charakterdaten', Boolean(statsHudPayload && Array.isArray(statsHudPayload.characters) && statsHudPayload.characters.length >= 1),
    statsHudPayload && JSON.stringify(statsHudPayload).slice(0, 120));
  await openToolView('week');
  check('Woche im neuen Seitenstil', /Wochen-Checkliste/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.week-page')));
  check('Wochenvorlage mit Prioritäten', /Featured-Raid/.test(toolsText()) && /Grandmaster Vanguard Alert/.test(toolsText()) && /Xûr prüfen/.test(toolsText()));
  check('Woche bietet Kalender-Export', Boolean(toolsTabEl.querySelector('[data-tool-week-ics]')));
  check('Woche zeigt „Was fehlt diese Woche?“', Boolean(toolsTabEl.querySelector('.week-missing')) && /Was fehlt diese Woche/.test(toolsText()), toolsTabEl.querySelector('.week-missing')?.textContent?.slice(0, 160) || 'fehlt');
  check('Woche zeigt Rotationsquellen', Boolean(toolsTabEl.querySelector('.week-sources')) && /Rotationsquellen/.test(toolsText()) && toolsTabEl.querySelectorAll('[data-week-source-link]').length >= 3);
  check('Wochen-Ansichten vorhanden', toolsTabEl.querySelectorAll('[data-week-view]').length >= 5);
  const firstWeekCheck = toolsTabEl.querySelector('[data-tool-check]');
  if (firstWeekCheck) {
    firstWeekCheck.checked = !firstWeekCheck.checked;
    firstWeekCheck.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await wait(120);
  check('Wochenpunkt abhakbar',
    ((cfg.checklist && cfg.checklist.items) || []).some((entry) => entry.auto && entry.done),
    JSON.stringify((cfg.checklist && cfg.checklist.items) || []).slice(0, 120));
  check('Wochen-Checkliste zeigt Reset', /Reset in/.test(toolsText()), toolsText().slice(0, 140));
  check('Woche zeigt Reset- und Daily-Timer', /Wochenreset/.test(toolsText()) && /Daily-Reset/.test(toolsText()));
  check('Woche filtert nach Klasse', toolsTabEl.querySelectorAll('[data-week-char]').length === 4);
  check('Woche hat Wiederholungen', Boolean(toolsTabEl.querySelector('[data-tool-check-repeat]')));
  check('Woche kann offene Punkte übernehmen', Boolean(toolsTabEl.querySelector('[data-tool-week-carry]')));
  check('Poststelle bietet Godroll-Schutz', /Godrolls behalten/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-tool-pm-godrolls]')));
  check('Wochenübersicht mit Xûr', /Wochenübersicht/.test(toolsText()) && /Xûr/.test(toolsText()));
  check('Wochenrückblick vorhanden', /Wochenrückblick/.test(toolsText()));
  check('Encounter-Bibliothek vorhanden', /Encounter-Bibliothek/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-enc-lib-add]')));
  check('Discord-Digest vorhanden', /Discord-Digest/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-digest-test]')));
  check('Digest als Bild exportierbar', Boolean(toolsTabEl.querySelector('[data-digest-image]')));
  const libEncounter = toolsTabEl.querySelector('[data-enc-lib-add]');
  const encBefore = JSON.stringify((cfg.bungie && cfg.bungie.encounterTracker) || {});
  if (libEncounter) libEncounter.click();
  await wait(260);
  const encAfter = JSON.stringify((cfg.bungie && cfg.bungie.encounterTracker) || {});
  check('Encounter aus Bibliothek übernommen', encAfter !== encBefore, libEncounter ? 'ok' : 'kein Knopf');
  check('Poststellen-Filter vorhanden', Boolean(toolsTabEl.querySelector('[data-tool-postmaster-filter]')));
  check('Triumph-Karte vorhanden', /Triumphs & Siegel/.test(toolsText()));
  check('Clan-Roster-Karte vorhanden', /Clan-Roster/.test(toolsText()));
  check('Nightfall-Karte vorhanden', /Nightfall & GM/.test(toolsText()));
  check('Aktionsprotokoll-Karte vorhanden', /Aktionsprotokoll/.test(toolsText()));
  const weekInput = toolsTabEl.querySelector('[data-tool-check-input]');
  if (weekInput) weekInput.value = 'Wochen-Test';
  toolsTabEl.querySelector('[data-tool-check-add]')?.click();
  await wait(80);
  check('Wochen-Checkliste speichert Punkt',
    ((cfg.checklist && cfg.checklist.items) || []).some((entry) => entry.text === 'Wochen-Test'),
    JSON.stringify((cfg.checklist && cfg.checklist.items) || []).slice(0, 120));
  toolsTabEl.querySelector('[data-tool-milestones]')?.click();
  await wait(120);
  check('Wochen-Aktionen ladbar', /Wochen-Testaktion/.test(toolsText()));
  await openToolView('collection');
  check('DIM-Triumph-Übersicht', /Verfolgte Triumphe/.test(toolsText()) && /Triumphe/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.dim-records-page')));
  check('Triumph-Suche vorhanden', Boolean(toolsTabEl.querySelector('[data-record-search]')));
  check('Triumph-Verlauf vorhanden', /Verlauf/.test(toolsText()));
  check('Triumph Fast geschafft', /Fast geschafft/.test(toolsText()) && /Test-Triumph Fast/.test(toolsText()));
  check('Sammlungs-Grid vorhanden', Boolean(toolsTabEl.querySelector('.dim-collectible-grid')) && /Test-Sammelstück/.test(toolsText()));
  check('Godroll-Fortschritt vorhanden', /Wunschrollen & Fortschritt/.test(toolsText()));
  check('Zielbrett vorhanden', /Zielbrett/.test(toolsText()));
  const godFold = [...toolsTabEl.querySelectorAll('details[data-lazy-fold] > summary')].find((entry) => /Wunschrollen/.test(entry.textContent || ''));
  if (godFold) godFold.click();
  await wait(500);
  check('Godroll-Gewichte vorhanden', Boolean(toolsTabEl.querySelector('[data-god-weight]')));
  check('Perk-Gewichte vorhanden', Boolean(toolsTabEl.querySelector('[data-god-perk-weight]')) || /Perk-Gewichte/.test(toolsText()));
  const recordSearchInput = toolsTabEl.querySelector('[data-record-search]');
  if (recordSearchInput) {
    recordSearchInput.value = 'Fast';
    recordSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await wait(360);
  check('Triumph-Suche filtert', Boolean(toolsTabEl.querySelector('.dim-records-search-results')) && /Test-Triumph Fast/.test(toolsText()), toolsText().slice(0, 160));
  toolsTabEl.querySelector('[data-record-search-clear]')?.click();
  await wait(140);
  const recordPin = toolsTabEl.querySelector('[data-record-pin="9001"]');
  if (recordPin) recordPin.click();
  await wait(160);
  check('Triumph verfolgbar', Boolean(toolsTabEl.querySelector('.dim-records-tracked .dim-record-card')) && /9001/.test(String(window.localStorage.getItem('d2tool.trackedTriumphs') || '')),
    String(window.localStorage.getItem('d2tool.trackedTriumphs') || '').slice(0, 120));
  toolsTabEl.querySelector('[data-record-open="9001"]')?.click();
  await wait(140);
  const recordDialog = document.querySelector('.dim-record-dialog');
  check('Triumph-Detailoverlay', Boolean(recordDialog) && /Ziele/.test(recordDialog.textContent) && /Bosse besiegen/.test(recordDialog.textContent));
  recordDialog?.querySelector('[data-record-close]')?.click();
  await wait(100);
  toolsTabEl.querySelector('[data-collection-tab="crafting"]')?.click();
  await wait(180);
  check('Crafting-Seite im engram-Stil', /Crafting-Fortschritt/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.craft-page')));
  check('Crafting zeigt Musterfortschritt', /2\/5/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.craft-patternline')));
  check('Crafting-Ansichten vorhanden', toolsTabEl.querySelectorAll('[data-craft-view]').length === 3 && /Nach Quelle/.test(toolsText()));
  toolsTabEl.querySelector('[data-craft-view="status"]')?.click();
  await wait(160);
  check('Crafting Statusansicht', /Noch offen/.test(toolsText()) && /Geschmiedet/.test(toolsText()), toolsText().slice(0, 180));
  toolsTabEl.querySelector('.craft-weapon')?.click();
  await wait(160);
  check('Crafting-Details klappen auf', Boolean(toolsTabEl.querySelector('.craft-detail')) && /Tiefenblick/.test(toolsText()));
  toolsTabEl.querySelector('[data-craft-view="source"]')?.click();
  await wait(120);
  check('Crafting-Quellenansicht', /Saisons/.test(toolsText()) && /Raids/.test(toolsText()));
  check('Tresor-Aufräumen-Karte vorhanden', /Tresor-Aufräumen/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-vc-start]')));
  toolsTabEl.querySelector('[data-collection-tab="sources"]')?.click();
  await wait(180);
  check('Quellen-Seite vorhanden', /Quellen & Beute/.test(toolsText()) && Boolean(toolsTabEl.querySelector('.sources-page')));
  check('Quellen-Karten vorhanden', Boolean(toolsTabEl.querySelector('.source-card')) && /Raid: Test-Raid/.test(toolsText()));
  check('Quellen-Farmhinweise', /So farmst du/.test(toolsText()) && /Featured-Rotation|Feuerteam/.test(toolsText()));
  check('Quellen zeigen Besitzquote', /im Besitz ·/.test(toolsText()));
  check('Quellen haben Sortierung', Boolean(toolsTabEl.querySelector('[data-loot-sort]')));
  check('Quellen haben Farmroute', /Farmroute/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-loot-route]')));
  check('Quellen nennen Drop-Quelle', /Drop:/.test(toolsText()));
  check('Quellen zeigen Wochen-Empfehlung', Boolean(toolsTabEl.querySelector('.sources-picks')));
  check('Quellen-Red-Border', /Red Border/.test(toolsText()));
  check('Quellen-Ansichten vorhanden', toolsTabEl.querySelectorAll('[data-loot-view]').length >= 5);
  toolsTabEl.querySelector('[data-loot-view="raid"]')?.click();
  await wait(150);
  const raidSourceCards = toolsTabEl.querySelectorAll('.sources-grid .source-card');
  check('Quellen-Tab filtert', raidSourceCards.length === 1 && raidSourceCards[0].classList.contains('source-raid'), String(raidSourceCards.length));
  check('Cleanup-Optionen für Waffen und Rüstung', /Waffen-Optionen/.test(toolsText()) && /Rüstungs-Optionen/.test(toolsText()));
  check('Wunschlisten-Gesundheit vorhanden', /Quellen-Gesundheit/.test(toolsText()));
  check('Exoten-Tracker vorhanden', /Exoten im Inventar/.test(toolsText()));
  check('Loot-Ziel-Knopf vorhanden', Boolean(toolsTabEl.querySelector('[data-tool-loot-goal]')));
  toolsTabEl.querySelector('[data-collection-tab="cleanup"]')?.click();
  await wait(180);
  toolsTabEl.querySelector('[data-vc-start]')?.click();
  await wait(220);
  check('Tresor-Prüfung startet', Boolean(toolsTabEl.querySelector('.vc-review')) && toolsTabEl.querySelectorAll('.vc-item').length > 0,
    toolsTabEl.querySelectorAll('.vc-item').length);
  check('Tresor-Prüfung zeigt Behalten/Entfernen', /Zu behalten/.test(toolsText()) && /Zu entfernen/.test(toolsText()));
  check('Tresor-Prüfung hat Strategien', /Alles behalten/.test(toolsText()) && /Beste Power/.test(toolsText()) && /Beste PvE/.test(toolsText()));
  const vcItemBtn = toolsTabEl.querySelector('.vc-item');
  if (vcItemBtn) vcItemBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 400, clientY: 400 }));
  await wait(120);
  const vcTip = document.querySelector('.vc-tooltip.show');
  check('Item-Overlay beim Aufräumen', Boolean(vcTip) && /Behalten|Aussortieren/.test(vcTip.textContent || ''), vcTip && vcTip.textContent.slice(0, 160));
  if (vcItemBtn) vcItemBtn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  await wait(80);
  check('Item-Overlay schließt', !document.querySelector('.vc-tooltip.show'));
  // Scrollverhalten im Aufräum-Assistenten: Strategiewechsel und
  // Options-Schalter dürfen die Ansicht nicht nach oben werfen.
  const vcStrategyBtn = toolsTabEl.querySelector('[data-vc-strategy="keepPower"]');
  if (vcStrategyBtn) {
    toolsTabEl.scrollTop = Math.min(320, Math.max(0, toolsTabEl.scrollHeight - toolsTabEl.clientHeight));
    await wait(80);
    const vcScrollBefore = toolsTabEl.scrollTop;
    vcStrategyBtn.click();
    await wait(240);
    check('Aufräum-Strategie hält die Scrollposition', vcScrollBefore < 40 || Math.abs(toolsTabEl.scrollTop - vcScrollBefore) <= 2,
      `vorher ${vcScrollBefore} · nachher ${toolsTabEl.scrollTop}`);
  }
  toolsTabEl.querySelector('[data-vc-settings]')?.click();
  await wait(160);
  const vcOptionBox = toolsTabEl.querySelector('[data-vc-option]');
  if (vcOptionBox) {
    toolsTabEl.scrollTop = Math.min(320, Math.max(0, toolsTabEl.scrollHeight - toolsTabEl.clientHeight));
    await wait(80);
    const vcOptionBefore = toolsTabEl.scrollTop;
    vcOptionBox.click();
    await wait(240);
    check('Aufräum-Option hält die Scrollposition', vcOptionBefore < 40 || Math.abs(toolsTabEl.scrollTop - vcOptionBefore) <= 2,
      `vorher ${vcOptionBefore} · nachher ${toolsTabEl.scrollTop}`);
  }
  await openToolView('vendor');
  document.querySelector('[data-tool-xur]')?.click();
  await wait(150);
  check('Xûr-Item geladen', /Legendäre Splitter/.test(toolsText()));
  check('DIM-Händlerliste mit Gruppen', /Turm/.test(toolsText()) && /Banshee-44/.test(toolsText()) && /Ada-1/.test(toolsText()) && toolsTabEl.querySelectorAll('.dim-vendor').length >= 2,
    toolsTabEl.querySelectorAll('.dim-vendor').length);
  const firstVendor = toolsTabEl.querySelector('.dim-vendor');
  if (firstVendor) firstVendor.open = true;
  const vendorItemButton = toolsTabEl.querySelector('.dim-vendor-item');
  if (vendorItemButton) {
    vendorItemButton.click();
    await wait(120);
  }
  const vendorModal = document.querySelector('.vendor-item-modal:not(.hidden)');
  check('Händler-Item öffnet Detaildialog statt Inventar', Boolean(vendorModal) && /Testgewehr/.test(vendorModal.textContent || ''),
    vendorModal ? vendorModal.textContent.slice(0, 160) : 'kein Dialog');
  check('Händler-Detail zeigt Beschreibung, Werte und Kosten', Boolean(vendorModal) && /Testgewehr mit Beschreibung/.test(vendorModal.textContent || '') && /Waffen\s*80/.test(vendorModal.textContent || '') && /Glimmer/.test(vendorModal.textContent || ''),
    vendorModal ? vendorModal.textContent.slice(0, 240) : 'kein Dialog');
  check('Händler-Detail zeigt angebotene Rolls', Boolean(vendorModal) && /Angebotene Rolls/.test(vendorModal.textContent || '') && /Kleinkaliber/.test(vendorModal.textContent || ''),
    vendorModal ? vendorModal.textContent.slice(0, 300) : 'kein Dialog');
  check('Händler-Detail zeigt Roll-Check', Boolean(vendorModal) && /Roll-Check/.test(vendorModal.textContent || '') && /\d+\/100/.test(vendorModal.textContent || ''),
    vendorModal ? vendorModal.textContent.slice(0, 260) : 'kein Dialog');
  const vendorLinkButton = vendorModal?.querySelector('[data-vendor-item-link]');
  if (vendorLinkButton) {
    vendorLinkButton.click();
    await wait(50);
  }
  check('Händler-Angebot teilt Deep-Link', /^d2tool:\/\/vendor\?v=\d+&i=\d+/.test(clipboardText), clipboardText);
  vendorModal?.querySelector('[data-vendor-item-close]')?.click();
  const subOfferTile = [...toolsTabEl.querySelectorAll('.dim-vendor-item')].find((tile) => /Mehr seltsame Angebote/.test(tile.title || ''));
  if (subOfferTile) {
    subOfferTile.click();
    await wait(140);
  }
  const subOfferModal = document.querySelector('.vendor-item-modal:not(.hidden)');
  check('Händler-Zugang zeigt Angebote des Unterhändlers', Boolean(subOfferModal) && /Angebote in/.test(subOfferModal.textContent || '') && /Waffen-Mod/.test(subOfferModal.textContent || ''),
    subOfferModal ? subOfferModal.textContent.slice(0, 260) : 'kein Dialog');
  subOfferModal?.querySelector('[data-vendor-item-close]')?.click();
  if (firstVendor) {
    const vendorHash = '350061650';
    const vendorForOpen = document.querySelector(`[data-vendor-hash="${vendorHash}"]`);
    const summary = vendorForOpen ? vendorForOpen.querySelector('summary') : null;
    if (vendorForOpen && vendorForOpen.open) summary.click();
    await wait(30);
    if (summary) summary.click();
    await wait(40);
    const missingToggle = toolsTabEl.querySelector('[data-vendor-missing]');
    if (missingToggle) {
      missingToggle.checked = true;
      missingToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(120);
      const missingAfter = toolsTabEl.querySelector('[data-vendor-missing]');
      if (missingAfter) {
        missingAfter.checked = false;
        missingAfter.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await wait(140);
    }
    const reopened = document.querySelector(`[data-vendor-hash="${vendorHash}"]`);
    check('Händler-Reiter bleibt nach Neu-Rendern offen', Boolean(reopened && reopened.open), reopened ? String(reopened.open) : 'fehlt');
  }

  check('DIM-Händler zeigt Kategorien und Items', /Waffen/.test(toolsText()) && /Fokussierte Dekodierung/.test(toolsText()) && /Testgewehr/.test(toolsText()));
  check('DIM-Händler zeigt Kosten und Countdown', /25\.000/.test(toolsText()) && /T \d+:\d\d|Dauerhaft/.test(toolsText()));
  await wait(240);
  check('Händler zeigt Roll-Vorschau in der Liste', Boolean(toolsTabEl.querySelector('.dim-vendor-item-roll')) && /Flüchtiger Abschuss/.test(toolsText()), toolsTabEl.querySelector('.dim-vendor-item-roll')?.textContent || 'keine Roll-Zeile');
  check('Händler zeigt Einkaufs-Zusammenfassung', Boolean(toolsTabEl.querySelector('[data-vendor-shopping-copy]')) && /fehlend/.test(toolsText()));
  check('Händler zeigt Rotationshistorie', Boolean(toolsTabEl.querySelector('.dim-vendor-history')) && /Abruf|Angebote/.test(toolsText()), toolsTabEl.querySelector('.dim-vendor-history')?.textContent || 'keine Historie');
  check('Händler zeigt Einkaufs-Optimierer', Boolean(toolsTabEl.querySelector('.dim-shopping')) && /Einkaufs-Optimierer/.test(toolsText()) && /Materiallücken|Material/.test(toolsText()), toolsTabEl.querySelector('.dim-shopping')?.textContent?.slice(0, 200) || 'fehlt');
  check('Händler-Diagnose vorhanden', Boolean(toolsTabEl.querySelector('.dim-vendor-diag')) && /Händler-Diagnose/.test(toolsText()) && Boolean(toolsTabEl.querySelector('[data-vendor-diag-copy]')));
  toolsTabEl.scrollTop = Math.min(600, Math.max(0, toolsTabEl.scrollHeight - toolsTabEl.clientHeight));
  const scrollBeforeRender = toolsTabEl.scrollTop;
  window.dispatchEvent(new CustomEvent('d2-tools-view', { detail: { view: 'vendor' } }));
  await wait(120);
  check('Hintergrund-Render hält die Scrollposition', scrollBeforeRender < 40 || Math.abs(toolsTabEl.scrollTop - scrollBeforeRender) <= 2,
    `vorher ${scrollBeforeRender} · nachher ${toolsTabEl.scrollTop}`);
  // Tippen in einem Filterfeld darf die Ansicht nicht nach oben werfen.
  const vendorFilterField = toolsTabEl.querySelector('[data-vendor-search]');
  if (vendorFilterField) {
    toolsTabEl.scrollTop = Math.min(420, Math.max(0, toolsTabEl.scrollHeight - toolsTabEl.clientHeight));
    await wait(80);
    const scrollBeforeFilter = toolsTabEl.scrollTop;
    vendorFilterField.value = 'e';
    vendorFilterField.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(260);
    check('Filter-Tippen hält die Scrollposition', scrollBeforeFilter < 40 || Math.abs(toolsTabEl.scrollTop - scrollBeforeFilter) <= 2,
      `vorher ${scrollBeforeFilter} · nachher ${toolsTabEl.scrollTop}`);
    const resetFilterField = toolsTabEl.querySelector('[data-vendor-search]');
    if (resetFilterField) {
      resetFilterField.value = '';
      resetFilterField.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(200);
    }
  }
  await openToolView('builds');
  await wait(260);
  check('Picker markiert Händler-Teile', Boolean(toolsTabEl.querySelector('.picker-piece-vendor')) || [...toolsTabEl.querySelectorAll('.picker-candidate')].some((entry) => /🏪/.test(entry.textContent || '')),
    toolsTabEl.querySelector('.picker-piece-vendor') ? 'Stück markiert' : 'kein Händler-Badge');
  await openToolView('vendor');
  await wait(220);
  const vendorPinButton = toolsTabEl.querySelector('[data-vendor-pin]');
  if (vendorPinButton) {
    vendorPinButton.click();
    await wait(80);
  }
  const pinnedVendors = (() => { try { return JSON.parse(localStorage.getItem('d2tool.pinnedVendors') || '[]'); } catch (error) { return []; } })();
  check('Händler lässt sich anheften', Array.isArray(pinnedVendors) && pinnedVendors.length >= 1, JSON.stringify(pinnedVendors));
  const pinAfter = toolsTabEl.querySelector('[data-vendor-pin].on');
  if (pinAfter) { pinAfter.click(); await wait(80); }
  const vendorSearchInput = toolsTabEl.querySelector('[data-vendor-search]');
  if (vendorSearchInput) {
    vendorSearchInput.value = 'Testpuls';
    vendorSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(260);
  }
  check('Händler-Suche filtert Angebote', /Testpuls/.test(toolsText()) && !/Testgewehr/.test(toolsText()), toolsText().slice(0, 220));
  if (vendorSearchInput) {
    const cleared = toolsTabEl.querySelector('[data-vendor-search]');
    if (cleared) {
      cleared.value = '';
      cleared.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(260);
    }
  }
  window.dispatchEvent(new CustomEvent('d2-vendor-open', { detail: { vendorHash: 672118013, itemHash: 3001 } }));
  await wait(360);
  const deepLinkModal = document.querySelector('.vendor-item-modal:not(.hidden)');
  check('Händler-Deep-Link öffnet Angebot', Boolean(deepLinkModal) && /Testgewehr/.test(deepLinkModal.textContent || '') && /Banshee-44/.test(deepLinkModal.textContent || ''),
    deepLinkModal ? deepLinkModal.textContent.slice(0, 220) : 'kein Dialog');
  deepLinkModal?.querySelector('[data-vendor-item-close]')?.click();
  check('Xûr zeigt Godroll-/Upgrade-Badges', /Godroll/.test(toolsText()) && /besser/.test(toolsText()) && /fehlt:/.test(toolsText()), toolsText().slice(0, 240));
  check('Xûr zeigt Kaufempfehlung', /Kaufempfehlung/.test(toolsText()));
  check('Xûr bietet Wishlist-Filter', Boolean(toolsTabEl.querySelector('[data-tool-xur-wish]')) && /Wishlist-Treffer/.test(toolsText()));
  const xurRow = toolsTabEl.querySelector('[data-xur-tip]');
  if (xurRow) xurRow.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await wait(60);
  const xurTip = document.querySelector('#toolsXurTooltip');
  check('Xûr-Tooltip zeigt Wishlist-Quelle', Boolean(xurTip && /PvE Godroll|Quelle/.test(xurTip.textContent || '')), xurTip && xurTip.textContent);
  check('Xûr-Details im Hover', Boolean(xurTip && /Testbeschreibung/.test(xurTip.textContent || '')), xurTip && xurTip.textContent);
  check('Xûr-Unterhändler und Besitz', /Seltsame Ausrüstungsangebote/.test(toolsText()) && /im Besitz/.test(toolsText()));
  if (xurRow) xurRow.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  if (xurRow) {
    xurRow.click();
    await wait(120);
  }
  const xurDetailModal = document.querySelector('.vendor-item-modal:not(.hidden)');
  check('Xûr-Item öffnet Detail mit Werten und Rolls', Boolean(xurDetailModal) && /Waffen/.test(xurDetailModal.textContent || '') && /42/.test(xurDetailModal.textContent || '') && /Angebotene Rolls/.test(xurDetailModal.textContent || '') && /Anderer Lauf/.test(xurDetailModal.textContent || ''),
    xurDetailModal ? xurDetailModal.textContent.slice(0, 280) : 'kein Dialog');
  xurDetailModal?.querySelector('[data-vendor-item-close]')?.click();
  document.querySelector('[data-tool-xur-overlay]')?.click();
  await wait(80);
  check('Xûr-Overlay-Knopf öffnet Fenster', xurOverlayOpened === 1, xurOverlayOpened);
  // Duplikate + Session-Loot: zwei Kopien und ein neues Item einspeisen.
  payload.backpack.c1.push(
    item({ hash: 3001, instanceId: 'i-k2', name: 'Testgewehr', bucket: B.KINETIC, power: 1890 }),
    item({ hash: 3001, instanceId: 'i-k3', name: 'Testgewehr', bucket: B.KINETIC, power: 1880 }),
    weapon(3103, 'i-new', 'Neues Testgewehr', B.KINETIC)
  );
  document.querySelector('#inventoryRefresh').click();
  await wait(900);
  check('Neu-Badge am Item', Boolean(document.querySelector('.dinv-tile-new')));
  document.querySelector('[data-tab="tools"]').click();
  await wait(150);
  await openToolView('collection');
  check('Session-Loot listet neues Item', /Neues Testgewehr/.test(toolsText()), toolsText().slice(0, 200));
  const perkCard = [...document.querySelectorAll('.inv-tool-card')].find((card) => /Perk-Lexikon/.test(card.textContent || ''));
  check('Perk-Lexikon ohne Mods/Shader', Boolean(perkCard) && !/Waffenmod|Shader|Leere Mod-Fassung|Eingebauter Shader/.test(perkCard.textContent || ''), perkCard && perkCard.textContent.slice(0, 200));
  check('Perk-Lexikon listet Waffen-Perk', Boolean(perkCard) && /Kleinkaliber|Vorpal Weapon/.test(perkCard.textContent || ''), perkCard && perkCard.textContent.slice(0, 200));
  const copyDupes = document.querySelector('[data-tool-copy-dupes]');
  check('Aussortier-Hilfe findet Duplikate', Boolean(copyDupes));
  check('Duplikat-Empfehlung mit Score', /Score/.test(toolsText()));
  if (copyDupes) copyDupes.click();
  await wait(80);
  check('Aussortier-Liste kopierbar', /Aussortier-Kandidaten/.test(clipboardText), clipboardText.slice(0, 80));
  // Offline-Stand: Banner + lesbare Daten aus dem Snapshot.
  payload.offline = true;
  payload.cachedAt = Date.now();
  payload.offlineError = 'Test: Bungie nicht erreichbar';
  document.querySelector('#inventoryRefresh').click();
  await wait(700);
  check('Offline-Banner in den Werkzeugen', Boolean(toolsTabEl.querySelector('.inv-tool-offline')), toolsTabEl.querySelector('.inv-tool-offline')?.textContent);
  delete payload.offline;
  delete payload.cachedAt;
  delete payload.offlineError;
  document.querySelector('#inventoryRefresh').click();
  await wait(700);
  document.querySelector('[data-tab="inventory"]').click();
  await wait(120);
  // Verschieben/Anlegen darf keinen vollen Inventar-Neuabruf auslösen
  // (der frühere 2,5-s-Reload blockierte die Oberfläche).
  const callsBeforeMove = inventoryCalls;
  const moveTile = document.querySelector('.dinv-tile[data-inv-select="i-k2"]');
  check('Verschiebe-Testitem sichtbar', Boolean(moveTile));
  if (moveTile) {
    moveTile.click();
    await wait(120);
    document.querySelector('.inv-popup [data-inv-act="to-vault"]')?.click();
    await wait(350);
  }
  check('Verschieben ohne vollen Neuabruf', inventoryCalls === callsBeforeMove, `${inventoryCalls}/${callsBeforeMove}`);
  check('Item lokal im Tresor', Boolean(document.querySelector('.dinv-tile[data-inv-select="i-k2"][data-inv-kind="vault"]')));
  const vaultTile = document.querySelector('.dinv-tile[data-inv-select="i-k2"][data-inv-kind="vault"]');
  if (vaultTile) {
    vaultTile.click();
    await wait(120);
    document.querySelector('.inv-popup [data-inv-act="equip-from-vault"]')?.click();
    await wait(500);
  }
  check('Anlegen ohne vollen Neuabruf', inventoryCalls === callsBeforeMove, `${inventoryCalls}/${callsBeforeMove}`);
  check('Item lokal angelegt', Boolean(document.querySelector('.dinv-tile.equipped[data-inv-select="i-k2"]')));

  // --- Offline-Ausgang: fehlgeschlagener Transfer wird gepuffert ---
  transferResponse = { ok: false, error: 'Netzwerk nicht erreichbar' };
  const queueTile = document.querySelector('.dinv-tile[data-inv-select="i-arms2"][data-inv-kind="backpack"]');
  if (queueTile) {
    queueTile.click();
    await wait(120);
    document.querySelector('.inv-popup [data-inv-act="to-vault"]')?.click();
    await wait(350);
  }
  let outboxStored = [];
  try { outboxStored = JSON.parse(localStorage.getItem('d2tool.outbox') || '[]'); } catch (error) { outboxStored = []; }
  check('Offline-Ausgang puffert fehlgeschlagenen Transfer',
    outboxStored.length === 1 && /Netzwerk/.test(outboxStored[0].lastError || ''),
    JSON.stringify(outboxStored));
  check('Offline-Ausgang sichtbar',
    Boolean(document.querySelector('#inventoryOutbox')) && !document.querySelector('#inventoryOutbox').classList.contains('hidden'));
  check('Item bleibt bei Fehler in der Beutetasche',
    Boolean(document.querySelector('.dinv-tile[data-inv-select="i-arms2"][data-inv-kind="backpack"]')));
  transferResponse = null;
  document.querySelector('#inventoryOutboxRun')?.click();
  await wait(450);
  let outboxAfter = [];
  try { outboxAfter = JSON.parse(localStorage.getItem('d2tool.outbox') || '[]'); } catch (error) { outboxAfter = []; }
  check('Offline-Ausgang sendet nach Erfolg', outboxAfter.length === 0, JSON.stringify(outboxAfter));

  // --- Offline-Ausgang: Detailpanel, Sortieren, einzelne Aktionen ---
  transferResponse = { ok: false, error: 'Netzwerk nicht erreichbar' };
  for (const id of ['i-legs2', 'i-class2']) {
    const tile = document.querySelector(`.dinv-tile[data-inv-select="${id}"][data-inv-kind="backpack"]`);
    if (!tile) continue;
    tile.click();
    await wait(120);
    document.querySelector('.inv-popup [data-inv-act="to-vault"]')?.click();
    await wait(320);
  }
  let outboxTwo = [];
  try { outboxTwo = JSON.parse(localStorage.getItem('d2tool.outbox') || '[]'); } catch (error) { outboxTwo = []; }
  check('Offline-Ausgang sammelt mehrere Aktionen', outboxTwo.length === 2, `${outboxTwo.length}`);
  document.querySelector('#inventoryOutboxDetails')?.click();
  await wait(80);
  const outboxPanelEl = document.querySelector('#inventoryOutboxPanel');
  check('Offline-Ausgang Detailpanel offen', Boolean(outboxPanelEl) && !outboxPanelEl.classList.contains('hidden'));
  check('Offline-Ausgang listet Aktionen',
    document.querySelectorAll('#inventoryOutboxList .inventory-outbox-row').length === 2,
    document.querySelectorAll('#inventoryOutboxList .inventory-outbox-row').length);
  const firstBefore = outboxTwo[0]?.id;
  document.querySelector('[data-outbox-down="0"]')?.click();
  await wait(60);
  let reordered = [];
  try { reordered = JSON.parse(localStorage.getItem('d2tool.outbox') || '[]'); } catch (error) { reordered = []; }
  check('Offline-Ausgang lässt sich sortieren', reordered[1]?.id === firstBefore, reordered.map((entry) => entry.id).join(','));
  document.querySelector(`[data-outbox-remove="${reordered[0]?.id}"]`)?.click();
  await wait(60);
  let oneLeft = [];
  try { oneLeft = JSON.parse(localStorage.getItem('d2tool.outbox') || '[]'); } catch (error) { oneLeft = []; }
  check('Offline-Ausgang entfernt einzelne Aktion', oneLeft.length === 1, `${oneLeft.length}`);
  document.querySelector('#inventoryOutboxClose')?.click();
  await wait(60);
  check('Offline-Ausgang Detailpanel schließt', Boolean(outboxPanelEl) && outboxPanelEl.classList.contains('hidden'));
  transferResponse = null;
  try { localStorage.removeItem('d2tool.outbox'); } catch (error) { /* egal */ }
  window.dispatchEvent(new CustomEvent('d2-outbox-change'));
  await wait(60);

  // --- Dashboard 2.0: Kommandostand mit Prioritäten + Aktionen ---
  let dashOpenedInventory = 0;
  cfg.bungie.apiKey = 'test-key';
  const dash = createDashboard({
    api,
    getConfig: () => cfg,
    setConfig,
    getCategories: () => [],
    selectCategory: () => {},
    web: { hide() {}, show() {}, navigate() { return true; }, preload() {} },
    hideError: () => {},
    showEmpty: () => {},
    pageTitle: { textContent: '' },
    siteDesc: { textContent: '' },
    loadState: { textContent: '' },
    loadingBar: { classList: { add() {}, remove() {} } },
    emptyState: { classList: { add() {}, remove() {} } },
    updateWindowTitle: () => {},
    checklistToggle: () => {},
    openBungieSettings: () => {},
    openInventory: () => { dashOpenedInventory += 1; },
    onOpen: () => {},
    toast: () => {},
    escapeHtml,
    icon: () => '',
    formatDuration: (ms) => `${Math.max(0, Math.round(Number(ms) / 1000))} s`,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    qs,
    qsa
  });
  dash.open();
  await wait(800);
  const dashPanel = document.querySelector('#dashboardPanel');
  const dashText = () => (dashPanel && dashPanel.textContent) || '';
  check('Dashboard öffnet als Kommandostand', Boolean(dashPanel && !dashPanel.classList.contains('hidden')),
    `cls=${dashPanel && dashPanel.className}`);
  check('Dashboard zeigt „Jetzt erledigen“', /Jetzt erledigen/.test(dashText()));
  check('Dashboard zeigt Hüter und Power', /Hüter/.test(dashText()) && /Power/.test(dashText()));
  check('Dashboard zeigt Champion-Check', /Champion-Check/.test(dashText()) && /Anti-Barriere/.test(dashText()) && /Überladung/.test(dashText()), dashText().slice(0, 260));
  check('Dashboard zeigt Power & Infusion', /Power & Infusion/.test(dashText()) && /Schwächster Slot/.test(dashText()) && /Aktuell \d+ Licht/.test(dashText()), dashText().slice(0, 260));
  check('Dashboard zeigt Power & Infusion', /Power & Infusion/.test(dashText()) && /Schwächster Slot/.test(dashText()) && /Aktuell \d+ Licht/.test(dashText()), dashText().slice(0, 260));
  check('Dashboard zeigt Triumph-Fortschritt', /Triumph-Fortschritt/.test(dashText()) && /Test-Triumph Fast/.test(dashText()) && /Aktive Punkte/.test(dashText()), dashText().slice(0, 260));
  check('Dashboard zeigt Sammlung & Vorrat', /Sammlung & Vorrat/.test(dashText()));
  check('Dashboard nennt Tresor-Kapazität 1300', /Tresor \/ 1300/.test(dashText()), dashText().slice(0, 220));
  check('Dashboard zeigt Bungie-Status', /Bungie-Status/.test(dashText()) && /Hüter#1/.test(dashText()), dashText().slice(0, 300));
  check('Dashboard zeigt Datenstatus', /Datenstatus/.test(dashText()) && /Manifest/.test(dashText()));
  check('Dashboard ohne entfernte Wochenkarte', !/Fehlt noch diese Woche/.test(dashText()));
  check('Dashboard lädt Saison-Ziele initial', /Saison-Ziel Test/.test(dashText()), dashText().slice(0, 260));
  check('Dashboard zeigt letzte Aktivitäten', /Letzte Aktivitäten/.test(dashText()) && /Test-Aktivität/.test(dashText()), dashText().slice(0, 300));
  const analyticsBody = dashPanel && dashPanel.querySelector('#dashAnalyticsBody');
  const analyticsText = () => (analyticsBody && analyticsBody.textContent) || '';
  check('Dashboard zeigt Aktivitäts-Analyse',
    /Aktivitäten 7 Tage/.test(analyticsText()) && /Raids & Dungeons/.test(analyticsText()) && /Tage in Folge/.test(analyticsText()),
    analyticsText().slice(0, 200));
  check('Aktivitäts-Analyse zeigt 14-Tage-Balken',
    Boolean(analyticsBody) && analyticsBody.querySelectorAll('.dash-bar').length === 14,
    analyticsBody ? analyticsBody.querySelectorAll('.dash-bar').length : -1);
  check('Aktivitäts-Analyse zeigt 12-Wochen-Heatmap',
    Boolean(analyticsBody) && analyticsBody.querySelectorAll('.dash-heatmap i').length === 84,
    analyticsBody ? analyticsBody.querySelectorAll('.dash-heatmap i').length : -1);
  check('Aktivitäts-Analyse zeigt Kategorien',
    Boolean(analyticsBody) && analyticsBody.querySelectorAll('.dash-cat').length >= 5,
    analyticsBody ? analyticsBody.querySelectorAll('.dash-cat').length : -1);
  const analyticsKpis = analyticsBody ? [...analyticsBody.querySelectorAll('.dash-kpi b')].map((el) => el.textContent) : [];
  check('Aktivitäts-Analyse berechnet KPIs',
    analyticsKpis[0] === '7' && analyticsKpis[1] === '8' && analyticsKpis[2] === '4' && analyticsKpis[3] === '7' && analyticsKpis[5] === '40',
    analyticsKpis.join(','));
  check('Dashboard hat Digest und Support', Boolean(dashPanel.querySelector('[data-dash-digest]')) && Boolean(dashPanel.querySelector('[data-dash-support]')));
  check('Klasse heißt Warlock statt Beschwörer', !/Beschwörer/.test(document.body.textContent || ''));
  const enDict = window.__I18N_EN__ || {};
  check('EN: Titan bleibt Titan', enDict.Titan === 'Titan' && !Object.values(enDict).includes('Titanium'), `${enDict.Titan}`);
  check('EN: Klassen korrekt', enDict['Jäger'] === 'Hunter' && enDict.Warlock === 'Warlock' && !Object.values(enDict).includes('Summoner'),
    `${enDict['Jäger']}/${enDict.Warlock}`);
  check('Dashboard ohne Schnellzugriff', !/Schnellzugriff/.test(dashText()));
  check('Dashboard berechnet Godroll-Priorität', /Godroll/.test(dashText()), dashText().slice(0, 220));

  // --- Dashboard-Karten: Größe und Suche ---
  const sizeSelect = dashPanel.querySelector('#dashCardSize');
  if (sizeSelect) {
    sizeSelect.value = 'l';
    sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  check('Dashboard-Kartengröße L', dashPanel.classList.contains('dash-size-l') && cfg.dashboardCardSize === 'l', dashPanel.className);
  const cardSearch = dashPanel.querySelector('#dashCardSearch');
  if (cardSearch) {
    cardSearch.value = 'Champion';
    cardSearch.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const championCard = dashPanel.querySelector('#dashChampions');
  const powerCard = dashPanel.querySelector('#dashPower');
  check('Dashboard-Kartensuche filtert',
    Boolean(championCard) && !championCard.classList.contains('dash-filtered') &&
    Boolean(powerCard) && powerCard.classList.contains('dash-filtered'),
    `champ=${championCard?.className} power=${powerCard?.className}`);
  check('Dashboard-Kartensuche zeigt Trefferzahl', /\d+\/\d+/.test(dashPanel.querySelector('#dashCardSearchCount')?.textContent || ''),
    dashPanel.querySelector('#dashCardSearchCount')?.textContent || '');
  if (cardSearch) {
    cardSearch.value = '';
    cardSearch.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (sizeSelect) {
    sizeSelect.value = 'm';
    sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  cfg.dashboardCardSizes = { dashChampions: 'l' };
  dash.render();
  await wait(120);
  check('Dashboard-Karte einzeln groß', Boolean(dashPanel.querySelector('#dashChampions.dash-card-l')),
    dashPanel.querySelector('#dashChampions')?.className);
  const dashPresetSelect = dashPanel.querySelector('[data-dash-preset]');
  if (dashPresetSelect) {
    dashPresetSelect.value = 'today';
    dashPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(150);
  }
  check('Dashboard Heute-Ansicht blendet Karten aus',
    Boolean(dashPanel.querySelector('#dashChampions.dash-user-hidden')),
    dashPanel.querySelector('#dashChampions')?.className);
  if (dashPresetSelect) {
    dashPresetSelect.value = 'all';
    dashPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(120);
  }
  cfg.dashboardCardSizes = {};
  const dashGodBtn = dashPanel && dashPanel.querySelector('[data-dash-action="godrolls"]');
  check('Dashboard-Aktion „Godrolls“ vorhanden', Boolean(dashGodBtn));
  if (dashGodBtn) dashGodBtn.click();
  await wait(200);
  check('Dashboard-Aktion öffnet Godroll-Filter',
    dashOpenedInventory === 1 && Boolean(document.querySelector('#inventoryGodrollFilter.active')),
    `opened=${dashOpenedInventory} cls=${document.querySelector('#inventoryGodrollFilter')?.className}`);
  dash.hide();
  document.querySelector('#inventoryGodrollFilter')?.click();
  await wait(120);

  // --- Overlay-Schnellzugriff auf Loadouts ---
  if (!document.getElementById('overlayLoadoutPanel')) {
    const overlayHost = document.createElement('div');
    overlayHost.innerHTML = '<button id="overlayLoadoutsBtn" aria-expanded="false"></button>' +
      '<div id="overlayLoadoutPanel" class="hidden"><div id="overlayLoadoutList"></div><p id="overlayLoadoutHint"></p></div>';
    document.body.appendChild(overlayHost);
  }
  let overlayCfg = {
    bungie: {
      loadouts: [
        { id: 'lo-a', name: 'Alpha', pinned: true, classType: 0, items: [{ name: 'Helm' }], mods: [] },
        { id: 'lo-b', name: 'Beta', pinned: true, classType: 1, items: [], mods: [{ h: 1 }] },
        { id: 'lo-c', name: 'Gamma', pinned: false, classType: 2, items: [{ name: 'Brust' }], mods: [] }
      ],
      loadoutStats: { 'lo-c': { lastUsedAt: 12345 } }
    }
  };
  let overlayApplied = '';
  let overlayOpened = 0;
  const overlayLo = createOverlayLoadouts({
    getCfg: () => overlayCfg,
    escapeHtml,
    toast: () => {},
    openInventory: () => { overlayOpened += 1; },
    applyLoadout: (id) => { overlayApplied = String(id); }
  });
  overlayLo.open();
  const overlayRows = () => [...document.querySelectorAll('#overlayLoadoutList [data-overlay-loadout]')];
  check('Overlay-Loadouts zeigt nur angeheftete', overlayRows().length === 2 && overlayRows()[0].dataset.overlayLoadout === 'lo-a',
    overlayRows().map((row) => row.dataset.overlayLoadout).join(','));
  check('Overlay-Loadouts markiert Anheftung', Boolean(document.querySelector('#overlayLoadoutList .overlay-lo-item.pinned')));
  overlayRows()[1]?.click();
  await wait(60);
  check('Overlay-Loadout wird angewendet', overlayApplied === 'lo-b' && overlayOpened === 1, `${overlayApplied}/${overlayOpened}`);
  check('Overlay-Loadouts schließt nach Klick', Boolean(document.querySelector('#overlayLoadoutPanel')?.classList.contains('hidden')));
  overlayCfg = {
    bungie: {
      loadouts: [
        { id: 'lo-x', name: 'X', classType: 0, items: [] },
        { id: 'lo-y', name: 'Y', classType: 0, items: [] }
      ],
      loadoutStats: { 'lo-y': { lastUsedAt: 99999 } }
    }
  };
  overlayLo.open();
  check('Overlay-Loadouts ohne Pin: zuletzt genutzt zuerst', overlayRows()[0]?.dataset.overlayLoadout === 'lo-y',
    overlayRows().map((row) => row.dataset.overlayLoadout).join(','));
  check('Overlay-Loadouts Hinweis sichtbar', /anheften/i.test(document.querySelector('#overlayLoadoutHint')?.textContent || ''));
  overlayLo.close();

  // --- Feste Tooltips bei UI-Zoom (TV-Modus 1,25) ---
  document.body.style.zoom = '1.25';
  document.body.style.setProperty('--ui-zoom', '1.25');
  document.querySelector('.dinv-tab[data-tab="tools"]')?.click();
  document.querySelector('[data-tool-view="builds"]')?.click();
  await wait(220);
  const pickerAtZoom = document.querySelector('.armor-picker');
  const pickerZoomRect = pickerAtZoom ? pickerAtZoom.getBoundingClientRect() : null;
  check('Picker bleibt bei UI-Zoom im Bild',
    Boolean(pickerZoomRect) && pickerZoomRect.left >= 0 && pickerZoomRect.right <= window.innerWidth + 1
      && pickerAtZoom.scrollWidth <= pickerAtZoom.clientWidth + 1,
    pickerZoomRect ? JSON.stringify({ left: pickerZoomRect.left, right: pickerZoomRect.right, w: window.innerWidth, sw: pickerAtZoom.scrollWidth, cw: pickerAtZoom.clientWidth }) : 'kein Picker');
  const zoomProbe = document.createElement('div');
  zoomProbe.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:620px;background:#000;color:#fff;z-index:9000';
  zoomProbe.textContent = 'Tooltip-Test';
  document.body.appendChild(zoomProbe);
  positionFixedTip(zoomProbe, window.innerWidth - 20, window.innerHeight - 20, { offset: 14, padding: 10, maxWidth: 320 });
  await wait(60);
  const zoomRect = zoomProbe.getBoundingClientRect();
  check('Tooltip bleibt bei UI-Zoom im Bild',
    zoomRect.left >= 0 && zoomRect.top >= 0 && zoomRect.right <= window.innerWidth + 1 && zoomRect.bottom <= window.innerHeight + 1,
    JSON.stringify({ left: zoomRect.left, top: zoomRect.top, right: zoomRect.right, bottom: zoomRect.bottom, w: window.innerWidth, h: window.innerHeight }));
  zoomProbe.remove();
  const popupBackdrop = document.createElement('div');
  popupBackdrop.className = 'inv-popup-backdrop open';
  popupBackdrop.innerHTML = '<div class="inv-popup"><div class="inv-popup-body"><div class="inv-popup-actions">Aktionen</div><div class="inv-popup-title">Gegenstandskarte mit langem Text, der bei UI-Zoom vollständig sichtbar bleiben muss.</div></div></div>';
  document.body.appendChild(popupBackdrop);
  await wait(60);
  const popupRect = popupBackdrop.querySelector('.inv-popup').getBoundingClientRect();
  check('Item-Popup bleibt bei UI-Zoom im Bild',
    popupRect.left >= 0 && popupRect.top >= 0 && popupRect.right <= window.innerWidth + 1 && popupRect.bottom <= window.innerHeight + 1,
    JSON.stringify({ left: popupRect.left, top: popupRect.top, right: popupRect.right, bottom: popupRect.bottom, w: window.innerWidth, h: window.innerHeight }));
  popupBackdrop.remove();
  document.body.style.zoom = '1.5';
  document.body.style.setProperty('--ui-zoom', '1.5');
  const zoomProbe2 = document.createElement('div');
  zoomProbe2.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:620px;background:#000;color:#fff;z-index:9000';
  document.body.appendChild(zoomProbe2);
  positionFixedTip(zoomProbe2, window.innerWidth - 20, window.innerHeight - 20, { offset: 14, padding: 10, maxWidth: 320 });
  await wait(60);
  const zoomRect2 = zoomProbe2.getBoundingClientRect();
  check('Tooltip bleibt bei 150 % Zoom im Bild',
    zoomRect2.left >= 0 && zoomRect2.top >= 0 && zoomRect2.right <= window.innerWidth + 1 && zoomRect2.bottom <= window.innerHeight + 1,
    JSON.stringify({ left: zoomRect2.left, top: zoomRect2.top, right: zoomRect2.right, bottom: zoomRect2.bottom, w: window.innerWidth, h: window.innerHeight }));
  zoomProbe2.remove();
  document.body.style.zoom = '';
  document.body.style.setProperty('--ui-zoom', '1');

  const onboarding = createOnboarding({
    api,
    getConfig: () => cfg,
    setConfig,
    toast: () => {},
    openSettings: () => {}
  });
  onboarding.open();
  await wait(100);
  check('Einrichtungs-Assistent öffnet', /Destiny 2 Tool einrichten/.test(document.body.textContent || ''));
  onboarding.close();
  check('Einrichtungs-Assistent schließt', Boolean(document.querySelector('.onboarding-backdrop.hidden')));

  // --- Inventar-Virtualisierung: große Listen in 120er-Blöcken ----------
  try {
    const e2eBefore = window.__D2_E2E;
    const tabEl = document.querySelector('.dinv-tab.on');
    const tabBefore = tabEl ? tabEl.dataset.tab : 'tools';
    window.__D2_E2E = false;
    document.body.classList.remove('pad-active');
    const godrollFilter = document.querySelector('#inventoryGodrollFilter');
    if (godrollFilter && godrollFilter.classList.contains('active')) godrollFilter.click();
    const invSearch = document.querySelector('#inventorySearch');
    if (invSearch) {
      invSearch.value = '';
      invSearch.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory' } }));
    await wait(220);
    const helper = window.__d2invTest;
    const plan = helper && helper.chunkPlan
      ? [helper.chunkPlan(581, 0), helper.chunkPlan(581, 120), helper.chunkPlan(581, 480), helper.chunkPlan(581, 581)]
      : [];
    check('Chunk-Plan teilt große Listen in 120er-Blöcke',
      plan.length === 4 && plan[0].end === 120 && plan[0].more === true && plan[1].end === 240 &&
        plan[2].end === 581 && plan[2].more === false && plan[3].more === false,
      plan.map((entry) => `${entry && entry.end}/${entry && entry.more}`).join(' '));
    const html = helper && helper.chunkHtml ? helper.chunkHtml(581) : '';
    const probe = document.createElement('div');
    probe.innerHTML = html;
    const probeTiles = probe.querySelectorAll('.dinv-tile-wrap').length;
    const probeMore = probe.querySelector('[data-inv-chunk-more]');
    check('Große Liste rendert zuerst nur 120 Kacheln',
      probeTiles === 120 && Boolean(probeMore) && /120\/581/.test(probeMore.textContent || ''),
      `${probeTiles} · ${probeMore ? probeMore.textContent : '-'}`);
    probe.remove();
    const wraps = [...document.querySelectorAll('#inventoryView .dinv-tile-wrap')];
    const computed = wraps.length ? getComputedStyle(wraps[0]).contentVisibility : '';
    const heights = [...new Set(wraps.map((tile) => Math.round(tile.getBoundingClientRect().height)))];
    check('Kacheln nutzen Paint-Virtualisierung mit fester Höhe',
      wraps.length > 10 && computed === 'auto' && heights.length === 1 && heights[0] === 79,
      `${wraps.length} Kacheln · ${computed} · ${heights.join('/')}`);
    window.__D2_E2E = e2eBefore;
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: tabBefore } }));
    await wait(160);
  } catch (error) {
    window.__D2_E2E = true;
    check('Große Liste rendert zuerst nur 120 Kacheln', false, String((error && error.message) || error));
  }

  // --- TV-Modus: Inventar muss die Zellbreite nutzen ---------------------
  try {
    const tabEl = document.querySelector('.dinv-tab.on');
    const tabBack = tabEl ? tabEl.dataset.tab : 'tools';
    document.body.classList.add('tv-mode');
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory' } }));
    await wait(220);
    const sub = document.querySelector('#inventoryBody .dinv-sub:not(.vault)');
    const tracks = sub ? getComputedStyle(sub).gridTemplateColumns.split(' ').filter(Boolean) : [];
    const columns = tracks.length;
    const cellWidth = tracks.length ? parseFloat(tracks[0]) : 0;
    const tile = sub ? sub.querySelector('.dinv-tile') : null;
    const tileHeight = tile ? Math.round(tile.getBoundingClientRect().height) : 0;
    // Viewport-unabhängig: entscheidend ist die feste Zellbreite (76 px),
    // nicht wie viele Spalten auf dem jeweiligen Testmonitor passen.
    check('TV-Inventar nutzt die Zellbreite', columns >= 2 && cellWidth >= 70 && cellWidth <= 90, `${columns} Spalten à ${cellWidth}px`);
    check('TV-Inventar nutzt größere Kacheln', tileHeight >= 70, `${tileHeight}px`);
    document.body.classList.remove('tv-mode');
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: tabBack } }));
    await wait(160);
  } catch (error) {
    document.body.classList.remove('tv-mode');
    check('TV-Inventar nutzt die Zellbreite', false, String((error && error.message) || error));
  }

  // --- Controller: auch Off-Screen-Kacheln müssen erreichbar sein ------
  try {
    const tabEl = document.querySelector('.dinv-tab.on');
    const tabBack = tabEl ? tabEl.dataset.tab : 'tools';
    document.body.classList.add('pad-active');
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory' } }));
    await wait(220);
    const tiles = [...document.querySelectorAll('#inventoryBody .dinv-tile')];
    const probe = tiles[Math.min(50, Math.max(0, tiles.length - 1))];
    const rect = probe ? probe.getBoundingClientRect() : { width: 0, height: 0 };
    const wrap = probe ? probe.closest('.dinv-tile-wrap') : null;
    const visibility = wrap ? getComputedStyle(wrap).contentVisibility : '';
    check('Controller erreicht Off-Screen-Kacheln',
      Boolean(probe) && rect.width > 3 && rect.height > 3 && visibility === 'visible',
      `${Math.round(rect.width)}x${Math.round(rect.height)} · ${visibility}`);
    document.body.classList.remove('pad-active');
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: tabBack } }));
    await wait(160);
  } catch (error) {
    document.body.classList.remove('pad-active');
    check('Controller erreicht Off-Screen-Kacheln', false, String((error && error.message) || error));
  }

  // --- Overlay-Inventar: kompakt und ohne doppelte Leisten --------------
  try {
    const tabEl = document.querySelector('.dinv-tab.on');
    const tabBack = tabEl ? tabEl.dataset.tab : 'tools';
    document.body.classList.add('mode-overlay', 'inventory-open');
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory' } }));
    await wait(220);
    const sub = document.querySelector('#inventoryBody .dinv-sub:not(.vault)');
    const overlayTracks = sub ? getComputedStyle(sub).gridTemplateColumns.split(' ').filter(Boolean) : [];
    const columns = overlayTracks.length;
    const overlayCell = overlayTracks.length ? parseFloat(overlayTracks[0]) : 0;
    const tile = sub ? sub.querySelector('.dinv-tile') : null;
    const tileHeight = tile ? Math.round(tile.getBoundingClientRect().height) : 0;
    const titleEl = document.querySelector('.inventory-view-head > div:first-child');
    const padHintEl = document.querySelector('.inventory-pad-hint');
    const titleHidden = !titleEl || getComputedStyle(titleEl).display === 'none';
    const padHintHidden = !padHintEl || getComputedStyle(padHintEl).display === 'none';
    check('Overlay-Inventar nutzt die Zellbreite', columns >= 2 && overlayCell >= 58 && overlayCell <= 70, `${columns} Spalten à ${overlayCell}px`);
    check('Overlay-Inventar ist kompakt', tileHeight >= 60 && titleHidden && padHintHidden, `${tileHeight}px · Titel ${titleHidden} · Hinweis ${padHintHidden}`);
    document.body.classList.remove('mode-overlay', 'inventory-open');
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: tabBack } }));
    await wait(160);
  } catch (error) {
    document.body.classList.remove('mode-overlay', 'inventory-open');
    check('Overlay-Inventar nutzt die Zellbreite', false, String((error && error.message) || error));
  }

  try {
    for (const tip of document.querySelectorAll('.inventory-tooltip.show, .vc-tooltip.show, #armorPickerTooltip.show, #toolsXurTooltip.show')) {
      tip.classList.remove('show');
      tip.innerHTML = '';
    }
    const shotTile = document.querySelector('.dinv-tile[title^="Perk-Testwaffe"]');
    if (shotTile) {
      shotTile.click();
      await wait(350);
      const shotCell = document.querySelector('.inv-popup .inv-perk-cell[data-inv-perk-opt="6131"]');
      if (shotCell) shotCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await wait(350);
    }
  } catch (error) {
    // Screenshot-Vorbereitung darf den Test nie beeinflussen.
  }
}

try {
  await run();
  check('Keine unerwarteten Renderer-Fehler', pageErrors.length === 0, pageErrors.join(' | '));
  result.ok = result.errors.length === 0;
} catch (error) {
  result.errors.push('Ausnahme: ' + (error && (error.stack || error.message) || String(error)));
  result.ok = false;
}
window.__INVTEST__ = result;
console.log('INVTEST ' + JSON.stringify(result));
