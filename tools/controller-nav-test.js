'use strict';

// ============================================================
// Test: D-Pad-Fokusnavigation (Richtungsauswahl)
// ============================================================
// Prüft die reine Funktion pickDirectionalTarget aus controller.js.
// Dafür werden controller.js/ui.js als ES-Module in ein temporäres
// Verzeichnis kopiert (das Projekt selbst hat keinen "type": "module").

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2ctrl-'));

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

(async () => {
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}', 'utf8');
  for (const file of ['renderer/js/controller.js', 'renderer/js/ui.js']) {
    fs.copyFileSync(path.join(ROOT, file), path.join(temp, path.basename(file)));
  }
  const { pickDirectionalTarget, normalizeXInputAxes } = await import(pathToFileURL(path.join(temp, 'controller.js')).href);

  const A = { name: 'A', x: 0, y: 0 };
  const B = { name: 'B', x: 100, y: 0 };
  const C = { name: 'C', x: 0, y: 100 };
  const D = { name: 'D', x: 100, y: 100 };
  const grid = [A, B, C, D];

  check('Rechts von A → B', pickDirectionalTarget(grid, A, 'right') === B);
  check('Links von B → A', pickDirectionalTarget(grid, B, 'left') === A);
  check('Unten von A → C', pickDirectionalTarget(grid, A, 'down') === C);
  check('Oben von C → A', pickDirectionalTarget(grid, C, 'up') === A);
  check('Unten von B → D', pickDirectionalTarget(grid, B, 'down') === D);
  check('Rechts von C → D', pickDirectionalTarget(grid, C, 'right') === D);
  check('Kein Ziel rechts von B', pickDirectionalTarget(grid, B, 'right') === null);
  check('Kein Ziel oben von A', pickDirectionalTarget(grid, A, 'up') === null);

  // Ausrichtung: B liegt fast gerade rechts, C weit darunter.
  const aligned = { name: 'Aligned', x: 100, y: 12 };
  const below = { name: 'Below', x: 10, y: 120 };
  check('Rechts bevorzugt ausgerichtetes Element',
    pickDirectionalTarget([aligned, below], A, 'right') === aligned);
  check('Unten bevorzugt ausgerichtetes Element',
    pickDirectionalTarget([aligned, below], A, 'down') === below);

  // Echte Grid-Reihen (3 Spalten, 2 Zeilen) für die Inventar-Navigation.
  const rows = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      rows.push({ name: `r${row}c${col}`, x: col * 60, y: row * 60 });
    }
  }
  const byName = (name) => rows.find((entry) => entry.name === name);
  check('Grid: rechts von r0c0 → r0c1', pickDirectionalTarget(rows, byName('r0c0'), 'right') === byName('r0c1'));
  check('Grid: unten von r0c0 → r1c0', pickDirectionalTarget(rows, byName('r0c0'), 'down') === byName('r1c0'));

  // XInput liefert Y positiv nach oben – intern gilt negativ = oben.
  const up = normalizeXInputAxes([0, 0.8, 0, 0.4]);
  check('XInput: oben wird negativ', up[1] === -0.8 && up[3] === -0.4, JSON.stringify(up));
  const down = normalizeXInputAxes([0, -0.7, 0, -0.2]);
  check('XInput: unten wird positiv', down[1] === 0.7 && down[3] === 0.2, JSON.stringify(down));
  const x = normalizeXInputAxes([0.5, 0, -0.25, 0]);
  check('XInput: X-Achsen bleiben unverändert', x[0] === 0.5 && x[2] === -0.25, JSON.stringify(x));
  const empty = normalizeXInputAxes(null);
  check('XInput: fehlende Achsen werden 0', empty.length === 4 && empty.every((value) => value === 0), JSON.stringify(empty));
  const broken = normalizeXInputAxes([NaN, undefined, '0.5', Infinity]);
  check('XInput: kaputte Werte werden 0 bzw. Zahl', broken[0] === 0 && broken[1] === 0 && broken[2] === 0.5 && broken[3] === 0, JSON.stringify(broken));

  fs.rmSync(temp, { recursive: true, force: true });
  if (process.exitCode) {
    console.error('CONTROLLER-TEST FEHLGESCHLAGEN');
  } else {
    console.log(`\n${passed}/${passed} Controller-Navigationstests bestanden.`);
  }
})().catch((error) => {
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch (e) { /* egal */ }
  console.error('FEHLER', error && (error.stack || error.message));
  process.exitCode = 1;
});
