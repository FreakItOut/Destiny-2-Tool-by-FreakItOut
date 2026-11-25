'use strict';

// ============================================================
// Poststellen-Zähler (kleines Overlay-Fenster)
// ============================================================
// Zeigt die Anzahl der Gegenstände in der Poststelle je Charakter.
// Kapazität: 21 Plätze. Warnt ab 15 (gelb) und ab 19 (rot), damit
// man rechtzeitig zum Turm gehen kann, bevor etwas verloren geht.
// ============================================================

const CAPACITY = 21;
const WARN_AT = 15;
const DANGER_AT = 19;

if (window.d2 && typeof window.d2.getUiLanguage === 'function') {
  window.d2.getUiLanguage().then((lang) => { if (window.i18n) window.i18n.setLanguage(lang); }).catch(() => {});
  if (typeof window.d2.onUiLanguage === 'function') {
    window.d2.onUiLanguage((lang) => { if (window.i18n) window.i18n.setLanguage(lang); });
  }
}

const CLASS_KEYS = ['T', 'J', 'W'];
const CLASS_NAMES = ['Titan', 'Jäger', 'Warlock'];

const card = document.getElementById('card');
const countEl = document.getElementById('pmCount');
const hintEl = document.getElementById('pmHint');
const fillEl = document.getElementById('pmFill');
const charsEl = document.getElementById('pmChars');
const ageEl = document.getElementById('pmAge');
const resetEl = document.getElementById('pmReset');
const menuEl = document.getElementById('pmMenu');
const refreshBtn = document.getElementById('pmRefresh');
const closeBtn = document.getElementById('pmClose');

let lastState = null;
let lastResetAt = 0;

function formatReset(at) {
  if (!at) return '';
  const diff = Number(at) - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return '';
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `Reset ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `Reset ${hours}h ${minutes % 60}m`;
}

function severity(count) {
  if (count >= DANGER_AT) return 'danger';
  if (count >= WARN_AT) return 'warn';
  return 'ok';
}

function classKey(classType) {
  return CLASS_KEYS[Number(classType)] || '?';
}

function classLabel(classType) {
  return CLASS_NAMES[Number(classType)] || 'Charakter';
}

function shortError(message) {
  const text = String(message || '').trim();
  if (!text) return 'Fehler';
  if (/nicht angemeldet/i.test(text)) return 'Nicht angemeldet';
  if (/rate-limit|429/i.test(text)) return 'Rate-Limit';
  if (/abgelaufen/i.test(text)) return 'Anmeldung abgelaufen';
  return 'Nicht erreichbar';
}

function formatAge(at) {
  if (!at) return '';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'jetzt';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `vor ${hours} h`;
}

function renderError(state) {
  card.classList.remove('warn', 'danger', 'full');
  countEl.innerHTML = '&ndash; <span class="pm-cap">/ ' + CAPACITY + '</span>';
  hintEl.textContent = shortError(state && state.error);
  hintEl.title = String((state && state.error) || '');
  fillEl.style.width = '0%';
  charsEl.innerHTML = '';
}

function render(state) {
  if (!state || state.ok !== true || !Array.isArray(state.characters)) {
    renderError(state);
    return;
  }
  const capacity = Math.max(1, Math.round(Number(state.capacity) || CAPACITY));
  const list = state.characters
    .map((entry) => ({
      id: String(entry.id || ''),
      classType: Math.round(Number(entry.classType) || 0),
      count: Math.max(0, Math.round(Number(entry.count) || 0)),
      active: entry.active === true
    }))
    .sort((a, b) => a.classType - b.classType);

  const active = list.find((entry) => entry.active) || null;
  const worst = list.slice().sort((a, b) => b.count - a.count)[0] || null;
  const shown = active || worst;
  const focus = shown || { count: 0, classType: 0 };
  const level = severity(focus.count);

  card.classList.toggle('warn', level === 'warn');
  card.classList.toggle('danger', level === 'danger');
  countEl.innerHTML = `${focus.count} <span class="pm-cap">/ ${capacity}</span>`;
  const pct = Math.max(0, Math.min(100, Math.round((focus.count / capacity) * 100)));
  fillEl.style.width = `${pct}%`;

  const overfull = worst && worst.count >= capacity;
  card.classList.toggle('full', Boolean(overfull));
  if (overfull) {
    hintEl.textContent = worst.id === focus.id ? 'Postfach voll' : `${classLabel(worst.classType)} voll`;
  } else if (focus.count >= DANGER_AT) {
    hintEl.textContent = 'Fast voll – Turm!';
  } else if (focus.count >= WARN_AT) {
    hintEl.textContent = 'Bald voll';
  } else {
    hintEl.textContent = active ? classLabel(active.classType) : 'frei';
  }
  hintEl.title = list
    .map((entry) => `${classLabel(entry.classType)}: ${entry.count}/${capacity}`)
    .join('\n');

  charsEl.innerHTML = list
    .map((entry) => {
      const cls = ['pm-chip'];
      if (entry.active && active) cls.push('active');
      const sev = severity(entry.count);
      if (sev !== 'ok') cls.push(sev);
      return `<span class="${cls.join(' ')}" title="${classLabel(entry.classType)}: ${entry.count}/${capacity}">
        <span class="pm-key">${classKey(entry.classType)}</span>${entry.count}
      </span>`;
    })
    .join('');

  ageEl.textContent = formatAge(Number(state.updatedAt) || 0);
  ageEl.title = state.updatedAt ? new Date(Number(state.updatedAt)).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE') : '';
  lastResetAt = Number(state.resetAt) || lastResetAt;
  if (resetEl) resetEl.textContent = formatReset(lastResetAt);
}

async function refresh() {
  const api = window.d2;
  if (!api || typeof api.postmasterRefresh !== 'function') return;
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const state = await api.postmasterRefresh();
    if (state) {
      lastState = state;
      render(state);
    }
  } catch (error) {
    renderError({ error: error && error.message });
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());

// Darstellung (Kompakt/gesperrt) aus dem Hauptprozess übernehmen.
function applyUiConfig(ui) {
  if (!ui) return;
  card.classList.toggle('compact', ui.compact === true);
  card.classList.toggle('locked', ui.lock === true);
  document.body.dataset.theme = ui.theme === 'light' ? 'light' : 'dark';
}

// Klick auf die Zahl: Inventar bei der Poststelle öffnen.
const mainEl = document.querySelector('.pm-main');
if (mainEl) {
  mainEl.style.cursor = 'pointer';
  mainEl.title = 'Klick: Inventar-Poststelle öffnen · Rechtsklick: Menü';
  mainEl.addEventListener('click', () => {
    if (window.d2 && typeof window.d2.postmasterOpenInventory === 'function') {
      window.d2.postmasterOpenInventory().catch(() => {});
    }
  });
}

// Kontextmenü (Rechtsklick auf das Widget).
function hideMenu() {
  if (menuEl) menuEl.classList.add('hidden');
}
function showMenu(x, y) {
  if (!menuEl) return;
  menuEl.classList.remove('hidden');
  const rect = menuEl.getBoundingClientRect();
  const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
}
card.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  showMenu(event.clientX, event.clientY);
});
document.addEventListener('mousedown', (event) => {
  if (menuEl && !menuEl.classList.contains('hidden') && !menuEl.contains(event.target)) hideMenu();
});
if (menuEl) {
  menuEl.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-pm-action]');
    if (!button) return;
    const action = String(button.dataset.pmAction || '');
    hideMenu();
    if (action === 'inventory' && window.d2 && typeof window.d2.postmasterOpenInventory === 'function') {
      window.d2.postmasterOpenInventory().catch(() => {});
    } else if (action === 'refresh') {
      refresh();
    } else if (action === 'collect' && window.d2 && typeof window.d2.postmasterCollect === 'function') {
      if (!window.confirm('Alle Gegenstände aus der Poststelle einsammeln?')) return;
      try {
        if (ageEl) ageEl.textContent = 'Sammle …';
        const result = await window.d2.postmasterCollect();
        if (result && result.ok) {
          if (ageEl) ageEl.textContent = `${result.pulled || 0} eingesammelt${result.failed ? ` · ${result.failed} Fehler` : ''}`;
        } else {
          if (ageEl) ageEl.textContent = (result && result.error) || 'Einsammeln fehlgeschlagen';
        }
        setTimeout(refresh, 1400);
      } catch (error) {
        if (ageEl) ageEl.textContent = 'Einsammeln fehlgeschlagen';
        setTimeout(refresh, 1400);
      }
    } else if (action === 'settings' && window.d2 && typeof window.d2.postmasterOpenSettings === 'function') {
      window.d2.postmasterOpenSettings().catch(() => {});
    } else if (action === 'hide' && window.d2 && typeof window.d2.postmasterSetEnabled === 'function') {
      window.d2.postmasterSetEnabled(false).catch(() => {});
    }
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', async () => {
    try {
      if (window.d2 && typeof window.d2.postmasterSetEnabled === 'function') {
        await window.d2.postmasterSetEnabled(false);
      }
    } catch (error) {
      // egal – das Fenster wird vom Hauptprozess geschlossen.
    }
  });
}

// Altersanzeige/Reset-Countdown aktuell halten, ohne neue Abrufe.
setInterval(() => {
  if (resetEl && lastResetAt) resetEl.textContent = formatReset(lastResetAt);
  if (!lastState || lastState.ok !== true) return;
  ageEl.textContent = formatAge(Number(lastState.updatedAt) || 0);
}, 15000);

// Beim Laden den letzten Stand sofort zeigen, dann frisch abrufen.
if (window.d2 && typeof window.d2.postmasterGetState === 'function') {
  window.d2
    .postmasterGetState()
    .then((result) => {
      if (result && result.ui) applyUiConfig(result.ui);
      if (result && result.state) {
        lastState = result.state;
        render(result.state);
      }
    })
    .catch(() => {})
    .finally(() => refresh());
} else {
  renderError({ error: 'Schnittstelle nicht verfügbar.' });
}

if (window.d2 && typeof window.d2.onPostmasterConfig === 'function') {
  window.d2.onPostmasterConfig(applyUiConfig);
}

if (window.d2 && typeof window.d2.onPostmasterState === 'function') {
  window.d2.onPostmasterState((state) => {
    if (!state) return;
    lastState = state;
    render(state);
  });
}
