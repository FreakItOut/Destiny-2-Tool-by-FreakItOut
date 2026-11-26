'use strict';

// ============================================================
// Alles prüfen: ein Befehl, ein Bericht
// ============================================================
// Aufruf: node tools/verify.js            (alles, inkl. E2E/Snapshots)
//         node tools/verify.js --fast     (ohne E2E/Snapshots/Visual)
//         node tools/verify.js --only=check,lint
// Schreibt verify-report.md mit Dauer, Status und Fehlerauszug.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(ROOT, 'verify-report.md');
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((entry) => entry.trim()).filter(Boolean) : null;

const ALL = [
  { script: 'check', label: 'Datei-/Markup-Prüfung', timeout: 180000 },
  { script: 'test:lint', label: 'Grenz-Lint', timeout: 180000 },
  { script: 'test:types', label: 'Typprüfung', timeout: 300000 },
  { script: 'test:i18n', label: 'Übersetzungen', timeout: 180000 },
  { script: 'test:i18n-placeholders', label: 'i18n-Platzhalter', timeout: 120000 },
  { script: 'test:property', label: 'Property-Tests', timeout: 180000 },
  { script: 'test:zip', label: 'ZIP-Writer', timeout: 120000 },
  { script: 'test:deeplink', label: 'Deep-Links/API', timeout: 120000 },
  { script: 'test:vendor-fixture', label: 'Händler-Fixture', timeout: 120000 },
  { script: 'test:api-commands', label: 'Stream-Deck-API', timeout: 120000 },
  { script: 'test:api-client', label: 'API-Client', timeout: 120000 },
  { script: 'test:api-contract', label: 'API-Contract', timeout: 120000 },
  { script: 'test:fixtures', label: 'Bungie-Fixtures', timeout: 120000 },
  { script: 'test:large-vault', label: 'Große Tresore', timeout: 180000 },
  { script: 'test:dashboard-analytics', label: 'Dashboard-Analytik', timeout: 120000 },
  { script: 'test:i18n-qa', label: 'i18n-QA', timeout: 120000 },
  { script: 'test:app-features', label: 'App-Features', timeout: 120000 },
  { script: 'test:gamepad-ui', label: 'Controller-Auswahl', timeout: 120000 },
  { script: 'test:api-e2e', label: 'Stream-Deck-API (Laufzeit)', timeout: 300000 },
  { script: 'test:plugin', label: 'Stream-Deck-Plugin', timeout: 120000 },
  { script: 'test:plugin-package', label: 'Stream-Deck-Plugin-Paket', timeout: 180000 },
  { script: 'test:contract', label: 'Preload-Vertrag', timeout: 120000 },
  { script: 'test:events', label: 'Ereignis-Vertrag', timeout: 120000 },
  { script: 'test:sockets', label: 'Socket-Spalten', timeout: 180000 },
  { script: 'test:config', label: 'Konfiguration', timeout: 300000 },
  { script: 'test:bundle', label: 'Bundle-Budget', timeout: 120000 },
  { script: 'test:installer', label: 'Installer-Datenerhalt', timeout: 120000 },
  { script: 'test:migration', label: 'Daten-Migration', timeout: 120000 },
  { script: 'test:icons', label: 'Icon-Cache', timeout: 120000 },
  { script: 'test:secrets', label: 'Secret-Redaction', timeout: 120000 },
  { script: 'test:ipc-validation', label: 'IPC-Validierung', timeout: 120000 },
  { script: 'test:xur', label: 'Xûr-Fenster', timeout: 120000 },
  { script: 'test:parity', label: 'Editions-Parität', timeout: 120000 },
  { script: 'test:config-usage', label: 'Config-Schlüssel', timeout: 120000 },
  { script: 'test:ipc-usage', label: 'IPC-Nutzung', timeout: 120000 },
  { script: 'test:oauth', label: 'OAuth', timeout: 180000 },
  { script: 'test:controller', label: 'Controller-Navigation', timeout: 180000 },
  { script: 'test:picker', label: 'Rüstungs-Picker', timeout: 180000 },
  { script: 'test:picker:perf', label: 'Picker-Lasttest', timeout: 300000 },
  { script: 'test:robust', label: 'Robustheit', timeout: 180000 },
  { script: 'test:modules', label: 'Modulbericht', timeout: 120000 },
  { script: 'test:a11y', label: 'Barrierefreiheit', timeout: 180000 },
  { script: 'test:perf', label: 'Startup-/Leerlauf-Budget', timeout: 300000 },
  { script: 'smoke', label: 'Smoke-Start', timeout: 240000, slow: true },
  { script: 'test:pages', label: 'Seiten-Snapshots', timeout: 600000, slow: true },
  { script: 'test:tv', label: 'TV-Modus', timeout: 600000, slow: true },
  { script: 'e2e', label: 'E2E', timeout: 900000, slow: true },
  { script: 'test:settings', label: 'Einstellungen (E2E)', timeout: 600000, slow: true },
  { script: 'test:axe', label: 'axe-Audit', timeout: 600000, slow: true },
  { script: 'test:dialogs', label: 'Dialog-Snapshots', timeout: 600000, slow: true },
  { script: 'test:visual', label: 'Visuell/Perf', timeout: 600000, slow: true }
];

const steps = ALL.filter((step) => {
  if (only) return only.includes(step.script);
  if (fast && step.slow) return false;
  return true;
});

const results = [];
const startedAll = Date.now();

for (const step of steps) {
  const started = Date.now();
  process.stdout.write(`\n=== ${step.label} (npm run ${step.script}) …\n`);
  const result = spawnSync('cmd.exe', ['/c', `npm run ${step.script}`], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: step.timeout,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0', D2_TEST_MONITOR: process.env.D2_TEST_MONITOR || 'right' }
  });
  const ms = Date.now() - started;
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const ok = result.status === 0;
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  results.push({ ...step, ok, ms, timedOut, output });
  const summary = ok ? 'OK' : timedOut ? 'Zeitüberschreitung' : `FEHLER (${result.status})`;
  process.stdout.write(`    ${summary} · ${(ms / 1000).toFixed(1)} s\n`);
}

const failed = results.filter((result) => !result.ok);

function tail(text, lines = 30) {
  return String(text || '').trim().split(/\r?\n/).slice(-lines).join('\n');
}

const report = [
  '# Prüfbericht',
  '',
  `Stand: ${new Date().toLocaleString('de-DE')}  `,
  `Dauer: ${((Date.now() - startedAll) / 1000).toFixed(1)} s  `,
  `Ergebnis: **${failed.length ? `${failed.length} von ${results.length} Schritten fehlgeschlagen` : `alle ${results.length} Schritte grün`}**`,
  '',
  '| Schritt | Skript | Status | Dauer |',
  '|---|---|---|---|',
  ...results.map((result) => `| ${result.label} | \`npm run ${result.script}\` | ${result.ok ? '✅' : result.timedOut ? '⏱️' : '❌'} | ${(result.ms / 1000).toFixed(1)} s |`),
  ''
];
if (failed.length) {
  report.push('## Fehlschläge', '');
  for (const result of failed) {
    report.push(`### ${result.label} (\`npm run ${result.script}\`)`, '```', tail(result.output), '```', '');
  }
}
fs.writeFileSync(REPORT, report.join('\n'), 'utf8');

console.log(`\nBericht: ${path.relative(ROOT, REPORT)}`);
if (failed.length) {
  console.error(`VERIFY FEHLGESCHLAGEN: ${failed.length} von ${results.length} Schritten.`);
  for (const result of failed) {
    console.error(`  - ${result.label}: ${tail(result.output, 6)}`);
  }
  process.exit(1);
}
console.log(`VERIFY OK: ${results.length} Schritte in ${((Date.now() - startedAll) / 1000).toFixed(1)} s.`);
