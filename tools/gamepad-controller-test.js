'use strict';

// Prüft die Controller-Auswahl der XInput-Bridge ohne Hardware:
// vier Slots, fester Index, Auto-Modus und ungültige Werte.

const gamepad = require('../electron/gamepad');

let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const initial = gamepad.getControllers();
check('Vier XInput-Slots', initial && Array.isArray(initial.controllers) && initial.controllers.length === 4);
check('Auto-Modus ist Standard', initial && initial.selected === -1, initial && String(initial.selected));
check('Alle Slots liefern Index und Batterie', initial && initial.controllers.every((pad) => Number.isInteger(pad.index) && Number.isFinite(pad.battery)));

const selected = gamepad.setControllerIndex(2);
check('Fester Overlay-Controller', selected && selected.selected === 2, selected && String(selected.selected));
check('Gewählter Controller ist aktiv', selected && selected.controllers[2].active === true && selected.active === 2);

const auto = gamepad.setControllerIndex(-1);
check('Zurück auf Auto', auto && auto.selected === -1 && auto.active === -1);

const invalid = gamepad.setControllerIndex(99);
check('Ungültiger Index fällt auf Auto zurück', invalid && invalid.selected === -1, invalid && String(invalid.selected));

check('Bridge-Status liefert Diagnosefelder', (() => {
  const status = gamepad.getBridgeStatus();
  return status && typeof status.available === 'boolean' && typeof status.running === 'boolean' && typeof status.filterStrength === 'number';
})());

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Gamepad-Controller-Test OK: ${checks} Prüfungen.`);
