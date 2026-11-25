// ============================================================
// Inventar-Werkzeuge: Power/Infusion, Materialien, Wochenstatus,
// Session-Loot, Aktivitäts-Loadout, Crafting, Xûr, Duplikate.
// ============================================================
// Alle Berechnungen laufen lokal auf dem bereits geladenen Inventar.
// Netzwerkzugriffe gibt es nur für Xûr (Bungie-API, auf Knopfdruck).

import { formatDuration, positionFixedTip } from './ui.js';
import { BREAKER_LABELS, championTypes, frameBreakerType } from './champions.js';
import { renderBuildCard } from './build-card.js';
import { nextDailyReset, nextWeeklyReset } from './clock.js';
import { ARMOR_STAT_DEFS, ARMOR_STAT_MAX, effectiveStat, scoreArmorStats } from './armor-math.js';
import { ENCOUNTER_LIBRARY } from './encounter-data.js';
import { PICKER_META_STAND, pickerBuiltinPresets } from './picker/presets.js';

const SLOTS = [
  { key: 1498876634, label: 'Kinetik' },
  { key: 2465295065, label: 'Energie' },
  { key: 953998645, label: 'Schwer' },
  { key: 3448274439, label: 'Helm' },
  { key: 3551918588, label: 'Arme' },
  { key: 14239492, label: 'Brust' },
  { key: 20886954, label: 'Beine' },
  { key: 1585787867, label: 'Klasse' }
];
const WEAPON_SLOTS = new Set([1498876634, 2465295065, 953998645]);
const ARMOR_SLOTS = new Set([3448274439, 3551918588, 14239492, 20886954, 1585787867]);
const CLASS_NAMES = ['Titan', 'Jäger', 'Warlock'];

const MATERIAL_ORDER = [
  /glimmer/i,
  /splitter|shard/i,
  /kern|core/i,
  /prisma|prism/i,
  /ascendant.*shard|aufgestiegen.*scherbe/i,
  /legierung|alloy/i,
  /modul|module/i
];

export function createInventoryTools(ctx) {
  const { api, getCfg, setConfig, toast, escapeHtml: esc, searchFor, refreshInventory, openTab } = ctx;
  let host = null;
  let data = null;
  let sessionLoot = [];
  let lastActivityKey = '';
  const sessionStartedAt = Date.now();
  let xurState = null;
  let xurLoading = false;
  let xurGoneNames = [];
  let xurWishOnly = false;
  let vendorOffersState = new Map();
  const vendorOffersLoading = new Set();
  let allVendorsState = null;
  let allVendorsLoading = false;
  let allVendorsCharacterId = '';
  let vendorOnlyMissing = false;
  let vendorWishOnly = false;
  let vendorSearch = '';
  let vendorSearchTimer = 0;
  const vendorPinned = (() => {
    try {
      const list = JSON.parse(window.localStorage.getItem('d2tool.pinnedVendors') || '[]');
      return new Set(Array.isArray(list) ? list.map((hash) => String(hash)) : []);
    } catch (error) {
      return new Set();
    }
  })();
  const vendorRollsLoaded = new Set();
  const expandedVendors = new Set();
  const vendorItemLookup = new Map();
  let vendorItemDetail = null;
  let vendorItemRoot = null;
  let craftFilter = '';
  let craftOnlyOpen = false;
  let craftHideCrafted = false;
  let craftOnlyDeep = false;
  let craftView = 'source';
  let craftOpenHash = '';
  try {
    const savedCraftView = window.localStorage.getItem('d2tool.craftView');
    if (['source', 'type', 'status'].includes(savedCraftView)) craftView = savedCraftView;
  } catch (error) {
    // Anzeige ist optional.
  }
  let pickerClass = 0;
  let pickerGoals = {};
  let pickerMods = {};
  let pickerFragments = {};
  let pickerLocks = {};
  let pickerExotic = '';
  let pickerExoticMode = 'allow';
  let pickerSubclassSel = {};
  let pickerUseSubclass = true;
  let pickerExcludeUsed = false;
  let pickerTuning = {};
  let pickerMasterwork = false;
  let pickerSet = '';
  let pickerSetCount = 0;
  let pickerSort = 'goals';
  let pickerArchetype = '';
  let pickerWeights = {};
  let pickerResult = null;
  let pickerSearching = false;
  let pickerPoolCache = { data: null, class: -1, pool: null };
  let pickerPlugCache = { data: null, map: null };
  let pickerStatCache = { data: null, map: null };
  let pickerFragmentCache = { key: '', map: {} };
  let pickerWorker = null;
  let pickerWorkerJob = 0;
  let pickerTargets = [];
  try {
    const savedTargets = JSON.parse(window.localStorage.getItem('d2tool.pickerTargets') || 'null');
    pickerTargets = Array.isArray(savedTargets)
      ? savedTargets.filter((entry) => entry && entry.id && entry.name && entry.goals && typeof entry.goals === 'object').slice(0, 20)
      : [];
  } catch (error) {
    pickerTargets = [];
  }
  let pickerVendorCache = { state: null, map: null };
  let overlayDiagState = null;
  let overlayDiagLoading = false;
  let overlayDiagLog = [];
  let overlayDiagLogPath = '';
  try {
    const savedPicker = JSON.parse(window.localStorage.getItem('d2tool.armorPicker') || 'null');
    if (savedPicker && typeof savedPicker === 'object') {
      pickerClass = [0, 1, 2].includes(Number(savedPicker.class)) ? Number(savedPicker.class) : 0;
      pickerGoals = savedPicker.goals && typeof savedPicker.goals === 'object' ? savedPicker.goals : {};
      pickerMods = savedPicker.mods && typeof savedPicker.mods === 'object' ? savedPicker.mods : {};
      pickerFragments = savedPicker.fragments && typeof savedPicker.fragments === 'object' ? savedPicker.fragments : {};
      pickerLocks = savedPicker.locks && typeof savedPicker.locks === 'object' ? savedPicker.locks : {};
      pickerExotic = String(savedPicker.exotic || '');
      pickerExoticMode = ['allow', 'forbid', 'only'].includes(savedPicker.exoticMode) ? savedPicker.exoticMode : 'allow';
      pickerSubclassSel = savedPicker.subclass && typeof savedPicker.subclass === 'object' ? savedPicker.subclass : {};
      pickerUseSubclass = savedPicker.useSubclass !== false;
      pickerExcludeUsed = savedPicker.excludeUsed === true;
      pickerTuning = savedPicker.tuning && typeof savedPicker.tuning === 'object' ? savedPicker.tuning : {};
      pickerMasterwork = savedPicker.masterwork === true;
      pickerSet = String(savedPicker.set || '');
      pickerSetCount = [0, 2, 4].includes(Number(savedPicker.setCount)) ? Number(savedPicker.setCount) : 0;
      pickerSort = ['goals', 'total', 'missing'].includes(savedPicker.sort) ? savedPicker.sort : 'goals';
      pickerArchetype = String(savedPicker.archetype || '');
      pickerWeights = savedPicker.weights && typeof savedPicker.weights === 'object' ? savedPicker.weights : {};
    }
  } catch (error) {
    // Picker-Einstellungen sind optional.
  }
  let wishDraft = { hash: 0, perks: [], role: 'any', notes: '' };
  let wishRuleRole = 'all';
  let wishlistHealthState = null;
  let craftingCostsState = null;
  let craftingCostsLoading = false;
  let inGameLoadoutsState = null;
  let inGameLoadoutsLoading = false;
  let triumphsState = null;
  let triumphsLoading = false;
  let clanState = null;
  let clanLoading = false;
  let clanFilter = '';
  let nightfallState = null;
  let nightfallLoading = false;
  let actionLogState = null;
  let actionLogLoading = false;
  let lootSourcesState = null;
  let lootSourcesLoading = false;
  let lootSourceView = 'all';
  let lootSourceSearch = '';
  let lootSourceOnlyRed = false;
  let lootSourceSort = 'default';
  let lootSourceLimit = 24;
  let weekCheckView = 'all';
  let weekCharFilter = '';
  let weekCheckSearch = '';
  // Zeitbudget-Filter (0 = alle).
  let weekMinutesFilter = 0;
  let weeklyAutoPending = false;
  let lootOwnedFilter = 'all';
  let powerMax = new Map();
  let duplicateMode = 'weapons';
  let lastRenderMs = 0;
  let queueState = null;
  let queueTimer = null;

  function loadQueueState() {
    if (!api || typeof api.bungieQueueStatus !== 'function') return;
    api.bungieQueueStatus().then((result) => {
      queueState = result || null;
      if (host && !host.classList.contains('hidden')) render();
    }).catch(() => {});
  }

  function startQueueWatch() {
    if (queueTimer) return;
    queueTimer = setInterval(() => {
      if (host && !host.classList.contains('hidden')) loadQueueState();
    }, 12000);
    if (queueTimer.unref) queueTimer.unref();
  }
  let cardSearch = '';
  let focusedTool = '';
  let pinnedTools = null;
  let focusMode = false;
  let foldsOpen = null;
  function loadPinnedTools() {
    if (pinnedTools) return pinnedTools;
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2tool.pins') || '[]');
      pinnedTools = new Set(Array.isArray(raw) ? raw.filter((value) => typeof value === 'string') : []);
    } catch (error) {
      pinnedTools = new Set();
    }
    return pinnedTools;
  }
  function savePinnedTools() {
    try { window.localStorage.setItem('d2tool.pins', JSON.stringify([...loadPinnedTools()])); } catch (error) { /* egal */ }
  }
  let toolView = 'overview';
  let sessionFilter = 'all';
  let optimizerCharId = '';
  let optimizerTarget1 = 392767087;
  let optimizerTarget2 = 1735777505;
  let optimizerTarget1Value = 100;
  let optimizerTarget2Value = 200;
  let optimizerPreferSets = true;
  let optimizerResult = null;
  let bungieStatus = null;
  let bungieCheck = null;
  let bungieStatusLoading = false;
  let xurTipEl = null;
  const xurItemsByKey = new Map();
  let milestonesState = null;
  let milestonesLoading = false;
  let activitiesState = null;
  let activitiesLoading = false;
  let craftablesState = null;
  let craftablesLoading = false;

  const KNOWN_KEY = 'd2inv.knownInstances';

  function readKnown() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(KNOWN_KEY) || 'null');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (error) {
      return new Set();
    }
  }

  function writeKnown(set) {
    try {
      window.localStorage.setItem(KNOWN_KEY, JSON.stringify([...set].slice(-6000)));
    } catch (error) {
      // egal
    }
  }

  function allEntries() {
    if (!data) return [];
    const entries = [];
    for (const item of data.vault || []) entries.push({ item, kind: 'vault', owner: '' });
    for (const [owner, items] of Object.entries(data.backpack || {})) {
      for (const item of items || []) entries.push({ item, kind: 'backpack', owner });
    }
    for (const [owner, items] of Object.entries(data.equipped || {})) {
      for (const item of items || []) entries.push({ item, kind: 'equipped', owner });
    }
    for (const [owner, items] of Object.entries(data.postmaster || {})) {
      for (const item of items || []) entries.push({ item, kind: 'postmaster', owner });
    }
    return entries;
  }

  function locationLabel(entry) {
    if (entry.kind === 'vault') return 'Tresor';
    if (entry.kind === 'postmaster') return 'Poststelle';
    const className = (data && (data.characters || []).find((c) => c.id === entry.owner) || {}).classType;
    const name = CLASS_NAMES[className] || 'Charakter';
    return entry.kind === 'equipped' ? `${name} (angelegt)` : name;
  }

  function itemPower(item) {
    return Math.max(0, Number(item && item.power) || 0);
  }

  function isLocked(item) {
    return Boolean((Number(item && item.state) || 0) & 1);
  }

  function isFav(item) {
    const favs = (getCfg().bungie && getCfg().bungie.favs) || {};
    return Boolean(favs[item && item.instanceId] || favs[String(item && item.hash)]);
  }

  function compatible(character, item) {
    if (!item) return false;
    if (WEAPON_SLOTS.has(Number(item.bucket))) return true;
    if (!ARMOR_SLOTS.has(Number(item.bucket))) return false;
    return Number(item.classType) === 3 || Number(item.classType) === Number(character.classType);
  }

  // ---------- Session-Log / „Neu“-Badge ----------
  function noteSession(inventory) {
    if (!inventory) return;
    const known = readKnown();
    const firstRun = known.size === 0;
    const current = new Set();
    let newHits = 0;
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !item.instanceId) continue;
      current.add(String(item.instanceId));
      if (!firstRun && !known.has(String(item.instanceId))) {
        item.isNew = true;
        if (item.godRoll || item.nearGodRoll) newHits += 1;
        if (!sessionLoot.some((seen) => seen.instanceId === item.instanceId)) {
          sessionLoot.unshift({
            instanceId: String(item.instanceId),
            hash: item.hash,
            name: item.name,
            icon: item.icon,
            typeName: item.typeName,
            power: item.power,
            godRoll: item.godRoll,
            nearGodRoll: Boolean(item.nearGodRoll),
            location: locationLabel(entry),
            at: Date.now()
          });
          if (sessionLoot.length > 80) sessionLoot.length = 80;
        }
      }
    }
    writeKnown(current);
    if (newHits > 0) {
      toast(`${newHits} neue${newHits === 1 ? 'r' : ''} Godroll/Fast-Godroll im Inventar.`, 'success', 4200);
    }
  }

  function newCount() {
    return sessionLoot.length;
  }

  // Höchste Power je Bucket (für die Popup-Warnung).
  function computePowerMax() {
    powerMax = new Map();
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !item.instanceId) continue;
      const bucket = Number(item.bucket) || 0;
      if (!bucket) continue;
      const power = itemPower(item);
      if (power > (powerMax.get(bucket) || 0)) powerMax.set(bucket, power);
    }
  }

  function isHighestInBucket(item) {
    if (!item || !item.instanceId) return false;
    if (!powerMax.size) computePowerMax();
    const max = powerMax.get(Number(item.bucket)) || 0;
    return max > 0 && itemPower(item) >= max;
  }

  // ---------- Render-Bausteine ----------
  function card(title, icon, body, extra = '', className = '') {
    const fetched = Number(data && data.fetchedAt) || 0;
    const age = fetched ? Math.max(0, Math.round((Date.now() - fetched) / 60000)) : null;
    const fresh = age != null ? `<span class="inv-tool-fresh">${age <= 1 ? 'aktuell' : `vor ${age} Min.`}</span>` : '';
    const pinned = loadPinnedTools().has(title);
    const stamp = new Date().toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' });
    const tone = /Build|Stat|Loadout|Optimierer|Rüstung|Wunsch|Set|Masterwork|Champion|Resilienz|Artefakt|Gesundheit/.test(title) ? 'build'
      : /Woche|Reset|Poststelle|Triumph|Nightfall|Clan|Encounter|Truhen|Daten|Undo|Aktion/.test(title) ? 'week'
        : /Xûr|Händler|Vendor|Bungie|Status|Support/.test(title) ? 'vendor'
          : /Crafting|Sammlung|Loot|Perk|Tresor|Duplikate|Cleanup|Session|Snapshot|Exot|Vault|Auto-Tag|Wunschlisten/.test(title) ? 'collection' : 'neutral';
    return `<section class="inv-tool-card tone-${tone}${className ? ` ${className}` : ''}" data-tool-title="${esc(title)}">` +
      `<header class="inv-tool-head"><span class="inv-tool-icon">${icon}</span><strong>${esc(title)}</strong>${fresh}` +
      `<span class="inv-tool-stamp" title="Zuletzt auf dieser Seite berechnet">Stand ${stamp}</span>${extra}` +
      `<button type="button" class="inv-tool-pin${pinned ? ' on' : ''}" data-tool-pin="${esc(title)}" title="${pinned ? 'Nicht mehr anpinnen' : 'Oben anpinnen'}" aria-label="Werkzeug anpinnen">★</button>` +
      `</header>` +
      `<div class="inv-tool-body">${body}</div>` +
      `</section>`;
  }

  function fmt(value) {
    return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function renderMaterialGoals() {
    if (!data) return card('Material-Ziele', '🎯', '<span class="inv-tool-muted">Keine Materialdaten.</span>');
    const materials = (data.materials || []).slice(0, 6);
    const goals = (getCfg().bungie && getCfg().bungie.materialGoals) || {};
    const rows = materials.map((material) => {
      const target = Number(goals[String(material.hash)]) || 0;
      const quantity = Number(material.quantity) || 0;
      const percent = target ? Math.min(100, Math.round((quantity / target) * 100)) : 0;
      const name = String(material.name || '');
      const hint = /splitter|shard/i.test(name) ? 'GM/Nightfall'
        : /prisma|prism/i.test(name) ? 'Nightfall/GM'
          : /kern|core/i.test(name) ? 'Strikes/Nightfall'
            : /alloy|legierung/i.test(name) ? 'Raids'
              : /glimmer/i.test(name) ? 'Public Events/Patrouillen' : '';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(name)}<small class="inv-tool-muted"> ${fmt(quantity)} vorhanden</small></span>` +
        `<span class="inv-tool-meta">${target ? `${percent}% von ${fmt(target)}${quantity >= target ? ' · Ziel erreicht' : ` · fehlt ${fmt(target - quantity)}`}` : 'kein Ziel'}${hint ? ` · Farm: ${esc(hint)}` : ''}</span>` +
        `<input type="number" min="0" max="100000000" step="1" class="inv-goal-input" data-material-goal="${material.hash}" value="${target || ''}" placeholder="Ziel"></div>`;
    }).join('');
    return card('Material-Ziele', '🎯', rows + '<div class="inv-tool-muted">Ziel setzen, um Vorrat und Fehlbetrag zu verfolgen.</div>', '', 'wide');
  }

  function renderWishlistSources() {
    if (!wishlistHealthState && api && typeof api.bungieWishlistHealth === 'function') {
      api.bungieWishlistHealth().then((result) => { wishlistHealthState = result || null; })
        .catch(() => { wishlistHealthState = { ok: false, sources: [] }; })
        .finally(() => render());
    }
    const sources = (data && data.wishlist && data.wishlist.sources) || [];
    const healthSources = (wishlistHealthState && wishlistHealthState.sources) || [];
    let wishDiff = '';
    if (wishlistHealthState && wishlistHealthState.ok) {
      const total = Number(wishlistHealthState.total) || 0;
      let previous = 0;
      try { previous = Number(window.localStorage.getItem('d2tool.wishlistTotal')) || 0; } catch (error) { previous = 0; }
      if (previous) wishDiff = `<div class="inv-tool-sub">Änderung: ${total - previous >= 0 ? '+' : ''}${total - previous} Einträge seit letzter Prüfung</div>`;
      try { window.localStorage.setItem('d2tool.wishlistTotal', String(total)); } catch (error) { /* egal */ }
    }
    const healthRows = healthSources.length
      ? healthSources.map((source) => {
          const ageMin = source.at ? Math.max(0, Math.round((Date.now() - source.at) / 60000)) : null;
          const stale = ageMin != null && ageMin > 24 * 60;
          return `<div class="inv-tool-row"><span class="inv-tool-main" title="${esc(source.url || '')}">${esc(source.label || 'Quelle')}</span>` +
            `<span class="inv-tool-meta">${Number(source.count) || 0} Waffen${ageMin != null ? ` · ${ageMin <= 1 ? 'gerade geladen' : `vor ${ageMin} Min.`}` : ' · kein Cache'}</span>` +
            `<span class="inv-tool-chip ${source.ok && !stale ? 'on' : ''}">${source.ok ? (stale ? 'veraltet' : 'gesund') : 'fehlt'}</span></div>`;
        }).join('')
      : '';
    const rows = sources.length
      ? sources.map((source) => {
          const label = String(source.url || '').split('/').filter(Boolean).pop() || 'Quelle';
          return `<div class="inv-tool-row"><span class="inv-tool-main" title="${esc(source.url || '')}">${esc(label)}</span>` +
            `<span class="inv-tool-meta">${source.ok ? `${Number(source.count) || 0} Rollen` : esc(source.error || 'Fehler')}</span>` +
            `<span class="inv-tool-chip ${source.ok ? 'on' : ''}">${source.ok ? 'aktiv' : 'Fehler'}</span></div>`;
        }).join('')
      : '<span class="inv-tool-muted">Keine Wunschlisten-Quelle geladen.</span>';
    const count = Number((data && data.wishlist && data.wishlist.count) || 0);
    return card('Wunschlisten', '📋',
      (healthRows ? `<div class="inv-tool-sub">Quellen-Gesundheit</div>${healthRows}` : '') + wishDiff +
      rows + `<div class="inv-tool-muted">${count} Waffen mit Wishlist-Einträgen · Modus: ${esc((getCfg().bungie && getCfg().bungie.godrollMode) || 'exact')}</div>`,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-wishlist-add>＋ Quelle</button><button type="button" class="btn ghost small" data-tool-wishlist-remove>− Quelle</button><button type="button" class="btn ghost small" data-tool-wishlist-refresh>Neu laden</button></span>');
  }

  // Armor 3.0: Charakterwerte 0–200 (DIM: MAX_STAT), Rüstungsteile
  // 0–45 (DIM: scaledStats.maximumValue). Reihenfolge wie im Spiel/DIM.
  const ARMOR_STAT_MOD_HASHES = {
    392767087: 1180408010,
    4244567218: 4287799666,
    1735777505: 1435557120,
    144602215: 2724608735,
    1943323491: 4204488676,
    2996146975: 4183296050
  };
  const ARMOR_STAT_MOD_META = {
    1180408010: { name: 'Gesundheits-Mod', icon: '/common/destiny2_content/icons/c1328c7351bc775eb277454c393ac858.png' },
    4287799666: { name: 'Nahkampf-Mod', icon: '/common/destiny2_content/icons/66714f030b79a1517c657f1378216cca.png' },
    1435557120: { name: 'Granaten-Mod', icon: '/common/destiny2_content/icons/774854aa449ce8053f708b88d10d35c5.png' },
    2724608735: { name: 'Super-Mod', icon: '/common/destiny2_content/icons/acccc4fe0cd51007278f1559065e0b12.png' },
    4204488676: { name: 'Klassen-Mod', icon: '/common/destiny2_content/icons/033f50a1d44a2cef3727b8aa98d9cd83.png' },
    4183296050: { name: 'Waffen-Mod', icon: '/common/destiny2_content/icons/4f970366cc18cab100e849926a927b6f.png' }
  };
  const ARMOR_STAT_LABEL = Object.fromEntries(ARMOR_STAT_DEFS.map((def) => [def.h, def.label]));
  const ARMOR_SLOT_LABELS = { 3448274439: 'Helm', 3551918588: 'Arme', 14239492: 'Brust', 20886954: 'Beine', 1585787867: 'Klasse' };

  function armorStatLabel(hash) {
    return ARMOR_STAT_LABEL[Number(hash)] || 'Stat';
  }

  function armorStatMeter(value) {
    const n = Math.max(0, Math.min(ARMOR_STAT_MAX, Math.round(Number(value) || 0)));
    return `<span class="inv-stat-meter" role="progressbar" aria-valuemin="0" aria-valuemax="200" aria-valuenow="${n}" aria-label="${n} von 200" title="${n}/200">` +
      `<i class="base" style="width:${(n / ARMOR_STAT_MAX) * 100}%"></i></span>`;
  }

  function armorWishRules() {
    return (((getCfg().bungie && getCfg().bungie.armorWishlist) || []));
  }

  function armorWishMatches(rule, item) {
    if (!item || !ARMOR_SLOTS.has(Number(item.bucket))) return false;
    const archetype = `${(item.archetype && item.archetype.name) || ''} ${(item.archetype && item.archetype.primaryLabel) || ''} ${(item.archetype && item.archetype.secondaryLabel) || ''}`.toLowerCase();
    if (rule.archetype && !archetype.includes(String(rule.archetype).toLowerCase())) return false;
    if (rule.tertiary && !String((item.tertiaryStat && item.tertiaryStat.label) || '').toLowerCase().includes(String(rule.tertiary).toLowerCase())) return false;
    if (rule.tunedStat && !String((item.tunedStat && item.tunedStat.label) || '').toLowerCase().includes(String(rule.tunedStat).toLowerCase())) return false;
    if (rule.set && !String((item.setInfo && item.setInfo.name) || '').toLowerCase().includes(String(rule.set).toLowerCase())) return false;
    const total = Number(item.baseStatTotal != null ? item.baseStatTotal : item.statTotal) || 0;
    if (rule.minTotal && total < Number(rule.minTotal)) return false;
    return true;
  }

  function renderArmorRating() {
    const byId = new Map();
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !ARMOR_SLOTS.has(Number(item.bucket))) continue;
      const key = item.instanceId || `${item.hash}-${byId.size}`;
      if (!byId.has(key)) byId.set(key, entry);
    }
    if (!byId.size) return card('Rüstungs-Bewertung', '🛡', '<span class="inv-tool-muted">Keine Rüstung im Inventar.</span>', '', 'wide');
    const scored = [...byId.values()].map((entry) => {
      const item = entry.item;
      const total = Number(item.baseStatTotal != null ? item.baseStatTotal : item.statTotal) || (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      const spikes = (item.stats || []).filter((stat) => Number(stat.value) >= 20).length;
      const tier = Number(item.gearTier) || 0;
      const setBonus = item.setInfo ? 4 : 0;
      const tuned = item.tunedStat ? 3 : 0;
      const score = Math.round(total + tier * 3 + spikes * 4 + setBonus + tuned);
      const label = score >= 85 ? 'Behalten' : score >= 70 ? 'Prüfen' : 'Aussortieren';
      return { entry, item, total, spikes, tier, score, label };
    }).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 6);
    const bottom = scored.slice(-4).filter((entry) => !top.includes(entry)).reverse();
    const row = (entry) =>
      `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(ARMOR_SLOT_LABELS[Number(entry.item.bucket)] || 'Rüstung')}</span>` +
      `<span class="inv-tool-main">${esc(entry.item.name)}<small class="inv-tool-muted"> ${entry.total} Stats${entry.tier ? ` · T${entry.tier}` : ''}${entry.spikes ? ` · ${entry.spikes}×20+` : ''}</small></span>` +
      `<span class="inv-tool-meta">Score ${entry.score}</span>` +
      `<span class="inv-tool-chip ${entry.label === 'Behalten' ? 'on' : ''}">${entry.label}</span>` +
      (entry.item.instanceId
        ? `<button type="button" class="btn ghost small" data-tool-armor-tag="${esc(entry.item.instanceId)}:${entry.label === 'Aussortieren' ? 'junk' : 'keep'}">${entry.label === 'Aussortieren' ? 'Aussortieren' : 'Behalten'}</button>`
        : '') + `</div>`;
    return card('Rüstungs-Bewertung', '🛡',
      `<div class="inv-tool-sub">Beste Teile</div>${top.map(row).join('')}` +
      (bottom.length ? `<div class="inv-tool-sub">Aussortier-Kandidaten</div>${bottom.map(row).join('')}` : '') +
      `<div class="inv-tool-muted">Score aus Statsumme, Gear-Tier, 20+-Spikes, Set-Bonus und Tuning. Markierungen landen als Item-Tag im Inventar.</div>`,
      '', 'wide');
  }

  function renderWishlistRules() {
    const cfg = getCfg();
    const minMatch = Math.max(1, Math.min(4, Math.round(Number((cfg.bungie && cfg.bungie.wishlistMinMatch) || 4))));
    const rules = (cfg.bungie && cfg.bungie.customWishlist) || [];
    const seen = new Set();
    const weapons = [];
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !WEAPON_SLOTS.has(Number(item.bucket))) continue;
      if (seen.has(Number(item.hash))) continue;
      if (!(item.socketColumns || []).length) continue;
      seen.add(Number(item.hash));
      weapons.push(item);
      if (weapons.length >= 200) break;
    }
    if (!weapons.length) {
      return card('Wunschregeln', '📝', '<span class="inv-tool-muted">Keine Waffen mit Perk-Daten gefunden.</span>', '', 'wide');
    }
    if (!weapons.some((item) => Number(item.hash) === Number(wishDraft.hash))) {
      wishDraft.hash = Number(weapons[0].hash);
      wishDraft.perks = [];
    }
    const selected = weapons.find((item) => Number(item.hash) === Number(wishDraft.hash)) || weapons[0];
    const columns = (selected.socketColumns || [])
      .filter((column) => Array.isArray(column.options) && column.options.length > 1)
      .slice(0, 6);
    const perkPicker = columns.map((column, index) => {
      const chips = column.options.map((option) => {
        const hash = Number(option.hash) || 0;
        const active = wishDraft.perks.includes(hash);
        return `<label class="inv-tool-check inv-wish-perk${active ? ' on' : ''}"><input type="checkbox" data-wishlist-perk="${hash}" ${active ? 'checked' : ''}> ${esc(option.n || option.name || `Perk ${hash}`)}</label>`;
      }).join('');
      return `<div class="inv-wish-col"><span class="inv-tool-sub">Spalte ${index + 1}</span>${chips}</div>`;
    }).join('');
    const visibleRules = rules.filter((rule) => wishRuleRole === 'all' || String(rule.role || 'any') === wishRuleRole);
    const roleCounts = rules.reduce((acc, rule) => {
      const role = String(rule.role || 'any');
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const sourceCount = ((data && data.wishlist && data.wishlist.sources) || []).length;
    const ruleRows = visibleRules.length
      ? visibleRules.map((rule) => `<div class="inv-tool-row"><span class="inv-tool-main">${esc(rule.name || `Item ${rule.hash}`)}` +
          `<small class="inv-tool-muted"> ${String(rule.role || 'any').toUpperCase()} · ${(rule.perks || []).length} Perks</small></span>` +
          `<span class="inv-tool-meta">${esc(rule.notes || '')}</span>` +
          `<button type="button" class="btn ghost small" data-wishlist-remove="${esc(rule.id)}">Entfernen</button></div>`).join('')
      : `<span class="inv-tool-muted">${rules.length ? 'Keine Regel für diesen Rollenfilter.' : 'Noch keine eigene Wunschregel. Waffe wählen, Perks anhaken und speichern.'}</span>`;
    const weaponOptions = weapons.map((item) => `<option value="${Number(item.hash)}" ${Number(item.hash) === Number(selected.hash) ? 'selected' : ''}>${esc(item.name || `Item ${item.hash}`)}</option>`).join('');
    const draftPerkNames = [];
    for (const column of columns) {
      for (const option of column.options || []) {
        if (wishDraft.perks.includes(Number(option.hash))) draftPerkNames.push(option.n || option.name || '');
      }
    }
    const testQuery = draftPerkNames.filter(Boolean).map((name) => `perk:"${name.replace(/"/g, '')}"`).join(' ');
    return card('Wunschregeln', '📝',
      `<div class="inv-tool-sub">Flexibel: „${minMatch} von 4“ – bei 4 Perks in der Regel reichen ${minMatch} Treffer. Gilt zusätzlich zu den Wunschlisten-Quellen.</div>` +
      `<div class="inv-tool-sub">Quellen: ${sourceCount} · Eigene Regeln: ${rules.length} · PvE ${roleCounts.pve || 0} · PvP ${roleCounts.pvp || 0}</div>` +
      `<div class="inv-tool-opt-fields">` +
        `<label>Regel-Filter<select data-wishlist-rule-role><option value="all" ${wishRuleRole === 'all' ? 'selected' : ''}>Alle</option><option value="pve" ${wishRuleRole === 'pve' ? 'selected' : ''}>PvE</option><option value="pvp" ${wishRuleRole === 'pvp' ? 'selected' : ''}>PvP</option><option value="any" ${wishRuleRole === 'any' ? 'selected' : ''}>Beliebig</option></select></label>` +
      `</div>` +
        `<label>Waffe<select data-wishlist-weapon>${weaponOptions}</select></label>` +
        `<label>Rolle<select data-wishlist-role><option value="any" ${wishDraft.role === 'any' ? 'selected' : ''}>Beliebig</option><option value="pve" ${wishDraft.role === 'pve' ? 'selected' : ''}>PvE</option><option value="pvp" ${wishDraft.role === 'pvp' ? 'selected' : ''}>PvP</option></select></label>` +
        `<label>Mindest-Treffer<select data-wishlist-min-match>${[1, 2, 3, 4].map((value) => `<option value="${value}" ${value === minMatch ? 'selected' : ''}>${value} von 4</option>`).join('')}</select></label>` +
        `<label>Notiz<input type="text" data-wishlist-notes maxlength="120" placeholder="z. B. Rekonstruktion + Fokussierung" value="${esc(wishDraft.notes || '')}"></label>` +
        `<button type="button" class="btn primary small" data-wishlist-save>Regel speichern</button>` +
        `<button type="button" class="btn ghost small" data-wishlist-test="${esc(testQuery)}">Im Inventar testen</button>` +
      `</div>` +
      `<div class="inv-wish-grid">${perkPicker || '<span class="inv-tool-muted">Diese Waffe hat keine auswählbaren Perk-Spalten.</span>'}</div>` +
      `<div class="inv-tool-sub">Eigene Regeln (${rules.length})</div>${ruleRows}`, '', 'wide');
  }

  function renderSetPlanner() {
    const sets = new Map();
    for (const entry of allEntries()) {
      const item = entry.item;
      const info = item && item.setInfo;
      if (!item || !ARMOR_SLOTS.has(Number(item.bucket)) || !info || !info.name) continue;
      if (!sets.has(info.name)) sets.set(info.name, { name: info.name, slots: new Set(), perks: new Map() });
      const set = sets.get(info.name);
      set.slots.add(Number(item.bucket));
      for (const perk of info.perks || []) set.perks.set(Number(perk.count) || 0, perk.name || `${perk.count}er-Bonus`);
    }
    const rows = [...sets.values()]
      .sort((a, b) => b.slots.size - a.slots.size || a.name.localeCompare(b.name, 'de'))
      .slice(0, 8)
      .map((set) => {
        const count = set.slots.size;
        const two = count >= 2 ? '✓' : '–';
        const four = count >= 4 ? '✓' : '–';
        return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(set.name)}${set.perks.get(2) ? `<small class="inv-tool-muted"> ${esc(set.perks.get(2))}</small>` : ''}</span>` +
          `<span class="inv-tool-meta">${count}/5 Teile · 2er ${two} · 4er ${four}${count >= 4 && set.perks.get(4) ? ` (${esc(set.perks.get(4))})` : ''}</span></div>`;
      }).join('');
    return card('Set-Bonus-Planer', '🧩',
      rows || '<span class="inv-tool-muted">Keine Set-Rüstung im Inventar.</span>' +
      `<div class="inv-tool-muted">Zeigt, welche Set-Boni mit den vorhandenen Teilen bereits erreichbar sind.</div>`, '', 'wide');
  }

  let autoTagPreview = null;

  function autoTagMatches() {
    const rules = (getCfg().bungie && getCfg().bungie.autoTagRules) || [];
    const counts = new Map();
    let total = 0;
    if (!rules.length) return { counts, total };
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !item.instanceId) continue;
      const text = `${item.name || ''} ${item.typeName || ''}`.toLowerCase();
      const rule = rules.find((candidate) => text.includes(String(candidate.match || '').toLowerCase()));
      if (!rule) continue;
      counts.set(rule.id, (counts.get(rule.id) || 0) + 1);
      total += 1;
    }
    return { counts, total };
  }

  function renderAutoTagRules() {

    const rules = ((getCfg().bungie && getCfg().bungie.autoTagRules) || []);
    const rows = rules.length
      ? rules.map((rule) => `<div class="inv-tool-row"><span class="inv-tool-main">${esc(rule.match)}</span>` +
          `<span class="inv-tool-chip on">${esc(rule.tag)}</span>` +
          (autoTagPreview ? `<span class="inv-tool-meta">${autoTagPreview.counts.get(rule.id) || 0} Treffer</span>` : '') +
          `<button type="button" class="btn ghost small" data-autotag-del="${esc(rule.id)}">Entfernen</button></div>`).join('')
      : '<span class="inv-tool-muted">Noch keine Regel. Beispiel: „godroll“ → Behalten, „duplikat“ → Aussortieren.</span>';
    return card('Auto-Tag-Regeln', '🏷',
      rows +
      `<div class="inv-tool-add"><input type="text" data-autotag-match maxlength="60" placeholder="Text im Namen/Typ, z. B. Godroll">` +
      `<select data-autotag-tag class="control"><option value="keep">Behalten</option><option value="junk">Aussortieren</option><option value="pve">PvE</option><option value="pvp">PvP</option></select>` +
      `<button type="button" class="btn primary small" data-autotag-add>Regel hinzufügen</button>` +
      `<button type="button" class="btn ghost small" data-autotag-preview>Vorschau</button>` +
      `<button type="button" class="btn ghost small" data-autotag-apply>Jetzt anwenden</button></div>` +
      (autoTagPreview ? `<div class="inv-tool-muted">Vorschau: ${autoTagPreview.total} Item${autoTagPreview.total === 1 ? '' : 's'} würden getaggt.</div>` : ''), '', 'wide');

  }

  function applyAutoTagRules() {
    const rules = ((getCfg().bungie && getCfg().bungie.autoTagRules) || []);
    if (!rules.length) { toast('Keine Auto-Tag-Regeln angelegt.', 'info', 2200); return; }
    const tags = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
    let changed = 0;
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !item.instanceId) continue;
      const text = `${item.name || ''} ${item.typeName || ''}`.toLowerCase();
      const rule = rules.find((candidate) => text.includes(String(candidate.match || '').toLowerCase()));
      if (!rule) continue;
      if (tags[String(item.instanceId)] !== rule.tag) {
        tags[String(item.instanceId)] = rule.tag;
        changed += 1;
      }
    }
    setConfig({ bungie: { itemTags: tags } });
    toast(`${changed} Item${changed === 1 ? '' : 's'} automatisch getaggt.`, 'success', 2800);
    render();
  }
  function renderArmorWishlist() {
    const rules = armorWishRules();
    const items = allEntries().map((entry) => entry.item).filter(Boolean);
    const rows = rules.length
      ? rules.map((rule) => {
          const matches = items.filter((item) => armorWishMatches(rule, item));
          return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(rule.name || 'Rüstungs-Wunsch')}</span>` +
            `<span class="inv-tool-meta">${esc([rule.archetype, rule.tertiary, rule.tunedStat, rule.set, rule.minTotal ? `≥${rule.minTotal}` : ''].filter(Boolean).join(' · ') || 'alle')}</span>` +
            `<span class="inv-tool-chip ${matches.length ? 'on' : ''}">${matches.length} Treffer</span>` +
            `<button type="button" class="btn ghost small" data-armorwish-del="${esc(rule.id)}">Entfernen</button></div>`;
        }).join('')
      : '<span class="inv-tool-muted">Noch keine Rüstungs-Wunschregel. Regeln prüfen Archetyp, Tertiär, Tuning, Set und Mindest-Statsumme.</span>';
    const statOptions = ARMOR_STAT_DEFS.map(({ label }) => `<option value="${esc(label)}">${esc(label)}</option>`).join('');
    return card('Rüstungs-Wunschliste', '🎯',
      rows +
      `<div class="inv-tool-opt-fields">` +
        `<label>Name<input type="text" data-armorwish-name maxlength="60" placeholder="z. B. Super-Build"></label>` +
        `<label>Archetyp<input type="text" data-armorwish-archetype maxlength="60" placeholder="z. B. Kraftpaket"></label>` +
        `<label>Tertiär<select data-armorwish-tertiary><option value="">—</option>${statOptions}</select></label>` +
        `<label>Tuning<select data-armorwish-tuned><option value="">—</option>${statOptions}</select></label>` +
        `<label>Set<input type="text" data-armorwish-set maxlength="60" placeholder="z. B. Erster Aufstieg"></label>` +
        `<label>Min. Stats<input type="number" min="0" max="200" step="5" data-armorwish-min value="0"></label>` +
        `<button type="button" class="btn primary small" data-armorwish-add>Hinzufügen</button>` +
      `</div>`, '', 'wide');
  }

  const PICKER_SLOTS = [3448274439, 3551918588, 14239492, 20886954, 1585787867];

  function saveArmorPicker() {
    try {
      window.localStorage.setItem('d2tool.armorPicker', JSON.stringify({
        class: pickerClass,
        goals: pickerGoals,
        mods: pickerMods,
        fragments: pickerFragments,
        locks: pickerLocks,
        exotic: pickerExotic,
        exoticMode: pickerExoticMode,
        subclass: pickerSubclassSel,
        useSubclass: pickerUseSubclass,
        excludeUsed: pickerExcludeUsed,
        tuning: pickerTuning,
        masterwork: pickerMasterwork,
        set: pickerSet,
        setCount: pickerSetCount,
        sort: pickerSort,
        archetype: pickerArchetype,
        weights: pickerWeights
      }));
    } catch (error) {
      // Einstellungen sind optional.
    }
  }

  const PICKER_STAT = Object.fromEntries(ARMOR_STAT_DEFS.map(({ h, label }) => [label, h]));
  const PICKER_BUILTIN_PRESETS = pickerBuiltinPresets();

  function readPickerPresets() {
    try {
      const list = JSON.parse(window.localStorage.getItem('d2tool.armorPickerPresets') || 'null');
      return Array.isArray(list) ? list.filter((entry) => entry && entry.id && entry.name) : [];
    } catch (error) {
      return [];
    }
  }

  function writePickerPresets(list) {
    try {
      window.localStorage.setItem('d2tool.armorPickerPresets', JSON.stringify(list.slice(0, 20)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function writePickerTargets(list) {
    pickerTargets = Array.isArray(list) ? list.filter((entry) => entry && entry.id && entry.name).slice(0, 20) : [];
    try {
      window.localStorage.setItem('d2tool.pickerTargets', JSON.stringify(pickerTargets));
      return true;
    } catch (error) {
      return false;
    }
  }

  function savePickerTarget(name) {
    const label = String(name || '').trim().slice(0, 40);
    if (!label) return false;
    const entry = {
      id: 'target-' + Date.now().toString(36),
      name: label,
      class: pickerClass,
      goals: { ...pickerGoals },
      weights: { ...pickerWeights },
      mods: { ...pickerMods },
      fragments: { ...pickerFragments },
      masterwork: pickerMasterwork
    };
    const list = pickerTargets.filter((target) => !(Number(target.class) === pickerClass && String(target.name).toLowerCase() === label.toLowerCase()));
    list.push(entry);
    return writePickerTargets(list);
  }

  function applyPickerTarget(id) {
    const target = pickerTargets.find((entry) => String(entry.id) === String(id));
    if (!target) return false;
    if ([0, 1, 2].includes(Number(target.class)) && Number(target.class) !== pickerClass) {
      pickerClass = Number(target.class);
      pickerLocks = {};
      pickerExotic = '';
    }
    pickerGoals = { ...(target.goals || {}) };
    pickerWeights = { ...(target.weights || {}) };
    pickerMods = { ...(target.mods || {}) };
    pickerFragments = { ...(target.fragments || {}) };
    pickerMasterwork = target.masterwork === true;
    pickerResult = null;
    saveArmorPicker();
    return true;
  }

  function applyPickerSetup(setup) {
    if (!setup || typeof setup !== 'object') return;
    if ([0, 1, 2].includes(Number(setup.class))) {
      if (Number(setup.class) !== pickerClass) {
        pickerClass = Number(setup.class);
        pickerLocks = {};
        pickerExotic = '';
      }
    }
    if (setup.goals && typeof setup.goals === 'object') pickerGoals = { ...setup.goals };
    if (setup.mods && typeof setup.mods === 'object') pickerMods = { ...setup.mods };
    if (setup.fragments && typeof setup.fragments === 'object') pickerFragments = { ...setup.fragments };
    if (setup.locks && typeof setup.locks === 'object') pickerLocks = { ...setup.locks };
    pickerExotic = String(setup.exotic || '');
    pickerExoticMode = ['allow', 'forbid', 'only'].includes(setup.exoticMode) ? setup.exoticMode : pickerExoticMode;
    pickerMasterwork = setup.masterwork === true;
    if (setup.set) pickerSet = String(setup.set || '');
    pickerSetCount = [0, 2, 4].includes(Number(setup.setCount)) ? Number(setup.setCount) : 0;
    pickerSort = ['goals', 'total', 'missing'].includes(setup.sort) ? setup.sort : 'goals';
    pickerArchetype = String(setup.archetype || '');
    pickerWeights = setup.weights && typeof setup.weights === 'object' ? { ...setup.weights } : {};
    if (setup.subclass && typeof setup.subclass === 'object') pickerSubclassSel = { ...setup.subclass };
    if (setup.useSubclass != null) pickerUseSubclass = setup.useSubclass !== false;
    if (setup.excludeUsed != null) pickerExcludeUsed = setup.excludeUsed === true;
    if (setup.tuning && typeof setup.tuning === 'object') pickerTuning = { ...setup.tuning };
    pickerResult = null;
    saveArmorPicker();
  }

  function pickerSetupOfPreset(preset) {
    return {
      name: preset.name,
      class: pickerClass,
      goals: preset.goals || {},
      mods: preset.mods || {},
      fragments: preset.fragments || {},
      masterwork: preset.masterwork !== false,
      set: preset.set || '',
      setCount: preset.setCount || 0,
      exotic: preset.exotic || '',
      exoticMode: preset.exoticMode || 'allow',
      sort: preset.sort || 'goals',
      archetype: preset.archetype || '',
      weights: preset.weights || {},
      subclass: preset.subclass || undefined,
      useSubclass: preset.useSubclass,
      excludeUsed: preset.excludeUsed,
      tuning: preset.tuning || undefined
    };
  }

  function saveCurrentPickerPreset(name) {
    const label = String(name || '').trim().slice(0, 40);
    if (!label) {
      toast('Bitte einen Namen für die Vorlage eingeben.', 'info', 2200);
      return;
    }
    const list = readPickerPresets();
    const entry = {
      id: 'p-' + Date.now().toString(36),
      name: label,
      class: pickerClass,
      goals: { ...pickerGoals },
      mods: { ...pickerMods },
      fragments: { ...pickerFragments },
      masterwork: pickerMasterwork,
      set: pickerSet,
      setCount: pickerSetCount,
      exotic: pickerExotic,
      exoticMode: pickerExoticMode,
      sort: pickerSort,
      archetype: pickerArchetype,
      weights: { ...pickerWeights },
      subclass: { ...pickerSubclassSel },
      useSubclass: pickerUseSubclass,
      excludeUsed: pickerExcludeUsed,
      tuning: { ...pickerTuning }
    };
    const existing = list.findIndex((preset) => preset.name.toLowerCase() === label.toLowerCase() && Number(preset.class) === pickerClass);
    if (existing >= 0) list[existing] = { ...entry, id: list[existing].id };
    else list.push(entry);
    writePickerPresets(list);
    toast(existing >= 0 ? 'Vorlage aktualisiert.' : 'Vorlage gespeichert.', 'success', 2200);
    render();
  }

  function deleteCurrentPickerPreset(id) {
    const key = String(id || '');
    if (!key || key.startsWith('builtin:')) {
      toast('Eingebaute Vorlagen lassen sich nicht löschen.', 'info', 2200);
      return;
    }
    writePickerPresets(readPickerPresets().filter((preset) => preset.id !== key));
    toast('Vorlage gelöscht.', 'info', 1800);
    render();
  }

  // DIM-/d2armorpicker-JSON aus der Zwischenablage übernehmen.
  function applyImportedPickerData(raw) {
    let parsed = null;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      toast('Import fehlgeschlagen: kein gültiges JSON.', 'error', 3000);
      return false;
    }
    if (!parsed || typeof parsed !== 'object') {
      toast('Import fehlgeschlagen: leeres Objekt.', 'error', 2600);
      return false;
    }
    const source = parsed.loadout && typeof parsed.loadout === 'object' ? parsed.loadout : parsed;
    const goals = {};
    const addGoal = (key, value) => {
      const numeric = Number(typeof value === 'object' && value ? (value.min != null ? value.min : value.value) : value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      let hash = Number(key);
      if (!Number.isFinite(hash) || !ARMOR_STAT_DEFS.some((entry) => entry.h === hash)) {
        hash = PICKER_STAT[String(key)] || 0;
      }
      if (hash) goals[hash] = Math.max(0, Math.min(200, Math.round(numeric)));
    };
    for (const field of ['goals', 'stats', 'statGoals', 'statConstraints', 'statTargets']) {
      const block = source[field];
      if (!block || typeof block !== 'object') continue;
      for (const [key, value] of Object.entries(block)) addGoal(key, value);
    }
    const mods = {};
    const reverseMods = Object.fromEntries(Object.entries(ARMOR_STAT_MOD_HASHES).map(([hash, plugHash]) => [String(plugHash), Number(hash)]));
    const modList = (source.parameters && Array.isArray(source.parameters.mods))
      ? source.parameters.mods
      : (Array.isArray(source.mods) ? source.mods : []);
    for (const mod of modList) {
      const hash = reverseMods[String(mod && (mod.hash || mod.h))] || Number(mod && mod.statHash) || 0;
      if (!hash) continue;
      mods[hash] = Math.min(5, (Number(mods[hash]) || 0) + Math.max(1, Number(mod && mod.count) || 1));
    }
    const locks = {};
    const items = []
      .concat(Array.isArray(source.equipped) ? source.equipped : [])
      .concat(Array.isArray(source.items) ? source.items : [])
      .concat(Array.isArray(source.armor) ? source.armor : []);
    const pool = pickerFullPool();
    for (const item of items) {
      const id = String((item && (item.id || item.instanceId)) || '');
      if (!id) continue;
      let bucket = Number(item && item.bucket) || 0;
      if (!bucket) {
        for (const [slot, list] of pool) {
          if (list.some((entry) => String(entry.instanceId || entry.hash) === id)) { bucket = slot; break; }
        }
      }
      if (PICKER_SLOTS.includes(bucket)) locks[bucket] = id;
    }
    const classValue = Number(source.classType != null ? source.classType : source.class);
    const setup = {
      class: [0, 1, 2].includes(classValue) ? classValue : undefined,
      goals,
      mods,
      locks,
      masterwork: source.masterwork !== false,
      exoticMode: source.exoticMode,
      sort: 'goals'
    };
    applyPickerSetup(setup);
    render();
    if (Object.keys(goals).length) setTimeout(() => findArmorSets(), 80);
    toast(`Picker-Import: ${Object.keys(goals).length} Ziele, ${Object.keys(mods).length} Stat-Mods, ${Object.keys(locks).length} Sperren.`, 'success', 3600);
    return true;
  }

  async function importPickerFromClipboard() {
    if (!api || typeof api.readClipboard !== 'function') {
      toast('Zwischenablage ist nicht verfügbar.', 'warning', 2600);
      return;
    }
    try {
      const result = await api.readClipboard();
      if (!result || result.ok === false || !String(result.text || '').trim()) {
        toast('Zwischenablage ist leer.', 'warning', 2400);
        return;
      }
      applyImportedPickerData(result.text);
    } catch (error) {
      toast('Import aus der Zwischenablage fehlgeschlagen.', 'error', 2800);
    }
  }

  function pickerPlugInfo(hash) {
    const wanted = Number(hash) || 0;
    if (!wanted) return null;
    if (pickerPlugCache.data !== data) {
      const map = new Map();
      for (const sockets of Object.values((data && data.sockDefs) || {})) {
        for (const socket of sockets || []) {
          for (const plug of (socket.plugs || [])) {
            if (plug && Number(plug.h) && !map.has(Number(plug.h))) map.set(Number(plug.h), plug);
          }
        }
      }
      pickerPlugCache = { data, map };
    }
    return pickerPlugCache.map.get(wanted) || null;
  }

  function pickerBaseStat(item, hash) {
    if (!item) return 0;
    const base = item.baseStats && item.baseStats[String(hash)];
    if (base != null) return Math.max(0, Number(base) || 0);
    const stat = (item.stats || []).find((entry) => Number(entry.hash) === Number(hash));
    return Math.max(0, Number(stat && (stat.base != null ? stat.base : stat.value)) || 0);
  }

  function pickerFullPool() {
    if (pickerPoolCache.data === data && pickerPoolCache.class === pickerClass && pickerPoolCache.pool) {
      return pickerPoolCache.pool;
    }
    const pool = new Map(PICKER_SLOTS.map((slot) => [slot, []]));
    const seen = new Set();
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || entry.kind === 'postmaster') continue;
      const bucket = Number(item.bucket);
      if (!pool.has(bucket)) continue;
      const classType = Number(item.classType);
      if (classType !== pickerClass && classType !== 3) continue;
      const key = String(item.instanceId || `${item.hash}:${entry.kind}:${entry.owner}`);
      if (seen.has(key)) continue;
      seen.add(key);
      pool.get(bucket).push(item);
    }
    pickerPoolCache = { data, class: pickerClass, pool };
    return pool;
  }

  function pickerArmorPool() {
    const full = pickerFullPool();
    if (!pickerArchetype) return full;
    const pool = new Map();
    for (const [slot, items] of full) {
      pool.set(slot, items.filter((item) => item && item.archetype && item.archetype.name === pickerArchetype));
    }
    return pool;
  }

  // Verfügbare Archetypen der aktuellen Klasse (für den Filter).
  function pickerArchetypeList() {
    const counts = new Map();
    for (const items of pickerFullPool().values()) {
      for (const item of items) {
        const name = item && item.archetype && item.archetype.name;
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
  }

  function pickerExoticList(pool) {
    const list = [];
    const seen = new Set();
    for (const items of pool.values()) {
      for (const item of items) {
        if (Number(item.rarity) !== 6) continue;
        const key = String(item.instanceId || item.hash);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(item);
      }
    }
    return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  }

  function pickerEffective(stats, hash) {
    return effectiveStat(stats, hash, { mods: pickerMods, fragments: pickerFragmentTotal(), masterwork: pickerMasterwork, max: ARMOR_STAT_MAX });
  }

  function pickerEquippedStats() {
    const totals = {};
    const character = ((data && data.characters) || []).find((entry) => Number(entry.classType) === pickerClass);
    if (!character) return totals;
    for (const item of ((data && data.equipped && data.equipped[character.id]) || [])) {
      if (!ARMOR_SLOTS.has(Number(item.bucket))) continue;
      for (const { h } of ARMOR_STAT_DEFS) totals[h] = (Number(totals[h]) || 0) + pickerBaseStat(item, h);
    }
    return totals;
  }

  const PICKER_SUBCLASS_BUCKET = 3284755031;

  function pickerSubclassItem() {
    const character = ((data && data.characters) || []).find((entry) => Number(entry.classType) === pickerClass);
    if (!character) return null;
    return (((data && data.equipped && data.equipped[character.id]) || [])
      .find((item) => Number(item.bucket) === PICKER_SUBCLASS_BUCKET)) || null;
  }

  function pickerSubclassSockets(item) {
    const sockets = ((data && data.sockDefs && data.sockDefs[String(item && item.hash)]) || []);
    const aspects = sockets.filter((socket) => (socket.plugs || []).some((plug) => /\.aspects$/i.test(String(plug.p || ''))));
    const fragments = sockets.filter((socket) => (socket.plugs || []).some((plug) => /fragments/i.test(String(plug.p || ''))));
    return { aspects, fragments };
  }

  function pickerSubclassSelection() {
    if (!pickerSubclassSel[pickerClass] || typeof pickerSubclassSel[pickerClass] !== 'object') pickerSubclassSel[pickerClass] = {};
    return pickerSubclassSel[pickerClass];
  }

  function pickerSubclassPlug(socket) {
    const selection = pickerSubclassSelection();
    const chosen = Number(selection[String(socket.idx)]) || 0;
    if (chosen) return (socket.plugs || []).find((plug) => Number(plug.h) === chosen) || null;
    const item = pickerSubclassItem();
    const equipped = item && (item.perks || []).find((perk) => Number(perk.idx) === Number(socket.idx));
    return equipped ? (socket.plugs || []).find((plug) => Number(plug.h) === Number(equipped.hash)) || null : null;
  }

  function pickerSubclassBonuses() {
    if (!pickerUseSubclass) return {};
    const item = pickerSubclassItem();
    if (!item) return {};
    const { aspects, fragments } = pickerSubclassSockets(item);
    const out = {};
    for (const socket of [...aspects, ...fragments]) {
      const plug = pickerSubclassPlug(socket);
      if (!plug) continue;
      for (const bonus of (plug.s || [])) {
        const hash = Number(bonus.h) || 0;
        if (!hash) continue;
        out[hash] = (out[hash] || 0) + (Number(bonus.v) || 0);
      }
    }
    return out;
  }

  function pickerFragmentTotal() {
    const key = [
      pickerClass,
      pickerUseSubclass ? 1 : 0,
      JSON.stringify(pickerFragments),
      JSON.stringify(pickerSubclassSel[pickerClass] || {}),
      (data && data.manifestVersion) || ''
    ].join('|');
    if (pickerFragmentCache.key === key) return pickerFragmentCache.map;
    const totals = {};
    for (const { h } of ARMOR_STAT_DEFS) totals[h] = Number(pickerFragments[h]) || 0;
    const subclass = pickerSubclassBonuses();
    for (const [hash, value] of Object.entries(subclass)) totals[hash] = (Number(totals[hash]) || 0) + value;
    pickerFragmentCache = { key, map: totals };
    return totals;
  }

  function pickerStatBonusLabel(plug) {
    return (plug && plug.s || []).filter((bonus) => Number(bonus.v)).map((bonus) => `${armorStatLabel(bonus.h)} +${bonus.v}`).join(' · ');
  }

  function pickerGeneralSockets(item) {
    return (((data && data.sockDefs && data.sockDefs[String(item && item.hash)]) || [])
      .filter((socket) => /enhancements\.v2_general/i.test(`${socket.p || ''} ${(socket.plugs || []).map((plug) => plug.p || '').join(' ')}`)));
  }

  function pickerItemBonus(item) {
    const out = ARMOR_STAT_DEFS.map(() => 0);
    if (!item) return out;
    const bucket = Number(item.bucket) || 0;
    const tuning = Number(pickerTuning[bucket]) || 0;
    let idx = ARMOR_STAT_DEFS.findIndex(({ h }) => Number(h) === tuning);
    if (idx >= 0) out[idx] += 5;
    // Artifice-Rüstung hat einen vierten allgemeinen Mod-Socket (+3).
    if (pickerGeneralSockets(item).length >= 4) {
      if (idx < 0) {
        const values = pickerStatArray(item);
        idx = values.indexOf(Math.max(...values));
      }
      if (idx >= 0) out[idx] += 3;
    }
    return out;
  }

  function pickerEnergyPlan(set) {
    const modCount = Math.max(0, ARMOR_STAT_DEFS.reduce((sum, { h }) => sum + (Number(pickerMods[h]) || 0), 0));
    const cost = 3;
    let remaining = modCount;
    const pieces = (set.items || []).map((item) => {
      const capacity = Number(item.energy && item.energy.capacity) || 0;
      const piece = { name: item.name || 'Rüstung', capacity, mods: 0, cost: 0, known: capacity > 0 };
      if (!capacity) return piece;
      const take = Math.min(3, remaining, Math.floor(capacity / cost));
      piece.mods = take;
      piece.cost = take * cost;
      remaining -= take;
      return piece;
    });
    return { known: pieces.some((piece) => piece.known), modCount, unplaced: remaining, pieces };
  }

  function pickerShareText(set) {
    const lines = [`Armor-Picker · ${CLASS_NAMES[pickerClass] || 'Build'}`];
    for (const item of set.items) {
      lines.push(`${ARMOR_SLOT_LABELS[Number(item.bucket)] || 'Slot'}: ${item.name}${Number(item.rarity) === 6 ? ' (Exot)' : ''}`);
    }
    lines.push(`Stats: ${ARMOR_STAT_DEFS.map(({ h, label }) => `${label} ${pickerEffective(set.stats, h)}`).join(' · ')}`);
    const mods = ARMOR_STAT_DEFS
      .filter(({ h }) => Number(pickerMods[h]) > 0)
      .map(({ h, label }) => `${label} +${Number(pickerMods[h]) * 10}`);
    if (mods.length) lines.push(`Mods: ${mods.join(' · ')}`);
    return lines.join('\n');
  }

  function pickerShareLink(set) {
    const payload = {
      name: `Armor-Picker ${CLASS_NAMES[pickerClass] || 'Build'}`,
      classType: pickerClass,
      items: set.items.map((item) => ({ id: String(item.instanceId || ''), hash: Number(item.hash) || 0, name: item.name || '' })),
      parameters: {
        mods: ARMOR_STAT_DEFS
          .filter(({ h }) => Number(pickerMods[h]) > 0)
          .flatMap(({ h }) => Array.from({ length: Number(pickerMods[h]) || 0 }, () => ({ hash: ARMOR_STAT_MOD_HASHES[h], count: 1 })))
      }
    };
    return 'https://app.destinyitemmanager.com/loadouts?loadout=' + encodeURIComponent(JSON.stringify(payload));
  }

  function copyToClipboard(text, label) {
    const value = String(text || '');
    if (!value) return;
    if (api && typeof api.copyToClipboard === 'function') {
      api.copyToClipboard(value).then((result) => {
        toast(result && result.ok ? `${label} kopiert.` : 'Kopieren fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2000);
      }).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2000));
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(() => toast(`${label} kopiert.`, 'success', 2000)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2000));
    }
  }

  function pickerScore(stats) {
    return scoreArmorStats(stats, {
      goals: pickerGoals,
      mods: pickerMods,
      fragments: pickerFragmentTotal(),
      masterwork: pickerMasterwork,
      max: ARMOR_STAT_MAX,
      sort: pickerSort,
      weights: pickerWeights
    });
  }

  function pickerStatArray(item) {
    if (!item) return [0, 0, 0, 0, 0, 0];
    if (pickerStatCache.data !== data) pickerStatCache = { data, map: new WeakMap() };
    const cached = pickerStatCache.map.get(item);
    if (cached) return cached;
    const values = ARMOR_STAT_DEFS.map(({ h }) => pickerBaseStat(item, h));
    pickerStatCache.map.set(item, values);
    return values;
  }

  let pickerPrewarmedData = null;

  function prewarmPicker() {
    if (!data || pickerPrewarmedData === data) return;
    pickerPrewarmedData = data;
    const run = () => {
      try {
        for (const entry of allEntries()) {
          const item = entry.item;
          if (!item || !ARMOR_SLOTS.has(Number(item.bucket))) continue;
          if (entry.kind === 'postmaster') continue;
          pickerStatArray(item);
        }
      } catch (error) {
        // Vorberechnung ist optional.
      }
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 800);
  }

  function pickerItemScore(item) {
    const values = pickerStatArray(item);
    let score = 0;
    for (let index = 0; index < ARMOR_STAT_DEFS.length; index += 1) {
      const value = values[index];
      const hash = ARMOR_STAT_DEFS[index].h;
      const goal = Number(pickerGoals[hash]) || 0;
      const weight = Object.prototype.hasOwnProperty.call(pickerWeights, hash)
        ? Math.max(0, Number(pickerWeights[hash]) || 0)
        : (goal ? 1 : 0.1);
      score += (goal ? Math.min(value, goal) * 3 + value : value * 0.5) * weight;
    }
    if (pickerVendorOfferFor(item)) score += 12;
    return score;
  }

  // Händler-Verfügbarkeit: Item-Hash → { vendor, item }. Wird beim
  // Sortieren/Score genutzt, damit ein Set bevorzugt wird, dessen
  // Teile gerade bei einem Händler erhältlich sind.
  function pickerVendorMap() {
    if (pickerVendorCache.state === allVendorsState && pickerVendorCache.map) return pickerVendorCache.map;
    const map = new Map();
    for (const group of (allVendorsState && allVendorsState.groups) || []) {
      for (const vendor of group.vendors || []) {
        for (const item of vendor.items || []) {
          const hash = Number(item && item.hash) || 0;
          if (hash && !map.has(hash)) map.set(hash, { vendor, item });
        }
      }
    }
    pickerVendorCache = { state: allVendorsState, map };
    return map;
  }

  function pickerVendorOfferFor(item) {
    if (!item) return null;
    return pickerVendorMap().get(Number(item.hash)) || null;
  }

  function pickerBreakpointsHtml(stats) {
    const rows = ARMOR_STAT_DEFS.filter(({ h }) => Number(pickerGoals[h]) > 0 || pickerEffective(stats, h) > 0).map(({ h, label }) => {
      const value = pickerEffective(stats, h);
      const goal = Number(pickerGoals[h]) || 0;
      const tier = Math.max(0, Math.min(10, Math.floor(value / 10)));
      const next = Math.min(200, (tier + 1) * 10);
      const cells = Array.from({ length: 10 }, (_, index) => `<i class="${index < tier ? 'on' : index === tier ? 'now' : ''}" title="T${index + 1} · ${(index + 1) * 10}"></i>`).join('');
      const goalMark = goal ? `<b class="${value >= goal ? 'ok' : ''}" title="Ziel ${goal}">Ziel T${Math.ceil(goal / 10)}</b>` : '';
      return `<div class="picker-bp-row"><span>${esc(label)}</span><span class="picker-bp-cells">${cells}</span>` +
        `<small>T${tier} · ${value}${value < next ? ` (${next - value} bis ${next})` : ''}</small>${goalMark}</div>`;
    }).join('');
    return rows ? `<details class="picker-breakpoints"><summary>Stat-Breakpoints (10er-Stufen)</summary>${rows}</details>` : '';
  }

  function pickerCandidateSlots() {
    const pool = pickerArmorPool();
    const candidates = [];
    let exoticItem = null;
    if (pickerExotic) {
      for (const items of pool.values()) {
        const found = items.find((item) => String(item.instanceId || item.hash) === String(pickerExotic));
        if (found) {
          exoticItem = found;
          break;
        }
      }
      if (!exoticItem) {
        toast('Die gewählte Exotic-Rüstung ist für diese Klasse nicht verfügbar.', 'info', 2600);
        return null;
      }
    }
    for (const slot of PICKER_SLOTS) {
      let items = pool.get(slot) || [];
      if (pickerExcludeUsed) {
        const used = new Set();
        for (const loadout of ((getCfg().bungie && getCfg().bungie.loadouts) || [])) {
          for (const item of (loadout.items || [])) if (item && item.instanceId) used.add(String(item.instanceId));
        }
        items = items.filter((item) => !used.has(String(item.instanceId || '')));
      }
      const forbidExotic = pickerExoticMode === 'forbid';
      const lockId = String(pickerLocks[slot] || '');
      if (lockId) {
        const locked = items.find((item) => String(item.instanceId || item.hash) === lockId);
        if (locked && forbidExotic && Number(locked.rarity) === 6) {
          toast('Gesperrtes Exotic-Teil wird ignoriert, weil Exoten verboten sind.', 'info', 2600);
          items = items.filter((item) => Number(item.rarity) !== 6);
        } else {
          items = locked ? [locked] : [];
        }
      } else if (exoticItem && Number(exoticItem.bucket) === slot) {
        items = [exoticItem];
      } else if (forbidExotic) {
        items = items.filter((item) => Number(item.rarity) !== 6);
      }
      if (!items.length) {
        toast(`Keine Rüstung für ${ARMOR_SLOT_LABELS[slot] || 'Slot'} gefunden.`, 'info', 2600);
        return null;
      }
      const sorted = items.slice().sort((a, b) => pickerItemScore(b) - pickerItemScore(a));
      // Höchstens sechs Exoten pro Slot: das Spiel erlaubt nur ein
      // exotisches Rüstungsteil, der Rest des Pools bleibt legendär.
      const picked = [];
      let exotics = 0;
      for (const item of sorted) {
        if (Number(item.rarity) === 6) {
          if (exotics >= 6) continue;
          exotics += 1;
        }
        picked.push(item);
        if (picked.length >= 50) break;
      }
      candidates.push(picked);
    }
    return { candidates, pool };
  }

  function computeArmorSets() {
    const prepared = pickerCandidateSlots();
    if (!prepared) return null;
    const candidates = prepared.candidates;
    const statHashes = ARMOR_STAT_DEFS.map(({ h }) => h);
    let beam = [{ stats: {}, items: [], score: pickerScore({}) }];
    for (const items of candidates) {
      const next = [];
      for (const partial of beam) {
        for (const item of items) {
          // Nur ein exotisches Rüstungsteil pro Set (Spielregel).
          const exoticCount = (partial.exoticCount || 0) + (Number(item.rarity) === 6 ? 1 : 0);
          if (exoticCount > 1) continue;
          const values = pickerStatArray(item);
          const stats = { ...partial.stats };
          for (let index = 0; index < statHashes.length; index += 1) {
            stats[statHashes[index]] = (Number(stats[statHashes[index]]) || 0) + values[index];
          }
          next.push({ stats, items: partial.items.concat(item), exoticCount, score: pickerScore(stats) });
        }
      }
      next.sort((a, b) => b.score - a.score);
      beam = next.slice(0, 240);
    }
    if (pickerSet && pickerSetCount > 0) {
      beam = beam.filter((set) => set.items.filter((item) => item.setInfo && item.setInfo.name === pickerSet).length >= pickerSetCount);
    }
    if (pickerExoticMode === 'only') {
      beam = beam.filter((set) => set.items.some((item) => Number(item.rarity) === 6));
    }
    beam.sort((a, b) => b.score - a.score);
    return { sets: beam.slice(0, 6), pool: candidates.reduce((sum, list) => sum + list.length, 0) };
  }

  function pickerWorkerPayload(prepared) {
    return {
      id: ++pickerWorkerJob,
      goals: ARMOR_STAT_DEFS.map(({ h }) => Number(pickerGoals[h]) || 0),
      mods: ARMOR_STAT_DEFS.map(({ h }) => Number(pickerMods[h]) || 0),
      fragments: ARMOR_STAT_DEFS.map(({ h }) => Number(pickerFragmentTotal()[h]) || 0),
      weights: ARMOR_STAT_DEFS.map(({ h }) => (Object.prototype.hasOwnProperty.call(pickerWeights, h) ? Math.max(0, Number(pickerWeights[h]) || 0) : null)),
      masterwork: pickerMasterwork,
      set: pickerSet,
      setCount: pickerSetCount,
      sort: pickerSort,
      exoticMode: pickerExoticMode,
      slots: prepared.candidates.map((items) => items.map((item) => {
        const bonus = pickerItemBonus(item);
        const stats = pickerStatArray(item).map((value, index) => value + bonus[index]);
        return {
          key: String(item.instanceId || item.hash),
          set: item.setInfo && item.setInfo.name ? item.setInfo.name : '',
          exotic: Number(item.rarity) === 6,
          stats
        };
      }))
    };
  }

  function pickerSetsFromWorker(message, prepared) {
    const lookup = new Map();
    for (const items of prepared.candidates) {
      for (const item of items) lookup.set(String(item.instanceId || item.hash), item);
    }
    const mapSet = (set) => ({
      items: (set.keys || []).map((key) => lookup.get(String(key))).filter(Boolean),
      stats: Object.fromEntries(ARMOR_STAT_DEFS.map(({ h }, index) => [h, Number(set.stats[index]) || 0])),
      score: 0
    });
    const sets = (message.sets || []).map(mapSet).filter((set) => set.items.length === PICKER_SLOTS.length);
    const withoutExotic = message.withoutExotic ? mapSet(message.withoutExotic) : null;
    return {
      sets,
      withoutExotic: withoutExotic && withoutExotic.items.length === PICKER_SLOTS.length ? withoutExotic : null,
      pool: Number(message.pool) || 0
    };
  }

  function ensurePickerWorker() {
    if (pickerWorker) return pickerWorker;
    try {
      pickerWorker = new Worker(new URL('./picker-worker.js', import.meta.url));
      pickerWorker.onmessage = (event) => {
        const message = event.data || {};
        if (Number(message.id) !== pickerWorkerJob) return;
        const prepared = pickerWorkerPrepared;
        if (!prepared) return;
        pickerResult = { ...pickerSetsFromWorker(message, prepared), at: Date.now(), ms: Math.round(performance.now() - pickerComputeStarted) };
        pickerSearching = false;
        pickerWorkerPrepared = null;
        render();
      };
      pickerWorker.onerror = () => {
        pickerWorker = null;
        const prepared = pickerWorkerPrepared;
        pickerWorkerPrepared = null;
        if (!prepared) return;
        const started = performance.now();
        const result = computeArmorSets();
        if (result) pickerResult = { ...result, at: Date.now(), ms: Math.round(performance.now() - started) };
        pickerSearching = false;
        render();
      };
      return pickerWorker;
    } catch (error) {
      pickerWorker = null;
      return null;
    }
  }

  let pickerWorkerPrepared = null;
  let pickerComputeStarted = 0;

  function findArmorSets() {
    if (pickerSearching) return;
    pickerSearching = true;
    pickerResult = null;
    render();
    const prepared = pickerCandidateSlots();
    if (!prepared) {
      pickerSearching = false;
      render();
      return;
    }
    pickerComputeStarted = performance.now();
    const payload = pickerWorkerPayload(prepared);
    const worker = ensurePickerWorker();
    if (worker) {
      pickerWorkerPrepared = prepared;
      worker.postMessage(payload);
      return;
    }
    setTimeout(() => {
      const result = computeArmorSets();
      if (result) pickerResult = { ...result, at: Date.now(), ms: Math.round(performance.now() - pickerComputeStarted) };
      pickerSearching = false;
      render();
    }, 24);
  }

  let pickerTipEl = null;
  let pickerTipLookup = new Map();

  function ensurePickerTip() {
    if (pickerTipEl) return pickerTipEl;
    pickerTipEl = document.createElement('div');
    pickerTipEl.className = 'inventory-tooltip picker-tooltip';
    pickerTipEl.id = 'armorPickerTooltip';
    document.body.appendChild(pickerTipEl);
    return pickerTipEl;
  }

  function hidePickerTip() {
    if (!pickerTipEl) return;
    pickerTipEl.classList.remove('show');
    pickerTipEl.innerHTML = '';
  }

  function pickerTipHtml(item) {
    if (!item) return '';
    const rarity = Math.max(0, Math.min(6, Number(item.rarity) || 0));
    const stats = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const entry = (item.stats || []).find((stat) => Number(stat.hash) === Number(h));
      return { label, value: Number(entry && (entry.value != null ? entry.value : entry.base)) || 0 };
    });
    const total = Number(item.statTotal != null ? item.statTotal : item.baseStatTotal) || stats.reduce((sum, stat) => sum + stat.value, 0);
    const perks = (item.perks || []).filter((perk) => perk && (perk.n || perk.name));
    let html = `<strong class="dinv-tip-name tt${rarity}">${esc(item.name || 'Rüstung')}</strong>`;
    html += `<span class="inv-tip-meta">${esc(item.typeName || 'Rüstung')}${item.power ? ` · ${Number(item.power)} Power` : ''}${RARITY_LABELS[rarity] ? ` · ${esc(RARITY_LABELS[rarity])}` : ''}</span>`;
    html += `<span class="dinv-tip-stats picker-tip-stats">` + stats.map((stat) =>
      `<span class="dinv-tip-stat"><span>${esc(stat.label)}</span><b>${stat.value}</b></span>`
    ).join('') + `</span>`;
    const meta = [
      item.setInfo && item.setInfo.name ? `Set: ${item.setInfo.name}` : '',
      item.tunedStat ? `Tuning: ${item.tunedStat.label || 'aktiv'}` : '',
      item.masterwork ? 'Meisterwerk' : '',
      Number(item.gearTier) ? `Tier ${Number(item.gearTier)}` : ''
    ].filter(Boolean);
    if (meta.length) html += `<span class="inv-tip-meta">${esc(meta.join(' · '))}</span>`;
    if (perks.length) {
      html += `<span class="picker-tip-plugs">` + perks.map((perk) =>
        `<span class="picker-tip-plug">${perk.i ? `<img loading="lazy" src="https://www.bungie.net${esc(perk.i)}" alt="">` : ''}<span>${esc(perk.n || perk.name)}</span></span>`
      ).join('') + `</span>`;
    }
    if (item.flavor) html += `<span class="inv-tip-flavor">${esc(item.flavor)}</span>`;
    html += `<span class="picker-tip-total">Stats ${total}</span>`;
    return html;
  }

  function showPickerTip(key, event, target) {
    const item = pickerTipLookup.get(String(key || ''));
    if (!item) return;
    const tip = ensurePickerTip();
    tip.innerHTML = pickerTipHtml(item);
    tip.classList.add('show');
    tip.style.visibility = 'hidden';
    const rect = target ? target.getBoundingClientRect() : null;
    const baseX = event && Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (rect ? rect.right : 40);
    const baseY = event && Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (rect ? rect.top : 40);
    positionFixedTip(tip, baseX, baseY, { offset: 14, padding: 10 });
    tip.style.visibility = '';
  }

  function renderPickerCandidates(set) {
    const pool = pickerArmorPool();
    const rows = PICKER_SLOTS.map((slot) => {
      const selected = set.items.find((item) => Number(item.bucket) === slot);
      const selectedKey = selected ? String(selected.instanceId || selected.hash) : '';
      const alternatives = (pool.get(slot) || [])
        .filter((item) => String(item.instanceId || item.hash) !== selectedKey)
        .sort((a, b) => pickerItemScore(b) - pickerItemScore(a))
        .slice(0, 3);
      if (!alternatives.length) return '';
      return `<div class="picker-candidate-row"><span class="picker-candidate-slot">${esc(ARMOR_SLOT_LABELS[slot] || 'Slot')}</span>` +
        alternatives.map((item) => {
          const key = String(item.instanceId || item.hash);
          const total = pickerStatArray(item).reduce((sum, value) => sum + value, 0);
          const offer = pickerVendorOfferFor(item);
          return `<button type="button" class="picker-candidate" data-picker-candidate="${esc(key)}" data-picker-candidate-slot="${slot}" title="${esc(item.name)} · ${total} Basis-Stats${offer ? ` · erhältlich bei ${esc(offer.vendor.name)}` : ''}">` +
            `${item.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(item.icon)}" alt="">` : ''}` +
            `<span>${esc(item.name)}${offer ? ' 🏪' : ''}</span><small>${total}</small></button>`;
        }).join('') +
      `</div>`;
    }).join('');
    if (!rows) return '';
    return `<details class="picker-candidates"><summary>Alternativen pro Slot</summary>${rows}</details>`;
  }

  function pickerSetBonusHtml(set) {
    const groups = new Map();
    for (const item of set.items) {
      const info = item.setInfo;
      if (!info || !info.hash) continue;
      if (!groups.has(info.hash)) groups.set(info.hash, { name: info.name || `Set ${info.hash}`, perks: info.perks || [], count: 0 });
      groups.get(info.hash).count += 1;
    }
    if (!groups.size) return '';
    return [...groups.values()].map((group) => {
      const perks = group.perks.map((perk) =>
        `<span class="picker-bonus${group.count >= Number(perk.count) ? ' on' : ''}">${Number(perk.count) || 2}er: ${esc(perk.name || 'Bonus')}</span>`
      ).join('');
      return `<div class="picker-bonus-row"><strong>${esc(group.name)}</strong><small>${group.count} Teile</small>${perks}</div>`;
    }).join('');
  }

  function pickerWhyHtml(set) {
    let wasted = 0;
    const rows = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const base = Number(set.stats[h]) || 0;
      const mods = (Number(pickerMods[h]) || 0) * 10;
      const mw = pickerMasterwork ? 10 : 0;
      const frag = Number(pickerFragmentTotal()[h]) || 0;
      const raw = base + mods + mw + frag;
      wasted += Math.max(0, raw - ARMOR_STAT_MAX);
      const value = Math.min(ARMOR_STAT_MAX, raw);
      return `<div class="picker-why-row"><span>${esc(label)}</span>` +
        `<b>${base}</b><i>+${mods}</i><i>+${mw}</i><i>${frag >= 0 ? '+' : ''}${frag}</i>` +
        `<strong>${value}</strong><small>T${Math.floor(value / 10)}</small></div>`;
    }).join('');
    const modPoints = ARMOR_STAT_DEFS.reduce((sum, { h }) => sum + (Number(pickerMods[h]) || 0) * 10, 0);
    const unusedMods = Math.max(0, 50 - modPoints);
    const bonuses = pickerSetBonusHtml(set);
    return `<details class="picker-why"><summary>Warum dieses Set?</summary>` +
      `<div class="picker-why-head"><span>Stat</span><b>Basis</b><i>Mods</i><i>MW</i><i>Frag</i><strong>Summe</strong><small>Tier</small></div>` +
      `<div class="picker-why-grid">${rows}</div>` +
      `<div class="picker-why-foot">Verfallen durch 200er-Deckel: ${wasted} · Nicht genutzte Mod-Punkte: ${unusedMods}</div>` +
      (bonuses ? `<div class="picker-why-sets">${bonuses}</div>` : '') +
    `</details>`;
  }

  // Gewichteter Build-Score (0–100) aus Zielen, Stats, Set-Bonus,
  // Energie, Meisterwerk und Tuning.
  function pickerBuildScore(set) {
    const parts = [];
    let goalWeight = 0;
    let goalAchieved = 0;
    for (const { h } of ARMOR_STAT_DEFS) {
      const goal = Number(pickerGoals[h]) || 0;
      if (!goal) continue;
      const weight = Object.prototype.hasOwnProperty.call(pickerWeights, h) ? Math.max(0, Number(pickerWeights[h]) || 0) : 1;
      if (weight <= 0) continue;
      goalWeight += weight;
      goalAchieved += Math.min(1, pickerEffective(set.stats, h) / goal) * weight;
    }
    parts.push({ label: 'Ziele', points: goalWeight ? Math.round(goalAchieved / goalWeight * 40) : 20, max: 40 });
    const total = ARMOR_STAT_DEFS.reduce((sum, { h }) => sum + pickerEffective(set.stats, h), 0);
    parts.push({ label: 'Stats', points: Math.round(Math.min(1, total / 1000) * 20), max: 20, detail: `${total} Punkte` });
    const setCounts = new Map();
    for (const item of set.items) {
      const hash = item.setInfo && item.setInfo.hash;
      if (hash) setCounts.set(hash, (setCounts.get(hash) || 0) + 1);
    }
    const activeSets = [...setCounts.values()].filter((count) => count >= 2).length;
    parts.push({ label: 'Set-Bonus', points: Math.min(10, activeSets * 5), max: 10, detail: `${activeSets} aktiv` });
    const plan = pickerEnergyPlan(set);
    parts.push({ label: 'Energie', points: plan.known ? (plan.unplaced ? 4 : 10) : 0, max: 10 });
    const masterworked = set.items.filter((item) => item.masterwork).length;
    parts.push({ label: 'Meisterwerk', points: Math.round(masterworked / Math.max(1, set.items.length) * 5), max: 5, detail: `${masterworked}/${set.items.length}` });
    const tuned = set.items.filter((item) => item.tunedStat || Number(pickerTuning[Number(item.bucket)])).length;
    parts.push({ label: 'Tuning', points: Math.round(tuned / Math.max(1, set.items.length) * 10), max: 10, detail: `${tuned}/${set.items.length}` });
    parts.push({ label: 'Mod-Plan', points: plan.known && plan.unplaced === 0 ? 5 : 0, max: 5 });
    const vendorPieces = set.items.filter((item) => pickerVendorOfferFor(item)).length;
    parts.push({ label: 'Händler', points: Math.min(5, vendorPieces * 2), max: 5, detail: `${vendorPieces}/${set.items.length} Teile erhältlich` });
    const score = Math.max(0, Math.min(100, parts.reduce((sum, part) => sum + part.points, 0)));
    return { score, parts };
  }

  function pickerBuildScoreHtml(set) {
    const build = pickerBuildScore(set);
    const chips = build.parts.map((part) =>
      `<span class="picker-score-chip${part.points >= part.max ? ' ok' : part.points === 0 ? ' off' : ''}" title="${esc(part.detail || '')}">${esc(part.label)} <b>${part.points}</b>/${part.max}</span>`
    ).join('');
    return `<details class="picker-score-box"><summary>Build-Score <b>${build.score}</b>/100</summary><div class="picker-score-chips">${chips}</div></details>`;
  }

  // „Warum kein Set?“-Diagnose: zeigt die blockierenden Filter und
  // simuliert Lockerungen, ohne dass der Nutzer raten muss.
  function pickerRecommendationsHtml() {
    const goals = ARMOR_STAT_DEFS.filter(({ h }) => Number(pickerGoals[h]) > 0);
    const pool = pickerArmorPool();
    const reasons = [];
    for (const slot of PICKER_SLOTS) {
      const lock = String(pickerLocks[slot] || '');
      const count = lock ? (pool.get(slot) || []).filter((item) => String(item.instanceId || item.hash) === lock).length : (pool.get(slot) || []).length;
      if (!count) reasons.push(`${ARMOR_SLOT_LABELS[slot] || 'Slot'}: ${lock ? 'gesperrtes Teil nicht im Pool' : 'keine Kandidaten'}`);
    }
    const goalSum = goals.reduce((sum, { h }) => sum + (Number(pickerGoals[h]) || 0), 0);
    if (goalSum > 1000) reasons.push(`Ziele summieren ${goalSum} – mehr als die 1.000 Punkte, die fünf Teile liefern können.`);
    if (pickerSetCount === 2 || pickerSetCount === 4) {
      const name = pickerSet || 'das gewählte Set';
      const count = [...pool.values()].flat().filter((item) => item.setInfo && item.setInfo.name === pickerSet).length;
      if (pickerSet && count < pickerSetCount) reasons.push(`${name}: nur ${count} Teile im Pool, ${pickerSetCount} nötig.`);
    }
    if (pickerExcludeUsed) reasons.push('Teile aus anderen Loadouts sind ausgeschlossen.');
    if (pickerExoticMode === 'forbid') reasons.push('Exoten sind verboten – ein exotisches Set ist damit unmöglich.');
    if (pickerExoticMode === 'only' && !pickerExotic) reasons.push('„Nur mit Exot“ ist aktiv, aber kein Exotic ausgewählt.');
    const buttons = [];
    if (goals.length) buttons.push('<button type="button" class="btn ghost small" data-picker-relax="goals">Ziele um 10 senken</button>');
    if (pickerSet || pickerSetCount || pickerArchetype || pickerExcludeUsed || Object.keys(pickerLocks).length) {
      buttons.push('<button type="button" class="btn ghost small" data-picker-relax="filters">Filter & Sperren lösen</button>');
    }
    if (pickerExoticMode === 'forbid') buttons.push('<button type="button" class="btn ghost small" data-picker-relax="exotic">Exoten erlauben</button>');
    buttons.push('<button type="button" class="btn primary small" data-picker-relax="all">Alles lockern & simulieren</button>');
    const list = reasons.length
      ? `<ul class="picker-sim-reasons">${reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>`
      : '<div class="picker-sim-ok">Kein offensichtlicher Hard-Blocker – meist sind die Ziele für den vorhandenen Pool zu hoch.</div>';
    return `<div class="picker-recommendations"><strong>Warum kein Set? · Diagnose & Simulator</strong>` +
      list +
      `<div class="picker-recommendation-actions">${buttons.join('')}</div>` +
      `<small>Jede Lockerung wird sofort neu berechnet. Du kannst sie danach schrittweise zurücknehmen.</small></div>`;
  }

  function pickerExoticCompareHtml(set) {
    if (!pickerResult || !pickerResult.withoutExotic) return '';
    if (!set.items.some((item) => Number(item.rarity) === 6)) return '';
    const plain = pickerResult.withoutExotic;
    const totalNow = ARMOR_STAT_DEFS.reduce((sum, { h }) => sum + pickerEffective(set.stats, h), 0);
    const totalPlain = ARMOR_STAT_DEFS.reduce((sum, { h }) => sum + pickerEffective(plain.stats, h), 0);
    const delta = totalNow - totalPlain;
    const chips = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const diff = pickerEffective(set.stats, h) - pickerEffective(plain.stats, h);
      if (!diff) return '';
      return `<span class="picker-cmp-chip ${diff > 0 ? 'up' : 'down'}">${esc(label)} ${diff > 0 ? '+' : ''}${diff}</span>`;
    }).join('');
    return `<div class="picker-compare"><strong>Ohne Exot: ${totalPlain} Punkte <span class="${delta >= 0 ? 'up' : 'down'}">(${delta >= 0 ? '+' : ''}${delta})</span></strong>` +
      `<div class="picker-cmp-chips">${chips || '<span class="picker-cmp-chip">gleiche Stats</span>'}</div></div>`;
  }

  function pickerReachability(set) {
    const goals = ARMOR_STAT_DEFS.filter(({ h }) => Number(pickerGoals[h]) > 0);
    if (!goals.length) return '';
    const chips = goals.map(({ h, label }) => {
      const goal = Number(pickerGoals[h]) || 0;
      const value = pickerEffective(set.stats, h);
      const diff = goal - value;
      const cls = diff <= 0 ? 'ok' : diff <= 10 ? 'near' : 'off';
      const status = diff <= 0 ? 'erreicht' : diff <= 10 ? `knapp (${diff})` : `offen (${diff})`;
      const lower = diff > 0 && value > 0
        ? ` <button type="button" class="picker-reach-btn" data-picker-lower="${h}">auf ${Math.max(0, Math.floor(value / 5) * 5)}</button>`
        : '';
      return `<span class="picker-reach-chip ${cls}">${esc(label)} ${esc(status)}${lower}</span>`;
    }).join('');
    return `<div class="picker-reach"><span class="picker-reach-title">Erreichbarkeit</span>${chips}</div>`;
  }

  function pickerChampionLine() {
    try {
      const list = championCoverage();
      if (!list.length) return '';
      const active = list.find((entry) => entry && entry.character && entry.character.id === (data && data.characters && data.characters[0] && data.characters[0].id)) || list[0];
      const patterns = ['Barriere', 'Überladung', 'Unstoppable'];
      const state = patterns.map((label, index) => {
        const covered = active && active.coverage && active.coverage[index] && active.coverage[index].length;
        return label + ' ' + (covered ? '✓' : '✗');
      });
      return '<div class="picker-champion-line">Champion-Abdeckung (angelegt): ' + state.join(' · ') +
        '<span class="inv-tool-muted"> · Champion-Mods kommen aus dem Artefakt.</span></div>';
    } catch (error) {
      return '';
    }
  }

  function renderPickerSet(set, index) {
    const goals = ARMOR_STAT_DEFS.filter(({ h }) => Number(pickerGoals[h]) > 0);
    const met = ARMOR_STAT_DEFS.filter(({ h }) => Number(pickerGoals[h]) > 0 && pickerEffective(set.stats, h) >= Number(pickerGoals[h])).length;
    const missing = goals.filter(({ h }) => pickerEffective(set.stats, h) < Number(pickerGoals[h]))
      .map(({ h, label }) => `${label} ${Number(pickerGoals[h]) - pickerEffective(set.stats, h)}`);
    const total = ARMOR_STAT_DEFS.reduce((sum, { h }) => sum + pickerEffective(set.stats, h), 0);
    const equipped = pickerEquippedStats();
    const hasEquipped = ARMOR_STAT_DEFS.some(({ h }) => Number(equipped[h]) > 0);
    const statHtml = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const value = pickerEffective(set.stats, h);
      const base = Number(set.stats[h]) || 0;
      const bonus = value - base;
      const goal = Number(pickerGoals[h]) || 0;
      const pct = goal ? Math.min(100, Math.round(value / goal * 100)) : Math.min(100, Math.round(value / 100 * 100));
      const ok = goal && value >= goal;
      const delta = value - (Number(equipped[h]) || 0);
      return `<div class="picker-stat${ok ? ' ok' : ''}"><span>${esc(label)}</span><b>${value}</b>` +
        `<small>${base}${bonus ? ` +${bonus}` : ''} = ${value} · T${Math.floor(value / 10)}${hasEquipped ? ` · ${delta >= 0 ? '+' : ''}${delta}` : ''}</small>` +
        `<i><em style="width:${pct}%"></em></i></div>`;
    }).join('');
    const pieces = set.items.map((item) => {
      const vendorOffer = pickerVendorOfferFor(item);
      return `<span class="picker-piece${Number(item.rarity) === 6 ? ' exotic' : ''}"${Number(item.rarity) === 6 ? ' data-picker-exotic="1"' : ''} data-picker-tip="${esc(String(item.instanceId || item.hash))}" title="${esc(item.name)}${vendorOffer ? ` · erhältlich bei ${vendorOffer.vendor.name}` : ''}">` +
        `${item.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(item.icon)}" alt="">` : '◆'}` +
        (vendorOffer ? `<b class="picker-piece-vendor" aria-label="Beim Händler erhältlich">🏪</b>` : '') +
        `<small>${esc(ARMOR_SLOT_LABELS[Number(item.bucket)] || '')}</small></span>`;
    }).join('');
    const name = `Armor-Picker ${CLASS_NAMES[pickerClass] || 'Build'}`;
    const plan = index === 0 ? pickerEnergyPlan(set) : null;
    const energyHtml = plan
      ? `<div class="picker-energy${plan.known ? (plan.unplaced ? ' warn' : ' ok') : ''}">` +
          (plan.known
            ? `<b>⚡ ${plan.unplaced ? 'Energie reicht nicht' : 'Mods passen'}</b><span>${plan.modCount} Stat-Mods · ${plan.unplaced ? `${plan.unplaced} ohne Platz` : 'alle Teile ausreichend'}</span>`
            : '<b>⚡ Energie unbekannt</b><span>Der Snapshot enthält keine Energiewerte – im Editor prüfen.</span>') +
        `</div>` +
        `<details class="picker-energy-plan"><summary>Mod-Plan pro Teil</summary>` +
          plan.pieces.map((piece) => `<div class="picker-energy-row"><span>${esc(piece.name)}</span><b>${piece.capacity || '—'}</b><span>${piece.mods} Mods · ${piece.cost} Energie</span></div>`).join('') +
        `</details>`
      : '';
    const shareHtml = index === 0
      ? `<div class="picker-share"><span>Teilen:</span>` +
          `<button type="button" class="btn ghost small" data-picker-share="text">Text</button>` +
          `<button type="button" class="btn ghost small" data-picker-share="link">Link</button>` +
          `<button type="button" class="btn ghost small" data-picker-share="json">JSON</button>` +
        `<button type="button" class="btn ghost small" data-picker-share="image" title="Set als PNG speichern">Bild</button>` +
        `</div>`
      : '';
    return `<div class="picker-best">` +
      `<header><div><span class="picker-best-kicker">${index === 0 ? 'Bestes Set' : `Set ${index + 1}`}</span>` +
        `<strong>${goals.length ? `${met}/${goals.length} Ziele` : 'Freies Set'} · ${total} Punkte</strong>` +
        `<small>${goals.length ? (missing.length ? `Fehlt: ${missing.join(' · ')}` : 'Alle Ziele erreicht') : 'Keine Ziele gesetzt – höchste Gesamtsumme'}${hasEquipped ? ' · Delta zur aktuellen Rüstung' : ''}</small></div>` +
        `<button type="button" class="btn primary small" data-picker-apply="${index}" data-picker-name="${esc(name)}">In Loadout übernehmen</button>` +
      `</header>` +
      `<div class="picker-stat-grid">${statHtml}</div>` +
      `<div class="picker-pieces">${pieces}</div>` +
      energyHtml +
      (index === 0 ? pickerBuildScoreHtml(set) : '') +
      (index === 0 ? pickerReachability(set) : '') +
      (index === 0 ? pickerBreakpointsHtml(set.stats) : '') +
      (index === 0 ? pickerExoticCompareHtml(set) : '') +
      shareHtml +
      (index === 0 ? renderPickerCandidates(set) : '') +
      pickerWhyHtml(set) +
    `</div>`;
  }


  function renderArmorPicker() {
    const pool = pickerArmorPool();
    pickerTipLookup = new Map();
    for (const items of pool.values()) {
      for (const item of items) pickerTipLookup.set(String(item.instanceId || item.hash), item);
    }
    const exoticList = pickerExoticList(pool);
    const totalArmor = [...pool.values()].reduce((sum, list) => sum + list.length, 0);
    const classTabs = CLASS_NAMES.map((label, index) =>
      `<button type="button" class="picker-tab${pickerClass === index ? ' on' : ''}" data-picker-class="${index}">${esc(label)}</button>`
    ).join('');
    const archetypeList = pickerArchetypeList();
    const archetypeOptions = ['<option value="">Alle Archetypen</option>']
      .concat(archetypeList.map(([name, count]) => `<option value="${esc(name)}"${pickerArchetype === name ? ' selected' : ''}>${esc(name)} (${count})</option>`))
      .join('');
    const archetypeBlock = `<label class="picker-field"><span>Archetyp</span><select data-picker-archetype>${archetypeOptions}</select></label>`;
    const statRows = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const goal = Number(pickerGoals[h]) || 0;
      const mods = Number(pickerMods[h]) || 0;
      const fragment = Number(pickerFragments[h]) || 0;
      const bonus = mods * 10 + (pickerMasterwork ? 10 : 0) + fragment;
      const weight = Object.prototype.hasOwnProperty.call(pickerWeights, h) ? Number(pickerWeights[h]) : '';
      return `<div class="picker-stat-row"><span>${esc(label)}</span>` +
        `<input type="number" min="0" max="200" step="5" data-picker-goal="${h}" value="${goal}">` +
        `<select data-picker-weight="${h}" title="Gewichtung: Auto, Aus oder 1–3">` +
          `<option value=""${weight === '' ? ' selected' : ''}>Auto</option>` +
          [0, 1, 2, 3].map((value) => `<option value="${value}"${weight === value ? ' selected' : ''}>${value === 0 ? 'Aus' : value}</option>`).join('') +
        `</select>` +
        `<select data-picker-mod="${h}" title="Stat-Mod-Bonus">` +
          Array.from({ length: 6 }, (_, i) => `<option value="${i}"${mods === i ? ' selected' : ''}>${i}</option>`).join('') +
        `</select>` +
        `<input type="number" min="-30" max="30" step="10" data-picker-fragment="${h}" value="${fragment}" title="Fragment-/Bonus-Annahme">` +
        `<b>${bonus >= 0 ? '+' : ''}${bonus}</b></div>`;
    }).join('');
    const modTotal = Object.values(pickerMods).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const subclassItem = pickerSubclassItem();
    const subclassSockets = subclassItem ? pickerSubclassSockets(subclassItem) : { aspects: [], fragments: [] };
    const subclassSelect = (socket, kind, index) => {
      const current = pickerSubclassPlug(socket);
      const options = (socket.plugs || []).map((plug) => {
        const bonus = pickerStatBonusLabel(plug);
        return `<option value="${esc(String(plug.h))}"${current && Number(current.h) === Number(plug.h) ? ' selected' : ''}>${esc(plug.n || 'Plug')}${bonus ? ` (${esc(bonus)})` : ''}</option>`;
      }).join('');
      return `<label class="picker-sub-row"><span>${kind} ${index + 1}</span>` +
        `<select data-picker-${kind === 'Aspekt' ? 'aspect' : 'frag-plug'}="${socket.idx}"><option value="">—</option>${options}</select></label>`;
    };
    const subclassRows = subclassSockets.aspects.map((socket, index) => subclassSelect(socket, 'Aspekt', index))
      .concat(subclassSockets.fragments.map((socket, index) => subclassSelect(socket, 'Fragment', index))).join('');
    const subclassBonus = pickerSubclassBonuses();
    const subclassSum = ARMOR_STAT_DEFS.filter(({ h }) => Number(subclassBonus[h]) > 0)
      .map(({ h, label }) => `${label} +${subclassBonus[h]}`).join(' · ');
    const subclassBlock = subclassItem
      ? `<details class="picker-subclass"><summary>Subklasse & Fragmente</summary>` +
          `<label class="picker-check"><input type="checkbox" data-picker-subclass-use ${pickerUseSubclass ? 'checked' : ''}> Stat-Boni aus Aspekten/Fragmenten übernehmen</label>` +
          `<div class="picker-sub-grid">${subclassRows || '<span class="inv-tool-muted">Keine Aspekt-/Fragment-Sockets gefunden.</span>'}</div>` +
          `<div class="picker-sub-sum">${subclassSum ? esc(subclassSum) : 'Keine Stat-Boni ausgewählt.'}</div>` +
        `</details>`
      : `<div class="picker-sub-empty">Keine Subklasse angelegt – Fragment-Boni können nur manuell gesetzt werden.</div>`;
    const tuningRows = PICKER_SLOTS.map((bucket) => {
      const value = Number(pickerTuning[bucket]) || 0;
      const options = ARMOR_STAT_DEFS.map(({ h, label }) =>
        `<option value="${h}"${value === Number(h) ? ' selected' : ''}>${esc(label)}</option>`
      ).join('');
      return `<label class="picker-tuning-row"><span>${esc(ARMOR_SLOT_LABELS[bucket] || 'Slot')}</span>` +
        `<select data-picker-tuning="${bucket}"><option value="">kein Tuning</option>${options}</select>` +
      `</label>`;
    }).join('');
    const tuningBlock = `<details class="picker-tuning"><summary>Tuning je Slot (+5)</summary>` +
      `<div class="picker-tuning-grid">${tuningRows}</div>` +
      `<div class="picker-sub-sum">Artifice wird automatisch erkannt (+3 auf Tuning-Stat).</div>` +
    `</details>`;
    const exoticOptions = [`<option value="">Keine Exotic-Rüstung</option>`]
      .concat(exoticList.map((item) => `<option value="${esc(String(item.instanceId || item.hash))}"${String(pickerExotic) === String(item.instanceId || item.hash) ? ' selected' : ''}>${esc(item.name)} · ${esc(ARMOR_SLOT_LABELS[Number(item.bucket)] || '')}</option>`))
      .join('');
    const presetOptions = [
      `<option value="">Vorlage wählen …</option>`,
      ...PICKER_BUILTIN_PRESETS.map((preset) => `<option value="builtin:${esc(preset.id)}">${esc(preset.name)}</option>`),
      ...readPickerPresets().filter((preset) => Number(preset.class) === pickerClass).map((preset) => `<option value="saved:${esc(preset.id)}">${esc(preset.name)}</option>`)
    ].join('');
    const exoticModeOptions = [
      ['allow', 'Exoten erlaubt (max. 1)'],
      ['forbid', 'Exoten verboten'],
      ['only', 'Nur mit Exot']
    ].map(([value, label]) => `<option value="${value}"${pickerExoticMode === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
    const lockHtml = PICKER_SLOTS.map((slot) => {
      const items = (pool.get(slot) || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
      return `<label class="picker-lock"><span>${esc(ARMOR_SLOT_LABELS[slot] || 'Slot')}</span><select data-picker-lock="${slot}">` +
        `<option value="">Automatisch</option>` +
        items.map((item) => `<option value="${esc(String(item.instanceId || item.hash))}"${String(pickerLocks[slot] || '') === String(item.instanceId || item.hash) ? ' selected' : ''}>${esc(item.name)}</option>`).join('') +
      `</select></label>`;
    }).join('');
    const setNames = [...new Set([...pool.values()].flat().map((item) => item.setInfo && item.setInfo.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const setOptions = [`<option value="">Kein Set-Zwang</option>`]
      .concat(setNames.map((name) => `<option value="${esc(name)}"${pickerSet === name ? ' selected' : ''}>${esc(name)}</option>`))
      .join('');
    const sortOptions = [
      ['goals', 'Ziele zuerst'],
      ['total', 'Gesamtsumme'],
      ['missing', 'Fehlende Punkte']
    ].map(([value, label]) => `<option value="${value}"${pickerSort === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
    const modSummary = ARMOR_STAT_DEFS
      .filter(({ h }) => Number(pickerMods[h]) > 0)
      .map(({ h, label }) => `${label} +${Number(pickerMods[h]) * 10}`)
      .join(' · ');
    const results = pickerSearching
      ? `<div class="picker-empty"><span>…</span><strong>Berechne Rüstungssets …</strong><small>Kandidaten werden kombiniert und nach Zielen sortiert.</small></div>`
      : pickerResult
      ? (pickerResult.sets.length
        ? `<div class="picker-results-head"><div><span class="picker-best-kicker">Ergebnis</span><strong>${pickerResult.sets.length} Sets gefunden</strong><small>${pickerResult.pool} Kandidaten · ${pickerResult.ms != null ? `${pickerResult.ms} ms · ` : ''}${new Date(pickerResult.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${modSummary ? ` · Mods: ${esc(modSummary)}` : ''}</small></div></div>` +
          renderPickerSet(pickerResult.sets[0], 0) +
          (pickerResult.sets.length > 1 ? `<div class="picker-set-list">` + pickerResult.sets.slice(1).map((set, i) => renderPickerSet(set, i + 1)).join('') + `</div>` : '')
        : `<div class="picker-empty"><span>◆</span><strong>Kein Set gefunden</strong><small>Set-Bonus-Filter, Sperren oder Ziele lockern.</small>${pickerRecommendationsHtml()}</div>`)
      : `<div class="picker-empty"><span>◆</span><strong>Noch kein Set berechnet</strong><small>Ziele setzen, optional Exotic wählen und „Sets finden“.</small></div>`;
    return `<section class="armor-picker">` +
      `<header class="armor-picker-head"><div><span class="picker-kicker">d2armorpicker-Stil</span><h3>Rüstungs-Picker</h3>` +
        `<p>Finde ein Rüstungsset für deine Stat-Ziele und übernimm es direkt in den Loadout-Editor.</p></div>` +
        `<span class="picker-pool">${totalArmor} Teile im Pool</span><span class="picker-pool picker-meta">Meta: ${esc(PICKER_META_STAND)}</span></header>` +
      `<div class="picker-layout">` +
        `<aside class="picker-panel">` +
          `<div class="picker-class">${classTabs}</div>` +
          archetypeBlock +
          `<div class="picker-presets"><select data-picker-preset>${presetOptions}</select>` +
            `<input type="text" data-picker-preset-name maxlength="40" placeholder="Vorlagen-Name">` +
            `<button type="button" class="btn ghost small" data-picker-preset-save>Speichern</button>` +
            `<button type="button" class="btn ghost small" data-picker-preset-del>Löschen</button>` +
            `<button type="button" class="btn ghost small" data-picker-import title="DIM-/Picker-JSON aus der Zwischenablage importieren">Import</button></div>` +
          `<div class="picker-targets"><span class="picker-targets-title" title="Mehrere Zielprofile speichern und schnell wechseln">Ziel-Profile</span>` +
            `<select data-picker-target><option value="">Zielprofil wählen …</option>${pickerTargets.map((target) => `<option value="${esc(target.id)}">${esc(target.name)}${Number(target.class) !== pickerClass ? ` · ${esc(CLASS_NAMES[Number(target.class)] || '')}` : ''}</option>`).join('')}</select>` +
            `<input type="text" data-picker-target-name maxlength="40" placeholder="z. B. GM, PvP, Raid">` +
            `<button type="button" class="btn ghost small" data-picker-target-save>Speichern</button>` +
            `<button type="button" class="btn ghost small" data-picker-target-del>Löschen</button></div>` +
          `<label class="picker-field"><span>Exoten</span><select data-picker-exotic-mode>${exoticModeOptions}</select></label>` +
          `<label class="picker-field"><span>Exotic-Rüstung</span><select data-picker-exotic>${exoticOptions}</select></label>` +
          `<details class="picker-locks"><summary>Slots sperren</summary><div class="picker-lock-grid">${lockHtml}</div></details>` +
          `<div class="picker-stat-table"><div class="picker-stat-head"><span>Stat</span><span>Ziel</span><span>Gew.</span><span>Mods</span><span>Frag</span><span>Bonus</span></div>${statRows}</div>` +
          subclassBlock +
          tuningBlock +
          `<div class="picker-modline${modTotal > 5 ? ' warn' : ''}">${modTotal}/5 Stat-Mods · je +10${pickerMasterwork ? ' · Meisterwerk +10' : ''}</div>` +
          `<label class="picker-check"><input type="checkbox" data-picker-masterwork ${pickerMasterwork ? 'checked' : ''}> Meisterwerk für alle Teile annehmen (+10 je Stat)</label>` +
          `<label class="picker-check"><input type="checkbox" data-picker-exclude-used ${pickerExcludeUsed ? 'checked' : ''}> Teile aus anderen Loadouts ausschließen</label>` +
          `<div class="picker-two"><label class="picker-field"><span>Set-Bonus</span><select data-picker-set>${setOptions}</select></label>` +
            `<label class="picker-field"><span>Teile</span><select data-picker-setcount><option value="0"${pickerSetCount === 0 ? ' selected' : ''}>—</option><option value="2"${pickerSetCount === 2 ? ' selected' : ''}>2er</option><option value="4"${pickerSetCount === 4 ? ' selected' : ''}>4er</option></select></label></div>` +
          `<label class="picker-field"><span>Sortierung</span><select data-picker-sort>${sortOptions}</select></label>` +
          `<div class="picker-actions"><button type="button" class="btn primary small" data-picker-find ${pickerSearching ? 'disabled' : ''}>${pickerSearching ? 'Berechne …' : 'Sets finden'}</button>` +
            `<button type="button" class="btn ghost small" data-picker-lock-equipped>Aktuelles Set sperren</button>` +
            `<button type="button" class="btn ghost small" data-picker-reset>Zurücksetzen</button></div>` +
          `<div class="picker-hint">Basiswerte der Rüstung + Mods + Meisterwerk + Fragment-Annahmen. Gesperrte Slots werden immer verwendet.</div>` +
        `</aside>` +
        `<div class="picker-main">${results}</div>` +
      `</div>` +
    `</section>`;
  }

  function renderBuildCheck() {
    const icons = (data && data.charStatIcons) || {};
    const rows = championCoverage().map(({ character, coverage }) => {
      const profileStats = character.stats || {};
      const hasProfileStats = ARMOR_STAT_DEFS.some(({ h }) => profileStats[h] != null);
      const stats = Object.fromEntries(ARMOR_STAT_DEFS.map(({ h }) => [h, 0]));
      let pieces = 0;
      for (const entry of allEntries()) {
        if (entry.kind !== 'equipped' || entry.owner !== character.id) continue;
        if (!ARMOR_SLOTS.has(Number(entry.item.bucket))) continue;
        pieces += 1;
        for (const stat of (entry.item.stats || [])) {
          const hash = Number(stat.hash);
          if (stats[hash] !== undefined) stats[hash] += Number(stat.value) || 0;
        }
      }
      if (hasProfileStats) {
        for (const { h } of ARMOR_STAT_DEFS) stats[h] = Number(profileStats[h]) || 0;
      }
      const championNames = coverage.flat();
      const statLines = ARMOR_STAT_DEFS.map(({ h, label }) => {
        const value = Number(stats[h]) || 0;
        const icon = icons[String(h)] || '';
        return `<div class="inv-tool-statline">` +
          `<span class="inv-tool-statline-label">${icon ? `<img loading="lazy" src="https://www.bungie.net${esc(icon)}" alt="">` : ''}<span>${esc(label)}</span></span>` +
          `<b>${value}</b>${armorStatMeter(value)}</div>`;
      }).join('');
      return `<div class="inv-tool-char">` +
        `<div class="inv-tool-char-head"><strong>${esc(CLASS_NAMES[character.classType] || 'Hüter')}</strong>` +
        `<span>${Number(character.light) || 0} Licht</span>` +
        `<span class="${championNames.length ? '' : 'inv-tool-warn'}">${championNames.length ? `Champions: ${esc([...new Set(championNames)].join(', '))}` : '⚠ keine Champion-Fähigkeit'}</span>` +
        `<span class="${pieces === 5 ? '' : 'inv-tool-warn'}">${pieces}/5 Rüstungsteile</span></div>` +
        `<div class="inv-tool-stats-grid">${statLines}</div>` +
        `<div class="inv-tool-statlegend">${hasProfileStats ? 'Werte inkl. Mods/Masterwork' : 'Werte nur aus Rüstung'} · 0–200 (DIM)</div></div>`;
    }).join('');
    return card('Build-Check', '🧩', rows || '<span class="inv-tool-muted">Keine Charakterdaten.</span>', '', 'wide');
  }

  function fragmentStatBonuses(character) {
    const out = Object.fromEntries(ARMOR_STAT_DEFS.map(({ h }) => [h, 0]));
    if (!character) return out;
    const equipped = (data && data.equipped && data.equipped[character.id]) || [];
    for (const item of equipped) {
      const bucket = Number(item.bucket);
      if (bucket !== 3284755031 && bucket !== 1506418338) continue; // Subklasse + Artefakt
      const seen = new Set();
      const addPlug = (plug) => {
        if (!plug) return;
        const hash = Number(plug.hash) || 0;
        if (hash && seen.has(hash)) return;
        if (hash) seen.add(hash);
        for (const bonus of plug.s || []) {
          if (out[bonus.h] !== undefined) out[bonus.h] += Number(bonus.v) || 0;
        }
      };
      for (const plug of item.perks || []) addPlug(plug);
      for (const plug of item.modSockets || []) addPlug(plug);
      for (const column of item.socketColumns || []) {
        for (const option of column.options || []) if (option.selected) addPlug(option);
      }
    }
    return out;
  }

  function characterSetGroups(character) {
    const groups = new Map();
    const equipped = (data && data.equipped && data.equipped[character.id]) || [];
    for (const item of equipped) {
      if (!ARMOR_SLOTS.has(Number(item.bucket)) || !item.setInfo || !item.setInfo.hash) continue;
      if (!groups.has(item.setInfo.hash)) groups.set(item.setInfo.hash, { info: item.setInfo, items: [] });
      groups.get(item.setInfo.hash).items.push(item);
    }
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
  }

  function renderSetBonuses() {
    const chars = (data && data.characters) || [];
    const blocks = chars.map((character) => {
      const groups = characterSetGroups(character);
      const rows = groups.length
        ? groups.map((group) => {
            const count = group.items.length;
            const name = group.info.name || `Set ${group.info.hash}`;
            const perks = (group.info.perks || []).map((perk) => {
              const active = count >= perk.count;
              return `<div class="inv-set-perk${active ? ' on' : ''}"><b>${perk.count}er</b><span>${esc(perk.name || 'Bonus')}${perk.description ? ` — ${esc(perk.description.slice(0, 130))}` : ''}</span></div>`;
            }).join('');
            return `<div class="inv-set-group"><div class="inv-tool-row"><span class="inv-tool-main">${esc(name)}</span>` +
              `<span class="inv-tool-meta">${count}/5 Teile${count >= 2 ? ' · 2er aktiv' : ''}${count >= 4 ? ' · 4er aktiv' : ''}</span>` +
              `<button type="button" class="btn ghost small" data-tool-search="set:${esc(name)}">Suchen</button></div>${perks}</div>`;
          }).join('')
        : '<span class="inv-tool-muted">Keine Rüstungs-Sets angelegt.</span>';
      return `<div class="inv-tool-char"><div class="inv-tool-char-head"><strong>${esc(CLASS_NAMES[character.classType] || 'Hüter')}</strong>` +
        `<span>${groups.length} Set${groups.length === 1 ? '' : 's'}</span></div>${rows}</div>`;
    }).join('');
    return card('Set-Boni', '🧱', blocks || '<span class="inv-tool-muted">Keine Charakterdaten.</span>', '', 'wide');
  }

  function renderMasterworkPlanner() {
    const chars = (data && data.characters) || [];
    const blocks = chars.map((character) => {
      const equipped = (data && data.equipped && data.equipped[character.id]) || [];
      const armor = equipped.filter((item) => ARMOR_SLOTS.has(Number(item.bucket)));
      const rows = armor.map((item) => {
        const mwStats = (item.stats || [])
          .filter((stat) => Number(stat.mw) > 0)
          .map((stat) => `${stat.label || 'Stat'} +${Number(stat.mw)}`);
        const sockets = ((data.sockDefs || {})[String(item.hash)] || []);
        const tuningSockets = sockets.filter((socket) => (socket.plugs || []).some((plug) => /tuning\.mods/i.test(String(plug.p || ''))));
        const options = [...new Set(tuningSockets.flatMap((socket) => (socket.plugs || []).filter((plug) => /tuning\.mods/i.test(String(plug.p || '')) && (plug.s || []).some((bonus) => bonus.v > 0)).map((plug) => plug.n)))].slice(0, 4);
        const mwText = mwStats.length ? `MW: ${mwStats.join(', ')}` : item.masterwork ? 'MW aktiv' : 'nicht gemeistert';
        return `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(ARMOR_SLOT_LABELS[Number(item.bucket)] || 'Rüstung')}</span>` +
          `<span class="inv-tool-main">${esc(item.name)}${item.masterwork ? ' <span class="inv-tool-chip on">MW</span>' : ''}</span>` +
          `<span class="inv-tool-meta">${esc(armorTuningAdvice(item))} · ${esc(mwText)}${options.length ? ` · Optionen: ${esc(options.join(', '))}` : ''}</span></div>`;
      }).join('');
      const targetText = `${armorStatLabel(optimizerTarget1)} / ${armorStatLabel(optimizerTarget2)}`;
      return `<div class="inv-tool-char"><div class="inv-tool-char-head"><strong>${esc(CLASS_NAMES[character.classType] || 'Hüter')}</strong>` +
        `<span>Ziel: ${esc(targetText)}</span></div>${rows || '<span class="inv-tool-muted">Keine Rüstung angelegt.</span>'}</div>`;
    }).join('');
    return card('Masterwork & Tuning', '🔧', blocks || '<span class="inv-tool-muted">Keine Charakterdaten.</span>', '', 'wide');
  }

  function optimizerCharacter() {
    const chars = (data && data.characters) || [];
    return chars.find((char) => char.id === optimizerCharId) || chars[0] || null;
  }

  function optimizerItemStats(item) {
    const out = {};
    for (const { h } of ARMOR_STAT_DEFS) out[h] = 0;
    for (const stat of (item.stats || [])) {
      const hash = Number(stat.hash);
      if (out[hash] !== undefined) out[hash] += Number(stat.base != null ? stat.base : stat.value) || 0;
    }
    return out;
  }

﻿  let optimizerCache = { data: null, key: '', result: null };

  function computeOptimizer() {
    const character = optimizerCharacter();
    if (!character) return null;
    const fragments = fragmentStatBonuses(character);
    const statHashes = ARMOR_STAT_DEFS.map(({ h }) => h);
    const statIndex = new Map(statHashes.map((hash, index) => [String(hash), index]));
    const cacheKey = [
      character.id,
      optimizerTarget1,
      optimizerTarget2,
      Number(optimizerTarget1Value) || 0,
      Number(optimizerTarget2Value) || 0,
      optimizerPreferSets ? 1 : 0,
      statHashes.map((hash) => Number(fragments[hash]) || 0).join(',')
    ].join('|');
    if (optimizerCache.data === data && optimizerCache.key === cacheKey) return optimizerCache.result;

    const statsOf = (item) => {
      const out = [0, 0, 0, 0, 0, 0];
      for (const stat of (item.stats || [])) {
        const index = statIndex.get(String(Number(stat.hash)));
        if (index === undefined) continue;
        out[index] += Number(stat.base != null ? stat.base : stat.value) || 0;
      }
      return out;
    };
    const entries = allEntries().filter((entry) => {
      const item = entry.item;
      if (!item || !ARMOR_SLOTS.has(Number(item.bucket))) return false;
      if (Number(item.classType) !== 3 && Number(item.classType) !== Number(character.classType)) return false;
      return true;
    });
    const slots = [...ARMOR_SLOTS];
    const bySlot = new Map();
    for (const entry of entries) {
      const slot = Number(entry.item.bucket);
      if (!bySlot.has(slot)) bySlot.set(slot, []);
      const list = bySlot.get(slot);
      if (list.some((seen) => seen.entry.item.instanceId === entry.item.instanceId)) continue;
      list.push({ entry, stats: statsOf(entry.item) });
    }
    for (const slot of slots) {
      const list = bySlot.get(slot) || [];
      const i1 = Number(optimizerTarget1);
      const i2 = Number(optimizerTarget2);
      const indexOf = (hash) => statHashes.indexOf(hash);
      const a = indexOf(i1);
      const b = indexOf(i2);
      const scoreOf = (option) => (a >= 0 ? option.stats[a] : 0) + (b >= 0 ? option.stats[b] : 0) +
        option.stats.reduce((sum, value) => sum + value, 0) * 0.1;
      list.sort((left, right) => scoreOf(right) - scoreOf(left));
      bySlot.set(slot, list.slice(0, 10));
    }
    if (slots.some((slot) => !(bySlot.get(slot) || []).length)) {
      optimizerCache = { data, key: cacheKey, result: null };
      return null;
    }

    const t1 = Number(optimizerTarget1);
    const t2 = Number(optimizerTarget2);
    const i1 = statHashes.indexOf(t1);
    const i2 = statHashes.indexOf(t2);
    const limitOf = (index) => {
      if (index === i1) return Math.min(ARMOR_STAT_MAX, Math.max(0, Number(optimizerTarget1Value) || ARMOR_STAT_MAX));
      if (index === i2) return Math.min(ARMOR_STAT_MAX, Math.max(0, Number(optimizerTarget2Value) || ARMOR_STAT_MAX));
      return ARMOR_STAT_MAX;
    };
    const limit1 = limitOf(i1);
    const limit2 = limitOf(i2);
    const startTotals = statHashes.map((hash) => Number(fragments[hash]) || 0);
    const totals = startTotals.slice();
    const capped = new Array(statHashes.length).fill(0);
    const combo = [];
    const setCounts = new Map();
    let best = null;

    const evaluate = () => {
      let baseTotal = 0;
      let wasted = 0;
      for (let index = 0; index < totals.length; index += 1) {
        const raw = totals[index];
        baseTotal += raw;
        if (raw > ARMOR_STAT_MAX) {
          capped[index] = ARMOR_STAT_MAX;
          wasted += raw - ARMOR_STAT_MAX;
        } else {
          capped[index] = raw;
        }
      }
      let points = 50;
      if (i1 === i2) {
        if (i1 >= 0) {
          const give = Math.max(0, Math.min(points, limit1 - capped[i1]));
          capped[i1] += give;
          points -= give;
        }
      } else {
        while (points > 0) {
          const openA = i1 >= 0 && capped[i1] < limit1;
          const openB = i2 >= 0 && capped[i2] < limit2;
          if (!openA && !openB) break;
          const pick = openA && (!openB || capped[i1] <= capped[i2]) ? i1 : i2;
          const give = Math.max(0, Math.min(points, limitOf(pick) - capped[pick]));
          if (give <= 0) break;
          capped[pick] += give;
          points -= give;
        }
      }
      for (let index = 0; index < capped.length; index += 1) {
        if (points <= 0) break;
        if (index === i1 || index === i2) continue;
        const give = Math.max(0, Math.min(points, ARMOR_STAT_MAX - capped[index]));
        capped[index] += give;
        points -= give;
      }
      for (const index of [i1, i2]) {
        if (points <= 0) break;
        if (index < 0) continue;
        const give = Math.max(0, Math.min(points, ARMOR_STAT_MAX - capped[index]));
        capped[index] += give;
        points -= give;
      }
      wasted += points;
      let setBonus = 0;
      if (optimizerPreferSets) {
        for (const [hash, count] of setCounts) {
          const perks = setPerks.get(hash) || [];
          for (const perk of perks) if (count >= perk.count) setBonus += 800;
        }
      }
      const first = i1 >= 0 ? capped[i1] : 0;
      const second = i2 >= 0 ? capped[i2] : 0;
      const score = Math.min(first, second) * 10000 + (first + second) * 100 + baseTotal + 50 + setBonus;
      if (!best || score > best.score) {
        best = { score, wasted, totals: capped.slice(), baseTotals: totals.slice(), items: combo.slice(), setCounts: new Map(setCounts) };
      }
    };

    const setPerks = new Map();
    for (const slot of slots) {
      for (const option of bySlot.get(slot) || []) {
        const info = option.entry.item.setInfo;
        if (info && info.hash && !setPerks.has(info.hash)) setPerks.set(info.hash, info.perks || []);
      }
    }

    const walk = (index) => {
      if (index >= slots.length) {
        evaluate();
        return;
      }
      for (const option of bySlot.get(slots[index]) || []) {
        const values = option.stats;
        for (let s = 0; s < values.length; s += 1) totals[s] += values[s];
        const setHash = option.entry.item.setInfo && option.entry.item.setInfo.hash;
        if (setHash) setCounts.set(setHash, (setCounts.get(setHash) || 0) + 1);
        combo.push(option.entry);
        walk(index + 1);
        combo.pop();
        if (setHash) {
          const next = (setCounts.get(setHash) || 0) - 1;
          if (next > 0) setCounts.set(setHash, next);
          else setCounts.delete(setHash);
        }
        for (let s = 0; s < values.length; s += 1) totals[s] -= values[s];
      }
    };
    walk(0);

    let result = null;
    if (best) {
      const mods = Object.fromEntries(statHashes.map((hash) => [hash, 0]));
      let points = 50;
      const addMod = (index, amount) => {
        if (points <= 0 || index < 0) return;
        const give = Math.max(0, Math.min(points, limitOf(index) - best.totals[index]));
        if (give <= 0) return;
        best.totals[index] += give;
        mods[statHashes[index]] += give;
        points -= give;
      };
      if (i1 === i2) {
        addMod(i1, points);
      } else {
        while (points > 0) {
          const openA = i1 >= 0 && best.totals[i1] < limit1;
          const openB = i2 >= 0 && best.totals[i2] < limit2;
          if (!openA && !openB) break;
          addMod(openA && (!openB || best.totals[i1] <= best.totals[i2]) ? i1 : i2, points);
        }
        for (let index = 0; index < best.totals.length; index += 1) {
          if (points <= 0) break;
          if (index === i1 || index === i2) continue;
          addMod(index, points);
        }
        addMod(i1, points);
        addMod(i2, points);
      }
      const sets = [...best.setCounts.entries()].map(([hash, count]) => {
        const item = best.items.find((entry) => entry.item.setInfo && entry.item.setInfo.hash === hash);
        const info = (item && item.item.setInfo) || {};
        return {
          name: info.name || `Set ${hash}`,
          count,
          perks: (info.perks || []).map((perk) => ({ ...perk, active: count >= perk.count }))
        };
      });
      result = {
        character,
        score: best.score,
        totals: best.totals,
        baseTotals: best.baseTotals,
        mods,
        wasted: best.wasted,
        fragments,
        sets,
        items: best.items
      };
    }
    optimizerCache = { data, key: cacheKey, result };
    return result;
  }


  function buildSummaryText(result) {
    if (!result) return '';
    const character = result.character || {};
    const lines = [
      `${CLASS_NAMES[character.classType] || 'Hüter'} · ${Number(character.light) || 0} Licht`,
      `Ziel: ${armorStatLabel(optimizerTarget1)} ${Number(optimizerTarget1Value) || 0} · ${armorStatLabel(optimizerTarget2)} ${Number(optimizerTarget2Value) || 0}`
    ];
    for (const { h, label } of ARMOR_STAT_DEFS) {
      lines.push(`${label}: ${Math.min(ARMOR_STAT_MAX, result.totals[h] || 0)}/200`);
    }
    lines.push('');
    result.items.forEach((entry) => {
      const slot = ARMOR_SLOT_LABELS[Number(entry.item.bucket)] || 'Rüstung';
      const meta = [entry.item.gearTier ? `T${entry.item.gearTier}` : '', entry.item.archetype ? entry.item.archetype.name : '', entry.item.setInfo ? entry.item.setInfo.name : ''].filter(Boolean).join(' · ');
      lines.push(`${slot}: ${entry.item.name}${meta ? ` (${meta})` : ''}`);
    });
    if (result.sets && result.sets.some((set) => set.count >= 2)) {
      lines.push('', 'Sets:');
      result.sets.filter((set) => set.count >= 2).forEach((set) => {
        lines.push(`- ${set.name} ${set.count}/5${set.perks.filter((perk) => perk.active).map((perk) => ` · ${perk.count}er ${perk.name}`).join('')}`);
      });
    }
    const mods1 = Number(result.mods[optimizerTarget1]) || 0;
    const mods2 = Number(result.mods[optimizerTarget2]) || 0;
    lines.push('', `Stat-Mods: ${armorStatLabel(optimizerTarget1)} +${mods1}, ${armorStatLabel(optimizerTarget2)} +${mods2}`);
    if (Number(result.wasted) > 0) lines.push(`Verfallen: ${Number(result.wasted)} Punkte (alle Stats bei 100)`);
    lines.push(`Fragmente: ${Object.entries(result.fragments || {}).filter(([, value]) => value).map(([hash, value]) => `${armorStatLabel(hash)} ${value > 0 ? '+' : ''}${value}`).join(', ') || '—'}`);
    return lines.join('\n');
  }

  async function shareBuildCard(result) {
    if (!result) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#172133';
    ctx.fillRect(0, 0, canvas.width, 88);
    ctx.fillStyle = '#f5d76a';
    ctx.font = '700 30px "Segoe UI", sans-serif';
    ctx.fillText(`${CLASS_NAMES[result.character.classType] || 'Hüter'} · ${Number(result.character.light) || 0}`, 32, 48);
    ctx.fillStyle = '#9fb0c8';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText(`${armorStatLabel(optimizerTarget1)} ${Number(optimizerTarget1Value) || 0} · ${armorStatLabel(optimizerTarget2)} ${Number(optimizerTarget2Value) || 0}`, 32, 72);
    let y = 130;
    for (const { h, label } of ARMOR_STAT_DEFS) {
      const value = Math.min(ARMOR_STAT_MAX, Number(result.totals[h]) || 0);
      ctx.fillStyle = '#c8d0dc';
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.fillText(label, 32, y + 12);
      ctx.fillStyle = '#131c28';
      ctx.fillRect(190, y, 500, 16);
      const brandBar = getComputedStyle(document.documentElement).getPropertyValue('--brand-strong').trim() || '#4a8fd4';
      ctx.fillStyle = brandBar;
      ctx.fillRect(190, y, Math.min(500, (value / 200) * 500), 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(value), 700, y + 13);
      y += 30;
    }
    y += 18;
    ctx.fillStyle = '#f0f3f8';
    ctx.font = '600 18px "Segoe UI", sans-serif';
    ctx.fillText('Ausrüstung', 32, y);
    y += 28;
    ctx.font = '15px "Segoe UI", sans-serif';
    for (const entry of result.items) {
      const slot = ARMOR_SLOT_LABELS[Number(entry.item.bucket)] || 'Rüstung';
      const meta = [entry.item.gearTier ? `T${entry.item.gearTier}` : '', entry.item.archetype ? entry.item.archetype.name : '', entry.item.setInfo ? entry.item.setInfo.name : ''].filter(Boolean).join(' · ');
      ctx.fillStyle = '#9fb0c8';
      ctx.fillText(slot, 32, y);
      ctx.fillStyle = '#e8ecf2';
      ctx.fillText(String(entry.item.name || '').slice(0, 52), 130, y);
      ctx.fillStyle = '#7f8da3';
      ctx.fillText(meta.slice(0, 50), 540, y);
      y += 24;
    }
    if (result.sets && result.sets.some((set) => set.count >= 2)) {
      y += 8;
      ctx.fillStyle = '#f0f3f8';
      ctx.font = '600 16px "Segoe UI", sans-serif';
      ctx.fillText('Sets', 32, y);
      y += 24;
      ctx.font = '14px "Segoe UI", sans-serif';
      for (const set of result.sets.filter((entry) => entry.count >= 2)) {
        ctx.fillStyle = set.perks.some((perk) => perk.active) ? '#b9e8c4' : '#9fb0c8';
        ctx.fillText(`${set.name} ${set.count}/5 · ${set.perks.filter((perk) => perk.active).map((perk) => `${perk.count}er ${perk.name}`).join(' · ') || '—'}`, 32, y);
        y += 21;
      }
    }
    ctx.fillStyle = '#5b6a80';
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillText("Destiny 2 Tool by FreakItOut", 32, canvas.height - 24);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Build-Karte konnte nicht erzeugt werden.');
    let copied = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        copied = true;
      }
    } catch (error) {
      copied = false;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'destiny-build.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(copied ? 'Build-Karte kopiert und gespeichert.' : 'Build-Karte gespeichert.', 'success', 2400);
  }

  async function loadInGameLoadouts(force) {
    if (inGameLoadoutsLoading) return;
    if (!api || typeof api.bungieIngameLoadouts !== 'function') {
      inGameLoadoutsState = { ok: false, error: 'In-Game-Loadouts sind nicht verfügbar.' };
      render();
      return;
    }
    inGameLoadoutsLoading = true;
    render();
    try {
      inGameLoadoutsState = await api.bungieIngameLoadouts(force === true);
    } catch (error) {
      inGameLoadoutsState = { ok: false, error: error.message || String(error) };
    } finally {
      inGameLoadoutsLoading = false;
      render();
    }
  }

  function renderInGameLoadouts() {
    if (!inGameLoadoutsState && !inGameLoadoutsLoading) loadInGameLoadouts(false);
    const itemMap = new Map();
    for (const entry of allEntries()) {
      if (entry.item && entry.item.instanceId) itemMap.set(String(entry.item.instanceId), entry.item);
    }
    const chars = (data && data.characters) || [];
    const blocks = chars.map((character) => {
      const list = (inGameLoadoutsState && inGameLoadoutsState.loadouts && inGameLoadoutsState.loadouts[character.id]) || [];
      const rows = list.length
        ? list.map((loadout) => {
            const items = (loadout.itemIds || []).map((id) => itemMap.get(String(id))).filter(Boolean);
            const names = items.slice(0, 5).map((item) => item.name).join(', ');
            return `<div class="inv-tool-row"><span class="inv-tool-slot">#${Number(loadout.index) + 1}</span>` +
              `<span class="inv-tool-main">${esc(names || 'Items nicht im Inventar')}</span>` +
              `<span class="inv-tool-meta">${items.length}/${loadout.itemIds.length} Items</span>` +
              `<button type="button" class="btn primary small" data-tool-ingame-apply="${esc(character.id)}:${Number(loadout.index)}">Anwenden</button>` +
              `<button type="button" class="btn ghost small" data-tool-ingame-import="${esc(character.id)}:${Number(loadout.index)}">Importieren</button></div>`;
          }).join('')
        : `<span class="inv-tool-muted">${inGameLoadoutsLoading ? 'Lade In-Game-Loadouts …' : (inGameLoadoutsState && inGameLoadoutsState.ok === false ? esc(inGameLoadoutsState.error || 'Nicht verfügbar.') : 'Keine In-Game-Loadouts belegt.')}</span>`;
      return `<div class="inv-tool-char"><div class="inv-tool-char-head"><strong>${esc(CLASS_NAMES[character.classType] || 'Hüter')}</strong>` +
        `<span>${list.length} Loadouts</span></div>${rows}</div>`;
    }).join('');
    return card('In-Game-Loadouts', '🎮', blocks || '<span class="inv-tool-muted">Keine Charakterdaten.</span>',
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-ingame-load ${inGameLoadoutsLoading ? 'disabled' : ''}>Aktualisieren</button></span>`, 'wide');
  }

  function loadoutUsedLabel(at) {
    const value = Number(at) || 0;
    if (!value) return 'nie';
    const mins = Math.max(0, Math.round((Date.now() - value) / 60000));
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.round(hours / 24);
    return `vor ${days} Tg.`;
  }

  let loadoutDiffId = '';
  let loadoutVersionDiff = null;
  function renderLoadoutStats() {
    const cfg = getCfg();
    const loadouts = ((cfg.bungie && cfg.bungie.loadouts) || []).slice();
    const stats = (cfg.bungie && cfg.bungie.loadoutStats) || {};
    const favs = (cfg.bungie && cfg.bungie.loadoutFavs) || {};
    if (!loadouts.length) {
      return card('Loadout-Statistik', '⭐', '<span class="inv-tool-muted">Noch keine Loadouts gespeichert.</span>', '', 'wide');
    }
    const sorted = loadouts.slice().sort((a, b) => {
      const favA = favs[a.id] === true ? 1 : 0;
      const favB = favs[b.id] === true ? 1 : 0;
      if (favA !== favB) return favB - favA;
      const useA = Number((stats[a.id] || {}).applies) || 0;
      const useB = Number((stats[b.id] || {}).applies) || 0;
      if (useA !== useB) return useB - useA;
      return String(a.name || '').localeCompare(String(b.name || ''), 'de');
    });
    const rows = sorted.map((loadout) => {
      const stat = stats[loadout.id] || {};
      const favorite = favs[loadout.id] === true;
      const itemCount = (loadout.items || []).length;
      return `<div class="inv-tool-row"><span class="inv-tool-slot">${favorite ? '★' : '☆'}</span>` +
        `<span class="inv-tool-main">${esc(loadout.name || 'Loadout')}<small class="inv-tool-muted"> ${esc(CLASS_NAMES[loadout.classType] || 'Hüter')} · ${itemCount} Items</small></span>` +
        `<span class="inv-tool-meta">${Number(stat.applies) || 0}× · ${loadoutUsedLabel(stat.lastUsedAt)}</span>` +
        `<span class="inv-tool-actions">` +
          `<select class="inv-tool-select" data-tool-ingame-link="${esc(loadout.id)}" title="Mit In-Game-Loadout-Slot verknüpfen">` +
            `<option value="0" ${!(Number(loadout.ingameIndex) > 0) ? 'selected' : ''}>In-Game: —</option>` +
            [1,2,3,4,5,6,7,8,9,10].map((slot) => `<option value="${slot}" ${Number(loadout.ingameIndex) === slot ? 'selected' : ''}>Slot ${slot}</option>`).join('') +
          `</select>` +
          (Number(loadout.ingameIndex) > 0
            ? `<button type="button" class="btn ghost small" data-tool-ingame-apply-linked="${esc(loadout.id)}">Im Spiel anwenden</button>`
            : '') +
          `<button type="button" class="btn ghost small" data-tool-loadout-diff="${esc(loadout.id)}">Abgleich</button>` +
          `<button type="button" class="btn ghost small" data-tool-loadout-version-save="${esc(loadout.id)}">Version</button>` +
          `<button type="button" class="btn ghost small" data-tool-loadout-fav="${esc(loadout.id)}">${favorite ? 'Favorit lösen' : 'Favorit'}</button>` +
          `<button type="button" class="btn ghost small" data-tool-share-code="${esc(loadout.id)}">Teilen</button>` +
          `<button type="button" class="btn ghost small" data-tool-dim-json="${esc(loadout.id)}">DIM-JSON</button>` +
          `<button type="button" class="btn primary small" data-tool-apply="${esc(loadout.id)}">Anwenden</button>` +
        `</span></div>`;
    }).join('');
    let diffHtml = '';
    if (loadoutDiffId) {
      const loadout = loadouts.find((entry) => entry.id === loadoutDiffId);
      if (loadout) {
        const entries = allEntries();
        const versions = ((getCfg().bungie && getCfg().bungie.loadoutVersions) || {})[loadout.id] || [];
        const rows = (loadout.items || []).map((item) => {
          const found = entries.find((entry) => entry.item && entry.item.instanceId === item.instanceId);
          const status = !found
            ? 'fehlt'
            : found.kind === 'equipped' && found.owner === loadout.characterId
              ? 'angelegt'
              : locationLabel(found);
          return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name || 'Item')}</span>` +
            `<span class="inv-tool-meta ${status === 'fehlt' ? 'inv-tool-warn' : ''}">${esc(status)}</span></div>`;
        }).join('');
        diffHtml = `<div class="inv-tool-sub">Soll/Ist: ${esc(loadout.name)}</div>${rows}` +
          (versions.length
            ? `<div class="inv-tool-sub">Versionen (${versions.length})</div>` + versions.slice().reverse().map((version, index) =>
                `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(version.name || 'Version')}</span>` +
                `<span class="inv-tool-meta">${version.at ? esc(new Date(version.at).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : ''} · ${(version.items || []).length} Items</span>` +
                `<button type="button" class="btn ghost small" data-tool-loadout-version-diff="${esc(loadout.id)}:${versions.length - 1 - index}">Diff</button>` +
                `<button type="button" class="btn ghost small" data-tool-loadout-version-restore="${esc(loadout.id)}:${versions.length - 1 - index}">Laden</button></div>`
              ).join('')
            : '') +
          (() => {
            if (!loadoutVersionDiff || loadoutVersionDiff.id !== loadout.id) return '';
            const version = versions[loadoutVersionDiff.index];
            if (!version) return '';
            const current = (loadout.items || []).map((item) => String(item.instanceId || item.hash));
            const old = (version.items || []).map((item) => String(item.instanceId || item.hash));
            const added = (loadout.items || []).filter((item) => !old.includes(String(item.instanceId || item.hash))).map((item) => item.name || 'Item');
            const removed = (version.items || []).filter((item) => !current.includes(String(item.instanceId || item.hash))).map((item) => item.name || 'Item');
            return `<div class="inv-tool-sub">Diff: ${esc(version.name || 'Version')}</div>` +
              `<div class="inv-tool-row small"><span class="inv-tool-main">Neu</span><span class="inv-tool-meta">${esc(added.join(', ') || '—')}</span></div>` +
              `<div class="inv-tool-row small"><span class="inv-tool-main">Entfernt</span><span class="inv-tool-meta">${esc(removed.join(', ') || '—')}</span></div>` +
              `<div class="inv-tool-row small"><span class="inv-tool-main">Mods</span><span class="inv-tool-meta">${(loadout.mods || []).length} jetzt · ${(version.mods || []).length} damals</span></div>`;
          })() +
          `<div class="inv-tool-add"><button type="button" class="btn primary small" data-tool-apply="${esc(loadout.id)}">Wiederherstellen</button>` +
          `<button type="button" class="btn ghost small" data-tool-loadout-diff="">Schließen</button></div>`;
      }
    }
    return card('Loadout-Statistik', '⭐',
      `<div class="inv-tool-sub">Favoriten oben, danach meistgenutzte Loadouts.</div>${rows}${diffHtml}`,
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-loadout-editor>Loadout-Editor</button></span>`, 'wide');
  }

  function renderStatOptimizer() {
    const chars = (data && data.characters) || [];
    if (!chars.length) return card('Stat-Optimierer', '📊', '<span class="inv-tool-muted">Keine Charakterdaten.</span>');
    const character = optimizerCharacter();
    optimizerResult = computeOptimizer();
    const charOptions = chars.map((char) =>
      `<option value="${esc(char.id)}" ${character && char.id === character.id ? 'selected' : ''}>${esc(CLASS_NAMES[char.classType] || 'Hüter')}</option>`
    ).join('');
    const targetOptions = (selected) => ARMOR_STAT_DEFS.map(({ h, label }) =>
      `<option value="${h}" ${Number(selected) === h ? 'selected' : ''}>${esc(label)}</option>`
    ).join('');
    const resultHtml = optimizerResult
      ? optimizerResult.items.map((entry) => {
          const slot = ARMOR_SLOT_LABELS[Number(entry.item.bucket)] || 'Rüstung';
          const itemStats = optimizerItemStats(entry.item);
          const itemMeta = [entry.item.gearTier ? `T${entry.item.gearTier}` : '', entry.item.archetype ? entry.item.archetype.name : '', entry.item.setInfo ? entry.item.setInfo.name : ''].filter(Boolean).join(' · ');
          return `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(slot)}</span>` +
            `<span class="inv-tool-main">${esc(entry.item.name)}${itemMeta ? `<small class="inv-tool-muted"> ${esc(itemMeta)}</small>` : ''}</span>` +
            `<span class="inv-tool-meta">${esc(armorStatLabel(optimizerTarget1))} ${itemStats[optimizerTarget1] || 0} · ${esc(armorStatLabel(optimizerTarget2))} ${itemStats[optimizerTarget2] || 0}</span></div>`;
        }).join('') +
        `<div class="inv-tool-stats-grid">${ARMOR_STAT_DEFS.map(({ h, label }) => {
          const value = Math.min(ARMOR_STAT_MAX, optimizerResult.totals[h] || 0);
          const target = Math.min(ARMOR_STAT_MAX, Number(optimizerTarget1) === h ? Number(optimizerTarget1Value) || 0 : Number(optimizerTarget2) === h ? Number(optimizerTarget2Value) || 0 : 200);
          const missing = value < target ? `−${target - value} bis ${target}` : `${target} erreicht`;
          return `<div class="inv-tool-statline">` +
            `<span class="inv-tool-statline-label"><span>${esc(label)}</span></span>` +
            `<b>${value}</b>${armorStatMeter(value)}<small class="inv-tool-missing">${esc(missing)}</small></div>`;
        }).join('')}</div>` +
        `<div class="inv-tool-statlegend">Ziel: ${esc(armorStatLabel(optimizerTarget1))} ${Number(optimizerTarget1Value) || 0} · ${esc(armorStatLabel(optimizerTarget2))} ${Number(optimizerTarget2Value) || 0}</div>` +
        (optimizerResult.sets && optimizerResult.sets.some((set) => set.count >= 2)
          ? `<div class="inv-tool-statlegend"><strong>Set-Boni:</strong> ` + optimizerResult.sets.filter((set) => set.count >= 2).map((set) =>
              `${esc(set.name)} ${set.count}/5` + set.perks.map((perk) => ` · ${perk.count}er ${perk.active ? '✓' : '–'} ${esc(perk.name || '')}`).join('')
            ).join(' | ') + `</div>`
          : '') +
        `<div class="inv-tool-statlegend">Gesamt inkl. Fragmente und 5 Stat-Mods (+50), Basis-Roll ohne vorhandene Mods<br>` +
          `Mods: ${esc(armorStatLabel(optimizerTarget1))} +${Number(optimizerResult.mods[optimizerTarget1]) || 0} · ${esc(armorStatLabel(optimizerTarget2))} +${Number(optimizerResult.mods[optimizerTarget2]) || 0} · 0–200 (DIM)<br>` +
          `Restliche Mod-Punkte werden automatisch auf freie Stats verteilt.</div>` +
        (Number(optimizerResult.wasted) > 0
          ? `<div class="inv-tool-statlegend inv-tool-warn">${Number(optimizerResult.wasted)} Punkte verfallen – alle Stats sind bereits bei 100.</div>`
          : '') +
        `<div class="inv-tool-add"><button type="button" class="btn primary small" data-tool-save-optimizer>Als Loadout speichern</button>` +
          `<button type="button" class="btn ghost small" data-tool-share-build>Build-Karte (PNG)</button>` +
          `<button type="button" class="btn ghost small" data-tool-copy-build>Als Text kopieren</button></div>`
      : '<span class="inv-tool-muted">Keine vollständige Rüstung für diese Klasse gefunden.</span>';
    return card('Stat-Optimierer', '📊',
      `<div class="inv-tool-opt-fields">` +
        `<label>Charakter<select data-opt-char>${charOptions}</select></label>` +
        `<label>Ziel 1<select data-opt-target1>${targetOptions(optimizerTarget1)}</select></label>` +
        `<label>Wert 1<input type="number" min="0" max="200" step="10" data-opt-target1-value value="${Number(optimizerTarget1Value) || 0}"></label>` +
        `<label>Ziel 2<select data-opt-target2>${targetOptions(optimizerTarget2)}</select></label>` +
        `<label>Wert 2<input type="number" min="0" max="200" step="10" data-opt-target2-value value="${Number(optimizerTarget2Value) || 0}"></label>` +
        `<label class="inv-tool-check"><input type="checkbox" data-opt-prefer-sets ${optimizerPreferSets ? 'checked' : ''}> Set-Boni bevorzugen</label>` +
      `</div>${resultHtml}`, '', 'wide');
  }
  async function loadBungieStatus(forceCheck) {
    if (bungieStatusLoading) return;
    bungieStatusLoading = true;
    try {
      bungieStatus = await api.bungieOAuthStatus();
      if (forceCheck && typeof api.bungieConnectionCheck === 'function') {
        bungieCheck = await api.bungieConnectionCheck();
      }
    } catch (error) {
      bungieStatus = { ok: false, error: error.message || String(error) };
    } finally {
      bungieStatusLoading = false;
      if (host && !host.classList.contains('hidden')) render();
    }
  }

  function renderBungieStatus() {
    if (!bungieStatus && !bungieStatusLoading) loadBungieStatus(false);
    const status = bungieStatus || {};
    const rows = [
      ['API-Key', status.apiKeyStored ? (status.apiKeyReadable ? `gespeichert (${status.apiKeyLength} Zeichen)` : 'gespeichert, nicht lesbar – bitte neu eingeben') : 'fehlt'],
      ['Anmeldung', status.loggedIn ? `angemeldet${status.displayName && !streamerMode ? ` als ${status.displayName}` : ''}${status.publicClient ? ' (öffentliche App)' : ''}` : (status.tokenReadable === false ? 'gespeicherte Tokens nicht lesbar – bitte neu anmelden' : 'nicht angemeldet')],
      ['Client-Secret', status.hasClientSecret ? 'gesetzt (Refresh-Token aktiv)' : 'nicht gesetzt (Anmeldung läuft nach ~1 h ab)']
    ].map(([label, text]) => `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span><span class="inv-tool-main">${esc(text)}</span></div>`).join('');
    const checkRows = bungieCheck && Array.isArray(bungieCheck.steps)
      ? bungieCheck.steps.map((step) => `<div class="inv-tool-row small"><span class="inv-tool-main">${step.state === 'ok' ? '✓' : step.state === 'warn' ? '!' : '✗'} ${esc(step.label)}</span><span class="inv-tool-meta">${esc(step.hint || '')}</span></div>`).join('')
      : '';
    return card('Bungie-Status', '🛰', rows + (checkRows ? `<div class="inv-tool-sub">Verbindungsprüfung</div>${checkRows}` : '') +
      '<div class="inv-tool-muted">API-Key, Anmeldung und Scopes prüfen. Bei „nicht lesbar“ den Key bzw. die Anmeldung einmal neu setzen.</div>',
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-bungie-check ${bungieStatusLoading ? 'disabled' : ''}>Prüfen</button><button type="button" class="btn ghost small" data-tool-bungie-reload>Status</button></span>`);
  }

  function renderPower(compact = false) {
    if (!data) return card('Power & Infusion', '⚡', '<span class="inv-tool-muted">Keine Inventardaten.</span>');
    const entries = allEntries();
    const rows = (data.characters || []).map((character) => {
      const own = entries.filter((entry) => compatible(character, entry.item));
      const equipped = own.filter((entry) => entry.kind === 'equipped' && entry.owner === character.id);
      const slots = SLOTS.map((slot) => {
        const inSlot = own.filter((entry) => Number(entry.item.bucket) === slot.key);
        const bestEntry = inSlot.slice().sort((a, b) => itemPower(b.item) - itemPower(a.item))[0];
        const equippedItem = equipped.find((entry) => Number(entry.item.bucket) === slot.key);
        return { ...slot, best: bestEntry, equippedItem };
      });
      const equippedPowers = slots.map((slot) => (slot.equippedItem ? itemPower(slot.equippedItem.item) : 0)).filter((power) => power > 0);
      const bestPowers = slots.map((slot) => (slot.best ? itemPower(slot.best.item) : 0)).filter((power) => power > 0);
      const currentPower = equippedPowers.length
        ? Math.round(equippedPowers.reduce((sum, power) => sum + power, 0) / equippedPowers.length)
        : Number(character.light) || 0;
      const potentialPower = bestPowers.length
        ? Math.round(bestPowers.reduce((sum, power) => sum + power, 0) / bestPowers.length)
        : currentPower;
      const weakest = slots
        .filter((slot) => slot.equippedItem)
        .sort((a, b) => itemPower(a.equippedItem.item) - itemPower(b.equippedItem.item))[0];
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
      const rowsHtml = slots.map((slot) => {
        const currentItem = slot.equippedItem ? slot.equippedItem.item : null;
        const currentPower = currentItem ? itemPower(currentItem) : 0;
        const bestItem = slot.best ? slot.best.item : null;
        const bestPower = bestItem ? itemPower(bestItem) : 0;
        const delta = bestItem ? bestPower - currentPower : 0;
        const currentText = currentItem
          ? `${esc(currentItem.name)} · ${currentPower}`
          : '<span class="inv-tool-muted">— nicht angelegt</span>';
        const upgradeText = bestItem && delta > 0
          ? `${esc(bestItem.name)} · ${bestPower}`
          : '';
        return `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(slot.label)}</span>` +
          `<span class="inv-tool-main">${currentText}</span>` +
          `<span class="inv-tool-meta">${upgradeText ? `→ ${upgradeText}` : ''}</span>` +
          `<span class="inv-tool-delta ${delta > 0 ? 'up' : ''}">${delta > 0 ? `+${delta}` : ''}</span></div>`;
      }).join('');
      const fodderHtml = fodder.length
        ? `<div class="inv-tool-sub">Infusions-Futter für das aktuelle Loadout</div>` + fodder.slice(0, 4).map((entry) =>
            `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(entry.item.name)}</span>` +
            `<span class="inv-tool-meta">${esc(entry.slot)} · ${itemPower(entry.item)} (+${entry.gain}) · ${esc(locationLabel(entry))}</span></div>`
          ).join('')
        : '<div class="inv-tool-muted">Kein besseres Futter für das aktuelle Loadout gefunden.</div>';
      const details = compact
        ? `<details class="inv-tool-details"><summary>Alle Slots &amp; Infusions-Futter</summary>${rowsHtml}${fodderHtml}</details>`
        : `${rowsHtml}${fodderHtml}`;
      const potential = potentialPower > currentPower ? ` · Potenzial ${potentialPower}` : '';
      return `<div class="inv-tool-char">` +
        `<div class="inv-tool-char-head"><strong>${esc(CLASS_NAMES[character.classType] || 'Hüter')}</strong>` +
        `<span>Aktuell ${currentPower} Licht${potential}</span>` +
        (weakest ? `<span class="inv-tool-warn">Schwächster Slot: ${esc(weakest.label)} (${itemPower(weakest.equippedItem.item)})</span>` : '') +
        `</div>${details}</div>`;
    }).join('');
    return card('Power & Infusion', '⚡', rows || '<span class="inv-tool-muted">Keine Charaktere.</span>', '', 'wide');
  }

  function renderMaterials() {
    const list = (data && (data.materials || data.currencies)) || [];
    const ordered = list.slice().sort((a, b) => {
      const rank = (entry) => {
        const name = String(entry.name || '');
        const index = MATERIAL_ORDER.findIndex((rx) => rx.test(name));
        return index < 0 ? 99 : index;
      };
      return rank(a) - rank(b) || Number(b.quantity) - Number(a.quantity);
    });
    if (!ordered.length) return card('Materialien', '🧪', '<span class="inv-tool-muted">Keine Währungsdaten.</span>');
    const chips = ordered.slice(0, 14).map((entry) =>
      `<div class="inv-tool-mat" title="${esc(entry.name)}">` +
        (entry.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(entry.icon)}" alt="">` : '') +
        `<span class="inv-tool-mat-value">${fmt(entry.quantity)}</span>` +
        `<span class="inv-tool-mat-name">${esc(entry.name)}</span>` +
      `</div>`
    ).join('');
    const quantityOf = (rx) => {
      const hit = ordered.find((entry) => rx.test(String(entry.name || '')));
      return hit ? Number(hit.quantity) || 0 : 0;
    };
    const hints = [];
    if (quantityOf(/kern|core/i) >= 10) hints.push('1 Prisma möglich (10 Kerne)');
    if (quantityOf(/prisma|prism/i) >= 10) hints.push('1 Shard möglich (10 Prismen)');
    if (quantityOf(/splitter|shard/i) >= 400) hints.push('1 Alloy möglich (400 Splitter)');
    return card('Materialien', '🧪', `<div class="inv-tool-mats">${chips}</div>` +
      `<div class="inv-tool-muted">Faustregel: 1 Prisma = 10 Kerne · 1 Shard = 10 Prismen.</div>` +
      (hints.length ? `<div class="inv-tool-muted">${hints.map((hint) => esc(hint)).join(' · ')}</div>` : ''));
  }

  function nextResetLabel() {
    try {
      const reset = nextWeeklyReset(new Date());
      return formatDuration(reset.getTime() - Date.now());
    } catch (error) {
      return '—';
    }
  }

  function resetClock(date) {
    try {
      return date.toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch (error) {
      return '—';
    }
  }

  function renderWeekTimers() {
    const now = new Date();
    const weekly = nextWeeklyReset(now);
    const daily = nextDailyReset(now);
    const weeklyMs = weekly.getTime() - now.getTime();
    const dailyMs = daily.getTime() - now.getTime();
    const xur = xurState;
    const xurActive = Boolean(xur && xur.active && xur.ok !== false);
    const expiring = [];
    if (weeklyMs <= 24 * 3600000) expiring.push('Wochenreset');
    if (dailyMs <= 6 * 3600000) expiring.push('Daily-Reset');
    if (xurActive && weeklyMs <= 24 * 3600000) expiring.push('Xûr');
    return `<div class="week-timers">` +
      `<div class="week-timer"><span>Wochenreset</span><b>${esc(formatDuration(weeklyMs))}</b><small>${esc(resetClock(weekly))}</small></div>` +
      `<div class="week-timer"><span>Daily-Reset</span><b>${esc(formatDuration(dailyMs))}</b><small>${esc(resetClock(daily))}</small></div>` +
      `<div class="week-timer${xurActive ? ' on' : ''}"><span>Xûr</span><b>${xurLoading ? 'lädt …' : !xur ? '—' : xur.ok === false ? 'Fehler' : xurActive ? 'aktiv' : 'weg'}</b><small>${xurActive ? 'bis zum Weekly Reset' : 'Freitag bis Dienstag'}</small></div>` +
      `<div class="week-timer${expiring.length ? ' warn' : ''}"><span>Läuft bald ab</span><b>${expiring.length ? esc(expiring.join(' · ')) : 'nichts'}</b><small>${expiring.length ? 'jetzt erledigen' : 'alles im grünen Bereich'}</small></div>` +
    `</div>`;
  }

  function weekSummaryText() {
    const lines = [`Reset: ${nextResetLabel()}`];
    const xur = xurState;
    lines.push(`Xûr: ${!xur ? 'nicht geladen' : xur.ok === false ? 'Fehler' : xur.active ? 'aktiv' : 'nicht da'}`);
    const checklist = ((getCfg().checklist && getCfg().checklist.items) || []);
    const done = checklist.filter((item) => item.done).length;
    lines.push(`Checkliste: ${done}/${checklist.length} erledigt`);
    const open = checklist.filter((item) => !item.done && item.group !== 'own').slice(0, 6);
    if (open.length) lines.push(`Offen: ${open.map((item) => item.text).join(' · ')}`);
    for (const character of (data && data.characters) || []) {
      const pm = ((data.postmaster || {})[character.id] || []).length;
      lines.push(`${CLASS_NAMES[character.classType] || 'Hüter'}: ${character.light || 0} Licht · Poststelle ${pm}/21`);
    }
    const milestones = (milestonesState && milestonesState.items) || [];
    if (milestones.length) lines.push(`Aktionen: ${milestones.slice(0, 6).map((entry) => entry.name).join(', ')}`);
    return lines.join('\n');
  }

  function addActivityReminder(name) {
    const clean = String(name || '').slice(0, 60).trim();
    if (!clean) return;
    const reset = nextWeeklyReset();
    const time = `${String(reset.getHours()).padStart(2, '0')}:${String(reset.getMinutes()).padStart(2, '0')}`;
    const list = (((getCfg().reminders && getCfg().reminders.list) || [])).slice();
    list.push({ id: 'wr-' + Date.now().toString(36), text: `Wochenreset: ${clean}`.slice(0, 80), time, repeat: 'weekly', enabled: true });
    setConfig({ reminders: { list } });
    toast(`Erinnerung für „${clean}“ gesetzt.`, 'success', 2000);
  }

  function renderWeekOverview() {
    const xur = xurState;
    const xurText = !xur ? 'nicht geladen' : xur.ok === false ? 'Fehler' : xur.active ? 'aktiv' : 'nicht da';
    const activities = { ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) };
    const activityRows = Object.values(activities).slice(0, 4).map((activity) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(activity.name || 'Aktivität')}</span>` +
      `<span class="inv-tool-meta">${esc(activity.modeName || '')}</span></div>`
    ).join('');
    const milestones = ((milestonesState && milestonesState.items) || []);
    const groups = [
      ['Großmeister / Nightfall', /großmeister|grandmaster|nightfall|nf\b/i],
      ['Raid', /raid|dsc|vow|kf\b|root|salvation|vog|crota|wish/i],
      ['Dungeon', /dungeon|unterwelt|duality|spire|ghost|warlord|sundered/i],
      ['Prüfungen / Trials', /prüfung|trials|osiris/i],
      ['Eisenbanner', /eisenbanner|iron banner/i],
      ['Saison / Challenges', /saison|season|challenge/i]
    ];
    const groupRows = groups.map(([label, pattern]) => {
      const names = milestones.map((entry) => String(entry.name || '')).filter((name) => pattern.test(name));
      if (!names.length) return '';
      return `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span>` +
        `<span class="inv-tool-main">${esc([...new Set(names)].slice(0, 4).join(', '))}${names.length > 4 ? ` +${names.length - 4}` : ''}</span>` +
        `<button type="button" class="btn ghost small" data-tool-activity-remind="${esc(names[0])}">Erinnern</button></div>`;
    }).filter(Boolean).join('');
    return card('Wochenübersicht', '📌',
      `<div class="inv-tool-row"><span class="inv-tool-slot">Reset</span><span class="inv-tool-main">${esc(nextResetLabel())}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Xûr</span><span class="inv-tool-main">${esc(xurText)}</span></div>` +
      (groupRows ? `<div class="inv-tool-sub">Aktivitäten diese Woche</div>${groupRows}` : '') +
      (activityRows ? `<div class="inv-tool-sub">Aktuell</div>${activityRows}` : '') +
      `<div class="inv-tool-muted">Kopiert eine kurze Zusammenfassung für Clan/Discord.</div>`,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-week-auto>Auto-Abhaken</button><button type="button" class="btn ghost small" data-tool-week-template>Wochenvorlage</button><button type="button" class="btn ghost small" data-tool-postmaster-filter>Materialien/Engramme abholen</button><button type="button" class="btn ghost small" data-tool-week-copy>Kopieren</button></span>');
  }

  function postmasterSeenMap() {
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2tool.postmasterSeen') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (error) { return {}; }
  }

  function updatePostmasterSeen() {
    const seen = postmasterSeenMap();
    const pm = (data && data.postmaster) || {};
    const cutoff = Date.now() - 45 * 86400000;
    let changed = false;
    for (const [owner, list] of Object.entries(pm)) {
      for (const item of list || []) {
        if (!item) continue;
        const key = `${owner}:${item.instanceId || item.hash}`;
        if (!seen[key]) { seen[key] = Date.now(); changed = true; }
      }
    }
    for (const key of Object.keys(seen)) if (Number(seen[key]) < cutoff) { delete seen[key]; changed = true; }
    if (changed) {
      try { window.localStorage.setItem('d2tool.postmasterSeen', JSON.stringify(seen)); } catch (error) { /* egal */ }
    }
    return seen;
  }

  function renderPostmasterSafety() {
    const pm = (data && data.postmaster) || {};
    const lists = Object.values(pm).filter(Array.isArray);
    const count = lists.reduce((sum, list) => sum + list.length, 0);
    const godrollCount = lists.reduce((sum, list) => sum + list.filter((item) => item && (item.godRoll || item.nearGodRoll)).length, 0);
    const seen = updatePostmasterSeen();
    const oldest = [];
    for (const [owner, list] of Object.entries(pm)) {
      for (const item of list || []) {
        if (!item) continue;
        const key = `${owner}:${item.instanceId || item.hash}`;
        const first = Number(seen[key]) || Date.now();
        oldest.push({ name: item.name || 'Item', days: Math.max(0, Math.floor((Date.now() - first) / 86400000)), godRoll: Boolean(item.godRoll || item.nearGodRoll) });
      }
    }
    oldest.sort((a, b) => b.days - a.days);
    const ageRows = oldest.slice(0, 5).map((item) =>
      `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name)}${item.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : ''}</span>` +
      `<span class="inv-tool-meta ${item.days >= 7 ? 'inv-tool-warn' : ''}">${item.days === 0 ? 'heute gesehen' : `${item.days} Tag${item.days === 1 ? '' : 'e'} alt`}</span></div>`
    ).join('');
    const capacity = count >= 21 ? 'voll – älteste zuerst einsammeln' : count >= 18 ? `fast voll (${21 - count} Platz)` : '';
    return card('Poststelle sicher leeren', '📬',
      `<div class="inv-tool-muted">${count ? `${count} Items in der Poststelle${godrollCount ? `, davon ${godrollCount} Godroll/Near-Godroll` : ''}${capacity ? ` · ${capacity}` : ''}.` : 'Poststelle ist leer oder noch nicht geladen.'} „Sicher“ sammelt nur Nicht-Waffen ein. „Godrolls behalten“ lässt Waffen mit Godroll/Near-Godroll im Postfach und sammelt den Rest.</div>` +
      (ageRows ? `<div class="inv-tool-sub">Älteste zuerst</div>${ageRows}` : '') +
      `<div class="inv-tool-add"><button type="button" class="btn primary small" data-tool-pm-safe>Sicher einsammeln</button>` +
      `<button type="button" class="btn ghost small" data-tool-pm-godrolls>Godrolls behalten${godrollCount ? ` (${godrollCount})` : ''}</button>` +
      `<button type="button" class="btn ghost small" data-tool-pm-all>Alles einsammeln</button></div>`, '');
  }

  function renderSnapshotDiff() {
    let diff = null;
    try { diff = JSON.parse(window.localStorage.getItem('d2inv.snapshotDiff') || 'null'); } catch (error) { diff = null; }
    if (!diff) return card('Snapshot-Diff', '🧾', '<span class="inv-tool-muted">Noch kein Vergleich – Inventar einmal aktualisieren.</span>');
    const at = diff.at ? new Date(diff.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
    const list = (items, formatter) => (items || []).length
      ? `<div class="inv-tool-muted">${items.slice(0, 6).map(formatter).join(' · ')}</div>`
      : '';
    const added = list(diff.addedItems, (item) => `<button type="button" class="btn ghost small" data-tool-search="${esc(`name:"${item.name}"`)}">${esc(item.name)}</button>`);
    const removed = list(diff.removedItems, (item) => `${esc(item.name)} (${esc(item.location || 'weg')})`);
    const moved = list(diff.movedItems, (item) => `${esc(item.name)}: ${esc(item.from)} → ${esc(item.to)}`);
    const changed = list(diff.changedItems, (item) => `${esc(item.name)}${item.fromPower ? ` · ${item.fromPower} → ${item.toPower}` : ''}${item.perksChanged ? ' · Perks' : ''}`);
    return card('Snapshot-Diff', '🧾',
      `<div class="inv-tool-row"><span class="inv-tool-main">Neu</span><span class="inv-tool-meta">${Number(diff.added) || 0} Items · ${Number(diff.godrollAdded) || 0} Godrolls</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Entfernt</span><span class="inv-tool-meta">${Number(diff.removed) || 0} Items · ${Number(diff.godrollRemoved) || 0} Godrolls</span></div>` +
      (added ? `<div class="inv-tool-sub">Neu im Snapshot</div>${added}` : '') +
      (removed ? `<div class="inv-tool-sub">Nicht mehr vorhanden</div>${removed}` : '') +
      (moved ? `<div class="inv-tool-sub">Verschoben</div>${moved}` : '') +
      (changed ? `<div class="inv-tool-sub">Geändert</div>${changed}` : '') +
      `<div class="inv-tool-muted">Letzte Aktualisierung: ${at}. Detailansicht speichert nur die letzten 12 Änderungen je Kategorie.</div>`, '', 'wide');
  }

  const WEEKLY_TEMPLATE = [
    { key: 'featured-raid', group: 'must', text: 'Featured-Raid: Rotation prüfen und Encounter farmen', hint: 'Zwei Raids sind pro Woche featured und farmbar. Master-Challenges geben Adept-Waffen.' },
    { key: 'featured-dungeon', group: 'must', text: 'Featured-Dungeon: Boss farmen und Exotic-Chance nutzen', hint: 'Zwei Dungeons sind pro Woche featured. Checkpoints erlauben einzelne Bosse.' },
    { key: 'gm', group: 'must', text: 'Grandmaster Vanguard Alert: Wochenwaffe holen', hint: 'Höchste Priorität für Tier-5-Waffen, Adept-Beute und Ascendant Shards.' },
    { key: 'seasonal', group: 'must', text: 'Saisonale Weekly Challenges und Seasonal-Hub abschließen', hint: 'Weekly Objectives und Reward Track resetten dienstags.' },
    { key: 'trials', group: 'rec', text: 'Prüfungen von Osiris am Wochenende spielen', hint: 'Adept-Waffen und Lighthouse-Belohnungen. Pausiert in Eisenbanner-Wochen.' },
    { key: 'ironbanner', group: 'rec', text: 'Eisenbanner-Challenges abschließen (falls aktiv)', hint: 'Tägliche Challenges bis Freitag; Rangaufstieg und fokussierte Engramme.' },
    { key: 'vanguard', group: 'rec', text: 'Vorhut-Ops Weekly Challenge abschließen', hint: 'Zavala-Rangaufstieg und zusätzliche Vanguard-Engramme.' },
    { key: 'crucible', group: 'rec', text: 'Schmelztiegel Weekly Challenge abschließen', hint: 'Shaxx-Rangaufstieg und PvP-Engramme.' },
    { key: 'gambit', group: 'rec', text: 'Gambit Weekly Challenge abschließen', hint: 'Drifter-Rangaufstieg und Gambit-Engramme.' },
    { key: 'xur', group: 'rec', text: 'Xûr prüfen (Freitag bis Dienstag)', hint: 'Exotische Waffe, Rüstung und Strange Coins. Bestand wechselt wöchentlich.' },
    { key: 'ada', group: 'rec', text: 'Ada-1: Shader und Threader-Bounties abholen', hint: 'Sechs Shader pro Woche und eine neue Threader-Bounty pro Klasse.' },
    { key: 'clan', group: 'rec', text: 'Clan-Engramme und Clan-XP abholen', hint: 'Wöchentliche Clan-Engramme und XP-Cap resetten dienstags.' },
    { key: 'destination', group: 'rec', text: 'Destination-Powerful/Pinnacle-Quellen abhaken', hint: 'Wöchentliche Ziele und verlorene Sektoren auf den Zielorten.' },
    { key: 'director', group: 'rec', text: 'Raid-/Dungeon-Director-Challenge und Deepsight-Truhe', hint: 'Wöchentliche Bonusbeute; Deepsight-Truhe für gezielte Red-Border.' },
    { key: 'seasonvendor', group: 'rec', text: 'Saisonvendor: Fokussierung und Red-Border prüfen', hint: 'Fokussierte Engramme und wöchentliche Kauf-Limits.' },
    { key: 'pantheon', group: 'rec', text: 'Pantheon: Featured Bosse prüfen', hint: 'Zwei Bosse pro Woche; nur relevant, wenn Pantheon aktiv ist.' },
    { key: 'exoticmission', group: 'opt', text: 'Exotic-Mission-Rotator spielen', hint: 'Wöchentliche Mission für Waffe, Katalysator oder Pattern.' },
    { key: 'lost-sector', group: 'opt', text: 'Master Lost Sector für Tier-5-Zielort-Rüstung', hint: 'Gezielte Rüstungsslot-Farm. Postfach vorher freiräumen.' },
    { key: 'title', group: 'opt', text: 'Titel- oder Pattern-Ziel verfolgen', hint: 'Restzeit für langfristige Sammlungen und Triumphs.' },
    { key: 'postmaster', group: 'opt', text: 'Postfach leeren', hint: 'Platz für Beute schaffen. Godrolls behalten.' },
    { key: 'build', group: 'opt', text: 'Build und Loadout für die Wochenaktivitäten prüfen', hint: 'Champion-Abdeckung, Surges und DPS-Waffe anpassen.' }
  ];
  const WEEK_GROUPS = [
    ['must', 'Muss diese Woche', '●'],
    ['rec', 'Empfohlen', '◆'],
    ['opt', 'Optional', '○'],
    ['own', 'Eigene Punkte', '✎']
  ];

  const WEEKLY_MINUTES = {
    'featured-raid': 45, 'featured-dungeon': 40, gm: 60, seasonal: 30, trials: 45, ironbanner: 40,
    vanguard: 25, crucible: 25, gambit: 25, xur: 10, ada: 10, clan: 10, destination: 30,
    director: 20, seasonvendor: 15
  };
  for (const entry of WEEKLY_TEMPLATE) entry.minutes = WEEKLY_MINUTES[entry.key] || 20;

  function weeklyChecklistItems() {
    const week = nextWeekResetDate().toISOString().slice(0, 10);
    const existing = ((getCfg().checklist && getCfg().checklist.items) || []).slice();
    const autoByKey = new Map();
    const legacyIds = new Set();
    for (const item of existing) {
      if (item && item.auto && item.week === week && item.autoKey) {
        autoByKey.set(item.autoKey, item);
        continue;
      }
      if (item && !item.auto && String(item.id || '').startsWith('w-')) {
        const template = WEEKLY_TEMPLATE.find((entry) => entry.text === item.text || entry.text.slice(0, 80) === item.text || String(item.id || '').endsWith(`-${entry.key}`));
        if (template) {
          autoByKey.set(template.key, { ...item, auto: true, autoKey: template.key, week, group: template.group, hint: template.hint });
          legacyIds.add(item.id);
        }
      }
    }
    const autoItems = WEEKLY_TEMPLATE.map((template) => autoByKey.get(template.key) || {
      id: `w-${week}-${template.key}`,
      text: template.text,
      hint: template.hint,
      group: template.group,
      auto: true,
      autoKey: template.key,
      week,
      done: false
    });
    const customItems = existing.filter((item) => item && !item.auto && !legacyIds.has(item.id)).map((item) => ({ ...item, group: item.group || 'own' }));
    const nowMs = Date.now();
    const dailyBoundary = nextDailyReset(new Date()).getTime() - 24 * 3600000;
    const weeklyBoundary = nextWeeklyReset(new Date()).getTime() - 7 * 24 * 3600000;
    const recurring = customItems.map((item) => {
      if (!item.done || !item.repeat) return item;
      const last = Number(item.doneAt) || 0;
      const boundary = item.repeat === 'daily' ? dailyBoundary : item.repeat === 'weekly' ? weeklyBoundary : 0;
      if (!boundary || last >= boundary) return item;
      return { ...item, done: false, doneAt: 0 };
    });
    const next = autoItems.concat(recurring).map((item) => (
      item.auto && !item.minutes
        ? { ...item, minutes: (WEEKLY_TEMPLATE.find((entry) => entry.key === item.autoKey) || {}).minutes || 20 }
        : item
    ));
    const changed = next.length !== existing.length || next.some((item, index) => {
      const previous = existing[index] || {};
      return previous.id !== item.id || previous.done !== item.done || previous.group !== item.group || previous.text !== item.text || previous.hint !== item.hint || previous.auto !== item.auto || previous.autoKey !== item.autoKey;
    });
    if (changed) setConfig({ checklist: { items: next } });
    return next;
  }

  function resetWeeklyTemplate() {
    const week = nextWeekResetDate().toISOString().slice(0, 10);
    const items = ((getCfg().checklist && getCfg().checklist.items) || []).map((item) =>
      item && item.auto && item.week === week ? { ...item, done: false } : item
    );
    setConfig({ checklist: { items } });
    render();
    toast('Wochenvorlage zurückgesetzt.', 'info', 1800);
  }

  async function autoCheckWeek() {
    if (milestonesLoading) {
      weeklyAutoPending = true;
      toast('Bungie-Aktionen werden geladen – Automatik läuft danach.', 'info', 2400);
      return;
    }
    if (!milestonesState) {
      weeklyAutoPending = true;
      loadMilestones();
      toast('Bungie-Aktionen werden geladen – Automatik läuft danach.', 'info', 2400);
      return;
    }
    const milestones = ((milestonesState && milestonesState.items) || []).map((item) => String(item.name || '').toLowerCase());
    const activities = Object.values({ ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) })
      .map((activity) => `${activity.name || ''} ${activity.modeName || ''}`.toLowerCase());
    const names = milestones.concat(activities);
    const raidNames = /crotas ende|schwur des schülers|gläserne kammer|garten der erlösung|königsfall|letzter wunsch|rand der erlösung|tiefsteinkrypta|wurzel der albträume|salvation|vault of glass|king'?s fall|deep stone|root of nightmares|vow of the disciple|crota|last wish|garden of salvation/i;
    const dungeonNames = /prophezeiung|duality|spire of the watcher|grube der ketzerei|grasp of avarice|geister der tiefe|warlord|vesper|sundered|equilibrium|zersplitterte thron|shattered throne|pit of heresy/i;
    const autoMatch = {
      'featured-raid': (name) => /raid/i.test(name) || raidNames.test(name),
      'featured-dungeon': (name) => /dungeon|verlies/i.test(name) || dungeonNames.test(name),
      gm: (name) => /nightfall|grandmaster|dämmerung|\bgm\b/i.test(name),
      trials: (name) => /trials|prüfung|osiris/i.test(name),
      ironbanner: (name) => /iron banner|eisenbanner/i.test(name),
      vanguard: (name) => /strike|vanguard|vorhut/i.test(name),
      crucible: (name) => /crucible|schmelztiegel|\bpvp\b/i.test(name),
      gambit: (name) => /gambit/i.test(name),
      xur: (name) => /xûr|xur/i.test(name),
      ada: (name) => /ada-1/i.test(name),
      clan: (name) => /clan/i.test(name),
      destination: (name) => /destination|patrouille|zielort|erkund/i.test(name),
      director: (name) => /raid/i.test(name) || raidNames.test(name) || /dungeon|verlies/i.test(name) || dungeonNames.test(name),
      seasonvendor: (name) => /saison|season|episode/i.test(name),
      pantheon: (name) => /pantheon/i.test(name),
      exoticmission: (name) => /exotic|mission/i.test(name),
      'lost-sector': (name) => /lost sector|verlorener sektor/i.test(name),
      seasonal: (name) => /saison|season|episode|akt\s|aktivität|ritual/i.test(name),
      title: (name) => /titel|seal|siegel/i.test(name),
      postmaster: (name) => /poststelle|postmaster/i.test(name),
      build: (name) => /build|loadout/i.test(name)
    };
    let marked = 0;
    const items = ((getCfg().checklist && getCfg().checklist.items) || []).map((item) => {
      if (item.done) return item;
      const text = String(item.text || '').toLowerCase();
      const matcher = item.auto ? autoMatch[item.autoKey] : null;
      const matched = matcher
        ? names.some((name) => matcher(name)) || (item.autoKey === 'xur' && xurState && xurState.active === true)
        : (text && names.some((name) => name.includes(text) || text.includes(name)));
      if (!matched) return item;
      marked += 1;
      return { ...item, done: true };
    });
    setConfig({ checklist: { items } });
    toast(marked ? `${marked} Wochenziele automatisch abgehakt.` : 'Keine passenden erkannten Aktionen gefunden.', marked ? 'success' : 'info', 2400);
    render();
  }

  function renderWeeklyLive() {
    const milestones = (milestonesState && milestonesState.items) || [];
    const activities = Object.values({ ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) });
    const rows = milestones.slice(0, 8).map((entry) =>
      `<div class="week-live-row"><span class="week-live-icon">◈</span>` +
        `<span class="week-live-copy"><strong>${esc(entry.name)}</strong><small>${entry.quests ? `${entry.quests} Quests` : 'Wochenaktion'}</small></span>` +
        `<button type="button" class="btn ghost small" data-tool-activity-remind="${esc(entry.name)}">Erinnern</button></div>`
    ).join('');
    const activityRows = activities.slice(0, 3).map((activity) =>
      `<div class="week-live-row"><span class="week-live-icon">▶</span><span class="week-live-copy"><strong>${esc(activity.name || 'Aktivität')}</strong><small>${esc(activity.modeName || 'läuft gerade')}</small></span></div>`
    ).join('');
    const body = milestonesState && milestonesState.ok === false
      ? `<span class="inv-tool-warn">${esc(milestonesState.error || 'Aktionen nicht verfügbar.')}</span>`
      : (rows || (milestonesState ? '<span class="inv-tool-muted">Derzeit keine aktiven Aktionen gemeldet.</span>' : '<span class="inv-tool-muted">Bungie-Aktionen laden, um die Wochenliste zu ergänzen.</span>'));
    return `<section class="week-live">` +
      `<header><div><span class="week-live-kicker">Live</span><h3>Erkannte Wochen-Aktionen</h3></div>` +
        `<button type="button" class="btn ghost small" data-tool-milestones ${milestonesLoading ? 'disabled' : ''}>${milestonesLoading ? 'Lädt …' : 'Aktionen laden'}</button>` +
      `</header>` +
      `${body}${activityRows ? `<div class="week-live-sub">Aktuell im Spiel</div>${activityRows}` : ''}` +
    `</section>`;
  }

  // „Was fehlt diese Woche?“: offene Pflichtpunkte, Materialziele,
  // Wunschrolls bei Händlern, Xûr und Postfach in einer Übersicht.
  function renderWeekMissing() {
    const items = weeklyChecklistItems();
    const openMust = items.filter((item) => item.group === 'must' && !item.done);
    const cfg = getCfg();
    const materialGoals = cfg.bungie && cfg.bungie.materialGoals && typeof cfg.bungie.materialGoals === 'object' ? cfg.bungie.materialGoals : {};
    const missingMaterials = [];
    for (const [hash, target] of Object.entries(materialGoals)) {
      const material = ((data && data.materials) || []).find((entry) => Number(entry.hash) === Number(hash));
      if (!material) continue;
      const need = Number(target) - Number(material.quantity);
      if (need > 0) missingMaterials.push({ name: material.name, need, icon: material.icon });
    }
    const wishOffers = [];
    for (const group of (allVendorsState && allVendorsState.groups) || []) {
      for (const vendor of group.vendors || []) {
        for (const item of vendor.items || []) {
          if (!isOwnedHash(item.hash) && (item.godRoll || item.nearGodRoll)) wishOffers.push({ item, vendor });
        }
      }
    }
    const postmaster = Object.values((data && data.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    const rows = [];
    for (const item of openMust.slice(0, 4)) rows.push({ tone: 'must', icon: '◆', title: item.text, detail: 'Pflichtpunkt offen' });
    for (const material of missingMaterials.slice(0, 3)) rows.push({ tone: 'mat', icon: '◈', title: `${material.name}: ${fmt(material.need)} fehlen`, detail: 'Materialziel' });
    for (const entry of wishOffers.slice(0, 3)) rows.push({ tone: 'wish', icon: '★', title: entry.item.name, detail: `${entry.vendor.name}${entry.item.godRoll ? ' · Wunschroll' : ' · Fast-Wunschroll'}` });
    if (xurState && xurState.active) {
      const hits = (xurState.items || []).filter((item) => item.godRoll || item.nearGodRoll).length;
      if (hits) rows.push({ tone: 'xur', icon: '🛒', title: `${hits} Xûr-Wunschtreffer`, detail: 'Xûr ist aktiv' });
    }
    if (postmaster >= 10) rows.push({ tone: 'post', icon: '📦', title: `Postfach: ${postmaster} Gegenstände`, detail: 'Platz schaffen' });
    const list = rows.length
      ? rows.map((row) => `<div class="week-missing-row ${row.tone}"><span>${row.icon}</span><div><strong>${esc(row.title)}</strong><small>${esc(row.detail)}</small></div></div>`).join('')
      : '<div class="week-missing-ok">Alles Wichtige für diese Woche ist erledigt.</div>';
    return `<section class="week-missing"><header><div><span class="week-kicker">Fokus</span><h3>Was fehlt diese Woche?</h3></div>` +
      `<span class="week-missing-count">${rows.length} offen</span></header>${list}</section>`;
  }

  function renderWeekSources() {
    const sources = [
      { label: 'Bungie Weekly Reset', url: 'https://www.bungie.net/7/en/News' },
      { label: 'TodayInDestiny', url: 'https://www.todayindestiny.com/' },
      { label: 'Light.gg Rotation', url: 'https://www.light.gg/' }
    ];
    return `<details class="week-sources"><summary>Rotationsquellen & Datenstand</summary>` +
      `<div class="week-source-list">${sources.map((source) => `<button type="button" class="btn ghost small" data-week-source-link="${esc(source.url)}">${esc(source.label)}</button>`).join('')}</div>` +
      `<small>Vorlage: LFCarry Weekly Checklist, Bungie Ritual Reset Guide und SenseOS Reset Guide (Nov 2026). Zeiten werden lokal aus dem Bungie-Reset berechnet.</small>` +
    `</details>`;
  }

  function renderWeekPage() {
    const items = weeklyChecklistItems();
    const total = items.length;
    const done = items.filter((item) => item.done).length;
    const mustItems = items.filter((item) => item.group === 'must');
    const mustDone = mustItems.filter((item) => item.done).length;
    const percent = total ? Math.round(done / total * 100) : 0;
    const query = weekCheckSearch.trim().toLocaleLowerCase('de');
    const visible = items.filter((item) => {
      if (weekCheckView !== 'all' && item.group !== weekCheckView) return false;
      if (weekCharFilter && item.char && String(item.char) !== weekCharFilter) return false;
      if (weekMinutesFilter && item.auto && Number(item.minutes || 0) > weekMinutesFilter) return false;
      if (!query) return true;
      return `${item.text || ''} ${item.hint || ''}`.toLocaleLowerCase('de').includes(query);
    });
    const viewTabs = [['all', 'Alle'], ...WEEK_GROUPS.map(([key, label]) => [key, label])];
    const groups = WEEK_GROUPS.map(([key, label, icon]) => {
      const allGroup = items.filter((item) => (item.group || 'own') === key);
      if (weekCheckView !== 'all' && weekCheckView !== key) return '';
      const groupItems = visible.filter((item) => (item.group || 'own') === key);
      const groupDone = allGroup.filter((item) => item.done).length;
      const groupPercent = allGroup.length ? Math.round(groupDone / allGroup.length * 100) : 0;
      const itemHtml = groupItems.map((item) =>
        `<div class="week-item${item.done ? ' done' : ''}">` +
          `<input type="checkbox" id="week-${esc(item.id)}" data-tool-check="${esc(item.id)}" ${item.done ? 'checked' : ''}>` +
          `<label for="week-${esc(item.id)}"><strong>${esc(item.text)}</strong>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}</label>` +
          `${item.auto ? `<span class="week-auto" title="Aus der Wochenvorlage">Auto</span>` : `<span class="week-auto own">Eigen</span>`}` +
        `</div>`
      ).join('');
      const addHtml = key === 'own'
        ? `<div class="week-add"><input type="text" data-tool-check-input placeholder="Eigener Punkt, z. B. Raid-Loot Titan" maxlength="80">` +
          `<select data-tool-check-repeat><option value="">einmalig</option><option value="weekly">wöchentlich</option><option value="daily">täglich</option></select>` +
          `<button type="button" class="btn ghost small" data-tool-check-add>Hinzufügen</button></div>`
        : '';
      return `<section class="week-group week-group-${key}">` +
        `<header><span class="week-group-icon">${icon}</span><strong>${esc(label)}</strong>` +
          `<span class="week-group-progress"><i style="width:${groupPercent}%"></i></span>` +
          `<b>${groupDone}/${allGroup.length}</b></header>` +
        (itemHtml || (key === 'own' ? '' : '<div class="week-empty">Keine Punkte in dieser Gruppe.</div>')) +
        addHtml +
      `</section>`;
    }).join('');
    const xur = xurState;
    const xurText = xurLoading ? 'lädt …' : !xur ? '—' : xur.ok === false ? 'Fehler' : xur.active ? 'aktiv' : 'weg';
    const postmaster = Object.values((data && data.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    return `<section class="week-page">` +
      `<header class="week-hero"><div class="week-hero-copy"><span class="week-kicker">Wochenplan</span>` +
        `<h2>Wochen-Checkliste</h2><p>Featured-Rotation, Grandmaster, Rituale und eigene Ziele – auf einen Blick.</p></div>` +
        `<div class="week-hero-actions"><button type="button" class="btn primary small" data-tool-week-auto>Auto-Abhaken</button>` +
          `<button type="button" class="btn ghost small" data-tool-week-reset>Vorlage zurücksetzen</button>` +
          `<button type="button" class="btn ghost small" data-tool-week-carry>Offene übernehmen</button>` +
          `<button type="button" class="btn ghost small" data-tool-week-copy>Kopieren</button>` +
          `<button type="button" class="btn ghost small" data-tool-week-ics title="Reset, Xûr, offene Wochenziele und Erinnerungen als ICS">Kalender (.ics)</button></div>` +
      `</header>` +
      `<div class="week-kpis">` +
        `<span class="accent"><b>${done}/${total}</b><small>Erledigt</small></span>` +
        `<span class="must"><b>${mustDone}/${mustItems.length}</b><small>Muss</small></span>` +
        `<span><small>Reset in</small><b>${esc(nextResetLabel())}</b></span>` +
        `<span><b class="${xur && xur.active ? 'week-ok' : ''}">${esc(xurText)}</b><small>Xûr</small></span>` +
        `<span class="${postmaster >= 15 ? 'warn' : ''}"><b>${postmaster}</b><small>Postfach</small></span>` +
      `</div>` +
      `<div class="week-progress"><span><i style="width:${percent}%"></i></span><b>${percent} %</b></div>` +
      `<div class="week-toolbar">` +
        `<div class="week-tabs">${viewTabs.map(([key, label]) =>
          `<button type="button" class="week-tab${weekCheckView === key ? ' on' : ''}" data-week-view="${key}">${esc(label)}</button>`
        ).join('')}</div>` +
        `<div class="week-chars">${[[0, 'Alle Zeiten'], [15, '15 Min'], [30, '30 Min'], [60, '1 Std']].map(([value, label]) =>
          `<button type="button" class="week-tab${weekMinutesFilter === value ? ' on' : ''}" data-week-minutes="${value}">${esc(label)}</button>`
        ).join('')}</div>` +
        `<div class="week-chars">${[['', 'Alle Klassen'], ['0', 'Titan'], ['1', 'Jäger'], ['2', 'Warlock']].map(([key, label]) =>

          `<button type="button" class="week-tab${weekCharFilter === key ? ' on' : ''}" data-week-char="${key}">${esc(label)}</button>`
        ).join('')}</div>` +
        `<label class="week-search"><span>Suche</span><input type="text" data-week-search value="${esc(weekCheckSearch)}" placeholder="Aufgabe oder Ziel …"></label>` +
      `</div>` +
      renderWeekTimers() +
      renderWeekMissing() +
      renderWeekLoot() +
      `<div class="week-groups">${groups}</div>` +
      `${visible.length ? '' : '<div class="week-empty">Keine passenden Aufgaben. Filter zurücksetzen oder eigenen Punkt hinzufügen.</div>'}` +
      `${renderWeeklyLive()}` +
      `${renderWeekSources()}` +
      `<div class="week-footnote">Prioritäten nach LFCarry Weekly Checklist, Bungie Ritual Reset Guide und SenseOS Reset Guide (Nov 2026).</div>` +
    `</section>`;
  }

  async function loadMilestones() {
    if (milestonesLoading) return;
    if (!api || typeof api.bungieMilestones !== 'function') {
      milestonesState = { ok: false, error: 'Aktions-Abruf ist nicht verfügbar.' };
      render();
      return;
    }
    milestonesLoading = true;
    render();
    try {
      milestonesState = await api.bungieMilestones();
    } catch (error) {
      milestonesState = { ok: false, error: error.message || String(error) };
    } finally {
      milestonesLoading = false;
      render();
      if (weeklyAutoPending) {
        weeklyAutoPending = false;
        setTimeout(() => autoCheckWeek(), 80);
      }
    }
  }

  function renderSessionRecap() {
    const duration = Math.max(0, Math.round((Date.now() - sessionStartedAt) / 60000));
    const godrolls = sessionLoot.filter((item) => item.godRoll).length;
    const near = sessionLoot.filter((item) => item.nearGodRoll).length;
    const weapons = sessionLoot.filter((item) => /waffe|weapon/i.test(item.typeName || '')).length;
    const armor = sessionLoot.length - weapons;
    const lines = [
      `Dauer: ${duration} Min.`,
      `Neue Items: ${sessionLoot.length} (${weapons} Waffen, ${armor} Rüstung)`,
      `Godrolls: ${godrolls} · Fast-Godrolls: ${near}`,
      `Aktivität: ${(data && (data.currentActivity || data.activity)) || 'unbekannt'}`
    ];
    return card('Session-Recap', '📋', lines.map((line) => `<div class="inv-tool-row"><span class="inv-tool-main">${esc(line)}</span></div>`).join('') +
      '<div class="inv-tool-actions"><button type="button" class="btn ghost small" data-session-export="md">Markdown kopieren</button><button type="button" class="btn ghost small" data-session-export="json">JSON kopieren</button></div>', '', 'wide');
  }

  function catalystTracker() {
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2tool.catalystTracker') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (error) { return []; }
  }

  function saveCatalystTracker(list) {
    try { window.localStorage.setItem('d2tool.catalystTracker', JSON.stringify(list.slice(-50))); } catch (error) { /* egal */ }
  }

  function renderCatalystTracker() {
    const list = catalystTracker();
    const rows = list.map((entry, index) =>
      `<div class="inv-tool-row"><label class="check-row"><input type="checkbox" data-catalyst-toggle="${index}" ${entry.done ? 'checked' : ''}><span>${esc(entry.name)}</span></label>` +
      `<button type="button" class="btn ghost small" data-catalyst-delete="${index}">Löschen</button></div>`
    ).join('');
    return card('Katalysator-/Exotic-Tracker', '🧩', rows || '<span class="inv-tool-muted">Noch keine Ziele eingetragen.</span>' +
      `<div class="inv-tool-actions"><input type="text" data-catalyst-input placeholder="Katalysator, Exotic-Quest oder Mission" maxlength="80"><button type="button" class="btn ghost small" data-catalyst-add>Hinzufügen</button></div>`, `${list.filter((entry) => !entry.done).length} offen`, 'wide');
  }

  function renderActivityCalendar() {
    const events = [];
    const now = new Date();
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 17, 0, 0);
      const weekday = day.toLocaleDateString('de-DE', { weekday: 'short' });
      const daily = index === 0 && now.getHours() >= 17 ? 'morgen' : 'heute';
      events.push({ day, weekday, text: index === 0 ? `Daily-Reset ${daily}` : 'Daily-Reset' });
    }
    const weekly = nextWeekResetDate();
    for (const event of events) {
      if (event.day.toDateString() === weekly.toDateString()) event.text += ' · Weekly-Reset';
      const day = event.day.getDay();
      if ([5, 6, 0, 1, 2].includes(day)) event.text += ' · Xûr';
    }
    return card('Aktivitätskalender', '📅', events.map((event) =>
      `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(event.weekday)} ${event.day.getDate()}.${event.day.getMonth() + 1}.</span><span class="inv-tool-main">${esc(event.text)}</span></div>`
    ).join('') + '<div class="inv-tool-muted">Reset-Zeiten in lokaler Zeit; Xûr Freitag bis Dienstag-Reset.</div>', '', 'wide');
  }

  function renderInventoryExport() {
    return card('Inventar-Export', '💾',
      '<div class="inv-tool-muted">Aktuellen Snapshot als JSON oder CSV in die Zwischenablage kopieren.</div>' +
      '<div class="inv-tool-actions"><button type="button" class="btn ghost small" data-inventory-export="json">JSON</button><button type="button" class="btn ghost small" data-inventory-export="csv">CSV</button></div>', '', 'wide');
  }

  function renderSession() {
    const visible = sessionFilter === 'hits'
      ? sessionLoot.filter((item) => item.godRoll || item.nearGodRoll)
      : sessionLoot;
    const body = visible.length
      ? visible.slice(0, 12).map((item) =>
          `<div class="inv-tool-row"><span class="inv-tool-main">${esc(item.name || 'Item')}` +
          `${item.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : item.nearGodRoll ? ' <span class="inv-tool-near">Fast</span>' : ''}</span>` +
          `<span class="inv-tool-meta">${item.power ? `${item.power} · ` : ''}${esc(item.location || '')}</span>` +
          `<button type="button" class="btn ghost small" data-tool-search="${esc(item.name || '')}">Suchen</button></div>`
        ).join('')
      : '<span class="inv-tool-muted">Noch keine neuen Items in dieser Sitzung. Beim Aktualisieren werden Zuwächse markiert.</span>';
    const tabs = `<span class="inv-tool-seg"><button type="button" class="btn ghost small ${sessionFilter === 'all' ? 'on' : ''}" data-session-filter="all">Alle</button>` +
      `<button type="button" class="btn ghost small ${sessionFilter === 'hits' ? 'on' : ''}" data-session-filter="hits">Godrolls/Fast</button></span>`;
    return card('Session-Loot', '🎁', tabs + body, `<span class="inv-tool-badge">${sessionLoot.length}</span>`);
  }

  const ACTIVITY_PLAYBOOKS = [
    { test: /großmeister|grandmaster|nightfall|\bgm\b/i, title: 'Nightfall / GM', tip: 'Champions zuerst abdecken: Anti-Barriere, Überladung oder Unaufhaltsam. Danach Boss-DPS und Survivability.', searches: ['perk:"Anti-Barriere"', 'perk:"Überladung"', 'perk:"Unaufhaltsam"', 'Fusion Rifle'] },
    { test: /raid|dungeon/i, title: 'Raid / Dungeon', tip: 'Add-Clear und Boss-DPS trennen. Für Bosse lineare Waffen, Sniper oder Schwerter passend zur Begegnung.', searches: ['Linear Fusion Rifle', 'Sniper Rifle', 'Sword', 'Machine Gun'] },
    { test: /schmelztiegel|crucible|pvp|prüfungen|trials|iron banner|eiserner banner/i, title: 'PvP', tip: 'Kurze TTK und Reichweite: Handfeuerwaffe, Pulse oder SMG plus Shotgun/Fusion für den Nahbereich.', searches: ['Hand Cannon', 'Pulse Rifle', 'Shotgun', 'Fusion Rifle'] },
    { test: /gambit/i, title: 'Gambit', tip: 'Add-Clear für Mobs, eine schwere Waffe für den Boss und etwas für Invasionen.', searches: ['SMG', 'Machine Gun', 'Sniper Rifle', 'Rocket Launcher'] },
    { test: /expert|meister|legend/i, title: 'Expert / Legend', tip: 'Champions und Survivability: Resilienz, Heilung und Waffen mit Champion-Perks kombinieren.', searches: ['perk:"Anti-Barriere"', 'perk:"Überladung"', 'Healing'] }
  ];

  function activityPlaybook(activity) {
    const text = `${activity.name || ''} ${activity.modeName || ''}`;
    return ACTIVITY_PLAYBOOKS.find((entry) => entry.test.test(text)) || {
      title: 'Allgemein',
      tip: 'Loadout passend zur Aktivität wählen: Champion-Perks, Add-Clear und eine schwere DPS-Waffe.',
      searches: ['perk:"Anti-Barriere"', 'perk:"Überladung"', 'perk:"Unaufhaltsam"']
    };
  }

  function renderActivity() {
    const activities = { ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) };
    const entries = Object.entries(activities).map(([owner, activity]) => ({ owner, ...activity }));
    const activity = entries.sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0))[0];
    const refresh = '<button type="button" class="btn ghost small" data-tool-activities ' + (activitiesLoading ? 'disabled' : '') + '>Aktualisieren</button>';
    if (!activity) {
      return card('Aktivität & Loadout', '🎯',
        `<span class="inv-tool-muted">${activitiesLoading ? 'Aktivität wird geladen …' : (activitiesState && activitiesState.ok === false ? esc(activitiesState.error || 'Keine Aktivitätsdaten.') : 'Keine laufende Aktivität erkannt (z. B. Orbit).')}</span>`,
        refresh);
    }
    const coverage = championCoverage();
    const activeRow = coverage.find((entry) => entry.character.id === activity.owner);
    const missingChampion = !activeRow || activeRow.coverage.every((names) => !names.length);
    const championWarning = /großmeister|grandmaster|nightfall|gm\b/i.test(`${activity.name} ${activity.modeName}`) && missingChampion
      ? '<div class="inv-tool-warn">⚠ Keine Champion-Fähigkeit an den ausgerüsteten Waffen erkannt – für GM/Nightfall eine Waffe mit Anti-Barriere, Überladung oder Unaufhaltsam ausrüsten.</div>'
      : '';
    const loadouts = (getCfg().bungie && getCfg().bungie.loadouts) || [];
    const text = `${activity.name} ${activity.modeName}`.toLowerCase();
    const keywords = [
      ['großmeister', 'gm', 'nightfall', 'nf'],
      ['raid', 'schmelztiegel', 'crucible', 'pvp', 'gambit', 'dungeon', 'prüfungen', 'trials', 'iron banner', 'eiserner banner']
    ].flat();
    const tokens = text.split(/[^a-zäöüß0-9]+/).filter((token) => token.length > 3);
    const matches = loadouts.filter((loadout) => {
      const name = `${String(loadout.name || '')} ${String(loadout.notes || '')}`.toLowerCase();
      if (!name.trim()) return false;
      if (tokens.some((token) => name.includes(token))) return true;
      if (keywords.some((keyword) => text.includes(keyword) && name.includes(keyword))) return true;
      const classType = keywords.some((keyword) => text.includes(keyword)) && Number(loadout.classType) === Number((coverage.find((entry) => entry.character.id === activity.owner) || {}).character?.classType);
      return Boolean(classType);
    }).slice(0, 3);
    const matchHtml = matches.length
      ? matches.map((loadout) =>
          `<div class="inv-tool-row"><span class="inv-tool-main">${esc(loadout.name)}</span>` +
          `<button type="button" class="btn primary small" data-tool-apply="${esc(loadout.id)}">Anwenden</button></div>`
        ).join('')
      : '<span class="inv-tool-muted">Kein namensgleiches Loadout. Im Loadout-Editor ein passendes anlegen.</span>';
    const equippedWeapons = allEntries().filter((entry) =>
      entry.kind === 'equipped' && entry.owner === activity.owner && WEAPON_SLOTS.has(Number(entry.item.bucket))
    );
    const weaponRows = equippedWeapons.map((entry) => {
      const types = [...breakerTypesOf(entry.item)];
      const labels = types.map((type) => BREAKER_LABELS[type]).filter(Boolean);
      return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(entry.item.name)}${entry.item.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : ''}</span>` +
        `<span class="inv-tool-meta">${labels.length ? esc(labels.join(' · ')) : 'kein Champion-Perk'}</span></div>`;
    }).join('');
    const playbook = activityPlaybook(activity);
    const playbookHtml = `<div class="inv-tool-sub">Empfohlenes Loadout</div>` +
      `<div class="inv-tool-muted">${esc(playbook.title)}: ${esc(playbook.tip)}</div>` +
      `<div class="inv-tool-actions">${playbook.searches.map((term) =>
        `<button type="button" class="btn ghost small" data-tool-search="${esc(term)}">${esc(term)}</button>`).join('')}` +
        `<button type="button" class="btn primary small" data-tool-loadout-editor>Loadout bauen</button></div>`;
    return card('Aktivität & Loadout', '🎯',
      `<div class="inv-tool-activity"><strong>${esc(activity.name)}</strong>` +
      (activity.modeName ? `<span>${esc(activity.modeName)}</span>` : '') +
      (activity.startedAt ? `<small>seit ${new Date(activity.startedAt).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })}</small>` : '') +
      `</div>${championWarning}<div class="inv-tool-sub">Waffen-Check</div>${weaponRows || '<span class="inv-tool-muted">Keine Waffen angelegt.</span>'}<div class="inv-tool-sub">Passende Loadouts</div>${matchHtml}${playbookHtml}`, refresh);
  }

  const CHAMPION_PATTERNS = [
    { key: 'Anti-Barriere' },
    { key: 'Überladung' },
    { key: 'Unaufhaltsam' }
  ];
 
  function breakerTypesOf(item) {
    return new Set(championTypes(item));
  }

  // Fallback für Fälle, in denen Bungie an der Instanz keinen Breaker
  // liefert: Anti-Champion 2.0 leitet die Fähigkeit aus dem Rahmen ab.
  // Es wird ausschließlich der Rahmen-/Intrinsic-Name geprüft, nicht
  // die Beschreibung – so entstehen keine Fehltreffer durch Perk-Texte.
  function legacyFrameBreakerType(item) {
    const frames = [];
    for (const column of (item.socketColumns || [])) {
      if (Number(column.idx) !== 0) continue;
      for (const option of (column.options || [])) {
        if (option && option.selected) frames.push(option.n, option.p);
      }
    }
    for (const perk of (item.perks || []).slice(0, 2)) {
      if (perk && perk.n) frames.push(perk.n);
    }
    const text = frames.filter(Boolean).join(' ').toLowerCase();
    if (!text) return 0;
    if (/mikro.?raketen|micro.?missile|doppelfeuer|double.?fire|wellen|wave|komprimierte welle|compressed wave|schwere salve|heavy.?burst|aggressiv|aggressive|hochenergie|high.?impact|raketenunterstützt|rocket.?assisted/.test(text)) return 3;
    if (/flächenschaden|area.?denial|leichtgewicht|lightweight|schnellfeuer|rapid.?fire|vortex|spread.?shot|dynamische hitze|dynamic heat|ausgeglichene hitze|balanced heat|unterstützung|support/.test(text)) return 2;
    if (/präzision|precision|adaptiv|adaptive|legacy pr.?55|disruption weapon|störungswaffe|schildbrechend|caster/.test(text)) return 1;
    return 0;
  }

  // Champion-Fähigkeiten stecken direkt in der Waffe (Instanz-Breaker
  // aus Bungies Komponente 300, sonst Manifest-Definition/Perk).
  function championCoverage() {
    return (data && data.characters || []).map((character) => {
      const weapons = [];
      for (const entry of allEntries()) {
        if (entry.kind !== 'equipped' || entry.owner !== character.id) continue;
        if (!WEAPON_SLOTS.has(Number(entry.item.bucket))) continue;
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
        weapons,
        coverage: CHAMPION_PATTERNS.map((pattern) => weapons
          .filter((weapon) => weapon.abilities.includes(pattern.key))
          .map((weapon) => weapon.name))
      };
    });
  }

  function renderChampions() {
    const rows = championCoverage();
    if (!rows.length) return card('Champion-Check', '🛡', '<span class="inv-tool-muted">Keine Charakterdaten.</span>');
    const labels = CHAMPION_PATTERNS.map((pattern) => pattern.key);
    const html = rows.map(({ character, coverage }) => {
      const any = coverage.some((names) => names.length);
      const sources = coverage
        .map((names, index) => names.length ? `${labels[index]}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ' …' : ''}` : '')
        .filter(Boolean)
        .join(' · ');
      return `<div class="inv-tool-row inv-tool-champ-row"><span class="inv-tool-main">${esc(CLASS_NAMES[character.classType] || 'Hüter')}` +
        `${any ? '' : ' <span class="inv-tool-warn">⚠ keine Champion-Fähigkeit</span>'}</span>` +
        `<span class="inv-tool-champs">${labels.map((label, index) =>
          `<span class="inv-tool-chip ${coverage[index].length ? 'on' : ''}" title="${esc(coverage[index].join(', ') || 'keine Waffe')}">${esc(label)}</span>`
        ).join('')}</span></div>` +
        (sources ? `<div class="inv-tool-champ-src">${esc(sources)}</div>` : '');
    }).join('');
    return card('Champion-Check', '🛡', html +
      '<div class="inv-tool-muted">Prüft die ausgerüsteten Waffen auf intrinsische Champion-Fähigkeiten (Anti-Barriere, Überladung, Unaufhaltsam).</div>', '', 'wide');
  }

  function possibleBreakerTypes(item) {
    return new Set(championTypes(item));
  }

  function artifactBreakers(characterId) {
    const artifact = allEntries().find((entry) =>
      entry.kind === 'equipped' && entry.owner === characterId && Number(entry.item && entry.item.bucket) === 1506418338
    );
    return artifact ? [...possibleBreakerTypes(artifact.item)] : [];
  }

  function championSwapSuggestions(character, type) {
    const label = BREAKER_LABELS[type];
    return allEntries()
      .filter((entry) => entry.item && WEAPON_SLOTS.has(Number(entry.item.bucket)))
      .filter((entry) => !(entry.kind === 'equipped' && entry.owner === character.id))
      .filter((entry) => possibleBreakerTypes(entry.item).has(type))
      .sort((a, b) => (Number(b.item.godRoll) - Number(a.item.godRoll)) || itemPower(b.item) - itemPower(a.item))
      .slice(0, 2)
      .map((entry) => ({ entry, label }));
  }

  function renderChampionPlanner() {
    const rows = championCoverage();
    if (!rows.length) return card('Champion-Planer', '🛡', '<span class="inv-tool-muted">Keine Charakterdaten.</span>', '', 'wide');
    const labels = CHAMPION_PATTERNS.map((pattern) => pattern.key);
    const body = rows.map(({ character, coverage }) => {
      const artifact = artifactBreakers(character.id);
      const missing = labels.filter((label, index) => !coverage[index].length && !artifact.includes(label));
      const chips = labels.map((label, index) => {
        const equipped = coverage[index].length > 0;
        const viaArtifact = !equipped && artifact.includes(label);
        return `<span class="inv-tool-chip ${equipped ? 'on' : viaArtifact ? 'on' : ''}" title="${esc(equipped ? coverage[index].join(', ') : viaArtifact ? 'Artefakt (typgebunden)' : 'keine Waffe')}">${esc(label)}${viaArtifact ? ' · A' : ''}</span>`;
      }).join('');
      const suggestions = missing.map((label) => {
        const type = Number(Object.entries(BREAKER_LABELS).find(([, value]) => value === label)?.[0]) || 0;
        const candidates = type ? championSwapSuggestions(character, type) : [];
        const buttons = candidates.map(({ entry }) =>
          `<button type="button" class="btn ghost small" data-tool-search="${esc(`name:"${entry.item.name}"`)}">${esc(entry.item.name)} · ${itemPower(entry.item)}</button>`
        ).join('');
        return `<div class="inv-tool-row small"><span class="inv-tool-main inv-tool-warn">Fehlt: ${esc(label)}</span>` +
          `<span class="inv-tool-actions">${buttons || '<span class="inv-tool-muted">keine passende Waffe im Inventar</span>'}</span></div>`;
      }).join('');
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(CLASS_NAMES[character.classType] || 'Hüter')}</span><span class="inv-tool-champs">${chips}</span></div>` +
        (missing.length ? suggestions : '<div class="inv-tool-row small"><span class="inv-tool-main">Alle Champions abgedeckt.</span></div>') +
        (artifact.length ? `<div class="inv-tool-muted">Artefakt (typgebunden): ${esc(artifact.map((type) => BREAKER_LABELS[type]).filter(Boolean).join(', '))}</div>` : '');
    }).join('');
    return card('Champion-Planer', '🛡', body +
      '<div class="inv-tool-muted">Aggregiert ausgerüstete Waffen, Perks, Mods und aktive Artefakt-Perks. „A" = über das Artefakt, abhängig vom Waffentyp. Kandidaten lassen sich direkt im Inventar suchen.</div>', '', 'wide');
  }

  function craftAll() {
    return ((craftablesState && craftablesState.craftables) || (data && data.craftables) || []);
  }

  function craftIsOpen(entry) {
    const pattern = entry && entry.pattern;
    if (!pattern) return true;
    return (Number(pattern.progress) || 0) < (Number(pattern.completion) || 1) && pattern.complete !== true;
  }

  function craftPatternPercent(entry) {
    const pattern = entry && entry.pattern;
    if (!pattern) return 0;
    const completion = Math.max(1, Number(pattern.completion) || 1);
    return Math.max(0, Math.min(100, Math.round(((Number(pattern.progress) || 0) / completion) * 100)));
  }

  function craftDamageClass(value) {
    const key = String(value || '').toLocaleLowerCase('de');
    if (key.includes('schock')) return 'arc';
    if (key.includes('solar')) return 'solar';
    if (key.includes('void')) return 'void';
    if (key.includes('stasis')) return 'stasis';
    if (key.includes('strand')) return 'strand';
    if (key.includes('kinet')) return 'kinetic';
    return '';
  }

  function craftFiltered() {
    const filter = craftFilter.trim().toLocaleLowerCase('de');
    return craftAll().filter((entry) => {
      if (craftOnlyOpen && !craftIsOpen(entry)) return false;
      if (craftHideCrafted && entry.crafted) return false;
      if (craftOnlyDeep && !entry.deepsight) return false;
      if (!filter) return true;
      const haystack = [entry.name, entry.typeName, entry.ammoType, entry.slot, entry.damageType, entry.source, entry.sourceGroup]
        .join(' ').toLocaleLowerCase('de');
      return haystack.includes(filter);
    });
  }

  function craftGroups(list) {
    const groups = new Map();
    const statusOrder = ['Noch offen', 'Bauplan frei', 'Geschmiedet'];
    for (const entry of list) {
      let name = '';
      if (craftView === 'type') name = entry.typeName || 'Unbekannter Waffentyp';
      else if (craftView === 'status') {
        if (entry.crafted) name = 'Geschmiedet';
        else if (craftIsOpen(entry)) name = 'Noch offen';
        else name = 'Bauplan frei';
      } else name = entry.sourceGroup || 'Weitere Quellen';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(entry);
    }
    const sortItems = (items) => items.slice().sort((a, b) => {
      const openA = craftIsOpen(a);
      const openB = craftIsOpen(b);
      if (openA !== openB) return openA ? -1 : 1;
      if (a.crafted && b.crafted) return (Number(b.crafted.level) || 0) - (Number(a.crafted.level) || 0);
      return craftPatternPercent(b) - craftPatternPercent(a) || a.name.localeCompare(b.name, 'de');
    });
    const entries = [...groups.entries()].map(([name, items]) => ({ name, items: sortItems(items) }));
    if (craftView === 'status') {
      entries.sort((a, b) => statusOrder.indexOf(a.name) - statusOrder.indexOf(b.name));
    } else {
      entries.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'de'));
    }
    return entries;
  }

  function craftWeaponHtml(entry) {
    const pct = craftPatternPercent(entry);
    const open = craftIsOpen(entry);
    const crafted = entry.crafted;
    const expanded = String(craftOpenHash) === String(entry.hash);
    const rarity = Math.max(0, Math.min(6, Number(entry.rarity) || 0));
    const patternText = entry.pattern
      ? `${Number(entry.pattern.progress) || 0}/${Number(entry.pattern.completion) || 0}`
      : '—';
    const badges = [
      entry.damageType ? `<span class="craft-dmg ${craftDamageClass(entry.damageType)}">${esc(entry.damageType)}</span>` : '',
      entry.deepsight ? `<span class="craft-badge deepsight" title="Tiefenblick-Resonanz im Inventar">Tiefenblick ${Number(entry.deepsight.progress) || 0}/${Number(entry.deepsight.completion) || 0}</span>` : '',
      crafted ? `<span class="craft-badge crafted">Level ${Number(crafted.level) || 0}</span>` : '',
      !open ? '<span class="craft-badge done">Bauplan frei</span>' : ''
    ].filter(Boolean).join('');
    return `<article class="craft-weapon${expanded ? ' open' : ''}${crafted ? ' crafted' : ''}" data-craft-open="${entry.hash}" tabindex="0">` +
      `<div class="craft-weapon-head">` +
        `<span class="craft-art rarity-${rarity}">${entry.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(entry.icon)}" alt="">` : '<span>✦</span>'}</span>` +
        `<div class="craft-weapon-copy"><strong>${esc(entry.name)}</strong>` +
          `<small>${esc([entry.typeName, entry.ammoType, entry.slot].filter(Boolean).join(' · ') || 'Waffe')}</small>` +
          `<div class="craft-weapon-tags">${badges}</div>` +
        `</div>` +
        `<span class="craft-caret">${expanded ? '▾' : '▸'}</span>` +
      `</div>` +
      `<div class="craft-patternline"><span class="craft-bar"><i style="width:${pct}%"></i></span><b>${patternText}</b><em>${open ? 'Bauplan' : 'frei'}</em></div>` +
      (crafted ? `<div class="craft-levelline"><span>Geschmiedet · Level ${Number(crafted.level) || 0}</span><span class="craft-bar level"><i style="width:${Math.max(0, Math.min(100, Number(crafted.levelProgress) || 0))}%"></i></span></div>` : '') +
      (expanded ? craftDetailHtml(entry) : '') +
    `</article>`;
  }

  function craftDetailHtml(entry) {
    const pattern = entry.pattern;
    const instances = Array.isArray(entry.craftedInstances) ? entry.craftedInstances : [];
    const rows = [
      ['Typ', entry.typeName || '—'],
      ['Slot', entry.slot || '—'],
      ['Munition', entry.ammoType || '—'],
      ['Schaden', entry.damageType || '—']
    ].map(([label, value]) => `<span><small>${esc(label)}</small><b>${esc(value)}</b></span>`).join('');
    return `<div class="craft-detail">` +
      `<div class="craft-detail-grid">${rows}</div>` +
      `<div class="craft-detail-row"><span>Quelle</span><b>${esc(entry.source || entry.sourceGroup || 'Unbekannt')}</b></div>` +
      `${(entry.source || entry.sourceGroup) ? `<div class="craft-detail-row"><span></span><button type="button" class="btn ghost small" data-source-jump="${esc(entry.source || entry.sourceGroup)}">Quelle anzeigen</button></div>` : ''}` +
      `<div class="craft-detail-row"><span>Bauplan</span><b>${pattern ? `${Number(pattern.progress) || 0}/${Number(pattern.completion) || 0}${pattern.complete ? ' · freigeschaltet' : ''}` : 'Keine Bauplan-Daten'}</b></div>` +
      `${entry.deepsight ? `<div class="craft-detail-row"><span>Tiefenblick</span><b>${Number(entry.deepsight.progress) || 0}/${Number(entry.deepsight.completion) || 0} im Inventar · Extraktion möglich</b></div>` : ''}` +
      (instances.length
        ? `<div class="craft-detail-row"><span>Geschmiedet</span><b>${instances.map((instance) => `Level ${Number(instance.level) || 0}${instance.masterworked ? ' · Meisterwerk' : ''}`).join(' · ')}</b></div>`
        : '<div class="craft-detail-row"><span>Geschmiedet</span><b class="craft-muted">Noch keine geschmiedete Kopie</b></div>') +
    `</div>`;
  }

  function renderCrafting() {
    const all = craftAll();
    const filtered = craftFiltered();
    const groups = craftGroups(filtered);
    const total = all.length;
    const complete = all.filter((entry) => !craftIsOpen(entry)).length;
    const open = all.filter((entry) => craftIsOpen(entry)).length;
    const crafted = all.filter((entry) => entry.crafted).length;
    const deepsight = all.filter((entry) => entry.deepsight).length;
    const empty = craftablesLoading
      ? 'Crafting-Rezepte werden geladen …'
      : (craftablesState && craftablesState.ok === false
        ? (craftablesState.error || 'Crafting-Rezepte nicht verfügbar.')
        : 'Keine Crafting-Rezepte vom Konto gemeldet.');
    const almost = all.filter((entry) => craftIsOpen(entry) && entry.pattern && (Number(entry.pattern.completion) || 0) - (Number(entry.pattern.progress) || 0) === 1).slice(0, 8);
    const almostHtml = almost.length
      ? `<div class="craft-almost"><span class="craft-almost-title">Es fehlt nur noch 1×</span>` +
          almost.map((entry) => `<span class="craft-almost-item">${entry.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(entry.icon)}" alt="">` : ''}${esc(entry.name || 'Waffe')}</span>`).join('') +
        `</div>`
      : '';
    const tabs = [
      ['source', 'Nach Quelle'],
      ['type', 'Nach Typ'],
      ['status', 'Nach Status']
    ];
    const groupHtml = groups.map((group) => {
      const done = group.items.filter((entry) => !craftIsOpen(entry)).length;
      const progressSum = group.items.reduce((sum, entry) => sum + (Number(entry.pattern && entry.pattern.progress) || 0), 0);
      const completionSum = group.items.reduce((sum, entry) => sum + (Number(entry.pattern && entry.pattern.completion) || 0), 0);
      const groupPct = completionSum ? Math.round(progressSum / completionSum * 100) : (group.items.length ? Math.round(done / group.items.length * 100) : 0);
      const icon = group.items.find((entry) => entry.icon);
      return `<details class="craft-group" open>` +
        `<summary><span class="craft-group-icon">${icon ? `<img loading="lazy" src="https://www.bungie.net${esc(icon.icon)}" alt="">` : '◆'}</span>` +
          `<strong>${esc(group.name)}</strong>` +
          `<span class="craft-group-progress"><i style="width:${groupPct}%"></i></span>` +
          `<em class="craft-group-count">${group.items.length}</em>` +
          `<b>${progressSum}/${completionSum || group.items.length}</b><span class="craft-group-caret">▾</span>` +
        `</summary>` +
        `<div class="craft-grid">${group.items.map(craftWeaponHtml).join('')}</div>` +
      `</details>`;
    }).join('');
    return `<section class="craft-page">` +
      `<header class="craft-hero">` +
        `<div class="craft-hero-copy"><span class="craft-kicker">Waffen-Schmiede</span>` +
          `<h2>Crafting-Fortschritt</h2>` +
          `<p>Baupläne, Tiefenblick-Resonanz und geschmiedete Waffen an einem Ort.</p></div>` +
        `<div class="craft-hero-actions"><button type="button" class="btn primary small" data-tool-craftables ${craftablesLoading ? 'disabled' : ''}>Aktualisieren</button></div>` +
      `</header>` +
      `<div class="craft-kpis">` +
        `<span><b>${total}</b><small>Baupläne</small></span>` +
        `<span class="ok"><b>${complete}</b><small>freigeschaltet</small></span>` +
        `<span class="warn"><b>${open}</b><small>offen</small></span>` +
        `<span class="accent"><b>${crafted}</b><small>geschmiedet</small></span>` +
        `<span class="deep"><b>${deepsight}</b><small>Tiefenblick</small></span>` +
      `</div>` +
      almostHtml +
      `<div class="craft-toolbar">` +
        `<div class="craft-tabs">${tabs.map(([key, label]) =>
          `<button type="button" class="craft-tab${craftView === key ? ' on' : ''}" data-craft-view="${key}">${esc(label)}</button>`
        ).join('')}</div>` +
        `<label class="craft-search"><span>Suche</span><input type="text" data-tool-craft-filter value="${esc(craftFilter)}" placeholder="Waffe, Typ oder Quelle …"></label>` +
        `<details class="craft-filters"><summary>Filter</summary><div class="craft-filter-body">` +
          `<label class="inv-tool-check"><input type="checkbox" data-craft-toggle="open" ${craftOnlyOpen ? 'checked' : ''}> Nur offene Baupläne</label>` +
          `<label class="inv-tool-check"><input type="checkbox" data-craft-toggle="crafted" ${craftHideCrafted ? 'checked' : ''}> Geschmiedete ausblenden</label>` +
          `<label class="inv-tool-check"><input type="checkbox" data-craft-toggle="deepsight" ${craftOnlyDeep ? 'checked' : ''}> Nur Tiefenblick im Inventar</label>` +
        `</div></details>` +
      `</div>` +
      (groups.length
        ? `<div class="craft-groups">${groupHtml}</div>`
        : `<div class="craft-empty">${esc(all.length ? 'Keine Waffen für diese Filter.' : empty)}</div>`) +
      `<div class="craft-footnote">${total ? `${filtered.length} von ${total} Waffen sichtbar · ${open} offene Baupläne` : esc(empty)}</div>` +
    `</section>`;
  }

  function isOwnedHash(hash) {
    const wanted = Number(hash) || 0;
    if (!wanted) return false;
    return allEntries().some((entry) => Number(entry.item.hash) === wanted);
  }

  const RARITY_LABELS = ['', '', 'Standard', 'Gewöhnlich', 'Selten', 'Legendär', 'Exotisch'];

  function xurTipHtml(item) {
    if (!item) return '';
    const rarity = Math.max(0, Math.min(6, Number(item.rarity) || 0));
    const rarityLabel = RARITY_LABELS[rarity] || '';
    const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
    let html = `<strong class="dinv-tip-name tt${rarity}">${esc(item.name || 'Item')}</strong>`;
    html += `<span class="inv-tip-meta">${esc(item.typeName || 'Item')}${rarityLabel ? ` · ${esc(rarityLabel)}` : ''}</span>`;
    html += `<span class="inv-tip-meta">${esc(item.seller || 'Xûr')}${item.owned ? ' · im Besitz' : ''}${item.ownedCount ? ` (${item.ownedCount}×)` : ''}</span>`;
    if (item.godRoll) html += `<span class="inv-popup-notes">✓ Godroll${item.godNotes ? ` — ${esc(item.godNotes)}` : ''}</span>`;
    else if (item.nearGodRoll) html += `<span class="inv-popup-near">≈ Fast-Godroll</span>`;
    if (item.nearMissing && item.nearMissing.length) html += `<span class="inv-popup-near">Fehlt: ${esc(item.nearMissing.join(', '))}</span>`;
    if (item.godSource) html += `<span class="inv-tip-meta">Quelle: ${esc(item.godSource)}</span>`;
    if (item.betterThanOwned) html += `<span class="inv-tool-chip on">Besser als deine beste Kopie</span>`;
    if (item.affordable === false) html += `<span class="inv-tool-warn">Fehlt: ${esc((item.missingCosts || []).map((cost) => cost.name).join(', '))}</span>`;
    if (Array.isArray(item.stats) && item.stats.length) {
      html += `<span class="dinv-tip-stats">` +
        item.stats.map((stat) => `<span class="dinv-tip-stat"><span>${esc(stat.label || 'Wert')}</span><b>${Math.round(Number(stat.value) || 0)}</b></span>`).join('') +
        `</span>`;
    }
    if (Array.isArray(item.perks) && item.perks.length) {
      html += `<span style="display:flex;flex-wrap:wrap;gap:3px">` + item.perks.map((perk) =>
        `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 4px;border:1px solid #2a3548;border-radius:4px;color:#e8ecf2;background:rgba(255,255,255,0.04)">` +
        (perk.i ? `<img src="https://www.bungie.net${esc(perk.i)}" style="width:18px;height:18px;border-radius:3px;object-fit:contain" alt="">` : '') +
        `<span>${esc(perk.n || 'Perk')}</span></span>`
      ).join('') + `</span>`;
    }
    if (item.description) html += `<span style="color:#cfd7e3">${esc(item.description)}</span>`;
    if (item.flavor) html += `<span class="inv-tip-flavor">${esc(item.flavor)}</span>`;
    if (costs) html += `<span class="inv-tip-meta">Preis: ${esc(costs)}</span>`;
    return html;
  }

  function ensureXurTip() {
    if (xurTipEl) return xurTipEl;
    xurTipEl = document.createElement('div');
    xurTipEl.className = 'inventory-tooltip';
    xurTipEl.id = 'toolsXurTooltip';
    document.body.appendChild(xurTipEl);
    return xurTipEl;
  }

  function hideXurTip() {
    if (xurTipEl) {
      xurTipEl.classList.remove('show');
      xurTipEl.innerHTML = '';
    }
  }

  function showXurTip(key, event, row) {
    const item = xurItemsByKey.get(String(key));
    if (!item) return;
    const tip = ensureXurTip();
    tip.innerHTML = xurTipHtml(item);
    tip.classList.add('show');
    tip.style.visibility = 'hidden';
    const rect = row ? row.getBoundingClientRect() : null;
    const baseX = event && Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (rect ? rect.left : 20);
    const baseY = event && Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (rect ? rect.top : 20);
    positionFixedTip(tip, baseX, baseY, { offset: 14, padding: 10 });
    tip.style.visibility = '';
  }

  let queueStatus = null;
let transferJobsState = null;
  let queueLoading = false;
  let storageState = null;
  let storageLoading = false;
  function fmtBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
    return `${value} B`;
  }
  function ensureStorageInfo() {
    if (storageState || storageLoading || !api || typeof api.storageInfo !== 'function') return;
    storageLoading = true;
    api.storageInfo().then((result) => { storageState = result || null; }).catch(() => {}).finally(() => {
      storageLoading = false;
      if (host && !host.classList.contains('hidden')) render();
    });
  }
  function ensureQueueStatus() {
    if (queueStatus || queueLoading || !api || typeof api.bungieQueueStatus !== 'function') return;
    queueLoading = true;
    api.bungieQueueStatus().then((result) => { queueStatus = result || null; }).catch(() => {}).finally(() => {
      queueLoading = false;
      if (host && !host.classList.contains('hidden')) render();
    });
  }

  function renderDataStatus() {
    ensureQueueStatus();
    ensureStorageInfo();
    const fetched = Number(data && data.fetchedAt) || 0;
    const ageMin = fetched ? Math.max(0, Math.round((Date.now() - fetched) / 60000)) : null;
    const stale = ageMin != null && ageMin > 15;
    const ageText = ageMin == null ? 'unbekannt' : ageMin <= 1 ? 'gerade eben' : `vor ${ageMin} Min.`;
    const version = (data && data.manifestVersion) || 'unbekannt';
    return card('Datenstatus', '🩺',
      `<div class="inv-tool-row"><span class="inv-tool-slot">Snapshot</span><span class="inv-tool-main ${stale ? 'inv-tool-warn' : ''}">${esc(ageText)}${stale ? ' · veraltet, bitte aktualisieren' : ''}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Manifest</span><span class="inv-tool-main">${esc(String(version))}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Items</span><span class="inv-tool-main">${fmt((((data && data.vault) || []).length) + Object.values((data && data.backpack) || {}).reduce((sum, list) => sum + (list || []).length, 0))} im Tresor/Beutetasche</span></div>` +
      (queueStatus ? `<div class="inv-tool-row"><span class="inv-tool-slot">API</span><span class="inv-tool-main">${Number(queueStatus.requests) || 0} Anfragen · ${Number(queueStatus.rateLimits) || 0}× 429 · Queue ${Number(queueStatus.waiting) || 0}</span></div>` : '') +
      (lastRenderMs ? `<div class="inv-tool-row"><span class="inv-tool-slot">Render</span><span class="inv-tool-main">${lastRenderMs} ms für die letzte Ansicht</span></div>` : '') +
      (storageState && storageState.ok ? `<div class="inv-tool-row"><span class="inv-tool-slot">Speicher</span><span class="inv-tool-main">${fmtBytes(storageState.total)} gesamt · Cache ${fmtBytes(storageState.cache)} (Manifest ${fmtBytes(storageState.manifest)}, Wishlists ${fmtBytes(storageState.wishlists)}) · Backups ${fmtBytes(storageState.backups)} · Logs ${fmtBytes(storageState.logs)}</span>` +
        `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-storage="wishlist">Wishlist-Cache</button><button type="button" class="btn ghost small" data-tool-storage="manifest-old">Alte Manifeste</button><button type="button" class="btn ghost small" data-tool-storage="logs">Logs</button></span></div>` : '') +
      `<div class="inv-tool-muted">Bei „veraltet“ oben „Inventar aktualisieren“ drücken. API-Key/Anmeldung stehen unter Bungie-Status.</div>`,
      '<button type="button" class="btn ghost small" data-tool-refresh>Jetzt aktualisieren</button>');
  }

  const VENDOR_ALERTS = [
    { hash: 350061650, name: 'Ada-1' },
    { hash: 672118013, name: 'Banshee-44' }
  ];

  // Händler-Historie: merkt sich pro Abruf die Angebots-Hashes und
  // die Differenz zum vorherigen Stand. Daraus entstehen die Hinweise
  // „neu“/„weg“ und die Rotationshistorie in der Händler-Ansicht.
  function recordVendorHistoryBatch(entries) {
    const cfg = getCfg();
    const history = { ...((cfg.bungie && cfg.bungie.vendorHistory) || {}) };
    const metaAll = { ...((cfg.bungie && cfg.bungie.vendorHistoryMeta) || {}) };
    const result = new Map();
    let changed = false;
    for (const entry of entries || []) {
      const hash = String((entry && entry.hash) || '');
      const items = entry && entry.items;
      if (!hash || !Array.isArray(items)) continue;
      const prev = Array.isArray(history[hash]) ? history[hash].map(Number) : [];
      const hashes = items.map((item) => Number(item && item.hash) || 0).filter(Boolean);
      const prevMeta = metaAll[hash] || null;
      const newHashes = prev.length ? hashes.filter((itemHash) => !prev.includes(itemHash)) : [];
      const removedHashes = prev.length ? prev.filter((itemHash) => !hashes.includes(itemHash)) : [];
      history[hash] = hashes.slice(0, 200);
      metaAll[hash] = {
        at: Date.now(),
        count: hashes.length,
        prevAt: Number(prevMeta && prevMeta.at) || 0,
        prevCount: prev.length,
        newHashes: newHashes.slice(0, 50),
        removedHashes: removedHashes.slice(0, 50)
      };
      result.set(hash, { newHashes, removedHashes, prevCount: prev.length });
      changed = true;
    }
    if (changed) setConfig({ bungie: { vendorHistory: history, vendorHistoryMeta: metaAll } });
    return result;
  }

  function recordVendorHistory(vendorHash, items) {
    const hash = String(vendorHash || '');
    if (!hash || !Array.isArray(items)) return null;
    return recordVendorHistoryBatch([{ hash, items }]).get(hash) || null;
  }

  function vendorPriceHistory() {
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2tool.vendorPrices') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (error) { return {}; }
  }

  function saveVendorPriceHistory(map) {
    try { window.localStorage.setItem('d2tool.vendorPrices', JSON.stringify(map)); } catch (error) { /* egal */ }
  }

  function recordVendorPriceOffers(vendorHash, vendorName, items) {
    const watch = new Set(((getCfg().bungie && getCfg().bungie.watchlist) || []).map(String));
    if (!watch.size || !Array.isArray(items)) return;
    const map = vendorPriceHistory();
    let changed = false;
    let drop = null;
    for (const item of items) {
      if (!item || !watch.has(String(item.name))) continue;
      const cost = (item.costs || [])[0];
      if (!cost) continue;
      const costValue = Number(cost.quantity) || 0;
      const currency = String(cost.name || '');
      const list = Array.isArray(map[item.name]) ? map[item.name].slice(-11) : [];
      const last = list[list.length - 1];
      if (last && last.currency === currency && costValue < last.cost) drop = { name: item.name, from: last.cost, to: costValue, currency };
      if (!last || last.cost !== costValue || last.currency !== currency) {
        list.push({ at: Date.now(), cost: costValue, currency, vendor: String(vendorName || ''), vendorHash: String(vendorHash || '') });
        map[item.name] = list.slice(-12);
        changed = true;
      }
    }
    if (changed) saveVendorPriceHistory(map);
    if (drop) toast(`${drop.name}: Preis ${fmt(drop.from)} → ${fmt(drop.to)} ${drop.currency}`.trim(), 'success', 3600);
  }

  function vendorPriceTrend(name) {
    const list = (vendorPriceHistory()[name] || []).filter((entry) => entry && Number(entry.cost) > 0);
    if (list.length < 2) return { text: '', tone: '', bars: '' };
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    if (last.currency !== prev.currency) return { text: 'Preiswährung gewechselt', tone: '', bars: '' };
    const delta = last.cost - prev.cost;
    const pct = prev.cost ? Math.round((delta / prev.cost) * 100) : 0;
    const tone = delta < 0 ? 'price-down' : delta > 0 ? 'price-up' : '';
    const max = Math.max(...list.map((entry) => entry.cost), 1);
    const bars = list.slice(-8).map((entry) => `<i style="height:${Math.max(2, Math.round(entry.cost / max * 12))}px"></i>`).join('');
    return {
      text: delta === 0 ? 'Preis stabil' : `${delta < 0 ? '▼' : '▲'} ${fmt(Math.abs(delta))} ${last.currency} (${pct > 0 ? '+' : ''}${pct} %)`,
      tone,
      bars
    };
  }

  function renderVendorWatchlist() {
    const watch = ((getCfg().bungie && getCfg().bungie.watchlist) || []).map(String);
    if (!watch.length) {
      return card('Händler-Beobachtung', '★', '<span class="inv-tool-muted">Noch keine Angebote beobachtet. In den Händler-Details auf „Beobachten“ drücken, um Preisänderungen und neue Rolls zu verfolgen.</span>', '', 'wide');
    }
    const offers = [];
    for (const group of (allVendorsState && allVendorsState.groups) || []) {
      for (const vendor of group.vendors || []) {
        for (const item of vendor.items || []) offers.push({ item, vendor });
      }
    }
    for (const [hash, state] of vendorOffersState.entries()) {
      for (const item of (state && state.items) || []) offers.push({ item, vendor: { hash: Number(hash), name: state.vendorName || 'Händler' } });
    }
    const rows = watch.map((name) => {
      const found = offers.find((entry) => String(entry.item.name) === name) || null;
      if (!found) {
        return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(name)}</span><span class="inv-tool-meta">nicht im aktuellen Angebot</span>` +
          `<button type="button" class="btn ghost small" data-vendor-watch-remove="${esc(name)}">Entfernen</button></div>`;
      }
      const costs = (found.item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
      const trend = vendorPriceTrend(name);
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(name)}${found.item.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : ''}</span>` +
        `<span class="inv-tool-meta">${esc(found.vendor.name || 'Händler')}${costs ? ` · ${esc(costs)}` : ''}</span>` +
        (trend.text ? `<span class="vendor-price-trend ${trend.tone}" title="${esc(trend.text)}"><span class="vendor-price-bars">${trend.bars}</span>${esc(trend.text)}</span>` : '') +
        `<button type="button" class="btn ghost small" data-vendor-item-open="${esc(found.vendor.hash)}:${esc(found.item.hash)}">Details</button>` +
        `<button type="button" class="btn ghost small" data-vendor-watch-remove="${esc(name)}">Entfernen</button></div>`;
    }).join('');
    return card('Händler-Beobachtung', '★', rows +
      '<div class="inv-tool-muted">Beobachtete Angebote mit Preisverlauf. Preisänderungen werden beim Händler-Abruf gemeldet.</div>', '', 'wide');
  }

  async function loadVendorOffers(hash, force) {
    if (!api || typeof api.bungieVendorOffers !== 'function') {
      vendorOffersState.set(hash, { ok: false, error: 'Händler-Abruf ist nicht verfügbar.' });
      render();
      return;
    }
    if (vendorOffersLoading.has(hash)) return;
    vendorOffersLoading.add(hash);
    vendorOffersState.set(hash, { ...(vendorOffersState.get(hash) || {}), loading: true });
    render();
    try {
      const result = await Promise.race([
        api.bungieVendorOffers(hash, force === true),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Zeitüberschreitung beim Händler-Abruf.' }), 12000))
      ]);
      if (result && result.ok) {
        const delta = recordVendorHistory(hash, result.items || []);
        recordVendorPriceOffers(hash, result.vendorName, result.items || []);
        result.newHashes = delta ? delta.newHashes : [];
        if (result.newHashes.length && delta && delta.prevCount) toast(`${result.newHashes.length} neue Angebote bei ${result.vendorName || 'Händler'}.`, 'info', 2800);
      }
      vendorOffersState.set(hash, result || { ok: false, error: 'Keine Antwort.' });
    } catch (error) {
      vendorOffersState.set(hash, { ok: false, error: error.message || String(error) });
    } finally {
      vendorOffersLoading.delete(hash);
      render();
    }
  }

  async function loadAllVendors(force) {
    if (!api || typeof api.bungieVendors !== 'function') {
      allVendorsState = { ok: false, error: 'Händler-Übersicht ist nicht verfügbar.' };
      render();
      return;
    }
    if (allVendorsLoading) return;
    allVendorsLoading = true;
    render();
    try {
      const result = await Promise.race([
        api.bungieVendors(allVendorsCharacterId, force === true),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Zeitüberschreitung beim Händler-Abruf.' }), 20000))
      ]);
      allVendorsState = result || { ok: false, error: 'Keine Antwort.' };
      if (allVendorsState.ok && allVendorsState.characterId) allVendorsCharacterId = allVendorsState.characterId;
      if (allVendorsState.ok) {
        const entries = [];
        for (const group of allVendorsState.groups || []) {
          for (const vendor of group.vendors || []) {
            entries.push({ hash: vendor.hash, items: vendor.items || [] });
            recordVendorPriceOffers(vendor.hash, vendor.name, vendor.items || []);
          }
        }
        recordVendorHistoryBatch(entries);
      }
    } catch (error) {
      allVendorsState = { ok: false, error: error.message || String(error) };
    } finally {
      allVendorsLoading = false;
      render();
    }
  }

  function vendorCountdown(value) {
    const date = Date.parse(String(value || ''));
    if (!Number.isFinite(date)) return '';
    const diff = date - Date.now();
    if (diff <= 0) return 'jetzt';
    const days = Math.floor(diff / 86400000);
    if (days > 3650) return 'Dauerhaft';
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (days) return `${days} T ${hours}:${String(minutes).padStart(2, '0')}`;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  function vendorRollNames(item) {
    return (item.perks || [])
      .filter((plug) => plug && plug.n && !/enhancements|shader|ornament|masterwork|tracker|memento|weapon_tiering|crafting|tuning|empty/i.test(String(plug.p || '')))
      .slice(0, 3)
      .map((plug) => String(plug.n));
  }

  function updateVendorRollDom(vendor) {
    if (!host) return;
    const details = host.querySelector(`details.dim-vendor[data-vendor-hash="${CSS.escape(String(vendor.hash))}"]`);
    if (!details) return;
    for (const item of vendor.items || []) {
      const button = details.querySelector(`[data-vendor-item-hash="${Number(item.hash) || 0}"]`);
      if (!button) continue;
      const names = vendorRollNames(item);
      let line = button.querySelector('.dim-vendor-item-roll');
      if (!names.length) {
        if (line) line.remove();
        continue;
      }
      if (!line) {
        line = document.createElement('span');
        line.className = 'dim-vendor-item-roll';
        const costs = button.querySelector('.dim-vendor-costs');
        if (costs) button.insertBefore(line, costs);
        else button.appendChild(line);
      }
      line.textContent = names.join(' · ');
    }
  }

  function updateVendorShopSummary() {
    if (!host || !allVendorsState) return;
    const element = host.querySelector('.dim-vendors-shop');
    if (!element) return;
    let missing = 0;
    let affordable = 0;
    let vendorTotal = 0;
    for (const group of allVendorsState.groups || []) {
      for (const vendor of group.vendors || []) {
        vendorTotal += 1;
        for (const item of vendor.items || []) {
          if (isOwnedHash(item.hash)) continue;
          missing += 1;
          if ((item.costs || []).every((cost) => {
            const material = ((data && data.materials) || []).find((known) => Number(known.hash) === Number(cost.hash));
            return !material || Number(material.quantity) >= Number(cost.quantity);
          })) affordable += 1;
        }
      }
    }
    element.textContent = `${missing} fehlend · ${affordable} bezahlbar · Rolls ${vendorRollsLoaded.size}/${vendorTotal}`;
  }

  async function prefetchVendorRolls() {
    if (!allVendorsState || allVendorsLoading || !api || typeof api.bungieVendorOffers !== 'function') return;
    const vendors = [];
    for (const group of allVendorsState.groups || []) {
      for (const vendor of group.vendors || []) {
        const hash = String(vendor.hash || '');
        if (!hash || vendorRollsLoaded.has(hash)) continue;
        vendors.push(vendor);
      }
    }
    vendors.sort((a, b) => (vendorPinned.has(String(b.hash)) ? 1 : 0) - (vendorPinned.has(String(a.hash)) ? 1 : 0));
    const batch = vendors.slice(0, 3);
    if (!batch.length) return;
    let changed = false;
    for (const vendor of batch) {
      const hash = String(vendor.hash);
      vendorRollsLoaded.add(hash);
      try {
        const result = await api.bungieVendorOffers(hash, false);
        if (!result || !result.ok || !Array.isArray(result.items) || !result.items.length) continue;
        const byHash = new Map(result.items.map((item) => [String(item.hash), item]));
        vendor.items = (vendor.items || []).map((item) => {
          const offer = byHash.get(String(item.hash));
          if (!offer) return item;
          return {
            ...item,
            ...offer,
            costs: (item.costs || []).length ? item.costs : offer.costs,
            categoryName: item.categoryName || offer.categoryName
          };
        });
        recordVendorHistory(hash, result.items);
        updateVendorRollDom(vendor);
        changed = true;
      } catch (error) {
        // Einzelner Händler optional.
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    if (changed) updateVendorShopSummary();
  }

  // Einkaufs-Optimierer: fehlende Angebote, Materiallücken und die
  // besten Käufe (Wunschrolls zuerst) in einer aufklappbaren Liste.
  function renderVendorShoppingOptimizer() {
    const offers = [];
    for (const group of (allVendorsState && allVendorsState.groups) || []) {
      for (const vendor of group.vendors || []) {
        for (const item of vendor.items || []) offers.push({ item, vendor });
      }
    }
    const missing = offers.filter((entry) => !isOwnedHash(entry.item.hash));
    if (!missing.length) return '';
    const materialByName = new Map(((data && data.materials) || []).map((material) => [Number(material.hash), material]));
    const deficits = new Map();
    for (const entry of missing) {
      for (const cost of entry.item.costs || []) {
        const material = materialByName.get(Number(cost.hash));
        if (!material || Number(material.quantity) >= Number(cost.quantity)) continue;
        const key = String(cost.hash);
        const current = deficits.get(key) || { name: cost.name, icon: cost.icon, missing: 0, need: 0, have: Number(material.quantity) || 0 };
        current.missing += Number(cost.quantity) - Number(material.quantity);
        current.need += Number(cost.quantity);
        deficits.set(key, current);
      }
    }
    const affordable = missing.filter((entry) => (entry.item.costs || []).every((cost) => {
      const material = materialByName.get(Number(cost.hash));
      return !material || Number(material.quantity) >= Number(cost.quantity);
    }));
    const scoreOf = (entry) => (entry.item.godRoll ? 100 : entry.item.nearGodRoll ? 80 : 0) + (affordable.includes(entry) ? 20 : 0);
    const top = missing.slice().sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 10);
    const deficitHtml = [...deficits.values()].map((deficit) =>
      `<span class="dim-shopping-deficit">${deficit.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(deficit.icon)}" alt="">` : ''}${esc(deficit.name)}: ${fmt(deficit.missing)} fehlt</span>`
    ).join('');
    const rows = top.map((entry) => {
      const costs = (entry.item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
      const wish = entry.item.godRoll ? ' <span class="inv-tool-god">Wunschroll</span>' : entry.item.nearGodRoll ? ' <span class="inv-tool-chip on">fast</span>' : '';
      return `<div class="dim-shopping-row"><span class="dim-shopping-copy"><strong>${esc(entry.item.name)}${wish}</strong>` +
        `<small>${esc(entry.vendor.name)} · ${esc(entry.item.typeName || 'Angebot')}${costs ? ` · ${esc(costs)}` : ''}</small></span>` +
        `<button type="button" class="btn ghost small" data-vendor-item-open="${esc(entry.vendor.hash)}:${esc(entry.item.hash)}">Details</button></div>`;
    }).join('');
    return `<details class="dim-shopping">` +
      `<summary><span>🛒 Einkaufs-Optimierer</span><b>${missing.length} fehlend</b><span class="dim-shopping-ok">${affordable.length} bezahlbar</span></summary>` +
      `<div class="dim-shopping-body">` +
        (deficitHtml ? `<div class="dim-shopping-deficits"><strong>Materiallücken</strong><div>${deficitHtml}</div></div>` : '<div class="dim-shopping-deficits"><strong>Material</strong><div>Alle bekannten Kosten sind gedeckt.</div></div>') +
        `<div class="dim-shopping-list">${rows}</div>` +
        `<div class="dim-shopping-actions">` +
          `<button type="button" class="btn ghost small" data-vendor-shopping-goals>Top ${Math.min(8, top.length)} als Wochenziele</button>` +
          `<button type="button" class="btn ghost small" data-vendor-shopping-copy>Liste kopieren</button>` +
        `</div>` +
      `</div>` +
    `</details>`;
  }

  function renderVendorDiagnostics(state) {
    const metaAll = (getCfg().bungie && getCfg().bungie.vendorHistoryMeta) || {};
    const rows = [];
    for (const group of (state && state.groups) || []) {
      for (const vendor of group.vendors || []) {
        const hash = String(vendor.hash);
        const meta = metaAll[hash] || null;
        rows.push({
          hash: Number(vendor.hash) || 0,
          name: vendor.name || 'Händler',
          group: group.name || '',
          items: (vendor.items || []).length,
          rolls: vendorRollsLoaded.has(hash),
          lastAt: meta && meta.at ? new Date(meta.at).toISOString() : '',
          count: Number(meta && meta.count) || 0
        });
      }
    }
    const rollCount = rows.filter((row) => row.rolls).length;
    const withHistory = rows.filter((row) => row.lastAt).length;
    return `<details class="dim-vendor-diag"><summary>Händler-Diagnose</summary>` +
      `<div class="dim-vendor-diag-kpis"><span>${rows.length} Händler</span><span>${withHistory} mit Historie</span><span>${rollCount} mit Roll-Daten</span></div>` +
      `<div class="dim-vendor-diag-list">${rows.map((row) => `<div class="dim-vendor-diag-row"><span>${esc(row.name)}</span><small>${esc(row.group)} · Hash ${row.hash}</small><b>${row.items} Angebote</b><em class="${row.rolls ? 'ok' : ''}">${row.rolls ? 'Rolls' : 'ohne Rolls'}</em></div>`).join('') || '<span class="inv-tool-muted">Keine Händler geladen.</span>'}</div>` +
      `<div class="dim-vendor-diag-actions"><button type="button" class="btn ghost small" data-vendor-diag-copy>Diagnose kopieren</button></div>` +
    `</details>`;
  }

  function renderVendorsPage() {
    vendorItemLookup.clear();
    if (!allVendorsState && !allVendorsLoading) {
      setTimeout(() => loadAllVendors(false), 50);
    }
    if (allVendorsLoading && !allVendorsState) {
      return `<section class="dim-vendors-page"><div class="dim-vendors-loading">Händler werden geladen …</div></section>`;
    }
    if (!allVendorsState || allVendorsState.ok === false) {
      return `<section class="dim-vendors-page"><div class="dim-vendors-error">${esc((allVendorsState && allVendorsState.error) || 'Händler konnten nicht geladen werden.')}` +
        `<button type="button" class="btn ghost small" data-vendor-refresh>Erneut laden</button></div></section>`;
    }
    const state = allVendorsState;
    if (!vendorSearch) setTimeout(() => prefetchVendorRolls(), 200);
    const searchNeedle = String(vendorSearch || '').trim().toLocaleLowerCase('de');
    const characters = state.characters || [];
    const charOptions = characters.map((character) =>
      `<option value="${esc(character.id)}" ${character.id === state.characterId ? 'selected' : ''}>${esc(CLASS_NAMES[character.classType] || 'Hüter')} · ${Number(character.light) || 0}</option>`
    ).join('');
    const groups = (state.groups || []).map((group) => {
      const vendorList = (group.vendors || []).slice().sort((a, b) => (vendorPinned.has(String(b.hash)) ? 1 : 0) - (vendorPinned.has(String(a.hash)) ? 1 : 0));
      const vendors = vendorList.map((vendor) => {
        const categories = new Map();
        for (const item of vendor.items || []) {
          if (vendorOnlyMissing && isOwnedHash(item.hash)) continue;
          if (vendorWishOnly && !item.godRoll && !item.nearGodRoll) continue;
          if (searchNeedle) {
            const haystack = `${item.name || ''} ${item.typeName || ''} ${item.categoryName || ''} ${item.description || ''} ${(item.costs || []).map((cost) => cost.name).join(' ')}`.toLocaleLowerCase('de');
            if (!haystack.includes(searchNeedle)) continue;
          }
          const key = item.categoryName || 'Angebote';
          if (!categories.has(key)) categories.set(key, []);
          categories.get(key).push(item);
        }
        if (!categories.size) return '';
        const currencyRow = (vendor.currencies || []).map((currency) =>
          `<span title="${esc(currency.name)}">${fmt(currency.quantity)} ${currency.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(currency.icon)}" alt="">` : ''}</span>`
        ).join('');
        const categoryHtml = [...categories.entries()].map(([category, items]) =>
          `<div class="dim-vendor-category-title">${esc(category)}</div>` +
          `<div class="dim-vendor-items">${items.map((item) => {
            const owned = isOwnedHash(item.hash);
            const unavailable = !item.purchasable || Boolean(item.failure);
            const detailKey = `v-${vendor.hash}-${item.itemIndex}-${item.hash}`;
            vendorItemLookup.set(detailKey, { item, vendor, category });
            const costs = (item.costs || []).map((cost) =>
              `<span title="${esc(cost.name)}">${fmt(cost.quantity)}${cost.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(cost.icon)}" alt="">` : ''}</span>`
            ).join('');
            const rarity = Math.max(0, Math.min(6, Number(item.rarity) || 0));
            const perkNames = vendorRollNames(item);
            const rollLine = perkNames.length ? `<span class="dim-vendor-item-roll">${esc(perkNames.join(' · '))}</span>` : '';
            return `<button type="button" class="dim-vendor-item${unavailable ? ' unavailable' : ''}${owned ? ' owned' : ''} rarity-${rarity}" data-vendor-item="${esc(detailKey)}" data-vendor-item-hash="${Number(item.hash) || 0}" title="${esc(item.name)}${item.typeName ? ` · ${esc(item.typeName)}` : ''}${item.failure ? ` · ${esc(item.failure)}` : ''}">` +
              `<span class="dim-vendor-item-icon">${item.icon ? `<img src="https://www.bungie.net${esc(item.icon)}" alt="" loading="lazy">` : '<b class="dim-vendor-fallback">◆</b>'}${owned ? '<b class="dim-vendor-owned">✓</b>' : ''}</span>` +
              `<span class="dim-vendor-item-name">${esc(item.name)}</span>` +
              rollLine +
              `<span class="dim-vendor-costs">${costs}</span>` +
            `</button>`;
          }).join('')}</div>`
        ).join('');
        const countdown = vendorCountdown(vendor.nextRefreshDate);
        const vendorHash = String(vendor.hash);
        const offerCount = [...categories.values()].reduce((sum, list) => sum + list.length, 0);
        const historyMeta = ((getCfg().bungie && getCfg().bungie.vendorHistoryMeta) || {})[vendorHash] || null;
        const newNames = historyMeta && Array.isArray(historyMeta.newHashes)
          ? historyMeta.newHashes.map((hash) => (vendor.items || []).find((entry) => Number(entry.hash) === Number(hash)))
              .filter(Boolean).slice(0, 3).map((entry) => entry.name)
          : [];
        const historyHtml = historyMeta && historyMeta.at
          ? `<div class="dim-vendor-history" title="Vergleich mit dem vorherigen Abruf">` +
              `<span>Abruf ${new Date(historyMeta.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })}</span>` +
              `<span>${Number(historyMeta.count) || offerCount} Angebote</span>` +
              (historyMeta.newHashes && historyMeta.newHashes.length ? `<span class="fresh">+${historyMeta.newHashes.length} neu${newNames.length ? `: ${esc(newNames.join(', '))}` : ''}</span>` : '') +
              (historyMeta.removedHashes && historyMeta.removedHashes.length ? `<span class="gone">−${historyMeta.removedHashes.length} weg</span>` : '') +
              (historyMeta.prevCount ? `<span>vorher ${historyMeta.prevCount}</span>` : '<span>erster Abruf</span>') +
              `<button type="button" class="dim-vendor-history-clear" data-vendor-history-clear="${vendorHash}" title="Rotationshistorie dieses Händlers löschen">Zurücksetzen</button>` +
            `</div>`
          : '';
        return `<details class="dim-vendor" data-vendor-hash="${vendorHash}"${expandedVendors.has(vendorHash) ? ' open' : ''}>` +
          `<summary><span class="dim-vendor-caret">▶</span>` +
            `${vendor.icon ? `<img class="dim-vendor-icon" src="https://www.bungie.net${esc(vendor.icon)}" alt="">` : '<span class="dim-vendor-icon dim-vendor-fallback">◆</span>'}` +
            `<strong>${esc(vendor.name)}</strong>` +
            `<span class="dim-vendor-location">${esc(vendor.location || '')}</span>` +
            `<span class="dim-vendor-offers">${offerCount} Angebote</span>` +
            `<button type="button" class="dim-vendor-pin${vendorPinned.has(vendorHash) ? ' on' : ''}" data-vendor-pin="${vendorHash}" title="${vendorPinned.has(vendorHash) ? 'Händler abheften' : 'Händler anheften'}" aria-pressed="${vendorPinned.has(vendorHash)}">★</button>` +
            `${countdown ? `<span class="dim-vendor-countdown">${esc(countdown)}</span>` : ''}` +
          `</summary>` +
          `<div class="dim-vendor-body">` +
            `${historyHtml}` +
            `${currencyRow ? `<div class="dim-vendor-currencies">${currencyRow}</div>` : ''}` +
            categoryHtml +
          `</div>` +
        `</details>`;
      }).filter(Boolean).join('');
      if (!vendors) return '';
      return `<h2 class="dim-vendor-group">${esc(group.name)}</h2>${vendors}`;
    }).filter(Boolean).join('');
    const allVendorOffers = [];
    for (const group of state.groups || []) {
      for (const vendor of group.vendors || []) {
        for (const item of vendor.items || []) allVendorOffers.push({ item, vendor });
      }
    }
    const missingOffers = allVendorOffers.filter((entry) => !isOwnedHash(entry.item.hash));
    const affordableOffers = missingOffers.filter((entry) => (entry.item.costs || []).every((cost) => {
      const material = ((data && data.materials) || []).find((known) => Number(known.hash) === Number(cost.hash));
      return !material || Number(material.quantity) >= Number(cost.quantity);
    }));
    const vendorTotal = (state.groups || []).reduce((sum, group) => sum + (group.vendors || []).length, 0);
    const shopSummary = `${missingOffers.length} fehlend · ${affordableOffers.length} bezahlbar · Rolls ${vendorRollsLoaded.size}/${vendorTotal}`;
    return `<section class="dim-vendors-page">` +
      `<div class="dim-vendors-toolbar">` +
        `<label>Charakter<select data-vendor-char>${charOptions}</select></label>` +
        `<label class="week-search dim-vendor-search"><span>Suche</span><input type="search" data-vendor-search value="${esc(vendorSearch)}" placeholder="Item, Perk, Typ, Preis …"></label>` +
        `<label class="inv-tool-check"><input type="checkbox" data-vendor-missing ${vendorOnlyMissing ? 'checked' : ''}> Nur fehlende</label>` +
        `<label class="inv-tool-check"><input type="checkbox" data-vendor-wishlist ${vendorWishOnly ? 'checked' : ''}> Nur Wunschrolls</label>` +
        `<button type="button" class="btn ghost small" data-vendor-refresh>Aktualisieren</button>` +
        `<button type="button" class="btn ghost small" data-vendor-expand>${expandedVendors.size ? 'Alle zuklappen' : 'Alle aufklappen'}</button>` +
        `<span class="dim-vendors-shop" title="Fehlende bzw. mit vorhandenen Materialien bezahlbare Angebote">${esc(shopSummary)}</span>` +
        `<button type="button" class="btn ghost small" data-vendor-shopping-copy>Einkaufsliste</button>` +
        `<span class="dim-vendors-stamp">${state.fetchedAt ? new Date(state.fetchedAt).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}</span>` +
      `</div>` +
      renderVendorShoppingOptimizer() +
      renderVendorDiagnostics(state) +
      `<div class="dim-vendors-hint">Nur Händler mit aktuellen Angeboten werden gelistet. Xûr erscheint Freitag bis Dienstag; Eisenbanner und Prüfungen nur in ihrer Woche. Nicht verfügbare Händler liefern von Bungie keine Angebote – das ist kein Ladefehler.</div>` +
      (groups || '<div class="dim-vendors-loading">Keine Händler mit Angeboten gefunden.</div>') +
    `</section>`;
  }

  function ensureVendorItemRoot() {
    if (vendorItemRoot) return vendorItemRoot;
    vendorItemRoot = document.createElement('div');
    vendorItemRoot.className = 'cmd-palette hidden vendor-item-modal';
    vendorItemRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Händler-Angebot">' +
      '<div class="wn-head"><strong>Angebot</strong><button type="button" class="icon-btn" data-vendor-item-close aria-label="Schließen">✕</button></div>' +
      '<div class="cmp-body"></div>' +
    '</div>';
    document.body.appendChild(vendorItemRoot);
    vendorItemRoot.addEventListener('click', (event) => {
      if (event.target === vendorItemRoot || event.target.closest('[data-vendor-item-close]')) {
        vendorItemRoot.classList.add('hidden');
        return;
      }
      const subOffer = event.target.closest('[data-vendor-suboffer]');
      if (subOffer && vendorItemDetail && Array.isArray(vendorItemDetail.subOffers)) {
        const offer = vendorItemDetail.subOffers.find((entry) => String(entry.hash) === String(subOffer.dataset.vendorSuboffer || ''));
        if (offer) {
          vendorItemDetail = {
            item: offer,
            vendor: vendorItemDetail.subVendor,
            category: offer.categoryName || 'Angebot',
            info: null,
            loadingRolls: !((offer.perks || []).length || (offer.socketColumns || []).length)
          };
          renderVendorItemDetail();
          if (api && typeof api.bungieVendorOffers === 'function' && vendorItemDetail.vendor && vendorItemDetail.vendor.hash) {
            api.bungieVendorOffers(vendorItemDetail.vendor.hash, false).then((result) => {
              const detailed = result && (result.items || []).find((entry) => Number(entry.hash) === Number(offer.hash));
              if (detailed) mergeVendorOffer(detailed);
            }).catch(() => {});
          }
          loadSubVendorOffers(vendorItemDetail);
        }
        return;
      }
      if (event.target.closest('[data-vendor-item-watch]') && vendorItemDetail) {
        const name = vendorItemDetail.item.name;
        const list = ((getCfg().bungie && getCfg().bungie.watchlist) || []).slice();
        const index = list.indexOf(name);
        if (index >= 0) list.splice(index, 1);
        else list.push(name);
        setConfig({ bungie: { watchlist: list.slice(-50) } });
        renderVendorItemDetail();
        toast(index >= 0 ? 'Beobachtung entfernt.' : 'Wird beobachtet.', 'info', 1800);
        return;
      }
      if (event.target.closest('[data-vendor-watch-remove]')) {
        const name = String(event.target.closest('[data-vendor-watch-remove]').dataset.vendorWatchRemove || '');
        const list = ((getCfg().bungie && getCfg().bungie.watchlist) || []).filter((entry) => String(entry) !== name);
        setConfig({ bungie: { watchlist: list } });
        toast('Beobachtung entfernt.', 'info', 1600);
        render();
        return;
      }
      if (event.target.closest('[data-vendor-item-goal]') && vendorItemDetail) {
        const item = vendorItemDetail.item;
        const text = `Händler: ${item.name}${vendorItemDetail.vendor && vendorItemDetail.vendor.name ? ` (${vendorItemDetail.vendor.name})` : ''}`;
        const items = ((getCfg().checklist && getCfg().checklist.items) || []).concat([{
          id: 'c-' + Date.now().toString(36),
          text,
          done: false,
          group: 'own',
          char: '',
          repeat: '',
          doneAt: 0
        }]);
        setConfig({ checklist: { items } });
        toast('Als Wochenziel gespeichert.', 'success', 2200);
        return;
      }
      if (event.target.closest('[data-vendor-item-copy]') && vendorItemDetail) {
        const item = vendorItemDetail.item;
        const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
        const text = `${item.name}${item.typeName ? ` · ${item.typeName}` : ''}${vendorItemDetail.vendor ? ` · ${vendorItemDetail.vendor.name}` : ''}${costs ? ` · ${costs}` : ''}`;
        if (api && typeof api.copyToClipboard === 'function') {
          api.copyToClipboard(text).then(() => toast('Angebot kopiert.', 'success', 1800)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 1800));
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => toast('Angebot kopiert.', 'success', 1800)).catch(() => {});
        }
        return;
      }
      if (event.target.closest('[data-vendor-item-link]') && vendorItemDetail) {
        const item = vendorItemDetail.item;
        const vendorHash = Number(vendorItemDetail.vendor && vendorItemDetail.vendor.hash) || 0;
        const link = `d2tool://vendor?v=${vendorHash}&i=${Number(item.hash) || 0}${vendorItemDetail.vendor && vendorItemDetail.vendor.name ? `&n=${encodeURIComponent(vendorItemDetail.vendor.name)}` : ''}`;
        copyToClipboard(link, 'Deep-Link');
        return;
      }
      if (event.target.closest('[data-vendor-item-search]') && vendorItemDetail) {
        const name = vendorItemDetail.item.name;
        vendorItemRoot.classList.add('hidden');
        if (ctx.searchFor) ctx.searchFor(name);
        return;
      }
      if (event.target.closest('[data-vendor-item-refresh]') && vendorItemDetail) {
        loadAllVendors(true);
        return;
      }
    });
    return vendorItemRoot;
  }

  function vendorRollHtml(item, loading) {
    const isPerk = (plug) => plug && plug.n && !/enhancements|shader|ornament|masterwork|tracker|memento|weapon_tiering|crafting|tuning|empty/i.test(String(plug.p || ''));
    const selected = (Array.isArray(item.perks) ? item.perks : []).filter(isPerk);
    const columns = (Array.isArray(item.socketColumns) ? item.socketColumns : [])
      .map((column) => ({
        ...column,
        options: (column.options || []).filter(isPerk)
      }))
      .filter((column) => column.options.length);
    if (!selected.length && !columns.length) {
      return loading ? '<div class="vendor-roll-loading">Rolls werden vom Händler geladen …</div>' : '';
    }
    const current = selected.length
      ? `<div class="vendor-roll-current"><strong>Aktueller Roll</strong><div class="vendor-roll-chips">${selected.map((plug) =>
        `<span class="vendor-roll-chip current" title="${esc(plug.n)}">${plug.i ? `<img src="https://www.bungie.net${esc(plug.i)}" alt="" loading="lazy">` : ''}<span>${esc(plug.n)}</span></span>`
      ).join('')}</div></div>`
      : '';
    const variants = columns.map((column) => {
      const options = column.options.slice(0, 24);
      return `<div class="vendor-roll-column"><strong>${esc(column.cat || 'Perk-Spalte')}</strong><div class="vendor-roll-chips">${options.map((option) =>
        `<span class="vendor-roll-chip${option.selected ? ' current' : ''}${option.canInsert === false ? ' locked' : ''}" title="${esc(option.n)}${option.d ? ` — ${esc(option.d)}` : ''}">${option.i ? `<img src="https://www.bungie.net${esc(option.i)}" alt="" loading="lazy">` : ''}<span>${esc(option.n)}</span></span>`
      ).join('')}</div></div>`;
    }).join('');
    return `<details class="vendor-detail-section vendor-rolls" open><summary>Angebotene Rolls</summary>` +
      current +
      (variants ? `<div class="vendor-roll-grid">${variants}</div>` : '') +
    `</details>`;
  }

  function vendorStatLabel(hash) {
    const armor = ARMOR_STAT_LABEL[Number(hash)];
    if (armor) return armor;
    const known = {
      155624089: 'Stabilität', 943549884: 'Handhabung', 1240592695: 'Reichweite',
      1345609583: 'Zielhilfe', 3555269338: 'Zoom', 2714457168: 'Luftbeweglichkeit',
      1931675084: 'Magazin', 4043523819: 'Wirkung', 4186504485: 'Nachladetempo',
      2961396640: 'Ladezeit', 3871231066: 'Explosionsradius', 3614673599: 'Geschwindigkeit',
      2523465841: 'Zugzeit', 1546607977: 'Rückstoßrichtung', 1842278586: 'Schadensart'
    };
    return known[Number(hash)] || `Wert ${Number(hash) || ''}`.trim();
  }

  function findSubVendorForItem(item) {
    if (!item || !allVendorsState) return null;
    const vendors = [];
    for (const group of allVendorsState.groups || []) {
      for (const vendor of group.vendors || []) vendors.push(vendor);
    }
    const name = String(item.name || '').trim().toLocaleLowerCase('de');
    if (!name) return null;
    const exact = vendors.find((vendor) => String(vendor.name || '').trim().toLocaleLowerCase('de') === name);
    if (exact) return exact;
    const wantsOffers = /seltsame.*angebote/.test(name) || /angebote.*seltsame/.test(name);
    const wantsGear = /seltsame.*ausr|ausr.*seltsame/.test(name);
    if (wantsOffers) {
      const match = vendors.find((vendor) => /seltsame.*angebote/i.test(String(vendor.name || '')));
      if (match) return match;
    }
    if (wantsGear) {
      const match = vendors.find((vendor) => /seltsame.*ausr|ausr.*seltsame/i.test(String(vendor.name || '')));
      if (match) return match;
    }
    return vendors.find((vendor) => {
      const vendorName = String(vendor.name || '').trim().toLocaleLowerCase('de');
      return vendorName && (name.includes(vendorName) || vendorName.includes(name));
    }) || null;
  }

  function vendorOfferRollChips(offer) {
    const isPerk = (plug) => plug && plug.n && !/enhancements|shader|ornament|masterwork|tracker|memento|weapon_tiering|crafting|tuning|empty/i.test(String(plug.p || ''));
    let perks = (Array.isArray(offer.perks) ? offer.perks : []).filter(isPerk);
    if (!perks.length && Array.isArray(offer.socketColumns)) {
      perks = offer.socketColumns.flatMap((column) => (column.options || []).filter((option) => option.selected && isPerk(option)));
    }
    return perks.slice(0, 8).map((plug) =>
      `<span class="vendor-roll-chip" title="${esc(plug.n)}">${plug.i ? `<img src="https://www.bungie.net${esc(plug.i)}" alt="" loading="lazy">` : ''}<span>${esc(plug.n)}</span></span>`
    ).join('');
  }

  function vendorSubOffersHtml(detail) {
    const vendor = detail && detail.subVendor;
    const offers = (detail && detail.subOffers) || [];
    if (!vendor) return '';
    if (detail.subLoading && !offers.length) return '<div class="vendor-roll-loading">Angebote des Unterhändlers werden geladen …</div>';
    if (!offers.length) return '';
    const rows = offers.slice(0, 30).map((offer) => {
      const costs = (offer.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
      const owned = isOwnedHash(offer.hash);
      const rolls = vendorOfferRollChips(offer);
      return `<button type="button" class="vendor-suboffer" data-vendor-suboffer="${esc(String(offer.hash))}">` +
        `<span>${esc(offer.name)}</span>` +
        `<small>${esc(offer.typeName || 'Angebot')}${costs ? ` · ${esc(costs)}` : ''}${owned ? ' · im Besitz' : ''}</small>` +
        (rolls ? `<span class="vendor-roll-chips">${rolls}</span>` : '') +
      `</button>`;
    }).join('');
    return `<div class="vendor-detail-section vendor-suboffers"><strong>Angebote in „${esc(vendor.name)}“ (${offers.length})</strong>${rows}` +
      (offers.length > 30 ? `<small>… und ${offers.length - 30} weitere</small>` : '') + `</div>`;
  }

  async function loadSubVendorOffers(detail) {
    if (!detail) return;
    let vendor = findSubVendorForItem(detail.item);
    let offers = vendor && Array.isArray(vendor.items) ? vendor.items.slice() : [];
    let vendorHash = vendor && Number(vendor.hash) ? Number(vendor.hash) : 0;
    if ((!vendor || !offers.length) && xurState && Array.isArray(xurState.items)) {
      const name = String(detail.item.name || '').toLocaleLowerCase('de');
      const sellers = [...new Set(xurState.items.map((entry) => String(entry.seller || '')))];
      const seller = sellers.find((entry) => {
        const value = entry.toLocaleLowerCase('de');
        return value && (value === name || name.includes(value) || value.includes(name));
      }) || sellers.find((entry) => /seltsame.*angebote/i.test(entry) && /seltsame.*angebote/i.test(name)) || sellers.find((entry) => /seltsame.*ausr/i.test(entry) && /seltsame.*ausr/i.test(name));
      if (seller) {
        const xurOffers = xurState.items.filter((entry) => String(entry.seller || '') === seller);
        if (xurOffers.length) {
          vendor = { hash: vendorHash, name: seller, items: xurOffers };
          offers = xurOffers;
        }
        if (!vendorHash) {
          if (/seltsame.*angebote/i.test(seller)) vendorHash = 537912098;
          else if (/seltsame.*ausr/i.test(seller)) vendorHash = 3751514131;
        }
      }
    }
    if (!vendor) return;
    detail.subVendor = vendor;
    detail.subOffers = offers;
    detail.subLoading = Boolean(vendorHash && (!offers.length || !offers.some((offer) => (offer.perks || []).length || (offer.socketColumns || []).length)));
    renderVendorItemDetail();
    if (vendorHash && api && typeof api.bungieVendorOffers === 'function') {
      try {
        const result = await api.bungieVendorOffers(vendorHash, false);
        if (result && result.ok && Array.isArray(result.items) && result.items.length) {
          detail.subOffers = result.items;
          detail.subVendor = { hash: vendorHash, name: result.vendorName || vendor.name, items: result.items };
        }
      } catch (error) {
        // Unterhändler-Angebote sind optional.
      }
    }
    detail.subLoading = false;
    renderVendorItemDetail();
  }

  function vendorOwnedComparison(item, statList) {
    const copies = allEntries().filter((entry) => Number(entry.item && entry.item.hash) === Number(item.hash)).map((entry) => entry.item);
    if (!copies.length) return '';
    const totalOf = (copy) => {
      if (Number(copy.baseStatTotal)) return Number(copy.baseStatTotal);
      if (Array.isArray(copy.stats)) return copy.stats.reduce((sum, stat) => sum + (Number(stat.value != null ? stat.value : stat.base) || 0), 0);
      return Number(copy.power) || 0;
    };
    const offerTotal = statList.reduce((sum, stat) => sum + (Number(stat.v != null ? stat.v : stat.value) || 0), 0);
    const best = copies.slice().sort((a, b) => totalOf(b) - totalOf(a))[0];
    const bestTotal = totalOf(best);
    const isArmor = ARMOR_SLOTS.has(Number(item.bucket));
    const better = offerTotal && bestTotal ? offerTotal > bestTotal : false;
    const ownedPerks = new Set();
    for (const copy of copies) {
      for (const perk of copy.perks || []) {
        const name = String(perk && (perk.n || perk.name) || '');
        if (name) ownedPerks.add(name);
      }
    }
    const newPerks = (item.perks || []).map((perk) => String(perk && perk.n || '')).filter((name) => name && !ownedPerks.has(name)).slice(0, 4);
    return `<div class="vendor-detail-section vendor-owned-compare"><strong>Eigene Kopien (${copies.length})</strong>` +
      `<div class="vendor-owned-row"><span>Beste Kopie</span><b>${isArmor ? `Stats ${bestTotal}` : `Power ${bestTotal || '—'}`}</b></div>` +
      (isArmor ? `<div class="vendor-owned-row"><span>Angebot</span><b class="${better ? 'ok' : ''}">Stats ${offerTotal}${offerTotal && bestTotal ? better ? ' · besser' : ' · nicht besser' : ''}</b></div>` : '') +
      (newPerks.length ? `<div class="vendor-owned-row"><span>Neue Perks</span><b>${esc(newPerks.join(' · '))}</b></div>` : '') +
    `</div>`;
  }

  // Kompakter Roll-Check für Händler-Angebote: Wunschroll-Status,
  // Perk-Anzahl und eigene Kopien auf einen Blick.
  function vendorRollHealthHtml(item) {
    const perkNames = (item.perks || [])
      .filter((plug) => plug && plug.n && !/enhancements|shader|ornament|masterwork|tracker|memento|weapon_tiering|crafting|tuning|empty/i.test(String(plug.p || '')))
      .map((plug) => String(plug.n));
    const copies = allEntries().filter((entry) => Number(entry.item && entry.item.hash) === Number(item.hash)).length;
    const exact = item.godRoll === true;
    const near = item.nearGodRoll === true;
    const score = exact ? 100 : near ? 80 : perkNames.length ? Math.min(60, 20 + perkNames.length * 8) : 0;
    const status = exact ? 'Wunschroll' : near ? 'Fast-Wunschroll' : perkNames.length ? 'Roll vorhanden' : 'Keine Roll-Daten';
    const cls = exact ? 'ok' : near ? 'near' : perkNames.length ? 'mid' : 'off';
    return `<div class="vendor-detail-section vendor-roll-health">` +
      `<div class="vendor-roll-health-head"><strong>Roll-Check</strong><span class="vendor-roll-score ${cls}">${score}/100</span></div>` +
      `<div class="vendor-roll-bar"><i style="width:${score}%"></i></div>` +
      `<div class="vendor-owned-row"><span>Status</span><b class="${exact ? 'ok' : ''}">${esc(status)}</b></div>` +
      `<div class="vendor-owned-row"><span>Perks</span><b>${perkNames.length ? esc(perkNames.slice(0, 4).join(' · ')) : '—'}</b></div>` +
      `<div class="vendor-owned-row"><span>Eigene Kopien</span><b>${copies}</b></div>` +
      (near && item.nearMissing ? `<div class="vendor-owned-row"><span>Fehlende Perks</span><b>${Number(item.nearMissing) || 1}</b></div>` : '') +
    `</div>`;
  }

  function vendorItemDetailHtml(detail) {
    if (!detail) return '';
    const { item, vendor, category } = detail;
    const info = detail.info || {};
    const rarity = Math.max(0, Math.min(6, Number(item.rarity || info.r) || 0));
    const rarityLabel = RARITY_LABELS[rarity] || '';
    const ownedCount = allEntries().filter((entry) => Number(entry.item && entry.item.hash) === Number(item.hash)).length;
    const costs = (item.costs || []).map((cost) => {
      const material = ((data && data.materials) || []).find((entry) => Number(entry.hash) === Number(cost.hash));
      const missing = material && Number(material.quantity) < Number(cost.quantity);
      return `<div class="vendor-detail-cost${missing ? ' missing' : ''}">` +
        `${cost.icon ? `<img src="https://www.bungie.net${esc(cost.icon)}" alt="" loading="lazy">` : ''}` +
        `<strong>${fmt(cost.quantity)}</strong><span>${esc(cost.name)}</span>` +
        (material ? `<small>Bestand ${fmt(material.quantity)}${missing ? ' · fehlt' : ''}</small>` : '') +
      `</div>`;
    }).join('');
    const statList = Array.isArray(item.stats) && item.stats.length
      ? item.stats
      : (Array.isArray(info.s) ? info.s : []);
    const stats = statList.map((stat) => {
      const statHash = Number(stat.h != null ? stat.h : stat.hash) || 0;
      const statValue = Number(stat.v != null ? stat.v : stat.value) || 0;
      return `<div class="vendor-detail-stat"><span>${esc(stat.label || vendorStatLabel(statHash))}</span><b>${statValue}</b></div>`;
    }).join('');
    const description = String(item.description || info.d || '').trim();
    const flavor = String(item.flavor || info.f || '').trim();
    const classLabel = Number(item.classType) >= 0 && Number(item.classType) <= 2 ? CLASS_NAMES[Number(item.classType)] : 'Jede Klasse';
    const status = item.failure ? `<span class="inv-tool-warn">${esc(item.failure)}</span>` : item.purchasable === false ? '<span class="inv-tool-warn">Nicht kaufbar</span>' : '<span class="inv-tool-chip on">Verfügbar</span>';
    const watched = ((getCfg().bungie && getCfg().bungie.watchlist) || []).includes(item.name);
    return `<div class="vendor-detail-head">` +
        `<span class="vendor-detail-icon">${item.icon ? `<img src="https://www.bungie.net${esc(item.icon)}" alt="">` : '◆'}</span>` +
        `<div><strong>${esc(item.name || 'Angebot')}</strong>` +
          `<small>${esc(item.typeName || info.t || 'Gegenstand')}${rarityLabel ? ` · ${esc(rarityLabel)}` : ''}${classLabel ? ` · ${esc(classLabel)}` : ''}</small>` +
          `<small>${esc(vendor && vendor.name || 'Händler')}${category ? ` · ${esc(category)}` : ''}</small></div>` +
      `</div>` +
      `<div class="vendor-detail-status">${status}${ownedCount ? ` <span class="inv-tool-owned">${ownedCount}× im Besitz</span>` : ''}</div>` +
      (description ? `<p class="vendor-detail-desc">${esc(description)}</p>` : '') +
      (flavor ? `<p class="vendor-detail-flavor">${esc(flavor)}</p>` : '') +
      vendorSubOffersHtml(detail) +
      (costs ? `<div class="vendor-detail-section"><strong>Kosten</strong><div class="vendor-detail-costs">${costs}</div></div>` : '') +
      (stats ? `<details class="vendor-detail-section" open><summary>Werte</summary><div class="vendor-detail-stats">${stats}</div></details>` : '') +
      vendorOwnedComparison(item, statList) +
      vendorRollHealthHtml(item) +
      vendorRollHtml(item, detail.loadingRolls === true) +
      `<div class="vendor-detail-meta">Slot ${Number(item.bucket) || '—'} · Item-Hash ${Number(item.hash) || '—'}${item.plugCategory ? ` · ${esc(item.plugCategory)}` : ''}</div>` +
      `<div class="vendor-detail-actions">` +
        `<button type="button" class="btn primary small" data-vendor-item-search>Im Inventar suchen</button>` +
        `<button type="button" class="btn ghost small" data-vendor-item-watch>${watched ? 'Beobachtung aus' : 'Beobachten'}</button>` +
        `<button type="button" class="btn ghost small" data-vendor-item-goal>Als Wochenziel</button>` +
        `<button type="button" class="btn ghost small" data-vendor-item-copy>Angebot kopieren</button>` +
        `<button type="button" class="btn ghost small" data-vendor-item-link>Deep-Link</button>` +
        `<button type="button" class="btn ghost small" data-vendor-item-refresh>Händler aktualisieren</button>` +
      `</div>`;
  }

  function renderVendorItemDetail() {
    const root = ensureVendorItemRoot();
    root.querySelector('.cmp-body').innerHTML = vendorItemDetailHtml(vendorItemDetail);
    root.classList.remove('hidden');
  }

  function mergeVendorOffer(offer) {
    if (!offer || !vendorItemDetail || Number(offer.hash) !== Number(vendorItemDetail.item.hash)) return;
    vendorItemDetail.item = {
      ...vendorItemDetail.item,
      ...offer,
      name: vendorItemDetail.item.name || offer.name,
      typeName: vendorItemDetail.item.typeName || offer.typeName,
      icon: vendorItemDetail.item.icon || offer.icon,
      costs: (vendorItemDetail.item.costs || []).length ? vendorItemDetail.item.costs : offer.costs,
      categoryName: vendorItemDetail.item.categoryName || offer.categoryName
    };
    vendorItemDetail.loadingRolls = false;
    renderVendorItemDetail();
  }

  async function openVendorItemDetail(key) {
    const entry = vendorItemLookup.get(String(key || ''));
    if (!entry) return;
    vendorItemDetail = { ...entry, info: null, loadingRolls: true };
    renderVendorItemDetail();
    if (api && typeof api.bungieItemInfo === 'function') {
      try {
        const result = await api.bungieItemInfo([entry.item.hash]);
        if (result && result.ok && result.items && result.items[String(entry.item.hash)] && vendorItemDetail && vendorItemDetail.item.hash === entry.item.hash) {
          vendorItemDetail.info = result.items[String(entry.item.hash)];
          renderVendorItemDetail();
        }
      } catch (error) {
        // Manifest-Zusatzdaten sind optional.
      }
    }
    if (api && typeof api.bungieVendorOffers === 'function' && entry.vendor && entry.vendor.hash) {
      try {
        const result = await api.bungieVendorOffers(entry.vendor.hash, false);
        const offer = result && (result.items || []).find((candidate) => Number(candidate.hash) === Number(entry.item.hash));
        if (offer) mergeVendorOffer(offer);
      } catch (error) {
        // Roll-Daten optional.
      }
    }
    loadSubVendorOffers(vendorItemDetail);
  }

  function openVendorOfferDetail(vendorHash, itemHash) {
    const state = vendorOffersState.get(Number(vendorHash)) || null;
    const item = state && (state.items || []).find((entry) => Number(entry.hash) === Number(itemHash));
    if (!item) {
      toast('Angebot nicht mehr in den geladenen Daten – bitte Händler aktualisieren.', 'info', 2600);
      return;
    }
    const vendor = VENDOR_ALERTS.find((entry) => Number(entry.hash) === Number(vendorHash)) || { hash: Number(vendorHash), name: state.vendorName || 'Händler' };
    vendorItemDetail = { item, vendor, category: item.categoryName || 'Angebot', info: null, loadingRolls: !((item.perks || []).length || (item.socketColumns || []).length) };
    renderVendorItemDetail();
    if (api && typeof api.bungieItemInfo === 'function') {
      api.bungieItemInfo([item.hash]).then((result) => {
        if (result && result.ok && result.items && result.items[String(item.hash)] && vendorItemDetail && vendorItemDetail.item.hash === item.hash) {
          vendorItemDetail.info = result.items[String(item.hash)];
          renderVendorItemDetail();
        }
      }).catch(() => {});
    }
    if (api && typeof api.bungieVendorOffers === 'function') {
      api.bungieVendorOffers(vendorHash, false).then((result) => {
        const offer = result && (result.items || []).find((candidate) => Number(candidate.hash) === Number(item.hash));
        if (offer) mergeVendorOffer(offer);
      }).catch(() => {});
    }
    loadSubVendorOffers(vendorItemDetail);
  }

  // Öffnet ein Händler-Angebot auch dann, wenn nur Vendor-/Item-Hash
  // bekannt sind (Deep-Link, geteilte Angebote). Lädt die Angebote
  // bei Bedarf direkt über die Bungie-API nach.
  async function openVendorOfferDetailByHash(vendorHash, itemHash, vendorName = '') {
    const vh = Number(vendorHash) || 0;
    const ih = Number(itemHash) || 0;
    if (!vh) return;
    let vendor = null;
    for (const group of (allVendorsState && allVendorsState.groups) || []) {
      vendor = (group.vendors || []).find((entry) => Number(entry.hash) === vh) || vendor;
      if (vendor) break;
    }
    let item = vendor && (vendor.items || []).find((entry) => Number(entry.hash) === ih);
    let resolvedName = (vendor && vendor.name) || vendorName || '';
    let offerState = null;
    if (!item && api && typeof api.bungieVendorOffers === 'function') {
      try {
        offerState = await api.bungieVendorOffers(vh, false);
        item = offerState && (offerState.items || []).find((entry) => Number(entry.hash) === ih);
        resolvedName = resolvedName || (offerState && offerState.vendorName) || '';
      } catch (error) {
        // Deep-Link zeigt sonst nur einen Hinweis.
      }
    }
    if (!item) {
      toast('Angebot nicht gefunden – Händler bitte aktualisieren.', 'info', 2800);
      return;
    }
    const detailVendor = { hash: vh, name: resolvedName || 'Händler', items: (offerState && offerState.items) || (vendor && vendor.items) || [] };
    vendorItemDetail = {
      item,
      vendor: detailVendor,
      category: item.categoryName || 'Angebot',
      info: null,
      loadingRolls: !((item.perks || []).length || (item.socketColumns || []).length)
    };
    renderVendorItemDetail();
    if (api && typeof api.bungieItemInfo === 'function') {
      api.bungieItemInfo([item.hash]).then((result) => {
        if (result && result.ok && result.items && result.items[String(item.hash)] && vendorItemDetail && Number(vendorItemDetail.item.hash) === ih) {
          vendorItemDetail.info = result.items[String(item.hash)];
          renderVendorItemDetail();
        }
      }).catch(() => {});
    }
    if (offerState) {
      const offer = (offerState.items || []).find((candidate) => Number(candidate.hash) === ih);
      if (offer) mergeVendorOffer(offer);
    }
    loadSubVendorOffers(vendorItemDetail);
  }

  function renderVendorAlerts() {
    for (const [index, vendor] of VENDOR_ALERTS.entries()) {
      if (!vendorOffersState.has(vendor.hash) && !vendorOffersLoading.has(vendor.hash) && api && typeof api.bungieVendorOffers === 'function') {
        setTimeout(() => loadVendorOffers(vendor.hash, false), index * 700);
      }
    }
    const blocks = VENDOR_ALERTS.map((vendor) => {
      const state = vendorOffersState.get(vendor.hash) || null;
      if (!state) {
        return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(vendor.name)}</span>` +
          `<span class="inv-tool-meta">Angebote prüfen</span>` +
          `<button type="button" class="btn ghost small" data-tool-vendor="${vendor.hash}">Laden</button></div>`;
      }
      if (state.loading) return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(vendor.name)}</span><span class="inv-tool-meta">Lädt …</span></div>`;
      if (state.ok === false) return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(vendor.name)}</span><span class="inv-tool-warn">${esc(state.error || 'Fehler')}</span><button type="button" class="btn ghost small" data-tool-vendor="${vendor.hash}">Erneut</button></div>`;
      const all = state.items || [];
      const isMod = (item) => /mod|enhancements/i.test(`${item.typeName || ''} ${item.plugCategory || ''}`);
      const mods = all.filter(isMod);
      const weapons = all.filter((item) => !isMod(item) && WEAPON_SLOTS.has(Number(item.bucket)));
      const armor = all.filter((item) => !isMod(item) && ARMOR_SLOTS.has(Number(item.bucket)));
      const other = all.filter((item) => !isMod(item) && !WEAPON_SLOTS.has(Number(item.bucket)) && !ARMOR_SLOTS.has(Number(item.bucket)));
      const row = (item, extra = '') => {
        const owned = isOwnedHash(item.hash);
        const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
        const fresh = (state.newHashes || []).includes(Number(item.hash)) ? ' <span class="inv-tool-chip on">neu</span>' : '';
        return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name)}${owned ? ' <span class="inv-tool-owned">im Besitz</span>' : ''}${fresh}${extra}</span>` +
          `<span class="inv-tool-meta">${esc(item.typeName || 'Angebot')}${costs ? ` · ${esc(costs)}` : ''}</span>` +
          `<button type="button" class="btn ghost small" data-vendor-offer="${vendor.hash}:${item.hash}">Details</button></div>`;
      };
      const modRows = mods.slice(0, 8).map((item) => {
        const owned = isOwnedHash(item.hash);
        const missing = (item.costs || []).filter((cost) => {
          const known = ((data && data.materials) || []).find((entry) => Number(entry.hash) === Number(cost.hash));
          return known && Number(known.quantity) < Number(cost.quantity);
        });
        const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
        const recommendation = owned ? '' : missing.length ? ' <span class="inv-tool-warn">sparen</span>' : ' <span class="inv-tool-chip on">kaufen</span>';
        return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name)}${owned ? ' <span class="inv-tool-owned">im Besitz</span>' : ''}${recommendation}${(state.newHashes || []).includes(Number(item.hash)) ? ' <span class="inv-tool-chip on">neu</span>' : ''}</span>` +
          `<span class="inv-tool-meta">${esc(costs)}${missing.length ? ` · <span class="inv-tool-warn">fehlt: ${esc(missing.map((cost) => cost.name).join(', '))}</span>` : ''}</span></div>`;
      }).join('');
      const weaponRows = weapons.slice(0, 8).map((item) => row(item, item.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : '')).join('');
      const armorRows = armor.slice(0, 8).map((item) => row(item)).join('');
      const otherRows = other.slice(0, 8).map((item) => row(item)).join('');
      return `<div class="inv-tool-sub">${esc(vendor.name)} · ${all.length} Angebote${state.cached ? ' · Cache' : ''}</div>` +
        (mods.length ? `<div class="inv-tool-sub">Mods (${mods.length})</div>${modRows}` : '') +
        (weapons.length ? `<div class="inv-tool-sub">Waffen (${weapons.length})</div>${weaponRows}` : '') +
        (armor.length ? `<div class="inv-tool-sub">Rüstung (${armor.length})</div>${armorRows}` : '') +
        (other.length ? `<div class="inv-tool-sub">Sonstige Angebote (${other.length})</div>${otherRows}` : '') +
        (!all.length ? '<span class="inv-tool-muted">Keine Angebote gemeldet.</span>' : '') +
        `<div class="inv-tool-row"><button type="button" class="btn ghost small" data-tool-vendor="${vendor.hash}">Aktualisieren</button></div>`;
    }).join('');
    return card('Händler-Alerts', '🏪', blocks, '', 'wide');
  }

  function renderVendorShoppingList() {
    const entries = [];
    for (const vendor of VENDOR_ALERTS) {
      const state = vendorOffersState.get(vendor.hash);
      if (!state || !state.ok) continue;
      for (const item of (state.items || [])) {
        if (isOwnedHash(item.hash)) continue;
        const isMod = /mod|enhancements/i.test(`${item.typeName || ''} ${item.plugCategory || ''}`);
        const useful = isMod || WEAPON_SLOTS.has(Number(item.bucket)) || ARMOR_SLOTS.has(Number(item.bucket));
        if (useful) entries.push({ vendor: vendor.name, vendorHash: vendor.hash, item });
      }
    }
    const seen = new Set();
    const unique = entries.filter((entry) => {
      const key = `${entry.vendor}|${entry.item.hash}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const rows = unique.slice(0, 12).map((entry) => {
      const costs = (entry.item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
      return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(entry.item.name)}</span>` +
        `<span class="inv-tool-meta">${esc(entry.vendor)} · ${esc(entry.item.typeName || 'Angebot')}${costs ? ` · ${esc(costs)}` : ''}</span>` +
        `<button type="button" class="btn ghost small" data-vendor-offer="${entry.vendorHash}:${entry.item.hash}">Details</button></div>`;
    }).join('');
    const totals = {};
    for (const entry of unique) {
      for (const cost of entry.item.costs || []) {
        const name = String(cost.name || 'Währung');
        totals[name] = (Number(totals[name]) || 0) + (Number(cost.quantity) || 0);
      }
    }
    const budget = Object.entries(totals).map(([name, quantity]) => `${fmt(quantity)} ${name}`).join(' · ');
    return card('Händler-Einkaufsliste', '🛒',
      rows || '<span class="inv-tool-muted">Noch keine fehlenden Händler-Angebote geladen.</span>',
      budget ? `Budget für alle Einträge: ${esc(budget)}` : '', 'wide');
  }

  function renderXur() {
    xurItemsByKey.clear();
    const state = xurState;
    let body = '';
    if (!state) {
      body = '<span class="inv-tool-muted">Xûr-Inventar auf Knopfdruck laden (Bungie-API, freitags bis Dienstag-Reset).</span>';
    } else if (state.ok === false) {
      body = `<span class="inv-tool-warn">${esc(state.error || 'Xûr nicht erreichbar.')}</span>`;
    } else if (!state.active) {
      body = `<span class="inv-tool-muted">Xûr ist gerade nicht da.${state.nextRefreshDate ? ` Nächster Wechsel: ${esc(new Date(state.nextRefreshDate).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}` : ''}</span>`;
    } else {
      const all = (state.items || []).filter((item) => !xurWishOnly || item.godRoll || item.nearGodRoll);
      const wishMatches = (state.items || []).filter((item) => item.godRoll || item.nearGodRoll).length;
      const recommended = all.filter((item) => !item.owned && item.affordable !== false && (item.godRoll || item.betterThanOwned)).length;
      const sellers = Array.isArray(state.sellers) && state.sellers.length
        ? state.sellers
        : [...new Set(all.map((item) => item.seller || 'Xûr'))];
      body = `<div class="inv-tool-sub">${wishMatches} Wishlist-Treffer · ${recommended} sinnvolle${recommended === 1 ? 'r' : ''} Kauf${recommended === 1 ? '' : 'empfehlung'} – Godroll oder besser als deine Kopie.</div>` + sellers.map((seller) => {
        const items = all.filter((item) => (item.seller || 'Xûr') === seller);
        if (!items.length) return '';
        const rows = items.map((item) => {
          const owned = item.owned === true || isOwnedHash(item.hash);
          const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
          const godBadge = item.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : item.nearGodRoll ? ' <span class="inv-tool-near">Fast</span>' : '';
          const newBadge = item.isNew ? ' <span class="inv-tool-chip on">neu</span>' : '';
          const betterBadge = item.betterThanOwned ? ' <span class="inv-tool-chip on">besser</span>' : '';
          const missing = (item.missingCosts || []).map((cost) => cost.name).join(', ');
          const affordBadge = item.affordable === false ? ` <span class="inv-tool-warn">fehlt: ${esc(missing)}</span>` : '';
          const key = String(xurItemsByKey.size);
          xurItemsByKey.set(key, { ...item, owned });
          return `<button type="button" class="inv-tool-xur-row" data-xur-tip="${key}">` +
            `<span class="inv-tool-main">${esc(item.name)}${owned ? ' <span class="inv-tool-owned">im Besitz</span>' : ''}${godBadge}${newBadge}${betterBadge}</span>` +
            `<span class="inv-tool-meta">${esc(costs || 'Preis unbekannt')}${affordBadge}</span></button>`;
        }).join('');
        return `<div class="inv-tool-sub">${esc(seller)}</div>${rows}`;
      }).join('');
      if (!body) body = '<span class="inv-tool-muted">Keine Verkaufs-Items gemeldet.</span>';
      if (xurGoneNames.length) body += `<div class="inv-tool-muted">Nicht mehr im Angebot: ${esc(xurGoneNames.join(', '))}</div>`;
    }
    const refresh = `<button type="button" class="btn ghost small" data-tool-xur ${xurLoading ? 'disabled' : ''}>${state ? 'Aktualisieren' : 'Xûr laden'}</button>`;
    const overlay = `<button type="button" class="btn ghost small" data-tool-xur-overlay>Overlay</button>`;
    const remindOn = Boolean(getCfg().xur && getCfg().xur.remind);
    const remind = `<button type="button" class="btn ghost small" data-tool-xur-remind>${remindOn ? 'Erinnerung aus' : 'Erinnern'}</button>`;
    const wishToggle = `<button type="button" class="btn ghost small${xurWishOnly ? ' active' : ''}" data-tool-xur-wish>${xurWishOnly ? 'Alle anzeigen' : 'Nur Wishlist'}</button>`;
    return card('Xûr', '🛒', body, `<span class="inv-tool-actions">${wishToggle}${remind}${overlay}${refresh}</span>`);
  }

  function duplicateGroups(mode) {
    const groups = new Map();
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !item.instanceId) continue;
      const slot = Number(item.bucket);
      if (mode === 'weapons' && !WEAPON_SLOTS.has(slot)) continue;
      if (mode === 'armor' && !ARMOR_SLOTS.has(slot)) continue;
      const key = `${item.hash}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const result = [];
    for (const [hash, entries] of groups) {
      if (entries.length < 2) continue;
      const scored = entries.map((entry) => ({
        ...entry,
        score: (entry.item.godRoll ? 100000 : 0) + itemPower(entry.item) * 10 +
          (entry.item.masterwork ? 500 : 0) +
          (ARMOR_SLOTS.has(Number(entry.item.bucket)) ? (entry.item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0) : 0)
      })).sort((a, b) => b.score - a.score);
      const keep = scored[0];
      const candidates = scored.slice(1).filter((entry) => !isLocked(entry.item) && !isFav(entry.item) && !entry.item.godRoll);
      if (candidates.length) result.push({ hash, name: keep.item.name, keep, candidates });
    }
    return result.sort((a, b) => b.candidates.length - a.candidates.length);
  }

  function cleanupArmorItems() {
    const seen = new Set();
    const out = [];
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !ARMOR_SLOTS.has(Number(item.bucket))) continue;
      const key = item.instanceId || String(item.hash);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function cleanupBase(item, hash) {
    return Number((item.baseStats || {})[hash] || 0);
  }

  function renderCleanupAssistant() {
    const armor = cleanupArmorItems();
    const bySlot = new Map();
    for (const item of armor) {
      const key = `${Number(item.classType) || 0}|${Number(item.bucket) || 0}`;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push(item);
    }
    const worse = [];
    for (const list of bySlot.values()) {
      for (const item of list) {
        for (const other of list) {
          if (other === item) continue;
          let atLeast = true;
          let better = false;
          for (const { h } of ARMOR_STAT_DEFS) {
            const a = cleanupBase(item, h);
            const b = cleanupBase(other, h);
            if (b < a) { atLeast = false; break; }
            if (b > a) better = true;
          }
          if (atLeast && better) { worse.push({ item, better: other }); break; }
        }
      }
    }
    const signatures = new Map();
    for (const item of armor) {
      const sig = `${Number(item.classType) || 0}|${ARMOR_STAT_DEFS.map(({ h }) => cleanupBase(item, h)).join('/')}|${item.tunedStat ? item.tunedStat.hash : 0}`;
      if (!signatures.has(sig)) signatures.set(sig, []);
      signatures.get(sig).push(item);
    }
    const statDupes = [...signatures.values()].filter((list) => list.length > 1);
    const noSet = armor.filter((item) => !item.setInfo);
    const nonT5 = armor.filter((item) => Number(item.gearTier) && Number(item.gearTier) < 5);
    const rows = worse.slice(0, 8).map(({ item, better }) =>
      `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(ARMOR_SLOT_LABELS[Number(item.bucket)] || 'Rüstung')}</span>` +
      `<span class="inv-tool-main">${esc(item.name)}</span>` +
      `<span class="inv-tool-meta">strikt schlechter als ${esc(better.name)}</span></div>`
    ).join('');
    return card('Vault-Cleanup', '🧹',
      `<div class="inv-tool-row"><span class="inv-tool-main">Strikt schlechter</span><span class="inv-tool-chip ${worse.length ? 'warn' : 'on'}">${worse.length}</span>` +
        `<button type="button" class="btn ghost small" data-tool-search="is:statlower">Anzeigen</button></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Stat-Duplikate</span><span class="inv-tool-chip ${statDupes.length ? 'warn' : 'on'}">${statDupes.length} Gruppen</span>` +
        `<button type="button" class="btn ghost small" data-tool-search="dupe:stats">Anzeigen</button></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Ohne Set-Bonus</span><span class="inv-tool-chip ${noSet.length ? 'warn' : 'on'}">${noSet.length}</span>` +
        `<button type="button" class="btn ghost small" data-tool-search="is:noset">Anzeigen</button></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Unter T5</span><span class="inv-tool-chip">${nonT5.length}</span>` +
        `<button type="button" class="btn ghost small" data-tool-search="is:armor3.0 -is:tier5">Anzeigen</button></div>` +
      (rows ? `<div class="inv-tool-sub">Zerlegen-Kandidaten</div>${rows}` : '<div class="inv-tool-muted">Keine strikt schlechteren Teile gefunden.</div>') +
      `<div class="inv-tool-muted">Tipp: Im Inventar mehrere Teile markieren und vergleichen; „Nicht-Favoriten“ wählt alles außer Favoriten/Godrolls.</div>`,
      '', 'wide');
  }

  function renderDuplicates() {
    const groups = duplicateGroups(duplicateMode);
    const scoreOf = (entry) => {
      const item = entry.item || {};
      const stats = (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      return (item.godRoll ? 100 : 0) + (item.nearGodRoll ? 40 : 0) + (Number(item.power) || 0) + Math.round(stats / 10) + ((Number(item.state) || 0) & 1 ? 15 : 0);
    };
    const rows = groups.slice(0, 12).map((group) => {
      const keepScore = scoreOf(group.keep);
      return `<div class="inv-tool-dup-group"><div class="inv-tool-row"><span class="inv-tool-main">${esc(group.name)}</span>` +
        `<span class="inv-tool-meta">behalten: ${esc(group.keep.item.name)} · Score ${keepScore}${group.keep.item.godRoll ? ' · Godroll' : ''}</span></div>` +
      group.candidates.map((entry) => {
        const score = scoreOf(entry);
        const reason = entry.item.godRoll ? 'Godroll' : entry.item.nearGodRoll ? 'Fast-Godroll' : score >= keepScore ? 'gleichwertig' : 'schwächer';
        return `<div class="inv-tool-row small"><span class="inv-tool-main">↳ ${esc(entry.item.name)}` +
          ((entry.item.perks || []).length ? `<small class="inv-tool-muted"> ${esc((entry.item.perks || []).slice(0, 4).map((perk) => perk.n).filter(Boolean).join(' · '))}</small>` : '') + `</span>` +
          `<span class="inv-tool-meta">${entry.item.power || '—'} · Score ${score} (${reason}) · ${esc(locationLabel(entry))}</span>` +
          (entry.item.instanceId ? `<button type="button" class="btn ghost small" data-tool-dup-tag="${esc(entry.item.instanceId)}">Aussortieren</button>` : '') +
          `</div>`;
      }).join('') + `</div>`;
    }).join('');
    const list = groups.flatMap((group) => group.candidates.map((entry) =>
      `${group.name} (${entry.item.power || '?'} Power, ${locationLabel(entry)})`
    ));
    const buttons = `<span class="inv-tool-seg">` +
      `<button type="button" class="btn ghost small ${duplicateMode === 'weapons' ? 'on' : ''}" data-tool-dup-mode="weapons">Waffen</button>` +
      `<button type="button" class="btn ghost small ${duplicateMode === 'armor' ? 'on' : ''}" data-tool-dup-mode="armor">Rüstung</button>` +
      `</span>`;
    return card('Aussortier-Hilfe', '🧹',
      buttons +
      (rows || '<span class="inv-tool-muted">Keine Kandidaten gefunden – oder alle geschützt/godroll.</span>') +
      (list.length ? `<div class="inv-tool-add"><button type="button" class="btn ghost small" data-tool-copy-dupes>Liste kopieren (${list.length})</button></div>` : ''),
      `<span class="inv-tool-badge">${list.length}</span>`, 'wide');
  }

  function renderOffline() {
    if (!data || !data.offline) return '';
    const stamp = data.cachedAt ? new Date(data.cachedAt).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE') : 'unbekannt';
    return `<div class="inv-tool-offline">⚠ Offline-Stand vom ${esc(stamp)}. Bungie ist nicht erreichbar – Anzeige schreibgeschützt, Aktionen können fehlschlagen.${data.offlineError ? ` <small>${esc(data.offlineError)}</small>` : ''}</div>`;
  }

  async function loadActivities(force) {
    if (activitiesLoading) return;
    if (!api || typeof api.bungieActivities !== 'function') {
      activitiesState = { ok: false, error: 'Aktivitäts-Abruf ist nicht verfügbar.' };
      render();
      return;
    }
    activitiesLoading = true;
    render();
    try {
      activitiesState = await api.bungieActivities(force === true);
    } catch (error) {
      activitiesState = { ok: false, error: error.message || String(error) };
    } finally {
      activitiesLoading = false;
      render();
    }
  }

  async function loadCraftables(force) {
    if (craftablesLoading) return;
    if (!api || typeof api.bungieCraftables !== 'function') {
      craftablesState = { ok: false, error: 'Crafting-Abruf ist nicht verfügbar.' };
      render();
      return;
    }
    craftablesLoading = true;
    render();
    try {
      craftablesState = await api.bungieCraftables(force === true);
    } catch (error) {
      craftablesState = { ok: false, error: error.message || String(error) };
    } finally {
      craftablesLoading = false;
      render();
    }
  }

  // Aktivitäten und Crafting werden erst beim Öffnen der Werkzeuge
  // geladen; der normale Inventar-Abruf bleibt dadurch schnell.
  function ensureToolData() {
    if (!host || host.classList.contains('hidden')) return;
    const hasActivities = data && data.activities && Object.keys(data.activities).length;
    const hasCraftables = data && data.craftables && data.craftables.length;
    if (toolView === 'overview' && !activitiesState && !activitiesLoading && !hasActivities) loadActivities(false);
    if (toolView === 'collection' && !craftablesState && !craftablesLoading && !hasCraftables) loadCraftables(false);
    if (toolView === 'collection' && !triumphsState && !triumphsLoading) loadTriumphs(false);
    if (toolView === 'week') {
      if (!milestonesState && !milestonesLoading) loadMilestones();
      if (!triumphsState && !triumphsLoading) loadTriumphs(false);
      if (!nightfallState && !nightfallLoading) loadNightfall(false);
      if (!clanState && !clanLoading) loadClan(false);
      if (!xurState && !xurLoading) loadXur();
    }
    if (toolView === 'vendor') {
      if (!allVendorsState && !allVendorsLoading) loadAllVendors(false);
      if (!xurState && !xurLoading) loadXur();
    }
  }

  const TOOL_VIEWS = [
    { key: 'overview', label: 'Übersicht', icon: '🧭', title: 'Übersicht', desc: 'Aktivität, Champions, Power und Vorrat auf einen Blick.' },
    { key: 'builds', label: 'Builds', icon: '🛠', title: 'Builds & Optimierung', desc: 'Stats prüfen, Rüstung vergleichen und Loadouts optimieren.' },
    { key: 'collection', label: 'Sammlung', icon: '📦', title: 'Sammlung & Aufräumen', desc: 'Crafting, Duplikate, Wunschlisten und Vault-Cleanup.' },
    { key: 'week', label: 'Woche', icon: '📅', title: 'Woche & Fortschritt', desc: 'Reset, Poststelle, Triumphs, Nightfall und Clan.' },
    { key: 'vendor', label: 'Händler', icon: '🛒', title: 'Händler & Xûr', desc: 'Angebote, Einkaufsliste und Bungie-Status.' }
  ];

  function viewMeta(key) {
    return TOOL_VIEWS.find((view) => view.key === key) || TOOL_VIEWS[0];
  }

  function postmasterCount() {
    return Object.values((data && data.postmaster) || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }

  function dataAgeChip() {
    const at = Number(data && data.fetchedAt) || 0;
    if (!at) return '';
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 45) return '';
    const label = mins >= 120 ? Math.round(mins / 60) + ' h alt' : mins + ' Min alt';
    return '<button type="button" class="chip chip-warn" data-tool-refresh title="Inventar-Daten sind veraltet – jetzt aktualisieren">Daten ' + label + '</button>';
  }

  function manifestChip() {
    const cachedAt = Number(data && data.manifestCachedAt) || 0;
    if (!cachedAt) return '';
    const days = Math.floor((Date.now() - cachedAt) / 86400000);
    if (days < 14) return '';
    return '<button type="button" class="chip chip-warn" data-manifest-refresh title="Manifest-Daten sind veraltet – jetzt neu laden">Manifest ' + days + ' T alt</button>';
  }

  function queueChip() {
    if (!queueState || queueState.ok === false) return '';
    const waiting = Number(queueState.waiting) || 0;
    const last429 = Number(queueState.last429At) || 0;
    const throttled = waiting > 0 || (last429 && Date.now() - last429 < 90000);
    if (!throttled) return '';
    const label = waiting > 0 ? 'Bungie drosselt · ' + waiting : 'Bungie drosselt';
    return '<button type="button" class="chip chip-warn" data-queue-info title="Bungie bremst Anfragen (429). Aktionen laufen in der Warteschlange.">' + label + '</button>';
  }

  function renderHeader() {
    const coverage = championCoverage();
    const available = new Set();
    for (const row of coverage) {
      for (const names of row.coverage) {
        for (const name of names) available.add(name);
      }
    }
    const dataAge = Number(data && data.fetchedAt) ? Math.max(0, Math.round((Date.now() - Number(data.fetchedAt)) / 60000)) : null;
    const maxLight = Math.max(0, ...((data && data.characters) || []).map((character) => Number(character.light) || 0));
    const godrolls = Number(data && data.godrolls) || 0;
    const pm = postmasterCount();
    const meta = viewMeta(toolView);
    const kpi = (key, label, value, hint, tone = '') =>
      `<button type="button" class="inv-tools-kpi${tone ? ` ${tone}` : ''}" data-tool-kpi="${key}"><span>${esc(label)}</span><b>${esc(String(value))}</b><small>${esc(hint)}</small></button>`;
    return `<section class="inv-tools-hero">` +
      `<div class="inv-tools-hero-copy">` +
        `<span class="inv-tools-kicker">Werkzeugzentrale · Destiny 2</span>` +
        `<h3>${esc(meta.title)}</h3>` +
        `<p>${esc(meta.desc)}</p>` +
        `<div class="inv-tools-kpis">` +
          kpi('power', 'Macht', maxLight || '—', 'höchster Charakter', 'accent') +
          kpi('champions', 'Champions', `${available.size}/3`, available.size >= 3 ? 'abgedeckt' : 'fehlt', available.size >= 3 ? 'ok' : 'warn') +
          kpi('godrolls', 'Godrolls', godrolls, 'im Inventar', godrolls ? 'ok' : '') +
          kpi('postmaster', 'Postfach', pm, pm >= 15 ? 'fast voll' : pm ? 'Items' : 'leer', pm >= 15 ? 'warn' : '') +
          kpi('reset', 'Reset', nextResetLabel(), 'bis Weekly', '') +
        `</div>` +
      `</div>` +
      `<div class="inv-tools-hero-side">` +
        `<div class="inv-tools-hero-actions">` +
          `<button type="button" class="btn primary small" data-tool-quick-refresh>↻ Daten aktualisieren</button>` + manifestChip() + dataAgeChip() + queueChip() +
          `<button type="button" class="btn ghost small" data-tool-quick-loadouts>Loadout-Editor</button>` +
          `<button type="button" class="btn ghost small" data-tool-expand>${foldsOpen === true ? 'Alle einklappen' : 'Alle aufklappen'}</button>` +
          `<button type="button" class="btn ghost small" data-tool-close aria-label="Werkzeuge schließen">✕</button>` +
        `</div>` +
        `<div class="inv-tools-search-row">` +
          `<input type="search" class="inv-tool-card-search" data-tool-card-search placeholder="Karten filtern …" value="${esc(cardSearch)}">` +
          `<button type="button" class="btn ghost small" data-tool-focus>${focusMode ? 'Fokus aus' : 'Fokus'}</button>` +
          `<details class="inv-more"><summary class="btn ghost small">Mehr</summary><div class="inv-more-menu">` +
            `<button type="button" class="btn ghost small" data-tool-stats-hud>Stat-HUD</button>` +
            `<button type="button" class="btn ghost small" data-tool-diag>Support-Paket</button>` +
          `</div></details>` +
        `</div>` +
        `<div class="inv-tools-hero-meta">${dataAge != null ? `<span class="inv-tools-chip${dataAge > 15 ? ' warn' : ''}">Daten ${dataAge <= 1 ? 'aktuell' : `vor ${dataAge} Min.`}</span>` : '<span class="inv-tools-chip warn">Kein Snapshot</span>'}` +
          `${sessionLoot.length ? `<span class="inv-tools-chip accent">Neu ${sessionLoot.length}</span>` : ''}` +
        `</div>` +
      `</div>` +
    `</section>`;
  }

  function renderNav() {
    return `<div class="inv-tools-nav">${TOOL_VIEWS.map((view) =>
      `<button type="button" class="inv-tools-nav-btn ${toolView === view.key ? 'on' : ''}" data-tool-view="${view.key}">` +
        `<span class="inv-tools-nav-icon">${view.icon}</span><span>${view.label}</span>` +
        `${view.key === 'collection' && sessionLoot.length ? `<span class="inv-tools-nav-badge">${sessionLoot.length}</span>` : ''}` +
        `${view.key === 'week' && postmasterCount() >= 15 ? `<span class="inv-tools-nav-badge warn">!</span>` : ''}` +
      `</button>`
    ).join('')}</div>`;
  }

  async function loadTriumphs(force) {
    if (triumphsLoading) return;
    if (!api || typeof api.bungieTriumphs !== 'function') {
      triumphsState = { ok: false, error: 'Triumphs sind nicht verfügbar.' };
      render();
      return;
    }
    triumphsLoading = true;
    render();
    try {
      triumphsState = await api.bungieTriumphs(force === true);
      if (triumphsState && triumphsState.ok !== false) {
        recordTriumphHistory(triumphsState);
        syncTrackedRecords(triumphsState.roots || []);
      }
    } catch (error) {
      triumphsState = { ok: false, error: error.message || String(error) };
    } finally {
      triumphsLoading = false;
      render();
    }
  }

  function renderTriumphs() {
    if (!triumphsState && !triumphsLoading) loadTriumphs(false);
    const state = triumphsState;
    let body = '';
    if (!state) body = `<span class="inv-tool-muted">${triumphsLoading ? 'Lade Triumphs …' : 'Triumphs auf Knopfdruck laden.'}</span>`;
    else if (state.ok === false) body = `<span class="inv-tool-warn">${esc(state.error || 'Nicht erreichbar.')}</span>`;
    else {
      const score = state.score || {};
      const seals = state.seals || [];
      const rows = seals.map((seal) => {
        const pct = Math.min(100, Math.round((Number(seal.progress) || 0) / (Number(seal.completion) || 1) * 100));
        return `<div class="inv-tool-row"><span class="inv-tool-slot">${seal.complete ? '🏆' : '🔒'}</span>` +
          `<span class="inv-tool-main">${esc(seal.name)}</span>` +
          `<span class="inv-tool-meta">${Number(seal.progress) || 0}/${Number(seal.completion) || 0} · ${pct}%${seal.complete ? '' : ` · fehlen ${Math.max(0, (Number(seal.completion) || 0) - (Number(seal.progress) || 0))}`}</span>` +
          `<span class="inv-tool-chip ${seal.complete ? 'on' : ''}">${seal.complete ? 'freigeschaltet' : 'offen'}</span></div>`;
      }).join('');
      body = `<div class="inv-tool-sub">Aktiv ${fmt(score.active)} · Lebenszeit ${fmt(score.lifetime)} · Alt ${fmt(score.legacy)}</div>` +
        `<div class="inv-tool-sub">Siegel ${Number(state.completedSeals) || 0}/${seals.length}</div>` +
        (rows || '<span class="inv-tool-muted">Keine Siegel-Daten.</span>');
    }
    return card('Triumphs & Siegel', '🏅', body,
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-triumphs ${triumphsLoading ? 'disabled' : ''}>Aktualisieren</button></span>`, 'wide');
  }

  async function loadClan(force) {
    if (clanLoading) return;
    if (!api || typeof api.bungieClan !== 'function') {
      clanState = { ok: false, error: 'Clan-Abruf ist nicht verfügbar.' };
      render();
      return;
    }
    clanLoading = true;
    render();
    try {
      clanState = await api.bungieClan(force === true);
    } catch (error) {
      clanState = { ok: false, error: error.message || String(error) };
    } finally {
      clanLoading = false;
      render();
    }
  }

  function renderClan() {
    if (!clanState && !clanLoading) loadClan(false);
    const state = clanState;
    let body = '';
    if (!state) body = `<span class="inv-tool-muted">${clanLoading ? 'Lade Clan …' : 'Clan-Roster auf Knopfdruck laden.'}</span>`;
    else if (state.ok === false) body = `<span class="inv-tool-warn">${esc(state.error || 'Nicht erreichbar – ggf. fehlt der ReadGroups-Scope.')}</span>`;
    else if (!state.clan) body = '<span class="inv-tool-muted">Kein Clan gefunden (oder ReadGroups-Scope fehlt).</span>';
    else {
      const members = state.members || [];
      const filter = clanFilter.trim().toLowerCase();
      const visible = filter ? members.filter((member) => String(member.name || '').toLowerCase().includes(filter)) : members;
      const onlineText = (member) => {
        let at = Number(member.lastOnline) || 0;
        if (at && at < 1e12) at *= 1000;
        return at ? `zuletzt ${loadoutUsedLabel(at)}` : '';
      };
      body = `<div class="inv-tool-sub">${esc(state.clan.name || 'Clan')}${state.clan.motto ? ` · „${esc(state.clan.motto)}“` : ''} · ${Number(state.clan.memberCount) || members.length} Mitglieder</div>` +
        `<div class="inv-tool-opt-fields"><label>Mitglied suchen<input type="search" data-tool-clan-filter value="${esc(clanFilter)}" placeholder="Name filtern …"></label></div>` +
        (visible.slice(0, 40).map((member) => `<div class="inv-tool-row"><span class="inv-tool-main">${esc(streamerMode ? '•••' : member.name)}</span>` +
          `<span class="inv-tool-meta">${member.joinDate ? `seit ${esc(new Date(member.joinDate).toLocaleDateString(window.i18n ? window.i18n.locale() : 'de-DE'))}` : ''}${onlineText(member) ? ` · ${esc(onlineText(member))}` : ''}</span></div>`).join('') ||
          '<span class="inv-tool-muted">Keine Mitglieder für diesen Filter.</span>');
    }
    return card('Clan-Roster', '🛡', body,
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-clan ${clanLoading ? 'disabled' : ''}>Aktualisieren</button></span>`, 'wide');
  }

  async function loadNightfall(force) {
    if (nightfallLoading) return;
    if (!api || typeof api.bungieNightfall !== 'function') {
      nightfallState = { ok: false, error: 'Nightfall-Daten sind nicht verfügbar.' };
      render();
      return;
    }
    nightfallLoading = true;
    render();
    try {
      nightfallState = await api.bungieNightfall(force === true);
    } catch (error) {
      nightfallState = { ok: false, error: error.message || String(error) };
    } finally {
      nightfallLoading = false;
      render();
    }
  }

  function renderWeekLoot() {
    if (!nightfallState && !nightfallLoading) setTimeout(() => loadNightfall(false), 80);
    const rows = (nightfallState && Array.isArray(nightfallState.items)) ? nightfallState.items : [];
    const body = rows.length
      ? rows.map((row) => '<div class="inv-tool-row"><span class="inv-tool-main">' + esc(row.name || 'Nightfall') + '</span>' +
          '<span class="inv-tool-meta">' + esc(String(row.milestone || '')) + '</span></div>' +
          (row.modifiers || []).slice(0, 5).map((modifier) =>
            '<div class="inv-tool-muted">· ' + esc(modifier.name || '') + (modifier.desc ? ' – ' + esc(String(modifier.desc).slice(0, 70)) : '') + '</div>'
          ).join('')
        ).join('')
      : (nightfallState && nightfallState.ok === false
        ? '<span class="inv-tool-muted">' + esc(nightfallState.error || 'Nightfall-Daten nicht verfügbar.') + '</span>'
        : '<span class="inv-tool-muted">Nightfall-Daten werden geladen …</span>');
    return card('Nightfall & Rotation', '🌀',
      body +
      '<div class="inv-tool-muted">Strike und Modifikatoren dieser Woche. Die Wochen-Waffe liefert die Bungie-API nicht zuverlässig – sie steht im Spiel-Director.</div>',
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-week-loot-load>Aktualisieren</button></span>', 'wide');
  }

  function renderNightfall() {
    if (!nightfallState && !nightfallLoading) loadNightfall(false);
    const state = nightfallState;
    let body = '';
    if (!state) body = `<span class="inv-tool-muted">${nightfallLoading ? 'Lade Nightfall …' : 'Nightfall/GM-Modifikatoren laden.'}</span>`;
    else if (state.ok === false) body = `<span class="inv-tool-warn">${esc(state.error || 'Nicht erreichbar.')}</span>`;
    else {
      const items = state.items || [];
      body = items.length
        ? items.map((entry) => `<div class="inv-tool-sub">${esc(entry.name)}${entry.milestone ? ` · ${esc(entry.milestone)}` : ''}</div>` +
            (entry.modifiers.length
              ? entry.modifiers.map((modifier) => `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(modifier.name)}</span>` +
                  `<span class="inv-tool-meta">${esc(modifier.desc || '')}</span></div>`).join('')
              : '<span class="inv-tool-muted">Keine Modifikatoren im Manifest.</span>')).join('')
        : '<span class="inv-tool-muted">Keine Nightfall-/GM-Aktivität in den Milestones gefunden.</span>';
    }
    return card('Nightfall & GM', '🌑', body,
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-nightfall ${nightfallLoading ? 'disabled' : ''}>Aktualisieren</button></span>`, 'wide');
  }

  async function loadLootSources(force) {
    if (lootSourcesLoading) return;
    if (!api || typeof api.bungieLootSources !== 'function') {
      lootSourcesState = { ok: false, error: 'Loot-Quellen sind nicht verfügbar.' };
      render();
      return;
    }
    lootSourcesLoading = true;
    render();
    try {
      lootSourcesState = await api.bungieLootSources(force === true);
    } catch (error) {
      lootSourcesState = { ok: false, error: error.message || String(error) };
    } finally {
      lootSourcesLoading = false;
      render();
    }
  }

  const SOURCE_DROP_HINTS = {
    raid: 'Endvendor & Spoils',
    dungeon: 'Boss-Checkpoints',
    season: 'Saison-Vendor',
    vanguard: 'Vorhut-Rotation',
    pvp: 'Ritual-Rotation',
    destination: 'Zielort-Rotation',
    other: 'Direkt-Drop'
  };

  const LOOT_SOURCE_GUIDES = [
    {
      id: 'raid', tab: 'raid', label: 'Raid', match: /raid/i,
      blurb: '6-Spieler-Endgame. Zwei Raids sind pro Woche featured und dann komplett farmbar. Encounter lassen sich wiederholen; der Endvendor verkauft gezielte Red-Border-Waffen für Spoils of Conquest. Master-Challenges geben Adept-Waffen.',
      tags: ['Feuerteam 6', 'Featured-Rotation', 'Spoils'],
      tip: 'Featured-Raid wählen, Ziel-Encounter farmen und 20 Spoils für einen gezielten Red-Border beim Endvendor sparen.'
    },
    {
      id: 'dungeon', tab: 'dungeon', label: 'Dungeon', match: /dungeon|verlies/i,
      blurb: '3-Spieler-Endgame. Zwei Dungeons sind pro Woche featured und farmbar. Die Exotic-Waffe droppt meist beim Endboss; Checkpoints erlauben einzelne Bosse.',
      tags: ['Feuerteam 3', 'Checkpoints', 'Featured-Rotation'],
      tip: 'Boss-Checkpoint suchen, gewünschten Encounter wiederholen und in der Featured-Woche auf Tier-5-Beute spielen.'
    },
    {
      id: 'season', tab: 'season', label: 'Saison', match: /saison|season|episode/i,
      blurb: 'Saisonale Aktivitäten, Vendor-Fokussierung und Engramme. Red-Border-Waffen kommen aus Saisonaktivitäten, dem Saisonvendor und fokussierten Engrammen; ältere Saisons rotieren über Legacy-Quellen.',
      tags: ['Saisonvendor', 'Fokussierung', 'Wöchentlich'],
      tip: 'Saisonvendor und fokussierte Engramme nutzen; Red-Border-Waffen zuerst für offene Baupläne ausgeben.'
    },
    {
      id: 'nightfall', tab: 'vanguard', label: 'Dämmerung', match: /nightfall|grandmaster|dämmerung/i,
      blurb: 'Wöchentlich rotierende Nightfall-Waffe. Höhere Schwierigkeiten und Grandmaster verbessern die Chancen; Vanguard-Rangaufstiege geben zusätzliche Engramme.',
      tags: ['Nightfall', 'Grandmaster', 'Vanguard'],
      tip: 'Wöchentliche Nightfall-Waffe prüfen und für die beste Chance Grandmaster mit Champion-Abdeckung spielen.'
    },
    {
      id: 'vanguard', tab: 'vanguard', label: 'Vorhut Ops', match: /vorhut|vanguard|strike|zavala|ritual-playlist|ritual playlist/i,
      blurb: 'Vorhut-Ops sind die Standard-Strike-Playlist. Abschlüsse, wöchentliche Challenges und Rangaufstiege bei Commander Zavala liefern Ausrüstung und Engramme.',
      tags: ['Strike-Playlist', 'Zavala', 'Rangaufstieg'],
      tip: 'Wöchentliche Vorhut-Challenges spielen, Rang aufbauen und Zavala-Engramme für gezielte Waffen öffnen.'
    },
    {
      id: 'ironbanner', tab: 'pvp', label: 'Eisenbanner', match: /iron banner|eisenbanner/i,
      blurb: 'Woche-langes Crucible-Event bei Saladin. Rangaufstiege, tägliche Challenges und fokussierte Engramme; Eisenbanner-Ausrüstung zählt für Sets.',
      tags: ['Crucible-Event', 'Saladin', 'Woche'],
      tip: 'Tägliche Challenges mitnehmen, Rang aufbauen und Engramme auf die gewünschte Waffe fokussieren.'
    },
    {
      id: 'trials', tab: 'pvp', label: 'Prüfungen', match: /trials|prüfung/i,
      blurb: 'Wochenend-PvP bei Saint-14. Passagen, Siege und Flawless belohnen mit Trials-Engrammen, fokussierten Waffen und Lighthouse-Loot.',
      tags: ['Wochenende', 'Saint-14', 'Lighthouse'],
      tip: 'Passage wählen, Siege sammeln und Engramme nach dem Wochenend-Run beim Händler fokussieren.'
    },
    {
      id: 'crucible', tab: 'pvp', label: 'Schmelztiegel', match: /schmelztiegel|crucible|\bpvp\b/i,
      blurb: 'PvP-Playlists mit wöchentlichen Challenges und Rangaufstiegen bei Shaxx. Eisenbanner und Prüfungen haben eigene Rotations- und Fokus-Belohnungen.',
      tags: ['Shaxx', 'Rangaufstieg', 'Wöchentlich'],
      tip: 'Wöchentliche Crucible-Challenges abschließen und Rangaufstiegs-Engramme beim Händler öffnen.'
    },
    {
      id: 'gambit', tab: 'pvp', label: 'Gambit', match: /gambit/i,
      blurb: 'PvE/PvP-Modus beim Drifter. Rangaufstiege, wöchentliche Challenges und fokussierte Engramme.',
      tags: ['Drifter', 'Rangaufstieg', 'Wöchentlich'],
      tip: 'Wöchentliche Gambit-Challenges spielen und Rangaufstiegs-Engramme gezielt fokussieren.'
    },
    {
      id: 'dares', tab: 'other', label: 'Dares', match: /dares|spielshow|eternity/i,
      blurb: 'Wöchentlich rotierender Spielshow-Modus. Truhe am Ende, wechselnde Waffen und Sternenstaub; gute Quelle für ältere Ausrüstung.',
      tags: ['Rotation', 'Truhe', 'Legacy-Loot'],
      tip: 'Wöchentliche Rotation prüfen und die Truhe am Ende für wechselnde Waffen und Materialien öffnen.'
    },
    {
      id: 'exoticmission', tab: 'other', label: 'Exotic-Mission', match: /exotic mission|exotische mission|weekly mission|wöchentliche mission|operation|presage|vox|seraph/i,
      blurb: 'Wöchentlich rotierende Exotic-Mission. Seltene Waffen, Katalysatoren und Patterns; pro Woche gibt es oft eine garantierte Belohnung.',
      tags: ['Wöchentlich', 'Exotic', 'Katalysator'],
      tip: 'Wöchentliche Mission einmal pro Charakter spielen und die garantierte Waffe bzw. den Katalysator mitnehmen.'
    },
    {
      id: 'destination', tab: 'destination', label: 'Zielort', match: /zielort|erkund|destination|patrouille|öffentlich|planet|mond|nessus|europa|kepler|bleiche herz|träumende stadt|thronwelt|\betz\b|kosmodrom|neomuna|titan|merkur|saturn/i,
      blurb: 'Patrouillen, öffentliche Events, verlorene Sektoren und Ziele auf den Destinationen. Wöchentliche Powerful-/Pinnacle-Quellen; gut für Einstiegsausrüstung.',
      tags: ['Open World', 'Wöchentlich', 'Pinnacle'],
      tip: 'Wöchentliche Destination-Ziele und verlorene Sektoren abhaken; öffentliche Events für schnelle Beute mitnehmen.'
    },
    {
      id: 'vendor', tab: 'other', label: 'Händler', match: /banshee|xûr|xur|rahool|händler|vendor|ada-1|engramm|öffne|rangaufstieg|paket/i,
      blurb: 'Händler wie Banshee-44, Xûr, Rahool und Saisonvendoren. Fokussierung, Rangaufstiege und wöchentliche Rotationen.',
      tags: ['Fokussierung', 'Rotation', 'Engramme'],
      tip: 'Wöchentliches Händlerangebot prüfen, Engramme fokussieren und Rangaufstiegspakete gezielt öffnen.'
    },
    {
      id: 'crafting', tab: 'other', label: 'Waffenbau', match: /enklave|relikt|bauplan|craft|formen/i,
      blurb: 'Enklave und Relikt: Baupläne extrahieren, Waffen formen und mit verbesserten Perks aufwerten.',
      tags: ['Enklave', 'Bauplan', 'Relikt'],
      tip: 'Tiefenblick-Waffen extrahieren, Bauplan vervollständigen und die Waffe anschließend am Relikt formen.'
    },
    {
      id: 'expansion', tab: 'other', label: 'Erweiterung', match: /kampagne|erweiterung|final shape|lightfall|witch queen|shadowkeep|forsaken/i,
      blurb: 'Kampagnen und Erweiterungsaktivitäten. Oft exklusive Waffen, Rüstungssets und saisonale Story-Quellen.',
      tags: ['Kampagne', 'Story', 'Exklusiv'],
      tip: 'Kampagne abschließen und die wöchentlichen Erweiterungsaktivitäten für Powerful- und Pinnacle-Beute mitnehmen.'
    }
  ];
  const LOOT_SOURCE_OTHER = {
    id: 'other', tab: 'other', label: 'Quelle',
    blurb: 'Beutequelle aus dem Bungie-Manifest. Öffne die Aktivität oder den Händler und prüfe die aktuelle wöchentliche Rotation.',
    tags: ['Manifest', 'Aktivität', 'Rotation'],
    tip: 'Quelle im Spiel öffnen und die wöchentliche Rotation sowie fokussierte Engramme prüfen.'
  };

  function lootSourceGuide(source) {
    const text = String(source || '');
    return LOOT_SOURCE_GUIDES.find((guide) => guide.match.test(text)) || LOOT_SOURCE_OTHER;
  }

  function renderLootSources() {
    if (!lootSourcesState && !lootSourcesLoading) loadLootSources(false);
    const state = lootSourcesState;
    if (!state) {
      return `<section class="sources-page"><div class="sources-loading">${lootSourcesLoading ? 'Lade Loot-Quellen …' : 'Loot-Quellen werden geladen.'}</div></section>`;
    }
    if (state.ok === false) {
      return `<section class="sources-page"><div class="sources-loading">${esc(state.error || 'Loot-Quellen nicht erreichbar.')}` +
        ` <button type="button" class="btn ghost small" data-tool-loot>Erneut laden</button></div></section>`;
    }
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const redBorder = Array.isArray(state.redBorder) ? state.redBorder : [];
    const ownedNames = new Set(allEntries().map((entry) => String((entry.item && entry.item.name) || '').toLowerCase()).filter(Boolean));
    const ownedHashes = new Set(allEntries().map((entry) => String((entry.item && entry.item.hash) || '')).filter(Boolean));
    const ownedItem = (item) => Boolean(item) && (ownedHashes.has(String(item.hash || '')) || ownedNames.has(String(item.name || '').toLowerCase()));
    const goals = new Set(((getCfg().bungie && getCfg().bungie.lootGoals) || []).map((goal) => String(goal).toLowerCase()));
    const redBySource = new Map();
    const redNamesBySource = new Map();
    const redInfoBySource = new Map();
    for (const entry of redBorder) {
      const key = String(entry.source || '').slice(0, 120);
      if (!key) continue;
      redBySource.set(key, (redBySource.get(key) || 0) + 1);
      if (!redNamesBySource.has(key)) redNamesBySource.set(key, new Set());
      redNamesBySource.get(key).add(String(entry.name || '').toLowerCase());
      if (!redInfoBySource.has(key)) redInfoBySource.set(key, new Map());
      redInfoBySource.get(key).set(String(entry.name || '').toLowerCase(), entry);
    }
    const allItemNames = new Set();
    for (const group of groups) for (const item of group.items || []) allItemNames.add(String(item.name || '').toLowerCase());
    const totalItems = groups.reduce((sum, group) => sum + (Number(group.count) || (group.items || []).length), 0);
    const missing = [...allItemNames].filter((name) => name && !ownedNames.has(name)).length;
    const query = lootSourceSearch.trim().toLocaleLowerCase('de');
    const tabs = [
      ['all', 'Alle'],
      ['raid', 'Raids'],
      ['dungeon', 'Dungeons'],
      ['season', 'Saisons'],
      ['vanguard', 'Vorhut'],
      ['pvp', 'PvP'],
      ['destination', 'Zielorte'],
      ['other', 'Weitere']
    ];
    const cards = groups.map((group) => {
      const source = String(group.source || '');
      const guide = lootSourceGuide(source);
      const redCount = redBySource.get(source.slice(0, 120)) || 0;
      const redNames = redNamesBySource.get(source.slice(0, 120)) || new Set();
      const redInfo = redInfoBySource.get(source.slice(0, 120)) || new Map();
      const sourceText = `${source} ${guide.label} ${guide.blurb} ${(guide.tags || []).join(' ')}`.toLocaleLowerCase('de');
      const sourceMatch = !query || sourceText.includes(query);
      const allItems = group.items || [];
      const ownedCount = allItems.filter((item) => ownedItem(item)).length;
      const featured = (() => {
        const entries = (milestonesState && milestonesState.items) || [];
        const name = String(source || '').toLowerCase();
        if (!entries.length || !name) return false;
        return entries.some((entry) => {
          const label = String(entry.name || '').toLowerCase();
          return label.length > 3 && (name.includes(label) || label.includes(name));
        });
      })();
      const items = allItems.filter((item) => {
        const name = String(item.name || '');
        const owned = ownedItem(item);
        if (lootOwnedFilter === 'missing' && owned) return false;
        if (lootOwnedFilter === 'owned' && !owned) return false;
        if (query && !sourceMatch && !name.toLocaleLowerCase('de').includes(query)) return false;
        return true;
      });
      return { source, displaySource: source.replace(/^\s*Quelle:\s*/i, '').trim() || source, guide, redCount, redNames, redInfo, items, ownedCount, featured, itemTotal: allItems.length, groupTotal: Number(group.count) || allItems.length, groupCount: Number(group.count) || allItems.length };
    }).filter((card) => {
      if (lootSourceOnlyRed && !card.redCount) return false;
      if (lootSourceView !== 'all' && card.guide.tab !== lootSourceView) return false;
      if (query && !card.source.toLowerCase().includes(query) && !card.items.length) return false;
      if (!card.items.length && (lootOwnedFilter !== 'all' || query)) return false;
      return true;
    }).sort((a, b) => {
      if (lootSourceSort === 'missing') {
        const diff = (b.itemTotal - b.ownedCount) - (a.itemTotal - a.ownedCount);
        if (diff) return diff;
      } else if (lootSourceSort === 'red' && a.redCount !== b.redCount) {
        return b.redCount - a.redCount;
      } else if (lootSourceSort === 'completion') {
        const ap = a.itemTotal ? a.ownedCount / a.itemTotal : 0;
        const bp = b.itemTotal ? b.ownedCount / b.itemTotal : 0;
        if (ap !== bp) return ap - bp;
      }
      const order = { raid: 0, dungeon: 1, season: 2, vanguard: 3, pvp: 4, destination: 5, other: 6 };
      return (order[a.guide.tab] ?? 9) - (order[b.guide.tab] ?? 9) || b.items.length - a.items.length;
    });
    const visibleItems = cards.reduce((sum, card) => sum + card.items.length, 0);
    const shownCards = cards.slice(0, lootSourceLimit);
    const cardHtml = shownCards.map((card) => {
      const icon = card.items.find((item) => item.icon) || card.items[0] || null;
      const itemHtml = card.items.slice(0, 10).map((item) => {
        const name = String(item.name || '');
        const owned = ownedItem(item);
        const red = card.redNames.has(name.toLowerCase());
        const redEntry = red ? card.redInfo.get(name.toLowerCase()) : null;
        const redText = red ? ` · Red Border${redEntry && redEntry.pattern ? ` ${Number(redEntry.pattern.progress) || 0}/${Number(redEntry.pattern.completion) || 0}` : ''}` : '';
        const active = goals.has(name.toLowerCase());
        return `<div class="source-item${owned ? ' owned' : ' missing'}${red ? ' red' : ''}">` +
          `<span class="source-item-art">${item.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(item.icon)}" alt="">` : ''}<i>${owned ? '✓' : ''}</i></span>` +
          `<div class="source-item-copy"><strong>${esc(name)}</strong><small>${owned ? 'im Besitz' : 'fehlt'}${redText}</small></div>` +
          `<button type="button" class="source-icon-btn${active ? ' on' : ''}" data-tool-loot-goal="${esc(name)}" title="${active ? 'Ziel entfernen' : 'Als Ziel merken'}" aria-label="${active ? 'Ziel entfernen' : 'Als Ziel merken'}">★</button>` +
          `<button type="button" class="source-icon-btn" data-tool-search="${esc(name)}" title="Im Inventar suchen" aria-label="Im Inventar suchen">⌕</button>` +
          `<button type="button" class="source-icon-btn" data-loot-share-item="${esc(name)}" data-loot-share-source="${esc(card.displaySource)}" title="Waffe teilen" aria-label="Waffe teilen">⧉</button>` +
        `</div>`;
      }).join('');
      return `<article class="source-card source-${card.guide.tab}">` +
        `<header class="source-head"><span class="source-icon">${icon && icon.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(icon.icon)}" alt="">` : '◆'}</span>` +
          `<div class="source-title"><span class="source-kicker">${esc(card.guide.label)}</span><strong>${esc(card.displaySource)}</strong>` +
          `<small>${card.ownedCount}/${card.itemTotal} im Besitz · ${card.itemTotal ? Math.round(card.ownedCount / card.itemTotal * 100) : 0} %${card.groupTotal > card.itemTotal ? ` · Auszug aus ${card.groupTotal}` : ''} · Drop: ${esc(SOURCE_DROP_HINTS[card.guide.tab] || 'Direkt-Drop')}</small>` +
          `<span class="source-progress"><i style="width:${card.itemTotal ? Math.round(card.ownedCount / card.itemTotal * 100) : 0}%"></i></span></div>` +
          `${card.featured ? '<span class="source-badge week">Diese Woche</span>' : ''}` +
          `${card.redCount ? `<span class="source-badge red">${card.redCount} Red Border</span>` : ''}` +
        `</header>` +
        `<p class="source-desc">${esc(card.guide.blurb)}</p>` +
        `<div class="source-tags">${(card.guide.tags || []).map((tag) => `<span>${esc(tag)}</span>`).join('')}` +
          `<button type="button" class="source-tag-btn" data-loot-source-missing>Nur fehlende</button>` +
          `<button type="button" class="source-tag-btn" data-loot-source-goal="${esc(card.displaySource)}">Als Wochenziel</button>` +
          `<button type="button" class="source-tag-btn" data-loot-share-source="${esc(card.displaySource)}">Teilen</button>` +
        `</div>` +
        `<div class="source-items">${itemHtml}</div>` +
        `${card.items.length > 10 ? `<div class="source-more">+${card.items.length - 10} weitere Gegenstände</div>` : ''}` +
        `<div class="source-tip"><b>So farmst du</b><span>${esc(card.guide.tip)}</span></div>` +
        `<details class="source-route"><summary>Farmroute</summary><ol>` +
          [`Aktivität starten: ${card.guide.label}`, card.guide.tip, 'Beute prüfen und Red Border sichern'].map((step) => `<li>${esc(step)}</li>`).join('') +
        `</ol><button type="button" class="btn ghost small" data-loot-route="${esc(card.displaySource)}">Route als Wochenziel</button></details>` +
      `</article>`;
    }).join('');
    const sourcePicks = cards
      .filter((card) => card.itemTotal - card.ownedCount > 0)
      .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.itemTotal - b.ownedCount) - (a.itemTotal - a.ownedCount))
      .slice(0, 3);
    const sourcePicksHtml = sourcePicks.length
      ? `<div class="sources-picks"><span class="sources-picks-title">Diese Woche lohnend</span>` +
          sourcePicks.map((card) => `<button type="button" class="sources-pick" data-loot-source-focus="${esc(card.displaySource)}">` +
            `<strong>${esc(card.displaySource)}</strong><small>${card.itemTotal - card.ownedCount} fehlen${card.redCount ? ` · ${card.redCount} Red Border` : ''}${card.featured ? ' · diese Woche' : ''}</small></button>`).join('') +
        `</div>`
      : '';
    return `<section class="sources-page">` +
      `<header class="sources-hero"><div class="sources-hero-copy"><span class="sources-kicker">Loot-Katalog</span>` +
        `<h2>Quellen &amp; Beute</h2><p>Woher Waffen, Rüstung und Red-Border-Baupläne kommen – mit Farmhinweisen und wöchentlicher Rotation.</p></div>` +
        `<div class="sources-hero-actions"><button type="button" class="btn primary small" data-tool-loot ${lootSourcesLoading ? 'disabled' : ''}>Aktualisieren</button></div>` +
      `</header>` +
      `<div class="sources-kpis">` +
        `<span><b>${groups.length}</b><small>Quellen</small></span>` +
        `<span><b>${totalItems}</b><small>Gegenstände</small></span>` +
        `<span class="warn"><b>${missing}</b><small>fehlen</small></span>` +
        `<span class="red"><b>${redBorder.length}</b><small>Red Border</small></span>` +
        `<span class="accent"><b>${goals.size}</b><small>Ziele</small></span>` +
      `</div>` +
      `<div class="sources-toolbar">` +
        `<div class="sources-tabs">${tabs.map(([key, label]) =>
          `<button type="button" class="sources-tab${lootSourceView === key ? ' on' : ''}" data-loot-view="${key}">${esc(label)}</button>`
        ).join('')}</div>` +
        `<label class="sources-search"><span>Suche</span><input type="text" data-loot-search value="${esc(lootSourceSearch)}" placeholder="Quelle, Aktivität oder Waffe …"></label>` +
        `<label class="sources-check"><input type="checkbox" data-loot-red ${lootSourceOnlyRed ? 'checked' : ''}> Nur Red Border</label>` +
        `<select class="sources-select" data-loot-sort aria-label="Sortierung">` +
          `<option value="default"${lootSourceSort === 'default' ? ' selected' : ''}>Standard</option>` +
          `<option value="missing"${lootSourceSort === 'missing' ? ' selected' : ''}>Meiste fehlende</option>` +
          `<option value="red"${lootSourceSort === 'red' ? ' selected' : ''}>Red Border zuerst</option>` +
          `<option value="completion"${lootSourceSort === 'completion' ? ' selected' : ''}>Fast vollständig</option>` +
        `</select>` +
        `<select class="sources-select" data-loot-owned aria-label="Besitzfilter">` +
          `<option value="all"${lootOwnedFilter === 'all' ? ' selected' : ''}>Alle</option>` +
          `<option value="missing"${lootOwnedFilter === 'missing' ? ' selected' : ''}>Fehlt mir</option>` +
          `<option value="owned"${lootOwnedFilter === 'owned' ? ' selected' : ''}>Im Besitz</option>` +
        `</select>` +
      `</div>` +
      sourcePicksHtml +
      (cards.length ? `<div class="sources-grid">${cardHtml}</div>` : '<div class="sources-loading">Keine Quellen für diese Filter.</div>') +
      (cards.length > shownCards.length
        ? `<div class="sources-more"><button type="button" class="btn ghost small" data-loot-more>Weitere ${Math.min(24, cards.length - shownCards.length)} Quellen laden</button>` +
          `<span>${shownCards.length}/${cards.length} sichtbar</span></div>`
        : '') +
      `<div class="sources-footnote">${visibleItems} sichtbare Gegenstände · ${cards.length} Quellen · Infos: Bungie Help, blueberries.gg, LFCarry (Nov 2026)</div>` +
    `</section>`;
  }

  let cleanupPlan = null;
  let cleanupUndo = null;
  let vcSettings = null;
  let vcReview = null;
  let vcGroupIndex = 0;
  let vcTipEl = null;
  let armorDuelA = '';
  let armorDuelB = '';

  function cleanupCandidateIds() {
    const ids = new Set();
    for (const mode of ['weapons', 'armor']) {
      for (const group of duplicateGroups(mode)) {
        for (const entry of group.candidates) {
          if (entry.item.instanceId) ids.add(entry.item.instanceId);
        }
      }
    }
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !ARMOR_SLOTS.has(Number(item.bucket)) || !item.instanceId) continue;
      const total = Number(item.baseStatTotal != null ? item.baseStatTotal : item.statTotal) || (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      const spikes = (item.stats || []).filter((stat) => Number(stat.value) >= 20).length;
      const score = Math.round(total + (Number(item.gearTier) || 0) * 3 + spikes * 4 + (item.setInfo ? 4 : 0));
      if (score < 65) ids.add(item.instanceId);
    }
    return [...ids];
  }

  function renderCleanupWizard() {
    const byId = new Map();
    for (const entry of allEntries()) if (entry.item && entry.item.instanceId) byId.set(entry.item.instanceId, entry.item);
    const planItems = (cleanupPlan || []).map((id) => byId.get(id)).filter(Boolean);
    const rows = planItems.slice(0, 12).map((item) =>
      `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name)}</span>` +
      `<span class="inv-tool-meta">${esc(locationLabel({ kind: 'vault', item }))} · ${Number(item.power) || 0} Power</span></div>`
    ).join('');
    return card('Cleanup-Assistent', '🧼',
      (cleanupPlan
        ? `<div class="inv-tool-sub">Trockenlauf: ${planItems.length} Kandidaten</div>${rows || '<span class="inv-tool-muted">Keine Kandidaten.</span>'}` +
          (planItems.length > 12 ? `<div class="inv-tool-muted">… und ${planItems.length - 12} weitere</div>` : '') +
          `<div class="inv-tool-add"><button type="button" class="btn primary small" data-tool-cleanup-apply>Als Aussortieren taggen</button>` +
          `<button type="button" class="btn ghost small" data-tool-cleanup-preview>Neu berechnen</button></div>`
        : `<span class="inv-tool-muted">Findet Duplikate und schwache Rüstungsteile, ohne etwas zu löschen. Zuerst Trockenlauf, dann Tags setzen – rückgängig machbar.</span>` +
          `<div class="inv-tool-add"><button type="button" class="btn ghost small" data-tool-cleanup-preview>Trockenlauf starten</button></div>`) +
      (cleanupUndo ? `<div class="inv-tool-add"><button type="button" class="btn ghost small" data-tool-cleanup-undo>Letzte Tags rückgängig</button></div>` : ''),
      '', 'wide');
  }

  let compareA = '';
  let compareB = '';

  function driftHistory(loadout, drift) {
    const key = `d2tool.drift.${loadout.id}`;
    let history = [];
    try { history = JSON.parse(window.localStorage.getItem(key) || '[]'); } catch (error) { history = []; }
    if (!Array.isArray(history)) history = [];
    const last = history[history.length - 1];
    if (drift > 0 && (!last || Number(last.value) !== drift || Date.now() - Number(last.at) > 5 * 60 * 1000)) {
      history.push({ at: Date.now(), value: drift });
      history = history.slice(-5);
      try { window.localStorage.setItem(key, JSON.stringify(history)); } catch (error) { /* egal */ }
    }
    return history.slice(-3);
  }

  function renderDriftWatcher() {
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).filter((loadout) => loadout.characterId && (loadout.items || []).length);
    const rows = loadouts.slice(0, 8).map((loadout) => {
      const equipped = new Set(
        (allEntries().filter((entry) => entry.kind === 'equipped' && entry.owner === loadout.characterId))
          .map((entry) => entry.item.instanceId)
      );
      const drift = (loadout.items || []).filter((item) => item.instanceId && !equipped.has(item.instanceId)).length;
      const history = driftHistory(loadout, drift);
      const historyText = history.length > 1
        ? `<small class="inv-tool-muted"> · Verlauf: ${history.map((entry) => `${new Date(entry.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })} ${entry.value}`).join(' → ')}</small>`
        : '';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(loadout.name)}${historyText}</span>` +
        `<span class="inv-tool-meta ${drift ? 'inv-tool-warn' : ''}">${drift ? `${drift} Items weichen ab` : 'aktuell angelegt'}</span>` +
        (drift ? `<button type="button" class="btn ghost small" data-tool-loadout-diff="${esc(loadout.id)}">Abgleich</button>` +
          `<button type="button" class="btn primary small" data-tool-apply="${esc(loadout.id)}">Zurücksetzen</button>` : '') + `</div>`;
    }).join('');
    return card('Loadout-Drift-Wächter', '🛰',
      rows || '<span class="inv-tool-muted">Keine Loadouts mit Charakterzuordnung.</span>' +
      '<div class="inv-tool-muted">Prüft, ob die gespeicherten Items noch angelegt sind.</div>', '', 'wide');
  }

  function renderWeekReview() {
    const activities = Object.values({ ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) });
    const loot = sessionLoot.slice(0, 6);
    const checklist = ((getCfg().checklist && getCfg().checklist.items) || []);
    const done = checklist.filter((item) => item.done).length;
    return card('Wochenrückblick', '📈',
      `<div class="inv-tool-row"><span class="inv-tool-slot">Aktivitäten</span><span class="inv-tool-main">${activities.length} erkannt · ${activities.map((entry) => entry.name).slice(0, 3).join(', ') || '—'}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Checkliste</span><span class="inv-tool-main">${done}/${checklist.length} erledigt</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Session-Beute</span><span class="inv-tool-main">${sessionLoot.length} Items · ${sessionLoot.filter((entry) => entry.godRoll).length} Godrolls</span></div>` +
      (loot.length ? `<div class="inv-tool-sub">Neueste Beute</div>` + loot.map((entry) =>
        `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(entry.name)}${entry.godRoll ? ' <span class="inv-tool-god">Godroll</span>' : ''}</span><span class="inv-tool-meta">${esc(entry.location || '')}</span></div>`
      ).join('') : ''), '', 'wide');
  }

  function renderBuildComparison() {
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []);
    if (loadouts.length < 2) return card('Build-Vergleich', '⚖', '<span class="inv-tool-muted">Mindestens zwei Loadouts nötig.</span>', '', 'wide');
    if (!loadouts.some((entry) => entry.id === compareA)) compareA = loadouts[0].id;
    if (!loadouts.some((entry) => entry.id === compareB) || compareB === compareA) compareB = loadouts[1].id;
    const statsOf = (loadout) => {
      const items = new Map(allEntries().map((entry) => [entry.item.instanceId, entry.item]));
      let total = 0;
      for (const saved of loadout.items || []) {
        const item = items.get(saved.instanceId);
        if (!item) continue;
        total += (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      }
      return total;
    };
    const options = (selected) => loadouts.map((loadout) => `<option value="${esc(loadout.id)}" ${loadout.id === selected ? 'selected' : ''}>${esc(loadout.name)}</option>`).join('');
    const a = loadouts.find((entry) => entry.id === compareA);
    const b = loadouts.find((entry) => entry.id === compareB);
    const row = (label, left, right) => `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span><span class="inv-tool-main">${esc(String(left))}</span><span class="inv-tool-meta">${esc(String(right))}</span></div>`;
    return card('Build-Vergleich', '⚖',
      `<div class="inv-tool-opt-fields"><label>A<select data-build-compare="a">${options(compareA)}</select></label><label>B<select data-build-compare="b">${options(compareB)}</select></label></div>` +
      row('Items', (a.items || []).length, (b.items || []).length) +
      row('Mods', (a.mods || []).length, (b.mods || []).length) +
      row('Rüstungs-Stats', statsOf(a), statsOf(b)) +
      row('Klasse', CLASS_NAMES[a.classType] || 'Hüter', CLASS_NAMES[b.classType] || 'Hüter'), '', 'wide');
  }

  function renderExotics() {
    const exotics = new Map();
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || Number(item.rarity) !== 6) continue;
      if (!exotics.has(item.hash)) exotics.set(item.hash, { name: item.name, typeName: item.typeName, count: 0 });
      exotics.get(item.hash).count += 1;
    }
    const rows = [...exotics.values()].slice(0, 10).map((entry) =>
      `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(entry.name)}</span><span class="inv-tool-meta">${esc(entry.typeName || '')} · ${entry.count}×</span></div>`
    ).join('');
    return card('Exoten im Inventar', '✨', (rows || '<span class="inv-tool-muted">Keine Exoten gefunden.</span>') +
      `<div class="inv-tool-muted">${exotics.size} verschiedene Exoten im aktuellen Inventar.</div>`, '', 'wide');
  }

  function advanceAutoGoals(activity) {
    const text = `${activity && activity.name || ''} ${activity && activity.modeName || ''}`.toLocaleLowerCase('de');
    const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []).slice();
    let changed = false;
    const next = goals.map((goal) => {
      if (!goal || !goal.auto) return goal;
      const matches = goal.auto === 'gm'
        ? /großmeister|grandmaster|nightfall|\bgm\b/.test(text)
        : goal.auto === 'catalyst'
          ? /katalysator|catalyst|exotic|exotisch/.test(text)
          : false;
      if (!matches || Number(goal.progress) >= Number(goal.target)) return goal;
      changed = true;
      return { ...goal, progress: Math.min(Number(goal.target) || 1, (Number(goal.progress) || 0) + 1) };
    });
    if (!changed) return;
    setConfig({ bungie: { sessionGoals: next } });
    toast('Session-Ziel automatisch erhöht.', 'success', 1800);
  }

  function renderSessionGoals() {
    const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []);
    const auto = autoRecapEnabled();
    const rows = goals.map((goal) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(goal.text)}${goal.auto ? ' <span class="inv-tool-chip">auto</span>' : ''}</span>` +
      `<span class="inv-tool-meta">${goal.progress}/${goal.target}</span>` +
      `<button type="button" class="btn ghost small" data-session-goal="-1:${esc(goal.id)}">−</button>` +
      `<button type="button" class="btn ghost small" data-session-goal="1:${esc(goal.id)}">+</button>` +
      `<button type="button" class="btn ghost small" data-session-goal-del="${esc(goal.id)}">✕</button></div>`
    ).join('');
    const body = (rows || '<span class="inv-tool-muted">Noch keine Ziele für diese Session.</span>' +
      `<div class="inv-tool-add"><input type="text" data-session-goal-input maxlength="80" placeholder="z. B. 3 GMs">` +
      `<button type="button" class="btn primary small" data-session-goal-add>Ziel hinzufügen</button></div>`) +
      `<div class="inv-tool-row small"><label class="check-row"><input type="checkbox" data-session-auto ${auto ? 'checked' : ''}><span>Nach einer Aktivität automatisch an den Recap erinnern</span></label></div>` +
      `<div class="inv-tool-actions"><button type="button" class="btn ghost small" data-session-preset="gm">3 GMs</button><button type="button" class="btn ghost small" data-session-preset="catalyst">2 Katalysatoren</button><button type="button" class="btn ghost small" data-session-preset="vendor">Händler prüfen</button></div>`;
    return card('Session-Ziele', '🎯', body, '', 'wide');
  }

  function autoRecapEnabled() {
    try { return window.localStorage.getItem('d2tool.autoRecap') === '1'; } catch (error) { return false; }
  }

  function latestActivity() {
    const merged = { ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) };
    return Object.values(merged).filter(Boolean).sort((a, b) => Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0))[0] || null;
  }

  function renderPostGameCard() {
    const activity = latestActivity();
    if (!activity) return '';
    const loot = sessionLoot.slice(0, 5);
    const godrolls = sessionLoot.filter((item) => item.godRoll).length;
    const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []);
    const openGoals = goals.filter((goal) => Number(goal.progress) < Number(goal.target));
    const owner = activity.owner || ((data && data.characters && data.characters[0] && data.characters[0].id) || '');
    const coverage = championCoverage().find((entry) => entry.character.id === owner);
    const labels = coverage ? CHAMPION_PATTERNS.map((pattern, index) => coverage.coverage[index].length ? pattern.key : '').filter(Boolean) : [];
    const missing = coverage ? CHAMPION_PATTERNS.map((pattern, index) => coverage.coverage[index].length ? '' : pattern.key).filter(Boolean) : [];
    return card('Nach dem Spiel', '🏁',
      `<div class="inv-tool-activity"><strong>${esc(activity.name || 'Aktivität')}</strong>` +
        (activity.modeName ? `<span>${esc(activity.modeName)}</span>` : '') +
        (activity.startedAt ? `<small>seit ${new Date(activity.startedAt).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })}</small>` : '') +
      `</div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Loot</span><span class="inv-tool-main">${sessionLoot.length} Items${godrolls ? ` · ${godrolls} Godroll(s)` : ''}</span></div>` +
      (loot.length ? `<div class="inv-tool-muted">${loot.map((item) => esc(item.name)).join(' · ')}</div>` : '') +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Champions</span><span class="inv-tool-meta ${missing.length ? 'inv-tool-warn' : ''}">${labels.length ? `abgedeckt: ${esc(labels.join(', '))}` : 'keine Abdeckung'}${missing.length ? ` · fehlt: ${esc(missing.join(', '))}` : ''}</span></div>` +
      (goals.length ? `<div class="inv-tool-row"><span class="inv-tool-slot">Ziele</span><span class="inv-tool-meta">${openGoals.length ? `${openGoals.length} offen: ${esc(openGoals.slice(0, 3).map((goal) => goal.text).join(', '))}` : 'alle erreicht'}</span></div>` : '') +
      `<div class="inv-tool-actions"><button type="button" class="btn ghost small" data-session-export="md">Recap kopieren</button>` +
      `<button type="button" class="btn ghost small" data-tool-open-view="builds">Champion-Planer</button>` +
      `<button type="button" class="btn ghost small" data-session-auto-open>Auto-Recap ${autoRecapEnabled() ? 'aus' : 'an'}</button></div>`, '', 'wide');
  }

  function renderBuildLegality() {
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []);
    const rows = loadouts.slice(0, 8).map((loadout) => {
      const checks = [
        [(loadout.items || []).length >= 8, '8 Items'],
        [(loadout.mods || []).length >= 5, '5 Mods'],
        [(loadout.subclassPlugs || []).length > 0, 'Subklasse'],
        [Boolean(loadout.characterId), 'Charakter']
      ];
      const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(loadout.name)}</span>` +
        `<span class="inv-tool-meta">${failed.length ? `fehlt: ${esc(failed.join(', '))}` : 'vollständig'}</span>` +
        `<span class="inv-tool-chip ${failed.length ? '' : 'on'}">${failed.length ? 'Prüfen' : 'OK'}</span></div>`;
    }).join('');
    return card('Build-Gesetzmäßigkeiten', '✅', rows || '<span class="inv-tool-muted">Keine Loadouts.</span>', '', 'wide');
  }

  function renderVaultComposition() {
    const buckets = new Map();
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !WEAPON_SLOTS.has(Number(item.bucket))) continue;
      const key = String(item.typeName || 'Waffe');
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const max = Math.max(1, ...buckets.values());
    const rows = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(name)}</span><span class="inv-tool-meta">${count}</span>` +
      `<span class="dash-gap-bar"><i style="width:${Math.round(count / max * 100)}%"></i></span></div>`
    ).join('');
    return card('Tresor-Zusammensetzung', '📊', rows || '<span class="inv-tool-muted">Keine Waffen im Inventar.</span>', '', 'wide');
  }

  function craftGoals() {
    try { return JSON.parse(window.localStorage.getItem('d2tool.craftGoals') || '{}'); } catch (error) { return {}; }
  }

  function renderCraftingPlan() {
    const craftables = ((craftablesState && craftablesState.craftables) || (data && data.craftables) || []);
    const open = craftables.filter((entry) => entry.pattern && !entry.pattern.complete).slice(0, 8);
    const goals = craftGoals();
    const rows = open.map((entry) => {
      const key = String(entry.hash || entry.name || '');
      const goal = goals[key] === true;
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(entry.name)}</span>` +
        `<span class="inv-tool-meta">${Number(entry.pattern.progress) || 0}/${Number(entry.pattern.completion) || 0} Muster · fehlen ${Math.max(0, (Number(entry.pattern.completion) || 0) - (Number(entry.pattern.progress) || 0))}</span>` +
        `<label class="check-row"><input type="checkbox" data-craft-goal="${esc(key)}" ${goal ? 'checked' : ''}><span>Ziel</span></label></div>`;
    }).join('');
    const count = Object.keys(goals).length;
    return card('Crafting-Planer', '🔨', rows || '<span class="inv-tool-muted">Keine offenen Muster.</span>', count ? `${count} Crafting-Ziel(e) markiert.` : 'Markiere offene Muster als Ziel, um sie oben zu behalten.', 'wide');
  }

  function renderCraftingMaterialPlan() {
    const goals = craftGoals();
    const keys = Object.keys(goals).filter((key) => goals[key] === true);
    if (!keys.length) {
      return card('Crafting-Materialplan', '📦', '<span class="inv-tool-muted">Noch keine Crafting-Ziele markiert. Im Crafting-Planer unten Muster als Ziel auswählen.</span>', '', 'wide');
    }
    const craftables = ((craftablesState && craftablesState.craftables) || (data && data.craftables) || []);
    const recipes = (craftingCostsState && craftingCostsState.ok && craftingCostsState.recipes) || [];
    const owned = new Map();
    for (const material of [...((data && data.materials) || []), ...((data && data.currencies) || [])]) {
      if (!material) continue;
      const key = String(material.hash || material.name || '');
      if (key) owned.set(key, (owned.get(key) || 0) + (Number(material.quantity) || 0));
    }
    const need = new Map();
    const sources = [];
    let missingRecipes = 0;
    for (const key of keys) {
      const craftable = craftables.find((entry) => String(entry.hash || entry.name) === key || String(entry.name) === key);
      const recipe = recipes.find((entry) => entry && (String(entry.hash) === key || (craftable && String(entry.name) === String(craftable.name))));
      if (!recipe) { missingRecipes += 1; continue; }
      if (craftable && craftable.source && !sources.includes(craftable.source)) sources.push(craftable.source);
      for (const material of recipe.materials || []) {
        const materialKey = String(material.hash || material.name || '');
        if (!materialKey) continue;
        need.set(materialKey, {
          name: material.name || materialKey,
          count: (need.get(materialKey)?.count || 0) + (Number(material.count) || 0)
        });
      }
    }
    const rows = [...need.entries()].map(([materialKey, value]) => {
      const have = owned.get(materialKey) || 0;
      const missing = Math.max(0, value.count - have);
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(value.name)}</span>` +
        `<span class="inv-tool-meta ${missing ? 'inv-tool-warn' : ''}">${fmt(value.count)} benötigt · ${fmt(have)} vorhanden${missing ? ` · fehlt ${fmt(missing)}` : ' · gedeckt'}</span>` +
        `<span class="dash-gap-bar"><i style="width:${Math.min(100, Math.round(have / Math.max(1, value.count) * 100))}%"></i></span></div>`;
    }).join('');
    const status = missingRecipes
      ? `${missingRecipes} Ziel(e) ohne Rezeptdaten`
      : (rows ? 'Materialbedarf aus Rezepten' : 'Rezeptdaten werden geladen');
    return card('Crafting-Materialplan', '📦',
      (rows || `<span class="inv-tool-muted">${status}.</span>`) +
      (sources.length ? `<div class="inv-tool-muted">Quellen: ${esc(sources.slice(0, 6).join(' · '))}</div>` : '') +
      '<div class="inv-tool-muted">Summiert alle markierten Crafting-Ziele und vergleicht mit Materialien/Währungen aus dem Snapshot. Fehlende Beträge zuerst farmen.</div>', '', 'wide');
  }

  function renderSecretChests() {
    const cfgChests = (getCfg().bungie && getCfg().bungie.secretChests) || {};
    const week = nextWeekResetDate();
    const key = `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`;
    const state = cfgChests[key] || {};
    const rows = ((data && data.characters) || []).map((character) => {
      const checked = state[character.id] === true;
      return `<label class="dash-check ${checked ? 'done' : ''}"><input type="checkbox" data-secret-chest="${esc(character.id)}:${key}" ${checked ? 'checked' : ''}>` +
        `<span>${esc(CLASS_NAMES[character.classType] || 'Hüter')} · Geheimtruhen abgeholt</span></label>`;
    }).join('');
    return card('Geheimtruhen', '🗝', rows || '<span class="inv-tool-muted">Keine Charakterdaten.</span>', '', 'wide');
  }

  function nextWeekResetDate() {
    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0));
    const days = (2 - now.getUTCDay() + 7) % 7;
    target.setUTCDate(target.getUTCDate() + days);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
    return target;
  }

  function armorTuningAdvice(item) {
    if (!item) return '';
    if (item.tunedStat) return `Tuning aktiv: ${item.tunedStat.label || 'Stat'}`;
    const stats = (item.stats || [])
      .filter((stat) => Number(stat.value) < (Number(stat.max) || 45))
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    if (!stats.length) return 'Tuning: kein freier Stat';
    const pick = stats[0];
    const statMax = Number(pick.max) || 45;
    const next = Math.min(statMax, (Number(pick.value) || 0) + 5);
    return `Tuning-Empfehlung: ${pick.label || 'Stat'} +5 → ${next}`;
  }

  function renderArmorCompare() {
    const seen = new Set();
    const armor = [];
    for (const entry of allEntries()) {
      const item = entry.item;
      if (!item || !ARMOR_SLOTS.has(Number(item.bucket))) continue;
      const key = String(item.instanceId || `${item.hash}-${item.name || ''}`);
      if (seen.has(key)) continue;
      seen.add(key);
      armor.push({ key, item });
    }
    armor.sort((a, b) => String(a.item.name || '').localeCompare(String(b.item.name || ''), 'de'));
    if (armor.length < 2) return card('Rüstungs-Duell', '⚖', '<span class="inv-tool-muted">Zu wenig Rüstung für einen Vergleich.</span>', '', 'wide');
    if (!armor.some((entry) => entry.key === armorDuelA)) armorDuelA = armor[0].key;
    if (!armor.some((entry) => entry.key === armorDuelB) || armorDuelB === armorDuelA) {
      armorDuelB = (armor.find((entry) => entry.key !== armorDuelA) || armor[1]).key;
    }
    const a = (armor.find((entry) => entry.key === armorDuelA) || armor[0]).item;
    const b = (armor.find((entry) => entry.key === armorDuelB) || armor[1]).item;
    const statOf = (item, hash) => Number(((item.stats || []).find((stat) => Number(stat.hash) === Number(hash)) || {}).value) || 0;
    const totalOf = (item) => (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
    const options = (selected) => armor.map((entry) =>
      `<option value="${esc(entry.key)}" ${entry.key === selected ? 'selected' : ''}>${esc(entry.item.name)} · ${esc(ARMOR_SLOT_LABELS[Number(entry.item.bucket)] || 'Rüstung')}</option>`
    ).join('');
    const rows = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const av = statOf(a, h);
      const bv = statOf(b, h);
      const diff = av - bv;
      return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(label)}</span>` +
        `<span class="inv-tool-meta">A ${av} · B ${bv} · ${diff === 0 ? 'gleich' : diff > 0 ? `A +${diff}` : `B +${-diff}`}</span></div>`;
    }).join('');
    const meta = (item) => {
      const parts = [];
      if (item.gearTier) parts.push(`T${item.gearTier}`);
      if (item.archetype) parts.push(`${item.archetype.name || 'Archetyp'} (${item.archetype.primaryLabel || '—'}/${item.archetype.secondaryLabel || '—'})`);
      if (item.setInfo) parts.push(item.setInfo.name || 'Set');
      parts.push(armorTuningAdvice(item));
      return parts.filter(Boolean).join(' · ');
    };
    const spikes = (item) => (item.stats || []).filter((stat) => Number(stat.value) >= 20).length;
    return card('Rüstungs-Duell', '⚖',
      `<div class="inv-tool-opt-fields">` +
        `<label>Teil A<select data-armor-duel-a>${options(armorDuelA)}</select></label>` +
        `<label>Teil B<select data-armor-duel-b>${options(armorDuelB)}</select></label>` +
      `</div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">A: ${esc(a.name)}</span><span class="inv-tool-meta">${esc(meta(a))} · ${totalOf(a)} Stats · ${spikes(a)}× 20+</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">B: ${esc(b.name)}</span><span class="inv-tool-meta">${esc(meta(b))} · ${totalOf(b)} Stats · ${spikes(b)}× 20+</span></div>` +
      `<div class="inv-tool-sub">Werte im Vergleich</div>${rows}` +
      `<div class="inv-tool-muted">Tuning-Empfehlung hebt den höchsten noch freien Stat um +5. Delta bezieht sich auf A minus B.</div>`, '', 'wide');
  }

  function characterStatSources(character) {
    const out = {};
    for (const { h } of ARMOR_STAT_DEFS) out[h] = { base: 0, mods: 0, mw: 0, fragments: 0 };
    if (!character) return out;
    const equipped = (data && data.equipped && data.equipped[character.id]) || [];
    for (const item of equipped) {
      if (!ARMOR_SLOTS.has(Number(item.bucket))) continue;
      for (const stat of (item.stats || [])) {
        const hash = Number(stat.hash);
        if (!out[hash]) continue;
        out[hash].base += Math.max(0, Number(stat.base != null ? stat.base : stat.value) || 0);
        out[hash].mods += Number(stat.mod) || 0;
        out[hash].mw += Math.max(0, Number(stat.mw) || 0);
      }
    }
    const fragments = fragmentStatBonuses(character);
    for (const { h } of ARMOR_STAT_DEFS) out[h].fragments = Number(fragments[h]) || 0;
    return out;
  }

  function renderDataAudit() {
    const chars = (data && data.characters) || [];
    const rows = chars.map((character) => {
      const sources = characterStatSources(character);
      const diffs = ARMOR_STAT_DEFS.map(({ h, label }) => {
        const profile = Number((character.stats || {})[h]) || 0;
        const source = sources[h] || { base: 0, mods: 0, mw: 0, fragments: 0 };
        const expected = source.base + source.mods + source.mw + source.fragments;
        return { label, profile, expected, rest: profile - expected };
      }).filter((entry) => Math.abs(entry.rest) > 15);
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(CLASS_NAMES[character.classType] || 'Hüter')}</span>` +
        `<span class="inv-tool-meta ${diffs.length ? 'inv-tool-warn' : ''}">${diffs.length ? diffs.map((entry) => `${entry.label} ${entry.profile}/${entry.expected} (${entry.rest > 0 ? '+' : ''}${entry.rest})`).join(' · ') : 'Werte plausibel'}</span>` +
        `<span class="inv-tool-chip ${diffs.length ? '' : 'on'}">${diffs.length ? 'Prüfen' : 'OK'}</span></div>`;
    }).join('');
    const breakdown = chars.map((character) => {
      const sources = characterStatSources(character);
      const lines = ARMOR_STAT_DEFS.map(({ h, label }) => {
        const profile = Number((character.stats || {})[h]) || 0;
        const source = sources[h] || { base: 0, mods: 0, mw: 0, fragments: 0 };
        const rest = profile - source.base - source.mods - source.mw - source.fragments;
        return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(label)}</span><span class="inv-tool-meta">Rüstung ${source.base} + Mods ${source.mods} + MW ${source.mw} + Fragmente ${source.fragments}${rest ? ` + Rest ${rest}` : ''} = ${profile}</span></div>`;
      }).join('');
      return `<div class="inv-tool-sub">${esc(CLASS_NAMES[character.classType] || 'Hüter')}</div>${lines}`;
    }).join('');
    return card('Stat-Abgleich', '🧮', rows +
      `<details class="inv-tool-fold"><summary>Herkunft je Wert</summary><div class="inv-tool-grid">${breakdown}</div></details>` +
      '<div class="inv-tool-muted">Basis + Mods + Masterwork + Fragmente werden aus den angelegten Teilen gelesen. Rest = Artefakt, Rundung oder API-Abweichung; über 15 wird markiert.</div>', '', 'wide');
  }

  function renderPerkLexicon() {
    const perks = new Map();
    const nonPerkCategory = /enhancements|masterwork|shader|ornament|tracker|mods|tuning|weapon_tiering|crafting\.recipes|generic_all_vfx|damage_type/i;
    for (const entry of allEntries()) {
      if (!WEAPON_SLOTS.has(Number(entry.item.bucket))) continue;
      const selected = [];
      for (const column of entry.item.socketColumns || []) {
        for (const option of column.options || []) if (option.selected) selected.push(option);
      }
      const list = selected.length
        ? selected
        : (entry.item.perks || []).filter((perk) => !nonPerkCategory.test(String(perk.p || '')));
      for (const perk of list) {
        const name = String(perk.n || '').trim();
        if (!name || name.length < 3) continue;
        const info = perks.get(name) || { name, count: 0, god: 0 };
        info.count += 1;
        if (perk.god) info.god += 1;
        perks.set(name, info);
      }
    }
    const rows = [...perks.values()].sort((a, b) => b.count - a.count).slice(0, 10).map((perk) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(perk.name)}</span><span class="inv-tool-meta">${perk.count}× im Inventar${perk.god ? ` · ${perk.god} Godroll` : ''}</span></div>`
    ).join('');
    return card('Perk-Lexikon', '📖', rows || '<span class="inv-tool-muted">Keine Waffen-Perk-Daten.</span>', '', 'wide');
  }

  function renderPerfHistory() {
    let history = [];
    try { history = JSON.parse(window.localStorage.getItem('d2tool.perf') || '[]'); } catch (error) { history = []; }
    if (lastRenderMs) {
      history.push(lastRenderMs);
      history = history.slice(-12);
      try { window.localStorage.setItem('d2tool.perf', JSON.stringify(history)); } catch (error) { /* egal */ }
    }
    const max = Math.max(1, ...history);
    const bars = history.map((value) => `<span class="dash-gap-bar"><i style="width:${Math.round(value / max * 100)}%"></i></span>`).join('');
    const memory = performance.memory ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)) : null;
    const nodes = document.querySelectorAll('*').length;
    return card('Performance-Verlauf', '📉',
      `<div class="inv-tool-row"><span class="inv-tool-main">Letzte Renderzeiten</span><span class="inv-tool-meta">${history.slice(-1)[0] || 0} ms</span></div>${bars}` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">DOM</span><span class="inv-tool-main">${nodes} Knoten</span></div>` +
      (memory != null ? `<div class="inv-tool-row"><span class="inv-tool-slot">JS-Heap</span><span class="inv-tool-main">${memory} MB</span></div>` : '') +
      `<div class="inv-tool-muted">Richtwert: unter 50 ms pro Ansicht · unter 1.500 Knoten im Werkzeug-Tab.</div>`, '', 'wide');
  }

  function renderBuildTemplates() {
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []);
    const presets = [['pvp', 'PvP'], ['gm', 'GM'], ['raid', 'Raid'], ['dungeon', 'Dungeon']];
    const rows = presets.map(([key, label]) => {
      const matches = loadouts.filter((loadout) => new RegExp(key, 'i').test(`${loadout.name} ${loadout.notes || ''}`));
      return `<div class="inv-tool-row"><span class="inv-tool-main">${label}</span>` +
        `<span class="inv-tool-meta">${matches.length ? esc(matches[0].name) : 'kein passendes Loadout'}</span>` +
        (matches.length ? `<button type="button" class="btn ghost small" data-tool-template-apply="${esc(matches[0].id)}">Anwenden</button>` : '') + `</div>`;
    }).join('');
    return card('Build-Vorlagen', '📐', rows + '<div class="inv-tool-muted">Findet Loadouts anhand von Name/Notiz (PvP, GM, Raid, Dungeon).</div>', '', 'wide');
  }



  function addEncounterEntries(entries) {
    const week = nextWeekResetDate();
    const key = `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`;
    const all = { ...(((getCfg().bungie && getCfg().bungie.encounterTracker) || {})) };
    const list = Array.isArray(all[key]) ? all[key].slice() : [];
    let added = 0;
    for (const text of entries) {
      if (!text || list.some((entry) => entry.text === text)) continue;
      list.push({ id: 'e-' + Date.now().toString(36) + '-' + added, text, done: false });
      added += 1;
    }
    if (!added) {
      toast('Encounter sind bereits im Tracker.', 'info', 2200);
      return;
    }
    all[key] = list;
    setConfig({ bungie: { encounterTracker: all } });
    toast(`${added} Encounter übernommen.`, 'success', 2400);
    render();
  }

  function renderEncounterLibrary() {
    if (!lootSourcesState && !lootSourcesLoading) setTimeout(() => loadLootSources(false), 150);
    const groups = ENCOUNTER_LIBRARY.map((activity) => {
      const loot = encounterLootFor(activity.name);
      const lootHtml = loot
        ? `<div class="enc-loot">${loot.items.map((item) => `<span class="enc-loot-item${item.red ? ' red' : ''}">${esc(item.name)}${item.red ? ' ●' : ''}</span>`).join('')}${loot.total > loot.items.length ? `<span class="enc-loot-item">+${loot.total - loot.items.length}</span>` : ''}</div>`
        : '<div class="enc-loot muted">Beute: Quellen werden geladen …</div>';
      return `<div class="enc-lib-group"><div class="enc-lib-head"><strong>${esc(activity.name)}</strong><small>${esc(activity.type)}</small>` +
        `<button type="button" class="btn ghost small" data-enc-lib-all="${esc(activity.name)}">Alle</button></div>` +
        `<div class="enc-lib-list">${activity.encounters.map((encounter) =>
          `<button type="button" class="enc-lib-item" data-enc-lib-add="${esc(activity.name + '|' + encounter)}">+ ${esc(encounter)}</button>`
        ).join('')}</div>${lootHtml}</div>`;
    }).join('');
    return card('Encounter-Bibliothek', '🗺️', `<div class="enc-lib">${groups}</div>` +
      '<div class="inv-tool-muted">Übernimmt Encounter direkt in den Wochen-Tracker. ● = Red Border. Checkpoints bleiben manuell.</div>', '', 'wide');
  }

  function renderEncounterTracker() {
    const week = nextWeekResetDate();
    const key = `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`;
    const all = ((getCfg().bungie && getCfg().bungie.encounterTracker) || {});
    const list = Array.isArray(all[key]) ? all[key] : [];
    const rows = list.map((entry) =>
      `<label class="dash-check ${entry.done ? 'done' : ''}"><input type="checkbox" data-encounter-check="${esc(entry.id)}" ${entry.done ? 'checked' : ''}><span>${esc(entry.text)}</span></label>`
    ).join('');
    return card('Encounter-Tracker', '🏆', rows || '<span class="inv-tool-muted">Noch keine Encounter für diese Woche.</span>' +
      `<div class="inv-tool-add"><input type="text" data-encounter-input maxlength="60" placeholder="z. B. Root of Nightmares – 2. Encounter"><button type="button" class="btn primary small" data-encounter-add>Hinzufügen</button>` +
      `<button type="button" class="btn ghost small" data-encounter-suggest>Aus Rotation vorschlagen</button></div>`, '', 'wide');
  }

  function renderUndoHistory() {
    let history = [];
    try { history = JSON.parse(window.localStorage.getItem('d2inv.undoHistory') || '[]'); } catch (error) { history = []; }
    const rows = history.slice(0, 6).map((entry, index) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(entry.label || 'Aktion')}</span>` +
      `<span class="inv-tool-meta">${entry.at ? new Date(entry.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}</span>` +
      `<button type="button" class="btn ghost small" data-undo-restore="${index}">Wiederherstellen</button></div>`
    ).join('');
    return card('Undo-Verlauf', '↶', rows || '<span class="inv-tool-muted">Noch keine rückgängig machbaren Aktionen.</span>', '', 'wide');
  }

  function renderResilience() {
    const chars = (data && data.characters) || [];
    const rows = chars.map((character) => {
      const value = Math.max(0, Math.round(Number((character.stats || {})[392767087]) || 0));
      const nextStep = Math.min(200, Math.ceil((value + 1) / 10) * 10);
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(CLASS_NAMES[character.classType] || 'Hüter')}</span>` +
        `<span class="inv-tool-meta">Gesundheit ${value}/200 · nächster Schritt ${nextStep}${nextStep > value ? ` (+${nextStep - value})` : ''}</span></div>`;
    }).join('');
    return card('Gesundheits-Rechner', '🛡', rows || '<span class="inv-tool-muted">Keine Charakterdaten.</span>' +
      '<div class="inv-tool-muted">DIM nutzt nach Edge of Fate die Skala 0–200. Die alten Resilienz-Prozente gelten nicht mehr.</div>', '', 'wide');
  }

  function artifactPlan() {
    try { return JSON.parse(window.localStorage.getItem('d2tool.artifactPlan') || '[]'); } catch (error) { return []; }
  }

  function renderArtifactPlanner() {
    const plan = artifactPlan();
    const loadoutPerks = new Set();
    for (const loadout of ((getCfg().bungie && getCfg().bungie.loadouts) || [])) {
      for (const perk of loadout.artifactPerks || []) if (perk && perk.n) loadoutPerks.add(perk.n);
    }
    const rows = [...new Set([...plan, ...loadoutPerks])].map((name) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(name)}</span>` +
      `<span class="inv-tool-chip ${plan.includes(name) ? 'on' : ''}">${plan.includes(name) ? 'geplant' : 'in Loadouts'}</span>` +
      `<button type="button" class="btn ghost small" data-artifact-toggle="${esc(name)}">${plan.includes(name) ? 'Entfernen' : 'Planen'}</button></div>`
    ).join('');
    return card('Artefakt-Planer', '🔮', rows || '<span class="inv-tool-muted">Noch keine Artefakt-Perks geplant.</span>' +
      `<div class="inv-tool-add"><input type="text" data-artifact-input maxlength="60" placeholder="Artefakt-Perk"><button type="button" class="btn primary small" data-artifact-add>Hinzufügen</button></div>`, '', 'wide');
  }

  let lintActivity = 'gm';
  function renderBuildLint() {
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).slice(0, 8);
    const rows = loadouts.map((loadout) => {
      const warnings = [];
      if ((loadout.items || []).length < 8) warnings.push('weniger als 8 Items');
      if ((loadout.mods || []).length < 5) warnings.push('wenige Mods');
      if (!(loadout.subclassPlugs || []).length) warnings.push('keine Subklassen-Plugs');
      if (lintActivity === 'gm' || lintActivity === 'raid') {
        const coverage = championCoverage().find((entry) => entry.character.id === loadout.characterId);
        if (coverage && coverage.coverage.every((names) => !names.length)) warnings.push('keine Champion-Fähigkeit');
      }
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(loadout.name)}</span>` +
        `<span class="inv-tool-meta ${warnings.length ? 'inv-tool-warn' : ''}">${warnings.length ? warnings.join(' · ') : 'passt'}</span>` +
        `<span class="inv-tool-chip ${warnings.length ? '' : 'on'}">${warnings.length ? 'Prüfen' : 'OK'}</span></div>`;
    }).join('');
    return card('Build-Lint', '🧪',
      `<div class="inv-tool-opt-fields"><label>Aktivität<select data-lint-activity><option value="gm" ${lintActivity === 'gm' ? 'selected' : ''}>GM/Nightfall</option><option value="raid" ${lintActivity === 'raid' ? 'selected' : ''}>Raid</option><option value="pvp" ${lintActivity === 'pvp' ? 'selected' : ''}>PvP</option></select></label></div>` +
      (rows || '<span class="inv-tool-muted">Keine Loadouts.</span>'), '', 'wide');
  }

  let gapTargetIndex = 0;
  let gapLoadoutId = '';
  function renderBuildGap() {
    const targets = buildTargets();
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).slice(0, 12);
    if (!targets.length && !loadouts.length) {
      return card('Build-Lückenanalyse', '🧩', '<span class="inv-tool-muted">Noch kein Build-Ziel und kein Loadout gespeichert.</span>', '', 'wide');
    }
    const target = targets[Number(gapTargetIndex) || 0] || targets[targets.length - 1] || null;
    const loadout = loadouts.find((entry) => entry.id === gapLoadoutId) || loadouts[0] || null;
    const character = (data && data.characters || []).find((entry) => entry.id === (loadout && loadout.characterId)) || (data && data.characters && data.characters[0]) || null;
    const stats = (character && character.stats) || {};
    const entries = allEntries();
    const owned = new Map(entries.filter((entry) => entry.item).map((entry) => [String(entry.item.instanceId || entry.item.hash), entry]));
    const statRows = target ? ARMOR_STAT_DEFS.filter(({ h }) => Number(target.stats && target.stats[h]) > 0).map(({ h, label }) => {
      const need = Number(target.stats[h]) || 0;
      const value = Math.round(Number(stats[h]) || 0);
      const ok = value >= need;
      return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(label)}</span><span class="inv-tool-meta ${ok ? '' : 'inv-tool-warn'}">${value} / ${need}${ok ? ' · erreicht' : ` · fehlt ${need - value}`}</span></div>`;
    }).join('') : '<span class="inv-tool-muted">Kein Stat-Ziel ausgewählt.</span>';
    const targetItemRows = target && Array.isArray(target.items) && target.items.length
      ? target.items.map((item) => {
        const found = owned.get(String(item.instanceId || item.hash));
        const status = !found ? 'fehlt' : found.kind === 'equipped' ? 'angelegt' : locationLabel(found);
        return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name || 'Item')}</span><span class="inv-tool-meta ${status === 'fehlt' ? 'inv-tool-warn' : ''}">${esc(status)}</span></div>`;
      }).join('')
      : '';
    const itemRows = loadout ? (loadout.items || []).map((item) => {
      const found = owned.get(String(item.instanceId || item.hash));
      const status = !found ? 'fehlt' : found.kind === 'equipped' && found.owner === loadout.characterId ? 'angelegt' : locationLabel(found);
      return `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(item.name || 'Item')}</span>` +
        `<span class="inv-tool-meta ${status === 'fehlt' ? 'inv-tool-warn' : ''}">${esc(status)}</span>` +
        `<button type="button" class="btn ghost small" data-tool-search="${esc(`name:"${item.name || ''}"`)}">Suchen</button></div>`;
    }).join('') : '';
    const mods = (loadout && loadout.mods || []).map((mod) => mod && (mod.n || mod.name || mod.h)).filter(Boolean);
    const coverage = loadout && character ? championCoverage().find((entry) => entry.character.id === character.id) : null;
    const artifact = character ? artifactBreakers(character.id) : [];
    const missingChampions = coverage ? CHAMPION_PATTERNS.map((pattern, index) => (!coverage.coverage[index].length && !artifact.includes(pattern.key)) ? pattern.key : '').filter(Boolean) : [];
    const targetOptions = targets.map((entry, index) => `<option value="${index}" ${index === (Number(gapTargetIndex) || 0) ? 'selected' : ''}>${esc(entry.name)}</option>`).join('');
    const loadoutOptions = loadouts.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === (loadout && loadout.id) ? 'selected' : ''}>${esc(entry.name || 'Loadout')}</option>`).join('');
    return card('Build-Lückenanalyse', '🧩',
      `<div class="inv-tool-opt-fields"><label>Ziel<select data-gap-target>${targetOptions || '<option value="0">kein Ziel</option>'}</select></label>` +
      `<label>Loadout<select data-gap-loadout>${loadoutOptions || '<option value="">kein Loadout</option>'}</select></label>` +
      `<button type="button" class="btn ghost small" data-tool-loadout-editor>Bearbeiten</button></div>` +
      (target ? `<div class="inv-tool-sub">Stats: ${esc(target.name)}</div>${statRows}` : '') +
      (targetItemRows ? `<div class="inv-tool-sub">Ziel-Items: ${esc(target.name)}</div>${targetItemRows}` : '') +
      (loadout ? `<div class="inv-tool-sub">Items: ${esc(loadout.name || 'Loadout')}</div>${itemRows || '<span class="inv-tool-muted">Keine Items gespeichert.</span>'}` : '') +
      `<div class="inv-tool-sub">Lücken</div>` +
      `<div class="inv-tool-row small"><span class="inv-tool-main">Mods</span><span class="inv-tool-meta">${mods.length ? esc(mods.join(', ')) : 'keine gespeichert'}</span></div>` +
      `<div class="inv-tool-row small"><span class="inv-tool-main">Champion-Abdeckung</span><span class="inv-tool-meta ${missingChampions.length ? 'inv-tool-warn' : ''}">${missingChampions.length ? `fehlt: ${esc(missingChampions.join(', '))}` : 'vollständig'}</span></div>` +
      `<div class="inv-tool-muted">Zeigt Zielwerte, fehlende Loadout-Items und Champion-Lücken. Artefakt-Perks sind typgebunden und werden separat im Champion-Planer geführt.</div>`, '', 'wide');
  }

  // Mods aus deinen Loadouts, die in keinem Socket-Pool vorkommen
  // (also wahrscheinlich nicht freigeschaltet sind).
  function renderModGaps() {
    const loadouts = (getCfg().bungie && getCfg().bungie.loadouts) || [];
    const pools = new Set();
    for (const sockets of Object.values((data && data.sockDefs) || {})) {
      for (const socket of sockets || []) {
        for (const plug of socket.plugs || []) if (plug && plug.h) pools.add(Number(plug.h));
      }
    }
    const missing = new Map();
    for (const loadout of loadouts) {
      for (const mod of loadout.mods || []) {
        const hash = Number(mod && mod.h) || 0;
        if (!hash || pools.has(hash)) continue;
        missing.set(hash, String((mod && mod.n) || ('Mod ' + hash)));
      }
    }
    const rows = [...missing.entries()].map(([hash, name]) =>
      '<div class="inv-tool-row"><span class="inv-tool-main">' + esc(name) + '</span><span class="inv-tool-meta">' + hash + '</span></div>'
    ).join('');
    return card('Mod-Lücken', '🧩',
      (rows || '<span class="inv-tool-muted">Alle Mods deiner Loadouts sind in deinen Socket-Daten vorhanden.</span>') +
      '<div class="inv-tool-muted">Mods, die in keinem deiner Rüstungs-Sockets auftauchen – meist noch nicht freigeschaltet.</div>',
      '', 'wide');
  }

  function renderLootValidation() {
    const groups = (lootSourcesState && lootSourcesState.ok && lootSourcesState.groups) || [];
    const milestones = ((milestonesState && milestonesState.items) || []).map((item) => String(item.name || '').toLowerCase());
    const rows = groups.slice(0, 10).map((group) => {
      const source = String(group.source || '');
      const words = source.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((word) => word.length > 4);
      const matches = milestones.some((name) => words.some((word) => name.includes(word)));
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(source)}</span>` +
        `<span class="inv-tool-chip ${matches ? 'on' : ''}">${matches ? 'aktuell' : 'prüfen'}</span></div>`;
    }).join('');
    return card('Loot-Quellen-Validierung', '✅', rows || '<span class="inv-tool-muted">Erst Loot-Quellen laden.</span>', '', 'wide');
  }

  function renderCraftingCost() {
    const craftables = ((craftablesState && craftablesState.craftables) || (data && data.craftables) || []);
    const open = craftables.filter((entry) => entry.pattern && !entry.pattern.complete);
    if (!craftingCostsState && !craftingCostsLoading && open.length && api && typeof api.bungieCraftingCosts === 'function') {
      craftingCostsLoading = true;
      api.bungieCraftingCosts(open.map((entry) => entry.hash)).then((result) => { craftingCostsState = result || null; })
        .catch(() => { craftingCostsState = { ok: false, recipes: [] }; })
        .finally(() => { craftingCostsLoading = false; render(); });
    }
    const missing = open.reduce((sum, entry) => sum + Math.max(0, (Number(entry.pattern.completion) || 0) - (Number(entry.pattern.progress) || 0)), 0);
    const recipes = (craftingCostsState && craftingCostsState.ok && craftingCostsState.recipes) || [];
    const recipeRows = recipes.slice(0, 6).map((recipe) => {
      const costs = (recipe.materials || []).map((material) => `${fmt(material.count)} ${material.name}`).join(' · ');
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(recipe.name)}</span><span class="inv-tool-meta">${esc(costs || 'Kosten unbekannt')}</span></div>`;
    }).join('');
    return card('Crafting-Bedarf', '🧮',
      `<div class="inv-tool-row"><span class="inv-tool-main">Offene Muster</span><span class="inv-tool-meta">${open.length} Waffen · ${missing} Red-Border fehlen</span></div>` +
      (recipeRows ? `<div class="inv-tool-sub">Materialkosten pro Craft (Manifest)</div>${recipeRows}` : (open.length ? '<div class="inv-tool-muted">Materialkosten werden geladen …</div>' : '')), '', 'wide');
  }

  function statGoals() {
    try { return JSON.parse(window.localStorage.getItem('d2tool.statGoals') || '{}'); } catch (error) { return {}; }
  }

  function buildTargets() {
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2tool.buildTargets') || '[]');
      return Array.isArray(raw) ? raw.filter((entry) => entry && entry.name).slice(-12) : [];
    } catch (error) { return []; }
  }

  function buildSnapshots() {
    try {
      const raw = JSON.parse(window.localStorage.getItem('d2tool.buildSnapshots') || '[]');
      return Array.isArray(raw) ? raw.filter((entry) => entry && entry.name).slice(-12) : [];
    } catch (error) { return []; }
  }

  function saveBuildSnapshots(list) {
    try { window.localStorage.setItem('d2tool.buildSnapshots', JSON.stringify(list.slice(-12))); } catch (error) { /* egal */ }
  }

  function renderBuildSnapshots() {
    const snapshots = buildSnapshots();
    const rows = snapshots.map((entry, index) => {
      const goals = Object.entries(entry.stats || {}).map(([key, value]) => `${armorStatLabel(Number(key))} ${value}`).join(' · ');
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(entry.name)}</span>` +
        `<span class="inv-tool-meta">${esc(goals || 'keine Ziele')} · ${Number(entry.loadouts) || 0} Loadouts</span>` +
        `<button type="button" class="btn ghost small" data-build-snapshot-apply="${index}">Anwenden</button>` +
        `<button type="button" class="btn ghost small" data-build-snapshot-delete="${index}">Löschen</button></div>`;
    }).join('');
    return card('Build-Snapshots', '📸', (rows || '<span class="inv-tool-muted">Noch keine Snapshots.</span>') +
      `<div class="inv-tool-muted"><button type="button" class="btn ghost small" data-build-snapshot-save>Snapshot speichern</button> · Zielwerte + Loadout-Stand lokal sichern.</div>`, '', 'wide');
  }

  function saveBuildTargets(list) {
    try { window.localStorage.setItem('d2tool.buildTargets', JSON.stringify(list.slice(-12))); } catch (error) { /* egal */ }
  }

  function renderMultiBuildTargets() {
    const character = (data && data.characters && data.characters[0]) || null;
    const stats = (character && character.stats) || {};
    const goals = statGoals();
    const targets = buildTargets();
    const rows = targets.map((target, index) => {
      const missing = ARMOR_STAT_DEFS
        .filter(({ h }) => Number(target.stats && target.stats[h]) > 0)
        .map(({ h, label }) => {
          const need = Number(target.stats[h]) || 0;
          const value = Math.round(Number(stats[h]) || 0);
          return { label, need, value, ok: value >= need };
        });
      const open = missing.filter((entry) => !entry.ok);
      const status = open.length
        ? `fehlt ${open.map((entry) => `${entry.label} ${entry.need - entry.value}`).join(', ')}`
        : 'erreicht';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(target.name)}</span>` +
        `<span class="inv-tool-meta ${open.length ? 'inv-tool-warn' : ''}">${esc(status)}</span>` +
        `<button type="button" class="btn ghost small" data-build-target-apply="${index}">Ziele laden</button>` +
        `<button type="button" class="btn ghost small" data-build-target-delete="${index}">Löschen</button></div>`;
    }).join('');
    const current = ARMOR_STAT_DEFS.filter(({ h }) => Number(goals[h]) > 0).map(({ h, label }) => `${label} ${goals[h]}`).join(' · ');
    return card('Multi-Build-Ziele', '🧩', (rows || '<span class="inv-tool-muted">Noch keine gespeicherten Ziele.</span>') +
      `<div class="inv-tool-muted">Aktuelle Stat-Ziele: ${esc(current || 'keine')} · <button type="button" class="btn ghost small" data-build-target-save>Als Ziel speichern</button></div>`, '', 'wide');
  }

  function statGoalHistory() {
    try {
      const list = JSON.parse(window.localStorage.getItem('d2tool.statGoalHistory') || '[]');
      return Array.isArray(list) ? list.filter((entry) => entry && entry.stats) : [];
    } catch (error) {
      return [];
    }
  }

  function recordStatGoalHistory(character) {
    if (!character || !character.stats) return statGoalHistory();
    const day = new Date().toISOString().slice(0, 10);
    const snapshot = {};
    for (const { h } of ARMOR_STAT_DEFS) snapshot[h] = Math.min(ARMOR_STAT_MAX, Math.max(0, Math.round(Number(character.stats[h]) || 0)));
    const history = statGoalHistory();
    const last = history[history.length - 1];
    let changed = false;
    if (!last || last.day !== day) {
      history.push({ day, at: Date.now(), stats: snapshot });
      changed = true;
    } else if (JSON.stringify(last.stats) !== JSON.stringify(snapshot)) {
      last.stats = snapshot;
      last.at = Date.now();
      changed = true;
    }
    if (changed) {
      try { window.localStorage.setItem('d2tool.statGoalHistory', JSON.stringify(history.slice(-30))); } catch (error) { /* egal */ }
    }
    return history.slice(-30);
  }

  function renderStatGoals() {
    const character = (data && data.characters && data.characters[0]) || null;
    const goals = statGoals();
    const history = recordStatGoalHistory(character);
    const today = new Date().toISOString().slice(0, 10);
    const baseline = history.find((entry) => entry.day !== today) || null;
    const baselineLabel = baseline ? new Date(baseline.day + 'T12:00:00').toLocaleDateString(window.i18n ? window.i18n.locale() : 'de-DE', { day: '2-digit', month: '2-digit' }) : '';
    const rows = ARMOR_STAT_DEFS.map(({ h, label }) => {
      const current = Math.max(0, Math.round(Number((character && character.stats && character.stats[h]) || 0)));
      const target = Math.min(200, Math.max(0, Math.round(Number(goals[h]) || 0)));
      const before = baseline ? Number(baseline.stats[h]) || 0 : current;
      const delta = current - before;
      const deltaText = baseline && delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta} seit ${baselineLabel}` : '';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(label)}</span>` +
        `<span class="inv-tool-meta">${current}${target ? ` / ${target}${current >= target ? ' · erreicht' : ` · fehlt ${target - current}`}` : ''}${esc(deltaText)}</span>` +
        `<input type="number" class="inv-goal-input" min="0" max="200" step="10" data-stat-goal="${h}" value="${target || ''}" placeholder="Ziel"></div>`;
    }).join('');
    return card('Stat-Ziele', '🎯', rows +
      `<div class="inv-tool-muted">Zielwerte 0–200 (DIM), lokal gespeichert. Verlauf: ${history.length} Tag${history.length === 1 ? '' : 'e'}. ` +
      `<button type="button" class="btn ghost small" data-stat-history-reset>Verlauf löschen</button></div>`, '', 'wide');
  }

  function renderDataSources() {
    const fetched = Number(data && data.fetchedAt) || 0;
    const age = fetched ? Math.max(0, Math.round((Date.now() - fetched) / 60000)) : null;
    const pm = Object.values((data && data.postmaster) || {}).reduce((sum, list) => sum + (list || []).length, 0);
    const xur = xurState ? (xurState.ok === false ? 'Fehler' : xurState.active ? 'aktiv' : 'nicht da') : 'nicht geladen';
    const queue = queueStatus ? `${Number(queueStatus.requests) || 0} Anfragen · ${Number(queueStatus.rateLimits) || 0}× 429` : 'unbekannt';
    return card('Datenquellen', '🗃',
      `<div class="inv-tool-row"><span class="inv-tool-main">Inventar</span><span class="inv-tool-meta ${age == null || age > 15 ? 'inv-tool-warn' : ''}">${age == null ? 'kein Snapshot' : age <= 1 ? 'aktuell' : `vor ${age} Min.`}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Poststelle</span><span class="inv-tool-meta">${pm} Items</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Xûr</span><span class="inv-tool-meta">${esc(xur)}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">Manifest</span><span class="inv-tool-meta">${esc(String((data && data.manifestVersion) || 'unbekannt'))}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-main">API</span><span class="inv-tool-meta">${esc(queue)}</span></div>` +
      (storageState && storageState.ok ? `<div class="inv-tool-row"><span class="inv-tool-main">Speicher</span><span class="inv-tool-meta">${fmtBytes(storageState.total)}</span></div>` : ''), '', 'wide');
  }

  function renderActionLog() {
    if (!actionLogState && !actionLogLoading && api && typeof api.actionsRecent === 'function') {
      actionLogLoading = true;
      api.actionsRecent(20).then((result) => { actionLogState = result || { ok: true, items: [] }; })
        .catch((error) => { actionLogState = { ok: false, error: error.message || String(error), items: [] }; })
        .finally(() => { actionLogLoading = false; render(); });
    }
    const state = actionLogState;
    let body = '';
    if (!state) body = `<span class="inv-tool-muted">${actionLogLoading ? 'Lade Protokoll …' : 'Noch kein Protokoll.'}</span>`;
    else if (state.ok === false) body = `<span class="inv-tool-warn">${esc(state.error || 'Protokoll nicht lesbar.')}</span>`;
    else {
      const labels = {
        transfer: 'Transfer', equip: 'Angelegt', socket: 'Mod/Perk', lock: 'Markierung',
        'postmaster-pull': 'Poststelle', 'postmaster-collect-all': 'Poststelle (alle)', 'ingame-loadout': 'In-Game-Loadout',
        'weekly-digest': 'Digest'
      };
      body = (state.items || []).length
        ? state.items.map((entry) => {
            const detail = entry.detail || {};
            const text = [detail.itemHash, detail.itemId, detail.characterId, detail.loadoutIndex != null ? `Slot ${Number(detail.loadoutIndex) + 1}` : '']
              .filter(Boolean).slice(0, 2).join(' · ');
            return `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(labels[entry.kind] || entry.kind || 'Aktion')}</span>` +
              `<span class="inv-tool-main">${esc(text || '—')}</span>` +
              `<span class="inv-tool-meta">${esc(loadoutUsedLabel(Number(entry.at) || 0))}</span></div>`;
          }).join('')
        : '<span class="inv-tool-muted">Noch keine Aktionen protokolliert.</span>';
    }
    return card('Aktionsprotokoll', '🧾', body,
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-actions-reload ${actionLogLoading ? 'disabled' : ''}>Aktualisieren</button></span>`, 'wide');
  }

  function fold(title, html, open) {
    if (!html) return '';
    return `<details class="inv-tool-fold"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="inv-tool-grid">${html}</div></details>`;
  }

  const lazyFoldBuilders = new Map();
  let lazyFoldSeq = 0;
  function lazyFold(title, builder) {
    if (typeof builder !== 'function') return '';
    const key = 'lf-' + (lazyFoldSeq += 1);
    lazyFoldBuilders.set(key, builder);
    return `<details class="inv-tool-fold" data-lazy-fold="${key}"><summary>${esc(title)}</summary><div class="inv-tool-grid" data-lazy-body></div></details>`;
  }

  function renderToolsFocus() {
    const tasks = [];
    const age = data && data.fetchedAt ? Math.max(0, Math.round((Date.now() - Number(data.fetchedAt)) / 60000)) : null;
    if (!data) {
      tasks.push({ tone: 'warn', title: 'Inventar noch nicht geladen', text: 'Ohne Inventar bleiben die meisten Werkzeuge leer.', action: '<button type="button" class="btn primary small" data-tool-quick-refresh>Jetzt laden</button>' });
    } else {
      if (age == null || age > 15) tasks.push({ tone: 'warn', title: 'Daten sind veraltet', text: age == null ? 'Kein Snapshot vorhanden.' : `Letzte Aktualisierung vor ${age} Minuten.`, action: '<button type="button" class="btn ghost small" data-tool-quick-refresh>Aktualisieren</button>' });
      const pm = postmasterCount();
      if (pm >= 15) tasks.push({ tone: 'warn', title: 'Postfach fast voll', text: `${pm} Items warten in der Poststelle.`, action: '<button type="button" class="btn ghost small" data-tool-open-view="week">Zur Woche</button>' });
      const missing = championCoverage().filter((entry) => entry.coverage.every((names) => !names.length));
      if (missing.length) tasks.push({ tone: 'warn', title: 'Champion-Abdeckung fehlt', text: `${missing.map((entry) => CLASS_NAMES[entry.character.classType] || 'Hüter').join(', ')} ohne Champion-Fähigkeit.`, action: '<button type="button" class="btn ghost small" data-tool-open-view="builds">Build-Check</button>' });
      const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []);
      if (!loadouts.length) tasks.push({ tone: '', title: 'Noch kein Loadout gespeichert', text: 'Baue dein erstes Loadout direkt im Editor.', action: '<button type="button" class="btn ghost small" data-tool-quick-loadouts>Editor öffnen</button>' });
      const godrolls = Number(data.godrolls) || 0;
      if (godrolls) tasks.push({ tone: 'ok', title: `${godrolls} Godrolls im Inventar`, text: 'Direkt filtern und als Favorit markieren.', action: '<button type="button" class="btn ghost small" data-tool-search="is:godroll">Ansehen</button>' });
    }
    if (!tasks.length) tasks.push({ tone: 'ok', title: 'Alles im grünen Bereich', text: 'Keine dringenden Aufgaben gefunden.', action: '' });
    const rows = tasks.slice(0, 4).map((task) =>
      `<div class="inv-tools-task ${task.tone}"><span class="inv-tools-task-dot"></span><span class="inv-tools-task-copy"><strong>${esc(task.title)}</strong><small>${esc(task.text)}</small></span>${task.action}</div>`
    ).join('');
    return card('Heute im Fokus', '🎯', rows, `<span class="inv-tool-badge">${tasks.length}</span>`);
  }

  function renderQuickAccess() {
    const actions = [
      ['🔎', 'Godrolls', 'is:godroll'],
      ['♻', 'Duplikate', 'is:dupe'],
      ['⚡', '20+ Spike', 'is:spike20'],
      ['🛡', 'Rüstung', 'is:armor']
    ];
    return card('Schnellzugriff', '⚡',
      `<div class="inv-tools-quickgrid">` +
        actions.map(([icon, label, query]) => `<button type="button" class="inv-tools-quick" data-tool-search="${esc(query)}"><span>${icon}</span><b>${esc(label)}</b><small>im Inventar</small></button>`).join('') +
        `<button type="button" class="inv-tools-quick" data-tool-quick-loadouts><span>🧰</span><b>Loadouts</b><small>Editor</small></button>` +
        `<button type="button" class="inv-tools-quick" data-tool-open-view="week"><span>📅</span><b>Woche</b><small>Reset & Poststelle</small></button>` +
        `<button type="button" class="inv-tools-quick" data-tool-open-view="vendor"><span>🛒</span><b>Händler</b><small>Xûr & Angebote</small></button>` +
        `<button type="button" class="inv-tools-quick" data-tool-open-view="collection"><span>📦</span><b>Sammlung</b><small>Aufräumen</small></button>` +
      `</div>`, '', 'wide');
  }

  function renderOverviewPage(activityHtml) {
    const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []);
    const missingChampions = championCoverage().filter((entry) => entry.coverage.every((names) => !names.length));
    const checklistItems = weeklyChecklistItems();
    const openChecks = checklistItems.filter((item) => !item.done).length;
    const pm = postmasterCount();
    const xur = xurState;
    const xurText = xur ? (xur.ok === false ? 'Xûr-Status: Fehler' : xur.active ? 'Xûr ist aktiv' : 'Xûr ist weg') : 'Xûr & Angebote';
    const tools = [
      {
        key: 'builds', icon: '🛠', label: 'Builds & Optimierung',
        desc: 'Stats, Loadouts, Optimierer und Rüstungsvergleich.',
        status: loadouts.length ? `${loadouts.length} Loadout${loadouts.length === 1 ? '' : 's'}` : (missingChampions.length ? `${missingChampions.length} ohne Champion-Abdeckung` : 'Bereit für den Build-Check')
      },
      {
        key: 'collection', icon: '📦', label: 'Sammlung & Aufräumen',
        desc: 'Crafting, Triumphs, Quellen und Vault-Cleanup.',
        status: `${Number(data && data.godrolls) || 0} Godrolls${sessionLoot.length ? ` · ${sessionLoot.length} neu` : ''}`
      },
      {
        key: 'week', icon: '📅', label: 'Woche & Fortschritt',
        desc: 'Wochenplan, Reset, Poststelle und Live-Aktionen.',
        status: `${openChecks} offen${pm ? ` · ${pm} Postfach` : ''}`
      },
      {
        key: 'vendor', icon: '🛒', label: 'Händler & Xûr',
        desc: 'Angebote, Einkaufsliste und Bungie-Status.',
        status: xurText
      }
    ];
    const toolCards = tools.map((tool) =>
      `<button type="button" class="overview-tool" data-tool-open-view="${tool.key}">` +
        `<span class="overview-tool-icon">${tool.icon}</span>` +
        `<span class="overview-tool-copy"><strong>${esc(tool.label)}</strong><small>${esc(tool.desc)}</small><em>${esc(tool.status)}</em></span>` +
        `<span class="overview-tool-arrow">→</span>` +
      `</button>`
    ).join('');
    return `<section class="overview-page">` +
      `<div class="overview-section-head"><div><span class="overview-kicker">Werkzeuge</span><h3>Bereiche</h3></div>` +
        `<small>Alle Werkzeuge direkt erreichbar</small></div>` +
      `<div class="overview-tools">${toolCards}</div>` +
      `<div class="overview-section-head"><div><span class="overview-kicker">Heute</span><h3>Lage &amp; Fokus</h3></div>` +
        `<small>Was jetzt wichtig ist</small></div>` +
      `<div class="overview-grid">` +
        renderToolsFocus() +
        renderWeekPulse() +
        renderPostGameCard() +
        activityHtml +
      `</div>` +
      fold('Schnellzugriff', renderQuickAccess()) +
      fold('Vorrat & Ziele', renderMaterials() + renderMaterialGoals() + renderSessionGoals()) +
      fold('Diagnose', renderDataHealth() + renderSelfTestCard() + renderConfigLog() + renderOverlayDiagnostics() + renderPerfHistory() + renderPrivacyCard() + renderStorageCard() + renderBackupCard() + renderIntegrityCard() + renderSecretsCard() + renderCrashCard() + renderProfileCard() + renderNotificationRulesCard() + renderActionQueueCard()) +
      fold('Hilfe & Kürzel', renderShortcutCheatSheet()) +
    `</section>`;
  }

  function switchToolView(view) {
    if (!TOOL_VIEWS.some((entry) => entry.key === view)) return;
    toolView = view;
    render();
    if (host) host.scrollTop = 0;
  }

  function renderWeekPulse() {
    const checklist = ((getCfg().checklist && getCfg().checklist.items) || []);
    const done = checklist.filter((item) => item.done).length;
    const pm = postmasterCount();
    const xur = xurState ? (xurState.ok === false ? 'Fehler' : xurState.active ? 'aktiv' : 'nicht da') : 'nicht geladen';
    const rows = [
      ['Reset', nextResetLabel()],
      ['Checkliste', `${done}/${checklist.length || 0} erledigt`],
      ['Postfach', pm ? `${pm} Items` : 'leer'],
      ['Xûr', xur]
    ].map(([label, value]) => `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span><span class="inv-tool-main">${esc(value)}</span></div>`).join('');
    return card('Wochenfortschritt', '📅', rows, '<button type="button" class="btn ghost small" data-tool-open-view="week">Woche öffnen</button>');
  }

  function renderDataHealth() {
    const age = Number(data && data.fetchedAt) ? Math.max(0, Math.round((Date.now() - Number(data.fetchedAt)) / 60000)) : null;
    const manifest = String((data && data.manifestVersion) || '—');
    const wishlist = Number((data && data.wishlist && data.wishlist.count) || 0);
    const rows = [
      ['Snapshot', age == null ? 'keiner' : age <= 1 ? 'aktuell' : `vor ${age} Min.`],
      ['Manifest', manifest === '—' ? '—' : manifest.split('.').slice(0, 2).join('.')],
      ['Wunschliste', `${wishlist} Waffen`],
      ['Datenquelle', 'Bungie-API']
    ].map(([label, value]) => `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span><span class="inv-tool-main">${esc(value)}</span></div>`).join('');
    return card('Datenqualität', '🩺', rows, '<button type="button" class="btn ghost small" data-tool-quick-refresh>Aktualisieren</button>');
  }

  async function loadOverlayDiag(force) {
    if (overlayDiagLoading) return;
    overlayDiagLoading = true;
    render();
    try {
      overlayDiagState = (api && typeof api.getOverlayState === 'function') ? await api.getOverlayState() : null;
      const tail = (api && typeof api.getLogTail === 'function') ? await api.getLogTail('app', 60) : null;
      overlayDiagLog = (tail && Array.isArray(tail.lines) ? tail.lines : []).filter((line) => /overlay|guide|fokus|focus|window|testmodus|fenster/i.test(line)).slice(-8);
      overlayDiagLogPath = (tail && tail.path) || '';
    } catch (error) {
      overlayDiagState = { error: error.message || String(error) };
    } finally {
      overlayDiagLoading = false;
      render();
    }
  }

  function overlayDiagAction(action) {
    if (!api) return;
    const call = {
      enter: api.enterOverlay,
      show: api.showOverlay,
      leave: api.leaveOverlay,
      toggle: api.toggleOverlay,
      window: api.showWindow
    }[action];
    if (typeof call !== 'function') return;
    Promise.resolve(call()).catch(() => {}).finally(() => loadOverlayDiag(true));
  }

  let privacyInfo = null;
  let privacyLoading = false;
  let privacyTried = false;

  function ensurePrivacyInfo() {
    if (privacyTried || privacyLoading || !api) return;
    privacyTried = true;
    privacyLoading = true;
    Promise.resolve(typeof api.getAppInfo === 'function' ? api.getAppInfo() : null)
      .then((info) => { privacyInfo = info || { unavailable: true }; })
      .catch(() => { privacyInfo = { unavailable: true }; })
      .finally(() => {
        privacyLoading = false;
        if (host && !host.classList.contains('hidden')) render();
      });
  }

  let configBackups = null;
  let configBackupsLoading = false;

  function ensureConfigBackups(force) {
    if (!api || typeof api.configBackupList !== 'function') return;
    if (configBackupsLoading) return;
    if (configBackups && !force) return;
    configBackupsLoading = true;
    api.configBackupList().then((result) => {
      configBackups = result && result.ok ? (result.items || []) : [];
    }).catch(() => { configBackups = []; }).finally(() => {
      configBackupsLoading = false;
      if (host && !host.classList.contains('hidden')) render();
    });
  }

  function renderBackupCard() {
    ensureConfigBackups(false);
    const rows = (configBackups || []).slice(0, 6).map((backup) => {
      const at = Number(backup.at) ? new Date(Number(backup.at)).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE') : '—';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(backup.name)}</span>` +
        `<span class="inv-tool-meta">${fmtBytes(backup.size)} · ${esc(at)}${backup.encrypted ? ' · verschlüsselt' : ''}</span>` +
        `<button type="button" class="btn ghost small" data-config-diff="${esc(backup.name)}">Vergleich</button>` +
        `<button type="button" class="btn ghost small" data-config-restore="${esc(backup.name)}">Laden</button></div>`;
    }).join('');
    return card('Konfiguration sichern', '💾', rows || '<span class="inv-tool-muted">Noch keine Sicherung vorhanden.</span>',
      '<span class="inv-tool-actions">' +
        '<button type="button" class="btn ghost small" data-config-backup>Jetzt sichern</button>' +
        '<button type="button" class="btn ghost small" data-config-export>Exportieren</button>' +
        '<button type="button" class="btn ghost small" data-config-import>Importieren</button>' +
      '</span>', 'wide');
  }

  let integrityState = null;
  let integrityLoading = false;
  let crashLines = null;
  let crashLoading = false;
  let crashFilter = '';

  function ensureIntegrity(force) {
    if (!api || typeof api.storageVerify !== 'function') return;
    if (integrityLoading) return;
    if (integrityState && !force) return;
    integrityLoading = true;
    api.storageVerify().then((result) => { integrityState = result || null; })
      .catch((error) => { integrityState = { ok: false, error: error.message || String(error) }; })
      .finally(() => {
        integrityLoading = false;
        if (host && !host.classList.contains('hidden')) render();
      });
  }

  function renderIntegrityCard() {
    const age = Number(data && data.fetchedAt) ? Math.max(0, Math.round((Date.now() - Number(data.fetchedAt)) / 60000)) : null;
    const items = ((data && data.vault) || []).length +
      Object.values((data && data.backpack) || {}).reduce((sum, list) => sum + (list || []).length, 0);
    const verified = integrityState && integrityState.ok
      ? `geprüft: ${Number(integrityState.checked) || 0} Dateien${Number(integrityState.corrupt || 0) ? ` · ${Number(integrityState.corrupt) || 0} defekt` : ''}`
      : integrityState && integrityState.ok === false
        ? `Fehler: ${integrityState.error || 'unbekannt'}`
        : 'noch nicht geprüft';
    return card('Datenintegrität', '🧩',
      `<div class="inv-tool-row"><span class="inv-tool-slot">Snapshot</span><span class="inv-tool-main">${age == null ? 'keiner' : age <= 1 ? 'gerade eben' : `vor ${age} Min.`} · ${items} Items</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Manifest</span><span class="inv-tool-main">${esc(String((data && data.manifestVersion) || 'unbekannt'))}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Cache</span><span class="inv-tool-main">${verified}</span></div>` +
      `<div class="inv-tool-muted">Prüft JSON-Caches auf Lesbarkeit. Defekte Dateien werden gemeldet und können über „Caches leeren" neu aufgebaut werden.</div>`,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-integrity-check ' + (integrityLoading ? 'disabled' : '') + '>Prüfen</button>' +
      '<button type="button" class="btn ghost small" data-integrity-repair>Reparieren</button>' +
      '<button type="button" class="btn ghost small" data-tool-refresh>Daten neu laden</button></span>', 'wide');
  }

  function renderSecretsCard() {
    if (!serviceHealth && !serviceHealthLoading) setTimeout(() => loadServiceHealth(false), 80);
    const auth = (serviceHealth && serviceHealth.auth) || {};
    const expires = Number(auth.expiresAt) || 0;
    const expiresText = expires
      ? new Date(expires).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE')
      : '–';
    const expiresDays = expires ? Math.max(0, Math.ceil((expires - Date.now()) / 86400000)) : null;
    const expiryWarning = expiresDays != null && expiresDays <= 7
      ? ` <span class="inv-tool-warn">läuft in ${expiresDays === 0 ? 'weniger als einem Tag' : `${expiresDays} Tag${expiresDays === 1 ? '' : 'en'}`} ab – bitte neu anmelden</span>`
      : '';
    const login = auth.loggedIn ? (auth.displayName && !streamerMode ? auth.displayName : 'angemeldet') : 'nicht angemeldet';
    return card('Zugangsdaten', '🔑',
      `<div class="inv-tool-row"><span class="inv-tool-slot">Anmeldung</span><span class="inv-tool-main">${esc(login)}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Token gültig bis</span><span class="inv-tool-main">${esc(expiresText)}${expiryWarning}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Speicherung</span><span class="inv-tool-main">${auth.tokenReadable === false ? 'nicht lesbar – bitte neu anmelden' : auth.loggedIn ? 'verschlüsselt (Windows DPAPI)' : 'kein Token'}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Client-Secret</span><span class="inv-tool-main">${auth.hasClientSecret ? 'gesetzt (Refresh aktiv)' : 'nicht gesetzt (Ablauf nach ~1 h)'}</span></div>`,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-secrets-refresh>Token erneuern</button>' +
      '<button type="button" class="btn ghost small" data-secrets-reconnect>Neu anmelden</button>' +
      '<button type="button" class="btn ghost small" data-secrets-logout>Abmelden</button></span>', 'wide');
  }

  function ensureCrashLog(force) {
    if (!api || typeof api.getLogTail !== 'function') return;
    if (crashLoading) return;
    if (crashLines && !force) return;
    crashLoading = true;
    api.getLogTail('crash', 300).then((result) => {
      crashLines = result && Array.isArray(result.lines) ? result.lines : [];
    }).catch(() => { crashLines = []; }).finally(() => {
      crashLoading = false;
      if (host && !host.classList.contains('hidden')) render();
    });
  }

  function renderCrashCard() {
    const filter = crashFilter.trim().toLowerCase();
    const lines = (crashLines || []).filter((line) => !filter || String(line).toLowerCase().includes(filter));
    const body = crashLines
      ? (lines.length
        ? lines.slice(-12).map((line) => `<div class="ov-diag-log">${esc(String(line).slice(0, 220))}</div>`).join('')
        : '<span class="inv-tool-muted">Keine passenden Einträge.</span>')
      : (crashLoading ? '<span class="inv-tool-muted">Lade Crash-Log …</span>' : '<span class="inv-tool-muted">Crash-Log auf Knopfdruck laden.</span>');
    return card('Crash-Analyse', '🧯',
      `<div class="inv-tool-add"><input type="text" data-crash-filter value="${esc(crashFilter)}" placeholder="Filtern (z. B. renderer, GPU, error)">` +
      `<button type="button" class="btn ghost small" data-crash-load ${crashLoading ? 'disabled' : ''}>${crashLoading ? 'Lädt …' : 'Laden'}</button>` +
      `<button type="button" class="btn ghost small" data-crash-copy>Kopieren</button>` +
      `<button type="button" class="btn ghost small" data-crash-folder>Ordner öffnen</button></div>` +
      body, '', 'wide');
  }

  // ---------- Selbsttest ----------
  let selfTestState = null;
  let selfTestRunning = false;

  function renderConfigLog() {
    let list = [];
    try { list = JSON.parse(window.localStorage.getItem('d2tool.cfgLog') || '[]'); } catch (error) { list = []; }
    const rows = (Array.isArray(list) ? list : []).slice(0, 8).map((entry) =>
      '<div class="inv-tool-row"><span class="inv-tool-slot">' + new Date(Number(entry.at) || Date.now()).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
      '<span class="inv-tool-main">' + esc((entry.keys || []).join(', ')) + '</span></div>'
    ).join('');
    return card('Einstellungs-Verlauf', '🕘',
      (rows || '<span class="inv-tool-muted">Noch keine Änderungen in dieser Sitzung.</span>') +
      '<div class="inv-tool-muted">Zeigt die zuletzt geänderten Bereiche (max. 50).</div>', '', 'wide');
  }

  function renderSelfTestCard() {
    const rows = (selfTestState && selfTestState.rows) || [];
    const body = selfTestRunning
      ? '<span class="inv-tool-muted">Prüfung läuft …</span>'
      : rows.length
        ? rows.map((row) =>
            `<div class="inv-tool-row"><span class="inv-tool-slot">${row.ok ? '✓' : '✕'}</span><span class="inv-tool-main">${esc(row.label)}</span><span class="inv-tool-meta">${esc(row.detail || '')}</span></div>`
          ).join('') +
          `<div class="inv-tool-muted">${rows.filter((row) => row.ok).length}/${rows.length} Prüfungen bestanden · ${new Date(selfTestState.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${streamerMode ? ' · Streamer-Modus' : ''}</div>`
        : '<span class="inv-tool-muted">Prüft Konfiguration, Speicher, Cache, Datenstand, Anzeigen und Controller-Brücke.</span>';
    return card('Selbsttest', '🩺', body,
      '<span class="inv-tool-actions"><button type="button" class="btn primary small" data-selftest-run>Alles prüfen</button>' +
      (rows.length ? '<button type="button" class="btn ghost small" data-selftest-copy>Bericht kopieren</button>' : '') + '</span>', 'wide');
  }

  function selfTestReport() {
    if (!selfTestState) return '';
    const lines = ['Selbsttest ' + new Date(selfTestState.at).toISOString()];
    for (const row of selfTestState.rows) lines.push(`${row.ok ? '[ok]' : '[!!]'} ${row.label}${row.detail ? ' — ' + row.detail : ''}`);
    return lines.join('\n');
  }

  async function runSelfTest() {
    if (selfTestRunning) return;
    selfTestRunning = true;
    render();
    const rows = [];
    const add = (label, ok, detail) => rows.push({ label, ok: Boolean(ok), detail: String(detail || '') });
    const safe = async (fn, fallback) => { try { return await fn(); } catch (error) { return fallback; } };

    const config = await safe(() => api.getConfig(), null);
    add('Konfiguration lesbar', Boolean(config), config ? `Schema ${config.schemaVersion || '?'}` : 'nicht lesbar');

    const storage = await safe(() => api.storageInfo(), null);
    add('Datenordner beschreibbar', storage && storage.ok, storage && storage.ok ? `${fmtBytes(storage.total)} belegt` : (storage && storage.error) || 'unbekannt');

    const integrity = await safe(() => api.storageVerify(), null);
    add('Cache-Dateien lesbar', integrity && integrity.ok && !(integrity.corrupt || []).length,
      integrity && integrity.ok ? `${integrity.checked} Dateien geprüft${(integrity.corrupt || []).length ? `, ${integrity.corrupt.length} repariert` : ''}` : (integrity && integrity.error) || 'nicht geprüft');

    const age = data && data.fetchedAt ? Math.round((Date.now() - data.fetchedAt) / 60000) : null;
    add('Inventar-Daten aktuell', age != null && age < 1440, age == null ? 'nicht geladen' : `vor ${age} Min.`);
    add('Manifest erkannt', Boolean(data && data.manifestVersion), (data && data.manifestVersion) || 'unbekannt');

    const displays = await safe(() => api.getDisplays(), []);
    add('Anzeigen erkannt', Array.isArray(displays) && displays.length > 0, `${(displays || []).length} Monitor(e)`);

    const gamepad = await safe(() => (api.getGamepadState ? api.getGamepadState() : null), null);
    add('Controller-Brücke', Boolean(gamepad), gamepad ? (gamepad.connected ? 'Controller verbunden' : 'bereit, kein Controller') : 'nicht verfügbar');

    const health = await safe(() => (api.getAppHealth ? api.getAppHealth() : null), null);
    add('App-Status', Boolean(health), health && health.ok ? `RAM ${fmtBytes(health.ram || health.memory || 0)}` : (health && health.error) || 'unbekannt');

    selfTestState = { at: Date.now(), rows };
    selfTestRunning = false;
    render();
    const failed = rows.filter((row) => !row.ok).length;
    toast(failed ? `Selbsttest: ${failed} von ${rows.length} Prüfungen auffällig.` : `Selbsttest: alle ${rows.length} Prüfungen bestanden.`, failed ? 'warning' : 'success', 3200);
  }

  // ---------- Speicher & Caches ----------
  function renderStorageCard() {
    ensureStorageInfo();
    const state = storageState;
    if (!state || !state.ok) {
      return card('Speicher & Caches', '💾',
        state && state.error ? `<span class="inv-tool-muted">Nicht lesbar: ${esc(state.error)}</span>` : '<span class="inv-tool-muted">Speicherbelegung wird geladen …</span>',
        '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-storage-refresh>Aktualisieren</button></span>', 'wide');
    }
    const row = (label, value, hint) =>
      `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span><span class="inv-tool-main">${esc(value)}</span>${hint ? `<span class="inv-tool-meta">${esc(hint)}</span>` : ''}</div>`;
    return card('Speicher & Caches', '💾',
      row('Gesamt', fmtBytes(state.total)) +
      row('Manifest', fmtBytes(state.manifest), 'alte Versionen entfernbar') +
      row('Wunschlisten', fmtBytes(state.wishlists)) +
      row('Cache gesamt', fmtBytes(state.cache), `${state.cacheCount || 0} Dateien`) +
      row('Backups', fmtBytes(state.backups), `${state.backupsCount || 0} Dateien`) +
      row('Logs', fmtBytes(state.logs), `${state.logsCount || 0} Dateien`) +
      row('Konfiguration', fmtBytes(state.config)) +
      '<div class="inv-tool-muted">Konfiguration, Anmeldungen und Notizen bleiben beim Aufräumen erhalten.</div>',
      '<span class="inv-tool-actions">' +
      '<button type="button" class="btn ghost small" data-storage-clean="manifest-old">Alte Manifeste</button>' +
      '<button type="button" class="btn ghost small" data-storage-clean="wishlist">Wunschlisten</button>' +
      '<button type="button" class="btn ghost small" data-storage-clean="logs">Logs</button>' +
      '<button type="button" class="btn ghost small" data-storage-clean="backups">Alte Backups</button>' +
      '<button type="button" class="btn ghost small" data-cache-clear>Bild-Cache</button>' +
      '<button type="button" class="btn ghost small" data-storage-clean="all-caches">Alles</button>' +
      '</span>', 'wide');
  }

  function renderPrivacyCard() {
    ensurePrivacyInfo();
    ensureStorageInfo();
    if (!serviceHealth && !serviceHealthLoading) setTimeout(() => loadServiceHealth(false), 80);
    const auth = (serviceHealth && serviceHealth.auth) || {};
    const tokenText = auth.tokenReadable === false
      ? 'gespeicherte Tokens nicht lesbar'
      : auth.loggedIn
        ? 'vorhanden · verschlüsselt (Windows DPAPI)'
        : 'kein Token gespeichert';
    return card('Datenschutz & Speicher', '🔐',
      `<div class="inv-tool-row"><span class="inv-tool-slot">Datenordner</span><span class="inv-tool-main" title="${esc((privacyInfo && privacyInfo.userData) || '')}">${esc((privacyInfo && privacyInfo.userData) || '—')}</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Tokens</span><span class="inv-tool-main">${esc(tokenText)}</span></div>` +
      (storageState && storageState.ok
        ? `<div class="inv-tool-row"><span class="inv-tool-slot">Lokal</span><span class="inv-tool-main">Cache ${fmtBytes(storageState.cache)} · Logs ${fmtBytes(storageState.logs)} · Backups ${fmtBytes(storageState.backups)}</span></div>`
        : '') +
      `<label class="picker-check"><input type="checkbox" data-privacy-streamer ${streamerMode ? 'checked' : ''}> Streamer-Modus: Namen und IDs ausblenden</label>` +
      `<div class="inv-tool-muted">Support-Pakete enthalten keine Keys/Tokens; lange IDs werden geschwärzt. Es wird nie etwas aus dem Spiel gelöscht.</div>`,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-privacy-clean>Caches &amp; Logs leeren</button>' +
      '<button type="button" class="btn ghost small" data-tool-privacy-export>Geschwärztes Paket</button>' +
      '<button type="button" class="btn ghost small" data-cache-clear>Bild-Cache leeren</button>' +
      '<button type="button" class="btn ghost small" data-notify-test>Test-Benachrichtigung</button></span>', 'wide');
  }

  function renderOverlayDiagnostics() {
    const state = overlayDiagState;
    const rows = state
      ? [
          ['Modus', state.mode || '—'],
          ['Sichtbar', state.visible ? 'ja' : 'nein'],
          ['Maus durch', state.clickThrough ? 'ja' : 'nein'],
          ['Deckkraft', state.opacity != null ? `${Math.round(Number(state.opacity) * 100)} %` : '—']
        ].map(([label, value]) => `<div class="inv-tool-row"><span class="inv-tool-slot">${esc(label)}</span><span class="inv-tool-main">${esc(value)}</span></div>`).join('')
      : (overlayDiagLoading ? '<span class="inv-tool-muted">Overlay-Status wird geladen …</span>' : '<span class="inv-tool-muted">Overlay-Status und Fokus-Log laden.</span>');
    const log = overlayDiagLog.length
      ? `<div class="inv-tool-sub">Letzte Overlay-/Fokus-Ereignisse</div>` + overlayDiagLog.map((line) =>
          `<div class="ov-diag-log">${esc(String(line).slice(0, 220))}</div>`
        ).join('')
      : '';
    return card('Overlay- & Fokus-Diagnose', '🎮',
      rows +
      `<div class="ov-diag-actions">` +
        `<button type="button" class="btn ghost small" data-overlay-diag-action="refresh" ${overlayDiagLoading ? 'disabled' : ''}>Status laden</button>` +
        `<button type="button" class="btn ghost small" data-overlay-diag-action="enter">Overlay zeigen</button>` +
        `<button type="button" class="btn ghost small" data-overlay-diag-action="leave">Overlay verlassen</button>` +
        `<button type="button" class="btn ghost small" data-overlay-diag-action="window">Fenster zeigen</button>` +
        `<button type="button" class="btn ghost small" data-overlay-diag-action="toggle">Guide simulieren</button>` +
        `<button type="button" class="btn ghost small" data-overlay-diag-copy>Log kopieren</button>` +
      `</div>` +
      log +
      (overlayDiagLogPath ? `<div class="inv-tool-muted">Log: ${esc(overlayDiagLogPath)}</div>` : ''), '', 'wide');
  }

  const VC_DEFAULTS = {
    weapons: {
      enabled: true, sortArchetype: false, sortDamage: false, tier: 5,
      pve: 80, pvp: 0, universal: false,
      keepPower: true, keepCrafted: true, keepExotic: true, keepMasterwork: true,
      keepSet: true, keepFavorite: true, keepTagged: true, keepLocked: true, removeJunk: false,
      keepNearGod: true, keepDeepsight: true,
      types: []
    },
    armor: {
      enabled: true, groupSlot: true, groupSet: false, groupArchetype: false, groupExotic: true,
      tier: 5, keepOnePerStat: true, keepPower: true, keepTotal: true, keepMasterwork: true,
      keepExotic: true, keepLocked: true, keepSet: true, keepFavorite: true, keepTagged: true, removeJunk: false,
      keepNearGod: true, keepDeepsight: true
    }
  };

  function vcMerge(base, patch) {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = vcMerge(base[key] || {}, value);
      else out[key] = value;
    }
    return out;
  }

  function vcLoadSettings() {
    let stored = {};
    try { stored = JSON.parse(window.localStorage.getItem('d2tool.vaultCleanup') || '{}'); } catch (error) { stored = {}; }
    vcSettings = vcMerge(VC_DEFAULTS, stored);
    return vcSettings;
  }

  function vcSaveSettings() {
    try { window.localStorage.setItem('d2tool.vaultCleanup', JSON.stringify(vcSettings)); } catch (error) { /* egal */ }
  }

  function vcGet(path) {
    const [section, key] = String(path).split('.');
    return vcSettings && vcSettings[section] ? vcSettings[section][key] : undefined;
  }

  function vcSet(path, value) {
    const [section, key] = String(path).split('.');
    if (!vcSettings[section]) vcSettings[section] = {};
    vcSettings[section][key] = value;
    vcSaveSettings();
  }

  function vcTagOf(item) {
    const tags = (getCfg().bungie && getCfg().bungie.itemTags) || {};
    return String(tags[String(item.instanceId || item.hash)] || '');
  }

  function vcFavorite(item) {
    const favs = (getCfg().bungie && getCfg().bungie.favs) || {};
    return Boolean(item.instanceId && favs[item.instanceId]);
  }

  function vcLocked(item) {
    return Boolean((Number(item.state) || 0) & 1);
  }

  function vcQuality(item) {
    if (item.godRoll) return 100;
    if (item.nearGodRoll) return 72;
    const tags = Array.isArray(item.godTags) ? item.godTags : [];
    if (tags.includes('PvE') || tags.includes('PvP')) return 80;
    return 0;
  }

  function vcInLoadout(item) {
    if (!item || !item.instanceId) return false;
    const loadouts = (getCfg().bungie && getCfg().bungie.loadouts) || [];
    return loadouts.some((loadout) => (loadout.items || []).some((entry) => entry.instanceId === item.instanceId));
  }

  function vcProtected(item, kind) {
    const s = vcSettings[kind];
    const tag = vcTagOf(item);
    if (tag === 'junk' && s.removeJunk) return false;
    if (item.exotic && s.keepExotic) return true;
    if (vcLocked(item) && s.keepLocked) return true;
    if (vcFavorite(item) && s.keepFavorite) return true;
    if (tag && tag !== 'junk' && s.keepTagged) return true;
    if (item.masterwork && s.keepMasterwork) return true;
    if (kind === 'weapons' && item.godRoll) return true;
    if (kind === 'weapons' && item.nearGodRoll && s.keepNearGod) return true;
    if (s.keepDeepsight && item.deepsight && Number(item.deepsight.progress) > 0) return true;
    if (s.keepSet && vcInLoadout(item)) return true;
    return false;
  }

  function vcItemKey(item) {
    return String(item.instanceId || item.hash || '');
  }

  function vcFindItem(key) {
    if (!vcReview) return null;
    for (const group of vcReview.groups) {
      const entry = group.items.find((candidate) => vcItemKey(candidate.item) === key);
      if (entry) return entry;
    }
    return null;
  }

  function vcTipHtml(entry) {
    const item = entry.item;
    const rarity = Math.max(0, Math.min(6, Number(item.rarity) || 0));
    const rarityLabel = ['', '', 'Standard', 'Gewöhnlich', 'Selten', 'Legendär', 'Exotisch'][rarity] || '';
    const meta = [item.typeName, rarityLabel, Number(item.power) ? `${item.power} Power` : '', Number(item.gearTier) ? `T${item.gearTier}` : ''].filter(Boolean).join(' · ');
    const tag = vcTagOf(item);
    const stats = (item.stats || []).filter((stat) => Number(stat.value) > 0).slice(0, 8).map((stat) => {
      const max = Number(stat.max) || 100;
      const width = Math.max(2, Math.min(100, ((Number(stat.value) || 0) / max) * 100));
      return `<div class="vc-tip-stat"><span>${esc(stat.label || 'Wert')}</span><i><b style="width:${width}%"></b></i><strong>${Number(stat.value) || 0}</strong></div>`;
    }).join('');
    const selected = [];
    for (const column of item.socketColumns || []) {
      for (const option of column.options || []) if (option.selected && option.n) selected.push(option);
    }
    if (!selected.length) for (const perk of item.perks || []) if (perk && perk.n) selected.push(perk);
    const perks = selected.slice(0, 5).map((perk) =>
      `<span class="vc-tip-perk">${perk.i ? `<img loading="lazy" src="https://www.bungie.net${esc(perk.i)}" alt="">` : ''}${esc(perk.n || '')}</span>`
    ).join('');
    const extras = [
      item.archetype && item.archetype.name ? `Archetyp: ${item.archetype.name}` : '',
      item.setInfo && item.setInfo.name ? `Set: ${item.setInfo.name}` : '',
      item.tunedStat && item.tunedStat.label ? `Tuning: ${item.tunedStat.label}` : '',
      item.baseStatTotal != null ? `Basis-Stats: ${item.baseStatTotal}` : ''
    ].filter(Boolean).map((line) => `<div class="vc-tip-extra">${esc(line)}</div>`).join('');
    const decision = entry.decision === 'remove' ? 'Aussortieren' : 'Behalten';
    return `<div class="vc-tip-head">` +
        `<span class="vc-tip-icon">${item.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(item.icon)}" alt="">` : ''}</span>` +
        `<div><strong class="tt${rarity}">${esc(item.name || 'Item')}</strong><small>${esc(meta)}</small></div>` +
      `</div>` +
      `<div class="vc-tip-badges"><span class="vc-tip-decision ${entry.decision}">${decision}</span>` +
        `${entry.protected ? '<span class="vc-tip-protected">geschützt</span>' : ''}` +
        `${item.godRoll ? '<span class="vc-tip-god">Godroll</span>' : item.nearGodRoll ? '<span class="vc-tip-god">Fast-Godroll</span>' : ''}` +
        `${tag ? `<span class="vc-tip-tag">${esc(tag)}</span>` : ''}` +
      `</div>` +
      (extras ? `<div class="vc-tip-extras">${extras}</div>` : '') +
      (stats ? `<div class="vc-tip-stats">${stats}</div>` : '') +
      (perks ? `<div class="vc-tip-perks">${perks}</div>` : '') +
      (item.description ? `<div class="vc-tip-desc">${esc(item.description.slice(0, 220))}</div>` : '') +
      `<div class="vc-tip-hint">Klick: ${entry.decision === 'keep' ? 'aussortieren' : 'behalten'}</div>`;
  }

  function vcEnsureTip() {
    if (vcTipEl) return vcTipEl;
    vcTipEl = document.createElement('div');
    vcTipEl.className = 'vc-tooltip';
    document.body.appendChild(vcTipEl);
    return vcTipEl;
  }

  function vcShowTip(entry, x, y) {
    if (!entry) return;
    const tip = vcEnsureTip();
    tip.innerHTML = vcTipHtml(entry);
    tip.classList.add('show');
    positionFixedTip(tip, x, y, { offset: 16, padding: 10 });
  }

  function vcHideTip() {
    if (vcTipEl) vcTipEl.classList.remove('show');
  }

  function vcWeaponGroup(item, s) {
    const exotic = item.exotic && s.groupExotic;
    const base = s.sortArchetype
      ? String((item.archetype && item.archetype.name) || item.typeName || 'Waffen')
      : s.sortDamage
        ? String(item.element || item.typeName || 'Waffen')
        : String(item.typeName || 'Waffen');
    return `${exotic ? 'Exotisch · ' : ''}${base}`;
  }

  function vcArmorGroup(item, s, characterClass) {
    const exotic = item.exotic && s.groupExotic;
    const base = s.groupSet
      ? String((item.setInfo && item.setInfo.name) || 'Ohne Set')
      : s.groupArchetype
        ? String((item.archetype && item.archetype.name) || 'Rüstung')
        : String(ARMOR_SLOT_LABELS[Number(item.bucket)] || 'Rüstung');
    return `${exotic ? 'Exotisch · ' : ''}${characterClass} · ${base}`;
  }

  function vcBuildReview() {
    const s = vcSettings || vcLoadSettings();
    const vault = (data && data.vault) || [];
    if (!vault.length) return null;
    const characters = (data && data.characters) || [];
    const className = (classType) => CLASS_NAMES[Number(classType)] || 'Händler';
    const groups = new Map();
    const add = (group, item, kind) => {
      if (!groups.has(group)) groups.set(group, { title: group, kind, items: [] });
      groups.get(group).items.push({ item, kind, decision: 'keep', protected: false, quality: vcQuality(item) });
    };
    if (s.weapons.enabled) {
      for (const item of vault) {
        if (!WEAPON_SLOTS.has(Number(item.bucket))) continue;
        const type = String(item.typeName || 'Waffen');
        if (Array.isArray(s.weapons.types) && s.weapons.types.length && !s.weapons.types.includes(type)) continue;
        add(vcWeaponGroup(item, s.weapons), item, 'weapons');
      }
    }
    if (s.armor.enabled) {
      for (const item of vault) {
        if (!ARMOR_SLOTS.has(Number(item.bucket))) continue;
        add(vcArmorGroup(item, s.armor, className(item.classType)), item, 'armor');
      }
    }
    const list = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, 'de'));
    for (const group of list) {
      group.items.sort((a, b) => (Number(b.item.power) || 0) - (Number(a.item.power) || 0) || (Number(b.item.gearTier) || 0) - (Number(a.item.gearTier) || 0));
      const settings = s[group.kind];
      const maxTier = Math.max(0, ...group.items.map((entry) => Number(entry.item.gearTier) || 0));
      const maxPower = Math.max(0, ...group.items.map((entry) => Number(entry.item.power) || 0));
      const maxTotal = Math.max(0, ...group.items.map((entry) => Number(entry.item.baseStatTotal) || 0));
      for (const entry of group.items) {
        entry.protected = vcProtected(entry.item, group.kind);
        const tier = Number(entry.item.gearTier) || 0;
        let remove = false;
        if (!entry.protected) {
          if (settings.removeJunk && vcTagOf(entry.item) === 'junk') remove = true;
          if (tier && Number(settings.tier) > 0 && tier < Number(settings.tier)) remove = true;
          if (group.kind === 'weapons') {
            const limit = Math.max(Number(settings.pve) || 0, Number(settings.pvp) || 0);
            if (limit > 0 && entry.quality > 0 && entry.quality < limit) remove = true;
            if (settings.keepPower && maxPower && (Number(entry.item.power) || 0) < maxPower && tier < maxTier) remove = true;
          } else {
            if (settings.keepTotal && maxTotal && (Number(entry.item.baseStatTotal) || 0) < maxTotal - 10) remove = true;
            if (settings.keepPower && maxPower && (Number(entry.item.power) || 0) < maxPower && (Number(entry.item.baseStatTotal) || 0) < maxTotal) remove = true;
          }
        }
        entry.decision = remove ? 'remove' : 'keep';
      }
      if (group.items.length && group.items.every((entry) => entry.decision === 'remove')) {
        const best = group.items.slice().sort((a, b) => (Number(b.item.power) || 0) - (Number(a.item.power) || 0))[0];
        if (best) best.decision = 'keep';
      }
    }
    return { groups: list, settings: s };
  }

  function vcTierButtons(section, value) {
    return `<div class="vc-tier">${[0, 1, 2, 3, 4, 5].map((tier) =>
      `<button type="button" class="vc-tier-btn${Number(value) === tier ? ' on' : ''}" data-vc-tier="${section}" data-vc-tier-value="${tier}">${tier}</button>`
    ).join('')}<button type="button" class="vc-tier-btn best${String(value) === 'best' ? ' on' : ''}" data-vc-tier="${section}" data-vc-tier-value="best">Beste</button></div>`;
  }

  function vcCheck(path, label) {
    return `<label class="vc-check"><input type="checkbox" data-vc-option="${path}" ${vcGet(path) ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  }

  function vcRange(path, label) {
    const value = Number(vcGet(path)) || 0;
    return `<div class="vc-range"><label><span>${esc(label)}</span><output data-vc-range-value="${path}">${value >= 100 ? 'Nur Beste' : `${value} %`}</output></label>` +
      `<input type="range" min="0" max="100" step="5" value="${value}" data-vc-range="${path}"></div>`;
  }

  function renderVaultCleanup() {
    if (!data) return card('Tresor-Aufräumen', '🧹', '<span class="inv-tool-muted">Inventar laden, um den Tresor zu prüfen.</span>', '', 'wide');
    const s = vcSettings || vcLoadSettings();
    if (vcReview) return renderVaultCleanupReview(vcReview);
    const vault = data.vault || [];
    const weapons = vault.filter((item) => WEAPON_SLOTS.has(Number(item.bucket))).length;
    const armor = vault.filter((item) => ARMOR_SLOTS.has(Number(item.bucket))).length;
    const types = [...new Set(vault.filter((item) => WEAPON_SLOTS.has(Number(item.bucket))).map((item) => String(item.typeName || 'Waffen')))].sort((a, b) => a.localeCompare(b, 'de'));
    const capacity = 1300;
    const percent = Math.min(100, Math.round((vault.length / capacity) * 100));
    const forecast = (() => {
      const free = Math.max(0, capacity - vault.length);
      let added = 0;
      try {
        const diff = JSON.parse(window.localStorage.getItem('d2inv.snapshotDiff') || 'null');
        added = Number(diff && diff.added) || 0;
      } catch (error) { added = 0; }
      const weeks = added > 0 ? Math.max(1, Math.floor(free / added)) : 0;
      const extra = added > 0 ? ' · bei ' + added + ' neuen Items je Aktualisierung voll in ca. ' + weeks + ' Aktualisierungen' : '';
      return '<div class="vc-forecast">Noch <b>' + free + '</b> Plätze frei' + extra + '</div>';
    })();
    const typeChecks = types.map((type) =>
      `<label class="vc-check sub"><input type="checkbox" data-vc-type="${esc(type)}" ${!s.weapons.types.length || s.weapons.types.includes(type) ? 'checked' : ''}><span>${esc(type)}</span></label>`
    ).join('');
    return card('Tresor-Aufräumen', '🧹',
      `<div class="vc-head"><div><strong>Aktuelle Tresor-Auslastung</strong><span>${vault.length}/${capacity}</span></div><div class="vc-capacity"><span style="width:${percent}%"></span></div></div>` +
      forecast +
      `<div class="vc-settings">` +
        `<section class="vc-column"><h4>Waffen-Optionen</h4>` +
          vcCheck('weapons.enabled', `Waffen bereinigen (${weapons})`) +
          vcCheck('weapons.sortArchetype', 'Nach Archetyp sortieren') +
          vcCheck('weapons.sortDamage', 'Nach Schadenstyp sortieren') +
          `<div class="vc-field"><span>Entfernen, wenn Tier unter …</span>${vcTierButtons('weapons', s.weapons.tier)}</div>` +
          vcRange('weapons.pve', 'Minimale PvE-Roll-Qualität') +
          vcRange('weapons.pvp', 'Minimale PvP-Roll-Qualität') +
          vcCheck('weapons.universal', 'Bevorzuge universell gute Rolls') +
          vcCheck('weapons.keepPower', 'Behalte höchstes Powerlevel') +
          vcCheck('weapons.keepCrafted', 'Behalte angefertigte Waffen') +
          vcCheck('weapons.keepExotic', 'Behalte exotische Gegenstände') +
          vcCheck('weapons.keepMasterwork', 'Behalten, falls Meisterwerk') +
          vcCheck('weapons.keepSet', 'Behalten, wenn Teil einer Ausrüstung') +
          vcCheck('weapons.keepFavorite', 'Behalten, wenn als Favorit markiert') +
          vcCheck('weapons.keepTagged', 'Behalten, wenn als „Behalten“ markiert') +
          vcCheck('weapons.keepNearGod', 'Behalte Fast-Godrolls') +
          vcCheck('weapons.keepDeepsight', 'Behalte Red-Border-Fortschritt') +
          vcCheck('weapons.keepLocked', 'Behalte bereits Gesperrtes') +
          vcCheck('weapons.removeJunk', 'Entfernen, wenn als „Müll“ markiert') +
          `<details class="vc-types"><summary>Wähle Waffentypen zum Sortieren</summary>${typeChecks}</details>` +
        `</section>` +
        `<section class="vc-column"><h4>Rüstungs-Optionen</h4>` +
          vcCheck('armor.enabled', `Rüstung bereinigen (${armor})`) +
          vcCheck('armor.groupSlot', 'Nach Slot gruppieren') +
          vcCheck('armor.groupSet', 'Nach Rüstungs-Set gruppieren') +
          vcCheck('armor.groupArchetype', 'Nach Archetyp gruppieren') +
          vcCheck('armor.groupExotic', 'Exotische gruppieren') +
          `<div class="vc-field"><span>Entfernen, wenn Tier unter …</span>${vcTierButtons('armor', s.armor.tier)}</div>` +
          vcCheck('armor.keepOnePerStat', 'Mindestens einen je Bonus-Stat behalten') +
          vcCheck('armor.keepPower', 'Behalte höchstes Powerlevel') +
          vcCheck('armor.keepTotal', 'Behalte besten Gesamtwert') +
          vcCheck('armor.keepMasterwork', 'Behalte Meisterwerke') +
          vcCheck('armor.keepExotic', 'Behalte exotische Gegenstände') +
          vcCheck('armor.keepLocked', 'Behalte bereits Gesperrtes') +
          vcCheck('armor.keepSet', 'Behalten, wenn Teil einer Ausrüstung') +
          vcCheck('armor.keepFavorite', 'Behalten, wenn als Favorit markiert') +
          vcCheck('armor.keepTagged', 'Behalten, wenn als „Behalten“ markiert') +
          vcCheck('armor.keepDeepsight', 'Behalte Red-Border-Fortschritt') +
          vcCheck('armor.removeJunk', 'Entfernen, wenn als „Müll“ markiert') +
        `</section>` +
      `</div>` +
      `<div class="vc-warning"><strong>Du hast am Ende zwei Möglichkeiten:</strong>` +
        `<span>1. Lass das Tool die Ausrüstung mit Tags markieren, um sie zu behalten oder zu entfernen.</span>` +
        `<span>2. Kopiere die Liste der zu entfernenden Gegenstände, um sie im Inventar zu prüfen.</span>` +
        `<span>Diese Seite löscht keine deiner Gegenstände. Du musst sie selbst im Spiel löschen.</span></div>` +
      `<div class="vc-start"><button type="button" class="btn primary" data-vc-start>Meinen Tresor prüfen</button></div>`, '', 'wide vc-page');
  }

  function renderVaultCleanupReview(review) {
    if (!review.groups.length) {
      vcReview = null;
      return card('Tresor-Aufräumen', '🧹', '<span class="inv-tool-muted">Keine passenden Gegenstände für diese Optionen gefunden.</span>', '', 'wide');
    }
    vcGroupIndex = Math.max(0, Math.min(review.groups.length - 1, vcGroupIndex));
    const group = review.groups[vcGroupIndex];
    const keep = group.items.filter((entry) => entry.decision === 'keep');
    const remove = group.items.filter((entry) => entry.decision === 'remove');
    const steps = review.groups.map((entry, index) =>
      `<button type="button" class="vc-step${index === vcGroupIndex ? ' on' : ''}${index < vcGroupIndex ? ' done' : ''}" data-vc-group="${index}"><span>${index + 1}</span>${esc(entry.title)}</button>`
    ).join('');
    const tile = (entry) => {
      const item = entry.item;
      const tags = [Number(item.gearTier) ? `T${item.gearTier}` : '', Number(item.power) ? `${item.power}` : '', entry.quality ? `${entry.quality}%` : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="vc-item ${entry.decision}${entry.protected ? ' protected' : ''}" data-vc-item="${esc(vcItemKey(item))}" title="${esc(item.name || '')}">` +
        `<span class="vc-item-icon">${item.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(item.icon)}" alt="">` : ''}${entry.protected ? '<b>★</b>' : ''}</span>` +
        `<span class="vc-item-name">${esc(item.name || 'Item')}</span>` +
        `<span class="vc-item-meta">${esc(tags)}</span>` +
        (vcTagOf(item) ? `<span class="vc-item-tag">${esc(vcTagOf(item))}</span>` : '') +
      `</button>`;
    };
    return card('Tresor-Aufräumen', '🧹',
      `<div class="vc-review">` +
        `<aside class="vc-steps"><strong>Fortschritt</strong>${steps}</aside>` +
        `<main class="vc-review-main">` +
          `<div class="vc-review-head"><button type="button" class="btn ghost small" data-vc-group="${vcGroupIndex - 1}">Zurück</button>` +
            `<strong>${esc(group.title)}</strong>` +
            `<button type="button" class="btn ghost small" data-vc-group="${vcGroupIndex + 1}">Weiter</button></div>` +
          `<div class="vc-review-info">Prüfe die unten ausgewählten Gegenstände und ordne sie bei Bedarf um. Klicke auf ein Item, um zwischen „Behalten“ und „Entfernen“ zu wechseln.</div>` +
          `<div class="vc-strategies">` +
            `<button type="button" class="btn ghost small" data-vc-strategy="keepAll">Alles behalten</button>` +
            `<button type="button" class="btn ghost small" data-vc-strategy="keepTier">Bestes Tier</button>` +
            `<button type="button" class="btn ghost small" data-vc-strategy="keepPower">Beste Power</button>` +
            `<button type="button" class="btn ghost small" data-vc-strategy="keepPve">Beste PvE</button>` +
            `<button type="button" class="btn ghost small" data-vc-strategy="keepPvp">Beste PvP</button>` +
            `<button type="button" class="btn ghost small" data-vc-strategy="keepUniversal">Beste Universelle</button>` +
            `<button type="button" class="btn ghost small danger" data-vc-strategy="removeAll">Alles entfernen</button>` +
          `</div>` +
          `<div class="vc-split-head"><span>Zu behalten (${keep.length})</span><span>Zu entfernen (${remove.length})</span></div>` +
          `<div class="vc-split"><div class="vc-keep">${keep.map(tile).join('') || '<span class="vc-empty">Nichts ausgewählt</span>'}</div>` +
            `<div class="vc-remove">${remove.map(tile).join('') || '<span class="vc-empty">Nichts ausgewählt</span>'}</div></div>` +
          `<div class="vc-review-foot"><button type="button" class="btn ghost small" data-vc-settings>Einstellungen</button>` +
            `<button type="button" class="btn ghost small" data-vc-export>Liste kopieren</button>` +
            `<button type="button" class="btn primary small" data-vc-apply>Tags anwenden</button></div>` +
        `</main>` +
      `</div>`, '', 'wide vc-page');
  }

  function vcApplyStrategy(group, strategy) {
    const settings = vcReview.settings || vcSettings;
    const items = group.items;
    const keep = (entry) => { entry.decision = 'keep'; };
    const remove = (entry) => { if (!entry.protected) entry.decision = 'remove'; };
    if (strategy === 'keepAll') items.forEach(keep);
    else if (strategy === 'removeAll') items.forEach((entry) => { entry.decision = entry.protected ? 'keep' : 'remove'; });
    else {
      const metric = (entry) => strategy === 'keepPower' ? Number(entry.item.power) || 0
        : strategy === 'keepPve' ? (Array.isArray(entry.item.godTags) && entry.item.godTags.includes('PvE') ? 100 : entry.quality)
          : strategy === 'keepPvp' ? (Array.isArray(entry.item.godTags) && entry.item.godTags.includes('PvP') ? 100 : entry.quality)
            : strategy === 'keepUniversal' ? entry.quality
              : Number(entry.item.gearTier) || 0;
      const best = Math.max(0, ...items.map(metric));
      for (const entry of items) {
        if (entry.protected || (metric(entry) > 0 && metric(entry) === best)) keep(entry);
        else remove(entry);
      }
    }
    if (items.length && items.every((entry) => entry.decision === 'remove')) keep(items[0]);
  }

  function vcApplyTags() {
    if (!vcReview) return;
    const tags = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
    let kept = 0;
    let removed = 0;
    for (const group of vcReview.groups) {
      for (const entry of group.items) {
        const id = String(entry.item.instanceId || '');
        if (!id) continue;
        if (entry.decision === 'remove') { tags[id] = 'junk'; removed += 1; }
        else { tags[id] = 'keep'; kept += 1; }
      }
    }
    setConfig({ bungie: { itemTags: tags } });
    toast(`${kept} behalten, ${removed} aussortiert. Es wurde nichts gelöscht.`, 'success', 4200);
    vcReview = null;
    vcGroupIndex = 0;
    render();
  }

  let collectionTab = 'overview';
  let recordHideCompleted = false;
  let recordSortProgress = false;
  let recordOnlyUncollected = false;
  let recordSearch = '';
  let recordSearchTimer = null;
  const recordExpandedNodes = new Set();
  let recordLookup = new Map();
  let recordNodeLookup = new Map();
  const RECORD_TRACK_KEY = 'd2tool.trackedTriumphs';
  const RECORD_HISTORY_KEY = 'd2tool.triumphHistory';

  function loadTrackedRecords() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(RECORD_TRACK_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry) => entry && Number(entry.hash))
        .map((entry) => ({
          hash: Number(entry.hash),
          name: String(entry.name || `Triumph ${entry.hash}`),
          icon: String(entry.icon || ''),
          progress: Math.max(0, Number(entry.progress) || 0),
          completion: Math.max(0, Number(entry.completion) || 0),
          complete: entry.complete === true
        }))
        .slice(0, 40);
    } catch (error) {
      return [];
    }
  }

  let recordTracked = loadTrackedRecords();

  function saveTrackedRecords() {
    try {
      window.localStorage.setItem(RECORD_TRACK_KEY, JSON.stringify(recordTracked.slice(0, 40)));
    } catch (error) {
      // Speichern ist optional.
    }
  }

  function toggleTrackedRecord(hash) {
    const key = Number(hash);
    if (!key) return;
    const index = recordTracked.findIndex((entry) => entry.hash === key);
    if (index >= 0) {
      recordTracked.splice(index, 1);
      saveTrackedRecords();
      toast('Triumph nicht mehr verfolgt.', 'info', 1600);
      return;
    }
    const record = recordLookup.get(key);
    recordTracked.push({
      hash: key,
      name: record ? record.name : `Triumph ${key}`,
      icon: record ? record.icon : '',
      progress: record ? record.progress : 0,
      completion: record ? record.completion : 0,
      complete: record ? record.complete === true : false
    });
    saveTrackedRecords();
    toast('Triumph verfolgt – erscheint oben und im Dashboard.', 'success', 2000);
  }

  function syncTrackedRecords(roots) {
    if (!recordTracked.length) return;
    const map = new Map(flattenRecords(roots).map((record) => [record.hash, record]));
    let changed = false;
    for (const tracked of recordTracked) {
      const record = map.get(tracked.hash);
      if (!record) continue;
      for (const field of ['name', 'icon', 'progress', 'completion', 'complete']) {
        if (tracked[field] !== record[field]) {
          tracked[field] = record[field];
          changed = true;
        }
      }
    }
    if (changed) saveTrackedRecords();
  }

  function loadTriumphHistory() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(RECORD_HISTORY_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry) => entry && entry.d)
        .map((entry) => ({
          d: String(entry.d),
          active: Math.max(0, Number(entry.active) || 0),
          lifetime: Math.max(0, Number(entry.lifetime) || 0),
          seals: Math.max(0, Number(entry.seals) || 0),
          at: Number(entry.at) || 0
        }))
        .sort((a, b) => a.d.localeCompare(b.d))
        .slice(-90);
    } catch (error) {
      return [];
    }
  }

  let recordHistory = loadTriumphHistory();

  function recordTriumphHistory(state) {
    if (!state || state.ok === false) return;
    const score = state.score || {};
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const entry = {
      d: day,
      active: Math.max(0, Number(score.active) || 0),
      lifetime: Math.max(0, Number(score.lifetime) || 0),
      seals: Math.max(0, Number(state.completedSeals) || 0),
      at: Date.now()
    };
    recordHistory = recordHistory.filter((item) => item.d !== day).concat(entry).sort((a, b) => a.d.localeCompare(b.d)).slice(-90);
    try {
      window.localStorage.setItem(RECORD_HISTORY_KEY, JSON.stringify(recordHistory));
    } catch (error) {
      // Verlauf ist optional.
    }
  }

  function recordPercent(node) {
    const completion = Math.max(1, Number(node && node.completion) || 1);
    return Math.max(0, Math.min(100, Math.round(((Number(node && node.progress) || 0) / completion) * 100)));
  }

  function recordEscapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function recordMark(value, query) {
    const safe = esc(String(value || ''));
    const needle = String(query || '').trim();
    if (!needle) return safe;
    try {
      return safe.replace(new RegExp(`(${recordEscapeRegex(esc(needle))})`, 'ig'), '<mark>$1</mark>');
    } catch (error) {
      return safe;
    }
  }

  function flattenRecords(roots) {
    const map = new Map();
    recordNodeLookup = new Map();
    const walk = (node, root, trail) => {
      recordNodeLookup.set(node.hash, node);
      for (const record of node.records || []) {
        const existing = map.get(record.hash);
        if (existing) {
          if ((Number(record.progress) || 0) > (Number(existing.progress) || 0)) {
            existing.progress = record.progress;
            existing.completion = record.completion;
            existing.complete = record.complete;
          }
          continue;
        }
        map.set(record.hash, {
          ...record,
          root: String((root && (root.title || root.name)) || ''),
          trail: trail.slice(-2).join(' › ')
        });
      }
      for (const child of node.children || []) walk(child, root, trail.concat(child.name));
    };
    for (const root of roots || []) walk(root, root, []);
    return [...map.values()];
  }

  function recordObjectivesHtml(record, limit) {
    const list = (record.objectives || []).slice(0, limit || 2);
    if (!list.length) return '';
    return `<ul class="dim-record-objectives">` + list.map((objective) =>
      `<li class="${objective.complete ? 'done' : ''}"><span>${objective.complete ? '✓' : '○'}</span>` +
      `<em>${esc(objective.description)}</em><b>${objective.progress}/${objective.completion}</b></li>`
    ).join('') + `</ul>`;
  }

  function recordCard(record, options) {
    const opts = options || {};
    const pct = recordPercent({ progress: record.progress, completion: record.completion });
    const tracked = recordTracked.some((entry) => entry.hash === record.hash);
    const title = record.name || (record.description ? record.description.slice(0, 48) : 'Triumph');
    const context = opts.context === false ? '' :
      (record.root ? `<small class="dim-record-context">${esc(record.root)}${record.trail ? ` · ${esc(record.trail)}` : ''}</small>` : '');
    return `<article class="dim-record-card${record.complete ? ' complete' : ''}" data-record-open="${record.hash}" tabindex="0">` +
      `<header><span class="dim-record-icon">${record.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(record.icon)}" alt="">` : ''}</span>` +
        `<div><strong>${recordMark(title, opts.query != null ? opts.query : recordSearch)}</strong>` +
        `<small>${record.points ? `${record.points} Pkte` : (record.complete ? 'Abgeschlossen' : '')}</small></div>` +
        `<button type="button" class="dim-record-pin${tracked ? ' on' : ''}" data-record-pin="${record.hash}" ` +
          `title="${tracked ? 'Nicht mehr verfolgen' : 'Triumph verfolgen'}" aria-label="${tracked ? 'Nicht mehr verfolgen' : 'Triumph verfolgen'}">★</button>` +
      `</header>` +
      context +
      `${record.description ? `<p>${recordMark(record.description.slice(0, 180), opts.query != null ? opts.query : recordSearch)}</p>` : ''}` +
      recordObjectivesHtml(record, 2) +
      `<div class="dim-record-progress"><span><i style="width:${pct}%"></i></span><b>${Number(record.progress) || 0}/${Number(record.completion) || 0}</b></div>` +
    `</article>`;
  }

  function recordCollectibleGrid(node) {
    const list = Array.isArray(node.collectibles) ? node.collectibles : [];
    if (!list.length) return '';
    const owned = list.filter((entry) => entry.owned).length;
    return `<div class="dim-collectible-head"><span>Gegenstände</span><b>${owned}/${list.length}</b></div>` +
      `<div class="dim-collectible-grid">` + list.map((item) => {
        const tooltip = [item.name, item.description, item.source].filter(Boolean).join(' — ');
        return `<div class="dim-collectible${item.owned ? ' owned' : ' missing'}" title="${esc(tooltip)}">` +
          `<span class="dim-collectible-art">${item.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(item.icon)}" alt="">` : ''}<i>${item.owned ? '✓' : ''}</i></span>` +
          `<strong>${esc(item.name)}</strong></div>`;
      }).join('') + `</div>`;
  }

  function recordNodeSummary(node, pct) {
    return `<summary><span class="dim-record-caret">▶</span>` +
      `${node.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(node.icon)}" alt="">` : ''}` +
      `<strong>${esc(node.name)}</strong>` +
      `<span class="dim-record-summary-progress"><i style="width:${pct}%"></i></span>` +
      `<b>${Number(node.progress) || 0}/${Number(node.completion) || 0}</b>` +
    `</summary>`;
  }

  function renderRecordNodeBody(node, depth) {
    const children = (node.children || []).filter((child) => {
      if (!recordHideCompleted) return true;
      return !(child.complete || (Number(child.progress) || 0) >= (Number(child.completion) || 1));
    });
    let records = (node.records || []).slice();
    if (recordHideCompleted || recordOnlyUncollected) records = records.filter((record) => !record.complete);
    if (recordSortProgress) records = records.sort((a, b) => recordPercent(a) - recordPercent(b) || a.name.localeCompare(b.name, 'de'));
    const limit = recordExpandedNodes.has(String(node.hash)) ? 60 : 18;
    const hiddenCount = Math.max(0, records.length - limit);
    const visible = records.slice(0, limit);
    const childHtml = children.map((child) => renderRecordNode(child, depth + 1)).join('');
    const recordHtml = visible.length ? `<div class="dim-record-grid">${visible.map((record) => recordCard(record)).join('')}</div>` : '';
    const collectibleHtml = recordCollectibleGrid(node);
    const moreHtml = hiddenCount
      ? `<button type="button" class="btn ghost small dim-record-more" data-record-more="${node.hash}">${hiddenCount} weitere anzeigen</button>`
      : '';
    return `${collectibleHtml}${recordHtml}${moreHtml}${childHtml}`;
  }

  function renderRecordNode(node, depth = 1) {
    const pct = recordPercent(node);
    const lazy = depth >= 3;
    const body = lazy ? '' : renderRecordNodeBody(node, depth);
    if (!lazy && !body) return '';
    if (lazy) {
      const hasRecords = (node.records || []).length > 0;
      const hasChildren = (node.children || []).length > 0;
      const hasCollectibles = (node.collectibles || []).length > 0;
      if (!hasRecords && !hasChildren && !hasCollectibles) return '';
    }
    return `<details class="dim-record-node depth-${depth}" data-record-node="${node.hash}" ${depth <= 2 ? 'open' : ''}${lazy ? ' data-record-lazy="1"' : ''}>` +
      recordNodeSummary(node, pct) +
      `<div class="dim-record-node-body"${lazy ? ' data-record-lazy-body' : ''}>${body}</div>` +
    `</details>`;
  }

  function nodeHasContent(node) {
    if (!node) return false;
    if ((node.records || []).length || (node.collectibles || []).length) return true;
    return (node.children || []).some(nodeHasContent);
  }

  function recordHistorySection() {
    const list = recordHistory.slice(-14);
    if (!list.length) return '';
    const values = list.map((entry) => entry.lifetime || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const bars = list.map((entry) => {
      const height = 9 + Math.round(((entry.lifetime || 0) - min) / span * 27);
      return `<span class="dim-history-bar" style="height:${height}px" title="${esc(entry.d)} · ${fmt(entry.lifetime)} Lebenszeit · ${entry.seals} Titel"></span>`;
    }).join('');
    const first = list[0];
    const last = list[list.length - 1];
    const delta = (last.lifetime || 0) - (first.lifetime || 0);
    const sealDelta = (last.seals || 0) - (first.seals || 0);
    return `<section class="dim-records-history">` +
      `<div class="dim-history-head"><span>Verlauf</span><b>${delta >= 0 ? '+' : ''}${fmt(delta)} Punkte${sealDelta ? ` · +${sealDelta} Titel` : ''}</b></div>` +
      `<div class="dim-history-bars">${bars}</div>` +
      `<small>${list.length} ${list.length === 1 ? 'Eintrag' : 'Tage'} · letzter Abruf ${esc(last.d)}</small>` +
    `</section>`;
  }

  function showRecordOverlay(hash) {
    const record = recordLookup.get(Number(hash));
    if (!record) return;
    closeRecordOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'dim-record-overlay';
    const pct = recordPercent(record);
    const objectives = (record.objectives || []).map((objective) =>
      `<li class="${objective.complete ? 'done' : ''}"><span>${objective.complete ? '✓' : '○'}</span>` +
      `<div><strong>${esc(objective.description)}</strong><small>${objective.progress}/${objective.completion}</small></div></li>`
    ).join('');
    const rewards = (record.rewards || []).map((reward) =>
      `<span class="dim-reward">${reward.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(reward.icon)}" alt="">` : ''}${esc(reward.name)}</span>`
    ).join('');
    overlay.innerHTML = `<div class="dim-record-overlay-backdrop" data-record-close></div>` +
      `<article class="dim-record-dialog" role="dialog" aria-modal="true" aria-label="${esc(record.name)}">` +
        `<button type="button" class="dim-record-close" data-record-close aria-label="Schließen">×</button>` +
        `<header><span class="dim-record-icon">${record.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(record.icon)}" alt="">` : ''}</span>` +
          `<div><small>${esc([record.root, record.trail].filter(Boolean).join(' · '))}</small><h2>${esc(record.name)}</h2>` +
          `<span class="dim-record-status ${record.complete ? 'done' : ''}">${record.complete ? 'Abgeschlossen' : 'Offen'}${record.points ? ` · ${record.points} Pkte` : ''}</span></div>` +
        `</header>` +
        `<div class="dim-record-dialog-progress"><span><i style="width:${pct}%"></i></span><b>${Number(record.progress) || 0}/${Number(record.completion) || 0}</b></div>` +
        `${record.description ? `<p class="dim-record-dialog-desc">${esc(record.description)}</p>` : ''}` +
        (objectives ? `<h3>Ziele</h3><ul class="dim-record-dialog-objectives">${objectives}</ul>` : '') +
        (rewards ? `<h3>Belohnungen</h3><div class="dim-record-rewards">${rewards}</div>` : '') +
        `${record.loreHash ? `<a class="dim-record-lore" href="https://www.ishtar-collective.net/entries/${encodeURIComponent(record.loreHash)}" target="_blank" rel="noreferrer">Lore lesen ↗</a>` : ''}` +
        `<footer><button type="button" class="btn ghost small" data-record-pin="${record.hash}">${recordTracked.some((entry) => entry.hash === record.hash) ? 'Nicht mehr verfolgen' : 'Triumph verfolgen'}</button></footer>` +
      `</article>`;
    document.body.appendChild(overlay);
    const onKey = (event) => { if (event.key === 'Escape') closeRecordOverlay(); };
    overlay.__onKey = onKey;
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => {
      if (event.target.closest('[data-record-close]')) {
        closeRecordOverlay();
        return;
      }
      const pin = event.target.closest('[data-record-pin]');
      if (pin) {
        toggleTrackedRecord(pin.dataset.recordPin);
        closeRecordOverlay();
        render();
      }
    });
  }

  function closeRecordOverlay() {
    const overlay = document.querySelector('.dim-record-overlay');
    if (!overlay) return;
    if (overlay.__onKey) document.removeEventListener('keydown', overlay.__onKey);
    overlay.remove();
  }

  let serviceHealth = null;
  let serviceHealthLoading = false;
  let streamerMode = false;

  async function loadServiceHealth(force) {
    if (serviceHealthLoading) return;
    if (serviceHealth && !force) return;
    if (!api) return;
    serviceHealthLoading = true;
    try {
      const [auth, queue] = await Promise.all([
        typeof api.bungieOAuthStatus === 'function' ? api.bungieOAuthStatus().catch(() => null) : Promise.resolve(null),
        typeof api.bungieQueueStatus === 'function' ? api.bungieQueueStatus().catch(() => null) : Promise.resolve(null)
      ]);
      serviceHealth = { auth, queue, at: Date.now() };
    } catch (error) {
      serviceHealth = { error: error.message || String(error), at: Date.now() };
    } finally {
      serviceHealthLoading = false;
      render();
    }
  }

  let queuePollScheduled = false;

  function scheduleQueuePoll() {
    if (queuePollScheduled) return;
    queuePollScheduled = true;
    setTimeout(() => {
      queuePollScheduled = false;
      loadServiceHealth(true);
    }, 15000);
  }

  function renderServiceHealth() {
    if (!api) return '';
    if (!serviceHealth) {
      if (!serviceHealthLoading) setTimeout(() => loadServiceHealth(false), 60);
      return '';
    }
    const auth = serviceHealth.auth || {};
    const queue = serviceHealth.queue || {};
    const throttled = Number(queue.last429At) > Date.now() - 5 * 60 * 1000;
    const issues = [];
    if (serviceHealth.error) issues.push(serviceHealth.error);
    if (auth && auth.ok && !auth.loggedIn) issues.push('Nicht bei Bungie angemeldet.');
    if (auth && auth.tokenReadable === false) issues.push('Gespeicherte Tokens sind nicht lesbar – bitte neu anmelden.');
    if (throttled) issues.push('Bungie drosselt Anfragen (429) – Aktionen kurz warten lassen.');
    const waiting = Number(queue.waiting) || 0;
    if (waiting > 0) {
      issues.push(`Bungie-Queue: ${waiting} Anfrage${waiting === 1 ? '' : 'n'} wartend · ${Number(queue.requests) || 0} gesamt · ${Number(queue.rateLimits) || 0}× 429.`);
      scheduleQueuePoll();
    }
    if (!issues.length) return '';
    return `<div class="inv-tool-health">⚠ ${issues.map((issue) => esc(issue)).join(' ')}` +
      `<span class="inv-tool-health-actions">` +
        `<button type="button" class="btn ghost small" data-health-reconnect>Erneut verbinden</button>` +
        `<button type="button" class="btn ghost small" data-health-refresh>Status prüfen</button>` +
      `</span></div>`;
  }

  function weaponPerkNames(item) {
    const names = new Set();
    for (const perk of item.perks || []) if (perk && perk.n) names.add(String(perk.n).toLowerCase());
    for (const column of item.socketColumns || []) {
      for (const option of column.options || []) if (option && option.selected && option.n) names.add(String(option.n).toLowerCase());
    }
    return names;
  }

  function renderShortcutCheatSheet() {
    const rows = [
      ['/', 'Suche im aktuellen Bereich fokussieren'],
      ['?', 'Kürzel-Übersicht kurz einblenden'],
      ['Esc', 'Dialog, Overlay oder Editor schließen'],
      ['LB / RB', 'Bereiche im Loadout-Editor wechseln'],
      ['A / B', 'Auswählen / Zurück (Controller)'],
      ['Steuerkreuz', 'Navigiert durch Karten, Filter und Listen']
    ].map(([key, text]) => `<div class="inv-tool-row"><span class="inv-tool-slot"><kbd>${esc(key)}</kbd></span><span class="inv-tool-main">${esc(text)}</span></div>`).join('');
    return card('Tastatur & Controller', '⌨️', rows +
      '<div class="inv-tool-muted">Kürzel wirken, wenn kein Eingabefeld aktiv ist. Alle Aktionen bleiben auch per Maus erreichbar.</div>', '', 'wide');
  }

  function renderCollectionGoals() {
    const goals = ((getCfg().bungie && getCfg().bungie.lootGoals) || []).map(String).filter(Boolean);
    if (!goals.length) {
      return card('Zielbrett', '📌', '<span class="inv-tool-muted">Noch keine Ziele. In den Quellen den ★ neben einer Waffe antippen – sie erscheinen hier mit nächstem Schritt.</span>',
        '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-open-view="collection">Quellen öffnen</button></span>', 'wide');
    }
    const ownedNames = new Set(allEntries().map((entry) => String((entry.item && entry.item.name) || '').toLowerCase()).filter(Boolean));
    const redBorder = (lootSourcesState && Array.isArray(lootSourcesState.redBorder)) ? lootSourcesState.redBorder : [];
    const rows = goals.slice(0, 10).map((goal) => {
      const name = String(goal);
      const owned = ownedNames.has(name.toLowerCase());
      const red = redBorder.find((entry) => String(entry.name || '').toLowerCase() === name.toLowerCase()) || null;
      const progress = red && red.pattern ? (Number(red.pattern.progress) || 0) + '/' + (Number(red.pattern.completion) || 0) : '';
      const done = Boolean(red && red.pattern && red.pattern.complete);
      let next = 'Quelle farmen';
      if (owned) {
        if (!red) next = 'Im Besitz – kein Red-Border-Ziel';
        else if (done) next = 'Pattern fertig';
        else next = 'Red Border farmen' + (progress ? ' (' + progress + ')' : '');
      }
      const redChip = red ? ' <span class="inv-tool-chip' + (done ? ' on' : '') + '">Red Border' + (progress ? ' ' + progress : '') + '</span>' : '';
      return '<div class="inv-tool-row"><span class="inv-tool-main">' + esc(name) + redChip + '</span>' +
        '<span class="inv-tool-meta">' + esc(next) + '</span>' +
        '<button type="button" class="btn ghost small" data-tool-search="' + esc(name) + '">Im Inventar</button>' +
        '<button type="button" class="btn ghost small" data-loot-goal-open="' + esc(name) + '">Quelle</button></div>';
    }).join('');
    return card('Zielbrett', '📌', rows,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-open-view="collection">Quellen öffnen</button></span>', 'wide');
  }

  function godrollWeights() {
    const stored = (getCfg().bungie && getCfg().bungie.godrollWeights) || {};
    const clamp = (value, min, max, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
    };
    return {
      selected: clamp(stored.selected, 1, 50, 20),
      alternative: clamp(stored.alternative, 0, 30, 10),
      masterwork: clamp(stored.masterwork, 0, 20, 5),
      perks: stored.perks && typeof stored.perks === 'object' ? stored.perks : {}
    };
  }

  function godrollScore(item) {
    const weights = godrollWeights();
    const have = weaponPerkNames(item);
    const options = Array.isArray(item.godOptions) ? item.godOptions : [];
    const weightOf = (name) => {
      const value = Number(weights.perks[name]);
      return Number.isFinite(value) ? Math.max(1, Math.min(5, value)) : 1;
    };
    const matched = options.filter((name) => have.has(String(name).toLowerCase()));
    const missing = options.filter((name) => !have.has(String(name).toLowerCase()));
    const max = options.reduce((sum, name) => sum + weights.selected * weightOf(name), 0) + weights.masterwork;
    const raw = matched.reduce((sum, name) => sum + weights.selected * weightOf(name), 0) +
      missing.reduce((sum, name) => sum + weights.alternative * weightOf(name), 0) +
      (item.masterwork ? weights.masterwork : 0);
    return {
      score: max ? Math.max(0, Math.min(100, Math.round((raw / max) * 100))) : 0,
      matched,
      missing,
      options
    };
  }

  function renderGodrollProgress() {
    if (!data) return card('Godroll-Fortschritt', '🎯', '<span class="inv-tool-muted">Inventar laden, um Wunschrollen zu prüfen.</span>', '', 'wide');
    const weapons = allEntries().map((entry) => entry.item).filter((item) => item && WEAPON_SLOTS.has(Number(item.bucket)));
    const god = weapons.filter((item) => item.godRoll).length;
    const near = weapons.filter((item) => item.nearGodRoll).length;
    const wishlistCount = Number((data.wishlist && data.wishlist.count) || 0);
    const tracked = weapons.filter((item) => Array.isArray(item.godOptions) && item.godOptions.length);
    const scored = tracked.map((item) => ({ item, ...godrollScore(item) })).sort((a, b) => b.score - a.score);
    const weights = godrollWeights();
    const rows = scored.slice(0, 8).map((entry) => {
      const why = entry.options.map((name) => {
        const hit = entry.matched.includes(name);
        return `<span class="god-why${hit ? ' on' : ''}">${hit ? '✓' : '✗'} ${esc(name)}</span>`;
      }).join(' ');
      const tone = entry.score >= 90 ? 'ok' : entry.score >= 60 ? 'near' : 'off';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${esc(entry.item.name)}` +
        `<small class="inv-tool-muted"> ${entry.matched.length}/${entry.options.length} Perks${entry.masterwork ? ' · Meisterwerk' : ''}</small></span>` +
        `<span class="god-score ${tone}" title="Gewichteter Score">${entry.score}/100</span>` +
        `<button type="button" class="btn ghost small" data-god-why="${esc(entry.item.instanceId || entry.item.hash)}">Warum?</button>` +
        `<button type="button" class="btn ghost small" data-god-watch="${esc(entry.item.name)}" title="Beobachten: Benachrichtigung bei neuem Fund">${(((getCfg().bungie && getCfg().bungie.watchlist) || []).includes(entry.item.name)) ? '★' : '☆'}</button>` +
        `<button type="button" class="btn ghost small" data-tool-search="${esc(`name:"${entry.item.name}"`)}">Im Inventar</button>` +
        `<div class="god-why-row" data-god-why-body="${esc(entry.item.instanceId || entry.item.hash)}" hidden>${why}</div></div>`;
    }).join('');
    const weightEditor = `<details class="god-weights"><summary>Gewichte</summary>` +
      `<label>Treffer<input type="number" min="1" max="50" step="1" data-god-weight="selected" value="${weights.selected}"></label>` +
      `<label>Fehlt<input type="number" min="0" max="30" step="1" data-god-weight="alternative" value="${weights.alternative}"></label>` +
      `<label>Meisterwerk<input type="number" min="0" max="20" step="1" data-god-weight="masterwork" value="${weights.masterwork}"></label>` +
      `<span>Punkte pro Perk; Score wird auf 100 normiert.</span></details>`;
    const perkNames = [...new Set(scored.flatMap((entry) => entry.options))].sort((a, b) => a.localeCompare(b, 'de'));
    const perkEditor = perkNames.length
      ? `<details class="god-weights"><summary>Perk-Gewichte (${perkNames.length})</summary>` +
          `<div class="god-perk-grid">${perkNames.map((name) => {
            const value = Math.max(1, Math.min(5, Number(weights.perks[name]) || 1));
            const options = [1, 2, 3, 4, 5].map((weight) => `<option value="${weight}"${weight === value ? ' selected' : ''}>${weight}</option>`).join('');
            return `<label><span>${esc(name)}</span><select data-god-perk-weight="${esc(name)}">${options}</select></label>`;
          }).join('')}</div>` +
        `</details>`
      : '';
    const watchRules = ((getCfg().bungie && getCfg().bungie.watchRules) || []);
    const rulesEditor = `<details class="god-weights"><summary>Perk-Regeln (${watchRules.length})</summary>` +
      watchRules.map((rule, index) => `<div class="inv-tool-row small"><span class="inv-tool-main">${esc(rule.weapon || 'Waffe')}: ${esc((rule.perks || []).join(', '))}</span>` +
        `<button type="button" class="btn ghost small" data-watch-rule-del="${index}">×</button></div>`).join('') +
      `<div class="inv-tool-add"><input type="text" data-watch-rule-weapon placeholder="Waffe" maxlength="60">` +
      `<input type="text" data-watch-rule-perks placeholder="Perk1, Perk2" maxlength="120">` +
      `<button type="button" class="btn ghost small" data-watch-rule-add>Hinzufügen</button></div>` +
      `<div class="inv-tool-muted">Benachrichtigung, wenn eine Waffe mit allen genannten Perks im Inventar auftaucht.</div></details>`;
    const kpis = `<div class="inv-tool-row"><span class="inv-tool-slot">Godrolls</span><span class="inv-tool-main">${god} im Inventar · ${near} Fast-Godrolls</span></div>` +
      `<div class="inv-tool-row"><span class="inv-tool-slot">Wunschliste</span><span class="inv-tool-main">${wishlistCount} Waffen mit Einträgen · ${tracked.length} mit Perk-Zielen</span></div>`;
    const list = rows
      ? `<div class="inv-tool-sub">Beste vorhandene Rollen</div>${rows}`
      : '<span class="inv-tool-muted">Keine Wunschrollen mit Perk-Daten gefunden.</span>';
    return card('Godroll-Fortschritt', '🎯', kpis + weightEditor + perkEditor + rulesEditor + list,
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-tool-search="is:godroll">Godrolls anzeigen</button><button type="button" class="btn ghost small" data-tool-search="is:near-godroll">Fast-Godrolls</button></span>`, 'wide');
  }

  let modLibQuery = '';
  let profilesState = null;
  let profilesLoading = false;

  function encounterLootFor(activityName) {
    const groups = (lootSourcesState && Array.isArray(lootSourcesState.groups)) ? lootSourcesState.groups : [];
    const redBorder = (lootSourcesState && Array.isArray(lootSourcesState.redBorder)) ? lootSourcesState.redBorder : [];
    const redNames = new Set(redBorder.map((entry) => String(entry.name || '').toLowerCase()));
    const name = String(activityName || '').toLowerCase();
    const match = groups.find((group) => String(group.source || '').toLowerCase().includes(name));
    if (!match) return null;
    const items = (match.items || []).slice(0, 6).map((item) => ({
      name: String(item.name || ''),
      red: redNames.has(String(item.name || '').toLowerCase())
    }));
    return { items, total: (match.items || []).length, source: String(match.source || '') };
  }

  function renderModLibrary() {
    if (!data) return card('Mod-Bibliothek', '🧩', '<span class="inv-tool-muted">Inventar laden, um Mods zu sehen.</span>', '', 'wide');
    const seen = new Map();
    for (const sockets of Object.values(data.sockDefs || {})) {
      for (const socket of sockets || []) {
        for (const plug of (socket.plugs || [])) {
          if (!plug || !plug.h) continue;
          const category = String(plug.p || '');
          if (!/enhancements|artifice|general|tuning/i.test(category)) continue;
          if (!Number(plug.e) && !/general|artifice/i.test(category)) continue;
          if (!seen.has(Number(plug.h))) seen.set(Number(plug.h), plug);
        }
      }
    }
    const query = modLibQuery.trim().toLowerCase();
    const favorites = readModFavorites();
    const mods = [...seen.values()]
      .filter((plug) => !query || String(plug.n || '').toLowerCase().includes(query))
      .sort((a, b) => Number(a.e || 0) - Number(b.e || 0) || String(a.n || '').localeCompare(String(b.n || ''), 'de'));
    const rows = mods.slice(0, 40).map((plug) =>
      `<div class="inv-tool-row"><span class="inv-tool-slot">${Number(plug.e) ? `⚡${Number(plug.e)}` : '—'}</span>` +
      `<span class="inv-tool-main">${plug.i ? `<img loading="lazy" class="mod-lib-icon" src="https://www.bungie.net${esc(plug.i)}" alt="">` : ''}${esc(plug.n || 'Mod')}</span>` +
      `<span class="inv-tool-meta">${esc(String(plug.p || '').split('.').pop() || '')}</span>` +
      `<button type="button" class="btn ghost small ${favorites.has(Number(plug.h)) ? 'on' : ''}" data-mod-fav="${Number(plug.h)}">★</button>` +
      `<button type="button" class="btn ghost small" data-mod-copy="${esc(plug.n || '')}">Name</button></div>`
    ).join('');
    return card('Mod-Bibliothek', '🧩',
      `<div class="inv-tool-add"><input type="text" data-mod-search value="${esc(modLibQuery)}" placeholder="Mod suchen …">` +
      `<span class="inv-tool-muted">${mods.length} Mods · ⚡ = Energiekosten</span></div>` + (rows || '<span class="inv-tool-muted">Keine Mods für diese Suche.</span>'), '', 'wide');
  }

  function readModFavorites() {
    try {
      const list = JSON.parse(window.localStorage.getItem('d2tool.modFavorites') || '[]');
      return new Set(Array.isArray(list) ? list.map(Number) : []);
    } catch (error) {
      return new Set();
    }
  }

  function ensureProfiles(force) {
    if (!api || typeof api.profilesList !== 'function') return;
    if (profilesLoading) return;
    if (profilesState && !force) return;
    profilesLoading = true;
    api.profilesList().then((result) => { profilesState = result && result.ok ? (result.items || []) : []; })
      .catch(() => { profilesState = []; })
      .finally(() => {
        profilesLoading = false;
        if (host && !host.classList.contains('hidden')) render();
      });
  }

  function renderProfileCard() {
    ensureProfiles(false);
    const active = String((getCfg().profiles && getCfg().profiles.active) || '');
    const rows = (profilesState || []).map((profile) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(profile.name || 'Profil')}</span>` +
      `<span class="inv-tool-meta">${profile.id === active ? 'aktiv' : ''}</span>` +
      `<button type="button" class="btn ghost small" data-profile-apply="${esc(profile.id)}">${profile.id === active ? 'Neu laden' : 'Wechseln'}</button></div>`
    ).join('');
    return card('Profile', '👤', rows || `<span class="inv-tool-muted">${profilesLoading ? 'Lade Profile …' : 'Noch keine Profile. In den Einstellungen anlegen.'}</span>`, '', 'wide');
  }

  function renderDigestCard() {
    const lines = weekSummaryText().split('\n');
    const preview = lines.slice(0, 12).join('\n');
    const schedule = (getCfg().integrations && getCfg().integrations.digestSchedule) || {};
    const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return card('Discord-Digest', '💬',
      `<pre class="digest-preview">${esc(preview)}</pre>` +
      `<div class="inv-tool-add"><label class="inv-tool-check"><input type="checkbox" data-digest-enabled ${schedule.enabled ? 'checked' : ''}> Automatisch</label>` +
        '<select class="control" data-digest-weekday>' + weekdays.map((label, index) => `<option value="${index}"${Number(schedule.weekday) === index ? ' selected' : ''}>${label}</option>`).join('') + '</select>' +
        `<input type="time" data-digest-time value="${esc(String(schedule.time || '18:05'))}">` +
        `<button type="button" class="btn ghost small" data-digest-schedule-save>Zeitplan speichern</button></div>` +
      `<div class="inv-tool-muted">Sendet über den Webhook aus den Einstellungen. Der Zeitplan läuft im Hintergrund (einmal pro Tag).</div>`,
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-digest-image>Als Bild</button>' +
      '<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-digest-copy>Kopieren</button>' +
      '<button type="button" class="btn ghost small" data-digest-test>Test senden</button>' +
      '<button type="button" class="btn ghost small" data-digest-send>Digest senden</button></span>', 'wide');
  }

  function readActionQueue() {
    try {
      const list = JSON.parse(window.localStorage.getItem('d2tool.actionQueue') || '[]');
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function renderNotificationRulesCard() {
    const rules = ((getCfg().notifications && getCfg().notifications.rules) || []);
    const rows = rules.map((rule, index) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${rule.mode === 'show' ? 'Nur anzeigen bei' : 'Ausblenden bei'}: ${esc(rule.text || '')}${rule.category ? ` · ${esc(rule.category)}` : ''}</span>` +
      `<button type="button" class="btn ghost small" data-notif-rule-del="${index}">Entfernen</button></div>`
    ).join('');
    return card('Benachrichtigungsregeln', '🔔',
      (rows || '<span class="inv-tool-muted">Keine eigenen Regeln. Ohne Regeln bleiben alle Benachrichtigungen aktiv.</span>') +
      `<div class="inv-tool-add"><input type="text" data-notif-rule-input maxlength="80" placeholder="Text, z. B. Godroll">` +
      `<select class="control" data-notif-rule-mode><option value="show">nur anzeigen bei</option><option value="hide">ausblenden bei</option></select>` +
      `<button type="button" class="btn primary small" data-notif-rule-add>Hinzufügen</button></div>` +
      '<div class="inv-tool-muted">Regeln gelten für Toasts/Windows-Hinweise; der Verlauf bleibt erhalten.</div>', '', 'wide');
  }

  function renderActionQueueCard() {
    const queue = readActionQueue();
    if (!transferJobsState && api && typeof api.bungieJobs === 'function') {
      api.bungieJobs().then((result) => { transferJobsState = Array.isArray(result) ? result : []; })
        .catch(() => { transferJobsState = []; });
    }
    const jobs = Array.isArray(transferJobsState) ? transferJobsState : [];
    const jobRows = jobs.slice(-6).reverse().map((job) => {
      const stateLabel = { queued: 'wartend', running: 'läuft', done: 'fertig', failed: 'Fehler', cancelled: 'abgebrochen' }[job.state] || job.state;
      const detail = job.payload && (job.payload.itemId || job.payload.itemHash) ? String(job.payload.itemId || job.payload.itemHash) : '';
      return `<div class="inv-tool-row"><span class="inv-tool-main">${job.kind === 'equip' ? 'Anlegen' : 'Transfer'}${detail ? ` · ${esc(detail)}` : ''}</span>` +
        `<span class="inv-tool-meta ${job.state === 'failed' ? 'inv-tool-warn' : ''}">${esc(stateLabel)}${job.error ? ` · ${esc(job.error)}` : ''}</span>` +
        (job.state === 'queued' ? `<button type="button" class="btn ghost small" data-transfer-cancel="${esc(job.id)}">Abbrechen</button>` : '') +
        ((job.state === 'failed' || job.state === 'cancelled') ? `<button type="button" class="btn ghost small" data-transfer-retry="${esc(job.id)}">Wiederholen</button>` : '') +
        `</div>`;
    }).join('');
    const rows = queue.slice(0, 6).map((entry, index) =>
      `<div class="inv-tool-row"><span class="inv-tool-main">${esc(entry.loadoutName || entry.name || 'Aktion')}</span>` +
      `<span class="inv-tool-meta">${entry.at ? new Date(entry.at).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE') : ''}${entry.error ? ` · ${esc(entry.error)}` : ''}</span>` +
      `<button type="button" class="btn ghost small" data-queue-retry-index="${index}">Wiederholen</button>` +
      `<button type="button" class="btn ghost small" data-queue-remove-index="${index}">Entfernen</button></div>`
    ).join('');
    const net = queueStatus
      ? `<div class="inv-tool-row small"><span class="inv-tool-main">Bungie-Anfragen</span><span class="inv-tool-meta">${Number(queueStatus.waiting) || 0} wartend · ${Number(queueStatus.rateLimits) || 0}× 429 · ${Number(queueStatus.requests) || 0} gesamt</span></div>`
      : '<div class="inv-tool-muted">Netzwerk-Queue wird geladen.</div>';
    return card('Aktionswarteschlange', '📥',
      net + (jobRows ? `<div class="inv-tool-sub">Transfer-Jobs</div>${jobRows}` : '') + (rows || '<span class="inv-tool-muted">Keine ausstehenden Aktionen.</span>') +
      '<div class="inv-tool-muted">Transfer-/Equip-Jobs lassen sich abbrechen oder wiederholen; Offline-Aktionen ebenfalls. Bungie-Anfragen werden automatisch serialisiert und bei 429 erneut versucht.</div>',
      `<span class="inv-tool-actions"><button type="button" class="btn ghost small" data-queue-run ${queue.length ? '' : 'disabled'}>Alle versuchen</button>` +
      `<button type="button" class="btn ghost small" data-queue-clear ${queue.length ? '' : 'disabled'}>Leeren</button>` +
      `<button type="button" class="btn ghost small" data-transfer-refresh>Jobs aktualisieren</button></span>`, 'wide');
  }

  let helpRoot = null;

  const HELP_SECTIONS = [
    { title: 'Rüstungs-Picker', text: 'Basiswerte + Stat-Mods (+10 je Mod) + Meisterwerk (+10) + Fragmente/Subklasse + Tuning (+5) + Artifice (+3). Maximal 200 je Stat. Exoten: erlaubt (max. 1), verboten oder nur mit Exot.' },
    { title: 'Energie & Mods', text: 'Jedes Rüstungsteil hat drei allgemeine Mod-Plätze. Stat-Mods kosten 3 Energie. „Energie ausgleichen" verteilt Mods auf freie Plätze innerhalb der Kapazität.' },
    { title: 'Artefakt', text: 'Artefakt-Perks werden beim Anwenden über den Artefakt-Socket gesteckt. Nicht freigeschaltete Perks lehnt Bungie ab und werden im Ergebnis genannt.' },
    { title: 'DIM-Import', text: 'dim.gg-Links oder URLs mit ?loadout=… einfügen. Der Import zeigt Items, Mods und unbekannte Einträge vor dem Speichern.' },
    { title: 'Wochenplan', text: 'Reset dienstags 18:00 (17:00 UTC). Eigene Punkte können täglich/wöchentlich zurückgesetzt werden. „Offene übernehmen" kopiert unerledigte Punkte.' },
    { title: 'Quellen & Sammlung', text: 'Quellen zeigen Besitzquote, Red-Border-Fortschritt und Farmrouten. Ziele lassen sich als Wochenaufgabe oder Sammlungs-Ziel übernehmen.' },
    { title: 'Godroll-Score', text: 'Treffer zählen mit Gewicht, fehlende Perks mit reduziertem Gewicht, Meisterwerk als Bonus. Der Score wird auf 100 normiert; Perk-Gewichte sind einstellbar.' },
    { title: 'Tastatur & Controller', text: 'Strg+K öffnet die Palette, / fokussiert die Suche, ? zeigt Kürzel. LB/RB wechseln Bereiche, B schließt Dialoge, Pfeiltasten navigieren Kacheln.' },
    { title: 'Fehlermeldungen', text: '„Nicht angemeldet/abgelaufen": Zugangsdaten-Karte prüfen. „429": Bungie drosselt, Queue abwarten. „Energie reicht nicht": Checkliste oder Energie ausgleichen.' }
  ];

  function openHelpCenter(query) {
    const filter = String(query || '').toLowerCase();
    if (!helpRoot) {
      helpRoot = document.createElement('div');
      helpRoot.className = 'cmd-palette hidden';
      helpRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Hilfe">' +
        '<div class="wn-head"><strong>Hilfe & Erklärungen</strong><button type="button" class="icon-btn" data-help-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-body">' +
          '<input type="search" class="settings-search" data-help-search placeholder="Hilfe durchsuchen …" style="width:100%;margin-bottom:8px">' +
          '<div data-help-list></div>' +
        '</div>' +
      '</div>';
      document.body.appendChild(helpRoot);
      helpRoot.addEventListener('click', (event) => {
        if (event.target === helpRoot || event.target.closest('[data-help-close]')) helpRoot.classList.add('hidden');
      });
      helpRoot.addEventListener('input', (event) => {
        if (event.target.closest('[data-help-search]')) renderHelpList(event.target.value);
      });
    }
    const search = helpRoot.querySelector('[data-help-search]');
    search.value = String(query || '');
    renderHelpList(query);
    helpRoot.classList.remove('hidden');
    search.focus();
  }

  function renderHelpList(query) {
    if (!helpRoot) return;
    const filter = String(query || '').toLowerCase();
    const list = HELP_SECTIONS.filter((section) => !filter || `${section.title} ${section.text}`.toLowerCase().includes(filter));
    helpRoot.querySelector('[data-help-list]').innerHTML = list.length
      ? list.map((section) => `<div class="help-row"><strong>${esc(section.title)}</strong><p>${esc(section.text)}</p></div>`).join('')
      : '<div class="inv-tool-muted">Kein Treffer.</div>';
  }

  function renderTriumphOverview() {
    if (!triumphsState && !triumphsLoading) setTimeout(() => loadTriumphs(false), 40);
    if (triumphsLoading && !triumphsState) {
      return `<section class="dim-records-page"><div class="dim-records-loading">Triumphs & Sammlungen werden geladen …</div></section>`;
    }
    if (!triumphsState || triumphsState.ok === false) {
      return `<section class="dim-records-page"><div class="dim-records-error">${esc((triumphsState && triumphsState.error) || 'Triumphs konnten nicht geladen werden.')}` +
        `<button type="button" class="btn ghost small" data-record-retry>Erneut laden</button></div></section>`;
    }
    const roots = Array.isArray(triumphsState.roots) ? triumphsState.roots : [];
    const staticOrder = ['Triumphs', 'Titel', 'Sammlungen', 'Plaketten', 'Stat Tracker', 'Vermächtnis-Triumphe', 'Vermächtnis-Titel', 'Medaillen', 'Baupläne & Katalysatoren', 'Lore', 'Hüter-Ränge'];
    const orderedRoots = roots.filter((root) => String(root.title || '') !== 'Triumphs' || nodeHasContent(root)).slice().sort((a, b) => {
      const ai = staticOrder.indexOf(a.title);
      const bi = staticOrder.indexOf(b.title);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    if (!orderedRoots.length && triumphsState.seals && triumphsState.seals.length) {
      orderedRoots.push({
        hash: 'seals', title: 'Titel', name: 'Siegel', progress: triumphsState.completedSeals || 0,
        completion: triumphsState.seals.length, records: triumphsState.seals.map((seal) => ({
          hash: seal.hash, name: seal.name, icon: seal.icon, description: '', points: 0,
          progress: seal.progress, completion: seal.completion, complete: seal.complete, objectives: [], rewards: [], loreHash: 0
        })), children: []
      });
    }
    const titleFor = (root) => String(root.title || root.name || 'Triumphe').replace(/^Siegel$/, 'Titel');
    const allRecords = flattenRecords(orderedRoots);
    recordLookup = new Map(allRecords.map((record) => [record.hash, record]));
    const query = recordSearch.trim();
    const queryLower = query.toLocaleLowerCase('de');
    const matches = query
      ? allRecords.filter((record) => {
        const haystack = [record.name, record.description, record.root, record.trail]
          .concat((record.objectives || []).map((objective) => objective.description))
          .join(' ').toLocaleLowerCase('de');
        return haystack.includes(queryLower);
      }).sort((a, b) => recordPercent(b) - recordPercent(a) || a.name.localeCompare(b.name, 'de')).slice(0, 150)
      : [];
    const trackedCards = recordTracked.map((entry) => recordLookup.get(entry.hash)).filter(Boolean);
    const nearDone = allRecords
      .filter((record) => !record.complete && Number(record.completion) > 2 && (Number(record.progress) || 0) > 0 && (Number(record.completion) - (Number(record.progress) || 0)) <= 2)
      .sort((a, b) => (a.completion - a.progress) - (b.completion - b.progress) || recordPercent(b) - recordPercent(a))
      .slice(0, 6);
    const menu = `<aside class="dim-records-side">` +
      `<button type="button" class="dim-records-side-btn on" data-record-root="tracked">Verfolgte Triumphe${trackedCards.length ? ` <b>${trackedCards.length}</b>` : ''}</button>` +
      orderedRoots.map((root) => `<button type="button" class="dim-records-side-btn" data-record-root="${esc(String(root.hash))}">${esc(titleFor(root))}</button>`).join('') +
      `<div class="dim-record-toggles">` +
        `<label class="inv-tool-check"><input type="checkbox" data-record-toggle="hide" ${recordHideCompleted ? 'checked' : ''}> Abgeschlossene Triumphe ausblenden</label>` +
        `<label class="inv-tool-check"><input type="checkbox" data-record-toggle="sort" ${recordSortProgress ? 'checked' : ''}> Triumphe nach Fertigstellung sortieren</label>` +
        `<label class="inv-tool-check"><input type="checkbox" data-record-toggle="uncollected" ${recordOnlyUncollected ? 'checked' : ''}> Nur nicht erworbene Gegenstände anzeigen</label>` +
        `<button type="button" class="btn ghost small" data-record-refresh>Live aktualisieren</button>` +
      `</div>` +
    `</aside>`;
    const toolbar = `<div class="dim-records-toolbar">` +
      `<label class="dim-record-search"><span>Suche</span><input type="search" data-record-search value="${esc(recordSearch)}" placeholder="Triumph, Ziel oder Kategorie …"></label>` +
      (query ? `<button type="button" class="btn ghost small" data-record-search-clear>Zurücksetzen</button>` : '') +
      `<span class="dim-records-toolbar-count">${matches.length && query ? `${matches.length} Treffer` : `${allRecords.length} Einträge`}</span>` +
    `</div>`;
    const score = triumphsState.score || {};
    const summary = `<div class="dim-records-summary">` +
      `<span><b>${fmt(Number(score.active) || 0)}</b> Aktive Punkte</span>` +
      `<span><b>${fmt(Number(score.lifetime) || 0)}</b> Lebenszeit</span>` +
      `<span><b>${Number(triumphsState.completedSeals) || 0}/${(triumphsState.seals || []).length}</b> Titel</span>` +
      `<span><b>${trackedCards.length}</b> Verfolgt</span>` +
    `</div>`;
    const searchResults = query
      ? `<section class="dim-records-search-results"><h2>Suche: ${esc(query)} <small>${matches.length} Treffer</small></h2>` +
        (matches.length
          ? `<div class="dim-record-grid">${matches.map((record) => recordCard(record, { query })).join('')}</div>`
          : '<div class="dim-record-empty">Keine Triumphe gefunden. Andere Schreibweise oder Kategorie versuchen.</div>') +
        `</section>`
      : '';
    const tracked = `<section class="dim-records-tracked" id="record-root-tracked">` +
      `<h2>Verfolgte Triumphe${trackedCards.length ? ` <small>${trackedCards.length}</small>` : ''}</h2>` +
      (trackedCards.length
        ? `<div class="dim-record-grid">${trackedCards.map((record) => recordCard(record, { context: false })).join('')}</div>`
        : '<p>Du verfolgst noch keine Triumphe. Klicke auf den Stern einer Karte – der Triumph erscheint dann hier und im Dashboard.</p>') +
    `</section>`;
    const nearDoneSection = nearDone.length
      ? `<section class="dim-records-next"><h2>Fast geschafft <small>höchstens 2 Schritte</small></h2>` +
        `<div class="dim-record-grid">${nearDone.map((record) => recordCard(record)).join('')}</div></section>`
      : '';
    const historySection = recordHistorySection();
    const sections = orderedRoots.map((root) => {
      const aggregate = { progress: Number(root.progress) || 0, completion: Number(root.completion) || 0 };
      const pct = recordPercent(aggregate);
      let records = (root.records || []).slice();
      if (recordHideCompleted || recordOnlyUncollected) records = records.filter((record) => !record.complete);
      if (recordSortProgress) records = records.sort((a, b) => recordPercent(a) - recordPercent(b) || a.name.localeCompare(b.name, 'de'));
      const limit = recordExpandedNodes.has(String(root.hash)) ? 120 : 24;
      const hiddenCount = Math.max(0, records.length - limit);
      const body = (records.length ? `<div class="dim-record-grid">${records.slice(0, limit).map((record) => recordCard(record)).join('')}</div>` : '') +
        (hiddenCount ? `<button type="button" class="btn ghost small dim-record-more" data-record-more="${root.hash}">${hiddenCount} weitere anzeigen</button>` : '') +
        recordCollectibleGrid(root) +
        (root.children || []).map((child) => renderRecordNode(child, 2)).join('');
      return `<section class="dim-records-root" id="record-root-${esc(String(root.hash))}">` +
        `<div class="dim-records-root-head"><span>${root.icon ? `<img loading="lazy" src="https://www.bungie.net${esc(root.icon)}" alt="">` : ''}</span>` +
          `<strong>${esc(titleFor(root))}</strong><span class="dim-record-summary-progress"><i style="width:${pct}%"></i></span><b>${aggregate.progress}/${aggregate.completion}</b></div>` +
        (body || '<div class="dim-record-empty">Keine Einträge in dieser Kategorie.</div>') +
      `</section>`;
    }).join('');
    return `<section class="dim-records-page">` + menu +
      `<main class="dim-records-main">${toolbar}${summary}${historySection}` +
        (query ? searchResults : `${nearDoneSection}${tracked}${sections || '<div class="dim-record-empty">Keine Triumph-Daten verfügbar.</div>'}`) +
      `</main>` +
    `</section>`;
  }

  function renderView() {
    if (toolView === 'collection') {
      const tabs = [['overview', 'Übersicht'], ['crafting', 'Crafting'], ['cleanup', 'Aufräumen'], ['sources', 'Quellen']];
      const currentLabel = (tabs.find(([key]) => key === collectionTab) || tabs[0])[1];
      const pane = (key, html) => `<div class="inv-collection-pane${collectionTab === key ? '' : ' hidden'}"><div class="inv-tool-grid">${html}</div></div>`;
      return '<div class="inv-tool-grid">' +
        `<details class="inv-collection-switch"><summary>Bereich: ${currentLabel}</summary><div class="inv-tool-subnav">${tabs.map(([key, label]) => `<button type="button" class="btn ghost small ${collectionTab === key ? 'on' : ''}" data-collection-tab="${key}">${label}</button>`).join('')}</div></details>` +
        pane('overview', renderTriumphOverview() + renderCollectionGoals() + renderSessionRecap() + renderCatalystTracker() + fold('Wunschrollen & Fortschritt', renderGodrollProgress()) + fold('Weitere Sammlungs-Werkzeuge', renderSession() + renderInventoryExport() + renderPerkLexicon() + renderExotics() + renderVaultComposition() + renderSnapshotDiff())) +
        pane('crafting', renderCrafting() + fold('Materialbedarf & Planung', renderCraftingCost() + renderCraftingMaterialPlan() + renderCraftingPlan())) +
        pane('cleanup', renderVaultCleanup() + fold('Weitere Aufräum-Werkzeuge', renderDuplicates() + renderAutoTagRules() + renderCleanupAssistant())) +
        pane('sources', renderLootSources() + fold('Datenquellen & Wunschlisten', renderLootValidation() + renderModGaps() + renderWishlistSources())) +
        '</div>';
    }
    if (toolView === 'builds') {
      return `<section class="builds-page">` + renderArmorPicker() +
        `<div class="builds-grid">` + renderBuildCheck() + renderChampionPlanner() + renderBuildGap() + `</div>` +
        fold('Mod-Bibliothek', renderModLibrary()) +
        lazyFold('Analyse & Optimierung', () => renderDataAudit() + renderStatGoals() + renderMultiBuildTargets() + renderBuildSnapshots() + renderResilience() + renderArtifactPlanner() + renderBuildLint() + renderBuildTemplates() + renderBuildLegality() + renderSetBonuses() + renderStatOptimizer() + renderMasterworkPlanner() + renderArmorRating() + renderArmorCompare()) +
      `</section>`;
    }
    if (toolView === 'week') {
      return '<div class="inv-tool-grid">' + renderWeekPage() +
        fold('Wochen-Details & Fortschritt', renderWeekOverview() + renderActivityCalendar() + renderWeekReview() + renderPostmasterSafety() + renderSecretChests() + renderEncounterTracker() + renderEncounterLibrary() + renderDigestCard() + renderTriumphs() + renderNightfall() + renderClan() + renderActionLog() + renderUndoHistory() + renderDataSources()) + '</div>';
    }
    if (toolView === 'vendor') {
      return '<div class="inv-tool-grid">' + renderVendorsPage() + renderXur() + renderVendorShoppingList() + renderVendorWatchlist() +
        fold('Status & Diagnose', renderBungieStatus() + renderDataStatus()) + '</div>';
    }
    const hasActivity = Boolean(
      (data && data.activities && Object.keys(data.activities).length) ||
      (activitiesState && activitiesState.activities && Object.keys(activitiesState.activities).length)
    );
    const activity = (hasActivity || activitiesLoading)
      ? renderActivity()
      : '<div class="inv-tool-inline"><span>Keine laufende Aktivität erkannt.</span>' +
        `<button type="button" class="btn ghost small" data-tool-activities>Prüfen</button></div>`;
    return renderOverviewPage(activity);
  }

  // Sprungmarken: kleines Menü mit den Karten der aktuellen Seite.
  function buildJumpMenu() {
    if (!host) return;
    const cards = [...host.querySelectorAll('.inv-tool-card[data-tool-title]')];
    if (cards.length < 3) return;
    let menu = host.querySelector('.inv-tool-jump');
    if (!menu) {
      menu = document.createElement('details');
      menu.className = 'inv-tool-jump';
      const nav = host.querySelector('.inv-tools-nav') || host.querySelector('.inv-tools-host') || host.firstElementChild;
      if (!nav) return;
      nav.parentNode.insertBefore(menu, nav.nextSibling);
    }
    menu.innerHTML = '<summary>Springe zu …</summary><div class="inv-tool-jump-list">' +
      cards.map((card, index) => `<button type="button" data-jump-index="${index}">${esc(String(card.dataset.toolTitle || ''))}</button>`).join('') +
      '<button type="button" data-jump-top>Nach oben</button></div>';
    menu.addEventListener('click', (event) => {
      const jump = event.target.closest('[data-jump-index]');
      if (jump) {
        const target = cards[Number(jump.dataset.jumpIndex)];
        if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        menu.open = false;
        return;
      }
      if (event.target.closest('[data-jump-top]')) {
        const scroller = host.closest('.dinv-tools-host') || host;
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
        menu.open = false;
      }
    });
  }

  function statsHudPayload() {
    const chars = (data && data.characters) || [];
    const activities = { ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) };
    const activity = Object.values(activities)[0] || null;
    const active = chars[0] || null;
    const coverage = active ? championCoverage().find((entry) => entry.character.id === active.id) : null;
    return {
      characters: chars.map((character) => ({
        id: character.id,
        classType: character.classType,
        light: character.light,
        stats: character.stats || {}
      })),
      icons: (data && data.charStatIcons) || {},
      activeId: active ? active.id : '',
      activity: activity ? { name: activity.name || '', modeName: activity.modeName || '' } : null,
      champions: coverage ? [...new Set((coverage.coverage || []).flat())] : [],
      showActivity: !getCfg().statsHud || getCfg().statsHud.showActivity !== false,
      showChampions: !getCfg().statsHud || getCfg().statsHud.showChampions !== false
    };
  }

  function syncStatsHud() {
    if (!data || !api || typeof api.statsHudUpdate !== 'function') return;
    api.statsHudUpdate(statsHudPayload()).catch(() => {});
  }

  let weekReminderStarted = false;

  function ensureWeekReminder() {
    if (weekReminderStarted) return;
    weekReminderStarted = true;
    const check = () => {
      try {
        const reset = nextWeeklyReset(new Date());
        const ms = reset.getTime() - Date.now();
        if (ms <= 0 || ms > 3600000) return;
        const key = reset.toISOString().slice(0, 10);
        if (window.localStorage.getItem('d2tool.resetReminder') === key) return;
        window.localStorage.setItem('d2tool.resetReminder', key);
        const minutes = Math.max(1, Math.round(ms / 60000));
        toast(`Wochenreset in ${minutes} Minuten – offene Punkte jetzt abschließen.`, 'info', 6000);
      } catch (error) {
        // Erinnerung ist optional.
      }
    };
    check();
    setInterval(check, 60 * 1000);
  }

  // Scroll-Position nur halten, wenn sich die Ansicht nicht ändert.
  // Hintergrund-Updates (Händler-Prefetch, Worker, Timer) ersetzen das
  // DOM und würden sonst den Nutzer beim Scrollen nach oben werfen.
  //
  // Wichtig: Such-/Filterfelder dürfen NICHT Teil dieses Schlüssels sein.
  // Sonst springt die Ansicht bei jedem Tastendruck im Feld nach oben,
  // weil das DOM ersetzt und der Scrollstand verworfen wird.
  let lastToolsScrollKey = '';
  let scrollRestoreId = 0;
  let pendingScrollTarget = null;

  // Offene <details> (Sprungmenü, Bereichsauswahl, Faltgruppen) vor
  // einem Neuaufbau merken. Sonst schließen sie sich und der Inhalt
  // darüber schrumpft – die Seite springt beim Scrollen ein Stück hoch.
  function detailsKey(details) {
    if (details.dataset.vendorHash) return `vendor:${details.dataset.vendorHash}`;
    if (details.classList.contains('inv-tool-jump')) return 'jump';
    if (details.classList.contains('inv-collection-switch')) return 'collection-switch';
    if (details.classList.contains('inv-tool-fold') || details.dataset.foldBound === '1') {
      return 'fold:' + String((details.querySelector('summary') || {}).textContent || '').trim().slice(0, 60);
    }
    const summary = String((details.querySelector('summary') || {}).textContent || '').trim().slice(0, 40);
    return `detail:${String(details.className)}|${summary}`;
  }
  function captureOpenDetails() {
    if (!host) return [];
    const open = [];
    for (const details of host.querySelectorAll('details[open]')) {
      // Faltgruppen und Händler-Reiter haben eigene Zustände
      // ("Alle auf-/zuklappen") – die nicht überschreiben.
      if (details.classList.contains('inv-tool-fold')) continue;
      if (details.dataset.vendorHash) continue;
      open.push(detailsKey(details));
    }
    return open;
  }
  function restoreOpenDetails(keys) {
    if (!host || !keys.length) return;
    const wanted = new Set(keys);
    for (const details of host.querySelectorAll('details')) {
      if (details.open) continue;
      if (wanted.has(detailsKey(details))) details.open = true;
    }
  }
  function toolsScrollKey() {
    return [toolView, collectionTab, lootSourceView, craftView, weekCheckView, focusMode].join('|');
  }

  function render() {
    if (!host) return;
    if (api && typeof api.reportView === 'function') api.reportView(toolView);
    ensureWeekReminder();
    hideXurTip();
    vcHideTip();
    computePowerMax();
    streamerMode = Boolean(getCfg().appearance && getCfg().appearance.streamerMode);
    host.classList.toggle('streamer-mode', streamerMode);
    const scrollKey = toolsScrollKey();
    // Ein Folge-Render (z. B. aus ensureToolData) darf das Ziel nicht
    // aus dem bereits auf 0 zurückgesetzten DOM lesen. Ein echter
    // Nutzer-Scroll (DOM > 0) hat Vorrang vor einem alten Ziel.
    const domScrollTop = host.scrollTop;
    const reusePending = Boolean(pendingScrollTarget && pendingScrollTarget.key === scrollKey && domScrollTop === 0 && pendingScrollTarget.top > 0);
    const keepScroll = reusePending || scrollKey === lastToolsScrollKey;
    const previousScrollTop = reusePending ? pendingScrollTarget.top : domScrollTop;
    const openDetails = captureOpenDetails();
    const started = performance.now();
    let viewHtml = '';
    try {
      viewHtml = renderView();
    } catch (error) {
      viewHtml = '<div class="inv-tool-error"><strong>Diese Seite konnte nicht aufgebaut werden.</strong>' +
        '<span>' + esc(error && (error.message || String(error))) + '</span>' +
        '<button type="button" class="btn ghost small" data-tools-recover>Erneut versuchen</button></div>';
      try { console.error('[tools] Renderfehler', error); } catch (inner) { /* egal */ }
    }
    host.innerHTML = renderOffline() + renderServiceHealth() + renderHeader() + renderNav() + viewHtml;
    buildJumpMenu();
    if (window.enhanceTvTargets) window.enhanceTvTargets(host);
    lastRenderMs = Math.round(performance.now() - started);
    window.__toolsRenderMs = lastRenderMs;
    window.__toolsRenderView = toolView;
    host.classList.toggle('tools-focus', focusMode);
    const query = cardSearch.trim().toLowerCase();
    for (const card of host.querySelectorAll('.inv-tool-card')) {
      card.classList.toggle('dash-user-hidden', Boolean(query) && !String(card.textContent || '').toLowerCase().includes(query));
    }
    const pins = loadPinnedTools();
    if (pins.size) {
      for (const grid of host.querySelectorAll('.inv-tool-grid')) {
        const cards = [...grid.children].filter((element) => element.classList && element.classList.contains('inv-tool-card'));
        if (cards.length < 2) continue;
        cards.sort((a, b) => Number(pins.has(b.dataset.toolTitle)) - Number(pins.has(a.dataset.toolTitle)));
        for (const card of cards) grid.appendChild(card);
      }
    }
    for (const details of host.querySelectorAll('details.inv-tool-fold')) {
      if (details.dataset.foldBound === '1') continue;
      details.dataset.foldBound = '1';
      const key = 'd2tool.fold.' + (details.querySelector('summary')?.textContent || '').trim();
      try {
        const saved = window.localStorage.getItem(key);
        if (saved != null) details.open = saved === '1';
      } catch (error) { /* egal */ }
      details.addEventListener('toggle', () => {
        try { window.localStorage.setItem(key, details.open ? '1' : '0'); } catch (error) { /* egal */ }
      });
    }
    if (foldsOpen != null) {
      for (const details of host.querySelectorAll('details.inv-tool-fold')) details.open = foldsOpen;
    }
    restoreOpenDetails(openDetails);
    if (keepScroll) {
      // Die neue Inhaltshöhe steht erst nach dem nächsten Frame fest
      // (verschachtelte Grids/Details). Deshalb über mehrere Frames
      // wiederherstellen – jeder Versuch misst die Höhe vorher neu,
      // sonst klemmt der Browser scrollTop auf 0. Das Ziel bleibt für
      // Folge-Renders mit gleichem Schlüssel erhalten.
      const restoreId = ++scrollRestoreId;
      pendingScrollTarget = { key: scrollKey, top: previousScrollTop, id: restoreId };
      const applyScroll = (last) => {
        if (!pendingScrollTarget || pendingScrollTarget.id !== restoreId) return;
        void host.scrollHeight;
        host.scrollTop = previousScrollTop;
        if (last) pendingScrollTarget = null;
      };
      applyScroll(false);
      if (Math.abs(host.scrollTop - previousScrollTop) <= 2) {
        pendingScrollTarget = null;
      } else {
        requestAnimationFrame(() => {
          applyScroll(false);
          requestAnimationFrame(() => {
            applyScroll(false);
            requestAnimationFrame(() => applyScroll(true));
          });
        });
      }
    } else {
      pendingScrollTarget = null;
    }
    lastToolsScrollKey = scrollKey;
    ensureToolData();
  }

  // ---------- Aktionen ----------
  function addChecklistItem() {
    const input = host && host.querySelector('[data-tool-check-input]');
    const repeatSelect = host && host.querySelector('[data-tool-check-repeat]');
    const text = String((input && input.value) || '').trim();
    if (!text) return;
    const repeat = repeatSelect && ['weekly', 'daily'].includes(repeatSelect.value) ? repeatSelect.value : '';
    const items = ((getCfg().checklist && getCfg().checklist.items) || []).concat([
      { id: 'c-' + Date.now().toString(36), text, done: false, group: 'own', char: weekCharFilter || '', repeat, doneAt: 0 }
    ]);
    setConfig({ checklist: { items } });
    if (input) input.value = '';
    render();
  }

  function applyXurHistory(items) {
    const history = ((getCfg().bungie && getCfg().bungie.xurHistory) || []).slice();
    const prev = history.length ? history[history.length - 1] : null;
    const prevHashes = new Set(((prev && prev.items) || []).map((item) => Number(item.hash)));
    if (prevHashes.size) {
      for (const item of items) item.isNew = !prevHashes.has(Number(item.hash));
      const currentHashes = new Set(items.map((item) => Number(item.hash)));
      xurGoneNames = ((prev.items || []).filter((item) => !currentHashes.has(Number(item.hash))).map((item) => item.name)).slice(0, 6);
    } else {
      xurGoneNames = [];
    }
    const current = {
      at: Date.now(),
      items: items.map((item) => ({ hash: Math.round(Number(item.hash) || 0), name: String(item.name || '').slice(0, 80) }))
    };
    if (prev && current.at - Number(prev.at) < 6 * 3600 * 1000) history[history.length - 1] = current;
    else history.push(current);
    setConfig({ bungie: { xurHistory: history.slice(-8) } });
  }

  async function loadXur() {
    if (xurLoading) return;
    if (!api || typeof api.bungieXur !== 'function') {
      toast('Xûr-Abruf ist in dieser Version nicht verfügbar.', 'info', 2400);
      return;
    }
    xurLoading = true;
    render();
    try {
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Zeitüberschreitung' }), 12000));
      xurState = await Promise.race([api.bungieXur(true), timeout]);
      if (xurState && xurState.ok && Array.isArray(xurState.items)) applyXurHistory(xurState.items);
    } catch (error) {
      xurState = { ok: false, error: error.message || String(error) };
    } finally {
      xurLoading = false;
      render();
    }
  }

  function toggleChecklist(id, done) {
    const items = ((getCfg().checklist && getCfg().checklist.items) || []).map((item) =>
      item.id === id
        ? { ...item, done, doneAt: done ? Date.now() : 0 }
        : item
    );
    setConfig({ checklist: { items } });
    render();
  }

  function bind() {
    if (!host) return;
    host.addEventListener('error', (event) => {
      const image = event.target;
      if (!image || image.tagName !== 'IMG' || image.dataset.fallback === '1') return;
      image.dataset.fallback = '1';
      const fallback = document.createElement('span');
      fallback.className = 'img-fallback';
      fallback.textContent = '◆';
      image.replaceWith(fallback);
    }, true);
    host.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = String((event.target && event.target.tagName) || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (event.key === '/') {
        const search = host.querySelector('[data-tool-search], [data-loot-search], [data-record-search], [data-week-search], [data-loadout-search]');
        if (search) {
          event.preventDefault();
          search.focus();
          if (typeof search.select === 'function') search.select();
        }
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        toast('Kürzel: / Suche · ? Hilfe · Esc schließen · LB/RB Bereiche (Controller)', 'info', 4200);
      }
    });
    host.addEventListener('click', (event) => {
      const pin = event.target.closest('[data-tool-pin]');
      if (pin) {
        const title = String(pin.dataset.toolPin || '');
        const pins = loadPinnedTools();
        if (pins.has(title)) pins.delete(title);
        else pins.add(title);
        savePinnedTools();
        render();
        toast(pins.has(title) ? `„${title}“ angepinnt.` : `„${title}“ gelöst.`, 'success', 1800);
        return;
      }
      if (event.target.closest('[data-stat-history-reset]')) {
        try { window.localStorage.removeItem('d2tool.statGoalHistory'); } catch (error) { /* egal */ }
        render();
        toast('Stat-Verlauf gelöscht.', 'info', 1800);
        return;
      }
      const overlayDiag = event.target.closest('[data-overlay-diag-action]');
      if (overlayDiag) {
        const action = String(overlayDiag.dataset.overlayDiagAction || 'refresh');
        if (action === 'refresh') loadOverlayDiag(true);
        else overlayDiagAction(action);
        return;
      }
      if (event.target.closest('[data-overlay-diag-copy]')) {
        const text = overlayDiagLog.join('\n') || 'Kein Overlay-Log geladen.';
        if (api && typeof api.copyToClipboard === 'function') {
          api.copyToClipboard(text).then((result) => toast(result && result.ok ? 'Overlay-Log kopiert.' : 'Kopieren fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2000));
        }
        return;
      }
      if (event.target.closest('[data-health-reconnect]')) {
        if (api && typeof api.bungieOAuthStart === 'function') {
          api.bungieOAuthStart().catch((error) => toast(error.message || String(error), 'error', 2600));
        }
        return;
      }
      if (event.target.closest('[data-health-refresh]')) { loadServiceHealth(true); return; }
      if (event.target.closest('[data-tool-quick-refresh]')) {
        if (typeof refreshInventory === 'function') refreshInventory();
        return;
      }
      if (event.target.closest('[data-record-retry]') || event.target.closest('[data-record-refresh]')) {
        loadTriumphs(true);
        return;
      }
      if (event.target.closest('[data-record-search-clear]')) {
        recordSearch = '';
        render();
        return;
      }
      const recordPin = event.target.closest('[data-record-pin]');
      if (recordPin) {
        toggleTrackedRecord(recordPin.dataset.recordPin);
        render();
        return;
      }
      const recordMore = event.target.closest('[data-record-more]');
      if (recordMore) {
        recordExpandedNodes.add(String(recordMore.dataset.recordMore || ''));
        render();
        return;
      }
      const recordOpen = event.target.closest('[data-record-open]');
      if (recordOpen) {
        showRecordOverlay(recordOpen.dataset.recordOpen);
        return;
      }
      const recordRoot = event.target.closest('[data-record-root]');
      if (recordRoot) {
        for (const button of host ? host.querySelectorAll('[data-record-root]') : []) button.classList.toggle('on', button === recordRoot);
        const key = String(recordRoot.dataset.recordRoot || '');
        if (key === 'tracked') host && host.querySelector('#record-root-tracked')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        else host && host.querySelector(`#record-root-${CSS.escape(key)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const xurRowButton = event.target.closest('[data-xur-tip]');
      if (xurRowButton) {
        const item = xurItemsByKey.get(String(xurRowButton.dataset.xurTip || ''));
        if (item) {
          vendorItemDetail = {
            item,
            vendor: { name: item.seller || 'Xûr' },
            category: item.seller && item.seller !== 'Xûr' ? item.seller : 'Xûr',
            info: null,
            loadingRolls: false
          };
          renderVendorItemDetail();
          loadSubVendorOffers(vendorItemDetail);
        }
        return;
      }
      const vendorItemButton = event.target.closest('[data-vendor-item]');
      if (vendorItemButton) {
        openVendorItemDetail(vendorItemButton.dataset.vendorItem);
        return;
      }
      const vendorOfferButton = event.target.closest('[data-vendor-offer]');
      if (vendorOfferButton) {
        const [vendorHash, itemHash] = String(vendorOfferButton.dataset.vendorOffer || '').split(':');
        openVendorOfferDetail(vendorHash, itemHash);
        return;
      }
      const vendorPin = event.target.closest('[data-vendor-pin]');
      if (vendorPin) {
        event.preventDefault();
        event.stopPropagation();
        const hash = String(vendorPin.dataset.vendorPin || '');
        if (!hash) return;
        if (vendorPinned.has(hash)) vendorPinned.delete(hash);
        else vendorPinned.add(hash);
        try { window.localStorage.setItem('d2tool.pinnedVendors', JSON.stringify([...vendorPinned])); } catch (error) { /* egal */ }
        render();
        return;
      }
      const vendorHistoryClear = event.target.closest('[data-vendor-history-clear]');
      if (vendorHistoryClear) {
        event.preventDefault();
        event.stopPropagation();
        const hash = String(vendorHistoryClear.dataset.vendorHistoryClear || '');
        if (!hash) return;
        const history = { ...((getCfg().bungie && getCfg().bungie.vendorHistory) || {}) };
        const meta = { ...((getCfg().bungie && getCfg().bungie.vendorHistoryMeta) || {}) };
        delete history[hash];
        delete meta[hash];
        setConfig({ bungie: { vendorHistory: history, vendorHistoryMeta: meta } });
        toast('Rotationshistorie zurückgesetzt.', 'success', 2000);
        render();
        return;
      }
      const vendorDetailsSummary = event.target.closest('details.dim-vendor > summary');
      if (vendorDetailsSummary) {
        const details = vendorDetailsSummary.parentElement;
        const hash = String(details.dataset.vendorHash || '');
        setTimeout(() => {
          if (details.open) expandedVendors.add(hash);
          else expandedVendors.delete(hash);
        }, 0);
        return;
      }
      if (event.target.closest('[data-vendor-expand]')) {
        if (expandedVendors.size) {
          expandedVendors.clear();
        } else {
          const state = allVendorsState;
          for (const group of (state && state.groups) || []) {
            for (const vendor of group.vendors || []) expandedVendors.add(String(vendor.hash));
          }
        }
        render();
        return;
      }
      const vendorItemOpen = event.target.closest('[data-vendor-item-open]');
      if (vendorItemOpen) {
        const [vendorHash, itemHash] = String(vendorItemOpen.dataset.vendorItemOpen || '').split(':').map(Number);
        if (vendorHash) openVendorOfferDetailByHash(vendorHash, itemHash);
        return;
      }
      if (event.target.closest('[data-vendor-diag-copy]')) {
        const metaAll = (getCfg().bungie && getCfg().bungie.vendorHistoryMeta) || {};
        const payload = [];
        for (const group of (allVendorsState && allVendorsState.groups) || []) {
          for (const vendor of group.vendors || []) {
            payload.push({
              hash: Number(vendor.hash) || 0,
              name: vendor.name,
              group: group.name,
              items: (vendor.items || []).length,
              rolls: vendorRollsLoaded.has(String(vendor.hash)),
              history: metaAll[String(vendor.hash)] || null
            });
          }
        }
        copyToClipboard(JSON.stringify(payload, null, 2), 'Händler-Diagnose');
        return;
      }
      if (event.target.closest('[data-vendor-shopping-goals]')) {
        const offers = [];
        for (const group of (allVendorsState && allVendorsState.groups) || []) {
          for (const vendor of group.vendors || []) {
            for (const item of vendor.items || []) if (!isOwnedHash(item.hash)) offers.push({ item, vendor });
          }
        }
        const top = offers.slice(0, 8);
        if (!top.length) { toast('Keine fehlenden Angebote für Wochenziele.', 'info', 2200); return; }
        const existing = ((getCfg().checklist && getCfg().checklist.items) || []).slice();
        const known = new Set(existing.map((entry) => entry.text));
        for (const entry of top) {
          const text = `Händler: ${entry.item.name} (${entry.vendor.name})`;
          if (known.has(text)) continue;
          existing.push({ id: 'c-' + Date.now().toString(36) + '-' + existing.length, text, done: false, group: 'own', char: '', repeat: '', doneAt: 0 });
        }
        setConfig({ checklist: { items: existing } });
        toast(`${top.length} Händler-Angebote als Wochenziele gespeichert.`, 'success', 2400);
        return;
      }
      if (event.target.closest('[data-vendor-shopping-copy]')) {
        const lines = [];
        for (const group of (allVendorsState && allVendorsState.groups) || []) {
          for (const vendor of group.vendors || []) {
            for (const item of vendor.items || []) {
              if (isOwnedHash(item.hash)) continue;
              const costs = (item.costs || []).map((cost) => `${fmt(cost.quantity)} ${cost.name}`).join(' · ');
              lines.push(`${item.name} · ${vendor.name}${costs ? ` · ${costs}` : ''}`);
            }
          }
        }
        const text = lines.length ? `Händler-Einkaufsliste\n${lines.join('\n')}` : 'Keine fehlenden Händler-Angebote.';
        const copy = api && typeof api.copyToClipboard === 'function' ? api.copyToClipboard(text) : (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('keine Zwischenablage')));
        Promise.resolve(copy).then(() => toast('Einkaufsliste kopiert.', 'success', 2200)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2200));
        return;
      }
      if (event.target.closest('[data-vendor-refresh]')) {
        loadAllVendors(true);
        return;
      }
      if (event.target.closest('[data-vc-start]')) {
        vcLoadSettings();
        vcReview = vcBuildReview();
        vcGroupIndex = 0;
        if (!vcReview || !vcReview.groups.length) toast('Keine passenden Gegenstände für diese Optionen gefunden.', 'info', 2600);
        render();
        return;
      }
      if (event.target.closest('[data-vc-settings]')) {
        vcReview = null;
        vcGroupIndex = 0;
        render();
        return;
      }
      const vcGroupBtn = event.target.closest('[data-vc-group]');
      if (vcGroupBtn) {
        const index = Number(vcGroupBtn.dataset.vcGroup);
        if (Number.isFinite(index)) vcGroupIndex = index;
        render();
        return;
      }
      const vcStrategy = event.target.closest('[data-vc-strategy]');
      if (vcStrategy && vcReview) {
        const group = vcReview.groups[vcGroupIndex];
        if (group) vcApplyStrategy(group, String(vcStrategy.dataset.vcStrategy || ''));
        render();
        return;
      }
      const vcItem = event.target.closest('[data-vc-item]');
      if (vcItem && vcReview) {
        vcHideTip();
        const group = vcReview.groups[vcGroupIndex];
        const key = String(vcItem.dataset.vcItem || '');
        const entry = group && group.items.find((candidate) => vcItemKey(candidate.item) === key);
        if (entry) entry.decision = entry.decision === 'keep' ? 'remove' : 'keep';
        render();
        return;
      }
      if (event.target.closest('[data-vc-apply]')) {
        vcApplyTags();
        return;
      }
      if (event.target.closest('[data-vc-export]') && vcReview) {
        const items = vcReview.groups.flatMap((group) => group.items.filter((entry) => entry.decision === 'remove')).map((entry) => entry.item.name || 'Item');
        const text = items.join('\n');
        navigator.clipboard?.writeText(text).then(() => toast(`${items.length} Gegenstände kopiert.`, 'success', 2200)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2200));
        return;
      }
      const vcTier = event.target.closest('[data-vc-tier]');
      if (vcTier) {
        const section = String(vcTier.dataset.vcTier || '');
        const value = String(vcTier.dataset.vcTierValue || '0');
        if (section === 'weapons' || section === 'armor') {
          vcSet(`${section}.tier`, value === 'best' ? 'best' : Number(value) || 0);
          vcReview = null;
          render();
        }
        return;
      }
      if (event.target.closest('[data-tool-quick-loadouts]')) {
        if (typeof openTab === 'function') openTab('loadouts');
        return;
      }
      if (event.target.closest('[data-tool-close]')) {
        if (ctx && typeof ctx.closeInventory === 'function') ctx.closeInventory();
        return;
      }
      if (event.target.closest('[data-tool-expand]')) {
        foldsOpen = foldsOpen === true ? false : true;
        render();
        return;
      }
      const openView = event.target.closest('[data-tool-open-view]');
      if (openView) {
        switchToolView(String(openView.dataset.toolOpenView || 'overview'));
        return;
      }
      const kpi = event.target.closest('[data-tool-kpi]');
      if (kpi) {
        const key = String(kpi.dataset.toolKpi || '');
        if (key === 'godrolls') { if (typeof searchFor === 'function') searchFor('is:godroll'); return; }
        if (key === 'champions') { switchToolView('builds'); return; }
        if (key === 'postmaster' || key === 'reset') { switchToolView('week'); return; }
        switchToolView('overview');
        return;
      }
      if (event.target.closest('[data-tool-pm-safe]')) {
        if (!window.confirm('Nur Nicht-Waffen aus der Poststelle einsammeln? Waffen und Godrolls bleiben im Postfach.')) return;
        api.postmasterCollectFiltered('nonweapons').then((result) => {
          toast(result && result.ok ? `${Number(result.pulled) || 0} Items eingesammelt, ${Number(result.skipped) || 0} übersprungen.` : (result && result.error) || 'Einsammeln fehlgeschlagen.', result && result.ok ? 'success' : 'error', 3600);
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-tool-pm-godrolls]')) {
        const keepIds = [];
        for (const list of Object.values((data && data.postmaster) || {})) {
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (item && item.instanceId && (item.godRoll || item.nearGodRoll)) keepIds.push(String(item.instanceId));
          }
        }
        if (!window.confirm(`Godrolls und Near-Godrolls (${keepIds.length}) im Postfach lassen und den Rest einsammeln?`)) return;
        api.postmasterCollectFiltered('keepgodrolls', keepIds).then((result) => {
          toast(result && result.ok ? `${Number(result.pulled) || 0} Items eingesammelt, ${Number(result.skipped) || 0} Godrolls behalten.` : (result && result.error) || 'Einsammeln fehlgeschlagen.', result && result.ok ? 'success' : 'error', 3800);
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-tool-pm-all]')) {
        if (!window.confirm('Wirklich ALLE Items aus der Poststelle einsammeln?')) return;
        api.postmasterCollect().then((result) => {
          toast(result && result.ok ? `${Number(result.pulled) || 0} Items eingesammelt.` : (result && result.error) || 'Einsammeln fehlgeschlagen.', result && result.ok ? 'success' : 'error', 3600);
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-autotag-add]')) {
        const match = String((host.querySelector('[data-autotag-match]') || {}).value || '').trim();
        const tag = String((host.querySelector('[data-autotag-tag]') || {}).value || 'keep');
        if (!match) { toast('Bitte einen Text für die Regel eingeben.', 'info', 2200); return; }
        const rules = ((getCfg().bungie && getCfg().bungie.autoTagRules) || []).slice();
        rules.push({ id: 'at-' + Date.now().toString(36), match, tag });
        setConfig({ bungie: { autoTagRules: rules.slice(0, 30) } });
        render();
        return;
      }
      if (event.target.closest('[data-autotag-del]')) {
        const id = String(event.target.closest('[data-autotag-del]').dataset.autotagDel || '');
        const rules = ((getCfg().bungie && getCfg().bungie.autoTagRules) || []).filter((rule) => rule.id !== id);
        setConfig({ bungie: { autoTagRules: rules } });
        render();
        return;
      }
      if (event.target.closest('[data-autotag-preview]')) {
        autoTagPreview = autoTagMatches();
        render();
        toast(`Vorschau: ${autoTagPreview.total} Item${autoTagPreview.total === 1 ? '' : 's'} würden getaggt.`, 'info', 2600);
        return;
      }
      if (event.target.closest('[data-autotag-apply]')) {
        applyAutoTagRules();
        return;
      }
      const check = event.target.closest('[data-tool-check]');
      if (check) {
        toggleChecklist(check.dataset.toolCheck, check.checked);
        return;
      }
      if (event.target.closest('[data-tool-check-add]')) { addChecklistItem(); return; }
      const weekCharButton = event.target.closest('[data-week-char]');
      if (weekCharButton) {
        const value = String(weekCharButton.dataset.weekChar || '');
        weekCharFilter = ['0', '1', '2'].includes(value) ? value : '';
        render();
        return;
      }
      if (event.target.closest('[data-tool-check-sync]')) {
        const activities = Object.values({ ...((data && data.activities) || {}), ...((activitiesState && activitiesState.activities) || {}) });
        const items = (((getCfg().checklist && getCfg().checklist.items) || [])).map((item) => ({ ...item }));
        let changed = 0;
        for (const item of items) {
          if (item.done) continue;
          const text = String(item.text || '').toLowerCase().trim();
          if (!text) continue;
          if (activities.some((activity) => {
            const name = String(activity.name || '').toLowerCase();
            return name.includes(text) || text.includes(name);
          })) {
            item.done = true;
            changed += 1;
          }
        }
        if (changed) {
          setConfig({ checklist: { items } });
          toast(`${changed} Punkt${changed === 1 ? '' : 'e'} automatisch abgehakt.`, 'success', 2600);
        } else {
          toast('Keine passenden erkannten Aktivitäten gefunden.', 'info', 2600);
        }
        render();
        return;
      }
      const sessionFilterBtn = event.target.closest('[data-session-filter]');
      if (sessionFilterBtn) {
        sessionFilter = sessionFilterBtn.dataset.sessionFilter === 'hits' ? 'hits' : 'all';
        render();
        return;
      }
      const sessionExport = event.target.closest('[data-session-export]');
      if (sessionExport) {
        const duration = Math.max(0, Math.round((Date.now() - sessionStartedAt) / 60000));
        const payload = { startedAt: sessionStartedAt, durationMinutes: duration, items: sessionLoot };
        if (sessionExport.dataset.sessionExport === 'json') copyToClipboard(JSON.stringify(payload, null, 2), 'Session-Recap');
        else copyToClipboard(`# Session-Recap\n\nDauer: ${duration} Min.\n\n` + sessionLoot.map((item) => `- ${item.name}${item.godRoll ? ' (Godroll)' : item.nearGodRoll ? ' (Fast)' : ''} · ${item.typeName || ''} · ${item.location || ''}`).join('\n'), 'Session-Recap');
        return;
      }
      if (event.target.closest('[data-catalyst-add]')) {
        const input = event.target.closest('.inv-tool-card')?.querySelector('[data-catalyst-input]');
        const name = String(input && input.value || '').trim().slice(0, 80);
        if (!name) return;
        const list = catalystTracker();
        list.push({ name, done: false, at: Date.now() });
        saveCatalystTracker(list);
        render();
        return;
      }
      const catalystToggle = event.target.closest('[data-catalyst-toggle]');
      if (catalystToggle) {
        const list = catalystTracker();
        const index = Number(catalystToggle.dataset.catalystToggle);
        if (list[index]) list[index].done = catalystToggle.checked === true;
        saveCatalystTracker(list);
        render();
        return;
      }
      const catalystDelete = event.target.closest('[data-catalyst-delete]');
      if (catalystDelete) {
        const list = catalystTracker();
        list.splice(Number(catalystDelete.dataset.catalystDelete), 1);
        saveCatalystTracker(list);
        render();
        return;
      }
      const inventoryExport = event.target.closest('[data-inventory-export]');
      if (inventoryExport) {
        const entries = allEntries();
        if (inventoryExport.dataset.inventoryExport === 'json') {
          copyToClipboard(JSON.stringify(entries.map((entry) => ({ ...entry.item, location: entry.kind, owner: entry.owner })), null, 2), 'Inventar-JSON');
        } else {
          const escapeCsv = (value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
          const rows = [['name', 'typeName', 'power', 'rarity', 'hash', 'instanceId', 'location', 'owner']];
          for (const entry of entries) rows.push([entry.item.name, entry.item.typeName, entry.item.power, entry.item.rarity, entry.item.hash, entry.item.instanceId, entry.kind, entry.owner]);
          copyToClipboard(rows.map((row) => row.map(escapeCsv).join(',')).join('\n'), 'Inventar-CSV');
        }
        return;
      }
      if (event.target.closest('[data-queue-info]')) {
        toast('Bungie bremst Anfragen. Das Tool wartet automatisch und wiederholt.', 'info', 3200);
        return;
      }
      if (event.target.closest('[data-tools-recover]')) {
        render();
        return;
      }
      if (event.target.closest('[data-tool-refresh]')) { if (ctx.refreshInventory) ctx.refreshInventory(); return; }
      if (event.target.closest('[data-manifest-refresh]')) {
        if (api && typeof api.refreshManifest === 'function') {
          api.refreshManifest().then((result) => {
            if (result && result.ok) {
              toast('Manifest-Cache verworfen – Daten beim nächsten Abruf neu.', 'success', 2800);
              if (ctx.refreshInventory) ctx.refreshInventory();
            } else {
              toast((result && result.error) || 'Manifest konnte nicht neu geladen werden.', 'error', 2600);
            }
          }).catch((error) => toast(error.message || String(error), 'error', 2600));
        }
        return;
      }
      if (event.target.closest('[data-tool-activity-remind]')) {
        addActivityReminder(event.target.closest('[data-tool-activity-remind]').dataset.toolActivityRemind || '');
        return;
      }
      if (event.target.closest('[data-tool-storage]')) {
        const kind = String(event.target.closest('[data-tool-storage]').dataset.toolStorage || '');
        if (api && typeof api.storageCleanup === 'function') {
          const preview = kind === 'wishlist' ? 'Wunschlisten-Cache' : kind === 'manifest-old' ? 'alte Manifeste' : kind === 'logs' ? 'Logs' : 'Caches';
          if (!window.confirm(`${preview} löschen? Nicht benötigte Daten werden danach neu geladen.`)) return;
          api.storageCleanup(kind).then((result) => {
            if (result && result.ok) {
              toast(`Speicher bereinigt: ${fmtBytes(result.freed)} frei.`, 'success', 2400);
              storageState = null;
              wishlistHealthState = null;
              if ((kind === 'wishlist' || kind === 'all-caches') && ctx.refreshInventory) {
                ctx.refreshInventory();
                toast('Wunschlisten werden im Hintergrund neu geladen.', 'info', 2600);
              }
              render();
            } else {
              toast((result && result.error) || 'Bereinigung fehlgeschlagen.', 'error', 2400);
            }
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-tool-loadout-editor]')) {
        window.dispatchEvent(new CustomEvent('d2-open-loadout-editor'));
        return;
      }
      if (event.target.closest('[data-tool-ingame-apply-linked]')) {
        const id = String(event.target.closest('[data-tool-ingame-apply-linked]').dataset.toolIngameApplyLinked || '');
        const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === id);
        if (!loadout || !(Number(loadout.ingameIndex) > 0)) return;
        api.bungieEquipIngameLoadout({
          characterId: loadout.ingameCharacterId || loadout.characterId,
          loadoutIndex: Number(loadout.ingameIndex) - 1,
          membershipType: data.membershipType
        }).then((result) => {
          if (result && result.ok) toast(`In-Game-Slot ${loadout.ingameIndex} angewendet.`, 'success', 2200);
          else toast((result && result.error) || 'In-Game-Loadout konnte nicht angewendet werden.', 'error', 3000);
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-tool-loadout-version-save]')) {
        const id = String(event.target.closest('[data-tool-loadout-version-save]').dataset.toolLoadoutVersionSave || '');
        const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === id);
        if (!loadout) return;
        const versions = { ...(((getCfg().bungie && getCfg().bungie.loadoutVersions) || {})) };
        const list = (versions[id] || []).slice();
        list.push({
          at: Date.now(),
          name: `${loadout.name || 'Loadout'} v${list.length + 1}`,
          items: (loadout.items || []).map((item) => ({ instanceId: item.instanceId, hash: item.hash, name: item.name, bucket: item.bucket })),
          mods: (loadout.mods || []).map((mod) => ({ hash: mod.hash }))
        });
        versions[id] = list.slice(-5);
        setConfig({ bungie: { loadoutVersions: versions } });
        loadoutDiffId = id;
        toast('Build-Version gesichert.', 'success', 2000);
        render();
        return;
      }
      const versionDiffButton = event.target.closest('[data-tool-loadout-version-diff]');
      if (versionDiffButton) {
        const [id, indexText] = String(versionDiffButton.dataset.toolLoadoutVersionDiff || '').split(':');
        loadoutVersionDiff = { id, index: Number(indexText) || 0 };
        loadoutDiffId = id;
        render();
        return;
      }
      if (event.target.closest('[data-tool-loadout-version-restore]')) {        const [id, indexText] = String(event.target.closest('[data-tool-loadout-version-restore]').dataset.toolLoadoutVersionRestore || '').split(':');
        const versions = (((getCfg().bungie && getCfg().bungie.loadoutVersions) || {})[id] || []);
        const version = versions[Number(indexText) || 0];
        if (!version) return;
        const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).map((loadout) =>
          loadout.id === id
            ? { ...loadout, items: (version.items || []).map((item) => ({ ...item })), mods: (version.mods || []).map((mod) => ({ ...mod })) }
            : loadout
        );
        setConfig({ bungie: { loadouts } });
        toast('Build-Version geladen.', 'success', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-tool-template-apply]')) {
        const id = String(event.target.closest('[data-tool-template-apply]').dataset.toolTemplateApply || '');
        if (id && ctx.applyLoadout) ctx.applyLoadout(id);
        return;
      }
      if (event.target.closest('[data-tool-loadout-diff]')) {
        const id = String(event.target.closest('[data-tool-loadout-diff]').dataset.toolLoadoutDiff || '');
        loadoutDiffId = loadoutDiffId === id ? '' : id;
        if (!loadoutDiffId) loadoutVersionDiff = null;
        render();
        return;
      }
      if (event.target.closest('[data-tool-share-code]')) {
        const id = String(event.target.closest('[data-tool-share-code]').dataset.toolShareCode || '');
        const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === id);
        if (!loadout) return;
        const payload = {
          v: 1,
          n: loadout.name,
          c: Number(loadout.classType) || 0,
          i: (loadout.items || []).map((item) => [Number(item.hash) || 0, String(item.instanceId || '')]),
          m: (loadout.mods || []).map((mod) => Number(mod.hash) || 0).filter(Boolean)
        };
        const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, '');
        api.copyToClipboard(code).then(() => {
          toast('Teilen-Code kopiert (base64).', 'success', 2600);
          if (api.integrationsOpenQr) {
            api.integrationsOpenQr(code).catch(() => {});
          }
        }).catch((error) => toast(error.message || String(error), 'error', 2400));
        return;
      }
      if (event.target.closest('[data-tool-dim-json]')) {
        const id = String(event.target.closest('[data-tool-dim-json]').dataset.toolDimJson || '');
        const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === id);
        if (!loadout) return;
        const payload = {
          type: 'dim-loadout',
          version: 6,
          name: loadout.name,
          classType: Number(loadout.classType) || 0,
          equipped: (loadout.items || []).map((item) => ({
            hash: Number(item.hash) || 0,
            id: String(item.instanceId || ''),
            socketOverrides: {}
          })),
          parameters: { mods: (loadout.mods || []).map((mod) => Number(mod.hash) || 0).filter(Boolean) }
        };
        api.copyToClipboard(JSON.stringify(payload, null, 2)).then(() => {
          toast('DIM-Loadout-JSON kopiert.', 'success', 2200);
        }).catch((error) => toast(error.message || String(error), 'error', 2400));
        return;
      }
      if (event.target.closest('[data-tool-loadout-fav]')) {
        const id = String(event.target.closest('[data-tool-loadout-fav]').dataset.toolLoadoutFav || '');
        const favs = Object.assign({}, (getCfg().bungie && getCfg().bungie.loadoutFavs) || {});
        if (favs[id]) delete favs[id];
        else favs[id] = true;
        setConfig({ bungie: { loadoutFavs: favs } });
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-test]')) {
        const query = String(event.target.closest('[data-wishlist-test]').dataset.wishlistTest || '').trim();
        if (!query) {
          toast('Bitte zuerst Perks für die Regel auswählen.', 'info', 2200);
          return;
        }
        if (ctx.searchFor) ctx.searchFor(query);
        return;
      }
      if (event.target.closest('[data-wishlist-save]')) {
        const weaponSel = host.querySelector('[data-wishlist-weapon]');
        const roleSel = host.querySelector('[data-wishlist-role]');
        const notesInput = host.querySelector('[data-wishlist-notes]');
        const hash = Number(weaponSel && weaponSel.value) || 0;
        const perks = wishDraft.perks.slice();
        if (!hash || !perks.length) {
          toast('Mindestens einen Perk auswählen.', 'info', 2200);
          return;
        }
        const item = allEntries().map((entry) => entry.item).find((candidate) => candidate && Number(candidate.hash) === hash);
        const rules = ((getCfg().bungie && getCfg().bungie.customWishlist) || []).slice();
        rules.unshift({
          id: 'w-' + Date.now().toString(36),
          hash,
          name: (item && item.name) || `Item ${hash}`,
          role: (roleSel && roleSel.value) || 'any',
          notes: String((notesInput && notesInput.value) || '').trim().slice(0, 120),
          perks
        });
        setConfig({ bungie: { customWishlist: rules.slice(0, 100) } });
        wishDraft = { hash, perks: [], role: 'any', notes: '' };
        toast('Wunschregel gespeichert.', 'success', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-remove]')) {
        const id = String(event.target.closest('[data-wishlist-remove]').dataset.wishlistRemove || '');
        const rules = ((getCfg().bungie && getCfg().bungie.customWishlist) || []).filter((rule) => rule.id !== id);
        setConfig({ bungie: { customWishlist: rules } });
        toast('Wunschregel entfernt.', 'info', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-tool-postmaster-filter]')) {
        if (!api || typeof api.postmasterCollectFiltered !== 'function') return;
        api.postmasterCollectFiltered('nonweapons').then((result) => {
          if (result && result.ok) {
            toast(`${Number(result.pulled) || 0} Items abgeholt, ${Number(result.skipped) || 0} Waffen übersprungen.`, 'success', 2800);
            if (ctx.refreshInventory) ctx.refreshInventory();
          } else {
            toast((result && result.error) || 'Abholen fehlgeschlagen.', 'error', 3000);
          }
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-session-goal-add]')) {
        const input = host.querySelector('[data-session-goal-input]');
        const text = String((input && input.value) || '').trim().slice(0, 80);
        if (!text) return;
        const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []).slice();
        goals.unshift({ id: 'g-' + Date.now().toString(36), text, target: 1, progress: 0 });
        setConfig({ bungie: { sessionGoals: goals.slice(0, 12) } });
        render();
        return;
      }
      if (event.target.closest('[data-session-goal]')) {
        const [deltaText, id] = String(event.target.closest('[data-session-goal]').dataset.sessionGoal || '').split(':');
        const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []).map((goal) =>
          goal.id === id ? { ...goal, progress: Math.max(0, Math.min(goal.target, goal.progress + (Number(deltaText) || 0))) } : goal
        );
        setConfig({ bungie: { sessionGoals: goals } });
        render();
        return;
      }
      if (event.target.closest('[data-session-goal-del]')) {
        const id = String(event.target.closest('[data-session-goal-del]').dataset.sessionGoalDel || '');
        const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []).filter((goal) => goal.id !== id);
        setConfig({ bungie: { sessionGoals: goals } });
        render();
        return;
      }
      if (event.target.closest('[data-session-auto]')) {
        try { window.localStorage.setItem('d2tool.autoRecap', event.target.checked === true ? '1' : '0'); } catch (error) { /* egal */ }
        toast(event.target.checked === true ? 'Auto-Recap aktiviert.' : 'Auto-Recap deaktiviert.', 'info', 1800);
        return;
      }
      if (event.target.closest('[data-session-auto-open]')) {
        let now = false;
        try { now = window.localStorage.getItem('d2tool.autoRecap') === '1'; } catch (error) { now = false; }
        try { window.localStorage.setItem('d2tool.autoRecap', now ? '0' : '1'); } catch (error) { /* egal */ }
        toast(now ? 'Auto-Recap deaktiviert.' : 'Auto-Recap aktiviert.', 'info', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-session-preset]')) {
        const kind = String(event.target.closest('[data-session-preset]').dataset.sessionPreset || '');
        const preset = kind === 'gm' ? { text: '3 GMs abschließen', target: 3, auto: 'gm' } : kind === 'catalyst' ? { text: '2 Katalysatoren holen', target: 2, auto: 'catalyst' } : { text: 'Händler prüfen', target: 1 };
        const goals = ((getCfg().bungie && getCfg().bungie.sessionGoals) || []).slice();
        goals.unshift({ id: 'g-' + Date.now().toString(36), text: preset.text, target: preset.target, progress: 0, auto: preset.auto || '' });
        setConfig({ bungie: { sessionGoals: goals.slice(0, 12) } });
        render();
        return;
      }
      if (event.target.closest('[data-tool-week-template]')) {
        const milestones = ((milestonesState && milestonesState.items) || []);
        const existing = ((getCfg().checklist && getCfg().checklist.items) || []);
        const texts = [...new Set(milestones.map((item) => String(item.name || '').trim()).filter(Boolean))];
        const items = existing.slice();
        for (const text of texts) {
          if (!items.some((item) => item.text === text)) items.push({ id: 'c-' + Math.random().toString(36).slice(2, 10), text: text.slice(0, 80), done: false });
        }
        setConfig({ checklist: { items: items.slice(0, 40) } });
        toast(`${Math.max(0, items.length - existing.length)} Wochenziele übernommen.`, 'success', 2400);
        render();
        return;
      }
      if (event.target.closest('[data-encounter-suggest]')) {
        const week = nextWeekResetDate();
        const key = `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`;
        const all = { ...(((getCfg().bungie && getCfg().bungie.encounterTracker) || {})) };
        const list = Array.isArray(all[key]) ? all[key].slice() : [];
        const milestones = ((milestonesState && milestonesState.items) || []);
        for (const item of milestones) {
          const name = String(item.name || '').trim();
          if (!name || !/raid|dungeon|nightfall|grandmaster|orkan|albtraum|verlies/i.test(name)) continue;
          if (!list.some((entry) => entry.text === name)) list.push({ id: 'e-' + Math.random().toString(36).slice(2, 10), text: name.slice(0, 60), done: false });
        }
        all[key] = list.slice(0, 30);
        setConfig({ bungie: { encounterTracker: all } });
        render();
        return;
      }
      if (event.target.closest('[data-encounter-add]')) {
        const input = host.querySelector('[data-encounter-input]');
        const text = String((input && input.value) || '').trim().slice(0, 60);
        if (!text) return;
        const week = nextWeekResetDate();
        const key = `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`;
        const all = { ...(((getCfg().bungie && getCfg().bungie.encounterTracker) || {})) };
        const list = Array.isArray(all[key]) ? all[key].slice() : [];
        list.push({ id: 'e-' + Date.now().toString(36), text, done: false });
        all[key] = list.slice(0, 30);
        setConfig({ bungie: { encounterTracker: all } });
        render();
        return;
      }
      const encLibAdd = event.target.closest('[data-enc-lib-add]');
      if (encLibAdd) {
        const [activity, encounter] = String(encLibAdd.dataset.encLibAdd || '').split('|');
        if (activity && encounter) addEncounterEntries([`${activity} – ${encounter}`]);
        return;
      }
      const encLibAll = event.target.closest('[data-enc-lib-all]');
      if (encLibAll) {
        const activity = String(encLibAll.dataset.encLibAll || '');
        const entry = ENCOUNTER_LIBRARY.find((candidate) => candidate.name === activity);
        if (entry) addEncounterEntries(entry.encounters.map((encounter) => `${activity} – ${encounter}`));
        return;
      }
      if (event.target.closest('[data-undo-restore]')) {
        let history = [];
        try { history = JSON.parse(window.localStorage.getItem('d2inv.undoHistory') || '[]'); } catch (error) { history = []; }
        const index = Number(event.target.closest('[data-undo-restore]').dataset.undoRestore) || 0;
        const entry = history[index];
        if (!entry || !entry.previous) return;
        setConfig({ bungie: { itemTags: { ...entry.previous } } });
        history.splice(index, 1);
        window.localStorage.setItem('d2inv.undoHistory', JSON.stringify(history));
        toast('Aktion rückgängig gemacht.', 'success', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-artifact-add]')) {
        const input = host.querySelector('[data-artifact-input]');
        const name = String((input && input.value) || '').trim().slice(0, 60);
        if (!name) return;
        const plan = artifactPlan();
        if (!plan.includes(name)) plan.unshift(name);
        window.localStorage.setItem('d2tool.artifactPlan', JSON.stringify(plan.slice(0, 20)));
        render();
        return;
      }
      if (event.target.closest('[data-artifact-toggle]')) {
        const name = String(event.target.closest('[data-artifact-toggle]').dataset.artifactToggle || '');
        const plan = artifactPlan();
        const index = plan.indexOf(name);
        if (index >= 0) plan.splice(index, 1);
        else plan.unshift(name);
        window.localStorage.setItem('d2tool.artifactPlan', JSON.stringify(plan.slice(0, 20)));
        render();
        return;
      }
      const weekMinutesButton = event.target.closest('[data-week-minutes]');
      if (weekMinutesButton) {
        weekMinutesFilter = Number(weekMinutesButton.dataset.weekMinutes) || 0;
        render();
        return;
      }
      const weekViewButton = event.target.closest('[data-week-view]');
      if (weekViewButton) {
        const view = String(weekViewButton.dataset.weekView || 'all');
        weekCheckView = ['all', 'must', 'rec', 'opt', 'own'].includes(view) ? view : 'all';
        render();
        return;
      }
      if (event.target.closest('[data-tool-week-reset]')) { resetWeeklyTemplate(); return; }
      if (event.target.closest('[data-tool-week-auto]')) { autoCheckWeek(); return; }
      const weekSourceLink = event.target.closest('[data-week-source-link]');
      if (weekSourceLink) {
        const url = String(weekSourceLink.dataset.weekSourceLink || '');
        if (url && api && typeof api.openExternal === 'function') api.openExternal(url);
        else if (url) window.open(url, '_blank');
        return;
      }
      const pickerClassButton = event.target.closest('[data-picker-class]');
      if (pickerClassButton) {
        const nextClass = Number(pickerClassButton.dataset.pickerClass);
        if ([0, 1, 2].includes(nextClass)) pickerClass = nextClass;
        pickerExotic = '';
        pickerLocks = {};
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      if (event.target.closest('[data-picker-find]')) { findArmorSets(); return; }
      if (event.target.closest('[data-picker-preset-save]')) {
        const input = host && host.querySelector('[data-picker-preset-name]');
        saveCurrentPickerPreset(input ? input.value : '');
        return;
      }
      if (event.target.closest('[data-picker-preset-del]')) {
        const select = host && host.querySelector('[data-picker-preset]');
        const value = select ? String(select.value || '') : '';
        deleteCurrentPickerPreset(value.startsWith('saved:') ? value.slice(6) : '');
        return;
      }
      if (event.target.closest('[data-picker-target-save]')) {
        const input = host && host.querySelector('[data-picker-target-name]');
        const ok = savePickerTarget(input ? input.value : '');
        if (input) input.value = '';
        toast(ok ? 'Zielprofil gespeichert.' : 'Bitte einen Namen für das Zielprofil eingeben.', ok ? 'success' : 'info', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-picker-target-del]')) {
        const select = host && host.querySelector('[data-picker-target]');
        const id = select ? String(select.value || '') : '';
        if (!id) { toast('Kein Zielprofil ausgewählt.', 'info', 1800); return; }
        writePickerTargets(pickerTargets.filter((target) => String(target.id) !== id));
        toast('Zielprofil gelöscht.', 'success', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-picker-import]')) { importPickerFromClipboard(); return; }
      if (event.target.closest('[data-picker-lock-equipped]')) {
        const character = ((data && data.characters) || []).find((entry) => Number(entry.classType) === pickerClass);
        const equipped = (character && data.equipped && data.equipped[character.id]) || [];
        pickerLocks = {};
        for (const item of equipped) {
          const bucket = Number(item.bucket);
          if (PICKER_SLOTS.includes(bucket)) pickerLocks[bucket] = String(item.instanceId || item.hash);
        }
        pickerResult = null;
        saveArmorPicker();
        findArmorSets();
        return;
      }
      const pickerCandidate = event.target.closest('[data-picker-candidate]');
      if (pickerCandidate) {
        const slot = Number(pickerCandidate.dataset.pickerCandidateSlot) || 0;
        if (slot) pickerLocks[slot] = String(pickerCandidate.dataset.pickerCandidate || '');
        pickerResult = null;
        saveArmorPicker();
        findArmorSets();
        return;
      }
      if (event.target.closest('[data-picker-reset]')) {
        pickerGoals = {};
        pickerMods = {};
        pickerFragments = {};
        pickerLocks = {};
        pickerExotic = '';
        pickerExoticMode = 'allow';
        pickerMasterwork = false;
        pickerSet = '';
        pickerSetCount = 0;
        pickerSort = 'goals';
        pickerArchetype = '';
        pickerWeights = {};
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerLowerGoal = event.target.closest('[data-picker-lower]');
      if (pickerLowerGoal) {
        const hash = String(pickerLowerGoal.dataset.pickerLower || '');
        const set = pickerResult && pickerResult.sets[0];
        if (hash && set) {
          const value = pickerEffective(set.stats, hash);
          const next = Math.max(0, Math.floor(value / 5) * 5);
          if (next > 0) pickerGoals[hash] = next;
          else delete pickerGoals[hash];
          saveArmorPicker();
          findArmorSets();
        }
        return;
      }
      const pickerRelax = event.target.closest('[data-picker-relax]');
      if (pickerRelax) {
        const kind = String(pickerRelax.dataset.pickerRelax || '');
        if (kind === 'goals') {
          for (const { h } of ARMOR_STAT_DEFS) {
            const value = Number(pickerGoals[h]) || 0;
            if (!value) continue;
            const next = Math.max(0, value - 10);
            if (next > 0) pickerGoals[h] = next;
            else delete pickerGoals[h];
          }
        } else if (kind === 'filters') {
          pickerSet = '';
          pickerSetCount = 0;
          pickerLocks = {};
          pickerArchetype = '';
          pickerExcludeUsed = false;
        } else if (kind === 'exotic') {
          pickerExoticMode = 'allow';
          pickerExotic = '';
        } else if (kind === 'all') {
          for (const { h } of ARMOR_STAT_DEFS) {
            const value = Number(pickerGoals[h]) || 0;
            if (!value) continue;
            const next = Math.max(0, Math.floor((value - 10) / 5) * 5);
            if (next > 0) pickerGoals[h] = next;
            else delete pickerGoals[h];
          }
          pickerSet = '';
          pickerSetCount = 0;
          pickerLocks = {};
          pickerArchetype = '';
          pickerExcludeUsed = false;
          pickerExoticMode = 'allow';
          pickerExotic = '';
        }
        pickerResult = null;
        saveArmorPicker();
        render();
        setTimeout(() => findArmorSets(), 60);
        return;
      }
      const pickerShare = event.target.closest('[data-picker-share]');
      if (pickerShare && pickerResult && pickerResult.sets[0]) {
        const set = pickerResult.sets[0];
        const kind = String(pickerShare.dataset.pickerShare || 'text');
        if (kind === 'image') {
          const stats = ARMOR_STAT_DEFS.map(({ h, label }) => ({ label, value: pickerEffective(set.stats, h) }));
          const dataUrl = renderBuildCard({
            name: `Rüstungs-Set · ${CLASS_NAMES[pickerClass] || ''}`,
            subtitle: `${set.total} Punkte${pickerMasterwork ? ' · Meisterwerk' : ''}`,
            accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff4655',
            stats,
            items: set.items.map((item) => ({
              name: item.name,
              typeName: item.typeName || '',
              power: item.power,
              exotic: Number(item.rarity) === 6
            })),
            mods: [],
            perks: [],
            footer: `Armor-Picker · ${new Date().toLocaleDateString('de-DE')}`
          });
          if (dataUrl && api && typeof api.saveBuildCard === 'function') {
            api.saveBuildCard({ dataUrl, name: 'ruestungs-set' })
              .then((result) => {
                if (result && result.ok) toast('Set als Bild gespeichert.', 'success', 2400);
                else if (!(result && result.canceled)) toast((result && result.error) || 'Speichern fehlgeschlagen.', 'error', 2600);
              })
              .catch((error) => toast(error.message || String(error), 'error', 2600));
          }
          return;
        }
        if (kind === 'link') copyToClipboard(pickerShareLink(set), 'Loadout-Link');
        else if (kind === 'json') {
          const payload = {
            name: `Armor-Picker ${CLASS_NAMES[pickerClass] || 'Build'}`,
            classType: pickerClass,
            items: set.items.map((item) => ({ instanceId: item.instanceId || '', hash: item.hash, name: item.name, bucket: item.bucket })),
            stats: Object.fromEntries(ARMOR_STAT_DEFS.map(({ h }) => [armorStatLabel(h), pickerEffective(set.stats, h)]))
          };
          copyToClipboard(JSON.stringify(payload, null, 2), 'JSON');
        } else copyToClipboard(pickerShareText(set), 'Set-Text');
        return;
      }
      const pickerApply = event.target.closest('[data-picker-apply]');
      if (pickerApply && pickerResult) {
        const set = pickerResult.sets[Number(pickerApply.dataset.pickerApply) || 0];
        if (!set) return;
        const name = String(pickerApply.dataset.pickerName || `Armor-Picker ${CLASS_NAMES[pickerClass] || 'Build'}`);
        const mods = ARMOR_STAT_DEFS
          .map(({ h }) => {
            const count = Number(pickerMods[h]) || 0;
            const hash = ARMOR_STAT_MOD_HASHES[h];
            const info = pickerPlugInfo(hash) || {};
            const meta = ARMOR_STAT_MOD_META[hash] || {};
            const statIcon = (data && data.charStatIcons && data.charStatIcons[String(h)]) || '';
            return {
              hash,
              statHash: h,
              count,
              name: meta.name || info.n || armorStatLabel(h),
              icon: meta.icon || info.i || statIcon,
              description: info.d || '',
              plugCategory: info.p || '',
              perks: info.s || []
            };
          })
          .filter((mod) => mod.hash && mod.count > 0);
        if (ctx && typeof ctx.openArmorLoadout === 'function') ctx.openArmorLoadout(set.items, name, mods, { autoRebalance: true });
        else toast('Loadout-Editor ist nicht verfügbar.', 'info', 2200);
        return;
      }
      if (event.target.closest('[data-tool-week-carry]')) {
        const items = ((getCfg().checklist && getCfg().checklist.items) || []).slice();
        const open = items.filter((item) => item.auto && !item.done);
        if (!open.length) {
          toast('Keine offenen Wochenpunkte zum Übernehmen.', 'info', 2200);
          return;
        }
        const existing = new Set(items.map((item) => item.text));
        let added = 0;
        for (const item of open) {
          const text = `Übernommen: ${item.text}`.slice(0, 80);
          if (existing.has(text)) continue;
          items.push({ id: 'c-' + Date.now().toString(36) + '-' + added, text, done: false, group: 'own', repeat: 'weekly', char: '', doneAt: 0 });
          added += 1;
        }
        if (added) {
          setConfig({ checklist: { items } });
          toast(`${added} offene Punkte übernommen.`, 'success', 2600);
        } else {
          toast('Offene Punkte waren bereits übernommen.', 'info', 2200);
        }
        render();
        return;
      }
      if (event.target.closest('[data-tool-week-ics]')) {
        if (!api || typeof api.exportCalendarIcs !== 'function') {
          toast('Kalender-Export ist nicht verfügbar.', 'error', 2400);
          return;
        }
        api.exportCalendarIcs().then((result) => {
          if (result && result.ok) toast(`Kalender gespeichert (${result.events} Termine): ${result.path}`, 'success', 4200);
          else toast((result && result.error) || 'Kalender-Export fehlgeschlagen.', 'error', 3200);
        }).catch(() => toast('Kalender-Export fehlgeschlagen.', 'error', 3000));
        return;
      }
      if (event.target.closest('[data-tool-week-copy]')) {        const text = weekSummaryText();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast('Wochenübersicht kopiert.', 'success', 1600)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 1800));
        } else {
          toast('Zwischenablage nicht verfügbar.', 'error', 1800);
        }
        return;
      }
      if (event.target.closest('[data-tool-stats-hud]')) {
        if (api && typeof api.statsHudOpen === 'function') {
          api.statsHudOpen(statsHudPayload()).then((result) => {
            if (result && result.open) toast('Stat-HUD geöffnet.', 'success', 1600);
          }).catch((error) => toast(error.message || String(error), 'error', 2200));
        } else {
          toast('Stat-HUD ist in dieser Version nicht verfügbar.', 'info', 2200);
        }
        return;
      }
      if (event.target.closest('[data-collection-tab]')) {
        collectionTab = String(event.target.closest('[data-collection-tab]').dataset.collectionTab || 'overview');
        render();
        return;
      }
      if (event.target.closest('[data-tool-focus]')) {
        focusMode = !focusMode;
        render();
        return;
      }
      if (event.target.closest('[data-config-backup]')) {
        if (api && typeof api.configBackupNow === 'function') {
          api.configBackupNow().then((result) => {
            toast(result && result.ok ? 'Sicherung erstellt.' : 'Sicherung fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2200);
            ensureConfigBackups(true);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-config-export]')) {
        if (api && typeof api.configExport === 'function') {
          api.configExport().then((result) => {
            if (result && result.ok) toast('Konfiguration exportiert.', 'success', 2400);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-config-import]')) {
        if (!window.confirm('Konfiguration importieren? Die aktuelle Konfiguration wird vorher gesichert.')) return;
        if (api && typeof api.configImport === 'function') {
          api.configImport().then((result) => {
            if (result && result.ok) toast('Importiert – bitte die App neu starten.', 'success', 5000);
            else if (result && result.error) toast(result.error, 'error', 3000);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      const configRestore = event.target.closest('[data-config-restore]');
      if (configRestore) {
        const name = String(configRestore.dataset.configRestore || '');
        if (!name) return;
        if (!window.confirm(`Sicherung „${name}" laden? Die aktuelle Konfiguration wird vorher gesichert.`)) return;
        if (api && typeof api.configRestoreBackup === 'function') {
          api.configRestoreBackup(name).then((result) => {
            if (result && result.ok) toast('Sicherung geladen – bitte die App neu starten.', 'success', 5000);
            else toast((result && result.error) || 'Sicherung fehlgeschlagen.', 'error', 3000);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-cache-clear]')) {
        if (!window.confirm('Bild-Cache leeren? Bungie-Icons werden beim nächsten Anzeigen neu geladen.')) return;
        if (api && typeof api.clearImageCache === 'function') {
          api.clearImageCache().then((result) => {
            toast(result && result.ok ? 'Bild-Cache geleert.' : 'Bild-Cache konnte nicht geleert werden.', result && result.ok ? 'success' : 'error', 2400);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-notify-test]')) {
        if (api && typeof api.notifyTest === 'function') {
          api.notifyTest().then((result) => {
            toast(result && result.ok ? 'Test-Benachrichtigung gesendet.' : 'Benachrichtigung nicht verfügbar.', result && result.ok ? 'success' : 'error', 2400);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-integrity-check]')) { ensureIntegrity(true); return; }
      if (event.target.closest('[data-integrity-repair]')) {
        if (!window.confirm('Datenintegrität prüfen und defekte Caches entfernen? Die Daten werden danach neu geladen.')) return;
        if (api && typeof api.storageVerify === 'function') {
          api.storageVerify().then((result) => {
            integrityState = result || null;
            storageState = null;
            const removed = Number(result && result.removed) || 0;
            toast(removed ? `${removed} defekte Datei${removed === 1 ? '' : 'en'} entfernt.` : 'Keine defekten Dateien gefunden.', removed ? 'success' : 'info', 2600);
            if (removed && ctx.refreshInventory) ctx.refreshInventory();
            render();
          }).catch((error) => toast(error.message || String(error), 'error', 2600));
        }
        return;
      }
      if (event.target.closest('[data-secrets-refresh]')) {
        if (api && typeof api.bungieOAuthRefresh === 'function') {
          api.bungieOAuthRefresh().then((result) => {
            toast(result && result.ok ? 'Token erneuert.' : 'Token-Erneuerung fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2400);
            loadServiceHealth(true);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-secrets-reconnect]')) {
        if (api && typeof api.bungieOAuthStart === 'function') api.bungieOAuthStart().catch(() => {});
        return;
      }
      if (event.target.closest('[data-secrets-logout]')) {
        if (!window.confirm('Von Bungie abmelden? Tokens werden gelöscht, das Inventar bleibt als Offline-Stand erhalten.')) return;
        if (api && typeof api.bungieOAuthLogout === 'function') {
          api.bungieOAuthLogout().then(() => {
            toast('Abgemeldet.', 'info', 2200);
            loadServiceHealth(true);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-crash-load]')) { ensureCrashLog(true); return; }
      if (event.target.closest('[data-crash-copy]')) {
        const text = (crashLines || []).slice(-120).join('\n') || 'Kein Crash-Log geladen.';
        copyToClipboard(text, 'Crash-Log');
        return;
      }
      if (event.target.closest('[data-crash-folder]')) {
        if (api && typeof api.openCrashLogFolder === 'function') api.openCrashLogFolder().catch(() => {});
        return;
      }
      if (event.target.closest('[data-selftest-run]')) { runSelfTest(); return; }
      if (event.target.closest('[data-selftest-copy]')) {
        copyToClipboard(selfTestReport(), 'Selbsttest-Bericht');
        return;
      }
      if (event.target.closest('[data-storage-refresh]')) {
        storageState = null;
        storageLoading = false;
        render();
        return;
      }
      const storageClean = event.target.closest('[data-storage-clean]');
      if (storageClean) {
        const kind = String(storageClean.dataset.storageClean || '');
        if (api && typeof api.storageCleanup === 'function') {
          api.storageCleanup(kind).then((result) => {
            storageState = null;
            storageLoading = false;
            if (result && result.ok) toast(`Aufgeräumt: ${fmtBytes(result.freed)} frei.`, 'success', 2400);
            else toast((result && result.error) || 'Aufräumen fehlgeschlagen.', 'error', 2400);
            render();
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-tool-privacy-clean]')) {
        if (!window.confirm('Caches und Logs leeren? Nicht benötigte Daten werden bei Bedarf neu geladen. Konfiguration und Tokens bleiben erhalten.')) return;
        const cleanup = (kind) => (api && typeof api.storageCleanup === 'function' ? api.storageCleanup(kind) : Promise.resolve({ ok: true, freed: 0 }));
        Promise.resolve()
          .then(() => cleanup('all-caches'))
          .then(() => cleanup('logs'))
          .then((result) => {
            storageState = null;
            toast(`Caches und Logs geleert${result && result.freed ? `: ${fmtBytes(result.freed)} frei` : ''}.`, 'success', 2600);
            render();
          })
          .catch((error) => toast(error.message || String(error), 'error', 2600));
        return;
      }
      if (event.target.closest('[data-tool-privacy-export]')) {
        if (api && typeof api.exportDiagnostics === 'function') {
          api.exportDiagnostics().then((result) => {
            if (result && result.ok) toast('Geschwärztes Diagnose-Paket gespeichert.', 'success', 2400);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-tool-diag]')) {
        if (api && typeof api.exportDiagnostics === 'function') {
          api.exportDiagnostics().then((result) => {
            if (result && result.canceled) return;
            toast(result && result.ok ? 'Support-Paket exportiert.' : (result && result.error) || 'Export fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2600);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      const viewButton = event.target.closest('[data-tool-view]');
      if (viewButton) {
        toolView = String(viewButton.dataset.toolView || 'overview');
        if (!['overview', 'builds', 'collection', 'week', 'vendor'].includes(toolView)) toolView = 'overview';
        render();
        return;
      }
      if (event.target.closest('[data-tool-milestones]')) { loadMilestones(); return; }
      if (event.target.closest('[data-tool-activities]')) { loadActivities(true); return; }
      if (event.target.closest('[data-tool-bungie-check]')) { loadBungieStatus(true); return; }
      if (event.target.closest('[data-tool-bungie-reload]')) { loadBungieStatus(false); return; }
      if (event.target.closest('[data-tool-ingame-load]')) { loadInGameLoadouts(true); return; }
      if (event.target.closest('[data-tool-triumphs]')) { loadTriumphs(true); return; }
      if (event.target.closest('[data-tool-clan]')) { loadClan(true); return; }
      if (event.target.closest('[data-week-loot-load]')) {
        loadNightfall(true);
        return;
      }
      if (event.target.closest('[data-tool-nightfall]')) { loadNightfall(true); return; }
      if (event.target.closest('[data-tool-loot-goal]')) {
        const name = String(event.target.closest('[data-tool-loot-goal]').dataset.toolLootGoal || '').trim();
        if (!name) return;
        const goals = ((getCfg().bungie && getCfg().bungie.lootGoals) || []).slice();
        const index = goals.findIndex((goal) => String(goal).toLowerCase() === name.toLowerCase());
        if (index >= 0) goals.splice(index, 1);
        else goals.unshift(name);
        setConfig({ bungie: { lootGoals: goals.slice(0, 30) } });
        render();
        return;
      }
      if (event.target.closest('[data-tool-actions-reload]')) { actionLogState = null; render(); return; }
      if (event.target.closest('[data-tool-loot]')) { loadLootSources(true); return; }
      const sourceJump = event.target.closest('[data-source-jump]');
      if (sourceJump) {
        const source = String(sourceJump.dataset.sourceJump || '').trim();
        toolView = 'collection';
        collectionTab = 'sources';
        lootSourceSearch = source;
        lootSourceView = 'all';
        render();
        if (host) host.scrollTop = 0;
        return;
      }
      if (event.target.closest('[data-loot-source-missing]')) {
        lootOwnedFilter = 'missing';
        render();
        return;
      }
      const sourceGoalButton = event.target.closest('[data-loot-source-goal]');
      if (sourceGoalButton) {
        const source = String(sourceGoalButton.dataset.lootSourceGoal || '').trim();
        if (!source) return;
        const text = `Quelle farmen: ${source}`.slice(0, 80);
        const items = ((getCfg().checklist && getCfg().checklist.items) || []).slice();
        if (!items.some((item) => item.text === text)) {
          items.push({ id: 'c-' + Date.now().toString(36), text, done: false, group: 'own' });
          setConfig({ checklist: { items } });
          toast('Quelle als Wochenziel gespeichert.', 'success', 2200);
        } else {
          toast('Quelle ist bereits als Wochenziel gespeichert.', 'info', 2200);
        }
        render();
        return;
      }
      const lootViewButton = event.target.closest('[data-loot-view]');
      if (lootViewButton) {
        const view = String(lootViewButton.dataset.lootView || 'all');
        lootSourceView = ['all', 'raid', 'dungeon', 'season', 'vanguard', 'pvp', 'destination', 'other'].includes(view) ? view : 'all';
        render();
        return;
      }
      if (event.target.closest('[data-tool-ingame-apply]')) {
        const [characterId, index] = String(event.target.closest('[data-tool-ingame-apply]').dataset.toolIngameApply || '').split(':');
        if (!characterId) return;
        api.bungieEquipIngameLoadout({ characterId, loadoutIndex: Number(index) || 0, membershipType: data.membershipType }).then((result) => {
          if (result && result.ok) toast('In-Game-Loadout angewendet.', 'success', 2200);
          else toast((result && result.error) || 'Loadout konnte nicht angewendet werden.', 'error', 3000);
        }).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-tool-ingame-import]')) {
        const [characterId, index] = String(event.target.closest('[data-tool-ingame-import]').dataset.toolIngameImport || '').split(':');
        const list = (inGameLoadoutsState && inGameLoadoutsState.loadouts && inGameLoadoutsState.loadouts[characterId]) || [];
        const loadout = list.find((entry) => Number(entry.index) === Number(index));
        if (!loadout) return;
        const itemMap = new Map();
        for (const entry of allEntries()) if (entry.item && entry.item.instanceId) itemMap.set(String(entry.item.instanceId), entry.item);
        const items = (loadout.itemIds || []).map((id) => itemMap.get(String(id))).filter(Boolean).map((item) => ({
          instanceId: item.instanceId,
          hash: item.hash,
          name: item.name,
          bucket: item.bucket
        }));
        const character = (data.characters || []).find((entry) => entry.id === characterId) || {};
        const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).slice();
        loadouts.unshift({
          id: 'ingame-' + Date.now().toString(36),
          name: `In-Game ${Number(index) + 1}`,
          classType: Number(character.classType) || 0,
          characterId,
          items,
          mods: [],
          artifactPerks: [],
          subclassPlugs: [],
          notes: 'Aus Bungie-In-Game-Loadouts importiert',
          createdAt: Date.now()
        });
        setConfig({ bungie: { loadouts } });
        toast(`In-Game-Loadout ${Number(index) + 1} importiert.`, 'success', 2200);
        return;
      }
      if (event.target.closest('[data-tool-craftables]')) { loadCraftables(true); return; }
      const craftGoal = event.target.closest('[data-craft-goal]');
      if (craftGoal) {
        const key = String(craftGoal.dataset.craftGoal || '');
        const goals = craftGoals();
        if (craftGoal.checked) goals[key] = true;
        else delete goals[key];
        window.localStorage.setItem('d2tool.craftGoals', JSON.stringify(goals));
        render();
        return;
      }
      const craftViewButton = event.target.closest('[data-craft-view]');      if (craftViewButton) {
        const view = String(craftViewButton.dataset.craftView || 'source');
        craftView = ['source', 'type', 'status'].includes(view) ? view : 'source';
        craftOpenHash = '';
        try { window.localStorage.setItem('d2tool.craftView', craftView); } catch (error) { /* egal */ }
        render();
        return;
      }
      if (event.target.closest('[data-tool-craft-open]')) { craftOnlyOpen = !craftOnlyOpen; render(); return; }
      const craftOpen = event.target.closest('[data-craft-open]');
      if (craftOpen) {
        const hash = String(craftOpen.dataset.craftOpen || '');
        craftOpenHash = craftOpenHash === hash ? '' : hash;
        render();
        return;
      }
      if (event.target.closest('[data-tool-vendor]')) {
        const hash = Number(event.target.closest('[data-tool-vendor]').dataset.toolVendor) || 0;
        if (hash) loadVendorOffers(hash, true);
        return;
      }
      if (event.target.closest('[data-tool-wishlist-add]')) {
        const url = String(window.prompt('Wunschlisten-URL (DIM-Format):') || '').trim();
        if (!/^https?:\/\//i.test(url)) return;
        const list = String((getCfg().bungie && getCfg().bungie.wishlistUrl) || '').split(',').map((entry) => entry.trim()).filter(Boolean);
        if (!list.includes(url)) list.push(url);
        setConfig({ bungie: { wishlistUrl: list.join(',').slice(0, 800) } });
        wishlistHealthState = null;
        toast('Quelle hinzugefügt – neu laden.', 'success', 2000);
        render();
        return;
      }
      if (event.target.closest('[data-tool-wishlist-remove]')) {
        const list = String((getCfg().bungie && getCfg().bungie.wishlistUrl) || '').split(',').map((entry) => entry.trim()).filter(Boolean);
        if (!list.length) return;
        const name = String(window.prompt(`Quelle entfernen:\n${list.join('\n')}`, list[0]) || '').trim();
        if (!name) return;
        const next = list.filter((url) => url !== name);
        setConfig({ bungie: { wishlistUrl: next.join(',') } });
        wishlistHealthState = null;
        toast('Quelle entfernt.', 'info', 2000);
        render();
        return;
      }
      if (event.target.closest('[data-tool-wishlist-refresh]')) {
        wishlistHealthState = null;
        if (api && typeof api.bungieWishlistRefresh === 'function') {
          toast('Wunschlisten-Cache wird geleert …', 'info', 1800);
          api.bungieWishlistRefresh().then((result) => {
            if (result && result.ok) {
              if (ctx.refreshInventory) ctx.refreshInventory();
              else toast('Wunschliste neu geladen.', 'success', 1800);
            } else {
              toast((result && result.error) || 'Wunschliste konnte nicht geladen werden.', 'error', 2400);
            }
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-tool-xur]')) { loadXur(); return; }
      if (event.target.closest('[data-tool-xur-overlay]')) {
        if (api && typeof api.xurOpen === 'function') api.xurOpen().catch(() => {});
        else toast('Xûr-Overlay ist in dieser Version nicht verfügbar.', 'info', 2200);
        return;
      }
      if (event.target.closest('[data-tool-xur-wish]')) {
        xurWishOnly = !xurWishOnly;
        render();
        return;
      }
      if (event.target.closest('[data-tool-xur-remind]')) {
        const next = !(getCfg().xur && getCfg().xur.remind);
        setConfig({ xur: { remind: next } });
        if (api && typeof api.xurRemind === 'function') {
          api.xurRemind(next).then(() => {
            toast(next ? 'Xûr-Erinnerung aktiviert.' : 'Xûr-Erinnerung deaktiviert.', 'info', 1800);
            render();
          }).catch(() => toast('Erinnerung konnte nicht gesetzt werden.', 'error', 2000));
        }
        return;
      }
      if (event.target.closest('[data-tool-copy-build]')) {
        if (!optimizerResult) return;
        const text = buildSummaryText(optimizerResult);
        navigator.clipboard?.writeText(text).then(() => toast('Build-Text kopiert.', 'success', 1800)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2000));
        return;
      }
      if (event.target.closest('[data-tool-share-build]')) {
        if (!optimizerResult) return;
        shareBuildCard(optimizerResult).catch((error) => toast(error.message || String(error), 'error', 3000));
        return;
      }
      if (event.target.closest('[data-armorwish-del]')) {
        const id = String(event.target.closest('[data-armorwish-del]').dataset.armorwishDel || '');
        const rules = armorWishRules().filter((rule) => rule.id !== id);
        setConfig({ bungie: { armorWishlist: rules } });
        render();
        return;
      }
      if (event.target.closest('[data-armorwish-add]')) {
        const read = (selector) => String((host.querySelector(selector) || {}).value || '').trim();
        const rule = {
          id: 'wish-' + Date.now().toString(36),
          name: read('[data-armorwish-name]'),
          archetype: read('[data-armorwish-archetype]'),
          tertiary: read('[data-armorwish-tertiary]'),
          tunedStat: read('[data-armorwish-tuned]'),
          set: read('[data-armorwish-set]'),
          minTotal: Math.max(0, Math.min(200, Math.round(Number(read('[data-armorwish-min]')) || 0)))
        };
        if (!rule.name && !rule.archetype && !rule.tertiary && !rule.tunedStat && !rule.set && !rule.minTotal) {
          toast('Bitte mindestens ein Kriterium wählen.', 'info', 2200);
          return;
        }
        setConfig({ bungie: { armorWishlist: [...armorWishRules(), rule] } });
        toast('Rüstungs-Wunsch gespeichert.', 'success', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-tool-save-optimizer]')) {
        if (!optimizerResult) return;
        const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).slice();
        const name = `Stat: ${armorStatLabel(optimizerTarget1)}+${armorStatLabel(optimizerTarget2)}`;
        const mods1 = Number(optimizerResult.mods[optimizerTarget1]) || 0;
        const mods2 = Number(optimizerResult.mods[optimizerTarget2]) || 0;
        const statMods = [
          { hash: ARMOR_STAT_MOD_HASHES[optimizerTarget1], statHash: Number(optimizerTarget1), count: Math.max(0, Math.round(mods1 / 10)) },
          { hash: ARMOR_STAT_MOD_HASHES[optimizerTarget2], statHash: Number(optimizerTarget2), count: Math.max(0, Math.round(mods2 / 10)) }
        ].filter((mod) => mod.hash && mod.count > 0);
        const setText = (optimizerResult.sets || []).filter((set) => set.count >= 2)
          .map((set) => `${set.name} ${set.count}/5`).join(', ');
        loadouts.unshift({
          id: 'opt-' + Date.now().toString(36),
          name,
          classType: optimizerResult.character.classType,
          characterId: optimizerResult.character.id,
          items: optimizerResult.items.map((entry) => ({
            instanceId: entry.item.instanceId,
            hash: entry.item.hash,
            name: entry.item.name,
            bucket: entry.item.bucket
          })),
          mods: [],
          statMods,
          artifactPerks: [],
          subclassPlugs: [],
          notes: `Stat-Mods: ${armorStatLabel(optimizerTarget1)} +${mods1}, ${armorStatLabel(optimizerTarget2)} +${mods2}${setText ? ` · Sets: ${setText}` : ''}`,
          createdAt: Date.now()
        });
        setConfig({ bungie: { loadouts } });
        toast(`„${name}“ im Loadout-Editor gespeichert.`, 'success', 2600);
        return;
      }
      const apply = event.target.closest('[data-tool-apply]');
      if (apply && ctx.applyLoadout) {
        ctx.applyLoadout(apply.dataset.toolApply);
        return;
      }
      const search = event.target.closest('[data-tool-search]');
      if (search && ctx.searchFor) { ctx.searchFor(search.dataset.toolSearch); return; }
      const mode = event.target.closest('[data-tool-dup-mode]');
      if (mode) { duplicateMode = mode.dataset.toolDupMode; render(); return; }
      if (event.target.closest('[data-tool-armor-tag]')) {
        const [instanceId, tag] = String(event.target.closest('[data-tool-armor-tag]').dataset.toolArmorTag || '').split(':');
        if (!instanceId) return;
        const tags = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
        if (tag) tags[instanceId] = tag;
        else delete tags[instanceId];
        setConfig({ bungie: { itemTags: tags } });
        toast(tag === 'junk' ? 'Rüstung als „Aussortieren“ getaggt.' : 'Rüstung als „Behalten“ getaggt.', 'success', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-tool-cleanup-preview]')) {
        cleanupPlan = cleanupCandidateIds();
        toast(`${cleanupPlan.length} Cleanup-Kandidaten gefunden.`, cleanupPlan.length ? 'info' : 'success', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-tool-cleanup-apply]')) {
        if (!cleanupPlan || !cleanupPlan.length) return;
        const previous = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
        const tags = { ...previous };
        for (const id of cleanupPlan) tags[id] = 'junk';
        cleanupUndo = previous;
        setConfig({ bungie: { itemTags: tags } });
        toast(`${cleanupPlan.length} Items als „Aussortieren“ getaggt.`, 'success', 2600);
        cleanupPlan = null;
        render();
        return;
      }
      if (event.target.closest('[data-tool-cleanup-undo]')) {
        if (!cleanupUndo) return;
        setConfig({ bungie: { itemTags: { ...cleanupUndo } } });
        cleanupUndo = null;
        toast('Cleanup-Tags rückgängig gemacht.', 'info', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-tool-dup-tag]')) {
        const instanceId = String(event.target.closest('[data-tool-dup-tag]').dataset.toolDupTag || '');
        if (!instanceId) return;
        const tags = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
        tags[instanceId] = 'junk';
        setConfig({ bungie: { itemTags: tags } });
        toast('Kopie als „Aussortieren“ getaggt.', 'success', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-tool-copy-dupes]')) {
        const groups = duplicateGroups(duplicateMode);
        const lines = groups.flatMap((group) => group.candidates.map((entry) =>
          `${group.name} (${entry.item.power || '?'} Power, ${locationLabel(entry)})`
        ));
        if (!lines.length) { toast('Keine Kandidaten.', 'info', 1600); return; }
        api.copyToClipboard(`Aussortier-Kandidaten\n${lines.map((line) => `- ${line}`).join('\n')}`)
          .then((result) => toast(result && result.ok ? `${lines.length} Kandidaten kopiert.` : 'Kopieren fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2200));
      }
    });
    host.addEventListener('toggle', (event) => {
      const details = event.target;
      if (!details || !details.matches || !details.matches('details[data-lazy-fold]')) return;
      if (!details.open) return;
      const body = details.querySelector('[data-lazy-body]');
      if (!body || body.dataset.loaded === '1') return;
      const builder = lazyFoldBuilders.get(String(details.dataset.lazyFold || ''));
      if (builder) body.innerHTML = builder();
      body.dataset.loaded = '1';
    }, true);
    host.addEventListener('toggle', (event) => {
      const details = event.target;
      if (!details || !details.matches || !details.matches('details[data-record-lazy]')) return;
      if (!details.open) return;
      const body = details.querySelector('[data-record-lazy-body]');
      if (!body || body.dataset.loaded === '1') return;
      const node = recordNodeLookup.get(Number(details.dataset.recordNode || 0));
      if (!node) return;
      const depth = Number((String(details.className).match(/depth-(\d+)/) || [])[1] || 2);
      body.innerHTML = renderRecordNodeBody(node, depth);
      body.dataset.loaded = '1';
    }, true);
    host.addEventListener('input', (event) => {
      const vendorSearchInput = event.target.closest('[data-vendor-search]');
      if (vendorSearchInput) {
        vendorSearch = String(vendorSearchInput.value || '');
        if (vendorSearchTimer) clearTimeout(vendorSearchTimer);
        vendorSearchTimer = setTimeout(() => {
          vendorSearchTimer = 0;
          render();
          const input = host && host.querySelector('[data-vendor-search]');
          if (input) {
            input.focus();
            const length = input.value.length;
            try { input.setSelectionRange(length, length); } catch (error) { /* egal */ }
          }
        }, 140);
        return;
      }
      const search = event.target.closest('[data-record-search]');
      if (!search) return;
      recordSearch = String(search.value || '');
      if (recordSearchTimer) clearTimeout(recordSearchTimer);
      recordSearchTimer = setTimeout(() => {
        recordSearchTimer = null;
        render();
        const input = host && host.querySelector('[data-record-search]');
        if (input) {
          input.focus();
          const length = input.value.length;
          try { input.setSelectionRange(length, length); } catch (error) { /* egal */ }
        }
      }, 220);
    });
    host.addEventListener('change', (event) => {
      const vendorChar = event.target.closest('[data-vendor-char]');
      if (vendorChar) {
        allVendorsCharacterId = String(vendorChar.value || '');
        allVendorsState = null;
        loadAllVendors(true);
        return;
      }
      const vendorMissing = event.target.closest('[data-vendor-missing]');
      if (vendorMissing) {
        vendorOnlyMissing = vendorMissing.checked === true;
        render();
        return;
      }
      const vendorWishlist = event.target.closest('[data-vendor-wishlist]');
      if (vendorWishlist) {
        vendorWishOnly = vendorWishlist.checked === true;
        render();
        return;
      }
      const vcOption = event.target.closest('[data-vc-option]');
      if (vcOption) {
        vcSet(String(vcOption.dataset.vcOption || ''), vcOption.checked === true);
        vcReview = null;
        render();
        return;
      }
      const vcType = event.target.closest('[data-vc-type]');
      if (vcType) {
        const all = [...(host ? host.querySelectorAll('[data-vc-type]') : [])];
        const checked = all.filter((input) => input.checked).map((input) => String(input.dataset.vcType || ''));
        vcSet('weapons.types', checked.length === all.length ? [] : checked);
        vcReview = null;
        render();
        return;
      }
      const vcRangeInput = event.target.closest('[data-vc-range]');
      if (vcRangeInput) {
        const path = String(vcRangeInput.dataset.vcRange || '');
        const value = Math.max(0, Math.min(100, Number(vcRangeInput.value) || 0));
        vcSet(path, value);
        const output = host && host.querySelector(`[data-vc-range-value="${path}"]`);
        if (output) output.textContent = value >= 100 ? 'Nur Beste' : `${value} %`;
        return;
      }
      const pickerExoticModeSelect = event.target.closest('[data-picker-exotic-mode]');
      if (pickerExoticModeSelect) {
        const mode = String(pickerExoticModeSelect.value || 'allow');
        pickerExoticMode = ['allow', 'forbid', 'only'].includes(mode) ? mode : 'allow';
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerArchetypeSelect = event.target.closest('[data-picker-archetype]');
      if (pickerArchetypeSelect) {
        pickerArchetype = String(pickerArchetypeSelect.value || '');
        pickerResult = null;
        pickerExotic = '';
        pickerLocks = {};
        saveArmorPicker();
        render();
        return;
      }
      const pickerWeightSelect = event.target.closest('[data-picker-weight]');
      if (pickerWeightSelect) {
        const hash = String(pickerWeightSelect.dataset.pickerWeight || '');
        if (!hash) return;
        if (pickerWeightSelect.value === '') delete pickerWeights[hash];
        else pickerWeights[hash] = Math.max(0, Math.min(3, Number(pickerWeightSelect.value) || 0));
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerPresetSelect = event.target.closest('[data-picker-preset]');
      if (pickerPresetSelect) {
        const value = String(pickerPresetSelect.value || '');
        if (!value) return;
        if (value.startsWith('builtin:')) {
          const preset = PICKER_BUILTIN_PRESETS.find((entry) => entry.id === value.slice(8));
          if (preset) applyPickerSetup(pickerSetupOfPreset(preset));
        } else if (value.startsWith('saved:')) {
          const preset = readPickerPresets().find((entry) => entry.id === value.slice(6));
          if (preset) applyPickerSetup(preset);
        }
        render();
        return;
      }
      const pickerTargetSelect = event.target.closest('[data-picker-target]');
      if (pickerTargetSelect) {
        const id = String(pickerTargetSelect.value || '');
        if (!id) return;
        if (applyPickerTarget(id)) {
          const target = pickerTargets.find((entry) => String(entry.id) === id);
          toast(`Zielprofil „${target ? target.name : ''}“ angewendet.`, 'success', 2000);
          render();
          setTimeout(() => findArmorSets(), 80);
        }
        return;
      }
      const pickerAspect = event.target.closest('[data-picker-aspect]');
      if (pickerAspect) {
        const idx = String(pickerAspect.dataset.pickerAspect || '');
        const hash = Number(pickerAspect.value) || 0;
        const selection = pickerSubclassSelection();
        if (idx) {
          if (hash) selection[idx] = hash;
          else delete selection[idx];
        }
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerFragPlug = event.target.closest('[data-picker-frag-plug]');
      if (pickerFragPlug) {
        const idx = String(pickerFragPlug.dataset.pickerFragPlug || '');
        const hash = Number(pickerFragPlug.value) || 0;
        const selection = pickerSubclassSelection();
        if (idx) {
          if (hash) selection[idx] = hash;
          else delete selection[idx];
        }
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerExcludeUsedInput = event.target.closest('[data-picker-exclude-used]');
      if (pickerExcludeUsedInput) {
        pickerExcludeUsed = pickerExcludeUsedInput.checked === true;
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerTuningSelect = event.target.closest('[data-picker-tuning]');
      if (pickerTuningSelect) {
        const bucket = String(pickerTuningSelect.dataset.pickerTuning || '');
        const hash = Number(pickerTuningSelect.value) || 0;
        if (bucket) {
          if (hash) pickerTuning[bucket] = hash;
          else delete pickerTuning[bucket];
        }
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerSubclassUse = event.target.closest('[data-picker-subclass-use]');
      if (pickerSubclassUse) {
        pickerUseSubclass = pickerSubclassUse.checked === true;
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const crashFilterInput = event.target.closest('[data-crash-filter]');
      if (crashFilterInput) {
        crashFilter = String(crashFilterInput.value || '');
        render();
        return;
      }
      const godWeight = event.target.closest('[data-god-weight]');
      if (godWeight) {
        const key = String(godWeight.dataset.godWeight || '');
        const value = Math.max(0, Math.min(60, Math.round(Number(godWeight.value) || 0)));
        if (key) setConfig({ bungie: { godrollWeights: { ...godrollWeights(), [key]: value } } });
        render();
        return;
      }
      const perkWeight = event.target.closest('[data-god-perk-weight]');
      if (perkWeight) {
        const name = String(perkWeight.dataset.godPerkWeight || '');
        const value = Math.max(1, Math.min(5, Math.round(Number(perkWeight.value) || 1)));
        const current = godrollWeights();
        if (name) setConfig({ bungie: { godrollWeights: { ...current, perks: { ...(current.perks || {}), [name]: value } } } });
        render();
        return;
      }
      const modSearch = event.target.closest('[data-mod-search]');
      if (modSearch) {
        modLibQuery = String(modSearch.value || '');
        render();
        return;
      }
      const pickerGoalInput = event.target.closest('[data-picker-goal]');
      if (pickerGoalInput) {
        const hash = String(pickerGoalInput.dataset.pickerGoal || '');
        const value = Math.max(0, Math.min(200, Math.round(Number(pickerGoalInput.value) || 0)));
        if (value) pickerGoals[hash] = value;
        else delete pickerGoals[hash];
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerModInput = event.target.closest('[data-picker-mod]');
      if (pickerModInput) {
        const hash = String(pickerModInput.dataset.pickerMod || '');
        const value = Math.max(0, Math.min(5, Math.round(Number(pickerModInput.value) || 0)));
        const current = Object.values(pickerMods).reduce((sum, entry) => sum + (Number(entry) || 0), 0);
        const nextTotal = current - (Number(pickerMods[hash]) || 0) + value;
        if (nextTotal > 5) {
          pickerModInput.value = String(Number(pickerMods[hash]) || 0);
          toast('Maximal 5 Stat-Mods pro Set.', 'info', 2200);
          return;
        }
        if (value) pickerMods[hash] = value;
        else delete pickerMods[hash];
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerExoticInput = event.target.closest('[data-picker-exotic]');
      if (pickerExoticInput) {
        pickerExotic = String(pickerExoticInput.value || '');
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerLockInput = event.target.closest('[data-picker-lock]');
      if (pickerLockInput) {
        const slot = String(pickerLockInput.dataset.pickerLock || '');
        const value = String(pickerLockInput.value || '');
        if (value) pickerLocks[slot] = value;
        else delete pickerLocks[slot];
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerFragmentInput = event.target.closest('[data-picker-fragment]');
      if (pickerFragmentInput) {
        const hash = String(pickerFragmentInput.dataset.pickerFragment || '');
        const value = Math.max(-30, Math.min(30, Math.round(Number(pickerFragmentInput.value) || 0)));
        if (value) pickerFragments[hash] = value;
        else delete pickerFragments[hash];
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const privacyStreamer = event.target.closest('[data-privacy-streamer]');
      if (privacyStreamer) {
        setConfig({ appearance: { streamerMode: privacyStreamer.checked === true } });
        render();
        return;
      }
      const pickerMasterworkInput = event.target.closest('[data-picker-masterwork]');
      if (pickerMasterworkInput) {
        pickerMasterwork = pickerMasterworkInput.checked === true;
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerSetInput = event.target.closest('[data-picker-set]');
      if (pickerSetInput) {
        pickerSet = String(pickerSetInput.value || '');
        if (!pickerSet) pickerSetCount = 0;
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerSetCountInput = event.target.closest('[data-picker-setcount]');
      if (pickerSetCountInput) {
        pickerSetCount = [0, 2, 4].includes(Number(pickerSetCountInput.value)) ? Number(pickerSetCountInput.value) : 0;
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const pickerSortInput = event.target.closest('[data-picker-sort]');
      if (pickerSortInput) {
        pickerSort = ['goals', 'total', 'missing'].includes(pickerSortInput.value) ? pickerSortInput.value : 'goals';
        pickerResult = null;
        saveArmorPicker();
        render();
        return;
      }
      const craftToggle = event.target.closest('[data-craft-toggle]');
      if (craftToggle) {
        const mode = String(craftToggle.dataset.craftToggle || '');
        if (mode === 'open') craftOnlyOpen = craftToggle.checked === true;
        if (mode === 'crafted') craftHideCrafted = craftToggle.checked === true;
        if (mode === 'deepsight') craftOnlyDeep = craftToggle.checked === true;
        render();
        return;
      }
      const recordToggle = event.target.closest('[data-record-toggle]');
      if (recordToggle) {
        const mode = String(recordToggle.dataset.recordToggle || '');
        if (mode === 'hide') recordHideCompleted = recordToggle.checked === true;
        if (mode === 'sort') recordSortProgress = recordToggle.checked === true;
        if (mode === 'uncollected') recordOnlyUncollected = recordToggle.checked === true;
        render();
        return;
      }
      const duelA = event.target.closest('[data-armor-duel-a]');
      if (duelA) {
        armorDuelA = String(duelA.value || '');
        render();
        return;
      }
      const duelB = event.target.closest('[data-armor-duel-b]');
      if (duelB) {
        armorDuelB = String(duelB.value || '');
        render();
        return;
      }
      const statGoal = event.target.closest('[data-stat-goal]');
      if (statGoal) {
        const goals = statGoals();
        const key = String(statGoal.dataset.statGoal || '');
        const value = Math.max(0, Math.min(200, Math.round(Number(statGoal.value) || 0)));
        if (value) goals[key] = value;
        else delete goals[key];
        window.localStorage.setItem('d2tool.statGoals', JSON.stringify(goals));
        render();
        return;
      }
      if (event.target.closest('[data-build-target-save]')) {
        const goals = statGoals();
        const name = window.prompt('Name für das Build-Ziel:', 'Build-Ziel');
        if (!name) return;
        const list = buildTargets();
        const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []);
        const loadout = loadouts.find((entry) => entry.id === gapLoadoutId) || loadouts[0] || null;
        list.push({
          name: String(name).slice(0, 60),
          stats: { ...goals },
          at: Date.now(),
          loadoutId: loadout ? String(loadout.id || '') : '',
          items: loadout ? (loadout.items || []).map((item) => ({ instanceId: item.instanceId, hash: item.hash, name: item.name, bucket: item.bucket })) : [],
          mods: loadout ? (loadout.mods || []).map((mod) => ({ h: mod.h, n: mod.n })) : []
        });
        saveBuildTargets(list);
        toast('Build-Ziel gespeichert.', 'success', 2200);
        render();
        return;
      }
      if (event.target.closest('[data-build-snapshot-save]')) {
        const name = window.prompt('Name für den Build-Snapshot:', 'Build-Snapshot');
        if (!name) return;
        const list = buildSnapshots();
        list.push({ name: String(name).slice(0, 60), stats: { ...statGoals() }, loadouts: ((getCfg().bungie && getCfg().bungie.loadouts) || []).length, at: Date.now() });
        saveBuildSnapshots(list);
        toast('Build-Snapshot gespeichert.', 'success', 2200);
        render();
        return;
      }
      const snapshotApply = event.target.closest('[data-build-snapshot-apply]');
      if (snapshotApply) {
        const entry = buildSnapshots()[Number(snapshotApply.dataset.buildSnapshotApply)];
        if (!entry) return;
        window.localStorage.setItem('d2tool.statGoals', JSON.stringify(entry.stats || {}));
        toast(`Snapshot „${entry.name}“ angewendet.`, 'success', 2200);
        render();
        return;
      }
      const snapshotDelete = event.target.closest('[data-build-snapshot-delete]');
      if (snapshotDelete) {
        const list = buildSnapshots();
        list.splice(Number(snapshotDelete.dataset.buildSnapshotDelete), 1);
        saveBuildSnapshots(list);
        render();
        return;
      }
      const buildTargetApply = event.target.closest('[data-build-target-apply]');
      if (buildTargetApply) {
        const index = Number(buildTargetApply.dataset.buildTargetApply);
        const entry = buildTargets()[index];
        if (!entry) return;
        window.localStorage.setItem('d2tool.statGoals', JSON.stringify(entry.stats || {}));
        toast(`Ziele von „${entry.name}“ geladen.`, 'success', 2200);
        render();
        return;
      }
      const buildTargetDelete = event.target.closest('[data-build-target-delete]');
      if (buildTargetDelete) {
        const index = Number(buildTargetDelete.dataset.buildTargetDelete);
        const list = buildTargets();
        list.splice(index, 1);
        saveBuildTargets(list);
        render();
        return;
      }
      const lootFocus = event.target.closest('[data-loot-source-focus]');
      if (lootFocus) {
        lootSourceSearch = String(lootFocus.dataset.lootSourceFocus || '');
        lootOwnedFilter = 'all';
        lootSourceView = 'all';
        lootSourceOnlyRed = false;
        lootSourceLimit = 24;
        render();
        host.scrollTop = 0;
        return;
      }
      const lootGoalOpen = event.target.closest('[data-loot-goal-open]');
      if (lootGoalOpen) {
        const name = String(lootGoalOpen.dataset.lootGoalOpen || '').trim();
        if (!name) return;
        toolView = 'collection';
        collectionTab = 'sources';
        lootSourceSearch = name;
        lootOwnedFilter = 'all';
        lootSourceView = 'all';
        lootSourceOnlyRed = false;
        lootSourceLimit = 24;
        render();
        if (host) host.scrollTop = 0;
        return;
      }
      const shareItem = event.target.closest('[data-loot-share-item]');
      if (shareItem) {
        const name = String(shareItem.dataset.lootShareItem || '').trim();
        const source = String(shareItem.dataset.lootShareSource || '').trim();
        const owned = allEntries().some((entry) => String((entry.item && entry.item.name) || '').toLowerCase() === name.toLowerCase());
        const red = ((lootSourcesState && Array.isArray(lootSourcesState.redBorder)) ? lootSourcesState.redBorder : [])
          .find((entry) => String(entry.name || '').toLowerCase() === name.toLowerCase());
        const progress = red && red.pattern ? ` · Red Border ${Number(red.pattern.progress) || 0}/${Number(red.pattern.completion) || 0}` : '';
        copyToClipboard(`Waffe: ${name}\nQuelle: ${source || 'unbekannt'}\nStatus: ${owned ? 'im Besitz' : 'fehlt'}${progress}`, 'Waffen-Info');
        return;
      }
      const shareSource = event.target.closest('[data-loot-share-source]');
      if (shareSource) {
        const source = String(shareSource.dataset.lootShareSource || '').trim();
        const guide = lootSourceGuide(source);
        copyToClipboard(`Quelle: ${source}\nTyp: ${guide.label}\nTipp: ${guide.tip}`, 'Quellen-Info');
        return;
      }
      const watchRuleAdd = event.target.closest('[data-watch-rule-add]');
      if (watchRuleAdd) {
        const weaponInput = host.querySelector('[data-watch-rule-weapon]');
        const perksInput = host.querySelector('[data-watch-rule-perks]');
        const weapon = String((weaponInput && weaponInput.value) || '').trim().slice(0, 60);
        const perks = String((perksInput && perksInput.value) || '').split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 4);
        if (weapon && perks.length) {
          const rules = (((getCfg().bungie && getCfg().bungie.watchRules) || [])).slice();
          rules.push({ weapon, perks });
          setConfig({ bungie: { watchRules: rules.slice(0, 20) } });
          render();
        } else {
          toast('Waffe und mindestens einen Perk angeben.', 'info', 2400);
        }
        return;
      }
      const watchRuleDel = event.target.closest('[data-watch-rule-del]');
      if (watchRuleDel) {
        const index = Number(watchRuleDel.dataset.watchRuleDel) || 0;
        const rules = (((getCfg().bungie && getCfg().bungie.watchRules) || [])).slice();
        rules.splice(index, 1);
        setConfig({ bungie: { watchRules: rules } });
        render();
        return;
      }
      const godWatch = event.target.closest('[data-god-watch]');
      if (godWatch) {
        const name = String(godWatch.dataset.godWatch || '').trim();
        if (!name) return;
        const list = (((getCfg().bungie && getCfg().bungie.watchlist) || [])).slice();
        const index = list.indexOf(name);
        if (index >= 0) list.splice(index, 1);
        else list.push(name);
        setConfig({ bungie: { watchlist: list.slice(0, 30) } });
        render();
        return;
      }
      const godWhy = event.target.closest('[data-god-why]');
      if (godWhy) {
        const key = String(godWhy.dataset.godWhy || '');
        const body = host.querySelector('[data-god-why-body="' + key + '"]');
        if (body) body.hidden = !body.hidden;
        return;
      }
      if (event.target.closest('[data-loot-more]')) {
        lootSourceLimit += 24;
        render();
        return;
      }
      if (event.target.closest('[data-mod-fav]')) {
        const hash = Number(event.target.closest('[data-mod-fav]').dataset.modFav) || 0;
        const favorites = readModFavorites();
        if (favorites.has(hash)) favorites.delete(hash);
        else favorites.add(hash);
        try { window.localStorage.setItem('d2tool.modFavorites', JSON.stringify([...favorites])); } catch (error) { /* egal */ }
        render();
        return;
      }
      const modCopy = event.target.closest('[data-mod-copy]');
      if (modCopy) {
        copyToClipboard(String(modCopy.dataset.modCopy || ''), 'Mod-Name');
        return;
      }
      const profileApply = event.target.closest('[data-profile-apply]');
      if (profileApply) {
        const id = String(profileApply.dataset.profileApply || '');
        if (!id) return;
        if (!window.confirm('Profil wechseln? Die App wird danach neu geladen.')) return;
        if (api && typeof api.profilesApply === 'function') {
          api.profilesApply(id).then(() => {
            toast('Profil gewechselt – lade neu …', 'success', 2000);
            setTimeout(() => window.location.reload(), 600);
          }).catch((error) => toast(error.message || String(error), 'error', 2400));
        }
        return;
      }
      if (event.target.closest('[data-digest-schedule-save]')) {
        const enabled = Boolean(host.querySelector('[data-digest-enabled]') && host.querySelector('[data-digest-enabled]').checked);
        const weekdayElement = host.querySelector('[data-digest-weekday]');
        const timeElement = host.querySelector('[data-digest-time]');
        const weekday = Math.max(0, Math.min(6, Number(weekdayElement && weekdayElement.value) || 0));
        const time = String((timeElement && timeElement.value) || '18:05');
        setConfig({ integrations: { digestSchedule: { enabled, weekday, time } } });
        toast(enabled ? `Digest geplant: ${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][weekday]} ${time}.` : 'Automatischer Digest aus.', 'success', 2600);
        render();
        return;
      }
      if (event.target.closest('[data-digest-image]')) {
        const text = weekSummaryText();
        const dataUrl = renderTextCard({
          title: 'Wochen-Digest',
          subtitle: 'Reset, Postfach, Ziele und Xûr auf einen Blick',
          lines: text.split('\n').slice(0, 20),
          accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff4655',
          footer: new Date().toLocaleString('de-DE')
        });
        if (dataUrl && api && typeof api.saveBuildCard === 'function') {
          api.saveBuildCard({ dataUrl, name: 'wochen-digest' })
            .then((result) => {
              if (result && result.ok) toast('Wochen-Digest als Bild gespeichert.', 'success', 2400);
              else if (!(result && result.canceled)) toast((result && result.error) || 'Speichern fehlgeschlagen.', 'error', 2600);
            })
            .catch((error) => toast(error.message || String(error), 'error', 2600));
        }
        return;
      }
      if (event.target.closest('[data-digest-copy]')) {
        copyToClipboard(weekSummaryText(), 'Digest');
        return;
      }
      if (event.target.closest('[data-digest-test]')) {
        if (api && typeof api.integrationsTestDiscord === 'function') {
          api.integrationsTestDiscord(weekSummaryText().slice(0, 1800)).then((result) => {
            toast(result && result.ok ? 'Discord-Testnachricht gesendet.' : 'Discord-Test fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2600);
          }).catch((error) => toast(error.message || String(error), 'error', 2600));
        }
        return;
      }
      if (event.target.closest('[data-digest-send]')) {
        if (api && typeof api.integrationsWeeklyDigest === 'function') {
          api.integrationsWeeklyDigest().then((result) => {
            toast(result && result.ok ? 'Digest gesendet.' : 'Digest fehlgeschlagen.', result && result.ok ? 'success' : 'error', 2600);
          }).catch((error) => toast(error.message || String(error), 'error', 2600));
        }
        return;
      }
      {
        if (event.target.closest('[data-transfer-cancel]')) {
        const id = String(event.target.closest('[data-transfer-cancel]').dataset.transferCancel || '');
        if (api && typeof api.bungieCancelJob === 'function') {
          api.bungieCancelJob(id).then((result) => {
            toast(result && result.ok ? 'Transfer-Job abgebrochen.' : (result && result.error) || 'Abbruch fehlgeschlagen.', result && result.ok ? 'info' : 'error', 2000);
            transferJobsState = null;
            render();
          }).catch(() => toast('Abbruch fehlgeschlagen.', 'error'));
        }
        return;
      }
      if (event.target.closest('[data-transfer-retry]')) {
        const id = String(event.target.closest('[data-transfer-retry]').dataset.transferRetry || '');
        if (api && typeof api.bungieRetryJob === 'function') {
          api.bungieRetryJob(id).then(() => {
            toast('Transfer-Job wird wiederholt.', 'info', 1800);
            transferJobsState = null;
            setTimeout(() => render(), 600);
          }).catch(() => toast('Wiederholen fehlgeschlagen.', 'error'));
        }
        return;
      }
      if (event.target.closest('[data-transfer-refresh]')) {
        transferJobsState = null;
        render();
        return;
      }
      if (event.target.closest('[data-notif-rule-add]')) {
        const input = host.querySelector('[data-notif-rule-input]');
        const mode = host.querySelector('[data-notif-rule-mode]');
        const text = String((input && input.value) || '').trim().slice(0, 80);
        if (!text) return;
        const rules = ((getCfg().notifications && getCfg().notifications.rules) || []).slice();
        rules.push({ id: 'r-' + Date.now().toString(36), text, mode: mode && mode.value === 'hide' ? 'hide' : 'show' });
        setConfig({ notifications: { rules: rules.slice(-20) } });
        toast('Benachrichtigungsregel gespeichert.', 'success', 1800);
        render();
        return;
      }
      if (event.target.closest('[data-notif-rule-del]')) {
        const index = Number(event.target.closest('[data-notif-rule-del]').dataset.notifRuleDel) || 0;
        const rules = ((getCfg().notifications && getCfg().notifications.rules) || []).slice();
        rules.splice(index, 1);
        setConfig({ notifications: { rules } });
        render();
        return;
      }
      const queueRemove = event.target.closest('[data-queue-remove-index]');
      if (queueRemove) {
        const index = Number(queueRemove.dataset.queueRemoveIndex) || 0;
        const queue = readActionQueue();
        queue.splice(index, 1);
        try { window.localStorage.setItem('d2tool.actionQueue', JSON.stringify(queue)); } catch (error) { /* egal */ }
        render();
        return;
      }
      if (event.target.closest('[data-queue-retry-index]')) {
        window.dispatchEvent(new CustomEvent('d2-run-queue'));
        toast('Aktion wird erneut versucht …', 'info', 1800);
        setTimeout(() => render(), 1200);
        return;
      }
      if (event.target.closest('[data-queue-run]')) {
        window.dispatchEvent(new CustomEvent('d2-run-queue'));
        toast('Warteschlange wird abgearbeitet …', 'info', 2000);
        setTimeout(() => render(), 1200);
        return;
      }
      if (event.target.closest('[data-queue-clear]')) {
        if (!window.confirm('Offline-Warteschlange leeren?')) return;
        try { window.localStorage.removeItem('d2tool.actionQueue'); } catch (error) { /* egal */ }
        render();
        return;
      }
      const lootRed = event.target.closest('[data-loot-red]');
      if (lootRed) {
        lootSourceOnlyRed = lootRed.checked === true;
        lootSourceLimit = 24;
        render();
        return;
      }
      const lootOwned = event.target.closest('[data-loot-owned]');
      if (lootOwned) {
        lootOwnedFilter = ['all', 'missing', 'owned'].includes(lootOwned.value) ? lootOwned.value : 'all';
        render();
        return;
      }
      const lootSort = event.target.closest('[data-loot-sort]');
      if (lootSort) {
        lootSourceSort = ['default', 'missing', 'red', 'completion'].includes(lootSort.value) ? lootSort.value : 'default';
        render();
        return;
      }
      const lootRoute = event.target.closest('[data-loot-route]');
      if (lootRoute) {
        const source = String(lootRoute.dataset.lootRoute || '').trim();
        if (!source) return;
        const guide = lootSourceGuide(source);
        const steps = [
          `Aktivität starten: ${guide.label}`,
          `${guide.tip}`.slice(0, 80),
          'Beute prüfen und Red Border sichern'
        ];
        const existing = ((getCfg().checklist && getCfg().checklist.items) || []).slice();
        let added = 0;
        for (const step of steps) {
          const text = `${source}: ${step}`.slice(0, 80);
          if (existing.some((item) => item.text === text)) continue;
          existing.push({ id: 'c-' + Date.now().toString(36) + '-' + added, text, done: false, group: 'own', char: weekCharFilter || '' });
          added += 1;
        }
        if (added) {
          setConfig({ checklist: { items: existing } });
          toast(`${added} Farmroute-Punkte zur Woche hinzugefügt.`, 'success', 2600);
        } else {
          toast('Farmroute ist bereits in der Woche.', 'info', 2200);
        }
        render();
        return;
      }
      if (event.target.closest('[data-lint-activity]')) {
        lintActivity = String(event.target.value || 'gm');
        render();
        return;
      }
      if (event.target.closest('[data-gap-target]')) {
        gapTargetIndex = Math.max(0, Math.round(Number(event.target.value) || 0));
        render();
        return;
      }
      if (event.target.closest('[data-gap-loadout]')) {
        gapLoadoutId = String(event.target.value || '');
        render();
        return;
      }
      const encounter = event.target.closest('[data-encounter-check]');      if (encounter) {
        const week = nextWeekResetDate();
        const key = `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`;
        const all = { ...(((getCfg().bungie && getCfg().bungie.encounterTracker) || {})) };
        all[key] = (Array.isArray(all[key]) ? all[key] : []).map((entry) =>
          entry.id === encounter.dataset.encounterCheck ? { ...entry, done: encounter.checked === true } : entry
        );
        setConfig({ bungie: { encounterTracker: all } });
        render();
        return;
      }
      const chest = event.target.closest('[data-secret-chest]');
      if (chest) {
        const [characterId, weekKey] = String(chest.dataset.secretChest || '').split(':');
        const all = { ...(((getCfg().bungie && getCfg().bungie.secretChests) || {})) };
        all[weekKey] = { ...(all[weekKey] || {}), [characterId]: chest.checked === true };
        setConfig({ bungie: { secretChests: all } });
        render();
        return;
      }
      const compare = event.target.closest('[data-build-compare]');
      if (compare) {
        if (compare.dataset.buildCompare === 'a') compareA = String(compare.value || '');
        else compareB = String(compare.value || '');
        render();
        return;
      }
      if (event.target.closest('[data-material-goal]')) {
        const input = event.target.closest('[data-material-goal]');
        const goals = { ...(((getCfg().bungie && getCfg().bungie.materialGoals) || {})) };
        const key = String(input.dataset.materialGoal || '');
        const value = Math.max(0, Math.round(Number(input.value) || 0));
        if (key && value) goals[key] = value;
        else if (key) delete goals[key];
        setConfig({ bungie: { materialGoals: goals } });
        render();
        return;
      }
      const check = event.target.closest('[data-tool-check]');
      if (check) { toggleChecklist(check.dataset.toolCheck, check.checked); return; }
      if (event.target.closest('[data-opt-char]')) {
        optimizerCharId = String(event.target.value || '');
        render();
        return;
      }
      if (event.target.closest('[data-opt-target1]')) {
        optimizerTarget1 = Number(event.target.value) || optimizerTarget1;
        render();
        return;
      }
      if (event.target.closest('[data-opt-target2]')) {
        optimizerTarget2 = Number(event.target.value) || optimizerTarget2;
        render();
        return;
      }
      if (event.target.closest('[data-opt-target1-value]')) {
        optimizerTarget1Value = Math.max(0, Math.min(200, Math.round(Number(event.target.value) || 0)));
        render();
        return;
      }
      if (event.target.closest('[data-opt-target2-value]')) {
        optimizerTarget2Value = Math.max(0, Math.min(200, Math.round(Number(event.target.value) || 0)));
        render();
        return;
      }
      if (event.target.closest('[data-opt-prefer-sets]')) {
        optimizerPreferSets = event.target.checked === true;
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-rule-role]')) {
        wishRuleRole = String(event.target.value || 'all');
        render();
        return;
      }
      if (event.target.closest('[data-tool-ingame-link]')) {
        const select = event.target.closest('[data-tool-ingame-link]');
        const id = String(select.dataset.toolIngameLink || '');
        const slot = Math.max(0, Math.min(10, Number(select.value) || 0));
        const loadouts = ((getCfg().bungie && getCfg().bungie.loadouts) || []).map((loadout) =>
          loadout.id === id
            ? { ...loadout, ingameIndex: slot, ingameCharacterId: slot ? loadout.characterId : '' }
            : loadout
        );
        setConfig({ bungie: { loadouts } });
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-weapon]')) {
        wishDraft.hash = Number(event.target.value) || 0;
        wishDraft.perks = [];
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-role]')) {
        wishDraft.role = String(event.target.value || 'any');
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-min-match]')) {
        setConfig({ bungie: { wishlistMinMatch: Math.max(1, Math.min(4, Number(event.target.value) || 4)) } });
        render();
        return;
      }
      if (event.target.closest('[data-wishlist-perk]')) {
        const notesInput = host.querySelector('[data-wishlist-notes]');
        if (notesInput) wishDraft.notes = String(notesInput.value || '');
        const hash = Number(event.target.closest('[data-wishlist-perk]').dataset.wishlistPerk) || 0;
        const index = wishDraft.perks.indexOf(hash);
        if (index >= 0) wishDraft.perks.splice(index, 1);
        else wishDraft.perks.push(hash);
        render();
      }
      }
    });
    host.addEventListener('input', (event) => {
      const weekSearchInput = event.target.closest('[data-week-search]');
      if (weekSearchInput) {
        weekCheckSearch = String(weekSearchInput.value || '');
        const caret = weekSearchInput.selectionStart;
        render();
        const next = host.querySelector('[data-week-search]');
        if (next) {
          next.focus();
          try { next.setSelectionRange(caret, caret); } catch (error) { /* egal */ }
        }
        return;
      }
      const lootSearchInput = event.target.closest('[data-loot-search]');
      if (lootSearchInput) {
        lootSourceSearch = String(lootSearchInput.value || '');
        const caret = lootSearchInput.selectionStart;
        render();
        const next = host.querySelector('[data-loot-search]');
        if (next) {
          next.focus();
          try { next.setSelectionRange(caret, caret); } catch (error) { /* egal */ }
        }
        return;
      }
      const cardSearchInput = event.target.closest('[data-tool-card-search]');
      if (cardSearchInput) {
        cardSearch = String(cardSearchInput.value || '');
        const caret = cardSearchInput.selectionStart;
        render();
        const next = host.querySelector('[data-tool-card-search]');
        if (next) { next.focus(); try { next.setSelectionRange(caret, caret); } catch (error) { /* egal */ } }
        return;
      }
      const clanInput = event.target.closest('[data-tool-clan-filter]');
      if (clanInput) {
        clanFilter = String(clanInput.value || '');
        const caret = clanInput.selectionStart;
        render();
        const next = host.querySelector('[data-tool-clan-filter]');
        if (next) {
          next.focus();
          try { next.setSelectionRange(caret, caret); } catch (error) { /* egal */ }
        }
        return;
      }
      const filter = event.target.closest('[data-tool-craft-filter]');
      if (filter) {
        craftFilter = String(filter.value || '');
        const caret = filter.selectionStart;
        render();
        const next = host.querySelector('[data-tool-craft-filter]');
        if (next) {
          next.focus();
          try { next.setSelectionRange(caret, caret); } catch (error) { /* egal */ }
        }
      }
    });
    host.addEventListener('mouseover', (event) => {
      const pickerTarget = event.target.closest('[data-picker-tip]');
      if (pickerTarget) showPickerTip(pickerTarget.dataset.pickerTip, event, pickerTarget);
    });
    host.addEventListener('mouseout', (event) => {
      const pickerTarget = event.target.closest('[data-picker-tip]');
      if (!pickerTarget) return;
      if (event.relatedTarget && pickerTarget.contains(event.relatedTarget)) return;
      hidePickerTip();
    });
    host.addEventListener('scroll', hidePickerTip, true);
    // TV-Modus: Details auch per Fokus (D-Pad/Controller), nicht nur Hover.
    host.addEventListener('focusin', (event) => {
      const pickerTarget = event.target.closest('[data-picker-tip]');
      if (pickerTarget) {
        showPickerTip(pickerTarget.dataset.pickerTip, null, pickerTarget);
        return;
      }
      if (!(window.isTvMode && window.isTvMode())) return;
      const focusVc = event.target.closest('[data-vc-item]');
      if (focusVc) {
        const entry = vcFindItem(String(focusVc.dataset.vcItem || ''));
        if (entry) {
          const rect = focusVc.getBoundingClientRect();
          vcShowTip(entry, rect.right, rect.bottom);
        }
      }
    });
    host.addEventListener('focusout', () => {
      hidePickerTip();
      vcHideTip();
    });
    host.addEventListener('mouseover', (event) => {
      const vcTarget = event.target.closest('[data-vc-item]');
      if (vcTarget) {
        const entry = vcFindItem(String(vcTarget.dataset.vcItem || ''));
        if (entry) vcShowTip(entry, event.clientX, event.clientY);
        return;
      }
      const row = event.target.closest('[data-xur-tip]');
      if (row) showXurTip(row.dataset.xurTip, event, row);
    });
    host.addEventListener('mouseout', (event) => {
      if (event.target.closest('[data-vc-item]')) { vcHideTip(); return; }
      const row = event.target.closest('[data-xur-tip]');
      if (!row) return;
      const to = event.relatedTarget;
      if (to && row.contains(to)) return;
      hideXurTip();
    });
    host.addEventListener('focusin', (event) => {
      const vcTarget = event.target.closest('[data-vc-item]');
      if (vcTarget) {
        const entry = vcFindItem(String(vcTarget.dataset.vcItem || ''));
        const rect = vcTarget.getBoundingClientRect();
        if (entry) vcShowTip(entry, rect.left + rect.width / 2, rect.top + 20);
        return;
      }
      const row = event.target.closest('[data-xur-tip]');
      if (row) showXurTip(row.dataset.xurTip, event, row);
    });
    host.addEventListener('focusout', (event) => {
      if (event.target.closest('[data-vc-item]')) vcHideTip();
      if (event.target.closest('[data-xur-tip]')) hideXurTip();
    });
    host.addEventListener('scroll', (event) => {
      if (event.target.closest && event.target.closest('[data-vc-item]')) vcHideTip();
      hideXurTip();
    }, true);
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.closest('[data-tool-check-input]')) {
        event.preventDefault();
        addChecklistItem();
      }
    });
  }

  window.addEventListener('d2-tools-cycle', (event) => {
    const order = ['overview', 'builds', 'collection', 'week', 'vendor'];
    const delta = Number(event && event.detail && event.detail.direction) || 1;
    const index = order.indexOf(toolView);
    toolView = order[(index + delta + order.length) % order.length];
    if (host && !host.classList.contains('hidden')) render();
  });

  window.addEventListener('d2-tools-view', (event) => {
    const view = String((event && event.detail && event.detail.view) || '');
    if (!['overview', 'builds', 'collection', 'week', 'vendor'].includes(view)) return;
    toolView = view;
    if (host && !host.classList.contains('hidden')) render();
  });

  window.addEventListener('d2-tools-search', (event) => {
    const detail = (event && event.detail) || {};
    const view = ['overview', 'builds', 'collection', 'week', 'vendor'].includes(detail.view) ? detail.view : 'collection';
    toolView = view;
    if (detail.collection && ['overview', 'crafting', 'cleanup', 'sources'].includes(detail.collection)) {
      collectionTab = detail.collection;
    }
    lootSourceSearch = String(detail.search || '');
    lootOwnedFilter = 'all';
    lootSourceView = 'all';
    lootSourceOnlyRed = false;
    if (host && !host.classList.contains('hidden')) {
      render();
      host.scrollTop = 0;
    }
  });

  // Deep-Link/geteiltes Angebot: Händler-Tab öffnen und Detaildialog
  // für das übergebene Angebot anzeigen.
  // Detailnavigation aus der lokalen API/Stream Deck: Unterseite und
  // Filter direkt nach dem Laden setzen.
  window.addEventListener('d2-tools-detail', (event) => {
    const detail = (event && event.detail) || {};
    if (detail.vendorHash) {
      toolView = 'vendor';
      if (host && !host.classList.contains('hidden')) render();
      setTimeout(() => openVendorOfferDetailByHash(detail.vendorHash, detail.itemHash, detail.vendorName || ''), 180);
      return;
    }
    if (detail.collectionTab) {
      toolView = 'collection';
      collectionTab = ['overview', 'crafting', 'cleanup', 'sources'].includes(detail.collectionTab) ? detail.collectionTab : 'overview';
      if (host && !host.classList.contains('hidden')) render();
      return;
    }
    if (detail.weekFilter) {
      toolView = 'week';
      weekCheckView = ['all', 'must', 'rec', 'opt', 'own'].includes(detail.weekFilter) ? detail.weekFilter : 'all';
      if (host && !host.classList.contains('hidden')) render();
      return;
    }
    if (detail.vendorWishlist != null) {
      toolView = 'vendor';
      vendorWishOnly = detail.vendorWishlist === true;
      if (host && !host.classList.contains('hidden')) render();
      return;
    }
    if (detail.pickerClass != null) {
      toolView = 'builds';
      if ([0, 1, 2].includes(Number(detail.pickerClass))) {
        pickerClass = Number(detail.pickerClass);
        pickerLocks = {};
        pickerExotic = '';
      }
      if (host && !host.classList.contains('hidden')) {
        render();
        setTimeout(() => findArmorSets(), 120);
      }
    }
  });

  window.addEventListener('d2-vendor-open', (event) => {
    const detail = (event && event.detail) || {};
    if (!detail.vendorHash) return;
    toolView = 'vendor';
    if (host && !host.classList.contains('hidden')) render();
    setTimeout(() => {
      openVendorOfferDetailByHash(detail.vendorHash, detail.itemHash, detail.vendorName || '');
    }, 160);
  });

  window.addEventListener('d2-picker-setup', (event) => {
    const detail = (event && event.detail) || {};
    applyPickerSetup(detail);
    toolView = 'builds';
    if (host && !host.classList.contains('hidden')) {
      render();
      setTimeout(() => findArmorSets(), 80);
    }
  });

  window.addEventListener('d2-help', () => openHelpCenter(''));

  // Wöchentlicher Aufräum-Vorschlag: Hinweis mit direktem Sprung in
  // den Trockenlauf (nichts wird gelöscht).
  if (api && typeof api.onCleanupDue === 'function') {
    api.onCleanupDue(() => {
      toast('Aufräum-Vorschlag ist fällig – Bericht ansehen?', 'info', 15000, true, [
        {
          label: 'Bericht öffnen',
          run: () => {
            try {
              if (ctx && typeof ctx.openTab === 'function') ctx.openTab('tools');
              switchToolView('collection');
              collectionTab = 'cleanup';
              render();
              setTimeout(() => {
                const start = host && host.querySelector('[data-vc-start]');
                if (start) start.click();
              }, 250);
            } catch (error) {
              // egal
            }
          }
        }
      ]);
    });
  }

  return {
    mount(element) {
      host = element;
      bind();
      startQueueWatch();
      loadQueueState();
      if (!host.classList.contains('hidden')) render();
    },
    setData(inventory) {
      data = inventory;
      if (data) noteSession(data);
      const activity = latestActivity();
      const activityKey = activity ? `${activity.name || ''}|${activity.startedAt || ''}|${activity.owner || ''}` : '';
      if (activityKey && lastActivityKey && activityKey !== lastActivityKey && autoRecapEnabled()) {
        toast('Neue Aktivität erkannt – Session-Recap und Ziele sind aktualisiert.', 'info', 3200);
      }
      if (activityKey && lastActivityKey && activityKey !== lastActivityKey && activity) advanceAutoGoals(activity);
      if (activityKey) lastActivityKey = activityKey;
      syncStatsHud();
      if (data) prewarmPicker();
      // Nur rendern, wenn die Werkzeuge sichtbar sind – die Karten
      // kosten bei großen Tresoren spürbar Zeit.
      if (host && !host.classList.contains('hidden')) render();
    },
    render,
    // Inhalte für die globale Suche (Triumphs, Quellen).
    searchContent(query) {
      const needle = String(query || '').trim().toLowerCase();
      if (needle.length < 2) return [];
      const out = [];
      try {
        const roots = (triumphsState && Array.isArray(triumphsState.roots)) ? triumphsState.roots : [];
        for (const record of flattenRecords(roots)) {
          if (out.length >= 4) break;
          const name = String((record && record.name) || '');
          if (!name || !name.toLowerCase().includes(needle)) continue;
          out.push({
            label: 'Triumph: ' + name,
            hint: String((record && record.root) || ''),
            run: () => {
              if (ctx && typeof ctx.openTab === 'function') ctx.openTab('tools');
              switchToolView('collection');
              collectionTab = 'overview';
              render();
              setTimeout(() => {
                const el = host && host.querySelector('[data-record-open="' + record.hash + '"]');
                if (el) el.click();
              }, 240);
            }
          });
        }
        const groups = (lootSourcesState && Array.isArray(lootSourcesState.groups)) ? lootSourcesState.groups : [];
        for (const group of groups) {
          if (out.length >= 8) break;
          const name = String((group && (group.name || group.title || group.source)) || '');
          if (!name || !name.toLowerCase().includes(needle)) continue;
          out.push({
            label: 'Quelle: ' + name,
            hint: 'Quellen-Seite',
            run: () => {
              if (ctx && typeof ctx.openTab === 'function') ctx.openTab('tools');
              switchToolView('collection');
              collectionTab = 'sources';
              lootSourceSearch = name;
              render();
            }
          });
        }
      } catch (error) {
        // Suche darf die Palette nicht blockieren.
      }
      return out;
    },
    setView(view) {
      if (TOOL_VIEWS.some((entry) => entry.key === view)) switchToolView(view);
    },
    newCount,
    isHighestInBucket,
    sessionLoot: () => sessionLoot.slice()
  };
}
