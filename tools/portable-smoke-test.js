'use strict';

// Startet die gebaute Unpacked-App mit temporärem Portable-Profil und
// prüft Health, /state und /openapi.yaml. Aufruf nach dem Build:
//   node tools/portable-smoke-test.js

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const product = String((pkg.build && pkg.build.productName) || 'Destiny 2 Tool by FreakItOut');
const exe = path.join(ROOT, 'dist', 'win-unpacked', `${product}.exe`);
const port = Number(process.env.D2_SMOKE_PORT) || 17555;
const token = 'abcdef0123456789abcdef0123456789';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-package-smoke-'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!fs.existsSync(exe)) throw new Error(`Build fehlt: ${exe}`);
  fs.mkdirSync(path.join(temp, 'Daten'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'portable'), 'portable', 'utf8');
  const config = {
    schemaVersion: 3,
    integrations: { localApi: { enabled: true, port, token, readOnlyToken: '', tokens: [], lan: false, allowedOrigins: [], rateLimit: 300, allowQueryToken: true } },
    behavior: { startMinimized: false, closeToTray: false, firstRunDone: true }
  };
  fs.writeFileSync(path.join(temp, 'Daten', 'config.json'), JSON.stringify(config, null, 2), 'utf8');
  const child = spawn(exe, [], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: temp }
  });
  let exited = false;
  child.on('exit', () => { exited = true; });
  try {
    let health = null;
    for (let i = 0; i < 60 && !exited; i += 1) {
      await wait(500);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1200) });
        const body = await response.json();
        if (body && body.ok === true) { health = body; break; }
      } catch (error) { /* noch nicht bereit */ }
    }
    if (!health) throw new Error('Health nicht erreichbar.');
    const state = await fetch(`http://127.0.0.1:${port}/state?token=${token}`, { signal: AbortSignal.timeout(5000) }).then((res) => res.json());
    const yaml = await fetch(`http://127.0.0.1:${port}/openapi.yaml?token=${token}`, { signal: AbortSignal.timeout(5000) }).then((res) => res.text());
    if (state.ok !== true) throw new Error('/state antwortet nicht mit ok.');
    if (!/^openapi: 3\.1\.0/m.test(yaml)) throw new Error('/openapi.yaml ist kein YAML.');
    if (!health.checks || !health.checks.caches) throw new Error('/health enthält keine Checks.');
    console.log(`Portable-Smoke OK: ${product} (Port ${port}).`);
  } finally {
    try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch (error) { /* egal */ }
    await wait(500);
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (error) { /* egal */ }
  }
}

main().catch((error) => {
  console.error('Portable-Smoke fehlgeschlagen:', error.message || String(error));
  process.exit(1);
});
