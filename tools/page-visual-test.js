'use strict';

// Seiten-Snapshots: nimmt je Werkzeugseite (Übersicht, Builds, Woche,
// Sammlung, Händler) einen Screenshot auf und vergleicht ihn mit der
// Baseline. Aufruf: npm run test:pages
// Die erste Ausführung legt die Baselines an.

const { app, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'e2e');
const TOLERANCE = 0.04;
const UPDATE = process.env.D2_UPDATE_BASELINES === '1';
const VIEWS = ['overview', 'builds', 'week', 'collection', 'vendor'];
const ELECTRON = process.execPath;

const targets = [];
const isLe = /lenastheo/i.test(path.basename(ROOT));
const stdRoot = isLe ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const leRoot = isLe ? ROOT : (process.env.D2_LE_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));
if (fs.existsSync(path.join(stdRoot, 'renderer', 'index.html'))) targets.push({ label: 'STD', root: stdRoot });
if (process.env.D2_E2E_SKIP_LE !== '1' && fs.existsSync(path.join(leRoot, 'renderer', 'index.html'))) targets.push({ label: 'LE', root: leRoot });

function runOne({ label, root }) {
  return new Promise((resolve) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `d2-pages-${label}-`));
    const child = spawn(ELECTRON, [HARNESS], {
      cwd: HARNESS,
      windowsHide: true,
      env: { ...process.env, INV_ROOT: root, INV_PAGE_SHOTS: outDir }
    });
    let output = '';
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ label, outDir, output, ...result });
    };
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => done({ ok: false, error: error.message || String(error) }));
    const timer = setTimeout(() => {
      try { child.kill(); } catch (error) { /* egal */ }
      done({ ok: false, error: 'Zeitüberschreitung' });
    }, 180000);
    child.on('exit', () => {
      setTimeout(() => {
        const files = VIEWS.filter((view) => fs.existsSync(path.join(outDir, `${view}.png`)));
        done(files.length === VIEWS.length ? { ok: true } : { ok: false, error: `Nur ${files.length}/${VIEWS.length} Seiten aufgenommen.` });
      }, 300);
    });
  });
}

function compareImages(baselinePath, shotPath) {
  if (UPDATE) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.copyFileSync(shotPath, baselinePath);
    return { ratio: 0, baseline: true, updated: true };
  }
  if (!fs.existsSync(baselinePath)) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.copyFileSync(shotPath, baselinePath);
    return { ratio: 0, baseline: true };
  }
  const baseline = nativeImage.createFromPath(baselinePath);
  const shot = nativeImage.createFromPath(shotPath);
  if (baseline.isEmpty() || shot.isEmpty()) return { ratio: 1, error: 'Bild nicht lesbar' };
  const a = baseline.getBitmap();
  const b = shot.getBitmap();
  if (a.length !== b.length) return { ratio: 1, error: 'Größe geändert' };
  let changed = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) changed += 1;
  return { ratio: changed / a.length };
}

app.whenReady().then(async () => {
  let failed = false;
  for (const target of targets) {
    let result = await runOne(target);
    if (!result.ok) {
      // Unter Last startet der Snapshot-Harness gelegentlich nicht
      // rechtzeitig. Einmal mit kurzer Pause wiederholen.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await runOne(target);
    }
    if (!result.ok) {
      console.error(`${target.label}: ${result.error || 'fehlgeschlagen'}`);
      failed = true;
      continue;
    }
    const baseDir = path.join(target.root, 'tools', 'e2e', 'visual', 'pages', target.label);
    fs.mkdirSync(baseDir, { recursive: true });
    const rows = [];
    for (const view of VIEWS) {
      const shot = path.join(result.outDir, `${view}.png`);
      const baseline = path.join(baseDir, `${view}.png`);
      const diff = compareImages(baseline, shot);
      rows.push(`${view} ${diff.updated ? 'aktualisiert' : diff.baseline ? 'Baseline neu' : `${(diff.ratio * 100).toFixed(2)} %`}${diff.error ? ` (${diff.error})` : ''}`);
      if (!diff.baseline && (diff.error || diff.ratio > TOLERANCE)) failed = true;
    }
    console.log(`=== ${target.label}: ${rows.join(' · ')}`);
  }
  console.log(failed ? 'SEITEN-SNAPSHOTS FEHLGESCHLAGEN' : 'SEITEN-SNAPSHOTS OK');
  app.exit(failed ? 1 : 0);
});
