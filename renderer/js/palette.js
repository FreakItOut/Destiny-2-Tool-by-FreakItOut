// ============================================================
// Befehlspalette (Strg+K)
// ============================================================
// Aus app.js extrahierte Feature-Einheit (Phase 2). Bekommt die
// App-Abhängigkeiten per Kontext (ctx).

import { qs, qsa, escapeHtml, toast, modalOpen, modalClose } from './ui.js';
import { openChangelog } from './changelog.js';
import { openTour } from './tour.js';

export function createPalette(ctx) {
  const { api, getConfig, getCategories, selectCategory, web, hideError, anyModalOpen, appendStopwatchToNote, settings, notesApi, checklistFn, dashboard, toast, escapeHtml, qs, qsa, modalOpen, modalClose } = ctx;
  const paletteModal = qs('#paletteModal');
  const paletteInput = qs('#paletteInput');
  const paletteResults = qs('#paletteResults');
  let paletteItems = [];
  let paletteIndex = 0;
  let paletteInventory = [];
  let paletteInventoryLoading = false;

  function loadPaletteInventory() {
    if (paletteInventoryLoading || paletteInventory.length) return;
    if (!api || typeof api.bungieInventoryCached !== 'function') return;
    paletteInventoryLoading = true;
    api.bungieInventoryCached().then((data) => {
      if (!data || !data.ok) return;
      const items = [];
      const add = (list) => { for (const item of list || []) if (item && item.name) items.push(item); };
      add(data.vault);
      for (const list of Object.values(data.backpack || {})) add(list);
      for (const list of Object.values(data.equipped || {})) add(list);
      paletteInventory = items;
    }).catch(() => {}).finally(() => { paletteInventoryLoading = false; });
  }

  function loadPaletteRecent() {
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2palette.recent') || '[]');
      return Array.isArray(raw) ? raw.filter((value) => typeof value === 'string' && value).slice(0, 5) : [];
    } catch (error) { return []; }
  }

  function rememberPaletteAction(label) {
    try {
      const value = String(label || '').trim();
      if (!value || value.startsWith('Item:')) return;
      const recent = loadPaletteRecent().filter((entry) => entry !== value);
      recent.unshift(value);
      window.localStorage.setItem('d2palette.recent', JSON.stringify(recent.slice(0, 5)));
    } catch (error) { /* egal */ }
  }

  function buildPaletteActions() {
    const actions = [];
    actions.push({ label: 'Overlay umschalten', run: () => ctx.api.toggleOverlay().catch(() => {}) });
    actions.push({ label: 'Dashboard umschalten', run: () => (ctx.dashboard.hidden() ? ctx.dashboard.open() : ctx.dashboard.restore()) });
  actions.push({ label: 'Was ist neu? (Changelog)', run: () => openChangelog() });
  actions.push({ label: 'Tour starten', run: () => openTour() });
    actions.push({ label: 'Seite neu laden', run: () => { ctx.hideError(); ctx.web.reload(); } });
    actions.push({ label: 'Alle Seiten neu laden', run: () => { ctx.hideError(); if (ctx.web.reloadAll) ctx.web.reloadAll(); } });
    actions.push({ label: 'Notizen öffnen', run: () => { if (ctx.notesApi && ctx.notesApi.isHidden()) ctx.notesApi.open(); else if (ctx.notesApi) ctx.notesApi.close(); } });
    actions.push({ label: 'Wöchentliche Checkliste öffnen', run: () => ctx.checklistToggle() });
    actions.push({ label: 'Andere Seiten entladen', run: () => { const removed = ctx.web.unloadOthers(); toast(`${removed} Seite${removed === 1 ? '' : 'n'} entladen.`, 'info', 1800); } });
    actions.push({ label: 'Destiny 2 starten', run: () => ctx.api.launchGame().catch(() => {}) });
    actions.push({ label: 'Alarm testen', run: () => ctx.api.testAlarm().catch(() => {}) });
    actions.push({ label: 'Stoppuhr-Ergebnis in Notiz anhängen', run: () => ctx.appendStopwatchToNote() });
    actions.push({ label: 'Letzte Sitzung wiederherstellen', run: () => ctx.dashboard.restoreSession() });
    actions.push({ label: 'Minimodus umschalten (Strg+M)', run: () => ctx.toggleMiniMode() });
    actions.push({ label: 'Split-View umschalten (Strg+Alt+S)', run: () => ctx.toggleSplitView() });
    actions.push({ label: 'Inventar öffnen (Bungie)', run: () => ctx.inventory && ctx.inventory.toggle() });
    for (const [view, label] of [['overview', 'Übersicht'], ['builds', 'Builds'], ['collection', 'Sammlung'], ['week', 'Woche'], ['vendor', 'Händler']]) {
      actions.push({ label: `Werkzeuge: ${label}`, run: () => {
        if (ctx.inventory && ctx.inventory.open) ctx.inventory.open();
        setTimeout(() => window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'tools', view } })), 40);
      } });
    }
    for (const loadout of ((getConfig().bungie && getConfig().bungie.loadouts) || [])) {
      actions.push({ label: `Loadout: ${loadout.name}`, run: () => {
        if (ctx.inventory && ctx.inventory.open) ctx.inventory.open();
        setTimeout(() => window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'loadouts' } })), 40);
      } });
    }
  actions.push({ label: 'Inventar: Poststelle öffnen', run: () => ctx.openPostmaster && ctx.openPostmaster() });
  actions.push({ label: 'Poststellen-Zähler ein-/ausblenden', run: () => ctx.togglePostmaster && ctx.togglePostmaster() });
  actions.push({ label: 'Bungie: Anmelden', run: () => ctx.bungieLogin && ctx.bungieLogin() });
  actions.push({ label: 'Godroll-Wunschliste aktualisieren', run: () => ctx.refreshWishlist && ctx.refreshWishlist() });
  actions.push({ label: 'Bungie-Verbindung prüfen', run: () => ctx.settings.open('bungie') });
    actions.push({ label: 'Geschlossene Seite wiederherstellen (Strg+Shift+T)', run: () => {
      const restored = ctx.web.restoreLast();
      toast(restored ? `Seite wiederhergestellt: ${restored.name}` : 'Keine geschlossene Seite im Speicher.', restored ? 'success' : 'info', 1800);
    } });
    actions.push({ label: 'Verlauf öffnen', run: () => { const button = qs('#backHistoryBtn'); if (button) button.click(); } });
    for (const [tab, label] of [
      ['overlay', 'Overlay'], ['controller', 'Controller'], ['web', 'Webseiten'], ['custom', 'Eigene Seiten'],
      ['behavior', 'Verhalten'], ['bungie', 'Bungie'], ['diag', 'Diagnose'], ['about', 'Über']
    ]) {
      actions.push({ label: `Einstellungen: ${label}`, run: () => ctx.settings.open(tab) });
    }
    for (const category of ctx.getCategories()) {
      for (const site of category.sites) {
        actions.push({ label: `Seite öffnen: ${site.name}`, run: () => ctx.selectCategory(category.id, site.id) });
      }
    }
    // Zuletzt genutzte Befehle oben einsortieren, ohne sie unten zu doppeln.
    const recentLabels = loadPaletteRecent();
    const recentActions = [];
    for (const label of recentLabels) {
      const found = actions.find((action) => action.label === label);
      if (found) recentActions.push({ ...found, recent: true });
    }
    const rest = actions.filter((action) => !recentLabels.includes(action.label));
    return [...recentActions, ...rest];
  }

  function paletteScore(action, query) {
    const label = action.label.toLowerCase();
    if (!query) return 1;
    if (label.includes(query)) return 100 - label.indexOf(query);
    // Grobe Subsequenz-Bewertung: alle Zeichen in Reihenfolge?
    let index = 0;
    for (const character of query) {
      index = label.indexOf(character, index);
      if (index === -1) return -1;
      index += 1;
    }
    return 10;
  }

  function renderPalette() {
    if (!paletteResults) return;
    const query = String(paletteInput.value || '').trim().toLowerCase();
    const base = (paletteItems || []).slice();
    if (query.length >= 2) {
      const matches = paletteInventory
        .filter((item) => String(item.name || '').toLowerCase().includes(query))
        .slice(0, 6)
        .map((item) => ({
          label: `Item: ${item.name}${item.power ? ` · ${item.power}` : ''}`,
          run: () => {
            if (ctx.inventory && ctx.inventory.open) ctx.inventory.open();
            window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory', search: String(item.name || '') } }));
          }
        }));
      base.unshift(...matches);
      if (typeof ctx.contentSearch === 'function') {
        try {
          const extra = (ctx.contentSearch(query) || []).slice(0, 8);
          if (extra.length) base.unshift(...extra);
        } catch (error) { /* Suche darf die Palette nicht blockieren */ }
      }
      if (!matches.length) {
        base.unshift({
          label: `Items suchen: ${query}`,
          run: () => {
            if (ctx.inventory && ctx.inventory.open) ctx.inventory.open();
            window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory', search: query } }));
          }
        });
      }
    }
    const scored = base
      .map((action) => ({ action, score: paletteScore(action, query) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    window.__paletteActive = scored;
    if (!scored.length) {
      paletteResults.innerHTML = '<div class="palette-item muted">Kein Treffer.</div>';
      return;
    }
    paletteIndex = 0;
    paletteResults.innerHTML = scored
      .map((entry, index) => `<button class="palette-item ${index === 0 ? 'active' : ''}" data-palette-index="${index}">${escapeHtml(entry.action.label)}${entry.action.recent ? '<span class="palette-recent">zuletzt</span>' : ''}</button>`)
      .join('');
    for (const button of qsa('.palette-item', paletteResults)) {
      button.addEventListener('click', () => runPaletteIndex(Number(button.dataset.paletteIndex)));
    }
  }

  function runPaletteIndex(index) {
    const active = window.__paletteActive || [];
    const entry = active[index];
    if (entry && entry.action) rememberPaletteAction(entry.action.label);
    closePalette();
    if (entry && entry.action && typeof entry.action.run === 'function') {
      try { entry.action.run(); } catch (error) {
        toast(`Befehl fehlgeschlagen: ${error.message || error}`, 'error', 2200);
      }
    }
  }

  function openPalette() {
    if (!paletteModal || !paletteInput) return;
    paletteItems = buildPaletteActions();
    loadPaletteInventory();
    paletteInput.value = '';
    renderPalette();
    modalOpen(paletteModal);
    setTimeout(() => paletteInput.focus(), 40);
  }

  function closePalette() {
    if (!paletteModal) return;
    modalClose(paletteModal);
    if (paletteInput) paletteInput.value = '';
  }

  if (paletteInput) {
    paletteInput.addEventListener('input', renderPalette);
    paletteInput.addEventListener('keydown', (event) => {
      const active = window.__paletteActive || [];
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        paletteIndex = Math.min(active.length - 1, paletteIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        paletteIndex = Math.max(0, paletteIndex - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runPaletteIndex(paletteIndex);
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
        return;
      } else {
        return;
      }
      for (const [index, button] of qsa('.palette-item', paletteResults).entries()) {
        button.classList.toggle('active', index === paletteIndex);
        if (index === paletteIndex) button.scrollIntoView({ block: 'nearest' });
      }
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && String(event.key).toLowerCase() === 'k') {
      if (ctx.anyModalOpen()) return;
      event.preventDefault();
      openPalette();
    }
  });

  return {
    open: openPalette,
    close: closePalette,
    isOpen: () => paletteModal && !paletteModal.classList.contains('hidden')
  };
}
