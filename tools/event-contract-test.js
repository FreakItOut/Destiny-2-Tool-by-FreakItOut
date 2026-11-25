'use strict';

// Ereignis-Vertrag: jedes im Renderer gesendete CustomEvent sollte
// mindestens einen Listener haben. Aufruf: node tools/event-contract-test.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'renderer', 'js');
const files = fs.readdirSync(DIR).filter((name) => name.endsWith('.js'));

const sent = new Set();
const listened = new Set();
for (const name of files) {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8');
  for (const match of text.matchAll(/dispatchEvent\(\s*new CustomEvent\(\s*['"]([^'"]+)['"]/g)) sent.add(match[1]);
  for (const match of text.matchAll(/addEventListener\(\s*['"](d2-[^'"]+)['"]/g)) listened.add(match[1]);
}

const missing = [...sent].filter((event) => event.startsWith('d2-') && !listened.has(event)).sort();
if (missing.length) {
  console.error(`Ereignisse ohne Listener (${missing.length}):`);
  for (const event of missing) console.error(`  ${event}`);
  process.exit(1);
}

console.log(`Ereignis-Vertrag OK: ${[...sent].filter((event) => event.startsWith('d2-')).length} d2-Events, alle mit Listener.`);
