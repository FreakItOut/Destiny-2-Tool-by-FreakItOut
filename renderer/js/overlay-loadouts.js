// ============================================================
// Overlay-Schnellzugriff auf Loadouts
// ============================================================
// Kleines Panel unter der Overlay-Leiste. Zeigt bis zu vier
// angeheftete Loadouts (sonst die zuletzt genutzten) und wendet
// sie über die bestehende Vorschau im Inventar an.

import { overlayLoadouts, OVERLAY_LOADOUT_LIMIT } from './loadouts/model.js';

export function createOverlayLoadouts(ctx) {
  const { getCfg, escapeHtml, openInventory, applyLoadout, toast } = ctx;
  const panel = document.getElementById('overlayLoadoutPanel');
  const list = document.getElementById('overlayLoadoutList');
  const hint = document.getElementById('overlayLoadoutHint');
  const button = document.getElementById('overlayLoadoutsBtn');
  const closeButton = document.getElementById('overlayLoadoutClose');
  if (!panel || !list || !button) {
    return { open() {}, close() {}, toggle() {}, isOpen: () => false };
  }

  function isOpen() {
    return !panel.classList.contains('hidden');
  }

  function close() {
    panel.classList.add('hidden');
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
  }

  function characterLabel(loadout) {
    const names = ['Titan', 'Jäger', 'Warlock'];
    const value = Number(loadout && loadout.classType);
    return Number.isInteger(value) && value >= 0 && value < names.length ? names[value] : 'Jede Klasse';
  }

  function rowHtml(loadout) {
    const name = escapeHtml(String(loadout.name || 'Loadout'));
    const items = Array.isArray(loadout.items) ? loadout.items.length : 0;
    const mods = Array.isArray(loadout.mods) ? loadout.mods.length : 0;
    const pinned = loadout.pinned === true;
    const meta = `${characterLabel(loadout)} · ${items} Items${mods ? ` · ${mods} Mods` : ''}`;
    return `<button type="button" class="overlay-lo-item${pinned ? ' pinned' : ''}" data-overlay-loadout="${escapeHtml(String(loadout.id))}">` +
      `<span class="overlay-lo-name">${pinned ? '<span class="overlay-lo-pin" aria-hidden="true">★</span> ' : ''}${name}</span>` +
      `<span class="overlay-lo-meta">${escapeHtml(meta)}</span>` +
    '</button>';
  }

  function render() {
    const cfg = getCfg() || {};
    const stats = (cfg.bungie && cfg.bungie.loadoutStats) || {};
    const result = overlayLoadouts((cfg.bungie && cfg.bungie.loadouts) || [], {
      stats,
      limit: OVERLAY_LOADOUT_LIMIT
    });
    list.innerHTML = result.items.length
      ? result.items.map(rowHtml).join('')
      : '<p class="overlay-lo-empty">Noch keine Loadouts gespeichert. Im Loadout-Editor anlegen.</p>';
    if (hint) {
      hint.textContent = result.pinned
        ? 'Angeheftete Loadouts (★). Im Editor anheften oder abheften.'
        : 'Keine angeheftet – zeigt die zuletzt genutzten. Im Editor mit ★ anheften.';
    }
  }

  function open() {
    render();
    panel.classList.remove('hidden');
    button.classList.add('active');
    button.setAttribute('aria-expanded', 'true');
    const first = list.querySelector('[data-overlay-loadout]');
    if (first) {
      try { first.focus({ preventScroll: true }); } catch (error) { /* egal */ }
    }
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'overlayLoadoutPanel');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });
  if (closeButton) closeButton.addEventListener('click', close);

  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-overlay-loadout]');
    if (!item) return;
    const id = String(item.dataset.overlayLoadout || '');
    if (!id) return;
    close();
    try {
      openInventory();
    } catch (error) {
      // egal
    }
    if (typeof applyLoadout === 'function') applyLoadout(id);
    else toast('Loadout kann gerade nicht angewendet werden.', 'warning', 2400);
  });

  document.addEventListener('mousedown', (event) => {
    if (!isOpen()) return;
    if (panel.contains(event.target) || button.contains(event.target)) return;
    close();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      close();
      event.stopPropagation();
    }
  });

  // Beim Wechsel in den Overlay-Modus neu zeichnen (Loadouts können
  // sich im Fenster geändert haben).
  window.addEventListener('d2-overlay-shown', () => {
    if (isOpen()) render();
  });
  window.addEventListener('d2-overlay-hidden', close);

  return { open, close, toggle, isOpen, render };
}
