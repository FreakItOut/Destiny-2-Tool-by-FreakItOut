'use strict';

// ============================================================
// Projektprüfung
// ============================================================
// Prüft Syntax, Pflichtdateien, Importe und die HTML-Verknüpfungen.
// Aufruf: npm run check
// ============================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const problems = [];
const notes = [];

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

function exists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (error) {
    return false;
  }
}

function requireFile(file) {
  const full = path.join(ROOT, file);
  if (!exists(full)) {
    problems.push(`Fehlt: ${file}`);
    return false;
  }
  if (fs.statSync(full).size === 0) problems.push(`Leer: ${file}`);
  return true;
}

function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(full);
  }
  return result;
}

function syntaxCheck(file, module) {
  const target = module ? path.join(tempDir, `${path.basename(file, '.js')}-${Math.random().toString(36).slice(2)}.mjs`) : file;
  try {
    if (module) fs.copyFileSync(file, target);
    execFileSync(process.execPath, ['--check', target], { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (error) {
    const message = String((error && (error.stderr || error.message)) || 'unbekannter Fehler').trim();
    problems.push(`Syntaxfehler in ${rel(file)}:\n${message}`);
    return false;
  }
}

const REQUIRED = [
  'package.json',
  'electron/main.js',
  'electron/config.js',
  'electron/preload.js',
  'electron/socket-columns.js',
  'renderer/index.html',
  'renderer/styles.css',
  'renderer/js/app.js',
  'renderer/js/ui.js',
  'renderer/js/icons.js',
  'renderer/js/clock.js',
  'renderer/js/controller.js',
  'renderer/js/settings.js',
  'renderer/js/i18n.js',
  'renderer/js/i18n-en.js',
  'renderer/stats.html',
  'renderer/stats.js',
  'renderer/xur.html',
  'renderer/xur.js',
  'assets/icon.png',
  'assets/icon-32.png',
  'build/icon.ico'
];

for (const file of REQUIRED) requireFile(file);

// package.json
let pkg = null;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
} catch (error) {
  problems.push(`package.json ist kein gültiges JSON: ${error.message}`);
}
if (pkg) {
  if (!pkg.main || !exists(path.join(ROOT, pkg.main))) problems.push('package.json: "main" zeigt auf keine Datei.');
  for (const script of ['start', 'dev', 'smoke', 'check', 'icons']) {
    if (!pkg.scripts || !pkg.scripts[script]) problems.push(`package.json: Script "${script}" fehlt.`);
  }
  if (!pkg.devDependencies || !pkg.devDependencies.electron) problems.push('package.json: Electron fehlt in devDependencies.');
  if (!pkg.build || !pkg.build.files) problems.push('package.json: build.files fehlt.');
}

// Syntax
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2tool-check-'));
try {
  const electronFiles = fs
    .readdirSync(path.join(ROOT, 'electron'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(ROOT, 'electron', name));
  for (const file of electronFiles) syntaxCheck(file, false);

  const rendererFiles = walk(path.join(ROOT, 'renderer', 'js'));
  for (const file of rendererFiles) syntaxCheck(file, true);

  for (const file of fs.readdirSync(path.join(ROOT, 'tools')).filter((name) => name.endsWith('.js'))) {
    syntaxCheck(path.join(ROOT, 'tools', file), false);
  }

  // Importe der Renderer-Module müssen existieren.
  for (const file of rendererFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const pattern = /(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g;
    let match = pattern.exec(source);
    while (match) {
      const target = path.resolve(path.dirname(file), match[1]);
      if (!exists(target)) problems.push(`${rel(file)}: Import nicht gefunden: ${match[1]}`);
      match = pattern.exec(source);
    }
  }

  // index.html: lokale Verweise und doppelte IDs.
  const htmlFile = path.join(ROOT, 'renderer', 'index.html');
  if (exists(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (/^(?:https?:|data:|#|mailto:)/i.test(ref)) continue;
      const target = path.resolve(path.dirname(htmlFile), ref);
      if (!exists(target)) problems.push(`index.html: Datei fehlt: ${ref}`);
    }

    const ids = new Map();
    for (const match of html.matchAll(/\sid="([^"]+)"/g)) {
      const id = match[1];
      ids.set(id, (ids.get(id) || 0) + 1);
    }
    for (const [id, count] of ids) {
      if (count > 1) problems.push(`index.html: ID "${id}" kommt ${count} Mal vor.`);
    }

    // Jedes data-icon muss ein bekanntes Symbol sein.
    const icons = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'icons.js'), 'utf8');
    for (const match of html.matchAll(/data-icon="([^"]+)"/g)) {
      const name = match[1];
      if (!new RegExp(`\\b${name}\\s*:`).test(icons)) {
        problems.push(`index.html: unbekanntes Symbol "${name}"`);
      }
    }
    notes.push(`${ids.size} IDs, ${refs.length} lokale/entfernte Verweise geprüft.`);
  }
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    // temporäres Verzeichnis
  }
}

// Selbsttest des Gamepad-Helfers: prüft, dass die XInput-Tasten
// korrekt auf die Gamepad-Indizes abgebildet werden. Ein Fehler
// hier führte dazu, dass die Tastenkombination nicht erkannt wurde.
try {
  const cscCandidates = [
    path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.windir || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  const csc = cscCandidates.find((file) => exists(file));
  const helperDir = path.join(ROOT, 'electron', 'gamepad-helper');
  const sources = ['GamepadHelper.cs', 'RawInputGuide.cs'].map((name) => path.join(helperDir, name));

  if (!csc) {
    notes.push('Kein csc.exe gefunden – Gamepad-Selbsttest übersprungen.');
  } else if (!sources.every((file) => exists(file))) {
    problems.push('Gamepad-Helfer: Quelldateien fehlen.');
  } else {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2pad-'));
    const exe = path.join(outDir, 'GamepadHelper.exe');
    try {
      execFileSync(csc, ['/nologo', '/target:exe', '/platform:x64', `/out:${exe}`, ...sources], {
        windowsHide: true,
        stdio: 'pipe',
        timeout: 60000
      });
      const output = execFileSync(exe, ['--selftest'], { windowsHide: true, encoding: 'utf8', timeout: 20000 });
      if (!output.includes('SELFTEST OK')) {
        problems.push(`Gamepad-Helfer: Selbsttest fehlgeschlagen -> ${output.trim()}`);
      } else {
        notes.push('Gamepad-Helfer: Tastenzuordnung geprüft.');
      }
    } catch (error) {
      const detail = String((error && (error.stdout || error.message)) || '').trim().slice(0, 300);
      problems.push(`Gamepad-Helfer: Übersetzung/Selbsttest fehlgeschlagen -> ${detail}`);
    } finally {
      try {
        fs.rmSync(outDir, { recursive: true, force: true });
      } catch (error) {
        // temporäres Verzeichnis
      }
    }
  }
} catch (error) {
  problems.push(`Gamepad-Helfer: ${error.message}`);
}

// ----------------------------------------------------------------
// Overlay-Fokus: Beim Ausblenden muss der Fokus an Destiny 2
// zurückgehen, sonst bleibt die Taskleiste über dem Vollbild.
// ----------------------------------------------------------------
try {
  const mainText = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
  const configText = fs.readFileSync(path.join(ROOT, 'electron', 'config.js'), 'utf8');
  const checks = [
    ['funktion focusGameWindow', /function focusGameWindow\(/.test(mainText)],
    ['zeitplan scheduleGameRefocus', /function scheduleGameRefocus\(/.test(mainText)],
    ['aufruf beim ausblenden', /if \(overlayOpenedFromGame\) scheduleGameRefocus\(\)/.test(mainText)],
    ['prozess-suche destiny2', /Get-Process -Name 'destiny2'/.test(mainText)],
    ['konfiguration refocusGameOnOverlayHide', /refocusGameOnOverlayHide/.test(configText)],
    ['preload-bruecke refocusGame', /refocusGame:/.test(fs.readFileSync(path.join(ROOT, 'electron', 'preload.js'), 'utf8'))]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  if (missing.length) problems.push(`Overlay-Fokus: fehlt (${missing.join(', ')}).`);
  else notes.push('Overlay-Fokus: Rückgabe an das Spiel beim Ausblenden verdrahtet.');
} catch (error) {
  problems.push(`Overlay-Fokus: ${error.message}`);
}

// ----------------------------------------------------------------
// HTML-Fangnetz: div-Bilanz pruefen.
// Ein ueberzaehliges </div> im Einstellungs-Bereich hat spaeter die
// Panels aus der Wizard-Struktur entkoppelt (alle Panels erschienen
// nebeneinander in gequetschten Spalten). Diese Pruefung schlaegt
// das fruehzeitig an.
// ----------------------------------------------------------------
const htmlFile = path.join(ROOT, 'renderer', 'index.html');
if (exists(htmlFile)) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const auf = (html.match(/<div\b/g) || []).length;
  const zu = (html.match(/<\/div>/g) || []).length;
  if (auf !== zu) {
    problems.push(`HTML: ${auf} <div> aber ${zu} </div> – Verschachtelung ist unbalanciert.`);
  } else {
    // Zusätzlich: alle Settings-Panels muessen in derselben Tiefe liegen.
    let tiefe = 0;
    const panelTiefen = [];
    const lines = html.split(/\r?\n/);
    lines.forEach((line, i) => {
      const opens = (line.match(/<div\b/g) || []).length;
      const closes = (line.match(/<\/div>/g) || []).length;
      if (/data-settings-panel/.test(line)) panelTiefen.push({ panel: line.match(/data-settings-panel="([^"]+)"/)?.[1] || '?', tiefe, zeile: i + 1 });
      tiefe += opens - closes;
    });
    if (panelTiefen.length === 0) {
      problems.push('HTML: keine data-settings-panel-Abschnitte gefunden.');
    } else {
      const tiefen = [...new Set(panelTiefen.map((p) => p.tiefe))];
      if (tiefen.length !== 1) {
        problems.push(`HTML: Einstellungs-Panels liegen in unterschiedlichen Div-Tiefen (${panelTiefen.map((p) => `${p.panel}@${p.tiefe}`).join(', ')}) – Markupbeschädigung?`);
      } else {
        notes.push(`HTML: div-Bilanz ok (${auf} divs), ${panelTiefen.length} Panels auf gleicher Tiefe ${tiefen[0]}.`);
      }
      // Jeder Tab braucht ein Panel – und umgekehrt. Sonst klickt man
      // ins Leere (nach Umbauten der Einstellungen).
      const tabKeys = [...html.matchAll(/data-settings-tab="([^"]+)"/g)].map((match) => match[1]);
      const panelKeys = panelTiefen.map((entry) => entry.panel);
      for (const key of tabKeys) {
        if (!panelKeys.includes(key)) problems.push(`HTML: Einstellungs-Tab "${key}" hat kein Panel.`);
      }
      for (const key of panelKeys) {
        if (!tabKeys.includes(key)) problems.push(`HTML: Einstellungs-Panel "${key}" hat keinen Tab.`);
      }
      if (tabKeys.length && new Set(tabKeys).size !== tabKeys.length) {
        problems.push('HTML: doppelte data-settings-tab-Schlüssel.');
      }
      // Einklappbare Gruppen brauchen genau eine Summary als erstes Kind.
      const detailsBlocks = [...html.matchAll(/<details class="settings-group"[\s\S]*?<\/details>/g)].map((match) => match[0]);
      const badGroups = detailsBlocks.filter((block) => !/<summary>/.test(block));
      if (badGroups.length) problems.push(`HTML: ${badGroups.length} settings-group ohne <summary>.`);
      const unclosedGroups = (html.match(/<details\b/g) || []).length - (html.match(/<\/details>/g) || []).length;
      if (unclosedGroups !== 0) problems.push(`HTML: ${unclosedGroups} <details> nicht geschlossen.`);
    }
  }
}

// Zusammenfassung
if (problems.length === 0) {
  console.log('Prüfung OK');
  for (const note of notes) console.log(`  ${note}`);
  console.log('  Syntax, Pflichtdateien, Importe und IDs sind in Ordnung.');
  process.exit(0);
}

console.error(`Prüfung fehlgeschlagen (${problems.length} Problem(e)):`);
for (const problem of problems) console.error(`  - ${problem}`);
process.exit(1);
