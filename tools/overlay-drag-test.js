// Testet den CDP-Drag-Flow im Overlay-Setup:
// setInterceptDrags -> dragIntercepted -> dispatchDragEvent(dragOver/drop).
// Genau der Ablauf, den der Hauptprozess jetzt verwendet.
const { app, BrowserWindow, webContents, screen } = require('electron');
const path = require('node:path');

const PAGE = 'file:///' + path.join(__dirname, 'overlay-drag-test-page.html').replace(/\\/g, '/');

app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.round(area.width * 0.88);
  const height = Math.round(area.height * 0.88);
  const win = new BrowserWindow({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    frame: false,
    show: false,
    backgroundColor: '#070a11',
    webPreferences: { webviewTag: true }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setSkipTaskbar(true);
  win.setOpacity(0.96);
  win.setResizable(false);
  win.setFocusable(true);
  win.show();
  win.moveTop();
  win.focus();
  await new Promise((r) => setTimeout(r, 300));

  await win.loadURL('data:text/html,<html><body style="margin:0">x</body></html>');
  const webviewId = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.createElement('webview');
    wv.style.width = '100%';
    wv.style.height = '100%';
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

  // Debugger + Drag-Interception wie im Hauptprozess.
  contents.debugger.attach('1.3');
  let dragData = null;
  contents.debugger.on('message', (event, method, params) => {
    if (method === 'Input.dragIntercepted' && params && params.data) {
      dragData = params.data;
      console.log('>>> dragIntercepted:', JSON.stringify(params.data));
    }
  });
  await contents.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });

  const centers = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview');
    const rect = wv.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  })()`);
  const inner = await contents.executeJavaScript(`(async () => {
    const d = document.getElementById('drag').getBoundingClientRect();
    const t = document.getElementById('target').getBoundingClientRect();
    const dp = document.getElementById('drop').getBoundingClientRect();
    return { drag: { x: d.left + d.width/2, y: d.top + d.height/2 },
             target: { x: t.left + t.width/2, y: t.top + t.height/2 },
             drop: { x: dp.left + dp.width/2, y: dp.top + dp.height/2 } };
  })()`);
  const targetX = Math.round(inner.target.x);
  const targetY = Math.round(inner.target.y);
  const dragX = Math.round(inner.drag.x);
  const dragY = Math.round(inner.drag.y);
  const dropX = Math.round(inner.drop.x);
  const dropY = Math.round(inner.drop.y);
  console.log('elemente (webview-intern):', JSON.stringify(inner));

  const dispatch = (params) => contents.debugger.sendCommand('Input.dispatchMouseEvent', params);

  // --- Test 1: Klick per CDP ---
  await dispatch({ type: 'mouseMoved', x: targetX, y: targetY, button: 'none', buttons: 0 });
  await dispatch({ type: 'mousePressed', x: targetX, y: targetY, button: 'left', buttons: 1, clickCount: 1 });
  await wait(60);
  await dispatch({ type: 'mouseReleased', x: targetX, y: targetY, button: 'left', buttons: 0, clickCount: 1 });
  await wait(300);
  const clickResult = await contents.executeJavaScript('document.getElementById("out").textContent');
  console.log('KLICK-TEST:', clickResult);

  // --- Test 2: Drag per CDP + Interception ---
  dragData = null;
  await dispatch({ type: 'mouseMoved', x: dragX, y: dragY, button: 'none', buttons: 0 });
  await dispatch({ type: 'mousePressed', x: dragX, y: dragY, button: 'left', buttons: 1, clickCount: 1 });
  await wait(100);
  // Bewegungen mit gedrückter Taste - löst dragIntercepted aus.
  let entered = false;
  for (let i = 1; i <= 6; i++) {
    const x = Math.round(dragX + (dropX - dragX) * i / 12);
    const y = Math.round(dragY + (dropY - dragY) * i / 12);
    if (dragData) {
      if (!entered) {
        entered = true;
        await contents.debugger.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data: dragData });
      }
      await contents.debugger.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x, y, data: dragData });
    } else {
      await dispatch({ type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    }
    await wait(80);
  }
  console.log('dragData vorhanden:', Boolean(dragData));
  await wait(200);
  // Restliche Bewegung + Drop.
  for (let i = 7; i <= 12; i++) {
    const x = Math.round(dragX + (dropX - dragX) * i / 12);
    const y = Math.round(dragY + (dropY - dragY) * i / 12);
    if (dragData) {
      await contents.debugger.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x, y, data: dragData });
    } else {
      await dispatch({ type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    }
    await wait(60);
  }
  if (dragData) {
    await contents.debugger.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: dropX, y: dropY, data: dragData });
    await dispatch({ type: 'mouseReleased', x: dropX, y: dropY, button: 'left', buttons: 0, clickCount: 1 });
  } else {
    await dispatch({ type: 'mouseReleased', x: dropX, y: dropY, button: 'left', buttons: 0, clickCount: 1 });
  }
  await wait(500);
  const dropResult = await contents.executeJavaScript('document.getElementById("out").textContent');
  console.log('DROP-TEST:', dropResult);

  const clickOk = /Klicks: 1/.test(clickResult);
  const dragOk = /DROP|dragover/.test(dropResult);
  console.log('ERGEBNIS: click=' + (clickOk ? 'OK' : 'FEHLER') + ' drag=' + (dragOk ? 'OK' : 'FEHLER'));
  process.exitCode = clickOk && dragOk ? 0 : 1;
  app.quit();
}).catch((e) => {
  console.error('TEST-FEHLER:', e.message);
  app.quit();
});
