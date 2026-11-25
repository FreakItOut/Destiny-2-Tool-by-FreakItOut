'use strict';

// Prüft, dass das Xûr-Fenster sein externes Stylesheet lädt und nicht
// den CSS-Text als Inhalt anzeigt. Aufruf: npm run test:xur

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) return;
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    console.error('Xûr-Seitentest: Zeitüberschreitung.');
    app.exit(1);
  }, 20000);
  if (watchdog.unref) watchdog.unref();
  try {
    const win = new BrowserWindow({
      show: false,
      width: 420,
      height: 640,
      webPreferences: {
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, 'xur-test-preload.js')
      }
    });
    await win.loadFile(path.join(ROOT, 'renderer', 'xur.html'));
    const result = await win.webContents.executeJavaScript(`(() => {
      const link = document.querySelector('link[rel="stylesheet"]');
      const style = document.querySelector('style');
      const card = document.querySelector('.xur-card');
      const text = document.body.innerText || '';
      return {
        link: Boolean(link),
        href: link ? link.getAttribute('href') : '',
        styleTag: Boolean(style),
        card: Boolean(card),
        display: card ? getComputedStyle(card).display : '',
        background: card ? getComputedStyle(card).backgroundColor : '',
        sheets: document.styleSheets.length,
        textHasCss: /:root\\s*\\{|color-scheme\\s*:/i.test(text),
        text: text.slice(0, 160)
      };
    })()`);
    check('Xûr-HTML lädt xur.css', result.link && /xur\.css$/.test(result.href), result.href);
    check('Kein Inline-CSS mehr im HTML', !result.styleTag);
    check('Xûr-Karte wird gestylt', result.card && result.display === 'flex' && /rgba?\(/.test(result.background), `${result.display} ${result.background}`);
    check('Stylesheet ist geladen', result.sheets >= 1, String(result.sheets));
    check('CSS wird nicht als Text angezeigt', !result.textHasCss, result.text);
    clearTimeout(watchdog);
    if (failed) {
      console.error(`\nXÛR-SEITENTEST FEHLGESCHLAGEN: ${failed}`);
      app.exit(1);
      return;
    }
    console.log('Xûr-Seitentest OK: externes Stylesheet aktiv, kein CSS-Text im Inhalt.');
    app.exit(0);
  } catch (error) {
    clearTimeout(watchdog);
    console.error('Xûr-Seitentest fehlgeschlagen:', error && (error.stack || error.message || String(error)));
    app.exit(1);
  }
});
