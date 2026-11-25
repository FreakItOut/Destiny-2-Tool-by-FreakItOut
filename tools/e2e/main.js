// Kleiner Electron-Harness: laedt eine Testseite ueber einen lokalen
// HTTP-Server (damit ES-Module ohne file://-CORS laden) und gibt das
// Ergebnis von window.__INVTEST__ als Exit-Code aus.
const { app, BrowserWindow, screen } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.INV_ROOT || 'C:\\Users\\FreakItOut\\Documents\\Destiny 2 Tool';
const TEMP = __dirname;
const LOG = path.join(TEMP, 'run.log');
const OUT = path.join(TEMP, 'result.json');

fs.writeFileSync(LOG, '');
function log(line) {
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${line}\n`);
}

process.on('uncaughtException', (error) => log('UNCAUGHT ' + (error && error.stack)));
app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function resolveFile(urlPath) {
  if (urlPath === '/' || urlPath === '/index.html') return path.join(TEMP, 'index.html');
  if (urlPath.startsWith('/__test/')) return path.join(TEMP, urlPath.slice('/__test/'.length));
  return path.join(ROOT, urlPath);
}

const server = http.createServer((req, res) => {
  const clean = decodeURIComponent(String(req.url || '/').split('?')[0]);
  const file = resolveFile(clean);
  if (!file.startsWith(TEMP) && !file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (error, buffer) => {
    if (error) { log('404 ' + clean); res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buffer);
  });
});

let finished = false;
function finish(code, info) {
  if (finished) return;
  finished = true;
  try { fs.writeFileSync(OUT, JSON.stringify(info, null, 2)); } catch (error) { /* egal */ }
  log('FINISH ' + code + ' ' + JSON.stringify(info));
  try { server.close(); } catch (error) { /* egal */ }
  app.exit(code);
}

setTimeout(() => finish(1, { ok: false, error: 'Watchdog: kein Ergebnis nach 70s' }), 70000);

app.whenReady().then(() => {
  server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  log('server ' + port);
  const displays = screen.getAllDisplays();
  const rightScreen = displays.filter((display) => display.bounds.x > 0).sort((a, b) => b.bounds.x - a.bounds.x)[0] || displays[displays.length - 1];
  const screenBounds = (rightScreen && rightScreen.bounds) || { x: 0, y: 0, width: 1400, height: 900 };
  const win = new BrowserWindow({
    x: Math.round(screenBounds.x + 20),
    y: Math.round(screenBounds.y + 20),
    width: Math.min(1400, screenBounds.width - 40),
    height: Math.min(900, screenBounds.height - 40),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.webContents.on('console-message', (...args) => {
    let level = 0;
    let message = '';
    if (args[0] && typeof args[0] === 'object' && 'message' in args[0]) {
      level = Number(args[0].level) || 0;
      message = String(args[0].message || '');
    } else {
      level = Number(args[1]) || 0;
      message = String(args[2] || '');
    }
    log(`page:${level} ${message}`);
  });
  win.webContents.on('did-fail-load', (event, code, description, url) => log(`did-fail-load ${code} ${description} ${url}`));
  win.webContents.on('render-process-gone', (event, details) => log('render-process-gone ' + JSON.stringify(details)));
  try {
    await win.loadURL(`http://127.0.0.1:${port}/__test/index.html`);
    log('loaded');
  } catch (error) {
    log('loadURL-Fehler ' + (error && error.message));
  }
  const deadline = Date.now() + 60000;
  let result = null;
  while (Date.now() < deadline) {
    result = await win.webContents.executeJavaScript('window.__INVTEST__ || null').catch(() => null);
    if (result) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (process.env.INV_SCREENSHOT) {
    try {
      win.show();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const image = await win.webContents.capturePage();
      fs.writeFileSync(process.env.INV_SCREENSHOT, image.toPNG());
      log('screenshot ' + process.env.INV_SCREENSHOT);
    } catch (error) {
      log('screenshot-fehler ' + (error && error.message));
    }
  }
  if (process.env.INV_PAGE_SHOTS && result && result.ok) {
    try {
      const dir = process.env.INV_PAGE_SHOTS;
      fs.mkdirSync(dir, { recursive: true });
      win.show();
      await win.webContents.executeJavaScript("document.querySelector('#inventoryBtn')?.click(); true").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 600));
      // Reste aus dem E2E-Lauf (Popup, Tooltip, Toast) entfernen, damit
      // die Seitenaufnahmen reproduzierbar sind.
      await win.webContents.executeJavaScript(`(() => {
        document.querySelectorAll('.inv-popup-close').forEach((button) => button.click());
        document.querySelectorAll('.cmd-palette:not(.hidden) [aria-label="Schließen"]').forEach((button) => button.click());
        document.querySelectorAll('.inventory-tooltip.show, .vc-tooltip.show, #armorPickerTooltip.show, #toolsXurTooltip.show, .picker-tooltip.show').forEach((tip) => {
          tip.classList.remove('show');
          tip.innerHTML = '';
        });
        return true;
      })()`).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 400));
      // Optional TV-Modus für die Aufnahmen (INV_TV_MODE=1).
      if (process.env.INV_TV_MODE === '1') {
        await win.webContents.executeJavaScript("document.querySelectorAll('.inv-popup-close').forEach((b) => b.click()); document.querySelectorAll('.cmd-palette:not(.hidden) [aria-label=\"Schließen\"]').forEach((b) => b.click()); document.body.classList.add('tv-mode'); document.body.style.zoom = '1.25'; document.body.style.setProperty('--ui-zoom', '1.25'); true").catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      for (const view of ['overview', 'builds', 'week', 'collection', 'vendor']) {
        await win.webContents.executeJavaScript("(async () => { document.querySelector('.dinv-tab[data-tab=\"tools\"]')?.click(); for (let i = 0; i < 60 && !document.querySelector('[data-tool-view]'); i += 1) await new Promise((r) => setTimeout(r, 50)); document.querySelector('[data-tool-view=\"" + view + "\"]')?.click(); return true; })()").catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 800));
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, view + '.png'), image.toPNG());
        log('page ' + view);
      }
      // Zusatzaufnahme im TV-Modus: Inventar (Kacheln, Tooltip-Ziele).
      if (process.env.INV_TV_MODE === '1') {
        await win.webContents.executeJavaScript("document.querySelector('.dinv-tab[data-tab=\"inventory\"]')?.click(); true").catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 900));
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, 'inventory.png'), image.toPNG());
        log('page inventory');
        await win.webContents.executeJavaScript("document.querySelector('.dinv-tab[data-tab=\"loadouts\"]')?.click(); true").catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 900));
        const image2 = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, 'loadouts.png'), image2.toPNG());
        log('page loadouts');
      }
    } catch (error) {
      log('page-shot-fehler ' + (error && error.message));
    }
  }
  if (process.env.INV_DIALOG_SHOTS && result && result.ok) {
    try {
      const dir = process.env.INV_DIALOG_SHOTS;
      fs.mkdirSync(dir, { recursive: true });
      win.show();
      await win.webContents.executeJavaScript("document.querySelector('#inventoryBtn')?.click(); true").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 700));
      const shot = async (name) => {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, name + '.png'), image.toPNG());
        log('dialog ' + name);
      };
      // Item-Popup
      await win.webContents.executeJavaScript("document.querySelector('.dinv-tile')?.click(); true").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 800));
      await shot('popup');
      await win.webContents.executeJavaScript("document.querySelector('.inv-popup-close')?.click(); true").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Loadout-Editor
      await win.webContents.executeJavaScript("document.querySelector('.dinv-tab[data-tab=\"loadouts\"]')?.click(); true").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 900));
      await shot('loadouts');
    } catch (error) {
      log('dialog-shot-fehler ' + (error && error.message));
    }
  }
  if (process.env.INV_TV_AUDIT && result && result.ok) {
    try {
      win.show();
      await win.webContents.executeJavaScript("document.querySelector('#inventoryBtn')?.click(); document.querySelectorAll('.inv-popup-close').forEach((b) => b.click()); document.body.classList.add('tv-mode'); document.body.style.zoom = '1.25'; document.body.style.setProperty('--ui-zoom', '1.25'); true").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 900));
      const audit = [];
      for (const view of ['overview', 'builds', 'week', 'collection', 'vendor']) {
        await win.webContents.executeJavaScript("(async () => { document.querySelector('.dinv-tab[data-tab=\"tools\"]')?.click(); for (let i = 0; i < 60 && !document.querySelector('[data-tool-view]'); i += 1) await new Promise((r) => setTimeout(r, 50)); document.querySelector('[data-tool-view=\"" + view + "\"]')?.click(); return true; })()").catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 700));
        const found = await win.webContents.executeJavaScript(`(() => {
          const bad = [];
          const contrastIssues = [];
          let minContrast = 21;
          const parse = (value) => {
            const match = String(value || '').match(/rgba?\\(([^)]+)\\)/);
            if (!match) return null;
            const parts = match[1].split(',').map(Number);
            return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
          };
          const over = (top, bottom) => {
            if (!bottom) return top;
            const a = top.a;
            return {
              r: top.r * a + bottom.r * (1 - a),
              g: top.g * a + bottom.g * (1 - a),
              b: top.b * a + bottom.b * (1 - a),
              a: 1
            };
          };
          const luminance = (color) => {
            const channel = (value) => {
              const c = value / 255;
              return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
          };
          const backgroundOf = (el) => {
            let node = el;
            let result = null;
            while (node && node !== document.documentElement.parentNode) {
              const style = getComputedStyle(node);
              const color = parse(style.backgroundColor);
              if (color && color.a > 0.02) {
                result = over(color, result);
                if (color.a >= 0.98) break;
              }
              node = node.parentElement;
            }
            return result || { r: 11, g: 16, b: 24, a: 1 };
          };
          for (const el of document.querySelectorAll('body *')) {
            const text = String(el.textContent || '').trim();
            if (!text) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
            if ([...el.childNodes].some((node) => node.nodeType === 1)) continue;
            // Deaktivierte Steuerelemente sind von Kontrastregeln ausgenommen.
            const isDisabled = el.disabled === true
              || el.getAttribute('aria-disabled') === 'true'
              || Number(style.opacity) < 0.55
              || Number(getComputedStyle(el).opacity) < 0.55;
            const size = parseFloat(style.fontSize) || 0;
            const color = isDisabled ? null : parse(style.color);
            if (color) {
              const fg = over(color, backgroundOf(el));
              const bg = backgroundOf(el);
              const l1 = luminance(fg);
              const l2 = luminance(bg);
              const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
              minContrast = Math.min(minContrast, ratio);
              if (ratio < 4.5) contrastIssues.push({ cls: String(el.className || el.tagName), parent: String((el.parentElement && el.parentElement.className) || ''), color: String(style.color), ratio: Math.round(ratio * 10) / 10, text: text.slice(0, 40) });
            }
            if (size >= 10) continue;
            bad.push({ cls: String(el.className || el.tagName), size: Math.round(size * 10) / 10, text: text.slice(0, 46) });
          }
          const focusable = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex]')]
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              if (rect.width < 2 || rect.height < 2) return false;
              const style = getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            });
          const unreachable = focusable.filter((el) => Number(el.tabIndex) < 0).length;
          return {
            size: bad,
            minContrast: Math.round(minContrast * 10) / 10,
            contrastIssues: contrastIssues.slice(0, 5),
            focusables: focusable.length,
            unreachable
          };
        })()`).catch(() => ({ size: [], minContrast: 21, contrastIssues: [], focusables: 0, unreachable: 0 }));
        audit.push({ view, bad: (found && found.size) || [], minContrast: (found && found.minContrast) || 21, contrastIssues: (found && found.contrastIssues) || [], focusables: (found && found.focusables) || 0, unreachable: (found && found.unreachable) || 0 });
      }
      fs.writeFileSync(process.env.INV_TV_AUDIT, JSON.stringify({ zoom: 1.25, views: audit }, null, 2));
      log('tv-audit ' + process.env.INV_TV_AUDIT);
    } catch (error) {
      log('tv-audit-fehler ' + (error && error.message));
    }
  }
  if (process.env.INV_TV_PROBE && result && result.ok) {
    try {
      win.show();
      const probe = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        document.querySelector('#inventoryBtn')?.click();
        document.querySelectorAll('.inv-popup-close').forEach((b) => b.click());
        document.body.classList.add('tv-mode');
        document.body.style.zoom = '1.25'; document.body.style.setProperty('--ui-zoom', '1.25');
        document.querySelector('.dinv-tab[data-tab="tools"]')?.click();
        for (let i = 0; i < 60 && !document.querySelector('[data-tool-view]'); i += 1) await wait(50);
        document.querySelector('[data-tool-view="builds"]')?.click();
        await wait(800);
        const pieces = [...document.querySelectorAll('[data-picker-tip]')];
        const first = pieces[0] || null;
        const tabbable = Boolean(first && first.tabIndex >= 0);
        if (first) first.focus();
        await wait(200);
        const tipShown = Boolean(document.querySelector('.picker-tooltip.show'));
        if (first) first.blur();
        await wait(120);
        const tipHidden = !document.querySelector('.picker-tooltip.show');
        // Kleinste sichtbare Schrift im aktuellen Bild.
        let minFont = 99;
        for (const el of document.querySelectorAll('body *')) {
          const text = String(el.textContent || '').trim();
          if (!text) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if ([...el.childNodes].some((node) => node.nodeType === 1)) continue;
          minFont = Math.min(minFont, parseFloat(style.fontSize) || 99);
        }
        return { pieces: pieces.length, tabbable, tipShown, tipHidden, minFont: Math.round(minFont * 10) / 10 };
      })()`).catch((error) => ({ error: String(error && error.message) }));
      fs.writeFileSync(process.env.INV_TV_PROBE, JSON.stringify(probe, null, 2));
      log('tv-probe ' + process.env.INV_TV_PROBE);
    } catch (error) {
      log('tv-probe-fehler ' + (error && error.message));
    }
  }
  // Bei Fehlschlag ein Bildschirmfoto für die Fehlersuche ablegen.
  if (!(result && result.ok) && process.env.INV_FAIL_SHOT) {
    try {
      win.show();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const image = await win.webContents.capturePage();
      fs.writeFileSync(process.env.INV_FAIL_SHOT, image.toPNG());
      log('fail-shot ' + process.env.INV_FAIL_SHOT);
    } catch (error) {
      log('fail-shot-fehler ' + (error && error.message));
    }
  }
  finish(result && result.ok ? 0 : 1, result || { ok: false, error: 'kein __INVTEST__' });
  });
});

app.on('window-all-closed', () => {});
