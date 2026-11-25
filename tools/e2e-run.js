'use strict';

// ============================================================
// E2E-Runner: spielt den Inventar-/Loadout-Test in Electron
// gegen die Standard- und (falls vorhanden) LE-Edition.
// ============================================================
// Aufruf: npm run e2e
// Ergebnis: Exit-Code 0 nur, wenn alle Schritte in allen Editionen
// bestanden wurden.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'e2e');
const ELECTRON = require('electron');
const TIMEOUT_MS = 120000;
const FAIL_DIR = path.join(HARNESS, 'failures');
const RETRY = process.env.D2_E2E_NO_RETRY === '1' ? 0 : 1;

const targets = [];
const isLe = /lenastheo/i.test(path.basename(ROOT));
const stdRoot = isLe ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const leRoot = isLe ? ROOT : (process.env.D2_LE_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));
if (fs.existsSync(path.join(stdRoot, 'renderer', 'index.html'))) targets.push({ label: 'STD', root: stdRoot });
if (process.env.D2_E2E_SKIP_LE !== '1' && fs.existsSync(path.join(leRoot, 'renderer', 'index.html'))) {
  targets.push({ label: 'LE', root: leRoot });
}

function runOne({ label, root }) {
  return new Promise((resolve) => {
    const resultPath = path.join(HARNESS, 'result.json');
    try {
      fs.unlinkSync(resultPath);
    } catch (error) {
      // egal
    }
    const shot = path.join(HARNESS, 'fail-shot.png');
    try { fs.unlinkSync(shot); } catch (error) { /* egal */ }
    const child = spawn(ELECTRON, [HARNESS], {
      cwd: HARNESS,
      env: { ...process.env, INV_ROOT: root, INV_FAIL_SHOT: shot },
      windowsHide: true
    });
    let finished = false;
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const started = Date.now();
    const timer = setInterval(() => {
      if (finished) return;
      if (Date.now() - started > TIMEOUT_MS) {
        finished = true;
        clearInterval(timer);
        try {
          child.kill();
        } catch (error) {
          // egal
        }
        resolve({ label, ok: false, error: 'Zeitüberschreitung', steps: [] });
      }
    }, 500);
    if (timer.unref) timer.unref();

    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        resolve({ label, ok: result.ok === true, steps: result.steps || [], errors: result.errors || [], shot, output });
      } catch (error) {
        resolve({ label, ok: false, error: `Kein Ergebnis: ${error.message}`, steps: [], output });
      }
    };
    child.on('exit', () => setTimeout(finish, 300));
  });
}

(async () => {
  let failed = 0;
  for (const target of targets) {
    let result = await runOne(target);
    if (!result.ok && RETRY > 0 && !result.error?.includes('Zeitüberschreitung')) {
      console.log(`\n=== ${target.label}: Wiederholung nach Fehlschlag …`);
      const retry = await runOne(target);
      if (retry.ok) {
        retry.retried = true;
        result = retry;
      }
    }
    const steps = result.steps || [];
    const bad = steps.filter((step) => !step.ok);
    console.log(`\n=== ${target.label} (${target.root})`);
    if (result.error) console.log(`  FEHLER: ${result.error}`);
    for (const step of bad) console.log(`  FAIL: ${step.name} — ${step.detail || ''}`);
    if (!result.ok) {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const dir = path.join(FAIL_DIR, `${target.label}-${stamp}`);
        fs.mkdirSync(dir, { recursive: true });
        for (const name of ['result.json', 'run.log']) {
          const from = path.join(HARNESS, name);
          if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, name));
        }
        if (result.shot && fs.existsSync(result.shot)) fs.copyFileSync(result.shot, path.join(dir, 'screenshot.png'));
        if (result.output) fs.writeFileSync(path.join(dir, 'output.log'), result.output, 'utf8');
        console.log(`  Diagnose: ${path.relative(ROOT, dir)}`);
      } catch (error) {
        console.log('  Diagnose konnte nicht gespeichert werden: ' + error.message);
      }
    }
    for (const error of result.errors || []) console.log(`  ERROR: ${error}`);
    console.log(`  ${steps.length - bad.length}/${steps.length} Schritte OK${result.retried ? ' (bestanden im 2. Versuch)' : ''}`);
    if (!result.ok) failed += 1;
  }
  console.log(`\nE2E ${failed ? 'FEHLGESCHLAGEN' : 'OK'} (${targets.length} Edition(en)).`);
  process.exit(failed ? 1 : 0);
})();
