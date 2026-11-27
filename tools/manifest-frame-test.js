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
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(
  `${block}\nmodule.exports = { manifestFrameInfo };`,
  sandbox,
  { filename: 'electron/main.js#manifest-frame' }
);
const { manifestFrameInfo } = sandbox.module.exports;
check('Block exportiert manifestFrameInfo', typeof manifestFrameInfo === 'function');

const INTRINSIC = 3956125808;
const plug = (name, breakerType) => ({ displayProperties: { name }, breakerType });
const withCategory = (entries, indexes = [0]) => ({
  itemCategoryHashes: [41],
  sockets: {
    socketCategories: [{ socketCategoryHash: INTRINSIC, socketIndexes: indexes }],
    socketEntries: entries
  }
});

// ------------------------------------------------------------
// Intrinsic-Kategorie
// ------------------------------------------------------------
{
  const result = manifestFrameInfo(withCategory([{ singleInitialItemHash: 101 }]), {
    101: plug('Adaptive Frame', 2)
  });
  check('Intrinsic-Kategorie liefert Rahmen und Breaker',
    result.name === 'Adaptive Frame' && result.breaker === 2, JSON.stringify(result));
}
{
  // socketIndexes müssen auf den richtigen socketEntry zeigen.
  const result = manifestFrameInfo(withCategory([
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
  const result = manifestFrameInfo(withCategory([{
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
  const result = manifestFrameInfo(withCategory([{
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
// Fallback ohne Intrinsic-Kategorie
// ------------------------------------------------------------
{
  const result = manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [{ singleInitialItemHash: 107 }] } }, {
    107: plug('Wave Frame', 3)
  });
  check('Fallback erkennt Rahmen über den Plug-Namen',
    result.name === 'Wave Frame' && result.breaker === 3, JSON.stringify(result));
}
{
  const result = manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [
    { singleInitialItemHash: 999 },
    { singleInitialItemHash: 0, reusablePlugItems: [{ plugItemHash: 108 }] }
  ] } }, {
    999: plug('Rampage', 0),
    108: plug('Support Frame', 0)
  });
  check('Fallback durchsucht auch reusablePlugItems',
    result.name === 'Support Frame' && result.breaker === 0, JSON.stringify(result));
}
{
  // Auch ein Plug mit Breaker, aber ohne Rahmen-Namen, darf im Fallback
  // nicht als Rahmen gelten.
  const result = manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [{ singleInitialItemHash: 999 }] } }, {
    999: plug('Rampage', 2)
  });
  check('Nicht-Rahmen-Plug wird nicht fehlklassifiziert',
    result.name === '' && result.breaker === 0, JSON.stringify(result));
}
{
  const result = manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [{ singleInitialItemHash: 400 }] } }, {
    400: plug('Präzisionsrahmen', 1)
  });
  check('Deutscher Rahmen-Name wird erkannt',
    result.name === 'Präzisionsrahmen' && result.breaker === 1, JSON.stringify(result));
}

// ------------------------------------------------------------
// Grenzen und Sonderfälle
// ------------------------------------------------------------
{
  const result = manifestFrameInfo(withCategory([{ singleInitialItemHash: 109 }]), {
    109: plug('Adaptive Frame', 4)
  });
  check('Ungültiger Frame-Breaker wird zu 0',
    result.name === 'Adaptive Frame' && result.breaker === 0, JSON.stringify(result));
}
{
  const longName = `Adaptive Frame ${'x'.repeat(80)}`;
  const result = manifestFrameInfo(withCategory([{ singleInitialItemHash: 110 }]), {
    110: plug(longName, 2)
  });
  check('Rahmen-Name wird auf 60 Zeichen begrenzt', result.name.length === 60, String(result.name.length));
}
{
  check('Fehlende Definition ergibt leer',
    manifestFrameInfo(null, {}).name === '' && manifestFrameInfo(null, {}).breaker === 0);
  check('Fehlende defs ergibt leer',
    manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [] } }, null).name === ''
      && manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [] } }, null).breaker === 0);
}
{
  const result = manifestFrameInfo({ itemCategoryHashes: [41], sockets: { socketEntries: [
    { singleInitialItemHash: 111 }
  ], socketCategories: [{ socketCategoryHash: 123, socketIndexes: [0] }] } }, {
    111: plug('Precision Frame', 1)
  });
  check('Fremde Kategorie nutzt den Namens-Fallback',
    result.name === 'Precision Frame' && result.breaker === 1, JSON.stringify(result));
}
{
  // Rüstung hat zwar Intrinsic-Sockets, aber keinen Waffen-Rahmen.
  const armorDef = {
    itemCategoryHashes: [20],
    sockets: {
      socketCategories: [{ socketCategoryHash: INTRINSIC, socketIndexes: [0] }],
      socketEntries: [{ singleInitialItemHash: 112 }]
    }
  };
  const result = manifestFrameInfo(armorDef, { 112: plug('Adaptive Frame', 2) });
  check('Rüstung erhält keinen Rahmen',
    result.name === '' && result.breaker === 0, JSON.stringify(result));
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
check('Cache wurde auf v5 gehoben', MAIN.includes('item-names-v5-') && !MAIN.includes('item-names-v4-'));
check('Ungültig-Prüfung enthält fr', MAIN.includes('entry.fr === undefined'));
check('Cache-Eintrag speichert fr', /fr:\s*frame\.name/.test(MAIN));
check('Cache-Eintrag priorisiert den Item-Breaker',
  /bt:\s*Math\.round\(Number\(def\.breakerType\) \|\| 0\) \|\| frame\.breaker/.test(MAIN));
check('compactRawDefs übernimmt den Rahmen', (MAIN.match(/frame: info\.fr \|\| ''/g) || []).length >= 2);
check('ensureCompactItemNames nutzt manifestFrameInfo',
  MAIN.includes('? manifestFrameInfo(def, defs)'));
check('Rahmen nur für Waffen (Kategorie 41)',
  MAIN.includes('const frame = Array.isArray(def.itemCategoryHashes) && def.itemCategoryHashes.includes(41)')
  && MAIN.includes('if (!itemCategories.includes(41)) return empty;'));
check('localApiItemList gibt frame aus', /frame: item\.frame \|\| ''/.test(MAIN));

if (failed) {
  console.error(`\nMANIFEST-RAHMEN-TEST FEHLGESCHLAGEN: ${failed} von ${checks}.`);
  process.exit(1);
}
console.log(`Manifest-Rahmen-Test OK: ${checks} Prüfungen.`);
