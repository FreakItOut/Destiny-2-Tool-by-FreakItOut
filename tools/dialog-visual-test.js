'use strict';

// Dialog-Snapshots: Item-Popup und Loadout-Editor je Edition.
// Aufruf: npm run test:dialogs
// Erste Ausführung legt die Baselines an (Toleranz 4 %).

const { app, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'e2e');
const TOLERANCE = 0.04;
const UPDATE = process.env.D2_UPDATE_BASELINES === '1';
const NAMES = ['popup', 'loadouts'];
const ELECTRON = process.execPath;

const isLe = /lenastheo/i.test(path.basename(ROOT));
const stdRoot = isLe ? path.resolve(ROOT, '..', 'Destiny 2 Tool') : ROOT;
const leRoot = isLe ? ROOT : (process.env.D2_LE_ROOT || path.resolve(ROOT, '..', 'Destiny 2 Tool Lenastheo Edition'));
const targets = [];
if (fs.existsSync(path.join(stdRoot, 'renderer', 'index.html'))) targets.push({ label: 'STD', root: stdRoot });
if (process.env.D2_E2E_SKIP_LE !== '1' && fs.existsSync(path.join(leRoot, 'renderer', 'index.html'))) targets.push({ label: 'LE', root: leRoot });

function runOne({ label, root }) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2dialogs-' + label + '-'));
    const child = spawn(ELECTRON, [HARNESS], {
      cwd: HARNESS,
      windowsHide: true,
      env: { ...process.env, INV_ROOT: root, INV_DIALOG_SHOTS: dir }
    });
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => { try { child.kill(); } catch (error) { /* egal */ } done({ ok: false, error: 'Zeitüberschreitung', dir }); }, 180000);
    child.on('exit', () => setTimeout(() => {
      const files = NAMES.filter((name) => fs.existsSync(path.join(dir, name + '.png')));
      done(files.length === NAMES.length ? { ok: true, dir } : { ok: false, error: files.length + '/' + NAMES.length + ' Dialoge', dir });
    }, 400));
  });
}

function compare(baseline, shot) {
  if (UPDATE) {
    fs.mkdirSync(path.dirname(baseline), { recursive: true });
    fs.copyFileSync(shot, baseline);
    return { ratio: 0, updated: true };
  }
  if (!fs.existsSync(baseline)) { fs.copyFileSync(shot, baseline); return { ratio: 0, created: true }; }
  const a = nativeImage.createFromPath(baseline);
  const b = nativeImage.createFromPath(shot);
  if (a.isEmpty() || b.isEmpty()) return { ratio: 1, error: 'Bild nicht lesbar' };
  const left = a.getBitmap();
  const right = b.getBitmap();
  if (left.length !== right.length) return { ratio: 1, error: 'Größe geändert' };
  let changed = 0;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) changed += 1;
  return { ratio: changed / left.length };
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let failed = false;
  for (const target of targets) {
    let result = await runOne(target);
    if (!result.ok) {
      // Electron/Snapshot-Harness kann unter Last gelegentlich nicht
      // rechtzeitig hochkommen. Einmal mit kurzer Pause wiederholen.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await runOne(target);
    }
    const parts = [];
    if (!result.ok) {
      console.log('=== ' + target.label + ': FEHLER ' + result.error);
      failed = true;
      continue;
    }
    for (const name of NAMES) {
      const shot = path.join(result.dir, name + '.png');
      const baseline = path.join(target.root, 'tools', 'e2e', 'visual', 'dialogs', target.label + '-' + name + '.png');
      const diff = compare(baseline, shot);
      parts.push(name + ' ' + (diff.error ? diff.error : diff.updated ? 'aktualisiert' : (diff.ratio * 100).toFixed(2) + ' %'));
      if (diff.error || (!diff.updated && diff.ratio > TOLERANCE)) failed = true;
    }
    console.log('=== ' + target.label + ': ' + parts.join(' · '));
  }
  console.log(failed ? '\nDIALOG-SNAPSHOTS FEHLGESCHLAGEN' : '\nDIALOG-SNAPSHOTS OK');
  app.exit(failed ? 1 : 0);
});

app.on('window-all-closed', () => {});
