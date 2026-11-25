'use strict';

// Generische Mojibake-Reparatur: Textpassagen, die versehentlich
// UTF-8 -> CP1252 doppelcodiert wurden (z. B. "â†" statt "↑"),
// werden als Bytes rekonstruiert und korrekt decodiert.
// Einzeln stehende korrekte Umlaute (ä, ö, ü, ß ...) bleiben unangetastet,
// weil sie als Bytes keine gueltige UTF-8-Sequenz ergeben.
// Aufruf: node tools/fix-mojibake.js

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Alle Zeichen, die in CP1252 die Codes 0x80..0xFF besitzen.
// (Diese Bytes sind in gefundenen Mojibake-Runs moegliche Fortsetzung.)
const CP1252_HIGH = (() => {
  const bytes = [];
  for (let b = 0x80; b <= 0xff; b += 1) {
    const repr = {
      0x80: '\u20AC', 0x81: '\u0081', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E',
      0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030',
      0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152', 0x8D: '\u008D', 0x8E: '\u017D',
      0x8F: '\u008F', 0x90: '\u0090', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
      0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02DC',
      0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153', 0x9D: '\u009D',
      0x9E: '\u017E', 0x9F: '\u0178'
    }[b];
    bytes.push([repr || String.fromCharCode(b), b]);
  }
  return bytes;
})();

// Liefert das CP1252-Byte fuer ein Zeichen oder null.
function cp1252Byte(ch) {
  const code = ch.codePointAt(0);
  const direct = CP1252_HIGH.find(([, b]) => b === code);
  if (direct) return direct[1];
  for (const [repr, b] of CP1252_HIGH) if (repr === ch) return b;
  return null;
}

// Repariert alle doppelcodierten Runs im Text.
function repairText(text, fileLabel) {
  let fixes = 0;
  const out = [];
  let run = '';
  const flush = () => {
    if (!run) return;
    const bytes = Buffer.alloc(run.length);
    let ok = true;
    for (let i = 0; i < run.length; i += 1) {
      const b = cp1252Byte(run[i]);
      if (b === null) { ok = false; break; }
      bytes[i] = b;
    }
    let replacement = null;
    if (ok && run.length >= 2) {
      try {
        const decoded = bytes.toString('utf8');
        // Nur ersetzen, wenn die Decodierung ergab: Zeichen jenseits
        // von ASCII und der Text dadurch laenger/anders wird.
        if (/[\u0080-\uFFFF]/.test(decoded) && decoded !== run) {
          replacement = decoded;
        }
      } catch (error) {
        replacement = null;
      }
    }
    if (replacement) fixes += 1;
    out.push(replacement || run);
    run = '';
  };
  for (const ch of text) {
    if (cp1252Byte(ch) !== null) {
      run += ch;
    } else {
      flush();
      out.push(ch);
    }
  }
  flush();
  if (fixes > 0) console.log(`  ${fileLabel}: ${fixes} Passagen repariert`);
  return out.join('');
}

const FILES = [
  'electron/main.js',
  'electron/config.js',
  'electron/preload.js',
  'electron/gamepad.js',
  'renderer/index.html',
  'renderer/styles.css',
  'renderer/js/app.js',
  'renderer/js/controller.js',
  'renderer/js/settings.js',
  'renderer/js/ui.js',
  'tools/check.js',
  'package.json',
  'README.md'
];

let total = 0;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = repairText(before, rel);
  total += after === before ? 0 : 1;
  fs.writeFileSync(file, after, 'utf8');
}

// Kontrolle: typische Mojibake-Fragmente duerfen nicht mehr vorkommen.
const SUSPECT = ['â', 'Ã', '\u0153', '\u017E', 'â€', 'â†', 'âœ', 'â–', 'â—'];
let rest = 0;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const s of SUSPECT) {
    let idx = text.indexOf(s);
    while (idx !== -1) {
      rest += 1;
      console.log(`  VERDÄCHTIG in ${rel} @${idx}: ${JSON.stringify(text.slice(idx, idx + 12))}`);
      idx = text.indexOf(s, idx + 1);
    }
  }
}
console.log(`Dateien veraendert: ${total}, verbleibende Verdachtsstellen: ${rest}`);
