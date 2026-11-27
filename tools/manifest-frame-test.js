'use strict';

// ============================================================
// Manifest-Rahmen (Intrinsic Frame) für Champion-Breaker
// ============================================================
// Prüft die reine Rahmen-Ermittlung aus electron/main.js ohne App-Start.
// Der Block ist dort markiert (manifest-frame-block) und frei von Electron,
// damit dieser Test die echte Implementierung per vm ausführt.
// Aufruf: node tools/manifest-frame-test.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
const START = '// >>> manifest-frame-block';
const END = '// <<< manifest-frame-block';

let checks = 0;
let failed = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) return;
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` – ${detail}` : ''}`);
}

const start = MAIN.indexOf(START);
const end = MAIN.indexOf(END);
if (start < 0 || end < 0 || end < start) {
  console.error('Manifest-Rahmen-Test: Block fehlt in electron/main.js.');
  process.exit(1);
}
const block = MAIN.slice(start, end + END.length);
const vmSandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  `${block}\nmodule.exports = { manifestFrameInfo, manifestPerkBreaker, manifestBreakerFromText };`,
  vmSandbox,
  { filename: 'electron/main.js#manifest-frame' }
);
const { manifestFrameInfo, manifestPerkBreaker, manifestBreakerFromText } = vmSandbox.module.exports;
check('Block exportiert manifestFrameInfo', typeof manifestFrameInfo === 'function');
check('Block exportiert manifestPerkBreaker', typeof manifestPerkBreaker === 'function');
check('Block exportiert manifestBreakerFromText', typeof manifestBreakerFromText === 'function');

const INTRINSIC = 3956125808;
const WEAPON_PERKS = 4241085061;
const WEAPON_MODS = 2685412949;
const SMG = 3954685534;
const plug = (name, breakerType, perks = []) => ({ displayProperties: { name }, breakerType, perks });
const weaponWithIntrinsic = (entries, indexes = [0]) => ({
  // Echte Waffen tragen oft nur ihre Typ-Kategorie (z. B. SMG), nicht 41.
  itemCategoryHashes: [SMG],
  sockets: {
    socketCategories: [
      { socketCategoryHash: WEAPON_PERKS, socketIndexes: [] },
      { socketCategoryHash: INTRINSIC, socketIndexes: indexes }
    ],
    socketEntries: entries
  }
});
const weaponWithoutIntrinsic = (entries) => ({
  itemCategoryHashes: [SMG],
  sockets: {
    socketCategories: [{ socketCategoryHash: WEAPON_PERKS, socketIndexes: [] }],
    socketEntries: entries
  }
});

// ------------------------------------------------------------
// Waffen-Erkennung und Intrinsic-Kategorie
// ------------------------------------------------------------
{
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 101 }]), {
    101: plug('Adaptive Frame', 2)
  });
  check('Intrinsic-Kategorie liefert Rahmen und Breaker',
    result.name === 'Adaptive Frame' && result.breaker === 2, JSON.stringify(result));
}
{
  // SMG-Kategorie + WeaponPerks: wird als Waffe erkannt, obwohl 41 fehlt.
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 116 }]), {
    116: plug('Lightweight Frame', 0)
  });
  check('SMG-Kategorie + WeaponPerks gilt als Waffe',
    result.name === 'Lightweight Frame' && result.breaker === 0, JSON.stringify(result));
}
{
  // WeaponMods allein reicht ebenfalls als Waffen-Marker.
  const def = {
    itemCategoryHashes: [SMG],
    sockets: {
      socketCategories: [{ socketCategoryHash: WEAPON_MODS, socketIndexes: [] }],
      socketEntries: [{ singleInitialItemHash: 117 }]
    }
  };
  const result = manifestFrameInfo(def, { 117: plug('Precision Frame', 1) });
  check('WeaponMods allein gilt als Waffe',
    result.name === 'Precision Frame' && result.breaker === 1, JSON.stringify(result));
}
{
  // socketIndexes müssen auf den richtigen socketEntry zeigen.
  const result = manifestFrameInfo(weaponWithIntrinsic([
    { singleInitialItemHash: 999 },
    { singleInitialItemHash: 102 }
  ], [1]), {
    999: plug('Rampage', 0),
    102: plug('Precision Frame', 1)
  });
  check('socketIndexes werden korrekt abgebildet',
    result.name === 'Precision Frame' && result.breaker === 1, JSON.stringify(result));
}
{
  // singleInitialItemHash hat Vorrang vor reusablePlugItems.
  const result = manifestFrameInfo(weaponWithIntrinsic([{
    singleInitialItemHash: 103,
    reusablePlugItems: [{ plugItemHash: 104 }]
  }]), {
    103: plug('Aggressive Frame', 3),
    104: plug('Precision Frame', 1)
  });
  check('singleInitialItemHash hat Vorrang',
    result.name === 'Aggressive Frame' && result.breaker === 3, JSON.stringify(result));
}
{
  // Ohne singleInitialItemHash zählt der erste Reusable-Plug.
  const result = manifestFrameInfo(weaponWithIntrinsic([{
    singleInitialItemHash: 0,
    reusablePlugItems: [{ plugItemHash: 0 }, { plugItemHash: 105 }, { plugItemHash: 106 }]
  }]), {
    105: plug('Rapid-Fire Frame', 0),
    106: plug('Precision Frame', 1)
  });
  check('Erster reusablePlugItems-Plug wird genutzt',
    result.name === 'Rapid-Fire Frame' && result.breaker === 0, JSON.stringify(result));
}

// ------------------------------------------------------------
// Breaker aus Perks (Inventory-Definition)
// ------------------------------------------------------------
{
  // light.gg-Beispiel: Breaker hängt als Perk am Plug.
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 113 }]), {
    113: {
      displayProperties: { name: 'Lightweight Frame' },
      breakerType: 0,
      perks: [{ perkHash: 9001 }]
    },
    9001: { breakerType: 2 }
  });
  check('Rahmen-Perk liefert den Breaker',
    result.name === 'Lightweight Frame' && result.breaker === 2, JSON.stringify(result));
}
{
  // Item-Perk (z. B. Exot) hat Vorrang vor dem Rahmen-Plug.
  const result = manifestFrameInfo({
    ...weaponWithIntrinsic([{ singleInitialItemHash: 114 }]),
    breakerType: 0,
    perks: [{ perkHash: 9002 }]
  }, {
    114: plug('Adaptive Frame', 1),
    9002: { breakerType: 3 }
  });
  check('Item-Perk hat Vorrang vor dem Rahmen',
    result.name === 'Adaptive Frame' && result.breaker === 3, JSON.stringify(result));
}
{
  // Eigener breakerType der Item-Definition hat Vorrang vor Item-Perks.
  const result = manifestFrameInfo({
    ...weaponWithIntrinsic([{ singleInitialItemHash: 115 }]),
    breakerType: 1,
    perks: [{ perkHash: 9002 }]
  }, {
    115: plug('Adaptive Frame', 2),
    9002: { breakerType: 3 }
  });
  check('Item-breakerType hat Vorrang vor Item-Perks',
    result.name === 'Adaptive Frame' && result.breaker === 1, JSON.stringify(result));
}
{
  // Auch ohne erkannten Rahmen zählt ein Item-Perk für den Breaker.
  const result = manifestFrameInfo({
    ...weaponWithoutIntrinsic([{ singleInitialItemHash: 999 }]),
    breakerType: 0,
    perks: [{ perkHash: 9009 }]
  }, {
    999: plug('Rampage', 0),
    9009: { breakerType: 3 }
  });
  check('Item-Perk wirkt auch ohne erkannten Rahmen',
    result.name === '' && result.breaker === 3, JSON.stringify(result));
}
check('manifestPerkBreaker: eigener Breaker vor Perks',
  manifestPerkBreaker({ breakerType: 1, perks: [{ perkHash: 9002 }] }, { 9002: { breakerType: 3 } }) === 1);
check('manifestPerkBreaker: erster gültiger Perk gewinnt',
  manifestPerkBreaker({ breakerType: 0, perks: [{ perkHash: 9004 }, { perkHash: 9005 }] }, {
    9004: { breakerType: 4 },
    9005: { breakerType: 2 }
  }) === 2);
check('manifestPerkBreaker: plugItemHash/hash werden gelesen',
  manifestPerkBreaker({ breakerType: 0, perks: [{ plugItemHash: 9006 }] }, { 9006: { breakerType: 1 } }) === 1
  && manifestPerkBreaker({ breakerType: 0, perks: [{ hash: 9007 }] }, { 9007: { breakerType: 3 } }) === 3);

// ------------------------------------------------------------
// Breaker aus SandboxPerk-Namen
// ------------------------------------------------------------
check('Sandbox-Text: [Störung] Überladung → 2', manifestBreakerFromText('[Störung] Überladung') === 2);
check('Sandbox-Text: [Schildbrechend] Barriere → 1', manifestBreakerFromText('[Schildbrechend] Barriere') === 1);
check('Sandbox-Text: [Taumeln] Unaufhaltsam → 3', manifestBreakerFromText('[Taumeln] Unaufhaltsam') === 3);
check('Sandbox-Text: englische Varianten',
  manifestBreakerFromText('[Disruption] Overload') === 2
  && manifestBreakerFromText('[Shield-Piercing] Barrier') === 1
  && manifestBreakerFromText('[Stagger] Unstoppable') === 3);
check('Sandbox-Text: Ueberladung (ASCII) → 2', manifestBreakerFromText('Ueberladung') === 2);
check('Sandbox-Text: harmloser Name → 0', manifestBreakerFromText('Rampage') === 0);

{
  // Rahmen-Plug ohne breakerType, SandboxPerk liefert den Breaker.
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 118 }]), {
    118: plug('Lightweight Frame', 0, [{ perkHash: 9101 }])
  }, {
    9101: { displayProperties: { name: '[Störung] Überladung' } }
  });
  check('SandboxPerk am Rahmen-Plug liefert den Breaker',
    result.name === 'Lightweight Frame' && result.breaker === 2, JSON.stringify(result));
}
{
  // Item-Perk in der Sandbox (Exot) hat Vorrang vor dem Rahmen.
  const result = manifestFrameInfo({
    ...weaponWithIntrinsic([{ singleInitialItemHash: 119 }]),
    breakerType: 0,
    perks: [{ perkHash: 9102 }]
  }, {
    119: plug('Adaptive Frame', 1)
  }, {
    9102: { displayProperties: { name: '[Taumeln] Unaufhaltsam' } }
  });
  check('SandboxPerk am Item hat Vorrang vor dem Rahmen',
    result.name === 'Adaptive Frame' && result.breaker === 3, JSON.stringify(result));
}
{
  // Inventory-Perk-Definition hat Vorrang vor dem Sandbox-Namen.
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 120 }]), {
    120: plug('Precision Frame', 0, [{ perkHash: 9103 }]),
    9103: { breakerType: 1 }
  }, {
    9103: { displayProperties: { name: '[Störung] Überladung' } }
  });
  check('Inventory-Breaker vor Sandbox-Name',
    result.name === 'Precision Frame' && result.breaker === 1, JSON.stringify(result));
}
check('manifestPerkBreaker: Sandbox-Name als Fallback',
  manifestPerkBreaker({ breakerType: 0, perks: [{ perkHash: 9104 }] }, {}, {
    9104: { displayProperties: { name: '[Disruption] Overload' } }
  }) === 2);

// ------------------------------------------------------------
// Fallback ohne Intrinsic-Kategorie
// ------------------------------------------------------------
{
  const result = manifestFrameInfo(weaponWithoutIntrinsic([{ singleInitialItemHash: 107 }]), {
    107: plug('Wave Frame', 3)
  });
  check('Fallback erkennt Rahmen über den Plug-Namen',
    result.name === 'Wave Frame' && result.breaker === 3, JSON.stringify(result));
}
{
  const result = manifestFrameInfo(weaponWithoutIntrinsic([
    { singleInitialItemHash: 999 },
    { singleInitialItemHash: 0, reusablePlugItems: [{ plugItemHash: 108 }] }
  ]), {
    999: plug('Rampage', 0),
    108: plug('Support Frame', 0)
  });
  check('Fallback durchsucht auch reusablePlugItems',
    result.name === 'Support Frame' && result.breaker === 0, JSON.stringify(result));
}
{
  // Auch ein Plug mit Breaker, aber ohne Rahmen-Namen, darf im Fallback
  // nicht als Rahmen gelten.
  const result = manifestFrameInfo(weaponWithoutIntrinsic([{ singleInitialItemHash: 999 }]), {
    999: plug('Rampage', 2)
  });
  check('Nicht-Rahmen-Plug wird nicht fehlklassifiziert',
    result.name === '' && result.breaker === 0, JSON.stringify(result));
}
{
  const result = manifestFrameInfo(weaponWithoutIntrinsic([{ singleInitialItemHash: 400 }]), {
    400: plug('Präzisionsrahmen', 1)
  });
  check('Deutscher Rahmen-Name wird erkannt',
    result.name === 'Präzisionsrahmen' && result.breaker === 1, JSON.stringify(result));
}

// ------------------------------------------------------------
// Grenzen und Sonderfälle
// ------------------------------------------------------------
{
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 109 }]), {
    109: plug('Adaptive Frame', 4)
  });
  check('Ungültiger Frame-Breaker wird zu 0',
    result.name === 'Adaptive Frame' && result.breaker === 0, JSON.stringify(result));
}
{
  const longName = `Adaptive Frame ${'x'.repeat(80)}`;
  const result = manifestFrameInfo(weaponWithIntrinsic([{ singleInitialItemHash: 110 }]), {
    110: plug(longName, 2)
  });
  check('Rahmen-Name wird auf 60 Zeichen begrenzt', result.name.length === 60, String(result.name.length));
}
{
  check('Fehlende Definition ergibt leer',
    manifestFrameInfo(null, {}).name === '' && manifestFrameInfo(null, {}).breaker === 0);
  check('Fehlende defs ergibt leer',
    manifestFrameInfo(weaponWithIntrinsic([]), null).name === ''
      && manifestFrameInfo(weaponWithIntrinsic([]), null).breaker === 0);
}
{
  const def = weaponWithoutIntrinsic([{ singleInitialItemHash: 111 }]);
  def.sockets.socketCategories.push({ socketCategoryHash: 123, socketIndexes: [0] });
  const result = manifestFrameInfo(def, { 111: plug('Precision Frame', 1) });
  check('Fremde Kategorie nutzt den Namens-Fallback',
    result.name === 'Precision Frame' && result.breaker === 1, JSON.stringify(result));
}
{
  // Rüstung hat zwar Intrinsic-Sockets/Perks, aber keine WeaponPerks.
  const armorDef = {
    itemCategoryHashes: [20],
    breakerType: 0,
    perks: [{ perkHash: 9008 }],
    sockets: {
      socketCategories: [{ socketCategoryHash: INTRINSIC, socketIndexes: [0] }],
      socketEntries: [{ singleInitialItemHash: 112 }]
    }
  };
  const result = manifestFrameInfo(armorDef, {
    112: plug('Adaptive Frame', 2),
    9008: { breakerType: 3 }
  });
  check('Rüstung erhält keinen Rahmen',
    result.name === '' && result.breaker === 0, JSON.stringify(result));
}
{
  const result = manifestFrameInfo({
    ...weaponWithIntrinsic([{ singleInitialItemHash: 121 }]),
    breakerType: 1,
    perks: [{ perkHash: 1210 }]
  }, {
    121: plug('Adaptive Frame', 2),
    1210: { breakerType: 3 }
  });
  check('Item-Breaker bleibt vorrangig (Prioritätslogik)',
    result.name === 'Adaptive Frame' && result.breaker === 1, JSON.stringify(result));
}

// ------------------------------------------------------------
// Item-Breaker hat Vorrang (wie in ensureCompactItemNames)
// ------------------------------------------------------------
const compactBreaker = (itemBreaker, frameBreaker) => Math.round(Number(itemBreaker) || 0) || frameBreaker;
check('Item-Breaker hat Vorrang', compactBreaker(1, 2) === 1, String(compactBreaker(1, 2)));
check('Ohne Item-Breaker greift der Rahmen-Breaker', compactBreaker(0, 2) === 2, String(compactBreaker(0, 2)));
check('Fehlender Item-Breaker greift auf den Rahmen zurück', compactBreaker(undefined, 3) === 3, String(compactBreaker(undefined, 3)));

// ------------------------------------------------------------
// Verdrahtung im Cache/Snapshot (statisch)
// ------------------------------------------------------------
check('Cache wurde auf v7 gehoben (Writer und Reader)',
  (MAIN.match(/item-names-v7-/g) || []).length >= 2 && !/item-names-v[1-6]-/.test(MAIN));
check('Sandbox-Perk-Tabelle wird geladen und gecacht',
  MAIN.includes('async function loadRawSandboxPerks(version)')
  && MAIN.includes('sandbox-perks-${version}.json')
  && MAIN.includes('DestinySandboxPerkDefinition'));
check('ensureCompactItemNames lädt Sandbox-Perks',
  MAIN.includes('loadRawSandboxPerks(version)') && MAIN.includes('const frame = manifestFrameInfo(def, defs, sandbox);'));
check('Ungültig-Prüfung enthält fr', MAIN.includes('entry.fr === undefined'));
check('Cache-Eintrag speichert fr', /fr:\s*frame\.name/.test(MAIN));
check('Cache-Eintrag priorisiert den Item-Breaker',
  /bt:\s*Math\.round\(Number\(def\.breakerType\) \|\| 0\) \|\| frame\.breaker/.test(MAIN));
check('compactRawDefs übernimmt den Rahmen', (MAIN.match(/frame: info\.fr \|\| ''/g) || []).length >= 2);
check('ensureCompactItemNames nutzt manifestFrameInfo',
  MAIN.includes('const frame = manifestFrameInfo(def, defs, sandbox);'));
check('Waffe wird über WeaponPerks/WeaponMods erkannt',
  MAIN.includes('const MANIFEST_WEAPON_SOCKET_CATEGORIES = [4241085061, 2685412949];')
  && MAIN.includes('function manifestIsWeapon(def)'));
check('Keine Waffen-Erkennung mehr über Kategorie 41',
  !MAIN.includes('.itemCategoryHashes.includes(41)'));
check('Perk-Breaker nutzt Inventory-Definition und Sandbox-Name',
  MAIN.includes('function manifestPerkBreaker(def, defs, sandbox)')
  && MAIN.includes('manifestPerkBreaker(plugDef, defs, sandbox)')
  && MAIN.includes('const itemBreaker = manifestPerkBreaker(def, defs, sandbox);')
  && MAIN.includes('sandbox[String(hash)]'));
check('localApiItemList gibt frame aus', /frame: item\.frame \|\| ''/.test(MAIN));
check('Inventar-Snapshot gibt frame aus', /frame: info\.fr \|\| ''/.test(MAIN));

if (failed) {
  console.error(`\nMANIFEST-RAHMEN-TEST FEHLGESCHLAGEN: ${failed} von ${checks}.`);
  process.exit(1);
}
console.log(`Manifest-Rahmen-Test OK: ${checks} Prüfungen.`);
