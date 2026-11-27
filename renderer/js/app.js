// Die frühere Webseiten-Ansicht wurde entfernt. Die App zeigt nur noch
// Dashboard, Inventar/Loadouts und die Werkzeuge.
import { createController, BUTTONS } from './controller.js';
import { BINDING_ACTIONS } from './settings-bindings.js';
import { createOverlayHud } from './overlay-hud.js';
import { initClock, nextDailyReset, nextWeeklyReset, xurEnd, xurActive } from './clock.js';
import { icon } from './icons.js';
import { createPalette } from './palette.js';
import { createDashboard } from './dashboard.js';
import { createOnboarding } from './onboarding.js';
import { createNotes } from './notes.js';
import { createChecklist } from './checklist.js';
import { createOverlayLoadouts } from './overlay-loadouts.js';
import { championTypes, CHAMPION_SHORT } from './champions.js';
import {
  qs,
  qsa,
  toast,
  deepMerge,
  clamp,
  escapeHtml,
  formatAccelerator,
  formatDuration,
  debounce,
  modalOpen,
  modalClose,
  initNotificationCenter,
  isNotificationCenterOpen,
  closeNotificationCenter
} from './ui.js';

const api = window.d2;
if (!api) {
  throw new Error('Die Electron-Brücke (window.d2) fehlt.');
}
// Temporär: Fehlerort für den Smoke-Test sichtbar machen.
window.addEventListener('error', (event) => {
  console.error('[d2-eval]', event.message, '@', event.filename, ':', event.lineno, ':', event.colno);
});

// Zentraler Konfig-Stau: wird von setConfig unten benutzt, muss aber
// schon für alle früher registrierten Handler existieren (kein TDZ).
let pendingPatch = null;
let patchTimer = 0;
// Elemente & Zustände, auf die auch die früh registrierten Web-
// Callbacks (onState/onTitle) zugreifen können - alle oben deklariert.
let lastSelection = null;
// notesDirty/notesAutosaveTimer liegen jetzt im Notizen-Modul
// (renderer/js/notes.js).
let persistTimer = 0;
const windowBaseTitle = document.title;
let offlineReloadDone = false;

// ------------------------------------------------------------
// Grundzustand
// ------------------------------------------------------------

let cfg = await api.getConfig();

// Änderungsprotokoll: welche Bereiche wurden wann geändert?
function logConfigPatch(before, patch) {
  try {
    const changed = Object.keys(patch || {}).filter((key) => {
      try {
        return JSON.stringify(before && before[key]) !== JSON.stringify(deepMerge(before && before[key], patch[key]));
      } catch (error) {
        return true;
      }
    });
    if (!changed.length) return;
    const raw = JSON.parse(window.localStorage.getItem('d2tool.cfgLog') || '[]');
    const list = Array.isArray(raw) ? raw : [];
    list.unshift({ at: Date.now(), keys: changed.slice(0, 6) });
    window.localStorage.setItem('d2tool.cfgLog', JSON.stringify(list.slice(0, 50)));
  } catch (error) {
    // Protokoll ist optional.
  }
}
let overlayState = (await api.getOverlayState().catch(() => null)) || {
  mode: 'window',
  visible: false,
  clickThrough: false,
  opacity: 0.96
};

// Auto-Ausblenden: Overlay nach X Sekunden ohne Eingabe ausblenden.
let autoHideTimer = null;
function resetAutoHideTimer() {
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  const seconds = Number(cfg && cfg.overlay && cfg.overlay.autoHideSeconds) || 0;
  if (!seconds || seconds <= 0) return;
  if (!overlayState || overlayState.mode !== 'overlay' || !overlayState.visible) return;
  autoHideTimer = setTimeout(() => {
    autoHideTimer = null;
    if (overlayState && overlayState.mode === 'overlay' && overlayState.visible) {
      api.toggleOverlay().catch(() => {});
    }
  }, seconds * 1000);
  if (autoHideTimer.unref) autoHideTimer.unref();
}
// Benutzeraktivität setzt den Timer zurück.
window.addEventListener('mousemove', resetAutoHideTimer, { passive: true });
window.addEventListener('keydown', resetAutoHideTimer, { passive: true });
window.addEventListener('wheel', resetAutoHideTimer, { passive: true });

let settings = null;
let onboarding = null;
let overlayHud = null;
let padDashboardChord = false;
let lastError = null;
let wasOverlayVisible = false;
let windowFocused = document.hasFocus();
let webviewHasFocus = false;

window.addEventListener('focus', () => { windowFocused = true; });
window.addEventListener('blur', () => {
  // Im Overlay-Modus darf ein blur den Controller-Cursor nicht ausblenden,
  // da das Fenster dort oft nicht den Fokus hält, aber bedienbar bleibt.
  if (overlayState.mode === 'overlay') return;
  // Beim Klick in eine <webview> kann ein blur ausgelöst werden, obwohl
  // das Fenster aktiv bleibt. Deshalb erst nach einem Tick prüfen.
  setTimeout(() => {
    if (document.hasFocus() || webviewHasFocus) windowFocused = true;
    else windowFocused = false;
  }, 0);
});
document.addEventListener('focusin', (event) => {
  if (event.target && event.target.tagName === 'WEBVIEW') webviewHasFocus = true;
}, true);
document.addEventListener('focusout', (event) => {
  if (event.target && event.target.tagName === 'WEBVIEW') webviewHasFocus = false;
}, true);

function prepareIcons() {
  for (const element of qsa('[data-icon]')) {
    const name = element.dataset.icon;
    element.removeAttribute('data-icon');
    element.insertAdjacentHTML('afterbegin', icon(name));
    for (const node of [...element.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const span = document.createElement('span');
        span.textContent = node.textContent.trim();
        node.replaceWith(span);
      }
    }
  }
}

prepareIcons();

// ------------------------------------------------------------
// Elemente
// ------------------------------------------------------------

const pageTitle = qs('#pageTitle');
const hintBar = qs('#hintBar');
const overlayLockBtn = qs('#overlayLockBtn');
const controllerStatus = qs('#controllerStatus');
const controllerStatusText = qs('#controllerStatusText');

// ------------------------------------------------------------
// Ehemalige Webseiten-Schnittstelle (abgeschaltet)
// ------------------------------------------------------------
// Die App lädt keine fremden Seiten mehr. Der Stub hält die noch
// vorhandenen Aufrufstellen (Dashboard, Controller, Tastatur) ruhig.

let inventoryInstance = null;
let inventoryPromise = null;
let inventoryOpenRequested = false;
function loadInventory() {
  if (inventoryInstance) return Promise.resolve(inventoryInstance);
  if (inventoryPromise) return inventoryPromise;
  inventoryPromise = import('./inventory.js')
    .then((module) => {
      inventoryInstance = module.createInventory({
        api,
        qs,
        toast,
        escapeHtml,
        getCfg: () => cfg,
        setConfig,
        togglePage: () => toggleInventoryPage()
      });
      return inventoryInstance;
    })
    .catch((error) => {
      inventoryPromise = null;
      console.error('[d2] Inventar konnte nicht geladen werden', error);
      toast('Inventar konnte nicht geladen werden.', 'error', 3200);
      return null;
    });
  return inventoryPromise;
}

const inventory = {
  get loaded() { return Boolean(inventoryInstance); },
  load: loadInventory,
  open() {
    inventoryOpenRequested = true;
    loadInventory().then((instance) => {
      if (instance && inventoryOpenRequested) instance.open();
    });
  },
  close() {
    inventoryOpenRequested = false;
    if (inventoryInstance) inventoryInstance.close();
  },
  searchContent(query) {
    return inventoryInstance && typeof inventoryInstance.searchContent === 'function'
      ? inventoryInstance.searchContent(query)
      : [];
  },
  openPostmaster() {
    loadInventory().then((instance) => {
      if (instance && typeof instance.openPostmaster === 'function') instance.openPostmaster();
    });
  },
  openTools(view, detail) {
    loadInventory().then((instance) => {
      if (instance && typeof instance.openTools === 'function') instance.openTools(view, detail);
    });
  },
  applyLoadoutById(id) {
    loadInventory().then((instance) => {
      if (instance && typeof instance.applyLoadoutById === 'function') instance.applyLoadoutById(id);
    });
  },
  applyLoadoutMissingById(id) {
    loadInventory().then((instance) => {
      if (instance && typeof instance.applyLoadoutMissingById === 'function') instance.applyLoadoutMissingById(id);
    });
  },
  refresh(force) {
    return loadInventory().then((instance) => (
      instance && typeof instance.refresh === 'function' ? instance.refresh(force === true) : undefined
    ));
  },
  refreshInventory(force) {
    return loadInventory().then((instance) => (
      instance && typeof instance.refresh === 'function' ? instance.refresh(force === true) : undefined
    ));
  },
  refreshWishlist() {
    return loadInventory().then((instance) => (
      instance && typeof instance.refreshWishlist === 'function' ? instance.refreshWishlist() : undefined
    ));
  }
};

// Der Inventar-Knopf gehört zur App-Hülle und muss schon vor dem
// Lazy-Laden des Inventarmoduls funktionieren. Das Modul hängt seinen
// eigenen Handler nur an, wenn die App ihn nicht bereits gesetzt hat
// (z. B. im E2E-Harness ohne app.js).
const inventoryBtnApp = qs('#inventoryBtn');
if (inventoryBtnApp) {
  window.__d2InventoryButtonHandled = true;
  inventoryBtnApp.addEventListener('click', () => toggleInventoryPage());
}
const toolsBtnApp = qs('#toolsBtn');
if (toolsBtnApp) {
  toolsBtnApp.addEventListener('click', () => {
    showInventoryPage();
    try { inventory.openTools('overview'); } catch (error) { /* egal */ }
  });
}
const overlayLoadouts = createOverlayLoadouts({
  getCfg: () => cfg,
  escapeHtml,
  toast,
  openInventory: () => showInventoryPage(),
  applyLoadout: (id) => {
    if (inventory && typeof inventory.applyLoadoutById === 'function') inventory.applyLoadoutById(id);
  }
});

const notes = createNotes({
  api,
  qs,
  toast,
  escapeHtml,
  getCfg: () => cfg,
  setConfig
});
const checklist = createChecklist({
  qs,
  toast,
  escapeHtml,
  getCfg: () => cfg,
  setConfig,
  notes,
  getInventoryData: () => (inventoryInstance && typeof inventoryInstance.getData === 'function' ? inventoryInstance.getData() : null)
});

// ------------------------------------------------------------
// Feature-Module Phase 2: Dashboard + Befehlspalette
// ------------------------------------------------------------
const dashboard = createDashboard({
  api,
  getConfig: () => cfg,
  setConfig,
  pageTitle,
  updateWindowTitle,
  checklistToggle: checklist.toggle,
  openBungieSettings: () => settings.open('bungie'),
  openOnboarding: () => { if (onboarding) onboarding.open(); },
  openSettings: (tab) => settings.open(tab),
  openInventory: () => showInventoryPage(),
  onOpen: () => closeInventorySilently(),
  toast,
  escapeHtml,
  icon,
  formatDuration,
  clamp,
  qs,
  qsa
});

// ------------------------------------------------------------
// Titelleiste: Reset-/Xûr-Chips und Fenstersteuerung
// ------------------------------------------------------------
initClock({
  onToday: () => dashboard.open(),
  onXur: () => {
    try { showInventoryPage(); } catch (error) { /* egal */ }
    try { inventory.openTools('vendor', { vendorHash: 2190858386 }); } catch (error) { /* egal */ }
  },
  onReset: () => {
    toast('Wöchentlicher Reset', 'info', 4000);
    try { inventory.refreshInventory(); } catch (error) { /* egal */ }
    try { dashboard.render(); } catch (error) { /* egal */ }
  }
});

for (const button of qsa('[data-win]')) {
  button.addEventListener('click', async () => {
    const action = button.dataset.win;
    if (action === 'minimize') await api.minimizeWindow();
    else if (action === 'maximize') await api.toggleMaximizeWindow();
    else if (action === 'close') await api.closeWindow();
  });
}
const pinBtn = qs('#pinBtn');
if (pinBtn) {
  pinBtn.addEventListener('click', async () => {
    const result = await api.windowTogglePin();
    if (result && result.ok) {
      pinBtn.classList.toggle('active', result.pinned === true);
      toast(result.pinned ? 'Fenster immer im Vordergrund.' : 'Fenster-Vordergrund aus.', 'info', 1600);
    } else if (result && result.error) {
      toast(result.error, 'warning', 2200);
    }
  });
}
const titlebar = qs('#titlebar');
if (titlebar) {
  titlebar.addEventListener('dblclick', (event) => {
    if (event.target.closest('button, select, input')) return;
    api.toggleMaximizeWindow().catch(() => {});
  });
}

const palette = createPalette({
  api,
  getConfig: () => cfg,
  settings: { open: (tab) => settings.open(tab) },
  notesApi: notes,
  checklistToggle: checklist.toggle,
  checklistOpen: () => checklist.open('all'),
  inventory: { toggle: toggleInventoryPage, open: showInventoryPage },
  contentSearch: (query) => (inventory && typeof inventory.searchContent === 'function' ? inventory.searchContent(query) : []),
  openPostmaster: () => {
    if (!showInventoryPage) return;
    showInventoryPage();
    if (inventory && inventory.openPostmaster) inventory.openPostmaster();
  },
  togglePostmaster: async () => {
    try {
      const state = await api.postmasterGetState();
      await api.postmasterSetEnabled(!(state && state.open));
    } catch (error) {
      // egal
    }
  },
  bungieLogin: () => api.bungieOAuthStart().catch(() => {}),
  refreshWishlist: () => (inventory && inventory.refreshWishlist ? inventory.refreshWishlist() : Promise.resolve()),
  dashboard,
  appendStopwatchToNote,
  anyModalOpen,
  toast,
  escapeHtml,
  qs,
  qsa,
  modalOpen,
  modalClose
});

// ------------------------------------------------------------
// Controller
// ------------------------------------------------------------

let xinputHandler = null;
let axesHandler = null;

const controller = createController({
  api,
  cursorElement: qs('#padCursor'),
  getConfig: () => cfg,
  isInteractive: () => {
    if (document.body.classList.contains('mode-overlay')) {
      // Im Overlay zählt nur: sichtbar und nicht im Maus-Durchlass.
      return document.body.classList.contains('overlay-shown') && !document.body.classList.contains('overlay-locked');
    }
    // Im Fenstermodus darf ein Klick in eine <webview> (z. B. auf
    // einen Link) die Steuerung nicht abschalten. Solange das Dokument
    // sichtbar ist, bleibt der Controller aktiv.
    return !document.hidden;
  },
  // Controller-Test-Fenster: nur Anzeige, keine Bedienung.
  isInputBlocked: () => {
    const test = qs('#controllerTestModal');
    return Boolean(test && !test.classList.contains('hidden'));
  },
  onToggleOverlay: () => {
    api.toggleOverlay().catch(() => {});
  },
  onAction: (action, payload) => handlePadAction(action, payload),
  onStatus: (status) => {
    updateControllerStatus(status);
    if (settings) settings.updatePadStatus(status);
  },
  onButtons: (pressed) => {
    if (settings) settings.updatePadButtons(pressed);
    // LB+RB: Dashboard ein-/ausblenden (Chord, einmal pro Tastendruck).
    if (pressed && pressed[4] && pressed[5] && !padDashboardChord) {
      padDashboardChord = true;
      if (dashboard.hidden()) dashboard.open();
      else dashboard.restore();
    } else if (!pressed || !pressed[4] || !pressed[5]) {
      padDashboardChord = false;
    }
  },
  onCaptureChanged: (ids, labels) => {
    if (settings) settings.onCaptureChanged(ids, labels);
  },
  onXInput: (handler) => {
    xinputHandler = handler;
  },
  onAxes: (handler) => {
    axesHandler = handler;
    // Die Einstellungen zeigen die Achsen live an.
    axesHandler = (payload) => {
      handler(payload);
      if (settings) settings.updateAxes(payload);
    };
    if (settings) settings.updateAxes({ raw: [0, 0, 0, 0], calibrated: [0, 0, 0, 0] });
  }
});

// ------------------------------------------------------------
// Einstellungen
// ------------------------------------------------------------

// Einstellungen werden erst beim ersten Öffnen geladen. Der Proxy hält
// alle Aufrufstellen synchron; bis dahin sind Updates No-ops.
let settingsInstance = null;
let settingsPromise = null;
function ensureSettings() {
  if (settingsInstance) return Promise.resolve(settingsInstance);
  if (!settingsPromise) {
    settingsPromise = import('./settings.js')
      .then(({ initSettings }) => {
        settingsInstance = initSettings({
          api,
          getConfig: () => cfg,
          setConfig,
          controller
        });
        return settingsInstance;
      })
      .catch((error) => {
        settingsPromise = null;
        console.error('[settings] Laden fehlgeschlagen:', error && error.stack ? error.stack : error);
        throw error;
      });
  }
  return settingsPromise;
}

settings = {
  open(tab) {
    return ensureSettings().then((instance) => instance.open(tab)).catch(() => {});
  },
  close() {
    if (settingsInstance) settingsInstance.close();
  },
  isOpen() {
    return Boolean(settingsInstance && settingsInstance.isOpen());
  },
  onCaptureChanged(...args) { settingsInstance?.onCaptureChanged?.(...args); },
  updateAxes(...args) { settingsInstance?.updateAxes?.(...args); },
  updateGameStatus(...args) { settingsInstance?.updateGameStatus?.(...args); },
  updatePadAction(...args) { settingsInstance?.updatePadAction?.(...args); },
  updatePadButtons(...args) { settingsInstance?.updatePadButtons?.(...args); },
  updatePadStatus(...args) { settingsInstance?.updatePadStatus?.(...args); },
  updateStats(...args) { settingsInstance?.updateStats?.(...args); },
  updateTestLive(...args) { settingsInstance?.updateTestLive?.(...args); }
};

onboarding = createOnboarding({
  api,
  getConfig: () => cfg,
  setConfig,
  toast,
  dashboard,
  openSettings: (tab) => settings.open(tab)
});

// Benachrichtigungszentrum (Glocke in der Statusleiste).
initNotificationCenter();

// Befehlspalette (Strg+K) und globaler Datenstatus.
const commandPalette = qs('#commandPalette');
const commandInput = qs('#commandPaletteInput');
const commandResults = qs('#commandPaletteResults');
let commandItems = [];
let commandIndex = 0;

function commandDefinitions() {
  return [
    { label: 'Dashboard öffnen', hint: 'Übersicht', run: () => dashboard.open() },
    { label: 'Inventar öffnen', hint: 'Ausrüstung', run: () => showInventoryPage() },
    { label: 'Werkzeuge: Übersicht', hint: 'Tools', run: () => inventory.openTools('overview') },
    { label: 'Werkzeuge: Builds', hint: 'Tools', run: () => inventory.openTools('builds') },
    { label: 'Werkzeuge: Woche', hint: 'Tools', run: () => inventory.openTools('week') },
    { label: 'Werkzeuge: Sammlung', hint: 'Tools', run: () => inventory.openTools('collection') },
    { label: 'Werkzeuge: Händler', hint: 'Tools', run: () => inventory.openTools('vendor') },
    { label: 'Postfach öffnen', hint: 'Inventar', run: () => { showInventoryPage(); inventory.openPostmaster(); } },
    { label: 'Checkliste öffnen', hint: 'Woche', run: () => checklist.open('all') },
    { label: 'Notizen öffnen', hint: 'Notizen', run: () => notes.open() },
    { label: 'Einstellungen: Darstellung', hint: 'Einstellungen', run: () => settings.open('appearance') },
    { label: 'Einstellungen: Overlay', hint: 'Einstellungen', run: () => settings.open('overlay') },
    { label: 'Einstellungen: Controller', hint: 'Einstellungen', run: () => settings.open('controller') },
    { label: 'Einstellungen: Schnittstellen', hint: 'Einstellungen', run: () => settings.open('security') },
    { label: 'Einstellungen: Bungie', hint: 'Einstellungen', run: () => settings.open('bungie') },
    { label: 'Overlay ein-/ausblenden', hint: 'Overlay', run: () => api.toggleOverlay() },
    { label: 'Maus-Durchlassen umschalten', hint: 'Overlay', run: () => api.toggleClickThrough() },
    { label: 'Inventar aktualisieren', hint: 'Daten', run: () => inventory.refreshInventory() },
    { label: 'Offline-Ausgang senden', hint: 'Inventar', run: () => window.dispatchEvent(new CustomEvent('d2-outbox-send')) },
    { label: 'Offline-Ausgang öffnen', hint: 'Inventar', run: () => window.dispatchEvent(new CustomEvent('d2-outbox-open')) },
    { label: 'Loadout-Warteschlange öffnen', hint: 'Loadouts', run: () => window.dispatchEvent(new CustomEvent('d2-loadout-queue-open')) },
    { label: 'Champion-Prüfung öffnen', hint: 'Inventar', run: () => window.dispatchEvent(new CustomEvent('d2-champion-audit-open')) },
    { label: 'Xûr öffnen', hint: 'Händler', run: () => inventory.openTools('vendor', { vendorHash: 2190858386 }) }
  ];
}

function renderCommandPalette() {
  if (!commandResults) return;
  const query = String(commandInput && commandInput.value || '').trim().toLowerCase();
  commandItems = commandDefinitions().filter((entry) => !query || entry.label.toLowerCase().includes(query) || entry.hint.toLowerCase().includes(query));
  commandIndex = Math.max(0, Math.min(commandIndex, commandItems.length - 1));
  commandResults.innerHTML = commandItems.length
    ? commandItems.map((entry, index) => `<button type="button" class="command-palette-row${index === commandIndex ? ' active' : ''}" data-command-index="${index}"><span>${escapeHtml(entry.label)}</span><small>${escapeHtml(entry.hint)}</small></button>`).join('')
    : '<div class="command-palette-hint">Kein Befehl gefunden.</div>';
}

function openCommandPalette() {
  if (!commandPalette) return;
  commandPalette.classList.remove('hidden');
  commandIndex = 0;
  if (commandInput) { commandInput.value = ''; commandInput.focus(); }
  renderCommandPalette();
}

function closeCommandPalette() {
  if (!commandPalette) return;
  commandPalette.classList.add('hidden');
}

function runCommand(index) {
  const entry = commandItems[index];
  if (!entry) return;
  closeCommandPalette();
  try { entry.run(); } catch (error) { toast(error.message || String(error), 'error', 3000); }
}

if (commandInput) commandInput.addEventListener('input', () => { commandIndex = 0; renderCommandPalette(); });
if (commandPalette) {
  commandPalette.addEventListener('click', (event) => {
    if (event.target === commandPalette) { closeCommandPalette(); return; }
    const row = event.target.closest('[data-command-index]');
    if (row) runCommand(Number(row.dataset.commandIndex));
  });
  commandInput && commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); commandIndex = Math.min(commandItems.length - 1, commandIndex + 1); renderCommandPalette(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); commandIndex = Math.max(0, commandIndex - 1); renderCommandPalette(); }
    else if (event.key === 'Enter') { event.preventDefault(); runCommand(commandIndex); }
    else if (event.key === 'Escape') { event.preventDefault(); closeCommandPalette(); }
  });
}
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || (event.shiftKey && event.key.toLowerCase() === 'p'))) {
    event.preventDefault();
    if (commandPalette && commandPalette.classList.contains('hidden')) openCommandPalette();
    else closeCommandPalette();
  } else if (event.key === 'Escape' && commandPalette && !commandPalette.classList.contains('hidden')) {
    closeCommandPalette();
  }
});

async function refreshDataStatusChip() {
  const chip = qs('#dataStatusChip');
  if (!chip || !api.dataStatus) return;
  const status = await api.dataStatus().catch(() => null);
  if (!status || !status.ok) { chip.textContent = 'Daten: ?'; chip.classList.add('warn'); return; }
  const minutes = status.fetchedAt ? Math.max(0, Math.round(status.ageMs / 60000)) : -1;
  const label = status.offline ? 'Offline' : minutes < 0 ? 'kein Snapshot' : minutes <= 1 ? 'aktuell' : `vor ${minutes} Min.`;
  chip.textContent = `Daten: ${label}`;
  chip.classList.toggle('warn', status.stale || status.offline);
  chip.title = `Snapshot: ${status.fetchedAt ? new Date(status.fetchedAt).toLocaleString('de-DE') : '–'} · Postfach ${status.postmaster} · Manifest ${status.manifestVersion || 'unbekannt'} · API ${status.queue ? `${status.queue.requests || 0} Anfragen / ${status.queue.rateLimits || 0}× 429` : '–'}`;
}
qs('#dataStatusChip')?.addEventListener('click', () => { refreshDataStatusChip(); inventory.openTools('overview', { dataStatus: true }); });
refreshDataStatusChip();
setInterval(refreshDataStatusChip, 30000);

// In-App-Notizen: komplett nach renderer/js/notes.js extrahiert (Phase 3).

// Aktivitäten-Status im Overlay anzeigen (z. B. "NF 2/3 · Raid ✓").
// Zeigt zusätzlich den heutigen Wochenplan-Eintrag, falls vorhanden.
function updateMiniDash() {
  const resetEl = qs('#miniReset');
  const checklistEl = qs('#miniChecklist');
  const xurEl = qs('#miniXur');
  if (!resetEl) return;
  try {
    const reset = nextDailyReset(new Date());
    resetEl.textContent = formatDuration(reset.getTime() - Date.now());
  } catch (error) { resetEl.textContent = '—'; }
  if (checklistEl) {
    const items = (cfg.checklist && cfg.checklist.items) || [];
    checklistEl.textContent = String(items.filter((item) => !item.done).length);
  }
  if (xurEl) xurEl.textContent = xurActive(new Date()) ? 'da' : 'weg';
}
updateMiniDash();
setInterval(updateMiniDash, 30000);

let liveActivityName = '';
let liveActivityKey = '';

function updateActivityStatus() {
  const el = qs('#overlayActivity');
  const text = qs('#overlayActivityText');
  if (!el || !text) return;

  const custom = String(cfg.overlay && cfg.overlay.activityStatus ? cfg.overlay.activityStatus : '').trim();

  // Heutigen Wochenplan-Eintrag ermitteln.
  const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayKey = dayMap[new Date().getDay()];
  const schedule = (cfg.overlay && cfg.overlay.weeklySchedule) || {};
  const todayActivity = String(schedule[todayKey] || '').trim();

  // Be kombinieren: Live-Aktivität + benutzerdefinierter Status + Wochenplan.
  const parts = [];
  if (liveActivityName) parts.push(liveActivityName);
  if (custom) parts.push(custom);
  if (todayActivity) parts.push(todayActivity);

  if (parts.length > 0) {
    el.hidden = false;
    text.textContent = parts.join(' · ');
    el.title = liveActivityName ? `Live: ${liveActivityName}` : (todayActivity ? `Heute geplant: ${todayActivity}` : 'Aktivitäten-Status');
  } else {
    el.hidden = true;
  }
  overlayHud?.maybeAutoApply?.();
}

// Live-Aktivität aus der Bungie-API (Komponente 204) für den Status-Chip.
async function refreshLiveActivity() {
  if (!api || typeof api.bungieActivities !== 'function') return;
  try {
    const result = await api.bungieActivities();
    const list = result && typeof result === 'object' ? Object.values(result) : [];
    const active = list.find((entry) => entry && entry.name && !/orbit|im orbit/i.test(String(entry.name)));
    const previous = liveActivityName;
    const previousKey = liveActivityKey;
    liveActivityName = active ? String(active.name) : '';
    liveActivityKey = active ? `${liveActivityName}|${String(active.startedAt || '')}` : '';
    if (previous && previousKey && previousKey !== liveActivityKey) showPostGameOverlay(previous);
    api.reportActivity?.(liveActivityName);
    updateActivityStatus();
  } catch (error) {
    // API optional.
  }
}
setTimeout(refreshLiveActivity, 6000);
setInterval(refreshLiveActivity, 60000);
updateActivityStatus();

function championSummaryText() {
  try {
    const data = inventoryInstance && typeof inventoryInstance.getData === 'function' ? inventoryInstance.getData() : null;
    const character = data && Array.isArray(data.characters) ? data.characters[0] : null;
    const weapons = character && data.equipped && Array.isArray(data.equipped[character.id]) ? data.equipped[character.id] : [];
    const types = new Set();
    for (const weapon of weapons) {
      if (!weapon || ![1498876634, 2465295065, 953998645].includes(Number(weapon.bucket))) continue;
      for (const type of championTypes(weapon)) types.add(type);
    }
    if (!weapons.length) return '—';
    return [1, 2, 3].map((type) => `${CHAMPION_SHORT[type]}${types.has(type) ? '✓' : '✗'}`).join(' ');
  } catch (error) {
    return '—';
  }
}

function updateOverlayChampion() {
  if (document.hidden) return;
  const value = qs('#overlayChampionValue');
  const chip = qs('#overlayChampion');
  if (!value) return;
  const text = championSummaryText();
  value.textContent = text;
  if (chip) chip.title = text === '—' ? 'Champion-Abdeckung: keine Inventardaten' : `Champion-Abdeckung: ${text}`;
}
setInterval(updateOverlayChampion, 3000);
setTimeout(updateOverlayChampion, 800);

let postGameTimer = 0;
function hidePostGameOverlay() {
  const panel = qs('#postGameOverlay');
  if (panel) panel.classList.add('hidden');
  if (postGameTimer) clearTimeout(postGameTimer);
  postGameTimer = 0;
}

function showPostGameOverlay(activityName) {
  if (!document.body.classList.contains('mode-overlay')) return;
  const panel = qs('#postGameOverlay');
  const body = qs('#postGameBody');
  if (!panel || !body) return;
  const data = inventoryInstance && typeof inventoryInstance.getData === 'function' ? inventoryInstance.getData() : null;
  const postmaster = Object.values((data && data.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const openChecks = ((cfg.checklist && cfg.checklist.items) || []).filter((item) => !item.done).length;
  const sessionTime = (qs('#overlaySessionTime') && qs('#overlaySessionTime').textContent) || '0:00';
  const champions = championSummaryText();
  body.innerHTML = `<div><span>Letzte Aktivität:</span> <b>${escapeHtml(activityName)}</b></div>` +
    `<div><span>Session:</span> <b>${escapeHtml(sessionTime)}</b> · <span>Postfach:</span> <b>${postmaster}</b> · <span>Offen:</span> <b>${openChecks}</b></div>` +
    `<div><span>Champions:</span> <b>${escapeHtml(champions)}</b></div>`;
  panel.classList.remove('hidden');
  if (postGameTimer) clearTimeout(postGameTimer);
  postGameTimer = setTimeout(hidePostGameOverlay, 30000);
}

qs('#postGameClose')?.addEventListener('click', hidePostGameOverlay);
qs('#postGameDismiss')?.addEventListener('click', hidePostGameOverlay);
qs('#postGameWeek')?.addEventListener('click', () => {
  hidePostGameOverlay();
  try { showInventoryPage(); } catch (error) { /* egal */ }
  if (inventory && typeof inventory.openTools === 'function') inventory.openTools('week');
});

qs('#overlayMoreBtn')?.addEventListener('click', () => {
  const expanded = document.body.classList.toggle('overlay-more');
  const button = qs('#overlayMoreBtn');
  if (button) {
    button.textContent = expanded ? 'Weniger' : 'Mehr';
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
});

// Fokus-Assistent im Overlay: zeigt, ob das Overlay oder das Spiel
// gerade Tastatur/Maus bekommt, und holt das Overlay per Klick nach vorn.
const overlayFocusEl = qs('#overlayFocus');
const overlayFocusText = qs('#overlayFocusText');
let lastOverlayVisible = false;
let overlayFocusSeq = 0;
async function updateOverlayFocusChip() {
  if (!overlayFocusEl || typeof api.getFocusState !== 'function') return;
  const seq = ++overlayFocusSeq;
  try {
    const state = await api.getFocusState();
    if (seq !== overlayFocusSeq || !state) return;
    const show = state.visible === true && (!cfg.overlay || !cfg.overlay.showItems || cfg.overlay.showItems.focus !== false);
    overlayFocusEl.hidden = !show;
    if (!show) return;
    const clickThrough = state.clickThrough === true;
    const focused = state.focused === true && !clickThrough;
    overlayFocusEl.classList.toggle('ok', focused);
    overlayFocusEl.classList.toggle('warn', state.visible === true && !focused && !clickThrough);
    overlayFocusEl.classList.toggle('through', clickThrough);
    overlayFocusEl.classList.toggle('steam', state.steamInputMode === true);
    if (overlayFocusText) overlayFocusText.textContent = clickThrough ? 'Maus durch' : focused ? 'Overlay' : 'Spiel';
    const padText = state.controller && state.controller.connected
      ? ` · Controller ${state.controller.index + 1}`
      : state.steamInputMode
        ? ' · Steam Input'
        : ' · kein Controller';
    overlayFocusEl.title = (clickThrough
      ? 'Maus/Tastatur gehen an Destiny 2 – Klick holt das Overlay zurück.'
      : focused
        ? 'Das Overlay hat den Fokus. Klick: Fokus erneut setzen.'
        : 'Das Spiel oder ein anderes Fenster hat den Fokus. Klick holt das Overlay nach vorn.') + padText;
  } catch (error) {
    // Fokus-Status ist optional.
  }
}
if (overlayFocusEl) {
  overlayFocusEl.addEventListener('click', async () => {
    try {
      await api.focusOverlay?.();
      toast('Overlay fokussiert.', 'success', 1600);
    } catch (error) {
      toast('Fokus konnte nicht gesetzt werden.', 'error', 2200);
    }
    updateOverlayFocusChip();
  });
}
setInterval(updateOverlayFocusChip, 1200);
updateOverlayFocusChip();

// Session-Timer: Spielzeit dieser Sitzung anzeigen.
const sessionStart = Date.now();
const overlaySessionTimeEl = qs('#overlaySessionTime');
function updateSessionTimer() {
  if (!overlaySessionTimeEl) return;
  const bar = overlaySessionTimeEl.closest('.overlay-bar');
  if (!bar || bar.classList.contains('hidden')) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const next = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
  if (overlaySessionTimeEl.textContent !== next) overlaySessionTimeEl.textContent = next;
}
setInterval(updateSessionTimer, 1000);
updateSessionTimer();

// ------------------------------------------------------------
// Tasten-Legende (HUD)
// ------------------------------------------------------------
// Kleine, nicht-klickbare Tafel mit der aktuellen Belegung (Tastatur
// + Controller). Liest die Config live und hilft beim Lernen und
// Prüfen der Bindings.

const bindingHud = qs('#bindingHud');
const hudBtn = qs('#hudBtn');

function bindingRows() {
  const rows = [];
  rows.push({ keys: [formatAccelerator(cfg.hotkey)], desc: 'Overlay ein-/ausblenden' });
  rows.push({ keys: [formatAccelerator(cfg.clickThroughHotkey)], desc: 'Maus durchlassen' });
  const bind = (cfg.gamepad && cfg.gamepad.bindings) || {};
  for (const action of BINDING_ACTIONS) {
    const index = Number(bind[action.key]);
    if (!Number.isInteger(index) || index < 0) continue;
    const button = BUTTONS[index];
    rows.push({ keys: [button ? button.label : String(index)], desc: action.label });
  }
  const combo = Array.isArray(cfg.gamepad && cfg.gamepad.combo) ? cfg.gamepad.combo : [];
  if (combo.length) {
    rows.push({
      keys: combo.map((index) => (BUTTONS[index] ? BUTTONS[index].label : String(index))),
      desc: 'Overlay ein-/ausblenden (Kombination)'
    });
  }
  return rows;
}

function renderBindingHud() {
  if (!bindingHud) return;
  bindingHud.innerHTML =
    '<h4>Belegung</h4>' +
    bindingRows()
      .map(
        (row) =>
          `<div class="hud-row"><span class="hud-keys">${row.keys
            .map((key) => `<kbd>${escapeHtml(key)}</kbd>`)
            .join('')}</span><span class="hud-desc">${escapeHtml(row.desc)}</span></div>`
      )
      .join('');
}

function applyBindingHud() {
  if (!bindingHud) return;
  const show = cfg.behavior && cfg.behavior.showBindingHud === true;
  bindingHud.classList.toggle('hidden', !show);
  if (show) renderBindingHud();
  if (hudBtn) hudBtn.classList.toggle('active', show);
}

if (hudBtn) {
  hudBtn.addEventListener('click', () => {
    const next = !(cfg.behavior && cfg.behavior.showBindingHud === true);
    setConfig({ behavior: { showBindingHud: next } });
  });
}

// ------------------------------------------------------------
// Session-Statistiken
// ------------------------------------------------------------
// Aktive Minuten pro Tag mitschreiben. Der Zähler läuft im Speicher
// und wird alle 5 Minuten (und beim Verlassen) in die Config
// geschrieben, damit nicht jede Minute auf die Platte muss.

let statsMinutes = 0;
// Zählt nur, während Destiny 2 läuft (echte Spielzeit statt
// Tool-Offenzeit). Der Spielstatus kommt aus der bestehenden
// Spiel-Erkennung (destiny2.exe-Prozessprüfung).
let gameRunningNow = false;
function statsDayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function flushStats() {
  if (statsMinutes <= 0) return;
  const key = statsDayKey();
  const days = { ...((cfg.stats && cfg.stats.days) || {}) };
  days[key] = (Number(days[key]) || 0) + statsMinutes;
  statsMinutes = 0;
  setConfig({ stats: { days } });
  if (settings) settings.updateStats?.();
}
setInterval(() => {
  if (!gameRunningNow) return; // Statistik zählt nur bei laufendem Spiel
  statsMinutes += 1;
  if (statsMinutes >= 5) flushStats();
}, 60000);
window.addEventListener('beforeunload', flushStats);

// Wöchentliche Challenge-Checkliste: komplett nach renderer/js/checklist.js extrahiert (Phase 3).

// ------------------------------------------------------------
// Adressleiste (URL direkt öffnen)
// ------------------------------------------------------------
// urlInput/urlGoBtn sind oben bei den Grundzuständen deklariert.

function updateOfflineBanner() {
  if (!offlineBanner) return;
  const offline = !navigator.onLine;
  offlineBanner.classList.toggle('hidden', !offline);
  if (!offline && offlineReloadDone) {
    offlineReloadDone = false;
    toast('Wieder online – Daten können aktualisiert werden.', 'success', 2000);
  }
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
window.addEventListener('DOMContentLoaded', updateOfflineBanner);
updateOfflineBanner();

// Die früheren Webseiten-Kürzel (Strg+Shift+T, Strg+Tab, Strg+Q)
// entfallen mit der Webseiten-Ansicht.
function updateWindowTitle() {
  const current = pageTitle.textContent || '';
  // Läuft die Stoppuhr, steht die Zeit im Fenstertitel (Alt+Tab).
  const stopwatchPrefix = stopwatchRunning
    ? `⏱ ${stopwatchFormat(stopwatchElapsed + Date.now() - stopwatchStartAt)} – `
    : '';
  const next = current
    ? `${stopwatchPrefix}${current} – ${windowBaseTitle}`
    : `${stopwatchPrefix}${windowBaseTitle}`;
  if (updateWindowTitle.lastTitle === next) return;
  updateWindowTitle.lastTitle = next;
  document.title = next;
}

// Verlauf-Dropdown des aktiven Tabs.
const backHistoryBtn = qs('#backHistoryBtn');
const historyPanel = qs('#historyPanel');
const historyList = qs('#historyList');
const historyCloseBtn = qs('#historyCloseBtn');

function showDailyGreeting() {
  const now = new Date();
  const parts = [];
  if (xurActive(now)) parts.push('Xûr ist da');
  const reminders = (cfg.reminders && cfg.reminders.list) || [];
  const todays = reminders.filter((reminder) => {
    if (reminder.repeat === 'daily') return true;
    if (reminder.repeat === 'weekly') return Number(reminder.weekday) === now.getDay();
    return false;
  });
  if (todays.length) parts.push(`${todays.length} Erinnerung${todays.length === 1 ? '' : 'en'} heute`);
  const weekly = nextWeeklyReset(now);
  const daysToWeekly = Math.ceil((weekly.getTime() - now.getTime()) / 86400000);
  if (daysToWeekly <= 3) parts.push(`Weekly-Reset in ${Math.max(1, daysToWeekly)} Tag${daysToWeekly === 1 ? '' : 'en'}`);
  if (parts.length) {
    const hour = now.getHours();
    const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
    toast(`${greeting}! ${parts.join(' · ')}`, 'info', 7000);
  }
}

// ------------------------------------------------------------
// Stoppuhr (Overlay-Kopf)
// ------------------------------------------------------------
// Klick = Start/Pause, Rechtsklick = Reset. Rein sitzungsspezifisch,
// mit Palette-Aktion "Ergebnis in Notiz".
const overlayStopwatch = qs('#overlayStopwatch');
const overlayStopwatchTime = qs('#overlayStopwatchTime');
let stopwatchRunning = false;
let stopwatchStartAt = 0;
let stopwatchElapsed = 0;
let stopwatchSplits = [];

function stopwatchFormat(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateStopwatch() {
  if (!overlayStopwatchTime) return;
  const ms = stopwatchElapsed + (stopwatchRunning ? Date.now() - stopwatchStartAt : 0);
  const next = stopwatchFormat(ms);
  if (overlayStopwatchTime.textContent !== next) {
    overlayStopwatchTime.textContent = next;
    updateWindowTitle();
  }
}

if (overlayStopwatch) {
  overlayStopwatch.addEventListener('click', () => {
    if (stopwatchRunning) {
      stopwatchElapsed += Date.now() - stopwatchStartAt;
      stopwatchRunning = false;
      toast(`Stoppuhr pausiert: ${stopwatchFormat(stopwatchElapsed)}`, 'info', 1800);
    } else {
      stopwatchStartAt = Date.now();
      stopwatchRunning = true;
      toast('Stoppuhr läuft.', 'info', 1400);
    }
    overlayStopwatch.classList.toggle('running', stopwatchRunning);
    updateStopwatch();
  });
  overlayStopwatch.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    stopwatchRunning = false;
    stopwatchElapsed = 0;
    stopwatchSplits = [];
    overlayStopwatch.classList.remove('running');
    overlayStopwatch.title = 'Stoppuhr – Klick: Start/Pause · Doppelklick: Split · Rechtsklick: Reset';
    updateStopwatch();
    toast('Stoppuhr zurückgesetzt.', 'info', 1400);
  });
  overlayStopwatch.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const ms = stopwatchElapsed + (stopwatchRunning ? Date.now() - stopwatchStartAt : 0);
    if (ms <= 0) return;
    stopwatchSplits.push(ms);
    const splits = stopwatchSplits.map((value, index) => `P${index + 1} ${stopwatchFormat(value)}`).join(' · ');
    overlayStopwatch.title = `Splits: ${splits}`;
    toast(`Split ${stopwatchSplits.length}: ${stopwatchFormat(ms)}`, 'info', 2200);
  });
  setInterval(updateStopwatch, 1000);
  updateStopwatch();
}

// Timer-Ergebnis als Zeile in die aktive Notiz anhängen.
function appendStopwatchToNote() {
  const ms = stopwatchElapsed + (stopwatchRunning ? Date.now() - stopwatchStartAt : 0);
  const splitText = stopwatchSplits.length ? ` · Splits: ${stopwatchSplits.map((value, index) => `P${index + 1} ${stopwatchFormat(value)}`).join(', ')}` : '';
  const line = `[${new Date().toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })}] Timer: ${stopwatchFormat(ms)}${splitText}`;
  const open = notes.appendText(line, '\n');
  toast(`In Notiz ${open ? 'angehängt' : 'gespeichert'}: ${line}`, 'success', 2200);
}

// ------------------------------------------------------------
// Reiter-Kontextmenü (Rechtsklick auf Tab-Chips)
// ------------------------------------------------------------
const tabContextMenu = qs('#tabContextMenu');
const tabContextBody = qs('#tabContextBody');

const OVERLAY_ITEMS = [
  ['notes', '#overlayNotesBtn'],
  ['dashboard', '#overlayDashboardBtn'],
  ['loadouts', '#overlayLoadoutsBtn'],
  ['lock', '#overlayLockBtn'],
  ['hide', '#overlayHideBtn'],
  ['exit', '#overlayExitBtn'],
  ['clock', '#overlayClock'],
  ['session', '#overlaySession'],
  ['activity', '#overlayActivity'],
  ['champion', '#overlayChampion'],
  ['battery', '#overlayBattery'],
  ['bungie', '#bungieStatus']
];

function applyOverlayVisibility() {
  const showItems = (cfg.overlay && cfg.overlay.showItems) || {};
  for (const [key, selector] of OVERLAY_ITEMS) {
    const element = qs(selector);
    if (!element) continue;
    const visible = showItems[key] !== false;
    if (key === 'clock') {
      // Daily/Weekly-Chips (Stoppuhr bleibt unabhängig sichtbar).
      element.hidden = !visible;
      const weekly = qs('#overlayWeekly');
      if (weekly) weekly.hidden = !visible || !weekly.textContent || weekly.textContent === '—';
    } else if (key === 'session') {
      element.hidden = !visible;
    } else {
      element.hidden = !visible;
    }
  }
  overlayHud?.applyChipOrder();
  const minimal = !cfg.overlay || cfg.overlay.minimal !== false;
  document.body.classList.toggle('overlay-minimal', minimal);
  if (!minimal) document.body.classList.remove('overlay-more');
  const moreBtn = qs('#overlayMoreBtn');
  if (moreBtn) {
    moreBtn.hidden = !minimal;
    moreBtn.textContent = document.body.classList.contains('overlay-more') ? 'Weniger' : 'Mehr';
    moreBtn.setAttribute('aria-expanded', document.body.classList.contains('overlay-more') ? 'true' : 'false');
  }
}

const overlayHudInstance = createOverlayHud({
  api,
  getConfig: () => cfg,
  setConfig,
  getLiveActivityName: () => liveActivityName
});
overlayHud = overlayHudInstance;


// ------------------------------------------------------------
// Sitzungs-Wiederherstellung
// ------------------------------------------------------------
// Die frühere Webseiten-Sitzung gibt es nicht mehr.


function applyControllerAreaProfile(area) {
  if (!cfg.gamepad || cfg.gamepad.autoAreaProfile !== true) return;
  const preset = area === 'inventory' ? CONTROLLER_AREA_PRESETS.inventory : CONTROLLER_AREA_PRESETS.standard;
  Object.assign(cfg.gamepad, preset);
}

function watchControllerAreaProfiles() {
  const update = () => {
    const inventoryOpen = !qs('#inventoryView').classList.contains('hidden');
    const settingsOpen = !qs('#settingsModal').classList.contains('hidden');
    applyControllerAreaProfile(inventoryOpen ? 'inventory' : settingsOpen ? 'settings' : 'dashboard');
  };
  const observer = new MutationObserver(update);
  for (const selector of ['#inventoryView', '#settingsModal', '#dashboardPanel']) {
    const element = qs(selector);
    if (element) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
  }
  update();
}

function applyUiScale() {
  const scale = clamp(Number(cfg.appearance && cfg.appearance.uiScale) || 1, 0.8, 1.4);
  const fontScale = clamp(Number(cfg.appearance && cfg.appearance.fontScale) || 1, 0.85, 1.3);
  const tvMode = Boolean(cfg.appearance && cfg.appearance.tvMode);
  const combined = clamp(scale * fontScale * (tvMode ? 1.25 : 1), 0.8, 2);
  document.body.style.zoom = Math.abs(combined - 1) < 0.01 ? '' : String(combined);
  document.body.style.setProperty('--ui-zoom', String(combined));
  document.body.classList.toggle('colorblind', Boolean(cfg.appearance && cfg.appearance.colorblind));
  document.body.classList.toggle('high-contrast', Boolean(cfg.appearance && cfg.appearance.highContrast));
  document.body.classList.toggle('reduce-motion', Boolean(cfg.appearance && cfg.appearance.reduceMotion));
  document.body.classList.toggle('simple-mode', Boolean(cfg.appearance && cfg.appearance.simpleMode !== false));
  document.body.classList.toggle('tv-mode', tvMode);
  document.body.classList.toggle('dyslexia', Boolean(cfg.appearance && cfg.appearance.dyslexia));
  document.body.classList.toggle('solid-ui', Boolean(cfg.appearance && cfg.appearance.solidUi));
  document.body.classList.toggle('overlay-compact', Boolean(cfg.overlay && cfg.overlay.compact));
  window.__d2TtsEnabled = Boolean(cfg.notifications && cfg.notifications.tts);
  if (window.i18n) window.i18n.setLanguage((cfg.appearance && cfg.appearance.uiLanguage) === 'en' ? 'en' : 'de');
}
// Für Einstellungen/andere Module, damit TV-Modus sofort greift.
window.applyAppearance = applyUiScale;
window.isTvMode = () => Boolean(cfg.appearance && cfg.appearance.tvMode) || document.body.classList.contains('tv-mode');

// Einmalige Umstellung der Stick-Achsen: Die XInput-Brücke liefert Y
// positiv nach oben, das Tool rechnet mit negativ (Gamepad-API). Das
// wird jetzt an der Grenze normalisiert. Alte Kalibrierungen und der
// Ausgleichs-Schalter „Y-Achse umkehren" werden dabei übernommen.
function migrateControllerAxes() {
  const gamepad = (cfg && cfg.gamepad) || {};
  if (gamepad.axesNormalized === true) return;
  const patch = { gamepad: { axesNormalized: true } };
  const flipY = (list) => (Array.isArray(list)
    ? list.map((value, index) => (index % 2 === 0 ? Number(value) || 0 : -(Number(value) || 0)))
    : list);
  const isDefaultY = (list, expected) => !Array.isArray(list)
    || (Math.abs(Number(list[1]) - expected) < 0.001 && Math.abs(Number(list[3]) - expected) < 0.001);
  const calibration = gamepad.calibration;
  const untouched = calibration
    && isDefaultY(calibration.center, 0)
    && isDefaultY(calibration.min, -1)
    && isDefaultY(calibration.max, 1);
  if (calibration && !untouched) {
    patch.gamepad.calibration = {
      center: flipY(calibration.center),
      min: flipY(calibration.min),
      max: flipY(calibration.max)
    };
  }
  // Nur der XInput-Pfad war gespiegelt. Wer ohne Bridge spielt (Browser-
  // Gamepad-API), hatte die richtige Richtung – dort bleibt ein
  // absichtlich gesetztes „Y-Achse umkehren" erhalten.
  const usesXinput = gamepad.xinput !== false;
  const hadInvert = usesXinput && gamepad.invertY === true;
  if (hadInvert) patch.gamepad.invertY = false;
  setConfig(patch);
  if (hadInvert) {
    toast('Stick-Y-Achse korrigiert: „Y-Achse umkehren" war als Ausgleich an und ist jetzt aus. Wenn du es absichtlich willst, in den Einstellungen wieder einschalten.', 'info', 9000, true);
  }
}
migrateControllerAxes();

// TV-Check: Testtext in drei Entfernungen mit einstellbarer Größe.
let tvCheckRoot = null;
function openTvCheck() {
  if (!tvCheckRoot) {
    tvCheckRoot = document.createElement('div');
    tvCheckRoot.className = 'cmd-palette hidden';
    tvCheckRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="TV-Check">' +
      '<div class="wn-head"><strong>TV-Check</strong><button type="button" class="icon-btn" data-tv-check-close aria-label="Schließen">✕</button></div>' +
      '<div class="cmp-body">' +
        '<p class="inv-tool-muted">Stell dich mit dem Controller vor den Fernseher und lies die drei Zeilen. Alles, was du aus 4 m noch erkennen kannst, ist gut.</p>' +
        '<label class="chk-row" style="flex-direction:column;align-items:stretch;gap:6px"><strong>Textgröße im Test</strong>' +
          '<input type="range" min="11" max="28" step="1" value="16" data-tv-size aria-label="Textgröße">' +
          '<span class="inv-tool-muted"><span data-tv-size-value>16</span> px</span></label>' +
        '<div class="tv-check-sample" data-tv-sample></div>' +
        '<div class="inv-tool-muted">Richtwert: Fließtext ab 14 px, Kleinstinfos ab 11 px, Kontrast mindestens 7:1.</div>' +
        '<div class="wn-foot" style="padding:10px 0 0"><button type="button" class="btn primary small" data-tv-enable>TV-Modus aktivieren</button></div>' +
      '</div>' +
    '</div>';
    document.body.appendChild(tvCheckRoot);
    const draw = () => {
      const size = Math.max(11, Math.min(28, Number(tvCheckRoot.querySelector('[data-tv-size]').value) || 16));
      tvCheckRoot.querySelector('[data-tv-size-value]').textContent = String(size);
      const rows = [
        { distance: '2 m', scale: 1, hint: 'muss sicher lesbar sein' },
        { distance: '3 m', scale: 0.8, hint: 'sollte lesbar sein' },
        { distance: '4 m', scale: 0.62, hint: 'Grenzfall – hier entscheidet dein Abstand' }
      ];
      tvCheckRoot.querySelector('[data-tv-sample]').innerHTML = rows.map((row) =>
        '<div class="tv-check-row"><span class="tv-check-distance">' + row.distance + '</span>' +
        '<span class="tv-check-text" style="font-size:' + Math.max(8, Math.round(size * row.scale)) + 'px">Xûr ist da · Poststelle 12 · Reset in 3 Tagen</span>' +
        '<span class="tv-check-hint">' + row.hint + '</span></div>'
      ).join('');
    };
    tvCheckRoot.addEventListener('input', (event) => {
      if (event.target.closest('[data-tv-size]')) draw();
    });
    tvCheckRoot.addEventListener('click', (event) => {
      if (event.target === tvCheckRoot || event.target.closest('[data-tv-check-close]')) {
        tvCheckRoot.classList.add('hidden');
        return;
      }
      if (event.target.closest('[data-tv-enable]')) {
        setConfig({ appearance: { tvMode: true } });
        tvCheckRoot.classList.add('hidden');
        toast('TV-Modus aktiviert. Mit „TV-Check" jederzeit nachjustieren.', 'success', 3200);
      }
    });
    draw();
  }
  tvCheckRoot.classList.remove('hidden');
}
window.addEventListener('d2-tv-check', openTvCheck);

// Beim ersten erkannten Controller einmalig TV-Modus anbieten (nicht aufdrängen).
let tvOfferDone = false;
function maybeOfferTvMode(snapshot) {
  if (tvOfferDone || !snapshot || !snapshot.connected) return;
  if (cfg.appearance && cfg.appearance.tvMode) return;
  try {
    if (window.localStorage.getItem('d2tool.tvOfferSeen') === '1') return;
  } catch (error) { /* egal */ }
  tvOfferDone = true;
  try { window.localStorage.setItem('d2tool.tvOfferSeen', '1'); } catch (error) { /* egal */ }
  toast('Controller erkannt – TV-Modus aktivieren?', 'info', 9000, false, [
    { label: 'TV-Modus an', run: () => setConfig({ appearance: { tvMode: true } }) },
    { label: 'TV-Check', run: () => openTvCheck() }
  ]);
}

// Ruhemodus: Fenster-Toasts werden in ui.js anhand dieses
// Zeitstempels unterdrückt. Wird bei jedem Verhalten-Patch
// aktualisiert (auch wenn der Hauptprozess den Ruhemodus setzt).
function updateQuietState() {
  window.__d2QuietUntil = Number((cfg.behavior && cfg.behavior.quietUntil) || 0) || 0;
}

// ------------------------------------------------------------
// Tray-Schnellzugriff: Seitenkatalog an den Hauptprozess melden
// ------------------------------------------------------------

const inventoryView = qs('#inventoryView');
let inventoryPageOpen = false;

function showInventoryPage() {
  if (!inventoryView || inventoryPageOpen) return;
  if (dashboard && !dashboard.hidden()) dashboard.hide();
  if (pageTitle) pageTitle.textContent = 'Inventar';
  inventoryPageOpen = true;
  inventoryView.classList.remove('hidden');
  try { api.inventorySetOpen?.(true); } catch (error) { /* egal */ }
  updateWindowTitle();
  inventory.open();
}

function closeInventorySilently() {
  if (!inventoryPageOpen) return;
  inventoryPageOpen = false;
  if (inventoryView) inventoryView.classList.add('hidden');
  try { api.inventorySetOpen?.(false); } catch (error) { /* egal */ }
  inventory.close();
}

function hideInventoryPage() {
  if (!inventoryPageOpen) return;
  closeInventorySilently();
  // Ohne Webseiten ist das Dashboard die Startseite.
  dashboard.open();
  updateWindowTitle();
}

function toggleInventoryPage() {
  if (inventoryPageOpen) hideInventoryPage();
  else showInventoryPage();
}

function applyAccent() {
  // Eigene Akzentfarbe (Einstellungen -> Overlay) hat Vorrang vor der
  // Markenfarbe. Ohne eigene Farbe bleibt die Edition bei ihrem Logo-
  // Farbschema (Standard = Rot, Lenastheo = Violett).
  const custom = cfg.appearance && cfg.appearance.accent ? String(cfg.appearance.accent) : '';
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand-strong').trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(custom)
    ? custom
    : (/^#[0-9a-fA-F]{6}$/.test(brand) ? brand : '');
  if (!color) return;
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-contrast', accentContrast(color));
}

// Kontrastfarbe für Text auf der Akzentfarbe (Luminanz-Regel).
function accentContrast(hex) {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '';
  if (!value) return '';
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#04121f' : '#f4f7fd';
}

function setConfig(patch) {
  if (!patch) return;
  logConfigPatch(cfg, patch);
  cfg = deepMerge(cfg, patch);
  // Abhängige Anzeigen sofort aktualisieren (billige DOM-Updates).
  if (patch.behavior) {
    applyBindingHud();
    updateQuietState();
  }
  if (patch.appearance) {
    applyAccent();
    applyUiScale();
  }
  if (patch.overlay) { applyOverlayVisibility(); updateActivityStatus(); applyUiScale(); }
  pendingPatch = deepMerge(pendingPatch || {}, patch);
  clearTimeout(patchTimer);
  patchTimer = setTimeout(async () => {
    const payload = pendingPatch;
    pendingPatch = null;
    if (!payload) return;
    try {
      cfg = await api.setConfig(payload);
    } catch (error) {
      toast('Einstellungen konnten nicht gespeichert werden.', 'error');
    }
  }, 180);
}

function applyOverlayState(next) {
  if (!next) return;
  overlayState = next;
  const inOverlay = next.mode === 'overlay';
  const visible = inOverlay && Boolean(next.visible);
  document.body.classList.toggle('mode-overlay', inOverlay);
  document.body.classList.toggle('overlay-locked', Boolean(next.clickThrough));
  document.body.classList.toggle('overlay-shown', visible);

  const locked = Boolean(next.clickThrough);
  overlayLockBtn.classList.toggle('locked', locked);
  overlayLockBtn.innerHTML = `${icon(locked ? 'lock' : 'unlock')}<span>${locked ? 'Gesperrt' : 'Maus'}</span>`;
  overlayLockBtn.title = locked
    ? 'Maus geht ans Spiel durch - Kürzel holt das Overlay zurück'
    : 'Maus durchlassen (Klicks gehen ans Spiel)';

  if (visible && !wasOverlayVisible) {
    // Fokus aus einer <webview> lösen: Chromium liefert Gamepad-
    // Eingaben nur an das fokussierte Frame. Bleibt der Fokus in der
    // eingebetteten Seite, bleibt der Controller-Cursor aus.
    try {
      const active = document.activeElement;
      if (active && active.tagName === 'WEBVIEW') active.blur();
      if (document.body && typeof document.body.focus === 'function') document.body.focus({ preventScroll: true });
    } catch (error) {}
    // Beim Öffnen den Cursor in die Mitte des Webviews setzen und
    // den Fokus aus der Seite lösen.
    controller.resetCursor();
    try { controller.showCursor(); } catch (e) {}
    if (cfg.gamepad.rumble) controller.rumble(0.35);
    window.dispatchEvent(new CustomEvent('d2-overlay-shown'));
  } else if (!visible && wasOverlayVisible) {
    controller.hideCursor();
    window.dispatchEvent(new CustomEvent('d2-overlay-hidden'));
  }
  wasOverlayVisible = visible;

  // Fokus-Chip sofort an den neuen Overlay-Zustand anpassen; das
  // 1,2-s-Intervall bleibt nur als Fallback für externe Fokuswechsel.
  updateOverlayFocusChip();
  updateHints();
  setInterval(updateHints, 1500);
}

// Animation-Klasse auf body anwenden.
function applyAnimationClass() {
  const anim = (cfg.overlay && cfg.overlay.animation) || 'normal';
  document.body.classList.remove('anim-none', 'anim-fast', 'anim-normal');
  document.body.classList.add(`anim-${anim}`);
}
applyAnimationClass();

// Batterieanzeige des Controllers im Overlay-Kopf.
// Levels: 0=leer, 1=niedrig, 2=mittel, 3=voll, 255=unbekannt.
function updateBatteryBadge(snapshot) {
  const badge = qs('#overlayBattery');
  const levelEl = qs('#overlayBatteryLevel');
  if (!badge || !levelEl) return;
  const level = snapshot && typeof snapshot.battery === 'number' ? snapshot.battery : 255;
  if (!snapshot || !snapshot.connected || level === 255 || level < 0) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  const percent = level === 3 ? 100 : level === 2 ? 50 : level === 1 ? 25 : 0;
  levelEl.textContent = `${percent} %`;
  badge.classList.toggle('battery-low', level <= 1);
  badge.classList.toggle('battery-ok', level >= 2);
}

function updateHints() {
  const hint = (key, text) => {
    const label = window.i18n && typeof window.i18n.translate === 'function' ? (window.i18n.translate(text) || text) : text;
    return `<span class="hint"><kbd>${escapeHtml(key)}</kbd> ${escapeHtml(label)}</span>`;
  };
  const setHints = (html) => {
    if (html === updateHints.lastHtml) return;
    updateHints.lastHtml = html;
    hintBar.innerHTML = html;
  };
  if (overlayState.mode === 'overlay' && overlayState.visible) {
    if (overlayState.clickThrough) {
      setHints(`${hint(formatAccelerator(cfg.clickThroughHotkey), 'Maus zurückholen')} ${hint(
        formatAccelerator(cfg.hotkey),
        'Overlay ausblenden'
      )}`);
      return;
    }
    setHints([
      hint('LB/RB', 'Kategorie'),
      hint('←/→', 'Seite'),
      hint('A', 'Klick'),
      hint('B', 'Zurück'),
      hint('X', 'Neu laden'),
      hint('Y', 'Präzise'),
      hint('L3+R3', 'Ausblenden')
    ].join(''));
    return;
  }

  const inventoryView = qs('#inventoryView');
  const editorView = qs('.inventory-editor-tab');
  if (inventoryView && !inventoryView.classList.contains('hidden') && editorView && !editorView.classList.contains('hidden')) {
    setHints([
      hint('A', 'Wählen'),
      hint('B', 'Zurück'),
      hint('LB/RB', 'Bereich'),
      hint('X', 'Aktualisieren'),
      hint('Y', 'Optimieren'),
      hint('D-Pad', 'Navigieren'),
      hint('R-Stick', 'Scrollen')
    ].join(''));
    return;
  }
  if (inventoryView && !inventoryView.classList.contains('hidden')) {
    setHints([
      hint('A', 'Öffnen'),
      hint('B', 'Zurück'),
      hint('LB/RB', 'Tab'),
      hint('X', 'Aktualisieren'),
      hint('Y', 'Anlegen'),
      hint('D-Pad', 'Navigieren'),
      hint('R-Stick', 'Scrollen')
    ].join(''));
    return;
  }
  const dashboardView = qs('#dashboardPanel');
  if (dashboardView && !dashboardView.classList.contains('hidden')) {
    setHints([
      hint('A', 'Auswählen'),
      hint('B', 'Schließen'),
      hint('LB/RB', 'Bereich'),
      hint('D-Pad', 'Navigieren'),
      hint('R-Stick', 'Scrollen')
    ].join(''));
    return;
  }
  const settingsView = qs('#settingsModal');
  if (settingsView && !settingsView.classList.contains('hidden')) {
    setHints([
      hint('A', 'Auswählen'),
      hint('B', 'Schließen'),
      hint('LB/RB', 'Bereich'),
      hint('D-Pad', 'Navigieren')
    ].join(''));
    return;
  }
  setHints([
    hint(formatAccelerator(cfg.hotkey), 'Overlay'),
    hint(formatAccelerator(cfg.clickThroughHotkey), 'Maus'),
    hint('Alt+1–8', 'Kategorie'),
    hint('F5', 'Neu laden')
  ].join(''));
}

// ------------------------------------------------------------
// Controller-Aktionen
// ------------------------------------------------------------

function anyModalOpen() {
  return Boolean(document.querySelector('.modal:not(.hidden)')) || isNotificationCenterOpen();
}

function closeTopModal() {
  const radial = qs('#radialMenu');
  if (radial && !radial.classList.contains('hidden')) {
    radial.classList.add('hidden');
    return true;
  }
  if (isNotificationCenterOpen()) {
    closeNotificationCenter();
    return true;
  }
  // Zuerst Unterdialoge des Inventars (Item-Popup, Vergleich,
  // Loadout-Editor, Picker-Sheet). Die Inventar-Seite selbst bleibt
  // dabei offen.
  const backEvent = new CustomEvent('d2-inventory-back', { cancelable: true });
  window.dispatchEvent(backEvent);
  if (backEvent.defaultPrevented) return true;
  // Danach echte Modals/Dialoge (Einstellungen, Hilfe, Controller-Test).
  const test = qs('#controllerTestModal');
  if (test && !test.classList.contains('hidden')) {
    modalClose(test);
    return true;
  }
  const help = qs('#helpModal');
  if (help && !help.classList.contains('hidden')) {
    modalClose(help);
    return true;
  }
  if (settings && settings.isOpen()) {
    settings.close();
    return true;
  }
  if (notes && notes.isOpen()) {
    notes.close();
    return true;
  }
  if (dashboard && !dashboard.hidden()) {
    dashboard.hide();
    return true;
  }
  const inventoryPage = qs('#inventoryView');
  if (inventoryPage && !inventoryPage.classList.contains('hidden')) {
    hideInventoryPage();
    return true;
  }
  return false;
}

// LB/RB im Inventar: zwischen Inventar und Loadout-Editor wechseln.
function cycleToolView(direction) {
  const toolsTab = qs('.inventory-tools-tab');
  if (!toolsTab || toolsTab.classList.contains('hidden')) return false;
  window.dispatchEvent(new CustomEvent('d2-tools-cycle', { detail: { direction } }));
  return true;
}

function cycleInventoryTab(direction) {
  const inventoryPage = qs('#inventoryView');
  if (!inventoryPage || inventoryPage.classList.contains('hidden')) return false;
  // Bei offenem Item-Popup/Vergleich/Editor nicht die Tab-Leiste bedienen.
  if (inventoryPage.querySelector('.inv-popup-backdrop.open, .inv-compare-backdrop.open') || document.querySelector('.inv-dw-backdrop:not(.hidden)')) {
    return true;
  }
  const tabs = [...inventoryPage.querySelectorAll('.dinv-tab[data-tab]')];
  if (tabs.length < 2) return false;
  const currentIndex = tabs.findIndex((tab) => tab.classList.contains('on'));
  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
  if (nextIndex !== currentIndex && tabs[nextIndex]) tabs[nextIndex].click();
  return true;
}

const PAD_ACTION_LABELS = {
  click: 'A – Klicken',
  back: 'B – Zurück',
  reload: 'X – Aktualisieren',
  precision: 'LT – Präzisionsmodus',
  'category-prev': 'LB – Ansicht zurück',
  'category-next': 'RB – Ansicht weiter',
  settings: 'Einstellungen',
  hide: 'Ausblenden',
  notes: 'Notizen',
  pip: 'Mini-Fenster',
  'unload-others': 'Andere Seiten entladen',
  hud: 'Tasten-Legende',
  quickmenu: 'Schnellmenü',
  'close-modal': 'Dialog schließen'
};

function padActionLabel(action, payload) {
  const base = PAD_ACTION_LABELS[action] || action;
  if (typeof payload === 'boolean') return `${base} (${payload ? 'an' : 'aus'})`;
  return base;
}

function openRadialMenu() {
  let menu = qs('#radialMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'radialMenu';
    menu.className = 'radial-menu hidden';
    menu.innerHTML = `<div class="radial-ring">` +
      `<button type="button" data-radial-action="dashboard">🏠<span>Dashboard</span></button>` +
      `<button type="button" data-radial-action="inventory">🎒<span>Inventar</span></button>` +
      `<button type="button" data-radial-action="tools">🧭<span>Werkzeuge</span></button>` +
      `<button type="button" data-radial-action="postmaster">📬<span>Poststelle</span></button>` +
      `<button type="button" data-radial-action="notes">📝<span>Notizen</span></button>` +
      `<button type="button" data-radial-action="settings">⚙<span>Einstellungen</span></button>` +
      `</div>`;
    document.body.appendChild(menu);
    menu.addEventListener('click', (event) => {
      if (event.target === menu) { menu.classList.add('hidden'); return; }
      const button = event.target.closest('[data-radial-action]');
      if (!button) return;
      const action = String(button.dataset.radialAction || '');
      menu.classList.add('hidden');
      if (action === 'dashboard') {
        if (dashboard.hidden()) dashboard.open();
        else dashboard.restore();
      } else if (action === 'inventory') {
        toggleInventoryPage();
      } else if (action === 'tools') {
        showInventoryPage();
        inventory.load().then(() => window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'tools' } })));
      } else if (action === 'postmaster') {
        showInventoryPage();
        inventory.load().then(() => { const btn = qs('[data-tab="inventory"]'); if (btn) btn.click(); window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { postmaster: true } })); });
      } else if (action === 'notes') {
        if (notes.isOpen()) notes.close(); else notes.open();
      } else if (action === 'settings') {
        settings.open('controller');
      }
    });
  }
  menu.classList.remove('hidden');
  const first = menu.querySelector('button');
  if (first) setTimeout(() => first.focus(), 40);
}

function cycleLoadoutSection(direction) {
  const inventoryPage = qs('#inventoryView');
  if (!inventoryPage || inventoryPage.classList.contains('hidden')) return false;
  const editor = qs('.inventory-editor-tab');
  if (!editor || editor.classList.contains('hidden')) return false;
  const event = new CustomEvent('d2-loadout-section', { detail: { direction }, cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function handlePadAction(action, payload) {
  if (settings && typeof settings.updatePadAction === 'function') {
    settings.updatePadAction(padActionLabel(action, payload));
  }
  if (action === 'hide') {
    api.hideOverlay().catch(() => {});
    return;
  }
  if (action === 'back') {
    const loadoutBack = new CustomEvent('d2-loadout-back', { cancelable: true });
    window.dispatchEvent(loadoutBack);
    if (loadoutBack.defaultPrevented) return;
    if (closeTopModal()) return;
    api.hideOverlay().catch(() => {});
    return;
  }
  // Controller-Schnellaktionen, solange ein Item-Popup offen ist.
  const itemPopup = document.querySelector('.inv-popup-backdrop.open');
  if (itemPopup) {
    const quick = {
      'category-prev': 'to-vault',
      'category-next': 'to-char',
      reload: 'favorite',
      precision: 'equip'
    }[action];
    if (quick) {
      window.dispatchEvent(new CustomEvent('d2-inventory-quick', { detail: { action: quick } }));
      return;
    }
  }
  // LB/RB in den Einstellungen: zwischen Bereichen wechseln.
  const settingsModal = qs('#settingsModal');
  if (settingsModal && !settingsModal.classList.contains('hidden') && (action === 'category-prev' || action === 'category-next')) {
    const tabs = [...settingsModal.querySelectorAll('.settings-tab')];
    const index = tabs.findIndex((tab) => tab.classList.contains('active'));
    const next = tabs[(index + (action === 'category-next' ? 1 : -1) + tabs.length) % tabs.length];
    if (next) next.click();
    return;
  }
  if (anyModalOpen()) return;

  switch (action) {
    case 'reload': {
      // Im Inventar aktualisiert X die Bungie-Daten statt die
      // Webseite dahinter neu zu laden.
      const inventoryPage = qs('#inventoryView');
      if (inventoryPage && !inventoryPage.classList.contains('hidden')) {
        const refreshButton = qs('#inventoryRefresh');
        if (refreshButton) refreshButton.click();
        break;
      }
      const dashPanel = qs('#dashboardPanel');
      if (dashPanel && !dashPanel.classList.contains('hidden')) {
        const refreshButton = qs('[data-dash-action="refresh"]');
        if (refreshButton) refreshButton.click();
        break;
      }
      break;
    }
    case 'precision': {
      const editor = qs('.inventory-editor-tab');
      if (editor && !editor.classList.contains('hidden')) {
        const optimize = editor.querySelector('[data-dw-optimize]');
        if (optimize) {
          optimize.click();
          break;
        }
      }
      const dashPanel = qs('#dashboardPanel');
      if (dashPanel && !dashPanel.classList.contains('hidden')) {
        const moreButton = qs('[data-dash-more]');
        if (moreButton) moreButton.click();
        break;
      }
      toast(payload ? 'Präzisionsmodus an.' : 'Präzisionsmodus aus.', 'info', 1400);
      break;
    }
    case 'category-prev':
      if (cycleToolView(-1)) break;
      if (cycleLoadoutSection(-1)) break;
      cycleInventoryTab(-1);
      break;
    case 'category-next':
      if (cycleToolView(1)) break;
      if (cycleLoadoutSection(1)) break;
      cycleInventoryTab(1);
      break;
    case 'quickmenu': {
      const inventoryPage = qs('#inventoryView');
      if (inventoryPage && !inventoryPage.classList.contains('hidden')) {
        window.dispatchEvent(new CustomEvent('d2-inventory-quickmenu'));
      } else {
        openRadialMenu();
      }
      break;
    }
    case 'settings':
      // Liegt das Fenster im Tray (Overlay verborgen), erst sichtbar
      // machen, sonst öffnet der Dialog unsichtbar im Hintergrund.
      api.showWindow().catch(() => {});
      if (settings) settings.open('controller');
      break;
    case 'notes':
      if (notes.isOpen()) notes.close();
      else notes.open();
      break;
    case 'hud': {
      const next = !(cfg.behavior && cfg.behavior.showBindingHud === true);
      setConfig({ behavior: { showBindingHud: next } });
      toast(next ? 'Tasten-Legende an.' : 'Tasten-Legende aus.', 'info', 1400);
      break;
    }
    case 'close-modal':
      closeTopModal();
      break;
    default:
      break;
  }
}

function updateControllerStatus(status) {
  const connected = Boolean(status && status.connected);
  controllerStatus.classList.toggle('connected', connected);
  controllerStatusText.textContent = connected
    ? `Controller: ${status.name || 'verbunden'}`
    : 'Controller: nicht verbunden';
}

// ------------------------------------------------------------
// Spielstatus
// ------------------------------------------------------------

function updateGameStatus(status) {
  const running = Boolean(status && status.running);
  gameRunningNow = running;
  qs('#gameStatus').classList.toggle('running', running);
  qs('#gameStatusText').textContent = running ? 'Destiny 2 läuft' : 'Spiel nicht gestartet';
  if (settings) settings.updateGameStatus({ running });
}

// ------------------------------------------------------------
// Hilfe
// ------------------------------------------------------------

function openHelp() {
  qs('#helpHotkey').textContent = formatAccelerator(cfg.hotkey);
  qs('#helpClickThroughHotkey').textContent = formatAccelerator(cfg.clickThroughHotkey);
  // Cheatsheet: die aktuelle Belegung live aus der Config rendern.
  const sheet = qs('#helpBindings');
  if (sheet) {
    const rows = bindingRows();
    sheet.innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              `<div><span class="hud-keys">${row.keys
                .map((key) => `<kbd>${escapeHtml(key)}</kbd>`)
                .join('')}</span><span>${escapeHtml(row.desc)}</span></div>`
          )
          .join('')
      : '<div><span>Keine Belegung aktiv.</span></div>';
  }
  modalOpen(qs('#helpModal'));
}

// Cheatsheet als Markdown-Datei exportieren (aus der Hilfe).
const helpExportBtn = qs('#helpExportBtn');
if (helpExportBtn) {
  helpExportBtn.addEventListener('click', async () => {
    const rows = bindingRows();
    const lines = [
      `# ${document.title} – Tastenbelegung`,
      '',
      `_Exportiert am ${new Date().toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE')}_`,
      '',
      '## Tastatur & Controller',
      '',
      ...rows.map((row) => `- \`${row.keys.join(' + ')}\` – ${row.desc}`),
      '',
      '_Nicht belegte Controller-Aktionen sind in den Einstellungen → Controller frei belegbar._'
    ];
    const result = await api.exportNotes(lines.join('\n'));
    if (result && result.ok) toast(`Belegung exportiert: ${result.path}`, 'success');
    else if (result && !result.canceled) toast((result && result.error) || 'Export fehlgeschlagen.', 'error');
  });
}

function closeHelp() {
  modalClose(qs('#helpModal'));
}

// ------------------------------------------------------------
// Ereignisse
// ------------------------------------------------------------
// Die frühere Webseiten-Leiste ist entfernt. Kategorien/Seiten haben
// keine Oberfläche mehr; nur die App-Schalter bleiben verdrahtet.

if (qs('#overlayBtn')) qs('#overlayBtn').addEventListener('click', () => api.enterOverlay().catch(() => {}));
if (qs('#settingsBtn')) qs('#settingsBtn').addEventListener('click', () => settings.open('overlay'));
if (qs('#helpBtn')) qs('#helpBtn').addEventListener('click', openHelp);

// ------------------------------------------------------------
// Bild-in-Bild (PiP)
// ------------------------------------------------------------

function playAlarmBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window.__d2AlarmCtx) window.__d2AlarmCtx = new AudioCtx();
    const ctx = window.__d2AlarmCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const beep = (delaySeconds, frequency) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = ctx.currentTime + delaySeconds;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
    };
    beep(0, 880);
    beep(0.45, 660);
  } catch (error) {
    // Ton ist optional.
  }
}

api.onResetAlarm?.((alarm) => {
  if (!alarm || !alarm.message) return;
  toast(alarm.message, 'warning', 7000);
  // Haptisches Signal: der Controller vibriert kurz - das spürt man
  // auch mitten im Spiel, ohne auf den Bildschirm zu schauen.
  try { controller.rumble(0.5, 320); } catch (error) { /* egal */ }
  const quiet = Number(window.__d2QuietUntil) > Date.now();
  if (quiet) return; // Ruhemodus: kein Signalton
  playAlarmSound();
});

// Eigener Alarm-Sound: konfigurierbare Datei abspielen, sonst den
// Standard-Beep über Web Audio.
async function playAlarmSound() {
  const pathValue = cfg.behavior && cfg.behavior.alarmSoundPath ? String(cfg.behavior.alarmSoundPath) : '';
  if (!pathValue) {
    playAlarmBeep();
    return;
  }
  try {
    if (!window.__d2AlarmAudio) {
      const result = await api.getAlarmSoundData();
      if (!result || !result.ok || !result.dataUrl) {
        playAlarmBeep();
        return;
      }
      window.__d2AlarmAudio = new Audio(result.dataUrl);
    }
    const audio = window.__d2AlarmAudio;
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    playAlarmBeep();
  }
}

// Controller-Verbindung: Toast bei Verbinden/Trennen (z. B. Dongle
// kurz aus dem Steckplatz - so sieht man es sofort).
api.onGamepadConnection?.((event) => {
  if (!event) return;
  const steamInputMode = Boolean(cfg.gamepad && cfg.gamepad.steamInputMode);
  if (event.connected || !steamInputMode) {
    toast(event.connected ? 'Controller verbunden.' : 'Controller getrennt.', event.connected ? 'success' : 'info', 2400);
  }
  // Erste-Hilfe-Hinweis bei erster Verbindung der Sitzung.
  if (event.connected && !window.__controllerHintShown) {
    window.__controllerHintShown = true;
    setTimeout(() => {
      toast('Controller-Tipp: L3+R3 für das Overlay, A = klicken, Y = präzise.', 'info', 8000);
    }, 800);
  }
});

api.onBungieStatus((status) => {
  const el = qs('#bungieStatus');
  if (!el || !status) return;
  el.hidden = false;
  el.classList.remove('ok', 'warn', 'bad');
  const latency = typeof status.latency === 'number' ? status.latency : null;
  const latencyText = latency !== null ? ` (${latency}ms)` : '';
  if (status.ok === true) {
    el.classList.add('ok');
    el.title = `Bungie-Server: online${latencyText}`;
  } else if (status.ok === false && status.maintenance) {
    el.classList.add('warn');
    el.title = `Bungie-Server: Wartung aktiv${latencyText}`;
    if (!window.__lastMaintenanceToast) {
      window.__lastMaintenanceToast = Date.now();
      toast('Bungie-Server in Wartung – Webseiten evtl. veraltet', 'warning', 5000);
    }
  } else if (status.ok === false) {
    el.classList.add('bad');
    el.title = `Bungie-Server: nicht erreichbar${latencyText}`;
    if (!window.__lastOfflineToast) {
      window.__lastOfflineToast = Date.now();
      toast('Bungie-Server nicht erreichbar', 'error', 4000);
    }
  } else {
    el.classList.add('warn');
    el.title = 'Bungie-Server: Status unbekannt';
  }
  // Hohe Latenz warnen (aber nicht spamen).
  if (latency !== null && latency > 300 && !window.__lastLatencyToast) {
    window.__lastLatencyToast = Date.now();
    toast(`Verbindung langsam: ${latency}ms zu Bungie-Servern`, 'warning', 4000);
  } else if (latency !== null && latency <= 300) {
    window.__lastLatencyToast = false;
  }
});
api.onOverlayFocus((payload) => {
  if (!payload || payload.focused) return;
  // Der Controller braucht den Fensterfokus (Chromium liefert Gamepad-
  // Eingaben nur an das fokussierte Fenster).
  toast('Controller im Overlay? Einmal ins Overlay klicken – Windows hat den Fokus nicht freigegeben.', 'warning', 5000);
});

// Geteilte Loadouts (d2tool://): als Ereignis an das Inventar.
if (typeof api.onDeepLinkLoadout === 'function') {
  api.onDeepLinkLoadout((payload) => {
    if (!payload) return;
    try { showInventoryPage(); } catch (error) { /* egal */ }
    inventory.load().then(() => {
      window.dispatchEvent(new CustomEvent('d2-loadout-share', { detail: payload }));
    });
  });
}

// Geteilte Händler-Angebote (d2tool://vendor): Werkzeugseite öffnen
// und den Detaildialog für das Angebot anzeigen.
if (typeof api.onDeepLinkVendor === 'function') {
  api.onDeepLinkVendor((payload) => {
    if (!payload || !payload.vendorHash) return;
    try { showInventoryPage(); } catch (error) { /* egal */ }
    const open = () => {
      if (inventory && typeof inventory.openTools === 'function') inventory.openTools('vendor');
      window.dispatchEvent(new CustomEvent('d2-vendor-open', { detail: payload }));
    };
    if (inventory && typeof inventory.load === 'function') inventory.load().then(open).catch(open);
    else open();
  });
}

// Lokale API (Stream Deck & Co.): Aktionen an die Oberfläche geben.
if (typeof api.onApiAction === 'function') {
  api.onApiAction((payload) => {
    if (!payload) return;
    const action = String(payload.action || '');
    if (action === 'view') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      if (inventory && inventory.openTools) inventory.openTools(payload.view);
      return;
    }
    if (action === 'loadout') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      if (inventory && inventory.applyLoadoutById) inventory.applyLoadoutById(payload.id);
      return;
    }
    if (action === 'loadout-missing') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      if (inventory && inventory.applyLoadoutMissingById) inventory.applyLoadoutMissingById(payload.id);
      return;
    }
    if (action === 'inventory') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      return;
    }
    if (action === 'outbox-open') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      window.dispatchEvent(new CustomEvent('d2-outbox-open'));
      return;
    }
    if (action === 'outbox-send') {
      window.dispatchEvent(new CustomEvent('d2-outbox-send'));
      return;
    }
    if (action === 'loadout-queue') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      window.dispatchEvent(new CustomEvent('d2-loadout-queue-open'));
      return;
    }
    if (action === 'champion-audit') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      window.dispatchEvent(new CustomEvent('d2-champion-audit-open'));
      return;
    }
    if (action === 'postmaster') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      if (inventory && inventory.openPostmaster) inventory.openPostmaster();
      return;
    }
    if (action === 'dashboard') {
      try { dashboard.open(); } catch (error) { /* egal */ }
      return;
    }
    if (action === 'settings') {
      try { settings.open(payload.tab || 'overlay'); } catch (error) { /* egal */ }
      return;
    }
    if (action === 'notes') {
      try { notes.open(); } catch (error) { /* egal */ }
      return;
    }
    if (action === 'checklist') {
      try { checklist.open(payload.filter || 'all'); } catch (error) { /* egal */ }
      return;
    }
    if (action === 'toast') {
      const message = String(payload.message || '').slice(0, 200);
      if (message) toast(message, 'info', 3200);
      return;
    }
    if (action === 'vendor') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      inventory.openTools('vendor', {
        vendorHash: Number(payload.vendorHash) || 0,
        itemHash: Number(payload.itemHash) || 0
      });
      return;
    }
    if (action === 'collection') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      inventory.openTools('collection', { collectionTab: payload.tab || 'overview' });
      return;
    }
    if (action === 'week') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      inventory.openTools('week', { weekFilter: payload.filter || 'all' });
      return;
    }
    if (action === 'vendors') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      inventory.openTools('vendor', { vendorWishlist: payload.wishlist === true });
      return;
    }
    if (action === 'picker') {
      try { showInventoryPage(); } catch (error) { /* egal */ }
      inventory.openTools('builds', { pickerClass: [0, 1, 2].includes(Number(payload.classType)) ? Number(payload.classType) : -1 });
      return;
    }
    if (action === 'checklist-toggle') {
      const items = ((cfg.checklist && cfg.checklist.items) || []).slice();
      const id = String(payload.id || '');
      const text = String(payload.text || '').trim().toLowerCase();
      let target = id ? items.find((item) => String(item.id) === id) : null;
      if (!target && text) {
        target = items.find((item) => String(item.text || '').toLowerCase() === text)
          || items.find((item) => String(item.text || '').toLowerCase().includes(text));
      }
      if (!target) { toast('Checklisten-Punkt nicht gefunden.', 'info', 2200); return; }
      setConfig({ checklist: { items: items.map((item) => item === target ? { ...item, done: !item.done } : item) } });
      try { checklist.render(); } catch (error) { /* egal */ }
      toast(target.done ? 'Punkt wieder geöffnet.' : 'Punkt abgehakt.', 'success', 1600);
      return;
    }
    if (action === 'checklist-add') {
      const text = String(payload.text || '').trim().slice(0, 120);
      if (!text) return;
      const items = ((cfg.checklist && cfg.checklist.items) || []).concat([{
        id: 'c-' + Date.now().toString(36),
        text,
        done: false,
        group: 'own',
        repeat: '',
        doneAt: 0
      }]);
      setConfig({ checklist: { items } });
      try { checklist.render(); } catch (error) { /* egal */ }
      toast('Checklisten-Punkt hinzugefügt.', 'success', 1800);
      return;
    }
    if (action === 'checklist-reset') {
      const items = ((cfg.checklist && cfg.checklist.items) || []).map((item) => ({ ...item, done: false }));
      setConfig({ checklist: { items, week: checklist.weekKey() } });
      try { checklist.render(); } catch (error) { /* egal */ }
      toast('Checkliste zurückgesetzt.', 'info', 1800);
      return;
    }
    if (action === 'refresh-inventory') {
      if (inventory && inventory.refresh) inventory.refresh(true);
      return;
    }
    if (action === 'refresh-wishlist') {
      if (inventory && inventory.refreshWishlist) inventory.refreshWishlist();
      return;
    }
    if (action === 'mode') {
      const mode = String(payload.mode || '');
      if (mode === 'streamer') {
        const next = !(cfg.appearance && cfg.appearance.streamerMode);
        setConfig({ appearance: { streamerMode: next } });
        toast(next ? 'Streamer-Modus aktiviert.' : 'Streamer-Modus deaktiviert.', 'info', 1800);
      } else if (mode === 'tv') {
        const next = !(cfg.appearance && cfg.appearance.tvMode);
        setConfig({ appearance: { tvMode: next } });
        toast(next ? 'TV-Modus aktiviert.' : 'TV-Modus deaktiviert.', 'info', 1800);
      } else if (mode === 'controller') {
        const next = !(cfg.gamepad && cfg.gamepad.enabled !== false);
        setConfig({ gamepad: { enabled: next } });
        toast(next ? 'Controller-Steuerung aktiviert.' : 'Controller-Steuerung deaktiviert.', 'info', 1800);
      }
      return;
    }
    if (action === 'session-goal') {
      const id = String(payload.id || '');
      const delta = Math.max(-10, Math.min(10, Math.round(Number(payload.delta) || 1)));
      const goals = ((cfg.bungie && cfg.bungie.sessionGoals) || []).map((goal) =>
        (!id || goal.id === id) ? { ...goal, progress: Math.max(0, Math.min(Number(goal.target) || 1, (Number(goal.progress) || 0) + delta)) } : goal
      );
      setConfig({ bungie: { sessionGoals: goals } });
      toast('Session-Ziel aktualisiert.', 'success', 1600);
      return;
    }
    if (action === 'emergency') {
      try { if (inventory && inventory.close) inventory.close(); } catch (error) { /* egal */ }
      try { if (typeof api.hideOverlay === 'function') api.hideOverlay(); } catch (error) { /* egal */ }
      toast('Notfall-Stopp: Overlay geschlossen und Aktionen abgebrochen.', 'warning', 2600);
      return;
    }
  });
}

api.onGameStatus((status) => {
  updateGameStatus(status);
});
api.onGamepadState((snapshot) => {
  if (window.__lastGamepadLog !== (snapshot && snapshot.connected)) {
    window.__lastGamepadLog = Boolean(snapshot && snapshot.connected);
    console.log('[d2] XInput-Status', window.__lastGamepadLog);
  }
  if (xinputHandler) xinputHandler(snapshot);
  updateBatteryBadge(snapshot);
  maybeOfferTvMode(snapshot);
  // Controller-Test-Fenster live mitfuhren (Tasten, Sticks, Trigger,
  // Akku, Guide-Status) - unabhaengig vom Verbindungsstatus-Callback.
  if (settings) settings.updateTestLive?.(snapshot);
});
// Achsenwerte für die Kalibrierungsanzeige weiterreichen.
window.__axesForward = (payload) => {
  if (axesHandler) axesHandler(payload);
};
// Nur für den Smoke-Test: Gamepad-Zustand direkt einspeisen.
window.__smokeSend = (snapshot) => {
  if (xinputHandler) xinputHandler(snapshot);
};

// DIM-Links werden nicht mehr eingebettet, sondern im Standardbrowser
// geöffnet (der Hauptprozess meldet sie hierher).
api.onOpenInDim(({ url } = {}) => {
  if (!url) return;
  api.openExternal(url).catch(() => {});
  toast('Im Browser geöffnet.', 'info', 1600);
});
api.onWindowState(({ maximized }) => {
  const button = qs('[data-win="maximize"]');
  if (button) button.innerHTML = icon(maximized ? 'restore' : 'maximize');
});
if (api.onDisplayChanged) api.onDisplayChanged((payload) => {
  toast('Bildschirm-/DPI-Änderung erkannt – Fenster wurde angepasst.', 'info', 2600);
  try { if (inventoryInstance && inventoryInstance.refreshInventory) inventoryInstance.refreshInventory(); } catch (error) { /* egal */ }
});
api.onOpenSettings(() => settings.open('overlay'));
api.onHotkeyWarning((warning) => {
  if (warning && warning.message) toast(warning.message, 'warning');
});
api.onToast((payload) => {
  if (!payload || !payload.message) return;
  // Aktions-Toasts (z. B. Erinnerungs-Snooze): Buttons mit string-
  // Aktionen, die hier auf die APIs gemappt werden.
  const mapped = (payload.actions || []).map((action) => ({
    label: action.label,
    run: () => {
      if (action.action === 'snooze-reminder') {
        api.reminderSnooze(action.id, action.minutes || 5).catch(() => {});
        toast(`Erinnerung verschoben (+${action.minutes || 5} Min).`, 'info', 1800, true);
      } else if (action.action === 'snooze-alarm') {
        api.alarmSnooze(action.minutes || 10).catch(() => {});
        toast(`Erinnerung verschoben (+${action.minutes || 10} Min).`, 'info', 1800, true);
      }
    }
  }));
  toast(payload.message, payload.kind || 'info', 3400, payload.force === true, mapped);
});
  // 'dashboard': Dashboard umschalten (globaler Kürzel-Pfad).
api.onNavShortcut((payload) => {
  if (!payload || anyModalOpen()) return;
  if (payload.type === 'dashboard') {
    if (dashboardHidden()) dashboard.open();
    else dashboard.restore();
  }
});

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

// ------------------------------------------------------------
// PIN-Sperre beim Start
// ------------------------------------------------------------
async function initSecurityLock() {
  if (!api.securityStatus || !api.securityVerifyPin) return;
  const status = await api.securityStatus().catch(() => null);
  if (!status || !status.pinSet) return;
  const lock = qs('#securityLock');
  const input = qs('#securityPinInput');
  const button = qs('#securityUnlockBtn');
  const error = qs('#securityLockError');
  if (!lock || !input || !button) return;
  const showLock = (message = '') => {
    lock.classList.remove('hidden');
    if (error) error.textContent = message;
    input.value = '';
    input.focus();
  };
  showLock();
  if (api.onSecurityLock) api.onSecurityLock(() => showLock('Automatisch gesperrt – PIN eingeben.'));
  const submit = async () => {
    const pin = String(input.value || '').trim();
    if (!pin) return;
    button.disabled = true;
    try {
      const result = await api.securityVerifyPin(pin);
      if (result && result.ok) {
        lock.classList.add('hidden');
        input.value = '';
        if (error) error.textContent = '';
      } else if (error) {
        error.textContent = result && result.locked
          ? `Zu viele Fehlversuche – noch ${Number(result.retryAfter) || 0} s warten.`
          : 'Falsche PIN.';
        input.select();
      }
    } catch (err) {
      if (error) error.textContent = err.message || String(err);
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
}

applyAccent();
applyBindingHud();
applyUiScale();

// Großer Bildschirm / hohe Windows-Skalierung: einmalig Zoom anbieten.
function maybeOfferZoom() {
  try {
    if (window.localStorage.getItem('d2tool.zoomAsked') === '1') return;
    const dpr = Number(window.devicePixelRatio) || 1;
    const wide = window.screen && Math.max(Number(window.screen.width) || 0, Number(window.screen.height) || 0) >= 2500;
    if (dpr < 1.3 && !wide) return;
    const scale = Number(cfg.appearance && cfg.appearance.uiScale) || 1;
    if (scale > 1) return;
    window.localStorage.setItem('d2tool.zoomAsked', '1');
    toast('Großer Bildschirm erkannt – Oberfläche vergrößern?', 'info', 12000, false, [
      { label: '125 %', run: () => setConfig({ appearance: { uiScale: 1.25 } }) },
      { label: 'Nicht mehr fragen', run: () => {} }
    ]);
  } catch (error) {
    // optional
  }
}
setTimeout(maybeOfferZoom, 6000);
watchControllerAreaProfiles();
initSecurityLock();
updateQuietState();

// Token-Gesundheit: einmal pro Sitzung warnen, bevor Inventar und
// Poststelle wegen einer abgelaufenen Anmeldung ausfallen.
let tokenWarningShown = false;
setInterval(async () => {
  if (tokenWarningShown) return;
  try {
    const status = await api.bungieOAuthStatus();
    if (!status || !status.loggedIn) return;
    if (status.tokenReadable === false) {
      tokenWarningShown = true;
      toast('Gespeicherte Anmeldung ist nicht lesbar – bitte einmal neu anmelden.', 'warning', 6500, true);
    } else if (status.publicClient) {
      tokenWarningShown = true;
      toast('Anmeldung ohne Refresh-Token: läuft nach etwa einer Stunde ab. Für dauerhaftes Angemeldetbleiben das Client-Secret eintragen.', 'warning', 7000, true);
    }
  } catch (error) { /* egal */ }
}, 90000);
if (api.onBungieOAuth) api.onBungieOAuth(() => { tokenWarningShown = false; });
applyOverlayVisibility();

// Es gibt keine Webseiten mehr: Start ist immer Dashboard oder Inventar.
const startView = (cfg.appearance && cfg.appearance.startView) || 'dashboard';
if (startView === 'inventory') showInventoryPage();
else dashboard.open();
checklist.checkReset();
// Einrichtungs-Assistent beim allerersten Start (überspringbar).
setTimeout(() => {
  if (onboarding) onboarding.maybeStart();
}, 1800);

// Tastatur-Shortcuts: Strg+Alt+1–5 öffnet die Werkzeuge-Ansichten,
// Strg+Alt+I das Inventar, Strg+Alt+E den Einrichtungs-Assistenten.
window.addEventListener('keydown', (event) => {
  if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return;
  const viewMap = { '1': 'overview', '2': 'builds', '3': 'collection', '4': 'week', '5': 'vendor' };
  const view = viewMap[event.key];
  if (view) {
    event.preventDefault();
    showInventoryPage();
    inventory.load().then(() => window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'tools', view } })));
    return;
  }
  if (event.key.toLowerCase() === 'i') {
    event.preventDefault();
    showInventoryPage();
    return;
  }
  if (event.key.toLowerCase() === 'e') {
    event.preventDefault();
    if (onboarding) onboarding.open();
  }
});

applyOverlayState(overlayState);
updateHints();
updateGameStatus(await api.getGameStatus().catch(() => ({ running: false })));
showDailyGreeting();

if (!cfg.behavior || !cfg.behavior.firstRunDone) {
  setTimeout(() => {
    try { openHelp(); } catch (error) {}
    toast('Willkommen! Drücke Alt+D für das Overlay. Im randlosen Fenstermodus von Destiny 2 funktioniert es über dem Spiel.', 'info', 5000);
  }, 600);
  setConfig({ behavior: { firstRunDone: true } });
}

// Diagnose für den Smoke-Test
window.__D2_READY__ = true;
window.__D2_DIAG__ = () => ({
  ready: Boolean(window.__D2_READY__),
  categories: 0,
  sites: 0,
  tabs: 0,
  siteOptions: 0,
  customSites: 0,
  webviews: 0,
  overlayMode: overlayState.mode,
  hasSettings: Boolean(document.querySelector('#settingsModal')),
  hasCursor: Boolean(document.querySelector('#padCursor')),
  hasController: Boolean(controller)
});

