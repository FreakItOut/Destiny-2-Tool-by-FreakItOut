'use strict';

// TV-Modus-Prüfung: Mindestschriftgröße, Fokus statt Hover und
// Konfigurations-Schalter. Aufruf: node tools/tv-mode-test.js
//
// Teil 1 prüft die Dateien statisch (Schalter vorhanden, Standard aus).
// Teil 2 startet den E2E-Aufbau, aktiviert den TV-Modus und prüft je
// Werkzeugseite, dass kein sichtbarer Text unter 10 px liegt (mit dem
//TV-Zoom 1.25 sind das 12,5 px) sowie Fokus-Tooltips im Picker.

const { app } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'e2e');
const ELECTRON = process.execPath;

function staticChecks() {
  const problems = [];
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

  const config = read('electron/config.js');
  if (!/tvMode:\s*false/.test(config)) problems.push('config.js: Standard tvMode fehlt oder ist nicht false.');
  if (!/tvMode:\s*merged\.appearance\.tvMode === true/.test(config)) problems.push('config.js: tvMode wird beim Speichern nicht übernommen.');

  const html = read('renderer/index.html');
  if (!/id="tvModeMode"/.test(html)) problems.push('index.html: Schalter tvModeMode fehlt.');

  const app = read('renderer/js/app.js');
  if (!/classList\.toggle\('tv-mode'/.test(app)) problems.push('app.js: Klasse tv-mode wird nicht gesetzt.');
  if (!/d2-tv-check/.test(app)) problems.push('app.js: TV-Check-Dialog fehlt.');

  const ui = read('renderer/js/ui.js');
  if (!/function enforceTvText/.test(ui)) problems.push('ui.js: enforceTvText fehlt.');
  if (!/function enhanceTvTargets/.test(ui)) problems.push('ui.js: enhanceTvTargets fehlt.');

  const css = read('renderer/styles.css');
  if (!/body\.tv-mode/.test(css)) problems.push('styles.css: TV-Modus-Regeln fehlen.');
  return problems;
}

function runHarness() {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-tv-'));
    const auditPath = path.join(dir, 'audit.json');
    const probePath = path.join(dir, 'probe.json');
    const child = spawn(ELECTRON, [HARNESS], {
      cwd: HARNESS,
      windowsHide: true,
      env: { ...process.env, INV_ROOT: ROOT, INV_TV_AUDIT: auditPath, INV_TV_PROBE: probePath }
    });
    let output = '';
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => done({ ok: false, error: error.message || String(error), output }));
    const timer = setTimeout(() => {
      try { child.kill(); } catch (error) { /* egal */ }
      done({ ok: false, error: 'Zeitüberschreitung', output });
    }, 180000);
    child.on('exit', () => {
      setTimeout(() => {
        const audit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null;
        const probe = fs.existsSync(probePath) ? JSON.parse(fs.readFileSync(probePath, 'utf8')) : null;
        done({ ok: Boolean(audit && probe), audit, probe, output });
      }, 800);
    });
  });
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const problems = staticChecks();
  let result = await runHarness();
  if (!result.ok) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await runHarness();
  }
  if (!result.ok) {
    console.error(`TV-Modus-Test fehlgeschlagen: ${result.error || 'keine Daten'}`);
    if (result.output) console.error(result.output.split('\n').slice(-12).join('\n'));
    app.exit(1);
    return;
  }
  for (const view of result.audit.views) {
    for (const bad of view.bad.slice(0, 5)) {
      problems.push(`${view.view}: ${bad.size} px ${bad.cls} – „${bad.text}"`);
    }
    if (view.bad.length > 5) problems.push(`${view.view}: ${view.bad.length - 5} weitere zu kleine Texte.`);
  }
  // Kontrast und Fokus-Erreichbarkeit.
  const contrastMin = Math.min(...result.audit.views.map((view) => Number(view.minContrast) || 21));
  if (contrastMin < 4.5) {
    problems.push(`TV-Modus: kleinster Kontrast ${contrastMin}:1 (Ziel ≥ 4,5:1)`);
    for (const view of result.audit.views) {
      for (const issue of (view.contrastIssues || []).slice(0, 2)) {
        problems.push(`${view.view}: ${issue.ratio}:1 ${issue.cls}${issue.parent ? ' (in ' + issue.parent + ')' : ''} ${issue.color || ''} – „${issue.text}"`);
      }
    }
  }
  const unreachable = result.audit.views.reduce((sum, view) => sum + (Number(view.unreachable) || 0), 0);
  if (unreachable > 0) problems.push(`TV-Modus: ${unreachable} fokussierbare Elemente sind nicht per Tastatur erreichbar.`);

  const probe = result.probe;
  if (!probe.pieces) problems.push('Picker: keine fokussierbaren Rüstungsteile gefunden.');
  if (probe.pieces && !probe.tabbable) problems.push('Picker: Rüstungsteile haben im TV-Modus keinen Tab-Stop.');
  if (probe.pieces && !probe.tipShown) problems.push('Picker: Fokus zeigt keinen Tooltip.');
  if (probe.pieces && !probe.tipHidden) problems.push('Picker: Tooltip bleibt nach Fokusverlust sichtbar.');
  if (probe.minFont > 10.001) problems.push(`TV-Modus: Kleinster Text ${probe.minFont} px (erwartet ≤ 10 px berechnet).`);

  if (problems.length) {
    console.error(`TV-Modus: ${problems.length} Problem(e)`);
    for (const problem of problems.slice(0, 20)) console.error('  ' + problem);
    app.exit(1);
    return;
  }
  console.log(`TV-Modus OK: 5 Seiten ohne Text unter 10 px, ${probe.pieces} Picker-Ziele fokussierbar, Tooltip per Fokus.`);
  app.exit(0);
});

app.on('window-all-closed', () => {});
