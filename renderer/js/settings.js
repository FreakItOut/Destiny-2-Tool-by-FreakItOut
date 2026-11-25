import { BUTTONS } from './controller.js';
import { icon } from './icons.js';
import { qs, qsa, escapeHtml, formatAccelerator, toast, modalOpen, modalClose, clamp, debounce } from './ui.js';

const DEFAULT_HOTKEY = 'Alt+D';
const DEFAULT_CLICK_THROUGH_HOTKEY = 'Alt+Shift+D';
const DEFAULT_COMBO = [10, 11];
let sensitiveClipboardTimer = null;

async function copySensitive(text, message) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    toast(`${message} Clipboard wird in 30 s geleert.`, 'success', 2800);
    if (sensitiveClipboardTimer) clearTimeout(sensitiveClipboardTimer);
    sensitiveClipboardTimer = setTimeout(async () => {
      sensitiveClipboardTimer = null;
      try { await navigator.clipboard.writeText(' '); } catch (error) { /* egal */ }
    }, 30000);
  } catch (error) {
    toast(String(text || ''), 'info', 8000);
  }
}

// Belegungs-Tabelle (Aktion -> Taste). Exportiert, damit die
// Tasten-Legende (HUD) im Hauptfenster und das Cheatsheet in der
// Hilfe dieselbe Liste verwenden.
export const BINDING_ACTIONS = [
  { key: 'click', label: 'Klicken' },
  { key: 'back', label: 'Zurück' },
  { key: 'reload', label: 'Seite neu laden' },
  { key: 'precision', label: 'Präzisionsmodus' },
  { key: 'categoryPrev', label: 'Kategorie zurück' },
  { key: 'categoryNext', label: 'Kategorie weiter' },
  { key: 'sitePrev', label: 'Webseite zurück' },
  { key: 'siteNext', label: 'Webseite weiter' },
  { key: 'settings', label: 'Einstellungen' },
  { key: 'hide', label: 'Overlay ausblenden' },
  { key: 'notes', label: 'Notizen öffnen' },
  { key: 'pip', label: 'Mini-Fenster (PiP)' },
  { key: 'unloadOthers', label: 'Andere Seiten entladen' },
  { key: 'hud', label: 'Tasten-Legende ein-/aus' }
];

const QUICK_MENU_ACTIONS = [
  { key: 'to-vault', label: 'Tresor' },
  { key: 'to-char', label: 'Lagern' },
  { key: 'favorite', label: 'Favorit' },
  { key: 'equip', label: 'Anlegen' },
  { key: 'loadout', label: 'Loadout-Editor' },
  { key: 'keyboard', label: 'Tastatur' },
  { key: 'refresh', label: 'Aktualisieren' },
  { key: 'inventory', label: 'Inventar' },
  { key: 'close', label: 'Schließen' }
];
const QUICK_MENU_DIRECTIONS = [
  ['top', 'Oben'], ['right', 'Rechts'], ['bottom', 'Unten'], ['left', 'Links']
];

const ACCEL_KEYS = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  Spacebar: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert'
};

function acceleratorKey(event) {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key;
  if (ACCEL_KEYS[event.key]) return ACCEL_KEYS[event.key];
  return null;
}

function toAccelerator(event) {
  const key = acceleratorKey(event);
  if (!key) return null;
  const mods = [];
  if (event.ctrlKey) mods.push('Ctrl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  if (event.metaKey) mods.push('Super');
  const isFunction = /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key);
  if (!mods.length && !isFunction) return null;
  return [...mods, key].join('+');
}

function formatCombo(combo) {
  const list = Array.isArray(combo) ? combo : [];
  if (!list.length) return '—';
  return list.map((index) => BUTTONS[index]?.label || String(index)).join(' + ');
}

function normalizeUrl(value) {
  let url = String(value || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

export function initSettings({
  api,
  getConfig,
  setConfig,
  getCategories,
  controller,
  web,
  onCustomSitesChanged,
  onReloadCurrentSite,
  onCategoryOrderChanged
}) {
  const modal = qs('#settingsModal');
  const tabs = qsa('[data-settings-tab]', modal);
  const panels = qsa('[data-settings-panel]', modal);
  const hotkeyInput = qs('#hotkeyInput');
  const clickThroughInput = qs('#clickThroughHotkeyInput');
  const comboInput = qs('#gamepadCombo');
  // Schnellmenü-Belegung (Richtung → Aktion) aufbauen.
  function buildQuickMenuConfig() {
    const host = qs('#quickMenuConfig');
    if (!host) return;
    const scopeLabel = { popup: 'Item-Popup', inventory: 'Inventar' };
    host.innerHTML = ['popup', 'inventory'].map((scope) =>
      `<div class="field"><label>Schnellmenü: ${scopeLabel[scope]}</label><div class="quickmenu-grid">` +
        QUICK_MENU_DIRECTIONS.map(([direction, label]) =>
          `<label class="quickmenu-cell"><span>${label}</span><select class="control" data-qm-scope="${scope}" data-qm-direction="${direction}">` +
            QUICK_MENU_ACTIONS.map((action) => `<option value="${action.key}">${escapeHtml(action.label)}</option>`).join('') +
          `</select></label>`
        ).join('') +
      `</div></div>`
    ).join('');
    for (const select of qsa('#quickMenuConfig select[data-qm-scope]')) {
      select.addEventListener('change', () => {
        const quickMenu = { popup: {}, inventory: {} };
        for (const item of qsa('#quickMenuConfig select[data-qm-scope]')) {
          quickMenu[item.dataset.qmScope][item.dataset.qmDirection] = item.value;
        }
        setConfig({ gamepad: { quickMenu } });
      });
    }
  }
  buildQuickMenuConfig();
  const padGrid = qs('#padGrid');
  const padCells = [];
  const customCategory = qs('#customCategory');
  const customList = qs('#customList');

  let recording = null;
  let recordingCombo = false;
  let comboFinishTimer = 0;
  let displays = [];
  let appInfo = null;
  let isOpen = false;
  let lastGame = { running: false };
  let currentTab = 'overlay';

  // Live-Test-Raster einmalig aufbauen.
  if (padGrid) {
    padGrid.innerHTML = BUTTONS.map(
      (button, index) =>
        `<div class="pad-key" data-pad-index="${index}"><span>${escapeHtml(button.label)}</span><small>${escapeHtml(button.alt)}</small></div>`
    ).join('');
    qsa('.pad-key', padGrid).forEach((cell) => padCells.push(cell));
  }

  // Belegungs-Tabelle aufbauen (BINDING_ACTIONS ist oben definiert
  // und wird auch für HUD/Cheatsheet verwendet).
  const bindingGrid = qs('#bindingGrid');
  if (bindingGrid) {
    bindingGrid.innerHTML = BINDING_ACTIONS.map((action) => {
      const options = ['<option value="-1">Nicht belegt</option>']
        .concat(BUTTONS.map((button, index) => `<option value="${index}">${escapeHtml(button.label)}</option>`))
        .join('');
      return `<div class="binding-row"><label for="bind-${action.key}">${escapeHtml(action.label)}</label><select id="bind-${action.key}" class="control">${options}</select></div>`;
    }).join('');
    for (const action of BINDING_ACTIONS) {
      const select = qs(`#bind-${action.key}`);
      if (!select) continue;
      select.addEventListener('change', (event) => {
        const bindings = { ...(cfg().gamepad.bindings || {}) };
        bindings[action.key] = Number(event.target.value);
        setConfig({ gamepad: { bindings } });
      });
    }
  }

  // ------------------------------------------------------------
  // Kalibrierung der Analog-Sticks
  // ------------------------------------------------------------

  const CALIBRATION_STEPS = [
    'Stell den Stick in die Mitte los und drücke „Weiter“.',
    'Bewege den linken Stick ganz nach links und halte ihn dort.',
    'Bewege den linken Stick ganz nach oben und halte ihn dort.',
    'Bewege den linken Stick ganz nach rechts und halte ihn dort.',
    'Bewege den linken Stick ganz nach unten und halte ihn dort.',
    'Fertig – die Kalibrierung wurde gespeichert.'
  ];

  let calibration = null;

  function updateAxisView(payload) {
    if (!payload || !payload.raw) return;
    const raw = payload.raw;
    for (let i = 0; i < 4; i += 1) {
      const fill = qs(`#axisFill${i}`);
      const value = qs(`#axisValue${i}`);
      if (!fill || !value) continue;
      const number = Math.max(-1, Math.min(1, Number(raw[i] || 0)));
      value.textContent = number.toFixed(2);
      const percent = Math.abs(number) * 50;
      if (number >= 0) {
        fill.style.left = '50%';
        fill.style.width = `${percent}%`;
      } else {
        fill.style.left = `${50 - percent}%`;
        fill.style.width = `${percent}%`;
      }
    }
  }

  function calibrationInfo(text) {
    const info = qs('#gamepadCalibrateInfo');
    if (info) info.textContent = text || '';
  }

  function startCalibration() {
    calibration = {
      step: 0,
      center: [0, 0, 0, 0],
      min: [-1, -1, -1, -1],
      max: [1, 1, 1, 1],
      samples: [[], [], [], []]
    };
    calibrationInfo(`${CALIBRATION_STEPS[0]} (Schritt 1 von 6)`);
  }

  function updateCalibration(payload) {
    if (!calibration || !payload || !payload.raw) return;
    for (let i = 0; i < 4; i += 1) {
      calibration.samples[i].push(Number(payload.raw[i] || 0));
      if (calibration.samples[i].length > 40) calibration.samples[i].shift();
    }

    if (calibration.step === 0) {
      // Ruheposition erfassen.
      if (calibration.samples[0].length >= 20) {
        calibration.center = calibration.samples[0].slice(-10).reduce((a, b) => a + b, 0) / 10;
        calibration.step = 1;
        calibrationInfo(`${CALIBRATION_STEPS[1]} (Schritt 2 von 6)`);
      }
      return;
    }

    if (calibration.step === 1) {
      // Linker Stick ganz links.
      if (calibration.samples[0].length >= 20) {
        calibration.min[0] = Math.min(...calibration.samples[0]);
        calibration.step = 2;
        calibrationInfo(`${CALIBRATION_STEPS[2]} (Schritt 3 von 6)`);
      }
      return;
    }

    if (calibration.step === 2) {
      if (calibration.samples[1].length >= 20) {
        calibration.min[1] = Math.min(...calibration.samples[1]);
        calibration.step = 3;
        calibrationInfo(`${CALIBRATION_STEPS[3]} (Schritt 4 von 6)`);
      }
      return;
    }

    if (calibration.step === 3) {
      if (calibration.samples[0].length >= 20) {
        calibration.max[0] = Math.max(...calibration.samples[0]);
        calibration.step = 4;
        calibrationInfo(`${CALIBRATION_STEPS[4]} (Schritt 5 von 6)`);
      }
      return;
    }

    if (calibration.step === 4) {
      if (calibration.samples[1].length >= 20) {
        calibration.max[1] = Math.max(...calibration.samples[1]);
        calibration.step = 5;
        const data = {
          center: calibration.center.slice(),
          min: calibration.min.slice(),
          max: calibration.max.slice()
        };
        setConfig({ gamepad: { calibration: data } });
        calibration = null;
        calibrationInfo(`${CALIBRATION_STEPS[5]}`);
      }
      return;
    }
  }

  function resetCalibration() {
    calibration = null;
    setConfig({
      gamepad: {
        calibration: { center: [0, 0, 0, 0], min: [-1, -1, -1, -1], max: [1, 1, 1, 1] }
      }
    });
    calibrationInfo('Kalibrierung zurückgesetzt.');
  }

  function cfg() {
    return getConfig();
  }

  function setTab(tab) {
    currentTab = tab;
    for (const button of tabs) {
      button.classList.toggle('active', button.dataset.settingsTab === tab);
    }
    for (const panel of panels) {
      panel.classList.toggle('active', panel.dataset.settingsPanel === tab);
    }
  }

  function updateRangeLabels() {
    const config = cfg();
    qs('#overlayOpacityValue').textContent = `${Math.round(config.overlay.opacity * 100)} %`;
    qs('#overlayWidthValue').textContent = `${config.overlay.width} %`;
    qs('#overlayHeightValue').textContent = `${config.overlay.height} %`;
    qs('#overlayScaleValue').textContent = `${Math.round((Number(config.overlay.scale) || 1) * 100)} %`;
    qs('#gamepadSpeedValue').textContent = String(config.gamepad.speed);
    qs('#gamepadDeadzoneValue').textContent = `${Math.round(config.gamepad.deadzone * 100)} %`;
    qs('#gamepadTriggerThresholdValue').textContent = `${Math.round((Number(config.gamepad.triggerThreshold) || 0.35) * 100)} %`;
    qs('#webZoomValue').textContent = `${Math.round(config.web.zoom * 100)} %`;
    qs('#uiScaleValue').textContent = `${Math.round((Number(config.appearance && config.appearance.uiScale) || 1) * 100)} %`;
  const colorblind = qs('#colorblindMode');
  if (colorblind) colorblind.checked = Boolean(config.appearance && config.appearance.colorblind);
  const highContrast = qs('#highContrastMode');
  if (highContrast) highContrast.checked = Boolean(config.appearance && config.appearance.highContrast);
  const reduceMotion = qs('#reduceMotionMode');
  if (reduceMotion) reduceMotion.checked = Boolean(config.appearance && config.appearance.reduceMotion);
  const simpleMode = qs('#simpleModeMode');
  if (simpleMode) simpleMode.checked = !(config.appearance && config.appearance.simpleMode === false);
  const backupFolderInput = qs('#backupFolderInput');
  if (backupFolderInput) backupFolderInput.value = String((config.backups && config.backups.folder) || '');
  const backupKeep = qs('#backupKeep');
  if (backupKeep) backupKeep.value = String((config.backups && config.backups.keep) || 8);
  const cleanupEnabled = qs('#cleanupScheduleEnabled');
  const cleanupSchedule = (config.behavior && config.behavior.cleanupSchedule) || {};
  if (cleanupEnabled) {
    cleanupEnabled.checked = cleanupSchedule.enabled === true;
    const weekday = qs('#cleanupScheduleWeekday');
    if (weekday) weekday.value = String(cleanupSchedule.weekday || 0);
    const time = qs('#cleanupScheduleTime');
    if (time) time.value = String(cleanupSchedule.time || '19:00');
  }
  const gameMode = qs('#gameModeOptimize');
  if (gameMode) gameMode.checked = Boolean(config.behavior && config.behavior.gameModeOptimize);
  const refocusGame = qs('#refocusGameOnHide');
  if (refocusGame) refocusGame.checked = !(config.behavior && config.behavior.refocusGameOnOverlayHide === false);
  const notifyTts = qs('#notifyTts');
  if (notifyTts) notifyTts.checked = Boolean(config.notifications && config.notifications.tts);
  const solidUi = qs('#solidUiMode');
  if (solidUi) solidUi.checked = Boolean(config.appearance && config.appearance.solidUi);
  const logLevel = qs('#logLevel');
  if (logLevel) logLevel.value = String((config.behavior && config.behavior.logLevel) || 'info');
  const dyslexia = qs('#dyslexiaMode');
  if (dyslexia) dyslexia.checked = Boolean(config.appearance && config.appearance.dyslexia);
  const tvMode = qs('#tvModeMode');
  if (tvMode) tvMode.checked = Boolean(config.appearance && config.appearance.tvMode);
  const hudShowActivity = qs('#hudShowActivity');
  if (hudShowActivity) hudShowActivity.checked = !config.statsHud || config.statsHud.showActivity !== false;
  const hudShowChampions = qs('#hudShowChampions');
  if (hudShowChampions) hudShowChampions.checked = !config.statsHud || config.statsHud.showChampions !== false;
  const uiLanguage = qs('#uiLanguage');
  if (uiLanguage) uiLanguage.value = (config.appearance && config.appearance.uiLanguage) === 'en' ? 'en' : 'de';
  }

  async function loadDisplays() {
    try {
      displays = await api.getDisplays();
    } catch (error) {
      displays = [];
    }
    const select = qs('#overlayMonitor');
    if (!select) return;
    const autoOption = '<option value="-1">Automatisch (Monitor von Destiny 2)</option>';
    if (!displays.length) {
      select.innerHTML = autoOption + '<option value="0">Monitor 1</option>';
      return;
    }
    select.innerHTML = autoOption + displays
      .map(
        (display) =>
          `<option value="${display.index}">${escapeHtml(display.label)}${display.primary ? ' (Hauptmonitor)' : ''} · ${display.width}×${display.height}</option>`
      )
      .join('');
    const wanted = String(cfg().overlay.monitor);
    select.value = wanted === '-1' || displays.some((display) => String(display.index) === wanted) ? wanted : '0';
  }

  function refreshHotkeyFields() {
    if (recording) return;
    const config = cfg();
    hotkeyInput.value = formatAccelerator(config.hotkey);
    clickThroughInput.value = formatAccelerator(config.clickThroughHotkey);
    const postmasterField = qs('#postmasterHotkeyInput');
    if (postmasterField) postmasterField.value = formatAccelerator(config.postmasterHotkey || '');
    const inventoryField = qs('#inventoryHotkeyInput');
    if (inventoryField) inventoryField.value = formatAccelerator(config.inventoryHotkey || '');
    updateAboutHotkeys();
  }

  function updateAboutHotkeys() {
    const config = cfg();
    const el = qs('#aboutHotkeys');
    if (el) {
      el.innerHTML = `Overlay: <kbd>${escapeHtml(formatAccelerator(config.hotkey))}</kbd> &nbsp; Maus durchlassen: <kbd>${escapeHtml(
        formatAccelerator(config.clickThroughHotkey)
      )}</kbd>`;
    }
  }

  // ------------------------------------------------------------
  // Overlay-Chip-Reihenfolge
  // ------------------------------------------------------------
  const CHIP_LABELS = {
    clock: 'Reset (Daily/Weekly)',
    session: 'Session-Timer',
    activity: 'Aktivitäts-Status',
    battery: 'Controller-Akku'
  };
  let chipOrderState = ['clock', 'session', 'activity', 'battery'];

  function renderChipOrder(config) {
    const box = qs('#overlayChipOrder');
    if (!box) return;
    const raw = (config && config.overlay && Array.isArray(config.overlay.chipOrder)) ? config.overlay.chipOrder : [];
    chipOrderState = raw.filter((key) => CHIP_LABELS[key]);
    for (const key of Object.keys(CHIP_LABELS)) if (!chipOrderState.includes(key)) chipOrderState.push(key);
    box.innerHTML = chipOrderState
      .map((key, index) => `<div class="chip-order-row" draggable="true" data-chip-key="${key}">
        <span class="pos">${index + 1}.</span>
        <span class="name">${escapeHtml(CHIP_LABELS[key])}</span>
        <button type="button" class="btn ghost small" data-chip-up="${key}" ${index === 0 ? 'disabled' : ''} title="nach vorne">↑</button>
        <button type="button" class="btn ghost small" data-chip-down="${key}" ${index === chipOrderState.length - 1 ? 'disabled' : ''} title="nach hinten">↓</button>
      </div>`)
      .join('');
    if (box.dataset.dragBound !== '1') {
      box.dataset.dragBound = '1';
      let dragKey = '';
      box.addEventListener('dragstart', (event) => {
        const row = event.target.closest('[data-chip-key]');
        if (!row) return;
        dragKey = String(row.dataset.chipKey || '');
        row.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', dragKey);
        }
      });
      box.addEventListener('dragover', (event) => {
        if (!dragKey) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        for (const row of box.querySelectorAll('[data-chip-key]')) row.classList.toggle('drag-over', row === event.target.closest('[data-chip-key]'));
      });
      box.addEventListener('drop', (event) => {
        event.preventDefault();
        const row = event.target.closest('[data-chip-key]');
        if (!row || !dragKey) return;
        const targetKey = String(row.dataset.chipKey || '');
        if (targetKey === dragKey) return;
        const next = chipOrderState.filter((key) => key !== dragKey);
        const targetIndex = next.indexOf(targetKey);
        next.splice(targetIndex >= 0 ? targetIndex : next.length, 0, dragKey);
        chipOrderState = next;
        dragKey = '';
        setConfig({ overlay: { chipOrder: next } });
        renderChipOrder({ overlay: { chipOrder: next } });
      });
      box.addEventListener('dragend', () => {
        dragKey = '';
        for (const row of box.querySelectorAll('[data-chip-key]')) row.classList.remove('dragging', 'drag-over');
      });
    }
  }

  function moveChip(key, delta) {
    const index = chipOrderState.indexOf(key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= chipOrderState.length) return;
    const next = chipOrderState.slice();
    [next[index], next[target]] = [next[target], next[index]];
    chipOrderState = next;
    setConfig({ overlay: { chipOrder: next } });
    renderChipOrder({ overlay: { chipOrder: next } });
  }

  // ------------------------------------------------------------
  // Overlay-Layout-Profile
  // ------------------------------------------------------------
  function renderOverlayProfiles(config) {
    const box = qs('#overlayProfileList');
    if (!box) return;
    const overlay = (config && config.overlay) || {};
    const profiles = Array.isArray(overlay.profiles) ? overlay.profiles : [];
    if (!profiles.length) {
      box.innerHTML = '<span class="field-hint">Noch keine Layouts gespeichert.</span>';
      return;
    }
    box.innerHTML = profiles
      .map(
        (profile) => `<div class="chip-order-row">
          <span class="name">${escapeHtml(profile.name)}</span>
          <span class="field-hint">${profile.width}×${profile.height} % · ${Math.round(profile.opacity * 100)} %</span>
          <button type="button" class="btn ghost small" data-profile-apply="${escapeHtml(profile.id)}">Anwenden</button>
          <button type="button" class="btn ghost small" data-profile-delete="${escapeHtml(profile.id)}" title="Layout löschen">×</button>
        </div>`
      )
      .join('');
  }

  function applyOverlayProfileFromSettings(profile) {
    if (!profile) return;
    setConfig({
      overlay: {
        width: profile.width,
        height: profile.height,
        opacity: profile.opacity,
        anchor: profile.anchor,
        monitor: profile.monitor,
        chipOrder: profile.chipOrder,
        showItems: profile.showItems
      }
    });
    const widthInput = qs('#overlayWidth');
    if (widthInput) widthInput.value = String(profile.width);
    const widthLabel = qs('#overlayWidthValue');
    if (widthLabel) widthLabel.textContent = `${profile.width} %`;
    const heightInput = qs('#overlayHeight');
    if (heightInput) heightInput.value = String(profile.height);
    const heightLabel = qs('#overlayHeightValue');
    if (heightLabel) heightLabel.textContent = `${profile.height} %`;
    const opacityInput = qs('#overlayOpacity');
    if (opacityInput) opacityInput.value = String(Math.round(profile.opacity * 100));
    const opacityLabel = qs('#overlayOpacityValue');
    if (opacityLabel) opacityLabel.textContent = `${Math.round(profile.opacity * 100)} %`;
    const anchorSelect = qs('#overlayAnchor');
    if (anchorSelect) anchorSelect.value = profile.anchor;
    const monitorSelect = qs('#overlayMonitor');
    if (monitorSelect) monitorSelect.value = String(profile.monitor);
    renderChipOrder({ overlay: { chipOrder: profile.chipOrder } });
    toast(`Layout „${profile.name}“ angewendet.`, 'success', 2000);
  }

  function refreshFields() {
    const config = cfg();
    qs('#overlayOpacity').value = Math.round(config.overlay.opacity * 100);
  qs('#overlayAutoHide').value = String(Number(config.overlay.autoHideSeconds) || 0);
  qs('#overlayActivityStatus').value = String(config.overlay.activityStatus || '');
  // Wochenplan laden
  const schedule = config.overlay.weeklySchedule || {};
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayIds = ['scheduleMon', 'scheduleTue', 'scheduleWed', 'scheduleThu', 'scheduleFri', 'scheduleSat', 'scheduleSun'];
  for (let i = 0; i < dayKeys.length; i += 1) {
    const input = qs(`#${dayIds[i]}`);
    if (input) input.value = String(schedule[dayKeys[i]] || '');
  }
    qs('#overlayWidth').value = config.overlay.width;
    qs('#overlayHeight').value = config.overlay.height;
    qs('#overlayScale').value = Math.round((Number(config.overlay.scale) || 1) * 100);
    qs('#overlayAnchor').value = config.overlay.anchor;
    qs('#overlayMonitor').value = String(config.overlay.monitor);
    qs('#gamepadEnabled').checked = config.gamepad.enabled !== false;
    qs('#gamepadHaptic').value = ['off', 'soft', 'standard', 'strong'].includes(String(config.gamepad.hapticProfile)) ? String(config.gamepad.hapticProfile) : 'standard';
    qs('#gamepadProfile').value = 'standard';
  const autoAreaInput = qs('#gamepadAutoArea');
  if (autoAreaInput) autoAreaInput.checked = Boolean(config.gamepad && config.gamepad.autoAreaProfile);
    qs('#gamepadControllerIndex').value = String(Number.isInteger(Number(config.gamepad.controllerIndex)) ? Number(config.gamepad.controllerIndex) : -1);
    qs('#gamepadQuickMenuButton').value = String(Math.round(Number(config.gamepad.quickMenuButton) || 0));
    const qmCfg = (config.gamepad && config.gamepad.quickMenu) || {};
    for (const select of qsa('#quickMenuConfig select[data-qm-scope]')) {
      const scope = select.dataset.qmScope;
      const direction = select.dataset.qmDirection;
      select.value = (qmCfg[scope] && qmCfg[scope][direction]) || 'close';
    }
    qs('#gamepadSpeed').value = config.gamepad.speed;
    qs('#gamepadDeadzone').value = Math.round(config.gamepad.deadzone * 100);
    const scrollSpeed = Math.round(Number(config.gamepad.scrollSpeed) || 980);
    const scrollDeadzone = Math.round((Number(config.gamepad.scrollDeadzone) || 0) * 100);
    qs('#gamepadScrollSpeed').value = String(scrollSpeed);
    qs('#gamepadScrollSpeedValue').textContent = String(scrollSpeed);
    qs('#gamepadScrollDeadzone').value = String(scrollDeadzone);
    qs('#gamepadScrollDeadzoneValue').textContent = scrollDeadzone > 0 ? `${scrollDeadzone} %` : 'global';
    qs('#gamepadScrollInvert').checked = config.gamepad.scrollInvert === true;
    qs('#gamepadCurve').value = config.gamepad.curve === 'linear' ? 'linear' : 'expo';
    qs('#gamepadLeftHanded').checked = config.gamepad.leftHanded === true;
    qs('#gamepadRumble').checked = config.gamepad.rumble !== false;
    qs('#gamepadGuideToggle').checked = config.gamepad.guideToggle !== false;
    qs('#gamepadInvertDpad').checked = config.gamepad.invertDpadScroll === true;
    qs('#gamepadToggleButton').value = String(Number(config.gamepad.toggleButton) || 0);
    qs('#gamepadStickFilter').value = String(Number(config.gamepad.stickFilter) || 0);
    qs('#gamepadSwapAxes').checked = config.gamepad.swapAxes === true;
    qs('#gamepadDetectBroken').checked = config.gamepad.detectBrokenAxis === true;
    qs('#gamepadDiagnostics').checked = config.gamepad.diagnostics === true;
    qs('#gamepadStickChoice').value = config.gamepad.stickChoice || 'left';
    const triggerLeftSelect = qs('#triggerLeftAction');
    if (triggerLeftSelect) triggerLeftSelect.value = config.gamepad.triggerLeft || 'scroll';
    const triggerRightSelect = qs('#triggerRightAction');
    if (triggerRightSelect) triggerRightSelect.value = config.gamepad.triggerRight || 'scroll';
    qs('#hapticSwitch').checked = config.gamepad.hapticSwitch === true;
    qs('#gamepadTriggerThreshold').value = Math.round((Number(config.gamepad.triggerThreshold) || 0.35) * 100);
    qs('#gamepadLongPress').checked = config.gamepad.toggleLongPressSettings !== false;
    qs('#gamepadCursorSnap').checked = config.gamepad.cursorSnap !== false;
    qs('#gamepadInvertX').checked = config.gamepad.invertX === true;
    qs('#gamepadInvertY').checked = config.gamepad.invertY === true;
    for (const action of BINDING_ACTIONS) {
      const select = qs(`#bind-${action.key}`);
      if (!select) continue;
      const bindings = config.gamepad.bindings || {};
      const value = Number(bindings[action.key]);
      select.value = String(Number.isInteger(value) ? value : -1);
    }
    qs('#gamepadXinput').checked = config.gamepad.xinput !== false;
    qs('#gamepadStealFocus').checked = config.gamepad.stealFocus !== false;
    qs('#webKeepAlive').value = String(config.web.keepAlive);
  const idleSelect = qs('#webIdleUnload');
  if (idleSelect) idleSelect.value = String(Number(config.web && config.web.idleUnloadMinutes) || 0);
    qs('#webZoom').value = Math.round(config.web.zoom * 100);
    qs('#webDark').checked = config.web.dark !== false;
    qs('#webReaderMode').checked = config.web.readerMode === true || config.behavior.readerMode === true;
    qs('#uiScale').value = Math.round((Number(config.appearance && config.appearance.uiScale) || 1) * 100);
  const fontScaleInput = qs('#fontScale');
  if (fontScaleInput) fontScaleInput.value = Math.round((Number(config.appearance && config.appearance.fontScale) || 1) * 100);
    refreshAutoRefreshControls();
    refreshSiteZoomControls();
    refreshSiteReaderControls();
    const notesFolderInput = qs('#notesFolderInput');
    if (notesFolderInput) notesFolderInput.value = String((config.overlay && config.overlay.notesFolder) || '');
    qs('#closeToTray').checked = config.behavior.closeToTray !== false;
    qs('#startMinimized').checked = config.behavior.startMinimized === true;
    qs('#startWithWindows').checked = config.behavior.startWithWindows === true;
    qs('#startDashboard').checked = config.behavior.startOnDashboard !== false;
    const startViewSelect = qs('#startView');
    if (startViewSelect) startViewSelect.value = (config.appearance && config.appearance.startView) || 'dashboard';
    const notif = (config && config.notifications) || {};
    qs('#notifyEnabled').checked = notif.enabled !== false;
    qs('#notifyPostmaster').checked = notif.postmaster !== false;
    qs('#notifyXur').checked = notif.xur !== false;
    qs('#notifyReset').checked = notif.reset !== false;
    qs('#notifyGodroll').checked = notif.godroll !== false;
    qs('#notifySuppressActivity').checked = notif.suppressDuringActivity !== false;
    qs('#notifyQuietStart').value = String(notif.quietStart || '23:00');
    qs('#notifyQuietEnd').value = String(notif.quietEnd || '07:00');
    const autoRestoreSessionInput = qs('#autoRestoreSession');
    if (autoRestoreSessionInput) autoRestoreSessionInput.checked = config.behavior.autoRestoreSession === true;
    const ctAutoResetSelect = qs('#clickThroughAutoReset');
    if (ctAutoResetSelect) ctAutoResetSelect.value = String(Math.round(Number(config.behavior.clickThroughAutoReset) || 0));
    const showItems = (config.overlay && config.overlay.showItems) || {};
    const minimalInput = qs('#ovShowMinimal');
    if (minimalInput) minimalInput.checked = config.overlay.minimal !== false;
    for (const [key, id] of [
      ['notes', 'ovShowNotes'], ['dashboard', 'ovShowDashboard'], ['loadouts', 'ovShowLoadouts'], ['lock', 'ovShowLock'],
      ['hide', 'ovShowHide'], ['exit', 'ovShowExit'],
      ['clock', 'ovShowClock'], ['session', 'ovShowSession'], ['activity', 'ovShowActivity'],
      ['battery', 'ovShowBattery'], ['bungie', 'ovShowBungie'], ['focus', 'ovShowFocus']
    ]) {
      const input = qs(`#${id}`);
      if (input) input.checked = showItems[key] !== false;
    }
    const steamInput = qs('#gamepadSteamInput');
    if (steamInput) steamInput.checked = config.gamepad && config.gamepad.steamInputMode === true;
    const focusGuard = qs('#gamepadFocusGuard');
    if (focusGuard) focusGuard.value = ['off', 'open', 'always'].includes(config.gamepad && config.gamepad.focusGuard) ? config.gamepad.focusGuard : 'always';
    const focusGrace = qs('#gamepadFocusGrace');
    if (focusGrace) focusGrace.value = String(Math.max(0, Math.min(5000, Number(config.gamepad && config.gamepad.focusGuardGraceMs) || 0)));
    const focusGraceValue = qs('#gamepadFocusGraceValue');
    if (focusGraceValue) focusGraceValue.textContent = `${(Math.max(0, Number(config.gamepad && config.gamepad.focusGuardGraceMs) || 0) / 1000).toFixed(1).replace('.', ',')} s`;
    const compactToggle = qs('#ovCompact');
    if (compactToggle) compactToggle.checked = Boolean(config.overlay && config.overlay.compact);
    const postmasterToggle = qs('#postmasterEnabled');
    if (postmasterToggle) {
      postmasterToggle.checked = Boolean(config.postmaster && config.postmaster.enabled);
    }
    const pm = config.postmaster || {};
    const pmOpacityInput = qs('#postmasterOpacity');
    if (pmOpacityInput) {
      const percent = Math.round((Number(pm.opacity) || 0.95) * 100);
      pmOpacityInput.value = String(percent);
      const label = qs('#postmasterOpacityValue');
      if (label) label.textContent = `${percent} %`;
    }
    for (const [key, id] of [['compact', 'postmasterCompact'], ['lock', 'postmasterLock'], ['autoGame', 'postmasterAutoGame'], ['inventoryOnly', 'postmasterInventoryOnly']]) {
      const input = qs(`#${id}`);
      if (input) input.checked = pm[key] === true;
    }
    const pmTheme = qs('#postmasterTheme');
    if (pmTheme) pmTheme.value = pm.theme === 'light' ? 'light' : 'dark';
    const pmRefresh = qs('#postmasterRefreshSeconds');
    if (pmRefresh) pmRefresh.value = String(Math.round(Number(pm.refreshSeconds) || 90));
    renderChipOrder(config);
    renderOverlayProfiles(config);
    const globalSiteHotkeys = qs('#globalSiteHotkeys');
    if (globalSiteHotkeys) globalSiteHotkeys.checked = config.behavior.globalSiteHotkeys === true;
    const weeklyGoalInput = qs('#weeklyGoalInput');
    if (weeklyGoalInput) weeklyGoalInput.value = String(Number((config.stats && config.stats.weeklyGoal) || 0) || 0);
    const bungieKey = qs('#bungieApiKey');
  const contentLanguageInput = qs('#contentLanguage');
  if (contentLanguageInput) contentLanguageInput.value = (config.bungie && config.bungie.contentLanguage) === 'en' ? 'en' : 'de';
    if (bungieKey) {
      bungieKey.value = '';
      const hasKeyStored = Boolean((config.bungie && config.bungie.apiKeyEnc) || (config.bungie && config.bungie.apiKey));
      bungieKey.placeholder = hasKeyStored ? 'API-Key gespeichert – leer lassen zum Beibehalten' : '32-stelliger Schlüssel';
      const keyState = qs('#bungieApiKeyState');
      if (keyState) keyState.textContent = hasKeyStored ? '✓ API-Key gespeichert (verschlüsselt).' : 'Kein API-Key gespeichert.';
    }
    const bungieClientId = qs('#bungieClientId');
    if (bungieClientId) bungieClientId.value = String((config.bungie && config.bungie.oauthClientId) || '');
    const bungieSecret = qs('#bungieClientSecret');
    if (bungieSecret) {
      bungieSecret.value = '';
      bungieSecret.placeholder = config.bungie && config.bungie.oauthClientSecretEnc
        ? 'Secret gespeichert – leer lassen zum Beibehalten'
        : 'Nur bei „Vertraulicher“ App – sonst leer lassen';
    }
    const bungieSecretState = qs('#bungieSecretState');
    if (bungieSecretState) {
      bungieSecretState.textContent = config.bungie && config.bungie.oauthClientSecretEnc
        ? '✓ Secret gespeichert.'
        : 'Kein Secret gespeichert.';
    }
    const bungieName = qs('#bungiePlayerName');
    if (bungieName) bungieName.value = String((config.bungie && config.bungie.playerName) || '');
    const bungieOrigin = qs('#bungieOrigin');
    if (bungieOrigin) bungieOrigin.value = String((config.bungie && config.bungie.origin) || '');
    const bungieWishlist = qs('#bungieWishlistUrl');
    if (bungieWishlist) bungieWishlist.value = String((config.bungie && config.bungie.wishlistUrl) || '');
    const godrollMode = qs('#bungieGodrollMode');
    if (godrollMode) godrollMode.value = String((config.bungie && config.bungie.godrollMode) || 'exact');
    qs('#autoOverlayOnGame').checked = config.behavior.autoOverlayOnGame === true;
    qs('#disableGpu').checked =
      config.behavior.disableGpu === true || config.behavior.disableGpuAuto === true;
    qs('#adBlock').checked = config.behavior.adBlock !== false;
    qs('#gameLaunchUrl').value = config.behavior.gameLaunchUrl;
    qs('#resetAlarm').checked = config.behavior.resetAlarm !== false;
    qs('#alarmSound').checked = config.behavior.alarmSound === true;
    const alarmSoundPathInput = qs('#alarmSoundPathInput');
    if (alarmSoundPathInput) alarmSoundPathInput.value = String(config.behavior.alarmSoundPath || '');
    qs('#lowPower').checked = config.behavior.lowPower === true;
    qs('#bindingHudToggle').checked = config.behavior.showBindingHud === true;
    const accent = config.appearance && config.appearance.accent ? String(config.appearance.accent) : '';
    const accentInput = qs('#accentColor');
    if (accentInput) {
      const cssAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      accentInput.value = /^#[0-9a-fA-F]{6}$/.test(accent)
        ? accent
        : (/^#[0-9a-fA-F]{6}$/.test(cssAccent) ? cssAccent : '#ff4655');
    }
    updateAccentSwatchActive(accent);
    refreshSiteDeadzones();
    updateRangeLabels();
    refreshHotkeyFields();
    updateComboDisplay();
  }

  function updateComboDisplay() {
    if (recordingCombo) return;
    comboInput.value = formatCombo(cfg().gamepad.combo);
  }

  function refreshCustomCategories() {
    const categories = getCategories();
    const previous = customCategory.value;
    customCategory.innerHTML = categories
      .map(
        (category) =>
          `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
      )
      .join('');
    customCategory.value = categories.some((category) => category.id === previous) ? previous : 'custom';
  }

  let editingCustomId = null;

  function renderCustomList() {
    const config = cfg();
    const categories = getCategories();
    const sites = Array.isArray(config.customSites) ? config.customSites : [];
    if (editingCustomId && !sites.some((site) => site.id === editingCustomId)) editingCustomId = null;
    if (!sites.length) {
      editingCustomId = null;
      customList.innerHTML = '<div class="custom-empty">Noch keine eigenen Seiten. Füge oben die erste hinzu.</div>';
      return;
    }
    customList.innerHTML = sites
      .map((site) => {
        const category = categories.find((entry) => entry.id === (site.category || 'custom'));
        if (editingCustomId === site.id) {
          const options = categories
            .map(
              (cat) =>
                `<option value="${escapeHtml(cat.id)}" ${cat.id === (site.category || 'custom') ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`
            )
            .join('');
          return `<div class="custom-item editing" data-custom-id="${escapeHtml(site.id)}">
            <div class="custom-item-main">
              <input data-custom-edit-name value="${escapeHtml(site.name)}" maxlength="80" placeholder="Name">
              <input data-custom-edit-url value="${escapeHtml(site.url)}" maxlength="2000" placeholder="https://…">
              <select data-custom-edit-category class="control">${options}</select>
            </div>
            <button class="btn primary small" data-custom-save="${escapeHtml(site.id)}">Speichern</button>
            <button class="btn ghost small" data-custom-cancel="1">Abbrechen</button>
          </div>`;
        }
        return `<div class="custom-item" data-custom-id="${escapeHtml(site.id)}">
          <div class="custom-item-main">
            <span class="custom-item-name">${escapeHtml(site.name)}</span>
            <span class="custom-item-url">${escapeHtml(site.url)}</span>
          </div>
          <span class="custom-category">${escapeHtml(category ? category.name : 'Eigene')}</span>
          <button class="icon-btn" data-custom-edit="${escapeHtml(site.id)}" title="Bearbeiten" aria-label="Bearbeiten">${'✎'}</button>
          <button class="icon-btn" data-remove-custom="${escapeHtml(site.id)}" title="Entfernen" aria-label="Entfernen">${'✕'}</button>
        </div>`;
      })
      .join('');
  }

  function saveCustomEdit(id) {
    const nameInput = qs(`[data-custom-edit-name]`);
    const urlInput = qs(`[data-custom-edit-url]`);
    const categorySelect = qs(`[data-custom-edit-category]`);
    if (!nameInput || !urlInput) return;
    const name = String(nameInput.value || '').trim();
    const url = normalizeUrl(urlInput.value);
    const category = categorySelect ? categorySelect.value : 'custom';
    if (!name) { toast('Bitte einen Namen angeben.', 'warning'); return; }
    if (!url) { toast('Bitte eine gültige Adresse angeben.', 'warning'); return; }
    const current = cfg().customSites || [];
    if (current.some((site) => site.url === url && site.id !== id)) {
      toast('Diese Adresse ist bereits in einer anderen Seite vorhanden.', 'warning');
      return;
    }
    const next = current.map((site) => (site.id === id ? { ...site, name: name.slice(0, 80), url, category } : site));
    setConfig({ customSites: next });
    editingCustomId = null;
    onCustomSitesChanged(next);
    toast('Eigene Seite aktualisiert.', 'success', 1600);
  }

  customList.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-custom-edit]');
    if (editButton) {
      editingCustomId = editButton.dataset.customEdit;
      renderCustomList();
      const input = qs('[data-custom-edit-name]');
      if (input) input.focus();
      return;
    }
    const saveButton = event.target.closest('[data-custom-save]');
    if (saveButton) {
      saveCustomEdit(saveButton.dataset.customSave);
      return;
    }
    const cancelButton = event.target.closest('[data-custom-cancel]');
    if (cancelButton) {
      editingCustomId = null;
      renderCustomList();
      return;
    }
    const removeButton = event.target.closest('[data-remove-custom]');
    if (removeButton) removeCustomSite(removeButton.dataset.removeCustom);
  });

  function updatePadStatus(status) {
    const connected = Boolean(status && status.connected);
    const line = qs('#gamepadStatus').closest('.controller-status-line');
    if (line) line.classList.toggle('connected', connected);
    qs('#gamepadStatus').textContent = connected
      ? `Verbunden: ${status.name || 'Controller'}`
      : 'Kein Controller verbunden. Schließe einen Controller an und drücke eine Taste.';
    if (!connected) {
      for (const cell of padCells) cell.classList.remove('on');
    }
    updateToggleHint(status);
  }

  // Der Guide-Knopf wird über XInputGetStateEx gelesen (so liest auch
  // Windows die Taste für die Game Bar) und zusätzlich über Raw Input.
  // Hier wird sichtbar gemacht, welche Tasten der Treiber erkennt.
  function updateToggleHint(status) {
    const hint = qs('#gamepadToggleHint');
    if (!hint) return;
    const labels = String((status && status.labels) || '').trim();
    const guide = Boolean(status && status.guideAvailable);
    const noisy = Array.isArray(status && status.noisyAxes) ? status.noisyAxes : [];
    const axisNames = { 0: 'Linker Stick X', 1: 'Linker Stick Y', 2: 'Rechter Stick X', 3: 'Rechter Stick Y' };

    const parts = [];
    if (labels && labels !== 'keine') parts.push(`Vom System gemeldete Tasten: ${labels}`);
    if (!guide) parts.push('Der Guide-Knopf ist über XInput und Raw Input nicht lesbar – bitte eine andere Einzeltaste wählen.');

    // Guide-Knopf-Status als farbigen Punkt direkt am Auswahl-
    // Feld anzeigen: grün = erkannt, rot = nicht lesbar.
    const guideStatus = qs('#gamepadGuideStatus');
    if (guideStatus) {
      const guideText = guideStatus.querySelector('.guide-text');
      guideStatus.classList.remove('hidden', 'ok', 'bad');
      if (guide) {
        guideStatus.classList.add('ok');
        if (guideText) guideText.textContent = 'Guide-Knopf erkannt – als Einzeltaste einsatzbereit';
      } else {
        guideStatus.classList.add('bad');
        if (guideText) guideText.textContent = 'Guide-Knopf nicht lesbar';
      }
    }
    if (noisy.length) {
      parts.push(`Defekte Achse erkannt und abgeschaltet: ${noisy.map((i) => axisNames[i] || i).join(', ')}.`);
    }
    if (status && status.triggersMirrorStick) {
      parts.push('L2/R2 werden von deinem Controller zusammen mit dem Stick ausgelöst – bitte „Digitaler Stick“ aktivieren.');
    }

    if (!parts.length) {
      hint.textContent = '';
      hint.classList.add('hidden');
      return;
    }
    hint.classList.remove('hidden');
    hint.textContent = parts.join(' ');
  }

  const padHistory = [];
  let lastPadPressed = [];
  function updatePadButtons(pressed) {
    for (let i = 0; i < 17; i += 1) {
      if (pressed && pressed[i] && !lastPadPressed[i]) {
        const label = (BUTTONS[i] && (BUTTONS[i].label || BUTTONS[i].alt)) || `Taste ${i}`;
        padHistory.unshift(`${new Date().toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${label}`);
        padHistory.splice(12);
        const historyEl = qs('#controllerTestHistory');
        if (historyEl) historyEl.textContent = padHistory.join('\n');
      }
    }
    lastPadPressed = Array.isArray(pressed) ? pressed.slice() : [];
    if (!padCells.length) return;
    for (let i = 0; i < padCells.length; i += 1) {
      padCells[i].classList.toggle('on', Boolean(pressed && pressed[i]));
    }
    // Das Controller-Test-Fenster bekommt dieselben Tastenzustände -
    // so reagiert sein Raster auch, wenn kein XInput-Snapshot mit
    // vollem Zustand hereinkommt (Browser-API-Pfad).
    for (let i = 0; i < 17; i += 1) {
      const el = testBtnEls[i];
      if (el) el.classList.toggle('on', Boolean(pressed && pressed[i]));
    }
  }

  function updateGameStatus(status) {
    if (!status) return;
    lastGame = status;
    const dot = qs('#behaviorGameDot');
    const text = qs('#behaviorGameStatus');
    if (dot) dot.classList.toggle('running', Boolean(status.running));
    if (text) {
      text.textContent = status.running
        ? 'Destiny 2 läuft. Das Overlay kann geöffnet werden.'
        : 'Destiny 2 wurde nicht gefunden. Das Spiel kann trotzdem manuell gestartet werden.';
    }
  }

  async function updateAbout() {
    qs('#aboutConfig').textContent = appInfo ? appInfo.configPath : '—';
    qs('#aboutVersion').textContent = appInfo ? appInfo.version : '—';
    qs('#aboutElectron').textContent = appInfo ? appInfo.electron : '—';
    qs('#aboutChrome').textContent = appInfo ? appInfo.chrome : '—';
    updateAboutHotkeys();
    qs('#webInfo').textContent = `Aktuell geladene Seiten: ${web ? web.count : 0}`;
  }

  async function refresh() {
    refreshFields();
    refreshCustomCategories();
    renderCustomList();
    await loadDisplays();
    refreshFields();
    renderReminders();
    refreshNotifyHistory().catch(() => {});
    updatePadStatus(controller && controller.isConnected()
      ? { connected: true, name: controller.getName() }
      : { connected: false, name: '' });
    updateGameStatus(lastGame);
    updateAbout();
    refreshBridgeStatus().catch(() => {});
  }

  function open(tab = 'overlay') {
    isOpen = true;
    document.body.classList.add('settings-open');
    setTab(['overlay', 'overlaybar', 'controller', 'steam', 'web', 'custom', 'display', 'behavior', 'security', 'bungie', 'diag', 'about'].includes(tab) ? tab : 'overlay');
    modalOpen(modal);
    if (settingsSearchInput) {
      settingsSearchInput.value = '';
      applySettingsSearch();
    }
    refresh();
    if (tab === 'steam') {
      refreshFocusPanel().catch(() => {});
      refreshControllerScan().catch(() => {});
    }
    api.getGameStatus().then(updateGameStatus).catch(() => {});
  }

  function close() {
    cancelRecording();
    cancelComboRecording();
    isOpen = false;
    document.body.classList.remove('settings-open');
    modalClose(modal);
  }

  function cancelRecording() {
    if (!recording) return;
    window.removeEventListener('keydown', recording.handler, true);
    recording.input.classList.remove('recording');
    recording = null;
    api.setHotkeysEnabled(true).catch(() => {});
    refreshHotkeyFields();
  }

  function startRecording(which, input) {
    cancelRecording();
    recording = { which, input, handler: null };
    api.setHotkeysEnabled(false).catch(() => {});
    input.classList.add('recording');
    input.value = 'Tasten drücken …';
    input.focus();

    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        cancelRecording();
        return;
      }
      const accelerator = toAccelerator(event);
      if (!accelerator) {
        if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) {
          toast('Bitte Strg, Alt oder Shift mitbenutzen.', 'warning');
        }
        return;
      }
      const target = recording;
      if (!target) return;
      window.removeEventListener('keydown', handler, true);
      target.input.classList.remove('recording');
      recording = null;
      target.input.value = formatAccelerator(accelerator);
      api
        .setHotkey(target.which, accelerator)
        .then(async (result) => {
          await api.setHotkeysEnabled(true);
          if (!result.ok) {
            toast(result.error || 'Das Kürzel konnte nicht gesetzt werden.', 'error');
            refreshHotkeyFields();
            return;
          }
          const label = target.which === 'hotkey' ? 'Overlay' : 'Maus durchlassen';
          toast(`${label}: ${formatAccelerator(accelerator)} gespeichert.`, 'success');
          refreshHotkeyFields();
          updateAboutHotkeys();
        })
        .catch(() => {
          toast('Das Kürzel konnte nicht gesetzt werden.', 'error');
          refreshHotkeyFields();
        });
    };

    recording.handler = handler;
    window.addEventListener('keydown', handler, true);
  }

  function setHotkeyInput(which, value) {
    api
      .setHotkey(which, value)
      .then((result) => {
        if (!result.ok) {
          toast(result.error || 'Das Kürzel ist belegt.', 'error');
        } else {
          setConfig({ [which]: value });
          toast(value ? `${formatAccelerator(value)} gespeichert.` : 'Tastenkürzel entfernt.', 'success');
        }
        refreshHotkeyFields();
      })
      .catch(() => toast('Das Kürzel konnte nicht gesetzt werden.', 'error'));
  }

  function comboLabels(ids) {
    return ids.map((index) => BUTTONS[index]?.label || String(index)).join(' + ');
  }

  function startComboRecording() {
    if (!controller) return;
    recordingCombo = true;
    controller.startCapture();
    comboInput.value = 'Tasten drücken …';
    qs('#gamepadRecordBtn').textContent = 'Warten …';
    qs('#gamepadRecordBtn').disabled = true;
    clearTimeout(comboFinishTimer);
    comboFinishTimer = setTimeout(finishComboRecording, 2600);
  }

  function onCaptureChanged(ids, labels) {
    if (!recordingCombo) return;
    comboInput.value = (labels && labels.length ? labels.join(' + ') : '…');
    clearTimeout(comboFinishTimer);
    if (ids && ids.length >= 3) {
      comboFinishTimer = setTimeout(finishComboRecording, 450);
    } else {
      comboFinishTimer = setTimeout(finishComboRecording, 1500);
    }
  }

  function finishComboRecording() {
    if (!recordingCombo) return;
    const ids = controller.getCaptured();
    controller.stopCapture();
    recordingCombo = false;
    clearTimeout(comboFinishTimer);
    qs('#gamepadRecordBtn').textContent = 'Aufnehmen';
    qs('#gamepadRecordBtn').disabled = false;

    if (!ids || ids.length < 2) {
      toast('Bitte mindestens zwei Controller-Tasten gleichzeitig drücken.', 'warning');
      updateComboDisplay();
      return;
    }
    setConfig({ gamepad: { combo: ids } });
    comboInput.value = comboLabels(ids);
    toast(`Controller-Kombo: ${comboLabels(ids)}`, 'success');
  }

  function cancelComboRecording() {
    if (!recordingCombo) return;
    recordingCombo = false;
    clearTimeout(comboFinishTimer);
    if (controller) controller.stopCapture();
    qs('#gamepadRecordBtn').textContent = 'Aufnehmen';
    qs('#gamepadRecordBtn').disabled = false;
    updateComboDisplay();
  }

  function addCustomSite() {
    const name = qs('#customName').value.trim();
    const url = normalizeUrl(qs('#customUrl').value);
    const category = customCategory.value || 'custom';
    if (!name) {
      toast('Bitte einen Namen angeben.', 'warning');
      qs('#customName').focus();
      return;
    }
    if (!url) {
      toast('Bitte eine gültige Adresse angeben (http oder https).', 'error');
      qs('#customUrl').focus();
      return;
    }
    const current = cfg().customSites || [];
    if (current.some((site) => site.url === url)) {
      toast('Diese Adresse ist bereits vorhanden.', 'warning');
      return;
    }
    const id = `c-${crypto.randomUUID()}`;
    const next = [...current, { id, name: name.slice(0, 80), url, category }];
    setConfig({ customSites: next });
    qs('#customName').value = '';
    qs('#customUrl').value = '';
    renderCustomList();
    refreshCustomCategories();
    if (onCustomSitesChanged) onCustomSitesChanged(next, { category, siteId: id });
    toast(`"${name}" hinzugefügt.`, 'success');
  }

  function removeCustomSite(id) {
    const site = (cfg().customSites || []).find((entry) => entry.id === id);
    if (!site) return;
    if (!window.confirm(`"${site.name}" wirklich entfernen?`)) return;
    const next = (cfg().customSites || []).filter((entry) => entry.id !== id);
    setConfig({ customSites: next });
    renderCustomList();
    refreshCustomCategories();
    if (onCustomSitesChanged) onCustomSitesChanged(next);
    toast('Eigene Seite entfernt.', 'info');
  }

  // ------------------------------------------------------------
  // Ereignisse
  // ------------------------------------------------------------

  for (const button of tabs) {
    button.addEventListener('click', () => setTab(button.dataset.settingsTab));
  }

  qsa('[data-close-settings]', modal).forEach((button) => button.addEventListener('click', close));
  qs('#settingsCloseBtn').addEventListener('click', close);

  qs('#hotkeyRecordBtn').addEventListener('click', () => startRecording('hotkey', hotkeyInput));
  qs('#clickThroughHotkeyRecordBtn').addEventListener('click', () => startRecording('clickThroughHotkey', clickThroughInput));
  qs('#hotkeyResetBtn').addEventListener('click', () => setHotkeyInput('hotkey', DEFAULT_HOTKEY));
  qs('#clickThroughHotkeyResetBtn').addEventListener('click', () => setHotkeyInput('clickThroughHotkey', DEFAULT_CLICK_THROUGH_HOTKEY));

  qs('#overlayOpacity').addEventListener('input', (event) => {
    const value = clamp(Number(event.target.value) / 100, 0.4, 1);
    qs('#overlayOpacityValue').textContent = `${event.target.value} %`;
    setConfig({ overlay: { opacity: value } });
  });
  qs('#overlayAutoHide').addEventListener('change', (event) => {
    setConfig({ overlay: { autoHideSeconds: Number(event.target.value) || 0 } });
  });
  qs('#overlayActivityStatus').addEventListener('change', (event) => {
    setConfig({ overlay: { activityStatus: String(event.target.value || '').slice(0, 40) } });
  });
  // Wochenplan speichern (bei jeder Änderung).
  const scheduleDayIds = ['scheduleMon', 'scheduleTue', 'scheduleWed', 'scheduleThu', 'scheduleFri', 'scheduleSat', 'scheduleSun'];
  const scheduleDayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (let i = 0; i < scheduleDayIds.length; i += 1) {
    const input = qs(`#${scheduleDayIds[i]}`);
    if (input) {
      input.addEventListener('change', () => {
        const cfg = getConfig();
        const schedule = { ...((cfg.overlay && cfg.overlay.weeklySchedule) || {}) };
        for (let j = 0; j < scheduleDayKeys.length; j += 1) {
          const el = qs(`#${scheduleDayIds[j]}`);
          if (el) schedule[scheduleDayKeys[j]] = String(el.value || '').slice(0, 30);
        }
        setConfig({ overlay: { weeklySchedule: schedule } });
      });
    }
  }
  qs('#overlayWidth').addEventListener('input', (event) => {
    qs('#overlayWidthValue').textContent = `${event.target.value} %`;
    setConfig({ overlay: { width: Number(event.target.value) } });
  });
  qs('#overlayHeight').addEventListener('input', (event) => {
    qs('#overlayHeightValue').textContent = `${event.target.value} %`;
    setConfig({ overlay: { height: Number(event.target.value) } });
  });
  qs('#overlayScale').addEventListener('input', (event) => {
    qs('#overlayScaleValue').textContent = `${event.target.value} %`;
    setConfig({ overlay: { scale: Number(event.target.value) / 100 } });
  });
  const overlayCalibration = {
    '1080p': { width: 88, height: 88, scale: 1, margin: 24 },
    '1440p': { width: 90, height: 90, scale: 1.1, margin: 28 },
    '4k': { width: 92, height: 92, scale: 1.25, margin: 32 },
    ultrawide: { width: 94, height: 80, scale: 1, margin: 20 }
  };
  for (const button of document.querySelectorAll('[data-overlay-calibrate]')) {
    button.addEventListener('click', () => {
      const preset = overlayCalibration[String(button.dataset.overlayCalibrate || '')];
      if (!preset) return;
      setConfig({ overlay: preset });
      qs('#overlayWidth').value = preset.width;
      qs('#overlayHeight').value = preset.height;
      qs('#overlayScale').value = Math.round(preset.scale * 100);
      qs('#overlayWidthValue').textContent = `${preset.width} %`;
      qs('#overlayHeightValue').textContent = `${preset.height} %`;
      qs('#overlayScaleValue').textContent = `${Math.round(preset.scale * 100)} %`;
      toast('Overlay-Kalibrierung angewendet.', 'success', 2200);
    });
  }
  qs('#overlayAnchor').addEventListener('change', (event) => setConfig({ overlay: { anchor: event.target.value } }));
  qs('#overlayMonitor').addEventListener('change', (event) => setConfig({ overlay: { monitor: Number(event.target.value) } }));
  qs('#overlayTestBtn').addEventListener('click', () => {
    close();
    api.enterOverlay().catch(() => toast('Overlay konnte nicht geöffnet werden.', 'error'));
  });
  qs('#overlayHideTestBtn').addEventListener('click', () => {
    close();
    api.hideOverlay().catch(() => {});
  });

  qs('#gamepadEnabled').addEventListener('change', (event) => setConfig({ gamepad: { enabled: event.target.checked } }));
  const hapticSelect = qs('#gamepadHaptic');
  if (hapticSelect) {
    hapticSelect.addEventListener('change', (event) => setConfig({ gamepad: { hapticProfile: String(event.target.value || 'standard') } }));
  }
  const exportControllerBtn = qs('#exportControllerConfig');
  if (exportControllerBtn) {
    exportControllerBtn.addEventListener('click', async () => {
      const data = getConfig().gamepad || {};
      const result = await api.copyToClipboard(JSON.stringify(data, null, 2)).catch(() => null);
      toast(result && result.ok ? 'Controller-Einstellungen kopiert.' : 'Kopieren fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2200);
    });
  }
  const importControllerBtn = qs('#importControllerConfig');
  if (importControllerBtn) {
    importControllerBtn.addEventListener('click', async () => {
      const text = String((await api.readClipboard()) || '').trim();
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('kein Objekt');
        setConfig({ gamepad: parsed });
        toast('Controller-Einstellungen übernommen.', 'success', 2600);
      } catch (error) {
        toast('Zwischenablage enthält keine gültigen Controller-Einstellungen.', 'error', 3000);
      }
    });
  }
  const checkBindingsBtn = qs('#checkBindingsBtn');
  if (checkBindingsBtn) {
    checkBindingsBtn.addEventListener('click', () => {
      const bindings = (getConfig().gamepad && getConfig().gamepad.bindings) || {};
      const used = new Map();
      const duplicates = [];
      for (const [action, index] of Object.entries(bindings)) {
        const value = Number(index);
        if (!Number.isInteger(value) || value < 0) continue;
        if (used.has(value)) duplicates.push(`${used.get(value)} + ${action}`);
        else used.set(value, action);
      }
      toast(duplicates.length ? `Doppelte Belegung: ${duplicates.join(', ')}` : 'Keine doppelten Controller-Belegungen.', duplicates.length ? 'warning' : 'success', 4200);
    });
  }
  const profileSelect = qs('#gamepadProfile');
  if (profileSelect) {
    profileSelect.addEventListener('change', (event) => {
      const presets = {
        standard: { speed: 900, deadzone: 0.2, scrollSpeed: 980, quickMenuButton: 11, hapticProfile: 'standard' },
        inventory: { speed: 650, deadzone: 0.15, scrollSpeed: 700, quickMenuButton: 11, hapticProfile: 'soft' },
        accessible: { speed: 500, deadzone: 0.28, scrollSpeed: 600, quickMenuButton: 0, hapticProfile: 'strong' }
      };
      const preset = presets[event.target.value] || presets.standard;
      setConfig({ gamepad: preset });
      toast(`Controller-Profil „${event.target.options[event.target.selectedIndex].text}“ angewendet.`, 'success', 2400);
    });
  }
  qs('#gamepadControllerIndex').addEventListener('change', (event) => {
    const index = Number(event.target.value);
    setConfig({ gamepad: { controllerIndex: index } });
    api.setGamepadControllerIndex?.(index).catch(() => {});
  });

  // ------------------------------------------------------------
  // Steam Input & Fokus
  // ------------------------------------------------------------
  const STEAM_MAPPING_TEXT = [
    'Steam Input – empfohlenes Overlay-Set',
    '',
    'D-Pad: Pfeiltasten',
    'A: Enter',
    'B: Escape',
    'LB/RB: Tab / Shift+Tab',
    'Linker Stick: Mauszeiger (optional)',
    'RT: Linksklick (optional)',
    'Guide + Back: Action Set Spiel <-> Overlay',
    '',
    'Im Overlay-Set alle normalen Gamepad-Aktionen entfernen.',
    'Sticks nicht als Joystick belegen, sonst steuert Destiny 2 weiter.'
  ].join('\n');

  async function setOverlayController(index) {
    const next = Number.isFinite(Number(index)) ? Number(index) : -1;
    setConfig({ gamepad: { controllerIndex: next } });
    const select = qs('#gamepadControllerIndex');
    if (select) select.value = String(next);
    try { await api.setGamepadControllerIndex?.(next); } catch (error) { /* egal */ }
    await refreshControllerScan();
    toast(next < 0 ? 'Overlay nutzt den ersten verbundenen Controller.' : `Overlay nutzt Controller ${next + 1}.`, 'success', 2200);
  }

  async function refreshControllerScan() {
    const list = qs('#controllerScanList');
    const hint = qs('#controllerScanHint');
    if (!list) return;
    let controllers = [];
    try {
      const result = await api.getGamepadControllers?.();
      if (result && result.ok && Array.isArray(result.controllers)) controllers = result.controllers;
    } catch (error) { /* Fallback unten */ }
    if (!controllers.length && navigator.getGamepads) {
      controllers = Array.from(navigator.getGamepads()).filter(Boolean).map((pad) => ({
        index: pad.index,
        connected: true,
        battery: 255,
        id: pad.id,
        mapping: pad.mapping
      }));
    }
    if (!controllers.length) {
      list.innerHTML = '<span class="inv-tool-muted">Keine Controller gefunden. XInput-Bridge prüfen oder Controller verbinden.</span>';
      if (hint) hint.textContent = 'Tipp: Destiny 2 nutzt meist Controller 1; für das Overlay Controller 2 wählen.';
      return;
    }
    const selected = Number((cfg().gamepad && cfg().gamepad.controllerIndex) ?? -1);
    list.innerHTML = controllers.map((controller) => {
      const index = Number(controller.index) || 0;
      const active = selected < 0 ? controller.active === true : selected === index;
      const battery = Number(controller.battery);
      const batteryText = Number.isFinite(battery) && battery >= 0 && battery <= 3
        ? ['leer', 'niedrig', 'mittel', 'voll'][battery]
        : 'Akku unbekannt';
      return `<div class="controller-scan-row${active ? ' active' : ''}">` +
        `<span class="controller-scan-index">${index + 1}</span>` +
        `<span class="controller-scan-copy"><strong>Controller ${index + 1}${controller.connected ? '' : ' (nicht verbunden)'}</strong>` +
        `<small>${escapeHtml(controller.id || 'XInput Controller')} · ${batteryText}</small></span>` +
        `<button type="button" class="btn ghost small" data-controller-set="${index}" ${controller.connected ? '' : 'disabled'}>${active ? 'Aktiv' : 'Als Overlay'}</button>` +
      `</div>`;
    }).join('');
    if (hint) {
      const connected = controllers.filter((controller) => controller.connected !== false);
      hint.textContent = connected.length > 1
        ? 'Mehrere Controller erkannt. Empfehlung: Spiel = Controller 1, Overlay = Controller 2. Controller 1 sollte nicht als Overlay gewählt werden.'
        : 'Nur ein Controller erkannt. Für getrennte Steuerung einen zweiten Controller anschließen oder Steam Input nutzen.';
    }
  }

  async function refreshFocusPanel() {
    const box = qs('#focusStateBox');
    if (!box) return;
    let state = null;
    try { state = await api.getFocusState?.(); } catch (error) { state = null; }
    if (!state) {
      box.className = 'focus-state-box';
      box.textContent = 'Fokus-Status nicht verfügbar.';
      return;
    }
    const clickThrough = state.clickThrough === true;
    const focused = state.focused === true && !clickThrough;
    const visible = state.visible === true;
    box.className = `focus-state-box ${clickThrough ? 'through' : focused ? 'ok' : visible ? 'warn' : ''}`;
    const pad = state.controller;
    const padText = pad && pad.connected
      ? `Controller ${pad.index + 1}${pad.battery >= 0 && pad.battery <= 3 ? ` · Akku ${['leer', 'niedrig', 'mittel', 'voll'][pad.battery]}` : ''}`
      : 'kein Controller';
    box.innerHTML =
      `<strong>${clickThrough ? 'Maus geht ans Spiel' : focused ? 'Overlay hat den Fokus' : visible ? 'Overlay sichtbar, aber nicht fokussiert' : 'Overlay nicht im Overlay-Modus'}</strong>` +
      `<span>Modus: ${escapeHtml(state.mode || '—')} · Fokus-Wächter: ${escapeHtml(state.focusGuard || '—')} · Karenz: ${Math.round(Number(state.graceMs) || 0)} ms</span>` +
      `<span>${state.gameRunning ? 'Destiny 2 läuft' : 'Destiny 2 nicht erkannt'} · Steam Input: ${state.steamInputMode ? 'aktiv' : 'aus'} · ${escapeHtml(padText)}</span>`;
    const admin = qs('#focusAdminHint');
    if (admin) {
      admin.textContent = state.elevatedKnown === false || state.elevated == null
        ? 'Administrator-Status wird geprüft …'
        : state.elevated
          ? 'Das Tool läuft als Administrator. Destiny 2 sollte ebenfalls als Administrator laufen, damit der Fokuswechsel zuverlässig klappt.'
          : 'Das Tool läuft normal. Läuft Destiny 2 als Administrator, kann Windows den Fokuswechsel blockieren – dann das Tool ebenfalls als Administrator starten.';
    }
  }

  const steamInputToggle = qs('#gamepadSteamInput');
  if (steamInputToggle) {
    steamInputToggle.addEventListener('change', (event) => {
      setConfig({ gamepad: { steamInputMode: event.target.checked } });
      toast(event.target.checked ? 'Steam-Input-Modus aktiviert.' : 'Steam-Input-Modus deaktiviert.', 'info', 1800);
    });
  }
  const focusGuardSelect = qs('#gamepadFocusGuard');
  if (focusGuardSelect) {
    focusGuardSelect.addEventListener('change', (event) => setConfig({ gamepad: { focusGuard: event.target.value } }));
  }
  const focusGraceRange = qs('#gamepadFocusGrace');
  if (focusGraceRange) {
    focusGraceRange.addEventListener('input', (event) => {
      const value = Math.max(0, Math.min(5000, Number(event.target.value) || 0));
      setConfig({ gamepad: { focusGuardGraceMs: value } });
      const label = qs('#gamepadFocusGraceValue');
      if (label) label.textContent = `${(value / 1000).toFixed(1).replace('.', ',')} s`;
    });
  }
  qs('#focusRefreshBtn')?.addEventListener('click', () => refreshFocusPanel());
  qs('#focusOverlayBtn')?.addEventListener('click', async () => {
    try {
      await api.focusOverlay?.();
      toast('Overlay fokussiert.', 'success', 1800);
    } catch (error) {
      toast('Fokus konnte nicht gesetzt werden.', 'error', 2200);
    }
    refreshFocusPanel();
  });
  qs('#focusClickThroughBtn')?.addEventListener('click', async () => {
    try { await api.toggleClickThrough?.(); } catch (error) { /* egal */ }
    refreshFocusPanel();
  });
  qs('#controllerScanBtn')?.addEventListener('click', () => refreshControllerScan());
  qs('#controllerAutoBtn')?.addEventListener('click', () => setOverlayController(-1));
  qs('#controllerControllerTabBtn')?.addEventListener('click', () => setTab('controller'));
  qs('#controllerScanList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-controller-set]');
    if (button) setOverlayController(Number(button.dataset.controllerSet));
  });
  qs('#steamMappingCopy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(STEAM_MAPPING_TEXT);
      toast('Steam-Input-Mapping kopiert.', 'success', 2200);
    } catch (error) {
      toast(STEAM_MAPPING_TEXT, 'info', 6000);
    }
  });
  refreshFocusPanel().catch(() => {});
  refreshControllerScan().catch(() => {});
  const gamepadAutoArea = qs('#gamepadAutoArea');
  if (gamepadAutoArea) gamepadAutoArea.addEventListener('change', (event) => setConfig({ gamepad: { autoAreaProfile: event.target.checked } }));
  qs('#gamepadQuickMenuButton').addEventListener('change', (event) => setConfig({ gamepad: { quickMenuButton: Number(event.target.value) } }));
  qs('#gamepadRumble').addEventListener('change', (event) => setConfig({ gamepad: { rumble: event.target.checked } }));
  qs('#gamepadGuideToggle').addEventListener('change', (event) => setConfig({ gamepad: { guideToggle: event.target.checked } }));
  qs('#gamepadInvertDpad').addEventListener('change', (event) => setConfig({ gamepad: { invertDpadScroll: event.target.checked } }));
  qs('#gamepadToggleButton').addEventListener('change', (event) => setConfig({ gamepad: { toggleButton: Number(event.target.value) || 0 } }));
  qs('#gamepadStickFilter').addEventListener('change', (event) => setConfig({ gamepad: { stickFilter: Number(event.target.value) || 0 } }));
  qs('#gamepadSwapAxes').addEventListener('change', (event) => setConfig({ gamepad: { swapAxes: event.target.checked } }));
  qs('#gamepadStickChoice').addEventListener('change', (event) => setConfig({ gamepad: { stickChoice: event.target.value } }));
  const triggerLeftListener = qs('#triggerLeftAction');
  if (triggerLeftListener) triggerLeftListener.addEventListener('change', (event) => setConfig({ gamepad: { triggerLeft: event.target.value } }));
  const triggerRightListener = qs('#triggerRightAction');
  if (triggerRightListener) triggerRightListener.addEventListener('change', (event) => setConfig({ gamepad: { triggerRight: event.target.value } }));
  const hapticSwitchListener = qs('#hapticSwitch');
  if (hapticSwitchListener) hapticSwitchListener.addEventListener('change', (event) => setConfig({ gamepad: { hapticSwitch: event.target.checked } }));
  qs('#gamepadDetectBroken').addEventListener('change', (event) => setConfig({ gamepad: { detectBrokenAxis: event.target.checked } }));
  qs('#gamepadDiagnostics').addEventListener('change', (event) => setConfig({ gamepad: { diagnostics: event.target.checked } }));
  qs('#gamepadInvertX').addEventListener('change', (event) => setConfig({ gamepad: { invertX: event.target.checked } }));
  qs('#gamepadInvertY').addEventListener('change', (event) => setConfig({ gamepad: { invertY: event.target.checked } }));
  qs('#gamepadCalibrateBtn').addEventListener('click', () => startCalibration());
  qs('#gamepadCalibrateResetBtn').addEventListener('click', () => resetCalibration());
  qs('#gamepadXinput').addEventListener('change', (event) => setConfig({ gamepad: { xinput: event.target.checked } }));
  qs('#gamepadStealFocus').addEventListener('change', (event) => setConfig({ gamepad: { stealFocus: event.target.checked } }));
  qs('#gamepadSpeed').addEventListener('input', (event) => {
    qs('#gamepadSpeedValue').textContent = event.target.value;
    setConfig({ gamepad: { speed: Number(event.target.value) } });
  });
  qs('#gamepadDeadzone').addEventListener('input', (event) => {
    qs('#gamepadDeadzoneValue').textContent = `${event.target.value} %`;
    setConfig({ gamepad: { deadzone: Number(event.target.value) / 100 } });
  });
  qs('#gamepadScrollSpeed').addEventListener('input', (event) => {
    qs('#gamepadScrollSpeedValue').textContent = event.target.value;
    setConfig({ gamepad: { scrollSpeed: Number(event.target.value) } });
  });
  qs('#gamepadScrollDeadzone').addEventListener('input', (event) => {
    const value = Number(event.target.value) || 0;
    qs('#gamepadScrollDeadzoneValue').textContent = value > 0 ? `${value} %` : 'global';
    setConfig({ gamepad: { scrollDeadzone: value / 100 } });
  });
  qs('#gamepadScrollInvert').addEventListener('change', (event) => setConfig({ gamepad: { scrollInvert: event.target.checked } }));
  qs('#gamepadCurve').addEventListener('change', (event) => setConfig({ gamepad: { curve: event.target.value } }));
  qs('#gamepadLeftHanded').addEventListener('change', (event) => setConfig({ gamepad: { leftHanded: event.target.checked } }));
  qs('#gamepadRecordBtn').addEventListener('click', startComboRecording);
  qs('#gamepadResetBtn').addEventListener('click', () => {
    cancelComboRecording();
    setConfig({ gamepad: { combo: DEFAULT_COMBO } });
    comboInput.value = formatCombo(DEFAULT_COMBO);
    toast('Controller-Kombo zurückgesetzt: L3 + R3.', 'success');
  });

  qs('#webKeepAlive').addEventListener('change', (event) => setConfig({ web: { keepAlive: Number(event.target.value) } }));
  const idleUnloadSelect = qs('#webIdleUnload');
  if (idleUnloadSelect) {
    idleUnloadSelect.addEventListener('change', (event) => setConfig({ web: { idleUnloadMinutes: Number(event.target.value) || 0 } }));
  }
  const memoryBtn = qs('#webMemoryBtn');
  if (memoryBtn) {
    memoryBtn.addEventListener('click', () => {
      const list = qs('#webMemoryList');
      if (!list || !api || typeof api.webviewsMemory !== 'function') return;
      list.textContent = 'Lade …';
      api.webviewsMemory().then((result) => {
        if (!result || !result.ok) { list.textContent = (result && result.error) || 'Nicht verfügbar.'; return; }
        if (!result.items.length) { list.textContent = 'Keine Seiten geladen.'; return; }
        list.innerHTML = result.items.map((entry) =>
          '<div class="inv-tool-row"><span class="inv-tool-main">' + escapeHtml(entry.url || 'Seite') + '</span>' +
          '<span class="inv-tool-meta">' + entry.memoryMB + ' MB</span></div>'
        ).join('') + '<div class="inv-tool-muted">Gesamt: ' + result.totalMB + ' MB</div>';
      }).catch((error) => { list.textContent = error.message || String(error); });
    });
  }
  qs('#webZoom').addEventListener('input', (event) => {
    qs('#webZoomValue').textContent = `${event.target.value} %`;
    setConfig({ web: { zoom: Number(event.target.value) / 100 } });
    if (web) web.applyZoom();
  });
  qs('#webDark').addEventListener('change', (event) => setConfig({ web: { dark: event.target.checked } }));
  qs('#webReaderMode').addEventListener('change', (event) => {
    setConfig({ web: { readerMode: event.target.checked }, behavior: { readerMode: event.target.checked } });
    if (web && web.applyReaderMode) web.applyReaderMode();
  });
  qs('#unloadAllBtn').addEventListener('click', () => {
    if (!web) return;
    web.unloadAll();
    if (onReloadCurrentSite) onReloadCurrentSite();
    toast('Alle Webseiten entladen.', 'info');
    qs('#webInfo').textContent = 'Aktuell geladene Seiten: 0';
  });
  qs('#clearWebDataBtn').addEventListener('click', async () => {
    if (!window.confirm('Cookies und Anmeldungen aller Webseiten löschen? Das Tool selbst bleibt unberührt.')) return;
    const result = await api.clearWebData();
    if (!result || !result.ok) {
      toast(result && result.error ? result.error : 'Daten konnten nicht gelöscht werden.', 'error');
      return;
    }
    if (web) web.unloadAll();
    if (onReloadCurrentSite) onReloadCurrentSite();
    toast('Website-Daten gelöscht.', 'success');
  });

  qs('#customAddBtn').addEventListener('click', addCustomSite);
  qs('#customName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addCustomSite();
  });
  qs('#customUrl').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addCustomSite();
  });

  qs('#closeToTray').addEventListener('change', (event) => setConfig({ behavior: { closeToTray: event.target.checked } }));
  qs('#startDashboard').addEventListener('change', (event) => setConfig({ behavior: { startOnDashboard: event.target.checked } }));
  const startViewListener = qs('#startView');
  if (startViewListener) {
    startViewListener.addEventListener('change', (event) => setConfig({ appearance: { startView: String(event.target.value || 'dashboard') } }));
  }
  for (const [id, key] of [
    ['notifyEnabled', 'enabled'], ['notifyPostmaster', 'postmaster'], ['notifyXur', 'xur'],
    ['notifyReset', 'reset'], ['notifyGodroll', 'godroll'], ['notifySuppressActivity', 'suppressDuringActivity']
  ]) {
    const input = qs(`#${id}`);
    if (input) input.addEventListener('change', (event) => setConfig({ notifications: { [key]: event.target.checked } }));
  }
  for (const [id, key] of [['notifyQuietStart', 'quietStart'], ['notifyQuietEnd', 'quietEnd']]) {
    const input = qs(`#${id}`);
    if (input) input.addEventListener('change', (event) => setConfig({ notifications: { [key]: String(event.target.value || '') } }));
  }
  qs('#autoRestoreSession').addEventListener('change', (event) => setConfig({ behavior: { autoRestoreSession: event.target.checked } }));
  const ctAutoResetListener = qs('#clickThroughAutoReset');
  if (ctAutoResetListener) ctAutoResetListener.addEventListener('change', (event) => setConfig({ behavior: { clickThroughAutoReset: Number(event.target.value) || 0 } }));
  qs('#startMinimized').addEventListener('change', (event) => setConfig({ behavior: { startMinimized: event.target.checked } }));
  qs('#autoOverlayOnGame').addEventListener('change', (event) => setConfig({ behavior: { autoOverlayOnGame: event.target.checked } }));
  // Manuelles Umschalten setzt die automatische Absturz-Erkennung zurück,
  // damit der Nutzer die Entscheidung wieder in der Hand hat.
  qs('#disableGpu').addEventListener('change', (event) =>
    setConfig({
      behavior: {
        disableGpu: event.target.checked,
        disableGpuAuto: false,
        gpuCrashCount: 0
      }
    })
  );
  qs('#openCrashLogBtn').addEventListener('click', () => api.openCrashLogFolder());
  qs('#startWithWindows').addEventListener('change', (event) => setConfig({ behavior: { startWithWindows: event.target.checked } }));
  qs('#adBlock').addEventListener('change', (event) => setConfig({ behavior: { adBlock: event.target.checked } }));
  qs('#gameLaunchUrl').addEventListener('change', (event) => {
    const value = event.target.value.trim();
    if (!/^(steam:|https?:\/\/|com\.epicgames\.launcher:)/i.test(value)) {
      toast('Bitte eine gültige Start-Adresse angeben.', 'warning');
      event.target.value = cfg().behavior.gameLaunchUrl;
      return;
    }
    setConfig({ behavior: { gameLaunchUrl: value } });
  });
  qs('#launchGameBtn').addEventListener('click', async () => {
    const result = await api.launchGame();
    if (!result || !result.ok) toast((result && result.error) || 'Spiel konnte nicht gestartet werden.', 'error');
  });
  qs('#openConfigFolderBtn').addEventListener('click', () => api.openConfigFolder());
  qs('#exportConfigBtn').addEventListener('click', async () => {
    const result = await api.exportConfig();
    if (result && result.ok) toast(`Konfiguration exportiert: ${result.path}`, 'success');
    else if (result && !result.canceled) toast((result && result.error) || 'Export fehlgeschlagen.', 'error');
  });
  qs('#importConfigBtn').addEventListener('click', async () => {
    const result = await api.importConfig();
    if (result && result.ok) {
      refresh();
      toast('Konfiguration importiert.', 'success');
    } else if (result && !result.canceled) {
      toast((result && result.error) || 'Import fehlgeschlagen.', 'error');
    }
  });
  const exportEncryptedBtn = qs('#exportEncryptedBtn');
  if (exportEncryptedBtn) {
    exportEncryptedBtn.addEventListener('click', async () => {
      const password = window.prompt('Passwort für das verschlüsselte Backup (mind. 4 Zeichen):');
      if (!password) return;
      const result = await api.exportConfigEncrypted(password);
      if (result && result.ok) toast(`Backup exportiert: ${result.path}`, 'success', 3000);
      else if (result && !result.canceled) toast((result && result.error) || 'Backup fehlgeschlagen.', 'error');
    });
  }
  const importEncryptedBtn = qs('#importEncryptedBtn');
  if (importEncryptedBtn) {
    importEncryptedBtn.addEventListener('click', async () => {
      const password = window.prompt('Passwort des verschlüsselten Backups:');
      if (!password) return;
      const result = await api.importConfigEncrypted(password);
      if (result && result.ok) {
        refresh();
        toast('Backup importiert. Bitte die App neu starten.', 'success', 4000);
      } else if (result && !result.canceled) {
        toast((result && result.error) || 'Backup-Import fehlgeschlagen.', 'error', 4000);
      }
    });
  }
  async function refreshSecurity() {
    const status = await api.securityStatus().catch(() => null);
    const line = qs('#securityStatus');
    const readOnly = qs('#readOnlyMode');
    if (readOnly) readOnly.checked = Boolean(status && status.readOnly);
    const autoLock = qs('#securityAutoLock');
    if (autoLock) autoLock.value = Number(status && status.autoLockMinutes) || 0;
    if (line) line.textContent = status && status.pinSet ? 'PIN gesetzt – beim Start wird entsperrt.' : 'Kein PIN gesetzt.';
  }
  refreshSecurity();
  const readOnlyInput = qs('#readOnlyMode');
  if (readOnlyInput) {
    readOnlyInput.addEventListener('change', async (event) => {
      const result = await api.securitySetReadOnly(event.target.checked === true).catch(() => null);
      if (!result || !result.ok) toast('Read-only-Modus konnte nicht gesetzt werden.', 'error');
    });
  }
  const setPinBtn = qs('#setPinBtn');
  if (setPinBtn) {
    setPinBtn.addEventListener('click', async () => {
      const pin = window.prompt('Neue PIN (4–12 Ziffern):');
      if (!pin) return;
      const result = await api.securitySetPin(pin).catch(() => null);
      if (result && result.ok) {
        toast('PIN gesetzt.', 'success');
        refreshSecurity();
      } else {
        toast((result && result.error) || 'PIN konnte nicht gesetzt werden.', 'error');
      }
    });
  }
  const clearPinBtn = qs('#clearPinBtn');
  if (clearPinBtn) {
    clearPinBtn.addEventListener('click', async () => {
      const result = await api.securitySetPin('').catch(() => null);
      if (result && result.ok) {
        toast('PIN entfernt.', 'success');
        refreshSecurity();
      }
    });
  }
  const scrubBackupsBtn = qs('#scrubBackupsBtn');
  if (scrubBackupsBtn) {
    scrubBackupsBtn.addEventListener('click', async () => {
      const result = await api.securityScrubBackups().catch(() => null);
      if (result && result.ok) toast(`Backups bereinigt: ${Number(result.files) || 0} Datei(en).`, 'success', 3000);
      else toast((result && result.error) || 'Backups konnten nicht bereinigt werden.', 'error', 3000);
    });
  }
  const securityAutoLock = qs('#securityAutoLock');
  if (securityAutoLock) {
    securityAutoLock.addEventListener('change', async () => {
      const result = await api.securitySetAutoLock(Number(securityAutoLock.value) || 0).catch(() => null);
      if (result && result.ok) toast(result.autoLockMinutes ? `Automatische Sperre: ${result.autoLockMinutes} Min.` : 'Automatische Sperre aus.', 'success', 2200);
      else toast('Automatische Sperre konnte nicht gespeichert werden.', 'error');
    });
  }
  // Lokale Stream-Deck-API + Discord-Webhook
  let integrationState = null;
  function tokenScopeLabel(scope) {
    return scope === 'admin' ? 'Admin' : scope === 'read' ? 'Nur lesen' : 'Aktionen';
  }

  async function refreshTokens() {
    const host = qs('#tokenList');
    if (!host) return;
    const result = await api.integrationsTokens().catch(() => null);
    host.innerHTML = '';
    if (!result || !result.ok) {
      const line = document.createElement('p');
      line.className = 'field-hint';
      line.textContent = 'Tokens konnten nicht geladen werden.';
      host.appendChild(line);
      return;
    }
    for (const token of result.tokens || []) {
      const row = document.createElement('div');
      row.className = 'token-row';
      const name = document.createElement('span');
      name.className = 'token-name';
      name.textContent = token.name || token.id;
      const scope = document.createElement('span');
      scope.className = 'token-scope';
      scope.textContent = tokenScopeLabel(token.scope);
      const meta = document.createElement('span');
      meta.className = 'token-meta';
      const expires = token.expiresAt ? `bis ${new Date(token.expiresAt).toLocaleDateString('de-DE')}` : 'unbegrenzt';
      const used = token.lastUsedAt ? `zuletzt ${new Date(token.lastUsedAt).toLocaleString('de-DE')}` : 'noch nicht benutzt';
      meta.textContent = `${token.prefix ? `${token.prefix}… · ` : ''}${expires} · ${used}`;
      row.appendChild(name);
      row.appendChild(scope);
      row.appendChild(meta);
      if (token.id !== 'primary' && token.id !== 'read-only') {
        const revoke = document.createElement('button');
        revoke.className = 'btn ghost';
        revoke.textContent = 'Widerrufen';
        revoke.addEventListener('click', async () => {
          const removed = await api.integrationsRevokeToken(token.id).catch(() => null);
          if (removed && removed.ok) {
            toast('Token widerrufen.', 'success', 2000);
            refreshTokens();
          } else {
            toast((removed && removed.error) || 'Token konnte nicht widerrufen werden.', 'error');
          }
        });
        row.appendChild(revoke);
      }
      host.appendChild(row);
    }
  }

  async function refreshIntegrations() {
    const status = await api.integrationsStatus().catch(() => null);
    integrationState = status;
    if (!status) return;
    const enabled = qs('#localApiEnabled');
    if (enabled) enabled.checked = Boolean(status.enabled);
    const lan = qs('#localApiLan');
    if (lan) lan.checked = Boolean(status.lan);
    const port = qs('#localApiPort');
    if (port) port.value = Number(status.port) || 7331;
    const origins = qs('#localApiOrigins');
    if (origins) origins.value = (Array.isArray(status.allowedOrigins) ? status.allowedOrigins : []).join(', ');
    const allowQuery = qs('#localApiAllowQuery');
    if (allowQuery) allowQuery.checked = status.allowQueryToken !== false;
    const rateLimitInput = qs('#localApiRateLimit');
    if (rateLimitInput) rateLimitInput.value = Number(status.rateLimit) || 120;
    const requireHmac = qs('#localApiRequireHmac');
    if (requireHmac) requireHmac.checked = status.requireLanHmac === true;
    const lanIps = qs('#localApiLanIps');
    if (lanIps) lanIps.value = (Array.isArray(status.lanIpAllowlist) ? status.lanIpAllowlist : []).join(', ');
    const webhookEnabled = qs('#webhookEnabled');
    if (webhookEnabled) webhookEnabled.checked = status.webhookEnabled === true;
    const webhookUrl = qs('#webhookUrl');
    if (webhookUrl) webhookUrl.value = status.webhookUrl || '';
    const webhookEvents = qs('#webhookEvents');
    if (webhookEvents) webhookEvents.value = (Array.isArray(status.webhookEvents) ? status.webhookEvents : []).join(', ');
    const line = qs('#localApiStatus');
    const qr = qs('#localApiQr');
    if (qr) {
      if (status.enabled) {
        const base = status.lan ? (status.lanUrl || status.url) : status.url;
        const target = status.readOnlyToken ? `${base}/?token=${status.readOnlyToken}` : `${base}/`;
        const qrResult = await api.integrationsQr(target).catch(() => null);
        if (qrResult && qrResult.ok && qrResult.dataUrl) {
          qr.src = qrResult.dataUrl;
          qr.classList.remove('hidden');
          qr.alt = status.readOnlyToken ? 'QR-Code für Nur-Lese-Zugriff' : 'QR-Code für die lokale API ohne Token';
        } else {
          qr.classList.add('hidden');
          qr.removeAttribute('src');
        }
      } else {
        qr.classList.add('hidden');
        qr.removeAttribute('src');
      }
    }
    if (line) {
      line.textContent = !status.enabled
        ? 'Lokale API ist aus.'
        : status.running
          ? `Läuft auf ${status.url} · Schreib-Token: vorhanden · Nur-Lese-Token: ${status.hasReadOnlyToken ? 'vorhanden' : 'fehlt'}`
          : `Start fehlgeschlagen: ${status.error || 'unbekannt'}`;
    }
    refreshTokens();
  }
  refreshIntegrations();
  const saveIntegrationsBtn = qs('#saveIntegrationsBtn');
  if (saveIntegrationsBtn) {
    saveIntegrationsBtn.addEventListener('click', async () => {
      const enabledInput = qs('#localApiEnabled');
      const portInput = qs('#localApiPort');
      const webhookInput = qs('#discordWebhook');
      const payload = {
        localApiEnabled: enabledInput ? enabledInput.checked === true : false,
        lan: qs('#localApiLan') ? qs('#localApiLan').checked === true : false,
        port: Number(portInput && portInput.value) || 7331,
        allowedOrigins: String(qs('#localApiOrigins') && qs('#localApiOrigins').value || '')
          .split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 20),
        allowQueryToken: qs('#localApiAllowQuery') ? qs('#localApiAllowQuery').checked === true : true,
        rateLimit: Number(qs('#localApiRateLimit') && qs('#localApiRateLimit').value) || 120,
        requireLanHmac: qs('#localApiRequireHmac') ? qs('#localApiRequireHmac').checked === true : false,
        lanIpAllowlist: String(qs('#localApiLanIps') && qs('#localApiLanIps').value || '')
          .split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 20),
        webhookEnabled: qs('#webhookEnabled') ? qs('#webhookEnabled').checked === true : false,
        webhookUrl: String(qs('#webhookUrl') && qs('#webhookUrl').value || '').trim(),
        webhookEvents: String(qs('#webhookEvents') && qs('#webhookEvents').value || 'notification')
          .split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 5)
      };
      const webhookSecret = String(qs('#webhookSecret') && qs('#webhookSecret').value || '').trim();
      if (webhookSecret) payload.webhookSecret = webhookSecret;
      if (webhookInput && String(webhookInput.value || '').trim()) payload.discordWebhook = String(webhookInput.value).trim();
      const result = await api.integrationsConfigure(payload).catch(() => null);
      if (result && result.ok) {
        toast(result.running ? 'Lokale API läuft.' : 'Integrationen gespeichert.', 'success', 2400);
        refreshIntegrations();
      } else {
        toast((result && result.error) || 'Integrationen konnten nicht gespeichert werden.', 'error', 3000);
      }
    });
  }
  const rotateTokenBtn = qs('#rotateTokenBtn');
  if (rotateTokenBtn) {
    rotateTokenBtn.addEventListener('click', async () => {
      const result = await api.integrationsRotateToken().catch(() => null);
      if (result && result.ok) {
        toast('Neuer API-Token erzeugt.', 'success', 2400);
        refreshIntegrations();
      } else {
        toast((result && result.error) || 'Token konnte nicht erneuert werden.', 'error', 2600);
      }
    });
  }
  const rotateReadTokenBtn = qs('#rotateReadTokenBtn');
  if (rotateReadTokenBtn) {
    rotateReadTokenBtn.addEventListener('click', async () => {
      const result = await api.integrationsRotateReadToken?.().catch(() => null);
      if (result && result.ok) {
        toast('Neuer Nur-Lese-Token erzeugt.', 'success', 2400);
        refreshIntegrations();
      } else {
        toast((result && result.error) || 'Nur-Lese-Token konnte nicht erneuert werden.', 'error', 2600);
      }
    });
  }
  const copyReadOnlyApiBtn = qs('#copyReadOnlyApiBtn');
  if (copyReadOnlyApiBtn) {
    copyReadOnlyApiBtn.addEventListener('click', async () => {
      if (!integrationState || !integrationState.readOnlyToken) {
        toast('Erst einen Nur-Lese-Token erzeugen.', 'info', 2200);
        return;
      }
      const url = `${integrationState.url}/state?token=${integrationState.readOnlyToken}`;
      copySensitive(url, 'Nur-Lese-URL kopiert.');
    });
  }
  const createTokenBtn = qs('#createTokenBtn');
  if (createTokenBtn) {
    createTokenBtn.addEventListener('click', async () => {
      const name = String((qs('#tokenName') && qs('#tokenName').value) || '').trim();
      const scope = String((qs('#tokenScope') && qs('#tokenScope').value) || 'action');
      const days = Number((qs('#tokenDays') && qs('#tokenDays').value) || 0);
      const result = await api.integrationsCreateToken({ name, scope, days }).catch(() => null);
      if (!result || !result.ok) {
        toast((result && result.error) || 'Token konnte nicht erzeugt werden.', 'error');
        return;
      }
      const target = qs('#tokenCreated');
      if (target) {
        target.textContent = '';
        const label = document.createElement('span');
        label.textContent = 'Neuer Token (nur jetzt sichtbar): ';
        const code = document.createElement('code');
        code.textContent = result.token;
        const copy = document.createElement('button');
        copy.className = 'btn ghost';
        copy.textContent = 'Kopieren';
        copy.addEventListener('click', () => copySensitive(result.token, 'Token kopiert.'));
        target.appendChild(label);
        target.appendChild(code);
        target.appendChild(copy);
      }
      refreshTokens();
    });
  }

  const apiConsoleSend = qs('#apiConsoleSend');
  if (apiConsoleSend) {
    const sendConsoleRequest = async () => {
      const out = qs('#apiConsoleOut');
      const path = String((qs('#apiConsolePath') && qs('#apiConsolePath').value) || '').trim();
      const method = String((qs('#apiConsoleMethod') && qs('#apiConsoleMethod').value) || 'GET');
      let body = null;
      if (method !== 'GET') {
        const raw = String((qs('#apiConsoleBody') && qs('#apiConsoleBody').value) || '').trim();
        if (raw) {
          try { body = JSON.parse(raw); } catch (error) {
            if (out) out.textContent = 'JSON-Body ist ungültig.';
            return;
          }
        }
      }
      if (out) out.textContent = 'Sende …';
      const result = await api.integrationsApiRequest({ path, method, body }).catch(() => null);
      if (!result) { if (out) out.textContent = 'IPC-Fehler.'; return; }
      if (out) {
        out.textContent = result.ok
          ? `HTTP ${result.status}\n${JSON.stringify(result.body, null, 2)}`
          : `HTTP ${result.status || '—'} · ${result.error || (result.body && result.body.error) || 'Fehler'}\n${JSON.stringify(result.body || null, null, 2)}`;
      }
    };
    apiConsoleSend.addEventListener('click', sendConsoleRequest);
    for (const button of document.querySelectorAll('[data-api-preset]')) {
      button.addEventListener('click', () => {
        const path = String(button.dataset.apiPreset || '');
        if (qs('#apiConsolePath')) qs('#apiConsolePath').value = path;
        if (qs('#apiConsoleMethod')) qs('#apiConsoleMethod').value = 'GET';
        sendConsoleRequest();
      });
    }
  }

  const copyStreamDeckSetupBtn = qs('#copyStreamDeckSetupBtn');
  if (copyStreamDeckSetupBtn) {
    copyStreamDeckSetupBtn.addEventListener('click', async () => {
      const status = await api.integrationsStatus().catch(() => null);
      if (!status || !status.token) {
        toast('Lokale API ist nicht aktiv.', 'info', 2400);
        return;
      }
      const setup = [
        `API-URL: ${status.url}`,
        `Token: ${status.token}`,
        status.readOnlyToken ? `Nur-Lese-Token: ${status.readOnlyToken}` : '',
        'Plugin: dist/com.freakitout.d2tool.streamDeckPlugin',
        'Header: X-D2-Token'
      ].filter(Boolean).join('\n');
      copySensitive(setup, 'Stream-Deck-Einrichtung kopiert.');
      if (qs('#streamDeckSetupStatus')) qs('#streamDeckSetupStatus').textContent = 'Einrichtung kopiert.';
    });
  }

  const copySignedUrlBtn = qs('#copySignedUrlBtn');
  if (copySignedUrlBtn) {
    copySignedUrlBtn.addEventListener('click', async () => {
      const path = String((qs('#signedUrlPath') && qs('#signedUrlPath').value) || '/state').trim();
      const result = await api.integrationsSignedUrl({ path, seconds: 86400 }).catch(() => null);
      if (!result || !result.ok) {
        toast((result && result.error) || 'Signierte URL konnte nicht erzeugt werden.', 'error', 3000);
        return;
      }
      copySensitive(result.url, 'Signierte URL kopiert (24 h).');
      if (qs('#signedUrlStatus')) qs('#signedUrlStatus').textContent = result.url;
    });
  }

  const testWebhookBtn = qs('#testWebhookBtn');
  if (testWebhookBtn) {
    testWebhookBtn.addEventListener('click', async () => {
      const payload = {
        webhookEnabled: qs('#webhookEnabled') ? qs('#webhookEnabled').checked === true : false,
        webhookUrl: String(qs('#webhookUrl') && qs('#webhookUrl').value || '').trim(),
        webhookEvents: String(qs('#webhookEvents') && qs('#webhookEvents').value || 'notification')
          .split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 5)
      };
      const secret = String(qs('#webhookSecret') && qs('#webhookSecret').value || '').trim();
      if (secret) payload.webhookSecret = secret;
      await api.integrationsConfigure(payload).catch(() => null);
      const result = await api.integrationsTestWebhook().catch(() => null);
      if (result && result.ok) toast('Webhook-Test gesendet.', 'success', 2600);
      else toast((result && result.error) || 'Webhook-Test fehlgeschlagen.', 'error', 3200);
      refreshIntegrations();
    });
  }
  const copyLocalApiBtn = qs('#copyLocalApiBtn');
  if (copyLocalApiBtn) {
    copyLocalApiBtn.addEventListener('click', async () => {
      if (!integrationState || !integrationState.token) {
        toast('Erst die lokale API aktivieren.', 'info', 2200);
        return;
      }
      const url = `${integrationState.url}/status?token=${integrationState.token}`;
      copySensitive(url, 'API-URL mit Token kopiert.');
    });
  }
  const testDiscordBtn = qs('#testDiscordBtn');
  if (testDiscordBtn) {
    testDiscordBtn.addEventListener('click', async () => {
      const webhookInput = qs('#discordWebhook');
      if (webhookInput && String(webhookInput.value || '').trim()) {
        await api.integrationsConfigure({
          localApiEnabled: Boolean(integrationState && integrationState.enabled),
          port: Number(integrationState && integrationState.port) || 7331,
          discordWebhook: String(webhookInput.value).trim()
        }).catch(() => null);
      }
      const result = await api.integrationsTestDiscord('Testnachricht aus Destiny 2 Tool by FreakItOut.').catch(() => null);
      if (result && result.ok) toast('Discord-Testnachricht gesendet.', 'success', 2600);
      else toast((result && result.error) || 'Discord-Test fehlgeschlagen.', 'error', 3200);
    });
  }
  qs('#exportDiagBtn').addEventListener('click', async () => {
    const result = await api.exportDiagnostics();
    if (result && result.ok) toast(`Diagnose exportiert: ${result.path}`, 'success');
    else if (result && !result.canceled) toast((result && result.error) || 'Export fehlgeschlagen.', 'error');
  });
  qs('#refreshGameBtn').addEventListener('click', async () => {
    const running = await api.refreshGameStatus();
    updateGameStatus({ running: Boolean(running) });
    toast(running ? 'Destiny 2 läuft.' : 'Destiny 2 wurde nicht gefunden.', running ? 'success' : 'info');
  });

  // Startwerte
  refresh();
  api.getAppInfo().then((info) => {
    appInfo = info;
    updateAbout();
    updateAboutHotkeys();
  }).catch(() => {});
  api.getGameStatus().then(updateGameStatus).catch(() => {});

  // ------------------------------------------------------------
  // Akzentfarbe
  // ------------------------------------------------------------

  const ACCENT_PRESETS = ['#ff4655', '#ff7a45', '#f0c66b', '#67e0a3', '#ff7088'];

  function updateAccentSwatchActive(accent) {
    const container = qs('#accentPresets');
    if (!container) return;
    for (const button of qsa('.accent-swatch', container)) {
      button.classList.toggle('active', button.dataset.accent === accent);
    }
  }

  function buildAccentPresets() {
    const container = qs('#accentPresets');
    if (!container) return;
    container.innerHTML = ACCENT_PRESETS.map(
      (color) =>
        `<button class="accent-swatch" data-accent="${color}" style="background:${color}" title="Akzentfarbe ${color}" aria-label="Akzentfarbe ${color}"></button>`
    ).join('');
    for (const button of qsa('.accent-swatch', container)) {
      button.addEventListener('click', () => {
        setConfig({ appearance: { accent: button.dataset.accent } });
        updateAccentSwatchActive(button.dataset.accent);
        toast('Akzentfarbe übernommen.', 'success', 1400);
      });
    }
  }
  buildAccentPresets();

  const accentColorInput = qs('#accentColor');
  if (accentColorInput) {
    accentColorInput.addEventListener('input', (event) => {
      const value = String(event.target.value || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        setConfig({ appearance: { accent: value } });
        updateAccentSwatchActive(value);
      }
    });
  }
  const accentResetBtn = qs('#accentResetBtn');
  if (accentResetBtn) {
    accentResetBtn.addEventListener('click', () => {
      setConfig({ appearance: { accent: '' } });
      updateAccentSwatchActive('');
      toast('Akzentfarbe zurückgesetzt (Markenfarbe).', 'info', 1600);
    });
  }

  // ------------------------------------------------------------
  // Reset-Alarm & Low-Power
  // ------------------------------------------------------------

  qs('#resetAlarm').addEventListener('change', (event) => setConfig({ behavior: { resetAlarm: event.target.checked } }));
  qs('#alarmSound').addEventListener('change', (event) => setConfig({ behavior: { alarmSound: event.target.checked } }));
  qs('#alarmSoundSelectBtn').addEventListener('click', async () => {
    const result = await api.selectAlarmSound();
    if (result && result.ok) {
      const input = qs('#alarmSoundPathInput');
      if (input) input.value = result.path || '';
      toast('Alarm-Sound gesetzt.', 'success', 1600);
    } else if (result && !result.canceled) {
      toast((result && result.error) || 'Sound konnte nicht gesetzt werden.', 'error');
    }
  });
  qs('#alarmSoundClearBtn').addEventListener('click', async () => {
    await api.clearAlarmSound();
    const input = qs('#alarmSoundPathInput');
    if (input) input.value = '';
    toast('Standard-Beep wieder aktiv.', 'info', 1600);
  });
  qs('#lowPower').addEventListener('change', (event) => setConfig({ behavior: { lowPower: event.target.checked } }));
  qs('#globalSiteHotkeys').addEventListener('change', (event) => setConfig({ behavior: { globalSiteHotkeys: event.target.checked } }));
  for (const [key, id] of [
    ['notes', 'ovShowNotes'], ['dashboard', 'ovShowDashboard'], ['loadouts', 'ovShowLoadouts'], ['lock', 'ovShowLock'],
    ['hide', 'ovShowHide'], ['exit', 'ovShowExit'],
    ['clock', 'ovShowClock'], ['session', 'ovShowSession'], ['activity', 'ovShowActivity'],
    ['battery', 'ovShowBattery'], ['bungie', 'ovShowBungie'], ['focus', 'ovShowFocus']
  ]) {
    const input = qs(`#${id}`);
    if (input) {
      input.addEventListener('change', (event) => setConfig({ overlay: { showItems: { [key]: event.target.checked } } }));
    }
  }
  const minimalToggle = qs('#ovShowMinimal');
  if (minimalToggle) minimalToggle.addEventListener('change', (event) => setConfig({ overlay: { minimal: event.target.checked === true } }));
  const compactToggle = qs('#ovCompact');
  if (compactToggle) compactToggle.addEventListener('change', (event) => setConfig({ overlay: { compact: event.target.checked } }));

  // ------------------------------------------------------------
  // Poststellen-Zähler (eigenes Mini-Fenster)
  // ------------------------------------------------------------

  const postmasterToggle = qs('#postmasterEnabled');
  if (postmasterToggle) {
    postmasterToggle.addEventListener('change', async (event) => {
      const enabled = event.target.checked;
      postmasterToggle.disabled = true;
      try {
        const result = await api.postmasterSetEnabled(enabled);
        if (!result || result.ok === false) {
          postmasterToggle.checked = !enabled;
          toast((result && result.error) || 'Poststellen-Zähler konnte nicht geändert werden.', 'error');
        } else {
          toast(enabled ? 'Poststellen-Zähler eingeblendet.' : 'Poststellen-Zähler ausgeblendet.', 'info', 1600);
        }
      } catch (error) {
        postmasterToggle.checked = !enabled;
        toast('Poststellen-Zähler konnte nicht geändert werden.', 'error');
      } finally {
        postmasterToggle.disabled = false;
      }
    });
  }

  const postmasterRefreshBtn = qs('#postmasterRefreshBtn');
  if (postmasterRefreshBtn) {
    postmasterRefreshBtn.addEventListener('click', async () => {
      postmasterRefreshBtn.disabled = true;
      try {
        const result = await api.postmasterRefresh();
        if (result && result.ok) toast('Poststellen-Zähler aktualisiert.', 'success', 1600);
        else toast((result && result.error) || 'Poststelle konnte nicht geladen werden.', 'error', 2600);
      } catch (error) {
        toast('Poststelle konnte nicht geladen werden.', 'error', 2600);
      } finally {
        postmasterRefreshBtn.disabled = false;
      }
    });
  }

  // Darstellung des Zählers: Deckkraft, Kompakt, Position sperren,
  // automatisch nur bei laufendem Spiel.
  for (const [key, id] of [['compact', 'postmasterCompact'], ['lock', 'postmasterLock'], ['autoGame', 'postmasterAutoGame'], ['inventoryOnly', 'postmasterInventoryOnly']]) {
    const input = qs(`#${id}`);
    if (input) input.addEventListener('change', (event) => setConfig({ postmaster: { [key]: event.target.checked } }));
  }
  const pmThemeInput = qs('#postmasterTheme');
  if (pmThemeInput) pmThemeInput.addEventListener('change', (event) => setConfig({ postmaster: { theme: event.target.value === 'light' ? 'light' : 'dark' } }));
  const pmRefreshInput = qs('#postmasterRefreshSeconds');
  if (pmRefreshInput) pmRefreshInput.addEventListener('change', (event) => setConfig({ postmaster: { refreshSeconds: Math.round(Number(event.target.value) || 90) } }));
  const pmOpacityInput = qs('#postmasterOpacity');
  if (pmOpacityInput) {
    pmOpacityInput.addEventListener('input', () => {
      const percent = Number(pmOpacityInput.value) || 95;
      const label = qs('#postmasterOpacityValue');
      if (label) label.textContent = `${percent} %`;
    });
    pmOpacityInput.addEventListener('change', () => {
      const percent = Math.max(40, Math.min(100, Number(pmOpacityInput.value) || 95));
      setConfig({ postmaster: { opacity: percent / 100 } });
    });
  }

  // Chip-Reihenfolge: Hoch/Runter.
  const chipOrderBox = qs('#overlayChipOrder');
  if (chipOrderBox) {
    chipOrderBox.addEventListener('click', (event) => {
      const up = event.target.closest('[data-chip-up]');
      const down = event.target.closest('[data-chip-down]');
      if (up) moveChip(String(up.dataset.chipUp || ''), -1);
      if (down) moveChip(String(down.dataset.chipDown || ''), 1);
    });
  }

  // Overlay-Layout-Profile: speichern, anwenden, löschen.
  const overlayProfileSave = qs('#overlayProfileSave');
  if (overlayProfileSave) {
    overlayProfileSave.addEventListener('click', () => {
      const current = cfg().overlay || {};
      const nameInput = qs('#overlayProfileName');
      const profiles = Array.isArray(current.profiles) ? current.profiles : [];
      const name = String((nameInput && nameInput.value) || '').trim() || `Layout ${profiles.length + 1}`;
      const profile = {
        id: `lay-${Date.now().toString(36)}`,
        name: name.slice(0, 30),
        width: current.width,
        height: current.height,
        opacity: current.opacity,
        anchor: current.anchor,
        monitor: current.monitor,
        chipOrder: current.chipOrder,
        showItems: current.showItems
      };
      const next = profiles.concat([profile]).slice(-8);
      setConfig({ overlay: { profiles: next } });
      if (nameInput) nameInput.value = '';
      renderOverlayProfiles({ overlay: { profiles: next } });
      toast('Overlay-Layout gespeichert.', 'success', 1800);
    });
  }
  const overlayProfileList = qs('#overlayProfileList');
  if (overlayProfileList) {
    overlayProfileList.addEventListener('click', (event) => {
      const applyBtn = event.target.closest('[data-profile-apply]');
      const deleteBtn = event.target.closest('[data-profile-delete]');
      const profiles = (cfg().overlay && cfg().overlay.profiles) || [];
      if (applyBtn) {
        const id = String(applyBtn.dataset.profileApply || '');
        applyOverlayProfileFromSettings(profiles.find((profile) => profile.id === id));
        return;
      }
      if (deleteBtn) {
        const id = String(deleteBtn.dataset.profileDelete || '');
        const next = profiles.filter((profile) => profile.id !== id);
        setConfig({ overlay: { profiles: next } });
        renderOverlayProfiles({ overlay: { profiles: next } });
        toast('Overlay-Layout gelöscht.', 'info', 1600);
      }
    });
  }

  // Zusätzliche globale Kürzel (Zähler/Inventar).
  const postmasterHotkeyField = qs('#postmasterHotkeyInput');
  if (postmasterHotkeyField) {
    postmasterHotkeyField.addEventListener('change', async () => {
      const value = String(postmasterHotkeyField.value || '').trim();
      try {
        const result = await api.setHotkey('postmasterHotkey', value);
        if (!result || !result.ok) {
          toast((result && result.error) || 'Kürzel konnte nicht gesetzt werden.', 'error');
          refreshHotkeyFields();
          return;
        }
        setConfig({ postmasterHotkey: value });
        postmasterHotkeyField.value = formatAccelerator(value);
        toast('Kürzel für den Poststellen-Zähler gespeichert.', 'success', 1800);
      } catch (error) {
        toast('Kürzel konnte nicht gesetzt werden.', 'error');
        refreshHotkeyFields();
      }
    });
  }
  const inventoryHotkeyField = qs('#inventoryHotkeyInput');
  if (inventoryHotkeyField) {
    inventoryHotkeyField.addEventListener('change', async () => {
      const value = String(inventoryHotkeyField.value || '').trim();
      try {
        const result = await api.setHotkey('inventoryHotkey', value);
        if (!result || !result.ok) {
          toast((result && result.error) || 'Kürzel konnte nicht gesetzt werden.', 'error');
          refreshHotkeyFields();
          return;
        }
        setConfig({ inventoryHotkey: value });
        inventoryHotkeyField.value = formatAccelerator(value);
        toast('Kürzel für das Inventar gespeichert.', 'success', 1800);
      } catch (error) {
        toast('Kürzel konnte nicht gesetzt werden.', 'error');
        refreshHotkeyFields();
      }
    });
  }
  const postmasterHotkeyReset = qs('#postmasterHotkeyResetBtn');
  if (postmasterHotkeyReset) postmasterHotkeyReset.addEventListener('click', () => setHotkeyInput('postmasterHotkey', 'Alt+P'));
  const inventoryHotkeyReset = qs('#inventoryHotkeyResetBtn');
  if (inventoryHotkeyReset) inventoryHotkeyReset.addEventListener('click', () => setHotkeyInput('inventoryHotkey', 'Alt+I'));

  // Bungie-Verbindungs-Check (Einrichtungs-Assistent).
  const bungieCheckBtn = qs('#bungieCheckBtn');
  if (bungieCheckBtn) {
    bungieCheckBtn.addEventListener('click', async () => {
      const box = qs('#bungieCheckResult');
      if (box) box.innerHTML = '<div class="field-hint">Prüfe Verbindung …</div>';
      bungieCheckBtn.disabled = true;
      try {
        const result = await api.bungieConnectionCheck();
        if (!box) return;
        if (!result || !result.ok) {
          box.innerHTML = '<div class="bungie-check-row fail"><span class="state">✗</span><span>Prüfung fehlgeschlagen.</span></div>';
          return;
        }
        box.innerHTML = (result.steps || [])
          .map((step) => {
            const mark = step.state === 'ok' ? '✓' : step.state === 'warn' ? '!' : '✗';
            return `<div class="bungie-check-row ${escapeHtml(step.state || 'warn')}"><span class="state">${mark}</span><span><strong>${escapeHtml(step.label)}:</strong> <span class="hint">${escapeHtml(step.hint)}</span></span></div>`;
          })
          .join('');
      } catch (error) {
        if (box) box.innerHTML = `<div class="bungie-check-row fail"><span class="state">✗</span><span>${escapeHtml(error.message || String(error))}</span></div>`;
      } finally {
        bungieCheckBtn.disabled = false;
      }
    });
  }

  const postmasterResetPosBtn = qs('#postmasterResetPosBtn');
  if (postmasterResetPosBtn) {
    postmasterResetPosBtn.addEventListener('click', async () => {
      try {
        await api.postmasterResetBounds();
        toast('Position des Poststellen-Zählers zurückgesetzt.', 'info', 1600);
      } catch (error) {
        toast('Position konnte nicht zurückgesetzt werden.', 'error');
      }
    });
  }
  qs('#alarmTestBtn').addEventListener('click', async () => {
    await api.testAlarm();
    toast('Test-Alarm gesendet.', 'info', 2000);
  });

  // ------------------------------------------------------------
  // Tasten-Legende (HUD) Schalter
  // ------------------------------------------------------------

  qs('#bindingHudToggle').addEventListener('change', (event) =>
    setConfig({ behavior: { showBindingHud: event.target.checked } })
  );

  // ------------------------------------------------------------
  // Deadzone pro Webseite
  // ------------------------------------------------------------

  function allKnownSites() {
    const list = [];
    for (const category of getCategories()) {
      for (const site of category.sites) {
        if (!list.some((entry) => entry.id === site.id)) list.push({ id: site.id, name: site.name, category: category.name });
      }
    }
    return list;
  }

  function refreshSiteDeadzones() {
    const select = qs('#siteDeadzoneSelect');
    const input = qs('#siteDeadzoneValue');
    if (!select) return;
    const sites = allKnownSites();
    const previous = select.value;
    select.innerHTML = sites
      .map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.category)} · ${escapeHtml(site.name)}</option>`)
      .join('');
    if (sites.some((site) => site.id === previous)) select.value = previous;
    updateSiteDeadzoneInput();
  }

  function updateSiteDeadzoneInput() {
    const select = qs('#siteDeadzoneSelect');
    const input = qs('#siteDeadzoneValue');
    if (!select || !input) return;
    const map = (cfg().gamepad && cfg().gamepad.siteDeadzones) || {};
    const value = map[select.value];
    if (Number.isFinite(Number(value))) {
      input.value = String(Math.round(Number(value) * 100));
      input.placeholder = '';
    } else {
      input.value = '';
      input.placeholder = `${Math.round((cfg().gamepad.deadzone || 0.2) * 100)}`;
    }
  }

  const siteDeadzoneSelect = qs('#siteDeadzoneSelect');
  if (siteDeadzoneSelect) {
    siteDeadzoneSelect.addEventListener('change', updateSiteDeadzoneInput);
    const input = qs('#siteDeadzoneValue');
    input.addEventListener('change', () => {
      const raw = String(input.value || '').trim();
      const map = { ...((cfg().gamepad && cfg().gamepad.siteDeadzones) || {}) };
      if (!raw) {
        delete map[siteDeadzoneSelect.value];
        setConfig({ gamepad: { siteDeadzones: map } });
        toast('Diese Seite nutzt wieder die globale Deadzone.', 'info', 1600);
        return;
      }
      const percent = clamp(Number(raw) || 20, 5, 60);
      input.value = String(Math.round(percent));
      map[siteDeadzoneSelect.value] = percent / 100;
      setConfig({ gamepad: { siteDeadzones: map } });
      toast(`Deadzone für diese Seite: ${Math.round(percent)} %.`, 'success', 1600);
    });
    qs('#siteDeadzoneResetBtn').addEventListener('click', () => {
      const map = { ...((cfg().gamepad && cfg().gamepad.siteDeadzones) || {}) };
      delete map[siteDeadzoneSelect.value];
      setConfig({ gamepad: { siteDeadzones: map } });
      const input = qs('#siteDeadzoneValue');
      input.value = '';
      updateSiteDeadzoneInput();
      toast('Deadzone-Override entfernt (global).', 'info', 1600);
    });
  }

  // ------------------------------------------------------------
  // Trigger-Schwellwert & Overlay-Taste mit Zweifunktion
  // ------------------------------------------------------------

  qs('#gamepadTriggerThreshold').addEventListener('input', (event) => {
    qs('#gamepadTriggerThresholdValue').textContent = `${event.target.value} %`;
    setConfig({ gamepad: { triggerThreshold: Number(event.target.value) / 100 } });
  });
  qs('#gamepadLongPress').addEventListener('change', (event) =>
    setConfig({ gamepad: { toggleLongPressSettings: event.target.checked } })
  );
  qs('#gamepadCursorSnap').addEventListener('change', (event) =>
    setConfig({ gamepad: { cursorSnap: event.target.checked } })
  );

  // ------------------------------------------------------------
  // Auto-Refresh pro Webseite
  // ------------------------------------------------------------

  function allKnownSitesFlat() {
    const list = [];
    for (const category of getCategories()) {
      for (const site of category.sites) {
        if (!list.some((entry) => entry.id === site.id)) list.push({ id: site.id, name: site.name, category: category.name });
      }
    }
    return list;
  }

  function refreshAutoRefreshControls() {
    const select = qs('#autoRefreshSelect');
    const minutes = qs('#autoRefreshMinutes');
    if (!select || !minutes) return;
    const sites = allKnownSitesFlat();
    const previous = select.value;
    select.innerHTML = sites
      .map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.category)} · ${escapeHtml(site.name)}</option>`)
      .join('');
    if (sites.some((site) => site.id === previous)) select.value = previous;
    const map = (cfg().web && cfg().web.autoRefresh) || {};
    const value = Number(map[select.value]) || 0;
    minutes.value = String(value);
  }

  const autoRefreshSelect = qs('#autoRefreshSelect');
  if (autoRefreshSelect) {
    autoRefreshSelect.addEventListener('change', () => {
      const map = { ...((cfg().web && cfg().web.autoRefresh) || {}) };
      const minutes = qs('#autoRefreshMinutes');
      map[autoRefreshSelect.value] = Number(minutes.value) || 0;
      setConfig({ web: { autoRefresh: map } });
    });
    qs('#autoRefreshMinutes').addEventListener('change', () => {
      const map = { ...((cfg().web && cfg().web.autoRefresh) || {}) };
      map[autoRefreshSelect.value] = Number(qs('#autoRefreshMinutes').value) || 0;
      setConfig({ web: { autoRefresh: map } });
    });
  }

  // ------------------------------------------------------------
  // Oberflächen-Zoom
  // ------------------------------------------------------------

  qs('#uiScale').addEventListener('input', (event) => {
    qs('#uiScaleValue').textContent = `${event.target.value} %`;
    setConfig({ appearance: { uiScale: Number(event.target.value) / 100 } });
  });
  const fontScaleListener = qs('#fontScale');
  if (fontScaleListener) {
    fontScaleListener.addEventListener('input', (event) => {
      setConfig({ appearance: { fontScale: Number(event.target.value) / 100 } });
    });
  }
  const colorblindInput = qs('#colorblindMode');
  if (colorblindInput) {
    colorblindInput.addEventListener('change', (event) => {
      setConfig({ appearance: { colorblind: event.target.checked === true } });
      document.body.classList.toggle('colorblind', event.target.checked === true);
    });
  }
  const uiLanguageSelect = qs('#uiLanguage');
  if (uiLanguageSelect) {
    uiLanguageSelect.addEventListener('change', (event) => {
      const value = String(event.target.value) === 'en' ? 'en' : 'de';
      setConfig({ appearance: { uiLanguage: value } });
      if (window.i18n) window.i18n.setLanguage(value);
    });
  }
  const highContrastInput = qs('#highContrastMode');
  if (highContrastInput) {
    highContrastInput.addEventListener('change', (event) => {
      setConfig({ appearance: { highContrast: event.target.checked === true } });
      document.body.classList.toggle('high-contrast', event.target.checked === true);
    });
  }
  const reduceMotionInput = qs('#reduceMotionMode');
  if (reduceMotionInput) {
    reduceMotionInput.addEventListener('change', (event) => {
      setConfig({ appearance: { reduceMotion: event.target.checked === true } });
      document.body.classList.toggle('reduce-motion', event.target.checked === true);
    });
  }
  const simpleModeInput = qs('#simpleModeMode');
  if (simpleModeInput) {
    simpleModeInput.addEventListener('change', (event) => {
      setConfig({ appearance: { simpleMode: event.target.checked === true } });
      document.body.classList.toggle('simple-mode', event.target.checked === true);
    });
  }
  const backupFolderBtn = qs('#backupFolderBtn');
  if (backupFolderBtn) {
    backupFolderBtn.addEventListener('click', () => {
      if (!api || typeof api.backupSetFolder !== 'function') return;
      api.backupSetFolder().then((result) => {
        if (!result || !result.ok) return;
        if (backupFolderBtn) backupFolderBtn.dataset.folder = result.folder || '';
        const input = qs('#backupFolderInput');
        if (input) input.value = result.folder || '';
        toast('Backup-Ordner gesetzt.', 'success', 2400);
      }).catch((error) => toast(error.message || String(error), 'error', 2400));
    });
  }
  const backupFolderClearBtn = qs('#backupFolderClearBtn');
  if (backupFolderClearBtn) {
    backupFolderClearBtn.addEventListener('click', () => {
      if (!api || typeof api.backupClearFolder !== 'function') return;
      api.backupClearFolder().then(() => {
        const input = qs('#backupFolderInput');
        if (input) input.value = '';
        toast('Backup-Ordner zurückgesetzt.', 'info', 2200);
      }).catch((error) => toast(error.message || String(error), 'error', 2400));
    });
  }
  const backupKeep = qs('#backupKeep');
  if (backupKeep) {
    backupKeep.addEventListener('change', () => {
      setConfig({ backups: { keep: Number(backupKeep.value) || 8 } });
    });
  }
  const saveCleanupSchedule = () => {
    const enabled = Boolean(qs('#cleanupScheduleEnabled') && qs('#cleanupScheduleEnabled').checked);
    const weekday = Number(qs('#cleanupScheduleWeekday') && qs('#cleanupScheduleWeekday').value) || 0;
    const time = String((qs('#cleanupScheduleTime') && qs('#cleanupScheduleTime').value) || '19:00');
    setConfig({ behavior: { cleanupSchedule: { enabled, weekday, time, lastRun: '' } } });
  };
  for (const id of ['#cleanupScheduleEnabled', '#cleanupScheduleWeekday', '#cleanupScheduleTime']) {
    const element = qs(id);
    if (element) element.addEventListener('change', saveCleanupSchedule);
  }
  const logLevelInput = qs('#logLevel');
  if (logLevelInput) {
    logLevelInput.addEventListener('change', (event) => {
      setConfig({ behavior: { logLevel: String(event.target.value || 'info') } });
    });
  }
  const notifyTtsInput = qs('#notifyTts');
  if (notifyTtsInput) {
    notifyTtsInput.addEventListener('change', (event) => {
      setConfig({ notifications: { tts: event.target.checked === true } });
      window.__d2TtsEnabled = event.target.checked === true;
    });
  }
  const solidUiInput = qs('#solidUiMode');
  if (solidUiInput) {
    solidUiInput.addEventListener('change', (event) => {
      setConfig({ appearance: { solidUi: event.target.checked === true } });
      document.body.classList.toggle('solid-ui', event.target.checked === true);
    });
  }
  const dyslexiaInput = qs('#dyslexiaMode');
  if (dyslexiaInput) {
    dyslexiaInput.addEventListener('change', (event) => {
      setConfig({ appearance: { dyslexia: event.target.checked === true } });
      document.body.classList.toggle('dyslexia', event.target.checked === true);
    });
  }
  const gameModeInput = qs('#gameModeOptimize');
  if (gameModeInput) {
    gameModeInput.addEventListener('change', (event) => {
      setConfig({ behavior: { gameModeOptimize: event.target.checked === true } });
    });
  }
  const refocusGameInput = qs('#refocusGameOnHide');
  if (refocusGameInput) {
    refocusGameInput.addEventListener('change', (event) => {
      setConfig({ behavior: { refocusGameOnOverlayHide: event.target.checked === true } });
    });
  }
  const refocusGameBtn = qs('#refocusGameBtn');
  if (refocusGameBtn) {
    refocusGameBtn.addEventListener('click', () => {
      if (api && typeof api.refocusGame === 'function') {
        api.refocusGame()
          .then(() => toast('Fokus an Destiny 2 zurückgegeben.', 'success', 2200))
          .catch((error) => toast(error.message || String(error), 'error', 2400));
      }
    });
  }
  const tvModeInput = qs('#tvModeMode');
  if (tvModeInput) {
    tvModeInput.addEventListener('change', (event) => {
      setConfig({ appearance: { tvMode: event.target.checked === true } });
      if (window.applyAppearance) window.applyAppearance();
      else document.body.classList.toggle('tv-mode', event.target.checked === true);
    });
  }
  const scheduleImportBtn = qs('#scheduleImportBtn');
  if (scheduleImportBtn) {
    scheduleImportBtn.addEventListener('click', () => {
      const root = document.createElement('div');
      root.className = 'cmd-palette';
      root.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Wochenplan übernehmen">' +
        '<div class="wn-head"><strong>Wochenplan übernehmen</strong><button type="button" class="icon-btn" data-import-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-body">' +
        '<p class="inv-tool-muted">Eine Zeile pro Tag, z. B. „Di 20:00 Raid" oder „Freitag: Xûr". ICS-Kalender: die SUMMARY-Zeilen einfügen.</p>' +
        '<textarea class="control" data-import-text rows="8" style="width:100%" placeholder="Mo: Pinnacle-Dailies\nDi 20:00 Raid\nFr: Xûr-Check"></textarea>' +
        '<label class="check-row"><input type="checkbox" data-import-reminders checked> <span>Erinnerungen für Zeiten anlegen</span></label>' +
        '</div>' +
        '<div class="wn-foot" style="padding:10px 0 0"><button type="button" class="btn primary small" data-import-run>Übernehmen</button></div>' +
        '</div>';
      document.body.appendChild(root);
      const textarea = root.querySelector('[data-import-text]');
      textarea.focus();
      root.addEventListener('click', (event) => {
        if (event.target === root || event.target.closest('[data-import-close]')) {
          root.remove();
          return;
        }
        if (!event.target.closest('[data-import-run]')) return;
        const withReminders = Boolean(root.querySelector('[data-import-reminders]').checked);
        const parsed = parseScheduleImport(textarea.value, { withReminders });
        const current = (cfg().overlay && cfg().overlay.weeklySchedule) || {};
        setConfig({ overlay: { weeklySchedule: { ...current, ...parsed.schedule } } });
        if (withReminders && parsed.reminders.length) {
          const list = ((cfg().reminders && cfg().reminders.list) || []).slice();
          const existing = new Set(list.map((entry) => entry.text + entry.time + entry.weekday));
          let added = 0;
          for (const reminder of parsed.reminders) {
            if (existing.has(reminder.text + reminder.time + reminder.weekday)) continue;
            list.push(reminder);
            added += 1;
          }
          setConfig({ reminders: { list: list.slice(0, 20) } });
          toast(`Wochenplan übernommen, ${added} Erinnerung(en) angelegt.`, 'success', 3000);
        } else {
          toast('Wochenplan übernommen.', 'success', 2400);
        }
        root.remove();
        refreshFields();
      });
    });
  }
  const tvCheckBtn = qs('#tvCheckBtn');
  if (tvCheckBtn) tvCheckBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('d2-tv-check')));
  const resetUiSettingsBtn = qs('#resetUiSettings');
  if (resetUiSettingsBtn) {
    resetUiSettingsBtn.addEventListener('click', () => {
      setConfig({
        appearance: { simpleMode: true, fontScale: 1, startView: 'dashboard', reduceMotion: false, colorblind: false, highContrast: false, tvMode: false },
        notifications: { enabled: true, postmaster: true, xur: true, reset: true, godroll: true, suppressDuringActivity: true, quietStart: '23:00', quietEnd: '07:00' },
        dashboardHidden: [],
        dashboardPreset: 'all'
      });
      toast('UI-Einstellungen zurückgesetzt.', 'success', 2400);
    });
  }
  const hudActivityInput = qs('#hudShowActivity');
  if (hudActivityInput) hudActivityInput.addEventListener('change', (event) => setConfig({ statsHud: { showActivity: event.target.checked === true } }));
  const hudChampionsInput = qs('#hudShowChampions');
  if (hudChampionsInput) hudChampionsInput.addEventListener('change', (event) => setConfig({ statsHud: { showChampions: event.target.checked === true } }));

  // ------------------------------------------------------------
  // Zoom pro Webseite
  // ------------------------------------------------------------

  function refreshSiteZoomControls() {
    const select = qs('#siteZoomSelect');
    const input = qs('#siteZoomValue');
    if (!select || !input) return;
    const sites = allKnownSitesFlat();
    const previous = select.value;
    select.innerHTML = sites
      .map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.category)} · ${escapeHtml(site.name)}</option>`)
      .join('');
    if (sites.some((site) => site.id === previous)) select.value = previous;
    const map = (cfg().web && cfg().web.siteZoom) || {};
    const value = Number(map[select.value]);
    if (Number.isFinite(value) && value > 0) {
      input.value = String(Math.round(value * 100));
    } else {
      input.value = '';
      input.placeholder = `${Math.round((cfg().web.zoom || 1) * 100)}`;
    }
  }

  const siteZoomSelect = qs('#siteZoomSelect');
  if (siteZoomSelect) {
    siteZoomSelect.addEventListener('change', refreshSiteZoomControls);
    const zoomInput = qs('#siteZoomValue');
    zoomInput.addEventListener('change', () => {
      const raw = String(zoomInput.value || '').trim();
      const map = { ...((cfg().web && cfg().web.siteZoom) || {}) };
      if (!raw) {
        delete map[siteZoomSelect.value];
        setConfig({ web: { siteZoom: map } });
        if (web && web.applyZoom) web.applyZoom();
        toast('Diese Seite nutzt wieder den globalen Zoom.', 'info', 1600);
        return;
      }
      const percent = clamp(Number(raw) || 100, 50, 200);
      zoomInput.value = String(Math.round(percent));
      map[siteZoomSelect.value] = percent / 100;
      setConfig({ web: { siteZoom: map } });
      if (web && web.applyZoom) web.applyZoom();
      toast(`Zoom für diese Seite: ${Math.round(percent)} %.`, 'success', 1600);
    });
    qs('#siteZoomResetBtn').addEventListener('click', () => {
      const map = { ...((cfg().web && cfg().web.siteZoom) || {}) };
      delete map[siteZoomSelect.value];
      setConfig({ web: { siteZoom: map } });
      if (web && web.applyZoom) web.applyZoom();
      refreshSiteZoomControls();
      toast('Zoom-Override entfernt (global).', 'info', 1600);
    });
  }

  // ------------------------------------------------------------
  // Persönliche Erinnerungen
  // ------------------------------------------------------------

  const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  // Wochenplan aus eingefügtem Text oder ICS übernehmen.
  function parseScheduleImport(text, options = {}) {
    const dayMap = {
      mo: 'mon', mon: 'mon', montag: 'mon', monday: 'mon',
      di: 'tue', tue: 'tue', dienstag: 'tue', tuesday: 'tue',
      mi: 'wed', wed: 'wed', mittwoch: 'wed', wednesday: 'wed',
      do: 'thu', thu: 'thu', donnerstag: 'thu', thursday: 'thu',
      fr: 'fri', fri: 'fri', freitag: 'fri', friday: 'fri',
      sa: 'sat', sat: 'sat', samstag: 'sat', saturday: 'sat',
      so: 'sun', sun: 'sun', sonntag: 'sun', sunday: 'sun'
    };
    const labels = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const schedule = {};
    const reminders = [];
    const lines = String(text || '').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line || '').trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\.?\s*[:\-]?\s*(.+)$/i);
      if (!match) continue;
      const key = dayMap[String(match[1]).toLowerCase()];
      if (!key || !labels.includes(key)) continue;
      const body = String(match[2]).trim().slice(0, 30);
      if (!body) continue;
      schedule[key] = body;
      const time = body.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
      if (time) {
        reminders.push({
          id: 'sch' + key + Math.abs(body.length * 7 + Number(time[1])),
          text: body.replace(/\b\d{1,2}[:.]\d{2}\b/, '').trim().slice(0, 60) || 'Wochenplan',
          time: String(time[1]).padStart(2, '0') + ':' + time[2],
          repeat: 'weekly',
          weekday: labels.indexOf(key) + 1 > 6 ? 0 : labels.indexOf(key) + 1,
          lastFired: ''
        });
      }
    }
    if (options.withReminders) return { schedule, reminders };
    return { schedule, reminders: [] };
  }

  function renderReminders() {
    const container = qs('#reminderList');
    if (!container) return;
    const list = (cfg().reminders && cfg().reminders.list) || [];
    container.innerHTML = list.length
      ? list
          .map((reminder) => {
            const repeatLabel =
              reminder.repeat === 'daily'
                ? 'täglich'
                : reminder.repeat === 'weekly'
                  ? `${WEEKDAYS[Number(reminder.weekday)] || 'wöchentlich'}`
                  : reminder.repeat === 'onstart'
                    ? 'bei Spielstart'
                    : 'einmalig';
            return (
              `<div class="reminder-row">` +
              `<strong>${escapeHtml(reminder.time || 'Spielstart')}</strong>` +
              `<span class="reminder-text">${escapeHtml(reminder.text)}</span>` +
              `<span class="reminder-repeat">${escapeHtml(repeatLabel)}</span>` +
              `<button class="icon-btn" data-reminder-remove="${escapeHtml(reminder.id)}" title="Entfernen" aria-label="Entfernen">×</button>` +
              `</div>`
            );
          })
          .join('')
      : '<div class="check-empty">Noch keine Erinnerung angelegt.</div>';
  }

  function renderRemindersAndClear() {
    renderReminders();
    const text = qs('#reminderText');
    if (text) text.value = '';
  }

  function addReminder() {
    const textInput = qs('#reminderText');
    const timeInput = qs('#reminderTime');
    const repeatInput = qs('#reminderRepeat');
    const weekdayInput = qs('#reminderWeekday');
    const text = String(textInput.value || '').trim();
    const time = String(timeInput.value || '').trim();
    if (!text) {
      toast('Bitte einen Text angeben.', 'warning');
      textInput.focus();
      return;
    }
    const repeat = repeatInput.value;
    if (repeat !== 'onstart' && !/^\d{2}:\d{2}$/.test(time)) {
      toast('Bitte eine Uhrzeit wählen (bei „Bei Spielstart“ optional).', 'warning');
      timeInput.focus();
      return;
    }
    const list = (cfg().reminders && cfg().reminders.list) || [];
    const next = list.concat([
      {
        id: 'r-' + Date.now().toString(36),
        text,
        time: repeat === 'onstart' ? '' : time,
        repeat,
        weekday: repeat === 'weekly' ? Number(weekdayInput.value) || 1 : 0,
        lastFired: ''
      }
    ]);
    setConfig({ reminders: { list: next } });
    renderRemindersAndClear();
    toast(`Erinnerung gespeichert: ${time ? time + ' Uhr – ' : ''}${text}`, 'success');
  }

  const reminderListEl = qs('#reminderList');
  if (reminderListEl) {
    reminderListEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-reminder-remove]');
      if (!button) return;
      const list = (cfg().reminders && cfg().reminders.list) || [];
      setConfig({ reminders: { list: list.filter((reminder) => reminder.id !== button.dataset.reminderRemove) } });
      renderReminders();
    });
  }
  qs('#reminderAddBtn').addEventListener('click', addReminder);
  qs('#reminderText').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addReminder();
  });
  qs('#reminderRepeat').addEventListener('change', (event) => {
    const weekday = qs('#reminderWeekday');
    if (weekday) weekday.classList.toggle('hidden', event.target.value !== 'weekly');
  });
  renderReminders();

  // ------------------------------------------------------------
  // Lesemodus pro Webseite
  // ------------------------------------------------------------

  function refreshSiteReaderControls() {
    const select = qs('#siteReaderSelect');
    const value = qs('#siteReaderValue');
    if (!select || !value) return;
    const sites = allKnownSitesFlat();
    const previous = select.value;
    select.innerHTML = sites
      .map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.category)} · ${escapeHtml(site.name)}</option>`)
      .join('');
    if (sites.some((site) => site.id === previous)) select.value = previous;
    const map = (cfg().web && cfg().web.readerSites) || {};
    const override = map[select.value];
    value.value = typeof override === 'boolean' ? (override ? 'on' : 'off') : '';
  }

  const siteReaderSelect = qs('#siteReaderSelect');
  if (siteReaderSelect) {
    siteReaderSelect.addEventListener('change', refreshSiteReaderControls);
    qs('#siteReaderValue').addEventListener('change', (event) => {
      const map = { ...((cfg().web && cfg().web.readerSites) || {}) };
      const raw = event.target.value;
      if (raw === '') delete map[siteReaderSelect.value];
      else map[siteReaderSelect.value] = raw === 'on';
      setConfig({ web: { readerSites: map } });
      if (web && web.applyReaderMode) web.applyReaderMode();
      toast(raw === '' ? 'Lesemodus dieser Seite folgt dem globalen Schalter.' : `Lesemodus für diese Seite: ${raw === 'on' ? 'an' : 'aus'}.`, 'info', 1800);
    });
  }

  // ------------------------------------------------------------
  // Einstellungs-Suche
  // ------------------------------------------------------------

  // „Auf Standard" je Bereich: setzt nur die Felder dieser Gruppe zurück.
  const GROUP_RESETS = [
    { match: /^Größe & Sprache$/, patch: { appearance: { uiScale: 1, fontScale: 1, uiLanguage: 'de' } } },
    { match: /^Kontrast & Bewegung$/, patch: { appearance: { colorblind: false, highContrast: false, reduceMotion: false, simpleMode: true } } },
    { match: /^TV-Modus \(Fernseher\)$/, patch: { appearance: { tvMode: false } } },
    { match: /^Größe, Position & Deckkraft$/, patch: { overlay: { width: 88, height: 88, opacity: 0.96, anchor: 'center', scale: 1, margin: 24, autoHideSeconds: 0 } } },
    {
      match: /^Elemente$/,
      patch: { overlay: { showItems: { notes: true, dashboard: true, loadouts: true, lock: true, hide: true, exit: true, clock: true, session: true, activity: true, battery: true, bungie: true, focus: true }, compact: false } }
    },
    { match: /^Poststellen-Zähler$/, patch: { postmaster: { enabled: false, opacity: 0.95, compact: false, lock: false, autoGame: false, theme: 'dark', refreshSeconds: 90, inventoryOnly: false } } }
  ];
  for (const group of qsa('details.settings-group')) {
    const summary = group.querySelector('summary');
    if (!summary) continue;
    const title = String(summary.textContent || '').trim();
    const entry = GROUP_RESETS.find((candidate) => candidate.match.test(title));
    if (!entry) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost small settings-reset';
    button.textContent = 'Zurücksetzen';
    button.title = 'Nur diesem Bereich die Standardwerte geben';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.confirm(`„${title}" auf Standardwerte zurücksetzen?`)) return;
      setConfig(entry.patch);
      try { refreshFields(); } catch (error) { /* egal */ }
      if (typeof window.applyAppearance === 'function') window.applyAppearance();
      toast('Bereich zurückgesetzt.', 'success', 2200);
    });
    // Nicht in die <summary> hängen: interaktive Elemente dürfen
    // nicht verschachtelt sein (axe: nested-interactive).
    group.insertBefore(button, group.firstChild);
  }

  const settingsSearchInput = qs('#settingsSearch');
  if (settingsSearchInput) {
    settingsSearchInput.addEventListener('input', debounce(applySettingsSearch, 200));
    // Esc löscht die Suche und stellt die Tab-Ansicht wieder her.
    settingsSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        settingsSearchInput.value = '';
        applySettingsSearch();
      }
    });
  }

  function applySettingsSearch() {
    if (!settingsSearchInput || !modal) return;
    const query = String(settingsSearchInput.value || '').trim().toLowerCase();
    const bodyEl = qs('.settings-body', modal);
    const nav = qs('.settings-nav', modal);
    if (!bodyEl) return;
    const selectors = [
      '.field', '.check-row', '.check', '.field-actions-row', '.note-box', 'details.compat-details',
      '.custom-form', '.custom-list', '#statsSummary', '#statsBars', '#netResults', '#logOutput',
      '#bridgeStatus', '#appHealth', '#errorRadar', '#notifyHistory', '#reminderList', '.reminder-add',
      'details.settings-group', '.settings-checks', '.settings-panel > h4',
      '.settings-panel > p', '.controller-status-line', '.key-table', '.about-grid',
      '.pad-grid', '.axis-view', '.order-list', '.chip-order-list', '.reminder-list',
      '.focus-state-box', '.controller-scan-list'
    ];
    const groups = qsa('details.settings-group', modal);
    if (!query) {
      bodyEl.classList.remove('search-mode');
      if (nav) nav.classList.remove('hidden');
      for (const panel of qsa('.settings-panel', modal)) panel.classList.remove('search-hit');
      for (const element of qsa(selectors.join(','), modal)) {
        element.classList.remove('search-hide');
        element.classList.remove('search-match');
      }
      // Vor der Suche eingeklappte Gruppen wieder einklappen.
      for (const group of groups) {
        if (group.dataset.openBefore === undefined) continue;
        group.open = group.dataset.openBefore === '1';
        delete group.dataset.openBefore;
      }
      return;
    }
    bodyEl.classList.add('search-mode');
    if (nav) nav.classList.add('hidden');
    for (const group of groups) {
      if (group.dataset.openBefore === undefined) group.dataset.openBefore = group.open ? '1' : '0';
    }
    // Panel-Titel bleiben sichtbar, damit Treffer einen Kontext haben.
    for (const title of qsa('.settings-panel > h3', modal)) title.classList.remove('search-hide');
    let totalHits = 0;
    for (const panel of qsa('.settings-panel', modal)) {
      let hasHit = false;
      for (const element of qsa(selectors.join(','), panel)) {
        // Gruppen bewerten ihren Inhalt mit; einzelne Treffer bleiben sichtbar.
        const text = (element.textContent || '').toLowerCase();
        const match = text.includes(query);
        element.classList.toggle('search-hide', !match);
        element.classList.toggle('search-match', match);
        if (match) hasHit = true;
        if (match && element.matches('details.settings-group')) element.open = true;
      }
      // Gruppen, in denen etwas gefunden wurde, aufklappen.
      for (const group of qsa('details.settings-group', panel)) {
        if (group.querySelector('.search-match') && !group.classList.contains('search-match')) group.open = true;
      }
      panel.classList.toggle('search-hit', hasHit);
      if (hasHit) totalHits += 1;
    }
    if (nav) nav.classList.toggle('hidden', totalHits > 0);
    const firstMatch = qs('.search-match', bodyEl);
    if (firstMatch) {
      try { firstMatch.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (error) { /* egal */ }
    }
  }

  // ------------------------------------------------------------
  // Bungie-API (Dashboard-Hüterdaten)
  // ------------------------------------------------------------

  const contentLanguageListener = qs('#contentLanguage');
  if (contentLanguageListener) {
    contentLanguageListener.addEventListener('change', (event) => {
      setConfig({ bungie: { contentLanguage: String(event.target.value || 'de') } });
      toast('Spielsprache gespeichert – Inventar neu laden.', 'info', 2600);
    });
  }
  const migrateImportBtn = qs('#migrateImportBtn');
  if (migrateImportBtn) {
    migrateImportBtn.addEventListener('click', async () => {
      const result = await api.appMigrateConfig('import').catch(() => null);
      toast(result && result.ok ? `Konfiguration übernommen. ${result.note || ''}` : (result && result.error) || 'Übernahme fehlgeschlagen.', result && result.ok ? 'success' : 'error', 4200);
    });
  }
  const migrateExportBtn = qs('#migrateExportBtn');
  if (migrateExportBtn) {
    migrateExportBtn.addEventListener('click', async () => {
      const result = await api.appMigrateConfig('export').catch(() => null);
      toast(result && result.ok ? `Konfiguration gesichert. ${result.note || ''}` : (result && result.error) || 'Sichern fehlgeschlagen.', result && result.ok ? 'success' : 'error', 4200);
    });
  }
  qs('#bungieApiKey').addEventListener('change', async (event) => {    const value = String(event.target.value || '').trim();
    if (!value) return; // leer = unverändert
    const result = await api.bungieSetApiKey(value);
    if (result && result.ok) {
      event.target.value = '';
      event.target.placeholder = 'API-Key gespeichert – leer lassen zum Beibehalten';
      const keyState = qs('#bungieApiKeyState');
      if (keyState) keyState.textContent = '✓ API-Key gespeichert (verschlüsselt).';
      toast('API-Key gespeichert.', 'success', 2200);
      refreshOAuthStatus?.();
    } else {
      toast((result && result.error) || 'API-Key konnte nicht gespeichert werden.', 'error');
    }
  });
  qs('#bungiePlayerName').addEventListener('change', (event) =>
    setConfig({ bungie: { playerName: String(event.target.value || '').trim() } })
  );
  qs('#bungieOrigin').addEventListener('change', (event) =>
    setConfig({ bungie: { origin: String(event.target.value || '').trim() } })
  );
  qs('#bungieWishlistUrl').addEventListener('change', (event) =>
    setConfig({ bungie: { wishlistUrl: String(event.target.value || '').trim().slice(0, 300) } })
  );
  const godrollModeSelect = qs('#bungieGodrollMode');
  if (godrollModeSelect) {
    godrollModeSelect.addEventListener('change', (event) => {
      const value = ['exact', 'traits', 'fast'].includes(String(event.target.value)) ? String(event.target.value) : 'exact';
      setConfig({ bungie: { godrollMode: value } });
    });
  }
  qs('#bungieTestBtn').addEventListener('click', async () => {
    const status = qs('#bungieApiStatus');
    if (status) status.textContent = 'Teste Verbindung …';
    try {
      const result = await api.bungieFetch(true);
      if (status) {
        status.textContent = result && result.ok
          ? `Verbunden: ${(result.guardians || []).length} Hüter geladen${result.authed ? ' (angemeldet)' : result.cached ? ' (Zwischenspeicher)' : ''}.`
          : `Fehler: ${result && result.error ? result.error : 'unbekannt'}`;
      }
    } catch (error) {
      if (status) status.textContent = `Fehler: ${error.message || error}`;
    }
  });

  // Bungie-Anmeldung (OAuth)
  qs('#bungieClientId').addEventListener('change', (event) =>
    setConfig({ bungie: { oauthClientId: String(event.target.value || '').trim() } })
  );
  const bungieSecretInput = qs('#bungieClientSecret');
  if (bungieSecretInput) {
    bungieSecretInput.addEventListener('change', async (event) => {
      const value = String(event.target.value || '').trim();
      if (!value) return; // leer = unverändert
      bungieSecretInput.disabled = true;
      try {
        const result = await api.bungieSetSecret(value);
        if (result && result.ok) {
          bungieSecretInput.value = '';
          toast('Client-Secret gespeichert – jetzt einmal Abmelden → Anmelden.', 'success', 4600);
          await refreshOAuthStatus();
        } else {
          toast((result && result.error) || 'Client-Secret konnte nicht gespeichert werden.', 'error');
        }
      } finally {
        bungieSecretInput.disabled = false;
      }
    });
  }
  const bungieSecretClearBtn = qs('#bungieSecretClearBtn');
  if (bungieSecretClearBtn) {
    bungieSecretClearBtn.addEventListener('click', async () => {
      const result = await api.bungieSetSecret('');
      if (result && result.ok) {
        toast('Client-Secret entfernt.', 'info', 2000);
        await refreshOAuthStatus();
        await refresh();
      }
    });
  }
  async function refreshOAuthStatus() {
    const line = qs('#bungieOAuthStatus');
    if (!line) return;
    try {
      const status = await api.bungieOAuthStatus();
      const keyState = qs('#bungieApiKeyState');
      if (keyState && status && status.apiKeyStored) {
        keyState.textContent = status.apiKeyReadable
          ? `✓ API-Key gespeichert (${status.apiKeyLength} Zeichen, verschlüsselt).`
          : '⚠ API-Key ist gespeichert, kann auf diesem PC aber nicht entschlüsselt werden – bitte neu eingeben.';
      } else if (keyState && status && !status.apiKeyStored) {
        keyState.textContent = 'Kein API-Key gespeichert.';
      }
      const secretState = qs('#bungieSecretState');
      if (secretState) {
        secretState.textContent = status && status.hasClientSecret
          ? '✓ Secret gespeichert.'
          : 'Kein Secret gespeichert.';
      }
      const secretInput = qs('#bungieClientSecret');
      if (secretInput && !secretInput.value) {
        secretInput.placeholder = status && status.hasClientSecret
          ? 'Secret gespeichert – leer lassen zum Beibehalten'
          : 'Nur bei „Vertraulicher“ App – sonst leer lassen';
      }
      if (status && status.loggedIn) {
        const until = status.expiresAt ? new Date(status.expiresAt).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
        const remaining = status.expiresAt ? Math.round((Number(status.expiresAt) - Date.now()) / 60000) : null;
        const countdown = remaining == null
          ? ''
          : remaining <= 0
            ? ' · abgelaufen (wird automatisch erneuert)'
            : ` · läuft in ${remaining} Min. ab`;
        // WICHTIG: Nur vertrauliche Apps erhalten einen Refresh-Token.
        // Öffentliche Apps sind nach ~1 Stunde abgemeldet.
        let text = status.publicClient
          ? `Angemeldet als ${status.displayName || 'Hüter'} – aber Bungie hat KEINEN Refresh-Token ausgestellt (öffentliche App): Die Anmeldung endet nach ca. 1 Stunde${until ? ` (Token bis ${until} Uhr${countdown})` : ''}. Für dauerhaftes Angemeldetbleiben die App im Portal auf „Vertraulich“ stellen und das Client-Secret oben eintragen.`
          : `Angemeldet als ${status.displayName || 'Hüter'} – die Anmeldung erneuert sich automatisch${until ? ` (aktuelles Token bis ${until} Uhr${countdown})` : ''}.`;
        // Scope-Beweis: App-Registrierung + Nutzer-Autorisierung direkt
        // bei Bungie nachfragen (Bitmaske: Lesen=64, Verschieben=32).
        try {
          const scopes = await api.bungieOAuthScopes();
          if (scopes && scopes.ok) {
            const mark = (value) => (value === null ? 'k. A.' : value ? '✓' : '✗');
            text += ` App-Registrierung: Lesen ${mark(scopes.appHasInv)} · Verschieben ${mark(scopes.appHasMove)}.`;
            if (scopes.userHasInv !== null || scopes.userHasMove !== null) {
              text += ` Deine Autorisierung: Lesen ${mark(scopes.userHasInv)} · Verschieben ${mark(scopes.userHasMove)}.`;
            }
            if (scopes.appHasInv === false) text += ' ⚠ Im Portal das Lesen-Scope anhaken und „Speichern“, dann neu anmelden.';
            else if (scopes.userHasInv === false) text += ' ⚠ Die Autorisierung enthält das Lesen-Scope nicht — einmal ab- und neu anmelden.';
          }
        } catch (error) {
          // Scope-Prüfung optional.
        }
        line.textContent = text;
      } else {
        line.textContent = status && status.tokenReadable === false
          ? 'Gespeicherte Anmeldung kann auf diesem PC nicht entschlüsselt werden – bitte einmal ab- und neu anmelden.'
          : 'Nicht angemeldet.';
      }
    } catch (error) {
      line.textContent = 'Status nicht abrufbar.';
    }
  }
  qs('#bungieLoginBtn').addEventListener('click', async () => {
    // Falls das Secret gerade eingetippt, aber noch nicht gespeichert
    // wurde (Fokus noch im Feld): zuerst speichern.
    const secretInput = qs('#bungieClientSecret');
    const pendingSecret = secretInput ? String(secretInput.value || '').trim() : '';
    if (pendingSecret) {
      const saved = await api.bungieSetSecret(pendingSecret);
      if (!saved || !saved.ok) {
        toast((saved && saved.error) || 'Client-Secret konnte nicht gespeichert werden.', 'error');
        return;
      }
      secretInput.value = '';
      secretInput.placeholder = 'Secret gespeichert – leer lassen zum Beibehalten';
      const secretState = qs('#bungieSecretState');
      if (secretState) secretState.textContent = '✓ Secret gespeichert.';
      toast('Client-Secret gespeichert.', 'success', 2600);
    }
    const result = await api.bungieOAuthStart();
    if (!result || !result.ok) toast((result && result.error) || 'Anmeldung konnte nicht gestartet werden.', 'error');
  });
  const refreshBtn = qs('#bungieRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      const status = qs('#bungieApiStatus');
      if (status) status.textContent = 'Erneuere Anmeldung …';
      try {
        const result = await api.bungieOAuthRefresh();
        if (result && result.ok) {
          toast('Anmeldung erneuert.', 'success', 2000);
        } else {
          toast((result && result.error) || 'Anmeldung konnte nicht erneuert werden.', 'error', 4000);
        }
      } catch (error) {
        toast(error.message || String(error), 'error', 4000);
      } finally {
        refreshBtn.disabled = false;
        refreshOAuthStatus();
      }
    });
  }
  qs('#bungieLogoutBtn').addEventListener('click', async () => {
    const result = await api.bungieOAuthLogout();
    if (result && result.ok) {
      toast('Abgemeldet.', 'info', 1800);
      refreshOAuthStatus();
    }
  });
  refreshOAuthStatus().catch(() => {});
  api.onBungieOAuth?.(() => refreshOAuthStatus());

  // Wochenziel
  qs('#weeklyGoalInput').addEventListener('change', (event) => {
    const goal = Math.max(0, Math.min(10080, Math.round(Number(event.target.value) || 0)));
    event.target.value = String(goal);
    setConfig({ stats: { weeklyGoal: goal } });
    renderStats();
  });

  // App-Gesundheit + Seiten-Fehler-Radar
  async function refreshAppHealth() {
    const box = qs('#appHealth');
    if (!box) return;
    try {
      const health = await api.getAppHealth();
      if (!health || !health.ok) {
        box.innerHTML = `<div><span>Status:</span><strong>nicht abrufbar</strong></div>`;
        return;
      }
      const uptimeText = health.uptime > 120 ? `${Math.floor(health.uptime / 60)} Min` : `${health.uptime} s`;
      const rate = health.rateLimit || {};
      const last429 = Number(rate.last429At) || 0;
      const rateText = last429
        ? `zuletzt ${new Date(last429).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
        : 'keine Drosselung';
      box.innerHTML =
        `<div><span>Arbeitsspeicher:</span><strong>${health.rss} MB</strong></div>` +
        `<div><span>Heap (genutzt):</span><strong>${health.heapUsed} MB</strong></div>` +
        `<div><span>Läuft seit:</span><strong>${uptimeText}</strong></div>` +
        `<div><span>Geladene Webviews:</span><strong>${health.webviews}</strong></div>` +
        `<div><span>Bungie-Anfragen:</span><strong>${Number(rate.waiting) || 0} wartend · ${rateText}</strong></div>`;
      const diagBox = qs('#diagRateLimit');
      if (diagBox) {
        diagBox.innerHTML = last429
          ? `<span class="warn">Letztes Rate-Limit: ${escapeHtml(new Date(last429).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE'))} (Status ${Number(rate.lastStatus) || 429}).</span>`
          : '<span class="field-hint">Keine Drosselung in dieser Sitzung.</span>';
      }
    } catch (error) {
      box.innerHTML = `<div><span>Status:</span><strong>nicht abrufbar (${escapeHtml(error.message || String(error))})</strong></div>`;
    }
  }
  qs('#appHealthBtn').addEventListener('click', refreshAppHealth);
  refreshAppHealth().catch(() => {});

  function renderErrorRadar() {
    const box = qs('#errorRadar');
    if (!box) return;
    const radar = window.__d2ErrorRadar;
    const entries = radar ? [...radar.entries()].sort((a, b) => b[1].at - a[1].at) : [];
    box.innerHTML = entries.length
      ? entries
          .map(([siteId, entry]) => {
            const time = new Date(entry.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' });
            return (
              `<div class="history-row"><span class="history-kind">${entry.count}×</span>` +
              `<span class="history-msg" title="${escapeHtml(entry.last || '')}">${escapeHtml(entry.name || siteId)} · ${escapeHtml(entry.last || '')} · ${escapeHtml(time)}</span></div>`
            );
          })
          .join('')
      : '<div class="check-empty">Keine Ladefehler in dieser Sitzung.</div>';
  }
  qs('#errorRadarBtn').addEventListener('click', renderErrorRadar);
  renderErrorRadar();

  // Erinnerungen aus dem Wochenplan ableiten: Uhrzeiten im Text der
  // Tagesfelder werden als wöchentliche Erinnerungen angelegt
  // (bereits vorhandene Zeiten pro Wochentag werden übersprungen).
  qs('#reminderFromScheduleBtn').addEventListener('click', () => {
    const schedule = (cfg().overlay && cfg().overlay.weeklySchedule) || {};
    const dayKeys = [['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 0]];
    const existing = (cfg().reminders && cfg().reminders.list) || [];
    const next = existing.slice();
    let created = 0;
    for (const [key, weekday] of dayKeys) {
      const text = String(schedule[key] || '');
      const match = text.match(/(\d{1,2}):(\d{2})/);
      if (!match) continue;
      const hour = Math.min(23, Math.max(0, Number(match[1])));
      const minute = Math.min(59, Math.max(0, Number(match[2])));
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const label = text
        .replace(/^(\s*[A-Za-zÄÖÜäöü]{2}\s*:)?/, '')
        .replace(/(\d{1,2}:\d{2})/g, '')
        .replace(/[:\-–·]+/g, ' ')
        .trim()
        .slice(0, 60) || 'Wochenplan';
      if (existing.concat(next).some((reminder) => reminder.time === time && Number(reminder.weekday) === weekday)) {
        continue; // schon vorhanden
      }
      next.push({ id: 'r-' + Date.now().toString(36) + '-' + weekday, text: label, time, repeat: 'weekly', weekday, lastFired: '' });
      created += 1;
    }
    if (!created) {
      toast('Keine neuen Zeiten im Wochenplan gefunden.', 'info', 2200);
      return;
    }
    setConfig({ reminders: { list: next } });
    renderReminders();
    toast(`${created} Erinnerung${created === 1 ? '' : 'en'} aus dem Wochenplan angelegt.`, 'success', 2400);
  });

  // ------------------------------------------------------------
  // Notizen-Ordner-Modus
  // ------------------------------------------------------------

  qs('#notesFolderBtn').addEventListener('click', async () => {
    const result = await api.notesFolderSelect();
    if (result && result.ok) {
      const input = qs('#notesFolderInput');
      if (input) input.value = result.folder || '';
      toast(`Notizen-Ordner aktiv: ${result.folder}`, 'success', 2600);
      toast('Die Notiz-Blätter erscheinen jetzt als .md-Dateien im gewählten Ordner.', 'info', 4000);
    } else if (result && !result.canceled) {
      toast((result && result.error) || 'Ordner konnte nicht gesetzt werden.', 'error');
    }
  });
  qs('#notesFolderClearBtn').addEventListener('click', () => {
    setConfig({ overlay: { notesFolder: '' } });
    const input = qs('#notesFolderInput');
    if (input) input.value = '';
    toast('Ordner-Modus deaktiviert – zurück zu den Notiz-Blättern.', 'info', 2200);
  });

  // ------------------------------------------------------------
  // Diagnose: Controller-Brücke & Kürzel-Test
  // ------------------------------------------------------------

  async function refreshBridgeStatus() {
    const box = qs('#bridgeStatus');
    if (!box) return;
    try {
      const status = await api.getBridgeStatus();
      const uptime = status.startedAt ? Math.max(1, Math.round((Date.now() - status.startedAt) / 1000)) : 0;
      const uptimeText = uptime > 120 ? `${Math.floor(uptime / 60)} Min` : `${uptime} s`;
      box.innerHTML =
        `<div><span>Helfer verfügbar:</span><strong>${status.available ? 'ja' : 'nein (Browser-API aktiv)'}</strong></div>` +
        `<div><span>Helfer läuft:</span><strong>${status.running ? `ja (${uptimeText})` : 'nein'}</strong></div>` +
        `<div><span>Helfer-Version:</span><strong>${escapeHtml(status.fingerprint || '—')}</strong></div>` +
        `<div><span>Rauschfilter:</span><strong>${['aus', 'normal', 'stark'][Number(status.filterStrength) || 0] || String(status.filterStrength)}</strong></div>` +
        `<div><span>Diagnosemodus:</span><strong>${status.diagnostics ? 'an' : 'aus'}</strong></div>` +
        `<div><span>Neustarts nach Absturz:</span><strong>${Number(status.restartAttempts) || 0}</strong></div>`;
    } catch (error) {
      box.innerHTML = `<div><span>Status:</span><strong>nicht abrufbar (${escapeHtml(error.message || String(error))})</strong></div>`;
    }
  }

  qs('#bridgeRefreshBtn').addEventListener('click', refreshBridgeStatus);
  refreshBridgeStatus().catch(() => {});

  let hotkeyTestActive = false;
  qs('#hotkeyTestBtn').addEventListener('click', async () => {
    if (hotkeyTestActive) return;
    hotkeyTestActive = true;
    const hint = qs('#hotkeyTestHint');
    const button = qs('#hotkeyTestBtn');
    button.disabled = true;
    try {
      await api.hotkeyTestStart('hotkey');
      if (hint) hint.textContent = 'Drücke jetzt dein Overlay-Kürzel … (Esc bricht ab, sonst 10 s Timeout)';
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 10000);
        const cleanup = api.onHotkeyTest((payload) => {
          clearTimeout(timeout);
          cleanup();
          resolve(payload);
        });
        const escListener = (event) => {
          if (event.key === 'Escape') {
            clearTimeout(timeout);
            cleanup();
            window.removeEventListener('keydown', escListener, true);
            resolve({ aborted: true });
          }
        };
        window.addEventListener('keydown', escListener, true);
      });
      if (hint) {
        hint.textContent = result && result.accelerator
          ? `Empfangen: ${formatAccelerator(result.accelerator)} – das Kürzel funktioniert.`
          : result && result.aborted
            ? 'Test abgebrochen.'
            : 'Nichts empfangen – das Kürzel ist vermutlich von einem anderen Programm belegt.';
      }
      if (result && result.accelerator) toast(`Kürzel empfangen: ${formatAccelerator(result.accelerator)}`, 'success', 2500);
    } catch (error) {
      if (hint) hint.textContent = `Test fehlgeschlagen: ${error.message || error}`;
    } finally {
      await api.hotkeyTestStop().catch(() => {});
      hotkeyTestActive = false;
      button.disabled = false;
    }
  });

  // ------------------------------------------------------------
  // Blocker-Ausnahmen pro Webseite
  // ------------------------------------------------------------

  function refreshBlockerControls() {
    const select = qs('#blockerSiteSelect');
    if (!select) return;
    const sites = allKnownSitesFlat();
    const previous = select.value;
    select.innerHTML = sites
      .map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.category)} · ${escapeHtml(site.name)}</option>`)
      .join('');
    if (sites.some((site) => site.id === previous)) select.value = previous;
    const adMap = (cfg().web && cfg().web.adBlockOffSites) || {};
    const cookieMap = (cfg().web && cfg().web.cookieOffSites) || {};
    qs('#blockerAdOff').checked = adMap[select.value] === true;
    qs('#blockerCookieOff').checked = cookieMap[select.value] === true;
  }

  const blockerSiteSelect = qs('#blockerSiteSelect');
  if (blockerSiteSelect) {
    blockerSiteSelect.addEventListener('change', refreshBlockerControls);
    qs('#blockerAdOff').addEventListener('change', (event) => {
      const map = { ...((cfg().web && cfg().web.adBlockOffSites) || {}) };
      if (event.target.checked) map[blockerSiteSelect.value] = true;
      else delete map[blockerSiteSelect.value];
      setConfig({ web: { adBlockOffSites: map } });
      toast(event.target.checked ? 'AdBlock für diese Seite aus (nach F5 aktiv).' : 'AdBlock wieder aktiv (nach F5).', 'info', 2200);
    });
    qs('#blockerCookieOff').addEventListener('change', (event) => {
      const map = { ...((cfg().web && cfg().web.cookieOffSites) || {}) };
      if (event.target.checked) map[blockerSiteSelect.value] = true;
      else delete map[blockerSiteSelect.value];
      setConfig({ web: { cookieOffSites: map } });
      if (web && web.applyReaderMode) web.applyReaderMode();
      toast(event.target.checked ? 'Cookie-Banner-Blocker für diese Seite aus.' : 'Cookie-Banner-Blocker wieder aktiv.', 'info', 2200);
    });
    qs('#blockerResetBtn').addEventListener('click', () => {
      const adMap = { ...((cfg().web && cfg().web.adBlockOffSites) || {}) };
      const cookieMap = { ...((cfg().web && cfg().web.cookieOffSites) || {}) };
      delete adMap[blockerSiteSelect.value];
      delete cookieMap[blockerSiteSelect.value];
      setConfig({ web: { adBlockOffSites: adMap, cookieOffSites: cookieMap } });
      refreshBlockerControls();
      toast('Ausnahmen für diese Seite entfernt.', 'info', 1800);
    });
  }

  // ------------------------------------------------------------
  // Konfig-Profile
  // ------------------------------------------------------------

  async function refreshProfileList() {
    const list = qs('#profileList');
    if (!list) return;
    try {
      const result = await api.profilesList();
      const items = (result && result.items) || [];
      list.innerHTML = items.length
        ? items
            .map(
              (profile) =>
                `<div class="custom-item ${profile.id === (result && result.active) ? 'profile-active' : ''}" data-profile-id="${escapeHtml(profile.id)}">` +
                `<div class="custom-item-main"><span class="custom-item-name">${escapeHtml(profile.name)}</span>` +
                `<span class="custom-item-url">${profile.id === (result && result.active) ? 'aktiv' : ''}</span></div>` +
                `<button class="icon-btn" data-profile-export="${escapeHtml(profile.id)}" title="Exportieren (.json)" aria-label="Exportieren">${'⇩'}</button>` +
                `<button class="btn ghost small" data-profile-apply="${escapeHtml(profile.id)}">Anwenden</button>` +
                `<button class="icon-btn" data-profile-delete="${escapeHtml(profile.id)}" title="Löschen" aria-label="Löschen">×</button>` +
                `</div>`
            )
            .join('')
        : '<div class="custom-empty">Noch keine Profile gespeichert.</div>';
    } catch (error) {
      list.innerHTML = `<div class="custom-empty">Profile nicht abrufbar: ${escapeHtml(error.message || String(error))}</div>`;
    }
  }

  qs('#profileSaveBtn').addEventListener('click', async () => {
    const name = String(qs('#profileName').value || '').trim();
    const result = await api.profilesSave(name);
    if (result && result.ok) {
      qs('#profileName').value = '';
      await refreshProfileList();
      toast(`Profil "${result.name}" gespeichert.`, 'success', 2000);
    } else if (result && !result.canceled) {
      toast((result && result.error) || 'Speichern fehlgeschlagen.', 'error');
    }
  });
  qs('#profileImportBtn').addEventListener('click', async () => {
    const result = await api.profilesImport();
    if (result && result.ok) {
      await refreshProfileList();
      toast(`Profil "${result.name}" importiert.`, 'success', 2200);
    } else if (result && !result.canceled) {
      toast((result && result.error) || 'Import fehlgeschlagen.', 'error');
    }
  });
  const profileListEl = qs('#profileList');
  if (profileListEl) {
    profileListEl.addEventListener('click', async (event) => {
      const apply = event.target.closest('[data-profile-apply]');
      if (apply) {
        const result = await api.profilesApply(apply.dataset.profileApply);
        if (result && result.ok) toast(`Profil "${result.name}" angewendet.`, 'success', 2200);
        else toast((result && result.error) || 'Anwenden fehlgeschlagen.', 'error');
        return;
      }
      const exportButton = event.target.closest('[data-profile-export]');
      if (exportButton) {
        const result = await api.profilesExport(exportButton.dataset.profileExport);
        if (result && result.ok) toast(`Profil exportiert: ${result.path}`, 'success', 2600);
        else if (result && !result.canceled) toast((result && result.error) || 'Export fehlgeschlagen.', 'error');
        return;
      }
      const remove = event.target.closest('[data-profile-delete]');
      if (remove) {
        if (!window.confirm('Profil wirklich löschen?')) return;
        await api.profilesDelete(remove.dataset.profileDelete);
        await refreshProfileList();
      }
    });
  }
  refreshProfileList().catch(() => {});

  // ------------------------------------------------------------
  // Kategorie-Reihenfolge
  // ------------------------------------------------------------

  function renderCategoryOrder() {
    const list = qs('#categoryOrderList');
    if (!list) return;
    const categories = getCategories();
    const stored = (cfg().categoryOrder || []).slice();
    const effective = [];
    for (const id of stored) {
      if (categories.some((entry) => entry.id === id) && !effective.includes(id)) effective.push(id);
    }
    for (const entry of categories) {
      if (!effective.includes(entry.id)) effective.push(entry.id);
    }
    list.innerHTML = effective
      .map((id, index) => {
        const category = categories.find((entry) => entry.id === id);
        return (
          `<div class="order-row" data-order-id="${escapeHtml(id)}">` +
          `<span class="order-name" style="--tab-color:${category.color}">${icon(category.icon)} ${escapeHtml(category.name)}</span>` +
          `<button class="icon-btn" data-order-up="${escapeHtml(id)}" title="Nach oben" aria-label="Nach oben">↑</button>` +
          `<button class="icon-btn" data-order-down="${escapeHtml(id)}" title="Nach unten" aria-label="Nach unten">↓</button>` +
          `<small>${index + 1}</small>` +
          `</div>`
        );
      })
      .join('');
  }

  function moveCategoryOrder(id, direction) {
    const categories = getCategories();
    const stored = (cfg().categoryOrder || []).slice();
    const effective = [];
    for (const other of stored) {
      if (categories.some((entry) => entry.id === other) && !effective.includes(other)) effective.push(other);
    }
    for (const entry of categories) {
      if (!effective.includes(entry.id)) effective.push(entry.id);
    }
    const from = effective.indexOf(id);
    const to = Math.max(0, Math.min(effective.length - 1, from + direction));
    if (from === to) return;
    effective.splice(from, 1);
    effective.splice(to, 0, id);
    setConfig({ categoryOrder: effective });
    renderCategoryOrder();
    if (onCategoryOrderChanged) onCategoryOrderChanged();
  }

  const categoryOrderList = qs('#categoryOrderList');
  if (categoryOrderList) {
    categoryOrderList.addEventListener('click', (event) => {
      const up = event.target.closest('[data-order-up]');
      const down = event.target.closest('[data-order-down]');
      if (up) moveCategoryOrder(up.dataset.orderUp, -1);
      else if (down) moveCategoryOrder(down.dataset.orderDown, 1);
    });
  }
  renderCategoryOrder();

  // ------------------------------------------------------------
  // Benachrichtigungs-Historie & Werkseinstellungen
  // ------------------------------------------------------------

  async function refreshNotifyHistory() {
    const box = qs('#notifyHistory');
    if (!box) return;
    try {
      const result = await api.getNotifyHistory();
      const items = (result && result.items) || [];
      box.innerHTML = items.length
        ? items
            .map((entry) => {
              const time = new Date(entry.at).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const kindLabel = { game: 'Spiel', controller: 'Controller', quiet: 'Ruhemodus' }[entry.kind] || entry.kind;
              return (
                `<div class="history-row">` +
                `<span class="history-time">${escapeHtml(time)}</span>` +
                `<span class="history-kind">${escapeHtml(kindLabel)}</span>` +
                `<span class="history-msg" title="${escapeHtml(entry.message)}">${escapeHtml(entry.message)}</span>` +
                `</div>`
              );
            })
            .join('')
        : '<div class="check-empty">Noch keine Benachrichtigungen in dieser Sitzung.</div>';
    } catch (error) {
      box.innerHTML = `<div class="check-empty">Historie nicht abrufbar: ${escapeHtml(error.message || String(error))}</div>`;
    }
  }

  qs('#notifyRefreshBtn').addEventListener('click', refreshNotifyHistory);
  refreshNotifyHistory().catch(() => {});

  // Konfig-Backups (Diagnose)
  async function refreshBackupList() {
    const box = qs('#backupList');
    if (!box) return;
    try {
      const result = await api.backupsList();
      const items = (result && result.items) || [];
      box.innerHTML = items.length
        ? items
            .map((entry) => {
              const time = new Date(entry.at).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              return (
                `<div class="history-row"><span class="history-time">${escapeHtml(time)}</span>` +
                `<span class="history-msg">${escapeHtml(entry.name)}${entry.hash ? ` · ${escapeHtml(entry.hash)}` : ''}</span>` +
                `<button class="btn ghost small" data-backup-diff="${escapeHtml(entry.name)}">Diff</button>` +
                `<button class="btn ghost small" data-backup-restore="${escapeHtml(entry.name)}">Wiederherstellen</button></div>`
              );
            })
            .join('')
        : '<div class="check-empty">Noch keine Backups. Automatik: wöchentlich, max. 4 Versionen.</div>';
      for (const button of qsa('[data-backup-restore]', box)) {
        button.addEventListener('click', async () => {
          if (!window.confirm(`Dieses Backup wiederherstellen?\n\n${button.dataset.backupRestore}\nDie aktuelle Konfiguration wird ersetzt.`)) return;
          const result = await api.backupsRestore(button.dataset.backupRestore);
          if (result && result.ok) toast('Backup wiederhergestellt.', 'success', 2200);
          else toast((result && result.error) || 'Wiederherstellen fehlgeschlagen.', 'error');
        });
      }
      for (const button of qsa('[data-backup-diff]', box)) {
        button.addEventListener('click', async () => {
          const result = await api.backupsDiff(button.dataset.backupDiff).catch(() => null);
          if (!result || !result.ok) { toast((result && result.error) || 'Diff fehlgeschlagen.', 'error'); return; }
          const lines = result.diff.map((entry) => `${entry.key}: ${entry.old} → ${entry.current}`);
          window.alert(`Backup-Diff: ${result.name}\n\n${lines.join('\n')}`);
        });
      }
    } catch (error) {
      box.innerHTML = `<div class="check-empty">Backups nicht abrufbar: ${escapeHtml(error.message || String(error))}</div>`;
    }
  }
  qs('#backupCreateBtn').addEventListener('click', async () => {
    const result = await api.backupsCreate();
    if (result && result.ok) {
      toast('Backup erstellt.', 'success', 1800);
      refreshBackupList();
    } else {
      toast((result && result.error) || 'Backup fehlgeschlagen.', 'error');
    }
  });
  refreshBackupList().catch(() => {});

  qs('#factoryResetBtn').addEventListener('click', async () => {
    if (!window.confirm('Wirklich ALLE Einstellungen auf Werkseinstellungen zurücksetzen? (Seiten, Erinnerungen, Checkliste gehen verloren.)')) return;
    if (!window.confirm('Letzte Chance – wirklich zurücksetzen?')) return;
    const exportFirst = window.confirm('Vorher die aktuelle Konfiguration als Datei exportieren?');
    if (exportFirst) {
      try {
        const exported = await api.exportConfig();
        if (exported && exported.ok) toast(`Sicherung exportiert: ${exported.path}`, 'success', 3000);
      } catch (error) {
        // Export optional - Reset trotzdem fortsetzen.
      }
    }
    const result = await api.factoryReset();
    if (!result || !result.ok) toast((result && result.error) || 'Zurücksetzen fehlgeschlagen.', 'error');
  });

  // ------------------------------------------------------------
  // Diagnose: Session-Statistiken, Netzwerk-Test, Protokolle
  // ------------------------------------------------------------

  const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  function statsDayKey(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatMinutes(minutes) {
    const value = Math.round(Number(minutes) || 0);
    if (value < 60) return `${value} Min`;
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')} Std`;
  }

  function renderStats() {
    const summary = qs('#statsSummary');
    const bars = qs('#statsBars');
    if (!summary || !bars) return;
    const days = (cfg().stats && cfg().stats.days) || {};
    const week = [6, 5, 4, 3, 2, 1, 0].map((offset) => {
      const key = statsDayKey(offset);
      return { key, minutes: Number(days[key]) || 0 };
    });
    const totalWeek = week.reduce((sum, entry) => sum + entry.minutes, 0);
    summary.innerHTML =
      `<span>Heute: <strong>${formatMinutes(week[6].minutes)}</strong></span>` +
      `<span>Letzte 7 Tage: <strong>${formatMinutes(totalWeek)}</strong></span>`;
    const max = Math.max(30, ...week.map((entry) => entry.minutes));
    bars.innerHTML = week
      .map((entry) => {
        const height = Math.max(2, Math.round((entry.minutes / max) * 100));
        const date = new Date();
        date.setDate(date.getDate() - week.indexOf(entry));
        return (
          `<div class="stats-bar-wrap">` +
          `<span>${entry.minutes ? formatMinutes(entry.minutes) : ''}</span>` +
          `<div class="stats-bar" style="height:${height}%"></div>` +
          `<small>${DAY_NAMES[date.getDay()]}</small>` +
          `</div>`
        );
      })
      .join('');
    const goal = Number((cfg().stats && cfg().stats.weeklyGoal) || 0);
    const goalValue = qs('#weeklyGoalValue');
    if (goalValue) goalValue.textContent = goal > 0 ? formatMinutes(goal) : 'aus';
    const goalBar = qs('#weeklyGoalBar');
    if (goalBar) {
      if (goal > 0) {
        const percent = Math.min(100, Math.round((totalWeek / goal) * 100));
        goalBar.hidden = false;
        goalBar.innerHTML =
          `<div class="stats-goal-fill" style="width:${percent}%"></div>` +
          `<span>${formatMinutes(totalWeek)} / ${formatMinutes(goal)} (${percent} %)</span>`;
      } else {
        goalBar.hidden = true;
      }
    }
  }

  let netTesting = false;
  qs('#netTestBtn').addEventListener('click', async () => {
    if (netTesting) return;
    netTesting = true;
    const button = qs('#netTestBtn');
    button.disabled = true;
    const container = qs('#netResults');
    container.innerHTML = '<div class="net-row"><span class="net-state">…</span><span class="net-host">Teste Verbindung …</span></div>';
    try {
      const results = await api.netPing();
      container.innerHTML = results
        .map((entry) => {
          const host = String(entry.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
          const state = entry.ok ? 'OK' : 'Fehler';
          const ms = Number.isFinite(entry.ms) ? `${entry.ms} ms` : '—';
          const detail = entry.ok ? `${entry.status || ''}` : escapeHtml(entry.error || `Status ${entry.status || '?'}`);
          return (
            `<div class="net-row ${entry.ok ? 'ok' : 'bad'}">` +
            `<span class="net-state">${state}</span>` +
            `<span class="net-host" title="${escapeHtml(entry.url || '')}">${escapeHtml(host)}${detail ? ` · ${detail}` : ''}</span>` +
            `<span class="net-ms">${escapeHtml(ms)}</span>` +
            `</div>`
          );
        })
        .join('');
    } catch (error) {
      container.innerHTML = `<div class="net-row bad"><span class="net-state">Fehler</span><span class="net-host">${escapeHtml(error.message || String(error))}</span></div>`;
    }
    button.disabled = false;
    netTesting = false;
  });

  async function refreshLogs() {
    const output = qs('#logOutput');
    const note = qs('#logPathNote');
    if (!output) return;
    const source = (qs('#logSource') && qs('#logSource').value) || 'app';
    const filter = (qs('#logFilter') && String(qs('#logFilter').value || '').toLowerCase()) || '';
    const result = await api.getLogTail(source, 300);
    if (note) note.textContent = result && result.path ? result.path : '';
    let lines = (result && result.lines) || [];
    if (filter) lines = lines.filter((line) => line.toLowerCase().includes(filter));
    output.innerHTML = lines
      .map((line) => {
        const cls = /\[ERROR\]/i.test(line) ? 'log-line-error' : /\[WARN\]/i.test(line) ? 'log-line-warn' : '';
        return `<div class="${cls}">${escapeHtml(line)}</div>`;
      })
      .join('') || 'Keine Einträge.';
    output.scrollTop = output.scrollHeight;
  }

  qs('#logSource').addEventListener('change', refreshLogs);
  qs('#logFilter').addEventListener('input', debounce(refreshLogs, 250));
  let logLiveTimer = null;
  qs('#logLive').addEventListener('change', (event) => {
    if (logLiveTimer) { clearInterval(logLiveTimer); logLiveTimer = null; }
    if (event.target.checked) {
      logLiveTimer = setInterval(() => {
        if (isOpen) refreshLogs();
      }, 3000);
      if (logLiveTimer.unref) logLiveTimer.unref();
    }
  });
  refreshLogs().catch(() => {});
  renderStats();

  // ------------------------------------------------------------
  // Controller-Test-Modus: Live-Anzeige aller Eingaben.
  // ------------------------------------------------------------
  const testModal = qs('#controllerTestModal');
  const testCloseBtn = qs('#controllerTestCloseBtn');
  const testOpenBtn = qs('#controllerTestOpenBtn');
  const testConnection = qs('#testConnection');
  const testBattery = qs('#testBattery');
  const testGuide = qs('#testGuide');
  const testBtnEls = {};
  if (testModal) {
    for (const el of testModal.querySelectorAll('.test-btn')) {
      testBtnEls[Number(el.dataset.btn)] = el;
    }
  }

  function updateControllerTest(snapshot) {
    if (!testModal || testModal.classList.contains('hidden')) return;
    if (!snapshot) return;

    // Verbindungsstatus
    if (testConnection) {
      testConnection.textContent = snapshot.connected ? 'Verbunden' : 'Nicht verbunden';
      testConnection.classList.toggle('ok', Boolean(snapshot.connected));
      testConnection.classList.toggle('bad', !snapshot.connected);
    }

    // Batterie
    if (testBattery) {
      const level = typeof snapshot.battery === 'number' ? snapshot.battery : 255;
      if (snapshot.connected && level >= 0 && level <= 3) {
        testBattery.hidden = false;
        const pct = level === 3 ? 100 : level === 2 ? 50 : level === 1 ? 25 : 0;
        testBattery.textContent = `Akku: ${pct}%`;
        testBattery.classList.toggle('ok', level >= 2);
        testBattery.classList.toggle('bad', level < 2);
      } else {
        testBattery.hidden = true;
      }
    }

    // Guide-Verfügbarkeit
    if (testGuide) {
      if (snapshot.guideAvailable) {
        testGuide.hidden = false;
        testGuide.textContent = 'Guide: verfügbar';
        testGuide.classList.add('ok');
        testGuide.classList.remove('bad');
      } else if (snapshot.connected) {
        testGuide.hidden = false;
        testGuide.textContent = 'Guide: nicht lesbar';
        testGuide.classList.add('bad');
        testGuide.classList.remove('ok');
      } else {
        testGuide.hidden = true;
      }
    }

    // Tasten
    if (snapshot.buttons) {
      for (let i = 0; i < 17; i += 1) {
        const el = testBtnEls[i];
        if (!el) continue;
        const pressed = Boolean(snapshot.buttons[i] && snapshot.buttons[i].pressed);
        el.classList.toggle('on', pressed);
      }
    }

    // Achsen (Balken)
    const axes = snapshot.axes || [0, 0, 0, 0];
    const axisIds = ['testLX', 'testLY', 'testRX', 'testRY'];
    const axisValIds = ['testLXVal', 'testLYVal', 'testRXVal', 'testRYVal'];
    for (let i = 0; i < 4; i += 1) {
      const fill = qs(`#${axisIds[i]}`);
      const val = qs(`#${axisValIds[i]}`);
      if (!fill || !val) continue;
      const v = Number(axes[i]) || 0;
      const pct = Math.abs(v) * 50;
      fill.style.width = `${pct}%`;
      fill.classList.toggle('negative', v < 0);
      val.textContent = v.toFixed(2);
    }

    // Trigger
    const triggers = [
      { id: 'testLT', val: 'testLTVal', value: snapshot.buttons && snapshot.buttons[6] ? snapshot.buttons[6].value : 0 },
      { id: 'testRT', val: 'testRTVal', value: snapshot.buttons && snapshot.buttons[7] ? snapshot.buttons[7].value : 0 }
    ];
    for (const t of triggers) {
      const fill = qs(`#${t.id}`);
      const val = qs(`#${t.val}`);
      if (!fill || !val) continue;
      const v = Number(t.value) || 0;
      fill.style.width = `${v * 100}%`;
      fill.classList.remove('negative');
      val.textContent = v.toFixed(2);
    }
  }

  function openControllerTest() {
    if (!testModal) return;
    testModal.classList.remove('hidden');
    // Initial-Zustand laden
    api.getGamepadState().then(updateControllerTest).catch(() => {});
  }

  // Letzte ausgelöste Controller-Aktion im Test-Fenster anzeigen.
  function updatePadAction(label) {
    const el = qs('#testLastAction');
    if (!el) return;
    el.textContent = `Letzte Aktion: ${label || '—'}`;
  }
  if (testOpenBtn) testOpenBtn.addEventListener('click', openControllerTest);
  // Zweiter Einstieg im Diagnose-Tab.
  const testOpenBtnDiag = qs('#controllerTestOpenBtnDiag');
  if (testOpenBtnDiag) testOpenBtnDiag.addEventListener('click', openControllerTest);
  if (testCloseBtn) {
    testCloseBtn.addEventListener('click', () => {
      if (testModal) testModal.classList.add('hidden');
    });
  }
  // Esc schließt das Test-Modal
  if (testModal) {
    testModal.addEventListener('click', (event) => {
      if (event.target === testModal) testModal.classList.add('hidden');
    });
  }

  // Gamepad-Status an den Test-Modus weiterreichen.
  const origUpdatePadStatus = updatePadStatus;
  updatePadStatus = (status) => {
    origUpdatePadStatus(status);
    updateControllerTest(status);
  };

  // Volle Snapshots (XInput-Bridge) direkt an das Test-Fenster
  // weiterreichen - das ist der Haupt-Pfad für die Live-Anzeige.
  function updateTestLive(snapshot) {
    if (!testModal || testModal.classList.contains('hidden')) return;
    updateControllerTest(snapshot);
  }

  return {
    open,
    close,
    isOpen: () => isOpen,
    refresh,
    setTab,
    updatePadStatus,
    updatePadButtons,
    updatePadAction,
    updateGameStatus,
    onCaptureChanged,
    updateAbout,
    updateStats: () => renderStats(),
    updateTestLive,
    updateAxes: (payload) => {
      updateAxisView(payload);
      updateCalibration(payload);
      // Test-Fenster-Achsen mitführen, solange es offen ist.
      if (testModal && !testModal.classList.contains('hidden') && payload && payload.raw) {
        const axisIds = ['testLX', 'testLY', 'testRX', 'testRY'];
        const axisValIds = ['testLXVal', 'testLYVal', 'testRXVal', 'testRYVal'];
        for (let i = 0; i < 4; i += 1) {
          const fill = qs(`#${axisIds[i]}`);
          const val = qs(`#${axisValIds[i]}`);
          if (!fill || !val) continue;
          const v = Math.max(-1, Math.min(1, Number(payload.raw[i] || 0)));
          fill.style.width = `${Math.abs(v) * 50}%`;
          fill.classList.toggle('negative', v < 0);
          val.textContent = v.toFixed(2);
        }
      }
    }
  };
}
