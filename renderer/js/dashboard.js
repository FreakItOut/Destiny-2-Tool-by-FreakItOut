// ============================================================
// Dashboard (native Start-Seite)
// ============================================================
// Aus app.js extrahierte Feature-Einheit (Phase 2). Bekommt die
// App-Abhängigkeiten per Kontext (ctx).
//
// Neu: Das Dashboard ist jetzt ein Destiny-Kommandostand statt
// einer Sammlung von Website-Karten. Es beantwortet beim Öffnen
// drei Fragen:
//   1. Wer bin ich gerade und wie stark bin ich? (Held + Power)
//   2. Was sollte ich jetzt tun? (dynamische Prioritäten)
//   3. Was passiert diese Woche? (Checkliste, Aktionen, Reset, Xûr)

import { qs, qsa, escapeHtml, toast, formatDuration } from './ui.js';
import { icon } from './icons.js';
import { nextDailyReset, nextWeeklyReset, xurEnd, xurActive } from './clock.js';

export function createDashboard(ctx) {
  const { getConfig, setConfig } = ctx;
  const dashboardPanel = qs('#dashboardPanel');
  const dashboardBtn = qs('#dashboardBtn');
  const overlayDashboardBtn = qs('#overlayDashboardBtn');
  const dashChecklistBody = qs('#dashChecklistBody');
  const dashChecklistEditBtn = qs('#dashChecklistEdit');
  const dashNewsRefreshBtn = qs('#dashNewsRefresh');
  const dashMilestoneRefreshBtn = qs('#dashMilestoneRefresh');
  let dashboardTimer = null;
  let dashData = null;
  let dashLoading = false;
  let dashAutoTried = false;
  let xurData = null;
  let xurTried = false;
  let milestonesLoadedAt = 0;
  let milestonesLoading = false;
  let newsLoadedAt = 0;
  let newsLoading = false;
  let bungieStatus = null;
  let bungieCheck = null;
  let queueStatus = null;
  let storageStatus = null;
  let statusLoadedAt = 0;
  let statusLoading = false;
  let appInfo = null;
  let postmasterState = null;

  const CLASS_NAMES = ['Titan', 'Jäger', 'Warlock'];
  const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645]);
  const ARMOR_BUCKETS = new Set([3448274439, 3551918588, 14239492, 20886954, 1585787867]);
  const GEAR_BUCKETS = new Set([...WEAPON_BUCKETS, ...ARMOR_BUCKETS]);
  // Tresor-Kapazität (Destiny 2: 1300 Plätze). Warnungen bei 85 % / 96 %.
  const VAULT_CAPACITY = 1300;
  const VAULT_WARN = Math.round(VAULT_CAPACITY * 0.85);
  const VAULT_HIGH = Math.round(VAULT_CAPACITY * 0.96);
  const LOCALE = () => (window.i18n ? window.i18n.locale() : 'de-DE');

  function esc(value) {
    return escapeHtml(String(value == null ? '' : value));
  }

  function fmtNumber(value) {
    return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function hasApiKey() {
    const bungie = getConfig().bungie || {};
    return Boolean(bungie.apiKeyEnc || String(bungie.apiKey || '').trim());
  }

  function itemPower(item) {
    return Math.max(0, Number(item && item.power) || 0);
  }

  function allItems(data) {
    if (!data) return [];
    const items = [];
    for (const item of data.vault || []) items.push(item);
    for (const list of Object.values(data.backpack || {})) {
      for (const item of list || []) items.push(item);
    }
    for (const list of Object.values(data.equipped || {})) {
      for (const item of list || []) items.push(item);
    }
    return items;
  }

  function compatible(character, item) {
    if (!item) return false;
    if (WEAPON_BUCKETS.has(Number(item.bucket))) return true;
    if (!ARMOR_BUCKETS.has(Number(item.bucket))) return false;
    return Number(item.classType) === 3 || Number(item.classType) === Number(character.classType);
  }

  const POWER_SLOTS = [
    { key: 1498876634, label: 'Kinetik' },
    { key: 2465295065, label: 'Energie' },
    { key: 953998645, label: 'Schwer' },
    { key: 3448274439, label: 'Helm' },
    { key: 3551918588, label: 'Arme' },
    { key: 14239492, label: 'Brust' },
    { key: 20886954, label: 'Beine' },
    { key: 1585787867, label: 'Klasse' }
  ];
  const BREAKER_LABELS = { 1: 'Anti-Barriere', 2: 'Überladung', 3: 'Unaufhaltsam' };
  const CHAMPION_LABELS = ['Anti-Barriere', 'Überladung', 'Unaufhaltsam'];

  function gearEntries(data) {
    const out = [];
    for (const item of (data && data.vault) || []) out.push({ item, kind: 'vault', owner: '' });
    for (const [owner, list] of Object.entries((data && data.backpack) || {})) {
      for (const item of list || []) out.push({ item, kind: 'backpack', owner });
    }
    for (const [owner, list] of Object.entries((data && data.equipped) || {})) {
      for (const item of list || []) out.push({ item, kind: 'equipped', owner });
    }
    return out;
  }

  function isLocked(item) {
    return Boolean((Number(item && item.state) || 0) & 1);
  }

  function isFav(item) {
    const favs = (getConfig().bungie && getConfig().bungie.favs) || {};
    return Boolean(item && item.instanceId && favs[item.instanceId]);
  }

  function gearLocation(entry) {
    if (!entry) return '';
    if (entry.kind === 'vault') return 'Tresor';
    if (entry.kind === 'equipped') return 'Angelegt';
    return 'Beutetasche';
  }

  function breakerTypesOf(item) {
    const types = new Set();
    const add = (value) => {
      const type = Math.round(Number(value) || 0);
      if (type > 0) types.add(type);
    };
    add(item && item.breakerType);
    for (const perk of (item && item.perks) || []) add(perk && perk.breakerType);
    for (const column of (item && item.socketColumns) || []) {
      for (const option of (column && column.options) || []) if (option && option.selected) add(option.breakerType);
    }
    for (const plug of (item && item.modSockets) || []) add(plug && plug.breakerType);
    return types;
  }

  function frameBreakerType(item) {
    const frames = [];
    for (const column of (item && item.socketColumns) || []) {
      if (Number(column.idx) !== 0) continue;
      for (const option of (column.options || [])) if (option && option.selected) frames.push(option.n, option.p);
    }
    for (const perk of ((item && item.perks) || []).slice(0, 2)) if (perk && perk.n) frames.push(perk.n);
    const text = frames.filter(Boolean).join(' ').toLowerCase();
    if (!text) return 0;
    if (/mikro.?raketen|micro.?missile|doppelfeuer|double.?fire|wellen|wave|komprimierte welle|compressed wave|schwere salve|heavy.?burst|aggressiv|aggressive|hochenergie|high.?impact|raketenunterstützt|rocket.?assisted/.test(text)) return 3;
    if (/flächenschaden|area.?denial|leichtgewicht|lightweight|schnellfeuer|rapid.?fire|vortex|spread.?shot|dynamische hitze|dynamic heat|ausgeglichene hitze|balanced heat|unterstützung|support/.test(text)) return 2;
    if (/präzision|precision|adaptiv|adaptive|legacy pr.?55|disruption weapon|störungswaffe|schildbrechend|caster/.test(text)) return 1;
    return 0;
  }

  function championCoverage(data) {
    const entries = gearEntries(data);
    return ((data && data.characters) || []).map((character) => {
      const weapons = [];
      for (const entry of entries) {
        if (entry.kind !== 'equipped' || entry.owner !== character.id) continue;
        if (!WEAPON_BUCKETS.has(Number(entry.item.bucket))) continue;
        const abilities = new Set();
        for (const type of breakerTypesOf(entry.item)) {
          const label = BREAKER_LABELS[type];
          if (label) abilities.add(label);
        }
        if (!abilities.size) {
          const fallback = BREAKER_LABELS[frameBreakerType(entry.item)];
          if (fallback) abilities.add(fallback);
        }
        if (abilities.size) weapons.push({ name: entry.item.name || 'Waffe', abilities: [...abilities] });
      }
      return {
        character,
        coverage: CHAMPION_LABELS.map((label) => weapons.filter((weapon) => weapon.abilities.includes(label)).map((weapon) => weapon.name))
      };
    });
  }

  function renderChampionCard() {
    const body = qs('#dashChampionBody');
    const meta = qs('#dashChampionMeta');
    if (!body) return;
    if (!dashData) {
      body.innerHTML = '<span class="dash-muted">Inventar laden, um Champion-Fähigkeiten zu prüfen.</span>';
      if (meta) meta.textContent = '';
      return;
    }
    const rows = championCoverage(dashData);
    if (!rows.length) {
      body.innerHTML = '<span class="dash-muted">Keine Charakterdaten.</span>';
      return;
    }
    const ready = rows.filter((row) => row.coverage.some((names) => names.length)).length;
    if (meta) meta.textContent = `${ready}/${rows.length} Hüter abgedeckt`;
    body.innerHTML = rows.map(({ character, coverage }) => {
      const any = coverage.some((names) => names.length);
      const sources = coverage
        .map((names, index) => names.length ? `${CHAMPION_LABELS[index]}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ' …' : ''}` : '')
        .filter(Boolean).join(' · ');
      return `<div class="inv-tool-row inv-tool-champ-row"><span class="inv-tool-main">${esc(CLASS_NAMES[character.classType] || 'Hüter')}${any ? '' : ' <span class="inv-tool-warn">⚠ keine Champion-Fähigkeit</span>'}</span>` +
        `<span class="inv-tool-champs">${CHAMPION_LABELS.map((label, index) => `<span class="inv-tool-chip ${coverage[index].length ? 'on' : ''}" title="${esc(coverage[index].join(', ') || 'keine Waffe')}">${esc(label)}</span>`).join('')}</span>` +
        `</div>${sources ? `<div class="inv-tool-champ-src">${esc(sources)}</div>` : ''}`;
    }).join('') + '<div class="inv-tool-muted">Prüft die ausgerüsteten Waffen auf intrinsische Champion-Fähigkeiten (Anti-Barriere, Überladung, Unaufhaltsam).</div>';
  }

  function renderPowerCard() {
    const body = qs('#dashPowerBody');
    const meta = qs('#dashPowerMeta');
    if (!body) return;
    if (!dashData) {
      body.innerHTML = '<span class="dash-muted">Inventar laden, um Power und Infusions-Futter zu sehen.</span>';
      if (meta) meta.textContent = '';
      return;
    }
    const entries = gearEntries(dashData);
    const characters = dashData.characters || [];
    if (meta) meta.textContent = `${characters.length} Hüter · Basis-Roll`;
    body.innerHTML = characters.map((character) => {
      const own = entries.filter((entry) => compatible(character, entry.item));
      const equipped = own.filter((entry) => entry.kind === 'equipped' && entry.owner === character.id);
      const slots = POWER_SLOTS.map((slot) => {
        const inSlot = own.filter((entry) => Number(entry.item.bucket) === slot.key);
        const best = inSlot.slice().sort((a, b) => itemPower(b.item) - itemPower(a.item))[0];
        const equippedItem = equipped.find((entry) => Number(entry.item.bucket) === slot.key);
        return { ...slot, best, equippedItem };
      });
      const equippedPowers = slots.map((slot) => slot.equippedItem ? itemPower(slot.equippedItem.item) : 0).filter((power) => power > 0);
      const bestPowers = slots.map((slot) => slot.best ? itemPower(slot.best.item) : 0).filter((power) => power > 0);
      const currentPower = equippedPowers.length ? Math.round(equippedPowers.reduce((sum, power) => sum + power, 0) / equippedPowers.length) : Number(character.light) || 0;
      const potentialPower = bestPowers.length ? Math.round(bestPowers.reduce((sum, power) => sum + power, 0) / bestPowers.length) : currentPower;
      const weakest = slots.filter((slot) => slot.equippedItem).sort((a, b) => itemPower(a.equippedItem.item) - itemPower(b.equippedItem.item))[0];
      const fodder = [];
      for (const slot of slots) {
        if (!slot.equippedItem || !slot.best) continue;
        const equippedPower = itemPower(slot.equippedItem.item);
        if (itemPower(slot.best.item) <= equippedPower) continue;
        for (const entry of own) {
          const item = entry.item;
          if (Number(item.bucket) !== slot.key) continue;
          if (entry.kind === 'equipped' && entry.owner === character.id) continue;
          if (itemPower(item) <= equippedPower) continue;
          if (isLocked(item) || isFav(item) || item.godRoll) continue;
          if (fodder.some((seen) => seen.item.instanceId === item.instanceId)) continue;
          fodder.push({ ...entry, slot: slot.label, gain: itemPower(item) - equippedPower });
        }
      }
      fodder.sort((a, b) => b.gain - a.gain || itemPower(b.item) - itemPower(a.item));
      const slotRows = slots.map((slot) => {
        const currentItem = slot.equippedItem ? slot.equippedItem.item : null;
        const currentPower = currentItem ? itemPower(currentItem) : 0;
        const bestItem = slot.best ? slot.best.item : null;
        const delta = bestItem ? itemPower(bestItem) - currentPower : 0;
        return `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(slot.label)}</span>` +
          `<span class="inv-tool-main">${currentItem ? `${esc(currentItem.name)} · ${currentPower}` : '<span class="inv-tool-muted">— nicht angelegt</span>'}</span>` +
          `<span class="inv-tool-meta">${bestItem && delta > 0 ? `→ ${esc(bestItem.name)} · ${itemPower(bestItem)}` : ''}</span>` +
          `<span class="inv-tool-delta ${delta > 0 ? 'up' : ''}">${delta > 0 ? `+${delta}` : ''}</span></div>`;
      }).join('');
      const fodderHtml = fodder.length
        ? `<div class="inv-tool-sub">Infusions-Futter für das aktuelle Loadout</div>` + fodder.slice(0, 4).map((entry) =>
            `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(entry.item.name)}</span><span class="inv-tool-meta">${esc(entry.slot)} · ${itemPower(entry.item)} (+${entry.gain}) · ${esc(gearLocation(entry))}</span></div>`
          ).join('')
        : '<div class="inv-tool-muted">Kein besseres Futter für das aktuelle Loadout gefunden.</div>';
      return `<div class="inv-tool-char"><div class="inv-tool-char-head"><strong>${esc(CLASS_NAMES[character.classType] || 'Hüter')}</strong>` +
        `<span>Aktuell ${currentPower} Licht${potentialPower > currentPower ? ` · Potenzial ${potentialPower}` : ''}</span>` +
        `${weakest ? `<span class="inv-tool-warn">Schwächster Slot: ${esc(weakest.label)} (${itemPower(weakest.equippedItem.item)})</span>` : ''}` +
        `</div><details class="inv-tool-details"><summary>Alle Slots &amp; Infusions-Futter</summary>${slotRows}${fodderHtml}</details></div>`;
    }).join('') || '<span class="dash-muted">Keine Charaktere.</span>';
  }

  function renderTriumphCard() {
    const body = qs('#dashTriumphBody');
    const meta = qs('#dashTriumphMeta');
    if (!body) return;
    let tracked = [];
    let history = [];
    try {
      const rawTracked = JSON.parse(window.localStorage.getItem('d2tool.trackedTriumphs') || '[]');
      if (Array.isArray(rawTracked)) tracked = rawTracked.filter((entry) => entry && Number(entry.hash));
      const rawHistory = JSON.parse(window.localStorage.getItem('d2tool.triumphHistory') || '[]');
      if (Array.isArray(rawHistory)) history = rawHistory.filter((entry) => entry && entry.d).slice(-14);
    } catch (error) {
      tracked = [];
      history = [];
    }
    if (meta) meta.textContent = tracked.length ? `${tracked.length} verfolgt` : '';
    if (!tracked.length) {
      body.innerHTML = '<span class="dash-muted">Noch keine verfolgten Triumphe – im Werkzeug-Tab mit ★ markieren.</span>' +
        '<div class="dash-status-actions"><button type="button" class="btn ghost small" data-dash-action="tools">Werkzeuge öffnen</button></div>';
      return;
    }
    const latest = history.length ? history[history.length - 1] : null;
    const first = history.length ? history[0] : null;
    const delta = latest && first ? (Number(latest.lifetime) || 0) - (Number(first.lifetime) || 0) : 0;
    const rows = tracked.slice(0, 5).map((entry) => {
      const completion = Math.max(1, Number(entry.completion) || 1);
      const progress = Math.max(0, Number(entry.progress) || 0);
      const pct = Math.max(0, Math.min(100, Math.round(progress / completion * 100)));
      return `<div class="dash-triumph-row">` +
        `${entry.icon ? `<img src="https://www.bungie.net${esc(entry.icon)}" alt="">` : '<span class="dash-triumph-dot">★</span>'}` +
        `<div class="dash-triumph-text"><strong>${esc(entry.name || 'Triumph')}</strong>` +
        `<div class="dash-progress"><span style="width:${pct}%"></span></div></div>` +
        `<b>${progress}/${Number(entry.completion) || 0}</b>` +
      `</div>`;
    }).join('');
    body.innerHTML = `<div class="dash-triumph-summary">` +
      `<span><b>${latest ? fmtNumber(latest.active) : '–'}</b> Aktive Punkte</span>` +
      `<span><b>${latest ? fmtNumber(latest.lifetime) : '–'}</b> Lebenszeit</span>` +
      `<span class="${delta >= 0 ? 'dash-triumph-up' : ''}"><b>${delta >= 0 ? '+' : ''}${fmtNumber(delta)}</b> seit Verlaufsstart</span>` +
    `</div><div class="dash-triumph-list">${rows}</div>` +
    `<div class="dash-status-actions"><button type="button" class="btn ghost small" data-dash-action="tools">Alle Triumphe</button></div>`;
  }


  function postmasterCount(data) {
    return Object.values((data && data.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }

  function backpackCount(data) {
    return Object.values((data && data.backpack) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }

  function duplicateCount(data) {
    const seen = new Map();
    let extra = 0;
    for (const list of Object.values((data && data.backpack) || {})) {
      for (const item of list || []) {
        const key = String(item && item.hash || '');
        if (!key) continue;
        if (seen.has(key)) extra += 1;
        else seen.set(key, true);
      }
    }
    return extra;
  }

  function potentialPower(character, data) {
    if (!character || !data) return 0;
    const best = new Map();
    for (const item of allItems(data)) {
      const bucket = Number(item && item.bucket) || 0;
      if (!GEAR_BUCKETS.has(bucket)) continue;
      if (!compatible(character, item)) continue;
      const power = itemPower(item);
      if (power > (best.get(bucket) || 0)) best.set(bucket, power);
    }
    if (!best.size) return 0;
    let sum = 0;
    for (const power of best.values()) sum += power;
    return Math.round(sum / best.size);
  }

  function openDashboard() {
    if (!dashboardPanel) return;
    if (ctx.onOpen) {
      try { ctx.onOpen(); } catch (error) { /* egal */ }
    }
    dashboardPanel.classList.remove('hidden');
    ctx.web.hide();
    ctx.emptyState.classList.add('hidden');
    ctx.hideError();
    ctx.loadingBar.classList.add('hidden');
    ctx.loadState.textContent = '';
    ctx.pageTitle.textContent = 'Dashboard';
    ctx.updateWindowTitle();
    ctx.siteDesc.textContent = '';
    renderDashboard();
    updateDashboardClocks();
    if (dashboardTimer) clearInterval(dashboardTimer);
    let clockTicks = 0;
    dashboardTimer = setInterval(() => {
      if (dashboardHidden()) return;
      updateDashboardClocks();
      clockTicks += 1;
      if (clockTicks % 30 === 0) updateApiChip();
    }, 1000);
    if (dashboardTimer.unref) dashboardTimer.unref();
    loadInventory(false);
    loadStatus(false, false);
    maybeLoadXur();
  }

  function dashboardHidden() {
    return !dashboardPanel || dashboardPanel.classList.contains('hidden');
  }

  function hideDashboard() {
    if (!dashboardPanel) return;
    dashboardPanel.classList.add('hidden');
    if (dashboardTimer) {
      clearInterval(dashboardTimer);
      dashboardTimer = null;
    }
  }

  function restoreAfterDashboard() {
    hideDashboard();
    const site = currentSite();
    if (site) {
      ctx.web.show(site);
      ctx.pageTitle.textContent = site.name;
    } else {
      ctx.showEmpty();
    }
    ctx.updateWindowTitle();
  }

  function currentSite() {
    const config = getConfig();
    const categoryId = config.lastCategory;
    const siteId = (config.lastSite && config.lastSite[categoryId]) || '';
    for (const category of ctx.getCategories()) {
      if (category.id !== categoryId) continue;
      return category.sites.find((site) => site.id === siteId) || null;
    }
    return null;
  }

  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      if (dashboardHidden()) openDashboard();
      else restoreAfterDashboard();
    });
  }
  if (overlayDashboardBtn) {
    overlayDashboardBtn.addEventListener('click', () => {
      if (dashboardHidden()) openDashboard();
      else restoreAfterDashboard();
    });
  }

  // ------------------------------------------------------------
  // Daten laden
  // ------------------------------------------------------------
  async function loadInventory(force) {
    if (dashLoading) return;
    dashLoading = true;
    if (!dashData) renderPriorities();
    try {
      let result = null;
      if (force) {
        result = await ctx.api.bungieInventory();
      } else {
        result = await ctx.api.bungieInventoryCached();
      }
      if (result && result.ok) {
        dashData = result;
      } else if (!force && !dashData && hasApiKey() && !dashAutoTried) {
        dashAutoTried = true;
        dashLoading = false;
        return loadInventory(true);
      }
    } catch (error) {
      // Offline/keine Anmeldung: Dashboard bleibt mit Platzhaltern nutzbar.
    } finally {
      dashLoading = false;
      if (dashboardPanel && !dashboardPanel.classList.contains('hidden')) renderDashboard();
    }
  }

  async function maybeLoadXur() {
    if (xurTried || !hasApiKey()) return;
    // Außerhalb des Xûr-Zeitfensters (Fr 17 UTC bis Di 17 UTC) nicht
    // abfragen – verhindert veraltete „Xûr ist da“-Hinweise.
    if (!xurActive(new Date())) {
      xurTried = true;
      xurData = null;
      return;
    }
    xurTried = true;
    try {
      const result = await ctx.api.bungieXur(false);
      if (result && result.ok) {
        xurData = result;
        if (dashboardPanel && !dashboardPanel.classList.contains('hidden')) renderPriorities();
      }
    } catch (error) {
      // Xûr ist optional.
    }
  }

  // ------------------------------------------------------------
  // Uhrzeiten
  // ------------------------------------------------------------
  let dashFmtLocale = '';
  let dashFmt = null;
  let dashResetDateKey = '';
  let dashResetDateText = '';
  let dashXurDateKey = '';
  let dashXurDateText = '';
  const setDashText = (element, text) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  function dashboardFormatter() {
    const locale = LOCALE();
    if (!dashFmt || dashFmtLocale !== locale) {
      dashFmtLocale = locale;
      dashFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return dashFmt;
  }

  function updateDashboardClocks() {
    const now = new Date();
    const reset = nextDailyReset(now);
    const weekly = nextWeeklyReset(now);
    const resetTime = qs('#dashResetTime');
    const resetDate = qs('#dashResetDate');
    if (resetTime) setDashText(resetTime, formatDuration(reset.getTime() - now.getTime()));
    if (resetDate) {
      const isWeekly = reset.getTime() === weekly.getTime();
      const key = `${reset.getTime()}|${isWeekly ? 'w' : 'd'}|${LOCALE()}`;
      if (key !== dashResetDateKey) {
        dashResetDateKey = key;
        dashResetDateText = `${isWeekly ? 'Weekly' : 'Daily'}: ${dashboardFormatter().format(reset)}`;
      }
      setDashText(resetDate, dashResetDateText);
    }
    const xurState = qs('#dashXurState');
    const xurDate = qs('#dashXurDate');
    if (xurState && xurDate) {
      if (xurActive(now)) {
        setDashText(xurState, `da · ${formatDuration(xurEnd(now).getTime() - now.getTime())}`);
        setDashText(xurDate, 'Weg am Di-Reset');
        xurState.classList.add('dash-active');
      } else {
        const arrival = nextXurArrivalDashboard(now);
        setDashText(xurState, formatDuration(arrival.getTime() - now.getTime()));
        const key = `${arrival.getTime()}|${LOCALE()}`;
        if (key !== dashXurDateKey) {
          dashXurDateKey = key;
          dashXurDateText = `Freitag ${dashboardFormatter().format(arrival)}`;
        }
        setDashText(xurDate, dashXurDateText);
        xurState.classList.remove('dash-active');
      }
    }
  }

  function nextXurArrivalDashboard(now) {
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0, 0));
    const daysUntilFriday = (5 - now.getUTCDay() + 7) % 7;
    target.setUTCDate(target.getUTCDate() + daysUntilFriday);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
    return target;
  }

  // ------------------------------------------------------------
  // API-Chip
  // ------------------------------------------------------------
  async function updateApiChip() {
    const chip = qs('#dashApiChip');
    if (!chip) return;
    const bungie = getConfig().bungie || {};
    const hasKey = Boolean(bungie.apiKeyEnc || String(bungie.apiKey || '').trim());
    let status = null;
    try {
      status = await ctx.api.bungieOAuthStatus();
    } catch (error) {
      status = null;
    }
    const until = status && status.expiresAt
      ? new Date(status.expiresAt).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' })
      : '';
    if (status && status.loggedIn && status.publicClient) {
      chip.dataset.state = 'warn';
      chip.textContent = '🟡';
      chip.title = `Bungie: angemeldet, aber „öffentliche App“ – Anmeldung endet ${until ? `um ${until}` : 'nach ca. 1 Stunde'}.`;
    } else if (status && status.loggedIn) {
      chip.dataset.state = 'oauth';
      chip.textContent = '🟢';
      chip.title = `Bungie: dauerhaft angemeldet${until ? ` (Token bis ${until} Uhr)` : ''}.`;
    } else if (hasKey) {
      chip.dataset.state = 'key';
      chip.textContent = '🔵';
      chip.title = 'Bungie: API-Key gesetzt (ohne Anmeldung).';
    } else {
      chip.dataset.state = 'none';
      chip.textContent = '⚪';
      chip.title = 'Bungie: keine Datenquelle (Key unter Einstellungen → Bungie).';
    }
    chip.style.cursor = 'pointer';
    chip.onclick = () => {
      if (ctx.openBungieSettings) ctx.openBungieSettings();
    };
  }

  // ------------------------------------------------------------
  // Hero + Hüter
  // ------------------------------------------------------------
  function renderHero() {
    const characters = (dashData && dashData.characters) || [];
    const active = characters[0] || null;
    const nameEl = qs('#dashHeroName');
    const subEl = qs('#dashHeroSub');
    const kickerEl = qs('#dashHeroKicker');
    const emblemEl = qs('#dashHeroEmblem');
    const powerEl = qs('#dashHeroPower');
    const deltaEl = qs('#dashHeroDelta');
    const bgEl = qs('#dashHeroBg');
    const playerName = (getConfig().bungie && getConfig().bungie.playerName) || 'Hüter';
    if (nameEl) nameEl.textContent = playerName;
    if (emblemEl) {
      emblemEl.innerHTML = active && active.emblemPath
        ? `<img src="https://www.bungie.net${esc(active.emblemPath)}" alt="">`
        : '✦';
    }
    if (bgEl) {
      bgEl.style.backgroundImage = active && active.emblemBackgroundPath
        ? `linear-gradient(90deg, rgba(6,10,17,0.96) 0%, rgba(6,10,17,0.72) 55%, rgba(6,10,17,0.9) 100%), url('https://www.bungie.net${String(active.emblemBackgroundPath).replace(/'/g, '')}')`
        : 'none';
    }
    if (!active) {
      if (kickerEl) kickerEl.textContent = hasApiKey() ? 'Hüter wird geladen' : 'Keine Bungie-Datenquelle';
      if (subEl) subEl.textContent = hasApiKey()
        ? (dashLoading ? 'Inventar und Charaktere werden geladen …' : 'Noch kein Inventar geladen – öffne das Inventar einmal.')
        : 'API-Key unter Einstellungen → Bungie setzen.';
      if (powerEl) powerEl.textContent = '—';
      if (deltaEl) deltaEl.textContent = '';
      return;
    }
    if (kickerEl) kickerEl.textContent = `${CLASS_NAMES[active.classType] || 'Hüter'} · ${characters.length} Charakter${characters.length === 1 ? '' : 'e'}`;
    const fetched = dashData && dashData.fetchedAt
      ? new Date(dashData.fetchedAt).toLocaleString(LOCALE(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '';
    if (subEl) subEl.textContent = `${Number(active.light) || 0} Licht${fetched ? ` · Stand ${fetched}` : ''}${dashData && dashData.stale ? ' (Cache)' : ''}`;
    if (powerEl) powerEl.textContent = String(Number(active.light) || 0);
    const potential = potentialPower(active, dashData);
    const delta = potential && potential > (Number(active.light) || 0) ? potential - (Number(active.light) || 0) : 0;
    if (deltaEl) deltaEl.textContent = delta ? `+${delta} möglich` : 'bestes Gear angelegt';
    if (deltaEl) deltaEl.classList.toggle('up', delta > 0);
  }

  function renderCharacters() {
    const body = qs('#dashCharactersBody');
    const meta = qs('#dashCharacterMeta');
    if (!body) return;
    const characters = (dashData && dashData.characters) || [];
    if (meta) meta.textContent = characters.length ? `${characters.length} Hüter · zuletzt gespielt zuerst` : '';
    if (!characters.length) {
      body.innerHTML = `<span class="dash-muted">${hasApiKey() ? 'Charaktere werden geladen …' : 'Keine Charaktere – API-Key oder öffentliches Profil nötig.'}</span>`;
      return;
    }
    body.innerHTML = characters.map((character) => {
      const equipped = Object.values((dashData.equipped && dashData.equipped[character.id]) || {});
      const list = (dashData.equipped && dashData.equipped[character.id]) || [];
      const gearCount = (Array.isArray(list) ? list : []).filter((item) => GEAR_BUCKETS.has(Number(item.bucket))).length;
      const potential = potentialPower(character, dashData);
      const delta = potential && potential > (Number(character.light) || 0) ? potential - (Number(character.light) || 0) : 0;
      const last = character.lastPlayed ? new Date(character.lastPlayed) : null;
      const lastText = last && !Number.isNaN(last.getTime())
        ? last.toLocaleString(LOCALE(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—';
      const bg = character.emblemBackgroundPath
        ? ` style="background-image:linear-gradient(90deg,rgba(6,10,17,0.94),rgba(6,10,17,0.55)),url('https://www.bungie.net${String(character.emblemBackgroundPath).replace(/'/g, '')}')"`
        : '';
      return `<button type="button" class="dash-char" data-dash-action="inventory"${bg}>` +
        `<span class="dash-char-class">${esc(CLASS_NAMES[character.classType] || 'Hüter')}</span>` +
        `<strong class="dash-char-power">${Number(character.light) || 0}<small>Power</small></strong>` +
        `<span class="dash-char-meta">${gearCount}/8 Slots${delta ? ` · +${delta} möglich` : ''}</span>` +
        `<span class="dash-char-last">Zuletzt: ${esc(lastText)}</span>` +
        `<span class="dash-char-open">Inventar →</span></button>`;
    }).join('');
  }

  // ------------------------------------------------------------
  // „Jetzt erledigen“ – dynamische Prioritäten
  // ------------------------------------------------------------
  function checklistState() {
    const items = (getConfig().checklist && getConfig().checklist.items) || [];
    return { items, total: items.length, done: items.filter((item) => item.done).length };
  }

  function todaysReminders() {
    const list = (getConfig().reminders && getConfig().reminders.list) || [];
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return list
      .filter((reminder) => {
        if (reminder.repeat === 'daily') return true;
        if (reminder.repeat === 'weekly') return Number(reminder.weekday) === now.getDay();
        return reminder.repeat === 'once' && reminder.lastFired !== todayKey;
      })
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  function buildPriorities() {
    const tasks = [];
    const checklist = checklistState();
    const reminders = todaysReminders();
    if (!hasApiKey()) {
      tasks.push({
        severity: 'high', icon: '🔑',
        title: 'Bungie-API-Key fehlt',
        detail: 'Ohne Key bleiben Hüter, Inventar, Aktionen und Xûr leer.',
        action: 'settings-bungie', label: 'Einrichten'
      });
    }
    if (dashLoading && !dashData) {
      tasks.push({
        severity: 'info', icon: '⏳',
        title: 'Inventar wird geladen …',
        detail: 'Charaktere, Godrolls und Prioritäten erscheinen gleich.',
        action: '', label: ''
      });
    } else if (!dashData) {
      tasks.push({
        severity: hasApiKey() ? 'medium' : 'info', icon: '🎒',
        title: 'Noch keine Inventardaten',
        detail: hasApiKey()
          ? 'Einmal Inventar öffnen – danach berechnet das Dashboard deine Prioritäten automatisch.'
          : 'Sobald ein API-Key gesetzt ist, kann das Dashboard dein Inventar auswerten.',
        action: hasApiKey() ? 'inventory' : 'settings-bungie',
        label: hasApiKey() ? 'Inventar öffnen' : 'Key setzen'
      });
    } else {
      const pm = postmasterCount(dashData);
      if (pm > 0) {
        tasks.push({
          severity: pm >= 18 ? 'high' : 'medium', icon: '📬',
          title: pm >= 18 ? `Poststelle fast voll (${pm}/21)` : `Poststelle leeren (${pm})`,
          detail: pm >= 18 ? 'Bei vollem Postfach gehen Belohnungen verloren.' : 'Belohnungen abholen, bevor sie verfallen.',
          action: 'postmaster', label: 'Öffnen'
        });
      }
      const god = Number(dashData.godrolls) || 0;
      if (god > 0) {
        tasks.push({
          severity: 'low', icon: '✓',
          title: `${god} Godroll${god === 1 ? '' : 's'} im Inventar`,
          detail: 'Exakte Treffer der Wunschlisten – ansehen und sichern.',
          action: 'godrolls', label: 'Ansehen'
        });
      }
      const dups = duplicateCount(dashData);
      if (dups > 0) {
        tasks.push({
          severity: dups >= 10 ? 'medium' : 'low', icon: '♻',
          title: `${dups} Duplikat${dups === 1 ? '' : 'e'} in den Beutetaschen`,
          detail: 'Gleiche Item-Hashes aussortieren oder in den Tresor legen.',
          action: 'duplicates', label: 'Aussortieren'
        });
      }
      const active = (dashData.characters || [])[0];
      if (active) {
        const potential = potentialPower(active, dashData);
        const current = Number(active.light) || 0;
        const delta = potential > current ? potential - current : 0;
        if (delta > 0) {
          tasks.push({
            severity: delta >= 5 ? 'medium' : 'low', icon: '⚡',
            title: `+${delta} Power mit besserer Ausrüstung`,
            detail: `${CLASS_NAMES[active.classType] || 'Hüter'} könnte ${potential} erreichen (aktuell ${current}).`,
            action: 'inventory', label: 'Anlegen'
          });
        }
      }
      const vault = (dashData.vault || []).length;
      if (vault >= VAULT_WARN) {
        tasks.push({
          severity: vault >= VAULT_HIGH ? 'high' : 'medium', icon: '🗄',
          title: `Tresor fast voll (${vault}/${VAULT_CAPACITY})`,
          detail: 'Aussortieren schafft Platz für neue Beute.',
          action: 'duplicates', label: 'Aufräumen'
        });
      }
      if (xurData && xurData.ok && xurData.active && xurActive(new Date())) {
        const missing = (xurData.items || []).filter((item) => item.owned !== true).length;
        tasks.push({
          severity: 'low', icon: '🛒',
          title: `Xûr ist da${missing ? ` · ${missing} Angebote fehlen dir` : ''}`,
          detail: 'Inventar und Preise im Werkzeuge-Tab prüfen.',
          action: 'xur', label: 'Ansehen'
        });
      }
    }
    if (checklist.total && checklist.done < checklist.total) {
      tasks.push({
        severity: 'low', icon: '☑',
        title: `${checklist.total - checklist.done} offene Checklisten-Punkte`,
        detail: 'Wochenziele abhaken – der Fortschritt steht im Wochen-Bereich.',
        action: 'checklist', label: 'Abhaken'
      });
    }
    if (reminders.length) {
      tasks.push({
        severity: 'info', icon: '⏰',
        title: `${reminders.length} Erinnerung${reminders.length === 1 ? '' : 'en'} heute`,
        detail: reminders.slice(0, 2).map((reminder) => `${reminder.time} ${reminder.text}`).join(' · '),
        action: '', label: ''
      });
    }
    const rank = { high: 0, medium: 1, low: 2, info: 3 };
    return tasks.sort((a, b) => (rank[a.severity] || 9) - (rank[b.severity] || 9)).slice(0, 6);
  }

  function renderPriorities() {
    const body = qs('#dashPriorityBody');
    const meta = qs('#dashPriorityMeta');
    if (!body) return;
    const tasks = buildPriorities();
    if (meta) meta.textContent = tasks.length ? `${tasks.length} Hinweis${tasks.length === 1 ? '' : 'e'}` : '';
    if (!tasks.length) {
      body.innerHTML = '<div class="dash-empty-state"><span>✓</span><div><strong>Alles im grünen Bereich</strong><small>Keine offenen Prioritäten – viel Erfolg im Spiel.</small></div></div>';
      return;
    }
    body.innerHTML = tasks.map((task) =>
      `<div class="dash-priority ${task.severity}">` +
        `<span class="dash-priority-icon">${task.icon}</span>` +
        `<div class="dash-priority-text"><strong>${esc(task.title)}</strong><small>${esc(task.detail || '')}</small></div>` +
        (task.action ? `<button type="button" class="btn ghost small" data-dash-action="${esc(task.action)}">${esc(task.label || 'Öffnen')}</button>` : '') +
      `</div>`
    ).join('');
  }

  // ------------------------------------------------------------
  // Woche / Checkliste / Aktionen
  // ------------------------------------------------------------
  // „Seit gestern": Snapshot-Diff aus dem Inventar.
  // Kompakte Matrix: Power, Stats, Postfach je Charakter.
  function renderCharacterMatrix() {
    const body = qs('#dashMatrixBody');
    const meta = qs('#dashMatrixMeta');
    if (!body) return;
    const characters = (dashData && dashData.characters) || [];
    if (!characters.length) {
      body.innerHTML = '<span class="dash-muted">Keine Charakterdaten – API-Key oder öffentliches Profil nötig.</span>';
      if (meta) meta.textContent = '';
      return;
    }
    const classNames = ['Titan', 'Jäger', 'Warlock'];
    const statDefs = [
      ['392767087', 'Gesundheit'], ['4244567218', 'Nahkampf'], ['1735777505', 'Granate'],
      ['144602215', 'Super'], ['1943323491', 'Klasse'], ['2996146975', 'Waffen']
    ];
    const postmaster = (dashData && dashData.postmaster) || {};
    if (meta) meta.textContent = characters.length + ' Charaktere';
    body.innerHTML = '<div class="dash-matrix">' +
      characters.map((character) => {
        const stats = character.stats || {};
        const pm = Array.isArray(postmaster[character.id]) ? postmaster[character.id].length : 0;
        const title = classNames[Number(character.classType)] || 'Hüter';
        return '<div class="dash-matrix-col">' +
          '<strong>' + esc(title) + '</strong>' +
          '<div class="dash-matrix-power"><b>' + (Number(character.light) || 0) + '</b><small>Power</small></div>' +
          statDefs.map(([hash, label]) =>
            '<div class="dash-matrix-row"><span>' + esc(label) + '</span><b>' + (Number(stats[hash]) || 0) + '</b></div>'
          ).join('') +
          '<div class="dash-matrix-row"><span>Postfach</span><b>' + pm + '</b></div>' +
        '</div>';
      }).join('') + '</div>';
  }

  function renderSinceYesterday() {
    const body = qs('#dashSinceBody');
    const meta = qs('#dashSinceMeta');
    if (!body) return;
    let diff = null;
    try { diff = JSON.parse(window.localStorage.getItem('d2inv.snapshotDiff') || 'null'); } catch (error) { diff = null; }
    if (!diff) {
      if (meta) meta.textContent = '';
      body.innerHTML = '<span class="dash-muted">Noch kein Vergleich – Inventar einmal aktualisieren.</span>';
      return;
    }
    const added = Number(diff.added) || 0;
    const removed = Number(diff.removed) || 0;
    const godNew = Number(diff.godrollAdded) || 0;
    const godGone = Number(diff.godrollRemoved) || 0;
    if (meta) meta.textContent = diff.at ? new Date(diff.at).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' }) : '';
    body.innerHTML =
      '<div class="dash-row"><strong>Neu</strong><span>' + added + ' Items' + (godNew ? ' · ' + godNew + ' Godrolls' : '') + '</span></div>' +
      '<div class="dash-row"><strong>Entfernt</strong><span>' + removed + ' Items' + (godGone ? ' · ' + godGone + ' Godrolls' : '') + '</span></div>' +
      (Array.isArray(diff.characters) && diff.characters.length
        ? '<details class="dash-since-chars"><summary>Pro Charakter</summary>' + diff.characters.map((entry) =>
          `<div class="dash-row"><strong>${esc(CLASS_NAMES[Number(entry.classType)] || 'Hüter')}</strong><span>+${Number(entry.added) || 0} · −${Number(entry.removed) || 0}</span></div>`
        ).join('') + '</details>'
        : '') +
      '<div class="dash-status-actions"><button type="button" class="btn ghost small" data-dash-action="tools">Sammlung öffnen</button></div>';
  }

  let seasonGoalsState = null;
  let seasonGoalsLoading = false;
  let postGameState = null;
  let postGameLoading = false;

  async function renderPostGame(force) {
    const body = qs('#dashPostGameBody');
    const meta = qs('#dashPostGameMeta');
    if (!body || postGameLoading) return;
    if (!force && postGameState && Date.now() - postGameState.at < 2 * 60 * 1000) return;
    if (!ctx.api || typeof ctx.api.bungieActivitySummary !== 'function') {
      body.innerHTML = '<span class="dash-muted">Aktivitäts-Zusammenfassung ist in dieser Version nicht verfügbar.</span>';
      return;
    }
    postGameLoading = true;
    if (!postGameState) body.innerHTML = '<span class="dash-muted">Lade letzte Aktivitäten …</span>';
    try {
      const result = await ctx.api.bungieActivitySummary(force === true);
      if (!result || !result.ok) {
        body.innerHTML = '<span class="dash-muted">' + esc((result && result.error) || 'Keine Aktivitäten verfügbar.') + '</span>';
        return;
      }
      const entries = Array.isArray(result.entries) ? result.entries : [];
      postGameState = { at: Date.now(), entries };
      if (meta) meta.textContent = entries.length ? `${entries.length} Aktivitäten` : '';
      body.innerHTML = entries.length
        ? entries.map((entry) => {
          const date = entry.date ? new Date(entry.date).toLocaleString(LOCALE(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          const duration = Number(entry.durationSeconds) ? `${Math.round(Number(entry.durationSeconds) / 60)} Min` : '';
          const kda = (Number(entry.kills) || Number(entry.deaths) || Number(entry.assists))
            ? ` · K/D/A ${Number(entry.kills) || 0}/${Number(entry.deaths) || 0}/${Number(entry.assists) || 0}`
            : '';
          return '<div class="dash-row"><strong>' + esc(entry.name || 'Aktivität') + '</strong><span>' +
            esc([entry.mode, date, duration].filter(Boolean).join(' · ')) + kda + (entry.completed ? ' · ✓' : '') + '</span></div>';
        }).join('')
        : '<span class="dash-muted">Keine Aktivitäten im Verlauf gefunden.</span>';
    } catch (error) {
      body.innerHTML = '<span class="dash-muted">' + esc(error.message || String(error)) + '</span>';
    } finally {
      postGameLoading = false;
    }
  }
  async function renderSeasonGoals(force) {
    const body = qs('#dashSeasonBody');
    const meta = qs('#dashSeasonMeta');
    if (!body) return;
    if (!hasApiKey()) {
      body.innerHTML = '<span class="dash-muted">API-Key setzen, um Saison-Ziele zu sehen.</span>';
      return;
    }
    if (seasonGoalsLoading) return;
    if (!force && seasonGoalsState && Date.now() - seasonGoalsState.at < 10 * 60 * 1000) return;
    seasonGoalsLoading = true;
    if (!seasonGoalsState) body.innerHTML = '<span class="dash-muted">Lade Saison-Ziele …</span>';
    try {
      const result = await ctx.api.bungieSeasonChallenges();
      if (!result || !result.ok) {
        body.innerHTML = '<span class="dash-muted">' + esc((result && result.error) || 'Keine Saison-Daten verfügbar.') + '</span>';
        return;
      }
      const lists = result.items || result.challenges || [];
      const all = Array.isArray(lists) ? lists : [];
      const done = all.filter((entry) => entry && (entry.complete === true || entry.done === true)).length;
      const open = all
        .filter((entry) => entry && !(entry.complete === true || entry.done === true))
        .sort((a, b) => {
          const delta = (Number(b.progress != null ? b.progress : b.completion) || 0) - (Number(a.progress != null ? a.progress : a.completion) || 0);
          if (delta !== 0) return delta;
          return String(a.name || '').localeCompare(String(b.name || ''), 'de');
        })
        .slice(0, 5);
      seasonGoalsState = { at: Date.now(), total: all.length, done };
      if (meta) meta.textContent = all.length ? done + '/' + all.length : '';
      body.innerHTML = all.length
        ? open.map((entry) => {
          const progress = Number(entry.progress != null ? entry.progress : entry.completion) || 0;
          const percent = progress > 0 ? ` · ${Math.round(progress <= 1 ? progress * 100 : progress)} %` : '';
          return '<div class="dash-row"><strong>' + esc(entry.name || 'Ziel') + '</strong><span>' +
            esc(String(entry.description || entry.hint || '').slice(0, 80)) + percent + '</span></div>';
        }).join('') ||
          '<span class="dash-muted">Alle Saison-Ziele erledigt.</span>'
        : '<span class="dash-muted">Keine Saison-Ziele gemeldet (API liefert keine Rang-Daten).</span>';
    } catch (error) {
      body.innerHTML = '<span class="dash-muted">' + esc(error.message || String(error)) + '</span>';
    } finally {
      seasonGoalsLoading = false;
    }
  }

  function renderDashboardChecklist() {
    const body = qs('#dashChecklistBody');
    const progress = qs('#dashWeekProgress');
    if (!body) return;
    const { items, total, done } = checklistState();
    if (progress) {
      const percent = total ? Math.round((done / total) * 100) : 0;
      progress.innerHTML = total
        ? `<div class="dash-progress"><span style="width:${percent}%"></span></div>` +
          `<small>${done}/${total} erledigt · ${percent} %</small>`
        : '<small class="dash-muted">Noch keine Wochenziele angelegt.</small>';
    }
    body.innerHTML = items.length
      ? items.slice(0, 8).map((item) =>
          `<label class="dash-check ${item.done ? 'done' : ''}">` +
          `<input type="checkbox" data-dash-check="${esc(item.id)}" ${item.done ? 'checked' : ''}>` +
          `<span>${esc(item.text)}</span></label>`
        ).join('')
      : '<span class="dash-muted">Toolbar → Pfeil-Icon öffnet die Checkliste.</span>';
  }

  async function renderDashboardMilestones(force) {
    const body = qs('#dashMilestoneBody');
    if (!body) return;
    if (!force && milestonesLoadedAt && Date.now() - milestonesLoadedAt < 5 * 60 * 1000) return;
    if (milestonesLoading) return;
    if (!hasApiKey()) {
      body.innerHTML = '<span class="dash-muted">API-Key setzen, um aktive Aktionen zu sehen.</span>';
      return;
    }
    milestonesLoading = true;
    if (!force) body.innerHTML = '<span class="dash-muted">Lade Aktionen …</span>';
    try {
      const result = await ctx.api.bungieMilestones();
      if (!result || !result.ok) {
        body.innerHTML = `<span class="dash-muted">${esc((result && result.error) || 'Keine Aktions-Daten.')}</span>`;
        return;
      }
      milestonesLoadedAt = Date.now();
      const items = (result.items || []).slice(0, 6);
      body.innerHTML = items.length
        ? items.map((item) =>
            `<div class="dash-row dash-milestone"><strong>${esc(item.name)}</strong>` +
            `<span class="milestone-desc" title="${esc(item.desc)}">${esc(item.desc || '')}</span>` +
            (item.quests > 1 ? `<small>${item.quests} Q</small>` : '') + `</div>`
          ).join('')
        : '<span class="dash-muted">Derzeit keine aktiven Aktionen.</span>';
    } catch (error) {
      body.innerHTML = `<span class="dash-muted">${esc(error.message || String(error))}</span>`;
    } finally {
      milestonesLoading = false;
    }
  }

  if (dashMilestoneRefreshBtn) {
    dashMilestoneRefreshBtn.addEventListener('click', () => renderDashboardMilestones(true));
  }
  const dashMilestoneBody = qs('#dashMilestoneBody');
  if (dashMilestoneBody) {
    dashMilestoneBody.addEventListener('click', (event) => {
      const desc = event.target.closest('.milestone-desc');
      if (!desc) return;
      desc.classList.toggle('expanded');
    });
  }

  // ------------------------------------------------------------
  // Sammlung, Vorrat, Erinnerungen
  // ------------------------------------------------------------
  function renderCollection() {
    const body = qs('#dashCollectionBody');
    if (!body) return;
    if (!dashData) {
      body.innerHTML = `<span class="dash-muted">${hasApiKey() ? 'Inventar wird geladen …' : 'API-Key setzen, um Tresor und Vorrat zu sehen.'}</span>`;
    } else {
      const vaultItems = dashData.vault || [];
      const backpackItems = Object.values(dashData.backpack || {}).flat();
      const equippedItems = Object.values(dashData.equipped || {}).flat();
      const allItems = [...vaultItems, ...backpackItems, ...equippedItems];
      const vault = vaultItems.length;
      const backpack = backpackCount(dashData);
      const pm = postmasterCount(dashData);
      const pmChars = Object.keys(dashData.postmaster || {}).length;
      const god = Number(dashData.godrolls) || 0;
      const dups = duplicateCount(dashData);
      const weapons = allItems.filter((item) => WEAPON_BUCKETS.has(Number(item.bucket))).length;
      const armor = allItems.filter((item) => ARMOR_BUCKETS.has(Number(item.bucket))).length;
      const exotics = new Set(allItems.filter((item) => Number(item.rarity) === 6).map((item) => item.hash)).size;
      const wishlist = Number((dashData.wishlist && dashData.wishlist.count) || 0);
      const vaultPercent = Math.min(100, Math.round((vault / VAULT_CAPACITY) * 100));
      const free = Math.max(0, VAULT_CAPACITY - vault);
      const capacityClass = vaultPercent >= 96 ? ' danger' : vaultPercent >= 85 ? ' warn' : '';
      const updated = Number(dashData.fetchedAt) || 0;
      const materials = (dashData.materials || []).slice(0, 6);
      const materialRows = materials.length
        ? `<div class="dash-materials">` + materials.map((material) =>
            `<span class="dash-material" title="${esc(material.name)}">` +
            (material.icon ? `<img src="https://www.bungie.net${esc(material.icon)}" alt="">` : '') +
            `<span class="dash-material-copy"><b>${fmtNumber(material.quantity)}</b><small>${esc(material.name || '')}</small></span></span>`
          ).join('') + `</div>`
        : '';
      body.innerHTML =
        `<div class="dash-stat-grid dash-stat-grid-main">` +
          `<div class="dash-stat dash-stat-accent"><b>${fmtNumber(vault)}</b><span>Tresor / ${VAULT_CAPACITY}</span></div>` +
          `<div class="dash-stat"><b>${fmtNumber(weapons)}</b><span>Waffen</span></div>` +
          `<div class="dash-stat"><b>${fmtNumber(armor)}</b><span>Rüstung</span></div>` +
          `<div class="dash-stat"><b>${fmtNumber(god)}</b><span>Godrolls</span></div>` +
          `<div class="dash-stat"><b>${fmtNumber(dups)}</b><span>Duplikate</span></div>` +
          `<div class="dash-stat"><b>${fmtNumber(exotics)}</b><span>Exoten</span></div>` +
        `</div>` +
        `<div class="dash-vault-usage${capacityClass}">` +
          `<div class="dash-vault-bar"><span style="width:${vaultPercent}%"></span></div>` +
          `<small>${fmtNumber(free)} Plätze frei · ${vaultPercent} % belegt</small>` +
        `</div>` +
        `<div class="dash-collection-chips">` +
          `<span class="dash-chip">${fmtNumber(backpack)} Beutetaschen</span>` +
          `<span class="dash-chip">${fmtNumber(pm)} Poststelle · ${pmChars} Hüter</span>` +
          (wishlist ? `<span class="dash-chip">${fmtNumber(wishlist)} Wunschlisten</span>` : '') +
          (updated ? `<span class="dash-chip dash-chip-muted">Stand ${new Date(updated).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' })}</span>` : '') +
        `</div>` +
        materialRows +
        `<div class="dash-collection-actions">` +
          `<button type="button" class="btn ghost small" data-dash-action="inventory">Inventar</button>` +
          `<button type="button" class="btn ghost small" data-dash-action="godrolls">Godrolls</button>` +
          `<button type="button" class="btn ghost small" data-dash-action="postmaster">Poststelle</button>` +
          `<button type="button" class="btn ghost small" data-dash-action="refresh">Aktualisieren</button>` +
        `</div>`;
    }
    renderReminders();
  }

  function renderReminders() {
    const body = qs('#dashReminderBody');
    if (!body) return;
    const reminders = todaysReminders();
    body.innerHTML = reminders.length
      ? reminders.map((reminder) =>
          `<div class="dash-row"><strong>${esc(reminder.time)}</strong><span>${esc(reminder.text)}</span></div>`
        ).join('')
      : '<span class="dash-muted">Keine Erinnerungen für heute.</span>';
  }

  // ------------------------------------------------------------
  // Schnellzugriff (Favoriten + letzte Sitzung)
  // ------------------------------------------------------------
  function renderQuickAccess() {
    const body = qs('#dashQuickBody');
    if (!body) return;
    const favoriteIds = new Set(getConfig().favorites || []);
    const favorites = [];
    for (const category of ctx.getCategories()) {
      for (const site of category.sites) {
        if (favoriteIds.has(site.id)) favorites.push({ category, site });
      }
    }
    const sessionIds = (getConfig().session && getConfig().session.siteIds) || [];
    const session = [];
    for (const siteId of sessionIds) {
      for (const category of ctx.getCategories()) {
        const site = category.sites.find((entry) => entry.id === siteId);
        if (site) { session.push({ category, site }); break; }
      }
    }
    const chip = ({ category, site }, attr) =>
      `<button class="dash-fav" ${attr}="${esc(category.id)}" data-dash-site="${esc(site.id)}">` +
      `${icon(category.icon)}<span>${esc(site.name)}</span></button>`;
    body.innerHTML =
      `<div class="dash-subhead">Favoriten</div>` +
      (favorites.length
        ? `<div class="dash-favorites">${favorites.map((entry) => chip(entry, 'data-dash-cat')).join('')}</div>`
        : '<span class="dash-muted">Noch keine Favoriten – Stern-Symbol in der Toolbar.</span>') +
      `<div class="dash-subhead">Letzte Sitzung</div>` +
      (session.length
        ? `<div class="dash-favorites">${session.map((entry) => chip(entry, 'data-session-cat')).join('')}</div>`
        : '<span class="dash-muted">Keine gespeicherten Seiten.</span>');
    for (const button of qsa('[data-dash-cat]', body)) {
      button.addEventListener('click', () => ctx.selectCategory(button.dataset.dashCat, button.dataset.dashSite));
    }
    for (const button of qsa('[data-session-cat]', body)) {
      button.addEventListener('click', () => ctx.selectCategory(button.dataset.sessionCat, button.dataset.dashSite));
    }
  }

  // ------------------------------------------------------------
  // Bungie-News
  // ------------------------------------------------------------
  async function renderDashboardNews(force) {
    const body = qs('#dashNewsBody');
    if (!body) return;
    if (!force && newsLoadedAt && Date.now() - newsLoadedAt < 10 * 60 * 1000) return;
    if (newsLoading) return;
    if (!hasApiKey()) {
      body.innerHTML = '<span class="dash-muted">API-Key setzen, um Bungie-News zu sehen.</span>';
      return;
    }
    newsLoading = true;
    if (!force) body.innerHTML = '<span class="dash-muted">Lade News …</span>';
    try {
      const result = await ctx.api.bungieNews();
      if (!result || !result.ok) {
        body.innerHTML = `<span class="dash-muted">${esc((result && result.error) || 'Keine News-Daten.')}</span>`;
        return;
      }
      newsLoadedAt = Date.now();
      const items = (result.items || []).slice(0, 4);
      body.innerHTML = items.length
        ? items.map((item) =>
            `<button class="dash-news-row" data-news-url="${esc(item.link)}" title="${esc(item.link)}">` +
            `<strong>${esc(item.title)}</strong>` +
            `<span>${esc(item.description || '')}</span>` +
            `<small>${esc(item.date ? new Date(item.date).toLocaleString(LOCALE(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')}</small>` +
            `</button>`
          ).join('')
        : '<span class="dash-muted">Derzeit keine News.</span>';
      for (const button of qsa('[data-news-url]', body)) {
        button.addEventListener('click', () => {
          const url = button.dataset.newsUrl;
          hideDashboard();
          if (!ctx.web.navigate(url)) ctx.api.openExternal(url);
          toast('News im Tab geöffnet.', 'info', 1600);
        });
      }
    } catch (error) {
      body.innerHTML = `<span class="dash-muted">${esc(error.message || String(error))}</span>`;
    } finally {
      newsLoading = false;
    }
  }

  if (dashNewsRefreshBtn) {
    dashNewsRefreshBtn.addEventListener('click', () => renderDashboardNews(true));
  }

  // ------------------------------------------------------------
  // Aktionen
  // ------------------------------------------------------------
  function openInventory(detail) {
    if (ctx.openInventory) ctx.openInventory();
    window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: detail || {} }));
  }

  function runDashboardAction(action) {
    switch (action) {
      case 'inventory':
        openInventory({ tab: 'inventory' });
        return;
      case 'godrolls':
        openInventory({ tab: 'inventory', godrollOnly: true });
        return;
      case 'duplicates':
        openInventory({ tab: 'inventory', search: 'is:dupe' });
        return;
      case 'postmaster':
        openInventory({ tab: 'inventory', postmaster: true });
        return;
      case 'tools':
        openInventory({ tab: 'tools' });
        return;
      case 'xur':
        openInventory({ tab: 'tools', view: 'vendor' });
        return;
      case 'checklist':
        if (ctx.checklistToggle) ctx.checklistToggle();
        return;
      case 'settings-bungie':
        if (ctx.openBungieSettings) ctx.openBungieSettings();
        return;
      case 'onboarding':
        if (ctx.openOnboarding) ctx.openOnboarding();
        return;
      case 'refresh':
        milestonesLoadedAt = 0;
        newsLoadedAt = 0;
        dashAutoTried = false;
        statusLoadedAt = 0;
        loadInventory(true);
        loadStatus(true, false);
        xurTried = false;
        xurData = null;
        maybeLoadXur();
        renderDashboardNews(true);
        return;
      case 'restore-session': {
        const ids = (getConfig().session && getConfig().session.siteIds) || [];
        const found = [];
        for (const siteId of ids) {
          for (const category of ctx.getCategories()) {
            const site = category.sites.find((entry) => entry.id === siteId);
            if (site) { found.push({ category, site }); break; }
          }
        }
        if (!found.length) {
          toast('Keine Seiten der letzten Sitzung gefunden.', 'info', 2000);
          return;
        }
        for (const { site } of found) ctx.web.preload(site);
        ctx.selectCategory(found[0].category.id, found[0].site.id);
        toast(`${found.length} Seite${found.length === 1 ? '' : 'n'} geladen.`, 'success', 2400);
        return;
      }
      default:
        return;
    }
  }

  if (dashboardPanel) {
    dashboardPanel.addEventListener('change', (event) => {
      const preset = event.target.closest('[data-dash-preset]');
      if (preset) {
        const presets = {
          all: [],
          beginner: ['dashNews', 'dashBungieStatus', 'dashDataStatus'],
          pro: ['dashTour', 'dashNews'],
          pvp: ['dashCharacters', 'dashCollection', 'dashNews', 'dashBungieStatus'],
          raid: ['dashTour', 'dashNews']
        };
        const value = String(preset.value || 'all');
        setConfig({ dashboardPreset: value, dashboardHidden: presets[value] || [] });
        renderDashboard();
        return;
      }
      const select = event.target.closest('[data-dash-profile]');
      if (!select) return;
      const value = String(select.value || '');
      select.value = '';
      if (!value) return;
      const patterns = {
        pvp: /pvp|schmelztiegel|crucible|prüfung|trials|eisenbanner|iron banner/i,
        pve: /pve|nightfall|großmeister|grandmaster|vanguard|strike/i,
        raid: /raid|dungeon|verlies/i,
        gambit: /gambit/i
      };
      const pattern = patterns[value];
      for (const category of ctx.getCategories()) {
        if (!pattern.test(`${category.name || ''} ${category.id || ''}`)) continue;
        const site = (category.sites || [])[0];
        if (site) ctx.selectCategory(category.id, site.id);
        return;
      }
      toast('Keine passende Kategorie für dieses Profil gefunden.', 'info', 2200);
    });
    dashboardPanel.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('.dash-card, .dash-fold');
      if (!card || !card.id || card.id === 'dashTour') return;
      event.preventDefault();
      if (event.shiftKey) {
        const order = (getConfig().dashboardOrder || []).filter((id) => id !== card.id);
        order.unshift(card.id);
        setConfig({ dashboardOrder: order });
        renderDashboard();
        toast('Karte nach oben verschoben.', 'success', 1800);
        return;
      }
      const hidden = new Set((getConfig().dashboardHidden || []));
      hidden.add(card.id);
      setConfig({ dashboardHidden: [...hidden], dashboardPreset: 'custom' });
      renderDashboard();
      toast('Karte ausgeblendet – zurücksetzen über Datenstatus → Dashboard.', 'info', 3200);
    });
    dashboardPanel.addEventListener('click', (event) => {
      if (event.target.closest('[data-dash-postgame-refresh]')) {
        renderPostGame(true);
        return;
      }
      if (event.target.closest('[data-dash-more]')) {
        const expanded = document.body.classList.toggle('simple-expanded');
        event.target.closest('[data-dash-more]').textContent = expanded ? 'Weniger anzeigen' : 'Mehr anzeigen';
        return;
      }
      const statusBtn = event.target.closest('[data-dash-status]');
      if (statusBtn) {
        const kind = String(statusBtn.dataset.dashStatus || '');
        if (kind === 'refresh') runDashboardAction('refresh');
        else if (kind === 'ics') {
          ctx.api.exportCalendarIcs().then((result) => {
            toast(result && result.ok ? `Kalender gespeichert: ${result.path}` : (result && result.error) || 'Kalender-Export fehlgeschlagen.', result && result.ok ? 'success' : 'error', 4600);
          }).catch((error) => toast(error.message || String(error), 'error', 3200));
        }
        else loadStatus(true, kind === 'check');
        return;
      }
      const cleanupBtn = event.target.closest('[data-dash-cleanup]');
      if (cleanupBtn) {
        cleanupStorage(String(cleanupBtn.dataset.dashCleanup || ''));
        return;
      }
      if (event.target.closest('[data-dash-refresh-inv]')) {
        loadInventory(true);
        toast('Inventar wird neu geladen.', 'info', 2000);
        return;
      }
      if (event.target.closest('[data-dash-refresh-pm]')) {
        ctx.api.postmasterRefresh().then((result) => {
          toast(result && result.ok ? 'Poststelle aktualisiert.' : (result && result.error) || 'Poststelle nicht erreichbar.', result && result.ok ? 'success' : 'error', 2600);
          loadStatus(true, false);
        }).catch((error) => toast(error.message || String(error), 'error', 2400));
        return;
      }
      if (event.target.closest('[data-dash-digest]')) {
        ctx.api.integrationsWeeklyDigest().then((result) => {
          toast(result && result.ok ? 'Weekly-Digest gesendet.' : (result && result.error) || 'Digest fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2400);
        }).catch((error) => toast(error.message || String(error), 'error', 2400));
        return;
      }
      if (event.target.closest('[data-dash-backup]')) {
        ctx.api.backupsList().then(async (list) => {
          const first = list && list.items && list.items[0];
          if (!first) { toast('Kein Backup gefunden.', 'info', 2200); return; }
          const diff = await ctx.api.backupsDiff(first.name);
          if (!diff || !diff.ok) { toast((diff && diff.error) || 'Diff fehlgeschlagen.', 'error', 2600); return; }
          const text = diff.diff.map((entry) => `${entry.key}: ${entry.old} → ${entry.current}`).join(' · ');
          toast(`${first.name}: ${text}`, 'info', 5200);
          const section = String(window.prompt(`Bereich aus Backup wiederherstellen? (loadouts, favs, itemTags, customWishlist, savedViews, folders)\n${text}`, '') || '').trim();
          if (section) {
            const result = await ctx.api.backupsRestoreSection(first.name, section);
            toast(result && result.ok ? 'Bereich wiederhergestellt.' : (result && result.error) || 'Restore fehlgeschlagen.', result && result.ok ? 'success' : 'error', 3000);
          }
        }).catch((error) => toast(error.message || String(error), 'error', 2600));
        return;
      }
      if (event.target.closest('[data-dash-reset]')) {
        setConfig({ dashboardHidden: [], dashboardPreset: 'all' });
        renderDashboard();
        toast('Dashboard-Layout zurückgesetzt.', 'success', 2200);
        return;
      }
      if (event.target.closest('[data-dash-selftest]')) {
        Promise.all([
          ctx.api.appDataInfo().catch(() => null),
          ctx.api.bungieOAuthStatus().catch(() => null),
          ctx.api.postmasterGetState().catch(() => null),
          ctx.api.bungieWishlistHealth ? ctx.api.bungieWishlistHealth().catch(() => null) : Promise.resolve(null),
          ctx.api.storageInfo().catch(() => null)
        ]).then(([info, auth, pm, wish, store]) => {
          const issues = [];
          if (!info || !info.tokensReadable) issues.push('Anmeldung/Tokens');
          if (!auth || !auth.loggedIn) issues.push('Bungie-Login');
          if (!pm || !pm.state || pm.state.ok !== true) issues.push('Poststelle');
          if (!wish || wish.ok !== true || !wish.total) issues.push('Wunschlisten');
          if (!store || store.ok !== true) issues.push('Speicher');
          toast(issues.length ? `Selbsttest: ${issues.join(', ')} prüfen.` : 'Selbsttest: alles in Ordnung.', issues.length ? 'warning' : 'success', 5200, true);
        }).catch((error) => toast(error.message || String(error), 'error', 3200));
        return;
      }
      if (event.target.closest('[data-dash-verify]')) {
        ctx.api.storageVerify().then((result) => {
          if (!result || !result.ok) {
            toast((result && result.error) || 'Cache-Prüfung fehlgeschlagen.', 'error', 3000);
            return;
          }
          const repaired = (result.corrupt || []).length;
          toast(repaired
            ? `Cache geprüft: ${result.checked} Dateien, ${repaired} beschädigt und entfernt.`
            : `Cache geprüft: ${result.checked} Dateien in Ordnung.`, repaired ? 'warning' : 'success', 4200);
          if (repaired) render();
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-dash-repair]')) {
        ctx.api.bungieWishlistRefresh().catch(() => {});
        milestonesLoadedAt = 0;
        newsLoadedAt = 0;
        statusLoadedAt = 0;
        loadInventory(true);
        loadStatus(true, false);
        toast('Daten werden repariert – Inventar, Cache und Status neu geladen.', 'info', 3000);
        return;
      }
      if (event.target.closest('[data-dash-support]')) {
        ctx.api.exportDiagnostics().then((result) => {
          if (result && result.canceled) return;
          toast(result && result.ok ? 'Support-Paket exportiert.' : (result && result.error) || 'Export fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2800);
        }).catch((error) => toast(error.message || String(error), 'error', 2400));
        return;
      }
      const button = event.target.closest('[data-dash-action]');
      if (button) {
        runDashboardAction(String(button.dataset.dashAction || ''));
        return;
      }
      if (event.target.closest('[data-dash-tour-close]')) {
        setConfig({ tourDone: true });
        const tour = qs('#dashTour');
        if (tour) tour.classList.add('hidden');
        return;
      }
      const check = event.target.closest('[data-dash-check]');
      if (check) return; // wird vom Checklisten-Handler verarbeitet
    });
  }

  // Checkliste: Häkchen wirken direkt auf die Config.
  if (dashChecklistBody) {
    dashChecklistBody.addEventListener('change', (event) => {
      const toggle = event.target.closest('[data-dash-check]');
      if (!toggle) return;
      const items = ((getConfig().checklist && getConfig().checklist.items) || []).map((item) =>
        item.id === toggle.dataset.dashCheck ? { ...item, done: toggle.checked } : item
      );
      setConfig({ checklist: { items } });
      renderDashboardChecklist();
    renderSinceYesterday();
    renderCharacterMatrix();
    renderSeasonGoals();
      renderPriorities();
    });
  }
  if (dashChecklistEditBtn) {
    dashChecklistEditBtn.addEventListener('click', () => {
      if (ctx.checklistToggle) ctx.checklistToggle();
    });
  }
  const dashSessionRestoreBtn = qs('#dashSessionRestore');
  if (dashSessionRestoreBtn) {
    dashSessionRestoreBtn.addEventListener('click', () => runDashboardAction('restore-session'));
  }

  // ------------------------------------------------------------
  // „Fehlt noch diese Woche“: Saisonziele, Muster, Siegel, Rotation
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // Bungie- & Datenstatus
  // ------------------------------------------------------------
  function fmtBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
    return `${value} B`;
  }

  async function loadStatus(force, withCheck) {
    if (statusLoading) return;
    if (!force && statusLoadedAt && Date.now() - statusLoadedAt < 30 * 1000) return;
    statusLoading = true;
    try {
      try {
        bungieStatus = await ctx.api.bungieOAuthStatus();
      } catch (error) {
        bungieStatus = { ok: false, error: error.message || String(error) };
      }
      try {
        queueStatus = await ctx.api.bungieQueueStatus();
      } catch (error) { /* optional */ }
      try {
        storageStatus = await ctx.api.storageInfo();
      } catch (error) { /* optional */ }
      try {
        appInfo = await ctx.api.appDataInfo();
      } catch (error) { appInfo = null; }
      try {
        const pmState = await ctx.api.postmasterGetState();
        postmasterState = (pmState && pmState.state) ? pmState.state : pmState;
        if (!postmasterState && pmState && pmState.enabled) {
          postmasterState = await ctx.api.postmasterRefresh();
        }
      } catch (error) { postmasterState = null; }
      if (withCheck && typeof ctx.api.bungieConnectionCheck === 'function') {
        try {
          bungieCheck = await ctx.api.bungieConnectionCheck();
        } catch (error) {
          bungieCheck = { ok: false, error: error.message || String(error), steps: [] };
        }
      }
      statusLoadedAt = Date.now();
    } finally {
      statusLoading = false;
      renderStatusCards();
    }
  }

  async function cleanupStorage(kind) {
    if (!ctx.api.storageCleanup) return;
    try {
      const result = await ctx.api.storageCleanup(kind);
      if (result && result.ok) {
        toast(`Speicher bereinigt: ${fmtBytes(result.freed)} frei.`, 'success', 2400);
        statusLoadedAt = 0;
        loadStatus(true);
      } else {
        toast((result && result.error) || 'Bereinigung fehlgeschlagen.', 'error', 2400);
      }
    } catch (error) {
      toast(error.message || String(error), 'error', 2400);
    }
  }

  function statusRow(label, value, warn) {
    return `<div class="dash-status-row${warn ? ' warn' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  }

  function renderBungieStatusCard() {
    const body = qs('#dashBungieStatusBody');
    if (!body) return;
    if (!bungieStatus && !statusLoading) {
      body.innerHTML = '<span class="dash-muted">Status wird geladen …</span>';
      return;
    }
    const status = bungieStatus || {};
    const rows = [
      statusRow('API-Key', status.apiKeyStored
        ? (status.apiKeyReadable ? `gespeichert (${Number(status.apiKeyLength) || 0} Zeichen)` : 'gespeichert, nicht lesbar – bitte neu eingeben')
        : 'fehlt', !status.apiKeyStored),
      statusRow('Anmeldung', status.loggedIn
        ? `angemeldet als ${status.displayName || '—'}${status.publicClient ? ' (öffentliche App)' : ''}`
        : (status.tokenReadable === false ? 'gespeicherte Tokens nicht lesbar – bitte neu anmelden' : 'nicht angemeldet'), !status.loggedIn),
      statusRow('Client-Secret', status.hasClientSecret
        ? 'gesetzt (Refresh-Token aktiv)'
        : 'nicht gesetzt (Anmeldung läuft nach ~1 h ab)', !status.hasClientSecret),
      statusRow('Datenordner', appInfo ? (appInfo.portable ? 'portable (neben EXE)' : 'installiert (%APPDATA%)') : 'unbekannt', false),
      statusRow('Sitzung', appInfo ? (appInfo.tokensReadable ? 'Tokens lesbar' : 'nicht lesbar – bitte neu anmelden') : 'unbekannt', Boolean(appInfo && !appInfo.tokensReadable))
    ].join('');
    const steps = bungieCheck && Array.isArray(bungieCheck.steps) && bungieCheck.steps.length
      ? `<div class="dash-status-check">` + bungieCheck.steps.map((step) => {
          const kind = step.state === 'ok' ? 'ok' : step.state === 'warn' ? 'warn' : 'bad';
          const mark = step.state === 'ok' ? '✓' : step.state === 'warn' ? '!' : '✗';
          return `<span class="${kind}">${mark} ${esc(step.label)}${step.hint ? ` – ${esc(step.hint)}` : ''}</span>`;
        }).join('') + `</div>`
      : '';
    body.innerHTML = rows + steps +
      `<div class="dash-status-actions"><button type="button" class="btn ghost small" data-dash-action="settings-bungie">Bungie-Einstellungen</button>` +
      `<button type="button" class="btn ghost small" data-dash-action="onboarding">Einrichtungs-Assistent</button></div>`;
  }

  function renderDataStatusCard() {
    const body = qs('#dashDataStatusBody');
    if (!body) return;
    const fetched = Number(dashData && dashData.fetchedAt) || 0;
    const ageMin = fetched ? Math.max(0, Math.round((Date.now() - fetched) / 60000)) : null;
    const stale = ageMin != null && ageMin > 15;
    const ageText = ageMin == null
      ? 'noch kein Snapshot'
      : ageMin <= 1 ? 'gerade eben' : `vor ${ageMin} Min.${stale ? ' · veraltet' : ''}`;
    const version = (dashData && dashData.manifestVersion) || 'unbekannt';
    const items = dashData ? ((dashData.vault || []).length + backpackCount(dashData)) : null;
    const issues = [];
    if (bungieStatus) {
      if (!bungieStatus.apiKeyStored) issues.push('API-Key fehlt');
      if (!bungieStatus.loggedIn) issues.push('nicht angemeldet');
    }
    if (!dashData) issues.push('kein Snapshot');
    if (stale) issues.push('Snapshot veraltet');
    if (queueStatus && Number(queueStatus.rateLimits) > 0) issues.push('API-Limit (429)');
    const lastRequestAt = Number(queueStatus && queueStatus.lastRequestAt) || 0;
    const lastRequestText = lastRequestAt ? ` · zuletzt vor ${Math.max(0, Math.round((Date.now() - lastRequestAt) / 1000))} s` : '';
    const health = !bungieStatus ? 'wird geprüft …' : issues.length ? issues.join(' · ') : 'OK';
    const rows = [
      statusRow('Status', health, Boolean(issues.length)),
      statusRow('Snapshot', ageText, stale || ageMin == null),
      statusRow('Manifest', String(version), false),
      statusRow('Items', items == null ? '—' : `${fmtNumber(items)} im Tresor/Beutetasche`, false),
      queueStatus
        ? statusRow('API', `${Number(queueStatus.requests) || 0} Anfragen · ${Number(queueStatus.rateLimits) || 0}× 429 · Queue ${Number(queueStatus.waiting) || 0}${lastRequestText}`, Number(queueStatus.rateLimits) > 0)
        : '',
      postmasterState
        ? statusRow('Poststelle', postmasterState.ok ? `${((postmasterState.characters || []).map((entry) => `${entry.className || 'Hüter'} ${Number(entry.count) || 0}`).join(' · ') || '0 Items')} · ${postmasterState.updatedAt ? new Date(postmasterState.updatedAt).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' }) : '—'}` : (postmasterState.error || 'Fehler'), !postmasterState.ok)
        : statusRow('Poststelle', 'nicht geladen', false),
      storageStatus && storageStatus.ok
        ? statusRow('Speicher', `${fmtBytes(storageStatus.total)} gesamt · Cache ${fmtBytes(storageStatus.cache)} (Manifest ${fmtBytes(storageStatus.manifest)}, Wishlists ${fmtBytes(storageStatus.wishlists)}) · Backups ${fmtBytes(storageStatus.backups)} · Logs ${fmtBytes(storageStatus.logs)}`, false)
        : ''
    ].join('');
    const actions = (storageStatus && storageStatus.ok
      ? `<div class="dash-status-actions">` +
        `<button type="button" class="btn ghost small" data-dash-cleanup="wishlist">Wishlist-Cache</button>` +
        `<button type="button" class="btn ghost small" data-dash-cleanup="manifest-old">Alte Manifeste</button>` +
        `<button type="button" class="btn ghost small" data-dash-cleanup="logs">Logs</button>` +
        `</div>`
      : '') +
      `<div class="dash-status-actions"><button type="button" class="btn ghost small" data-dash-refresh-inv>Inventar neu</button>` +
      `<button type="button" class="btn ghost small" data-dash-refresh-pm>Poststelle neu</button>` +
      `<button type="button" class="btn ghost small" data-dash-digest>Weekly-Digest senden</button>` +
      `<button type="button" class="btn ghost small" data-dash-backup>Backup-Diff</button>` +
      `<button type="button" class="btn ghost small" data-dash-reset>Dashboard zurücksetzen</button>` +
      `<button type="button" class="btn ghost small" data-dash-repair>Daten reparieren</button>` +
      `<button type="button" class="btn ghost small" data-dash-verify>Cache prüfen</button>` +
      `<button type="button" class="btn ghost small" data-dash-selftest>Selbsttest</button>` +
      `<button type="button" class="btn ghost small" data-dash-support>Support-Paket</button></div>`;
    body.innerHTML = rows + actions +
      `<div class="dash-muted">Bei „veraltet“ Daten neu laden. API-Key und Anmeldung stehen im Bungie-Status.</div>`;
  }

  function renderStatusCards() {
    renderBungieStatusCard();
    renderDataStatusCard();
  }

  // ------------------------------------------------------------
  // Gesamt-Render
  // ------------------------------------------------------------
  function renderDashboard() {
    const tour = qs('#dashTour');
    if (tour) tour.classList.toggle('hidden', getConfig().tourDone === true);
    const hidden = new Set((getConfig().dashboardHidden || []));
    if (dashboardPanel) {
      for (const element of dashboardPanel.querySelectorAll('.dash-card, .dash-fold')) {
        if (element.id === 'dashTour') continue;
        element.classList.toggle('dash-user-hidden', Boolean(element.id && hidden.has(element.id)));
      }
      const order = (getConfig().dashboardOrder || []);
      dashboardPanel.querySelectorAll(':scope > .dash-shell > .dash-card, :scope > .dash-shell > .dash-fold').forEach((element) => {
        const index = order.indexOf(element.id);
        element.style.order = index >= 0 ? String(index + 1) : '99';
      });
      const preset = qs('[data-dash-preset]');
      if (preset) preset.value = getConfig().dashboardPreset || 'all';
      const shell = dashboardPanel.querySelector(':scope > .dash-shell');
      if (shell && shell.dataset.dragBound !== '1') {
        shell.dataset.dragBound = '1';
        for (const element of shell.querySelectorAll(':scope > .dash-card, :scope > .dash-fold')) {
          if (element.id) element.draggable = true;
        }
        shell.addEventListener('dragstart', (event) => {
          const card = event.target.closest('.dash-card, .dash-fold');
          if (!card || !card.id) return;
          event.dataTransfer.setData('text/plain', card.id);
          event.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        shell.addEventListener('dragend', () => {
          shell.querySelectorAll('.dragging, .drag-over').forEach((element) => element.classList.remove('dragging', 'drag-over'));
        });
        shell.addEventListener('dragover', (event) => {
          const target = event.target.closest('.dash-card, .dash-fold');
          if (!target) return;
          event.preventDefault();
          shell.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
          target.classList.add('drag-over');
        });
        shell.addEventListener('drop', (event) => {
          const target = event.target.closest('.dash-card, .dash-fold');
          const id = event.dataTransfer.getData('text/plain');
          if (!target || !id) return;
          event.preventDefault();
          const dragged = shell.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(id) : id));
          if (!dragged || dragged === target) return;
          const rect = target.getBoundingClientRect();
          const before = (event.clientY - rect.top) < rect.height / 2;
          target.parentNode.insertBefore(dragged, before ? target : target.nextSibling);
          const order = [...shell.querySelectorAll(':scope > .dash-card, :scope > .dash-fold')].map((element) => element.id).filter(Boolean);
          setConfig({ dashboardOrder: order });
          shell.querySelectorAll('.dragging, .drag-over').forEach((element) => element.classList.remove('dragging', 'drag-over'));
        });
      }
      for (const details of dashboardPanel.querySelectorAll('details.dash-fold')) {
        if (details.dataset.foldBound === '1') continue;
        details.dataset.foldBound = '1';
        const key = 'd2tool.dashfold.' + (details.querySelector('summary')?.textContent || '').trim();
        try {
          const saved = window.localStorage.getItem(key);
          if (saved != null) details.open = saved === '1';
        } catch (error) { /* egal */ }
        details.addEventListener('toggle', () => {
          try { window.localStorage.setItem(key, details.open ? '1' : '0'); } catch (error) { /* egal */ }
        });
      }
    }
    updateDashboardClocks();
    renderHero();
    renderCharacters();
    renderChampionCard();
    renderPowerCard();
    renderTriumphCard();
    renderPriorities();
    renderDashboardChecklist();
    renderCollection();
    renderSinceYesterday();
    renderCharacterMatrix();
    renderSeasonGoals(false);
    renderPostGame(false);
    renderDashboardNews(false);
    renderStatusCards();
  }

  // ------------------------------------------------------------

  return {
    hide: hideDashboard,
    open: openDashboard,
    restore: restoreAfterDashboard,
    hidden: dashboardHidden,
    render: renderDashboard,
    updateClocks: updateDashboardClocks,
    applyHero: () => renderHero(),
    restoreSession: () => runDashboardAction('restore-session')
  };
}
