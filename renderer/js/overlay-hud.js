// HUD-Leiste und Layout-Editor des Overlays.
// Aus app.js ausgelagert, damit der Startpfad kleiner bleibt.

import { qs, escapeHtml, toast } from './ui.js';

const HUD_CHIPS = [
  ['clock', 'Reset'],
  ['weekly', 'Weekly'],
  ['stopwatch', 'Stoppuhr'],
  ['session', 'Session'],
  ['activity', 'Status'],
  ['champion', 'Champion'],
  ['battery', 'Akku'],
  ['vault', 'Tresor'],
  ['minidash', 'Mini-Dash'],
  ['focus', 'Fokus']
];

const HUD_CHIP_SELECTORS = {
  clock: '#overlayClock',
  weekly: '#overlayWeekly',
  stopwatch: '#overlayStopwatch',
  session: '#overlaySession',
  activity: '#overlayActivity',
  champion: '#overlayChampion',
  battery: '#overlayBattery',
  vault: '#overlayVault',
  minidash: '#overlayMiniDash',
  focus: '#overlayFocus'
};

const HUD_DEFAULT_ORDER = HUD_CHIPS.map(([key]) => key);
const HUD_SCALE_LABELS = { s: 'Klein', m: 'Normal', l: 'Groß', xl: 'XL' };
const HUD_HIDEABLE = ['clock', 'session', 'activity', 'champion', 'battery', 'focus'];

let hudApi = null;
let hudGetConfig = null;
let hudSetConfig = null;
let hudGetLiveActivity = () => '';
let hudEditorReady = false;
let hudDisplaySignature = '';
let lastAutoHudKey = '';

function hudOverlay() {
  const config = hudGetConfig ? hudGetConfig() : {};
  if (!config.overlay || typeof config.overlay !== 'object') config.overlay = {};
  return config.overlay;
}

function hudOrder() {
  const raw = Array.isArray(hudOverlay().chipOrder) ? hudOverlay().chipOrder : [];
  const order = raw.filter((key) => HUD_CHIP_SELECTORS[key]);
  for (const key of HUD_DEFAULT_ORDER) if (!order.includes(key)) order.push(key);
  return order;
}

function hudChipStyles() {
  const raw = hudOverlay().chipStyles;
  return raw && typeof raw === 'object' ? raw : {};
}

function hudChipStyle(key) {
  const style = hudChipStyles()[key];
  return style && typeof style === 'object' ? style : {};
}

function hudChipRules() {
  const raw = hudOverlay().chipRules;
  return raw && typeof raw === 'object' ? raw : {};
}

function hudGameMode() {
  const label = String(hudGetLiveActivity() || '').toLowerCase();
  return /schmelztiegel|crucible|pvp|trials|eiserner banner|iron banner|competitive|rival|osiris/.test(label) ? 'pvp' : 'pve';
}

function applyChipRules() {
  const editing = document.body.classList.contains('hud-edit');
  const mode = hudGameMode();
  const rules = hudChipRules();
  for (const [key, selector] of Object.entries(HUD_CHIP_SELECTORS)) {
    const element = qs(selector);
    if (!element) continue;
    const rule = rules[key] || 'always';
    const hidden = !editing && ((rule === 'pvp' && mode !== 'pvp') || (rule === 'pve' && mode === 'pvp'));
    element.classList.toggle('hud-rule-hidden', hidden);
    element.dataset.hudChip = key;
    element.draggable = editing;
  }
}

function applyHudChipStyles() {
  for (const [key, selector] of Object.entries(HUD_CHIP_SELECTORS)) {
    const element = qs(selector);
    if (!element) continue;
    const style = hudChipStyle(key);
    element.style.zoom = style.scale === 's' ? '0.85' : style.scale === 'l' ? '1.15' : '';
    if (style.color) {
      element.style.color = style.color;
      element.style.borderColor = style.color;
    } else {
      element.style.color = '';
      element.style.borderColor = '';
    }
  }
}

function hudScale() {
  const value = hudOverlay().hudScale;
  return ['s', 'm', 'l', 'xl'].includes(value) ? value : 'm';
}

function applyHudScale() {
  document.body.classList.remove('hud-scale-s', 'hud-scale-m', 'hud-scale-l', 'hud-scale-xl');
  document.body.classList.add(`hud-scale-${hudScale()}`);
}

function applyChipOrder() {
  const bar = qs('#overlayBar');
  if (!bar) return;
  for (const key of hudOrder()) {
    const node = qs(HUD_CHIP_SELECTORS[key]);
    if (!node) continue;
    node.dataset.hudChip = key;
    bar.appendChild(node);
  }
  applyHudScale();
  applyHudChipStyles();
  applyChipRules();
}

function hudProfiles() {
  return Array.isArray(hudOverlay().profiles) ? hudOverlay().profiles : [];
}

function applyHudProfile(profile, options = {}) {
  if (!profile) return;
  const overlay = hudOverlay();
  hudSetConfig({
    overlay: {
      width: Number(profile.width) || overlay.width,
      height: Number(profile.height) || overlay.height,
      opacity: Number(profile.opacity) || overlay.opacity,
      anchor: profile.anchor || overlay.anchor,
      monitor: Number.isFinite(Number(profile.monitor)) ? Number(profile.monitor) : overlay.monitor,
      chipOrder: Array.isArray(profile.chipOrder) ? profile.chipOrder : hudOrder(),
      showItems: { ...(overlay.showItems || {}), ...(profile.showItems || {}) },
      hudScale: profile.hudScale || hudScale(),
      chipStyles: profile.chipStyles && typeof profile.chipStyles === 'object' ? profile.chipStyles : overlay.chipStyles,
      chipRules: profile.chipRules && typeof profile.chipRules === 'object' ? profile.chipRules : overlay.chipRules
    }
  });
  renderHudEditor();
  if (!options.silent) toast(`HUD-Profil „${profile.name}“ angewendet.`, 'success', 1800);
}

function maybeApplyAutoHudProfile() {
  if (!hudEditorReady) return;
  if (hudOverlay().hudAutoProfile !== true) return;
  const label = `${hudGetLiveActivity() || ''} ${String(hudOverlay().activityStatus || '')}`.trim();
  if (!label) return;
  const key = label.toLowerCase();
  if (key === lastAutoHudKey) return;
  const match = /raid|dungeon|könig|king'?s fall|krise|root of nightmares|salvation|tiefstein|pit of heresy|duality|spire|ghost of the deep|warlord/i.test(label)
    ? 'raid'
    : /schmelztiegel|crucible|pvp|trials|eiserner banner|iron banner|competitive|rival|osiris/i.test(label)
      ? 'pvp'
      : '';
  if (!match) return;
  const candidates = hudProfiles().filter((entry) => !entry.display || !hudDisplaySignature || entry.display === hudDisplaySignature);
  const profile = candidates.find((entry) => entry.match === match)
    || candidates.find((entry) => entry.match === 'all');
  if (!profile) return;
  lastAutoHudKey = key;
  applyHudProfile(profile, { silent: true });
}

function renderHudEditor() {
  const panel = qs('#hudEditorPanel');
  if (!panel) return;
  for (const button of panel.querySelectorAll('[data-hud-scale]')) {
    button.classList.toggle('on', button.dataset.hudScale === hudScale());
  }
  const list = qs('#hudChipList');
  if (list) {
    const order = hudOrder();
    const showItems = hudOverlay().showItems || {};
    list.innerHTML = order.map((key, index) => {
      const label = (HUD_CHIPS.find(([chip]) => chip === key) || [key, key])[1];
      const visible = showItems[key] !== false;
      const style = hudChipStyle(key);
      const chipScale = ['s', 'm', 'l'].includes(style.scale) ? style.scale : 'm';
      const chipColor = style.color || '#9aa6b6';
      const toggle = HUD_HIDEABLE.includes(key)
        ? `<input type="checkbox" data-hud-visible="${key}" ${visible ? 'checked' : ''} title="Chip anzeigen">`
        : '';
      return `<div class="hud-chip-row${visible ? '' : ' hidden-chip'}" draggable="true" data-hud-chip="${key}" title="Ziehen zum Sortieren">
        <span class="hud-chip-name">${escapeHtml(label)}</span>
        ${toggle}
        <select data-hud-chip-scale="${key}" title="Chip-Größe">
          <option value="s" ${chipScale === 's' ? 'selected' : ''}>S</option>
          <option value="m" ${chipScale === 'm' ? 'selected' : ''}>M</option>
          <option value="l" ${chipScale === 'l' ? 'selected' : ''}>L</option>
        </select>
        <input type="color" data-hud-chip-color="${key}" value="${chipColor}" title="Chip-Farbe">
        <button type="button" data-hud-color-clear="${key}" title="Farbe zurücksetzen">×</button>
        <select data-hud-rule="${key}" title="Sichtbarkeit nach Aktivität">
          <option value="always" ${(hudChipRules()[key] || 'always') === 'always' ? 'selected' : ''}>Alle</option>
          <option value="pve" ${hudChipRules()[key] === 'pve' ? 'selected' : ''}>PvE</option>
          <option value="pvp" ${hudChipRules()[key] === 'pvp' ? 'selected' : ''}>PvP</option>
        </select>
        <button type="button" data-hud-move="up" data-hud-key="${key}" ${index === 0 ? 'disabled' : ''} title="Nach vorne">↑</button>
        <button type="button" data-hud-move="down" data-hud-key="${key}" ${index === order.length - 1 ? 'disabled' : ''} title="Nach hinten">↓</button>
      </div>`;
    }).join('');
  }
  const select = qs('#hudProfileSelect');
  if (select) {
    const current = String(select.value || '');
    select.innerHTML = '<option value="">Profil wählen …</option>' + hudProfiles()
      .map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}${profile.match === 'pvp' ? ' · PvP' : profile.match === 'raid' ? ' · Raid' : ''}</option>`)
      .join('');
    if (current && hudProfiles().some((profile) => profile.id === current)) select.value = current;
  }
  const auto = qs('#hudAutoProfile');
  if (auto) auto.checked = hudOverlay().hudAutoProfile === true;
  const hint = qs('#hudEditorHint');
  if (hint) hint.textContent = `${hudOrder().length} Chips · ${HUD_SCALE_LABELS[hudScale()]}`;
}

function toggleHudEditor(force) {
  const panel = qs('#hudEditorPanel');
  if (!panel) return;
  const show = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !show);
  const button = qs('#overlayHudEditBtn');
  if (button) button.setAttribute('aria-expanded', show ? 'true' : 'false');
  document.body.classList.toggle('hud-edit', show);
  applyChipRules();
  if (show) {
    renderHudEditor();
    qs('#hudEditorClose')?.focus?.();
  }
}

function moveHudChip(key, direction) {
  const order = hudOrder();
  const index = order.indexOf(key);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return;
  const next = order.slice();
  [next[index], next[target]] = [next[target], next[index]];
  hudSetConfig({ overlay: { chipOrder: next } });
  renderHudEditor();
}

async function saveHudProfileFromEditor() {
  const nameInput = qs('#hudProfileName');
  const name = String((nameInput && nameInput.value) || '').trim().slice(0, 30);
  if (!name) {
    toast('Bitte einen Profilnamen eingeben.', 'info', 2000);
    nameInput?.focus();
    return;
  }
  const overlay = hudOverlay();
  const match = String(qs('#hudProfileMatch')?.value || 'all');
  const onlyDisplay = qs('#hudProfileDisplay')?.checked === true;
  if (onlyDisplay && !hudDisplaySignature && hudApi && typeof hudApi.getDisplayInfo === 'function') {
    try {
      const info = await hudApi.getDisplayInfo();
      if (info && info.ok && info.signature) hudDisplaySignature = String(info.signature);
    } catch (error) { /* egal */ }
  }
  const profiles = hudProfiles().slice();
  const profile = {
    id: `hud-${Date.now().toString(36)}`,
    name,
    width: overlay.width,
    height: overlay.height,
    opacity: overlay.opacity,
    anchor: overlay.anchor,
    monitor: Number(overlay.monitor) || 0,
    chipOrder: hudOrder(),
    showItems: { ...(overlay.showItems || {}) },
    hudScale: hudScale(),
    chipStyles: { ...hudChipStyles() },
    chipRules: { ...hudChipRules() },
    display: onlyDisplay ? hudDisplaySignature : '',
    match: ['pvp', 'raid'].includes(match) ? match : 'all'
  };
  const existingIndex = profiles.findIndex((entry) => String(entry.name || '').toLowerCase() === name.toLowerCase());
  if (existingIndex >= 0) profiles[existingIndex] = profile;
  else profiles.push(profile);
  hudSetConfig({ overlay: { profiles: profiles.slice(-8) } });
  if (nameInput) nameInput.value = '';
  renderHudEditor();
  toast(`HUD-Profil „${name}“ gespeichert.`, 'success', 2000);
}

function exportHudProfiles() {
  const profiles = hudProfiles();
  if (!profiles.length) {
    toast('Noch keine HUD-Profile zum Export.', 'info', 2200);
    return;
  }
  const selected = String(qs('#hudProfileSelect')?.value || '');
  const list = selected ? profiles.filter((entry) => entry.id === selected) : profiles;
  const payload = {
    format: 'd2tool.hud',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: list
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `d2tool-hud-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  toast(`${list.length} HUD-Profil(e) exportiert.`, 'success', 2200);
}

async function importHudProfiles(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const raw = Array.isArray(data) ? data : (Array.isArray(data.profiles) ? data.profiles : []);
    if (!raw.length) throw new Error('Keine Profile in der Datei.');
    const merged = hudProfiles().slice();
    let imported = 0;
    for (const entry of raw.slice(0, 8)) {
      if (!entry || typeof entry !== 'object') continue;
      const name = String(entry.name || '').trim().slice(0, 30);
      if (!name) continue;
      const profile = {
        ...entry,
        id: `hud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        name
      };
      const index = merged.findIndex((existing) => String(existing.name || '').toLowerCase() === name.toLowerCase());
      if (index >= 0) merged[index] = profile;
      else merged.push(profile);
      imported += 1;
    }
    if (!imported) throw new Error('Keine gültigen Profile gefunden.');
    hudSetConfig({ overlay: { profiles: merged.slice(-8) } });
    renderHudEditor();
    toast(`${imported} HUD-Profil(e) importiert.`, 'success', 2400);
  } catch (error) {
    toast(`Import fehlgeschlagen: ${error.message || error}`, 'error', 3000);
  }
}

function resetHudLayout() {
  const overlay = hudOverlay();
  const showItems = { ...(overlay.showItems || {}) };
  for (const key of HUD_HIDEABLE) showItems[key] = true;
  hudSetConfig({
    overlay: {
      chipOrder: HUD_DEFAULT_ORDER.slice(),
      hudScale: 'm',
      chipStyles: {},
      chipRules: {},
      showItems
    }
  });
  renderHudEditor();
  toast('HUD-Layout zurückgesetzt.', 'success', 1800);
}

function bindHudEditor() {
  const panel = qs('#hudEditorPanel');
  if (panel) {
    qs('#overlayHudEditBtn')?.addEventListener('click', () => toggleHudEditor());
    qs('#hudEditorClose')?.addEventListener('click', () => toggleHudEditor(false));
    panel.addEventListener('click', (event) => {
      const scaleBtn = event.target.closest('[data-hud-scale]');
      if (scaleBtn) {
        hudSetConfig({ overlay: { hudScale: scaleBtn.dataset.hudScale } });
        renderHudEditor();
        return;
      }
      const moveBtn = event.target.closest('[data-hud-move]');
      if (moveBtn) {
        moveHudChip(String(moveBtn.dataset.hudKey || ''), String(moveBtn.dataset.hudMove || ''));
        return;
      }
      if (event.target.closest('#hudProfileApply')) {
        const id = String(qs('#hudProfileSelect')?.value || '');
        applyHudProfile(hudProfiles().find((profile) => profile.id === id));
        return;
      }
      if (event.target.closest('#hudProfileSave')) {
        saveHudProfileFromEditor().catch(() => {});
        return;
      }
      if (event.target.closest('#hudProfileExport')) {
        exportHudProfiles();
        return;
      }
      if (event.target.closest('#hudProfileImport')) {
        qs('#hudProfileFile')?.click();
        return;
      }
      const colorClear = event.target.closest('[data-hud-color-clear]');
      if (colorClear) {
        const key = String(colorClear.dataset.hudColorClear || '');
        hudSetConfig({ overlay: { chipStyles: { [key]: { ...hudChipStyle(key), color: '' } } } });
        renderHudEditor();
        return;
      }
      if (event.target.closest('#hudReset')) {
        resetHudLayout();
      }
    });
    panel.addEventListener('change', (event) => {
      const visible = event.target.closest('[data-hud-visible]');
      if (visible) {
        const key = String(visible.dataset.hudVisible || '');
        hudSetConfig({ overlay: { showItems: { [key]: visible.checked === true } } });
        renderHudEditor();
        return;
      }
      const chipScale = event.target.closest('[data-hud-chip-scale]');
      if (chipScale) {
        const key = String(chipScale.dataset.hudChipScale || '');
        const value = ['s', 'm', 'l'].includes(chipScale.value) ? chipScale.value : 'm';
        hudSetConfig({ overlay: { chipStyles: { [key]: { ...hudChipStyle(key), scale: value } } } });
        renderHudEditor();
        return;
      }
      const chipColor = event.target.closest('[data-hud-chip-color]');
      if (chipColor) {
        const key = String(chipColor.dataset.hudChipColor || '');
        const value = /^#[0-9a-f]{6}$/i.test(String(chipColor.value || '')) ? chipColor.value : '';
        hudSetConfig({ overlay: { chipStyles: { [key]: { ...hudChipStyle(key), color: value } } } });
        renderHudEditor();
        return;
      }
      const chipRule = event.target.closest('[data-hud-rule]');
      if (chipRule) {
        const key = String(chipRule.dataset.hudRule || '');
        const value = ['always', 'pve', 'pvp'].includes(chipRule.value) ? chipRule.value : 'always';
        hudSetConfig({ overlay: { chipRules: { [key]: value } } });
        renderHudEditor();
        return;
      }
      if (event.target.closest('#hudProfileFile')) {
        importHudProfiles(event.target.files && event.target.files[0]).catch(() => {});
        event.target.value = '';
        return;
      }
      if (event.target.closest('#hudAutoProfile')) {
        hudSetConfig({ overlay: { hudAutoProfile: event.target.checked === true } });
        lastAutoHudKey = '';
        maybeApplyAutoHudProfile();
      }
    });
    let hudDragKey = '';
    panel.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-hud-chip]');
      if (!row) return;
      hudDragKey = String(row.dataset.hudChip || '');
      row.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', hudDragKey);
      }
    });
    panel.addEventListener('dragover', (event) => {
      if (!hudDragKey) return;
      const row = event.target.closest('[data-hud-chip]');
      if (!row) return;
      event.preventDefault();
      panel.querySelectorAll('.hud-chip-row.drag-over').forEach((element) => element.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    panel.addEventListener('drop', (event) => {
      if (!hudDragKey) return;
      const row = event.target.closest('[data-hud-chip]');
      if (!row) return;
      event.preventDefault();
      const targetKey = String(row.dataset.hudChip || '');
      if (!targetKey || targetKey === hudDragKey) return;
      const order = hudOrder().filter((key) => key !== hudDragKey);
      const targetIndex = order.indexOf(targetKey);
      if (targetIndex < 0) return;
      order.splice(targetIndex, 0, hudDragKey);
      hudSetConfig({ overlay: { chipOrder: order } });
      hudDragKey = '';
      renderHudEditor();
    });
    panel.addEventListener('dragend', () => {
      hudDragKey = '';
      panel.querySelectorAll('.hud-chip-row.dragging, .hud-chip-row.drag-over')
        .forEach((element) => element.classList.remove('dragging', 'drag-over'));
    });
  }
  const bar = qs('#overlayBar');
  if (bar) {
    let barDragKey = '';
    bar.addEventListener('dragstart', (event) => {
      if (!document.body.classList.contains('hud-edit')) return;
      const chip = event.target.closest('[data-hud-chip]');
      if (!chip) return;
      barDragKey = String(chip.dataset.hudChip || '');
      chip.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', barDragKey);
      }
    });
    bar.addEventListener('dragover', (event) => {
      if (!barDragKey) return;
      const chip = event.target.closest('[data-hud-chip]');
      if (!chip) return;
      event.preventDefault();
      bar.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
      chip.classList.add('drag-over');
    });
    bar.addEventListener('drop', (event) => {
      if (!barDragKey) return;
      const chip = event.target.closest('[data-hud-chip]');
      if (!chip) return;
      event.preventDefault();
      const targetKey = String(chip.dataset.hudChip || '');
      if (!targetKey || targetKey === barDragKey) return;
      const order = hudOrder().filter((key) => key !== barDragKey);
      const targetIndex = order.indexOf(targetKey);
      if (targetIndex < 0) return;
      order.splice(targetIndex, 0, barDragKey);
      hudSetConfig({ overlay: { chipOrder: order } });
      barDragKey = '';
      renderHudEditor();
    });
    bar.addEventListener('dragend', () => {
      barDragKey = '';
      bar.querySelectorAll('.dragging, .drag-over').forEach((element) => element.classList.remove('dragging', 'drag-over'));
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const panelEl = qs('#hudEditorPanel');
    if (panelEl && !panelEl.classList.contains('hidden')) {
      event.stopPropagation();
      toggleHudEditor(false);
    }
  });
}

export function createOverlayHud(options = {}) {
  hudApi = options.api || null;
  hudGetConfig = options.getConfig || (() => ({}));
  hudSetConfig = options.setConfig || (() => {});
  hudGetLiveActivity = options.getLiveActivityName || (() => '');
  if (hudApi && typeof hudApi.getDisplayInfo === 'function') {
    hudApi.getDisplayInfo().then((info) => {
      if (info && info.ok && info.signature) hudDisplaySignature = String(info.signature);
    }).catch(() => {});
  }
  bindHudEditor();
  hudEditorReady = true;
  applyHudScale();
  applyChipOrder();
  renderHudEditor();
  maybeApplyAutoHudProfile();
  return {
    applyChipOrder,
    applyHudScale,
    render: renderHudEditor,
    toggle: toggleHudEditor,
    maybeAutoApply: maybeApplyAutoHudProfile
  };
}
