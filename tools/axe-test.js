'use strict';

// Automatisierter Barrierefreiheits-Audit (axe-core) für die
// Einstellungen. Prüft Rollen, Labels und ARIA-Verknüpfungen;
// Kontrast und Schriftgröße deckt der TV-Test ab.
// Aufruf: npm run test:axe   (App darf nicht parallel laufen)

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.D2_AXE_PORT) || 9689;
const ELECTRON = require('electron');
const AXE = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!fs.existsSync(AXE)) {
  console.error('axe-core fehlt (npm install --save-dev axe-core).');
  process.exit(1);
}
const axeSource = fs.readFileSync(AXE, 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMessage = (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id !== id) return;
      ws.removeEventListener('message', onMessage);
      const result = data.result && data.result.result;
      if (data.result && data.result.exceptionDetails) {
        reject(new Error(String(data.result.exceptionDetails.text || 'Fehler im Audit')));
        return;
      }
      resolve(result ? result.value : undefined);
    };
    ws.addEventListener('error', reject, { once: true });
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

(async () => {
  const child = spawn(ELECTRON, ['.', '--remote-debugging-port=' + PORT], { cwd: ROOT, windowsHide: true });
  let exited = false;
  child.on('exit', () => { exited = true; });
  let page = null;
  for (let i = 0; i < 60 && !page; i += 1) {
    await wait(1000);
    try {
      const list = await fetchJson('http://127.0.0.1:' + PORT + '/json');
      page = list.find((entry) => entry.type === 'page' && /renderer\/index\.html/.test(entry.url)) || null;
    } catch (error) { /* noch nicht bereit */ }
    if (exited) break;
  }
  if (!page) {
    console.error('axe-Audit: App nicht erreichbar (läuft bereits eine Instanz?).');
    try { child.kill(); } catch (error) { /* egal */ }
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await evaluate(ws, 'true');
  await evaluate(ws, `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelectorAll('.onboarding-backdrop').forEach((el) => el.classList.add('hidden'));
    document.querySelector('#settingsBtn')?.click();
    await wait(900);
    return true;
  })()`);
  await evaluate(ws, axeSource + ';true');
  const violations = await evaluate(ws, `(async () => {
    const result = await axe.run(document.querySelector('#settingsModal'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: false } }
    });
    return result.violations.map((entry) => ({ id: entry.id, impact: entry.impact, help: entry.help, nodes: entry.nodes.length }));
  })()`);
  await evaluate(ws, "document.querySelector('[data-close-settings]')?.click()");
  ws.close();
  try { child.kill(); } catch (error) { /* egal */ }

  const list = Array.isArray(violations) ? violations : [];
  if (!list.length) {
    console.log('axe-Audit OK: keine Verstöße (WCAG A/AA, ohne Kontrast).');
    process.exit(0);
  }
  console.log('axe-Audit: ' + list.length + ' Regel(n)');
  for (const entry of list) console.log('  [' + entry.impact + '] ' + entry.id + ' · ' + entry.help + ' (' + entry.nodes + ' Stellen)');
  const critical = list.filter((entry) => entry.impact === 'critical' || entry.impact === 'serious');
  if (critical.length) {
    console.error('axe-Audit: ' + critical.length + ' schwerwiegende Verstöße.');
    process.exit(1);
  }
  console.log('axe-Audit: nur mittlere/leichte Hinweise.');
  process.exit(0);
})().catch((error) => {
  console.error('axe-Audit FEHLER', error && (error.stack || error.message));
  process.exit(1);
});
