'use strict';

// ============================================================
// Test: Perk-Spalten / Mod-Sockets (DIM-Verhalten)
// ============================================================
// Prüft die reine Socket-Aufbereitung aus electron/socket-columns.js
// mit den ECHTEN DestinySocketCategoryStyle-Werten:
//   1 Reusable, 2 Consumable, 3 Unlockable, 4 Intrinsic, 6 LargePerk

const assert = require('assert');
const { buildSocketDisplays } = require('../electron/socket-columns');

let passed = 0;
function check(label, condition, detail) {
  if (!condition) {
    console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`OK   ${label}`);
}

// Plug-Namen (p = plugCategoryIdentifier).
const names = {
  1001: { n: 'Mikro-Raketen-Gehäuse', p: 'intrinsics', i: '/frame.png' },
  1011: { n: 'Schnelle Schüsse', p: 'tubes', i: '/p1.png' },
  1012: { n: 'Smart-Driftsteuerung', p: 'tubes', i: '/p2.png' },
  1021: { n: 'Taktisches Magazin', p: 'magazines', i: '/p3.png' },
  1022: { n: 'Hochexplosives Geschütz', p: 'magazines_gl', i: '/p4.png' },
  1031: { n: 'Leuchtsignal-Geschosse', p: 'frames', i: '/p5.png' },
  1032: { n: 'Schlüpfling', p: 'frames', i: '/p6.png' },
  1033: { n: 'Impulsverstärker', p: 'frames', i: '/p7.png' },
  1041: { n: 'Kaskade-Punkt', p: 'frames', i: '/p8.png' },
  1042: { n: 'Waffenbeherrschung', p: 'frames', i: '/p9.png' },
  1043: { n: 'Raserei', p: 'frames', i: '/p10.png' },
  1051: { n: 'Eingebauter Shader', p: 'shader', i: '/s.png' },
  1052: { n: 'Superschwarz', p: 'shader', i: '/s2.png' },
  1061: { n: 'Vollautomatik-Nachrüstung', p: 'v400.weapon.mod_guns', i: '/m.png' },
  1062: { n: 'Zielkorrektor', p: 'v400.weapon.mod_guns', i: '/m2.png' },
  1071: { n: 'Stufe 4: Nachladetempo', p: 'v400.plugs.weapons.masterworks.stat.reload', i: '/mw.png' },
  1081: { n: 'Problemlöser', p: 'origins', i: '/o.png' },
  1082: { n: 'Entschlossenheit der Vorhut', p: 'origins', i: '/o2.png' },
  1091: { n: 'Kill-Tracker', p: 'v400.plugs.weapons.masterworks.trackers', i: '/kt.png' },
  1101: { n: 'Standardornament', p: 'weapon_tiering_tier5_skins', i: '/orn.png' },
  1111: { n: 'Triumphaler Impuls', p: 'weapon_tiering_kill_vfx', i: '/vfx.png' },
  1121: { n: 'Stufe-2-Upgrade', p: 'weapon_tiering.plugs.mods.enhancers', i: '/up.png' }
};

// Socket-Typen → Kategorie-Hashes.
const socketTypeDefs = {
  900: { c: 500, p: '' }, // IntrinsicTraits
  901: { c: 501, p: '' }, // WeaponPerks_Reusable
  902: { c: 502, p: '' }, // WeaponCosmetics
  903: { c: 503, p: '' }  // WeaponMods
};

// ECHTE DestinySocketCategoryStyle-Werte.
const socketCategoryDefs = {
  500: { s: 6 }, // LargePerk (Rahmen)
  501: { s: 1 }, // Reusable (Perks)
  502: { s: 2 }, // Consumable (Shader/Ornament)
  503: { s: 2 }  // Consumable (Mods/Masterwork)
};

const sockets = [
  { plugHash: 1001, isVisible: true }, // 0 Rahmen
  { plugHash: 1011, isVisible: true }, // 1 Lauf
  { plugHash: 1021, isVisible: true }, // 2 Magazin
  { plugHash: 1031, isVisible: true }, // 3 Perk 1
  { plugHash: 1041, isVisible: true }, // 4 Perk 2
  { plugHash: 1052, isVisible: true }, // 5 Shader
  { plugHash: 1061, isVisible: true }, // 6 Waffenmod
  { plugHash: 1071, isVisible: true }, // 7 Meisterwerk
  { plugHash: 1081, isVisible: true }, // 8 Herkunft
  { plugHash: 1091, isVisible: true }, // 9 Kill-Tracker
  { plugHash: 1101, isVisible: true }, // 10 Ornament
  { plugHash: 1111, isVisible: true }, // 11 Kill-VFX
  { plugHash: 1121, isVisible: false } // 12 Tier-Upgrade
];

const socketEntries = [
  { socketTypeHash: 900 }, { socketTypeHash: 901 }, { socketTypeHash: 901 }, { socketTypeHash: 901 },
  { socketTypeHash: 901 }, { socketTypeHash: 902 }, { socketTypeHash: 903 }, { socketTypeHash: 903 },
  { socketTypeHash: 901 }, { socketTypeHash: 901 }, { socketTypeHash: 902 }, { socketTypeHash: 902 },
  { socketTypeHash: 903 }
];

const reusablePlugs = {
  1: [{ plugItemHash: 1011 }, { plugItemHash: 1012 }],
  2: [{ plugItemHash: 1021 }, { plugItemHash: 1022 }],
  3: [{ plugItemHash: 1031 }, { plugItemHash: 1032 }, { plugItemHash: 1033 }],
  4: [{ plugItemHash: 1041 }, { plugItemHash: 1042 }, { plugItemHash: 1043 }],
  5: Array.from({ length: 120 }, () => ({ plugItemHash: 1051 })),
  6: [{ plugItemHash: 1061 }, { plugItemHash: 1062 }],
  8: [{ plugItemHash: 1081 }, { plugItemHash: 1082 }],
  12: [{ plugItemHash: 1121 }]
};

const result = buildSocketDisplays({ sockets, reusablePlugs, socketEntries, socketTypeDefs, socketCategoryDefs, names });

// --- Perk-Spalten ----------------------------------------------------
check('Sechs Perk-Spalten (Rahmen, Lauf, Magazin, 2 Traits, Herkunft)', result.columns.length === 6, result.columns.map((c) => c.idx).join(','));
check('Shader/Mod/Meisterwerk sind KEINE Perk-Spalten',
  result.columns.every((c) => ![5, 6, 7, 10, 11, 12].includes(c.idx)),
  result.columns.map((c) => c.idx).join(','));
check('Lauf-Spalte zeigt beide Optionen', result.columns[1].options.length === 2, result.columns[1].options.length);
check('Magazin-Spalte zeigt beide Optionen', result.columns[2].options.length === 2, result.columns[2].options.length);
check('Perk-Spalte zeigt drei Optionen', result.columns[3].options.length === 3, result.columns[3].options.length);
check('Rahmen-Spalte zeigt nur den gesteckten Plug', result.columns[0].options.length === 1, result.columns[0].options.length);
check('Genau eine Option je Perk-Spalte ist ausgewählt',
  result.columns.every((c) => c.options.filter((o) => o.selected).length === 1),
  result.columns.map((c) => c.options.filter((o) => o.selected).length).join(','));
check('Gesteckter Lauf ist markiert', result.columns[1].options.find((o) => o.selected).hash === 1011);
check('Alternative ist nicht markiert', !result.columns[1].options.find((o) => o.hash === 1012).selected);

// --- Mod-Reihe -------------------------------------------------------
check('Fünf Mod-/Kosmetik-Sockets (Shader, Mod, Meisterwerk, Ornament, VFX)', result.mods.length === 5, result.mods.length);
check('Kill-Tracker wird ausgeblendet', result.mods.every((m) => m.idx !== 9), result.mods.map((m) => m.idx).join(','));
check('Tier-Upgrade wird ausgeblendet', result.mods.every((m) => m.idx !== 12), result.mods.map((m) => m.idx).join(','));
check('Shader-Socket enthält nur den gesteckten Plug', result.mods.some((m) => m.idx === 5 && m.hash === 1052));
check('Mod-Socket enthält nur den gesteckten Plug', result.mods.some((m) => m.idx === 6 && m.hash === 1061));

// --- Gesteckte Plugs (für Kachel/Overlay/Loadout) --------------------
check('Alle gesteckten Plugs gesammelt', result.selected.length === sockets.length, result.selected.length);
check('Gesteckte Plugs behalten ihren Socket-Index',
  result.selected.every((p, i) => p.idx === i), result.selected.map((p) => p.idx).join(','));

// --- Regressionsfall: falsche Enum-Werte -----------------------------
// Style 2 (Consumable) darf niemals alle Optionen als Spalte zeigen.
check('Consumable-Sockets erzeugen keine Options-Spalten',
  !result.columns.some((c) => c.idx === 5 || c.idx === 6 || c.idx === 7),
  result.columns.map((c) => c.idx).join(','));

// --- Unbekannte/leere Plugs dürfen kein null in mods erzeugen --------
// (Regression: "Cannot read properties of null (reading 'hash')").
names[9998] = { n: 'Leerer Crafting-Socket', p: 'crafting.recipes.empty_socket', i: '' };
const missingNameResult = buildSocketDisplays({
  sockets: [
    { plugHash: 1061, isVisible: true }, // bekannter Mod
    { plugHash: 9999, isVisible: true }, // Hash ohne Namen
    { plugHash: 9998, isVisible: true }  // leerer Crafting-Plug
  ],
  reusablePlugs: {},
  socketEntries: [{ socketTypeHash: 903 }, { socketTypeHash: 903 }, { socketTypeHash: 903 }],
  socketTypeDefs,
  socketCategoryDefs,
  names
});
check('Unbekannte Mod-Plugs erzeugen keine null-Einträge',
  missingNameResult.mods.length === 1 && missingNameResult.mods.every((m) => m && m.hash === 1061),
  JSON.stringify(missingNameResult.mods));
check('Unbekannte Plugs werden nicht als gesteckt gemeldet',
  missingNameResult.selected.length === 1 && missingNameResult.selected[0].hash === 1061,
  JSON.stringify(missingNameResult.selected));
check('Leerer Crafting-Plug wird übersprungen',
  missingNameResult.mods.every((m) => m.hash !== 9998) && missingNameResult.selected.every((p) => p.hash !== 9998));

if (process.exitCode) {
  console.error('SOCKET-TEST FEHLGESCHLAGEN');
} else {
  console.log(`\n${passed}/${passed} Socket-Tests bestanden.`);
}
