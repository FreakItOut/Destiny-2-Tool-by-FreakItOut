'use strict';

// Qualitätsprüfung der erzeugten englischen Übersetzungen.
// Prüft auf Mojibake, leere Werte und offensichtlich unübersetzte
// deutsche Funktionswörter; Namen und Spielbegriffe sind erlaubt.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'renderer', 'js', 'i18n-en.js');
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('window.__I18N_EN__');
const end = source.indexOf('window.__I18N_PATTERNS__', start);
if (start < 0 || end < 0) {
  console.error('i18n-en.js: Objekt nicht gefunden.');
  process.exit(1);
}
const block = source.slice(start, end).replace(/^window\.__I18N_EN__\s*=\s*/, '').trim().replace(/;\s*$/, '');
let dictionary = {};
try {
  dictionary = JSON.parse(block.replace(/,\s*$/, ''));
} catch (error) {
  console.error('i18n-en.js: JSON nicht lesbar:', error.message);
  process.exit(1);
}
const entries = Object.entries(dictionary);
let failures = 0;
function fail(message) {
  failures += 1;
  if (failures <= 20) console.error('FAIL ' + message);
}

for (const [key, value] of entries) {
  if (typeof value !== 'string' || !value.trim()) fail(`leere Übersetzung: ${key.slice(0, 80)}`);
  if (/Ã.|â€|Ãƒ|ï¿½/.test(value)) fail(`Mojibake: ${key.slice(0, 60)} → ${value.slice(0, 80)}`);
  const placeholders = (text) => (String(text).match(/\{[^}]+\}|%[sd]/g) || []).sort().join(',');
  if (!/[{}]|=>|function|document\.|querySelector/.test(key) && placeholders(key) !== placeholders(value)) fail(`Platzhalter: ${key.slice(0, 60)}`);
}
const suspicious = entries.filter(([key, value]) => value === key && /[äöüß]|\b(und|oder|nicht|keine|öffnen|schließen|speichern|löschen)\b/i.test(key));
if (suspicious.length > 25) fail(`zu viele unübersetzte deutsche Texte: ${suspicious.length}`);

if (failures) {
  console.error(`\n${failures} i18n-QA-Probleme.`);
  process.exit(1);
}
console.log(`i18n-QA OK: ${entries.length} Übersetzungen geprüft.`);
