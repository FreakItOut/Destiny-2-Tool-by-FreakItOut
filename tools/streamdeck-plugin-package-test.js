'use strict';

// Prüft das erzeugte .streamDeckPlugin-Paket.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'com.freakitout.d2tool.streamDeckPlugin');

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

if (!fs.existsSync(FILE)) {
  console.error('Plugin-Paket fehlt. Zuerst npm run plugin:pack ausführen.');
  process.exit(1);
}
const buffer = fs.readFileSync(FILE);
const text = buffer.toString('latin1');
check('Plugin-Paket ist ein ZIP', buffer[0] === 0x50 && buffer[1] === 0x4b, buffer.slice(0, 2).toString('hex'));
check('Plugin-Paket ist nicht leer', buffer.length > 100000, String(buffer.length));
check('Manifest ist enthalten', text.includes('com.freakitout.d2tool.sdPlugin/manifest.json'));
check('Plugin-Code ist enthalten', text.includes('com.freakitout.d2tool.sdPlugin/bin/plugin.js'));
check('Property Inspector ist enthalten', text.includes('com.freakitout.d2tool.sdPlugin/ui/propertyinspector.html'));
check('ws-Abhängigkeit ist enthalten', text.includes('com.freakitout.d2tool.sdPlugin/node_modules/ws/package.json'));
const profileFile = path.join(ROOT, 'dist', 'streamdeck-profile.json');
check('Beispielbelegung existiert', fs.existsSync(profileFile));
if (fs.existsSync(profileFile)) {
  const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  check('Beispielbelegung enthält Keys', Array.isArray(profile.keys) && profile.keys.length >= 8);
  check('Beispielbelegung enthält keinen Token', !profile.global || !profile.global.token);
}

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Stream-Deck-Paket-Test OK: ${checks} Prüfungen.`);
