// Kleine Helfer für Oberfläche und Konfiguration.

/**
 * Kurzform für querySelector. Der Rückgabewert ist bewusst "any":
 * die Renderer-Module arbeiten mit dynamischem Markup, eine strenge
 * DOM-Typisierung bringt dort keinen Erkenntnisgewinn.
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any}
 */
export function qs(selector, root = document) {
  return /** @type {any} */ (root.querySelector(selector));
}

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any[]}
 */
export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function deepMerge(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function formatAccelerator(accelerator) {
  if (!accelerator) return '—';
  return String(accelerator)
    .replaceAll('Ctrl', 'Strg')
    .replaceAll('Super', 'Win');
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// (Toasts haben eigene Timer — kein globaler Timer mehr.)
const notificationHistory = [];
let notificationSeq = 0;
const notificationListeners = new Set();
function notifyHistoryChanged() {
  for (const listener of notificationListeners) {
    try { listener(); } catch (error) { /* egal */ }
  }
}

let notificationsMuted = false;
try { notificationsMuted = window.localStorage.getItem('d2notificationsMuted') === '1'; } catch (error) { /* egal */ }
let notificationFilter = 'all';
// Bis wann der Verlauf als gelesen gilt (für die Zähler-Blase).
let notificationReadAt = 0;
try { notificationReadAt = Number(window.localStorage.getItem('d2tool.notifReadAt')) || 0; } catch (error) { /* egal */ }
let notificationSearch = '';
// Stummgeschaltete Kategorien (Poststelle, Bungie, Farming, Allgemein).
const mutedCategories = new Set();
try {
  const raw = JSON.parse(window.localStorage.getItem('d2tool.notifMuted') || '[]');
  if (Array.isArray(raw)) for (const entry of raw) mutedCategories.add(String(entry));
} catch (error) { /* egal */ }

function saveMutedCategories() {
  try { window.localStorage.setItem('d2tool.notifMuted', JSON.stringify([...mutedCategories])); } catch (error) { /* egal */ }
}

function unreadNotifications() {
  return notificationHistory.filter((entry) => Number(entry.at) > notificationReadAt).length;
}
function notificationCategory(message) {
  const text = String(message || '').toLowerCase();
  if (/poststelle|postmaster|postfach/.test(text)) return 'poststelle';
  if (/bungie|anmeld|token|wunschliste|loadout|\bdim\b/.test(text)) return 'bungie';
  if (/farming|farm-|farm\b|beute/.test(text)) return 'farming';
  return 'allgemein';
}
export function toast(message, kind = 'info', duration = 3400, force = false, actions = []) {
  // Ruhemodus: Hinweise unterdrücken (Ausnahmen mit force = true,
  // z. B. die Bestätigung des Ruhemodus selbst).
  if (!force && Number(window.__d2QuietUntil) > Date.now()) return;
  const notification = {
    id: ++notificationSeq,
    message: String(message || ''),
    kind,
    category: notificationCategory(message),
    at: Date.now()
  };
  notificationHistory.unshift(notification);
  if (notificationHistory.length > 50) notificationHistory.length = 50;
  notifyHistoryChanged();
  // Sprachausgabe (optional): höchstens alle 3 Sekunden.
  try {
    if (window.__d2TtsEnabled && !notificationsMuted && window.speechSynthesis) {
      const now = Date.now();
      if (now - (window.__d2TtsLast || 0) > 3000) {
        window.__d2TtsLast = now;
        const utterance = new SpeechSynthesisUtterance(String(notification.message || ''));
        utterance.lang = 'de-DE';
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    }
  } catch (error) {
    // Sprachausgabe ist optional.
  }
  // „Nicht stören“: Verlauf bleibt erhalten, aber kein Toast im Bild.
  if (notificationsMuted && !force) return;
  if (!force && mutedCategories.has(notification.category)) return;
  const container = qs('#toasts');
  if (!container) return;
  // Höchstens vier Hinweise gleichzeitig; ältere fliegen raus.
  while (container.querySelectorAll('.toast').length >= 4) {
    const oldest = container.querySelector('.toast');
    if (!oldest) break;
    if (oldest._toastTimer) clearTimeout(oldest._toastTimer);
    oldest.remove();
  }
  const item = document.createElement('div');
  item.className = `toast toast-${kind} toast-cat-${notification.category}`;
  let html = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span><button type="button" class="toast-close" aria-label="Benachrichtigung schließen">×</button>`;
  // Standardziel je Kategorie, wenn der Aufrufer keine Aktion mitgibt.
  let resolvedActions = Array.isArray(actions) ? actions.slice() : [];
  if (!resolvedActions.length) {
    const text = String(notification.message || '').toLowerCase();
    const open = (detail) => () => window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail }));
    if (notification.category === 'poststelle') {
      resolvedActions = [{ label: 'Postfach öffnen', run: open({ tab: 'inventory', postmaster: true }) }];
    } else if (notification.category === 'farming') {
      resolvedActions = [{ label: 'Sammlung', run: open({ tab: 'tools', view: 'collection' }) }];
    } else if (/reset|woche|weekly|xûr|xur/.test(text)) {
      resolvedActions = [{ label: 'Woche', run: open({ tab: 'tools', view: 'week' }) }];
    }
  }
  const hasActions = resolvedActions.length > 0;
  if (hasActions) {
    html += `<span class="toast-actions">${resolvedActions
      .map((action, index) => `<button class="toast-action" data-toast-action="${index}">${escapeHtml(action.label)}</button>`)
      .join('')}</span>`;
  }
  item.innerHTML = html;
  container.append(item);
  item.dataset.notificationId = String(notification.id);
  requestAnimationFrame(() => item.classList.add('show'));
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    item.classList.remove('show');
    setTimeout(() => item.remove(), 220);
  };
  // Aktionen-Klicks: Toast schließen und Aktion ausführen.
  for (const button of qsa('.toast-action', item)) {
    button.addEventListener('click', () => {
      const action = resolvedActions[Number(button.dataset.toastAction)];
      dismiss();
      if (action && typeof action.run === 'function') {
        try { action.run(); } catch (error) { /* egal */ }
      }
    });
  }
  const toastClose = item.querySelector('.toast-close');
  if (toastClose) toastClose.addEventListener('click', dismiss);
  // Jeder Toast bekommt seinen eigenen Timer. Ein globaler Timer hat
  // frühere Toasts nie geschlossen, wenn mehrere kurz hintereinander
  // kamen — sie blieben dann dauerhaft stehen.
  const timer = setTimeout(dismiss, hasActions ? Math.max(duration, 12000) : duration);
  /** @type {any} */ (item)._toastTimer = timer;
}

export function getNotificationHistory() {
  return notificationHistory.slice();
}

export function subscribeNotifications(listener) {
  if (typeof listener !== 'function') return () => {};
  notificationListeners.add(listener);
  try { listener(); } catch (error) { /* egal */ }
  return () => notificationListeners.delete(listener);
}

export function dismissNotification(id) {
  const index = notificationHistory.findIndex((entry) => entry.id === Number(id));
  if (index < 0) return;
  notificationHistory.splice(index, 1);
  notifyHistoryChanged();
}

export function clearNotifications() {
  if (!notificationHistory.length) return;
  notificationHistory.length = 0;
  notifyHistoryChanged();
}

export function isNotificationCenterOpen() {
  const panel = qs('#notificationPanel');
  return Boolean(panel && panel.classList.contains('open'));
}

export function closeNotificationCenter() {
  const panel = qs('#notificationPanel');
  if (panel) panel.classList.remove('open');
}

export function initNotificationCenter() {
  if (qs('#notificationBtn')) return;
  const statusRight = qs('.status-right');
  const host = statusRight || document.body;
  const button = document.createElement('button');
  button.id = 'notificationBtn';
  button.className = 'icon-btn notification-btn';
  button.type = 'button';
  button.title = 'Benachrichtigungen';
  button.setAttribute('aria-label', 'Benachrichtigungen');
  button.innerHTML = '<span class="notification-bell">🔔</span><span id="notificationBadge" class="notification-badge hidden">0</span>';
  if (statusRight) statusRight.insertBefore(button, statusRight.firstChild);
  else host.appendChild(button);

  const panel = document.createElement('div');
  panel.id = 'notificationPanel';
  panel.className = 'notification-panel';
  panel.innerHTML =
    `<div class="notification-head"><strong>Benachrichtigungen</strong><span class="notification-head-actions">` +
      `<button type="button" class="btn ghost small" data-notify-read>Alle gelesen</button>` +
      `<button type="button" class="btn ghost small" data-notify-clear>Alle löschen</button>` +
      `<button type="button" class="icon-btn" data-notify-close aria-label="Schließen">✕</button>` +
    `</span></div>` +
    `<div class="notification-filters">` +
      `<button type="button" class="notification-filter" data-notify-filter="all">Alle</button>` +
      `<button type="button" class="notification-filter" data-notify-filter="bungie">Bungie</button>` +
      `<button type="button" class="notification-filter" data-notify-filter="poststelle">Poststelle</button>` +
      `<button type="button" class="notification-filter" data-notify-filter="farming">Farming</button>` +
      `<button type="button" class="notification-filter" data-notify-mute>🔔 Nicht stören</button>` +
    `</div><div class="notification-mute-row">` +
      [['bungie', 'Bungie'], ['poststelle', 'Poststelle'], ['farming', 'Farming'], ['allgemein', 'Allgemein']]
        .map(([key, label]) => `<button type="button" class="notification-filter${mutedCategories.has(key) ? ' on' : ''}" data-notify-mute-cat="${key}" title="Kategorie stummschalten">${label} aus</button>`).join('') +
    `</div><input type="search" class="notification-search" id="notificationSearch" placeholder="Verlauf durchsuchen …" aria-label="Benachrichtigungen durchsuchen"><div class="notification-list"></div>`;
  document.body.appendChild(panel);

  const render = () => {
    const badge = qs('#notificationBadge');
    const list = panel.querySelector('.notification-list');
    if (badge) {
      const unread = unreadNotifications();
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.toggle('hidden', unread === 0);
    }
    for (const filterButton of qsa('[data-notify-filter]', panel)) {
      if (filterButton.dataset.notifyMuteCat) {
        filterButton.classList.toggle('on', mutedCategories.has(filterButton.dataset.notifyMuteCat));
        continue;
      }
      filterButton.classList.toggle('on', filterButton.dataset.notifyFilter === notificationFilter);
    }
    const muteButton = panel.querySelector('[data-notify-mute]');
    if (muteButton) {
      muteButton.classList.toggle('on', notificationsMuted);
      muteButton.textContent = notificationsMuted ? '🔕 Stumm' : '🔔 Nicht stören';
    }
    if (!list) return;
    const searchLower = String(notificationSearch || '').toLowerCase();
    const visible = notificationHistory.filter((entry) => {
      if (notificationFilter !== 'all' && entry.category !== notificationFilter) return false;
      if (searchLower && !String(entry.message || '').toLowerCase().includes(searchLower)) return false;
      return true;
    });
    list.innerHTML = visible.length
      ? visible.map((entry) => {
          const time = new Date(entry.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' });
          return `<div class="notification-row notification-${escapeHtml(entry.kind || 'info')}">` +
            `<span class="notification-time">${escapeHtml(time)}</span>` +
            `<span class="notification-category">${escapeHtml(entry.category || 'allgemein')}</span>` +
            `<span class="notification-message">${escapeHtml(entry.message)}</span>` +
            `<button type="button" class="notification-dismiss" data-notify-dismiss="${entry.id}" aria-label="Entfernen">×</button>` +
            `</div>`;
        }).join('')
      : '<p class="notification-empty">Keine Benachrichtigungen.</p>';
  };

  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) render();
  });
  panel.addEventListener('click', (event) => {
    const target = /** @type {any} */ (event.target);
    const filter = target.closest('[data-notify-filter]');
    if (filter) {
      notificationFilter = String(filter.dataset.notifyFilter || 'all');
      if (!['all', 'bungie', 'poststelle', 'farming'].includes(notificationFilter)) notificationFilter = 'all';
      render();
      return;
    }
    if (target.closest('[data-notify-mute]')) {
      notificationsMuted = !notificationsMuted;
      try { window.localStorage.setItem('d2notificationsMuted', notificationsMuted ? '1' : '0'); } catch (error) { /* egal */ }
      render();
      return;
    }
    const dismiss = target.closest('[data-notify-dismiss]');
    if (dismiss) { dismissNotification(dismiss.dataset.notifyDismiss); return; }
    const muteCat = target.closest('[data-notify-mute-cat]');
    if (muteCat) {
      const key = String(muteCat.dataset.notifyMuteCat || '');
      if (mutedCategories.has(key)) mutedCategories.delete(key);
      else mutedCategories.add(key);
      saveMutedCategories();
      render();
      return;
    }
    if (target.closest('[data-notify-read]')) {
      notificationReadAt = Date.now();
      try { window.localStorage.setItem('d2tool.notifReadAt', String(notificationReadAt)); } catch (error) { /* egal */ }
      render();
      return;
    }
    if (target.closest('[data-notify-clear]')) { clearNotifications(); return; }
    if (target.closest('[data-notify-close]')) { closeNotificationCenter(); return; }
  });
  panel.addEventListener('input', (event) => {
    const target = /** @type {any} */ (event.target);
    if (!target || target.id !== 'notificationSearch') return;
    notificationSearch = String(target.value || '').toLowerCase();
    render();
  });
  subscribeNotifications(render);
  render();
}

export function modalOpen(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  const focusable = modal.querySelector('button, input, select, [tabindex]');
  if (focusable) setTimeout(() => focusable.focus(), 30);
}

export function modalClose(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  if (!document.querySelector('.modal:not(.hidden)')) {
    document.body.classList.remove('modal-open');
  }
}

export function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

// ------------------------------------------------------------
// TV-Modus-Helfer (große Schrift, Fokus statt Hover)
// ------------------------------------------------------------
// Im TV-Modus dürfen Details nicht am Hover hängen: Auf dem Sofa gibt
// es keine Maus. Raster-Ziele bekommen einen Tab-Stop, und Kleinsttext
// erhält eine Mindestgröße (Zoom 1.25 hebt ihn auf ~12,5 px).
export const TV_MIN_FONT = 10;
export function isTvMode() {
  return Boolean(document.body && document.body.classList.contains('tv-mode'));
}

export function enforceTvText(root) {
  if (!root || !root.querySelectorAll) return;
  for (const element of root.querySelectorAll('*')) {
    if (element.children.length) continue;
    const text = element.textContent;
    if (!text || !text.trim()) continue;
    const size = parseFloat(window.getComputedStyle(element).fontSize) || 0;
    if (size && size < TV_MIN_FONT) {
      element.style.setProperty('font-size', TV_MIN_FONT + 'px', 'important');
    }
  }
}

export function enhanceTvTargets(root) {
  if (!root || !isTvMode()) return;
  const selector = '[data-picker-tip],[data-vc-item],[data-dw-tip-item],[data-dw-tip-itemhash]';
  for (const element of root.querySelectorAll(selector)) {
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
    if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
  }
  enforceTvText(root);
}
// Global, weil die Renderer-Module (tools.js, inventory.js) ohne Import
// darauf zugreifen - so funktioniert es auch im E2E-Testaufbau.
// (In Node-Tests gibt es kein window; dort werden die Helfer direkt
// importiert.)
if (typeof window !== 'undefined') {
  window.isTvMode = isTvMode;
  window.enhanceTvTargets = enhanceTvTargets;
  window.enforceTvText = enforceTvText;
}

// ------------------------------------------------------------
// Tooltips mit fester Position
// ------------------------------------------------------------
// Die Oberfläche skaliert über `body { zoom }`. `getBoundingClientRect`
// liefert dabei bereits skalierte Werte, `left/top` werden beim Setzen
// aber nochmals skaliert. Diese Helfer rechnen beides sauber um, halten
// den Tooltip im sichtbaren Bereich und begrenzen die Höhe.

export function uiZoom() {
  const value = Number(document.body && document.body.style && document.body.style.zoom);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function positionFixedTip(element, x, y, options = {}) {
  if (!element) return null;
  const zoom = uiZoom();
  const padding = Number(options.padding) || 10;
  const offset = Number(options.offset) || 14;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const place = () => {
    if (!element.isConnected) return;
    const availableWidth = Math.max(120, (viewportWidth - padding * 2) / zoom);
    const availableHeight = Math.max(80, (viewportHeight - padding * 2) / zoom);
    const maxWidth = Math.min(availableWidth, Number(options.maxWidth) || availableWidth);
    const maxHeight = Math.min(availableHeight, Number(options.maxHeight) || availableHeight);
    element.style.maxWidth = `${maxWidth}px`;
    element.style.maxHeight = `${maxHeight}px`;
    element.style.overflowY = 'auto';
    const width = Math.min(element.offsetWidth || 0, maxWidth) * zoom;
    const height = Math.min(element.offsetHeight || 0, maxHeight) * zoom;
    let left = x + offset;
    let top = y + offset;
    if (left + width > viewportWidth - padding) left = x - width - offset;
    if (top + height > viewportHeight - padding) top = y - height - offset;
    left = Math.max(padding, Math.min(viewportWidth - width - padding, left));
    top = Math.max(padding, Math.min(viewportHeight - height - padding, top));
    element.style.left = `${left / zoom}px`;
    element.style.top = `${top / zoom}px`;
  };
  place();
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(place);
  for (const image of element.querySelectorAll('img')) {
    if (image.complete) continue;
    image.addEventListener('load', place, { once: true });
  }
  return place;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} T ${pad2(hours)}:${pad2(minutes)}`;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}
