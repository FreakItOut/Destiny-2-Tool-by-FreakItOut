'use strict';

// ============================================================
// Performance-Budget-Test
// ============================================================
// Startet die App, schaltet auf Englisch (anspruchsvollster Fall für
// den Übersetzer) und misst 6 Sekunden Leerlauf.
// Aufruf: npm run test:perf

const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronPath = require('electron');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9300 + Math.floor(Math.random() * 200);
const SCRIPT_BUDGET = 1.5; // Sekunden in 6 s Leerlauf
const TASK_BUDGET = 2.5;
const STARTUP_BUDGET = 12000; // ms vom Prozessstart bis zum bedienbaren Fenster

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    }).on('error', reject);
  });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(String(event.data));
    if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  };
  const call = (method, params) => new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await new Promise((resolve) => { ws.onopen = resolve; });
  return { ws, call };
}

(async () => {
  const startedAt = Date.now();
  const child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true
  });
  const cleanup = () => {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (error) { /* egal */ }
  };
  process.on('exit', cleanup);
  try {
    let page = null;
    for (let attempt = 0; attempt < 60 && !page; attempt += 1) {
      await sleep(500);
      try {
        const pages = await getJson(`http://127.0.0.1:${PORT}/json`);
        page = pages.find((entry) => entry.type === 'page' && entry.url.includes('index.html'));
      } catch (error) { /* noch nicht bereit */ }
    }
    if (!page) throw new Error('App-Fenster nicht bereit.');
    const client = await connect(page.webSocketDebuggerUrl);
    await client.call('Runtime.enable');
    await client.call('Performance.enable');
    const evaluate = async (expression) => {
      const response = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      return response.result && response.result.result ? response.result.result.value : undefined;
    };
    await evaluate("(() => { const close=document.querySelector('[data-onboarding-close]'); if(close) close.click(); window.i18n && window.i18n.setLanguage('en'); return true; })()");
    const startup = await evaluate(`(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const fcp = performance.getEntriesByName('first-contentful-paint')[0] || {};
      return {
        rendererUptime: Math.round(performance.now()),
        domContentLoaded: Math.round(Number(nav.domContentLoadedEventEnd) || 0),
        load: Math.round(Number(nav.loadEventEnd) || 0),
        firstPaint: Math.round(Number(fcp.startTime) || 0)
      };
    })()`);
    const startupMs = Date.now() - startedAt;
    await sleep(2000);
    const read = async () => {
      const response = await client.call('Performance.getMetrics');
      const out = {};
      for (const metric of (response.result && response.result.metrics) || []) out[metric.name] = metric.value;
      return out;
    };
    const before = await read();
    await sleep(6000);
    const after = await read();
    const script = (after.ScriptDuration || 0) - (before.ScriptDuration || 0);
    const task = (after.TaskDuration || 0) - (before.TaskDuration || 0);
    const nodes = (after.Nodes || 0);
    console.log(`Start: Fenster bereit nach ${startupMs} ms · Renderer-Uptime ${startup.rendererUptime} ms · DOMContentLoaded ${startup.domContentLoaded} ms · FCP ${startup.firstPaint} ms`);
    console.log(`Leerlauf 6 s (EN): Script ${script.toFixed(3)} s · Task ${task.toFixed(3)} s · Nodes ${nodes}`);
    client.ws.close();
    if (startupMs > STARTUP_BUDGET) {
      console.error(`STARTUP-BUDGET ÜBERSCHRITTEN (${startupMs} ms > ${STARTUP_BUDGET} ms).`);
      cleanup();
      process.exit(1);
    }
    if (script > SCRIPT_BUDGET || task > TASK_BUDGET) {
      console.error(`PERFORMANCE-BUDGET ÜBERSCHRITTEN (Script ${SCRIPT_BUDGET}s, Task ${TASK_BUDGET}s).`);
      cleanup();
      process.exit(1);
    }
    console.log('PERFORMANCE OK');
    cleanup();
    process.exit(0);
  } catch (error) {
    cleanup();
    console.error(error.message || String(error));
    process.exit(1);
  }
})();
