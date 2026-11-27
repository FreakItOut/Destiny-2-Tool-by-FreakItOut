import { clamp } from './ui.js';

// ============================================================
// Controller
// ============================================================
// Die Gamepad-API von Chromium wird direkt im Renderer abgefragt.
// Das Fenster bleibt dafür auch im Overlay-Betrieb am Leben, damit
// die Kombination zum Ein- und Ausblenden immer funktioniert.
//
// Belegung im Overlay:
//   A            Klick (auch in Webseiten)
//   B            Zurück / Overlay schließen
//   X            Neu laden
//   Y            Präzisionsmodus
//   LB / RB      Kategorie zurück / weiter (im Inventar: Tab wechseln)
//   Steuerkreuz  App: zwischen Elementen navigieren; Webseite: oben/unten scrollen, links/rechts Webseite wechseln
//   Linker Stick Cursor (rechter Stick geht auch)
//   LT / RT      Schnell scrollen
//   View         Einstellungen
//   Menu / R3    Overlay ausblenden
//   L3 + R3      Overlay ein-/ausblenden (Standard-Kombination)
// ============================================================

export const BUTTONS = [
  { label: 'A', alt: '✕' },
  { label: 'B', alt: '○' },
  { label: 'X', alt: '□' },
  { label: 'Y', alt: '△' },
  { label: 'LB', alt: 'L1' },
  { label: 'RB', alt: 'R1' },
  { label: 'LT', alt: 'L2' },
  { label: 'RT', alt: 'R2' },
  { label: 'View', alt: 'Share' },
  { label: 'Menu', alt: 'Options' },
  { label: 'L3', alt: 'L3' },
  { label: 'R3', alt: 'R3' },
  { label: 'D↑', alt: 'D↑' },
  { label: 'D↓', alt: 'D↓' },
  { label: 'D←', alt: 'D←' },
  { label: 'D→', alt: 'D→' },
  { label: 'Guide', alt: 'PS' }
];

const AXIS_DEADZONE = 0.18;

// Mindest-Haltezeit der Overlay-Taste. Kürzere Presses entstehen fast
// immer durch versehentlichen Kontakt beim Bewegen des Sticks.
export const GUIDE_MIN_HOLD_MS = 90;
// Ab dieser Haltezeit übernimmt der Langdruck (Einstellungen).
export const GUIDE_LONG_HOLD_MS = 600;
// Ab dieser Stick-Auslenkung gilt ein Guide-Signal als Fehlauslöser.
export const GUIDE_STICK_LIMIT = 0.35;

// Reine Entscheidung, ob ein Tastendruck das Overlay umschalten darf.
// Getrennt vom Controller, damit die Fälle ohne DOM prüfbar sind.
//
// - Kurze Fehlauslöser (< 90 ms) und Langdruck (>= 600 ms) schalten nie.
// - Der automatische View-Fallback (Index 8) ist gesperrt, sobald View
//   selbst belegt ist oder in der Kombination vorkommt. Dann löst View
//   nur noch seine eigene Aktion aus (z. B. Einstellungen).
// - Kommt der Guide nur aus dem Raw-Fallback (guideAvailable !== true)
//   oder über die Fallback-Taste, wird ein Druck bei ausgelenktem Stick
//   ignoriert: Genau so öffnete sich das Overlay beim Stickbewegen.
export function guideToggleAllowed(options) {
  const {
    guideAvailable,
    boundIndexes,
    combo,
    index,
    heldMs,
    stickMagnitude,
    fallback
  } = options || {};
  const held = Number(heldMs);
  if (!Number.isFinite(held) || held < GUIDE_MIN_HOLD_MS || held >= GUIDE_LONG_HOLD_MS) return false;
  const bound = (Array.isArray(boundIndexes) ? boundIndexes : []).map(Number);
  const comboKeys = (Array.isArray(combo) ? combo : []).map(Number);
  const isFallback = fallback === undefined ? Number(index) === 8 : Boolean(fallback);
  if (isFallback && (bound.includes(8) || comboKeys.includes(8))) return false;
  const stick = Math.abs(Number(stickMagnitude) || 0);
  if (stick > GUIDE_STICK_LIMIT && (guideAvailable !== true || isFallback)) return false;
  return true;
}

function padName(id) {
  return String(id || 'Controller')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52) || 'Controller';
}

// ------------------------------------------------------------
// Kalibrierung
// ------------------------------------------------------------
// Bringt die Rohwerte eines Sticks auf den Bereich -1 bis +1.
// Der Ruhepunkt des Sticks wird dabei als 0 betrachtet.

export function calibrateAxes(rawAxes, calibration) {
  const result = [0, 0, 0, 0];
  const center = (calibration && calibration.center) || [0, 0, 0, 0];
  const min = (calibration && calibration.min) || [-1, -1, -1, -1];
  const max = (calibration && calibration.max) || [1, 1, 1, 1];

  for (let i = 0; i < 4; i += 1) {
    const value = Number(rawAxes[i] || 0);
    const middle = Number(center[i] || 0);
    let low = Number(min[i]);
    let high = Number(max[i]);
    if (low > high) {
      const swap = low;
      low = high;
      high = swap;
    }
    if (!Number.isFinite(low) || !Number.isFinite(high) || high - low < 0.05) {
      result[i] = value;
      continue;
    }
    let scaled;
    if (value >= middle) {
      const range = high - middle;
      scaled = range > 0.01 ? (value - middle) / range : 0;
    } else {
      const range = middle - low;
      scaled = range > 0.01 ? -(middle - value) / range : 0;
    }
    result[i] = Math.max(-1, Math.min(1, scaled));
  }
  return result;
}

// XInput (Windows) liefert die Y-Achse positiv nach oben, die
// Gamepad-API im Browser und damit der gesamte Rest des Tools rechnen
// mit negativ = oben. Diese Umrechnung passiert genau einmal an der
// Grenze (XInput-Snapshot), damit Cursor, Scrollen und Kalibrierung
// dieselbe Richtung benutzen. Ohne sie stand der Cursor bei „oben“
// kopfüber und musste per Einstellung umgekehrt werden.
export function normalizeXInputAxes(axes) {
  const list = Array.isArray(axes) ? axes : [];
  return [0, 1, 2, 3].map((index) => {
    const value = Number(list[index] || 0);
    if (!Number.isFinite(value)) return 0;
    return index % 2 === 0 ? value : -value;
  });
}

// Reine Richtungsauswahl für die D-Pad-Fokusnavigation. Kandidaten
// sind { x, y }-Mittelpunkte; bevorzugt wird das Element, das in der
// gedrückten Richtung liegt und möglichst gut ausgerichtet ist.
export function pickDirectionalTarget(candidates, current, direction) {
  if (!current || !Array.isArray(candidates)) return null;
  const horizontal = direction === 'left' || direction === 'right';
  const sign = (direction === 'left' || direction === 'up') ? -1 : 1;
  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (!candidate || candidate === current) continue;
    const dx = Number(candidate.x) - Number(current.x);
    const dy = Number(candidate.y) - Number(current.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    const primary = horizontal ? dx : dy;
    if (primary * sign <= 4) continue;
    const secondary = horizontal ? dy : dx;
    const score = Math.abs(primary) + Math.abs(secondary) * 2.4;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export function createController(options) {
  const {
    api,
    cursorElement,
    getConfig,
    isInteractive,
    isInputBlocked,
    onToggleOverlay,
    onAction,
    onStatus,
    onButtons,
    onCaptureChanged,
    onXInput,
    onAxes
  } = options;

  let pad = null;
  let padNameText = '';
  let connected = false;
  let previous = new Array(BUTTONS.length).fill(false);

  // XInput-Bridge: liefert Controller-Daten unabhängig vom
  // Fensterfokus. Bevorzugt verwendet, weil Chromium nur an das
  // fokussierte Fenster Gamepad-Eingaben liefert.
  //
  // Die Daten kommen als Strom herein. Damit kurze Tastendrücke
  // (Drücken und Loslassen innerhalb eines Frames) nicht verloren
  // gehen, wird der Strom in einer Warteschlange abgelegt und im
  // Poll-Durchlauf der Reihe nach abgearbeitet.
  let xinputQueue = [];
  let xinputPad = null;
  let xinputSeen = false;
  // Bei „Automatisch“ den zuerst verbundenen XInput-Index festhalten,
  // damit zwei Controller den Cursor nicht abwechselnd bewegen.
  let xinputChosenIndex = null;

  function applyXInputState(snapshot) {
    if (!snapshot) return;
    const cfgNow = getConfig();
    const configuredIndex = Number(cfgNow.gamepad.controllerIndex);
    const targetIndex = Number.isInteger(configuredIndex) && configuredIndex >= 0 ? configuredIndex : null;
    const snapshotIndex = Number.isFinite(Number(snapshot.index)) ? Number(snapshot.index) : 0;
    if (targetIndex != null && snapshotIndex !== targetIndex) return;
    if (targetIndex == null) {
      if (snapshot.connected && xinputChosenIndex == null) xinputChosenIndex = snapshotIndex;
      if (snapshotIndex !== xinputChosenIndex) {
        if (!snapshot.connected && snapshotIndex === xinputChosenIndex) xinputChosenIndex = null;
        return;
      }
    }
    xinputSeen = true;
    if (typeof snapshot.guideAvailable === 'boolean') guideAvailable = snapshot.guideAvailable;
    if (typeof snapshot.triggersMirrorStick === 'boolean' && snapshot.triggersMirrorStick !== triggersMirrorStick) {
      triggersMirrorStick = snapshot.triggersMirrorStick;
      console.log('[d2] Trigger spiegeln Stick:', triggersMirrorStick);
    }
    if (snapshot.labels !== undefined && snapshot.labels !== knownLabels) {
      knownLabels = String(snapshot.labels || '');
      if (onStatus) onStatus({
        connected: true,
        name: padName('XInput Controller'),
        index: snapshot.index || 0,
        mapping: 'standard',
        labels: knownLabels,
        guideAvailable: Boolean(snapshot.guideAvailable),
        triggersMirrorStick: Boolean(snapshot.triggersMirrorStick),
        noisyAxes: snapshot.noisyAxes || []
      });
    }
    if (Array.isArray(snapshot.noisyAxes) && snapshot.noisyAxes.length) {
      const key = snapshot.noisyAxes.join(',');
      if (key !== knownNoisy) {
        knownNoisy = key;
        if (onStatus) onStatus({
          connected: true,
          name: padName('XInput Controller'),
          index: snapshot.index || 0,
          mapping: 'standard',
          labels: knownLabels,
          guideAvailable: Boolean(snapshot.guideAvailable),
          triggersMirrorStick: Boolean(snapshot.triggersMirrorStick),
          noisyAxes: snapshot.noisyAxes
        });
      }
    }
    if (!snapshot.connected) {
      xinputQueue.length = 0;
      xinputPad = null;
      return;
    }
    const pad = {
      id: snapshot.id || 'XInput Controller',
      index: snapshot.index || 0,
      mapping: 'standard',
      connected: true,
      buttons: snapshot.buttons || [],
      axes: normalizeXInputAxes(snapshot.axes),
      rawAxes: normalizeXInputAxes(snapshot.rawAxes || snapshot.axes)
    };
    // Die Warteschlange nicht unbegrenzt wachsen lassen.
    if (xinputQueue.length > 24) xinputQueue.shift();
    xinputQueue.push(pad);
    xinputPad = pad;
  }
  let comboHeld = false;
  let lastComboAt = 0;
  let lastGuideAt = 0;
  // Meldet der XInput-Treiber den Guide-Knopf zuverlässig
  // (XInputGetStateEx)? null = noch unbekannt.
  let guideAvailable = null;
  // Zweifunktion der Overlay-Einzeltaste (z. B. Guide): kurzer Druck
  // schaltet das Overlay, Halten ab 600 ms öffnet die Einstellungen.
  let toggleHeld = false;
  let toggleDownAt = 0;
  let toggleLongFired = false;
  let toggleActiveIndex = -1;
  let toggleStickMagnitude = 0;
  // LT/RT: Aktionsbelegungen nur bei steigender Flanke auslösen.
  let triggerLeftHeld = false;
  let triggerRightHeld = false;
  let lastPoll = performance.now();
  let capturing = false;
  let captured = [];
  let precision = false;
  let lastStatusAt = 0;
  let lastButtonsAt = 0;
  let lastButtonsKey = '';
  // Welche Knöpfe der Treiber kennt (wird von der Bridge gemeldet).
  let knownLabels = '';
  // Welche Achsen als defekt gemeldet wurden.
  let knownNoisy = '';
  // Spiegeln die Trigger die Stick-Bewegung?
  let triggersMirrorStick = false;
  // Letzte gefilterte Achsenrichtung (schützt vor Ausreißern).
  let smoothedAxisX = 0;
  let smoothedAxisY = 0;
  // Wurde der Guide-Knopf jemals vom Treiber gemeldet?
  let guideEverSeen = false;
  let lastScrollAt = 0;
  // Synthetische Hover-Ereignisse für App-Oberflächen (Tooltips,
  // Perk-Erklärungen) und Fokus-Navigation per D-Pad.
  let lastAppHoverTarget = null;
  let lastAppHoverAt = 0;
  let snapDirtyAt = 0;
  let appNavCacheAt = 0;
  let appNavCacheRoot = document.body;
let lastFocusedRoot = null;
let lastDpadUpAt = 0;
let lastDpadDownAt = 0;
  let cursorX = Math.max(20, window.innerWidth / 2);
  let cursorY = Math.max(20, window.innerHeight / 2);
  let cursorVisible = false;
  let cursorUsedAt = 0;
  let repeatState = {};
  let destroyed = false;
  let lastPadInputAt = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function setCursorVisible(visible) {
    if (!cursorElement) return;
    cursorVisible = visible;
    cursorElement.classList.toggle('hidden', !visible);
    cursorElement.classList.toggle('precision', precision);
    document.body.classList.toggle('pad-active', visible);
  }

  // Größte Stick-Auslenkung (0..1) im Moment des Tastendrucks. Der
  // Guide-Schutz nutzt sie, um Fehlauslöser beim Spielen zu erkennen.
  function stickMagnitudeNow() {
    const rawAxes = (pad && pad.rawAxes && pad.rawAxes.length === 4)
      ? pad.rawAxes
      : (pad && Array.isArray(pad.axes) ? pad.axes : []);
    const left = Math.hypot(Number(rawAxes[0] || 0), Number(rawAxes[1] || 0));
    const right = Math.hypot(Number(rawAxes[2] || 0), Number(rawAxes[3] || 0));
    return Math.max(left, right);
  }

  function positionCursor() {
    if (!cursorElement) return;
    cursorElement.style.left = `${Math.round(cursorX)}px`;
    cursorElement.style.top = `${Math.round(cursorY)}px`;
  }

  // Cursor-Magnet-Snap: klickbare Oberflächenelemente werden alle
  // ~800 ms erfasst; bewegt sich der Cursor in deren Nähe, wird er
  // sanft auf die Elementmitte gezogen.
  const SNAP_RADIUS = 34;
  let snapCandidates = [];
  let snapCacheAt = 0;

  function refreshSnapCandidates() {
    try {
      const nodes = document.querySelectorAll('button, a, select, input, textarea, [role="button"]');
      const list = [];
      for (const node of nodes) {
        if (list.length >= 400) break;
        if (node.disabled || node.hidden) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
        list.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      snapCandidates = list;
    } catch (error) {
      snapCandidates = [];
    }
  }

  function nearestSnapTarget(x, y) {
    let best = null;
    let bestDistance = SNAP_RADIUS;
    for (const candidate of snapCandidates) {
      const dx = candidate.x - x;
      const dy = candidate.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  // Nach UI-Änderungen (Inventar neu gerendert, Dialog geöffnet) die
  // Snap-Liste schneller verwerfen, damit der Cursor sofort einrastet.
  let snapObserver = null;
  try {
    snapObserver = new MutationObserver(() => { snapDirtyAt = performance.now(); });
    snapObserver.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    // egal
  }

  function showCursor() {
    cursorUsedAt = performance.now();
    setCursorVisible(true);
  }

  function hideCursor() {
    if (lastAppHoverTarget) {
      try {
        lastAppHoverTarget.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: null }));
      } catch (error) {
        // egal
      }
      lastAppHoverTarget = null;
    }
    setCursorVisible(false);
  }

  function resetCursor(force) {
    // Position beim erneuten Öffnen des Overlays beibehalten, damit
    // der Controller-Cursor nicht jedes Mal in die Mitte springt.
    if (!force && cursorX > 6 && cursorY > 6 && cursorX < window.innerWidth - 6 && cursorY < window.innerHeight - 6) {
      positionCursor();
      return;
    }
    const element = null;
    if (element) {
      const rect = element.getBoundingClientRect();
      cursorX = rect.left + rect.width / 2;
      cursorY = rect.top + rect.height / 2;
    } else {
      cursorX = window.innerWidth / 2;
      cursorY = window.innerHeight / 2;
    }
    positionCursor();
  }

  // Klick-Ripple: kleiner Kreis am Cursor bei jedem A-Klick - die
  // visuelle Bestätigung, dass der Controller-Klick sauber saß.
  function spawnRipple() {
    try {
      const ripple = document.createElement('div');
      ripple.className = 'pad-ripple';
      ripple.style.left = `${Math.round(cursorX)}px`;
      ripple.style.top = `${Math.round(cursorY)}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);
    } catch (error) {
      // egal
    }
  }

  function rumble(strength = 0.5, duration = 120) {
    if (!getConfig().gamepad.rumble) return;
    const profile = getConfig().gamepad.hapticProfile || 'standard';
    if (profile === 'off') return;
    const multiplier = profile === 'soft' ? 0.5 : profile === 'strong' ? 1.6 : 1;
    strength = clamp(strength * multiplier, 0, 1);
    // XInput-Bridge kann direkt vibrieren (auch ohne Fensterfokus).
    if (xinputPad) {
      try {
        if (api && typeof api.rumble === 'function') {
          api.rumble(clamp(strength, 0, 1), duration);
          return;
        }
      } catch (error) {
        // ignorieren
      }
    }
    if (!pad || !pad.vibrationActuator) return;
    try {
      pad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude: clamp(strength * 0.6, 0, 1),
        strongMagnitude: clamp(strength, 0, 1)
      });
    } catch (error) {
      // Nicht jeder Controller kann vibrieren.
    }
  }

  function topElementAt(x, y) {
    return document.elementFromPoint(x, y);
  }

  // Bekannte scrollbare Bereiche im Tool. `closest` findet den nächsten
  // Treffer; reicht dessen Höhe nicht, sucht findScrollableAncestor den
  // nächsten echten Scroll-Vorfahren (overflow-y auto/scroll).
  const SCROLLABLE_SELECTOR = [
    '.inv-popup',
    '.inv-dw-sheet-body',
    '.inv-dw-sheet',
    '.inv-dw-body',
    '.inv-dw-backdrop',
    '.champion-audit',
    '.loadout-queue-panel',
    '.inventory-outbox-panel',
    '.hud-editor',
    '.notes-textarea',
    '.notes-panel',
    '.dashboard',
    '#dashboardPanel',
    '.dash-card',
    '.inventory-tools-tab',
    '.inventory-editor-tab',
    '.inventory-body',
    '#inventoryBody',
    '.settings-panels',
    '.modal-card'
  ].join(', ');

  // Scroll-Ziele in Vorrangreihenfolge für den zweiten Stick. Offene
  // Dialoge/Panels stehen vor dem Hintergrund, damit der Stick nicht
  // das verdeckte Inventar bewegt.
  const SCROLL_PRIORITY = [
    '.inv-popup-backdrop.open .inv-popup',
    '.inv-dw-backdrop:not(.hidden) .inv-dw-sheet:not(.hidden) .inv-dw-sheet-body',
    '.inv-dw-backdrop:not(.hidden) .inv-dw-body',
    '#championAuditPanel:not(.hidden)',
    '#loadoutQueuePanel:not(.hidden)',
    '#inventoryOutboxPanel:not(.hidden)',
    '#hudEditorPanel:not(.hidden)',
    '#notesPanel:not(.hidden) .notes-textarea',
    '.modal:not(.hidden) .settings-panels',
    '.modal:not(.hidden) .modal-card',
    '#inventoryView:not(.hidden) .inventory-editor-tab:not(.hidden)',
    '#inventoryView:not(.hidden) .inventory-tools-tab:not(.hidden)',
    '#dashboardPanel:not(.hidden)',
    '#inventoryView:not(.hidden) .inventory-body'
  ];

  function isScrollableOverflow(element) {
    let style;
    try { style = getComputedStyle(element); } catch (error) { return false; }
    const overflowY = style ? String(style.overflowY || '') : '';
    return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  }

  // Kann dieses Element vertikal scrollen? Textareas scrollen auch ohne
  // explizites overflow-y in der eigenen CSS-Regel.
  function canScrollVertically(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.scrollHeight <= element.clientHeight + 1) return false;
    if (element.tagName === 'TEXTAREA') return true;
    return isScrollableOverflow(element);
  }

  function findScrollableAncestor(element) {
    let node = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (canScrollVertically(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Wenn der Cursor auf dem Rand/Backdrop eines Panels liegt, gibt es
  // keinen scrollbaren Vorfahren. Dann den eigentlichen Inhalt nehmen.
  function panelScrollFallback(element) {
    if (!element || !element.closest) return null;
    const sheet = element.closest('.inv-dw-sheet:not(.hidden)');
    if (sheet) {
      const body = sheet.querySelector('.inv-dw-sheet-body');
      if (body && canScrollVertically(body)) return body;
    }
    const backdrop = element.closest('.inv-dw-backdrop:not(.hidden)');
    if (backdrop) {
      const body = backdrop.querySelector('.inv-dw-body') || backdrop.querySelector('.inv-dw-sheet-body');
      if (body && canScrollVertically(body)) return body;
    }
    const card = element.closest('.modal:not(.hidden) .modal-card');
    if (card) {
      const panels = card.querySelector('.settings-panels');
      if (panels && canScrollVertically(panels)) return panels;
    }
    const notes = element.closest('#notesPanel:not(.hidden)');
    if (notes) {
      const text = notes.querySelector('.notes-textarea');
      if (text && canScrollVertically(text)) return text;
    }
    return null;
  }

  function scrollContainerFor(element) {
    if (!element) return null;
    let known = null;
    try { known = element.closest(SCROLLABLE_SELECTOR); } catch (error) { known = null; }
    if (known && canScrollVertically(known)) return known;
    return findScrollableAncestor(element) || panelScrollFallback(element);
  }

  function scrollAtCursor(direction) {
    const now = performance.now();
    if (now - lastScrollAt < 85) return;
    lastScrollAt = now;

    const element = topElementAt(cursorX, cursorY);
    const scrollable = scrollContainerFor(element);
    if (scrollable) scrollable.scrollBy({ top: direction * 140, behavior: 'smooth' });
  }

  // Kontinuierliches Scrollen mit dem zweiten Analog-Stick.
  function scrollWithStick(axisY, dt) {
    const cfgNow = getConfig();
    const speed = clamp(Number(cfgNow.gamepad.scrollSpeed) || 980, 150, 3000);
    const amount = axisY * speed * dt;
    if (Math.abs(amount) < 0.5) return;
    // Offene Panels zuerst (sie haben einen eigenen Scrollbereich).
    // Das erste sichtbare Panel verbraucht den Stick, damit nicht das
    // dahinterliegende Inventar mitwandert.
    for (const selector of SCROLL_PRIORITY) {
      let element = null;
      try { element = document.querySelector(selector); } catch (error) { element = null; }
      if (!element) continue;
      const target = canScrollVertically(element) ? element : panelScrollFallback(element);
      if (target) target.scrollTop += amount;
      return;
    }
    const element = topElementAt(cursorX, cursorY);
    const scrollable = scrollContainerFor(element);
    if (scrollable) scrollable.scrollTop += amount;
  }

  function clickAtCursor() {
    const element = topElementAt(cursorX, cursorY);
    if (!element) return;

    // Ein natives <select> lässt sich per Controller so nicht
    // bedienen. Deshalb schaltet A dort einfach zur nächsten Option.
    if (element.tagName === 'SELECT') {
      const index = element.selectedIndex;
      const next = (index + 1) % Math.max(1, element.options.length);
      element.selectedIndex = next;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      showCursor();
      return;
    }

    if (element.tagName === 'INPUT' && element.type === 'range') {
      const rect = element.getBoundingClientRect();
      const min = Number(element.min || 0);
      const max = Number(element.max || 100);
      const ratio = clamp((cursorX - rect.left) / Math.max(1, rect.width), 0, 1);
      element.value = String(min + ratio * (max - min));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      showCursor();
      return;
    }

    const target = element.closest('button, a, select, input, textarea, label, [role="button"], [tabindex]') || element;
    try {
      target.focus({ preventScroll: true });
    } catch (error) {
      // nicht fokussierbar
    }
    try {
      target.click();
    } catch (error) {
      // egal
    }
    // Suche im Inventar: A auf dem Suchfeld öffnet die virtuelle Tastatur.
    try {
      if (target.matches && target.matches('#inventorySearch, [data-pad-keyboard]')) {
        window.dispatchEvent(new CustomEvent('d2-open-keyboard'));
      }
    } catch (error) {
      // egal
    }
    showCursor();
  }

  // Hover in der App-Oberfläche: der Controller-Cursor ist nur ein
  // DOM-Element, er erzeugt von sich aus keine mouseover-Ereignisse.
  // Ohne diese synthetischen Ereignisse würden Item-Tooltips und die
  // Perk-Erklärungen mit dem Controller nie erscheinen.
  function sendAppHover(force) {
    if (!cursorVisible) return;
    const now = performance.now();
    if (!force && now - lastAppHoverAt < 90) return;
    lastAppHoverAt = now;
    const element = document.elementFromPoint(cursorX, cursorY);
    if (!element) return;
    if (lastAppHoverTarget && !lastAppHoverTarget.isConnected) lastAppHoverTarget = null;
    if (element !== lastAppHoverTarget) {
      const previous = lastAppHoverTarget;
      if (previous) {
        try {
          previous.dispatchEvent(new MouseEvent('mouseout', {
            bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY, relatedTarget: element
          }));
        } catch (error) {
          // egal
        }
      }
      try {
        element.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY, relatedTarget: previous || null
        }));
      } catch (error) {
        // egal
      }
      lastAppHoverTarget = element;
    }
    try {
      element.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true, clientX: cursorX, clientY: cursorY
      }));
    } catch (error) {
      // egal
    }
  }

  // Aktiver App-Bereich: Inventar, Dashboard, Dialoge und die
  // Inventar-Unterdialoge. Dort navigiert das D-Pad per Fokus; auf
  // Webseiten bleibt es beim Scrollen/Seitenwechsel.
  function appNavRoot(force) {
    const now = performance.now();
    if (!force && now - appNavCacheAt < 200) return appNavCacheRoot;
    appNavCacheAt = now;
    const selectors = [
      '#notificationPanel.open',
      '.inv-quickmenu.open',
      '.inv-pad-kb.open',
      '.inv-confirm-backdrop.open',
      '.radial-menu:not(.hidden)',
      '.inv-popup-backdrop.open',
      '.inv-compare-backdrop.open',
      '.inv-dw-sheet:not(.hidden)',
      '.inv-dw-backdrop:not(.hidden)',
      '.modal:not(.hidden) .modal-card',
      '.modal:not(.hidden)',
      '#notesPanel:not(.hidden)'
    ];
    // Inventar und Dashboard bewusst NICHT als eigenen Root nehmen:
    // sonst sind Titelleiste, Toolbar und Overlay-Leiste für den
    // Controller unerreichbar. Versteckte Panels werden in
    // appNavCandidates ohnehin herausgefiltert.
    let root = document.body;
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) { root = element; break; }
      } catch (error) {
        // egal
      }
    }
    appNavCacheRoot = root;
    return root;
  }

  function appNavCandidates(root) {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const result = [];
    for (const element of root.querySelectorAll(selector)) {
      if (element.disabled || element.hidden) continue;
      if (element.closest('.pad-cursor, .pad-ripple')) continue;
      let style;
      try { style = getComputedStyle(element); } catch (error) { continue; }
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) continue;
      // Ausgeblendete Items im zusammengeklappten Tresor nicht
      // fokussierbar machen (der Aufklapper bleibt erreichbar).
      const clip = element.closest('.dinv-vault-body.collapsed');
      if (clip) {
        const clipRect = clip.getBoundingClientRect();
        if (rect.top >= clipRect.bottom - 2) continue;
      }
      result.push({ element, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    return result;
  }

  function focusKeyOf(element) {
    if (!element) return '';
    return element.id || element.dataset.toolView || element.dataset.dashAction || element.dataset.tab || element.dataset.collectionTab || (element.textContent || '').trim().slice(0, 40);
  }

  function focusRootId(element) {
    const root = element && element.closest ? element.closest('#dashboardPanel, #inventoryView, #settingsModal, .modal:not(.hidden)') : null;
    return root ? (root.id || 'modal') : 'app';
  }

  function saveFocusMemory(element) {
    try {
      const map = JSON.parse(window.localStorage.getItem('d2tool.focusMemory') || '{}');
      map[focusRootId(element)] = focusKeyOf(element);
      window.localStorage.setItem('d2tool.focusMemory', JSON.stringify(map));
    } catch (error) { /* egal */ }
  }

  function restoreFocusMemory(root, candidates) {
    try {
      const map = JSON.parse(window.localStorage.getItem('d2tool.focusMemory') || '{}');
      const key = map[root.id || 'modal'];
      if (!key) return null;
      return candidates.find((candidate) => focusKeyOf(candidate.element) === key) || null;
    } catch (error) { return null; }
  }

  function focusAppCandidate(candidate) {
    if (!candidate) return;
    try { candidate.element.focus({ preventScroll: true }); } catch (error) { /* egal */ }
    saveFocusMemory(candidate.element);
    try { candidate.element.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (error) { /* egal */ }
    const rect = candidate.element.getBoundingClientRect();
    cursorX = clamp(rect.left + rect.width / 2, 6, window.innerWidth - 6);
    cursorY = clamp(rect.top + rect.height / 2, 6, window.innerHeight - 6);
    positionCursor();
    showCursor();
    sendAppHover(true);
  }

  function navigateFocus(direction) {
    const root = appNavRoot(true);
    // document.body ist inzwischen der normale Root für Inventar und
    // Dashboard; versteckte Bereiche filtert appNavCandidates heraus.
    // Sofort den Pad-Modus aktivieren: dadurch werden alle Inventar-
    // Zeilen gelayoutet (content-visibility) und der Fokusring sichtbar.
    showCursor();
    const horizontal = direction === 'left' || direction === 'right';
    const activeElement = document.activeElement;
    // Slider und Auswahlfelder mit links/rechts direkt bedienen,
    // statt den Fokus zu verschieben.
    if (horizontal && activeElement) {
      if (activeElement.tagName === 'INPUT' && activeElement.type === 'range') {
        const step = Number(activeElement.step) || 1;
        const min = Number(activeElement.min) || 0;
        const max = Number(activeElement.max) || 100;
        const next = clamp(Number(activeElement.value) + (direction === 'right' ? step : -step), min, max);
        activeElement.value = String(next);
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (activeElement.tagName === 'SELECT' && activeElement.options.length) {
        const nextIndex = clamp(activeElement.selectedIndex + (direction === 'right' ? 1 : -1), 0, activeElement.options.length - 1);
        if (nextIndex !== activeElement.selectedIndex) {
          activeElement.selectedIndex = nextIndex;
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
          activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      }
    }
    const list = appNavCandidates(root);
    if (!list.length) return false;
    let current = list.find((candidate) => candidate.element === activeElement || candidate.element.contains(activeElement)) || null;
    if (!current) {
      // Beim Öffnen eines Dialogs liegt der Fokus oft noch auf einem
      // Element dahinter: dann den nächsten Kandidaten im Dialog nehmen.
      let nearest = null;
      let nearestDistance = 220;
      for (const candidate of list) {
        const distance = Math.hypot(candidate.x - cursorX, candidate.y - cursorY);
        if (distance < nearestDistance) { nearestDistance = distance; nearest = candidate; }
      }
      current = nearest || list[0];
    }
    if (!current) return false;
    const best = pickDirectionalTarget(list, current, direction);
    if (!best) return false;
    focusAppCandidate(best);
    return true;
  }

  function triggerCombo() {
    const now = performance.now();
    if (now - lastComboAt < 800) return;
    lastComboAt = now;
    rumble(0.6);
    if (onToggleOverlay) onToggleOverlay();
  }

  function emitButtons(pressed) {
    const now = performance.now();
    const key = pressed.map((value) => (value ? '1' : '0')).join('');
    if (key === lastButtonsKey && now - lastButtonsAt < 500) return;
    lastButtonsKey = key;
    lastButtonsAt = now;
    if (onButtons) onButtons(pressed.slice());
  }

  function handleCapture(pressed) {
    let changed = false;
    for (let i = 0; i < pressed.length; i += 1) {
      if (pressed[i] && !previous[i] && !captured.includes(i) && captured.length < 4) {
        captured.push(i);
        changed = true;
      }
    }
    if (changed) {
      if (onCaptureChanged) onCaptureChanged(captured.slice(), captured.map((i) => BUTTONS[i]?.label || String(i)));
      emitButtons(pressed);
    }
  }

  function handleRepeat(button, active, action, initialDelay = 330, interval = 140) {
    const now = performance.now();
    if (!active) {
      delete repeatState[button];
      return;
    }
    const state = repeatState[button];
    if (!state) {
      repeatState[button] = { next: now + initialDelay };
      action();
      return;
    }
    if (now >= state.next) {
      state.next = now + interval;
      action();
    }
  }

  function poll() {
    if (destroyed) return;
    const now = performance.now();
    const dt = clamp(now - lastPoll, 0, 60) / 1000;
    lastPoll = now;

    // XInput hat Vorrang: die Daten kommen aus einem eigenen Prozess
    // und sind nicht an den Fensterfokus gebunden. Die Warteschlange
    // wird der Reihe nach abgearbeitet, damit kurze Tastendrücke
    // nicht verloren gehen.
    //
    // Wichtig: Der Helfer meldet nur Änderungen. Solange sich nichts
    // ändert, bleibt die Warteschlange leer. Dann muss der zuletzt
    // bekannte Zustand weiterverwendet werden – sonst fällt das Tool
    // auf die Browser-API zurück (die ohne Fensterfokus leer ist) und
    // der Cursor verschwindet sofort wieder.
    if (xinputQueue.length) {
      const queue = xinputQueue.slice();
      xinputQueue.length = 0;
      // Tastendrücke in der ganzen Warteschlange auswerten, damit
      // kurze Drücke nicht verloren gehen. Den Cursor aber nur einmal
      // pro Durchlauf bewegen (sonst springt er).
      for (let i = 0; i < queue.length; i += 1) {
        if (destroyed) return;
        const isLast = i === queue.length - 1;
        handlePadState(queue[i], now, isLast ? dt : 0);
      }
      return;
    }

    if (xinputPad) {
      // Letzter bekannter XInput-Zustand (der Stick steht still).
      handlePadState(xinputPad, now, dt);
      return;
    }

    let nextPad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const cfgNow = getConfig();
      const configuredIndex = Number(cfgNow.gamepad.controllerIndex);
      const targetIndex = Number.isInteger(configuredIndex) && configuredIndex >= 0 ? configuredIndex : null;
      for (const candidate of pads) {
        if (!candidate || !candidate.connected) continue;
        if (targetIndex != null && candidate.index !== targetIndex) continue;
        nextPad = candidate;
        break;
      }
    } catch (error) {
      nextPad = null;
    }

    if (!nextPad) {
      if (connected) {
        connected = false;
        pad = null;
        padNameText = '';
        previous = new Array(BUTTONS.length).fill(false);
        hideCursor();
        if (onStatus) onStatus({ connected: false, name: '', index: null });
      }
      return;
    }

    handlePadState(nextPad, now, dt);
  }

  function handlePadState(padState, now, dt) {
    pad = padState;
    const name = padName(pad.id);
    if (!connected || name !== padNameText) {
      connected = true;
      padNameText = name;
      if (onStatus) onStatus({ connected: true, name, index: pad.index, mapping: pad.mapping });
    }

    const cfg = getConfig();
    const enabled = cfg.gamepad.enabled !== false;
    const pressed = [];
    for (let i = 0; i < BUTTONS.length; i += 1) {
      const button = pad.buttons[i];
      if (!button) {
        pressed[i] = false;
        continue;
      }
      // "pressed" wird von der XInput-Bridge direkt gesetzt; die
      // Browser-API liefert bei den analogen Triggern nur den Wert.
      pressed[i] = Boolean(button.pressed) || button.value > 0.5;
    }

    if (!enabled) {
      previous = pressed;
      hideCursor();
      if (now - lastButtonsAt > 500) emitButtons(pressed);
      return;
    }

    // Controller-Test-Modus: Das Test-Fenster ist ein reines Anzeige-
    // fenster. Solange es offen ist, wird nichts bedient - kein Cursor,
    // keine Klicks, kein Scrollen, keine Overlay-Toggles. Nur die
    // Tasten-/Achsen-Anzeigen laufen weiter (auch die hinter dem
    // Test-Fenster, damit beide Raster aktuell bleiben).
    if (isInputBlocked && isInputBlocked()) {
      emitButtons(pressed);
      // Combo-Zustand weiterführen, damit direkt nach dem Schließen
      // des Test-Fensters kein noch gehaltener Combo-Befehl auslöst.
      const comboBlocked = (cfg.gamepad.combo || []).map(Number);
      comboHeld = comboBlocked.length > 0 && comboBlocked.every((index) => pressed[index]);
      if (typeof onAxes === 'function') {
        const rawBlocked = (pad.rawAxes && pad.rawAxes.length === 4) ? pad.rawAxes : (pad.axes || []);
        onAxes({
          raw: [Number(rawBlocked[0] || 0), Number(rawBlocked[1] || 0), Number(rawBlocked[2] || 0), Number(rawBlocked[3] || 0)],
          calibrated: calibrateAxes(rawBlocked, cfg.gamepad.calibration)
        });
      }
      previous = pressed;
      hideCursor();
      return;
    }

    const just = pressed.map((value, index) => value && !previous[index]);
    if (just[16]) guideEverSeen = true;
    const combo = (cfg.gamepad.combo || []).map(Number);

    if (capturing) {
      handleCapture(pressed);
      emitButtons(pressed);
      previous = pressed;
      return;
    }

    const comboDown = combo.length > 0 && combo.every((index) => pressed[index]);
    if (comboDown && !comboHeld) triggerCombo();
    comboHeld = comboDown;

    // Eine einzelne Taste blendet das Overlay ein und aus. Standard
    // ist die Guide-Taste (Index 16). Unter den Einstellungen lässt
    // sich jede andere Taste wählen - praktisch auf Xbox-360-Pads,
    // bei denen XInput den Guide-Knopf nicht meldet.
    //
    // Zweifunktion: kurzer Druck (< 600 ms) schaltet das Overlay,
    // Halten ab 600 ms öffnet die Einstellungen (abschaltbar über
    // gamepad.toggleLongPressSettings).
    const toggleButton = Number(cfg.gamepad.toggleButton) || 0;
    const toggleIndex = toggleButton > 0 ? toggleButton : (cfg.gamepad.guideToggle !== false ? 16 : 0);
    // Belegte Tasten (ohne -1). Der View-Fallback ist nur erlaubt, wenn
    // View nicht selbst eine Aktion hat und nicht in der Kombination
    // vorkommt - sonst würde View gleichzeitig Einstellungen öffnen
    // und das Overlay umschalten.
    const boundIndexes = Object.values(cfg.gamepad.bindings || {})
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 16);
    // Guide-Fallback (Xbox-360): View-Taste übernimmt, wenn der
    // Treiber den Guide-Knopf gar nicht meldet.
    const guideReported = guideAvailable === true || guideEverSeen;
    const guideFallback = toggleIndex === 16 && !guideReported &&
      !boundIndexes.includes(8) && !combo.includes(8);

    let activeToggle = -1;
    if (!capturing && toggleIndex > 0 && pressed[toggleIndex] && !combo.includes(toggleIndex)) {
      activeToggle = toggleIndex;
    } else if (!capturing && guideFallback && pressed[8]) {
      activeToggle = 8;
    }

    if (activeToggle > 0) {
      if (!toggleHeld) {
        toggleHeld = true;
        toggleDownAt = now;
        toggleLongFired = false;
        toggleActiveIndex = activeToggle;
        toggleStickMagnitude = stickMagnitudeNow();
      }
      if (cfg.gamepad.toggleLongPressSettings !== false && !toggleLongFired && now - toggleDownAt >= 600) {
        toggleLongFired = true;
        rumble(0.25, 80);
        if (onAction) onAction('settings');
      }
    } else if (toggleHeld) {
      toggleHeld = false;
      const heldMs = now - toggleDownAt;
      const allowed = !toggleLongFired && guideToggleAllowed({
        guideAvailable,
        boundIndexes,
        combo,
        index: toggleActiveIndex,
        heldMs,
        stickMagnitude: toggleStickMagnitude,
        fallback: toggleActiveIndex === 8 && toggleIndex === 16
      });
      if (allowed && now - lastGuideAt > 800) {
        lastGuideAt = now;
        rumble(0.6);
        if (onToggleOverlay) onToggleOverlay();
      }
    }

    emitButtons(pressed);

    // Solange die Kombination gehalten wird, keine Einzelaktionen
    // auslösen. Sonst würde z. B. R3 zusätzlich das Overlay
    // ausblenden, obwohl die Kombination es gerade einschaltet.
    if (comboDown) {
      previous = pressed;
      return;
    }

    const interactive = Boolean(isInteractive && isInteractive());

    // Achsen kalibrieren: der Ruhepunkt wird auf 0 gelegt, die
    // Endpunkte auf -1 und +1. Damit stimmt die Richtung und der
    // Weg unabhängig vom Controller.
    // Rohwerte (ungefiltert) kommen vom Helfer und dienen der
    // Kalibrierung. Ohne sie werden die gefilterten Werte genutzt.
    const rawAxes = (pad.rawAxes && pad.rawAxes.length === 4) ? pad.rawAxes : (pad.axes || []);
    const axes = calibrateAxes(rawAxes, cfg.gamepad.calibration);

    // Rohwerte für die Kalibrierungsanzeige melden.
    if (typeof onAxes === 'function') {
      onAxes({
        raw: [Number(rawAxes[0] || 0), Number(rawAxes[1] || 0), Number(rawAxes[2] || 0), Number(rawAxes[3] || 0)],
        calibrated: axes
      });
    }

    // Achsen tauschen / umkehren (manche Controller liefern es
    // gespiegelt). Die Einstellungen erlauben beides.
    let ax0 = axes[0];
    let ay0 = axes[1];
    let ax1 = axes[2];
    let ay1 = axes[3];
    if (cfg.gamepad.swapAxes) {
      const tmpX = ax0;
      ax0 = ay0;
      ay0 = tmpX;
      const tmpX2 = ax1;
      ax1 = ay1;
      ay1 = tmpX2;
    }
    if (cfg.gamepad.invertX) {
      ax0 = -ax0;
      ax1 = -ax1;
    }
    if (cfg.gamepad.invertY) {
      ay0 = -ay0;
      ay1 = -ay1;
    }

    // Cursor bewegen. Welcher Stick steuert, ist einstellbar:
    // Standard nur der linke. "auto" (der stärkere Ausschlag) ist bei
    // einem defekten zweiten Stick gefährlich - dessen Phantomsignal
    // gewinnt, sobald der erste Stick ruht, und der Cursor läuft von
    // allein davon.
    let axisX = 0;
    let axisY = 0;
    const choice = cfg.gamepad.stickChoice || 'left';
    if (choice === 'left') {
      axisX = ax0 || 0;
      axisY = ay0 || 0;
    } else if (choice === 'right') {
      axisX = ax1 || 0;
      axisY = ay1 || 0;
    } else {
      const stickPairs = cfg.gamepad.leftHanded
        ? [[ax1 || 0, ay1 || 0], [ax0 || 0, ay0 || 0]]
        : [[ax0 || 0, ay0 || 0], [ax1 || 0, ay1 || 0]];
      for (const [x, y] of stickPairs) {
        if (Math.hypot(x, y) > Math.hypot(axisX, axisY)) {
          axisX = x;
          axisY = y;
        }
      }
    }
    // Deadzone: global einstellbar.
    const deadzone = clamp(Number(cfg.gamepad.deadzone), 0.05, 0.6);
    const dead = (value) => (Math.abs(value) < deadzone ? 0 : (value - Math.sign(value) * deadzone) / (1 - deadzone));
    const scrollDeadzoneValue = Number(cfg.gamepad.scrollDeadzone) > 0
      ? clamp(Number(cfg.gamepad.scrollDeadzone), 0.05, 0.6)
      : deadzone;
    const deadScroll = (value) => (Math.abs(value) < scrollDeadzoneValue
      ? 0
      : (value - Math.sign(value) * scrollDeadzoneValue) / (1 - scrollDeadzoneValue));
    const curveValue = (value) => cfg.gamepad.curve === 'expo'
      ? Math.sign(value) * Math.pow(Math.abs(value), 1.6)
      : value;
    axisX = curveValue(dead(axisX));
    axisY = curveValue(dead(axisY));
    // Zweiter Stick (standardmäßig der rechte, wenn links den Cursor
    // steuert) scrollt seitenweise durch Inventar und Dialoge.
    const scrollStickY = choice === 'right'
      ? ay0
      : choice === 'left'
        ? ay1
        : (Math.abs(ay0) > Math.abs(ay1) ? ay1 : ay0);
    let scrollAxisY = curveValue(deadScroll(scrollStickY));
    if (cfg.gamepad.scrollInvert === true) scrollAxisY = -scrollAxisY;

    // Zweite Sicherung gegen Ausreißer: Ein einzelner Ausreißer
    // soll den Cursor nicht springen lassen. Der Wert muss in
    // derselben Richtung bleiben, dann wird er übernommen.
    if (Math.sign(axisX) !== Math.sign(smoothedAxisX) && smoothedAxisX !== 0) axisX = 0;
    if (Math.sign(axisY) !== Math.sign(smoothedAxisY) && smoothedAxisY !== 0) axisY = 0;
    smoothedAxisX = axisX;
    smoothedAxisY = axisY;

    const moved = Math.abs(axisX) > 0.001 || Math.abs(axisY) > 0.001;
    if (moved || pressed.some(Boolean)) lastPadInputAt = now;
    // Rechter (bzw. freier) Stick: scrollen. Unabhängig vom Cursor.
    if (interactive && Math.abs(scrollAxisY) > 0.01) {
      scrollWithStick(scrollAxisY, dt);
    }

    if (interactive && moved) {
      const speed = clamp(cfg.gamepad.speed, 150, 3000) * (precision ? 0.35 : 1);
      cursorX = clamp(cursorX + axisX * speed * dt, 6, window.innerWidth - 6);
      cursorY = clamp(cursorY + axisY * speed * dt, 6, window.innerHeight - 6);
      // Magnet-Snap.
      if (cfg.gamepad.cursorSnap !== false) {
        if (now - snapCacheAt > 300 || snapDirtyAt > snapCacheAt) {
          snapCacheAt = now;
          refreshSnapCandidates();
        }
        const snapTarget = nearestSnapTarget(cursorX, cursorY);
        if (snapTarget) {
          cursorX += (snapTarget.x - cursorX) * 0.35;
          cursorY += (snapTarget.y - cursorY) * 0.35;
        }
      }
      positionCursor();
      showCursor();
      sendAppHover();
    } else if (!interactive) {
      hideCursor();
    }

    if (!interactive) {
      previous = pressed;
      return;
    }

    if (cursorVisible && now - cursorUsedAt > 6000 && !moved) {
      // Nach kurzer Ruhe den Cursor nicht dauerhaft einblenden.
      // Im Overlay bleibt er stehen: dort wird mit dem Controller
      // gearbeitet, nicht mit der Maus.
      const anyPressed = pressed.some(Boolean);
      const overlayMode = document.body.classList.contains('mode-overlay');
      if (!anyPressed && !overlayMode) hideCursor();
    }

    // Die Belegung ist frei wählbar: jede Aktion kann an eine
    // beliebige Taste gebunden werden. -1 = nicht belegt; die
    // A-Taste hat den Index 0 und ist eine gültige Wahl.
    const bind = cfg.gamepad.bindings || {};
    const clickButton = Number.isInteger(Number(bind.click)) ? Number(bind.click) : 0;
    const backButton = Number.isInteger(Number(bind.back)) ? Number(bind.back) : -1;
    const reloadButton = Number.isInteger(Number(bind.reload)) ? Number(bind.reload) : -1;
    const precisionButton = Number.isInteger(Number(bind.precision)) ? Number(bind.precision) : -1;
    const categoryPrevButton = Number.isInteger(Number(bind.categoryPrev)) ? Number(bind.categoryPrev) : -1;
    const categoryNextButton = Number.isInteger(Number(bind.categoryNext)) ? Number(bind.categoryNext) : -1;
    const settingsButton = Number.isInteger(Number(bind.settings)) ? Number(bind.settings) : -1;
    const hideButton = Number.isInteger(Number(bind.hide)) ? Number(bind.hide) : -1;
    const notesButton = Number.isInteger(Number(bind.notes)) ? Number(bind.notes) : -1;
    const hudButton = Number.isInteger(Number(bind.hud)) ? Number(bind.hud) : -1;

    // Klick: löst die App-Oberfläche direkt an der Cursorposition aus.
    if (clickButton >= 0 && just[clickButton]) {
      console.log('[d2] klick down', Math.round(cursorX), Math.round(cursorY), 'taste=' + clickButton);
      spawnRipple();
      if (cfg.gamepad.hapticSwitch === true) rumble(0.12, 24);
      sendAppHover(true);
      clickAtCursor();
    }
    if (backButton >= 0 && just[backButton] && onAction) onAction('back');
    if (reloadButton >= 0 && just[reloadButton] && onAction) onAction('reload');
    if (precisionButton >= 0 && just[precisionButton]) {
      // Im Item-Popup ist Y „Anlegen“ statt Präzisionsmodus.
      if (document.querySelector('.inv-popup-backdrop.open')) {
        if (onAction) onAction('precision', precision);
        if (cfg.gamepad.hapticSwitch === true) rumble(0.12, 30);
      } else {
        precision = !precision;
        if (cursorElement) cursorElement.classList.toggle('precision', precision);
        rumble(0.2, 60);
        if (onAction) onAction('precision', precision);
      }
    }
    if (categoryPrevButton >= 0 && just[categoryPrevButton] && onAction) { onAction('category-prev'); if (cfg.gamepad.hapticSwitch === true) rumble(0.12, 40); }
    if (categoryNextButton >= 0 && just[categoryNextButton] && onAction) { onAction('category-next'); if (cfg.gamepad.hapticSwitch === true) rumble(0.12, 40); }
    if (settingsButton >= 0 && just[settingsButton] && onAction) onAction('settings');
    const quickMenuButton = Math.round(Number(cfg.gamepad.quickMenuButton) || 0);
    if (quickMenuButton > 0 && just[quickMenuButton] && quickMenuButton !== toggleIndex && !comboDown && onAction) onAction('quickmenu');
    if (hideButton >= 0 && just[hideButton] && !combo.includes(hideButton) && onAction) onAction('hide');
    if (notesButton >= 0 && just[notesButton] && onAction) onAction('notes');
    if (hudButton >= 0 && just[hudButton] && onAction) onAction('hud');

    const invertDpad = Boolean(cfg.gamepad.invertDpadScroll);
    // In App-Bereichen (Inventar, Dashboard, Dialoge, Notizen) navigiert
    // das D-Pad per Fokus.
    const navRoot = appNavRoot(Boolean(just[12] || just[13] || just[14] || just[15]));
    const appNav = navRoot !== document.body;
    if (appNav) {
      if (navRoot !== lastFocusedRoot) {
        lastFocusedRoot = navRoot;
        const candidates = appNavCandidates(navRoot);
        if (candidates.length && !navRoot.contains(document.activeElement)) {
          const remembered = restoreFocusMemory(navRoot, candidates);
          focusAppCandidate(remembered || candidates[0]);
          if (cfg.gamepad.hapticSwitch === true) rumble(0.05, 12);
        }
      }
      handleRepeat('dup', pressed[12], () => navigateFocus('up'), 260, 150);
      handleRepeat('ddown', pressed[13], () => navigateFocus('down'), 260, 150);
      handleRepeat('dleft', pressed[14], () => navigateFocus('left'), 260, 150);
      handleRepeat('dright', pressed[15], () => navigateFocus('right'), 260, 150);
      const dpadNow = performance.now();
      if (just[12]) {
        if (dpadNow - lastDpadUpAt < 320) scrollAtCursor(-3);
        lastDpadUpAt = dpadNow;
      }
      if (just[13]) {
        if (dpadNow - lastDpadDownAt < 320) scrollAtCursor(3);
        lastDpadDownAt = dpadNow;
      }
    } else {
      lastFocusedRoot = null;
      handleRepeat('dup', pressed[12], () => scrollAtCursor(invertDpad ? 1 : -1));
      handleRepeat('ddown', pressed[13], () => scrollAtCursor(invertDpad ? -1 : 1));
    }

    // Analoge Trigger scrollen schnell. Bei Controllern, die die
    // Stick-Bewegung auf die Trigger spiegeln, wird das ignoriert.
    const leftTrigger = triggersMirrorStick ? 0 : (pad.buttons[6] ? pad.buttons[6].value : 0);
    const rightTrigger = triggersMirrorStick ? 0 : (pad.buttons[7] ? pad.buttons[7].value : 0);
    // Trigger-Schwelle einstellbar (Standard 35 %). Wer einen
    // empfindlichen Controller hat, setzt sie höher.
    const triggerThreshold = clamp(Number(cfg.gamepad.triggerThreshold) || 0.35, 0.05, 0.9);
    // LT/RT-Verhalten: 'scroll' (Standard) oder eine Aktion aus den
    // Belegungen (z. B. 'notes', 'click'). Nicht belegte
    // Trigger scrollen weiter.
    const triggerActions = { left: cfg.gamepad.triggerLeft || 'scroll', right: cfg.gamepad.triggerRight || 'scroll' };
    const updateTrigger = (side, direction, value, wasHeld) => {
      const active = value > triggerThreshold;
      const binding = triggerActions[side];
      if (!binding || binding === 'scroll') {
        // Scrollen bleibt kontinuierlich, solange der Trigger gedrückt ist.
        if (active) scrollAtCursor(direction);
      } else if (active && !wasHeld) {
        // Aktionen nur bei steigender Flanke - sonst feuert z. B.
        // "Notizen" bei jedem Frame und öffnet dutzende Fenster.
        if (onAction) onAction(binding);
      }
      return active;
    };
    triggerLeftHeld = updateTrigger('left', -1, leftTrigger, triggerLeftHeld);
    triggerRightHeld = updateTrigger('right', 1, rightTrigger, triggerRightHeld);

    previous = pressed;
  }

  // Adaptives Polling: im Overlay (sichtbar) schnell, im Hintergrund
  // langsamer, um die CPU im Spiel zu schonen. Die Kombination zum
  // Ein-/Ausblenden bleibt dennoch reaktionsschnell.
  let tickTimer = null;
  function scheduleNext() {
    if (destroyed) return;
    const interactiveNow = typeof isInteractive === 'function' ? Boolean(isInteractive()) : true;
    const delay = interactiveNow ? 16 : 48;
    tickTimer = setTimeout(() => {
      poll();
      scheduleNext();
    }, delay);
  }
  tickTimer = setTimeout(() => {
    poll();
    scheduleNext();
  }, 16);
  positionCursor();

  // Mausbewegung blendet den Controller-Cursor aus. Im Overlay bleibt
  // der Cursor sichtbar, weil dort die Maus oft gar nicht bewegt wird
  // und Windows beim Öffnen des Fensters eigene Mausereignisse sendet.
  document.addEventListener('mousemove', (event) => {
    if (!event.isTrusted) return;
    if (document.body.classList.contains('mode-overlay')) return;
    hideCursor();
  });
  window.addEventListener('blur', () => {
    if (document.body.classList.contains('mode-overlay')) return;
    hideCursor();
  });
  window.addEventListener('d2-pad-focus', (event) => {
    const detail = event && event.detail;
    if (!detail || detail.showCursor === false) return;
    cursorX = clamp(Number(detail.x) || cursorX, 6, window.innerWidth - 6);
    cursorY = clamp(Number(detail.y) || cursorY, 6, window.innerHeight - 6);
    positionCursor();
    showCursor();
    sendAppHover(true);
  });

  window.addEventListener('gamepadconnected', (event) => {
    if (!connected && event.gamepad) {
      connected = true;
      pad = event.gamepad;
      padNameText = padName(event.gamepad.id);
      if (onStatus) onStatus({ connected: true, name: padNameText, index: event.gamepad.index, mapping: event.gamepad.mapping });
    }
  });
  window.addEventListener('gamepaddisconnected', () => {
    connected = false;
    pad = null;
    padNameText = '';
    if (onStatus) onStatus({ connected: false, name: '', index: null });
  });

  // Daten aus der XInput-Bridge übernehmen. Diese sind unabhängig vom
  // Fensterfokus und damit auch im Overlay zuverlässig nutzbar.
  if (typeof onXInput === 'function') onXInput((snapshot) => {
    applyXInputState(snapshot);
    if (snapshot && snapshot.connected) {
      const name = padName(snapshot.id || 'XInput Controller');
      if (!connected || name !== padNameText) {
        connected = true;
        padNameText = name;
        if (onStatus) onStatus({ connected: true, name, index: snapshot.index, mapping: 'standard', source: 'xinput' });
      }
      return;
    }
    // Bridge aus oder Controller getrennt: der Browser-Pfad darf
    // wieder übernehmen, deshalb den Status hier nicht selbst setzen.
    // Das passiert im nächsten Poll-Durchlauf.
  });

  return {
    startCapture() {
      capturing = true;
      captured = [];
      if (onCaptureChanged) onCaptureChanged([], []);
    },
    stopCapture() {
      capturing = false;
      // Nach dem Aufnehmen sind die Tasten oft noch gedrückt. Ohne
      // diese Sperre würde die neue Kombination sofort auslösen.
      comboHeld = true;
      lastComboAt = performance.now();
    },
    getCaptured() {
      return captured.slice();
    },
    isCapturing() {
      return capturing;
    },
    resetCursor,
    hideCursor,
    showCursor,
    rumble,
    setPrecision(value) {
      precision = Boolean(value);
      if (cursorElement) cursorElement.classList.toggle('precision', precision);
    },
    isConnected() {
      return connected;
    },
    getName() {
      return padNameText;
    },
    destroy() {
      destroyed = true;
      if (tickTimer) clearTimeout(tickTimer);
    }
  };
}
