'use strict';

// ============================================================
// Grenz-Lint: Browser- und Node-Welt sauber trennen
// ============================================================
// Prüft Regeln, die TypeScript nicht sieht:
//  - electron/*.js läuft in Node: kein window/document im Code
//  - renderer/**/*.js läuft im Browser: kein require/module.exports
//  - electron/*.js ist CommonJS: kein import/export
//  - keine doppelten Top-Level-Funktionsnamen in einer Datei
// Zeichenketten und Kommentare werden vorher maskiert, damit
// Beispiele (z. B. executeJavaScript-Code) nicht als Verstoß zählen.
// Aufruf: node tools/lint.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const problems = [];

function walk(directory, filter) {
  const out = [];
  if (!fs.existsSync(directory)) return out;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (entry.isFile() && filter(full)) out.push(full);
  }
  return out;
}

// Ersetzt Kommentare und den Inhalt von Zeichenketten durch Leerzeichen
// (Zeilenumbrüche bleiben, damit Zeilennummern stimmen).
function mask(text) {
  let out = '';
  let mode = null; // 'line' | 'block' | "'" | '"' | '`'
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (mode === 'line') {
      if (char === '\n') { mode = null; out += char; } else out += ' ';
      continue;
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') { mode = null; out += '  '; i += 1; continue; }
      out += char === '\n' ? char : ' ';
      continue;
    }
    if (mode) {
      if (char === '\\') { out += '  '; i += 1; continue; }
      if (char === mode) { mode = null; out += ' '; continue; }
      out += char === '\n' ? char : ' ';
      continue;
    }
    if (char === '/' && next === '/') { mode = 'line'; out += '  '; i += 1; continue; }
    if (char === '/' && next === '*') { mode = 'block'; out += '  '; i += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { mode = char; out += ' '; continue; }
    out += char;
  }
  return out;
}

function checkElectron(file) {
  const rel = path.relative(ROOT, file);
  const lines = mask(fs.readFileSync(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/(?<![.\w$])window\s*\./.test(line)) problems.push(`${rel}:${index + 1}: window im Node-Prozess (${line.trim().slice(0, 80)})`);
    if (/(?<![.\w$])document\s*\./.test(line)) problems.push(`${rel}:${index + 1}: document im Node-Prozess (${line.trim().slice(0, 80)})`);
    if (/^\s*import\s+/.test(line)) problems.push(`${rel}:${index + 1}: ES-Import in CommonJS (${line.trim().slice(0, 80)})`);
    if (/^\s*export\s+/.test(line)) problems.push(`${rel}:${index + 1}: ES-Export in CommonJS (${line.trim().slice(0, 80)})`);
  });
}

function checkRenderer(file) {
  const rel = path.relative(ROOT, file);
  const lines = mask(fs.readFileSync(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*(const|let|var)\s+\w+\s*=\s*require\s*\(/.test(line)) {
      problems.push(`${rel}:${index + 1}: require() im Renderer (${line.trim().slice(0, 80)})`);
    }
    if (/(?<![.\w$])module\.exports\b/.test(line)) problems.push(`${rel}:${index + 1}: module.exports im Renderer`);
    if (/(?<![.\w$])__dirname\b/.test(line) || /(?<![.\w$])process\.(env|cwd)\b/.test(line)) {
      problems.push(`${rel}:${index + 1}: Node-Global im Renderer (${line.trim().slice(0, 80)})`);
    }
  });
}

function checkDuplicateFunctions(file) {
  const rel = path.relative(ROOT, file);
  const seen = new Map();
  mask(fs.readFileSync(file, 'utf8')).split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/);
    if (!match) return;
    const name = match[1];
    if (!seen.has(name)) { seen.set(name, index + 1); return; }
    problems.push(`${rel}:${index + 1}: function ${name} doppelt (auch Zeile ${seen.get(name)})`);
  });
}

for (const file of walk(path.join(ROOT, 'electron'), (name) => name.endsWith('.js'))) checkElectron(file);
const rendererFiles = walk(path.join(ROOT, 'renderer', 'js'), (name) => name.endsWith('.js'));
for (const file of rendererFiles) {
  if (/i18n-en\.js$/.test(file)) continue; // generierte Daten
  checkRenderer(file);
  checkDuplicateFunctions(file);
}

if (problems.length) {
  console.error(`Lint: ${problems.length} Problem(e)`);
  for (const problem of problems.slice(0, 40)) console.error('  ' + problem);
  if (problems.length > 40) console.error(`  … und ${problems.length - 40} weitere`);
  process.exit(1);
}

console.log(`Lint OK: ${rendererFiles.length} Renderer-Dateien und electron/ geprüft.`);
