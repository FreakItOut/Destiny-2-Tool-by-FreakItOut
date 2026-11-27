'use strict';

// ============================================================
// Champion-Rahmen (Anti-Champion 2.0)
// ============================================================
// Prüft die zentrale Rahmen-Tabelle in renderer/js/champions.js:
// DE/EN-Namen, Spezial-vor-Basis, Priorität (Override > explizit >
// Rahmen), Wortgrenzen und unbekannte Rahmen. Reines Node, kein E2E.
// Aufruf: node tools/champion-frames-test.js

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`OK   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

function sameTypes(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

// DE- und EN-Fall pro Regel (Reihenfolge/Spezialregeln siehe champions.js).
const RULE_SAMPLES = {
  'micro-missile': ['Micro-Missile', 'Mikro-Raketen'],
  'double-fire': ['Double Fire', 'Doppelfeuer'],
  'rocket-assisted': ['Rocket-Assisted', 'Raketenunterstützt'],
  'compressed-wave': ['Compressed Wave', 'Komprimierte Welle'],
  'heavy-burst': ['Heavy Burst', 'Schwere Salve'],
  'aggressive-burst': ['Aggressive Burst', 'Aggressiver Stoß'],
  support: ['Support', 'Unterstützung'],
  'adaptive-burst': ['Adaptive Burst', 'Adaptiver Stoß'],
  'legacy-pr-55': ['Legacy PR-55', 'Legacy PR 55'],
  'disruption-sniper': ['Disruption', 'Störung'],
  caster: ['Caster', 'Zauberer'],
  precision: ['Precision', 'Präzision'],
  adaptive: ['Adaptive', 'Adaptiv'],
  lightweight: ['Lightweight', 'Leichtgewicht'],
  'rapid-fire': ['Rapid-Fire', 'Schnellfeuer'],
  'area-denial': ['Area Denial', 'Flächenschaden'],
  vortex: ['Vortex', 'Vortex'],
  'spread-shot': ['Spread Shot', 'Streuschuss'],
  'dynamic-heat': ['Dynamic Heat', 'Dynamische Hitze'],
  'balanced-heat': ['Balanced Heat', 'Ausgeglichene Hitze'],
  aggressive: ['Aggressive', 'Aggressiv'],
  'high-impact': ['High-Impact', 'Hochenergie'],
  wave: ['Wave', 'Welle']
};

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-champ-frames-'));
  const store = {};
  try {
    fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}', 'utf8');
    fs.copyFileSync(path.join(ROOT, 'renderer/js/champions.js'), path.join(temp, 'champions.js'));
    globalThis.window = {
      localStorage: {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; }
      }
    };
    const champions = await import(pathToFileURL(path.join(temp, 'champions.js')).href);
    const {
      FRAME_CHAMPION_RULES,
      frameBreakerType,
      championTypes,
      setChampionOverride
    } = champions;

    const frameType = (name) => frameBreakerType({ frame: name });

    // --- Tabelle: jede Regel mit DE- und EN-Fall -------------------
    check('Rahmen-Tabelle exportiert', Array.isArray(FRAME_CHAMPION_RULES) && FRAME_CHAMPION_RULES.length > 0,
      FRAME_CHAMPION_RULES && FRAME_CHAMPION_RULES.length);
    const ruleIds = FRAME_CHAMPION_RULES.map((rule) => rule.id).sort();
    const sampleIds = Object.keys(RULE_SAMPLES).sort();
    check('Jede Regel hat DE/EN-Testfälle', JSON.stringify(ruleIds) === JSON.stringify(sampleIds),
      `Regeln: ${ruleIds.join(', ')} | Fälle: ${sampleIds.join(', ')}`);
    for (const rule of FRAME_CHAMPION_RULES) {
      const samples = RULE_SAMPLES[rule.id] || [];
      check(`Regel ${rule.id}: DE+EN vorhanden`, samples.length >= 2, samples.length);
      for (const sample of samples) {
        check(`Regel ${rule.id}: ${sample} → ${rule.type}`, frameType(sample) === rule.type, frameType(sample));
      }
    }

    // --- Spezialrahmen vor Basisrahmen -----------------------------
    check('Support ist ausschließlich Überladung',
      ['Support', 'Unterstützung', 'Unterstützungsrahmen', 'Support AR', 'Unterstützungs-Autogewehr']
        .every((name) => frameType(name) === 2),
      ['Support', 'Unterstützung', 'Unterstützungsrahmen', 'Support AR', 'Unterstützungs-Autogewehr']
        .map((name) => `${name}=${frameType(name)}`).join(', '));
    check('Adaptive Burst wird als Barriere erkannt', frameType('Adaptive Burst') === 1, frameType('Adaptive Burst'));
    check('Compressed Wave wird als Unaufhaltsam erkannt', frameType('Compressed Wave') === 3, frameType('Compressed Wave'));

    // --- Priorität: Override > explizit > Rahmen -------------------
    check('Expliziter Breaker schlägt Rahmen',
      sameTypes(championTypes({ frame: 'Adaptive', breakerType: 2 }), [2]),
      championTypes({ frame: 'Adaptive', breakerType: 2 }));
    check('Expliziter Breaker aus Perk schlägt Rahmen',
      sameTypes(championTypes({ frame: 'Adaptive', perks: [{ breakerType: 3 }] }), [3]),
      championTypes({ frame: 'Adaptive', perks: [{ breakerType: 3 }] }));
    check('Expliziter Breaker aus Socket schlägt Rahmen',
      sameTypes(championTypes({
        frame: 'Schnellfeuer',
        socketColumns: [{ idx: 1, options: [{ breakerType: 1, selected: true }] }]
      }), [1]));
    const overrideItem = { instanceId: 'champ-override-test', frame: 'Adaptive', breakerType: 2 };
    setChampionOverride(overrideItem, 3);
    check('Override schlägt explizit und Rahmen', sameTypes(championTypes(overrideItem), [3]), championTypes(overrideItem));
    setChampionOverride(overrideItem, 0);
    check('Override entfernen fällt auf explizit zurück', sameTypes(championTypes(overrideItem), [2]), championTypes(overrideItem));

    // --- Unbekannt und Wortgrenzen ---------------------------------
    check('Unbekannt ohne Rahmendaten → 0', frameBreakerType({}) === 0, frameBreakerType({}));
    check('Unbekannt ohne Champion-Fähigkeit', championTypes({ frame: 'Unbekannter Rahmen' }).length === 0,
      championTypes({ frame: 'Unbekannter Rahmen' }));
    check('Wortgrenze: Wavelength ist kein Wave', frameType('Wavelength') === 0, frameType('Wavelength'));
    check('Wortgrenze: Waveform ist kein Wave', frameType('Waveform') === 0, frameType('Waveform'));
    check('Wave Frame bleibt Unaufhaltsam', frameType('Wave Frame') === 3, frameType('Wave Frame'));
    check('Wellen (Plural) bleibt Unaufhaltsam', frameType('Wellen') === 3, frameType('Wellen'));
    check('Deutsche Komposita: Wellenrahmen', frameType('Wellenrahmen') === 3, frameType('Wellenrahmen'));
    check('Deutsche Komposita: Präzisionsrahmen', frameType('Präzisionsrahmen') === 1, frameType('Präzisionsrahmen'));
    check('Deutsche Komposita: Unterstützungsrahmen', frameType('Unterstützungsrahmen') === 2, frameType('Unterstützungsrahmen'));

    // --- Nur Rahmen-/Intrinsic-Namen, keine Beschreibungen ---------
    check('Perk-Beschreibung zählt nicht',
      frameBreakerType({ perks: [{ n: 'Rampage', d: 'Aggressive Treffer', p: 'aggressive burst' }] }) === 0);
    check('Socket-Beschreibung zählt nicht',
      frameBreakerType({ socketColumns: [{ idx: 0, options: [{ n: 'Kleinkaliber', p: 'wave', d: 'aggressive' }] }] }) === 0);

    // --- Intrinsic-Sockets: selected bevorzugt, sonst alle ---------
    check('Intrinsic: ausgewählte Option hat Vorrang',
      frameBreakerType({
        socketColumns: [{ idx: 0, options: [
          { n: 'Präzision', selected: true },
          { n: 'Schnellfeuer', selected: false }
        ] }]
      }) === 1);
    check('Intrinsic: ohne Auswahl werden alle Optionen geprüft',
      frameBreakerType({ socketColumns: [{ idx: 0, options: [{ n: 'Schnellfeuer' }] }] }) === 2);
    check('Intrinsic schlägt Perk-Namen',
      frameBreakerType({
        socketColumns: [{ idx: 0, options: [{ n: 'Präzision', selected: true }] }],
        perks: [{ n: 'Schnellfeuer' }]
      }) === 1);

    // --- Perks: nur die ersten beiden ------------------------------
    check('Erste Perks werden geprüft', frameBreakerType({ perks: [{ n: 'Rapid-Fire' }] }) === 2);
    check('Nur die ersten zwei Perks zählen',
      frameBreakerType({ perks: [{ n: 'Rampage' }, { n: 'Vorpal Weapon' }, { n: 'Schnellfeuer' }] }) === 0);

    // --- Direkte Rahmenfelder --------------------------------------
    check('archetypeName wird ausgewertet', frameBreakerType({ archetypeName: 'Adaptive Burst' }) === 1);
    check('archetype.name wird ausgewertet', frameBreakerType({ archetype: { name: 'Aggressiver Rahmen' } }) === 3);
  } finally {
    delete globalThis.window;
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (error) { /* egal */ }
  }

  if (failures) {
    console.error(`Champion-Rahmen: ${failures} von ${checks} Prüfungen fehlgeschlagen.`);
    process.exitCode = 1;
  } else {
    console.log(`Champion-Rahmen OK: ${checks} Prüfungen.`);
  }
})().catch((error) => {
  console.error('Champion-Rahmen-Test abgebrochen:', error && (error.stack || error.message || error));
  process.exitCode = 1;
});
