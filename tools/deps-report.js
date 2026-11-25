'use strict';

// ============================================================
// Abhängigkeits- und Sicherheitsbericht
// ============================================================
// Aufruf: npm run audit:deps
// Führt npm audit und npm outdated aus und fasst das Ergebnis zusammen.
// Es wird nichts automatisch aktualisiert.

const { execFile } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  return new Promise((resolve) => {
    execFile(NPM, args, { cwd: ROOT, windowsHide: true, shell: process.platform === 'win32', timeout: 120000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      resolve({ error, stdout: String(stdout || '') });
    });
  });
}

(async () => {
  const audit = await run(['audit', '--json']);
  let auditData = null;
  try { auditData = JSON.parse(audit.stdout); } catch (error) { /* egal */ }
  const vulnerabilities = auditData && auditData.metadata && auditData.metadata.vulnerabilities
    ? auditData.metadata.vulnerabilities
    : {};
  const total = Object.values(vulnerabilities).reduce((sum, value) => sum + (Number(value) || 0), 0);
  console.log('Sicherheitsprüfung (npm audit)');
  if (!auditData) {
    console.log('  Kein auswertbares Ergebnis (evtl. offline).');
  } else if (!total) {
    console.log('  Keine bekannten Schwachstellen.');
  } else {
    console.log(`  ${total} Meldung(en):`);
    for (const [level, count] of Object.entries(vulnerabilities)) {
      if (Number(count) > 0) console.log(`   - ${level}: ${count}`);
    }
    if (auditData.vulnerabilities) {
      for (const [name, info] of Object.entries(auditData.vulnerabilities).slice(0, 12)) {
        console.log(`   • ${name}: ${info.severity || 'unbekannt'}${info.fixAvailable ? ' (Fix verfügbar)' : ''}`);
      }
    }
  }

  const outdated = await run(['outdated', '--json']);
  let outdatedData = null;
  try { outdatedData = JSON.parse(outdated.stdout); } catch (error) { /* egal */ }
  console.log('\nUpdate-Empfehlungen (npm outdated)');
  const entries = outdatedData ? Object.entries(outdatedData) : [];
  if (!entries.length) {
    console.log('  Alles aktuell oder offline.');
  } else {
    for (const [name, info] of entries.slice(0, 20)) {
      console.log(`  • ${name}: ${info.current || '?'} → ${info.latest || info.wanted || '?'} (${info.type || 'dependency'})`);
    }
  }
  console.log('\nHinweis: Es wird nichts automatisch installiert. Updates bewusst testen.');
  process.exit(0);
})();
