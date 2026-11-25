'use strict';

// ============================================================
// Barrierefreiheits-Schnellprüfung (statisch)
// ============================================================
// Prüft die wichtigsten Bedienelemente in renderer/index.html auf
// fehlende zugängliche Namen. Aufruf: npm run test:a11y

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'renderer', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const problems = [];

function hasAccessibleName(attrs, text) {
  if (/\baria-label\s*=/.test(attrs)) return true;
  if (/\btitle\s*=/.test(attrs)) return true;
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').trim().length > 0;
}

for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
  if (!hasAccessibleName(match[1], match[2])) problems.push(`Button ohne Namen: <button${match[1].slice(0, 80)}>`);
}

for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
  const attrs = match[1];
  if (/type\s*=\s*["'](hidden|submit|button|checkbox|radio)["']/i.test(attrs)) continue;
  const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  const labelled = id && new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${id}["']`, 'i').test(html);
  if (!labelled && !/aria-label\s*=|title\s*=|placeholder\s*=/i.test(attrs)) {
    problems.push(`Eingabefeld ohne Label/Platzhalter: <input${attrs.slice(0, 80)}>`);
  }
}

if (problems.length) {
  console.log(`Barrierefreiheits-Hinweise: ${problems.length}`);
  for (const problem of problems.slice(0, 30)) console.log(`  - ${problem}`);
  console.log('Hinweis: Prüfung ist statisch und ersetzt keinen Screenreader-Test.');
  process.exit(0);
}
console.log('Barrierefreiheits-Schnellprüfung: keine offensichtlichen fehlenden Namen.');
