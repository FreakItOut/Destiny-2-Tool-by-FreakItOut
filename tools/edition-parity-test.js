'use strict';

// ============================================================
// Editions-Parität: STD und Lenastheo Edition
// ============================================================
// Prüft, dass beide Editionen bis auf die dokumentierten
// Branding-Zeilen identisch sind. So fallen vergessene
// Sync-Schritte sofort auf.
//
// Aufruf: node tools/edition-parity-test.js

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const IS_LE = /lenastheo/i.test(path.basename(ROOT));
const STD_ROOT = IS_LE ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const LE_ROOT = process.env.D2_LE_ROOT || (IS_LE ? ROOT : path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));
const DIRS = ['electron', 'renderer', 'assets', 'tools', 'docs', 'streamdeck'];
const IGNORED = new Set(['node_modules', 'dist', 'Daten', '.git', 'result.json', 'verify-report.md', 'verify-run.log', 'build-run.log', 'run.log', 'LE-diff.txt', 'STD-diff.txt', 'baselines.json', 'visual']);
const BINARY_EXT = /\.(png|jpe?g|ico|exe|dll|node|woff2?|ttf)$/i;
// Editionsspezifische Dateien: Branding, Icons, gebaute Helfer, Manifeste.
const EDITION_FILES = new Set([
  'renderer/brand.css',
  'renderer/pip.html',
  'renderer/postmaster.html',
  'renderer/xur.html',
  'renderer/xur.css',
  'package.json',
  'package-lock.json'
]);


const allowed = {
  'README.md': [
    /^# Destiny 2 Tool by FreakItOut/,
    /^%APPDATA%\\FreakItOut/,
    /^`%APPDATA%\\FreakItOut/,
    /^\(`%APPDATA%\\FreakItOut/
  ],
  'renderer/index.html': [
    /^<title>Destiny 2 Tool by FreakItOut/,
    /^<span class="brand-name">Destiny 2 Tool by FreakItOut/
  ],
  'renderer/js/settings.js': [
    /^const result = await api\.integrationsTestDiscord\('Testnachricht aus Destiny 2 Tool by FreakItOut/
  ],
  'renderer/js/tools.js': [
    /ctx\.fillText\("Destiny 2 Tool by FreakItOut/,
    /ctx\.fillText\("Destiny 2 Tool by FreakItOut Lenastheo Limited Edition/
  ],
  'electron/main.js': [
    /^const APP_NAME = "Destiny 2 Tool by FreakItOut/,
    /^const APP_DATA_NAME = "FreakItOut/,
    /'Destiny 2 Tool by FreakItOut/
  ]
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (!BINARY_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

function relative(full, root) {
  return path.relative(root, full).replaceAll('\\', '/');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function isAllowed(rel, line) {
  const patterns = allowed[rel];
  if (!patterns) return false;
  const text = line.trim();
  return patterns.some((pattern) => pattern.test(text));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

let failures = 0;
function fail(message) {
  failures += 1;
  console.error('FAIL ' + message);
}

if (!fs.existsSync(LE_ROOT)) {
  console.log(`Editions-Parität: LE nicht gefunden (${LE_ROOT}) – übersprungen.`);
  process.exit(0);
}

const stdFiles = new Set();
for (const dir of DIRS) {
  for (const file of walk(path.join(STD_ROOT, dir))) stdFiles.add(relative(file, STD_ROOT));
}
const leFiles = new Set();
for (const dir of DIRS) {
  for (const file of walk(path.join(LE_ROOT, dir))) leFiles.add(relative(file, LE_ROOT));
}

for (const rel of stdFiles) {
  if (EDITION_FILES.has(rel)) continue;
  if (!leFiles.has(rel)) fail(`fehlt in LE: ${rel}`);
}
for (const rel of leFiles) {
  if (EDITION_FILES.has(rel)) continue;
  if (!stdFiles.has(rel)) fail(`nur in LE: ${rel} (in STD ergänzen oder bewusst dokumentieren)`);
}

for (const rel of stdFiles) {
  if (EDITION_FILES.has(rel) || !leFiles.has(rel)) continue;
  const a = readText(path.join(STD_ROOT, rel)).split('\n');
  const b = readText(path.join(LE_ROOT, rel)).split('\n');
  if (rel === 'renderer/js/i18n-en.js') {
    // Der Generator hängt das abschließende Komma an den letzten Eintrag.
    // Je nach Einfügereihenfolge kann das eine andere Zeile sein; für den
    // inhaltlichen Vergleich ist das Komma irrelevant.
    const normalize = (lines) => lines
      .map((line) => line.trim().replace(/,\s*$/, ''))
      .filter(Boolean)
      .sort();
    const left = normalize(a);
    const right = normalize(b);
    if (!sameJson(left, right)) fail(`${rel}: Übersetzungsinhalt unterscheidet sich (Reihenfolge ignoriert).`);
    continue;
  }
  if (a.length !== b.length) {
    fail(`${rel}: unterschiedliche Zeilenzahl (${a.length} vs ${b.length})`);
    continue;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    if (isAllowed(rel, a[index]) && isAllowed(rel, b[index])) continue;
    fail(`${rel}:${index + 1}: STD "${a[index].trim().slice(0, 120)}" ≠ LE "${b[index].trim().slice(0, 120)}"`);
  }
}

// README: nur Titel und AppData-Pfad dürfen editionsspezifisch sein.
for (const rel of ['README.md']) {
  const stdPath = path.join(STD_ROOT, rel);
  const lePath = path.join(LE_ROOT, rel);
  if (!fs.existsSync(stdPath) || !fs.existsSync(lePath)) continue;
  const a = readText(stdPath).split('\n');
  const b = readText(lePath).split('\n');
  if (a.length !== b.length) {
    fail(`${rel}: unterschiedliche Zeilenzahl (${a.length} vs ${b.length})`);
    continue;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    if (isAllowed(rel, a[index]) && isAllowed(rel, b[index])) continue;
    fail(`${rel}:${index + 1}: STD "${a[index].trim().slice(0, 120)}" ≠ LE "${b[index].trim().slice(0, 120)}"`);
  }
}

// package.json: Scripts und Dependencies müssen identisch sein; Name,
// Branding und App-ID dürfen editionsspezifisch sein.
try {
  const stdPkg = JSON.parse(readText(path.join(STD_ROOT, 'package.json')));
  const lePkg = JSON.parse(readText(path.join(LE_ROOT, 'package.json')));
  if (!sameJson(stdPkg.scripts, lePkg.scripts)) fail('package.json: scripts unterscheiden sich.');
  if (!sameJson(stdPkg.devDependencies, lePkg.devDependencies)) fail('package.json: devDependencies unterscheiden sich.');
  if (!lePkg.name || !/lenastheo/i.test(lePkg.name)) fail('package.json: LE-Name fehlt oder ist nicht editionsspezifisch.');
  if (!lePkg.build || !/Lenastheo/i.test(String(lePkg.build.productName || ''))) fail('package.json: LE-productName fehlt.');
  if (stdPkg.build && lePkg.build && !sameJson(stdPkg.build.files, lePkg.build.files)) fail('package.json: build.files unterscheiden sich.');
  if (stdPkg.build && lePkg.build && stdPkg.build.appId === lePkg.build.appId) fail('package.json: LE-appId muss sich von STD unterscheiden.');
} catch (error) {
  fail('package.json: ' + (error.message || String(error)));
}

// Editionslogos müssen sich unterscheiden. Das schützt davor, dass
// sync-le.js die Lenastheo-Icons mit dem FreakItOut-Logo überschreibt.
const BRAND_ASSETS = [
  'assets/icon.png',
  'assets/icon-32.png',
  'assets/icon-running.png',
  'assets/logo.png',
  'build/icon.ico',
  'streamdeck/com.freakitout.d2tool.sdPlugin/imgs/action.png',
  'streamdeck/com.freakitout.d2tool.sdPlugin/imgs/key.png',
  'streamdeck/com.freakitout.d2tool.sdPlugin/imgs/plugin.png'
];
for (const rel of BRAND_ASSETS) {
  const stdPath = path.join(STD_ROOT, rel);
  const lePath = path.join(LE_ROOT, rel);
  if (!fs.existsSync(lePath)) {
    fail(`${rel}: LE-Datei fehlt.`);
    continue;
  }
  if (!fs.existsSync(stdPath)) continue;
  const stdHash = crypto.createHash('sha256').update(fs.readFileSync(stdPath)).digest('hex');
  const leHash = crypto.createHash('sha256').update(fs.readFileSync(lePath)).digest('hex');
  if (stdHash === leHash) fail(`${rel}: LE verwendet noch das STD-Logo.`);
}

if (failures) {
  console.error(`\nEDITIONS-PARITÄT FEHLGESCHLAGEN: ${failures} Abweichung(en).`);
  process.exit(1);
}
console.log(`EDITIONS-PARITÄT OK: ${stdFiles.size} Dateien, nur dokumentiertes Branding abweichend.`);
