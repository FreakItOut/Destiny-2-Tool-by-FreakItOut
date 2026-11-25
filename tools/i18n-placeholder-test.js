'use strict';

// Prüft, dass Übersetzungen Zahlen und Platzhalter nicht verlieren.
// Aufruf: node tools/i18n-placeholder-test.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'renderer', 'js', 'i18n-en.js');
const source = fs.readFileSync(file, 'utf8');

// Einträge der Form "key": "value" einsammeln.
const entries = [];
const regex = /^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/gm;
let match;
while ((match = regex.exec(source))) {
  try {
    entries.push({ key: JSON.parse(match[1]), value: JSON.parse(match[2]) });
  } catch (error) {
    // ignorieren
  }
}

const problems = [];
for (const entry of entries) {
  // Code-Fragmente, HTML-Entities und Uhrzeit-Formate sind keine
  // Übersetzungsfehler – sie werden übersprungen.
  if (/[();=>{}]/.test(entry.key)) continue;
  if (/&#\d+;/.test(entry.key)) continue;
  const timeKey = /\d{1,2}[:.]\d{2}/.test(entry.key);
  const timeValue = /\d{1,2}[:.]\d{2}|\b(am|pm)\b/i.test(entry.value);
  const keyNumbers = (entry.key.match(/\d+/g) || []).sort().join(',');
  const valueNumbers = (entry.value.match(/\d+/g) || []).sort().join(',');
  if (keyNumbers && keyNumbers !== valueNumbers && !timeKey && !timeValue) {
    problems.push(`Zahlen abweichend: „${entry.key}" → „${entry.value}"`);
    continue;
  }
  const keySlots = (entry.key.match(/\{\w+\}|%[sd]|\$\{\w+\}/g) || []).sort().join(',');
  const valueSlots = (entry.value.match(/\{\w+\}|%[sd]|\$\{\w+\}/g) || []).sort().join(',');
  if (keySlots !== valueSlots) {
    problems.push(`Platzhalter abweichend: „${entry.key}" → „${entry.value}"`);
  }
}

if (problems.length) {
  console.error(`i18n-Platzhalter: ${problems.length} Problem(e)`);
  for (const problem of problems.slice(0, 15)) console.error('  ' + problem);
  process.exit(1);
}
console.log(`i18n-Platzhalter OK: ${entries.length} Einträge geprüft.`);
