'use strict';

// Modulbericht: Größe, Importe und Warnungen für den Renderer.
// Aufruf: node tools/module-report.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'renderer', 'js');
const WARN_BYTES = 250 * 1024;

const files = fs.readdirSync(DIR).filter((name) => name.endsWith('.js')).sort();
const rows = files.map((name) => {
  const full = path.join(DIR, name);
  const text = fs.readFileSync(full, 'utf8');
  const bytes = Buffer.byteLength(text, 'utf8');
  const imports = [...text.matchAll(/from\s+['"]\.\/([\w.-]+\.js)['"]/g)].map((match) => match[1]);
  return { name, bytes, lines: text.split(/\r?\n/).length, imports };
});

const total = rows.reduce((sum, row) => sum + row.bytes, 0);
rows.sort((a, b) => b.bytes - a.bytes);

console.log(`Renderer-Module: ${rows.length} · ${(total / 1024).toFixed(0)} KB gesamt`);
for (const row of rows.slice(0, 12)) {
  const warn = row.bytes > WARN_BYTES ? '  ⚠ groß' : '';
  console.log(`  ${(row.bytes / 1024).toFixed(0).padStart(5)} KB  ${String(row.lines).padStart(5)} Zeilen  ${row.name}${warn}`);
}

const large = rows.filter((row) => row.bytes > WARN_BYTES);
if (large.length) {
  console.log('');
  console.log('Hinweis: Große Module (>250 KB) lassen sich in Feature-Dateien aufteilen.');
  for (const row of large) console.log(`  ${row.name}: ${row.imports.length} Importe`);
}
