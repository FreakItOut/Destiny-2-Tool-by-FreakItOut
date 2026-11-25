// Findet die richtige Parameterform für Input.dispatchDragEvent.
const { app, BrowserWindow, webContents, screen } = require('electron');
const path = require('node:path');

const PAGE = 'file:///' + path.join(__dirname, 'overlay-drag-test-page.html').replace(/\\/g, '/');

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x: area.x + 100, y: area.y + 100, width: 800, height: 600,
    frame: false, show: true, webPreferences: { webviewTag: true }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.focus();
  await win.loadURL('data:text/html,<html><body style="margin:0">x</body></html>');
  const webviewId = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.createElement('webview');
    wv.style.width = '100%'; wv.style.height = '100%';
    wv.src = ${JSON.stringify(PAGE)};
    document.body.appendChild(wv);
    await new Promise((resolve, reject) => {
      wv.addEventListener('dom-ready', resolve, { once: true });
      setTimeout(() => reject(new Error('timeout')), 15000);
    });
    return wv.getWebContentsId();
  })()`);
  const contents = webContents.fromId(webviewId);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);

  contents.debugger.attach('1.3');
  let dragData = null;
  contents.debugger.on('message', (event, method, params) => {
    if (method === 'Input.dragIntercepted' && params) {
      dragData = params.data || params.dragData || null;
      console.log('dragIntercepted params:', JSON.stringify(params).slice(0, 300));
    }
  });
  await contents.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });

  const inner = await contents.executeJavaScript(`(async () => {
    const d = document.getElementById('drag').getBoundingClientRect();
    return { x: d.left + d.width/2, y: d.top + d.height/2 };
  })()`);
  const x0 = Math.round(inner.x);
  const y0 = Math.round(inner.y);
  const dispatch = (params) => contents.debugger.sendCommand('Input.dispatchMouseEvent', params);

  // Drag auslösen.
  await dispatch({ type: 'mouseMoved', x: x0, y: y0, button: 'none', buttons: 0 });
  await dispatch({ type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
  await wait(100);
  await dispatch({ type: 'mouseMoved', x: x0 + 20, y: y0 + 20, button: 'left', buttons: 1 });
  await wait(300);
  console.log('dragData:', JSON.stringify(dragData).slice(0, 200));
  await dispatch({ type: 'mouseReleased', x: x0 + 20, y: y0 + 20, button: 'left', buttons: 0, clickCount: 1 });

  if (!dragData) {
    console.log('kein dragIntercepted -> Abbruch');
    app.quit();
    return;
  }

  // Varianten testen.
  const variants = [
    ['dragData', { type: 'dragOver', x: 100, y: 200, dragData }],
    ['data', { type: 'dragOver', x: 100, y: 200, data: dragData }],
    ['dragData+files', { type: 'dragOver', x: 100, y: 200, dragData, files: [] }],
    ['items-only', { type: 'dragOver', x: 100, y: 200, dragData: { items: dragData.items || [], dragOperationsMask: dragData.dragOperationsMask || 1 } }]
  ];
  for (const [name, params] of variants) {
    try {
      await contents.debugger.sendCommand('Input.dispatchDragEvent', params);
      console.log('VARIANTE "' + name + '": OK');
    } catch (e) {
      console.log('VARIANTE "' + name + '": ' + e.message.slice(0, 120));
    }
  }
  app.quit();
}).catch((e) => {
  console.error('TEST-FEHLER:', e.message);
  app.quit();
});
