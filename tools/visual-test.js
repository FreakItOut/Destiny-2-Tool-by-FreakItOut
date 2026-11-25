'use strict';

// ============================================================
// Visuelle Regression + Performance-Benchmark.
// Nimmt den E2E-Endzustand als PNG auf, vergleicht ihn mit der
// Baseline (Toleranz 5 %) und misst die Laufzeit des Durchlaufs.
// Aufruf: npm run test:visual
// ============================================================

const { app, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'e2e');
const TOLERANCE = 0.05;
const UPDATE = process.env.D2_UPDATE_BASELINES === '1';
const ELECTRON = process.execPath;

const targets = [];
const isLe = /lenastheo/i.test(path.basename(ROOT));
const stdRoot = isLe ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const leRoot = isLe ? ROOT : (process.env.D2_LE_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));
if (fs.existsSync(path.join(stdRoot, 'renderer', 'index.html'))) targets.push({ label: 'STD', root: stdRoot });
if (fs.existsSync(path.join(leRoot, 'renderer', 'index.html'))) targets.push({ label: 'LE', root: leRoot });

fs.mkdirSync(path.join(ROOT, 'tools', 'e2e', 'visual'), { recursive: true });

function runOne({ label, root }) {
  return new Promise((resolve) => {
    const outDir = path.join(root, 'tools', 'e2e', 'visual');
    fs.mkdirSync(outDir, { recursive: true });
    const shot = path.join(outDir, `${label}-shot.png`);
    try { fs.unlinkSync(shot); } catch (error) { /* egal */ }
    const started = Date.now();
    const child = spawn(ELECTRON, [HARNESS], {
      cwd: HARNESS,
      windowsHide: true,
      env: { ...process.env, INV_ROOT: root, INV_SCREENSHOT: shot }
    });
    let output = '';
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ label, ms: Date.now() - started, output, ...result });
    };
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => done({ ok: false, error: error.message || String(error) }));
    const timer = setTimeout(() => {
      try { child.kill(); } catch (error) { /* egal */ }
      done({ ok: false, error: 'Zeitüberschreitung' });
    }, 150000);
    child.on('exit', () => {
      setTimeout(() => {
        done(fs.existsSync(shot) ? { ok: true, shot } : { ok: false, error: 'Kein Screenshot erzeugt.' });
      }, 200);
    });
  });
}

function compare(label, shot, root) {
  const outDir = path.join(root, 'tools', 'e2e', 'visual');
  const baselinePath = path.join(outDir, `${label}-baseline.png`);
  if (UPDATE) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(shot, baselinePath);
    return { ok: true, updated: true, ratio: 0 };
  }
  const image = nativeImage.createFromPath(shot);
  if (image.isEmpty()) return { ok: false, error: 'Screenshot nicht lesbar.' };
  const bitmap = image.getBitmap();
  if (!fs.existsSync(baselinePath)) {
    fs.copyFileSync(shot, baselinePath);
    return { ok: true, baseline: 'neu angelegt', ratio: 0 };
  }
  const baseline = nativeImage.createFromPath(baselinePath).getBitmap();
  if (baseline.length !== bitmap.length) {
    return { ok: false, error: `Größe geändert (${baseline.length} → ${bitmap.length}) – Baseline neu erzeugen.`, ratio: 1 };
  }
  let changed = 0;
  for (let i = 0; i < bitmap.length; i += 1) {
    if (bitmap[i] !== baseline[i]) changed += 1;
  }
  const ratio = changed / bitmap.length;
  fs.writeFileSync(path.join(outDir, `${label}-diff.txt`), `changed=${changed} total=${bitmap.length} ratio=${ratio.toFixed(5)}\n`);
  return { ok: ratio <= TOLERANCE, ratio };
}

async function main() {
  let failed = 0;
  for (const target of targets) {
    const run = await runOne(target);
    if (!run.ok) {
      console.log(`\n=== ${target.label}: FEHLER ${run.error || 'unbekannt'}`);
      failed += 1;
      continue;
    }
    const diff = compare(target.label, run.shot, target.root);
    console.log(`\n=== ${target.label}: ${run.ms} ms, Pixel-Differenz ${(diff.ratio * 100).toFixed(2)} %${diff.updated ? ` (aktualisiert)` : diff.baseline ? ` (${diff.baseline})` : ''}`);
    if (!diff.ok) {
      console.log(`  VISUELLE REGRESSION: ${diff.error || 'über Toleranz'}`);
      failed += 1;
    }
    if (run.ms > 120000) {
      console.log('  PERFORMANCE: Durchlauf über 120 s.');
      failed += 1;
    }
  }
  console.log(`\nVISUELL/PERF ${failed ? 'FEHLGESCHLAGEN' : 'OK'}`);
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(main);
