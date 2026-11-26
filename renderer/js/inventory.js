// ============================================================
// Inventar & Loadouts — komplett neu gebaut nach DIM-Source
// ============================================================
// Layout und Farben 1:1 aus DIM (ItemIcon.m.scss, InventoryItem.m.scss,
// StoreBucket.m.scss, StoreBuckets.m.scss, _variables.scss).
// Alle Datenfunktionen über die Bungie-API (Komponenten 100,102,200,
// 201,205,300,304,305).

import { qs, toast, escapeHtml, positionFixedTip } from './ui.js';
import { championTypes, championSource, championOverride, setChampionOverride, CHAMPION_NAMES, CHAMPION_SHORT, CHAMPION_COLORS } from './champions.js';
import { loadoutSearchText, pinLoadout, toggleLoadoutTag } from './loadouts/model.js';
import { record as recordJournal, undo as journalUndo, redo as journalRedo, canUndo as journalCanUndo, canRedo as journalCanRedo } from './journal.js';
import { renderBuildCard } from './build-card.js';

// ---------- DIM-Konstanten (1:1 aus _variables.scss / ItemIcon.m.scss) ----------
const DIM = {
  ITEM_SIZE: 48,
  GAP: 4,
  TILE_GAP: 2,
  RARITY_BG: { 0: '#366f42', 1: '#366f42', 2: '#c3bcb4', 3: '#366f42', 4: '#5076a3', 5: '#522f65', 6: '#ceae33' },
  RARITY_NAME: { 2: 'Standard', 3: 'Gewöhnlich', 4: 'Selten', 5: 'Legendär', 6: 'Exotisch' },
  WISHLIST_GREEN: '#29f36a',
  CLASS_NAMES: ['Titan', 'Jäger', 'Warlock'],
  RACE_NAMES: ['Mensch', 'Awoken', 'Exo'],
  // Die 6 Charakter-Stats (Armor 3.0), Reihenfolge wie im Spiel/DIM:
  // Gesundheit, Nahkampf, Granate, Super, Klasse, Waffen. Charakterwerte
  // 0–200 (DIM: MAX_STAT), Rüstungsteile 0–45 (DIM: scaledStats.maximumValue).
  CHAR_STAT_HASHES: [392767087, 4244567218, 1735777505, 144602215, 1943323491, 2996146975],
  GLIMMER_HASH: 3155914962,
  SHARD_HASH: 1022552290,
  STAT_LABELS: {
    392767087: 'Gesundheit',
    4244567218: 'Nahkampf',
    1735777505: 'Granate',
    144602215: 'Super',
    1943323491: 'Klasse',
    2996146975: 'Waffen'
  },
  B: {
    KINETIC: 1498876634, ENERGY: 2465295065, POWER: 953998645,
    GHOST: 4023194814, SUBCLASS: 3284755031,
    HELMET: 3448274439, GAUNTLETS: 3551918588, CHEST: 14239492, LEGS: 20886954, CLASS: 1585787867,
    ARTIFACT: 1506418338, EMBLEMS: 4274335291, FINISHERS: 3683254069, EMOTES: 1107761855,
    SPARROWS: 2025709351, SHIPS: 284967655, MODS: 3313201758, CONSUMABLES: 1469714392,
    MATERIALS: 3865314626, VAULT: 138197802, POSTMASTER: 215593132
  },
  WEAPON_SLOTS: [
    { key: 1498876634, label: 'Kinetic' },
    { key: 2465295065, label: 'Energie' },
    { key: 953998645, label: 'Power' }
  ],
  ARMOR_SLOTS: [
    { key: 3448274439, label: 'Helm' },
    { key: 3551918588, label: 'Arme' },
    { key: 14239492, label: 'Brust' },
    { key: 20886954, label: 'Beine' },
    { key: 1585787867, label: 'Klassen-Item' }
  ],
  EXTRA: [
    { key: 4274335291, label: 'Embleme' },
    { key: 3683254069, label: 'Finisher' },
    { key: 1107761855, label: 'Emotes' },
    { key: 2025709351, label: 'Sparrows' },
    { key: 284967655, label: 'Schiffe' },
    { key: 3313201758, label: 'Mods' },
    { key: 1469714392, label: 'Verbrauchsmaterial' },
    { key: 687325600, label: 'Accessoires' }
  ],
  KNOWN: new Set([
    1498876634, 2465295065, 953998645, 4023194814, 3284755031,
    3448274439, 3551918588, 14239492, 20886954, 1585787867,
    1506418338, 4274335291, 3683254069, 1107761855, 2025709351, 284967655,
    3313201758, 1469714392, 3865314626, 138197802, 215593132
  ])
};

// ---------- CSS (einmalig injiziert, alle Regeln mit !important) ----------
const INVENTORY_CSS = `
#inventoryView { position: absolute; inset: 0; z-index: 40; background: #0b1018; display: flex; flex-direction: column; overflow: hidden; --dinv-tile-h: 79px; }
#inventoryView.hidden { display: none; }
.inventory-view-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 12px 4px; flex-shrink: 0; border-bottom: 1px solid #1a2230; }
.inventory-view-head > div:first-child { min-width: 0; }
.inventory-view-head h2 { margin: 0; font-size: 14px; line-height: 1.15; font-weight: 700; color: #e8ecf2; }
.inventory-view-sub { margin: 1px 0 0; font-size: 10.5px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inventory-view-head .inventory-head-controls { display: flex; gap: 5px; align-items: center; }
.inventory-view-head .inventory-head-controls .btn { height: 26px; padding: 0 8px; font-size: 11px; }
.inventory-view-head .inventory-head-controls .icon-btn { width: 26px; height: 26px; }
.inventory-status { padding: 4px 14px; font-size: 11px; flex-shrink: 0; }
.inventory-status .ok { color: #29f36a; }
.inventory-status .warn { color: #f0c66b; }
.inventory-legend { display: flex; flex-wrap: wrap; gap: 2px 14px; padding: 0 14px 6px; color: #7a8494; font-size: 10.5px; flex-shrink: 0; }
.inventory-legend b { color: #f3c66a; }
.inventory-toolbar { display: flex; gap: 8px; padding: 6px 14px; flex-shrink: 0; align-items: center; }
.inventory-toolbar input[type=search] { flex: 2 1 200px; height: 28px; font-size: 12px; padding: 0 8px; border-radius: 5px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; }
.inventory-toolbar input[type=text] { flex: 0 0 150px; height: 28px; font-size: 12px; padding: 0 8px; border-radius: 5px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; }
.inventory-toolbar select.control { flex: 0 0 128px !important; width: 128px !important; height: 28px !important; font-size: 12px; padding: 0 6px; border-radius: 5px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; }
.inventory-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto; overflow-anchor: none; padding: 8px 14px; }
.inventory-result { margin: 8px 14px 0; padding: 6px 10px; border: 1px solid #2a3548; border-radius: 6px; max-height: 180px; overflow-y: auto; font-size: 11px; flex-shrink: 0; }
.inventory-result .r-ok { color: #29f36a; }
.inventory-result .r-err { color: #ff6b6b; }
.loadout-queue-bar { display: flex; align-items: center; gap: 8px; margin: 6px 14px 0; padding: 5px 10px; border: 1px solid var(--brand); border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--text); font-size: 11.5px; flex-shrink: 0; }
.loadout-queue-bar > span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loadout-queue-bar.hidden { display: none !important; }
.loadout-queue-panel { position: absolute; right: 18px; bottom: 96px; z-index: 41; width: 430px; max-width: calc(100% - 36px); max-height: 58vh; overflow: auto; padding: 10px; border: 1px solid var(--brand); border-radius: 8px; background: rgba(12,18,28,0.98); box-shadow: 0 16px 36px rgba(0,0,0,0.55); }
.loadout-queue-panel.hidden { display: none !important; }
.loadout-queue-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--brand); }
.loadout-queue-toolbar { display: flex; gap: 6px; margin: 7px 0; }
.loadout-queue-list { display: flex; flex-direction: column; gap: 5px; }
.loadout-queue-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border: 1px solid #2a3548; border-radius: 6px; background: rgba(255,255,255,0.03); }
.loadout-queue-copy { flex: 1 1 auto; min-width: 0; }
.loadout-queue-copy strong { display: block; font-size: 11.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loadout-queue-copy small { display: block; font-size: 10px; color: #9aa6b6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loadout-queue-state { font-size: 9.5px; letter-spacing: 0.4px; text-transform: uppercase; }
.loadout-queue-state.pending { color: #9aa6b6; }
.loadout-queue-state.running { color: #f3c66a; }
.loadout-queue-state.done { color: #29f36a; }
.loadout-queue-state.failed { color: #ff6b6b; }
.loadout-queue-row .outbox-move { width: 22px; height: 22px; border: 1px solid #2a3548; border-radius: 5px; background: rgba(255,255,255,0.05); color: var(--text); cursor: pointer; font-size: 11px; }
.loadout-queue-row .outbox-move:disabled { opacity: 0.35; cursor: default; }
.inventory-outbox { display: flex; align-items: center; gap: 8px; margin: 6px 14px 0; padding: 4px 10px; border: 1px solid #f3c66a; border-radius: 6px; background: rgba(243,198,106,0.10); color: #f3c66a; font-size: 11.5px; flex-shrink: 0; }
.inventory-outbox.hidden { display: none !important; }
.inventory-outbox-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inventory-outbox .btn { color: #f3c66a; border-color: rgba(243,198,106,0.5); }
.inventory-outbox-panel { position: absolute; right: 18px; bottom: 96px; z-index: 40; width: 420px; max-width: calc(100% - 36px); max-height: 55vh; overflow: auto; padding: 10px; border: 1px solid #f3c66a; border-radius: 8px; background: rgba(12,18,28,0.98); box-shadow: 0 16px 36px rgba(0,0,0,0.55); }
.inventory-outbox-panel.hidden { display: none !important; }
.inventory-outbox-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; font-size: 12px; color: #f3c66a; }
.inventory-outbox-list { display: flex; flex-direction: column; gap: 5px; }
.inventory-outbox-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border: 1px solid #2a3548; border-radius: 6px; background: rgba(255,255,255,0.03); }
.inventory-outbox-copy { flex: 1 1 auto; min-width: 0; }
.inventory-outbox-copy strong { display: block; font-size: 11.5px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inventory-outbox-copy small { display: block; font-size: 10px; color: #9aa6b6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inventory-outbox-row .outbox-move { width: 22px; height: 22px; border: 1px solid #2a3548; border-radius: 5px; background: rgba(255,255,255,0.05); color: var(--text); cursor: pointer; font-size: 11px; }
.inventory-outbox-row .outbox-move:disabled { opacity: 0.35; cursor: default; }
.inventory-outbox-foot { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
.champion-audit { position: absolute; right: 18px; bottom: 96px; z-index: 42; width: 460px; max-width: calc(100% - 36px); max-height: 62vh; overflow: auto; padding: 10px; border: 1px solid var(--brand); border-radius: 8px; background: rgba(12,18,28,0.98); box-shadow: 0 16px 36px rgba(0,0,0,0.55); }
.champion-audit.hidden { display: none !important; }
.champion-audit-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--brand); }
.champion-audit-hint { margin: 5px 0 7px; font-size: 10.5px; line-height: 1.35; color: #9aa6b6; }
.champion-audit-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.champion-audit-toolbar select { height: 26px; }
.champion-audit-check { display: flex; align-items: center; gap: 4px; font-size: 10.5px; color: #9aa6b6; }
.champion-audit-list { display: flex; flex-direction: column; gap: 4px; }
.champion-audit-row { display: flex; align-items: center; gap: 6px; padding: 4px 5px; border: 1px solid #2a3548; border-radius: 5px; background: rgba(255,255,255,0.03); font-size: 11px; }
.champion-audit-row img { width: 22px; height: 22px; border-radius: 4px; object-fit: cover; background: rgba(0,0,0,0.35); }
.champion-audit-row .champion-audit-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.champion-audit-row small { color: #9aa6b6; font-size: 9.5px; white-space: nowrap; }
.champion-audit-foot { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.champion-audit-count { margin-left: auto; font-size: 10px; color: #9aa6b6; }
.inventory-loadout-list { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 14px 0; flex-shrink: 0; max-height: 100px; overflow-y: auto; }
.inv-loadout { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid #2a3548; border-radius: 5px; font-size: 11px; }
.inv-loadout-name { font-weight: 600; color: #e8ecf2; }
.inv-loadout-meta { color: #7a8494; font-size: 10px; }
/* ---- DIM-Account-Grid: 4 Spalten (3 Hüter + Tresor) ---- */
.dinv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; align-items: start; }
.dinv-char { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.dinv-char-head { position: sticky; top: 0; z-index: 22; display: flex; align-items: center; gap: 8px; height: 52px; border: 1px solid #232b3a; border-radius: 6px; background: #12161f; overflow: hidden; margin-bottom: 4px; padding: 0 10px; box-sizing: border-box; }
.inventory-top-btn { position: absolute; right: 18px; bottom: 48px; z-index: 35; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--brand); background: rgba(12,18,28,0.94); color: var(--text); font-size: 18px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.45); }
.inventory-top-btn:hover { background: var(--brand); color: var(--accent-contrast); }
.dinv-char-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.42; filter: saturate(0.8); }
.dinv-char-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8,12,20,0.92) 0%, rgba(8,12,20,0.5) 48%, rgba(8,12,20,0.1) 100%); }
.dinv-char-emblem { position: relative; z-index: 2; width: 36px !important; height: 36px !important; border-radius: 4px; background-size: auto 100% !important; background-position: left center !important; background-repeat: no-repeat !important; box-shadow: 0 0 0 1px rgba(255,255,255,0.14); flex-shrink: 0; }
.dinv-char-info { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 0; flex: 1; min-width: 0; }
.dinv-char-name { font-size: 14px !important; font-weight: 700; color: #f2f5fa; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dinv-char-race { font-size: 10px; color: #b6bfcf; font-style: italic; }
.dinv-char-power { position: relative; z-index: 2; font-size: 13.5px; font-weight: 700; color: #f5d76a; text-shadow: 0 1px 3px rgba(0,0,0,0.95); flex-shrink: 0; }
.dinv-char-stats { display: flex; align-items: flex-end; justify-content: space-between; gap: 3px; margin: 0 2px 5px; }
.dinv-char-stat { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0; font-size: 10px; color: #cfd7e3; }
.dinv-char-stat-top { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.dinv-char-stat img { width: 13px !important; height: 13px !important; filter: brightness(1.7) drop-shadow(0 0 1px rgba(0,0,0,0.8)); }
.dinv-char-stat .dinv-char-meter { width: 32px; height: 4px; border-radius: 2px; }
/* ---- Poststelle nach DIM: 9 Slots + Einsammeln-Button ---- */
.dinv-pm-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.dinv-pm-slot, .dinv-eq-slot { width: 56px !important; height: 56px !important; border: 1px solid #1e2735; border-radius: 4px; background: rgba(255,255,255,0.025); box-sizing: border-box; flex-shrink: 0; }
.dinv-pm-pull { display: inline-flex; align-items: center; gap: 5px; margin: 2px 0 6px; padding: 3px 10px; border: 1px solid #43322e; border-radius: 5px; background: rgba(120,40,30,0.25); color: #ffb3a5; font-size: 10.5px; cursor: pointer; }
.dinv-pm-pull:hover { border-color: #b3402f; background: rgba(179,64,47,0.28); }
.dinv-pm-pull .mail { color: #ff6f5e; font-size: 12px; }
/* FAST VOLL (DIM: postmasterFull) - rote Warnung ab 15/21 Items */
.dinv-cell.dinv-pm-warn { border-radius: 6px; }
.dinv-cell.dinv-pm-warn .dinv-pm-row { background: rgba(151, 4, 1, 0.25); border: 1px solid #a33; border-radius: 6px; padding: 4px; }
/* ---- Badge-Band unten (DIM BadgeInfo): Power-Level groß & klar ---- */
.dinv-tile-badge { position: absolute; left: 0; right: 0; bottom: 0; height: 17px; display: flex; align-items: center; justify-content: space-between; padding: 0 3px; background: rgba(8,12,20,0.78); z-index: 3; pointer-events: none; box-sizing: border-box; }
/* ---- Tile-Wrapper mit Perk-Reihe UNTER der Kachel (verdeckt nichts) ---- */
.dinv-tile-wrap { display: flex; flex-direction: column; gap: 1px; width: 56px; height: var(--dinv-tile-h, 79px); flex-shrink: 0; content-visibility: auto; contain-intrinsic-size: auto var(--dinv-tile-h, 79px); }
body.tv-mode #inventoryView { --dinv-tile-h: 104px; }
body.tv-mode .dinv-tile-wrap { width: 76px; }
body.tv-mode .dinv-sub,
body.tv-mode .dinv-sub.vault { grid-template-columns: repeat(auto-fill, 76px); }
body.tv-mode .dinv-tile { width: 76px !important; height: 76px !important; }
body.tv-mode .dinv-pm-slot { width: 76px !important; height: 76px !important; }
/* Overlay-Inventar: opak und dicht, damit es über dem Spiel nutzbar ist. */
body.mode-overlay #inventoryView { background: #0b1018 !important; --dinv-tile-h: 88px; }
body.mode-overlay .inventory-view-head { padding: 2px 8px !important; }
body.mode-overlay .inventory-view-head > div:first-child { display: none; }
body.mode-overlay .inventory-head-controls { gap: 4px; }
body.mode-overlay .inventory-head-controls .btn { height: 28px; padding: 0 8px; font-size: 11px; }
body.mode-overlay .inventory-toolbar { padding: 3px 8px !important; gap: 4px !important; }
body.mode-overlay .inventory-toolbar input,
body.mode-overlay .inventory-toolbar select,
body.mode-overlay .inventory-toolbar .btn { height: 28px !important; min-height: 28px !important; font-size: 11px !important; }
body.mode-overlay #inventoryStatus,
body.mode-overlay .inventory-legend,
body.mode-overlay .inventory-pad-hint { display: none !important; }
/* Leere Infoboxen kosten nur Platz. */
.inventory-result.hidden,
.inventory-result:empty,
.inventory-loadout-list:empty,
.inventory-status:empty { display: none !important; }
body.mode-overlay .dinv-tab { min-height: 30px !important; font-size: 12px !important; padding: 3px 9px !important; }
body.mode-overlay .dinv-sub,
body.mode-overlay .dinv-sub.vault { grid-template-columns: repeat(auto-fill, 64px); }
body.mode-overlay .dinv-tile { width: 64px !important; height: 64px !important; }
body.mode-overlay .dinv-tile-wrap { width: 64px; }
body.mode-overlay .dinv-pm-slot { width: 64px !important; height: 64px !important; }
body.mode-overlay.inventory-open .overlay-bar { padding: 3px 8px; gap: 4px; }
body.mode-overlay.inventory-open .overlay-brand,
body.mode-overlay.inventory-open .overlay-clock,
body.mode-overlay.inventory-open .overlay-session,
body.mode-overlay.inventory-open .overlay-champion { display: none !important; }
body.mode-overlay.inventory-open .overlay-bar .overlay-action,
body.mode-overlay.inventory-open .overlay-bar button,
body.mode-overlay.inventory-open .overlay-bar .chip { min-height: 30px !important; height: 30px !important; font-size: 11px !important; }
body.pad-active .dinv-tile-wrap { content-visibility: visible; }
.dinv-chunk { display: contents; }
.dinv-tile-perkrow { display: flex; gap: 2px; justify-content: center; align-items: center; height: 11px; }
.dinv-tile-perkrow img { width: 10px !important; height: 10px !important; filter: drop-shadow(0 0 1.5px rgba(0,0,0,0.9)) saturate(1.4); }
/* ---- Drag & Drop: eigener Pointer-Drag (Ghost + Drop-Zonen) ---- */
#inventoryView img { -webkit-user-drag: none; user-drag: none; }
body.dinv-dragging { user-select: none !important; cursor: grabbing !important; }
body.dinv-dragging #inventoryView { cursor: grabbing !important; }
body.dinv-dragging #inventoryView * { cursor: grabbing !important; }
.dinv-drag-ghost { position: fixed; z-index: 999; padding: 3px 9px; border-radius: 6px; background: rgba(10,16,26,0.92); border: 1px solid #29f36a; color: #e8ecf2; font-size: 11px; pointer-events: none; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-shadow: 0 6px 24px rgba(0,0,0,0.55); }
.dinv-cell[data-drop] { transition: outline-color 80ms ease; outline: 2px solid transparent; outline-offset: -3px; border-radius: 6px; }
.dinv-cell.drop-target { outline-color: #29f36a !important; background: rgba(41,243,106,0.06); }
/* ---- Favoriten-Stern (DIM-Tag, gold oben rechts) ---- */
.dinv-tile-fav { position: absolute !important; right: 1px !important; top: 1px !important; color: #eade8b !important; font-size: 13px !important; line-height: 1; z-index: 2 !important; text-shadow: 0 0 3px rgba(0,0,0,0.95) !important; pointer-events: none !important; }
.inv-popup-action.fav.on { border-color: #eade8b !important; color: #eade8b !important; }
/* ---- Sortier-Select (Toolbar) ---- */
.inventory-sort { flex: 0 0 112px !important; width: 112px !important; height: 28px !important; font-size: 11px; padding: 0 6px; border-radius: 5px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; }
/* ---- Farming-Modus-Button ---- */
.inv-toolbar-farm.on { border-color: #29f36a !important; color: #29f36a !important; }
/* ---- Element-Icon oben links (DIM-Stil, echtes Icon) ---- */
.dinv-tile-elem { position: absolute !important; left: 1px !important; top: 1px !important; width: 14px !important; height: 14px !important; filter: drop-shadow(0 0 2px rgba(0,0,0,0.95)) brightness(1.25); z-index: 2; pointer-events: none; }
.inv-compare-backdrop { position: absolute; inset: 0; z-index: 310; display: none; align-items: center; justify-content: center; background: rgba(4,8,14,0.62); }
.inv-compare-backdrop.open { display: flex; }
.inv-compare { width: min(96%, 1200px); max-height: 88%; overflow-y: auto; background: #10151f; border: 1px solid #2a3548; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,0.75); padding: 10px 12px 14px; }
.inv-compare-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.inv-compare-head strong { font-size: 14px; color: #e8ecf2; text-transform: uppercase; letter-spacing: 0.5px; }
.inv-compare-grid { display: flex; gap: 8px; align-items: stretch; overflow-x: auto; }
.inv-cmp-col { flex: 1 0 230px; min-width: 230px; background: rgba(255,255,255,0.02); border: 1px solid #232b3a; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
.inv-cmp-top { display: flex; gap: 8px; align-items: center; }
.inv-cmp-icon { width: 48px !important; height: 48px !important; border-radius: 6px; object-fit: contain; padding: 2px; box-sizing: border-box; border: 1px solid #2a3548; flex-shrink: 0; }
.inv-cmp-name { font-size: 12.5px; font-weight: 700; text-transform: uppercase; color: #e8ecf2; line-height: 1.25; }
.inv-cmp-sub { color: #a0aabb; font-size: 10.5px; }
.inv-cmp-remove { align-self: flex-start; margin-left: auto; width: 24px; height: 24px; border: none; border-radius: 5px; background: rgba(255,255,255,0.06); color: #a0aabb; cursor: pointer; font-size: 12px; }
.inv-cmp-remove:hover { background: rgba(255,80,80,0.2); color: #ff8f8f; }
.inv-cmp-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: rgba(255,255,255,0.06); color: #a0aabb; font-size: 15px; cursor: pointer; }
.inv-cmp-close:hover { background: rgba(255,255,255,0.14); color: #e8ecf2; }
.inv-cmp-perks { display: flex; flex-direction: column; gap: 3px; }
.inv-cmp-perk { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: #c8d0dc; padding: 2px 4px; border: 1px solid #232b3a; border-radius: 4px; background: rgba(255,255,255,0.03); }
.inv-cmp-perk img { width: 24px !important; height: 24px !important; border-radius: 3px; object-fit: contain; flex-shrink: 0; }
.inv-cmp-perk.god { border-color: #29f36a !important; color: #29f36a !important; }
.inv-cmp-empty { flex: 0 0 180px; border: 1px dashed #2a3548; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #5a6578; font-size: 11px; min-height: 200px; }
/* ---- Bestätigungs-Modal (statt window.confirm) ---- */
.inv-confirm-backdrop { position: absolute; inset: 0; z-index: 320; display: none; align-items: center; justify-content: center; background: rgba(4,8,14,0.68); }
.inv-confirm-backdrop.open { display: flex; }
.inv-confirm { width: min(92%, 620px); max-height: 86%; overflow-y: auto; background: #10151f; border: 1px solid #2a3548; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,0.75); padding: 14px 16px; }
.inv-confirm h3 { margin: 0 0 8px; font-size: 14px; color: #e8ecf2; }
.inv-confirm p { margin: 4px 0; color: #b6c0d0; font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
.inv-confirm .warnline { color: #ffb36b; }
.inv-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.inv-confirm button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.inv-confirm-input { width: 100%; height: 34px; margin-top: 8px; padding: 0 10px; border-radius: 6px; border: 1px solid #2a3548; background: #0b1018; color: #e8ecf2; font-size: 12px; box-sizing: border-box; outline: none; }
.inv-confirm-input:focus { border-color: var(--brand); }
/* ---- Mehrfachauswahl ---- */
.dinv-selectbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 10px; margin: 0 0 6px; border: 1px solid var(--brand); border-radius: 6px; background: color-mix(in srgb, var(--brand) 10%, transparent); font-size: 11.5px; color: var(--brand-soft); }
.dinv-selectbar[hidden] { display: none; }
.dinv-undobar { position: absolute; right: 12px; bottom: 12px; z-index: 61; display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid #3a4a60; border-radius: 8px; background: rgba(10,15,24,0.96); color: #c8d0dc; font-size: 10.5px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); }
.dinv-undobar[hidden] { display: none; }
.dinv-tile.multi { outline: 1px solid var(--brand); outline-offset: 1px; }
.dinv-tile:focus-visible { outline: 2px solid var(--brand-strong); outline-offset: 2px; }
.skip-links { position: fixed; top: -60px; left: 8px; z-index: 10001; display: flex; gap: 6px; transition: top 0.12s ease; }
.skip-links:focus-within { top: 8px; }
.skip-links button { padding: 6px 10px; border: 1px solid #2a3548; border-radius: 6px; background: #0d121b; color: #e8ecf2; font: inherit; font-size: 11px; cursor: pointer; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* ---- Stats/Godroll-Zusätze ---- */
.dinv-tile-stats { position: absolute; right: 1px; bottom: 1px; z-index: 2; padding: 0 3px; border-radius: 3px; background: rgba(0,0,0,0.72); color: #d9e6ff; font-size: 9px; font-weight: 700; pointer-events: none; }
.dinv-tile-tier { position: absolute; left: 1px; top: 1px; z-index: 2; padding: 0 3px; border-radius: 3px; background: rgba(8,12,20,0.82); border: 1px solid #3a4a60; color: #f0b35a; font-size: 8.5px; font-weight: 700; pointer-events: none; }
.dinv-tile-arch { position: absolute; right: 1px; top: 1px; z-index: 2; width: 16px; height: 16px; border-radius: 50%; background: rgba(8,12,20,0.82); border: 1px solid #3a4a60; display: inline-flex; align-items: center; justify-content: center; pointer-events: none; }
.dinv-tile-arch img { width: 12px !important; height: 12px !important; filter: brightness(1.6); }
.dinv-tile-note { position: absolute; left: 1px; bottom: 1px; z-index: 2; color: #f0e0a0; font-size: 10px; text-shadow: 0 1px 2px #000; pointer-events: none; }
.dinv-tile-wish { position: absolute; right: 18px; top: 1px; z-index: 2; width: 14px; height: 14px; border-radius: 50%; background: #3b2a55; border: 1px solid #a370d8; color: #e0c8ff; font-size: 8px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; pointer-events: none; }
.dinv-tile-diff { position: absolute; right: 1px; bottom: 14px; z-index: 2; padding: 0 2px; border-radius: 3px; background: rgba(0,0,0,0.75); color: #f0b35a; font-size: 9px; font-weight: 700; pointer-events: none; }
.inv-armor-meta { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 4px; }
.inv-armor-chip { padding: 1px 6px; border: 1px solid #2a3548; border-radius: 9px; background: rgba(255,255,255,0.03); color: #9fb0c8; font-size: 9.5px; }
.inv-armor-chip.tier { border-color: #6b5223; color: #f0b35a; font-weight: 700; }
.inv-armor-chip.set { border-color: #3f5a8a; color: #bcdcff; }
.inv-set-bonus { display: flex; flex-direction: column; gap: 2px; margin: 2px 0 5px; }
.inv-set-perk { display: flex; gap: 6px; align-items: baseline; padding: 2px 6px; border: 1px solid #232b3a; border-radius: 5px; background: rgba(255,255,255,0.02); color: #8a96a8; font-size: 9.5px; }
.inv-set-perk.on { border-color: #3f6b4a; color: #b9e8c4; background: rgba(41,243,106,0.06); }
.inv-set-perk b { color: #e8ecf2; }
.inv-item-note { display: flex; flex-direction: column; gap: 5px; }
.inv-item-note textarea { min-height: 44px; resize: vertical; background: #0b1018; border: 1px solid #2a3548; border-radius: 6px; color: #e8ecf2; font: 11px inherit; padding: 5px 7px; }
.inv-item-note textarea:focus { outline: none; border-color: var(--brand); }
.inv-godperks { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.inv-godperk { padding: 2px 6px; border-radius: 4px; border: 1px solid #29f36a; color: #8fffb2; font-size: 10.5px; }
.inv-stat-total { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 4px; background: rgba(124,199,255,0.12); color: #bcdcff; font-size: 10.5px; font-weight: 700; }
/* ---- Suchleiste mit Favoriten ---- */
.dinv-searchchips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 14px 6px; flex-shrink: 0; }
.dinv-searchchip { border: 1px solid #2a3548; border-radius: 10px; background: rgba(255,255,255,0.04); color: #9fb0c8; font-size: 10px; padding: 1px 8px; cursor: pointer; }
.dinv-searchchip:hover { border-color: var(--brand); color: #e8ecf2; }
.dinv-searchchip.on { border-color: var(--brand); color: var(--brand-soft); background: color-mix(in srgb, var(--brand) 16%, transparent); }
.dinv-searchchip.active { border-color: #f3c66a; color: #f3c66a; background: rgba(243,198,106,0.08); }
.dinv-searchchip.preset { border-color: #2a3f5c; color: #8fb6e0; }
.inv-stat-row.best .inv-stat-value { color: #29f36a; }
.inv-stat-row.worse .inv-stat-value { color: #ff8f8f; }
.inv-stat-row .inv-stat-value small { color: #ff8f8f; font-size: 8px; }
/* ---- Performance: weit entfernte Zeilen nicht rendern ---- */
.dinv-row { content-visibility: auto; contain-intrinsic-size: auto 70px; }
/* Bei Controller-Nutzung alle Zeilen layouten, damit das D-Pad auch
   Off-Screen-Items und die „Alle anzeigen“-Buttons erreicht. */
body.pad-active .dinv-row { content-visibility: visible !important; contain-intrinsic-size: none; }
/* ---- Tab-Leiste: Inventar | Loadout-Editor (volle Breite) ---- */
.dinv-tabs { display: flex; gap: 4px; padding: 6px 14px 0; flex-shrink: 0; border-bottom: 1px solid #1a2230; }
.inventory-pad-hint { display: none; align-items: center; gap: 12px; flex-wrap: wrap; padding: 5px 14px; border-top: 1px solid #1a2230; background: #0c111a; color: #9fb0c8; font-size: 10.5px; flex-shrink: 0; }
body.pad-active .inventory-pad-hint { display: flex; }
.inventory-pad-hint kbd { display: inline-block; padding: 0 4px; border: 1px solid #2a3548; border-radius: 3px; background: rgba(255,255,255,0.06); color: #e8ecf2; font-size: 10px; font-family: inherit; }
.inventory-search-count { color: #9fb0c8; font-size: 10.5px; white-space: nowrap; align-self: center; }
.inv-pad-kb { position: absolute; left: 50%; bottom: 42px; transform: translateX(-50%); z-index: 330; width: min(560px, 94%); display: none; flex-direction: column; gap: 5px; padding: 10px; border: 1px solid #2a3548; border-radius: 12px; background: #0d121b; box-shadow: 0 18px 50px rgba(0,0,0,0.75); }
.inv-pad-kb.open { display: flex; }
.inv-pad-kb-head { display: flex; align-items: center; gap: 8px; padding: 0 2px 4px; }
.inv-pad-kb-head strong { font-size: 11px; color: #b57be8; text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0; }
.inv-pad-kb-value { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 4px 8px; border: 1px solid #2a3548; border-radius: 5px; background: #080d14; color: #e8ecf2; font-size: 12px; }
.inv-pad-kb-row { display: flex; gap: 4px; justify-content: center; }
.inv-pad-kb-suggestions { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 2px 3px; max-height: 56px; overflow-y: auto; }
.inv-pad-kb-suggestions.hidden { display: none; }
.inv-pad-kb-suggest { padding: 2px 7px; border: 1px solid #2a3548; border-radius: 10px; background: rgba(124,199,255,0.08); color: #9fb0c8; font-size: 10px; font-family: inherit; cursor: pointer; }
.inv-pad-kb-suggest:hover, .inv-pad-kb-suggest:focus { border-color: #b57be8; color: #e8ecf2; background: rgba(181,123,232,0.18); }
.inv-pad-kb-key { min-width: 32px; height: 30px; padding: 0 7px; border: 1px solid #2a3548; border-radius: 5px; background: rgba(255,255,255,0.04); color: #e8ecf2; font-size: 12px; font-family: inherit; cursor: pointer; }
.inv-pad-kb-key:hover { background: rgba(255,255,255,0.1); }
.inv-pad-kb-key:focus { background: rgba(181,123,232,0.24); border-color: #b57be8; }
.inv-pad-kb-key.wide { min-width: 74px; font-size: 10.5px; }
.inv-pad-kb-key.space { flex: 1; }
.inv-pad-kb-key.primary { border-color: #7a5aa8; background: rgba(181,123,232,0.18); }
.inv-quickmenu { position: absolute; inset: 0; z-index: 340; display: none; align-items: center; justify-content: center; background: rgba(4,8,14,0.38); }
.inv-quickmenu.open { display: flex; }
.inv-quickmenu-card { padding: 12px 16px 14px; border: 1px solid #2a3548; border-radius: 14px; background: #0d121b; box-shadow: 0 18px 50px rgba(0,0,0,0.8); text-align: center; }
.inv-quickmenu-card strong { display: block; margin-bottom: 8px; color: #b57be8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; }
.inv-quickmenu-grid { display: grid; grid-template-columns: repeat(3, 92px); grid-template-rows: repeat(3, 52px); gap: 6px; }
.inv-quickmenu-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 1px solid #2a3548; border-radius: 9px; background: rgba(255,255,255,0.04); color: #e8ecf2; font-size: 11px; font-family: inherit; cursor: pointer; }
.inv-quickmenu-btn .qi { font-size: 17px; line-height: 1; }
.inv-quickmenu-btn:hover, .inv-quickmenu-btn:focus { border-color: #b57be8; background: rgba(181,123,232,0.22); }
.inv-quickmenu-btn.pos-top { grid-column: 2; grid-row: 1; }
.inv-quickmenu-btn.pos-right { grid-column: 3; grid-row: 2; }
.inv-quickmenu-btn.pos-bottom { grid-column: 2; grid-row: 3; }
.inv-quickmenu-btn.pos-left { grid-column: 1; grid-row: 2; }
.inv-quickmenu-btn.pos-center { grid-column: 2; grid-row: 2; border-color: #3a4558; color: #9fb0c8; }
.inv-quickmenu-hint { display: block; margin-top: 8px; color: #7a8494; font-size: 10px; }
.dinv-tab { padding: 6px 16px; border: 1px solid #232b3a; border-bottom: none; border-radius: 6px 6px 0 0; background: rgba(255,255,255,0.03); color: #96a0b2; font-size: 12.5px; cursor: pointer; }
.dinv-tab:hover { color: #e8ecf2; }
.dinv-tab.on { background: #10151f; color: #e8ecf2; border-bottom: 2px solid var(--brand); padding-bottom: 5px; }
.inventory-editor-tab { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 14px 14px; }
.inventory-editor-tab.hidden { display: none; }
.inv-ed-layout { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.inv-ed-side { flex: 0 0 280px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.inv-ed-main { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.inv-ed-loadout-row { display: flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid #2a3548; border-radius: 6px; font-size: 11.5px; background: rgba(255,255,255,0.02); }
.inv-ed-loadout-row .lname { font-weight: 600; color: #e8ecf2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inv-ed-loadout-row .lmeta { color: #7a8494; font-size: 10px; flex-shrink: 0; }
.inv-editor-slots.wide { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.inv-editor-slots.wide .inv-editor-slot { padding: 8px 9px; min-height: 68px; }
.inv-editor-slots.wide .inv-editor-slot img { width: 52px !important; height: 52px !important; }
.inv-ed-picker-search { width: 100%; height: 32px; font-size: 12px; padding: 0 10px; border-radius: 6px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; box-sizing: border-box; }
.inv-ed-hint { color: #7a8494; font-size: 11px; }
/* ---- Mod-Kacheln unter den Rüstungs-Slots (DIM-Stil) ---- */
.inv-ed-slotcol { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.inv-ed-mod-row { display: flex; flex-wrap: wrap; gap: 3px; }
.inv-ed-mod { width: 30px !important; height: 30px !important; padding: 0 !important; border: 1px solid #2a3548 !important; border-radius: 4px !important; background: rgba(255,255,255,0.03) !important; cursor: pointer !important; box-sizing: border-box !important; flex-shrink: 0 !important; display: flex; align-items: center; justify-content: center; }
.inv-ed-mod:hover { border-color: var(--brand) !important; }
.inv-ed-mod img { width: 26px !important; height: 26px !important; object-fit: contain; }
/* ---- Artefakt-Perk-Menü (DIM-Stil: Karten-Grid, aktive orange) ---- */
.inv-art-backdrop { position: absolute; inset: 0; z-index: 315; display: none; align-items: center; justify-content: center; background: rgba(4,8,14,0.72); }
.inv-art-backdrop.open { display: flex; }
.inv-art { width: min(96%, 1400px); max-height: 90%; overflow-y: auto; background: #0d1119; border: 1px solid #2a3548; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,0.8); display: flex; flex-direction: column; }
.inv-art-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #0d1119; border-bottom: 1px solid #1a2230; }
.inv-art-head strong { font-size: 15px; color: #e8ecf2; text-transform: uppercase; letter-spacing: 0.6px; }
.inv-art-count { color: #f0a04b; font-weight: 700; font-size: 13px; }
.inv-art-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; padding: 12px 14px; }
.inv-art-card { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 2px solid #232b3a; border-radius: 8px; background: #11161f; cursor: pointer; opacity: 0.55; transition: opacity 80ms ease, border-color 80ms ease; text-align: left; }
.inv-art-card:hover { opacity: 0.9; border-color: #3a4558; }
.inv-art-card.active { opacity: 1; border-color: #f0a04b; background: #161b26; }
.inv-art-card-top { display: flex; align-items: center; gap: 8px; }
.inv-art-card img { width: 48px !important; height: 48px !important; border-radius: 6px; object-fit: contain; background: #0a0d13; border: 1px solid #232b3a; flex-shrink: 0; }
.inv-art-card .art-name { font-size: 12.5px; font-weight: 700; color: #e8ecf2; }
.inv-art-card.active .art-name { color: #f0a04b; }
.inv-art-card .art-desc { font-size: 10.5px; color: #a0aabb; line-height: 1.45; }
.inv-art-foot { position: sticky; bottom: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #0d1119; border-top: 1px solid #1a2230; flex-wrap: wrap; }
.inv-art-sel { display: flex; gap: 3px; flex-wrap: wrap; }
.inv-art-sel img { width: 26px !important; height: 26px !important; border-radius: 4px; object-fit: contain; background: #0a0d13; border: 1px solid #f0a04b; }
/* ---- Plug-Detail-Overlay (Mods/Artefakt-Perks: genaue Funktion) ---- */
.dinv-plug-tip { position: fixed; z-index: 999; display: none; flex-direction: column; gap: 4px; max-width: 400px; padding: 10px 12px; border-radius: 8px; border: 1px solid #3a4558; background: rgba(8,12,20,0.98); box-shadow: 0 12px 36px rgba(0,0,0,0.75); font-size: 12.5px; line-height: 1.55; pointer-events: none; }
.dinv-plug-tip.show { display: flex; }
.dinv-plug-tip strong { font-size: 13.5px; color: #f0a04b; }
.dinv-plug-tip .plug-sub { font-size: 10px; color: #7a8494; text-transform: uppercase; letter-spacing: 0.06em; }
.dinv-plug-tip p { margin: 0; color: #cfd7e3; }
.dinv-plug-tip .plug-hint { color: #7a8494; font-size: 11px; font-style: italic; }
.dinv-plug-tip .plug-title { font-size: 14px; color: #f3d27a; text-transform: uppercase; letter-spacing: 0.05em; }
.dinv-plug-tip .plug-tags { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; }
.dinv-plug-tip .plug-enh { color: #f5c542; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
.dinv-plug-tip .plug-state { color: #7a8494; text-transform: uppercase; letter-spacing: 0.05em; }
.dinv-plug-tip .plug-state.god { color: #29f36a; font-weight: 700; }
/* ---- Mod-/Perk-Karten (die Loadout-Liste im Editor) ---- */
.inv-ed-mod-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px; }
.inv-ed-modcard { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border: 1px solid #2a3548; border-radius: 8px; background: rgba(255,255,255,0.02); }
.inv-ed-modcard img { width: 44px !important; height: 44px !important; border-radius: 6px; object-fit: contain; background: #0a0d13; border: 1px solid #232b3a; flex-shrink: 0; }
.inv-ed-modcard .slot-desc { font-size: 10px; color: #a0aabb; line-height: 1.4; margin-top: 3px; max-height: 4.2em; overflow: hidden; text-overflow: ellipsis; }
.inv-ed-modcard .inv-cmp-remove { margin-left: auto; flex-shrink: 0; }
/* ---- Loadout-Editor (DIM LoadoutDrawer-Stil: Kategorien als Spalten) ---- */
.inv-ed-cats { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-bottom: 4px; }
.inv-ed-cat { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.inv-ed-cat-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #96a0b2; text-align: center; }
.inv-ed-cat-items { display: flex; flex-direction: column; gap: 4px; width: 100%; align-items: center; }
.inv-ed-cat .inv-editor-slot { width: 56px; }
.inv-ed-cat .inv-editor-slot img { width: 52px !important; height: 52px !important; }
.inv-ed-cat .inv-editor-slot .slot-label { display: none; }
.inv-ed-cat .inv-editor-slot .slot-item { font-size: 10.5px; color: #e8ecf2; max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
/* Die Mod-Liste als DIM-ModsGrid (Icon-Kacheln mit auto-fill) */
.inv-ed-modlist { display: grid; grid-template-columns: repeat(auto-fill, 46px); gap: 5px; align-content: flex-start; align-items: flex-start; margin-bottom: 5px; }
.inv-ed-modcard { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px; border: 1px solid #2a3548; border-radius: 6px; background: rgba(255,255,255,0.02); position: relative; }
.inv-ed-modcard img { width: 40px !important; height: 40px !important; border-radius: 5px; object-fit: contain; background: #0a0d13; border: 1px solid #232b3a; }
.inv-ed-modcard .modcard-name { font-size: 9.5px; color: #cfd7e3; text-align: center; max-width: 44px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inv-ed-modcard .inv-cmp-remove { position: absolute; top: 2px; right: 2px; width: 16px !important; height: 16px !important; font-size: 10px !important; padding: 0 !important; border-radius: 50% !important; background: rgba(10,14,22,0.9) !important; }
.inv-art-tile { width: 56px !important; height: 56px !important; border-radius: 6px; object-fit: contain; border: 1px solid #232b3a; display: block; }
/* ---- Die Stat-Gesamtsummen (DIM „Gesamt") ---- */
.inv-ed-stats { display: flex; align-items: center; gap: 14px; padding: 7px 12px; border: 1px solid #232b3a; border-radius: 8px; background: rgba(255,255,255,0.03); flex-wrap: wrap; margin-bottom: 4px; }
  .inv-ed-opt-presets { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
  .inv-ed-opt-weights { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
  .inv-ed-stat-ctl { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #c7d1e0; }
  .inv-ed-stat-ctl input[type=number] { width: 52px; padding: 4px 6px; background: #10151f; border: 1px solid #2a3548; border-radius: 5px; color: #e8ecf2; }
  .inv-ed-stat-ctl input[type=checkbox] { width: 14px; height: 14px; }
.inv-ed-stat { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: #e8ecf2; font-weight: 600; }
.inv-ed-stat img { width: 15px !important; height: 15px !important; filter: brightness(1.6); }
.inv-ed-stat.power { color: #f5d76a; }
/* ---- Die Loadout-Anzeige-Karte (DIM LoadoutView-Stil) ---- */
.inv-ed-card { display: flex; flex-direction: column; gap: 10px; }
.inv-ed-card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.inv-ed-card-head strong { font-size: 16px; color: #e8ecf2; text-transform: uppercase; letter-spacing: 0.5px; }
/* Tab-Modus: Toolbar-Loadout-Felder wandern in den Editor-Tab */
#inventoryLoadoutName, #inventoryLoadoutChar, #inventoryLoadoutSave, #inventoryLoadoutList { display: none !important; }
.inv-editor-backdrop { position: absolute; inset: 0; z-index: 305; display: none; align-items: center; justify-content: center; background: rgba(4,8,14,0.62); }
.inv-editor-backdrop.open { display: flex; }
.inv-editor { width: min(760px, 96%); max-height: 88%; overflow-y: auto; background: #10151f; border: 1px solid #2a3548; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,0.75); padding: 12px 14px 14px; }
.inv-editor-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.inv-editor-head strong { font-size: 14px; color: #e8ecf2; text-transform: uppercase; letter-spacing: 0.5px; }
.inv-editor-head input[type=text] { flex: 1; height: 30px; font-size: 12px; padding: 0 8px; border-radius: 5px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; }
.inv-editor-head select { height: 30px; font-size: 12px; padding: 0 6px; border-radius: 5px; border: 1px solid #2a3548; background: rgba(0,0,0,0.4); color: #e8ecf2; }
.inv-editor-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.inv-editor-slot { display: flex; align-items: center; gap: 7px; padding: 6px 7px; border: 1px solid #2a3548; border-radius: 6px; background: rgba(255,255,255,0.02); cursor: pointer; min-height: 58px; text-align: left; box-sizing: border-box; }
.inv-editor-slot:hover { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 10%, transparent); }
.inv-editor-slot img { width: 44px !important; height: 44px !important; border-radius: 4px; object-fit: contain; border: 1px solid #2a3548; flex-shrink: 0; }
.inv-editor-slot .slot-label { font-size: 9.5px; color: #7a8494; text-transform: uppercase; letter-spacing: 0.08em; }
.inv-editor-slot .slot-item { font-size: 11px; color: #e8ecf2; line-height: 1.3; }
.inv-editor-slot .slot-power { color: #f5d76a; font-weight: 700; }
.inv-editor-slot.empty { justify-content: center; color: #5a6578; font-size: 11px; }
.inv-editor-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.inv-picker-list { display: flex; flex-wrap: wrap; gap: 4px; max-height: 54vh; overflow-y: auto; }
.inv-picker-tile { width: 56px; }
.dinv-section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #7a8494; margin: 8px 0 3px; }
/* ---- DIM-Store-Layout: pro Bucket eine Zeile mit 4 Zellen ---- */
.dinv-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 10px; align-items: start; margin-bottom: 2px; }
.dinv-cell { min-width: 0; }
.dinv-cell.aw3 { grid-column: 1 / span 3; }
.dinv-cat { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.14em; color: #96a0b2; margin: 10px 0 4px; }
/* Charakter-Beutetaschen: 3 Items pro Reihe (DIM 3x3-Raster);
   Tresor-Zellen füllen die volle Zellbreite (auto-fill). */
.dinv-sub { display: grid; grid-template-columns: repeat(3, 56px); gap: 4px; align-content: flex-start; align-items: flex-start; padding: 2px 0; }
.dinv-sub.vault { grid-template-columns: repeat(auto-fill, 56px); }
.dinv-more { grid-column: 1 / -1; justify-self: start; padding: 4px 9px; border: 1px dashed #3a4558; border-radius: 6px; background: rgba(255,255,255,0.03); color: #9fb0c8; font: inherit; font-size: 10.5px; cursor: pointer; }
.dinv-more:hover { color: #fff; border-color: var(--brand-line, #2a3548); }
.dinv-eq-row { display: flex; gap: 4px; align-items: flex-start; padding-bottom: 6px; min-height: 60px; }
.dinv-vg { display: flex; flex-flow: row wrap; gap: 4px; align-items: flex-start; padding: 0 0 6px; border-bottom: 1px solid rgba(150,150,150,0.45); }
.dinv-vg:last-of-type { border-bottom: none; padding-bottom: 0; }
.dinv-vg-class { width: 56px !important; height: 56px !important; border: 1px dashed #2a3548; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #7a8494; box-sizing: border-box; flex-shrink: 0; }
.dinv-vault-stack { display: flex; flex-direction: column; }
.dinv-vault-cell { display: flex; flex-direction: column; gap: 2px; }
.dinv-vault-body { position: relative; overflow: hidden; }
.dinv-vault-body.collapsed::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 22px; background: linear-gradient(to bottom, rgba(11,16,24,0), rgba(11,16,24,0.92)); pointer-events: none; }
.dinv-vault-toggle { align-self: flex-start; margin-top: 1px; padding: 1px 8px; font-size: 10px; line-height: 1.6; border: 1px solid #2a3548; border-radius: 4px; background: rgba(255,255,255,0.04); color: #9fb0c8; cursor: pointer; }
.dinv-vault-toggle:hover { background: rgba(255,255,255,0.1); color: #e8ecf2; }
/* ---- DIM-Item-Tile: 56px Polaroid ---- */
.dinv-tile { position: relative; width: 56px !important; height: 56px !important; border: 1px solid #191e28 !important; border-radius: 4px !important; padding: 0 !important; cursor: pointer !important; overflow: hidden !important; flex-shrink: 0 !important; box-sizing: border-box !important; background: #522f65 !important; }
.dinv-tile img { width: 100% !important; height: 100% !important; object-fit: contain !important; display: block !important; }
.dinv-tile:hover { filter: brightness(1.2) !important; }
.dinv-tile.inv-dim { opacity: 0.2 !important; filter: grayscale(1) !important; }
.dinv-tile.inv-dim:hover { opacity: 0.7 !important; filter: grayscale(0.3) brightness(1.1) !important; }
.inv-dim .dinv-tile-perkrow { opacity: 0.2; filter: grayscale(1); }
.dinv-tile.r6 { background: #ceae33 !important; }
.dinv-tile.r5 { background: #522f65 !important; }
.dinv-tile.r4 { background: #5076a3 !important; }
.dinv-tile.r3 { background: #366f42 !important; }
.dinv-tile.r2, .dinv-tile.r1, .dinv-tile.r0 { background: #c3bcb4 !important; }
.dinv-tile.equipped { outline: 1px solid rgba(226,232,240,0.9) !important; outline-offset: 1px !important; border-color: #e0e4ea !important; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.55) !important; }
.dinv-tile.selected { outline: 2px solid #e8ecf2 !important; outline-offset: 1px !important; }
.dinv-tile-god { position: absolute !important; left: 2px !important; bottom: 19px !important; z-index: 4 !important; font-size: 12px !important; color: #29f36a !important; text-shadow: 0 0 4px rgba(0,0,0,0.95), 0 0 2px #29f36a !important; pointer-events: none !important; }
.dinv-tile-near { position: absolute !important; left: 2px !important; bottom: 19px !important; z-index: 4 !important; font-size: 13px !important; font-weight: 700 !important; color: #f0b35a !important; text-shadow: 0 0 4px rgba(0,0,0,0.95) !important; pointer-events: none !important; }
.dinv-tile-power { position: static !important; right: auto !important; bottom: auto !important; font-size: 11.5px !important; font-weight: 700 !important; color: #f2f5fa !important; text-shadow: 0 1px 2px rgba(0,0,0,0.95) !important; z-index: 2 !important; }
.dinv-tile-qty { position: static !important; left: auto !important; bottom: auto !important; font-size: 11.5px !important; font-weight: 700 !important; color: #f2f5fa !important; text-shadow: 0 1px 2px rgba(0,0,0,0.95) !important; z-index: 2 !important; }
.dinv-tile-empty { display: flex !important; align-items: center !important; justify-content: center !important; width: 56px !important; height: 56px !important; border: 1px dashed #2a3548 !important; border-radius: 4px !important; color: #4a5568 !important; font-size: 10px !important; box-sizing: border-box !important; }
/* ---- Element-Badge (DIM-Elementarfarben) ---- */
.dinv-elem { position: absolute !important; right: 2px !important; top: 2px !important; width: 11px !important; height: 11px !important; border-radius: 50% !important; box-shadow: 0 0 3px rgba(0,0,0,0.9) !important; z-index: 2 !important; }
.dinv-elem2 { background: #79bbe8 !important; }
.dinv-elem3 { background: #f0631e !important; }
.dinv-elem4 { background: #8e749e !important; }
.dinv-elem5 { background: #d8c27a !important; }
.dinv-elem6 { background: #4d88ff !important; }
.dinv-elem7 { background: #35e366 !important; }
.dinv-elem8 { background: #e3619b !important; }
.dinv-elem9 { background: #35e366 !important; }
.dinv-elem10 { background: #e3619b !important; }
.dinv-tile-tagrow { display: flex !important; gap: 2px !important; justify-content: center !important; align-items: center !important; height: 10px !important; max-width: 100% !important; overflow: hidden !important; }
.dinv-tag { display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 12px !important; height: 10px !important; padding: 0 2px !important; border-radius: 2px !important; font-size: 7px !important; font-weight: 800 !important; line-height: 10px !important; letter-spacing: 0.1px !important; pointer-events: none !important; }
.dinv-tag-elem { color: #0b0f16 !important; }
.dinv-tag-champ { background: rgba(9,14,22,0.88) !important; border: 1px solid #f3c66a !important; }
.dinv-tag-champ.none { border-color: #4a5568 !important; color: #9aa6b6 !important; }
.dinv-mark { background: rgba(243,198,106,0.38); color: #fff; border-radius: 2px; padding: 0 1px; }
.inv-filter-help { margin: 4px 0; font-size: 10.5px; color: #9aa6b6; }
.inv-filter-help summary { cursor: pointer; color: var(--text); padding: 3px 0; }
.inv-filter-help-grid { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 3px 8px; align-items: start; }
.inv-filter-help-grid code { color: #9fc6ff; background: rgba(255,255,255,0.04); border-radius: 3px; padding: 0 3px; font-size: 10px; }
.inv-filter-help-grid span { color: #9aa6b6; }
/* Suche: standardmäßig nur Treffer, keine gedimmten Kacheln dazwischen. */
body.dinv-search-only .dinv-tile-wrap.inv-dim { display: none !important; }
body.dinv-search-only .dinv-row:not(.dinv-head-row):not(:has(.dinv-tile-wrap:not(.inv-dim))) { display: none !important; }
body.dinv-search-only .dinv-vault-body.collapsed { max-height: none !important; }
body.tv-mode .dinv-tile-tagrow { height: 15px !important; gap: 3px !important; }
body.tv-mode .dinv-tag { height: 15px !important; min-width: 18px !important; font-size: 10px !important; line-height: 15px !important; padding: 0 4px !important; }
body.tv-mode .inventory-legend { font-size: 13px !important; }
.inv-tip-tags { display: flex !important; flex-wrap: wrap !important; gap: 5px !important; margin: 2px 0 !important; }
.inv-tag-elem, .inv-tag-champ { padding: 2px 6px !important; border-radius: 4px !important; font-size: 10px !important; border: 1px solid #3a4a60 !important; background: rgba(255,255,255,0.05) !important; color: #cfd7e3 !important; }
.inv-tag-champ { border-color: #f3c66a !important; color: #f3c66a !important; }
/* ---- DIM-Item-Popup (Klick) ---- */
.dinv-popup { display: flex; flex-direction: column; gap: 8px; }
.dinv-popup-head { display: flex; align-items: center; gap: 10px; }
.dinv-popup-icon { width: 48px; height: 48px; border-radius: 6px; object-fit: contain; background: rgba(0,0,0,0.4); border: 1px solid #2a3548; flex-shrink: 0; }
.dinv-popup-title { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.dinv-popup-title strong { font-size: 13px; }
.dinv-popup-title span { color: #7a8494; font-size: 11px; }
.dinv-popup-stats { display: flex; flex-direction: column; gap: 2px; }
.dinv-stat-row { display: flex; align-items: center; gap: 6px; font-size: 10.5px; }
.dinv-stat-label { width: 120px; text-align: right; color: #a0aabb; flex-shrink: 0; }
.dinv-stat-value { width: 30px; text-align: right; color: #e8ecf2; flex-shrink: 0; }
.dinv-stat-bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; }
.dinv-stat-bar span { display: block; height: 100%; background: #c8d0dc; border-radius: 3px; }
.dinv-popup-perks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.dinv-popup-perk { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border: 1px solid #2a3548; border-radius: 5px; font-size: 10.5px; color: #e8ecf2; }
.dinv-popup-perk img { width: 36px; height: 36px; border-radius: 4px; object-fit: contain; background: rgba(0,0,0,0.4); flex-shrink: 0; }
.dinv-popup-perk.god { border-color: #29f36a !important; background: rgba(41,243,106,0.08) !important; }
.dinv-popup-perk.god .perk-name { color: #29f36a; }
.perk-check { color: #29f36a; font-weight: 700; }
.dinv-popup-flavor { margin: 0; color: #a0aabb; font-size: 11px; font-style: italic; }
.dinv-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.inventory-tooltip { position: fixed; z-index: 420; display: none; flex-direction: column; gap: 3px; max-width: 320px; padding: 8px 10px; border-radius: 8px; border: 1px solid #3a4558; background: rgba(5,9,15,0.97); box-shadow: 0 10px 30px rgba(0,0,0,0.6); font-size: 11px; line-height: 1.4; pointer-events: none; }
.inventory-tooltip.show { display: flex; }
.dinv-tip-name { font-size: 12.5px; font-weight: 700; }
.dinv-tip-name.tt6 { color: #ceae33; }
.dinv-tip-name.tt5 { color: #a370d8; }
.dinv-tip-name.tt4 { color: #5076a3; }
.dinv-tip-name.tt3 { color: #4fae6f; }
.dinv-tip-perks { display: flex; flex-wrap: wrap; gap: 3px; }
.dinv-tip-perk { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; padding: 2px 5px; border: 1px solid #2a3548; border-radius: 4px; color: #e8ecf2; background: rgba(255,255,255,0.04); }
.dinv-tip-perk img { width: 20px; height: 20px; border-radius: 3px; object-fit: contain; background: rgba(0,0,0,0.4); }
.dinv-tip-perk.god { border-color: #29f36a; }
.dinv-tip-perk.god .pn { color: #29f36a; }
.dinv-tip-god { color: #29f36a; font-weight: 700; font-size: 11px; }
.dinv-tip-flavor { color: #a0aabb; font-size: 10.5px; font-style: italic; }
.dinv-tip-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px 12px; margin: 1px 0 2px; }
.dinv-tip-stat { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: #a0aabb; }
.dinv-tip-stat b { color: #e8ecf2; font-weight: 600; }
.dinv-tip-plugdesc { color: #cfd7e3; }
.dinv-tip-bonus { color: #9ad0ff; font-size: 10px; }
.dinv-scope-warn { margin: 10px 0; padding: 8px 10px; border: 1px solid #f0c66b; border-radius: 6px; background: rgba(240,198,107,0.08); font-size: 11px; line-height: 1.5; }
.dinv-loadout-row { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid #2a3548; border-radius: 5px; font-size: 11px; }
/* ---- DIM-Item-Popup als Modal-Overlay (ItemPopup.tsx / ItemDetails.m.scss) ---- */
.inv-popup-backdrop { position: absolute; inset: 0; z-index: 300; display: none; align-items: center; justify-content: center; background: rgba(4,8,14,0.62); }
.inv-popup-backdrop.open { display: flex; }
.inv-popup { width: min(600px, 94%); max-width: calc((100vw - 24px) / var(--ui-zoom, 1)); max-height: min(86%, calc((100vh - 24px) / var(--ui-zoom, 1))); overflow-y: auto; overflow-x: hidden; background: #10151f; border: 1px solid #2a3548; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,0.75); display: flex; flex-direction: column; }
.inv-popup-band { height: 4px; flex-shrink: 0; border-radius: 10px 10px 0 0; background: #522f65; }
.inv-popup-band.b6 { background: #ceae33; }
.inv-popup-band.b5 { background: #522f65; }
.inv-popup-band.b4 { background: #5076a3; }
.inv-popup-band.b3 { background: #366f42; }
.inv-popup-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px 8px; }
.inv-popup-icon { width: 60px !important; height: 60px !important; border-radius: 6px; object-fit: contain; padding: 3px; box-sizing: border-box; background: rgba(0,0,0,0.35); border: 1px solid #2a3548; flex-shrink: 0; }
.inv-popup-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.inv-popup-name { font-size: 16px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: 0.4px; color: #e8ecf2; }
.inv-popup-name.n6 { color: #ceae33; }
.inv-popup-name.n5 { color: #a370d8; }
.inv-popup-name.n4 { color: #7ab5e8; }
.inv-popup-sub { color: #a0aabb; font-size: 11.5px; }
.inv-popup-god { color: #29f36a; font-size: 11px; font-weight: 700; }
.inv-popup-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: rgba(255,255,255,0.06); color: #a0aabb; font-size: 15px; cursor: pointer; flex-shrink: 0; }
.inv-popup-close:hover { background: rgba(255,255,255,0.14); color: #e8ecf2; }
.inv-popup-body { display: flex; gap: 10px; padding: 6px 16px 14px; align-items: flex-start; }
.inv-popup-actions { display: flex; flex-direction: column; gap: 4px; width: 168px; flex-shrink: 0; }
.inv-popup-action { display: flex; align-items: center; gap: 7px; padding: 7px 9px; border: 1px solid #2a3548; border-radius: 6px; background: rgba(255,255,255,0.03); color: #e8ecf2; font-size: 11.5px; cursor: pointer; text-align: left; width: 100%; box-sizing: border-box; }
.inv-popup-action:hover:not(:disabled) { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 14%, transparent); }
.inv-popup-action:disabled { opacity: 0.45; cursor: default; }
.inv-popup-action .ai { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.inv-popup-action.vault { border-color: var(--brand); color: var(--brand-soft); }
.inv-popup-action.equip { border-color: #29f36a; color: #29f36a; }
.inv-popup-action.lock.on { border-color: #eade8b; color: #eade8b; }
.inv-popup-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
.inv-popup-pad-hint { display: none; align-items: center; flex-wrap: wrap; gap: 8px; padding: 5px 16px 9px; border-top: 1px solid #1b2432; color: #9fb0c8; font-size: 10.5px; }
body.pad-active .inv-popup-pad-hint { display: flex; }
.inv-popup-pad-hint kbd { display: inline-block; padding: 0 4px; border: 1px solid #2a3548; border-radius: 3px; background: rgba(255,255,255,0.06); color: #e8ecf2; font-size: 10px; font-family: inherit; }
.inv-popup-section { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; color: #7a8494; margin: 0; }
.inv-perk-grid { display: flex; flex-wrap: wrap; gap: 6px 0; align-items: stretch; }
.inv-perk-column { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 60px; flex: 0 0 auto; border-right: 1px solid rgba(255,255,255,0.14); padding: 0 5px; }
.inv-perk-column:last-child { border-right: none; }
.inv-perk-stack { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; }
.inv-perk-cell { position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 2px solid rgba(120,150,185,0.55); border-radius: 50%; background: rgba(8,14,24,0.55); cursor: help; }
.inv-perk-cell img { width: 28px !important; height: 28px !important; border-radius: 50%; object-fit: cover; opacity: 0.5; filter: grayscale(0.5); }
.inv-perk-cell.selected { border-color: #e8ecf2; background: rgba(72,135,186,0.28); }
.inv-perk-cell.selected img { opacity: 1; filter: none; }
.inv-perk-cell.locked img { opacity: 0.3; }
.inv-perk-cell.god { border-color: #29f36a !important; }
.inv-perk-cell.god.selected { box-shadow: 0 0 7px rgba(41,243,106,0.5); }
.inv-perk-cell.near { border-color: #f0b35a !important; }
.inv-perk-cell.near.selected { box-shadow: 0 0 7px rgba(240,179,90,0.4); }
.inv-perk-name { font-size: 9px; line-height: 1.15; color: #cfd7e3; text-align: center; max-width: 56px; overflow-wrap: anywhere; margin-top: auto; }
.inv-perk-cell .pcheck { position: absolute; bottom: -2px; right: 0; color: #29f36a; font-size: 11px; font-weight: 700; text-shadow: 0 0 3px rgba(0,0,0,0.95); }
.inv-perk-cell .pcheck.near { color: #f0b35a; }
.inv-mod-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.inv-mod-socket { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 1px; border: 1px solid #2a3548; border-radius: 4px; background: rgba(255,255,255,0.03); cursor: help; }
.inv-mod-socket img { width: 26px !important; height: 26px !important; border-radius: 3px; object-fit: contain; }
.inv-perk-name { font-size: 10px; color: #c8d0dc; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inv-perk-name.god { color: #29f36a; }
.inv-stat-row { display: grid; grid-template-columns: 108px 1fr 30px; align-items: center; gap: 7px; font-size: 11px; }
.inv-stat-label { color: #a0aabb; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inv-stat-value { color: #e8ecf2; text-align: right; font-weight: 600; }
.inv-stat-bar { position: relative; display: flex; height: 7px; border-radius: 3.5px; background: rgba(255,255,255,0.08); overflow: hidden; }
.inv-stat-bars { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.inv-stat-piecebar { display: flex; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.05); overflow: hidden; }
.inv-stat-piecebar i { display: block; height: 100%; }
.inv-stat-piecebar .base { background: #c8d0dc; }
.inv-stat-piecebar .mod { background: var(--brand); }
.inv-stat-bar span { display: block; height: 100%; border-radius: 3.5px; background: #c8d0dc; flex: none; }
.inv-stat-bar span.high { background: #7ab5e8; }
.inv-stat-bar .seg-mod { background: linear-gradient(90deg, #3f7fbe, #6cb4f5); }
.inv-stat-bar .seg-mw { background: linear-gradient(90deg, #c98a2e, #f0b35a); }
.inv-stat-bar .seg-neg { background: linear-gradient(90deg, #8e2f3c, #e05a6a); }
.inv-stat-mark { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: rgba(255,255,255,0.75); z-index: 2; }
.inv-stat-legend { color: #6d7a8c; font-size: 9px; line-height: 1.4; }
.inv-popup-flavor { margin: 0; color: #a0aabb; font-size: 11px; font-style: italic; line-height: 1.5; }
.inv-popup-notes { color: #29f36a; font-size: 10.5px; }
.inv-popup-near { color: #f0b35a; font-size: 10.5px; line-height: 1.35; overflow-wrap: anywhere; }
.inv-popup-sub { overflow-wrap: anywhere; }
.inv-near-diagnose { border: 1px solid #2a3548; border-radius: 6px; background: rgba(255,255,255,0.02); padding: 4px 7px; }
.inv-near-diagnose > summary { cursor: pointer; color: #9fb0c8; font-size: 10px; }
.inv-near-row { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; border-top: 1px solid #1b2432; color: #9fb0c8; font-size: 10px; }
.inv-near-row strong { color: #e8ecf2; }
.inv-near-row small { color: #6d7a8c; font-size: 9px; }
.inv-popup-owned { color: #7a8494; font-size: 11px; }
/* ---- DIM-Loadout-Drawer (Bottom-Sheet) ---- */
.inv-dw-page { display: flex; flex-direction: column; gap: 10px; }
.inv-dw-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.inv-dw-page-head h3 { margin: 0; font-size: 17px; font-weight: 700; color: #e8ecf2; }
.inv-dw-page-head p { margin: 2px 0 0; font-size: 11.5px; color: #7a8494; }
.inv-dw-page-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.inv-dw-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.inv-dw-card { border: 1px solid #232b3a; border-radius: 9px; background: #10151f; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.inv-dw-card-head { display: flex; align-items: baseline; gap: 8px; }
.inv-dw-card-head strong { color: #e8ecf2; font-size: 14px; }
.inv-dw-card-sub { color: #8ea0b8; font-size: 10.5px; }
.inv-lo-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.inv-lo-search { flex: 1 1 180px; min-width: 120px; height: 27px; padding: 0 9px; border: 1px solid #2a3548; border-radius: 6px; background: #0b1018; color: #e8ecf2; font-size: 11px; outline: none; }
.inv-lo-search:focus { border-color: var(--brand); }
.inv-lo-folders { display: flex; flex-wrap: wrap; gap: 3px; }
.inv-lo-folder { padding: 4px 9px; border: 1px solid #232b3a; border-radius: 999px; background: transparent; color: #9fb0c8; font: inherit; font-size: 10px; cursor: pointer; }
.inv-lo-folder:hover { color: #fff; border-color: var(--brand-line, #2a3548); }
.inv-lo-folder.on { background: rgba(120, 160, 220, 0.16); color: #fff; border-color: var(--brand-line, #2a3548); }
.inv-lo-newfolder { display: flex; gap: 4px; align-items: center; }
.inv-lo-newfolder input { width: 120px; height: 27px; padding: 0 8px; border: 1px solid #2a3548; border-radius: 6px; background: #0b1018; color: #e8ecf2; font-size: 10.5px; outline: none; }
.inv-lo-folder-select { height: 24px; padding: 0 4px; border: 1px solid #2a3548; border-radius: 5px; background: #0b1018; color: #cfd7e3; font: inherit; font-size: 10px; }
.inv-dw-card-tags { display: flex; flex-wrap: wrap; gap: 3px; margin: 2px 0 3px; }
.inv-lo-tag { padding: 2px 7px; border: 1px solid #232b3a; border-radius: 999px; background: transparent; color: #8b9ab0; font: inherit; font-size: 9px; cursor: pointer; }
.inv-loadout-health { margin-left: auto; border: 0; background: transparent; color: #ff9aa7; font: inherit; font-size: 10px; cursor: pointer; }
.inv-loadout-pin { margin-left: auto; border: 1px solid #2a3548; border-radius: 5px; background: transparent; color: #7f8ca0; font: inherit; font-size: 11px; line-height: 1; padding: 2px 6px; cursor: pointer; }
.inv-loadout-pin:hover { color: #f0c66b; border-color: rgba(240, 198, 107, 0.45); }
.inv-loadout-pin.on { color: #ffd479; border-color: rgba(240, 198, 107, 0.65); background: rgba(240, 198, 107, 0.12); }
.inv-loadout-pin + .inv-loadout-health { margin-left: 0; }
.inv-lo-tag.suggest { border-style: dashed; color: #cfe0f2; }
.inv-lo-tag.on { border-color: #4a6f9e; background: rgba(74, 111, 158, 0.18); color: #dbe7f6; }
.cmd-palette { position: fixed; inset: 0; z-index: 9000; display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 16px; background: rgba(4, 8, 14, 0.62); }
.cmd-palette.hidden { display: none; }
.cmd-box { width: min(640px, 100%); border: 1px solid #2a3548; border-radius: 12px; background: #0d121b; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55); overflow: hidden; }
.cmd-input { width: 100%; box-sizing: border-box; height: 46px; padding: 0 16px; border: 0; border-bottom: 1px solid #1b2432; background: #0b1018; color: #eef2f8; font: inherit; font-size: 14px; outline: none; }
.cmd-list { max-height: 46vh; overflow-y: auto; padding: 4px; }
.cmd-entry { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 9px 12px; border: 0; border-radius: 7px; background: transparent; color: #cfd9e8; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.cmd-entry:hover, .cmd-entry.on { background: rgba(120, 160, 220, 0.15); color: #fff; }
.cmd-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmd-hint { flex: 0 0 auto; color: #7f8ea3; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
.cmd-empty { padding: 14px; color: #7f8ea3; font-size: 11px; }
.cmd-foot { display: flex; justify-content: space-between; gap: 8px; padding: 7px 12px; border-top: 1px solid #1b2432; color: #6f7d92; font-size: 9px; }
.wn-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 14px 16px 8px; border-bottom: 1px solid #1b2432; }
.wn-head strong { color: #eef2f8; font-size: 15px; }
.wn-head span { color: #7f8ea3; font-size: 10px; }
.wn-list { display: flex; flex-direction: column; padding: 6px; max-height: 52vh; overflow-y: auto; }
.wn-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; }
.wn-item:hover { background: rgba(120, 160, 220, 0.1); }
.wn-copy { flex: 1; min-width: 0; }
.wn-copy strong { display: block; color: #dbe3ee; font-size: 12px; }
.wn-copy small { display: block; color: #8b9ab0; font-size: 10px; line-height: 1.4; }
.wn-foot { display: flex; justify-content: flex-end; padding: 9px 12px; border-top: 1px solid #1b2432; }
.cmp-box { max-width: 560px; }
.cmp-selects { display: flex; gap: 6px; padding: 10px 12px; }
.cmp-selects select { flex: 1; min-width: 0; height: 28px; padding: 0 6px; border: 1px solid #2a3548; border-radius: 6px; background: #0b1018; color: #e8ecf2; font: inherit; font-size: 11px; }
.cmp-body { max-height: 60vh; overflow-y: auto; padding: 0 12px 12px; }
.cmp-table { display: flex; flex-direction: column; gap: 2px; }
.cmp-row { display: grid; grid-template-columns: minmax(0, 1fr) 84px 84px; gap: 6px; padding: 3px 6px; border-radius: 5px; background: rgba(255,255,255,0.02); font-size: 11px; }
.cmp-row span { color: #9fb0c8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-row b { color: #dbe3ee; text-align: right; font-weight: 600; }
.cmp-row b.better { color: #5fe0a0; }
.cmp-row b.worse { color: #ff9aa7; }
.cmp-head { background: rgba(120, 160, 220, 0.1); }
.cmp-head span { color: #7f8ea3; text-transform: uppercase; font-size: 9px; }
.cmp-sub { margin: 8px 0 3px; color: #7f8ea3; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
.cmp-empty { padding: 12px; color: #7f8ea3; }
.inv-dw-card-items { display: flex; gap: 3px; flex-wrap: wrap; min-height: 42px; align-items: center; }
.inv-dw-card-tile { width: 40px; height: 40px; border: 1px solid #2a3548; border-radius: 5px; overflow: hidden; background: #0b1018; display: inline-flex; }
.inv-dw-card-tile img { width: 100%; height: 100%; object-fit: cover; }
.inv-dw-card-meta { color: #7a8494; font-size: 10.5px; }
.inv-dw-card-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.inv-dw-empty { border: 1px dashed #2a3548; border-radius: 9px; padding: 30px; text-align: center; color: #7a8494; }
.inv-dw-backdrop { position: fixed; inset: 0; z-index: 240; background: rgba(2, 6, 12, 0.66); display: flex; align-items: flex-end; justify-content: center; }
.inv-dw-backdrop.hidden { display: none; }
.inv-dw { position: relative; width: min(940px, 98vw); max-height: 93vh; background: #0f141d; border: 1px solid #2a3548; border-bottom: 0; border-radius: 14px 14px 0 0; box-shadow: 0 -18px 60px rgba(0,0,0,0.65); display: flex; flex-direction: column; animation: invDwUp 0.22s cubic-bezier(0.2, 0.8, 0.3, 1); }
@keyframes invDwUp { from { transform: translateY(60px); opacity: 0.45; } to { transform: translateY(0); opacity: 1; } }
.inv-dw-head { flex-shrink: 0; display: flex; gap: 12px; align-items: flex-start; padding: 12px 18px 9px; border-bottom: 1px solid #1c2534; }
.inv-dw-title { flex: 1; min-width: 0; }
.inv-dw-name { width: 100%; background: transparent; border: 0; border-bottom: 1px solid #2a3548; color: #f2f5fa; font-size: 19px; font-weight: 700; padding: 2px 0 5px; outline: none; }
.inv-dw-name:focus { border-bottom-color: var(--brand); }
.inv-dw-notes { margin-top: 4px; }
.inv-dw-notes summary { cursor: pointer; color: #8ea0b8; font-size: 11px; user-select: none; }
.inv-dw-notes summary:hover { color: #c7d1e0; }
.inv-dw-notes textarea { width: 100%; min-height: 54px; margin-top: 5px; background: #0b1018; color: #dbe4f0; border: 1px solid #2a3548; border-radius: 6px; padding: 6px 8px; font-size: 12px; resize: vertical; box-sizing: border-box; }
.inv-dw-head-right { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.inv-dw-char { height: 27px; font-size: 11.5px; padding: 0 6px; border-radius: 5px; border: 1px solid #2a3548; background: #10151f; color: #e8ecf2; }
.inv-dw-body { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 18px 12px; }
.inv-dw-section { border-bottom: 1px solid #18202d; padding: 10px 0; }
.inv-dw-section:last-of-type { border-bottom: 0; }
.inv-dw-sec-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.inv-dw-sec-title { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #8ea0b8; }
.inv-dw-sec-actions { margin-left: auto; display: flex; gap: 5px; flex-wrap: wrap; }
.inv-dw-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
.inv-dw-slotwrap { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 62px; }
.inv-dw-tile { position: relative; width: 56px; height: 56px; border-radius: 7px; border: 1px solid #2a3548; background: #151b26; padding: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; box-sizing: border-box; }
.inv-dw-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.inv-dw-tile:hover { border-color: var(--brand); }
.inv-dw-tile.empty { color: #5c6a80; border-style: dashed; }
.inv-dw-tile.round { border-radius: 50%; width: 44px; height: 44px; }
.inv-dw-plus { font-size: 22px; line-height: 1; color: #5c6a80; }
.inv-dw-letter { font-size: 20px; line-height: 1; font-weight: 700; color: var(--brand-soft); }
.inv-dw-tile-x { position: absolute; top: 1px; right: 1px; width: 16px; height: 16px; border-radius: 50%; background: rgba(0,0,0,0.78); color: #ff9b8f; font-size: 10px; line-height: 16px; text-align: center; border: 0; cursor: pointer; opacity: 0; transition: opacity 0.1s; }
.inv-dw-tile:hover .inv-dw-tile-x { opacity: 1; }
.inv-dw-slotlabel { font-size: 9px; color: #7a8494; text-align: center; max-width: 62px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-dw-power { font-size: 9px; color: #f5d76a; }
.inv-dw-focus { display: flex; gap: 12px; align-items: flex-start; }
.inv-dw-focus-icon { flex-shrink: 0; }
.inv-dw-focus-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.inv-dw-subrow { display: flex; align-items: flex-start; gap: 8px; }
.inv-dw-subrow-label { flex-shrink: 0; width: 62px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #6f7d92; padding-top: 16px; }
.inv-dw-armor-row { gap: 10px; }
.inv-dw-armor-slot { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.inv-dw-modrow { display: flex; gap: 2px; justify-content: center; flex-wrap: wrap; max-width: 64px; }
.inv-dw-mod { width: 17px; height: 17px; border-radius: 3px; border: 1px solid #334159; background: #0b1018; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; font-size: 10px; color: #6f7d92; }
.inv-dw-mod img { width: 100%; height: 100%; object-fit: cover; }
.inv-dw-mod:hover { border-color: var(--brand); }
.inv-dw-mod.empty { border-style: dashed; }
.inv-dw-mod.assigned { border-color: #29f36a; }
.inv-dw-statbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 9px 0 2px; margin-top: 6px; border-top: 1px solid #18202d; }
.inv-dw-stat { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #cfd7e3; }
.inv-dw-stat img { width: 14px; height: 14px; filter: brightness(1.7); }
.inv-dw-stat b { font-size: 11.5px; color: #e8ecf2; }
.inv-dw-stat.power { color: #f5d76a; font-weight: 700; }
/* Armor-3.0-Statbalken: Charakter 0–200, Rüstungsteil 0–45 (DIM). */
.inv-stat-meter { position: relative; display: inline-block; width: 92px; height: 7px; border-radius: 4px; background: #131c28; box-shadow: inset 0 0 0 1px #223043; overflow: hidden; }
.inv-stat-meter .base { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #3f7fbe, #6cb4f5); }
.inv-dw-hint { margin: 6px 0 0; color: #6f7d92; font-size: 10.5px; line-height: 1.45; }
.inv-dw-inputgroup { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 12px 0 4px; }
.inv-dw-check { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #c7d1e0; cursor: pointer; }
.inv-dw-check input { width: 14px; height: 14px; }
.inv-dw-foot { flex-shrink: 0; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding: 10px 18px 14px; border-top: 1px solid #1c2534; background: #0d121b; border-radius: 0 0 0 0; }
.inv-dw-foot-hint { color: #6f7d92; font-size: 10.5px; }
.inv-dw-foot-check { font-size: 10px; white-space: nowrap; padding: 1px 7px; border-radius: 999px; }
.inv-dw-foot-check.ok { color: #5fe0a0; background: rgba(95, 224, 160, 0.1); }
.inv-dw-foot-check.warn { color: #ff9aa7; background: rgba(255, 122, 138, 0.12); }
.inv-dw-energy { display: inline-block; margin-top: 1px; padding: 0 5px; border-radius: 999px; background: rgba(0,0,0,0.32); color: #93a2b8; font-size: 8px; white-space: nowrap; }
.inv-dw-energy.over { background: rgba(255,80,100,0.24); color: #ffb3bd; }
.inv-dw-diff { display: flex; flex-direction: column; gap: 2px; }
.inv-dw-diff-row { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 3px 5px; border-radius: 5px; background: rgba(255,255,255,0.02); font-size: 10px; }
.inv-dw-diff-row span { color: #7f8ea3; }
.inv-dw-diff-row strong { color: #dbe3ee; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inv-dw-diff-row small { color: #7f8ea3; }
.inv-dw-diff-row em { font-style: normal; font-size: 9px; color: #8b9ab0; white-space: nowrap; }
.inv-dw-diff-row.ok em { color: #5fe0a0; }
.inv-dw-diff-row.warn em { color: #ff9aa7; }
.inv-dw-sheet { position: absolute; inset: 0; z-index: 3; background: rgba(4, 8, 14, 0.6); display: flex; align-items: flex-end; border-radius: 14px 14px 0 0; }
.inv-dw-sheet.hidden { display: none; }
.inv-dw-sheet-inner { width: 100%; max-height: 90%; background: #0d121b; border-top: 1px solid #2a3548; border-radius: 12px 12px 0 0; display: flex; flex-direction: column; animation: invDwUp 0.18s ease-out; }
.inv-dw-sheet-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #1b2432; color: #e8ecf2; font-size: 13px; }
.inv-dw-sheet-body { overflow-y: auto; padding: 10px 16px 16px; }
.inv-dw-sheet-foot { display: flex; justify-content: flex-end; gap: 6px; padding: 8px 16px 12px; border-top: 1px solid #1b2432; }
.inv-dw-search { width: 100%; box-sizing: border-box; height: 30px; margin-bottom: 8px; padding: 0 10px; border-radius: 6px; border: 1px solid #2a3548; background: #0b1018; color: #e8ecf2; font-size: 12px; outline: none; }
.inv-dw-search:focus { border-color: var(--brand); }
.inv-dw-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px; }
.inv-dw-pick { display: flex; align-items: center; gap: 8px; padding: 5px 7px; border: 1px solid #232b3a; border-radius: 7px; background: #111722; color: #e8ecf2; cursor: pointer; text-align: left; min-width: 0; }
.inv-dw-pick:hover { border-color: var(--brand); background: #16202e; }
.inv-dw-pick.on { border-color: #29f36a; background: rgba(41, 243, 106, 0.08); }
.inv-dw-pick[disabled] { opacity: 0.45; cursor: not-allowed; }
.inv-dw-pick img { width: 34px; height: 34px; border-radius: 4px; flex-shrink: 0; object-fit: cover; }
.inv-dw-pick-noicon { width: 34px; height: 34px; border-radius: 4px; background: #1a2230; flex-shrink: 0; }
.inv-dw-pick-text { display: flex; flex-direction: column; min-width: 0; }
.inv-dw-pick-name { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-dw-pick-sub { font-size: 9.5px; color: #7a8494; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-dw-opt { display: flex; flex-direction: column; gap: 8px; }
.inv-dw-presets { display: flex; gap: 5px; flex-wrap: wrap; }
.inv-dw-optweights { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 14px; }
.inv-dw-optrow { display: grid; grid-template-columns: 92px 1fr 18px; align-items: center; gap: 8px; font-size: 11px; color: #c7d1e0; }
.inv-dw-optrow input[type=range] { width: 100%; accent-color: var(--brand); }
.inv-dw-optval { text-align: right; color: #e8ecf2; font-weight: 600; }
.inv-dw-opt-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.inv-dw-opt-result { margin-top: 10px; padding-top: 10px; border-top: 1px solid #1b2432; }
.inv-dw-optset { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.inv-dw-fashion-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #18202d; }
.inv-dw-fashion-label { width: 92px; flex-shrink: 0; font-size: 11px; color: #c7d1e0; }
.inv-dw-fashion-armor { width: 42px; height: 42px; border-radius: 5px; border: 1px solid #2a3548; object-fit: cover; flex-shrink: 0; }
.inv-dw-fashion-armor.empty { background: #151b26; }
.inv-dw-fashion-plug { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 4px 7px; border: 1px solid #232b3a; border-radius: 6px; background: #111722; }
.inv-dw-fashion-plug img { width: 28px; height: 28px; border-radius: 4px; flex-shrink: 0; }
.inv-dw-fashion-plug.empty { border-style: dashed; color: #6f7d92; }
.inv-dw-fashion-plugname { font-size: 10.5px; color: #c7d1e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Filter-Menü am Suchfeld */
.inv-filter-menu { position: fixed; z-index: 9400; max-height: 70vh; overflow: auto; padding: 10px 12px 12px; border: 1px solid #2a3548; border-radius: 10px; background: #0d121b; box-shadow: 0 18px 50px rgba(0,0,0,0.55); }
.inv-filter-menu.hidden { display: none; }
.inv-filter-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.inv-filter-head strong { font-size: 12px; color: #e8ecf2; }
.inv-filter-section { padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.06); }
.inv-filter-title { display: block; margin-bottom: 5px; color: #8b9ab0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
.inv-filter-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.inv-filter-chip { padding: 3px 8px; border: 1px solid #2a3548; border-radius: 999px; background: transparent; color: #c7d1e0; font: inherit; font-size: 10.5px; cursor: pointer; }
.inv-filter-chip:hover { border-color: #4a6f9e; color: #fff; }
.inv-filter-saved { display: inline-flex; align-items: center; gap: 2px; }
.inv-filter-x { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,0.06); color: #8b9ab0; font: inherit; font-size: 11px; line-height: 1; cursor: pointer; }
.inv-filter-x:hover { background: rgba(255,120,120,0.2); color: #ff9aa7; }
.inv-filter-add { display: flex; gap: 6px; }
.inv-filter-add input { flex: 1; min-width: 0; height: 26px; padding: 0 7px; border: 1px solid #2a3548; border-radius: 5px; background: rgba(0,0,0,0.35); color: #e8ecf2; font: inherit; font-size: 11px; }
.inv-filter-foot { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); }
.inv-filter-hint { color: #7f8ea3; font-size: 9.5px; }

/* Fortschritt beim Anwenden */
.inv-apply-progress { position: fixed; right: 18px; bottom: 18px; z-index: 9600; width: 300px; padding: 10px 12px 12px; border: 1px solid #2a3548; border-radius: 10px; background: #0d121b; box-shadow: 0 18px 50px rgba(0,0,0,0.55); opacity: 0; transform: translateY(8px); transition: opacity 0.2s, transform 0.2s; }
.inv-apply-progress.show { opacity: 1; transform: none; }
.inv-apply-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.inv-apply-row strong { font-size: 11.5px; color: #e8ecf2; }
.inv-apply-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; }
.inv-apply-bar span { display: block; height: 100%; background: var(--accent, #ff4655); transition: width 0.2s; }
.inv-apply-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 5px; color: #8b9ab0; font-size: 9.5px; }
.inv-apply-meta [data-apply-current] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

let styleInjected = false;
function injectCss() {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.id = 'dinvCss';
  style.textContent = INVENTORY_CSS;
  document.head.appendChild(style);
  styleInjected = true;
}

// ============================================================
// Haupt-Factory
// ============================================================
export function createInventory(ctx) {
  const { api, qs, toast, escapeHtml, getCfg, setConfig, togglePage } = ctx;
  injectCss();

  const view = qs('#inventoryView');
  const body = qs('#inventoryBody');
  // Im E2E-Test wird das komplette DOM erwartet; dort keine Lazy-Zeilen.
  // (Die Testseite setzt window.__D2_E2E.)
  // Progressive Darstellung: weit entfernte Inventarzeilen werden erst
  // beim Scrollen aufgebaut. Das hält den ersten Aufbau bei 1.000+
  // Items deutlich schneller.
  let lazyRowObserver = null;
  const lazyRowHtml = new WeakMap();
  // Große, vollständig aufgeklappte Listen werden in 120er-Blöcken
  // nachgeladen. Zusammen mit der festen Kachelhöhe und
  // content-visibility bleibt das Scrollen auch bei 1.700+ Items flüssig.
  const CHUNK_SIZE = 120;
  const chunkedLists = new Map();
  let chunkObserver = null;
  function chunkingEnabled() {
    return !window.__D2_E2E
      && !document.body.classList.contains('pad-active')
      && !searchActive
      && typeof IntersectionObserver === 'function';
  }
  // Reine Fenster-Rechnung: welcher Block kommt als Nächstes, gibt es mehr?
  function chunkPlan(total, rendered, size = CHUNK_SIZE) {
    const end = Math.min(total, rendered + size);
    return { end, more: end < total };
  }
  function chunkMoreButton(key, rendered, total) {
    const plan = chunkPlan(total, rendered);
    if (rendered >= total) return '';
    return `<button type="button" class="dinv-more" data-inv-chunk-more="${esc(key)}">Weitere ${plan.end - rendered} laden (${rendered}/${total})</button>`;
  }
  function appendChunk(key) {
    const state = chunkedLists.get(key);
    if (!state || !body) return;
    const container = body.querySelector(`[data-inv-chunk="${CSS.escape(key)}"]`);
    if (!container) return;
    const oldButton = container.querySelector('[data-inv-chunk-more]');
    if (oldButton) oldButton.remove();
    const next = state.items.slice(state.rendered, chunkPlan(state.items.length, state.rendered).end);
    if (!next.length) return;
    container.insertAdjacentHTML('beforeend',
      next.map((item) => tileHtml(item, state.kind, state.owner)).join('') +
      chunkMoreButton(key, state.rendered + next.length, state.items.length));
    state.rendered += next.length;
    const nextButton = container.querySelector('[data-inv-chunk-more]');
    if (!nextButton || !chunkObserver) return;
    chunkObserver.observe(nextButton);
    // Wenn der neue Block noch im Ladebereich liegt (hoher Viewport),
    // direkt weiterfüllen – aber nur innerhalb des nächsten Frames.
    requestAnimationFrame(() => {
      if (!nextButton.isConnected) return;
      const buttonRect = nextButton.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      if (buttonRect.top - bodyRect.top < body.clientHeight + 900) appendChunk(key);
    });
  }
  function initChunkLists() {
    if (chunkObserver) {
      chunkObserver.disconnect();
      chunkObserver = null;
    }
    if (!body || !chunkingEnabled()) return;
    const buttons = [...body.querySelectorAll('[data-inv-chunk-more]')];
    if (!buttons.length) return;
    chunkObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const key = String(entry.target.dataset.invChunkMore || '');
        if (key) appendChunk(key);
        chunkObserver.unobserve(entry.target);
      }
    }, { root: body, rootMargin: '900px 0px' });
    buttons.forEach((button) => chunkObserver.observe(button));
  }
  function applyLazyInventoryRows() {
    if (lazyRowObserver) {
      lazyRowObserver.disconnect();
      lazyRowObserver = null;
    }
    if (!body || window.__D2_E2E || document.body.classList.contains('pad-active')) return;
    if (selectedItem) return;
    // Bei aktiver Suche müssen alle Treffer im DOM sein, damit der
    // erste Treffer gefunden und fokussiert werden kann.
    if (searchActive) return;
    if (typeof IntersectionObserver !== 'function') return;
    const rows = [...body.querySelectorAll('.dinv-row')].filter((row) => !row.classList.contains('dinv-head-row') && !row.querySelector('[data-inv-chunk]'));
    if (rows.length < 5) return;
    lazyRowObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const row = entry.target;
        const html = lazyRowHtml.get(row);
        if (html != null) {
          row.innerHTML = html;
          lazyRowHtml.delete(row);
        }
        lazyRowObserver.unobserve(row);
      }
    }, { root: body, rootMargin: '700px 0px' });
    rows.forEach((row, index) => {
      if (index < 4) return;
      const html = row.innerHTML;
      if (!html.trim()) return;
      lazyRowHtml.set(row, html);
      row.style.contentVisibility = 'visible';
      row.innerHTML = '<div class="dinv-lazy-row" aria-hidden="true"></div>';
      lazyRowObserver.observe(row);
    });
  }
  const searchInput = qs('#inventorySearch');
  const toolbar = document.querySelector('.inventory-toolbar');
  const inventoryHeadControls = document.querySelector('.inventory-head-controls');
  const inventoryStatusEl = qs('#inventoryStatus');
  const refreshBtn = qs('#inventoryRefresh');
  const closeBtn = qs('#inventoryCloseBtn');
  const loadoutNameInput = qs('#inventoryLoadoutName');
  const loadoutCharSelect = qs('#inventoryLoadoutChar');
  const loadoutSaveBtn = qs('#inventoryLoadoutSave');
  const loadoutList = qs('#inventoryLoadoutList');
  const resultBox = qs('#inventoryResult');
  const loadoutQueueBar = qs('#loadoutQueueBar');
  const loadoutQueueText = qs('#loadoutQueueText');
  const loadoutQueuePanel = qs('#loadoutQueuePanel');
  const loadoutQueueList = qs('#loadoutQueueList');
  const outboxBar = qs('#inventoryOutbox');
  const outboxText = qs('#inventoryOutboxText');
  const outboxPanel = qs('#inventoryOutboxPanel');
  const outboxList = qs('#inventoryOutboxList');
  const championAuditPanel = qs('#championAuditPanel');
  const championAuditList = qs('#championAuditList');
  const tooltipEl = qs('#inventoryTooltip');
  const inventoryBtn = qs('#inventoryBtn');
  const godrollBtn = qs('#inventoryGodrollFilter');
  const championAuditBtn = qs('#inventoryChampionAudit');
  const wishlistBtn = qs('#inventoryWishlistRefresh');
  const duplicatesBtn = qs('#inventoryDuplicatesBtn');
  const searchOnlyBtn = qs('#inventorySearchOnly');
  let searchOnly = true;
  try { searchOnly = window.localStorage.getItem('d2inv.searchOnly') !== '0'; } catch (error) { /* egal */ }
  const searchState = { godrollOnly: false };
  let searchSortOverride = '';
  let searchActive = false;
  let searchMatchKeys = new Set();
  // Echter Such-Worker: einfache Freitext-Suchen laufen im Hintergrund.
  // Die Ergebnisse werden pro Datenstand/Query gecacht; bis dahin nutzt
  // der Renderer die synchrone Suche als Fallback.
  let searchWorker = null;
  let searchWorkerJob = 0;
  let searchWorkerDisabled = false;
  const searchWorkerCache = new Map();
  const searchDataIds = new WeakMap();
  let searchDataSeq = 0;
  function searchDataVersion(source) {
    if (!source) return 0;
    if (!searchDataIds.has(source)) searchDataIds.set(source, ++searchDataSeq);
    return searchDataIds.get(source);
  }
  // Aufgeklappte Tresor-Zellen (Waffen-/Rüstungs-Slot oder Bucket).
  // Aufgeklappte Tresor-Zellen bleiben über Neustarts erhalten.
  const expandedVaults = new Set();
  // Große Buckets rendern zuerst nur ein Fenster; „weitere anzeigen“
  // erweitert die Liste ohne die komplette Seite neu zu bauen.
  const expandedTileLists = new Set();
  try {
    const stored = JSON.parse(window.localStorage.getItem('d2inv.expandedVaults') || '[]');
    if (Array.isArray(stored)) {
      for (const key of stored) {
        if (typeof key === 'string' && key) expandedVaults.add(key);
      }
    }
  } catch (error) {
    // egal
  }
  function persistExpandedVaults() {
    try {
      window.localStorage.setItem('d2inv.expandedVaults', JSON.stringify([...expandedVaults]));
    } catch (error) {
      // egal
    }
  }
  let vaultResizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(vaultResizeTimer);
    vaultResizeTimer = setTimeout(applyVaultCollapse, 150);
  });

  // Gemerkte Suchen als Chips unter der Toolbar (Suchfeld bleibt klein).
  let searchChips = null;
  if (searchInput && searchInput.parentNode) {
    searchChips = document.createElement('div');
    searchChips.className = 'dinv-searchchips';
    const toolbar = searchInput.closest('.inventory-toolbar');
    if (toolbar && toolbar.parentNode) toolbar.parentNode.insertBefore(searchChips, toolbar.nextSibling);
    else searchInput.parentNode.insertBefore(searchChips, searchInput.nextSibling);
  }
  // Sichtbare Legende für Element- und Champion-Kürzel auf den Kacheln.
  // Wird hier erzeugt (statt nur im HTML), damit sie auch in Tests und
  // eingebetteten Inventar-Ansichten vorhanden ist.
  let legendEl = document.getElementById('inventoryLegend');
  if (!legendEl) {
    legendEl = document.createElement('div');
    legendEl.id = 'inventoryLegend';
    legendEl.className = 'inventory-legend';
    legendEl.setAttribute('role', 'note');
    legendEl.setAttribute('aria-label', 'Legende für Element- und Champion-Kürzel');
    legendEl.innerHTML = '<span>Waffen: Element-Kürzel unter dem Bild (KIN, ARC, SOL, LEER, STAS, STR)</span>' +
      '<span>Champion (aus Waffenrahmen): <b>B</b> Barriere · <b>Ü</b> Überladung · <b>U</b> Unaufhaltsam</span>' +
      '<span>Details im Tooltip</span>';
    const statusEl = document.getElementById('inventoryStatus');
    if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(legendEl, statusEl.nextSibling);
    else if (searchChips && searchChips.parentNode) searchChips.parentNode.insertBefore(legendEl, searchChips.nextSibling);
    const viewEl = document.getElementById('inventoryView');
    if (viewEl) viewEl.setAttribute('aria-describedby', 'inventoryLegend');
  }
  try {
    const lastSearch = window.localStorage.getItem('d2inv.lastSearch');
    if (lastSearch && searchInput && !searchInput.value) searchInput.value = lastSearch;
  } catch (error) {
    // egal
  }
  function savedSearches() {
    const bungie = getCfg().bungie || {};
    return Array.isArray(bungie.savedSearches) ? bungie.savedSearches.slice(0, 8) : [];
  }
  function setSavedSearches(list) {
    setConfig({ bungie: { savedSearches: list.slice(0, 8) } });
    renderSearchChips();
  }
  function activeSearchTokens(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    const tokens = [];
    const pattern = /"([^"]+)"|(\S+)/g;
    let match;
    while ((match = pattern.exec(text))) tokens.push(match[1] ? `"${match[1]}"` : match[2]);
    return tokens.slice(0, 8);
  }

  function renderSearchChips() {
    if (!searchChips) return;
    const current = String((searchInput && searchInput.value) || '').trim();
    const chips = savedSearches().map(
      (query) => `<button type="button" class="dinv-searchchip${query === current ? ' on' : ''}" data-search-chip="${esc(query)}" title="Klick: anwenden · Rechtsklick: entfernen">${esc(query)}</button>`
    );
    chips.unshift('<button type="button" class="dinv-searchchip" data-search-save title="Aktuelle Suche merken">☆ merken</button>');
    activeSearchTokens(current).forEach((token, index) => {
      chips.push(`<button type="button" class="dinv-searchchip active" data-search-remove="${index}" title="Filter entfernen: ${esc(token)}">${esc(token)} ✕</button>`);
    });
    for (const [label, query] of [['Godrolls', 'is:godroll'], ['20+ Spike', 'is:spike20'], ['Exoten', 'is:exotic'], ['T5', 'is:tier5'], ['Armor 3.0', 'is:armor3.0'], ['Wunsch', 'is:armorwish'], ['Stat-Dupes', 'dupe:stats'], ['Schlechter', 'is:statlower'], ['Notizen', 'is:noted'], ['Ohne Champion', 'is:nochamp']]) {
      chips.push(`<button type="button" class="dinv-searchchip preset${query === current ? ' on' : ''}" data-search-chip="${query}" title="${label}: ${query}">${label}</button>`);
    }
    searchChips.innerHTML = chips.join('');
  }

  // ---------- Mehrfachauswahl ----------
  const selectBar = document.createElement('div');
  selectBar.className = 'dinv-selectbar';
  selectBar.hidden = true;
  if (body && body.parentNode) body.parentNode.insertBefore(selectBar, body);

  const undoBar = document.createElement('div');
  undoBar.className = 'dinv-undobar';
  undoBar.hidden = true;
  if (body && body.parentNode) body.parentNode.insertBefore(undoBar, body);
  let undoAction = null;

  function setUndo(label, run, redo) {
    undoAction = { label, run };
    if (typeof redo === 'function') recordJournal(label, run, redo);
    undoBar.hidden = false;
    undoBar.innerHTML = `<span>${esc(label)}</span><button type="button" class="btn primary small" data-undo-run>Rückgängig</button><button type="button" class="btn ghost small" data-undo-close>✕</button>`;
  }

  function clearUndo() {
    undoAction = null;
    undoBar.hidden = true;
    undoBar.innerHTML = '';
  }

  undoBar.addEventListener('click', async (event) => {
    if (event.target.closest('[data-undo-close]')) { clearUndo(); return; }
    if (!event.target.closest('[data-undo-run]') || !undoAction) return;
    const action = undoAction;
    clearUndo();
    try {
      await action.run();
      toast('Aktion rückgängig gemacht.', 'success', 1800);
    } catch (error) {
      toast(error.message || String(error), 'error', 2600);
    }
  });

  function tileKey(tile) {
    return `${tile.dataset.invKind || ''}:${tile.dataset.invOwner || ''}:${tile.dataset.invSelect || ''}`;
  }
  function selectionEntries() {
    return [...selection.values()];
  }
  function updateSelectionUi() {
    if (body) {
      for (const tile of body.querySelectorAll('[data-inv-select]')) {
        tile.classList.toggle('multi', selection.has(tileKey(tile)));
      }
    }
    const count = selection.size;
    selectBar.hidden = count === 0;
    if (!count) {
      selectBar.innerHTML = '';
      return;
    }
    const canVault = selectionEntries().some((entry) => entry.kind === 'backpack' && entry.owner);
    selectBar.innerHTML =
      `<strong>${count} ausgewählt</strong>` +
      `<button type="button" class="btn ghost small" data-sel-action="vault" ${canVault ? '' : 'disabled'}>→ Tresor</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="lock">Markieren</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="favorite">★ Favorit</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="tag-keep">Tag: Behalten</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="tag-junk">Tag: Aussortieren</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="tag-clear">Tag löschen</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="stripmods">Mods entpacken</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="select-safe">Nicht-Favoriten</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="select-matches">Alle Treffer</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="compare">Vergleichen</button>` +
      `<button type="button" class="btn ghost small" data-sel-action="clear">Aufheben</button>`;
  }
  selectBar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-sel-action]');
    if (!action) return;
    const kind = String(action.dataset.selAction || '');
    if (kind === 'clear') {
      selection.clear();
      updateSelectionUi();
    } else if (kind === 'vault') {
      batchMoveToVault();
    } else if (kind === 'lock') {
      batchLock();
    } else if (kind === 'favorite') {
      batchFavorite();
    } else if (kind === 'tag-keep' || kind === 'tag-junk' || kind === 'tag-pve' || kind === 'tag-pvp' || kind === 'tag-clear') {
      batchTag(kind === 'tag-clear' ? '' : kind.replace('tag-', ''));
    } else if (kind === 'stripmods') {
      batchStripMods();
    } else if (kind === 'select-safe') {
      selectNonFavorites();
    } else if (kind === 'select-matches') {
      selectMatching();
    } else if (kind === 'compare') {
      batchCompare();
    }
  });

  function selectNonFavorites() {
    if (!body) return;
    selection.clear();
    for (const tile of body.querySelectorAll('[data-inv-select]')) {
      const item = findItem(String(tile.dataset.invSelect || ''), String(tile.dataset.invKind || ''), String(tile.dataset.invOwner || ''));
      if (!item || !item.instanceId) continue;
      if (isFav(item) || item.godRoll) continue;
      selection.set(tileKey(tile), { item, kind: String(tile.dataset.invKind || ''), owner: String(tile.dataset.invOwner || '') });
    }
    updateSelectionUi();
  }

  function batchTag(tag) {
    const entries = selectionEntries().filter((entry) => entry.item && (entry.item.instanceId || entry.item.hash));
    if (!entries.length) return;
    const previous = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
    const tags = { ...previous };
    for (const entry of entries) {
      const key = String(entry.item.instanceId || entry.item.hash || '');
      if (!key) continue;
      if (tag) tags[key] = tag;
      else delete tags[key];
    }
    setConfig({ bungie: { itemTags: tags } });
    try {
      window.localStorage.setItem('d2inv.undoTags', JSON.stringify({ at: Date.now(), label: `${entries.length} getaggt`, previous }));
      let history = [];
      try { history = JSON.parse(window.localStorage.getItem('d2inv.undoHistory') || '[]'); } catch (error) { history = []; }
      history.unshift({ at: Date.now(), label: `${entries.length} Items getaggt`, previous });
      window.localStorage.setItem('d2inv.undoHistory', JSON.stringify(history.slice(0, 10)));
    } catch (error) { /* egal */ }
    setUndo(`${entries.length} Item${entries.length === 1 ? '' : 's'} getaggt`, () => {
      setConfig({ bungie: { itemTags: { ...previous } } });
      render();
    }, () => {
      setConfig({ bungie: { itemTags: { ...tags } } });
      render();
    });
    toast(tag ? `${entries.length} Item(s) mit Tag „${tag}“ markiert.` : `${entries.length} Tag(s) entfernt.`, 'success', 2200);
    updateSelectionUi();
    render();
  }

  function batchFavorite() {
    const entries = selectionEntries().filter((entry) => entry.item && (entry.item.instanceId || entry.item.hash));
    if (!entries.length) return;
    const previous = { ...(((getCfg().bungie && getCfg().bungie.favs) || {})) };
    const favs = { ...previous };
    for (const entry of entries) {
      const key = String(entry.item.instanceId || entry.item.hash || '');
      if (key) favs[key] = true;
    }
    setConfig({ bungie: { favs } });
    setUndo(`${entries.length} Favorit${entries.length === 1 ? '' : 'en'} markiert`, () => {
      const current = { ...(((getCfg().bungie && getCfg().bungie.favs) || {})) };
      const patch = { ...previous };
      for (const key of Object.keys(current)) {
        if (!previous[key]) patch[key] = false;
      }
      setConfig({ bungie: { favs: patch } });
      render();
    }, () => {
      setConfig({ bungie: { favs: { ...favs } } });
      render();
    });
    toast(`${entries.length} Item${entries.length === 1 ? '' : 's'} als Favorit markiert.`, 'success', 1800);
    selection.clear();
    updateSelectionUi();
    render();
  }

  function selectMatching() {
    if (!body) return;
    selection.clear();
    for (const tile of body.querySelectorAll('[data-inv-select]')) {
      if (tile.classList.contains('inv-dim')) continue;
      const item = findItem(String(tile.dataset.invSelect || ''), String(tile.dataset.invKind || ''), String(tile.dataset.invOwner || ''));
      if (!item) continue;
      selection.set(tileKey(tile), { item, kind: String(tile.dataset.invKind || ''), owner: String(tile.dataset.invOwner || '') });
    }
    updateSelectionUi();
  }

  function emptyPlugCandidates(item, socketIndex) {
    const sockets = ((data && data.sockDefs && data.sockDefs[String(item.hash)]) || []);
    const entry = sockets.find((socket) => Number(socket.idx) === Number(socketIndex));
    const plugs = (entry && entry.plugs) || [];
    const empties = plugs
      .filter((plug) => /^(Leere Mod-Fassung|Leere Tuning-Mod-Fassung|Artefakt-Mod leer)$/i.test(String((plug && plug.n) || '').trim()))
      .map((plug) => Number(plug && plug.h) || 0)
      .filter(Boolean);
    return [...new Set(empties)];
  }

  async function batchStripMods() {
    if (!data) return;
    const entries = selectionEntries().filter((entry) =>
      entry.item && entry.item.instanceId &&
      (entry.kind === 'backpack' || entry.kind === 'equipped') && entry.owner
    );
    if (!entries.length) {
      toast('Nur Items auf einem Charakter können Mods verlieren.', 'info', 2800);
      return;
    }
    const plan = [];
    for (const entry of entries) {
      const item = entry.item;
      const sockets = Array.isArray(item.modSockets) ? item.modSockets : [];
      for (const mod of sockets) {
        if (!mod || !mod.hash) continue;
        if (!/enhancements\.|tuning\.mods|artifact_perks/i.test(String(mod.p || ''))) continue;
        const empties = emptyPlugCandidates(item, mod.idx);
        if (!empties.length) continue;
        if (empties.includes(Number(mod.hash))) continue;
        plan.push({ entry, mod, empties });
      }
    }
    if (!plan.length) {
      toast('Keine entfernbaren Mods in der Auswahl.', 'info', 2400);
      return;
    }
    const confirmed = await confirmAction({
      title: 'Mods entpacken',
      lines: [`${plan.length} Mod${plan.length === 1 ? '' : 's'} von ${entries.length} Item${entries.length === 1 ? '' : 's'} entfernen?`, 'Die Mods werden nicht gelöscht, sondern nur aus den Sockets genommen.'],
      confirmLabel: 'Entfernen'
    });
    if (!confirmed) return;
    const results = [];
    let okCount = 0;
    for (const { entry, mod, empties } of plan) {
      let done = false;
      let lastError = '';
      for (const plugHash of empties) {
        const payload = {
          itemId: entry.item.instanceId,
          characterId: entry.owner,
          socketIndex: mod.idx,
          plugItemHash: plugHash,
          membershipType: data.membershipType
        };
        if (!navigator.onLine) {
          enqueueOutbox({
            kind: 'plug', payload, characterId: entry.owner,
            characterName: characterLabel(entry.owner), itemName: entry.item.name || 'Item'
          });
          okCount += 1;
          done = true;
          results.push({ ok: true, text: `${entry.item.name} · ${mod.n || 'Mod'} (Ausgang)` });
          break;
        }
        try {
          const result = await api.bungieInsertPlug(payload);
          if (result && result.ok) {
            okCount += 1;
            done = true;
            results.push({ ok: true, text: `${entry.item.name} · ${mod.n || 'Mod'}` });
            break;
          }
          lastError = (result && result.error) || 'Einstecken fehlgeschlagen';
          if (outboxRetryable(lastError)) {
            enqueueOutbox({
              kind: 'plug', payload, characterId: entry.owner,
              characterName: characterLabel(entry.owner), itemName: entry.item.name || 'Item', lastError
            });
            okCount += 1;
            done = true;
            results.push({ ok: true, text: `${entry.item.name} · ${mod.n || 'Mod'} (Ausgang)` });
            break;
          }
        } catch (error) {
          lastError = error.message || String(error);
        }
        await sleepMs(180);
      }
      if (!done) results.push({ ok: false, text: `${entry.item.name} · ${mod.n || 'Mod'}: ${lastError}` });
      await sleepMs(220);
    }
    selection.clear();
    updateSelectionUi();
    showResult(`Mods entpackt: ${okCount}/${plan.length}`, results.slice(-60));
    if (okCount) {
      setUndo(`Mods entpackt: ${okCount}`, async () => {
        for (const { entry, mod } of plan) {
          try {
            await api.bungieInsertPlug({
              itemId: entry.item.instanceId,
              characterId: entry.owner,
              socketIndex: mod.idx,
              plugItemHash: mod.hash,
              membershipType: data.membershipType
            });
          } catch (error) { /* egal */ }
          await sleepMs(220);
        }
        refresh();
      });
    }
    if (okCount > 0) refresh();
    else render();
    syncToolsView();
  }

  async function batchMoveToVault() {
    if (!data) return;
    const entries = selectionEntries().filter((entry) => entry.kind === 'backpack' && entry.owner);
    if (!entries.length) {
      toast('Nur Items aus Beutetaschen lassen sich so verschieben.', 'info', 2200);
      return;
    }
    const confirmed = await confirmAction({
      title: 'Auswahl in den Tresor',
      lines: [`${entries.length} Item${entries.length === 1 ? '' : 's'} in den Tresor verschieben?`],
      confirmLabel: 'Verschieben'
    });
    if (!confirmed) return;
    const results = [];
    let okCount = 0;
    for (const entry of entries) {
      try {
        const result = await api.bungieTransfer({
          itemHash: entry.item.hash,
          itemId: entry.item.instanceId,
          stackSize: 1,
          toVault: true,
          characterId: entry.owner,
          membershipType: data.membershipType
        });
        if (result && result.ok) {
          okCount += 1;
          moveLocally(entry.item, true, entry.owner);
          results.push({ ok: true, text: `${entry.item.name} → Tresor` });
        } else {
          results.push({ ok: false, text: `${entry.item.name}: ${(result && result.error) || 'Transfer fehl'}` });
        }
      } catch (error) {
        results.push({ ok: false, text: `${entry.item.name}: ${error.message || error}` });
      }
      await sleepMs(300);
    }
    selection.clear();
    updateSelectionUi();
    showResult(`Auswahl → Tresor: ${okCount}/${entries.length}`, results.slice(-60));
    if (okCount) {
      setUndo(`Auswahl → Tresor: ${okCount}`, async () => {
        for (const entry of entries) {
          try {
            await api.bungieTransfer({
              itemHash: entry.item.hash,
              itemId: entry.item.instanceId,
              stackSize: 1,
              toVault: false,
              characterId: entry.owner,
              membershipType: data.membershipType
            });
            moveLocally(entry.item, false, entry.owner);
          } catch (error) { /* egal */ }
          await sleepMs(250);
        }
        render();
        syncToolsView();
      });
    }
    render();
    syncToolsView();
  }

  async function batchLock() {
    if (!data) return;
    const entries = selectionEntries().filter((entry) => entry.item && entry.item.instanceId);
    if (!entries.length) return;
    const shouldLock = !((Number(entries[0].item.state) || 0) & 1);
    const previousStates = entries.map((entry) => ({ entry, locked: Boolean((Number(entry.item.state) || 0) & 1) }));
    const results = [];
    let okCount = 0;
    for (const entry of entries) {
      const characterId = entry.owner || ((data.characters && data.characters[0] && data.characters[0].id) || '');
      try {
        const result = await api.bungieLock({
          itemId: entry.item.instanceId,
          characterId,
          membershipType: data.membershipType,
          lock: shouldLock
        });
        if (result && result.ok) {
          okCount += 1;
          entry.item.state = shouldLock ? (Number(entry.item.state) || 0) | 1 : (Number(entry.item.state) || 0) & ~1;
          results.push({ ok: true, text: `${entry.item.name}: ${shouldLock ? 'markiert' : 'entmarkiert'}` });
        } else {
          results.push({ ok: false, text: `${entry.item.name}: ${(result && result.error) || 'fehlgeschlagen'}` });
        }
      } catch (error) {
        results.push({ ok: false, text: `${entry.item.name}: ${error.message || error}` });
      }
      await sleepMs(250);
    }
    selection.clear();
    updateSelectionUi();
    showResult(`${shouldLock ? 'Markiert' : 'Markierung entfernt'}: ${okCount}/${entries.length}`, results.slice(-60));
    if (okCount) {
      setUndo(`${shouldLock ? 'Markiert' : 'Entmarkiert'}: ${okCount}`, async () => {
        for (const entry of previousStates) {
          const characterId = entry.entry.owner || ((data.characters && data.characters[0] && data.characters[0].id) || '');
          try {
            await api.bungieLock({
              itemId: entry.entry.item.instanceId,
              characterId,
              membershipType: data.membershipType,
              lock: entry.locked
            });
            entry.entry.item.state = entry.locked ? (Number(entry.entry.item.state) || 0) | 1 : (Number(entry.entry.item.state) || 0) & ~1;
          } catch (error) { /* egal */ }
          await sleepMs(200);
        }
        render();
      });
    }
    render();
    syncToolsView();
  }

  function batchCompare() {
    const candidates = selectionEntries()
      .map((entry) => entry.item)
      .filter((item) => item && (DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket)) || DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket))));
    if (!candidates.length) {
      toast('Nur Waffen oder Rüstung lassen sich vergleichen.', 'info', 2400);
      return;
    }
    compareItems = candidates.slice(0, 6);
    openCompare();
  }

  // Tab-Leiste + Editor-Tab (volle Breite für den Loadout-Editor).
  const tabBar = document.createElement('div');
  tabBar.className = 'dinv-tabs';
  tabBar.innerHTML =
    `<button type="button" class="dinv-tab on" data-tab="inventory">🎒 Inventar</button>` +
    `<button type="button" class="dinv-tab" data-tab="loadouts">🧰 Loadout-Editor</button>` +
    `<button type="button" class="dinv-tab" data-tab="tools">🧭 Werkzeuge</button>`;
  const editorTab = document.createElement('div');
  editorTab.className = 'inventory-editor-tab hidden';
  const toolsTab = document.createElement('div');
  toolsTab.className = 'inventory-tools-tab hidden';
  if (body && body.parentNode) {
    const viewRoot = body.parentNode;
    // Tab-Leiste ganz nach oben (der Haupt-Toolbar ist im Inventar
    // ausgeblendet, dadurch sitzt die Inventar-Leiste eine Zeile höher).
    viewRoot.insertBefore(tabBar, viewRoot.firstChild);
    viewRoot.insertBefore(editorTab, body.nextSibling);
    viewRoot.insertBefore(toolsTab, editorTab.nextSibling);
  }
  function searchForName(name) {
    const text = String(name || '').trim();
    if (!searchInput || !text) return;
    searchInput.value = text;
    showTab('inventory');
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.focus();
    setTimeout(focusFirstSearchHit, 160);
  }

  let activeTab = 'inventory';
  let tools = null;
  let toolsPromise = null;
  let toolsPendingData = null;

  // Werkzeuge erst beim ersten Öffnen laden: tools.js ist das größte
  // Renderer-Modul und wird beim Inventar-Start nicht gebraucht.
  function ensureTools() {
    if (tools) return Promise.resolve(tools);
    if (toolsPromise) return toolsPromise;
    if (!toolsTab.querySelector('[data-tool-loading]')) {
      toolsTab.innerHTML = '<div class="inv-tool-loading" data-tool-loading>Werkzeuge werden geladen …</div>';
    }
    toolsPromise = import('./tools.js')
      .then((module) => {
        tools = module.createInventoryTools({
          api,
          getCfg,
          setConfig,
          toast,
          escapeHtml,
          applyLoadout: (id) => applyLoadout(id),
          openArmorLoadout: (items, name, mods) => openArmorLoadout(items, name, mods),
          searchFor: searchForName,
          refreshInventory: () => refresh(),
    getData: () => data,
          openTab: (tab) => showTab(tab),
          closeInventory: () => close()
        });
        tools.mount(toolsTab);
        window.__d2ToolsLoaded = true;
        if (toolsPendingData) {
          try { tools.setData(toolsPendingData); } catch (error) { /* egal */ }
        }
        return tools;
      })
      .catch((error) => {
        toolsPromise = null;
        console.error('[d2] Werkzeuge konnten nicht geladen werden', error);
        toolsTab.innerHTML = '<div class="inv-tool-loading" data-tool-loading>Werkzeuge konnten nicht geladen werden. <button type="button" class="btn ghost small" data-tool-retry>Erneut versuchen</button></div>';
        toast('Werkzeuge konnten nicht geladen werden.', 'error', 3200);
        return null;
      });
    return toolsPromise;
  }

  function setToolsData(snapshot) {
    toolsPendingData = snapshot;
    if (tools) {
      try { tools.setData(snapshot); } catch (error) { /* egal */ }
    }
  }

  toolsTab.addEventListener('click', (event) => {
    if (!event.target.closest('[data-tool-retry]')) return;
    ensureTools().then((loaded) => { if (loaded) loaded.render(); });
  });

  function showTab(name) {
    activeTab = name === 'loadouts' ? 'loadouts' : name === 'tools' ? 'tools' : 'inventory';
    const isEditor = activeTab === 'loadouts';
    const isTools = activeTab === 'tools';
    body.classList.toggle('hidden', isEditor || isTools);
    editorTab.classList.toggle('hidden', !isEditor);
    toolsTab.classList.toggle('hidden', !isTools);
    if (view) {
      view.classList.toggle('tools-mode', isTools);
      view.classList.toggle('editor-mode', isEditor);
    }
    const title = view && view.querySelector('.inventory-view-head h2');
    const subtitle = view && view.querySelector('.inventory-view-sub');
    if (title) title.textContent = isTools ? 'Werkzeugzentrale' : 'Inventar & Loadouts';
    if (subtitle) subtitle.textContent = isTools
      ? 'Builds analysieren, Sammlung aufräumen, Woche planen und Händler prüfen – alles an einem Ort.'
      : 'Tresor, Beutetaschen und angelegte Items — Bungie-Anmeldung nötig. Transfer und Ausrüsten laufen direkt über die Bungie-API.';
    for (const tab of tabBar.querySelectorAll('.dinv-tab')) tab.classList.toggle('on', tab.dataset.tab === activeTab);
    // Auf Werkzeug-/Editor-Seiten nur die jeweilige Ansicht zeigen; die
    // Inventar-Suchleiste und ihre Chips wuerden sonst den Kopf ueberfuellen.
    const inventoryOnly = !isEditor && !isTools;
    for (const element of [toolbar, inventoryHeadControls, searchChips, legendEl, inventoryStatusEl, resultBox, loadoutList]) {
      if (element) element.classList.toggle('hidden', !inventoryOnly);
    }
    hideTooltip();
    if (isEditor) { openEditorTab(); } else {
      closeEditor();
      if (isTools) ensureTools().then((loaded) => { if (loaded) loaded.render(); });
      else render();
    }
  }

  tabBar.addEventListener('click', (event) => {
    const tab = event.target.closest('.dinv-tab');
    if (!tab) return;
    const name = String(tab.dataset.tab || 'inventory');
    if (name === activeTab) return;
    showTab(name);
  });

  const padKeyboardBtn = qs('#inventoryPadKeyboard');
  if (padKeyboardBtn) {
    padKeyboardBtn.addEventListener('click', () => {
      if (padKeyboard && padKeyboard.classList.contains('open')) closePadKeyboard();
      else openPadKeyboard();
    });
  }
  if (searchInput) searchInput.addEventListener('input', () => {
    syncPadKeyboardValue();
    renderPadKeyboardSuggestions();
  });
  if (searchInput) searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      focusFirstSearchHit();
    }
  });

  let data = null;
  let loading = false;
  let selectedItem = null;
  let lastDiagnostics = null;

  // Wartet auf den Inventar-Snapshot (z. B. wenn ein Overlay-Loadout
  // angewendet wird, bevor der erste Abruf fertig ist).
  function waitForInventory(timeout) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (data) { resolve(true); return; }
        if (Date.now() - started >= timeout) { resolve(false); return; }
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  // Höchste Power je Slot – für die „nicht zerlegen“-Warnung im Popup.
  // Bewusst lokal (nicht im Werkzeugmodul), damit die Warnung schon vor
  // dem ersten Öffnen der Werkzeugzentrale verfügbar ist.
  function isHighestInBucket(item) {
    if (!data || !item || !item.instanceId) return false;
    const bucket = Number(item.bucket) || 0;
    if (!bucket) return false;
    let max = 0;
    const visit = (list) => {
      for (const entry of list || []) {
        if (!entry || Number(entry.bucket) !== bucket) continue;
        const power = Math.max(0, Number(entry.power) || 0);
        if (power > max) max = power;
      }
    };
    visit(data.vault);
    for (const items of Object.values(data.backpack || {})) visit(items);
    for (const items of Object.values(data.equipped || {})) visit(items);
    for (const items of Object.values(data.postmaster || {})) visit(items);
    return max > 0 && (Number(item.power) || 0) >= max;
  }
  // Items, die der Client in dieser Session erfolgreich aus der
  // Poststelle gezogen hat - Bungie spiegelt die Profile nach
  // Aktions-Requests verzögert (Server-Cache), deshalb blenden wir
  // sie in automatischen Refreshes aus. Manuelles Aktualisieren
  // (Nutzer-Klick) holt die volle Bungie-Wahrheit.
  const sessionPulledPm = new Set();
  // Rückgängig-Stapel (max. 3 Loadout-Anwendungen inkl. Mods).
  const undoStack = [];
  let loadoutFileInput = null;
  // Mehrfachauswahl: key -> { key, kind, owner, item }.
  const selection = new Map();

  // ---------- Helpers ----------
  const esc = escapeHtml;
  const cls = (rarity) => `r${Math.max(0, Math.min(6, Number(rarity) || 0))}`;

  function matchesSearch(item, query) {
    if (!query) return true;
    return String(item.name || '').toLowerCase().includes(query) || String(item.typeName || '').toLowerCase().includes(query);
  }

  // Suchsyntax im DIM-Stil: freie Begriffe + Operatoren
  //   is:godroll · is:dupe · is:exotic · -is:exotic
  //   perk:"Vorpal Weapon" · stat:gesundheit:>20 · stat:gesundheit>=20
  //   rarity:exotic|legendary|rare · is:spike20
  function naturalLanguageQuery(raw) {
    let text = String(raw || '').trim();
    if (!text || /[a-zäöüß]+:/i.test(text)) return text;
    const match = text.match(/^(.*?)\s+(?:mit|with)\s+(.+)$/i);
    if (!match) return text;
    const subject = String(match[1] || '')
      .replace(/^(zeig|zeige|finde|show|find)\s+/i, '')
      .trim();
    const perks = String(match[2] || '')
      .split(/\s*(?:,| und | and | & )\s*/i)
      .map((part) => part.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean);
    if (!perks.length) return text;
    const parts = [];
    if (subject) parts.push(subject);
    for (const perk of perks) parts.push(`perk:"${perk.replace(/"/g, '')}"`);
    return parts.join(' ');
  }

  function parseSearch(raw) {
    const tokens = [];
    const text = naturalLanguageQuery(raw);
    if (!text) return tokens;
    const pattern = /(-)?([a-zäöüß]+):("[^"]*"|\S+)|(-)?"([^"]*)"|(-)?(\S+)/gi;
    let match;
    while ((match = pattern.exec(text))) {
      if (match[2]) {
        const value = String(match[3] || '').replace(/^"|"$/g, '').toLowerCase();
        tokens.push({ op: match[2].toLowerCase(), value, negate: Boolean(match[1]) });
      } else {
        const free = String(match[7] != null ? match[7] : match[5] || '').toLowerCase();
        if (free) tokens.push({ text: free, negate: Boolean(match[6] || match[4]) });
      }
    }
    return tokens;
  }

  const RARITY_NAMES = { exotic: 6, exotisch: 6, legendär: 5, legendary: 5, selten: 4, rare: 4, gewöhnlich: 2 };
  const STAT_ALIASES = {
    // Armor 3.0
    waffen: 'waffen', weapons: 'waffen', weapon: 'waffen',
    gesundheit: 'gesundheit', health: 'gesundheit',
    klasse: 'klasse', class: 'klasse',
    granate: 'granate', grenades: 'granate', grenade: 'granate',
    super: 'super',
    nahkampf: 'nahkampf', melee: 'nahkampf',
    // Alte Namen weiter akzeptieren (werden auf die neuen Stats gemappt)
    beweglichkeit: 'waffen', mobilität: 'waffen', mobility: 'waffen',
    resilienz: 'gesundheit', resilience: 'gesundheit',
    erholung: 'klasse', recovery: 'klasse',
    disziplin: 'granate', discipline: 'granate',
    intellekt: 'super', intellect: 'super',
    stärke: 'nahkampf', strength: 'nahkampf'
  };

  function statMatches(item, value, useBase) {
    const match = String(value).match(/^([a-zäöüß]+)\s*(?::\s*(>=|<=|>|<|=)|(>=|<=|>|<|=))?\s*(-?\d+)$/i);
    if (!match) return true;
    const wanted = STAT_ALIASES[match[1]] || match[1];
    const op = match[2] || match[3] || '>=';
    const limit = Number(match[4]) || 0;
    const compare = (actual) => {
      const current = Number(actual) || 0;
      if (op === '>') return current > limit;
      if (op === '>=') return current >= limit;
      if (op === '<') return current < limit;
      if (op === '<=') return current <= limit;
      return current === limit;
    };
    if (wanted === 'total' || wanted === 'gesamt') {
      const total = useBase
        ? Object.values(item.baseStats || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
        : (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      return compare(total);
    }
    if (wanted === 'any') {
      if (!DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket))) return false;
      const values = DIM.CHAR_STAT_HASHES.map((hash) => {
        if (useBase) return Number((item.baseStats || {})[hash]) || 0;
        return Number(((item.stats || []).find((stat) => Number(stat.hash) === Number(hash)) || {}).value) || 0;
      });
      return values.some((actual) => compare(actual));
    }
    if (useBase) {
      return Object.entries(item.baseStats || {}).some(([hash, actual]) => {
        const stat = (item.stats || []).find((entry) => String(entry.hash) === String(hash));
        const label = String((stat && stat.label) || '').toLowerCase();
        if (!label.includes(wanted)) return false;
        return compare(actual);
      });
    }
    return (item.stats || []).some((stat) => {
      const label = String(stat.label || '').toLowerCase();
      if (!label.includes(wanted)) return false;
      return compare(stat.value);
    });
  }

  const SLOT_ALIASES = {
    helm: 3448274439, helmet: 3448274439, kopf: 3448274439,
    arms: 3551918588, arme: 3551918588, gauntlets: 3551918588,
    chest: 14239492, brust: 14239492,
    legs: 20886954, beine: 20886954,
    class: 1585787867, klasse: 1585787867,
    kinetic: 1498876634, energie: 2465295065, energy: 2465295065,
    power: 953998645, schwer: 953998645,
    ghost: 4023194814, geist: 4023194814,
    subclass: 3284755031, subklasse: 3284755031,
    artifact: 1506418338, artefakt: 1506418338
  };
  const CLASS_ALIASES = { titan: 0, jäger: 1, jaeger: 1, hunter: 1, warlock: 2, hexe: 2 };

  function numberMatches(actual, value) {
    const match = String(value).match(/^(>=|<=|>|<|=)?(-?\d+)$/);
    if (!match) return true;
    const op = match[1] || '>=';
    const limit = Number(match[2]) || 0;
    const current = Number(actual) || 0;
    if (op === '>') return current > limit;
    if (op === '>=') return current >= limit;
    if (op === '<') return current < limit;
    if (op === '<=') return current <= limit;
    return current === limit;
  }

// Zählt Treffer, die nur über Tippfehler-Toleranz gefunden wurden.
let fuzzySearchHits = 0;
  // Umlaute, Akzente und ß vereinheitlichen: „Gjallarhorn" findet
// „Gjällarhorn", „Starke" findet „Stärke".
function foldSearch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o');
}

function itemMatches(item, tokens, dupeSet, where, statDupeSet = new Set(), statLowerSet = new Set(), armorWishSet = new Set()) {
    const itemKey = String(item.instanceId || item.hash || '');
    const noteText = String((((getCfg().bungie && getCfg().bungie.itemNotes) || {})[itemKey]) || '').toLowerCase();
    for (const token of tokens) {
      if (token.negate) {
        const positive = { ...token, negate: false };
        if (itemMatches(item, [positive], dupeSet, where, statDupeSet, statLowerSet, armorWishSet)) return false;
        continue;
      }
      if (token.text) {
        const haystack = foldSearch(`${item.name || ''} ${item.typeName || ''}`);
        if (!haystack.includes(foldSearch(token.text))) {
          if (!fuzzyWordMatch(haystack, token.text)) return false;
          fuzzySearchHits += 1;
        }
        continue;
      }
      const value = String(token.value || '');
      if (token.op === 'is' && (value === 'godroll' || value === 'god')) {
        if (!item.godRoll) return false;
      } else if (token.op === 'is' && (value === 'neargodroll' || value === 'fastgodroll' || value === 'near')) {
        if (!item.nearGodRoll || item.godRoll) return false;
      } else if (token.op === 'is' && (value === 'dupe' || value === 'duplicate')) {
        if (!dupeSet.has(Number(item.hash))) return false;
      } else if (token.op === 'dupe' && value === 'stats') {
        if (!statDupeSet.has(itemKey)) return false;
      } else if (token.op === 'is' && value === 'statlower') {
        if (!statLowerSet.has(itemKey)) return false;
      } else if ((token.op === 'is' && value === 'armorwish') || token.op === 'armorwish') {
        if (!armorWishSet.has(itemKey)) return false;
      } else if (token.op === 'is' && (value === 'armor3.0' || value === 'armor3')) {
        if (!(item.gearTier > 0 || item.archetype || item.setInfo)) return false;
      } else if (token.op === 'is' && value === 'tier5') {
        if (Number(item.gearTier) !== 5) return false;
      } else if (token.op === 'is' && value === 'spike20') {
        if (!(item.stats || []).some((stat) => Number(stat.value) >= 20)) return false;
      } else if (token.op === 'is' && value === 'weapon') {
        if (!DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket))) return false;
      } else if (token.op === 'is' && value === 'armor') {
        if (!DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket))) return false;
      } else if (token.op === 'is' && RARITY_NAMES[value]) {
        if (Number(item.rarity) !== RARITY_NAMES[value]) return false;
      } else if (token.op === 'is' && (value === 'nochamp' || value === 'nochampion')) {
        if (!DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket))) return false;
        if (championTypes(item).length) return false;
      } else if (token.op === 'is' && value === 'new') {
        if (!item.isNew) return false;
      } else if (token.op === 'is' && value === 'noted') {
        if (!noteText) return false;
      } else if (token.op === 'is' && value === 'noset') {
        if (item.setInfo) return false;
      } else if (token.op === 'is' && value === 'set') {
        if (!item.setInfo) return false;
      } else if (token.op === 'is' && value === 'tunable') {
        if (!item.tunedStat) return false;
      } else if (token.op === 'is' && value === 'equipped') {
        if (where !== 'equipped') return false;
      } else if (token.op === 'is' && (value === 'locked' || value === 'gesperrt')) {
        if (!((Number(item.state) || 0) & 1)) return false;
      } else if (token.op === 'is' && (value === 'masterworked' || value === 'masterwork')) {
        if (!(item.masterwork || ((Number(item.state) || 0) & 4))) return false;
      } else if (token.op === 'perk') {
        if (!(item.perks || []).some((perk) => foldSearch(perk.n).includes(foldSearch(value)))) return false;
      } else if (token.op === 'stat') {
        if (!statMatches(item, value, false)) return false;
      } else if (token.op === 'basestat') {
        if (!statMatches(item, value, true)) return false;
      } else if (token.op === 'tier') {
        if (!numberMatches(item.gearTier, value)) return false;
      } else if (token.op === 'archetype' || token.op === 'archetyp') {
        const haystack = `${(item.archetype && item.archetype.name) || ''} ${(item.archetype && item.archetype.primaryLabel) || ''} ${(item.archetype && item.archetype.secondaryLabel) || ''}`.toLowerCase();
        if (!haystack.includes(value)) return false;
      } else if (token.op === 'tertiary' || token.op === 'tertiär' || token.op === 'tertiar') {
        if (!String((item.tertiaryStat && item.tertiaryStat.label) || '').toLowerCase().includes(value)) return false;
      } else if (token.op === 'tunedstat' || token.op === 'tuning') {
        const tunedHash = Number(item.tunedStat && item.tunedStat.hash) || 0;
        const ordinalHash = value === 'primary' || value === 'sekundär' || value === 'sekundar'
          ? Number(item.archetype && item.archetype.primary) || 0
          : value === 'secondary' || value === 'zweit'
            ? Number(item.archetype && item.archetype.secondary) || 0
            : value === 'tertiary' || value === 'tertiär' || value === 'tertiar'
              ? Number(item.tertiaryStat && item.tertiaryStat.hash) || 0
              : 0;
        if (ordinalHash) {
          if (tunedHash !== ordinalHash) return false;
        } else if (!String((item.tunedStat && item.tunedStat.label) || '').toLowerCase().includes(value)) {
          return false;
        }
      } else if (token.op === 'set') {
        if (!String((item.setInfo && item.setInfo.name) || '').toLowerCase().includes(value)) return false;
      } else if (token.op === 'note' || token.op === 'notiz') {
        if (!noteText.includes(value)) return false;
      } else if (token.op === 'power') {
        if (!numberMatches(item.power, value)) return false;
      } else if (token.op === 'rarity') {
        const wanted = RARITY_NAMES[value];
        if (wanted && Number(item.rarity) !== wanted) return false;
      } else if (token.op === 'slot' || token.op === 'bucket') {
        const bucket = SLOT_ALIASES[value];
        if (bucket && Number(item.bucket) !== bucket) return false;
      } else if (token.op === 'class' || token.op === 'klasse') {
        const classType = CLASS_ALIASES[value];
        if (classType != null && Number(item.classType) !== classType) return false;
      } else if (token.op === 'name') {
        if (!String(item.name || '').toLowerCase().includes(value)) return false;
      }
    }
    return true;
  }

  // Duplikate: gleicher Item-Hash mit mehr als einer Instanz (Tresor +
  // Beutetaschen + angelegt).
  function duplicateHashes(source) {
    const counts = new Map();
    const add = (items) => {
      for (const item of items || []) {
        if (!item || !item.instanceId) continue;
        const key = Number(item.hash) || 0;
        if (!key) continue;
        if (!counts.has(key)) counts.set(key, new Set());
        counts.get(key).add(item.instanceId);
      }
    };
    add(source.vault);
    for (const list of Object.values(source.backpack || {})) add(list);
    for (const list of Object.values(source.equipped || {})) add(list);
    const dupes = new Set();
    for (const [hash, ids] of counts) if (ids.size > 1) dupes.add(hash);
    return dupes;
  }

  // Rüstungs-Stat-Duplikate und "strikt schlechter" (DIM: dupe:stats,
  // is:statlower) auf Basis der Stats ohne Mods.
  const ARMOR_STAT_ORDER = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218];
  function itemKeyOf(item) {
    return String((item && (item.instanceId || item.hash)) || '');
  }
  function armorItemsOf(source) {
    const out = [];
    const add = (items) => {
      for (const item of items || []) {
        if (item && DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket))) out.push(item);
      }
    };
    add(source.vault);
    for (const list of Object.values(source.backpack || {})) add(list);
    for (const list of Object.values(source.equipped || {})) add(list);
    return out;
  }
  function armorBaseOf(item, hash) {
    return Number((item.baseStats || {})[hash] || 0);
  }
  function armorStatSignature(item) {
    const values = ARMOR_STAT_ORDER.map((hash) => armorBaseOf(item, hash)).join('/');
    return `${Number(item.classType) || 0}|${values}|${item.tunedStat ? item.tunedStat.hash : 0}`;
  }
  function duplicateStatKeys(source) {
    const groups = new Map();
    for (const item of armorItemsOf(source)) {
      const key = itemKeyOf(item);
      if (!key) continue;
      const sig = armorStatSignature(item);
      if (!groups.has(sig)) groups.set(sig, new Set());
      groups.get(sig).add(key);
    }
    const dupes = new Set();
    for (const keys of groups.values()) if (keys.size > 1) for (const key of keys) dupes.add(key);
    return dupes;
  }
  function statLowerKeys(source) {
    const byBucket = new Map();
    for (const item of armorItemsOf(source)) {
      const key = `${Number(item.classType) || 0}|${Number(item.bucket) || 0}`;
      if (!byBucket.has(key)) byBucket.set(key, []);
      byBucket.get(key).push(item);
    }
    const worse = new Set();
    for (const list of byBucket.values()) {
      for (const item of list) {
        const key = itemKeyOf(item);
        if (!key) continue;
        const stats = ARMOR_STAT_ORDER.map((hash) => armorBaseOf(item, hash));
        for (const other of list) {
          if (other === item) continue;
          const otherStats = ARMOR_STAT_ORDER.map((hash) => armorBaseOf(other, hash));
          let allAtLeast = true;
          let strictlyBetter = false;
          for (let i = 0; i < stats.length; i += 1) {
            if (otherStats[i] < stats[i]) { allAtLeast = false; break; }
            if (otherStats[i] > stats[i]) strictlyBetter = true;
          }
          if (allAtLeast && strictlyBetter) { worse.add(key); break; }
        }
      }
    }
    return worse;
  }

  function armorWishMatches(rule, item) {
    if (!item || !DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket))) return false;
    const archetype = `${(item.archetype && item.archetype.name) || ''} ${(item.archetype && item.archetype.primaryLabel) || ''} ${(item.archetype && item.archetype.secondaryLabel) || ''}`.toLowerCase();
    if (rule.archetype && !archetype.includes(String(rule.archetype).toLowerCase())) return false;
    if (rule.tertiary && !String((item.tertiaryStat && item.tertiaryStat.label) || '').toLowerCase().includes(String(rule.tertiary).toLowerCase())) return false;
    if (rule.tunedStat && !String((item.tunedStat && item.tunedStat.label) || '').toLowerCase().includes(String(rule.tunedStat).toLowerCase())) return false;
    if (rule.set && !String((item.setInfo && item.setInfo.name) || '').toLowerCase().includes(String(rule.set).toLowerCase())) return false;
    const total = Number(item.baseStatTotal != null ? item.baseStatTotal : item.statTotal) || 0;
    if (rule.minTotal && total < Number(rule.minTotal)) return false;
    return true;
  }

  function armorWishKeys(source) {
    const rules = (((getCfg().bungie && getCfg().bungie.armorWishlist) || []));
    const keys = new Set();
    for (const item of armorItemsOf(source)) item.armorWish = false;
    if (!rules.length) return keys;
    for (const item of armorItemsOf(source)) {
      if (rules.some((rule) => armorWishMatches(rule, item))) {
        item.armorWish = true;
        keys.add(itemKeyOf(item));
      }
    }
    return keys;
  }

  function sortItems(items) {
    // Sortier-Modus aus den Einstellungen: Power (Standard), Name,
    // Seltenheit, Stat-Summe, Gear-Tier oder Archetyp (DIM itemSort).
    // `sort:` in der Suche überschreibt ihn für die aktuelle Ansicht.
    const mode = searchSortOverride || (getCfg().bungie && getCfg().bungie.itemSort) || 'power';
    return [...items].sort((a, b) => {
      if (mode === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'de');
      if (mode === 'stats') {
        const sa = Number(a.statTotal) || (a.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
        const sb = Number(b.statTotal) || (b.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
        const sd = sb - sa;
        if (sd) return sd;
      }
      if (mode.startsWith('stat:')) {
        const hash = Number(mode.slice(5));
        const valueOf = (item) => Number(((item.stats || []).find((stat) => Number(stat.hash) === hash) || {}).value) || 0;
        const sd = valueOf(b) - valueOf(a);
        if (sd) return sd;
      }
      if (mode === 'tier') {
        const td = (Number(b.gearTier) || 0) - (Number(a.gearTier) || 0);
        if (td) return td;
      }
      if (mode === 'archetype') {
        const aa = String((a.archetype && a.archetype.name) || '');
        const ab = String((b.archetype && b.archetype.name) || '');
        const ad = aa.localeCompare(ab, 'de');
        if (ad) return ad;
      }
      if (mode === 'rarity') {
        const rd = (Number(b.rarity) || 0) - (Number(a.rarity) || 0);
        if (rd) return rd;
      }
      const pd = (Number(b.power) || 0) - (Number(a.power) || 0);
      if (pd) return pd;
      const rd2 = (Number(b.rarity) || 0) - (Number(a.rarity) || 0);
      if (rd2) return rd2;
      return String(a.name || '').localeCompare(String(b.name || ''), 'de');
    });
  }

  function charLabel(charId) {
    const ch = (data && data.characters || []).find((c) => c.id === charId);
    return ch ? DIM.CLASS_NAMES[ch.classType] || 'Hüter' : 'Hüter';
  }

  // ---------- Panel-Steuerung ----------
  function isHidden() { return !view || view.classList.contains('hidden'); }
  function isOpen() { return Boolean(view && !view.classList.contains('hidden')); }
  function open() {
    if (!view) return;
    view.classList.remove('hidden');
    document.body.classList.add('inventory-open');
    renderSearchChips();
    setTimeout(() => { if (!window.__D2_E2E) showWhatsNew(false); }, 450);
    if (!data) {
      refresh();
    } else {
      render();
      const age = data.fetchedAt ? Date.now() - Number(data.fetchedAt) : Infinity;
      if (!Number.isFinite(age) || age > 5 * 60 * 1000) refresh(true);
    }
  }
  function close() {
    if (view) view.classList.add('hidden');
    if (padKeyboard) padKeyboard.classList.remove('open');
    if (quickMenu) quickMenu.classList.remove('open');
    document.body.classList.remove('inventory-open');
    hideTooltip();
    if (farmingActive) stopFarming();
  }
  function toggle() { if (isHidden()) open(); else close(); }

  // ---------- Tile (DIM-ItemIcon.m.scss 1:1) ----------
  const TAG_DEFS = [
    { id: 'keep', label: 'Behalten', short: 'B', color: '#4ade80' },
    { id: 'junk', label: 'Aussortieren', short: 'A', color: '#f87171' },
    { id: 'pve', label: 'PvE', short: 'E', color: '#60a5fa' },
    { id: 'pvp', label: 'PvP', short: 'P', color: '#f472b6' },
    { id: 'godroll', label: 'Godroll', short: 'G', color: '#facc15' },
    { id: 'infuse', label: 'Infusion', short: 'I', color: '#a78bfa' }
  ];
  function itemTagKey(item) {
    return String(item.instanceId || item.hash || '');
  }
  function getItemTag(item) {
    const tags = (getCfg().bungie && getCfg().bungie.itemTags) || {};
    return tags[itemTagKey(item)] || '';
  }
  function setItemTag(item, tag) {
    const tags = { ...(((getCfg().bungie && getCfg().bungie.itemTags) || {})) };
    const key = itemTagKey(item);
    if (tag) tags[key] = tag;
    else delete tags[key];
    setConfig({ bungie: { itemTags: tags } });
  }
  function itemFolders() {
    return (((getCfg().bungie && getCfg().bungie.folders) || []));
  }
  function getItemFolder(item) {
    const map = (getCfg().bungie && getCfg().bungie.itemFolders) || {};
    return map[itemTagKey(item)] || '';
  }
  function setItemFolder(item, folderId) {
    const map = { ...(((getCfg().bungie && getCfg().bungie.itemFolders) || {})) };
    const key = itemTagKey(item);
    if (folderId) map[key] = folderId;
    else delete map[key];
    setConfig({ bungie: { itemFolders: map } });
  }
  function isFav(item) {
    const favs = (getCfg().bungie && getCfg().bungie.favs) || {};
    return Boolean(favs[item.instanceId] || favs[String(item.hash)]);
  }

  const ELEMENT_NAMES = { 1: 'Kinetik', 2: 'Lichtbogen', 3: 'Solar', 4: 'Leere', 5: 'Raid', 6: 'Stasis', 7: 'Strand', 8: 'Prismatisch', 9: 'Strand', 10: 'Prismatisch' };
  const ELEMENT_SHORT = { 1: 'KIN', 2: 'ARC', 3: 'SOL', 4: 'LEER', 5: 'RAID', 6: 'STAS', 7: 'STR', 8: 'PRIS', 9: 'STR', 10: 'PRIS' };
  const ELEMENT_COLOR = { 1: '#d7dde6', 2: '#79bbe8', 3: '#f0631e', 4: '#8e749e', 5: '#d8c27a', 6: '#4d88ff', 7: '#35e366', 8: '#e3619b', 9: '#35e366', 10: '#e3619b' };

  function elementName(item) {
    if (!item) return '';
    return ELEMENT_NAMES[Number(item.element)] || (item.elementIcon ? 'Element' : '');
  }

  function elementShort(item) {
    if (!item) return '';
    return ELEMENT_SHORT[Number(item.element)] || '';
  }

  function tileHtml(item, kind, owner) {
    const key = item.instanceId || String(item.hash);
    const r = cls(item.rarity);
    const isEq = kind === 'equipped';
    const eq = isEq ? ' equipped' : '';
    const god = item.godRoll ? `<span class="dinv-tile-god" title="God Roll">✓</span>` : '';
    const near = !item.godRoll && item.nearGodRoll
      ? `<span class="dinv-tile-near" title="Fast-Godroll – 1 Perk fehlt: ${esc((item.nearGodRoll.missing || []).join(', '))}">≈</span>`
      : '';
    const newBadge = item.isNew ? `<span class="dinv-tile-new" title="Neu seit dem letzten Stand">NEU</span>` : '';
    const fav = isFav(item) ? `<span class="dinv-tile-fav" title="Favorit">★</span>` : '';
    const tagId = getItemTag(item);
    const tagDef = TAG_DEFS.find((entry) => entry.id === tagId);
    const tagBadge = tagDef
      ? `<span class="dinv-tile-tag" style="background:${tagDef.color}" title="Tag: ${esc(tagDef.label)}">${tagDef.short}</span>`
      : '';
    const folder = itemFolders().find((entry) => entry.id === getItemFolder(item));
    const folderBadge = folder
      ? `<span class="dinv-tile-folder" style="background:${esc(folder.color)}" title="Ordner: ${esc(folder.name)}"></span>`
      : '';
    // Element und Champion wandern in eine eigene Zeile UNTER das Bild –
    // so verdecken die Kürzel keine Waffen-Icons mehr.
    const elemName = elementName(item);
    const elemShort = elementShort(item);
    const champions = championTypes(item);
    const power = item.power ? `<span class="dinv-tile-power">${item.power}</span>` : '';
    const qty = item.quantity > 1 ? `<span class="dinv-tile-qty">${item.quantity}</span>` : '';
    // Perk-Diamanten als eigene Mini-Reihe UNTER der Kachel (nur Waffen,
    // DIM-Perk-Anzeige) - sie liegen nicht AUF dem Bild.
    const isWeapon = DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket));
    const perkDots = isWeapon
      ? `<span class="dinv-tile-perkrow">${(item.perks || []).slice(0, 3).map((perk) => perk.i ? `<img src="https://www.bungie.net${esc(perk.i)}" alt="" loading="lazy" decoding="async">` : '').join('')}</span>`
      : '';
    const elemTag = isWeapon && elemShort
      ? `<span class="dinv-tag dinv-tag-elem" style="background:${ELEMENT_COLOR[Number(item.element)] || '#cfd7e3'}" title="Element: ${esc(elemName)}">${esc(elemShort)}</span>`
      : '';
    const champSource = isWeapon ? championSource(item) : '';
    const champSourceLabel = { manuell: 'manuell', daten: 'Item-Daten', rahmen: 'Rahmen', keine: 'keine' }[champSource] || 'keine';
    const champTags = isWeapon
      ? (champions.length
        ? champions.map((type) => `<span class="dinv-tag dinv-tag-champ" style="border-color:${CHAMPION_COLORS[type]};color:${CHAMPION_COLORS[type]}" title="Champion (${esc(champSourceLabel)}): ${esc(CHAMPION_NAMES[type])}">${esc(CHAMPION_SHORT[type])}</span>`).join('')
        : '<span class="dinv-tag dinv-tag-champ none" title="Kein intrinsischer Champion-Brecher erkannt (Quelle: keine)">–</span>')
      : '';
    const tagRow = (elemTag || champTags) ? `<span class="dinv-tile-tagrow">${elemTag}${champTags}</span>` : '';
    const badge = (qty || power) ? `<span class="dinv-tile-badge">${qty}${power}</span>` : '';
    const isArmor = DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket));
    const statTotal = isArmor
      ? (item.stats || []).reduce((sum, stat) => sum + (Number(stat.value) || 0), 0)
      : 0;
    const statBadge = statTotal ? `<span class="dinv-tile-stats" title="Stat-Summe ${statTotal}">${statTotal}</span>` : '';
    const tierBadge = isArmor && item.gearTier ? `<span class="dinv-tile-tier" title="Gear-Tier ${item.gearTier}">T${esc(String(item.gearTier))}</span>` : '';
    const archIcon = isArmor && item.archetype && item.archetype.primary
      ? (((data && data.charStatIcons) || {})[String(item.archetype.primary)] || '')
      : '';
    const archBadge = archIcon
      ? `<span class="dinv-tile-arch" title="Archetyp: ${esc(item.archetype.name || '')} (${esc(item.archetype.primaryLabel || '')}/${esc(item.archetype.secondaryLabel || '')})"><img src="https://www.bungie.net${esc(archIcon)}" alt=""></span>`
      : '';
    const itemNote = String((((getCfg().bungie && getCfg().bungie.itemNotes) || {})[String(item.instanceId || '')]) || '');
    const noteBadge = itemNote ? `<span class="dinv-tile-note" title="Notiz: ${esc(itemNote)}">✎</span>` : '';
    const wishBadge = item.armorWish ? '<span class="dinv-tile-wish" title="Rüstungs-Wunsch">W</span>' : '';
    const diffBadge = item.statLower
      ? '<span class="dinv-tile-diff" title="Strikt schlechter als eine andere Kopie">▼</span>'
      : item.statDupe
        ? '<span class="dinv-tile-diff" title="Gleiche Stats wie eine andere Kopie">⧉</span>'
        : '';
    const label = `${item.name}${item.typeName ? ` · ${item.typeName}` : ''}${elemName ? ` · ${elemName}` : ''}${champions.length ? ` · Champion: ${champions.map((type) => CHAMPION_NAMES[type]).join(', ')} (${champSourceLabel})` : (isWeapon ? ' · Kein Champion-Brecher' : '')}${item.power ? ` · ${item.power} Power` : ''}${itemNote ? ` · Notiz: ${itemNote}` : ''}`;
    const dimmed = searchActive && !searchMatchKeys.has(key);
    const dimClass = dimmed ? ' inv-dim' : '';
    const img = item.icon ? `<img src="https://www.bungie.net${esc(item.icon)}" alt="" loading="lazy">` : '';
    return (
      `<span class="dinv-tile-wrap${dimClass}">` +
      `<button class="dinv-tile ${r}${eq}${dimClass}" data-inv-select="${esc(key)}" data-inv-kind="${kind}" data-inv-owner="${esc(owner || '')}" aria-label="${esc(label)}"` +
      ` title="${esc(label)}">${img}${god}${near}${newBadge}${fav}${tagBadge}${folderBadge}${badge}${statBadge}${tierBadge}${archBadge}${noteBadge}${wishBadge}${diffBadge}</button>` +
      tagRow +
      perkDots +
      `</span>`
    );
  }

  // ---------- DIM-Store-Layout (StoreBuckets.tsx: pro Bucket eine Zeile) ----------
  function tileWindow(items, kind, owner, key, limit = 80) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';
    if (list.length <= limit) {
      return list.map((item) => tileHtml(item, kind, owner)).join('');
    }
    if (expandedTileLists.has(key)) {
      if (list.length > 240 && chunkingEnabled()) {
        const first = Math.min(CHUNK_SIZE, list.length);
        chunkedLists.set(key, { items: list, kind, owner, rendered: first });
        return `<div class="dinv-chunk" data-inv-chunk="${esc(key)}">` +
          list.slice(0, first).map((item) => tileHtml(item, kind, owner)).join('') +
          chunkMoreButton(key, first, list.length) +
          `</div>`;
      }
      return list.map((item) => tileHtml(item, kind, owner)).join('');
    }
    const html = list.slice(0, limit).map((item) => tileHtml(item, kind, owner)).join('');
    return html + `<button type="button" class="dinv-more" data-inv-more="${esc(key)}">+${list.length - limit} weitere anzeigen</button>`;
  }
  // Nur für den E2E-Test: Fenster-Rendering und Blockrechnung direkt
  // prüfen, ohne eine künstliche 1.700-Item-Datenquelle zu brauchen.
  if (window.__D2_E2E) {
    window.__d2invTest = {
      chunkPlan,
      chunkHtml(count, key = 'e2e:chunk') {
        const items = Array.from({ length: count }, (_, index) => ({
          hash: 900000 + index,
          instanceId: `e2e-chunk-${index}`,
          name: `Testkachel ${index}`,
          bucket: 1498876634
        }));
        expandedTileLists.add(key);
        const html = tileWindow(items, 'vault', '', key, 80);
        expandedTileLists.delete(key);
        chunkedLists.delete(key);
        return html;
      }
    };
  }
  // Kopfzeilen-Zelle (StoreHeading + StoreStats) für einen Charakter.
  function characterStatBreakdown(character, hash) {
    const out = { base: 0, mods: 0, masterwork: 0, fragments: 0 };
    if (!character) return out;
    const equipped = ((data && data.equipped && data.equipped[character.id]) || []);
    for (const item of equipped) {
      const bucket = Number(item.bucket);
      const armor = DIM.ARMOR_SLOTS.some((slot) => slot.key === bucket);
      if (armor) {
        const stat = (item.stats || []).find((entry) => Number(entry.hash) === Number(hash));
        if (stat) {
          out.base += Math.max(0, Number(stat.base != null ? stat.base : stat.value) || 0);
          out.mods += Math.max(0, Number(stat.mod) || 0);
          out.masterwork += Math.max(0, Number(stat.mw) || 0);
        }
      } else if (bucket === 3284755031 || bucket === 1506418338) {
        for (const plug of [...(item.perks || []), ...(item.modSockets || [])]) {
          for (const bonus of (plug && plug.s) || []) {
            if (Number(bonus.h) === Number(hash)) out.fragments += Number(bonus.v) || 0;
          }
        }
      }
    }
    return out;
  }

  function charStatMeter(value) {
    const n = Math.max(0, Math.min(200, Math.round(Number(value) || 0)));
    return `<span class="dinv-char-meter inv-stat-meter" role="progressbar" aria-valuemin="0" aria-valuemax="200" aria-valuenow="${n}" aria-label="${n} von 200"><i class="base" style="width:${(n / 200) * 100}%"></i></span>`;
  }

  function charHeadCell(character) {
    const emblem = character.emblemPath ? `https://www.bungie.net${esc(character.emblemPath)}` : '';
    const banner = character.emblemBackgroundPath ? `https://www.bungie.net${esc(character.emblemBackgroundPath)}` : '';
    const raceName = DIM.RACE_NAMES[Number(character.raceType)] || '';
    const icons = (data && data.charStatIcons) || {};
    const statsHtml = DIM.CHAR_STAT_HASHES.map((hash) => {
      const value = Math.max(0, Math.round(Number((character.stats || {})[hash]) || 0));
      const icon = icons[String(hash)] || icons[hash] || '';
      const label = DIM.STAT_LABELS[String(hash)] || 'Wert';
      const breakdown = characterStatBreakdown(character, hash);
      const rest = value - breakdown.base - breakdown.mods - breakdown.masterwork - breakdown.fragments;
      const parts = [
        `${value}/200`,
        `Rüstung ${breakdown.base}`,
        breakdown.mods ? `Mods +${breakdown.mods}` : '',
        breakdown.masterwork ? `Masterwork +${breakdown.masterwork}` : '',
        breakdown.fragments ? `Fragmente ${breakdown.fragments > 0 ? '+' : ''}${breakdown.fragments}` : '',
        rest ? `Rest ${rest > 0 ? '+' : ''}${rest}` : ''
      ].filter(Boolean);
      return `<span class="dinv-char-stat" title="${esc(label)}: ${esc(parts.join(' · '))}">` +
        `<span class="dinv-char-stat-top">${icon ? `<img src="https://www.bungie.net${esc(icon)}" alt="">` : ''}${value}</span>` +
        `${charStatMeter(value)}</span>`;
    }).join('');
    let html = `<div class="dinv-cell" data-drop="char" data-drop-id="${esc(character.id)}"><div class="dinv-char">`;
    html += `<div class="dinv-char-head">`;
    html += banner ? `<div class="dinv-char-bg" style="background-image:url('${banner}')"></div><div class="dinv-char-shade"></div>` : '';
    html += emblem ? `<div class="dinv-char-emblem" style="background-image:url('${emblem}')"></div>` : '';
    html += `<div class="dinv-char-info"><span class="dinv-char-name">${esc(DIM.CLASS_NAMES[character.classType] || 'Hüter')}</span>${raceName ? `<span class="dinv-char-race">${esc(raceName)}</span>` : ''}</div>`;
    html += `<span class="dinv-char-power">${character.light ? esc(String(character.light)) : ''}</span>`;
    html += `</div>`;
    html += `<div class="dinv-char-stats">${statsHtml}</div>`;
    html += `</div></div>`;
    return html;
  }

  // Kopfzeilen-Zelle für den Tresor (Glimmer/Splitter wie DIM).
  function vaultHeadCell(vaultList) {
    const cur = (data && data.currencies) || [];
    const glimmer = cur.find((entry) => entry.hash === DIM.GLIMMER_HASH);
    const shards = cur.find((entry) => entry.hash === DIM.SHARD_HASH);
    const fmt = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const curText = [glimmer ? `${fmt(glimmer.quantity)} Glimmer` : '', shards ? `${fmt(shards.quantity)} Splitter` : ''].filter(Boolean).join(' · ');
    let html = `<div class="dinv-cell" data-drop="vault"><div class="dinv-char">`;
    html += `<div class="dinv-char-head" style="background:linear-gradient(180deg,#141c28,#0e141f)">`;
    html += `<div class="dinv-char-info"><span class="dinv-char-name">Tresor</span><span class="dinv-char-race">${vaultList.length} Items${curText ? ` · ${esc(curText)}` : ''}</span></div>`;
    html += `</div></div></div>`;
    return html;
  }

  // Zell-Inhalt für einen Charakter und Bucket: equipped alleine oben
  // (StoreBucketDropTarget equip=true), darunter die Beutetasche als
  // auto-fill-Grid (sub-bucket).
  function charBucketCell(character, bucketHash, equippedList, backpackList) {
    const owner = character.id;
    const eq = equippedList.filter((item) => Number(item.bucket) === bucketHash);
    const bp = backpackList.filter((item) => Number(item.bucket) === bucketHash);
    if (!eq.length && !bp.length) return '';
    let html = `<div class="dinv-cell" data-drop="char" data-drop-id="${esc(owner)}">`;
    // Equipped-Zone immer da (DIM: equippable Buckets zeigen sie leeren
    // DropTarget) - hält die Zellen einer Zeile gleich hoch.
    html += `<div class="dinv-eq-row">${eq.length ? eq.map((item) => tileHtml(item, 'equipped', owner)).join('') : '<div class="dinv-eq-slot"></div>'}</div>`;
    if (bp.length) html += `<div class="dinv-sub">${tileWindow(bp, 'backpack', owner, `bp:${owner}:${bucketHash}`, 40)}</div>`;
    html += `</div>`;
    return html;
  }

  // Poststellen-Zelle: bis 21 Slots mit Platzhaltern (DIM), roter
  // FAST-VOLL-Warnrahmen ab 15 Items + Einsammeln-Button.
  function postmasterCell(character, postmasterList) {
    if (!postmasterList.length) return '';
    const slots = [];
    // Im TV-Modus keine 21 leeren Plätze aufblasen: nur belegte Slots
    // plus ein kleiner Puffer, damit die Ansicht kompakt bleibt.
    const compactMode = document.body.classList.contains('tv-mode')
      || document.body.classList.contains('mode-overlay');
    const slotCount = compactMode ? Math.min(21, Math.max(9, postmasterList.length + 2)) : 21;
    for (let i = 0; i < slotCount; i += 1) {
      const item = postmasterList[i];
      slots.push(item ? tileHtml(item, 'postmaster', character.id) : `<div class="dinv-pm-slot"></div>`);
    }
    const warn = postmasterList.length >= 15 ? ' dinv-pm-warn' : '';
    return `<div class="dinv-cell${warn}" data-drop="char" data-drop-id="${esc(character.id)}"><div class="dinv-pm-row">${slots.join('')}</div>` +
      `<button class="dinv-pm-pull" data-inv-pull="${esc(character.id)}"><span class="mail">✉</span>${postmasterList.length} Poststelle einsammeln</button></div>`;
  }

  // Tresor-Zelle für Waffen: flaches Raster - die Trennung nach
  // primär/sekundär/schwer kommt aus den Bucket-Zeilen (DIM-Standard).
  // Tresor-Zelle: Inhalt nach 4 Zeilen abschneiden + „Alle anzeigen“-
  // Aufklapper (spart Platz bei großen Tresor-Buckets).
  function vaultCell(key, inner, count) {
    return `<div class="dinv-cell dinv-vault-cell" data-drop="vault" data-vault-collapse="${esc(key)}" data-vault-count="${count}">` +
      `<div class="dinv-vault-body">${inner}</div>` +
      `<button type="button" class="dinv-vault-toggle" data-vault-toggle="${esc(key)}" hidden>▼ Alle anzeigen (${count})</button>` +
      `</div>`;
  }

  function vaultWeaponCell(items, key) {
    if (!items.length) return '<div class="dinv-cell"></div>';
    return vaultCell(key, `<div class="dinv-sub vault">${tileWindow(items, 'vault', '', `vault:${key}`, 80)}</div>`, items.length);
  }

  // Tresor-Zelle für Rüstung: nach Klasse gruppiert
  // (DIM VaultBucketDividedByClass: ClassIcon + Items je Klasse).
  function vaultArmorCell(items, characters, key) {
    if (!items.length) return '<div class="dinv-cell"></div>';
    const classOrder = (characters || []).map((c) => Number(c.classType)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 2);
    for (const value of [0, 1, 2]) { if (!classOrder.includes(value)) classOrder.push(value); }
    const groups = new Map();
    for (const item of items) {
      const cls = Number(item.classType ?? 3);
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls).push(item);
    }
    const body = classOrder.filter((classType) => groups.has(classType)).map((classType) => {
      const letter = (DIM.CLASS_NAMES[classType] || '?').slice(0, 1);
      const tiles = tileWindow(groups.get(classType) || [], 'vault', '', `vault:${key}:${classType}`, 60);
      return `<div class="dinv-vg"><div class="dinv-vg-class" title="${esc(DIM.CLASS_NAMES[classType] || 'Klasse')}">${esc(letter)}</div>${tiles}</div>`;
    }).join('');
    return vaultCell(key, `<div class="dinv-vault-stack">${body}</div>`, items.length);
  }

  // Tresor-Zelle für sonstige Buckets: flaches Grid (kein equippable).
  function vaultPlainCell(items, key) {
    if (!items.length) return '<div class="dinv-cell"></div>';
    return vaultCell(key, `<div class="dinv-sub vault">${tileWindow(items, 'vault', '', `vault:${key}`, 80)}</div>`, items.length);
  }

  // Zustand der Tresor-Aufklapper anwenden: exakt 4 Item-Zeilen
  // sichtbar lassen; der Button erscheint nur, wenn mehr vorhanden ist.
  function applyVaultCollapse() {
    if (!body) return;
    for (const cell of body.querySelectorAll('[data-vault-collapse]')) {
      const area = cell.querySelector('.dinv-vault-body');
      if (!area) continue;
      const key = cell.dataset.vaultCollapse;
      const count = Number(cell.dataset.vaultCount) || 0;
      // Kleine Zellen passen sicher in 4 Zeilen — keine Messung nötig.
      if (count <= 8) {
        area.style.maxHeight = '';
        area.classList.remove('collapsed');
        const smallToggle = cell.querySelector('[data-vault-toggle]');
        if (smallToggle) smallToggle.hidden = true;
        continue;
      }
      // Bei einer Treffer-Suche bleiben Tresorlisten offen, damit Treffer
      // nicht in der 4-Zeilen-Vorschau versteckt sind.
      const expanded = expandedVaults.has(key) || (searchActive && searchOnly);
      const row = cell.closest('.dinv-row');
      // content-visibility kann die Messung off-screen verfälschen.
      if (row) row.style.contentVisibility = 'visible';
      area.style.maxHeight = '';
      const tiles = area.querySelectorAll('.dinv-tile-wrap, .dinv-vg-class');
      const tops = [...new Set([...tiles].map((el) => el.offsetTop))].sort((a, b) => a - b);
      const overflowing = tops.length > 4;
      if (!expanded && overflowing) area.style.maxHeight = `${tops[4]}px`;
      area.classList.toggle('collapsed', !expanded && overflowing);
      if (row) row.style.contentVisibility = '';
      const toggle = cell.querySelector('[data-vault-toggle]');
      if (!toggle) continue;
      toggle.hidden = !(overflowing || expanded);
      toggle.textContent = expanded ? '▲ Weniger anzeigen' : `▼ Alle anzeigen (${cell.dataset.vaultCount})`;
    }
  }

  // ---------- DIM-Charakter-Spalte (StoreColumn + StoreHeader) ----------

  // ---------- Ergebnis-Box ----------
  function showResult(title, entries, actions) {
    if (!resultBox) return;
    if (!title && (!entries || !entries.length)) { resultBox.classList.add('hidden'); resultBox.innerHTML = ''; resultBox._actions = []; return; }
    const rows = (entries || []).map((entry) => entry.ok ? `<div class="r-ok">✓ ${esc(entry.text)}</div>` : `<div class="r-err">✗ ${esc(entry.text)}</div>`).join('');
    const actionButtons = (actions || [])
      .map((action, index) => `<button class="btn ghost small" data-inv-result-action="${index}">${esc(action.label)}</button>`)
      .join(' ');
    resultBox.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px"><strong>${esc(title || 'Ergebnis')}</strong><span style="display:flex;gap:6px">${actionButtons}<button class="btn ghost small" data-inv-result-close>×</button></span></div>${rows}`;
    resultBox._actions = actions || [];
    resultBox.classList.remove('hidden');
    const live = document.getElementById('invLive');
    if (live) {
      const ok = (entries || []).filter((entry) => entry.ok).length;
      const failed = (entries || []).filter((entry) => !entry.ok).length;
      live.textContent = `${title || 'Ergebnis'}: ${ok} erfolgreich${failed ? `, ${failed} Fehler` : ''}`;
    }
  }
  function hideResult() { showResult('', null); }

  // ---------- Item finden ----------
  function findItem(key, kind, owner) {
    if (!data) return null;
    const byKey = (list) => list.find((entry) => (entry.instanceId || String(entry.hash)) === key);
    if (kind === 'equipped') { for (const items of Object.values(data.equipped || {})) { const f = byKey(items); if (f) return f; } return null; }
    if (kind === 'vault') return byKey(data.vault || []);
    if (kind === 'postmaster') return byKey((data.postmaster && data.postmaster[owner]) || []);
    return byKey((data.backpack && data.backpack[owner]) || []);
  }

  // ---------- Transfer / Equip ----------
  function moveLocally(item, toVault, targetChar) {
    if (!data) return;
    const byId = (e) => e.instanceId === item.instanceId;
    // Immer zuerst aus der Poststelle entfernen, falls das Item dort
    // liegt (Poststelle-Abholung spiegelt sonst nie im UI wider).
    if (data.postmaster) {
      for (const list of Object.values(data.postmaster)) {
        const index = list.findIndex(byId);
        if (index >= 0) list.splice(index, 1);
      }
    }
    if (toVault) {
      if (data.backpack) for (const id of Object.keys(data.backpack)) data.backpack[id] = (data.backpack[id] || []).filter((e) => !byId(e));
      data.vault = data.vault || [];
      if (!data.vault.some(byId)) data.vault.push(item);
    } else {
      data.vault = (data.vault || []).filter((e) => !byId(e));
      data.backpack = data.backpack || {};
      data.backpack[targetChar] = (data.backpack[targetChar] || []).filter((e) => !byId(e));
      data.backpack[targetChar].push(item);
    }
  }

  function findAnyItemById(instanceId) {
    if (!data || !instanceId) return null;
    const lists = [
      data.vault || [],
      ...Object.values(data.backpack || {}),
      ...Object.values(data.equipped || {}),
      ...Object.values(data.postmaster || {})
    ];
    for (const list of lists) {
      for (const entry of list || []) {
        if (entry && entry.instanceId === instanceId) return entry;
      }
    }
    return null;
  }

  function syncToolsView() {
    if (!tools || !data) return;
    try {
      setToolsData(data);
    } catch (error) {
      // Werkzeuge dürfen Aktionen nicht blockieren.
    }
  }

  function equipLocally(item, characterId) {    if (!data || !item || !characterId) return;
    const byId = (entry) => entry.instanceId === item.instanceId;
    if (data.postmaster) {
      for (const list of Object.values(data.postmaster)) {
        const index = list.findIndex(byId);
        if (index >= 0) list.splice(index, 1);
      }
    }
    if (data.backpack) {
      for (const id of Object.keys(data.backpack)) {
        data.backpack[id] = (data.backpack[id] || []).filter((entry) => !byId(entry));
      }
    }
    data.vault = (data.vault || []).filter((entry) => !byId(entry));
    data.equipped = data.equipped || {};
    const equipped = data.equipped[characterId] || [];
    const slotIndex = equipped.findIndex((entry) => Number(entry.bucket) === Number(item.bucket));
    if (slotIndex >= 0) {
      const previous = equipped.splice(slotIndex, 1)[0];
      data.backpack[characterId] = data.backpack[characterId] || [];
      if (previous) data.backpack[characterId].push(previous);
    }
    equipped.push(item);
    data.equipped[characterId] = equipped;
  }

  // ---------- Offline-Ausgang (Transfers und Ausrüsten) ----------
  // Schlägt eine Aktion wegen Netzwerk, Rate-Limit oder abgelaufener
  // Anmeldung fehl, landet sie hier und wird beim nächsten Online-Event,
  // beim Inventar-Refresh oder per Knopf erneut gesendet. Rein lokal –
  // keine zusätzlichen Bungie-Aufrufe im Hintergrund.
  const OUTBOX_KEY = 'd2tool.outbox';
  const OUTBOX_MAX = 20;
  let outboxRunning = false;

  function readOutbox() {
    try {
      const list = JSON.parse(window.localStorage.getItem(OUTBOX_KEY) || '[]');
      return Array.isArray(list) ? list.filter((entry) => entry && entry.kind) : [];
    } catch (error) {
      return [];
    }
  }

  function writeOutbox(list) {
    try {
      window.localStorage.setItem(OUTBOX_KEY, JSON.stringify((list || []).slice(-OUTBOX_MAX)));
    } catch (error) {
      // localStorage voll → Ausgang bleibt im Speicher nutzlos, aber die App läuft.
    }
    renderOutbox();
    renderOutboxPanel();
    window.dispatchEvent(new CustomEvent('d2-outbox-change'));
  }

  function outboxRetryable(message) {
    return /offline|nicht erreichbar|netzwerk|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|429|rate.?limit|zu viele anfragen|wartung|maintenance|502|503|504|abgelaufen|nicht angemeldet|anmeldung/i
      .test(String(message || ''));
  }

  function outboxLabel(entry) {
    if (entry.kind === 'lock') {
      return `${entry.itemName || 'Item'} → ${entry.payload && entry.payload.lock ? 'markieren' : 'Markierung entfernen'}`;
    }
    if (entry.kind === 'plug') {
      return `${entry.itemName || 'Item'} → Mod anwenden`;
    }
    const target = entry.kind === 'equip'
      ? (entry.characterName ? `anlegen: ${entry.characterName}` : 'anlegen')
      : (entry.toVault ? 'Tresor' : (entry.characterName || 'Charakter'));
    return `${entry.itemName || 'Item'} → ${target}`;
  }

  function characterLabel(characterId) {
    const character = ((data && data.characters) || []).find((entry) => String(entry.id) === String(characterId));
    if (!character) return '';
    const className = DIM.CLASS_NAMES[Number(character.classType)] || 'Hüter';
    return `${className}${character.light ? ` ${character.light}` : ''}`;
  }

  // ---------- Champion-Prüfung: Waffen ohne erkannten Brecher ----------
  let championAuditOriginals = new Map();
  let championAuditUndo = null;

  function updateChampionAuditUndoButton() {
    const button = qs('#championAuditUndo');
    if (button) button.disabled = championAuditUndo == null;
  }

  function collectInventoryEntries() {
    if (!data) return [];
    const map = new Map();
    const add = (list, where) => {
      for (const item of list || []) {
        if (!item) continue;
        const key = String(item.instanceId || `h-${item.hash}`);
        if (!map.has(key)) map.set(key, { key, item, where });
      }
    };
    add(data.vault, 'Tresor');
    for (const [characterId, list] of Object.entries(data.backpack || {})) {
      add(list, characterLabel(characterId) || 'Beutetasche');
    }
    for (const [characterId, list] of Object.entries(data.equipped || {})) {
      add(list, `${characterLabel(characterId) || 'Hüter'} · angelegt`);
    }
    for (const list of Object.values(data.postmaster || {})) add(list, 'Poststelle');
    return [...map.values()];
  }

  function championAuditEntries() {
    return collectInventoryEntries()
      .filter(({ item }) => DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket)))
      .filter(({ item }) => championTypes(item).length === 0)
      .sort((a, b) => String(a.item.name || '').localeCompare(String(b.item.name || ''), 'de'));
  }

  function renderChampionAudit() {
    if (!championAuditPanel || !championAuditList) return;
    const entries = championAuditEntries();
    const allWeapons = collectInventoryEntries()
      .filter(({ item }) => DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket)));
    championAuditOriginals = new Map(entries.map((entry) => [entry.key, entry]));
    const count = qs('#championAuditCount');
    if (count) count.textContent = `${entries.length} ohne Brecher · ${allWeapons.length} Waffen`;
    if (!entries.length) {
      championAuditList.innerHTML = '<span class="inv-tool-muted">Alle Waffen haben einen erkannten oder manuell gesetzten Champion-Brecher.</span>';
      updateChampionAuditUndoButton();
      return;
    }
    championAuditList.innerHTML = entries.slice(0, 200).map(({ key, item, where }) => `
      <label class="champion-audit-row">
        <input type="checkbox" data-champion-audit-key="${esc(key)}">
        ${item.icon ? `<img src="https://www.bungie.net${esc(item.icon)}" alt="" loading="lazy">` : ''}
        <span class="champion-audit-name">${esc(item.name || 'Item')}</span>
        <small>${esc(item.typeName || '')}${where ? ` · ${esc(where)}` : ''}</small>
      </label>`).join('')
      + (entries.length > 200 ? `<span class="inv-tool-muted">… und ${entries.length - 200} weitere. Suche nutzt weiterhin „Ohne Champion“.</span>` : '');
    updateChampionAuditUndoButton();
  }

  function openChampionAudit() {
    if (!championAuditPanel) return;
    renderChampionAudit();
    championAuditPanel.classList.remove('hidden');
  }

  function applyChampionAudit(type) {
    const selected = [...championAuditList.querySelectorAll('[data-champion-audit-key]:checked')]
      .map((input) => String(input.dataset.championAuditKey || ''));
    if (!selected.length) {
      toast('Erst Waffen auswählen.', 'info', 1800);
      return;
    }
    let previous = '{}';
    try { previous = window.localStorage.getItem('d2tool.championOverrides') || '{}'; } catch (error) { previous = '{}'; }
    let changed = 0;
    for (const key of selected) {
      const entry = championAuditOriginals.get(key);
      if (!entry) continue;
      setChampionOverride(entry.item, type);
      changed += 1;
    }
    if (changed) {
      championAuditUndo = previous;
      updateChampionAuditUndoButton();
    }
    render();
    renderChampionAudit();
    toast(`${changed} Waffe${changed === 1 ? '' : 'n'} aktualisiert.`, 'success', 2200);
  }

  function undoChampionAudit() {
    if (championAuditUndo == null) return;
    try {
      window.localStorage.setItem('d2tool.championOverrides', championAuditUndo);
    } catch (error) {
      toast('Rückgängig konnte nicht gespeichert werden.', 'error', 2400);
      return;
    }
    championAuditUndo = null;
    updateChampionAuditUndoButton();
    render();
    renderChampionAudit();
    toast('Champion-Korrektur rückgängig gemacht.', 'info', 2200);
  }

  function exportChampionOverrides() {
    let map = {};
    try { map = JSON.parse(window.localStorage.getItem('d2tool.championOverrides') || '{}'); } catch (error) { map = {}; }
    const blob = new Blob([JSON.stringify({ format: 'd2tool.championOverrides', version: 1, overrides: map }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `d2tool-champions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast('Champion-Overrides exportiert.', 'success', 2000);
  }

  async function importChampionOverrides(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const source = data && typeof data === 'object' ? (data.overrides || data) : {};
      const next = {};
      for (const [key, value] of Object.entries(source)) {
        const type = Math.round(Number(value) || 0);
        if (key && type >= 1 && type <= 3) next[String(key)] = type;
      }
      if (!Object.keys(next).length) throw new Error('Keine gültigen Overrides in der Datei.');
      window.localStorage.setItem('d2tool.championOverrides', JSON.stringify(Object.fromEntries(Object.entries(next).slice(-200))));
      render();
      renderChampionAudit();
      toast(`${Object.keys(next).length} Champion-Override(s) importiert.`, 'success', 2400);
    } catch (error) {
      toast(`Import fehlgeschlagen: ${error.message || error}`, 'error', 3000);
    }
  }

  function enqueueOutbox(entry) {
    const list = readOutbox();
    const payload = entry.payload || {};
    const key = `${entry.kind}:${payload.itemId}:${payload.socketIndex || 0}:${payload.plugItemHash || 0}:${entry.toVault ? 1 : 0}:${entry.characterId || payload.characterId || ''}`;
    const existing = list.find((item) => {
      const itemPayload = item.payload || {};
      return `${item.kind}:${itemPayload.itemId}:${itemPayload.socketIndex || 0}:${itemPayload.plugItemHash || 0}:${item.toVault ? 1 : 0}:${item.characterId || itemPayload.characterId || ''}` === key;
    });
    if (existing) {
      existing.at = Date.now();
      existing.tries = (Number(existing.tries) || 0) + 1;
      existing.lastError = entry.lastError || existing.lastError || '';
      existing.nextTryAt = 0;
    } else {
      list.push({ ...entry, id: `ob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), tries: 1, nextTryAt: 0 });
    }
    writeOutbox(list);
    return list.length;
  }

  function renderOutbox() {
    if (!outboxBar) return;
    const list = readOutbox();
    if (!list.length) {
      outboxBar.classList.add('hidden');
      if (outboxText) outboxText.textContent = '';
      if (outboxPanel) outboxPanel.classList.add('hidden');
      return;
    }
    const transfers = list.filter((entry) => entry.kind === 'transfer').length;
    const equips = list.length - transfers;
    const parts = [];
    if (transfers) parts.push(`${transfers} Transfer${transfers === 1 ? '' : 's'}`);
    if (equips) parts.push(`${equips} Ausrüsten`);
    const lastError = list.map((entry) => entry.lastError).filter(Boolean).slice(-1)[0];
    if (outboxText) {
      outboxText.textContent = `Offline-Ausgang: ${list.length} Aktion${list.length === 1 ? '' : 'en'} warten (${parts.join(', ')})${lastError ? ` – ${lastError}` : ''}`;
    }
    outboxBar.classList.remove('hidden');
  }

  function renderOutboxPanel() {
    if (!outboxPanel || !outboxList) return;
    const list = readOutbox();
    if (!list.length) {
      outboxPanel.classList.add('hidden');
      outboxList.innerHTML = '';
      return;
    }
    outboxList.innerHTML = list.map((entry, index) => `
      <div class="inventory-outbox-row" data-outbox-id="${esc(entry.id)}">
        <div class="inventory-outbox-copy">
          <strong>${esc(outboxLabel(entry))}</strong>
          <small>${Number(entry.tries) || 0} Versuch${Number(entry.tries) === 1 ? '' : 'e'}${outboxConflictText(entry) ? ` · ${esc(outboxConflictText(entry))}` : ''}</small>
        </div>
        <button type="button" class="outbox-move" data-outbox-up="${index}" ${index === 0 ? 'disabled' : ''} title="Nach oben">↑</button>
        <button type="button" class="outbox-move" data-outbox-down="${index}" ${index === list.length - 1 ? 'disabled' : ''} title="Nach unten">↓</button>
        <button type="button" class="btn ghost small" data-outbox-retry="${esc(entry.id)}">Erneut</button>
        <button type="button" class="btn ghost small" data-outbox-remove="${esc(entry.id)}">Entfernen</button>
      </div>`).join('');
  }

  // Prüft vor dem erneuten Senden, ob die Aktion noch nötig ist.
  function itemLocationById(entry) {
    if (!data) return null;
    const itemId = String((entry.payload && entry.payload.itemId) || '');
    if (!itemId || itemId === '0') return null;
    const matches = (list) => (list || []).some((item) => String(item.instanceId || '') === itemId);
    if (matches(data.vault)) return { kind: 'vault' };
    for (const [characterId, list] of Object.entries(data.equipped || {})) {
      if (matches(list)) return { kind: 'equipped', characterId };
    }
    for (const [characterId, list] of Object.entries(data.backpack || {})) {
      if (matches(list)) return { kind: 'backpack', characterId };
    }
    for (const [characterId, list] of Object.entries(data.postmaster || {})) {
      if (matches(list)) return { kind: 'postmaster', characterId };
    }
    return { kind: 'missing' };
  }

  function outboxConflict(entry) {
    const location = itemLocationById(entry);
    if (!location) return null;
    if (location.kind === 'missing') return { done: false, error: 'Item ist nicht mehr im Inventar.' };
    if (entry.kind === 'lock' || entry.kind === 'plug') return null;
    if (entry.kind === 'equip') {
      if (location.kind === 'equipped' && String(location.characterId) === String(entry.characterId)) {
        return { done: true };
      }
      return null;
    }
    if (entry.toVault) {
      if (location.kind === 'vault') return { done: true };
      return null;
    }
    if ((location.kind === 'backpack' || location.kind === 'equipped')
      && String(location.characterId) === String(entry.characterId)) {
      return { done: true };
    }
    return null;
  }

  function outboxConflictText(entry) {
    const conflict = outboxConflict(entry);
    if (conflict && conflict.done) return 'Bereits erledigt';
    if (conflict && conflict.error) return conflict.error;
    if (Number(entry.nextTryAt) > Date.now()) {
      return `Nächster Versuch ${new Date(entry.nextTryAt).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return entry.lastError || '';
  }

  async function runOutbox(manual = false, onlyId = '') {
    if (outboxRunning) return;
    const queue = readOutbox();
    if (!queue.length) {
      renderOutbox();
      renderOutboxPanel();
      return;
    }
    if (!manual && !navigator.onLine) return;
    outboxRunning = true;
    const remaining = [];
    const report = [];
    let done = 0;
    for (const entry of queue) {
      if (onlyId && entry.id !== onlyId) {
        remaining.push(entry);
        continue;
      }
      if (!manual && Number(entry.nextTryAt) > Date.now()) {
        remaining.push(entry);
        continue;
      }
      const conflict = outboxConflict(entry);
      if (conflict && conflict.done) {
        done += 1;
        report.push({ ok: true, text: `${outboxLabel(entry)} (bereits erledigt)` });
        continue;
      }
      if (conflict && conflict.error) {
        report.push({ ok: false, text: `${outboxLabel(entry)}: ${conflict.error}` });
        continue;
      }
      let result;
      try {
        if (entry.kind === 'equip') result = await api.bungieEquip(entry.payload);
        else if (entry.kind === 'lock') result = await api.bungieLock(entry.payload);
        else if (entry.kind === 'plug') result = await api.bungieInsertPlug(entry.payload);
        else result = await api.bungieTransfer(entry.payload);
      } catch (error) {
        result = { ok: false, error: error.message || String(error) };
      }
      if (result && result.ok) {
        done += 1;
        report.push({ ok: true, text: outboxLabel(entry) });
        continue;
      }
      const message = (result && result.error) || 'Aktion fehlgeschlagen.';
      if (outboxRetryable(message)) {
        const tries = (Number(entry.tries) || 0) + 1;
        const backoff = Math.min(5 * 60 * 1000, 1500 * (2 ** Math.min(tries, 8)));
        remaining.push({ ...entry, lastError: message, tries, nextTryAt: Date.now() + backoff });
      } else {
        // Endgültig abgelehnt (z. B. Item nicht mehr vorhanden): nicht
        // ewig wiederholen, aber sichtbar melden.
        report.push({ ok: false, text: `${outboxLabel(entry)}: ${message}` });
      }
    }
    writeOutbox(remaining);
    outboxRunning = false;
    if (done) {
      await refresh(true).catch(() => {});
      render();
      syncToolsView();
    }
    if (report.length) showResult('Offline-Ausgang', report);
    if (done || report.some((entry) => !entry.ok)) {
      toast(
        `Offline-Ausgang: ${done} gesendet${remaining.length ? `, ${remaining.length} warten weiter` : ''}.`,
        remaining.length ? 'warning' : 'success',
        3200
      );
    }
  }

  async function doTransfer(item, toVault, characterId) {
    if (!data || !characterId) return;
    const payload = {
      itemHash: item.hash, itemId: item.instanceId,
      stackSize: item.instanceId ? 1 : Math.max(1, item.quantity),
      toVault, characterId, membershipType: data.membershipType
    };
    if (!navigator.onLine) {
      const count = enqueueOutbox({
        kind: 'transfer', payload, toVault, characterId,
        characterName: characterLabel(characterId),
        itemName: item.name || 'Item'
      });
      const msg = `Offline – in den Ausgang gelegt (${count} warten).`;
      toast(msg, 'warning', 3000);
      showResult('Transfer', [{ ok: false, text: msg }]);
      return;
    }
    const result = await api.bungieTransfer(payload);
    if (result && result.ok) {
      toast(toVault ? 'Item in den Tresor gelegt.' : 'Item zum Charakter geholt.', 'success', 1600);
      hideResult();
      moveLocally(item, toVault, characterId);
      selectedItem = null;
      closePopup();
      render();
      syncToolsView();
    } else {
      const msg = (result && result.error) || 'Übertragung fehlgeschlagen.';
      if (outboxRetryable(msg)) {
        const count = enqueueOutbox({
          kind: 'transfer', payload, toVault, characterId,
          characterName: characterLabel(characterId),
          itemName: item.name || 'Item', lastError: msg
        });
        const queued = `${msg} – in den Ausgang gelegt (${count} warten).`;
        toast(queued, 'warning', 3400);
        showResult('Transfer', [{ ok: false, text: queued }]);
        return;
      }
      toast(msg, 'error', 3200);
      showResult('Transfer', [{ ok: false, text: msg }]);
    }
  }

  async function doEquip(item, characterId) {
    if (!data || !characterId) return;
    const payload = { itemId: item.instanceId, characterId, membershipType: data.membershipType };
    if (!navigator.onLine) {
      const count = enqueueOutbox({
        kind: 'equip', payload, characterId,
        characterName: characterLabel(characterId),
        itemName: item.name || 'Item'
      });
      const msg = `Offline – in den Ausgang gelegt (${count} warten).`;
      toast(msg, 'warning', 3000);
      showResult('Ausrüsten', [{ ok: false, text: msg }]);
      return;
    }
    const result = await api.bungieEquip(payload);
    if (result && result.ok) {
      toast('Item angelegt.', 'success', 1600);
      hideResult();
      equipLocally(item, characterId);
      selectedItem = null;
      closePopup();
      render();
      syncToolsView();
    } else {
      const msg = (result && result.error) || 'Ausrüsten fehlgeschlagen.';
      if (outboxRetryable(msg)) {
        const count = enqueueOutbox({
          kind: 'equip', payload, characterId,
          characterName: characterLabel(characterId),
          itemName: item.name || 'Item', lastError: msg
        });
        const queued = `${msg} – in den Ausgang gelegt (${count} warten).`;
        toast(queued, 'warning', 3400);
        showResult('Ausrüsten', [{ ok: false, text: queued }]);
        return;
      }
      toast(msg, 'error', 3200);
      showResult('Ausrüsten', [{ ok: false, text: msg }]);
    }
  }

  // ---------- Poststelle einsammeln (DIM: Pull-Button) ----------
  // Alle Poststelle-Items sequenziell zum Charakter transferieren
  // (Bungie hat keinen Sammel-Endpunkt; TransferItem mit toVault=false
  // holt sie aus der Poststelle, auch ohne instanceId als Stapel).
  // Beutetaschen-Platz schaffen (DIM move-aside): Bei „no room“-Fehler
  // das niedrigste Power-Item derselben Kategorie in den Tresor
  // schieben und den Pull wiederholen. Engramme sind per API nie
  // pullbar (nicht transferierbar) - sie bleiben mit klarer Meldung.
  async function pullWithRoom(item, characterId) {
    const doPull = () => api.bungiePullPm({
      itemHash: item.hash,
      itemId: item.instanceId || '0',
      stackSize: item.instanceId ? 1 : Math.max(1, item.quantity),
      characterId, membershipType: data.membershipType
    });
    let result = await doPull();
    if (result && result.ok) return { pulled: true };
    const message = String((result && result.error) || 'Transfer fehl');
    if (/not found/i.test(message)) return { gone: true };
    // Bungie-1642: "There are no item slots available to transfer
    // this item." = Beutetaschen-Slots voll → Platz schaffen und
    // den Pull wiederholen (DIM move-aside).
    if (!/no item slots|no room|full|space|destination/i.test(message)) return { failed: true, message };
    // Platz schaffen: das niedrigste Power-Item derselben Kategorie
    // aus der Beutetasche in den Tresor.
    const bpList = ((data.backpack[characterId] || []))
      .filter((entry) => Number(entry.bucket) === Number(item.bucket))
      .sort((a, b) => (Number(a.power) || 0) - (Number(b.power) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'de'));
    const candidate = bpList[0];
    if (!candidate) return { failed: true, message };
    const stash = await api.bungieTransfer({ itemHash: candidate.hash, itemId: candidate.instanceId, stackSize: 1, toVault: true, characterId, membershipType: data.membershipType });
    if (!stash || !stash.ok) return { failed: true, message: `${message} (Platz schaffen fehl: ${(stash && stash.error) || '?'})` };
    moveLocally(candidate, true, characterId);
    render();
    syncToolsView();
    await new Promise((resolve) => setTimeout(resolve, 400));
    result = await doPull();
    if (result && result.ok) return { pulled: true, madeRoom: candidate.name };
    const message2 = String((result && result.error) || 'Transfer fehl');
    if (/not found/i.test(message2)) return { gone: true };
    return { failed: true, message: message2 };
  }

  async function pullPostmaster(characterId) {
    if (!data || !characterId) return;
    const list = (data.postmaster && data.postmaster[characterId]) || [];
    if (!list.length) { toast('Poststelle ist leer.', 'info', 1800); return; }
    const entries = [];
    let done = 0;
    for (const item of list.slice()) {
      try {
        // Engramme sind per API nicht transferierbar (Bungie-Regel) -
        // sie bleiben in der Poststelle, klare Meldung statt Fehler.
        if (/engram/i.test(`${item.name || ''} ${item.typeName || ''}`)) {
          entries.push({ ok: false, text: `${item.name}: Engramme müssen im Spiel eingesammelt werden` });
          continue;
        }
        const outcome = await pullWithRoom(item, characterId);
        if (outcome.pulled) {
          entries.push({ ok: true, text: outcome.madeRoom ? `${item.name} geholt (Platz geschafft: ${outcome.madeRoom} → Tresor)` : `${item.name} geholt` });
          done += 1;
          if (item.instanceId) sessionPulledPm.add(item.instanceId);
          // Optimistisch: sofort aus der Poststelle in die Beutetasche
          // (Bungie spiegelt Profile nach Transfers verzögert).
          const pmList = data.postmaster[characterId] || [];
          const index = pmList.indexOf(item);
          if (index >= 0) pmList.splice(index, 1);
          const bpList = (data.backpack[characterId] = data.backpack[characterId] || []);
          if (item.instanceId && !bpList.some((e) => e.instanceId === item.instanceId)) bpList.push(item);
          render();
        } else if (outcome.gone) {
          // „not found" von Bungie = das Item existiert nicht mehr in
          // der Poststelle - die Anzeige bereinigen.
          const pmList = data.postmaster[characterId] || [];
          const index = pmList.indexOf(item);
          if (index >= 0) pmList.splice(index, 1);
          if (item.instanceId) sessionPulledPm.add(item.instanceId);
          render();
          entries.push({ ok: true, text: `${item.name}: war bereits weg — Anzeige bereinigt` });
          done += 1;
        } else {
          // Echte Fehler: Item bleibt in der Anzeige (es ist real da).
          entries.push({ ok: false, text: `${item.name}: ${outcome.message}` });
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      } catch (error) {
        entries.push({ ok: false, text: `${item.name}: ${error.message || error}` });
      }
    }
    showResult(`Poststelle — ${done}/${list.length} eingesammelt`, entries);
    render();
    syncToolsView();
  }

  // ---------- Drag & Drop (Pointer-Events mit setPointerCapture) ----------
  // Mit Pointer-Capture am Tile kommen pointermove/pointerup garantiert
  // an - auch wenn der Cursor über das Webview gleitet. Kein HTML5-DnD
  // (das konnte im Webview eine Bild-URL als Navigation droppen).
  let dragState = null;
  let justDragged = false;

  function clearDropHighlight() {
    if (!body) return;
    for (const zone of body.querySelectorAll('.dinv-cell.drop-target')) zone.classList.remove('drop-target');
  }

  function attachDragHandlers() {
    if (!body) return;
    body.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const tile = event.target.closest('[data-inv-select]');
      if (!tile) return;
      const kind = String(tile.dataset.invKind || '');
      if (kind === 'equipped') return;
      const item = findItem(String(tile.dataset.invSelect || ''), kind, String(tile.dataset.invOwner || ''));
      if (!item) return;
      dragState = { item, kind, owner: String(tile.dataset.invOwner || ''), startX: event.clientX, startY: event.clientY, active: false, ghost: null, pointerId: event.pointerId, tile };
      // Capture: pointermove/pointerup kommen garantiert hier an.
      try { tile.setPointerCapture(event.pointerId); } catch (error) { /* egal */ }
    });
    body.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      if (!dragState.active) {
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 7) return;
        dragState.active = true;
        document.body.classList.add('dinv-dragging');
        hideTooltip();
        const ghost = document.createElement('div');
        ghost.className = 'dinv-drag-ghost';
        ghost.textContent = dragState.item.name || 'Item';
        document.body.appendChild(ghost);
        dragState.ghost = ghost;
      }
      event.preventDefault();
      if (dragState.ghost) {
        dragState.ghost.style.left = `${event.clientX + 12}px`;
        dragState.ghost.style.top = `${event.clientY + 12}px`;
      }
      clearDropHighlight();
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const editorTabHover = under && under.closest ? under.closest('.dinv-tab[data-tab="loadouts"]') : null;
      if (editorTabHover) editorTabHover.classList.add('drop-target');
      const zone = under && under.closest ? under.closest('[data-drop]') : null;
      if (zone) zone.classList.add('drop-target');
    });
    body.addEventListener('pointerup', async (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const state = dragState;
      dragState = null;
      try { state.tile.releasePointerCapture(state.pointerId); } catch (error) { /* egal */ }
      clearDropHighlight();
      document.body.classList.remove('dinv-dragging');
      if (state.ghost) state.ghost.remove();
      if (!state.active) return;
      // Der nachfolgende Klick darf das Popup nicht öffnen.
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      const under = document.elementFromPoint(event.clientX, event.clientY);
      // Drop auf den Loadout-Editor-Tab: Item direkt ins Set legen.
      const editorTabDrop = under && under.closest ? under.closest('.dinv-tab[data-tab="loadouts"]') : null;
      if (editorTabDrop) {
        addItemFromDrag(state.item, state.owner);
        return;
      }
      const zone = under && under.closest ? under.closest('[data-drop]') : null;
      if (!zone) { toast('Zieh das Item auf einen Charakter, den Tresor oder den Loadout-Editor.', 'info', 2200); return; }
      await handleDrop(state.item, state.kind, state.owner, String(zone.dataset.drop || ''), String(zone.dataset.dropId || ''));
    });
    body.addEventListener('pointercancel', () => {
      if (!dragState) return;
      const state = dragState;
      dragState = null;
      clearDropHighlight();
      document.body.classList.remove('dinv-dragging');
      if (state.ghost) state.ghost.remove();
    });
  }

  async function handleDrop(item, sourceKind, sourceOwner, targetKind, targetId) {
    if (targetKind === 'vault') {
      if (sourceKind === 'vault') { toast('Item ist bereits im Tresor.', 'info', 1500); return; }
      await doTransfer(item, true, sourceOwner || (data && data.characters && data.characters[0] && data.characters[0].id) || '');
    } else if (targetKind === 'char') {
      if (sourceKind === 'vault') {
        await doTransfer(item, false, targetId);
      } else if (sourceOwner && sourceOwner !== targetId) {
        // Charakter zu Charakter: erst in den Tresor, dann zum Ziel
        // (Bungie erlaubt nur Tresor-Transfer + Pull, wie in DIM).
        const stash = await api.bungieTransfer({
          itemHash: item.hash, itemId: item.instanceId, stackSize: 1,
          toVault: true, characterId: sourceOwner, membershipType: data.membershipType
        });
        if (stash && stash.ok) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          await doTransfer(item, false, targetId);
        } else {
          toast((stash && stash.error) || 'In den Tresor legen fehlgeschlagen.', 'error', 3200);
        }
      } else if (sourceKind === 'postmaster') {
        await doTransfer(item, false, targetId);
      } else {
        toast('Item ist bereits bei diesem Hüter.', 'info', 1500);
      }
    }
  }

  // ---------- Hover-Tooltip ----------
  // ---------- Hover-Tooltip ----------
  function searchHighlightTerms() {
    const raw = String((searchInput && searchInput.value) || '').trim();
    if (!raw) return [];
    const terms = [];
    const pattern = /"([^"]+)"|(\S+)/g;
    let match;
    while ((match = pattern.exec(raw))) {
      let token = String(match[1] || match[2] || '').replace(/^-/, '');
      if (!token || token.includes(':') || token.length < 2) continue;
      if (!terms.includes(token)) terms.push(token);
    }
    return terms.slice(0, 5);
  }

  function highlightSearchText(text) {
    const value = String(text || '');
    const terms = searchHighlightTerms();
    if (!terms.length) return esc(value);
    const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
    let html = '';
    let last = 0;
    let match;
    while ((match = pattern.exec(value))) {
      html += esc(value.slice(last, match.index));
      html += `<mark class="dinv-mark">${esc(match[0])}</mark>`;
      last = match.index + match[0].length;
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
    html += esc(value.slice(last));
    return html;
  }

  function tooltipHtml(item) {
    const r = Number(item.rarity) || 0;
    const rn = DIM.RARITY_NAME[r] || '';
    let html = `<strong class="dinv-tip-name tt${r}">${highlightSearchText(item.name || 'Item')}</strong>`;
    html += `<span style="color:#a0aabb">${highlightSearchText(item.typeName || 'Item')}${item.power ? ` · ${item.power} Power` : ''}${rn ? ` · ${esc(rn)}` : ''}</span>`;
    const elemLabel = elementName(item);
    const champLabels = championTypes(item).map((type) => CHAMPION_NAMES[type]);
    const champSourceLabel = { manuell: 'manuell', daten: 'Item-Daten', rahmen: 'Rahmen', keine: 'keine' }[championSource(item)] || 'keine';
    if (elemLabel || DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket))) {
      html += `<span class="inv-tip-tags"><span class="inv-tag-elem" title="Schadenselement">Element: ${esc(elemLabel || 'unbekannt')}</span>` +
        `<span class="inv-tag-champ" title="Abgedeckte Champions">Champion (${esc(champSourceLabel)}): ${esc(champLabels.length ? champLabels.join(', ') : 'keiner')}</span></span>`;
    }
    // Werte (Komponente 304): Armor-3.0-Stats bzw. Waffen-Stats.
    if (Array.isArray(item.stats) && item.stats.length) {
      html += `<span class="dinv-tip-stats">` +
        item.stats.map((stat) => `<span class="dinv-tip-stat"><span>${esc(stat.label || 'Wert')}</span><b>${Math.round(Number(stat.value) || 0)}</b></span>`).join('') +
        `</span>`;
    }
    if (item.flavor) html += `<span style="color:#a0aabb;font-style:italic">${esc(item.flavor)}</span>`;
    // Die genaue Funktion (Mods/Perks): displayProperties.description.
    if (item.description) html += `<span style="color:#cfd7e3">${esc(item.description)}</span>`;
    if (item.perks && item.perks.length) {
      html += `<span style="display:flex;flex-wrap:wrap;gap:3px">`;
      html += item.perks.map((perk) => {
        const isGod = (item.godPerks || []).includes(Number(perk.hash) || 0);
        return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 4px;border:1px solid ${isGod ? '#29f36a' : '#2a3548'};border-radius:4px;color:${isGod ? '#29f36a' : '#e8ecf2'};background:rgba(255,255,255,0.04)">` +
          (perk.i ? `<img src="https://www.bungie.net${esc(perk.i)}" style="width:18px;height:18px;border-radius:3px;object-fit:contain" alt="">` : '') +
          `<span>${highlightSearchText(perk.n)}${isGod ? ' ✓' : ''}</span></span>`;
      }).join('');
      html += `</span>`;
    }
    if (item.godRoll) html += `<span style="color:#29f36a;font-weight:700">✓ God Roll${item.godNotes ? ` — ${esc(item.godNotes)}` : ''}</span>`;
    if (!item.godRoll && item.nearGodRoll) {
      const missing = (item.nearGodRoll.missing || []).join(', ');
      html += `<span style="color:#f3c66a;font-weight:700">≈ Fast-Godroll${missing ? ` — fehlt: ${esc(missing)}` : ''}${item.nearGodRoll.notes ? ` — ${esc(item.nearGodRoll.notes)}` : ''}</span>`;
    }
    if (item.godPerks && item.godPerks.length) {
      const matched = (item.perks || []).filter((perk) => (item.godPerks || []).includes(Number(perk.hash) || 0)).map((perk) => perk.n).filter(Boolean);
      if (matched.length) {
        html += `<span class="inv-godperks" title="Treffer aus der Wunschliste">${matched.map((name) => `<span class="inv-godperk">✓ ${esc(name)}</span>`).join('')}</span>`;
      }
    }
    if (DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket)) && item.stats && item.stats.length) {
      const total = item.stats.reduce((sum, stat) => sum + (Number(stat.value) || 0), 0);
      const hundreds = item.stats.filter((stat) => (Number(stat.value) || 0) >= 100).map((stat) => stat.label).filter(Boolean);
      html += `<span class="inv-stat-total" title="Summe aller Rüstungswerte">Stats ${total}${hundreds.length ? ` · 100+: ${esc(hundreds.join(', '))}` : ''}</span>`;
    }
    return html;
  }

  // Tooltip für Mods/Perks/Subklassen-Plugs (Name, Kategorie,
  // Beschreibung, Stat-Boni) — im Loadout-Editor und in den Picker-
  // Sheets.
  function plugTipHtml(plug) {
    const p = plug || {};
    const cat = prettyCategory(p.p || '');
    let html = `<strong class="dinv-tip-name">${esc(p.n || 'Mod')}</strong>`;
    html += `<span style="color:#a0aabb">${esc(cat || 'Mod')}</span>`;
    if (p.d) html += `<span class="dinv-tip-plugdesc">${esc(p.d)}</span>`;
    const bonuses = Array.isArray(p.s) ? p.s : [];
    if (bonuses.length) {
      html += `<span class="dinv-tip-bonus">` + bonuses.map((bonus) => {
        const label = DIM.STAT_LABELS[String(bonus.h)] || `Wert ${bonus.h}`;
        const value = Math.round(Number(bonus.v) || 0);
        return `${esc(label)} ${value > 0 ? '+' : ''}${value}`;
      }).join(' · ') + `</span>`;
    }
    return html;
  }

  function positionTooltip(tile) {
    if (!tooltipEl || !tile) return;
    const rect = tile.getBoundingClientRect();
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.classList.add('show');
    positionFixedTip(tooltipEl, rect.left, rect.bottom, { offset: 8, padding: 12, maxWidth: 320 });
    tooltipEl.style.visibility = '';
  }
  // ---------- Plug-Detail-Overlay (Mods/Artefakt-Perks) ----------
  let plugTip = null;

  function ensurePlugTip() {
    if (!plugTip) {
      plugTip = document.createElement('div');
      plugTip.className = 'dinv-plug-tip';
      document.body.appendChild(plugTip);
    }
    return plugTip;
  }

  function showPlugTip(anchor, title, desc, sub) {
    if (!anchor) return;
    const tip = ensurePlugTip();
    tip.innerHTML =
      `<strong>${esc(title || 'Mod')}</strong>` +
      (sub ? `<span class="plug-sub">${esc(sub)}</span>` : '') +
      (desc ? `<p>${esc(desc)}</p>` : `<p class="plug-hint">Keine Beschreibung verfügbar.</p>`);
    tip.classList.add('show');
    const rect = anchor.getBoundingClientRect();
    positionFixedTip(tip, rect.left, rect.bottom, { offset: 8, padding: 12, maxWidth: 340 });
  }

  function hidePlugTip() {
    if (plugTip) { plugTip.classList.remove('show'); plugTip.innerHTML = ''; }
  }

  // Perk-/Mod-Erklärung im DIM-Stil: Name, „Verbessertes Attribut“,
  // Status (Ausgewählt/Godroll) und die genaue Funktion.
  function showPerkTip(anchor, plug) {
    if (!anchor || !plug) return;
    const tip = ensurePlugTip();
    const tags = [];
    if (plug.enh) tags.push('<span class="plug-enh">↑ Verbessertes Attribut</span>');
    if (plug.selected) tags.push('<span class="plug-state">Ausgewählt</span>');
    if (plug.god) tags.push('<span class="plug-state god">✓ Godroll</span>');
    tip.innerHTML =
      `<strong class="plug-title">${esc(plug.n || 'Perk')}</strong>` +
      (tags.length ? `<span class="plug-tags">${tags.join('')}</span>` : '') +
      (plug.d ? `<p>${esc(plug.d)}</p>` : `<p class="plug-hint">Keine Beschreibung verfügbar.</p>`);
    tip.classList.add('show');
    const rect = anchor.getBoundingClientRect();
    positionFixedTip(tip, rect.left, rect.bottom, { offset: 8, padding: 12, maxWidth: 340 });
  }

  function hideTooltip() { if (tooltipEl) { tooltipEl.classList.remove('show'); tooltipEl.innerHTML = ''; } }


  // ---------- Render ----------
  function renderStatus() {
    const el = qs('#inventoryStatus');
    if (!el || !data) return;
    const wl = data.wishlist || {};
    if (!wl.loaded) {
      el.innerHTML = `<span class="warn">✓-Wunschliste nicht geladen${wl.sources && wl.sources.some((s) => !s.ok) ? ` (${esc(wl.sources.filter((s) => !s.ok).map((s) => s.error).join(', '))})` : ''} — Einstellungen → Bungie prüfen.</span>`;
      return;
    }
    const hits = Number(data.godrolls) || 0;
    let text = `<span class="ok">✓-Wunschliste aktiv: ${Number(wl.count) || 0} Einträge · ${hits} Treffer.</span>`;
    const bad = (wl.sources || []).filter((s) => !s.ok);
    if (bad.length) text += ` <span class="warn">⚠ ${esc(bad.map((s) => `${s.url} (${s.error})`).join(', '))}</span>`;
    if (!hits) text += ` <span class="warn">Keine Treffer — aktuellere Wunschliste ergänzen.</span>`;
    el.innerHTML = text;
  }

  function focusFirstSearchHit() {
    const first = body && body.querySelector('.dinv-tile:not(.inv-dim)');
    if (!first) {
      toast('Keine Treffer für diese Suche.', 'info', 1600);
      return;
    }
    try { first.focus({ preventScroll: true }); } catch (error) { /* egal */ }
    try { first.scrollIntoView({ block: 'center', inline: 'center' }); } catch (error) { /* egal */ }
    if (document.body.classList.contains('pad-active')) {
      const rect = first.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('d2-pad-focus', {
        detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, showCursor: true }
      }));
    }
  }

  let watchCheckedAt = 0;

  function checkWatchlist() {
    if (!data || !data.fetchedAt || watchCheckedAt === data.fetchedAt) return;
    watchCheckedAt = data.fetchedAt;
    const names = ((getCfg().bungie && getCfg().bungie.watchlist) || []).map(String).filter(Boolean);
    const rules = ((getCfg().bungie && getCfg().bungie.watchRules) || []).filter((rule) => rule && rule.weapon);
    if (!names.length && !rules.length) return;
    const fresh = [];
    if (names.length) {
      const wanted = new Set(names.map((name) => name.toLowerCase()));
      const owned = new Map();
      for (const item of allItemsPool()) {
        const name = String(item.name || '');
        if (!name || !wanted.has(name.toLowerCase())) continue;
        owned.set(String(item.instanceId || item.hash), name);
      }
      let seen = {};
      try { seen = JSON.parse(window.localStorage.getItem('d2tool.watchSeen') || '{}') || {}; } catch (error) { seen = {}; }
      for (const [id, name] of owned) if (!seen[id]) fresh.push(name);
      for (const id of Object.keys(seen)) if (!owned.has(id)) delete seen[id];
      for (const [id, name] of owned) seen[id] = name;
      try { window.localStorage.setItem('d2tool.watchSeen', JSON.stringify(seen)); } catch (error) { /* egal */ }
    }
    if (rules.length) {
      const perkSetOf = (item) => {
        const set = new Set();
        for (const perk of item.perks || []) if (perk && perk.n) set.add(String(perk.n).toLowerCase());
        for (const column of item.socketColumns || []) {
          for (const option of column.options || []) if (option && option.selected && option.n) set.add(String(option.n).toLowerCase());
        }
        return set;
      };
      let seenRules = {};
      try { seenRules = JSON.parse(window.localStorage.getItem('d2tool.watchRuleSeen') || '{}') || {}; } catch (error) { seenRules = {}; }
      for (const rule of rules) {
        const weapon = String(rule.weapon).toLowerCase();
        const perks = (rule.perks || []).map((perk) => String(perk).toLowerCase()).filter(Boolean);
        if (!perks.length) continue;
        for (const item of allItemsPool()) {
          if (String(item.name || '').toLowerCase() !== weapon) continue;
          if (!perks.every((perk) => perkSetOf(item).has(perk))) continue;
          const key = `rule:${weapon}:${String(item.instanceId || item.hash)}`;
          if (!seenRules[key]) fresh.push(`${item.name} (${perks.join(' + ')})`);
          seenRules[key] = 1;
        }
      }
      try { window.localStorage.setItem('d2tool.watchRuleSeen', JSON.stringify(seenRules)); } catch (error) { /* egal */ }
    }
    if (fresh.length && api && typeof api.notifyMessage === 'function') {
      api.notifyMessage('Beobachtete Waffe gefunden', [...new Set(fresh)].join(', ')).catch(() => {});
    }
  }

  // Overlay-Hinweis, wenn der Tresor fast voll ist.
  function syncVaultWarning() {
    const chip = document.getElementById('overlayVault');
    const value = document.getElementById('overlayVaultValue');
    if (!chip || !value) return;
    const count = ((data && data.vault) || []).length;
    const percent = Math.round((count / 1300) * 100);
    if (count && percent >= 95) {
      value.textContent = count + ' · ' + percent + '%';
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
  }

  async function exportVaultCsv() {
    const items = (data && data.vault) || [];
    if (!items.length) { toast('Kein Tresor geladen.', 'info', 2200); return; }
    const escape = (value) => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    const header = ['Name', 'Typ', 'Slot', 'Power', 'Tier', 'Archetyp', 'Gesundheit', 'Nahkampf', 'Granate', 'Super', 'Klasse', 'Waffen', 'Perks', 'Set'];
    const rows = items.map((item) => {
      const stat = (hash) => Number(((item.stats || []).find((entry) => Number(entry.hash) === hash) || {}).value) || 0;
      return [
        item.name, item.typeName, item.slotLabel || item.bucket, item.power, item.gearTier || '',
        item.archetype || '',
        stat(392767087), stat(4244567218), stat(1735777505), stat(144602215), stat(1943323491), stat(2996146975),
        (item.perks || []).map((perk) => perk.n).filter(Boolean).join(' | '),
        (item.setInfo && item.setInfo.name) || ''
      ].map(escape).join(';');
    });
    const csv = [header.map(escape).join(';'), ...rows].join('\r\n');
    if (api && typeof api.saveTextFile === 'function') {
      const result = await api.saveTextFile({ text: csv, name: 'destiny2-tresor', title: 'Tresor als CSV speichern', extension: 'csv', filterName: 'CSV' });
      if (result && result.ok) toast('Tresor-CSV gespeichert.', 'success', 2400);
      else if (!(result && result.canceled)) toast((result && result.error) || 'Speichern fehlgeschlagen.', 'error', 2600);
    }
  }

  function searchWorkerPayload(version) {
    if (searchWorkerCache.has(`items:${version}`)) return searchWorkerCache.get(`items:${version}`);
    const items = [];
    const seen = new Set();
    const add = (list) => {
      for (const item of list || []) {
        if (!item) continue;
        const key = String(item.instanceId || item.hash || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({ key, name: item.name || '', typeName: item.typeName || '' });
      }
    };
    add(data && data.vault);
    for (const list of Object.values((data && data.backpack) || {})) add(list);
    for (const list of Object.values((data && data.equipped) || {})) add(list);
    for (const list of Object.values((data && data.postmaster) || {})) add(list);
    searchWorkerCache.set(`items:${version}`, items);
    return items;
  }

  function ensureSearchWorker() {
    if (searchWorker || searchWorkerDisabled) return searchWorker;
    try {
      searchWorker = new Worker(new URL('./search-worker.js', import.meta.url));
      window.__d2SearchWorkerActive = true;
      searchWorker.onmessage = (event) => {
        const payload = event.data || {};
        if (Number(payload.dataVersion) !== searchDataVersion(data)) return;
        const key = `${payload.dataVersion}|${foldSearch(payload.query)}`;
        searchWorkerCache.set(key, { keys: new Set((payload.keys || []).map(String)), fuzzy: Number(payload.fuzzy) || 0 });
        while (searchWorkerCache.size > 80) {
          let removed = false;
          for (const cacheKey of searchWorkerCache.keys()) {
            if (String(cacheKey).startsWith('items:')) continue;
            searchWorkerCache.delete(cacheKey);
            removed = true;
            break;
          }
          if (!removed) break;
        }
        const current = String((searchInput && searchInput.value) || '').trim().toLowerCase();
        if (current === String(payload.query || '').trim().toLowerCase()) render();
      };
      searchWorker.onerror = () => {
        searchWorkerDisabled = true;
        searchWorker = null;
        window.__d2SearchWorkerActive = false;
      };
    } catch (error) {
      searchWorkerDisabled = true;
      searchWorker = null;
      window.__d2SearchWorkerActive = false;
    }
    return searchWorker;
  }

  function requestSearchWorker(query, version) {
    const worker = ensureSearchWorker();
    if (!worker) return;
    searchWorkerJob += 1;
    worker.postMessage({
      id: searchWorkerJob,
      query,
      dataVersion: version,
      items: searchWorkerPayload(version)
    });
  }

  let inventoryScrollRestoreId = 0;
  let inventoryPendingScroll = null;
  function render() {
    if (!body) return;
    chunkedLists.clear();
    syncVaultWarning();
    checkWatchlist();
    if (view) view.classList.toggle('dinv-compact', ((getCfg().bungie && getCfg().bungie.inventoryDensity) || 'comfortable') === 'compact');
    if (!data) { body.innerHTML = '<div style="padding:20px;color:#7a8494">Nicht geladen – „Aktualisieren" drücken.</div>'; return; }
    // Beim Neuaufbau die Scroll-Position halten – sonst springt die
    // Ansicht bei Hintergrund-Updates (Suche, Watchlist, Refresh) hoch.
    // Ein echter Nutzer-Scroll (DOM > 0) hat Vorrang vor einem alten Ziel.
    const domScrollTop = body.scrollTop;
    const reusePending = Boolean(inventoryPendingScroll && domScrollTop === 0 && inventoryPendingScroll.top > 0);
    const previousScrollTop = reusePending ? inventoryPendingScroll.top : domScrollTop;
    const tokens = parseSearch((searchInput && searchInput.value) || '');
    if (searchState.godrollOnly) tokens.push({ op: 'is', value: 'godroll' });
    // sort:name|power|rarity überschreibt die Sortierung nur für diese Suche.
    const sortIndex = tokens.findIndex((token) => token.op === 'sort');
    if (sortIndex >= 0) {
      const value = String(tokens[sortIndex].value || '');
      searchSortOverride = ['power', 'name', 'rarity', 'stats', 'tier', 'archetype'].includes(value) ? value : '';
      tokens.splice(sortIndex, 1);
    } else {
      searchSortOverride = '';
    }
    // Einfache Freitext-Suchen kann der Worker übernehmen. Sobald
    // Operatoren im Spiel sind, bleibt die synchrone Suche zuständig.
    const simpleSearch = tokens.length === 1 && tokens[0].text && !tokens[0].negate ? tokens[0] : null;
    const dataVersion = searchDataVersion(data);
    const workerSearch = simpleSearch
      ? searchWorkerCache.get(`${dataVersion}|${foldSearch(simpleSearch.text)}`)
      : null;
    const dupeSet = duplicateHashes(data);
    const statDupeSet = duplicateStatKeys(data);
    const statLowerSet = statLowerKeys(data);
    const armorWishSet = armorWishKeys(data);
    for (const item of armorItemsOf(data)) {
      const key = itemKeyOf(item);
      item.statLower = statLowerSet.has(key);
      item.statDupe = statDupeSet.has(key);
    }
    // Suche dimmt nicht passende Items nur (kein Umordnen/Umbrechen).
    const searchMatches = new Set();
    fuzzySearchHits = workerSearch ? Number(workerSearch.fuzzy) || 0 : 0;
    const markMatches = (list, where) => {
      for (const item of list) {
        const key = String(item.instanceId || item.hash || '');
        if (workerSearch) {
          if (workerSearch.keys.has(key)) searchMatches.add(key);
        } else if (itemMatches(item, tokens, dupeSet, where, statDupeSet, statLowerSet, armorWishSet)) {
          searchMatches.add(key);
        }
      }
      return list;
    };
    const chars = (data.characters || []).map((character) => ({
      character,
      eq: markMatches(sortItems((data.equipped && data.equipped[character.id]) || []), 'equipped'),
      bp: markMatches(sortItems((data.backpack && data.backpack[character.id]) || []), 'backpack'),
      pm: markMatches(sortItems((data.postmaster && data.postmaster[character.id]) || []), 'postmaster')
    }));
    const vaultList = markMatches(sortItems(data.vault || []), 'vault');
    searchActive = tokens.length > 0;
    searchMatchKeys = searchMatches;
    const onlyMatches = searchActive && searchOnly;
    document.body.classList.toggle('dinv-search-only', onlyMatches);
    if (searchOnlyBtn) {
      searchOnlyBtn.classList.toggle('active', searchOnly);
      searchOnlyBtn.textContent = searchOnly ? 'Nur Treffer' : 'Alle zeigen';
      searchOnlyBtn.title = searchOnly
        ? 'Nur Treffer anzeigen (Klick: Treffer nur dimmen)'
        : 'Treffer nur dimmen (Klick: nur Treffer anzeigen)';
    }
    if (simpleSearch && !workerSearch) requestSearchWorker(simpleSearch.text, dataVersion);
    const searchCountEl = qs('#inventorySearchCount');
    if (searchCountEl) searchCountEl.textContent = tokens.length ? `${searchMatches.size} Treffer${fuzzySearchHits ? ' · unscharf' : ''}` : '';
    const vaultBy = (hash) => vaultList.filter((item) => Number(item.bucket) === hash);
    const hasCharItems = (hash) => chars.some(({ eq, bp }) => eq.concat(bp).some((item) => Number(item.bucket) === hash));

    // ---- Kopfzeile: Charakter-Banner + Tresor (store-header) ----
    let html = `<div class="dinv-row dinv-head-row">${chars.map(({ character }) => charHeadCell(character)).join('')}${vaultHeadCell(vaultList)}</div>`;

    // ---- Poststelle-Zeile (DIM: erste Sektion) ----
    if (chars.some(({ pm }) => pm.length)) {
      html += `<div class="dinv-cat">▼ Poststelle</div>`;
      html += `<div class="dinv-row">${chars.map(({ character, pm }) => postmasterCell(character, pm)).join('')}<div class="dinv-cell"></div></div>`;
    }

    // ---- Waffen-Zeilen (Kinetic | Energie | Power, je 4 Zellen) ----
    let weaponsHtml = '';
    for (const slot of DIM.WEAPON_SLOTS) {
      const vaultItems = vaultBy(slot.key);
      if (!hasCharItems(slot.key) && !vaultItems.length) continue;
      const cells = chars.map(({ character, eq, bp }) => charBucketCell(character, slot.key, eq, bp)).join('');
      weaponsHtml += `<div class="dinv-row">${cells}${vaultWeaponCell(vaultItems, 'w-' + slot.key)}</div>`;
    }
    if (weaponsHtml) html += `<div class="dinv-cat">▼ Waffen</div>${weaponsHtml}`;

    // ---- Rüstungs-Zeilen (5 Slots, Tresor nach Klasse gruppiert) ----
    let armorHtml = '';
    for (const slot of DIM.ARMOR_SLOTS) {
      const vaultItems = vaultBy(slot.key);
      if (!hasCharItems(slot.key) && !vaultItems.length) continue;
      const cells = chars.map(({ character, eq, bp }) => charBucketCell(character, slot.key, eq, bp)).join('');
      armorHtml += `<div class="dinv-row">${cells}${vaultArmorCell(vaultItems, (data.characters || []), 'a-' + slot.key)}</div>`;
    }
    if (armorHtml) html += `<div class="dinv-cat">▼ Rüstung</div>${armorHtml}`;

    // ---- Sonstiges (Geist | Subklasse | Artefakt + Account-wide-Buckets) ----
    let generalHtml = '';
    for (const hash of [DIM.B.GHOST, DIM.B.SUBCLASS, DIM.B.ARTIFACT]) {
      const vaultItems = vaultBy(hash);
      if (!hasCharItems(hash) && !vaultItems.length) continue;
      const cells = chars.map(({ character, eq, bp }) => charBucketCell(character, hash, eq, bp)).join('');
      generalHtml += `<div class="dinv-row">${cells}${vaultPlainCell(vaultItems, 'g-' + hash)}</div>`;
    }
    // Account-wide-Buckets (DIM: aktiver Charakter spannt 3 Spalten + Tresor).
    const activeChar = chars[0];
    for (const extra of DIM.EXTRA) {
      const vaultItems = vaultBy(extra.key);
      const charItems = activeChar
        ? activeChar.eq.concat(activeChar.bp).filter((item) => Number(item.bucket) === extra.key)
        : [];
      if (!charItems.length && !vaultItems.length) continue;
      const charTiles = tileWindow(charItems, 'backpack', activeChar ? activeChar.character.id : '', `extra:${extra.key}:${activeChar ? activeChar.character.id : ''}`, 60);
      generalHtml += `<div class="dinv-row"><div class="dinv-cell aw3"><div class="dinv-sub">${charTiles}</div></div>${vaultPlainCell(vaultItems, 'e-' + extra.key)}</div>`;
    }
    // Kein „Anderes“-Sammelbecken mehr: Quests, Aufträge, Engramme,
    // Materialien, Währungen, Clan-Banner und andere Nicht-Inventar-
    // Buckets blendet DIM im Inventar ebenfalls aus.
    if (generalHtml) html += `<div class="dinv-cat">▼ Sonstiges</div>${generalHtml}`;

    const scopeHint = (!vaultList.length && !(data.backpack || {}).hasOwnProperty(Object.keys(data.backpack || {})[0]) && Object.values(data.equipped || {}).some((items) => items.length))
      ? '<div style="margin:10px 14px;padding:8px 10px;border:1px solid #f0c66b;border-radius:6px;background:rgba(240,198,107,0.08);font-size:11px">⚠ Tresor und Beutetaschen leer — Scopes im Portal prüfen und neu anmelden.</div>'
      : '';

    body.innerHTML = html + scopeHint;
    if (window.enhanceTvTargets) window.enhanceTvTargets(body);
    applyVaultCollapse();
    applyLazyInventoryRows();
    initChunkLists();

    if (selectedItem) {
      const tile = body.querySelector(`[data-inv-select="${CSS.escape(selectedItem.key)}"]`);
      if (tile) tile.classList.add('selected');
      else { selectedItem = null; closePopup(); }
    }
    // Höhe erst nach dem nächsten Frame final: über mehrere Frames
    // wiederherstellen, jeweils mit vorheriger Höhenmessung. Das Ziel
    // überlebt Folge-Renders, damit diese nicht 0 aus dem DOM lesen.
    const restoreId = ++inventoryScrollRestoreId;
    inventoryPendingScroll = { top: previousScrollTop, id: restoreId };
    const applyScroll = (last) => {
      if (!inventoryPendingScroll || inventoryPendingScroll.id !== restoreId) return;
      void body.scrollHeight;
      body.scrollTop = previousScrollTop;
      if (last) inventoryPendingScroll = null;
    };
    applyScroll(false);
    if (Math.abs(body.scrollTop - previousScrollTop) <= 2) {
      inventoryPendingScroll = null;
    } else {
      requestAnimationFrame(() => {
        applyScroll(false);
        requestAnimationFrame(() => {
          applyScroll(false);
          requestAnimationFrame(() => applyScroll(true));
        });
      });
    }
  }

  // ---------- Virtuelle Tastatur (Controller-Suche) ----------
  let padKeyboard = null;
  function syncPadKeyboardValue() {
    if (!padKeyboard || !searchInput) return;
    const value = padKeyboard.querySelector('.inv-pad-kb-value');
    if (value) value.textContent = searchInput.value || 'Suchbegriff …';
  }
  const KB_HISTORY_KEY = 'd2inv.searchHistory';
  function kbSearchHistory() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(KB_HISTORY_KEY) || '[]');
      return Array.isArray(raw)
        ? raw.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, 12)
        : [];
    } catch (error) {
      return [];
    }
  }
  function addKbSearchHistory(value) {
    const text = String(value || '').trim();
    if (text.length < 2) return;
    const list = kbSearchHistory().filter((entry) => entry.toLowerCase() !== text.toLowerCase());
    list.unshift(text);
    try {
      window.localStorage.setItem(KB_HISTORY_KEY, JSON.stringify(list.slice(0, 12)));
    } catch (error) {
      // egal
    }
  }
  // Unscharfer Treffer: erst exakt/Präfix/Teilstring, dann Zeichen-
  // folge (z. B. „gnh“ findet „Gnawing Hunger“).
  function fuzzyScore(text, query) {
    const hay = String(text || '').toLowerCase();
    const needle = String(query || '').toLowerCase();
    if (!needle) return 0;
    if (hay === needle) return 1200;
    if (hay.startsWith(needle)) return 1000 - hay.length * 0.1;
    const direct = hay.indexOf(needle);
    if (direct >= 0) return 800 - direct - hay.length * 0.05;
    let position = 0;
    let score = 0;
    let previous = -2;
    for (const char of needle) {
      const found = hay.indexOf(char, position);
      if (found < 0) return 0;
      score += found === previous + 1 ? 6 : 1;
      previous = found;
      position = found + 1;
    }
    return 200 + score;
  }
  // ---------- Filter-Menü am Suchfeld ----------
  // Ersetzt die frühere Chip-Spalte: gleiche Funktion, aber als
  // kompaktes Aufklappmenü ohne zusätzlichen Platz.
  const FILTER_PRESETS = [
    { token: 'is:godroll', label: 'Godroll' },
    { token: 'is:neargodroll', label: 'Fast-Godroll' },
    { token: 'is:dupe', label: 'Duplikat' },
    { token: 'is:new', label: 'Neu' },
    { token: 'is:noted', label: 'Notiz' },
    { token: 'is:nochamp', label: 'Ohne Champion' },
    { token: 'is:locked', label: 'Markiert' },
    { token: 'is:masterworked', label: 'Meisterwerk' },
    { token: 'is:armor3.0', label: 'Armor 3.0' },
    { token: 'is:set', label: 'Set-Teil' },
    { token: 'is:tunable', label: 'Tuning' },
    { token: 'is:exotic', label: 'Exotisch' },
    { token: '-is:exotic', label: 'Kein Exot' }
  ];
  let filterMenu = null;

  function appendSearchToken(token) {
    const clean = String(token || '').trim();
    if (!clean || !searchInput) return;
    const current = String(searchInput.value || '').trim();
    const parts = current ? current.split(/\s+/) : [];
    if (!parts.includes(clean)) parts.push(clean);
    searchInput.value = parts.join(' ');
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.focus();
    hideFilterMenu();
  }

  function hideFilterMenu() {
    if (filterMenu) filterMenu.classList.add('hidden');
  }

  function renderFilterMenu() {
    if (!filterMenu) return;
    const history = kbSearchHistory().slice(0, 6);
    const saved = savedSearches();
    const chip = (token, label) => '<button type="button" class="inv-filter-chip" data-filter-apply="' + escapeHtml(token) + '">' + escapeHtml(label) + '</button>';
    const savedRow = (entry) => '<span class="inv-filter-saved"><button type="button" class="inv-filter-chip" data-filter-apply="' + escapeHtml(entry) + '">' + escapeHtml(entry) + '</button>' +
      '<button type="button" class="inv-filter-x" data-filter-rename="' + escapeHtml(entry) + '" title="Umbenennen" aria-label="Umbenennen">✎</button>' +
      '<button type="button" class="inv-filter-x" data-filter-forget="' + escapeHtml(entry) + '" title="Entfernen" aria-label="Entfernen">×</button></span>';
    filterMenu.innerHTML =
      '<div class="inv-filter-head"><strong>Filter</strong><button type="button" class="icon-btn" data-filter-close aria-label="Schließen">✕</button></div>' +
      (history.length ? '<div class="inv-filter-section"><span class="inv-filter-title">Zuletzt</span><div class="inv-filter-chips">' + history.map((entry) => chip(entry, entry)).join('') + '</div></div>' : '') +
      (saved.length ? '<div class="inv-filter-section"><span class="inv-filter-title">Gespeichert <button type="button" class="inv-filter-x" data-filter-clear-saved title="Alle gespeicherten Suchen löschen" aria-label="Alle gespeicherten Suchen löschen">Alle löschen</button></span><div class="inv-filter-chips">' + saved.map(savedRow).join('') + '</div></div>' : '') +
      '<div class="inv-filter-section"><span class="inv-filter-title">Schnellfilter</span><div class="inv-filter-chips">' + FILTER_PRESETS.map((preset) => chip(preset.token, preset.label)).join('') + '</div></div>' +
      '<div class="inv-filter-section"><span class="inv-filter-title">Perk</span><div class="inv-filter-add">' +
        '<input type="text" data-filter-perk-input maxlength="60" placeholder="z. B. Vorpal Weapon" aria-label="Perk-Name">' +
        '<button type="button" class="btn ghost small" data-filter-perk>Einfügen</button></div></div>' +
      '<div class="inv-filter-section"><span class="inv-filter-title">Stat</span><div class="inv-filter-add">' +
        '<input type="text" data-filter-stat-input maxlength="40" placeholder="z. B. gesundheit:>=20" aria-label="Stat und Vergleich">' +
        '<button type="button" class="btn ghost small" data-filter-stat>Einfügen</button></div></div>' +
      '<details class="inv-filter-help"><summary>Operatoren &amp; Beispiele</summary>' +
        '<div class="inv-filter-help-grid">' +
          '<code>is:godroll</code><span>nur Godrolls</span>' +
          '<code>is:nochamp</code><span>Waffen ohne Champion-Brecher</span>' +
          '<code>-is:exotic</code><span>Exoten ausschließen</span>' +
          '<code>perk:"Vorpal Weapon"</code><span>Perk-Name (Anführungszeichen bei Leerzeichen)</span>' +
          '<code>stat:gesundheit&gt;=20</code><span>Stat-Vergleich</span>' +
          '<code>slot:kinetic</code><span>Waffen-Slot</span>' +
          '<code>class:warlock</code><span>Klasse</span>' +
          '<code>dupe:stats</code><span>gleiche Rüstungs-Stats</span>' +
          '<code>note:raid</code><span>eigene Notiz</span>' +
        '</div>' +
      '</details>' +
      '<div class="inv-filter-foot"><button type="button" class="btn ghost small" data-filter-clear>Suche leeren</button>' +
      '<span class="inv-filter-hint">Mehrere Filter werden kombiniert.</span></div>';
  }

  function showFilterMenu(button) {
    if (!filterMenu) {
      filterMenu = document.createElement('div');
      filterMenu.className = 'inv-filter-menu hidden';
      filterMenu.setAttribute('role', 'dialog');
      filterMenu.setAttribute('aria-label', 'Suchfilter');
      document.body.appendChild(filterMenu);
      filterMenu.addEventListener('click', (event) => {
        if (event.target === filterMenu || event.target.closest('[data-filter-close]')) { hideFilterMenu(); return; }
        const apply = event.target.closest('[data-filter-apply]');
        if (apply) { appendSearchToken(apply.dataset.filterApply); return; }
        const forget = event.target.closest('[data-filter-forget]');
        if (forget) {
          setSavedSearches(savedSearches().filter((entry) => entry !== forget.dataset.filterForget));
          renderFilterMenu();
          return;
        }
        const rename = event.target.closest('[data-filter-rename]');
        if (rename) {
          const previous = String(rename.dataset.filterRename || '');
          const next = String(window.prompt('Suche umbenennen:', previous) || '').trim().slice(0, 120);
          if (next && next !== previous) {
            setSavedSearches(savedSearches().map((entry) => (entry === previous ? next : entry)));
            renderFilterMenu();
          }
          return;
        }
        if (event.target.closest('[data-filter-clear-saved]')) {
          if (!savedSearches().length || window.confirm('Alle gespeicherten Suchen löschen?')) {
            setSavedSearches([]);
            renderFilterMenu();
          }
          return;
        }
        if (event.target.closest('[data-filter-perk]')) {
          const input = filterMenu.querySelector('[data-filter-perk-input]');
          const value = String((input && input.value) || '').trim().replace(/"/g, '');
          if (value) appendSearchToken('perk:"' + value + '"');
          return;
        }
        if (event.target.closest('[data-filter-stat]')) {
          const input = filterMenu.querySelector('[data-filter-stat-input]');
          const value = String((input && input.value) || '').trim().replace(/\s+/g, '');
          if (value) appendSearchToken('stat:' + value);
          return;
        }
        if (event.target.closest('[data-filter-clear]')) {
          if (searchInput) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.focus();
          }
          hideFilterMenu();
        }
      });
    }
    renderFilterMenu();
    filterMenu.classList.remove('hidden');
    const rect = (button || searchInput).getBoundingClientRect();
    const width = 320;
    const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left));
    filterMenu.style.width = width + 'px';
    filterMenu.style.left = Math.round(left) + 'px';
    filterMenu.style.top = Math.round(rect.bottom + 6) + 'px';
  }

  if (searchOnlyBtn) {
    searchOnlyBtn.addEventListener('click', () => {
      searchOnly = !searchOnly;
      try { window.localStorage.setItem('d2inv.searchOnly', searchOnly ? '1' : '0'); } catch (error) { /* egal */ }
      render();
    });
  }

  const filterBtn = qs('#inventoryFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (filterMenu && !filterMenu.classList.contains('hidden')) hideFilterMenu();
      else showFilterMenu(filterBtn);
    });
    document.addEventListener('click', (event) => {
      if (!filterMenu || filterMenu.classList.contains('hidden')) return;
      if (filterMenu.contains(event.target) || event.target === filterBtn) return;
      hideFilterMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && filterMenu && !filterMenu.classList.contains('hidden')) hideFilterMenu();
    });
  }

  // Kleine Editierdistanz für Tippfehler-Toleranz im Suchfeld.
  function editDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      }
      previous = current;
    }
    return previous[right.length];
  }

  // Erlaubt „Vorpal Weapen" statt „Vorpal Weapon": erst exakter
  // Teilstring, sonst ein Wort mit kleiner Tippfehler-Distanz.
  function fuzzyWordMatch(haystack, needle) {
    const query = String(needle || '').trim();
    if (query.length < 4) return false;
    const words = String(haystack || '').split(/[^a-z0-9äöüß]+/).filter((word) => word.length > 2);
    const limit = query.length <= 6 ? 1 : 2;
    return words.some((word) => Math.abs(word.length - query.length) <= limit && editDistance(word, query) <= limit);
  }

  function renderPadKeyboardSuggestions() {
    if (!padKeyboard || !searchInput) return;
    const box = padKeyboard.querySelector('.inv-pad-kb-suggestions');
    if (!box) return;
    const query = String(searchInput.value || '').trim().toLowerCase();
    const scores = new Map();
    const add = (value, score) => {
      const text = String(value || '').trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (!scores.has(key) || scores.get(key).score < score) scores.set(key, { text, score });
    };
    const history = kbSearchHistory();
    if (!query) {
      for (const recent of history) add(recent, 500);
    } else {
      for (const recent of history) {
        const score = fuzzyScore(recent, query);
        if (score > 0) add(recent, score + 150);
      }
    }
    for (const saved of ((getCfg().bungie && getCfg().bungie.savedSearches) || [])) {
      const score = query ? fuzzyScore(saved, query) : 400;
      if (score > 0) add(saved, score + 60);
    }
    for (const fixed of ['is:godroll', 'is:neargodroll', 'is:dupe', 'is:locked', 'is:masterworked']) {
      const score = query ? fuzzyScore(fixed, query) : 300;
      if (score > 0) add(fixed, score + 40);
    }
    if (data && query.length >= 2) {
      const pools = [data.vault || [], ...Object.values(data.backpack || {}), ...Object.values(data.equipped || {}), ...Object.values(data.postmaster || {})];
      for (const pool of pools) {
        for (const item of (pool || [])) {
          const name = String((item && item.name) || '');
          if (!name) continue;
          const score = fuzzyScore(name, query);
          if (score > 0) add(name, score);
        }
      }
    }
    const visible = [...scores.values()]
      .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'de'))
      .slice(0, 10);
    // Feste Filter immer anbieten, auch wenn die Eingabe (noch) nicht
    // darauf passt – so bleiben sie mit dem Controller erreichbar.
    for (const fixed of ['is:godroll', 'is:neargodroll', 'is:dupe', 'is:locked', 'is:masterworked']) {
      if (!visible.some((entry) => entry.text.toLowerCase() === fixed)) {
        visible.push({ text: fixed, score: 0 });
      }
    }
    box.innerHTML = visible.map((entry) => {
      const recent = history.some((value) => value.toLowerCase() === entry.text.toLowerCase());
      return `<button type="button" class="inv-pad-kb-suggest" data-kb-suggest="${esc(entry.text)}"${recent ? ' title="Zuletzt gesucht"' : ''}>${esc(entry.text)}</button>`;
    }).join('');
    box.classList.toggle('hidden', !visible.length);
  }
  function ensurePadKeyboard() {
    if (padKeyboard) return padKeyboard;
    padKeyboard = document.createElement('div');
    padKeyboard.className = 'inv-pad-kb';
    const keyRow = (chars) => `<div class="inv-pad-kb-row">` + [...chars]
      .map((char) => `<button type="button" class="inv-pad-kb-key" data-kb-key="${esc(char)}">${esc(char)}</button>`)
      .join('') + `</div>`;
    padKeyboard.innerHTML =
      `<div class="inv-pad-kb-head"><strong>Suche eingeben</strong><span class="inv-pad-kb-value"></span></div>` +
      `<div class="inv-pad-kb-suggestions hidden"></div>` +
      keyRow('1234567890') +
      keyRow('qwertzuiop') +
      keyRow('asdfghjkläöü') +
      keyRow('yxcvbnmß:><"=-') +
      `<div class="inv-pad-kb-row">` +
        `<button type="button" class="inv-pad-kb-key wide space" data-kb-action="space">Leertaste</button>` +
        `<button type="button" class="inv-pad-kb-key wide" data-kb-action="backspace">⌫ Löschen</button>` +
        `<button type="button" class="inv-pad-kb-key wide" data-kb-action="clear">Leeren</button>` +
        `<button type="button" class="inv-pad-kb-key wide primary" data-kb-action="done">Fertig</button>` +
      `</div>`;
    padKeyboard.addEventListener('click', (event) => {
      const suggestion = event.target.closest('[data-kb-suggest]');
      if (suggestion && searchInput) {
        searchInput.value = suggestion.dataset.kbSuggest || '';
        addKbSearchHistory(searchInput.value);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        syncPadKeyboardValue();
        renderPadKeyboardSuggestions();
        return;
      }
      const key = event.target.closest('[data-kb-key]');
      const action = event.target.closest('[data-kb-action]');
      if ((!key && !action) || !searchInput) return;
      if (key) {
        searchInput.value += key.dataset.kbKey || '';
      } else {
        const name = action.dataset.kbAction;
        if (name === 'space') searchInput.value += ' ';
        else if (name === 'backspace') searchInput.value = searchInput.value.slice(0, -1);
        else if (name === 'clear') searchInput.value = '';
        else if (name === 'done') { addKbSearchHistory(searchInput.value); closePadKeyboard(true); return; }
      }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      syncPadKeyboardValue();
      renderPadKeyboardSuggestions();
    });
    view.appendChild(padKeyboard);
    return padKeyboard;
  }
  function openPadKeyboard() {
    const keyboard = ensurePadKeyboard();
    keyboard.classList.add('open');
    syncPadKeyboardValue();
    renderPadKeyboardSuggestions();
    hideTooltip();
    const first = keyboard.querySelector('[data-kb-key]');
    if (first) {
      try { first.focus({ preventScroll: true }); } catch (error) { /* egal */ }
    }
  }
  function closePadKeyboard(focusFirst) {
    if (!padKeyboard) return;
    padKeyboard.classList.remove('open');
    if (focusFirst) {
      setTimeout(focusFirstSearchHit, 80);
      return;
    }
    if (searchInput) {
      try { searchInput.focus({ preventScroll: true }); } catch (error) { /* egal */ }
    }
  }

  // ---------- Controller-Schnellmenü (R3, radial angeordnet) ----------
  let quickMenu = null;
  function ensureQuickMenu() {
    if (quickMenu) return quickMenu;
    quickMenu = document.createElement('div');
    quickMenu.className = 'inv-quickmenu';
    quickMenu.innerHTML =
      `<div class="inv-quickmenu-card">` +
      `<strong>Schnellmenü</strong>` +
      `<div class="inv-quickmenu-grid"></div>` +
      `<span class="inv-quickmenu-hint">D-Pad: Auswahl · A: Bestätigen · B: Schließen</span>` +
      `</div>`;
    quickMenu.addEventListener('click', (event) => {
      if (event.target === quickMenu) { closeQuickMenu(); return; }
      const button = event.target.closest('[data-quick]');
      if (!button) return;
      const action = String(button.dataset.quick || '');
      closeQuickMenu();
      if (action === 'close') return;
      if (action === 'loadout') {
        closePopup();
        showTab('loadouts');
        return;
      }
      if (action === 'inventory') {
        closePopup();
        showTab('inventory');
        return;
      }
      if (action === 'keyboard') {
        openPadKeyboard();
        return;
      }
      if (action === 'refresh') {
        const refreshButton = qs('#inventoryRefresh');
        if (refreshButton) refreshButton.click();
        return;
      }
      window.dispatchEvent(new CustomEvent('d2-inventory-quick', { detail: { action } }));
    });
    view.appendChild(quickMenu);
    return quickMenu;
  }
  function openQuickMenu() {
    const menu = ensureQuickMenu();
    const popup = view.querySelector('.inv-popup-backdrop.open');
    const qm = (getCfg().gamepad && getCfg().gamepad.quickMenu) || {};
    const defaultMap = popup
      ? { top: 'to-vault', right: 'to-char', bottom: 'equip', left: 'favorite' }
      : { top: 'loadout', right: 'keyboard', bottom: 'refresh', left: 'inventory' };
    const mapping = { ...defaultMap, ...((popup ? qm.popup : qm.inventory) || {}) };
    const catalog = {
      'to-vault': { label: 'Tresor', icon: '🗄' },
      'to-char': { label: 'Lagern', icon: '📦' },
      favorite: { label: 'Favorit', icon: '★' },
      equip: { label: 'Anlegen', icon: '✦' },
      loadout: { label: 'Loadouts', icon: '🧰' },
      keyboard: { label: 'Tastatur', icon: '⌨' },
      refresh: { label: 'Aktualisieren', icon: '⟳' },
      inventory: { label: 'Inventar', icon: '🎒' },
      close: { label: 'Schließen', icon: '✕' }
    };
    const actions = ['top', 'right', 'bottom', 'left'].map((pos) => {
      const key = mapping[pos];
      const meta = catalog[key];
      return meta ? { key, pos, ...meta } : null;
    }).filter(Boolean);
    actions.push({ key: 'close', pos: 'center', ...catalog.close });
    menu.querySelector('.inv-quickmenu-grid').innerHTML = actions.map((action) =>
      `<button type="button" class="inv-quickmenu-btn pos-${action.pos}" data-quick="${action.key}">` +
        `<span class="qi">${action.icon}</span><span>${action.label}</span>` +
      `</button>`
    ).join('');
    menu.classList.add('open');
    hideTooltip();
    const first = menu.querySelector('[data-quick]');
    if (first) {
      try { first.focus({ preventScroll: true }); } catch (error) { /* egal */ }
    }
  }
  function closeQuickMenu() {
    if (quickMenu) quickMenu.classList.remove('open');
  }

  // ---------- DIM-Item-Popup (Modal-Overlay nach ItemPopup.tsx) ----------
  function ensurePopup() {
    let backdrop = view.querySelector('.inv-popup-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'inv-popup-backdrop';
      view.appendChild(backdrop);
      backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closePopup(); });
      // Perk-/Mod-Erklärung: Hover auf eine Perk-Option oder einen
      // Mod-Socket zeigt Name, Beschreibung und Status (DIM-Stil).
      backdrop.addEventListener('mouseover', (event) => {
        const cell = event.target.closest('[data-inv-perk-opt]');
        if (!cell || !backdrop.contains(cell)) return;
        showPerkTip(cell, {
          n: cell.dataset.perkName || '',
          d: cell.dataset.perkDesc || '',
          enh: cell.dataset.perkEnh === '1',
          selected: cell.dataset.perkSel === '1',
          god: cell.dataset.perkGod === '1'
        });
      });
      backdrop.addEventListener('mouseout', (event) => {
        const cell = event.target.closest('[data-inv-perk-opt]');
        if (!cell) return;
        const related = event.relatedTarget;
        if (related && cell.contains(related)) return;
        hidePlugTip();
      });
      backdrop.addEventListener('scroll', () => hidePlugTip(), true);
    }
    return backdrop;
  }

  function closePopup() {
    const backdrop = view && view.querySelector('.inv-popup-backdrop');
    if (backdrop) backdrop.classList.remove('open');
    hidePlugTip();
  }

  function openPopup() {
    if (!view || !selectedItem) return;
    const backdrop = ensurePopup();
    const item = selectedItem.item;
    const kind = selectedItem.kind;
    const owner = selectedItem.owner;
    const r = Number(item.rarity) || 0;
    const rn = DIM.RARITY_NAME[r] || '';
    const godPerks = item.godPerks || [];
    const isGod = (perk) => godPerks.includes(Number(perk.hash) || 0);
    const nearPerks = item.nearPerks || [];
    const isNear = (perk) => !isGod(perk) && nearPerks.includes(Number(perk.hash) || 0);
    const locked = (Number(item.state) || 0) & 1;
    const chars = (data && data.characters) || [];
    const membershipType = data ? data.membershipType : 0;

    // ---- Aktionen links (DIM: vertikale Icon-Liste) ----
    const actions = [];
    if (kind === 'backpack') {
      actions.push(`<button class="inv-popup-action equip" data-inv-act="equip" data-inv-target="${esc(owner)}"><span class="ai">✦</span>Anlegen</button>`);
      for (const c of chars) {
        if (c.id === owner) continue;
        actions.push(`<button class="inv-popup-action vault" data-inv-act="to-char" data-inv-target="${esc(c.id)}"><span class="ai">📦</span>Lagern auf ${esc(DIM.CLASS_NAMES[c.classType] || 'Hüter')}</button>`);
      }
      actions.push(`<button class="inv-popup-action vault" data-inv-act="to-vault"><span class="ai">🗄</span>Tresor</button>`);
    } else if (kind === 'vault') {
      for (const c of chars) {
        actions.push(`<button class="inv-popup-action vault" data-inv-act="to-char" data-inv-target="${esc(c.id)}"><span class="ai">📦</span>Lagern auf ${esc(DIM.CLASS_NAMES[c.classType] || 'Hüter')}</button>`);
        if (item.equippable !== false) actions.push(`<button class="inv-popup-action equip" data-inv-act="equip-from-vault" data-inv-target="${esc(c.id)}"><span class="ai">✦</span>Anlegen auf ${esc(DIM.CLASS_NAMES[c.classType] || 'Hüter')}</button>`);
      }
    } else if (kind === 'postmaster') {
      actions.push(`<span class="inv-popup-owned">Poststelle — im Spiel aufheben.</span>`);
    } else if (kind === 'equipped') {
      actions.push(`<span class="inv-popup-owned">✓ angelegt</span>`);
      actions.push(`<span class="inv-popup-owned">Im Spiel ablegen, um es zu verschieben.</span>`);
    }
    // Markieren (SetItemLockState) — nur für instanziierte Items.
    if (item.instanceId && kind !== 'postmaster') {
      actions.push(`<button class="inv-popup-action lock ${locked ? 'on' : ''}" data-inv-act="lock"><span class="ai">${locked ? '🔒' : '🔓'}</span>${locked ? 'Entmarkieren' : 'Markieren'}</button>`);
    }
    // Vergleichen (DIM Compare) — Waffen in die Vergleichsansicht legen.
    if (item.perks && item.perks.length) {
      actions.push(`<button class="inv-popup-action" data-inv-act="compare"><span class="ai">⇄</span>Vergleichen</button>`);
    }
    // Favorit (DIM-Tag) — config-basiert, Stern am Tile.
    if (item.instanceId || item.hash) {
      const favOn = isFav(item);
      actions.push(`<button class="inv-popup-action fav ${favOn ? 'on' : ''}" data-inv-act="fav"><span class="ai">${favOn ? '★' : '☆'}</span>${favOn ? 'Favorit entfernen' : 'Favorit'}</button>`);
    }
    actions.push(`<button class="inv-popup-action" data-inv-act="fullscreen"><span class="ai">⛶</span>Vollbild</button>`);
    actions.push(`<button class="inv-popup-action" data-inv-act="close"><span class="ai">✕</span>Schließen</button>`);

    // ---- Perk-Spalten (DIM): je Socket eine Spalte mit ALLEN Optionen.
    // Der gesteckte Perk ist hell hervorgehoben und wird benannt,
    // Alternativen sind gedimmt, Godroll-Treffer grün mit Haken.
    const socketColumns = Array.isArray(item.socketColumns) ? item.socketColumns : [];
    let perkGrid = '';
    if (socketColumns.length) {
      // Datenattribute für das Perk-Detail-Overlay (Name/Beschreibung/
      // verstärkt/ausgewählt/Godroll) — Hover öffnet die Erklärung.
      const perkData = (plug, flags) => {
        const extra = flags || {};
        return `data-inv-perk-opt="${Number(plug.hash) || 0}" data-perk-name="${esc(plug.n || '')}" data-perk-desc="${esc(plug.d || '')}"` +
          ` data-perk-enh="${plug.enh ? '1' : ''}" data-perk-sel="${extra.selected ? '1' : ''}" data-perk-god="${extra.god ? '1' : ''}"`;
      };
      perkGrid = socketColumns.map((column, columnIndex) => {
        const options = (column && column.options) || [];
        if (!options.length) return '';
        const selected = options.find((option) => option.selected) || null;
        const cells = options.map((option) => {
          const classes = ['inv-perk-cell'];
          if (option.selected) classes.push('selected');
          if (option.god) classes.push('god');
          else if (option.near) classes.push('near');
          if (option.canInsert === false) classes.push('locked');
          const title = `${option.n || 'Perk'}${option.selected ? ' · ausgewählt' : ''}${option.god ? ' · Godroll' : option.near ? ' · Fast-Godroll' : ''}`;
          return `<span class="${classes.join(' ')}" tabindex="0" aria-label="${esc(title)}" ${perkData(option, option)}>` +
            (option.i ? `<img src="https://www.bungie.net${esc(option.i)}" alt="" loading="lazy">` : '') +
            (option.god ? '<span class="pcheck">✓</span>' : option.near ? '<span class="pcheck near">✓</span>' : '') +
            `</span>`;
        }).join('');
        return `<div class="inv-perk-column" data-socket="${columnIndex}"${column.cat ? ` data-cat="${esc(column.cat)}"` : ''}>` +
          `<span class="inv-perk-stack">${cells}</span>` +
          (selected ? `<span class="inv-perk-name">${esc(selected.n || '')}</span>` : '') +
          `</div>`;
      }).join('');
    } else if (item.perks && item.perks.length) {
      // Fallback (alte Daten ohne socketColumns): nur gesteckte Perks.
      const perkData = (plug, flags) => {
        const extra = flags || {};
        return `data-inv-perk-opt="${Number(plug.hash) || 0}" data-perk-name="${esc(plug.n || '')}" data-perk-desc="${esc(plug.d || '')}"` +
          ` data-perk-enh="${plug.enh ? '1' : ''}" data-perk-sel="${extra.selected ? '1' : ''}" data-perk-god="${extra.god ? '1' : ''}"`;
      };
      perkGrid = item.perks.map((perk) => {
        const god = isGod(perk);
        const near = !god && isNear(perk);
        return `<div class="inv-perk-column"><span class="inv-perk-stack"><span class="inv-perk-cell selected${god ? ' god' : near ? ' near' : ''}" tabindex="0" aria-label="${esc(perk.n)}" ${perkData(perk, { selected: true, god })}>${perk.i ? `<img src="https://www.bungie.net${esc(perk.i)}" alt="">` : ''}${god ? '<span class="pcheck">✓</span>' : near ? '<span class="pcheck near">✓</span>' : ''}</span></span><span class="inv-perk-name">${highlightSearchText(perk.n || '')}</span></div>`;
      }).join('');
    }
    // ---- Mod-/Kosmetik-Sockets (DIM: eigene Reihe, nur gesteckter Plug) ----
    const modSockets = Array.isArray(item.modSockets) ? item.modSockets : [];
    const modRow = modSockets.length
      ? `<p class="inv-popup-section">Mods &amp; Kosmetik</p><div class="inv-mod-row">` +
        modSockets.map((plug) => `<span class="inv-mod-socket" tabindex="0" aria-label="${esc(plug.n || 'Mod')}" data-inv-perk-opt="${Number(plug.hash) || 0}" data-perk-name="${esc(plug.n || '')}" data-perk-desc="${esc(plug.d || '')}" data-perk-enh="${plug.enh ? '1' : ''}" data-perk-sel="" data-perk-god="">` +
          (plug.i ? `<img src="https://www.bungie.net${esc(plug.i)}" alt="" loading="lazy">` : '') +
          `</span>`).join('') +
        `</div>`
      : '';

    // ---- Stat-Balken (DIM: Balken + Wert rechts) ----
    // DIM zeigt im Item-Popup den Wert des Rüstungsteils (0–45) und
    // skaliert den Balken auf scaledStats.maximumValue. Der Charakter-
    // Gesamtwert (0–200) steht zusätzlich im Tooltip.
    const armorItem = DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket));
    const ownerChar = armorItem
      ? chars.find((char) => char.id === owner) ||
        chars.find((char) => Number(char.classType) === Number(item.classType)) ||
        chars[0] ||
        null
      : null;
    const ownerStats = (ownerChar && ownerChar.stats) || {};
    const hasOwnerStats = DIM.CHAR_STAT_HASHES.some((hash) => ownerStats[hash] != null);
    const refName = ownerChar ? (DIM.CLASS_NAMES[ownerChar.classType] || 'Charakter') : '';
    const statRows = (item.stats || []).map((stat) => {
      const raw = Number(stat.value) || 0;
      const baseValue = Math.max(0, Number(stat.base != null ? stat.base : raw) || 0);
      const modValue = Number(stat.mod) || 0;
      const masterworkValue = Math.max(0, Number(stat.mw) || 0);
      const total = armorItem && ownerStats[Number(stat.hash)] != null ? Number(ownerStats[Number(stat.hash)]) || 0 : 0;
      const maxScale = Number(stat.max) || (armorItem ? 45 : 100);
      const totalPct = Math.max(0, Math.min(100, (raw / maxScale) * 100));
      const basePct = Math.min(totalPct, Math.max(0, (Math.min(raw, baseValue) / maxScale) * 100));
      const positiveMod = Math.max(0, modValue);
      const negativeMod = Math.max(0, -modValue);
      const modPct = Math.min(Math.max(0, totalPct - basePct), Math.max(0, (positiveMod / maxScale) * 100));
      const masterworkPct = Math.min(Math.max(0, totalPct - basePct - modPct), Math.max(0, (masterworkValue / maxScale) * 100));
      const negativePct = Math.min(Math.max(0, 100 - totalPct), Math.max(0, (negativeMod / maxScale) * 100));
      const high = totalPct >= 60 ? ' high' : '';
      const modText = modValue ? ` · Mods ${modValue > 0 ? '+' : ''}${modValue}` : '';
      const detail = armorItem
        ? `Basis ${baseValue}${modText}${masterworkValue ? ` · Masterwork +${masterworkValue}` : ''} · Teil ${raw}/${maxScale}${hasOwnerStats ? ` · Gesamt ${total}/200 (${refName})` : ' · keine Charakterdaten'}`
        : `Basis ${baseValue}${modText} · ${raw}/${maxScale}`;
      const segments = `<span class="seg-base${high}" style="width:${basePct}%"></span>` +
        (modPct > 0 ? `<span class="seg-mod" style="width:${modPct}%"></span>` : '') +
        (masterworkPct > 0 ? `<span class="seg-mw" style="width:${masterworkPct}%"></span>` : '') +
        (negativePct > 0 ? `<span class="seg-neg" style="width:${negativePct}%"></span>` : '');
      return `<div class="inv-stat-row" data-stat-hash="${Number(stat.hash) || 0}" title="${esc(stat.label)}: ${detail}"><span class="inv-stat-label" title="${esc(stat.label)}">${esc(stat.label)}</span><span class="inv-stat-bars"><span class="inv-stat-bar">${segments}</span></span><span class="inv-stat-value">${raw}</span></div>`;
    }).join('');
    const modTotalValue = (item.stats || []).reduce((sum, stat) => sum + (Number(stat.mod) || 0), 0);
    const masterworkTotalValue = (item.stats || []).reduce((sum, stat) => sum + Math.max(0, Number(stat.mw) || 0), 0);
    const statLegend = armorItem && (item.stats || []).length
      ? `<div class="inv-stat-legend">Balken = Basis + Mods + Masterwork (0–45)${hasOwnerStats ? ` · Gesamt = Charakterwert (${esc(refName)}, 0–200)` : ''}</div>`
      : '';
    const armorStats = armorItem && item.stats && item.stats.length;
    const statTotal = armorStats ? item.stats.reduce((sum, stat) => sum + (Number(stat.value) || 0), 0) : 0;
    const baseStatTotal = Number(item.baseStatTotal) || 0;
    const baseShown = item.baseStatTotal != null ? baseStatTotal : Math.max(0, statTotal - modTotalValue - masterworkTotalValue);
    const statTotalHtml = armorStats
      ? `<div class="inv-stat-total">Stats ${statTotal} · Basis ${baseShown}${modTotalValue ? ` · Mods ${modTotalValue > 0 ? '+' : ''}${modTotalValue}` : ''}${masterworkTotalValue ? ` · Masterwork +${masterworkTotalValue}` : ''}</div>`
      : '';
    // Armor-3.0-Metadaten: Tier, Archetyp, Tertiär, Tuning, Set.
    const armorMetaChips = [];
    if (armorStats && item.gearTier) {
      armorMetaChips.push(`<span class="inv-armor-chip tier">T${esc(String(item.gearTier))}</span>`);
    }
    if (armorStats && item.archetype) {
      const primary = item.archetype.primaryLabel || '—';
      const secondary = item.archetype.secondaryLabel || '—';
      armorMetaChips.push(`<span class="inv-armor-chip" title="Primär: ${esc(primary)} · Sekundär: ${esc(secondary)}">${esc(item.archetype.name || 'Archetyp')}: ${esc(primary)} / ${esc(secondary)}</span>`);
    }
    if (armorStats && item.tertiaryStat) {
      armorMetaChips.push(`<span class="inv-armor-chip">Tertiär: ${esc(item.tertiaryStat.label || '')} ${Number(item.tertiaryStat.value) || 0}</span>`);
    }
    if (armorStats && item.tunedStat) {
      armorMetaChips.push(`<span class="inv-armor-chip">Tuning: ${esc(item.tunedStat.label || '')}</span>`);
    }
    if (armorStats && item.setInfo) {
      let setCount = 0;
      if (ownerChar) {
        for (const equippedItem of ((data.equipped && data.equipped[ownerChar.id]) || [])) {
          if (equippedItem.setInfo && equippedItem.setInfo.hash === item.setInfo.hash) setCount += 1;
        }
      }
      const setState = setCount >= 4 ? ' · 4er aktiv' : setCount >= 2 ? ' · 2er aktiv' : '';
      armorMetaChips.push(`<span class="inv-armor-chip set" title="Im Loadout: ${setCount} Teile">${esc(item.setInfo.name || 'Set')} ${setCount}/5${setState}</span>`);
    }
    const armorMetaHtml = armorMetaChips.length
      ? `<div class="inv-armor-meta">${armorMetaChips.join('')}</div>`
      : '';
    const setBonusHtml = armorStats && item.setInfo && (item.setInfo.perks || []).length
      ? `<div class="inv-set-bonus">` + item.setInfo.perks.map((perk) => {
          let active = false;
          if (ownerChar) {
            let count = 0;
            for (const equippedItem of ((data.equipped && data.equipped[ownerChar.id]) || [])) {
              if (equippedItem.setInfo && equippedItem.setInfo.hash === item.setInfo.hash) count += 1;
            }
            active = count >= perk.count;
          }
          return `<div class="inv-set-perk${active ? ' on' : ''}"><b>${perk.count}er</b><span>${esc(perk.name || 'Set-Bonus')}${perk.description ? ` — ${esc(perk.description.slice(0, 160))}` : ''}</span></div>`;
        }).join('') + `</div>`
      : '';
    const itemNoteText = String((((getCfg().bungie && getCfg().bungie.itemNotes) || {})[String(item.instanceId || item.hash || '')]) || '');
    const noteHtml = item.instanceId
      ? `<p class="inv-popup-section">Notiz</p><div class="inv-item-note"><textarea data-inv-note maxlength="300" placeholder="Eigene Notiz zu diesem Item …">${esc(itemNoteText)}</textarea><button type="button" class="btn ghost small" data-inv-act="save-note">Speichern</button></div>`
      : '';

    const flavor = item.flavor ? `<p class="inv-popup-flavor">${esc(item.flavor)}</p>` : '';
    const godTags = (item.godTags || []).join(' / ');
    const sourceLabel = (url) => {
      const text = String(url || '');
      if (!text) return '';
      const parts = text.split('/').filter(Boolean);
      return parts[parts.length - 1] || text;
    };
    const godMatches = (item.godOptions || []).length
      ? `<span class="inv-popup-godperks">Treffer: ${item.godOptions.map((name) => esc(name)).join(' · ')}</span>`
      : '';
    const kindLabel = item.godRollKind === 'traits'
      ? ' · Traits'
      : item.godRollKind === 'near'
        ? ' · Fast-Godroll akzeptiert'
        : '';
    const godSource = item.godSource ? ` · Quelle: ${esc(sourceLabel(item.godSource))}` : '';
    const notes = item.godRoll
      ? `<span class="inv-popup-notes">✓ Godroll${kindLabel}${godTags ? ` · ${esc(godTags)}` : ''}${godSource}${item.godNotes ? ` — ${esc(item.godNotes)}` : ''}</span>${godMatches}`
      : '';
    const nearNotes = !item.godRoll && item.nearGodRoll
      ? `<span class="inv-popup-near">≈ Fast-Godroll — ${item.nearGodRoll.matched}/${item.nearGodRoll.total} Perks passen. Fehlt: ${esc((item.nearGodRoll.missing || []).join(', '))}${(item.nearGodRoll.matchedNames || []).length ? ` · Passend: ${esc(item.nearGodRoll.matchedNames.join(', '))}` : ''}${item.nearGodRoll.source ? ` · Quelle: ${esc(sourceLabel(item.nearGodRoll.source))}` : ''}${item.nearGodRoll.notes ? ` — ${esc(item.nearGodRoll.notes)}` : ''}</span>`
      : '';
    const diagnoseList = Array.isArray(item.nearMatches) ? item.nearMatches : [];
    const nearDiagnose = !item.godRoll && diagnoseList.length
      ? `<details class="inv-near-diagnose"><summary>Warum kein Godroll? ${diagnoseList.length} ähnliche Wishlist-Zeile${diagnoseList.length === 1 ? '' : 'n'}</summary>` +
        diagnoseList.map((candidate, index) => {
          const missing = (candidate.missing || []).join(', ');
          return `<div class="inv-near-row"><strong>${candidate.matched}/${candidate.total}</strong> passen` +
            `${missing ? ` · Fehlt: ${esc(missing)}` : ''}` +
            `${candidate.source ? ` · ${esc(sourceLabel(candidate.source))}` : ''}` +
            `${candidate.notes ? `<small>${esc(String(candidate.notes).slice(0, 180))}</small>` : ''}` +
            `${index === 0 && item.nearGodRoll && (candidate.missing || []).length === 1 ? ' <button type="button" class="btn ghost small inv-popup-action" data-inv-act="accept-near">Als Fast-Godroll akzeptieren</button>' : ''}` +
            `</div>`;
        }).join('') +
        `</details>`
      : '';
    const highestWarning = isHighestInBucket(item) && item.power
      ? `<span class="inv-popup-highest" title="Höchste Power in diesem Slot">▲ Höchstes Item in diesem Slot – nicht zerlegen.</span>`
      : '';
    const elemLabel = elementName(item);
    const champLabels = championTypes(item).map((type) => CHAMPION_NAMES[type]);
    const champSourceLabel = { manuell: 'manuell', daten: 'Item-Daten', rahmen: 'Rahmen', keine: 'keine' }[championSource(item)] || 'keine';
    const isWeaponItem = DIM.WEAPON_SLOTS.some((slot) => slot.key === Number(item.bucket))
      || /gewehr|handfeuerwaffe|pulvergewehr|kampfgewehr|sniper|schrotflinte|rakete|schwert|bogen|fusionsgewehr|maschinengewehr|pistole|revolver|glaive|fackel/i.test(String(item.typeName || ''));
    const elementChampHtml = (elemLabel || isWeaponItem)
      ? `<span class="inv-tip-tags"><span class="inv-tag-elem">Element: ${esc(elemLabel || 'unbekannt')}</span><span class="inv-tag-champ">Champion (${esc(champSourceLabel)}): ${esc(champLabels.length ? champLabels.join(', ') : 'keiner')}</span></span>`
      : '';
    const champOverride = championOverride(item);
    const championOverrideHtml = isWeaponItem
      ? `<label class="inv-champ-override">Champion <select data-inv-champion>` +
        `<option value="0" ${champOverride ? '' : 'selected'}>Automatisch (${esc(elementChampHtml ? champLabels.join(', ') || 'unbekannt' : 'unbekannt')})</option>` +
        `<option value="1" ${champOverride === 1 ? 'selected' : ''}>Barriere</option>` +
        `<option value="2" ${champOverride === 2 ? 'selected' : ''}>Überladung</option>` +
        `<option value="3" ${champOverride === 3 ? 'selected' : ''}>Unaufhaltsam</option>` +
        `</select></label>`
      : '';
    const padHints = [];
    if (kind === 'backpack') padHints.push('<span><kbd>LB</kbd> Tresor</span>');
    if ((kind === 'backpack' || kind === 'vault') && chars.some((c) => c.id !== owner)) padHints.push('<span><kbd>RB</kbd> Lagern</span>');
    if (item.instanceId || item.hash) padHints.push('<span><kbd>X</kbd> Favorit</span>');
    if (item.equippable !== false) padHints.push('<span><kbd>Y</kbd> Anlegen</span>');
    const padHintHtml = padHints.length ? `<div class="inv-popup-pad-hint">${padHints.join('')}</div>` : '';

    const activeTag = getItemTag(item);
    const currentFolder = getItemFolder(item);
    const folderOptions = itemFolders().map((folder) => `<option value="${esc(folder.id)}" ${folder.id === currentFolder ? 'selected' : ''}>${esc(folder.name)}</option>`).join('');
    const folderRow = `<div class="inv-popup-folders"><label>Ordner <select data-inv-folder><option value="">— kein Ordner —</option>${folderOptions}</select></label>` +
      `<button type="button" class="btn ghost small" data-inv-new-folder>+ Ordner</button></div>`;
    const tagRow = `<div class="inv-popup-tags">` + TAG_DEFS.map((def) =>
      `<button type="button" class="inv-tag-btn${activeTag === def.id ? ' on' : ''}" data-inv-act="tag" data-tag="${def.id}" style="--tag-color:${def.color}" title="Tag: ${esc(def.label)}">${esc(def.label)}</button>`
    ).join('') + `</div>`;

    backdrop.innerHTML =
      `<div class="inv-popup">` +
      `<div class="inv-popup-band b${r}"></div>` +
      `<div class="inv-popup-head">` +
      (item.icon ? `<img class="inv-popup-icon" style="background:${DIM.RARITY_BG[r] || '#522f65'}" src="https://www.bungie.net${esc(item.icon)}" alt="">` : '') +
      `<div class="inv-popup-title">` +
      `<strong class="inv-popup-name n${r}">${highlightSearchText(item.name || 'Item')}</strong>` +
      `<span class="inv-popup-sub">${esc(item.typeName || 'Item')}${item.power ? ` · ${item.power} Power` : ''}${rn ? ` · ${esc(rn)}` : ''}${item.masterwork ? ' · Meisterwerk' : ''}</span>` +
      (notes ? notes : '') +
      (nearNotes ? nearNotes : '') +
      (nearDiagnose ? nearDiagnose : '') +
      (elementChampHtml) +
      (championOverrideHtml) +
      (highestWarning ? highestWarning : '') +
      `</div>` +
      `<button class="inv-popup-close" data-inv-act="close" aria-label="Schließen">✕</button>` +
      `</div>` +
      `<div class="inv-popup-body">` +
      `<div class="inv-popup-actions">${actions.join('')}</div>` +
      `<div class="inv-popup-main">` +
      (folderRow) +
      (tagRow) +
      (flavor) +
      (armorMetaHtml) +
      (setBonusHtml) +
      (perkGrid ? `<p class="inv-popup-section">Perks</p><div class="inv-perk-grid">${perkGrid}</div>` : '') +
      modRow +
      (statRows ? `<p class="inv-popup-section">Werte</p><div style="display:flex;flex-direction:column;gap:4px">${statTotalHtml}${statRows}${statLegend}</div>` : '') +
      (noteHtml) +
      `</div></div>` + padHintHtml + `</div>`;
    backdrop.dataset.membershipType = String(membershipType);
    backdrop.classList.add('open');
    hideTooltip();
  }

  function compareOpen() {
    const backdrop = view && view.querySelector('.inv-compare-backdrop');
    return Boolean(backdrop && backdrop.classList.contains('open'));
  }

  // ---------- Popup-Aktionen (Transfer / Equip / Lock) ----------
  async function popupAction(button) {
    const action = button.dataset.invAct;
    if (action === 'close') { closePopup(); return; }
    if (action === 'fullscreen') {
      const popup = button.closest('.inv-popup');
      if (popup) popup.classList.toggle('full');
      button.disabled = false;
      return;
    }
    if (!selectedItem) return;
    const item = selectedItem.item;
    const backdrop = ensurePopup();
    const target = String(button.dataset.invTarget || selectedItem.owner || '');
    button.disabled = true;
    if (action === 'save-note') {
      const textarea = backdrop.querySelector('[data-inv-note]');
      const text = String((textarea && textarea.value) || '').trim().slice(0, 300);
      const key = String(item.instanceId || item.hash || '');
      const notes = { ...(((getCfg().bungie && getCfg().bungie.itemNotes) || {})) };
      if (text) notes[key] = text;
      else delete notes[key];
      setConfig({ bungie: { itemNotes: notes } });
      toast(text ? 'Notiz gespeichert.' : 'Notiz entfernt.', 'success', 1600);
      button.disabled = false;
      openPopup();
      return;
    }
    if (action === 'accept-near') {
      if (item.instanceId) {
        const accepted = ((getCfg().bungie && getCfg().bungie.acceptedNear) || [])
          .map(String)
          .filter((value) => value && value !== String(item.instanceId));
        accepted.push(String(item.instanceId));
        setConfig({ bungie: { acceptedNear: accepted } });
        item.godRoll = true;
        item.godRollKind = 'near';
        item.godNotes = (item.nearGodRoll && item.nearGodRoll.notes) || '';
        item.godSource = (item.nearGodRoll && item.nearGodRoll.source) || '';
        item.godPerks = item.nearPerks || [];
        toast('Fast-Godroll akzeptiert.', 'success', 1800);
        openPopup();
      }
      return;
    }
    if (action === 'to-vault') {
      await doTransfer(item, true, target || (data && data.characters && data.characters[0] && data.characters[0].id) || '');
    } else if (action === 'to-char') {
      await doTransfer(item, false, target);
    } else if (action === 'equip') {
      await doEquip(item, target);
    } else if (action === 'equip-from-vault') {
      // Kette: erst aus dem Tresor holen, dann anlegen.
      const transfer = await api.bungieTransfer({
        itemHash: item.hash, itemId: item.instanceId, stackSize: 1,
        toVault: false, characterId: target, membershipType: data.membershipType
      });
      if (transfer && transfer.ok) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await doEquip(item, target);
      } else {
        toast((transfer && transfer.error) || 'Übertragung fehlgeschlagen.', 'error', 3200);
      }
    } else if (action === 'compare') {
      if (selectedItem) {
        compareItems.push(selectedItem.item);
        closePopup();
        openCompare();
      }
      return;
    } else if (action === 'fav') {
      const favs = { ...((getCfg().bungie && getCfg().bungie.favs) || {}) };
      const favKey = item.instanceId || String(item.hash);
      favs[favKey] = !favs[favKey];
      setConfig({ bungie: { favs } });
      toast(favs[favKey] ? 'Item als Favorit markiert.' : 'Favorit entfernt.', 'success', 1600);
      render();
      if (backdropOpen()) openPopup();
      return;
    } else if (action === 'tag') {
      const tag = String(button.dataset.tag || '');
      const current = getItemTag(item);
      setItemTag(item, current === tag ? '' : tag);
      render();
      if (backdropOpen()) openPopup();
      return;
    } else if (action === 'lock') {
      const lock = !((Number(item.state) || 0) & 1);
      const payload = { itemId: item.instanceId, characterId: target, membershipType: data.membershipType, lock };
      if (!navigator.onLine) {
        const count = enqueueOutbox({
          kind: 'lock', payload, characterId: target,
          characterName: characterLabel(target), itemName: item.name || 'Item'
        });
        toast(`Offline – Markierung in den Ausgang gelegt (${count} warten).`, 'warning', 2800);
        return;
      }
      const result = await api.bungieLock(payload);
      if (result && result.ok) {
        item.state = lock ? (Number(item.state) || 0) | 1 : (Number(item.state) || 0) & ~1;
        toast(lock ? 'Item markiert.' : 'Markierung entfernt.', 'success', 1600);
        openPopup();
      } else {
        const message = (result && result.error) || 'Markieren fehlgeschlagen.';
        if (outboxRetryable(message)) {
          const count = enqueueOutbox({
            kind: 'lock', payload, characterId: target,
            characterName: characterLabel(target), itemName: item.name || 'Item', lastError: message
          });
          toast(`${message} – in den Ausgang gelegt (${count} warten).`, 'warning', 3200);
        } else {
          toast(message, 'error', 3200);
        }
        button.disabled = false;
      }
      return;
    }
    if (backdropOpen()) openPopup();
  }

  function backdropOpen() {
    const backdrop = view && view.querySelector('.inv-popup-backdrop');
    return Boolean(backdrop && backdrop.classList.contains('open'));
  }

  // ---------- Compare-Ansicht (DIM Compare: bis 4 Items nebeneinander) ----------
  let compareItems = [];

  function ensureCompare() {
    let backdrop = view.querySelector('.inv-compare-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'inv-compare-backdrop';
      view.appendChild(backdrop);
      backdrop.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-cmp-remove]');
        if (remove) {
          const index = Number(remove.dataset.cmpRemove) || 0;
          compareItems.splice(index, 1);
          openCompare();
          return;
        }
        if (event.target === backdrop || event.target.closest('[data-cmp-close]')) closeCompare();
      });
    }
    return backdrop;
  }

  function closeCompare() {
    const backdrop = view && view.querySelector('.inv-compare-backdrop');
    if (backdrop) backdrop.classList.remove('open');
  }

  function openCompare() {
    if (!view) return;
    const backdrop = ensureCompare();
    const itemKey = (item) => item.instanceId || `${item.hash}`;
    // Duplikate raus, neueste zuerst, max 4 (DIM vergleicht bis zu 6).
    const seen = new Set();
    compareItems = compareItems.filter((item) => {
      const key = itemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(-4);

    const armorMode = compareItems.some((item) => DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket)));
    const bestArmorStats = {};
    for (const item of compareItems) {
      if (!DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket))) continue;
      for (const hash of DIM.CHAR_STAT_HASHES) {
        const value = Number((item.baseStats || {})[hash] || 0);
        if (value > (bestArmorStats[hash] || 0)) bestArmorStats[hash] = value;
      }
    }
    const armorSignatures = compareItems
      .filter((item) => DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket)))
      .map((item) => armorStatSignature(item));
    const identicalStats = armorSignatures.length > 1 && new Set(armorSignatures).size === 1;
    const weightsRaw = (getCfg().bungie && getCfg().bungie.godrollWeights) || {};
    const weights = {
      selected: Number(weightsRaw.selected) || 20,
      alternative: Number(weightsRaw.alternative) || 10,
      masterwork: Number(weightsRaw.masterwork) || 5
    };
    const rollScore = (item) => {
      const options = Array.isArray(item.godOptions) ? item.godOptions : [];
      if (!options.length) return null;
      const have = new Set();
      for (const perk of item.perks || []) if (perk && perk.n) have.add(String(perk.n).toLowerCase());
      for (const column of item.socketColumns || []) {
        for (const option of column.options || []) if (option && option.selected && option.n) have.add(String(option.n).toLowerCase());
      }
      const matched = options.filter((name) => have.has(String(name).toLowerCase())).length;
      const missing = options.length - matched;
      const max = options.length * weights.selected + weights.masterwork;
      const raw = matched * weights.selected + missing * weights.alternative + (item.masterwork ? weights.masterwork : 0);
      return max ? Math.round((raw / max) * 100) : null;
    };
    const scored = compareItems
      .map((item) => ({ item, score: rollScore(item) }))
      .filter((entry) => entry.score != null)
      .sort((a, b) => b.score - a.score);
    const bestRoll = scored.length > 1 && scored[0].score > scored[1].score ? scored[0].item.name : '';

    const columns = compareItems.map((item, index) => {
      const r = Number(item.rarity) || 0;
      const armor = DIM.ARMOR_SLOTS.some((slot) => slot.key === Number(item.bucket));
      const godPerks = item.godPerks || [];
      const isGod = (perk) => godPerks.includes(Number(perk.hash) || 0);
      const perks = armor ? '' : (item.perks || []).slice(0, 6).map((perk) =>
        `<div class="inv-cmp-perk${isGod(perk) ? ' god' : ''}">${perk.i ? `<img src="https://www.bungie.net${esc(perk.i)}" alt="">` : ''}<span>${esc(perk.n)}${isGod(perk) ? ' ✓' : ''}</span></div>`
      ).join('');
      const meta = armor
        ? [item.gearTier ? `T${item.gearTier}` : '', item.archetype ? `${item.archetype.name} (${item.archetype.primaryLabel}/${item.archetype.secondaryLabel})` : '', item.tertiaryStat ? `Tertiär: ${item.tertiaryStat.label}` : '', item.tunedStat ? `Tuning: ${item.tunedStat.label}` : '', item.setInfo && item.setInfo.name ? item.setInfo.name : '', item.armorWish ? 'Wunsch' : '']
          .filter(Boolean).join(' · ')
        : '';
      const stats = armor
        ? DIM.CHAR_STAT_HASHES.map((hash) => {
            const value = Number((item.baseStats || {})[hash] || 0);
            const best = bestArmorStats[hash] || 0;
            const diff = value - best;
            const diffClass = diff === 0 ? ' best' : diff < 0 ? ' worse' : '';
            const statMeta = (item.stats || []).find((stat) => Number(stat.hash) === Number(hash)) || {};
            const maxScale = Number(statMeta.max) || 45;
            const barWidth = Math.max(0, Math.min(100, (value / maxScale) * 100));
            return `<div class="inv-stat-row${diffClass}"><span class="inv-stat-label" title="${esc(DIM.STAT_LABELS[String(hash)] || '')}">${esc(DIM.STAT_LABELS[String(hash)] || '')}</span><span class="inv-stat-bar"><span style="width:${barWidth}%"></span></span><span class="inv-stat-value">${value}${diff < 0 ? ` <small>${diff}</small>` : ''}</span></div>`;
          }).join('')
        : (item.stats || []).slice(0, 8).map((stat) => {
            const maxScale = Number(stat.max) || 100;
            const width = Math.max(2, Math.min(100, ((Number(stat.value) || 0) / maxScale) * 100));
            const high = width >= 60 ? ' class="high"' : '';
            return `<div class="inv-stat-row"><span class="inv-stat-label" title="${esc(stat.label)}">${esc(stat.label)}</span><span class="inv-stat-bar"><span${high} style="width:${width}%"></span></span><span class="inv-stat-value">${stat.value}</span></div>`;
          }).join('');
      return `<div class="inv-cmp-col">` +
        `<div class="inv-cmp-top">` +
        (item.icon ? `<img class="inv-cmp-icon" style="background:${DIM.RARITY_BG[r] || '#522f65'}" src="https://www.bungie.net${esc(item.icon)}" alt="">` : '') +
        `<div style="flex:1;min-width:0"><div class="inv-cmp-name" style="color:${r === 6 ? '#ceae33' : r === 5 ? '#a370d8' : '#e8ecf2'}">${esc(item.name || 'Item')}</div>` +
        `<div class="inv-cmp-sub">${esc(item.typeName || '')}${item.power ? ` · ${item.power} Power` : ''}${item.godRoll ? ' · <span style="color:#29f36a">✓ God Roll</span>' : ''}</div>` +
        (!armor && rollScore(item) != null ? `<div class="inv-cmp-sub">Score ${rollScore(item)}/100</div>` : '') +
        (meta ? `<div class="inv-cmp-sub">${esc(meta)}</div>` : '') +
        `</div>` +
        `<button class="inv-cmp-remove" data-cmp-remove="${index}" aria-label="Entfernen">✕</button>` +
        `</div>` +
        (perks ? `<p class="inv-popup-section">Perks</p><div class="inv-cmp-perks">${perks}</div>` : '') +
        (stats ? `<p class="inv-popup-section">${armor ? 'Basis-Stats' : 'Werte'}</p><div style="display:flex;flex-direction:column;gap:4px">${stats}</div>` : '') +
        `</div>`;
    }).join('');

    backdrop.innerHTML =
      `<div class="inv-compare">` +
      `<div class="inv-compare-head"><strong>Vergleichen${identicalStats ? ' · ⚠ identische Stats' : ''}${bestRoll ? ` · Beste Rolle: ${esc(bestRoll)}` : ''}</strong><button class="inv-cmp-close" data-cmp-close aria-label="Schließen">✕</button></div>` +
      `<div class="inv-compare-grid">${columns}<div class="inv-cmp-empty">„Vergleichen“ im Item-Popup drücken,<br>um weitere Waffen oder Rüstung hinzuzufügen.</div></div>` +
      `</div>`;
    backdrop.classList.add('open');
  }

  // ---------- Farming-Modus (DIM: Beutetasche automatisch leeren) ----------
  // Solange aktiv, fragt der Modus in festem Takt NUR die Beutetasche
  // des gewählten Charakters ab (leichtes Farming-Refresh im Main-
  // Prozess) und schiebt NEUE Items sofort in den Tresor, damit
  // Beute-Drops Platz haben. Engramme werden übersprungen (nicht
  // transferierbar), bestehende Items bleiben unangetastet.
  //
  // Wichtig gegen das frühere Einfrieren:
  //  • kein setInterval mehr — der nächste Poll wird erst nach dem
  //    vollständigen Abschluss geplant (keine Überlappung),
  //  • kein vollständiger Inventar-Abruf/Render pro Poll,
  //  • `render()` nur, wenn wirklich Items bewegt wurden und das
  //    Inventar sichtbar ist.
  let farmingActive = false;
  let farmingCharId = '';
  let farmingSeen = new Set();
  let farmingTimer = null;
  let farmingBusy = false;
  let farmingLastErrorAt = 0;
  let farmingFailures = new Map();
  let farmBtn = null;

  function scheduleFarmingPoll(delay) {
    if (farmingTimer) clearTimeout(farmingTimer);
    farmingTimer = setTimeout(() => {
      farmingTimer = null;
      pollFarming();
    }, delay);
  }

  async function pollFarming() {
    if (!farmingActive || farmingBusy || !data) return;
    if (!farmingCharId || !data.membershipType || !data.membershipId) return;
    farmingBusy = true;
    let moved = 0;
    let retrySoon = false;
    try {
      let items = null;
      if (typeof api.bungieFarming === 'function') {
        const result = await api.bungieFarming({
          membershipType: data.membershipType,
          membershipId: data.membershipId,
          characterId: farmingCharId
        });
        if (!result || !result.ok) throw new Error((result && result.error) || 'Farming-Refresh fehlgeschlagen.');
        items = Array.isArray(result.items) ? result.items : [];
      } else {
        // Fallback für ältere Builds: volles Inventar.
        const result = await api.bungieInventory();
        if (!result || !result.ok) throw new Error((result && result.error) || 'Farming-Refresh fehlgeschlagen.');
        data = result;
        setToolsData(result);
        const ts = (value) => { const t = Date.parse(String(value || '')); return Number.isFinite(t) ? t : 0; };
        (data.characters || []).sort((a, b) => ts(b.lastPlayed) - ts(a.lastPlayed));
        if (data.postmaster && sessionPulledPm.size) {
          for (const [id, list] of Object.entries(data.postmaster)) {
            data.postmaster[id] = (list || []).filter((item) => !sessionPulledPm.has(item.instanceId));
          }
        }
        items = ((data.backpack || {})[farmingCharId] || []).slice();
      }
      const fresh = items
        .filter((item) => item && item.instanceId)
        .filter((item) => !/engram/i.test(`${item.name || ''} ${item.typeName || ''}`))
        .filter((item) => !farmingSeen.has(item.instanceId));
      for (const item of fresh) {
        const r = await api.bungieTransfer({
          itemHash: item.hash, itemId: item.instanceId, stackSize: 1,
          toVault: true, characterId: farmingCharId, membershipType: data.membershipType
        });
        if (r && r.ok) {
          moveLocally(item, true, farmingCharId);
          farmingSeen.add(item.instanceId);
          farmingFailures.delete(item.instanceId);
          moved += 1;
          await new Promise((resolve) => setTimeout(resolve, 300));
        } else {
          // Fehlschlag (z. B. Rate-Limit/voller Tresor): bis zu 3×
          // erneut versuchen, danach nicht mehr anfassen (z. B.
          // Quest-/Bounty-Items, die Bungie nie in den Tresor lässt).
          const fails = (farmingFailures.get(item.instanceId) || 0) + 1;
          farmingFailures.set(item.instanceId, fails);
          if (fails >= 3) farmingSeen.add(item.instanceId);
          retrySoon = true;
          break;
        }
      }
      // Engramme & bereits vorhandene Items als gesehen markieren,
      // damit sie nie erneut angefasst werden. Fehlgeschlagene
      // Transfers bleiben absichtlich unmarkiert.
      for (const item of items) {
        if (!item || !item.instanceId) continue;
        if (/engram/i.test(`${item.name || ''} ${item.typeName || ''}`)) farmingSeen.add(item.instanceId);
      }
      if (moved) {
        toast(`${moved} Item${moved === 1 ? '' : 's'} automatisch in den Tresor.`, 'success', 1800);
        if (!isHidden()) render();
        // Den Loadout-Editor nur anfassen, wenn er offen ist.
        if (drawerRoot && !drawerRoot.classList.contains('hidden')) {
          try { renderDrawer(); renderSheet(); } catch (error) { /* Drawer darf Farming nie blockieren */ }
        }
      }
    } catch (error) {
      // Fehler gedrosselt melden (max. alle 60 s), Farming läuft weiter.
      if (Date.now() - farmingLastErrorAt > 60000) {
        farmingLastErrorAt = Date.now();
        toast(error.message || String(error), 'error', 3200);
      }
    } finally {
      farmingBusy = false;
      // Nächster Lauf erst NACH Abschluss: 4 s nach einem Transfer,
      // sonst 10 s (Bungie cached Profile ohnehin ~30 s).
      if (farmingActive) scheduleFarmingPoll(retrySoon ? 20000 : (moved ? 4000 : 10000));
    }
  }

  function startFarming() {
    if (!data) { toast('Erst Inventar laden.', 'warning', 2000); return; }
    if (!data.membershipId) { toast('Inventar unvollständig — bitte neu laden.', 'warning', 2400); return; }
    farmingActive = true;
    farmingCharId = ((data.characters || [])[0] || {}).id || '';
    farmingFailures = new Map();
    farmingSeen = new Set((((data.backpack || {})[farmingCharId] || [])).filter((item) => item.instanceId).map((item) => item.instanceId));
    if (farmBtn) { farmBtn.classList.add('on'); farmBtn.textContent = `🚜 Farming AN (${charLabel(farmingCharId)})`; }
    toast(`Farming-Modus aktiv für ${charLabel(farmingCharId)} — neue Beutetaschen-Items wandern in den Tresor.`, 'success', 3400);
    pollFarming();
  }

  function stopFarming() {
    farmingActive = false;
    if (farmingTimer) { clearTimeout(farmingTimer); farmingTimer = null; }
    if (farmBtn) { farmBtn.classList.remove('on'); farmBtn.textContent = '🚜 Farming'; }
    toast('Farming-Modus aus.', 'info', 2000);
  }

  function toggleFarming() { if (farmingActive) stopFarming(); else startFarming(); }

  // ---------- Artefakt-Perk-Menü (DIM „Artifact Perks") ----------
  // Karten-Grid wie in DIM: alle Perks mit Icon+Name+Beschreibung, die
  // aktiven mit orangenem Rahmen; „Anwenden" steckt die Änderungen per
  // InsertSocketPlugFree ins Artefakt.
  let artMenu = null;

  function ensureArtMenu() {
    let backdrop = view.querySelector('.inv-art-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'inv-art-backdrop';
      view.appendChild(backdrop);
      backdrop.addEventListener('click', async (event) => {
        if (!artMenu) return;
        const card = event.target.closest('[data-art-card]');
        if (card) {
          const socketIdx = Number(card.dataset.artSocket) || 0;
          const plugHash = Number(card.dataset.artPlug) || 0;
          artMenu.selected[socketIdx] = artMenu.selected[socketIdx] === plugHash ? 0 : plugHash;
          renderArtMenu();
          return;
        }
        if (event.target.closest('[data-art-apply]')) { await applyArtMenu(); return; }
        if (event.target === backdrop || event.target.closest('[data-art-close]')) closeArtMenu();
      });
      // Detail-Overlay: Hover auf eine Artefakt-Perk-Karte.
      backdrop.addEventListener('mouseover', (event) => {
        if (!artMenu) return;
        const card = event.target.closest('[data-art-card]');
        if (!card) return;
        const socketIdx = Number(card.dataset.artSocket) || 0;
        const plugHash = Number(card.dataset.artPlug) || 0;
        const sock = artMenu.socks.find((s) => s.idx === socketIdx);
        const plug = sock ? (sock.plugs || []).find((x) => x.h === plugHash) : null;
        if (plug) showPlugTip(card, plug.n, plug.d, plug.p || 'Artefakt-Perk');
      });
      backdrop.addEventListener('mouseout', (event) => {
        if (event.target.closest('[data-art-card]')) hidePlugTip();
      });
    }
    return backdrop;
  }

  function openArtifactMenu(artifactItem) {
    if (!artifactItem || !data) return;
    const socks = ((data.sockDefs || {})[String(artifactItem.hash)] || []);
    if (!socks.length) { toast('Keine Saison-Mod-Sockets für dieses Artefakt gefunden.', 'warning', 2600); return; }
    const selected = {};
    for (const sock of socks) {
      const plugged = (artifactItem.perks || []).find((perk) => perk.idx === sock.idx);
      selected[sock.idx] = plugged ? plugged.hash : 0;
    }
    artMenu = { item: artifactItem, socks, selected };
    renderArtMenu();
  }

  function closeArtMenu() {
    const backdrop = view && view.querySelector('.inv-art-backdrop');
    if (backdrop) backdrop.classList.remove('open');
    artMenu = null;
  }

  function renderArtMenu() {
    if (!artMenu) return;
    const backdrop = ensureArtMenu();
    const { item, socks, selected } = artMenu;
    const activeCount = Object.values(selected).filter((h) => h > 0).length;
    const cards = [];
    for (const sock of socks) {
      for (const plug of (sock.plugs || [])) {
        const active = selected[sock.idx] === plug.h;
        cards.push(
          `<button type="button" class="inv-art-card${active ? ' active' : ''}" data-art-card="1" data-art-socket="${sock.idx}" data-art-plug="${plug.h}">` +
          `<div class="inv-art-card-top">` +
          (plug.i ? `<img src="https://www.bungie.net${esc(plug.i)}" alt="">` : '') +
          `<span class="art-name">${esc(plug.n || 'Perk')}</span>` +
          `</div>` +
          (plug.d ? `<span class="art-desc">${esc(plug.d)}</span>` : '') +
          `</button>`
        );
      }
    }
    const selIcons = Object.entries(selected).filter(([, h]) => h > 0).map(([, h]) => {
      let icon = '';
      for (const sock of socks) { const p = (sock.plugs || []).find((x) => x.h === h); if (p) { icon = p.i; break; } }
      return icon ? `<img src="https://www.bungie.net${esc(icon)}" alt="">` : '';
    }).join('');
    backdrop.innerHTML =
      `<div class="inv-art">` +
      `<div class="inv-art-head"><strong>Artefakt-Perk</strong><span class="inv-art-count">(${activeCount}/${socks.length})</span><span style="flex:1"></span><button type="button" class="inv-cmp-close" data-art-close aria-label="Schließen">✕</button></div>` +
      `<div class="inv-art-grid">${cards.join('')}</div>` +
      `<div class="inv-art-foot"><button type="button" class="btn primary small" data-art-apply>Anwenden</button><div class="inv-art-sel">${selIcons}</div></div>` +
      `</div>`;
    backdrop.classList.add('open');
  }

  async function applyArtMenu() {
    if (!artMenu || !data) return;
    const { item, selected } = artMenu;
    const membershipType = data.membershipType;
    let done = 0;
    for (const [socketIdxStr, plugHash] of Object.entries(selected)) {
      const socketIndex = Number(socketIdxStr) || 0;
      if (!plugHash) continue;
      const plugged = (item.perks || []).find((perk) => perk.idx === socketIndex);
      if (plugged && plugged.hash === plugHash) continue;
      try {
        const result = await api.bungieInsertPlug({ itemId: item.instanceId, socketIndex, plugItemHash: plugHash, characterId: editorCharId, membershipType });
        if (result && result.ok) {
          done += 1;
          await new Promise((resolve) => setTimeout(resolve, 350));
        } else {
          toast((result && result.error) || 'Artefakt-Perk fehlgeschlagen.', 'error', 3200);
          break;
        }
      } catch (error) {
        toast(error.message || String(error), 'error', 3200);
        break;
      }
    }
    toast(done ? `${done} Artefakt-Perk(s) angewendet.` : 'Keine Änderungen.', done ? 'success' : 'info', 2200);
    closeArtMenu();
    if (done) { render(); renderEditorBody(); }
  }

  // ---------- Loadout-Editor (DIM LoadoutDrawer: Bottom-Sheet) ----------

  const EDITOR_SLOTS = [
    { key: DIM.B.SUBCLASS, label: 'Subklasse' },
    ...DIM.WEAPON_SLOTS.map((slot) => ({ key: slot.key, label: slot.label })),
    ...DIM.ARMOR_SLOTS.map((slot) => ({ key: slot.key, label: slot.label })),
    { key: DIM.B.GHOST, label: 'Geist' },
    { key: DIM.B.EMBLEMS, label: 'Emblem' },
    { key: DIM.B.SHIPS, label: 'Schiff' },
    { key: DIM.B.SPARROWS, label: 'Sparrow' }
  ];
  const DW_ARMOR = DIM.ARMOR_SLOTS.map((slot) => slot.key);
  const isArmorBucket = (hash) => DW_ARMOR.includes(Number(hash));
  const bungieIcon = (icon) => 'https://www.bungie.net' + String(icon || '');
  const getLoadoutList = () => (getCfg().bungie && getCfg().bungie.loadouts) || [];
  const LOADOUT_TAGS = [
    { key: 'pve', label: 'PvE' },
    { key: 'pvp', label: 'PvP' },
    { key: 'gm', label: 'GM' },
    { key: 'raid', label: 'Raid' }
  ];

  let editorSlots = new Map();
  let editorMods = [];          // Rüstungs-Mods (DIM parameters.mods)
  let editorPerks = [];         // Artefakt-Perks (dokumentiert)
  let editorSubPlugs = [];      // Fokus-Überschreibungen (DIM socketOverrides)
  let editorFashion = {};       // Kosmetik je Rüstungs-Bucket
  let editorLoadoutId = '';
  let editorCharId = '';
  let editorName = '';
  let editorNotes = '';
  let editorAnyClass = false;
  let editorShowModPlacement = true;
  let editorClearOtherMods = false;
  let editorArtifact = null;
  let pickKind = '';            // '' | 'slot' | 'mod' | 'perk' | 'sub' | 'optimizer' | 'fashion'
  let ingameEditorState = null;
  let ingameEditorLoading = false;
  let pickerReturnFocus = null;
  let pickBucket = 0;
  let pickSubIdx = -1;
  let pickSocketLabel = '';
  let editorPickerQuery = '';
  let optimizerWeights = {};
  let optimizerMins = {};
  let optimizerLockArmor = false;
  let optimizerResult = null;

  let drawerRoot = null;
  let drawerBodyEl = null;
  let drawerSheetEl = null;
  let drawerNameEl = null;
  let drawerNotesEl = null;
  let drawerCharEl = null;

  let itemIndexCache = { data: null, byKey: new Map(), byInstance: new Map() };

  function ensureItemIndex() {
    if (itemIndexCache.data === data) return itemIndexCache;
    const byKey = new Map();
    const byInstance = new Map();
    const add = (item, location, owner) => {
      if (!item) return;
      const instanceId = String(item.instanceId || '');
      if (instanceId) {
        byInstance.set(instanceId, { item, location, owner });
        byKey.set(instanceId, item);
      }
      if (item.hash) byKey.set(String(item.hash), item);
    };
    for (const item of data && data.vault || []) add(item, 'vault', '');
    for (const [id, items] of Object.entries((data && data.backpack) || {})) for (const item of items || []) add(item, 'backpack', id);
    for (const [id, items] of Object.entries((data && data.equipped) || {})) for (const item of items || []) add(item, 'equipped', id);
    itemIndexCache = { data, byKey, byInstance };
    return itemIndexCache;
  }

  function findItemByKey(key) {
    if (!data || !key) return null;
    return ensureItemIndex().byKey.get(String(key)) || null;
  }

  // ---------- Hover-Overlay im Loadout-Editor (Stats + Perks) ----------
  // Alle steckbaren Plugs aus den Socket-Definitionen in einer Map
  // (einmal pro Inventar-Datenobjekt), damit Hover über Mod-/Perk-
  // Kacheln sofort Beschreibung und Stat-Boni zeigt.
  let drawerPlugIndex = { data: null, map: null };

  function drawerPlugMap() {
    if (drawerPlugIndex.data === data && drawerPlugIndex.map) return drawerPlugIndex.map;
    const map = new Map();
    for (const list of Object.values((data && data.sockDefs) || {})) {
      for (const sock of list) {
        for (const plug of (sock.plugs || [])) {
          if (plug && plug.h && !map.has(Number(plug.h))) map.set(Number(plug.h), plug);
        }
      }
    }
    drawerPlugIndex = { data, map };
    return map;
  }

  function findPlugInfo(hash) {
    const h = Number(hash) || 0;
    if (!h) return null;
    const fromDefs = drawerPlugMap().get(h);
    if (fromDefs) return fromDefs;
    const local = [...editorMods, ...editorPerks, ...editorSubPlugs].find((p) => Number(p.h || p.hash) === h);
    if (!local) return null;
    return { h, n: local.n, i: local.i, p: local.p, d: local.d, s: local.s || [] };
  }

  const DRAWER_TIP_TARGET = '[data-dw-tip-item],[data-dw-tip-itemhash],[data-dw-tip-plug],[data-dw-pick]';

  function onDrawerTipOver(event) {
    const host = event.target.closest ? event.target.closest(DRAWER_TIP_TARGET) : null;
    if (!host || !tooltipEl) return;
    let html = '';
    if (host.dataset.dwTipItem) {
      const item = findItemByKey(String(host.dataset.dwTipItem));
      if (item) html = tooltipHtml(item);
    }
    if (!html && host.dataset.dwTipItemhash) {
      const item = findItemByKey(String(host.dataset.dwTipItemhash));
      if (item) html = tooltipHtml(item);
    }
    if (!html && host.dataset.dwTipPlug) {
      const plug = findPlugInfo(host.dataset.dwTipPlug);
      if (plug) html = plugTipHtml(plug);
    }
    if (!html && host.dataset.dwPick) {
      const item = findItemByKey(String(host.dataset.dwPick));
      if (item) html = tooltipHtml(item);
    }
    if (!html) return;
    tooltipEl.innerHTML = html;
    positionTooltip(host);
  }

  function onDrawerTipOut(event) {
    const host = event.target.closest ? event.target.closest(DRAWER_TIP_TARGET) : null;
    if (!host) return;
    const to = event.relatedTarget;
    if (to && host.contains(to)) return;
    hideTooltip();
  }

  function editorChar() {
    const chars = (data && data.characters) || [];
    return chars.find((c) => c.id === editorCharId) || chars[0] || null;
  }

  function editorClassType() {
    if (editorAnyClass) return 3;
    const ch = editorChar();
    return ch ? Number(ch.classType) : 3;
  }

  function classMatches(item) {
    const cls = editorClassType();
    if (cls === 3) return true;
    const it = Number(item && item.classType);
    return !Number.isFinite(it) || it === 3 || it === cls;
  }

  // Klasse eines Items über den Besitzer ermitteln (Subklassen haben in
  // der Definition oft classType 3 – die Zugehörigkeit steckt im
  // Charakter-Inventar).
  function classOfOwnedInstance(instanceId) {
    if (!data || !instanceId) return 3;
    for (const bucket of ['equipped', 'backpack']) {
      for (const [charId, list] of Object.entries(data[bucket] || {})) {
        if (!(list || []).some((item) => item.instanceId === instanceId)) continue;
        const character = (data.characters || []).find((entry) => entry.id === charId);
        return character ? Number(character.classType) : 3;
      }
    }
    return 3;
  }

  function allItemsPool() {
    return [
      ...((data && data.vault) || []),
      ...Object.values((data && data.equipped) || {}).flat(),
      ...Object.values((data && data.backpack) || {}).flat()
    ];
  }

  function equippedFor(charId) {
    return ((data && data.equipped && data.equipped[charId]) || []);
  }

  function socketPlugsFor(item) {
    return ((data && data.sockDefs && data.sockDefs[String(item && item.hash)]) || []);
  }

  // Upgrade-, Masterwork-, Tuning- und Energie-Plugs stecken in
  // denselben Rüstungs-Sockets wie Mods, sind aber keine Mods (z. B.
  // „Rüstung verbessern", v460.plugs.armor.masterworks.stat.*).
  const NON_MOD_PLUG = /armor\.masterworks|masterworks\.stat|armor_archetypes|(^|\.)tuning(\.|$)|energy_capacity|plugs\.armor\.energy|artifact_perks|seasonal_artifact|(^|\.)artifacts?(\.|$)/i;
  function isModPlug(plug) {
    if (!plug) return false;
    const category = String(plug.p || '');
    if (category && NON_MOD_PLUG.test(category)) return false;
    if (/rüstung verbessern|armor upgrade|upgrade armor/i.test(String(plug.n || ''))) return false;
    return true;
  }

  // Mod-Sockets eines Teils, ohne Upgrade-/Masterwork-/Tuning-Sockets.
  function modSocketsFor(item) {
    return socketPlugsFor(item)
      .map((sock) => ({ ...sock, plugs: (sock.plugs || []).filter(isModPlug) }))
      .filter((sock) => (sock.plugs || []).length > 0);
  }

  // Allgemeine Mod-Sockets eines Rüstungsteils (drei pro Teil).
  function generalSocketsFor(item) {
    return socketPlugsFor(item).filter((sock) =>
      /enhancements\.v2_general/i.test(`${sock.p || ''} ${(sock.plugs || []).map((plug) => plug.p || '').join(' ')}`)
    );
  }

  function effectiveSubPlug(sock) {
    if (!sock) return null;
    const ov = editorSubPlugs.find((sp) => Number(sp.idx) === Number(sock.idx));
    if (ov) return ov;
    const sub = editorSlots.get(DIM.B.SUBCLASS);
    return sub ? ((sub.perks || []).find((p) => Number(p.idx) === Number(sock.idx)) || null) : null;
  }

  const SOCK_KIND_LABEL = {
    super: 'Super', grenade: 'Granate', melee: 'Nahkampf',
    class: 'Klassen-Fähigkeit', movement: 'Bewegung',
    ability: 'Fähigkeit', aspect: 'Aspekt', fragment: 'Fragment', other: 'Fähigkeit'
  };

  function sockKind(sock) {
    if (!sock) return 'other';
    const eff = effectiveSubPlug(sock);
    const cats = [];
    if (eff && eff.p) cats.push(String(eff.p));
    for (const p of (sock.plugs || [])) if (p && p.p) cats.push(String(p.p));
    const joined = cats.join(' ').toLowerCase();
    if (/fragment/.test(joined)) return 'fragment';
    if (/aspect/.test(joined)) return 'aspect';
    if (/super/.test(joined)) return 'super';
    if (/grenade/.test(joined)) return 'grenade';
    if (/melee/.test(joined)) return 'melee';
    if (/class.?abilit/.test(joined)) return 'class';
    if (/movement|jump/.test(joined)) return 'movement';
    // Keine Kategorie im Manifest: die Socket-Reihenfolge nutzen — bei
    // Subklassen kommen erst die Fähigkeiten, dann Aspekte, dann
    // Fragmente (Reihenfolge der socketEntries).
    const idx = Number(sock.idx) || 0;
    if (idx < 5) return 'ability';
    return (sock.plugs || []).length <= 10 ? 'aspect' : 'fragment';
  }

  function subSocketLabel(sock, livePlug) {
    const kind = sockKind(sock);
    return SOCK_KIND_LABEL[kind] || (livePlug && livePlug.n) || ('Socket ' + (sock ? sock.idx : '?'));
  }

  function prettyCategory(cat) {
    const c = String(cat || '').toLowerCase();
    const map = [
      [/fragment/, 'Fragment'], [/aspect/, 'Aspekt'], [/super/, 'Super'],
      [/grenade/, 'Granate'], [/melee/, 'Nahkampf'], [/class_ability|classability/, 'Klassen-Fähigkeit'],
      [/movement/, 'Bewegung'], [/shader/, 'Shader'], [/ornament/, 'Ornament'],
      [/enhancements\.general/, 'Allgemeine Mod'], [/enhancements\.armor/, 'Rüstungs-Mod'],
      [/enhancements/, 'Mod'], [/artifact/, 'Artefakt-Mod'], [/tuning/, 'Tuning-Mod']
    ];
    for (const pair of map) if (pair[0].test(c)) return pair[1];
    return cat ? String(cat).replace(/[._]/g, ' ') : '';
  }

  // Items ({name, icon, power, rarity}) und Plugs ({n, i}) in eine
  // gemeinsame Kachelform bringen — DIM zeigt beide als ItemIcon.
  function tileData(entry) {
    if (!entry) return null;
    return {
      name: entry.name != null ? entry.name : (entry.n != null ? entry.n : ''),
      icon: entry.icon != null ? entry.icon : (entry.i || ''),
      power: entry.power,
      rarity: entry.rarity
    };
  }

  // Eine Kachel (DIM ItemIcon): Raritäts-Hintergrund, Icon, optional ✕.
  function dwTileHtml(entry, label, opts) {
    const o = opts || {};
    const item = tileData(entry);
    const rarity = Number(item && item.rarity) || 5;
    const isItemShape = Boolean(entry) && (Boolean(entry.instanceId) || (entry.name != null && entry.n == null));
    const tip = !item ? '' : (isItemShape
      ? (entry.instanceId
        ? ' data-dw-tip-item="' + esc(String(entry.instanceId)) + '"'
        : (entry.hash ? ' data-dw-tip-itemhash="' + esc(String(entry.hash)) + '"' : ''))
      : ((entry.h || entry.hash) ? ' data-dw-tip-plug="' + esc(String(entry.h || entry.hash)) + '"' : ''));
    const inner = item && item.icon
      ? '<img src="' + bungieIcon(item.icon) + '" style="background:' + (DIM.RARITY_BG[rarity] || '#522f65') + '" alt="">'
      : (item && item.name
        ? '<span class="inv-dw-letter" title="' + esc(item.name) + '">' + esc(String(item.name).slice(0, 1).toUpperCase()) + '</span>'
        : '<span class="inv-dw-plus">+</span>');
    const remove = item && !o.noRemove && o.bucket
      ? '<span class="inv-dw-tile-x" role="button" title="Entfernen" data-dw-slot-clear="' + o.bucket + '">✕</span>'
      : '';
    const title = item ? (String(item.name || '') + (item.power ? ' · ✦' + item.power : '')) : (o.title || label || 'Wählen');
    return '<div class="inv-dw-slotwrap' + (o.wide ? ' wide' : '') + '">' +
      '<div class="inv-dw-tile' + (item ? '' : ' empty') + (o.round ? ' round' : '') + '" role="button" tabindex="0" ' +
      (o.attr || ('data-dw-slot="' + o.bucket + '"')) + tip + ' title="' + esc(title) + '">' +
      inner + remove + '</div>' +
      (label ? '<span class="inv-dw-slotlabel">' + esc(label) + '</span>' : '') +
      (item && item.power ? '<span class="inv-dw-power">✦' + esc(String(item.power)) + '</span>' : '') +
      '</div>';
  }

  function dwSlotTile(bucket, label) {
    return dwTileHtml(editorSlots.get(bucket), label, { bucket });
  }

  function dwSection(title, actions, body, cls) {
    return '<section class="inv-dw-section' + (cls ? ' ' + cls : '') + '">' +
      '<div class="inv-dw-sec-head"><span class="inv-dw-sec-title">' + esc(title) + '</span>' +
      '<span class="inv-dw-sec-actions">' + (actions || '') + '</span></div>' +
      '<div class="inv-dw-sec-body">' + body + '</div></section>';
  }


  function dwFocusSection() {
    const sub = editorSlots.get(DIM.B.SUBCLASS);
    const actions = '<button type="button" class="btn ghost small" data-dw-slot="' + DIM.B.SUBCLASS + '">' +
      (sub ? 'Subklasse ändern' : 'Subklasse wählen') + '</button>';
    if (!sub) {
      return dwSection('Fokus', actions, '<div class="inv-dw-row">' + dwSlotTile(DIM.B.SUBCLASS, 'Subklasse') + '</div>');
    }
    const socks = socketPlugsFor(sub);
    const abilities = socks.filter((s) => ['super', 'grenade', 'melee', 'class', 'movement', 'ability', 'other'].includes(sockKind(s)));
    const aspects = socks.filter((s) => sockKind(s) === 'aspect');
    const fragments = socks.filter((s) => sockKind(s) === 'fragment');
    const sockTile = (sock, round) => {
      const eff = effectiveSubPlug(sock);
      const label = subSocketLabel(sock, eff);
      return dwTileHtml(eff, label, {
        attr: 'data-dw-sub-sock="' + sock.idx + '"',
        title: eff ? (eff.n + ' — ' + label) : (label + ' wählen'),
        round,
        noRemove: true
      });
    };
    const body =
      '<div class="inv-dw-focus">' +
      '<div class="inv-dw-focus-icon">' + dwSlotTile(DIM.B.SUBCLASS, '') + '</div>' +
      '<div class="inv-dw-focus-main">' +
      '<div class="inv-dw-row">' + abilities.map((s) => sockTile(s, true)).join('') + '</div>' +
      (aspects.length ? '<div class="inv-dw-subrow"><span class="inv-dw-subrow-label">Aspekte</span><div class="inv-dw-row">' + aspects.map((s) => sockTile(s, false)).join('') + '</div></div>' : '') +
      (fragments.length ? '<div class="inv-dw-subrow"><span class="inv-dw-subrow-label">Fragmente</span><div class="inv-dw-row">' + fragments.map((s) => sockTile(s, true)).join('') + '</div></div>' : '') +
      '</div></div>' +
      (!socks.length ? '<p class="inv-dw-hint">Für diese Subklasse sind keine Sockets im Cache — bitte einmal das Inventar aktualisieren.</p>' : '');
    return dwSection('Fokus', actions, body);
  }

  function dwWeaponsSection() {
    const body = '<div class="inv-dw-row">' + DIM.WEAPON_SLOTS.map((s) => dwSlotTile(s.key, s.label)).join('') + '</div>';
    const actions = '<button type="button" class="btn ghost small" data-dw-fill="equipped">Aus Ausgerüstetem füllen</button>';
    return dwSection('Waffen', actions, body);
  }

  function dwStatsBar() {
    const totals = {};
    let power = 0, powerCount = 0;
    for (const b of DW_ARMOR) {
      const it = editorSlots.get(b);
      if (!it) continue;
      for (const st of (it.stats || [])) {
        const h = String(st.hash || st.h || '');
        if (h) totals[h] = (totals[h] || 0) + Math.round(Number(st.value) || 0);
      }
      if (it.power) { power += Number(it.power) || 0; powerCount += 1; }
    }
    for (const m of editorMods) {
      for (const bonus of (m.s || [])) {
        const h = String(bonus.h || '');
        if (h) totals[h] = (totals[h] || 0) + Math.round(Number(bonus.v) || 0);
      }
    }
    const icons = (data && data.charStatIcons) || {};
    const cells = DIM.CHAR_STAT_HASHES.map((h) => {
      const icon = icons[String(h)] || '';
      return '<span class="inv-dw-stat">' + (icon ? '<img src="' + bungieIcon(icon) + '" alt="">' : '') +
        '<span>' + (totals[String(h)] || 0) + '</span></span>';
    }).join('');
    const pw = powerCount ? '<span class="inv-dw-stat power">✦' + Math.round(power / powerCount) + '</span>' : '';
    return '<div class="inv-dw-statbar">' + pw + cells + '</div>';
  }

  function dwArmorMods(armor) {
    const socks = modSocketsFor(armor);
    if (!socks.length) return '';
    const tiles = socks.map((sock) => {
      const assigned = editorMods.find((m) => Number(m.sb) === Number(armor.bucket) && Number(m.si) === Number(sock.idx));
      const plugged = (armor.perks || []).find((p) => Number(p.idx) === Number(sock.idx));
      const eff = assigned || plugged;
      const cls = 'inv-dw-mod' + (eff ? '' : ' empty') + (assigned ? ' assigned' : '');
      const plugHash = eff ? Number(eff.h || eff.hash || 0) : 0;
      return '<span class="' + cls + '" role="button" tabindex="0" data-dw-sock-open="' + sock.idx + '"' +
        (plugHash ? ' data-dw-tip-plug="' + plugHash + '"' : '') + ' title="' +
        esc(eff ? eff.n : 'Mod für diesen Socket wählen') + '">' +
        (eff && eff.i ? '<img src="' + bungieIcon(eff.i) + '" alt="">' : '+') + '</span>';
    }).join('');
    return '<div class="inv-dw-modrow" data-dw-sock-bucket="' + armor.bucket + '">' + tiles + '</div>';
  }

  function armorEnergy(item) {
    if (!item || !item.energy || !Number(item.energy.capacity)) return null;
    const bucket = Number(item.bucket);
    const assigned = editorMods.filter((mod) => Number(mod.sb) === bucket);
    const cost = assigned.reduce((sum, mod) => sum + (Number(mod.e) || 0), 0);
    const unknown = assigned.filter((mod) => !Number(mod.e)).length;
    const sockets = generalSocketsFor(item);
    const modSlots = { total: sockets.length || 3, used: assigned.length };
    return { capacity: Number(item.energy.capacity), cost, unknown, used: Number(item.energy.used) || 0, modSlots };
  }

  function rebalanceEditorEnergy(silent) {
    const pieces = DW_ARMOR.map((bucket) => editorSlots.get(bucket))
      .filter((item) => item && item.energy && Number(item.energy.capacity) > 0);
    if (!pieces.length) {
      toast('Für diese Rüstung liegen keine Energiedaten vor.', 'info', 2600);
      return;
    }
    const slots = new Map();
    for (const item of pieces) {
      const bucket = Number(item.bucket);
      slots.set(bucket, {
        capacity: Number(item.energy.capacity),
        used: 0,
        sockets: generalSocketsFor(item).map((socket) => Number(socket.idx)),
        taken: new Set()
      });
    }
    const order = [...slots.keys()];
    let moved = 0;
    let unplaced = 0;
    for (const mod of editorMods.slice().sort((a, b) => (Number(b.e) || 0) - (Number(a.e) || 0))) {
      const cost = Number(mod.e) || 0;
      const preferred = Number(mod.sb) || 0;
      const candidates = preferred && slots.has(preferred) ? [preferred, ...order.filter((bucket) => bucket !== preferred)] : order;
      let placed = false;
      for (const bucket of candidates) {
        const slot = slots.get(bucket);
        if (slot.used + cost > slot.capacity) continue;
        const idx = slot.sockets.find((socketIdx) => !slot.taken.has(socketIdx));
        if (idx == null) continue;
        if (Number(mod.sb) !== bucket || Number(mod.si) !== idx) moved += 1;
        mod.sb = bucket;
        mod.si = idx;
        slot.taken.add(idx);
        slot.used += cost;
        placed = true;
        break;
      }
      if (!placed) {
        if (Number(mod.sb) !== 0) moved += 1;
        mod.sb = 0;
        mod.si = -1;
        unplaced += 1;
      }
    }
    renderDrawer();
    renderFooter();
    if (!silent) {
      toast(
        unplaced
          ? `${moved} Mod${moved === 1 ? '' : 's'} verschoben · ${unplaced} ohne freien Platz.`
          : moved
            ? `${moved} Mod${moved === 1 ? '' : 's'} verschoben – Energie passt jetzt.`
            : 'Energie passt bereits.',
        unplaced ? 'info' : 'success',
        3000
      );
    }
  }

  function dwEquippedDiff() {
    if (!editorCharId) return '';
    const equipped = equippedFor(editorCharId).filter((item) => isArmorBucket(Number(item.bucket)));
    if (!equipped.length) return '';
    const rows = DW_ARMOR.map((bucket) => {
      const chosen = editorSlots.get(bucket);
      const live = equipped.find((item) => Number(item.bucket) === bucket);
      if (!chosen && !live) return '';
      const label = (DIM.ARMOR_SLOTS.find((slot) => slot.key === bucket) || {}).label || 'Rüstung';
      const same = chosen && live && String(chosen.instanceId || chosen.hash) === String(live.instanceId || live.hash);
      const status = same ? 'gleich' : chosen && live ? 'anders' : chosen ? 'nur im Loadout' : 'nur angelegt';
      const tone = same ? 'ok' : chosen ? 'warn' : '';
      const name = chosen ? chosen.name : live ? live.name : '—';
      const liveName = !same && live ? ` <small>${esc(live.name)}</small>` : '';
      return `<div class="inv-dw-diff-row ${tone}"><span>${esc(label)}</span><strong>${esc(name)}</strong>${liveName}<em>${esc(status)}</em></div>`;
    }).join('');
    if (!rows) return '';
    return dwSection('Soll/Ist', '',
      `<div class="inv-dw-diff">${rows}</div>` +
      `<p class="inv-dw-hint">Vergleich mit der aktuell angelegten Rüstung · ${editorMods.length} Mods im Loadout.</p>`);
  }

  function dwArmorSection() {
    const tiles = DW_ARMOR.map((bucket) => {
      const item = editorSlots.get(bucket);
      const label = (DIM.ARMOR_SLOTS.find((s) => s.key === bucket) || {}).label || '';
      const mods = item && editorShowModPlacement ? dwArmorMods(item) : '';
      const energy = armorEnergy(item);
      const energyChip = energy
        ? '<span class="inv-dw-energy' + (energy.cost > energy.capacity ? ' over' : '') + '" title="Energie: ' +
          energy.cost + ' von ' + energy.capacity + ' belegt · Mod-Plätze: ' + energy.modSlots.used + '/' + energy.modSlots.total +
          (energy.unknown ? ' · ' + energy.unknown + ' Mod ohne Kostenangabe' : '') + '">⚡ ' +
          energy.cost + '/' + energy.capacity + ' · ' + energy.modSlots.used + '/' + energy.modSlots.total + '</span>'
        : '';
      return '<div class="inv-dw-armor-slot">' + dwSlotTile(bucket, label) + mods + energyChip + '</div>';
    }).join('');
    const hasAll = DW_ARMOR.every((b) => editorSlots.get(b) && editorSlots.get(b).instanceId);
    const actions =
      '<button type="button" class="btn ghost small" data-dw-mods-open>Mods wählen</button>' +
      '<button type="button" class="btn ghost small" data-dw-energy-fix>Energie ausgleichen</button>' +
      '<button type="button" class="btn ghost small" data-dw-optimize>' + (hasAll ? 'Rüstung optimieren' : 'Wähle Rüstung') + '</button>';
    return dwSection('Rüstung', actions,
      '<div class="inv-dw-row inv-dw-armor-row">' + tiles + '</div>' + dwStatsBar());
  }

  function dwGeneralSection() {
    const slots = [
      { key: DIM.B.GHOST, label: 'Geist' },
      { key: DIM.B.EMBLEMS, label: 'Emblem' },
      { key: DIM.B.SHIPS, label: 'Schiff' },
      { key: DIM.B.SPARROWS, label: 'Sparrow' }
    ];
    const actions = '<button type="button" class="btn ghost small" data-dw-fashion>Shader und Ornamente</button>';
    return dwSection('Allgemein', actions, '<div class="inv-dw-row">' + slots.map((s) => dwSlotTile(s.key, s.label)).join('') + '</div>');
  }

  function dwModsSection() {
    const tiles = editorMods.map((mod, i) =>
      '<div class="inv-dw-slotwrap"><div class="inv-dw-tile" role="button" tabindex="0" title="' + esc(mod.n) + '" data-dw-mod-edit="' + i + '"' +
      (mod.h ? ' data-dw-tip-plug="' + esc(String(mod.h)) + '"' : '') + '>' +
      (mod.i ? '<img src="' + bungieIcon(mod.i) + '" alt="">' : '<span class="inv-dw-plus">+</span>') +
      '<span class="inv-dw-tile-x" role="button" title="Entfernen" data-dw-mod-del="' + i + '">✕</span></div>' +
      '<span class="inv-dw-slotlabel">' + esc(mod.n) + '</span></div>').join('');
    const add = editorMods.length < 10
      ? '<div class="inv-dw-slotwrap"><div class="inv-dw-tile empty" role="button" tabindex="0" data-dw-mods-open title="Mod hinzufügen"><span class="inv-dw-plus">+</span></div><span class="inv-dw-slotlabel">Mod</span></div>'
      : '';
    const actions =
      '<button type="button" class="btn ghost small" data-dw-mod-placement>Mod-Platzierung ' + (editorShowModPlacement ? 'ausblenden' : 'anzeigen') + '</button>' +
      '<button type="button" class="btn ghost small" data-dw-mod-clear>Andere Mods entfernen</button>';
    const body = '<div class="inv-dw-row">' + tiles + add + '</div>' +
      '<p class="inv-dw-hint">Mods stecken erst beim Anlegen (' + editorMods.length + '/10) — sie verändern nichts sofort.</p>';
    return dwSection('Mods', actions, body);
  }

  function dwArtifactSection() {
    const backpack = ((data && data.backpack && data.backpack[editorCharId]) || []);
    const current = backpack.find((it) => Number(it.bucket) === DIM.B.ARTIFACT) ||
      equippedFor(editorCharId).find((it) => Number(it.bucket) === DIM.B.ARTIFACT) || null;
    const shown = editorArtifact || (current ? { hash: current.hash, name: current.name, icon: current.icon, rarity: current.rarity, instanceId: current.instanceId } : null);
    const tile = shown
      ? dwTileHtml(shown, 'Artefakt', { attr: 'data-dw-perks-open', noRemove: true })
      : '<div class="inv-dw-slotwrap"><div class="inv-dw-tile empty" role="button" tabindex="0" data-dw-artifact-take title="Artefakt übernehmen"><span class="inv-dw-plus">+</span></div><span class="inv-dw-slotlabel">Artefakt</span></div>';
    const perkTiles = editorPerks.map((perk, i) =>
      '<div class="inv-dw-slotwrap"><div class="inv-dw-tile" role="button" tabindex="0" title="' + esc(perk.n) + '" data-dw-perk-edit="' + i + '"' +
      (perk.h ? ' data-dw-tip-plug="' + esc(String(perk.h)) + '"' : '') + '>' +
      (perk.i ? '<img src="' + bungieIcon(perk.i) + '" alt="">' : '<span class="inv-dw-plus">+</span>') +
      '<span class="inv-dw-tile-x" role="button" title="Entfernen" data-dw-perk-del="' + i + '">✕</span></div>' +
      '<span class="inv-dw-slotlabel">' + esc(perk.n) + '</span></div>').join('');
    const add = '<div class="inv-dw-slotwrap"><div class="inv-dw-tile empty" role="button" tabindex="0" data-dw-perks-open title="Artefakt-Perk hinzufügen"><span class="inv-dw-plus">+</span></div><span class="inv-dw-slotlabel">Perk</span></div>';
    const actions =
      '<button type="button" class="btn ghost small" data-dw-perks-open>Perks wählen</button>' +
      '<button type="button" class="btn ghost small" data-dw-artifact-take>Vom Artefakt übernehmen</button>';
    return dwSection('Artefakt', actions,
      '<div class="inv-dw-row">' + tile + perkTiles + add + '</div>' +
      '<p class="inv-dw-hint">Artefakt-Perks werden dokumentiert (' + editorPerks.length + '/8) — die Freischaltung passiert im Spiel.</p>');
  }

  let drawerScrollRestoreId = 0;
  let drawerPendingScroll = null;
  function renderDrawer() {
    if (!drawerBodyEl || !data) return;
    const domScrollTop = drawerBodyEl.scrollTop;
    const scroll = (drawerPendingScroll && domScrollTop === 0 && drawerPendingScroll.top > 0) ? drawerPendingScroll.top : domScrollTop;
    drawerBodyEl.innerHTML =
      dwFocusSection() + dwWeaponsSection() + dwArmorSection() + dwEquippedDiff() + dwGeneralSection() + dwModsSection() + dwArtifactSection() +
      '<div class="inv-dw-inputgroup">' +
      '<button type="button" class="btn ghost small" data-dw-fill="equipped">＋ Mit Ausgerüstetem auffüllen</button>' +
      '<button type="button" class="btn ghost small" data-dw-fill="inventory">＋ Mit Nicht-Ausgerüstetem auffüllen</button>' +
      '<button type="button" class="btn ghost small" data-dw-random>🎲 Zufällig generieren</button>' +
      '<label class="inv-dw-check"><input type="checkbox" data-dw-anyclass' + (editorAnyClass ? ' checked' : '') + '> Jede Klasse</label>' +
      '</div>';
    const restoreId = ++drawerScrollRestoreId;
    drawerPendingScroll = { top: scroll, id: restoreId };
    const applyScroll = (last) => {
      if (!drawerPendingScroll || drawerPendingScroll.id !== restoreId) return;
      void drawerBodyEl.scrollHeight;
      drawerBodyEl.scrollTop = scroll;
      if (last) drawerPendingScroll = null;
    };
    applyScroll(false);
    if (Math.abs(drawerBodyEl.scrollTop - scroll) <= 2) {
      drawerPendingScroll = null;
    } else {
      requestAnimationFrame(() => {
        applyScroll(false);
        requestAnimationFrame(() => {
          applyScroll(false);
          requestAnimationFrame(() => applyScroll(true));
        });
      });
    }
    renderFooter();
  }

  function editorAvailability() {
    const missingItems = [];
    const missingMods = [];
    const energyOver = [];
    for (const item of editorSlots.values()) {
      if (!item) continue;
      const key = String(item.instanceId || item.hash || '');
      if (!key) continue;
      if (!findItemByKey(key)) missingItems.push(item.name || key);
      const energy = armorEnergy(item);
      if (energy && energy.cost > energy.capacity) energyOver.push(`${item.name || 'Rüstung'} ${energy.cost}/${energy.capacity}`);
    }
    for (const mod of editorMods) {
      const hash = Number(mod && (mod.h || mod.hash)) || 0;
      if (!mod.n && (!hash || !findPlugInfo(hash))) missingMods.push(hash || 'Mod');
    }
    return { missingItems, missingMods, energyOver };
  }

  function renderFooter() {
    if (!drawerRoot) return;
    const foot = drawerRoot.querySelector('.inv-dw-foot');
    if (!foot) return;
    const isEditing = Boolean(editorLoadoutId);
    const count = editorSlots.size;
    const availability = editorAvailability();
    const missingCount = availability.missingItems.length + availability.missingMods.length;
    const energyCount = availability.energyOver.length;
    const statusTone = missingCount || energyCount ? 'warn' : 'ok';
    const statusText = missingCount
      ? '⚠ ' + missingCount + ' fehlt'
      : energyCount
        ? '⚠ Energie ' + energyCount
        : '✓ anwendbar';
    foot.innerHTML =
      '<button type="button" class="btn primary small" data-dw-save>' + (isEditing ? 'Loadout aktualisieren' : 'Loadout speichern') + '</button>' +
      '<button type="button" class="btn ghost small" data-dw-apply>Anlegen</button>' +
      (isEditing ? '<button type="button" class="btn ghost small" data-dw-delete>Löschen</button>' : '') +
      '<button type="button" class="btn ghost small" data-dw-check>Prüfen</button>' +
      '<span style="flex:1"></span>' +
      '<span class="inv-dw-foot-check ' + statusTone + '">' + statusText + '</span>' +
      '<span class="inv-dw-foot-hint">' + count + ' Items · ' + editorMods.length + ' Mods · ' + editorPerks.length + ' Perks</span>' +
      '<button type="button" class="btn ghost small" data-dw-clear>Leeren</button>';
  }


  // ---------- Die Auswahl-Sheets (DIM Sheet-Stack) ----------

  function slotPool() {
    const seen = new Set();
    return allItemsPool()
      .filter((it) => Number(it.bucket) === pickBucket)
      .filter((it) => {
        const key = it.instanceId || String(it.hash);
        if (seen.has(key)) return false;
        seen.add(key);
        if (Number(pickBucket) === DIM.B.SUBCLASS) {
          // Subklassen sind klassenbindend – immer die oben gewählte
          // Klasse verwenden, auch bei „Jede Klasse“. In der Definition
          // steht oft classType 3; dann zählt der Besitzer.
          const ch = editorChar();
          const cls = ch ? Number(ch.classType) : 3;
          let itemClass = Number(it.classType);
          if (![0, 1, 2].includes(itemClass)) itemClass = classOfOwnedInstance(it.instanceId);
          if (cls !== 3 && [0, 1, 2].includes(itemClass) && itemClass !== cls) return false;
        } else if (!classMatches(it)) return false;
        if (!editorPickerQuery) return true;
        return (String(it.name || '') + ' ' + String(it.typeName || '')).toLowerCase().includes(editorPickerQuery);
      })
      .sort((a, b) => (Number(b.power) || 0) - (Number(a.power) || 0));
  }

  function modPool() {
    const pool = [];
    const seen = new Set();
    const add = (p) => {
      if (p && p.h && !seen.has(String(p.h))) { seen.add(String(p.h)); pool.push(p); }
    };
    if (pickSubIdx >= 0 && pickBucket) {
      const armor = editorSlots.get(pickBucket);
      const sock = armor ? modSocketsFor(armor).find((s) => Number(s.idx) === Number(pickSubIdx)) : null;
      for (const p of (sock ? sock.plugs || [] : [])) add(p);
    } else {
      // Nur Rüstungsteile: Artefakt-Perks sind keine Rüstungs-Mods,
      // sie werden im Artefakt-Bereich gewählt.
      const targets = new Set([...DW_ARMOR]);
      for (const it of allItemsPool()) {
        if (!targets.has(Number(it.bucket))) continue;
        for (const sock of modSocketsFor(it)) for (const p of (sock.plugs || [])) add(p);
      }
    }
    return pool.filter((p) => {
      const cat = String(p.p || '');
      if (/ornament|shader|render|skin/i.test(cat)) return false;
      if (!isModPlug(p)) return false;
      if (!editorPickerQuery) return true;
      return (String(p.n || '') + ' ' + cat + ' ' + String(p.d || '')).toLowerCase().includes(editorPickerQuery);
    });
  }

  function perkPool() {
    const pool = [];
    const seen = new Set();
    const sources = [
      ...((data && data.backpack && data.backpack[editorCharId]) || []),
      ...equippedFor(editorCharId),
      ...((data && data.vault) || [])
    ];
    for (const it of sources) {
      if (Number(it.bucket) !== DIM.B.ARTIFACT) continue;
      for (const sock of socketPlugsFor(it)) {
        for (const p of (sock.plugs || [])) {
          if (!p || !p.h || seen.has(String(p.h))) continue;
          seen.add(String(p.h));
          pool.push(p);
        }
      }
    }
    return pool.filter((p) => {
      if (!editorPickerQuery) return true;
      return (String(p.n || '') + ' ' + String(p.d || '')).toLowerCase().includes(editorPickerQuery);
    });
  }

  function subPool() {
    const sub = editorSlots.get(DIM.B.SUBCLASS);
    const socks = sub ? socketPlugsFor(sub) : [];
    const sock = socks.find((s) => Number(s.idx) === Number(pickSubIdx));
    const used = new Set();
    for (const other of socks) {
      if (Number(other.idx) === Number(pickSubIdx)) continue;
      const eff = effectiveSubPlug(other);
      if (eff && eff.hash) used.add(String(eff.hash));
    }
    return (sock ? sock.plugs || [] : [])
      .filter((p) => p && p.h)
      .filter((p) => !editorPickerQuery || ((String(p.n || '') + ' ' + String(p.p || '')).toLowerCase().includes(editorPickerQuery)))
      .map((p) => ({ ...p, inUse: used.has(String(p.h)) }));
  }

  function itemPickHtml(it) {
    const rarity = Number(it.rarity) || 5;
    const tip = it.instanceId ? ' data-dw-tip-item="' + esc(String(it.instanceId)) + '"'
      : (it.hash ? ' data-dw-tip-itemhash="' + esc(String(it.hash)) + '"' : '');
    return '<button type="button" class="inv-dw-pick" data-dw-pick="' + esc(it.instanceId || String(it.hash)) + '"' + tip + '>' +
      (it.icon ? '<img src="' + bungieIcon(it.icon) + '" style="background:' + (DIM.RARITY_BG[rarity] || '#522f65') + '" alt="">' : '<span class="inv-dw-pick-noicon">?</span>') +
      '<span class="inv-dw-pick-text"><span class="inv-dw-pick-name">' + esc(it.name || '') + '</span>' +
      '<span class="inv-dw-pick-sub">' + esc(it.typeName || '') + (it.power ? ' · ✦' + esc(String(it.power)) : '') + '</span></span></button>';
  }

  function plugPickHtml(p, attrName, selected, disabled) {
    return '<button type="button" class="inv-dw-pick' + (selected ? ' on' : '') + '"' + (disabled ? ' disabled' : '') + ' ' +
      attrName + '="' + p.h + '" data-dw-tip-plug="' + esc(String(p.h)) + '" data-dw-name="' + esc(p.n || '') + '" data-dw-icon="' + esc(p.i || '') +
      '" data-dw-cat="' + esc(p.p || '') + '" data-dw-desc="' + esc(p.d || '') + '">' +
      (p.i ? '<img src="' + bungieIcon(p.i) + '" alt="">' : '') +
      '<span class="inv-dw-pick-text"><span class="inv-dw-pick-name">' + esc(p.n || 'Plug') + '</span>' +
      '<span class="inv-dw-pick-sub">' + esc(prettyCategory(p.p || '')) + (selected ? ' · gewählt' : '') +
      (p.inUse && !selected ? ' · belegt' : '') + '</span></span></button>';
  }

  function sheetListHtml() {
    if (pickKind === 'slot') {
      const list = slotPool();
      return list.length ? list.map(itemPickHtml).join('') : '<p class="inv-dw-hint">Keine passenden Gegenstände gefunden.</p>';
    }
    if (pickKind === 'mod') {
      const list = modPool();
      const selectedFor = (hash) => pickSubIdx >= 0
        ? editorMods.some((m) => Number(m.sb) === Number(pickBucket) && Number(m.si) === Number(pickSubIdx) && Number(m.h) === Number(hash))
        : editorMods.some((m) => Number(m.sb) <= 0 && Number(m.h) === Number(hash));
      return list.length ? list.map((p) => plugPickHtml(p, 'data-dw-pickmod="' + p.h + '"', selectedFor(p.h))).join('') : '<p class="inv-dw-hint">Keine passenden Mods gefunden.</p>';
    }
    if (pickKind === 'perk') {
      const list = perkPool();
      return list.length ? list.map((p) => plugPickHtml(p, 'data-dw-pickperk="' + p.h + '"', editorPerks.some((m) => Number(m.h) === Number(p.h)))).join('') : '<p class="inv-dw-hint">Keine passenden Artefakt-Perks gefunden.</p>';
    }
    if (pickKind === 'sub') {
      const list = subPool();
      const live = effectiveSubPlug({ idx: pickSubIdx });
      return list.length ? list.map((p) => plugPickHtml(p, 'data-dw-picksub="' + p.h + '"', Boolean(live && String(live.hash) === String(p.h)), Boolean(p.inUse && !(live && String(live.hash) === String(p.h))))).join('') : '<p class="inv-dw-hint">Keine steckbaren Plugs für diesen Socket.</p>';
    }
    return '';
  }

  function sheetTitle() {
    if (pickKind === 'slot') return ((EDITOR_SLOTS.find((s) => s.key === pickBucket) || {}).label || 'Gegenstand') + ' wählen';
    if (pickKind === 'mod') return pickSubIdx >= 0 ? ('Mod wählen — ' + (pickSocketLabel || 'Rüstung')) : 'Wähle deine Mods';
    if (pickKind === 'perk') return 'Artefakt-Perks wählen';
    if (pickKind === 'sub') {
      const sub = editorSlots.get(DIM.B.SUBCLASS);
      const sock = sub ? socketPlugsFor(sub).find((s) => Number(s.idx) === Number(pickSubIdx)) : null;
      return sock ? subSocketLabel(sock, effectiveSubPlug(sock)) + ' wählen' : 'Fokus anpassen';
    }
    if (pickKind === 'optimizer') return 'Loadout-Optimierer';
    if (pickKind === 'fashion') return 'Shader und Ornamente auswählen';
    return '';
  }

  function optimizerSheetHtml() {
    const STAT_DEFS = DIM.CHAR_STAT_HASHES.map((h) => ({ h, label: DIM.STAT_LABELS[h] }));
    const inputs = STAT_DEFS.map((st) => {
      const val = optimizerWeights[String(st.h)] != null ? optimizerWeights[String(st.h)] : 1;
      return '<label class="inv-dw-optrow"><span>' + esc(st.label) + '</span>' +
        '<input type="range" min="0" max="5" step="1" value="' + val + '" data-dw-opt-weight="' + st.h + '">' +
        '<span class="inv-dw-optval" data-dw-opt-val="' + st.h + '">' + val + '</span></label>';
    }).join('');
    const minInputs = STAT_DEFS.map((st) => {
      const val = Number(optimizerMins[String(st.h)]) || 0;
      return '<label class="inv-dw-optrow"><span>Min. ' + esc(st.label) + '</span>' +
        '<input type="number" min="0" max="200" step="5" value="' + val + '" data-dw-opt-min="' + st.h + '">' +
        '<span class="inv-dw-optval"></span></label>';
    }).join('');
    const meter = (value) => {
      const n = Math.max(0, Math.min(200, Math.round(Number(value) || 0)));
      return '<span class="inv-stat-meter" role="progressbar" aria-valuemin="0" aria-valuemax="200" aria-valuenow="' + n + '" aria-label="' + n + ' von 200" title="' + n + '/200"><i class="base" style="width:' + ((n / 200) * 100) + '%"></i></span>';
    };
    let result = '';
    if (optimizerResult) {
      const r = optimizerResult;
      result = '<div class="inv-dw-opt-result">' +
        '<div class="inv-dw-optset">' + r.slots.map((slot) =>
          dwTileHtml(slot.item, (DIM.ARMOR_SLOTS.find((s) => s.key === slot.bucket) || {}).label || '', { noRemove: true })).join('') + '</div>' +
        '<p class="inv-dw-hint">Basis-Rüstung ohne Mods · Charakterwerte 0–200 (DIM).</p>' +
        '<div class="inv-dw-statbar">' + STAT_DEFS.map((st) => {
          const value = r.totals[String(st.h)] || 0;
          return '<span class="inv-dw-stat"><span>' + esc(st.label.slice(0, 3)) + '</span><b>' + value + '</b>' + meter(value) + '</span>';
        }).join('') + '</div>' +
        '<div class="inv-dw-opt-actions"><button type="button" class="btn primary small" data-dw-opt-apply>In den Editor übernehmen</button></div></div>';
    }
    return '<div class="inv-dw-opt">' +
      '<p class="inv-dw-hint">Stat-Prioritäten setzen (0–5). Der Optimierer kombiniert deine Rüstung — maximal ein Exotisch.</p>' +
      '<div class="inv-dw-presets">' +
      [['balanced', 'Ausgewogen'], ['tank', 'Panzer'], ['grenade', 'Granaten'], ['melee', 'Nahkampf'], ['super', 'Super'], ['raid', 'Raid']]
        .map((entry) => '<button type="button" class="btn ghost small" data-dw-opt-preset="' + entry[0] + '">' + entry[1] + '</button>').join('') +
      '</div>' +
      '<div class="inv-dw-optweights">' + inputs + '</div>' +
      '<p class="inv-dw-hint">Mindestwerte pro Stat (0–200, 0 = aus). Kombinationen darunter werden verworfen.</p>' +
      '<div class="inv-dw-optweights">' + minInputs + '</div>' +
      '<label class="inv-dw-check"><input type="checkbox" data-dw-opt-lock' + (optimizerLockArmor ? ' checked' : '') + '> Gewählte Rüstungen fixieren</label>' +
      '<div class="inv-dw-opt-actions"><button type="button" class="btn primary small" data-dw-opt-run>⚡ Optimieren</button>' +
      '<button type="button" class="btn ghost small" data-dw-sheet-close>Abbrechen</button></div>' +
      result + '</div>';
  }

  function fashionFromItem(item) {
    if (!item) return { shader: null, ornament: null };
    const shader = (item.perks || []).find((p) => /shader/i.test(String(p.p || '')));
    const ornament = (item.perks || []).find((p) => /ornament|skin/i.test(String(p.p || '')));
    return {
      shader: shader ? { hash: shader.hash, n: shader.n, i: shader.i } : null,
      ornament: ornament ? { hash: ornament.hash, n: ornament.n, i: ornament.i } : null
    };
  }

  function fashionSheetHtml() {
    const rows = DW_ARMOR.map((bucket) => {
      const item = editorSlots.get(bucket);
      const label = (DIM.ARMOR_SLOTS.find((s) => s.key === bucket) || {}).label || '';
      const cur = editorFashion[String(bucket)] || fashionFromItem(item);
      const plug = (which) => {
        const entry = cur[which];
        return '<div class="inv-dw-fashion-plug' + (entry ? '' : ' empty') + '" title="' + esc(entry ? entry.n : 'Nicht gesetzt') + '">' +
          (entry && entry.i ? '<img src="' + bungieIcon(entry.i) + '" alt="">' : '<span class="inv-dw-plus">+</span>') +
          '<span class="inv-dw-fashion-plugname">' + esc(entry ? entry.n : (which === 'shader' ? 'Shader' : 'Ornament')) + '</span></div>';
      };
      return '<div class="inv-dw-fashion-row">' +
        '<span class="inv-dw-fashion-label">' + esc(label) + '</span>' +
        (item && item.icon ? '<img class="inv-dw-fashion-armor" src="' + bungieIcon(item.icon) + '" style="background:' + (DIM.RARITY_BG[Number(item.rarity) || 5] || '#522f65') + '" alt="">' : '<span class="inv-dw-fashion-armor empty"></span>') +
        plug('shader') + plug('ornament') + '</div>';
    }).join('');
    return rows +
      '<p class="inv-dw-hint">Die Kosmetik wird im Loadout dokumentiert und beim Anlegen nicht erzwungen — Shader und Ornamente lassen sich in Destiny nicht über die API wechseln.</p>' +
      '<div class="inv-dw-opt-actions"><button type="button" class="btn primary small" data-dw-fashion-save>Kosmetik speichern</button>' +
      '<button type="button" class="btn ghost small" data-dw-sheet-close>Abbrechen</button></div>';
  }

  function renderSheet() {
    if (!drawerSheetEl) return;
    if (!pickKind) {
      drawerSheetEl.classList.add('hidden');
      drawerSheetEl.innerHTML = '';
      return;
    }
    if (drawerSheetEl.classList.contains('hidden')) pickerReturnFocus = document.activeElement;
    drawerSheetEl.classList.remove('hidden');
    let body = '';
    let foot = '';
    if (pickKind === 'optimizer') {
      body = optimizerSheetHtml();
    } else if (pickKind === 'fashion') {
      body = fashionSheetHtml();
    } else {
      body = '<input class="inv-dw-search" type="search" placeholder="Suchen …" value="' + esc(editorPickerQuery) + '">' +
        '<div class="inv-dw-picker" id="invDwPickerList">' + sheetListHtml() + '</div>';
      if (pickKind === 'mod') foot = '<button type="button" class="btn primary small" data-dw-sheet-close>Fertig</button>';
    }
    drawerSheetEl.innerHTML = '<div class="inv-dw-sheet-inner">' +
      '<div class="inv-dw-sheet-head"><strong>' + esc(sheetTitle()) + '</strong><span style="flex:1"></span>' +
      '<button type="button" class="btn ghost small" data-dw-sheet-close title="Schließen">✕</button></div>' +
      '<div class="inv-dw-sheet-body">' + body + '</div>' +
      (foot ? '<div class="inv-dw-sheet-foot">' + foot + '</div>' : '') +
      '</div>';
    if (!drawerSheetEl.contains(document.activeElement)) {
      setTimeout(() => {
        const target = drawerSheetEl.querySelector('.inv-dw-search, [data-dw-pick], [data-dw-pickmod], [data-dw-picksub], [data-dw-pickperk], button');
        if (target) target.focus();
      }, 30);
    }
  }

  function closeSheet() {
    pickKind = '';
    pickBucket = 0;
    pickSubIdx = -1;
    pickSocketLabel = '';
    editorPickerQuery = '';
    optimizerResult = null;
    renderSheet();
    renderDrawer();
    const returnTo = pickerReturnFocus;
    pickerReturnFocus = null;
    if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
      setTimeout(() => returnTo.focus(), 30);
    }
  }

  function openSlotPicker(bucket) {
    pickKind = 'slot';
    pickBucket = Number(bucket) || 0;
    pickSubIdx = -1;
    editorPickerQuery = '';
    renderSheet();
  }


  // ---------- Loadout-Optimierer (DIM LoadoutOptimizer, vereinfacht) ----------

  function computeOptimizerResult() {
    if (!data) return null;
    const char = editorChar();
    if (!char) return null;
    const pool = allItemsPool();
    const seen = new Set();
    const byBucket = new Map();
    for (const item of pool) {
      const bucket = Math.round(Number(item.bucket) || 0);
      if (!DW_ARMOR.includes(bucket)) continue;
      const key = item.instanceId || String(item.hash);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!classMatches(item)) continue;
      if (!Array.isArray(item.stats) || !item.stats.length) continue;
      const stats = item.stats.filter((s) => DIM.CHAR_STAT_HASHES.includes(Number(s.hash)));
      if (!stats.length) continue;
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(item);
    }
    const slots = DW_ARMOR.map((bucket) => {
      const candidates = (byBucket.get(bucket) || []).map((item) => {
        let score = 0;
        for (const stat of item.stats) {
          const w = optimizerWeights[String(stat.hash)] != null ? optimizerWeights[String(stat.hash)] : 1;
          score += Math.round(Number(stat.value) || 0) * (1 + w);
        }
        return { item, score };
      });
      candidates.sort((a, b) => b.score - a.score);
      const locked = optimizerLockArmor ? editorSlots.get(bucket) : null;
      return { bucket, candidates: candidates.slice(0, 12), locked: locked && locked.stats ? locked : null };
    });
    if (slots.some((s) => !s.locked && !s.candidates.length)) return null;

    const STAT_HASHES = DIM.CHAR_STAT_HASHES.map(String);
    const totalsOf = (items) => {
      const totals = {};
      for (const it of items) {
        for (const stat of (it.stats || [])) {
          const h = String(stat.hash);
          if (!STAT_HASHES.includes(h)) continue;
          totals[h] = (totals[h] || 0) + Math.round(Number(stat.value) || 0);
        }
      }
      return totals;
    };
    const scoreOf = (totals) => {
      let score = 0;
      for (const h of Object.keys(totals)) {
        const w = optimizerWeights[h] != null ? optimizerWeights[h] : 1;
        score += totals[h] * (1 + w);
      }
      return score;
    };

    const best = { score: -1, items: null };
    const rec = (depth, chosen, exoticCount) => {
      if (depth === slots.length) {
        const items = chosen.map((c) => c.item);
        const totals = totalsOf(items);
        const meetsMinimums = Object.entries(optimizerMins).every(([hash, minimum]) => (totals[hash] || 0) >= minimum);
        if (!meetsMinimums) return;
        const score = scoreOf(totals);
        if (score > best.score) { best.score = score; best.items = items; }
        return;
      }
      const slot = slots[depth];
      const options = slot.locked ? [{ item: slot.locked }] : slot.candidates;
      for (const cand of options) {
        const isExotic = Number(cand.item.rarity) === 6;
        if (isExotic && exoticCount >= 1) continue;
        rec(depth + 1, chosen.concat([cand]), exoticCount + (isExotic ? 1 : 0));
      }
    };
    rec(0, [], 0);
    if (!best.items) return null;
    const totals = totalsOf(best.items);
    return {
      slots: DW_ARMOR.map((bucket, i) => ({ bucket, item: best.items[i] })),
      totals,
      score: scoreOf(totals)
    };
  }

  function applyOptimizer() {
    if (!optimizerResult) return;
    for (const slot of optimizerResult.slots) if (slot.item) editorSlots.set(slot.bucket, slot.item);
    optimizerResult = null;
    closeSheet();
    toast('Optimiertes Set in den Editor übernommen.', 'success', 2200);
  }

  function runOptimizer() {
    const inputs = drawerSheetEl.querySelectorAll('[data-dw-opt-weight]');
    for (const input of inputs) {
      optimizerWeights[String(input.dataset.dwOptWeight)] = Math.max(0, Math.min(5, Math.round(Number(input.value) || 0)));
    }
    for (const input of drawerSheetEl.querySelectorAll('[data-dw-opt-min]')) {
      const hash = String(input.dataset.dwOptMin || '');
      const value = Math.max(0, Math.min(200, Math.round(Number(input.value) || 0)));
      if (value > 0) optimizerMins[hash] = value;
      else delete optimizerMins[hash];
    }
    const lock = drawerSheetEl.querySelector('[data-dw-opt-lock]');
    optimizerLockArmor = Boolean(lock && lock.checked);
    optimizerResult = computeOptimizerResult();
    renderSheet();
    if (!optimizerResult) {
      toast(
        Object.keys(optimizerMins).length
          ? 'Keine Rüstungskombination erfüllt die Mindestwerte – Werte senken oder Fixierung lösen.'
          : 'Keine passende Rüstung gefunden — bitte Inventar prüfen.',
        'warning',
        3000
      );
    }
  }

  const OPT_PRESETS = {
    balanced: { 2996146975: 1, 392767087: 1, 1943323491: 1, 1735777505: 1, 144602215: 1, 4244567218: 1 },
    tank: { 2996146975: 1, 392767087: 4, 1943323491: 4, 1735777505: 0, 144602215: 1, 4244567218: 1 },
    grenade: { 2996146975: 1, 392767087: 2, 1943323491: 2, 1735777505: 4, 144602215: 2, 4244567218: 0 },
    melee: { 2996146975: 1, 392767087: 2, 1943323491: 2, 1735777505: 0, 144602215: 1, 4244567218: 4 },
    super: { 2996146975: 1, 392767087: 2, 1943323491: 2, 1735777505: 1, 144602215: 4, 4244567218: 1 },
    raid: { 2996146975: 0, 392767087: 3, 1943323491: 3, 1735777505: 3, 144602215: 2, 4244567218: 0 }
  };

  // ---------- Drawer-DOM ----------

  function ensureEditor() {
    if (drawerRoot) return;
    editorTab.innerHTML =
      '<div class="inv-dw-page">' +
      '<div class="inv-dw-page-head"><div><h3>Loadouts</h3>' +
      '<p>Erstelle Builds wie in DIM — Fokus, Waffen, Rüstung, Mods und Artefakt.</p></div>' +
      '<div class="inv-dw-page-actions">' +
      '<button type="button" class="btn ghost small" data-ed-export title="Alle Loadouts als JSON in die Zwischenablage kopieren">Exportieren</button>' +
      '<button type="button" class="btn ghost small" data-ed-import-file title="Loadouts aus einer JSON-Datei importieren">Datei importieren…</button>' +
      '<button type="button" class="btn ghost small" data-ed-import-link title="DIM-Link (dim.gg) oder Loadout-URL importieren">DIM-Link…</button>' +
      '<button type="button" class="btn primary small" data-ed-new>＋ Neuer Loadout</button></div></div>' +
      '<div class="inv-dw-page-list"></div>' +
      '<div class="inv-ed-ingame" id="editorIngame"></div></div>';

    loadoutFileInput = document.createElement('input');
    loadoutFileInput.type = 'file';
    loadoutFileInput.accept = '.json,application/json';
    loadoutFileInput.hidden = true;
    loadoutFileInput.addEventListener('change', () => {
      const file = loadoutFileInput.files && loadoutFileInput.files[0];
      loadoutFileInput.value = '';
      importLoadoutFile(file);
    });
    editorTab.appendChild(loadoutFileInput);

    drawerRoot = document.createElement('div');
    drawerRoot.className = 'inv-dw-backdrop hidden';
    drawerRoot.innerHTML =
      '<div class="inv-dw" role="dialog" aria-label="Loadout-Editor">' +
      '<div class="inv-dw-head">' +
      '<div class="inv-dw-title">' +
      '<input class="inv-dw-name" type="text" maxlength="30" placeholder="Loadout-Name" aria-label="Loadout-Name">' +
      '<details class="inv-dw-notes"><summary>Notizen</summary>' +
      '<textarea maxlength="2048" placeholder="Notizen zu diesem Loadout …"></textarea></details>' +
      '</div>' +
      '<div class="inv-dw-head-right">' +
      '<select class="inv-dw-char" aria-label="Ziel-Charakter"></select>' +
      '<button type="button" class="btn ghost small" data-dw-close title="Schließen">✕</button>' +
      '</div></div>' +
      '<div class="inv-dw-body"></div>' +
      '<div class="inv-dw-foot"></div>' +
      '<div class="inv-dw-sheet hidden"></div>' +
      '</div>';
    document.body.appendChild(drawerRoot);
    drawerBodyEl = drawerRoot.querySelector('.inv-dw-body');
    drawerSheetEl = drawerRoot.querySelector('.inv-dw-sheet');
    drawerNameEl = drawerRoot.querySelector('.inv-dw-name');
    drawerNotesEl = drawerRoot.querySelector('.inv-dw-notes textarea');
    drawerCharEl = drawerRoot.querySelector('.inv-dw-char');

    drawerRoot.addEventListener('click', onDrawerClick);
    drawerRoot.addEventListener('input', onDrawerInput);
    drawerRoot.addEventListener('change', onDrawerChange);
    // Hover-Overlay mit Werten und Perks (DIM ItemTooltip).
    drawerRoot.addEventListener('mouseover', onDrawerTipOver);
    drawerRoot.addEventListener('mouseout', onDrawerTipOut);
    drawerRoot.addEventListener('scroll', hideTooltip, true);
    drawerRoot.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (pickKind) closeSheet(); else closeEditor();
    });
    // Escape auch dann, wenn der Fokus außerhalb des Drawers liegt.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !drawerRoot || drawerRoot.classList.contains('hidden')) return;
      event.stopPropagation();
      if (pickKind) closeSheet(); else closeEditor();
    });
    editorTab.addEventListener('click', onPageClick);
  editorTab.addEventListener('input', (event) => {
    const search = event.target.closest('[data-loadout-search]');
    if (!search) return;
    loadoutQuery = String(search.value || '');
    const caret = Number(search.selectionStart) || 0;
    renderEditorTab();
    const next = editorTab.querySelector('[data-loadout-search]');
    if (next) {
      next.focus();
      try { next.setSelectionRange(caret, caret); } catch (error) { /* egal */ }
    }
  });
  editorTab.addEventListener('change', (event) => {
    const select = event.target.closest('[data-loadout-setfolder]');
    if (!select) return;
    const id = String(select.dataset.loadoutSetfolder || '');
    const folder = String(select.value || '');
    setConfig({ bungie: { loadouts: getLoadoutList().map((entry) => entry.id === id ? { ...entry, folder } : entry) } });
    renderEditorTab();
  });
  }

  function onPageClick(event) {
    const target = event.target;
    if (target.closest('[data-ed-new]')) { openEditor(''); return; }
  if (target.closest('[data-ed-export]')) { exportLoadouts(); return; }
  if (target.closest('[data-ed-import-file]')) {
    if (loadoutFileInput) {
      loadoutFileInput.value = '';
      loadoutFileInput.click();
    }
    return;
  }
  if (target.closest('[data-ed-import-link]')) { importLoadoutFromLink(); return; }
    if (target.closest('[data-ed-ingame-refresh]')) { loadIngameLoadouts(true); return; }
    const ingameApply = target.closest('[data-ed-ingame-apply]');
    if (ingameApply) {
      const [characterId, index] = String(ingameApply.dataset.edIngameApply || '').split(':');
      applyIngameLoadout(characterId, Number(index) || 0);
      return;
    }
    const ingameImport = target.closest('[data-ed-ingame-import]');
    if (ingameImport) {
      const [characterId, index] = String(ingameImport.dataset.edIngameImport || '').split(':');
      importIngameLoadout(characterId, Number(index) || 0);
      return;
    }
    const edit = target.closest('[data-loadout-edit]');
    if (edit) { openEditor(String(edit.dataset.loadoutEdit || '')); return; }
    const folderFilter = target.closest('[data-loadout-folder-filter]');
    if (folderFilter) {
      loadoutFolderFilter = String(folderFilter.dataset.loadoutFolderFilter || '');
      renderEditorTab();
      return;
    }
    const folderAdd = target.closest('[data-loadout-folder-add]');
    if (folderAdd) {
      const input = editorTab.querySelector('[data-loadout-folder-name]');
      const name = String((input && input.value) || '').trim().slice(0, 24);
      if (!name) return;
      const folders = loadoutFolders();
      if (!folders.some((folder) => folder.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) {
        setConfig({ bungie: { loadoutFolders: folders.concat([{ id: 'lf-' + Date.now().toString(36), name }]) } });
      }
      renderEditorTab();
      return;
    }
    if (target.closest('[data-loadout-compare]')) { openLoadoutCompare(); return; }
    const tagSuggest = target.closest('[data-loadout-tag-suggest]');
    if (tagSuggest) {
      const [id, key] = String(tagSuggest.dataset.loadoutTagSuggest || '').split(':');
      if (!id || !key) return;
      setConfig({ bungie: { loadouts: getLoadoutList().map((entry) => entry.id === id ? { ...entry, tags: [key] } : entry) } });
      renderEditorTab();
      return;
    }
    const checklistButton = target.closest('[data-loadout-checklist]');
    if (checklistButton) {
      openLoadoutChecklist(String(checklistButton.dataset.loadoutChecklist || ''));
      return;
    }
    const healthButton = target.closest('[data-loadout-health]');
    if (healthButton) {
      const loadout = getLoadoutList().find((entry) => entry.id === String(healthButton.dataset.loadoutHealth || ''));
      if (loadout) openHealthModal(loadout);
      return;
    }
    const versionsButton = target.closest('[data-loadout-versions]');
    if (versionsButton) {
      const loadout = getLoadoutList().find((entry) => entry.id === String(versionsButton.dataset.loadoutVersions || ''));
      if (loadout) openLoadoutVersions(loadout);
      return;
    }
    const shareLoadout = target.closest('[data-loadout-share]');
    if (shareLoadout) {
      const id = String(shareLoadout.dataset.loadoutShare || '');
      const loadout = getLoadoutList().find((entry) => entry.id === id);
      if (!loadout) return;
      const payload = {
        name: loadout.name || 'Loadout',
        classType: loadout.classType,
        items: (loadout.items || []).filter((item) => item.instanceId || item.hash).map((item) => ({
          id: item.instanceId || '',
          hash: Number(item.hash) || 0
        })),
        parameters: { mods: (loadout.mods || []).map((mod) => Number(mod.h)).filter(Boolean) }
      };
      const link = 'https://app.destinyitemmanager.com/loadouts?loadout=' + encodeURIComponent(JSON.stringify(payload));
      const copy = api && typeof api.copyToClipboard === 'function'
        ? api.copyToClipboard(link)
        : (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject(new Error('Zwischenablage nicht verfügbar')));
      Promise.resolve(copy).then(() => toast('Loadout-Link kopiert.', 'success', 2200)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2200));
      return;
    }
    const deepLink = target.closest('[data-loadout-deeplink]');
    if (deepLink) {
      const loadout = getLoadoutList().find((entry) => entry.id === String(deepLink.dataset.loadoutDeeplink || ''));
      if (!loadout) return;
      const payload = {
        v: 1,
        name: String(loadout.name || 'Loadout').slice(0, 30),
        classType: Number(loadout.classType) || 3,
        items: (loadout.items || []).filter((item) => item.instanceId || item.hash).map((item) => ({
          instanceId: item.instanceId || '',
          hash: Number(item.hash) || 0,
          name: String(item.name || '').slice(0, 60),
          bucket: Number(item.bucket) || 0
        })),
        mods: (loadout.mods || []).map((mod) => ({ h: Number(mod.h) || 0, n: String(mod.n || ''), p: String(mod.p || ''), e: Number(mod.e) || 0 })),
        artifactPerks: (loadout.artifactPerks || []).map((perk) => ({ h: Number(perk.h || perk.hash) || 0, n: String(perk.n || '') }))
      };
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const link = 'd2tool://loadout?d=' + encoded;
      const copy = api && typeof api.copyToClipboard === 'function'
        ? api.copyToClipboard(link)
        : (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject(new Error('Zwischenablage nicht verfügbar')));
      Promise.resolve(copy)
        .then(() => toast('Teilen-Link kopiert (d2tool://).', 'success', 2400))
        .catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2200));
      return;
    }
    const tagButton = target.closest('[data-loadout-tag]');
    if (tagButton) {
      const [id, key] = String(tagButton.dataset.loadoutTag || '').split(':');
      if (!id || !key) return;
      setConfig({ bungie: { loadouts: toggleLoadoutTag(getLoadoutList(), id, key) } });
      renderEditorTab();
      return;
    }
    const pinButton = target.closest('[data-loadout-pin]');
    if (pinButton) {
      const id = String(pinButton.dataset.loadoutPin || '');
      if (!id) return;
      const loadout = getLoadoutList().find((entry) => entry.id === id);
      if (!loadout) return;
      const pinned = loadout.pinned !== true;
      const pinnedCount = getLoadoutList().filter((entry) => entry.pinned === true && entry.id !== id).length;
      if (pinned && pinnedCount >= 4) {
        toast('Höchstens vier Loadouts können im Overlay angeheftet werden.', 'warning', 3000);
        return;
      }
      setConfig({ bungie: { loadouts: pinLoadout(getLoadoutList(), id, pinned) } });
      renderEditorTab();
      toast(pinned ? 'Loadout im Overlay angeheftet.' : 'Loadout vom Overlay gelöst.', 'info', 1800);
      return;
    }
    const copy = target.closest('[data-loadout-copy]');
    if (copy) {
      openEditor(String(copy.dataset.loadoutCopy || ''));
      editorLoadoutId = '';
      editorName = editorName + ' (Kopie)';
      if (drawerNameEl) drawerNameEl.value = editorName;
      renderFooter();
      return;
    }
    const imageBtn = target.closest('[data-loadout-image]');
    if (imageBtn) {
      const loadout = getLoadoutList().find((entry) => entry.id === String(imageBtn.dataset.loadoutImage || ''));
      if (loadout) exportLoadoutCard(loadout);
      return;
    }
    const applyBtn = target.closest('[data-loadout-apply]');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyLoadout(applyBtn.dataset.loadoutApply).finally(() => { applyBtn.disabled = false; });
      return;
    }
    const del = target.closest('[data-loadout-delete]');
    if (del) {
      const original = getLoadoutList();
      const removed = original.find((entry) => entry.id === del.dataset.loadoutDelete);
      const next = original.filter((e) => e.id !== del.dataset.loadoutDelete);
      setConfig({ bungie: { loadouts: next } });
      renderEditorTab();
      renderLoadouts();
      if (removed) setUndo(`Loadout gelöscht: ${removed.name || 'Loadout'}`, () => {
        setConfig({ bungie: { loadouts: original } });
        renderEditorTab();
        renderLoadouts();
      });
      toast('Loadout gelöscht.', 'info', 1600);
    }
  }

  function openEditorTab() {
    ensureEditor();
    if (!data) refresh(true);
    const chars = ((data && data.characters) || []);
    editorCharId = editorCharId || (chars[0] && chars[0].id) || '';
    renderEditorTab();
  }

  // Item per Drag&Drop in den Loadout-Editor legen.
  function addItemFromDrag(item, owner) {
    if (!item || !item.instanceId) {
      toast('Nur Items mit Instanz lassen sich in ein Loadout legen.', 'info', 2200);
      return;
    }
    const bucket = Number(item.bucket);
    const isArmor = DIM.ARMOR_SLOTS.some((slot) => Number(slot.key) === bucket);
    const isWeapon = DIM.WEAPON_SLOTS.some((slot) => Number(slot.key) === bucket);
    if (!isArmor && !isWeapon) {
      toast('Dieses Item gehört nicht in einen Loadout-Slot.', 'info', 2200);
      return;
    }
    if (!editorLoadoutId) {
      // Neues Set beginnen, wenn noch keines geladen ist.
      editorSlots = new Map();
      editorMods = [];
      editorPerks = [];
      editorSubPlugs = [];
      editorName = 'Neues Set';
    }
    const characterId = owner || editorCharId;
    if (characterId) editorCharId = characterId;
    const classType = Number(item.classType);
    const character = ((data && data.characters) || []).find((entry) => entry.id === editorCharId);
    if (isArmor && Number.isFinite(classType) && character && Number(character.classType) !== classType) {
      toast('Rüstung passt nicht zur Klasse dieses Loadouts.', 'warning', 2600);
      return;
    }
    if (Number(item.rarity) === 6) {
      const existingExotic = [...editorSlots.values()].find((entry) => Number(entry.rarity) === 6 && Number(entry.bucket) !== bucket);
      if (existingExotic) {
        toast(`Es ist bereits ein Exot im Set (${existingExotic.name}).`, 'warning', 2800);
        return;
      }
    }
    editorSlots.set(bucket, item);
    showTab('loadouts');
    renderDrawer();
    renderFooter();
    toast(`${item.name || 'Item'} in den Loadout-Editor gelegt.`, 'success', 2200);
  }

  function openEditor(loadoutId) {
    if (!data) {
      toast('Inventar wird geladen …', 'info', 1800);
      refresh(true).then(() => {
        if (data) openEditor(loadoutId);
      });
      return;
    }
    ensureEditor();
    editorSlots = new Map();
    editorMods = [];
    editorPerks = [];
    editorSubPlugs = [];
    editorFashion = {};
    editorArtifact = null;
    optimizerResult = null;
    pickKind = '';
    pickBucket = 0;
    pickSubIdx = -1;
    editorPickerQuery = '';
    editorLoadoutId = String(loadoutId || '');
    const chars = data.characters || [];
    editorCharId = (chars[0] && chars[0].id) || '';
    editorName = '';
    editorNotes = '';
    editorAnyClass = false;
    editorShowModPlacement = true;
    editorClearOtherMods = false;

    if (editorLoadoutId) {
      const lo = getLoadoutList().find((entry) => entry.id === editorLoadoutId);
      if (!lo) {
        // Karte verweist auf ein nicht (mehr) vorhandenes Loadout.
        editorLoadoutId = '';
        toast('Loadout nicht gefunden – bitte erneut importieren.', 'warning', 3200);
      }
      if (lo) {
        editorName = lo.name || '';
        editorNotes = lo.notes || '';
        editorClearOtherMods = Boolean(lo.clearOtherMods);
        editorArtifact = (lo.artifact && Number(lo.artifact.hash) > 0) ? { ...lo.artifact } : null;

        // Items auflösen: eigene Instanz bevorzugt, sonst eine eigene
        // Kopie mit demselben Hash (DIM-Links enthalten fremde IDs).
        const resolvedItems = [];
        for (const saved of (lo.items || [])) {
          const direct = saved.instanceId ? findItemByKey(saved.instanceId) : null;
          const byHash = !direct && Number(saved.hash) > 0
            ? allItemsPool().find((item) => Number(item.hash) === Number(saved.hash))
            : null;
          const resolved = direct || byHash;
          const bucket = Number(saved.bucket) || Number(resolved && resolved.bucket) || 0;
          resolvedItems.push({ saved, resolved, bucket });
        }

        // Klasse: gespeichert oder aus den aufgelösten Besitzern ableiten.
        let wantedClass = Number(lo.classType);
        if (![0, 1, 2].includes(wantedClass)) {
          const counts = new Map();
          for (const entry of resolvedItems) {
            if (!entry.resolved) continue;
            const cls = classOfOwnedInstance(entry.resolved.instanceId);
            if ([0, 1, 2].includes(cls)) counts.set(cls, (counts.get(cls) || 0) + 1);
          }
          const inferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
          if (inferred) wantedClass = inferred[0];
        }
        const validCharacter = lo.characterId && chars.some((c) => c.id === lo.characterId);
        const matchingCharacter = chars.find((c) => Number(c.classType) === wantedClass);
        editorCharId = validCharacter ? lo.characterId : (matchingCharacter ? matchingCharacter.id : editorCharId);
        editorAnyClass = wantedClass === 3;

        for (const entry of resolvedItems) {
          if (entry.bucket) editorSlots.set(entry.bucket, entry.resolved || entry.saved);
        }
        for (const m of (lo.mods || [])) {
          if (!(Number(m.h) > 0)) continue;
          // Altlasten: Artefakt-/Masterwork-/Tuning-Plugs wurden früher
          // als Mods gespeichert und passen in keinen Mod-Socket.
          if (!isModPlug({ p: m.p, n: m.n })) continue;
          editorMods.push({ h: Number(m.h), n: m.n, i: m.i, p: m.p, d: m.d, s: m.s || [], sb: m.sb, si: m.si });
        }
        for (const p of (lo.artifactPerks || [])) {
          if (Number(p.h) > 0) editorPerks.push({ h: Number(p.h), n: p.n, i: p.i, p: p.p, d: p.d, s: p.s || [] });
        }
        for (const sp of (lo.subclassPlugs || [])) {
          if (Number(sp.hash) > 0) editorSubPlugs.push({ idx: Number(sp.idx), hash: Number(sp.hash), n: sp.n, i: sp.i, p: sp.p, d: sp.d });
        }
        editorFashion = lo.fashion || {};

        // Reparatur älterer Importe: fehlende Buckets/Icons/Klasse aus
        // dem Manifest nachziehen (DIM-Links speichern keine Buckets).
        const unresolved = (lo.items || []).filter((saved) => !Number(saved.bucket) && Number(saved.hash) > 0);
        const needsClass = ![0, 1, 2].includes(Number(lo.classType));
        const needsInfo = unresolved.length > 0
          || needsClass
          || (lo.items || []).some((saved) => Number(saved.hash) > 0 && (!saved.icon || !saved.name))
          || (lo.subclassPlugs || []).some((plug) => Number(plug.hash) > 0 && !plug.i)
          || (lo.mods || []).some((mod) => Number(mod.h) > 0 && !mod.i);
        if (needsInfo) {
          const loadoutIdAtOpen = editorLoadoutId;
          const hashes = [...new Set(
            [
              ...((lo.items || []).map((item) => Number(item.hash))),
              ...((lo.subclassPlugs || []).map((plug) => Number(plug.hash))),
              ...((lo.mods || []).map((mod) => Number(mod.h)))
            ].filter((hash) => hash > 0)
          )];
          api.bungieItemInfo(hashes)
            .then((result) => {
              if (!result || !result.ok || editorLoadoutId !== loadoutIdAtOpen) return;
              const info = result.items || {};
              let changed = false;
              for (const saved of (lo.items || [])) {
                const def = info[String(Number(saved.hash))] || {};
                const bucket = Number(saved.bucket) || Number(def.b) || 0;
                if (!bucket) continue;
                const current = editorSlots.get(bucket);
                if (!current) {
                  editorSlots.set(bucket, {
                    ...saved,
                    bucket,
                    name: saved.name || def.n || '',
                    icon: saved.icon || def.i || '',
                    typeName: saved.typeName || def.t || ''
                  });
                  changed = true;
                  continue;
                }
                if (!current.icon && def.i) {
                  current.icon = def.i;
                  changed = true;
                }
                if (!current.name && def.n) {
                  current.name = def.n;
                  changed = true;
                }
              }
              for (const plug of (lo.subclassPlugs || [])) {
                const def = info[String(Number(plug.hash))] || {};
                if (!def.i && !def.n) continue;
                const entry = editorSubPlugs.find(
                  (candidate) => Number(candidate.idx) === Number(plug.idx) && Number(candidate.hash) === Number(plug.hash)
                );
                if (!entry) continue;
                if (!entry.i && def.i) {
                  entry.i = def.i;
                  changed = true;
                }
                if (!entry.n && def.n) {
                  entry.n = def.n;
                  changed = true;
                }
                if (!entry.p && def.p) {
                  entry.p = def.p;
                  changed = true;
                }
              }
              for (const mod of (lo.mods || [])) {
                const def = info[String(Number(mod.h))] || {};
                if (!def.i && !def.n) continue;
                const entry = editorMods.find((candidate) => Number(candidate.h) === Number(mod.h));
                if (!entry) continue;
                if (!entry.i && def.i) {
                  entry.i = def.i;
                  changed = true;
                }
                if (!entry.n && def.n) {
                  entry.n = def.n;
                  changed = true;
                }
                if (!entry.p && def.p) {
                  entry.p = def.p;
                  changed = true;
                }
                if (Array.isArray(def.s) && def.s.length && !(entry.s || []).length) {
                  entry.s = def.s;
                  changed = true;
                }
              }
              if (needsClass) {
                const counts = new Map();
                for (const saved of (lo.items || [])) {
                  const cls = Number((info[String(Number(saved.hash))] || {}).c);
                  if ([0, 1, 2].includes(cls)) counts.set(cls, (counts.get(cls) || 0) + 1);
                }
                const inferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
                if (inferred) {
                  const character = (data.characters || []).find((entry) => Number(entry.classType) === inferred[0]);
                  if (character) {
                    editorCharId = character.id;
                    if (drawerCharEl) drawerCharEl.value = character.id;
                    changed = true;
                  }
                }
              }
              if (changed) {
                renderDrawer();
                renderFooter();
                renderSheet();
              }
            })
            .catch(() => {});
        }
      }
    }

    if (drawerCharEl) {
      drawerCharEl.innerHTML = chars.map((c) => '<option value="' + esc(c.id) + '">' + esc(DIM.CLASS_NAMES[c.classType] || 'Hüter') + '</option>').join('');
      drawerCharEl.value = editorCharId;
    }
    if (drawerNameEl) drawerNameEl.value = editorName;
    if (drawerNotesEl) drawerNotesEl.value = editorNotes;
    const notes = drawerRoot.querySelector('.inv-dw-notes');
    if (notes) notes.open = Boolean(editorNotes);
    drawerRoot.classList.remove('hidden');
    renderDrawer();
    renderSheet();
    if (drawerNameEl && !editorLoadoutId) drawerNameEl.focus();
    else {
      const firstSlot = drawerRoot.querySelector('.inv-dw-tile[tabindex="0"], .inv-dw-section [tabindex="0"], .inv-dw-section button');
      if (firstSlot) setTimeout(() => { try { firstSlot.focus({ preventScroll: true }); } catch (error) { firstSlot.focus(); } }, 40);
    }
  }

  function openArmorLoadout(items, name, mods, options) {
    if (!data) {
      toast('Inventar wird geladen …', 'info', 1800);
      refresh(true).then(() => {
        if (data) openArmorLoadout(items, name, mods, options);
      });
      return;
    }
    const armor = (Array.isArray(items) ? items : [])
      .filter((item) => item && Number(item.bucket) && isArmorBucket(Number(item.bucket)));
    if (!armor.length) {
      toast('Keine Rüstungsteile für den Loadout übergeben.', 'info', 2200);
      return;
    }
    showTab('loadouts');
    openEditor('');
    editorSlots = new Map();
    for (const item of armor) editorSlots.set(Number(item.bucket), item);
    editorMods = [];
    const plugMap = drawerPlugMap();
    const modBuckets = armor.map((item) => Number(item.bucket));
    let modIndex = 0;
    for (const mod of (Array.isArray(mods) ? mods : [])) {
      const hash = Number(mod && mod.hash) || 0;
      if (!hash) continue;
      const info = plugMap.get(hash) || {
        h: hash,
        n: mod.name || 'Stat-Mod',
        i: mod.icon || '',
        p: mod.plugCategory || '',
        d: mod.description || '',
        s: Array.isArray(mod.perks) ? mod.perks : []
      };
      const count = Math.max(1, Math.min(5, Number(mod && mod.count) || 1));
      for (let index = 0; index < count && editorMods.length < 10; index += 1) {
        const bucket = modBuckets.length ? modBuckets[modIndex % modBuckets.length] : 0;
        const piece = armor.find((item) => Number(item.bucket) === bucket);
        const sockets = piece ? socketPlugsFor(piece) : [];
        const socket = sockets.find((entry) => /enhancements\.v2_general/i.test(`${entry.p || ''} ${(entry.plugs || []).map((plug) => plug.p || '').join(' ')}`));
        editorMods.push({ ...info, sb: socket ? bucket : 0, si: socket ? Number(socket.idx) : -1 });
        modIndex += 1;
      }
    }
    const classType = Number((armor.find((item) => [0, 1, 2].includes(Number(item.classType))) || {}).classType);
    const characters = data.characters || [];
    const character = characters.find((entry) => Number(entry.classType) === classType) || characters[0];
    editorCharId = character ? character.id : editorCharId;
    editorName = String(name || 'Armor-Picker Build').slice(0, 30);
    if (drawerNameEl) drawerNameEl.value = editorName;
    if (drawerCharEl && editorCharId) drawerCharEl.value = editorCharId;
    if (options && options.autoRebalance) rebalanceEditorEnergy(true);
    renderDrawer();
    renderFooter();
    const missingModHashes = [...new Set(editorMods.filter((mod) => !mod.i || !mod.n).map((mod) => Number(mod.h)).filter(Boolean))];
    if (missingModHashes.length && api && typeof api.bungieItemInfo === 'function') {
      api.bungieItemInfo(missingModHashes)
        .then((result) => {
          if (!result || !result.ok) return;
          const info = result.items || {};
          let changed = false;
          for (const mod of editorMods) {
            const def = info[String(Number(mod.h))];
            if (!def) continue;
            if (!mod.i && def.i) { mod.i = def.i; changed = true; }
            if (!mod.n && def.n) { mod.n = def.n; changed = true; }
            if (!mod.p && def.p) { mod.p = def.p; changed = true; }
            if ((!mod.s || !mod.s.length) && Array.isArray(def.s) && def.s.length) { mod.s = def.s; changed = true; }
          }
          if (changed) {
            renderDrawer();
            renderFooter();
          }
        })
        .catch(() => {});
    }
    toast(`Rüstung${editorMods.length ? ` und ${editorMods.length} Stat-Mod${editorMods.length === 1 ? '' : 's'}` : ''} in den Loadout-Editor übernommen.`, 'success', 2600);
  }

  function closeEditor() {
    if (drawerNameEl) editorName = String(drawerNameEl.value || editorName || '');
    if (drawerNotesEl) editorNotes = String(drawerNotesEl.value || editorNotes || '');
    pickKind = '';
    if (drawerRoot) drawerRoot.classList.add('hidden');
    if (drawerSheetEl) { drawerSheetEl.classList.add('hidden'); drawerSheetEl.innerHTML = ''; }
  }

  async function loadIngameLoadouts(force) {
    if (ingameEditorLoading) return;
    if (!api || typeof api.bungieIngameLoadouts !== 'function') {
      ingameEditorState = { ok: false, error: 'In-Game-Loadouts sind nicht verfügbar.' };
      renderIngameSection();
      return;
    }
    ingameEditorLoading = true;
    renderIngameSection();
    try {
      ingameEditorState = await api.bungieIngameLoadouts(force === true);
    } catch (error) {
      ingameEditorState = { ok: false, error: error.message || String(error) };
    } finally {
      ingameEditorLoading = false;
      renderIngameSection();
    }
  }

  function applyIngameLoadout(characterId, index) {
    if (!api || typeof api.bungieEquipIngameLoadout !== 'function') {
      toast('In-Game-Loadouts können nicht angewendet werden.', 'info', 2200);
      return;
    }
    api.bungieEquipIngameLoadout({ characterId, loadoutIndex: Number(index) || 0, membershipType: data && data.membershipType })
      .then((result) => {
        if (result && result.ok) toast('In-Game-Loadout angewendet.', 'success', 2200);
        else toast((result && result.error) || 'Loadout konnte nicht angewendet werden.', 'error', 3000);
      })
      .catch((error) => toast(error.message || String(error), 'error', 3000));
  }

  function importIngameLoadout(characterId, index) {
    const list = (ingameEditorState && ingameEditorState.loadouts && ingameEditorState.loadouts[characterId]) || [];
    const loadout = list.find((entry) => Number(entry.index) === Number(index));
    if (!loadout) return;
    const items = (loadout.itemIds || [])
      .map((id) => findItemByKey(String(id)))
      .filter(Boolean)
      .map((item) => ({ instanceId: item.instanceId, hash: item.hash, name: item.name, bucket: item.bucket }));
    const character = ((data && data.characters) || []).find((entry) => entry.id === characterId) || {};
    const loadouts = getLoadoutList().slice();
    const id = 'ingame-' + Date.now().toString(36);
    loadouts.unshift({
      id,
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
    renderEditorTab();
    renderLoadouts();
    toast(`In-Game-Loadout ${Number(index) + 1} importiert.`, 'success', 2200);
    openEditor(id);
  }

  function renderIngameSection() {
    const el = editorTab && editorTab.querySelector('#editorIngame');
    if (!el) return;
    const state = ingameEditorState;
    const characters = (data && data.characters) || [];
    const blocks = characters.map((character) => {
      const list = (state && state.ok && state.loadouts && state.loadouts[character.id]) || [];
      const rows = list.length
        ? list.map((loadout) => {
            const ids = loadout.itemIds || [];
            const items = ids.map((id) => findItemByKey(String(id))).filter(Boolean);
            const names = items.map((item) => item.name).filter(Boolean).slice(0, 5);
            const saved = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => Number(entry.ingameIndex) === Number(loadout.index) && String(entry.ingameCharacterId || '') === String(character.id));
            const savedIds = saved ? (saved.items || []).map((item) => String(item.instanceId || '')).filter(Boolean) : [];
            const liveIds = ids.map((id) => String(id));
            const drift = Boolean(saved && savedIds.length && (savedIds.some((id) => !liveIds.includes(id)) || liveIds.some((id) => !savedIds.includes(id))));
            const syncBadge = saved ? (drift ? '<span class="inv-tool-warn">Drift</span>' : '<span class="inv-tool-chip on">synchron</span>') : '';
            return `<div class="inv-ed-ingame-row">` +
              `<span class="idx">#${Number(loadout.index) + 1}</span>` +
              `<span class="items" title="${esc(names.join(', '))}">${esc(names.join(', ')) || 'Keine Items aufgelöst'} ${syncBadge}</span>` +
              `<span class="meta">${items.length}/${ids.length} Items</span>` +
              `<button type="button" class="btn primary small" data-ed-ingame-apply="${esc(character.id)}:${Number(loadout.index)}">Anwenden</button>` +
              `<button type="button" class="btn ghost small" data-ed-ingame-import="${esc(character.id)}:${Number(loadout.index)}">Importieren</button>` +
            `</div>`;
          }).join('')
        : `<span class="inv-tool-muted">${ingameEditorLoading ? 'Lade In-Game-Loadouts …' : (state && state.ok === false ? esc(state.error || 'Nicht verfügbar.') : 'Keine In-Game-Loadouts belegt.')}</span>`;
      return `<div class="inv-ed-ingame-char"><div class="inv-ed-ingame-head"><strong>${esc(DIM.CLASS_NAMES[character.classType] || 'Hüter')}</strong><span>${list.length} Loadouts</span></div>${rows}</div>`;
    }).join('');
    el.innerHTML = `<div class="inv-ed-ingame-panel">` +
      `<div class="inv-ed-ingame-title"><div><h4>In-Game-Loadouts</h4><p>Direkt aus Destiny importieren oder im Spiel anwenden.</p></div>` +
        `<button type="button" class="btn ghost small" data-ed-ingame-refresh ${ingameEditorLoading ? 'disabled' : ''}>${ingameEditorLoading ? 'Lädt …' : 'Aktualisieren'}</button></div>` +
      `${blocks || '<span class="inv-tool-muted">Keine Charakterdaten.</span>'}` +
    `</div>`;
    if (!state && !ingameEditorLoading) loadIngameLoadouts(false);
  }

  let loadoutQuery = '';
  let loadoutFolderFilter = '';

  function loadoutFolders() {
    return (((getCfg().bungie && getCfg().bungie.loadoutFolders) || [])).filter((folder) => folder && folder.id);
  }

  // Vor dem Überschreiben einer Loadout-Definition den alten Stand
  // sichern (max. 5 Versionen, Format wie bungie.loadoutVersions).
  function pushLoadoutVersion(loadout) {
    if (!loadout || !loadout.id) return;
    const versions = { ...(((getCfg().bungie && getCfg().bungie.loadoutVersions) || {})) };
    const list = Array.isArray(versions[loadout.id]) ? versions[loadout.id].slice() : [];
    list.push({
      at: Date.now(),
      name: loadout.name || 'Loadout',
      items: (loadout.items || []).map((item) => ({
        instanceId: item.instanceId,
        hash: item.hash,
        name: item.name,
        bucket: item.bucket
      })),
      mods: (loadout.mods || []).map((mod) => ({ hash: mod.h || mod.hash }))
    });
    versions[loadout.id] = list.slice(-5);
    setConfig({ bungie: { loadoutVersions: versions } });
  }

  function restoreLoadoutVersion(id, index) {
    const versions = ((getCfg().bungie && getCfg().bungie.loadoutVersions) || {})[id] || [];
    const version = versions[Number(index)];
    if (!version) return;
    const next = getLoadoutList().map((entry) => (entry.id === id
      ? {
        ...entry,
        name: version.name || entry.name,
        items: Array.isArray(version.items) ? version.items : entry.items,
        mods: Array.isArray(version.mods) ? version.mods.map((mod) => ({ h: mod.hash, n: mod.n || '' })) : entry.mods
      }
      : entry));
    setConfig({ bungie: { loadouts: next } });
    renderEditorTab();
    renderLoadouts();
    toast('Loadout-Version wiederhergestellt.', 'success', 2400);
  }

  function filteredLoadouts() {
    const query = loadoutQuery.trim().toLocaleLowerCase('de');
    return getLoadoutList().filter((loadout) => {
      if (loadoutFolderFilter && String(loadout.folder || '') !== loadoutFolderFilter) return false;
      if (!query) return true;
      const character = ((data && data.characters) || []).find((entry) => entry.id === loadout.characterId);
      const className = character ? (DIM.CLASS_NAMES[character.classType] || '') : '';
      return loadoutSearchText(loadout, className).includes(query);
    });
  }

  // ---------- Loadout-Vergleich ----------
  let compareRoot = null;

  function loadoutComposition(loadout) {
    const items = (loadout.items || []).map((entry) => (entry.instanceId ? findItemByKey(entry.instanceId) : null)).filter(Boolean);
    const armor = items.filter((item) => isArmorBucket(Number(item.bucket)));
    const stats = {};
    for (const item of armor) {
      for (const [hash, value] of Object.entries(item.baseStats || {})) {
        stats[hash] = (Number(stats[hash]) || 0) + (Number(value) || 0);
      }
    }
    return {
      items: items.length,
      armor: armor.length,
      weapons: items.length - armor.length,
      mods: (loadout.mods || []).length,
      perks: (loadout.artifactPerks || []).length,
      stats,
      energy: loadoutDryRunEnergy(loadout, loadout.characterId).length,
      total: Object.values(stats).reduce((sum, value) => sum + (Number(value) || 0), 0)
    };
  }

  function compareCell(a, b, higherBetter) {
    const left = Number(a) || 0;
    const right = Number(b) || 0;
    const leftClass = higherBetter ? (left > right ? 'better' : left < right ? 'worse' : '') : (left < right ? 'better' : left > right ? 'worse' : '');
    const rightClass = higherBetter ? (right > left ? 'better' : right < left ? 'worse' : '') : (right < left ? 'better' : right > left ? 'worse' : '');
    return [leftClass, rightClass];
  }

  function renderCompareBody(a, b) {
    if (!a || !b) return '<div class="cmp-empty">Wähle zwei Loadouts.</div>';
    const ca = loadoutComposition(a);
    const cb = loadoutComposition(b);
    const rows = [
      ['Items', ca.items, cb.items, true],
      ['Rüstung', ca.armor, cb.armor, true],
      ['Waffen', ca.weapons, cb.weapons, true],
      ['Mods', ca.mods, cb.mods, true],
      ['Artefakt-Perks', ca.perks, cb.perks, true],
      ['Energieprobleme', ca.energy, cb.energy, false],
      ['Basis-Summe', ca.total, cb.total, true]
    ].map(([label, left, right, higher]) => {
      const [lc, rc] = compareCell(left, right, higher);
      return `<div class="cmp-row"><span>${escapeHtml(label)}</span><b class="${lc}">${left}</b><b class="${rc}">${right}</b></div>`;
    }).join('');
    const statRows = Object.keys(DIM.STAT_LABELS).map((hash) => {
      const left = Number(ca.stats[hash]) || 0;
      const right = Number(cb.stats[hash]) || 0;
      if (!left && !right) return '';
      const [lc, rc] = compareCell(left, right, true);
      return `<div class="cmp-row"><span>${escapeHtml(DIM.STAT_LABELS[hash])}</span><b class="${lc}">${left}</b><b class="${rc}">${right}</b></div>`;
    }).join('');
    return '<div class="cmp-table">' +
      `<div class="cmp-row cmp-head"><span></span><b>${escapeHtml(a.name || 'A')}</b><b>${escapeHtml(b.name || 'B')}</b></div>` +
      rows +
      (statRows ? '<div class="cmp-sub">Basis-Stats der Rüstung</div>' + statRows : '') +
    '</div>';
  }

  // ---------- Build-Gesundheit ----------
  let healthRoot = null;
  let versionsRoot = null;

  function loadoutHealth(loadout) {
    const liveItems = (loadout.items || []).map((entry) => (entry.instanceId ? findItemByKey(entry.instanceId) : null)).filter(Boolean);
    const armor = liveItems.filter((item) => isArmorBucket(Number(item.bucket)));
    const total = armor.reduce((sum, item) => sum + Number(item.baseStatTotal || 0), 0);
    const masterworked = armor.filter((item) => item.masterwork).length;
    const energyIssues = loadoutDryRunEnergy(loadout, loadout.characterId).length;
    const mods = (loadout.mods || []).length;
    const perks = (loadout.artifactPerks || []).length;
    const setCounts = new Map();
    for (const item of armor) {
      const hash = item.setInfo && item.setInfo.hash;
      if (hash) setCounts.set(hash, (setCounts.get(hash) || 0) + 1);
    }
    const setActive = [...setCounts.values()].some((count) => count >= 2);
    const checks = [
      { label: 'Fünf Rüstungsteile', ok: armor.length >= 5, points: 20, hint: `${armor.length}/5` },
      { label: 'Energie reicht', ok: energyIssues === 0, points: 15, hint: energyIssues ? `${energyIssues} Problem(e)` : 'ok' },
      { label: 'Mods gesetzt', ok: mods >= 5, points: 15, hint: `${mods} Mods` },
      { label: 'Basis-Stats ≥ 300', ok: total >= 300, points: 15, hint: `${total}` },
      { label: 'Mindestens 3 Meisterwerke', ok: masterworked >= 3, points: 10, hint: `${masterworked}/5` },
      { label: 'Artefakt-Perks gesetzt', ok: perks > 0, points: 10, hint: `${perks}` },
      { label: 'Set-Bonus aktiv', ok: setActive, points: 15, hint: setActive ? 'ja' : 'nein' }
    ];
    const score = checks.reduce((sum, check) => sum + (check.ok ? check.points : 0), 0);
    return { score, checks, armor: armor.length, total, masterworked, energyIssues, mods, perks };
  }

  function openHealthModal(loadout) {
    const health = loadoutHealth(loadout);
    if (!healthRoot) {
      healthRoot = document.createElement('div');
      healthRoot.className = 'cmd-palette hidden';
      healthRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Build-Gesundheit">' +
        '<div class="wn-head"><strong>Build-Gesundheit</strong><button type="button" class="icon-btn" data-health-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-body"></div>' +
      '</div>';
      document.body.appendChild(healthRoot);
      healthRoot.addEventListener('click', (event) => {
        if (event.target === healthRoot || event.target.closest('[data-health-close]')) healthRoot.classList.add('hidden');
      });
    }
    const tone = health.score >= 85 ? 'ok' : health.score >= 60 ? 'near' : 'off';
    healthRoot.querySelector('.cmp-body').innerHTML =
      `<div class="chk-summary"><span>Score: <b class="god-score ${tone}">${health.score}/100</b></span><span>${escapeHtml(loadout.name || 'Loadout')}</span></div>` +
      health.checks.map((check) =>
        `<div class="inv-tool-row"><span class="inv-tool-main">${check.ok ? '✓' : '✗'} ${escapeHtml(check.label)}</span>` +
        `<span class="inv-tool-meta">${escapeHtml(String(check.hint))}</span>` +
        `<span class="god-score ${check.ok ? 'ok' : 'off'}">${check.ok ? `+${check.points}` : `0/${check.points}`}</span></div>`
      ).join('') +
      '<div class="inv-tool-muted">Punkte sind eine Orientierung: Rüstung, Energie, Mods, Stats, Meisterwerk, Artefakt, Set-Bonus.</div>';
    healthRoot.classList.remove('hidden');
  }

  function openLoadoutVersions(loadout) {
    if (!loadout) return;
    if (!versionsRoot) {
      versionsRoot = document.createElement('div');
      versionsRoot.className = 'cmd-palette hidden';
      versionsRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Loadout-Versionen">' +
        '<div class="wn-head"><strong>Loadout-Versionen</strong><button type="button" class="icon-btn" data-versions-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-body"></div>' +
      '</div>';
      document.body.appendChild(versionsRoot);
      versionsRoot.addEventListener('click', (event) => {
        if (event.target === versionsRoot || event.target.closest('[data-versions-close]')) {
          versionsRoot.classList.add('hidden');
          return;
        }
        const restore = event.target.closest('[data-loadout-version-restore]');
        if (!restore) return;
        const [id, index] = String(restore.dataset.loadoutVersionRestore || '').split(':');
        restoreLoadoutVersion(id, Number(index));
        versionsRoot.classList.add('hidden');
      });
    }
    const versions = ((getCfg().bungie && getCfg().bungie.loadoutVersions) || {})[loadout.id] || [];
    const body = versions.length
      ? versions.slice().reverse().map((version, reverseIndex) => {
        const index = versions.length - 1 - reverseIndex;
        const date = new Date(Number(version.at) || 0).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE');
        return `<div class="inv-tool-row"><span class="inv-tool-main">${escapeHtml(version.name || 'Loadout')}</span>` +
          `<span class="inv-tool-meta">${escapeHtml(date)} · ${(version.items || []).length} Items · ${(version.mods || []).length} Mods</span>` +
          `<button type="button" class="btn ghost small" data-loadout-version-restore="${escapeHtml(loadout.id)}:${index}">Wiederherstellen</button></div>`;
      }).join('')
      : '<div class="inv-tool-muted">Noch keine Version gesichert. Beim nächsten Speichern wird der bisherige Stand automatisch archiviert.</div>';
    versionsRoot.querySelector('.cmp-body').innerHTML =
      `<div class="chk-summary"><span>Aktuell: <b>${escapeHtml(loadout.name || 'Loadout')}</b></span><span>${versions.length}/5 Versionen</span></div>` + body;
    versionsRoot.classList.remove('hidden');
  }

  function openLoadoutCompare() {
    const list = getLoadoutList();
    if (list.length < 2) {
      toast('Für den Vergleich brauchst du mindestens zwei Loadouts.', 'info', 2400);
      return;
    }
    if (!compareRoot) {
      compareRoot = document.createElement('div');
      compareRoot.className = 'cmd-palette hidden';
      compareRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Loadout vergleichen">' +
        '<div class="wn-head"><strong>Loadout vergleichen</strong><button type="button" class="icon-btn" data-cmp-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-selects"><select data-cmp-a></select><select data-cmp-b></select></div>' +
        '<div class="cmp-body"></div>' +
      '</div>';
      document.body.appendChild(compareRoot);
      compareRoot.addEventListener('click', (event) => {
        if (event.target === compareRoot || event.target.closest('[data-cmp-close]')) compareRoot.classList.add('hidden');
      });
      compareRoot.addEventListener('change', (event) => {
        const select = event.target.closest('[data-cmp-a],[data-cmp-b]');
        if (!select) return;
        const a = compareRoot.querySelector('[data-cmp-a]');
        const b = compareRoot.querySelector('[data-cmp-b]');
        const loA = list.find((entry) => entry.id === a.value) || list[0];
        const loB = list.find((entry) => entry.id === b.value) || list[1];
        compareRoot.querySelector('.cmp-body').innerHTML = renderCompareBody(loA, loB);
      });
    }
    const options = list.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name || 'Loadout')}</option>`).join('');
    const selectA = compareRoot.querySelector('[data-cmp-a]');
    const selectB = compareRoot.querySelector('[data-cmp-b]');
    selectA.innerHTML = options;
    selectB.innerHTML = options;
    selectA.value = list[0].id;
    selectB.value = list[1].id;
    compareRoot.querySelector('.cmp-body').innerHTML = renderCompareBody(list[0], list[1]);
    compareRoot.classList.remove('hidden');
  }

  function renderEditorTab() {
    if (!editorTab || !data) return;
    const listEl = editorTab.querySelector('.inv-dw-page-list');
    if (!listEl) return;
    const list = getLoadoutList();
    const folders = loadoutFolders();
    const filtered = filteredLoadouts();
    const toolbar = '<div class="inv-lo-toolbar">' +
      '<input type="search" class="inv-lo-search" data-loadout-search value="' + esc(loadoutQuery) + '" placeholder="Loadout suchen …">' +
      '<div class="inv-lo-folders">' +
        '<button type="button" class="inv-lo-folder' + (loadoutFolderFilter === '' ? ' on' : '') + '" data-loadout-folder-filter="">Alle</button>' +
        folders.map((folder) => '<button type="button" class="inv-lo-folder' + (loadoutFolderFilter === folder.id ? ' on' : '') + '" data-loadout-folder-filter="' + esc(folder.id) + '">' + esc(folder.name) + '</button>').join('') +
      '</div>' +
      '<div class="inv-lo-newfolder"><input type="text" data-loadout-folder-name maxlength="24" placeholder="Neuer Ordner"><button type="button" class="btn ghost small" data-loadout-folder-add>＋</button></div>' +
      '<button type="button" class="btn ghost small" data-loadout-compare>Vergleichen</button>' +
    '</div>';
    if (!list.length) {
      listEl.innerHTML = toolbar + '<div class="inv-dw-empty"><p>Noch keine Loadouts.</p>' +
        '<button type="button" class="btn primary small" data-ed-new>＋ Ersten Loadout erstellen</button></div>';
      renderIngameSection();
      return;
    }
    listEl.innerHTML = toolbar + '<div class="inv-dw-cards">' +
      (filtered.length ? filtered.map(loadoutCardHtml).join('') : '<div class="inv-dw-empty"><p>Keine Loadouts für diesen Filter.</p></div>') +
      '</div>';
    renderIngameSection();
  }

  function loadoutCardHtml(lo) {
    const ch = ((data && data.characters) || []).find((c) => c.id === lo.characterId);
    const items = (lo.items || []).slice(0, 9);
    const tiles = items.map((it) => '<span class="inv-dw-card-tile" title="' + esc(it.name || '') + '"' +
      (it.instanceId ? ' data-dw-tip-item="' + esc(String(it.instanceId)) + '"' : '') + '>' +
      (it.icon ? '<img src="' + bungieIcon(it.icon) + '" alt="">' : '') + '</span>').join('');
    const className = ch ? (DIM.CLASS_NAMES[ch.classType] || 'Hüter') : (Number(lo.classType) === 3 ? 'Jede Klasse' : (DIM.CLASS_NAMES[lo.classType] || 'Hüter'));
    const folder = loadoutFolders().find((entry) => entry.id === lo.folder);
    const folderSelect = '<select class="inv-lo-folder-select" data-loadout-setfolder="' + esc(lo.id) + '" title="Ordner">' +
      '<option value="">— Ordner —</option>' +
      loadoutFolders().map((entry) => '<option value="' + esc(entry.id) + '"' + (entry.id === lo.folder ? ' selected' : '') + '>' + esc(entry.name) + '</option>').join('') +
      '</select>';
    return '<div class="inv-dw-card">' +
      '<div class="inv-dw-card-head"><strong>' + esc(lo.name || 'Loadout') + '</strong>' +
      '<span class="inv-dw-card-sub">' + esc(className) + (folder ? ' · ' + esc(folder.name) : '') + '</span>' +
      '<button type="button" class="inv-loadout-pin' + (lo.pinned ? ' on' : '') + '" data-loadout-pin="' + esc(lo.id) + '" aria-pressed="' + (lo.pinned ? 'true' : 'false') + '" title="' + (lo.pinned ? 'Vom Overlay lösen' : 'Im Overlay anheften') + '">★</button>' +
      '<button type="button" class="inv-loadout-health" data-loadout-health="' + esc(lo.id) + '" title="Build-Gesundheit">❤ ' + loadoutHealth(lo).score + '</button></div>' +
      '<div class="inv-dw-card-items">' + (tiles || '<span class="inv-dw-hint">Keine Items</span>') + '</div>' +
      '<div class="inv-dw-card-meta">' + (lo.items || []).length + ' Items · ' + (lo.mods || []).length + ' Mods · ' + (lo.artifactPerks || []).length + ' Perks</div>' +
      '<div class="inv-dw-card-tags">' + LOADOUT_TAGS.map((tag) => {
        const active = Array.isArray(lo.tags) && lo.tags.includes(tag.key);
        return '<button type="button" class="inv-lo-tag' + (active ? ' on' : '') + '" data-loadout-tag="' + esc(lo.id) + ':' + tag.key + '">' + tag.label + '</button>';
      }).join('') +
      (() => {
        if (Array.isArray(lo.tags) && lo.tags.length) return '';
        const tags = getCfg().bungie && getCfg().bungie.itemTags ? getCfg().bungie.itemTags : {};
        const champion = (lo.mods || []).some((mod) => /champion|champion/i.test(String(mod.p || '') + ' ' + String(mod.n || '')));
        if (champion) return '<button type="button" class="inv-lo-tag suggest" data-loadout-tag-suggest="' + esc(lo.id) + ':gm">Vorschlag: GM</button>';
        let pvp = 0;
        let total = 0;
        for (const item of lo.items || []) {
          const tag = tags[String(item.instanceId || '')];
          if (!tag) continue;
          total += 1;
          if (tag === 'pvp') pvp += 1;
        }
        if (total && pvp / total >= 0.5) return '<button type="button" class="inv-lo-tag suggest" data-loadout-tag-suggest="' + esc(lo.id) + ':pvp">Vorschlag: PvP</button>';
        return '<button type="button" class="inv-lo-tag suggest" data-loadout-tag-suggest="' + esc(lo.id) + ':pve">Vorschlag: PvE</button>';
      })() + '</div>' +
      '<div class="inv-dw-card-actions">' +
      '<button type="button" class="btn primary small" data-loadout-apply="' + esc(lo.id) + '">Anwenden</button>' +
      '<button type="button" class="btn ghost small" data-loadout-queue="' + esc(lo.id) + '" title="In die Warteschlange legen">＋ Queue</button>' +
      '<button type="button" class="btn ghost small" data-loadout-apply-missing="' + esc(lo.id) + '" title="Nur Teile anlegen, die noch nicht ausgerüstet sind">Nur Fehlende</button>' +
      '<button type="button" class="btn ghost small" data-loadout-edit="' + esc(lo.id) + '">Bearbeiten</button>' +
      '<button type="button" class="btn ghost small" data-loadout-versions="' + esc(lo.id) + '" title="Bis zu 5 gesicherte Stände">Versionen</button>' +
      '<button type="button" class="btn ghost small" data-loadout-copy="' + esc(lo.id) + '">Kopieren</button>' +
      '<button type="button" class="btn ghost small" data-loadout-share="' + esc(lo.id) + '">Link</button>' +
      '<button type="button" class="btn ghost small" data-loadout-deeplink="' + esc(lo.id) + '" title="Teilen-Link für dieses Tool (d2tool://)">Teilen</button>' +
      '<button type="button" class="btn ghost small" data-loadout-image="' + esc(lo.id) + '" title="Build-Karte als PNG speichern">Bild</button>' +
      '<button type="button" class="btn ghost small" data-loadout-checklist="' + esc(lo.id) + '">Checkliste</button>' +
      folderSelect +
      '<button type="button" class="btn ghost small" data-loadout-delete="' + esc(lo.id) + '">Löschen</button>' +
      '</div></div>';
  }

  function currentArtifactItem() {
    const all = [
      ...(((data && data.backpack) || {})[editorCharId] || []),
      ...equippedFor(editorCharId),
      ...((data && data.vault) || [])
    ];
    if (editorArtifact && editorArtifact.instanceId) {
      const found = findItemByKey(editorArtifact.instanceId);
      if (found) return found;
    }
    if (editorArtifact && editorArtifact.hash) {
      const found = all.find((it) => Number(it.hash) === Number(editorArtifact.hash) && Number(it.bucket) === DIM.B.ARTIFACT);
      if (found) return found;
    }
    return all.find((it) => Number(it.bucket) === DIM.B.ARTIFACT) || null;
  }

  function fillSlots(mode) {
    if (!data) return;
    const equipped = equippedFor(editorCharId);
    let source = equipped;
    if (mode !== 'equipped') {
      const equippedIds = new Set(equipped.map((it) => it.instanceId));
      source = [
        ...(((data.backpack || {})[editorCharId]) || []),
        ...(data.vault || [])
      ].filter((it) => it.instanceId && !equippedIds.has(it.instanceId));
    }
    let count = 0;
    for (const it of source) {
      const bucket = Number(it.bucket) || 0;
      if (!EDITOR_SLOTS.some((s) => s.key === bucket)) continue;
      if (editorSlots.has(bucket)) continue;
      if (!classMatches(it)) continue;
      editorSlots.set(bucket, it);
      count += 1;
    }
    renderDrawer();
    toast(count ? count + ' Slot(s) aufgefüllt.' : 'Keine passenden Gegenstände gefunden.', count ? 'success' : 'info', 2000);
  }

  function randomizeLoadout() {
    if (!data) return;
    const pool = allItemsPool().filter((it) => it.instanceId && classMatches(it));
    let count = 0;
    for (const slot of EDITOR_SLOTS) {
      const candidates = pool.filter((it) => Number(it.bucket) === slot.key);
      if (!candidates.length) continue;
      editorSlots.set(slot.key, candidates[Math.floor(Math.random() * candidates.length)]);
      count += 1;
    }
    renderDrawer();
    toast(count ? 'Zufälliges Loadout generiert.' : 'Keine Gegenstände gefunden.', count ? 'success' : 'info', 2000);
  }

  function editorItemsForSave() {
    const out = [];
    for (const entry of editorSlots.entries()) {
      const bucket = Number(entry[0]) || 0;
      const item = entry[1];
      out.push({
        hash: item.hash,
        instanceId: item.instanceId || '',
        name: item.name,
        typeName: item.typeName || '',
        icon: item.icon || '',
        bucket: Number(item.bucket) || bucket,
        classType: item.classType
      });
    }
    return out;
  }

  function saveEditor() {
    if (!data) return;
    editorName = String((drawerNameEl && drawerNameEl.value) || editorName || '').trim();
    if (!editorName) {
      toast('Bitte einen Loadout-Namen eingeben.', 'warning', 2200);
      if (drawerNameEl) drawerNameEl.focus();
      return;
    }
    const items = editorItemsForSave();
    const mods = editorMods.map((m) => ({ h: m.h, n: m.n, i: m.i, p: m.p, d: m.d, s: m.s || [], sb: m.sb, si: m.si }));
    const artifactPerks = editorPerks.map((p) => ({ h: p.h, n: p.n, i: p.i, p: p.p, d: p.d, s: p.s || [] }));
    const subclassPlugs = editorSubPlugs.map((sp) => ({ idx: sp.idx, hash: sp.hash, n: sp.n, i: sp.i, p: sp.p || '', d: sp.d || '' }));
    if (!items.length && !mods.length && !artifactPerks.length && !subclassPlugs.length) {
      toast('Keine Items oder Mods gewählt.', 'warning', 2000);
      return;
    }
    const payload = {
      name: editorName.slice(0, 30),
      characterId: editorCharId,
      classType: editorClassType(),
      items,
      mods,
      artifactPerks,
      subclassPlugs,
      notes: editorNotes,
      clearOtherMods: editorClearOtherMods,
      fashion: editorFashion,
      tags: ((getLoadoutList().find((entry) => entry.id === editorLoadoutId) || {}).tags) || [],
      pinned: ((getLoadoutList().find((entry) => entry.id === editorLoadoutId) || {}).pinned) === true,
      savedAt: Date.now(),
      artifact: editorArtifact ? { hash: editorArtifact.hash, name: editorArtifact.name, icon: editorArtifact.icon } : null
    };
    const list = getLoadoutList();
    let id = editorLoadoutId;
    let next;
    if (id && list.some((entry) => entry.id === id)) {
      const previous = list.find((entry) => entry.id === id);
      if (previous) pushLoadoutVersion(previous);
      next = list.map((entry) => entry.id === id ? { ...entry, ...payload } : entry);
    } else {
      id = 'l-' + Date.now().toString(36);
      next = list.concat([{ id, ...payload }]);
    }
    setConfig({ bungie: { loadouts: next.slice(-20) } });
    editorLoadoutId = id;
    renderEditorTab();
    renderLoadouts();
    const ids = new Set(items.map((item) => String(item.instanceId || '')).filter(Boolean));
    const similar = next.find((entry) => entry.id !== id && (entry.items || []).filter((item) => ids.has(String(item.instanceId || ''))).length >= 4);
    if (similar) {
      const overlap = (similar.items || []).filter((item) => ids.has(String(item.instanceId || ''))).length;
      toast('Loadout „' + payload.name + '" gesichert · ähnelt „' + similar.name + '" (' + overlap + ' Teile).', 'info', 4200);
    } else {
      toast('Loadout „' + payload.name + '" gesichert.', 'success', 2200);
    }
    closeEditor();
  }

  async function applyEditor() {
    if (!data || !editorCharId) return;
    editorName = String((drawerNameEl && drawerNameEl.value) || editorName || '').trim() || 'Loadout';
    const items = [...editorSlots.values()].filter((it) => it.instanceId);
    if (!items.length && !editorMods.length && !editorPerks.length && !editorSubPlugs.length) {
      toast('Keine Items oder Mods gewählt.', 'warning', 2000);
      return;
    }
    const mods = editorMods.map((m) => ({ h: m.h, n: m.n, i: m.i, p: m.p, d: m.d, s: m.s || [], sb: m.sb, si: m.si }));
    const perks = editorPerks.map((p) => ({ h: p.h, n: p.n, i: p.i, p: p.p, d: p.d, s: p.s || [] }));
    closeEditor();
    await applyItems(editorName, editorCharId, items, mods, perks, editorSubPlugs);
  }

  async function deleteEditorLoadout() {
    if (!editorLoadoutId) return;
    const confirmed = await confirmAction({
      title: 'Loadout löschen',
      lines: ['Dieses Loadout wirklich löschen? Die gespeicherten Items bleiben unberührt.'],
      confirmLabel: 'Löschen',
      danger: true
    });
    if (!confirmed) return;
    const original = getLoadoutList();
    const removed = original.find((entry) => entry.id === editorLoadoutId);
    const next = original.filter((entry) => entry.id !== editorLoadoutId);
    setConfig({ bungie: { loadouts: next } });
    editorLoadoutId = '';
    renderEditorTab();
    renderLoadouts();
    closeEditor();
    if (removed) setUndo(`Loadout gelöscht: ${removed.name || 'Loadout'}`, () => {
      setConfig({ bungie: { loadouts: original } });
      renderEditorTab();
      renderLoadouts();
    });
    toast('Loadout gelöscht.', 'info', 1600);
  }

  function clearEditor() {
    editorSlots.clear();
    editorMods = [];
    editorPerks = [];
    editorSubPlugs = [];
    editorFashion = {};
    editorArtifact = null;
    renderDrawer();
  }

  // ---------- Drawer-Events ----------

  function onDrawerInput(event) {
    const target = event.target;
    if (target.classList && target.classList.contains('inv-dw-search')) {
      editorPickerQuery = String(target.value || '').trim().toLowerCase();
      const list = drawerSheetEl.querySelector('#invDwPickerList');
      if (list) list.innerHTML = sheetListHtml();
      return;
    }
    if (target.classList && target.classList.contains('inv-dw-name')) { editorName = String(target.value || ''); return; }
    if (target.tagName === 'TEXTAREA') { editorNotes = String(target.value || ''); return; }
    if (target.matches && target.matches('[data-dw-opt-weight]')) {
      const label = drawerSheetEl.querySelector('[data-dw-opt-val="' + target.dataset.dwOptWeight + '"]');
      if (label) label.textContent = target.value;
    }
  }

  function onDrawerChange(event) {
    const target = event.target;
    if (target.matches && target.matches('[data-dw-anyclass]')) {
      editorAnyClass = Boolean(target.checked);
      renderDrawer();
      return;
    }
    if (target.classList && target.classList.contains('inv-dw-char')) {
      editorCharId = String(target.value || editorCharId);
      renderDrawer();
    }
  }

  function onDrawerClick(event) {
    const target = event.target;
    if (target === drawerRoot || target.closest('[data-dw-close]')) { closeEditor(); return; }
    if (target === drawerSheetEl) { closeSheet(); return; }
    if (target.closest('[data-dw-sheet-close]')) { closeSheet(); return; }

    const clearBtn = target.closest('[data-dw-slot-clear]');
    if (clearBtn) { editorSlots.delete(Number(clearBtn.dataset.dwSlotClear)); renderDrawer(); return; }

    const subSock = target.closest('[data-dw-sub-sock]');
    if (subSock) {
      pickKind = 'sub';
      pickBucket = DIM.B.SUBCLASS;
      pickSubIdx = Number(subSock.dataset.dwSubSock) || 0;
      editorPickerQuery = '';
      renderSheet();
      return;
    }

    const sockOpen = target.closest('[data-dw-sock-open]');
    if (sockOpen) {
      const row = sockOpen.closest('[data-dw-sock-bucket]');
      pickKind = 'mod';
      pickBucket = Number(row && row.dataset.dwSockBucket) || 0;
      pickSubIdx = Number(sockOpen.dataset.dwSockOpen);
      const armor = editorSlots.get(pickBucket);
      const label = (DIM.ARMOR_SLOTS.find((s) => s.key === pickBucket) || {}).label || 'Rüstung';
      pickSocketLabel = label + (armor ? ' · ' + armor.name : '');
      editorPickerQuery = '';
      renderSheet();
      return;
    }

    const slotBtn = target.closest('[data-dw-slot]');
    if (slotBtn) { openSlotPicker(Number(slotBtn.dataset.dwSlot)); return; }

    if (target.closest('[data-dw-energy-fix]')) { rebalanceEditorEnergy(); return; }
    if (target.closest('[data-dw-mods-open]') || target.closest('[data-dw-mod-edit]')) {
      pickKind = 'mod';
      pickBucket = 0;
      pickSubIdx = -1;
      pickSocketLabel = '';
      editorPickerQuery = '';
      renderSheet();
      return;
    }

    const modDel = target.closest('[data-dw-mod-del]');
    if (modDel) { editorMods.splice(Number(modDel.dataset.dwModDel) || 0, 1); renderDrawer(); renderSheet(); return; }
    const perkDel = target.closest('[data-dw-perk-del]');
    if (perkDel) { editorPerks.splice(Number(perkDel.dataset.dwPerkDel) || 0, 1); renderDrawer(); renderSheet(); return; }

    if (target.closest('[data-dw-mod-placement]')) { editorShowModPlacement = !editorShowModPlacement; renderDrawer(); return; }
    if (target.closest('[data-dw-mod-clear]')) {
      editorMods = [];
      renderDrawer();
      toast('Andere Mods aus dem Loadout entfernt.', 'info', 1600);
      return;
    }

    if (target.closest('[data-dw-perks-open]')) {
      pickKind = 'perk';
      editorPickerQuery = '';
      renderSheet();
      return;
    }

    if (target.closest('[data-dw-artifact-take]')) {
      const art = currentArtifactItem();
      if (art) {
        editorArtifact = { hash: art.hash, name: art.name, icon: art.icon, rarity: art.rarity, instanceId: art.instanceId };
        toast('Artefakt im Loadout dokumentiert.', 'success', 1800);
        renderDrawer();
      } else {
        toast('Kein Artefakt gefunden.', 'warning', 2000);
      }
      return;
    }
    if (target.closest('[data-dw-artifact-open]')) {
      const art = currentArtifactItem();
      if (art) openArtifactMenu(art);
      return;
    }

    if (target.closest('[data-dw-optimize]')) { pickKind = 'optimizer'; optimizerResult = null; renderSheet(); return; }
    if (target.closest('[data-dw-opt-run]')) { runOptimizer(); return; }
    if (target.closest('[data-dw-opt-apply]')) { applyOptimizer(); return; }
    const preset = target.closest('[data-dw-opt-preset]');
    if (preset) { optimizerWeights = { ...(OPT_PRESETS[preset.dataset.dwOptPreset] || OPT_PRESETS.balanced) }; renderSheet(); return; }

    if (target.closest('[data-dw-fashion]')) { pickKind = 'fashion'; renderSheet(); return; }
    if (target.closest('[data-dw-fashion-save]')) {
      for (const b of DW_ARMOR) {
        if (!editorFashion[String(b)]) editorFashion[String(b)] = fashionFromItem(editorSlots.get(b));
      }
      closeSheet();
      toast('Kosmetik gespeichert.', 'success', 1800);
      return;
    }

    const fillBtn = target.closest('[data-dw-fill]');
    if (fillBtn) { fillSlots(fillBtn.dataset.dwFill); return; }
    if (target.closest('[data-dw-random]')) { randomizeLoadout(); return; }
    if (target.closest('[data-dw-save]')) { saveEditor(); return; }
    if (target.closest('[data-dw-check]')) {
      const availability = editorAvailability();
      const parts = [];
      parts.push(`${editorSlots.size} Items · ${editorMods.length} Mods`);
      if (availability.missingItems.length) parts.push(`Fehlende Items: ${availability.missingItems.slice(0, 4).join(', ')}`);
      if (availability.missingMods.length) parts.push(`Fehlende Mods: ${availability.missingMods.slice(0, 4).join(', ')}`);
      if (availability.energyOver.length) parts.push(`Zu wenig Energie: ${availability.energyOver.slice(0, 3).join(', ')}`);
      else if (editorMods.some((mod) => Number(mod.e) > 0)) parts.push('Energie reicht für alle Mods.');
      else parts.push('Energie: keine Kostendaten im Snapshot.');
      toast(parts.join(' · '), availability.missingItems.length || availability.missingMods.length || availability.energyOver.length ? 'error' : 'success', 5600);
      return;
    }
    if (target.closest('[data-dw-apply]')) { applyEditor(); return; }
    if (target.closest('[data-dw-delete]')) { deleteEditorLoadout(); return; }
    if (target.closest('[data-dw-clear]')) { clearEditor(); return; }

    const pickItem = target.closest('[data-dw-pick]');
    if (pickItem) {
      const item = findItemByKey(String(pickItem.dataset.dwPick || ''));
      if (item && pickBucket) {
        editorSlots.set(pickBucket, item);
        closeSheet();
      }
      return;
    }

    const pickMod = target.closest('[data-dw-pickmod]');
    if (pickMod) {
      const hash = Number(pickMod.dataset.dwPickmod);
      const info = {
        h: hash,
        n: pickMod.dataset.dwName || 'Mod',
        i: pickMod.dataset.dwIcon || '',
        p: pickMod.dataset.dwCat || '',
        d: pickMod.dataset.dwDesc || '',
        s: []
      };
      if (pickSubIdx >= 0) {
        // Socket-spezifisch: ein Mod pro Socket (DIM socketOverride).
        const slotIdx = editorMods.findIndex((m) => Number(m.sb) === Number(pickBucket) && Number(m.si) === Number(pickSubIdx));
        if (slotIdx >= 0 && Number(editorMods[slotIdx].h) === hash) {
          editorMods.splice(slotIdx, 1);
        } else {
          if (slotIdx >= 0) editorMods.splice(slotIdx, 1);
          if (editorMods.length < 10) editorMods.push({ ...info, sb: pickBucket, si: pickSubIdx });
        }
      } else {
        const existing = editorMods.findIndex((m) => Number(m.h) === hash && Number(m.sb) <= 0);
        if (existing >= 0) editorMods.splice(existing, 1);
        else if (editorMods.length < 10) editorMods.push(info);
      }
      renderSheet();
      renderDrawer();
      return;
    }

    const pickPerk = target.closest('[data-dw-pickperk]');
    if (pickPerk) {
      const hash = Number(pickPerk.dataset.dwPickperk);
      const existing = editorPerks.findIndex((p) => Number(p.h) === hash);
      if (existing >= 0) {
        editorPerks.splice(existing, 1);
      } else if (editorPerks.length < 8) {
        editorPerks.push({
          h: hash,
          n: pickPerk.dataset.dwName || 'Perk',
          i: pickPerk.dataset.dwIcon || '',
          p: pickPerk.dataset.dwCat || '',
          d: pickPerk.dataset.dwDesc || '',
          s: []
        });
      }
      renderSheet();
      renderDrawer();
      return;
    }

    const pickSub = target.closest('[data-dw-picksub]');
    if (pickSub) {
      const hash = Number(pickSub.dataset.dwPicksub);
      editorSubPlugs = editorSubPlugs.filter((sp) => Number(sp.idx) !== Number(pickSubIdx));
      editorSubPlugs.push({
        idx: pickSubIdx,
        hash,
        n: pickSub.dataset.dwName || 'Plug',
        i: pickSub.dataset.dwIcon || '',
        p: pickSub.dataset.dwCat || '',
        d: pickSub.dataset.dwDesc || ''
      });
      closeSheet();
      return;
    }
  }

  function renderEditorBody() {
    renderDrawer();
    renderSheet();
  }

  async function exportLoadouts() {
    const list = (getCfg().bungie && getCfg().bungie.loadouts) || [];
    if (!list.length) {
      toast('Keine Loadouts zum Exportieren.', 'info', 2200);
      return;
    }
    const payload = { type: 'd2tool-loadouts', version: 1, exportedAt: new Date().toISOString(), loadouts: list };
    const result = await api.copyToClipboard(JSON.stringify(payload, null, 2));
    if (result && result.ok) {
      showResult('Loadouts exportiert', [{ ok: true, text: `${list.length} Loadouts als JSON in der Zwischenablage (einfügbar in Discord/Textdatei).` }]);
    } else {
      toast('Export in die Zwischenablage fehlgeschlagen.', 'error', 2400);
    }
  }

  async function importOurLoadouts(incoming, sourceLabel) {
    if (!Array.isArray(incoming) || !incoming.length) {
      toast('Keine Loadouts in der Datei gefunden.', 'warning', 2600);
      return;
    }
    const confirmed = await confirmAction({
      title: 'Loadouts importieren',
      lines: [
        `${incoming.length} Loadout${incoming.length === 1 ? '' : 's'} ${sourceLabel || ''} importieren?`,
        'Gleichnamige Loadouts bleiben erhalten.'
      ],
      confirmLabel: 'Importieren'
    });
    if (!confirmed) return;
    const list = (((getCfg().bungie && getCfg().bungie.loadouts) || [])).slice();
    let added = 0;
    for (const entry of incoming) {
      if (!entry || typeof entry !== 'object') continue;
      const items = Array.isArray(entry.items) ? entry.items.filter((item) => item && item.instanceId) : [];
      if (!items.length) continue;
      const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      list.push({
        id,
        name: String(entry.name || 'Import').trim().slice(0, 30) || 'Import',
        classType: Number.isFinite(Number(entry.classType)) ? Number(entry.classType) : 3,
        characterId: String(entry.characterId || ''),
        items,
        mods: Array.isArray(entry.mods) ? entry.mods : [],
        artifactPerks: Array.isArray(entry.artifactPerks) ? entry.artifactPerks : [],
        subclassPlugs: Array.isArray(entry.subclassPlugs) ? entry.subclassPlugs : [],
        fashion: entry.fashion && typeof entry.fashion === 'object' ? entry.fashion : {},
        notes: String(entry.notes || '').slice(0, 2048)
      });
      added += 1;
    }
    setConfig({ bungie: { loadouts: list.slice(-20) } });
    renderLoadouts();
    renderEditorTab();
    showResult('Import abgeschlossen', [
      { ok: added > 0, text: `${added} Loadout${added === 1 ? '' : 's'} importiert.` }
    ]);
    if (added) toast('Loadouts importiert.', 'success', 2200);
  }

  // Hashes aus einem DIM-Loadout sammeln (Items, Sockets, Mods).
  function dimLoadoutHashes(dim) {
    const hashes = new Set();
    const add = (value) => {
      const hash = Number(value);
      if (hash > 0) hashes.add(hash);
    };
    for (const entry of ((dim && dim.equipped) || [])) {
      add(entry.hash);
      for (const plug of Object.values(entry.socketOverrides || {})) add(plug);
    }
    for (const hash of (((dim && dim.parameters && dim.parameters.mods) || []))) add(hash);
    return [...hashes];
  }

  // DIM-Loadout (dim.gg-API oder ?loadout=-URL) in unser Format übersetzen.
  async function importDimLoadout(dim) {
    if (!dim || typeof dim !== 'object') {
      toast('Kein DIM-Loadout erkannt.', 'error', 2600);
      return;
    }
    // Ohne Inventar keine Charakter-/Instanz-Zuordnung möglich.
    if (!data || !Array.isArray(data.characters) || !data.characters.length) {
      await refresh(true);
    }
    const infoResult = await api.bungieItemInfo(dimLoadoutHashes(dim));
    const info = (infoResult && infoResult.ok && infoResult.items) || {};
    const infoOf = (hash) => info[String(Number(hash))] || {};
    const owned = allItemsPool();
    const classType = Number(dim.classType);
    const chars = (data && data.characters) || [];
    const char = chars.find((c) => Number(c.classType) === classType) || editorChar() || chars[0] || null;
    const characterId = char ? char.id : '';
    const findOwned = (hash, instanceId) => {
      const exact = instanceId ? owned.find((it) => it.instanceId === String(instanceId)) : null;
      if (exact) return exact;
      const candidates = owned.filter((it) => Number(it.hash) === Number(hash));
      if (!candidates.length) return null;
      return candidates.find((it) => classOfOwnedInstance(it.instanceId) === classType) || candidates[0];
    };
    const items = [];
    const seen = new Set();
    const subclassPlugs = [];
    const artifactPerks = [];
    let artifactItem = null;
    for (const entry of ((dim.equipped) || [])) {
      const hash = Number(entry.hash) || 0;
      if (!hash) continue;
      const instanceId = String(entry.id || entry.instanceId || '');
      const own = findOwned(hash, instanceId);
      const def = infoOf(hash);
      const bucket = Number(def.b || (own && own.bucket) || 0);
      const ownedInstanceId = (own && own.instanceId) || instanceId;
      const key = ownedInstanceId || `${hash}-${items.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        hash,
        instanceId: ownedInstanceId,
        name: def.n || (own && own.name) || `Item ${hash}`,
        typeName: def.t || (own && own.typeName) || '',
        icon: def.i || (own && own.icon) || '',
        bucket,
        classType: Number(def.c || (own && own.classType) || 3)
      });
      const overrides = entry.socketOverrides && typeof entry.socketOverrides === 'object' ? entry.socketOverrides : {};
      // Nur die Subklasse hat API-setzbare Sockets (Fähigkeiten/Aspekte/
      // Fragmente). Waffen-Perks und Rüstungs-Mods laufen anders.
      if (bucket === DIM.B.SUBCLASS) {
        for (const [idx, plugHash] of Object.entries(overrides)) {
          const plugInfo = infoOf(plugHash);
          subclassPlugs.push({
            idx: Number(idx),
            hash: Number(plugHash),
            n: plugInfo.n || '',
            i: plugInfo.i || '',
            p: plugInfo.p || ''
          });
        }
      }
      // Artefakt: die Socket-Overrides sind die gewählten Artefakt-Perks
      // (nur dokumentiert, im Spiel freischalten).
      if (bucket === DIM.B.ARTIFACT) {
        artifactItem = {
          hash,
          name: def.n || (own && own.name) || `Artefakt ${hash}`,
          icon: def.i || (own && own.icon) || ''
        };
        for (const [idx, plugHash] of Object.entries(overrides)) {
          const plugInfo = infoOf(plugHash);
          if (Number(plugHash) > 0) {
            artifactPerks.push({
              h: Number(plugHash),
              n: plugInfo.n || '',
              i: plugInfo.i || '',
              p: plugInfo.p || '',
              d: plugInfo.d || '',
              s: Array.isArray(plugInfo.s) ? plugInfo.s : []
            });
          }
        }
      }
    }
    const modHashes = dim.parameters && Array.isArray(dim.parameters.mods) ? dim.parameters.mods : [];
    const mods = modHashes
      .map((hash) => {
        const def = infoOf(hash);
        const own = findOwned(hash, '');
        return {
          h: Number(hash),
          n: def.n || (own && own.name) || `Mod ${hash}`,
          i: def.i || (own && own.icon) || '',
          p: def.p || '',
          d: def.d || '',
          s: Array.isArray(def.s) ? def.s : [],
          sb: 0,
          si: -1
        };
      })
      .filter((mod) => mod.h > 0);
    if (!items.length) {
      toast('Das DIM-Loadout enthält keine Items.', 'warning', 2800);
      return;
    }
    const name = String(dim.name || 'DIM-Loadout').trim().slice(0, 30) || 'DIM-Loadout';
    const unknownItems = items.filter((item) => !item.icon).length;
    const unknownMods = mods.filter((mod) => !mod.i).length;
    const confirmed = await confirmAction({
      title: 'DIM-Loadout importieren',
      lines: [
        `„${name}“ importieren?`,
        `${items.length} Items · ${mods.length} Mods · ${subclassPlugs.length} Subklassen-Plugs`,
        (unknownItems || unknownMods) ? `Unbekannt: ${unknownItems} Items, ${unknownMods} Mods (Namen werden nachgeladen).` : 'Alle Items und Mods erkannt.',
        'Mods und Subklassen-Plugs werden beim Anlegen gesetzt.'
      ],
      confirmLabel: 'Importieren'
    });
    if (!confirmed) return;
    const list = (((getCfg().bungie && getCfg().bungie.loadouts) || [])).slice();
    list.push({
      id: `dim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      classType: Number.isFinite(Number(dim.classType)) ? Number(dim.classType) : 3,
      characterId,
      items,
      mods,
      artifactPerks,
      subclassPlugs,
      artifact: artifactItem,
      fashion: {},
      notes: String(dim.notes || '').slice(0, 2048)
    });
    setConfig({ bungie: { loadouts: list.slice(-20) } });
    renderLoadouts();
    renderEditorTab();
    showResult('DIM-Loadout importiert', [
      { ok: true, text: `„${name}“ mit ${items.length} Items gespeichert.` },
      { ok: true, text: `${mods.length} Mods, ${subclassPlugs.length} Fokus-Plugs und ${artifactPerks.length} Artefakt-Perks übernommen.` }
    ]);
    toast('DIM-Loadout importiert.', 'success', 2400);
  }

  async function importLoadoutFile(file) {
    if (!file) return;
    let parsed = null;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      toast('Die Datei enthält kein gültiges JSON.', 'error', 3000);
      return;
    }
    if (Array.isArray(parsed)) {
      await importOurLoadouts(parsed, `aus „${file.name}“`);
      return;
    }
    if (parsed && (parsed.type === 'd2tool-loadouts' || Array.isArray(parsed.loadouts))) {
      await importOurLoadouts(parsed.loadouts || [], `aus „${file.name}“`);
      return;
    }
    if (parsed && parsed.loadout) {
      await importDimLoadout(parsed.loadout);
      return;
    }
    if (parsed && (parsed.equipped || parsed.classType !== undefined)) {
      await importDimLoadout(parsed);
      return;
    }
    toast('Unbekanntes Loadout-Format in der Datei.', 'error', 3200);
  }

  async function importClipboardLoadout() {
    const text = String((await api.readClipboard()) || '').trim();
    if (!text) {
      toast('Zwischenablage ist leer.', 'info', 2000);
      return;
    }
    if (/^https?:\/\//i.test(text)) {
      const result = await api.loadoutsImportLink(text);
      if (!result || !result.ok) {
        toast((result && result.error) || 'Link konnte nicht geladen werden.', 'error', 3600);
        return;
      }
      await importDimLoadout(result.loadout);
      return;
    }
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(text))));
      if (parsed && parsed.v === 1 && Array.isArray(parsed.i)) {
        await importDimLoadout({
          name: parsed.n || 'Geteiltes Loadout',
          classType: Number(parsed.c) || 0,
          equipped: parsed.i.map(([hash, id]) => ({ hash, id, socketOverrides: {} })),
          parameters: { mods: parsed.m || [] }
        });
        return;
      }
    } catch (error) { /* kein Teilen-Code */ }
    toast('Kein DIM-Link oder Teilen-Code in der Zwischenablage.', 'info', 2800);
  }

  async function importLoadoutFromLink() {
    const link = await inputModal({
      title: 'DIM-Loadout-Link importieren',
      label: 'dim.gg-Link (z. B. https://dim.gg/abc1234) oder eine Loadout-URL mit ?loadout=… einfügen.',
      placeholder: 'https://dim.gg/…',
      confirmLabel: 'Laden'
    });
    if (!link) return;
    const result = await api.loadoutsImportLink(link);
    if (!result || !result.ok) {
      toast((result && result.error) || 'Link konnte nicht geladen werden.', 'error', 4400);
      return;
    }
    await importDimLoadout(result.loadout);
  }

  function renderLoadouts() {
    if (!loadoutList) return;
    const list = (getCfg().bungie && getCfg().bungie.loadouts) || [];
    loadoutList.innerHTML = list.length
      ? list.map((loadout) => {
        const ch = (data && data.characters ? data.characters : []).find((c) => c.id === loadout.characterId);
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 8px;border:1px solid #2a3548;border-radius:5px;font-size:11px">` +
          `<span style="font-weight:600;color:#e8ecf2">${esc(loadout.name)}</span>` +
          `<span style="color:#7a8494;font-size:10px">${esc(ch ? DIM.CLASS_NAMES[ch.classType] || 'Hüter' : 'Hüter')} · ${loadout.items.length}</span>` +
          `<button class="btn primary small" data-loadout-apply="${esc(loadout.id)}">Anlegen</button>` +
          `<button class="btn ghost small" data-loadout-edit="${esc(loadout.id)}">Bearbeiten</button>` +
          `<button class="btn ghost small" data-loadout-delete="${esc(loadout.id)}">×</button></div>`;
      }).join('')
      : '<span style="color:#7a8494;font-size:11px">Noch keine Loadouts.</span>';
  }

  function computeSnapshotDiff(previous, next) {
    if (!previous || !next) return;
    const collect = (snapshot) => {
      const map = new Map();
      const add = (list, location, owner) => {
        for (const item of list || []) {
          if (!item) continue;
          map.set(String(item.instanceId || item.hash), { item, location, owner: String(owner || '') });
        }
      };
      add(snapshot.vault, 'Tresor', '');
      for (const [owner, list] of Object.entries(snapshot.backpack || {})) add(list, 'Beutetasche', owner);
      for (const [owner, list] of Object.entries(snapshot.equipped || {})) add(list, 'Angelegt', owner);
      return map;
    };
    const before = collect(previous);
    const after = collect(next);
    const perkKey = (item) => (item && Array.isArray(item.perks) ? item.perks.map((perk) => (perk && (perk.n || perk.hash)) || '').join('|') : '');
    const brief = (entry, location) => ({
      key: String(entry.item.instanceId || entry.item.hash),
      name: entry.item.name || 'Item',
      hash: Number(entry.item.hash) || 0,
      instanceId: String(entry.item.instanceId || ''),
      location: location || entry.location,
      owner: entry.owner,
      power: Number(entry.item.power) || 0,
      godRoll: Boolean(entry.item.godRoll)
    });
    const addedItems = [];
    const removedItems = [];
    const movedItems = [];
    const changedItems = [];
    let added = 0;
    let removed = 0;
    let godrollAdded = 0;
    let godrollRemoved = 0;
    for (const [key, entry] of after) {
      const old = before.get(key);
      if (!old) {
        added += 1;
        if (entry.item.godRoll) godrollAdded += 1;
        if (addedItems.length < 12) addedItems.push(brief(entry));
        continue;
      }
      if (old.location !== entry.location || old.owner !== entry.owner) {
        if (movedItems.length < 12) movedItems.push({ ...brief(entry), from: `${old.location}${old.owner ? ` (${old.owner})` : ''}`, to: `${entry.location}${entry.owner ? ` (${entry.owner})` : ''}` });
      }
      const powerChanged = (Number(old.item.power) || 0) !== (Number(entry.item.power) || 0);
      const perksChanged = perkKey(old.item) !== perkKey(entry.item);
      if ((powerChanged || perksChanged) && changedItems.length < 12) {
        changedItems.push({ ...brief(entry), fromPower: Number(old.item.power) || 0, toPower: Number(entry.item.power) || 0, perksChanged });
      }
    }
    for (const [key, entry] of before) {
      if (!after.has(key)) {
        removed += 1;
        if (entry.item.godRoll) godrollRemoved += 1;
        if (removedItems.length < 12) removedItems.push(brief(entry));
      }
    }
    const byCharacter = [];
    for (const character of (next && next.characters) || []) {
      const collectChar = (snapshot) => {
        if (!snapshot) return new Set();
        const ids = new Set();
        for (const list of [((snapshot.equipped || {})[character.id] || []), ((snapshot.backpack || {})[character.id] || [])]) {
          for (const item of list || []) if (item) ids.add(String(item.instanceId || item.hash));
        }
        return ids;
      };
      const oldIds = collectChar(previous);
      const newIds = collectChar(next);
      byCharacter.push({
        id: character.id,
        classType: Number(character.classType) || 0,
        added: [...newIds].filter((id) => !oldIds.has(id)).length,
        removed: [...oldIds].filter((id) => !newIds.has(id)).length
      });
    }
    try {
      window.localStorage.setItem('d2inv.snapshotDiff', JSON.stringify({
        at: Date.now(), added, removed, godrollAdded, godrollRemoved,
        addedItems, removedItems, movedItems, changedItems, characters: byCharacter
      }));
    } catch (error) { /* egal */ }
  }

  function bungieErrorHint(message) {
    const text = String(message || '');
    if (/429|rate.?limit|zu viele anfragen/i.test(text)) return 'Bungie begrenzt gerade die Anfragen. In 1–2 Minuten erneut versuchen.';
    if (/maintenance|wartung/i.test(text)) return 'Bungie ist in Wartung. Später erneut versuchen.';
    if (/privacy|öffentlich|public/i.test(text)) return 'Das Bungie-Profil ist privat. In den Bungie-Datenschutzeinstellungen freigeben oder OAuth nutzen.';
    if (/api.?key|apikey/i.test(text)) return 'API-Key prüfen: Einstellungen → Bungie → API-Key.';
    if (/anmeld|token|abgelaufen|refresh/i.test(text)) return 'Anmeldung abgelaufen: Einstellungen → Bungie → erneut anmelden.';
    return '';
  }

  async function refresh(silent) {
    if (loading) return;
    const previousSnapshot = data;
    loading = true;
    if (refreshBtn) refreshBtn.disabled = true;
    if (!silent && body) body.innerHTML = '<div style="padding:20px;color:#7a8494">Inventar wird geladen …</div>';
    try {
      // Stale-while-revalidate: den letzten Snapshot sofort anzeigen,
      // während der frische Bungie-Abruf im Hintergrund läuft.
      if (!silent && !data && typeof api.bungieInventoryCached === 'function') {
        try {
          const cached = await api.bungieInventoryCached();
          if (cached && cached.ok && !data) {
            data = cached;
            setToolsData(cached);
            const ts = (value) => { const t = Date.parse(String(value || '')); return Number.isFinite(t) ? t : 0; };
            (data.characters || []).sort((a, b) => ts(b.lastPlayed) - ts(a.lastPlayed));
            if (loadoutCharSelect) {
              loadoutCharSelect.innerHTML = (data.characters || []).map((c) => `<option value="${esc(c.id)}">${esc(DIM.CLASS_NAMES[c.classType] || 'Hüter')}</option>`).join('');
            }
            renderStatus();
            try { render(); } catch (error) { /* egal */ }
            try { renderLoadouts(); } catch (error) { /* egal */ }
            toast('Letzter Stand geladen – Aktualisierung läuft …', 'info', 2600);
          }
        } catch (error) {
          // Kein Snapshot → normal weiter.
        }
      }
      const result = await api.bungieInventory();
      loading = false;
      if (refreshBtn) refreshBtn.disabled = false;
      if (!result || !result.ok) {
        const message = (result && result.error) || 'Inventar nicht verfügbar.';
        const hint = bungieErrorHint(message);
        const displayMessage = hint ? `${message} — ${hint}` : message;
        if (silent && data) {
          lastDiagnostics = (result && result.diagnostics) || null;
          toast(displayMessage, 'error', 4200);
          return;
        }
        data = null;
        lastDiagnostics = (result && result.diagnostics) || null;
        const diagHtml = lastDiagnostics ? `<div style="margin:10px 0;padding:6px 10px;border:1px solid #2a3548;border-radius:6px"><code style="font-size:10px;color:#7a8494;word-break:break-all">${esc(JSON.stringify(lastDiagnostics))}</code> <button class="btn ghost small" data-inv-copy-diag="1">Kopieren</button></div>` : '';
        const authIssue = /anmeld|abgelaufen|öffentlich|refresh-token/i.test(message);
        const loginHtml = authIssue
          ? `<div style="margin-top:12px;display:flex;gap:8px;align-items:center"><button class="btn primary small" data-inv-login="1">Bungie jetzt anmelden</button><span style="color:#7a8494;font-size:11px">Danach „Aktualisieren“ drücken.</span></div>`
          : `<div style="margin-top:12px"><button class="btn ghost small" data-inv-copy-bundle="1">Diagnose kopieren</button></div>`;
        if (!silent && body) body.innerHTML = `<div style="padding:20px;color:#ff6b6b">${esc(displayMessage)}</div>${loginHtml}${diagHtml}`;
        else if (silent) toast(displayMessage, 'error', 4200);
        return;
      }
      data = result;
      computeSnapshotDiff(previousSnapshot, result);
      if (result.offline) {
        toast(`Offline-Stand vom ${new Date(Number(result.cachedAt) || Date.now()).toLocaleString(window.i18n ? window.i18n.locale() : 'de-DE')} – Bungie nicht erreichbar.`, 'warning', 4600, true);
      }
      setToolsData(result);
      // DIM-Sortierung: zuletzt gespielter Charakter ganz links
      // (robust gegen fehlende Zeitstempel).
      const ts = (value) => { const t = Date.parse(String(value || '')); return Number.isFinite(t) ? t : 0; };
      (data.characters || []).sort((a, b) => ts(b.lastPlayed) - ts(a.lastPlayed));
      if (data.postmaster && sessionPulledPm.size) {
        // Session-gezoogene Poststelle-Items in automatischen Refreshes
        // ausblenden, solange Bungies Server-Cache sie noch meldet.
        for (const [id, list] of Object.entries(data.postmaster)) {
          data.postmaster[id] = (list || []).filter((item) => !sessionPulledPm.has(item.instanceId));
        }
      }
      if (!silent) sessionPulledPm.clear();
      compareItems = [];
      closeCompare();
      renderStatus();
      if (loadoutCharSelect) {
        loadoutCharSelect.innerHTML = (result.characters || []).map((c) => `<option value="${esc(c.id)}">${esc(DIM.CLASS_NAMES[c.classType] || 'Hüter')}</option>`).join('');
      }
      selectedItem = null;
      closePopup();
      try { render(); } catch (error) { if (body) body.innerHTML = `<div style="padding:20px;color:#ff6b6b">Render-Fehler: ${esc(error.message || String(error))}</div>`; }
      renderLoadouts();
      if (navigator.onLine && readOutbox().length && !outboxRunning) {
        // Nach erfolgreicher Verbindung/Aktualisierung den Ausgang senden.
        setTimeout(() => { runOutbox(false).catch(() => {}); }, 600);
      }
      try {
        renderEditorTab();
        if (drawerRoot && !drawerRoot.classList.contains('hidden')) { renderDrawer(); renderSheet(); }
      } catch (error) {
        // Der Drawer darf einen Inventar-Refresh nie blockieren.
      }
    } catch (error) {
      loading = false;
      if (refreshBtn) refreshBtn.disabled = false;
      if (body) body.innerHTML = `<div style="padding:20px;color:#ff6b6b">${esc(error.message || String(error))}</div>`;
    }
  }

  // Bestätigungs-Modal im DIM-Stil (ersetzt window.confirm).
  function confirmAction(options) {
    const {
      title = 'Bestätigen',
      lines = [],
      confirmLabel = 'OK',
      cancelLabel = 'Abbrechen',
      danger = false
    } = options || {};
    return new Promise((resolve) => {
      if (!view) {
        resolve(false);
        return;
      }
      let backdrop = view.querySelector('.inv-confirm-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'inv-confirm-backdrop';
        view.appendChild(backdrop);
      }
      backdrop.innerHTML = `<div class="inv-confirm" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        ${(lines || []).map((line) => `<p>${esc(line)}</p>`).join('')}
        <div class="inv-confirm-actions">
          <button type="button" class="btn ghost" data-confirm-cancel>${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-confirm-ok>${esc(confirmLabel)}</button>
        </div>
      </div>`;
      backdrop.classList.add('open');
      const okBtn = backdrop.querySelector('[data-confirm-ok]');
      const cancelBtn = backdrop.querySelector('[data-confirm-cancel]');
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        backdrop.classList.remove('open');
        backdrop.innerHTML = '';
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(false);
        }
      };
      document.addEventListener('keydown', onKey, true);
      if (okBtn) setTimeout(() => okBtn.focus(), 30);
      if (okBtn) okBtn.addEventListener('click', () => close(true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) close(false);
      });
    });
  }

  // Eingabe-Modal (z. B. DIM-Link).
  function inputModal(options) {
    const {
      title = 'Eingabe',
      label = '',
      placeholder = '',
      value = '',
      confirmLabel = 'OK'
    } = options || {};
    return new Promise((resolve) => {
      if (!view) {
        resolve(null);
        return;
      }
      let backdrop = view.querySelector('.inv-confirm-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'inv-confirm-backdrop';
        view.appendChild(backdrop);
      }
      backdrop.innerHTML = `<div class="inv-confirm" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        ${label ? `<p>${esc(label)}</p>` : ''}
        <input class="inv-confirm-input" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off">
        <div class="inv-confirm-actions">
          <button type="button" class="btn ghost" data-input-paste>Aus Zwischenablage</button>
          <button type="button" class="btn ghost" data-input-cancel>Abbrechen</button>
          <button type="button" class="btn primary" data-input-ok>${esc(confirmLabel)}</button>
        </div>
      </div>`;
      backdrop.classList.add('open');
      const input = backdrop.querySelector('.inv-confirm-input');
      const okBtn = backdrop.querySelector('[data-input-ok]');
      const cancelBtn = backdrop.querySelector('[data-input-cancel]');
      const pasteBtn = backdrop.querySelector('[data-input-paste]');
      let done = false;
      const close = (result) => {
        if (done) return;
        done = true;
        backdrop.classList.remove('open');
        backdrop.innerHTML = '';
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      };
      const submit = () => close(String((input && input.value) || '').trim());
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
        }
      };
      document.addEventListener('keydown', onKey, true);
      if (input) {
        setTimeout(() => input.focus(), 30);
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        });
      }
      if (okBtn) okBtn.addEventListener('click', submit);
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
      if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
          const clip = await api.readClipboard();
          if (clip && clip.ok && input) input.value = String(clip.text || '').trim();
        });
      }
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) close(null);
      });
    });
  }

  const ARMOR_BUCKET_SET = new Set(DIM.ARMOR_SLOTS.map((slot) => slot.key));
  const WEAPON_ARMOR_SET = new Set([...DIM.WEAPON_SLOTS.map((slot) => slot.key), ...DIM.ARMOR_SLOTS.map((slot) => slot.key)]);

  // Aktuelle Rüstungs-Mods für „Rückgängig“ sichern.
  function captureArmorPlugs(characterId) {
    const armor = (((data && data.equipped && data.equipped[characterId]) || [])).filter(
      (item) => item.instanceId && ARMOR_BUCKET_SET.has(Number(item.bucket))
    );
    return armor
      .map((item) => ({
        instanceId: item.instanceId,
        name: item.name,
        plugs: (item.perks || [])
          .filter((perk) => /enhancements/i.test(String(perk.p || '')))
          .map((perk) => ({ idx: perk.idx, hash: perk.hash, n: perk.n }))
      }))
      .filter((entry) => entry.plugs.length);
  }

  function pushUndo(snapshot) {
    undoStack.push(snapshot);
    while (undoStack.length > 3) undoStack.shift();
  }

  function findInventoryItem(instanceId, hash) {
    if (!data) return null;
    const lists = [
      data.vault || [],
      ...Object.values(data.backpack || {}),
      ...Object.values(data.equipped || {})
    ];
    if (instanceId) {
      for (const list of lists) {
        const hit = list.find((item) => item.instanceId === instanceId);
        if (hit) return hit;
      }
    }
    if (hash) {
      for (const list of lists) {
        const hit = list.find((item) => Number(item.hash) === Number(hash));
        if (hit) return hit;
      }
    }
    return null;
  }

  // Geschätzte Stats nach dem Anlegen: Profilwert des Charakters plus
  // Differenz der Rüstungsteile, die das Loadout ersetzt.
  function loadoutStatProjection(loadout, characterId) {
    const character = ((data && data.characters) || []).find((entry) => entry.id === characterId);
    if (!character || !character.stats) return null;
    const armorBuckets = new Set(DIM.ARMOR_SLOTS.map((slot) => slot.key));
    const equipped = ((data.equipped || {})[characterId]) || [];
    const changes = new Map();
    for (const entry of loadout.items || []) {
      const bucket = Number(entry.bucket);
      if (!armorBuckets.has(bucket)) continue;
      const item = findInventoryItem(entry.instanceId, entry.hash);
      if (item) changes.set(bucket, item);
    }
    if (!changes.size) return null;
    const statOf = (item, hash) => Number(((item.stats || []).find((stat) => Number(stat.hash) === Number(hash)) || {}).value) || 0;
    return DIM.CHAR_STAT_HASHES.map((hash) => {
      const current = Math.max(0, Math.round(Number(character.stats[hash]) || 0));
      let next = current;
      for (const [bucket, item] of changes) {
        const oldItem = equipped.find((entry) => Number(entry.bucket) === bucket);
        next += statOf(item, hash) - (oldItem ? statOf(oldItem, hash) : 0);
      }
      next = Math.max(0, Math.min(200, Math.round(next)));
      return { hash, label: DIM.STAT_LABELS[String(hash)] || 'Stat', current, next };
    });
  }

  function loadoutDryRunEnergy(loadout, characterId) {
    const mods = loadout.mods || [];
    const problems = [];
    for (const item of (loadout.items || [])) {
      if (!isArmorBucket(Number(item.bucket))) continue;
      const live = item.instanceId ? findItemByKey(item.instanceId) : null;
      const capacity = Number((live && live.energy && live.energy.capacity) || (item.energy && item.energy.capacity)) || 0;
      if (!capacity) continue;
      const assigned = mods.filter((mod) => Number(mod.sb) === Number(item.bucket));
      const cost = assigned.reduce((sum, mod) => sum + (Number(mod.e) || 0), 0);
      if (cost > capacity) problems.push(`${item.name || 'Rüstung'} ${cost}/${capacity}`);
    }
    return problems.slice(0, 4);
  }

  // Ersatz für ein fehlendes Teil: gleicher Slot, passende Klasse,
  // nicht bereits im Loadout, bester Basis-Stat-Wert.
  function suggestReplacement(item, characterId, usedItems) {
    const bucket = Number(item.bucket);
    if (!bucket) return null;
    const used = new Set((usedItems || []).map((entry) => String(entry.instanceId || '')).filter(Boolean));
    const character = ((data && data.characters) || []).find((entry) => entry.id === characterId);
    const classType = character ? Number(character.classType) : null;
    const pool = allItemsPool().filter((candidate) => {
      if (!candidate || !candidate.instanceId) return false;
      if (Number(candidate.bucket) !== bucket) return false;
      if (used.has(String(candidate.instanceId))) return false;
      if (isArmorBucket(bucket) && classType != null && Number.isFinite(Number(candidate.classType)) && Number(candidate.classType) !== classType) return false;
      return true;
    });
    if (!pool.length) return null;
    pool.sort((a, b) => {
      const statA = Number(a.baseStatTotal) || 0;
      const statB = Number(b.baseStatTotal) || 0;
      if (isArmorBucket(bucket)) return statB - statA;
      return (Number(b.power) || 0) - (Number(a.power) || 0);
    });
    return pool[0];
  }

  // Konfliktprüfung vor dem Anwenden: Exoten, Klasse, fehlende Teile.
  function loadoutConflicts(loadout, characterId) {
    const conflicts = [];
    const character = (data.characters || []).find((entry) => entry.id === characterId) || {};
    const characterClass = Number(character.classType);
    const entries = (loadout.items || []).map((item) => {
      const found = item.instanceId ? locateItem(item.instanceId, characterId) : null;
      return { item, found, actual: (found && found.item) || item };
    });
    const exotics = entries.filter((entry) => Number(entry.actual.rarity) === 6);
    if (exotics.length > 1) {
      conflicts.push({ text: `${exotics.length} Exoten im Set – Destiny erlaubt nur einen.`, blocking: true });
    }
    if (Number.isInteger(characterClass) && characterClass >= 0 && characterClass <= 2) {
      const wrongClass = entries.filter((entry) => {
        const cls = Number(entry.actual.classType);
        return Number.isInteger(cls) && cls >= 0 && cls <= 2 && cls !== characterClass;
      });
      if (wrongClass.length) {
        conflicts.push({ text: `${wrongClass.length} Teil(e) für eine andere Klasse.`, blocking: true });
      }
    }
    const missing = entries.filter((entry) => entry.item.instanceId && (!entry.found || entry.found.loc === 'unknown'));
    if (missing.length) {
      conflicts.push({ text: `${missing.length} Item(s) nicht im Inventar gefunden.`, blocking: false });
    }
    return conflicts;
  }

  // Loadout-Warteschlange: mehrere Loadouts nacheinander anwenden.
  // Sie überlebt Neustarts; laufende Einträge werden beim Laden wieder
  // auf "wartend" gesetzt und müssen bewusst fortgesetzt werden.
  const LOADOUT_QUEUE_KEY = 'd2tool.loadoutQueue';
  function readStoredLoadoutQueue() {
    try {
      const list = JSON.parse(window.localStorage.getItem(LOADOUT_QUEUE_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      return list.filter((entry) => entry && entry.loadoutId).slice(-20).map((entry, index) => {
        const state = entry.state === 'running' ? 'pending' : entry.state;
        return {
          id: String(entry.id || `lq-restored-${index}`),
          loadoutId: String(entry.loadoutId),
          name: String(entry.name || 'Loadout'),
          state: ['pending', 'done', 'failed'].includes(state) ? state : 'pending',
          error: String(entry.error || ''),
          at: Number(entry.at) || Date.now()
        };
      });
    } catch (error) {
      return [];
    }
  }
  function saveLoadoutQueue() {
    try {
      window.localStorage.setItem(LOADOUT_QUEUE_KEY, JSON.stringify(loadoutQueue.slice(-20)));
    } catch (error) {
      // Optional; die Warteschlange bleibt für diese Sitzung erhalten.
    }
  }
  const loadoutQueue = readStoredLoadoutQueue();
  let loadoutQueueRunning = false;
  let loadoutQueuePaused = loadoutQueue.some((entry) => entry.state === 'pending');
  let loadoutQueueSeq = Date.now();

  function loadoutQueueCounts() {
    return loadoutQueue.reduce((counts, entry) => {
      counts[entry.state] = (counts[entry.state] || 0) + 1;
      return counts;
    }, {});
  }

  function showQueueBar(text, sticky = false) {
    if (!loadoutQueueBar) return;
    if (loadoutQueueText) loadoutQueueText.textContent = text;
    else loadoutQueueBar.textContent = text;
    loadoutQueueBar.classList.remove('hidden');
    if (loadoutQueueBar._hideTimer) clearTimeout(loadoutQueueBar._hideTimer);
    if (!sticky) {
      loadoutQueueBar._hideTimer = setTimeout(() => loadoutQueueBar.classList.add('hidden'), 4200);
    }
  }

  function renderLoadoutQueueBar() {
    if (!loadoutQueueBar) return;
    if (!loadoutQueue.length) {
      loadoutQueueBar.classList.add('hidden');
      if (loadoutQueuePanel) loadoutQueuePanel.classList.add('hidden');
      return;
    }
    const counts = loadoutQueueCounts();
    const parts = [];
    if (counts.pending) parts.push(`${counts.pending} wartend`);
    if (counts.running) parts.push(`${counts.running} läuft`);
    if (counts.done) parts.push(`${counts.done} erledigt`);
    if (counts.failed) parts.push(`${counts.failed} fehlgeschlagen`);
    showQueueBar(`Loadout-Warteschlange: ${parts.join(', ')}`, true);
  }

  function renderLoadoutQueuePanel() {
    saveLoadoutQueue();
    if (!loadoutQueuePanel || !loadoutQueueList) return;
    renderLoadoutQueueBar();
    if (!loadoutQueue.length) {
      loadoutQueuePanel.classList.add('hidden');
      loadoutQueueList.innerHTML = '';
      return;
    }
    const labels = { pending: 'Wartet', running: 'Läuft', done: 'Fertig', failed: 'Fehler' };
    const pendingIndexes = loadoutQueue.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.state === 'pending');
    loadoutQueueList.innerHTML = loadoutQueue.map((entry, index) => {
      const pending = pendingIndexes.findIndex((item) => item.index === index);
      const canMove = entry.state === 'pending';
      return `<div class="loadout-queue-row" data-loadout-queue-id="${esc(entry.id)}">
        <div class="loadout-queue-copy">
          <strong>${esc(entry.name)}</strong>
          <small>${entry.error ? esc(entry.error) : `hinzugefügt ${new Date(entry.at).toLocaleTimeString(window.i18n ? window.i18n.locale() : 'de-DE', { hour: '2-digit', minute: '2-digit' })}`}</small>
        </div>
        <span class="loadout-queue-state ${esc(entry.state)}">${labels[entry.state] || entry.state}</span>
        ${canMove ? `<button type="button" class="outbox-move" data-loadout-up="${index}" ${pending < 1 ? 'disabled' : ''} title="Nach oben">↑</button>
        <button type="button" class="outbox-move" data-loadout-down="${index}" ${pending < 0 || pending >= pendingIndexes.length - 1 ? 'disabled' : ''} title="Nach unten">↓</button>` : ''}
        ${entry.state === 'failed' ? `<button type="button" class="btn ghost small" data-loadout-retry="${esc(entry.id)}">Erneut</button>` : ''}
        ${entry.state !== 'running' ? `<button type="button" class="btn ghost small" data-loadout-remove="${esc(entry.id)}">Entfernen</button>` : ''}
      </div>`;
    }).join('');
    const pauseBtn = qs('#loadoutQueuePause');
    if (pauseBtn) pauseBtn.textContent = loadoutQueuePaused ? 'Fortsetzen' : 'Anhalten';
  }

  function queueLoadout(loadoutId) {
    const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === loadoutId);
    if (!loadout) return;
    if (loadoutQueue.some((entry) => entry.loadoutId === loadoutId && ['pending', 'running'].includes(entry.state))) {
      toast(`„${loadout.name}“ ist bereits in der Warteschlange.`, 'info', 2000);
      return;
    }
    loadoutQueue.push({
      id: `lq-${(++loadoutQueueSeq).toString(36)}`,
      loadoutId,
      name: loadout.name,
      state: 'pending',
      error: '',
      at: Date.now()
    });
    while (loadoutQueue.length > 20) {
      const finished = loadoutQueue.findIndex((entry) => !['pending', 'running'].includes(entry.state));
      if (finished < 0) break;
      loadoutQueue.splice(finished, 1);
    }
    showQueueBar(`Warteschlange: ${loadoutQueue.filter((entry) => entry.state === 'pending').length} · „${loadout.name}“ hinzugefügt`, true);
    toast(`„${loadout.name}“ in Warteschlange (${loadoutQueue.filter((entry) => entry.state === 'pending').length}).`, 'info', 2000);
    renderLoadoutQueuePanel();
    processLoadoutQueue();
  }

  function moveLoadoutQueueEntry(index, direction) {
    const target = index + direction;
    if (index < 0 || target < 0 || target >= loadoutQueue.length) return;
    if (loadoutQueue[index].state !== 'pending' || loadoutQueue[target].state !== 'pending') return;
    [loadoutQueue[index], loadoutQueue[target]] = [loadoutQueue[target], loadoutQueue[index]];
    renderLoadoutQueuePanel();
  }

  async function processLoadoutQueue() {
    if (loadoutQueueRunning) return;
    loadoutQueueRunning = true;
    let done = 0;
    let failed = 0;
    while (!loadoutQueuePaused) {
      const entry = loadoutQueue.find((item) => item.state === 'pending');
      if (!entry) break;
      entry.state = 'running';
      renderLoadoutQueuePanel();
      const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((item) => item.id === entry.loadoutId);
      if (!loadout || !loadout.characterId) {
        entry.state = 'failed';
        entry.error = 'Loadout oder Charakter fehlt.';
        failed += 1;
        renderLoadoutQueuePanel();
        continue;
      }
      showQueueBar(`Läuft: „${loadout.name}“ · ${done} fertig, ${failed} übersprungen`, true);
      const blocking = loadoutConflicts(loadout, loadout.characterId).filter((item) => item.blocking);
      if (blocking.length) {
        entry.state = 'failed';
        entry.error = blocking[0].text;
        failed += 1;
        showQueueBar(`Übersprungen: „${loadout.name}“ – ${blocking[0].text}`, true);
        toast(`„${loadout.name}“ übersprungen: ${blocking[0].text}`, 'warning', 3600);
        renderLoadoutQueuePanel();
        continue;
      }
      try {
        await applyLoadout(entry.loadoutId, { skipConfirm: true, fromQueue: true });
        entry.state = 'done';
        done += 1;
      } catch (error) {
        entry.state = 'failed';
        entry.error = (error && error.message) || 'Anwenden fehlgeschlagen.';
        failed += 1;
      }
      renderLoadoutQueuePanel();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    loadoutQueueRunning = false;
    renderLoadoutQueuePanel();
    if (loadoutQueuePaused) {
      showQueueBar('Warteschlange angehalten – „Fortsetzen“ drücken.', true);
      return;
    }
    if (done || failed) {
      const summary = `Warteschlange fertig: ${done} angewendet${failed ? `, ${failed} übersprungen` : ''}.`;
      showQueueBar(summary);
      toast(summary, failed ? 'warning' : 'success', 3800);
    }
  }

  async function applyLoadout(loadoutId, options = {}) {
    const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === loadoutId);
    if (!loadout || !data) return;
    if (!loadout.characterId) return;
    const characterId = loadout.characterId;
    const allItems = loadout.items || [];
    const items = options.missingOnly
      ? allItems.filter((item) => {
        if (!item.instanceId) return true;
        const found = locateItem(item.instanceId, characterId);
        return !(found && found.loc === 'equipped' && found.owner === characterId);
      })
      : allItems;
    if (options.missingOnly && !items.length) {
      toast('Alle Teile dieses Loadouts sind bereits angelegt.', 'info', 2600);
      return;
    }
    const missing = items.filter((item) => item.instanceId && locateItem(item.instanceId, characterId).loc === 'unknown');
    const already = items.filter((item) => {
      const found = item.instanceId ? locateItem(item.instanceId, characterId) : null;
      return found && found.loc === 'equipped' && found.owner === characterId;
    }).length;
    const mods = (loadout.mods || []).length;
    const subs = (loadout.subclassPlugs || []).length;
    const perks = (loadout.artifactPerks || []).length;
    const missingMods = (loadout.mods || []).filter((mod) => !findPlugInfo(mod.h) && !mod.n);
    const energy = loadoutDryRunEnergy(loadout, characterId);
    const conflicts = loadoutConflicts(loadout, characterId);
    const lines = [
      `Items: ${items.length} (${already} bereits angelegt${missing.length ? `, ${missing.length} nicht gefunden` : ''})`,
      mods ? `Mods: ${mods}${missingMods.length ? ` · ${missingMods.length} ohne Daten` : ''}` : '',
      subs ? `Subklassen-Plugs: ${subs}` : '',
      perks ? `Artefakt-Perks (nur dokumentiert): ${perks}` : '',
      energy.length ? `Energie: ${energy.join(' · ')}` : '',
      '',
      'Vorschau pro Item:'
    ];
    for (const item of items.slice(0, 10)) {
      const found = item.instanceId ? locateItem(item.instanceId, characterId) : null;
      const status = !item.instanceId
        ? 'Hash-Item'
        : !found || found.loc === 'unknown'
          ? 'fehlt'
          : found.loc === 'equipped' && found.owner === characterId
            ? 'schon angelegt'
            : 'bereit';
      lines.push(`• ${item.name || 'Item'} — ${status}`);
    }
    if (items.length > 10) lines.push(`… und ${items.length - 10} weitere`);
    const projection = loadoutStatProjection(loadout, characterId);
    if (projection) {
      lines.push('', 'Stat-Prognose nach dem Anlegen (geschätzt):');
      lines.push(projection
        .map((stat) => `${stat.label} ${stat.current} → ${stat.next}${stat.next !== stat.current ? ` (${stat.next > stat.current ? '+' : ''}${stat.next - stat.current})` : ''}`)
        .join(' · '));
    }
    lines.push('', 'Der bisherige Ausrüstungsstand inklusive Mods wird für „Rückgängig“ gesichert.');
    if (missing.length) {
      lines.push('', `Fehlend: ${missing.slice(0, 4).map((item) => item.name).join(', ')}${missing.length > 4 ? ' …' : ''}`);
    }
    if (conflicts.length) {
      lines.push('', 'Konflikte:');
      for (const conflict of conflicts) lines.push(`${conflict.blocking ? '⛔' : '⚠'} ${conflict.text}`);
    }
    const confirmed = options.skipConfirm === true ? true : await confirmAction({
      title: options.missingOnly ? `Loadout „${loadout.name}“ ergänzen` : `Loadout „${loadout.name}“ anlegen`,
      lines,
      confirmLabel: conflicts.some((entry) => entry.blocking) ? 'Trotzdem anlegen' : 'Anlegen'
    });
    if (!confirmed) return;

    const snapshot = {
      name: loadout.name,
      characterId,
      at: Date.now(),
      items: (((data.equipped || {})[characterId]) || [])
        .filter((item) => item.instanceId && WEAPON_ARMOR_SET.has(Number(item.bucket)))
        .map((item) => ({ hash: item.hash, instanceId: item.instanceId, name: item.name })),
      armorPlugs: captureArmorPlugs(characterId)
    };
    pushUndo(snapshot);
    await applyItems(loadout.name, characterId, items, loadout.mods || [], loadout.artifactPerks || [], loadout.subclassPlugs || []);
    const stats = Object.assign({}, (getCfg().bungie && getCfg().bungie.loadoutStats) || {});
    const prevStat = stats[loadout.id] || {};
    stats[loadout.id] = { applies: (Number(prevStat.applies) || 0) + 1, lastUsedAt: Date.now() };
    setConfig({ bungie: { loadoutStats: stats } });
    if (snapshot.items.length || snapshot.armorPlugs.length) {
      appendResultAction('Rückgängig', () => undoLastApply());
      toast(`Loadout „${loadout.name}“ angewendet.`, 'success', 3000, true, [
        { label: 'Rückgängig', run: () => undoLastApply() }
      ]);
      if (options.fromJournal !== true) {
        recordJournal(`Loadout „${loadout.name}“ anwenden`,
          () => undoLastApply(),
          () => applyLoadout(loadout.id, { skipConfirm: true, fromJournal: true }));
      }
    }
  }

  // Button an die bereits gerenderte Ergebnis-Box anhängen.
  function appendResultAction(label, run) {
    if (!resultBox || resultBox.classList.contains('hidden')) return;
    resultBox._actions = resultBox._actions || [];
    const index = resultBox._actions.length;
    resultBox._actions.push({ label, run });
    const header = resultBox.firstElementChild;
    if (!header) return;
    let holder = header.querySelector('.inv-result-actions');
    if (!holder) {
      holder = document.createElement('span');
      holder.className = 'inv-result-actions';
      holder.style.display = 'flex';
      holder.style.gap = '6px';
      const close = header.querySelector('[data-inv-result-close]');
      if (close) header.insertBefore(holder, close);
      else header.appendChild(holder);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost small';
    button.dataset.invResultAction = String(index);
    button.textContent = label;
    holder.insertBefore(button, holder.firstChild);
  }

  // Rückgängig: vorherige Waffen/Rüstung und Rüstungs-Mods wiederherstellen.
  async function undoLastApply(retrySnapshot) {
    const snapshot = retrySnapshot || undoStack[undoStack.length - 1];
    if (!data || !snapshot) {
      toast('Kein Rückgängig-Stand vorhanden.', 'info', 2200);
      return;
    }
    const membershipType = data.membershipType;
    const results = [];
    let failed = 0;
    for (const item of snapshot.items || []) {
      try {
        const found = locateItem(item.instanceId, snapshot.characterId);
        if (found.loc === 'unknown') {
          failed += 1;
          results.push({ ok: false, text: `${item.name}: nicht mehr gefunden` });
          continue;
        }
        if (found.loc === 'equipped' && found.owner === snapshot.characterId) continue;
        if (found.loc === 'other-char') {
          const stash = await api.bungieTransfer({ itemHash: item.hash, itemId: item.instanceId, stackSize: 1, toVault: true, characterId: found.owner, membershipType });
          if (!stash || !stash.ok) {
            failed += 1;
            results.push({ ok: false, text: `${item.name}: ${(stash && stash.error) || 'Einlagern fehl'}` });
            continue;
          }
          await sleepMs(350);
        }
        if (found.loc === 'vault' || found.loc === 'other-char') {
          const pull = await api.bungieTransfer({ itemHash: item.hash, itemId: item.instanceId, stackSize: 1, toVault: false, characterId: snapshot.characterId, membershipType });
          if (!pull || !pull.ok) {
            failed += 1;
            results.push({ ok: false, text: `${item.name}: ${(pull && pull.error) || 'Holen fehl'}` });
            continue;
          }
          await sleepMs(350);
        }
        const equip = await api.bungieEquip({ itemId: item.instanceId, characterId: snapshot.characterId, membershipType });
        if (equip && equip.ok) results.push({ ok: true, text: `${item.name}: wieder angelegt` });
        else {
          failed += 1;
          results.push({ ok: false, text: `${item.name}: ${(equip && equip.error) || 'Ausrüsten fehl'}` });
        }
        await sleepMs(300);
      } catch (error) {
        failed += 1;
        results.push({ ok: false, text: `${item.name}: ${error.message || error}` });
      }
    }
    for (const armor of snapshot.armorPlugs || []) {
      for (const plug of armor.plugs || []) {
        try {
          const inserted = await api.bungieInsertPlug({
            itemId: armor.instanceId,
            socketIndex: plug.idx,
            plugItemHash: plug.hash,
            characterId: snapshot.characterId,
            membershipType
          });
          if (inserted && inserted.ok) results.push({ ok: true, text: `${armor.name}: ${plug.n || 'Mod'} wieder gesteckt` });
          else {
            failed += 1;
            results.push({ ok: false, text: `${armor.name}: ${plug.n || 'Mod'} – ${(inserted && inserted.error) || 'Einstecken fehl'}` });
          }
        } catch (error) {
          failed += 1;
          results.push({ ok: false, text: `${armor.name}: ${plug.n || 'Mod'} – ${error.message || error}` });
        }
        await sleepMs(250);
      }
    }
    if (failed === 0) {
      const stackIndex = undoStack.indexOf(snapshot);
      if (stackIndex >= 0) undoStack.splice(stackIndex, 1);
    }
    const actions = failed
      ? [{ label: 'Fehlgeschlagene erneut', run: () => undoLastApply(snapshot) }]
      : [];
    showResult(`Rückgängig: ${snapshot.name} ${failed ? `(${failed} Fehler)` : ''}`.trim(), results, actions);
    for (const item of snapshot.items || []) {
      const full = findAnyItemById(item.instanceId);
      if (full) equipLocally(full, snapshot.characterId);
    }
    render();
    syncToolsView();
  }

  // Duplikate (gleicher Hash + Klasse) aus Beutetaschen in den Tresor.
  async function runTransferBatch(moves) {
    const results = [];
    const failed = [];
    let okCount = 0;
    for (const entry of moves) {
      try {
        const result = await api.bungieTransfer({
          itemHash: entry.item.hash,
          itemId: entry.item.instanceId,
          stackSize: 1,
          toVault: true,
          characterId: entry.owner,
          membershipType: data.membershipType
        });
        if (result && result.ok) {
          okCount += 1;
          moveLocally(entry.item, true, entry.owner);
          results.push({ ok: true, text: `${entry.item.name} → Tresor` });
        } else {
          failed.push(entry);
          results.push({ ok: false, text: `${entry.item.name}: ${(result && result.error) || 'Transfer fehl'}` });
        }
      } catch (error) {
        failed.push(entry);
        results.push({ ok: false, text: `${entry.item.name}: ${error.message || error}` });
      }
      await sleepMs(350);
    }
    const actions = failed.length
      ? [{ label: 'Fehlgeschlagene erneut', run: () => runTransferBatch(failed) }]
      : [];
    showResult(`Duplikate → Tresor: ${okCount}/${moves.length}`, results.slice(-80), actions);
    render();
    syncToolsView();
    return { okCount, failed };
  }

  async function moveDuplicatesToVault() {
    if (!data || !data.membershipType) {
      toast('Erst Inventar laden.', 'warning', 2200);
      return;
    }
    const groups = new Map();
    for (const [characterId, list] of Object.entries(data.backpack || {})) {
      for (const item of list || []) {
        if (!item || !item.instanceId) continue;
        const key = `${Number(item.hash) || 0}|${Number(item.classType) || 0}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ item, owner: characterId });
      }
    }
    const moves = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => (Number(b.item.power) || 0) - (Number(a.item.power) || 0));
      for (const entry of list.slice(1)) moves.push(entry);
    }
    if (!moves.length) {
      toast('Keine Duplikate in den Beutetaschen gefunden.', 'info', 2600);
      return;
    }
    const confirmed = await confirmAction({
      title: 'Duplikate in den Tresor',
      lines: [
        `${moves.length} doppelte Item${moves.length === 1 ? '' : 's'} werden in den Tresor verschoben.`,
        'Die stärkste Kopie bleibt am Charakter; angelegte Items werden nicht angefasst.'
      ],
      confirmLabel: 'Verschieben'
    });
    if (!confirmed) return;
    duplicatesBtn.disabled = true;
    try {
      await runTransferBatch(moves);
    } finally {
      duplicatesBtn.disabled = false;
    }
  }

  // Inventar öffnen und zur Poststelle springen (Klick auf den Zähler).
  function openPostmaster() {
    open();
    showTab('inventory');
    const scrollToSection = () => {
      if (!body) return;
      const cat = [...body.querySelectorAll('.dinv-cat')].find((el) => /Poststelle/i.test(el.textContent || ''));
      if (cat) cat.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (data) {
      render();
      setTimeout(scrollToSection, 80);
    } else {
      setTimeout(() => {
        if (data) scrollToSection();
      }, 1500);
    }
  }

  function locate(instanceId, characterId) {
    if (!data || !instanceId) return 'unknown';
    if ((data.vault || []).some((item) => item.instanceId === instanceId)) return 'vault';
    for (const [id, items] of Object.entries(data.backpack || {})) {
      if (items.some((item) => item.instanceId === instanceId)) {
        return id === characterId ? 'backpack' : 'other-char';
      }
    }
    for (const items of Object.values(data.equipped || {})) {
      if (items.some((item) => item.instanceId === instanceId)) return 'equipped';
    }
    return 'unknown';
  }

  // Item-Ort MIT Besitzer (für die Char→Char-Kette beim Anlegen).
  function locateItem(instanceId, characterId) {
    if (!data || !instanceId) return { loc: 'unknown', owner: '' };
    const found = ensureItemIndex().byInstance.get(String(instanceId));
    if (!found) return { loc: 'unknown', owner: '' };
    if (found.location === 'vault') return { loc: 'vault', owner: '' };
    if (found.location === 'backpack') return { loc: found.owner === characterId ? 'backpack' : 'other-char', owner: found.owner };
    if (found.location === 'equipped') return { loc: 'equipped', owner: found.owner };
    return { loc: 'unknown', owner: '' };
  }

  // Loadout/Editor-Items anlegen (DIM moveItem-Kette: stash → pull → equip).
  const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Build-Karte als PNG teilen (Discord/Clan).
  async function exportLoadoutCard(loadout) {
    if (!loadout) return;
    const characterId = loadout.characterId || editorCharId;
    const projection = loadoutStatProjection(loadout, characterId) || [];
    const stats = projection.slice(0, 6).map((stat) => ({ label: stat.label, value: stat.next }));
    const health = loadoutHealth(loadout);
    const character = ((data && data.characters) || []).find((entry) => entry.id === characterId);
    const classNames = ['Titan', 'Jäger', 'Warlock'];
    const dataUrl = renderBuildCard({
      name: loadout.name || 'Loadout',
      className: character ? classNames[Number(character.classType)] || '' : '',
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff4655',
      score: health.score,
      stats,
      items: (loadout.items || []).map((item) => ({
        name: item.name,
        typeName: item.typeName || '',
        power: item.power,
        exotic: Number(item.rarity) === 6
      })),
      mods: (loadout.mods || []).map((mod) => mod.n).filter(Boolean),
      perks: (loadout.artifactPerks || []).map((perk) => perk.n).filter(Boolean),
      footer: health.checks.filter((check) => !check.ok).length
        ? 'Offen: ' + health.checks.filter((check) => !check.ok).map((check) => check.label).join(', ')
        : 'Alle Checks erfüllt · ' + new Date().toLocaleDateString('de-DE')
    });
    if (!dataUrl) { toast('Bild konnte nicht erzeugt werden.', 'error', 2400); return; }
    if (api && typeof api.saveBuildCard === 'function') {
      try {
        const result = await api.saveBuildCard({ dataUrl, name: loadout.name || 'build' });
        if (result && result.ok) toast('Build-Karte gespeichert.', 'success', 2400);
        else if (!(result && result.canceled)) toast((result && result.error) || 'Speichern fehlgeschlagen.', 'error', 2600);
      } catch (error) {
        toast(error.message || String(error), 'error', 2600);
      }
    }
  }

  // ---------- Fortschritt beim Anwenden ----------
  // Zeigt „7/13" mit Balken und erlaubt Abbrechen, ohne den bereits
  // angelegten Teil zu verlieren.
  let applyRun = null;

  function beginApplyProgress(total) {
    if (applyRun) applyRun.cancelled = true;
    const host = document.createElement('div');
    host.className = 'inv-apply-progress';
    host.innerHTML = '<div class="inv-apply-row"><strong data-apply-title>Loadout wird angelegt</strong>' +
      '<button type="button" class="btn ghost small" data-apply-cancel>Abbrechen</button></div>' +
      '<div class="inv-apply-bar"><span data-apply-fill style="width:0%"></span></div>' +
      '<div class="inv-apply-meta"><span data-apply-count>0/' + total + '</span><span data-apply-current></span></div>';
    document.body.appendChild(host);
    requestAnimationFrame(() => host.classList.add('show'));
    const run = {
      total,
      done: 0,
      cancelled: false,
      host,
      sleep(ms) {
        return new Promise((resolve) => {
          if (this.cancelled) { resolve(false); return; }
          let settled = false;
          const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(ok);
          };
          const timer = setTimeout(() => finish(true), ms);
          this.wake = () => finish(false);
        });
      },
      tick(label) {
        this.done += 1;
        const fill = this.host.querySelector('[data-apply-fill]');
        const count = this.host.querySelector('[data-apply-count]');
        const current = this.host.querySelector('[data-apply-current]');
        if (fill) fill.style.width = Math.min(100, Math.round((this.done / Math.max(1, this.total)) * 100)) + '%';
        if (count) count.textContent = this.done + '/' + Math.max(1, this.total);
        if (current) current.textContent = label || '';
        return !this.cancelled;
      }
    };
    host.addEventListener('click', (event) => {
      if (!event.target.closest('[data-apply-cancel]')) return;
      run.cancelled = true;
      if (run.wake) run.wake();
      const title = host.querySelector('[data-apply-title]');
      if (title) title.textContent = 'Wird abgebrochen …';
    });
    applyRun = run;
    return run;
  }

  function finishApplyProgress(run) {
    if (!run) return;
    if (applyRun === run) applyRun = null;
    run.host.classList.remove('show');
    setTimeout(() => { try { run.host.remove(); } catch (error) { /* egal */ } }, 260);
  }

  async function applyItems(loadoutName, characterId, items, mods, artifactPerks, subclassPlugs) {
    if (!data || !characterId) return;
    const membershipType = data.membershipType;
    const entries = [];
    let done = 0;
    const modList = mods || [];
    const perkList = artifactPerks || [];
    const subList = subclassPlugs || [];
    const totalCount = items.length + modList.length + perkList.length + subList.length;
    const run = beginApplyProgress(totalCount);
    const locallyEquipped = [];
    // 1. Die Items anlegen (Transfer-/Equip-Kette, DIM-Verhalten).
    for (const item of items) {
      if (run.cancelled) break;
      try {
        if (!item.instanceId) { entries.push({ ok: false, text: `${item.name}: ohne Instanz` }); continue; }
        const found = locateItem(item.instanceId, characterId);
        if (found.loc === 'unknown') { entries.push({ ok: false, text: `${item.name}: nicht gefunden` }); continue; }
        if (found.loc === 'equipped' && found.owner === characterId) { entries.push({ ok: true, text: `${item.name}: bereits angelegt` }); done += 1; continue; }
        if (found.loc === 'other-char') {
          const stash = await api.bungieTransfer({ itemHash: item.hash, itemId: item.instanceId, stackSize: 1, toVault: true, characterId: found.owner, membershipType });
          if (!stash || !stash.ok) { entries.push({ ok: false, text: `${item.name}: ${(stash && stash.error) || 'Einlagern fehl'}` }); continue; }
          await run.sleep(400);
        }
        if (found.loc === 'vault' || found.loc === 'other-char') {
          const pull = await api.bungieTransfer({ itemHash: item.hash, itemId: item.instanceId, stackSize: 1, toVault: false, characterId, membershipType });
          if (!pull || !pull.ok) { entries.push({ ok: false, text: `${item.name}: ${(pull && pull.error) || 'Holen fehl'}` }); continue; }
          await run.sleep(400);
        }
        const equip = await api.bungieEquip({ itemId: item.instanceId, characterId, membershipType });
        if (!equip || !equip.ok) { entries.push({ ok: false, text: `${item.name}: ${(equip && equip.error) || 'Ausrüsten fehl'}` }); continue; }
        entries.push({ ok: true, text: `${item.name} angelegt` });
        run.tick(`${item.name} angelegt`);
        locallyEquipped.push(item);
        done += 1;
        await run.sleep(400);
      } catch (error) {
        entries.push({ ok: false, text: `${item.name}: ${error.message || error}` });
      }
    }
    // 2. Die Mods: den getragenen Rüstungen zuweisen und einstecken
    // (DIM mod-assignment: Kategorie-Match, ein Mod pro Socket).
    const ARMOR_BUCKET_SET = [3448274439, 3551918588, 14239492, 20886954, 1585787867];
    // Erst die Rüstung aus dem Loadout (frisch angelegt), dann die
    // restliche getragene Rüstung als Fallback.
    const loadoutArmor = items.filter((it) => ARMOR_BUCKET_SET.includes(Math.round(Number(it.bucket) || 0)) && it.instanceId);
    const loadoutIds = new Set(loadoutArmor.map((it) => it.instanceId));
    const equippedArmors = [
      ...loadoutArmor.map((it) => ({ ...it, name: it.name })),
      ...(((data.equipped || {})[characterId] || []).filter((it) => ARMOR_BUCKET_SET.includes(Math.round(Number(it.bucket) || 0)) && !loadoutIds.has(it.instanceId)))
    ];
    const usedSockets = new Set();
    let stuck = 0;
    for (const mod of modList) {
      if (run.cancelled) break;
      let target = null;
      // 1. Eine feste Socket-Zuordnung (im Drawer am Rüstungsteil
      //    gewählt) hat Vorrang — DIM speichert das als socketOverrides.
      if (Number(mod.sb) > 0 && Number(mod.si) >= 0) {
        const armor = equippedArmors.find((it) => Math.round(Number(it.bucket) || 0) === Number(mod.sb));
        const entry = armor ? ((data.sockDefs || {})[String(armor.hash)] || []).find((e) => Number(e.idx) === Number(mod.si)) : null;
        if (armor && entry && !usedSockets.has(String(armor.instanceId) + ':' + entry.idx)) {
          target = { armor, entry, key: String(armor.instanceId) + ':' + entry.idx };
        }
      }
      // 2. Sonst der Kategorie-Match (gleiche plugCategoryIdentifier).
      if (!target) {
        for (const armor of equippedArmors) {
          const socks = ((data.sockDefs || {})[String(armor.hash)] || []);
          for (const entry of socks) {
            const key = String(armor.instanceId) + ':' + entry.idx;
            if (usedSockets.has(key)) continue;
            if (!(entry.plugs || []).some((p) => String(p.p || '') === String(mod.p || ''))) continue;
            target = { armor, entry, key };
            break;
          }
          if (target) break;
        }
      }
      if (!target) { entries.push({ ok: false, text: `${mod.n}: kein passender Socket` }); continue; }
      usedSockets.add(target.key);
      try {
        const r = await api.bungieInsertPlug({ itemId: target.armor.instanceId, socketIndex: target.entry.idx, plugItemHash: mod.h, characterId, membershipType });
        if (r && r.ok) {
          stuck += 1;
          entries.push({ ok: true, text: `${mod.n} → ${target.armor.name}` });
          run.tick(`${mod.n} → ${target.armor.name}`);
        } else {
          entries.push({ ok: false, text: `${mod.n}: ${(r && r.error) || 'Einstecken fehl'}` });
        }
      } catch (error) {
        entries.push({ ok: false, text: `${mod.n}: ${error.message || error}` });
      }
      await run.sleep(300);
    }
    if (stuck) done += stuck;
    // 3. Die Subklasse: Fähigkeiten/Aspekte/Fragmente einstecken
    // (kostenlose Plug-Inserts auf der angelegten Subklasse — DIM
    // socket overrides). Überschreibt jeweils: erst die Fragmente
    // entfernen, dann die gewünschten Plugs stecken.
    if (subList.length) {
      // Das Ziel ist die Subklasse AUS DEM LOADOUT (die wir gerade
      // angelegt haben) — `data` ist an dieser Stelle noch der alte
      // Snapshot, deshalb nicht data.equipped verwenden.
      const desiredSub = items.find((it) => Number(it.bucket) === DIM.B.SUBCLASS && it.instanceId) ||
        (((data.equipped || {})[characterId] || []).find((it) => Math.round(Number(it.bucket) || 0) === DIM.B.SUBCLASS));
      if (!desiredSub || !desiredSub.instanceId) {
        entries.push({ ok: false, text: 'Subklasse: keine angelegte Subklasse gefunden' });
      } else {
        // Zuerst die Fragment-Sockets leeren (Fragment-Slots ändern
        // sich mit den Aspekten — die Inserts nacheinander).
        for (const sp of subList) {
          if (run.cancelled) break;
          try {
            const r = await api.bungieInsertPlug({ itemId: desiredSub.instanceId, socketIndex: sp.idx, plugItemHash: sp.hash, characterId, membershipType });
            if (r && r.ok) {
              done += 1;
              entries.push({ ok: true, text: `${sp.n || 'Plug'} → Subklasse` });
              run.tick(`${sp.n || 'Plug'} → Subklasse`);
            } else {
              entries.push({ ok: false, text: `${sp.n || 'Plug'}: ${(r && r.error) || 'Subklasse-Insert fehl'}` });
            }
          } catch (error) {
            entries.push({ ok: false, text: `${sp.n || 'Plug'}: ${error.message || error}` });
          }
          await run.sleep(300);
        }
      }
    }
    // 4. Die Artefakt-Perks: über den Artefakt-Socket einstecken
    // (InsertSocketPlugFree). Freischaltung prüft Bungie selbst.
    if (perkList.length) {
      const artifactItem = (((data.equipped || {})[characterId] || [])
        .find((item) => Number(item.bucket) === DIM.B.ARTIFACT)) || null;
      if (!artifactItem || !artifactItem.instanceId) {
        entries.push({ ok: false, text: 'Artefakt: kein angelegtes Artefakt gefunden' });
      } else {
        const artifactSockets = ((data.sockDefs || {})[String(artifactItem.hash)] || []);
        for (const perk of perkList) {
          if (run.cancelled) break;
          const perkHash = Number(perk.h || perk.hash || 0);
          if (!perkHash) continue;
          const socket = artifactSockets.find((entry) => (entry.plugs || []).some((plug) => Number(plug.h) === perkHash));
          try {
            const result = await api.bungieInsertPlug({
              itemId: artifactItem.instanceId,
              characterId,
              socketIndex: socket ? Number(socket.idx) : 0,
              plugItemHash: perkHash,
              membershipType
            });
            if (result && result.ok) {
              entries.push({ ok: true, text: `${perk.n || 'Artefakt-Perk'} → Artefakt` });
              run.tick(`${perk.n || 'Artefakt-Perk'} → Artefakt`);
              done += 1;
            } else {
              entries.push({ ok: false, text: `${perk.n || 'Artefakt-Perk'}: ${(result && result.error) || 'nicht freigeschaltet oder abgelehnt'}` });
            }
            await run.sleep(350);
          } catch (error) {
            entries.push({ ok: false, text: `${perk.n || 'Artefakt-Perk'}: ${error.message || error}` });
          }
        }
      }
    }
    if (run.cancelled) entries.push({ ok: false, text: 'Abgebrochen – bereits angelegter Teil bleibt bestehen.' });
    finishApplyProgress(run);
    const failedEntries = entries.filter((entry) => !entry.ok).length;
    const offlineFailure = entries.some((entry) => !entry.ok && /nicht angemeldet|offline|abgelaufen|nicht erreichbar|429|netzwerk/i.test(entry.text));
    if (offlineFailure) {
      queueOfflineLoadout(loadoutName, characterId, items, modList, perkList, subList);
      entries.push({ ok: false, text: 'Offline: Aktion in die Warteschlange gelegt (Diagnose → Offline-Warteschlange).' });
    }
    const retryActions = failedEntries
      ? [{ label: 'Fehlgeschlagene erneut versuchen', run: () => applyItems(loadoutName, characterId, items, modList, perkList, subList) }]
      : [];
    showResult(`Loadout „${loadoutName}" — ${done}/${totalCount}`, entries, retryActions);
    // Anzeige sofort lokal aktualisieren; kein voller Bungie-Reload
    // (der blockierte den Hauptprozess nach jedem Anlegen).
    for (const item of locallyEquipped) equipLocally(item, characterId);
    if (locallyEquipped.length) {
      render();
      syncToolsView();
    }
  }

  // ---------- „Was ist neu?" ----------
  const WHATS_NEW_VERSION = '2026-11-20b';
  const WHATS_NEW_ITEMS = [
    { title: 'Befehlspalette (Strg+K)', text: 'Springe zu Bereichen, Loadouts und Aktionen – auch vom Dashboard aus.', action: 'palette' },
    { title: 'Picker: Tuning & Artifice', text: 'Tuning je Slot (+5) und automatische Artifice-Erkennung (+3) fließen in die Stat-Rechnung ein.', action: 'builds' },
    { title: 'Loadout-Bibliothek', text: 'Ordner, Tags und Suche für deine Loadouts; ähnliche Loadouts werden beim Speichern gemeldet.', action: 'loadouts' },
    { title: 'Encounter-Bibliothek', text: 'Raids und Dungeons mit Encountern direkt in den Wochen-Tracker übernehmen.', action: 'week' },
    { title: 'Sicherungen & Datenschutz', text: 'Konfiguration sichern, wiederherstellen und exportieren; Support-Pakete sind geschwärzt.', action: 'overview' },
    { title: 'Streamer-Modus', text: 'Blendet Spielernamen aus – ideal für Streams und Screenshots.', action: 'overview' },
    { title: 'Build-Karte als Bild', text: 'Loadout oder Picker-Set als PNG speichern – fertig zum Teilen in Discord.', action: 'loadouts' },
    { title: 'Fortschritt beim Anwenden', text: 'Beim Anlegen zeigt ein Balken den Fortschritt; „Abbrechen“ stoppt sauber, ohne den fertigen Teil zu verlieren.', action: 'loadouts' },
    { title: 'Suchfilter-Menü', text: 'Schnellfilter, letzte Suchen sowie Perk- und Stat-Suche hinter einem Knopf am Suchfeld. Tippfehler werden toleriert.', action: 'overview' },
    { title: 'Selbsttest & Speicher', text: 'Diagnose prüft Konfiguration, Cache, Datenstand und Controller; die Speicherkarte zeigt jede Cache-Art einzeln.', action: 'overview' }
  ];
  let whatsNewRoot = null;

  function whatsNewSeen() {
    try { return window.localStorage.getItem('d2tool.whatsNewSeen') === WHATS_NEW_VERSION; } catch (error) { return true; }
  }

  function whatsNewRun(action) {
    if (action === 'palette') { paletteOpen(); return; }
    if (action === 'loadouts') { showTab('loadouts'); openEditorTab(); return; }
    if (action === 'builds' || action === 'week') { paletteToolsView(action); return; }
    if (action === 'overview') { paletteToolsView('overview'); }
  }

  function showWhatsNew(force) {
    if (!force && whatsNewSeen()) return;
    if (!whatsNewRoot) {
      whatsNewRoot = document.createElement('div');
      whatsNewRoot.className = 'cmd-palette hidden';
      whatsNewRoot.innerHTML = '<div class="cmd-box" role="dialog" aria-modal="true" aria-label="Was ist neu">' +
        '<div class="wn-head"><strong>Was ist neu?</strong><span>Version ' + escapeHtml(WHATS_NEW_VERSION) + '</span></div>' +
        '<div class="wn-list"></div>' +
        '<div class="wn-foot"><button type="button" class="btn primary small" data-wn-close>Alles klar</button></div>' +
      '</div>';
      document.body.appendChild(whatsNewRoot);
      whatsNewRoot.addEventListener('click', (event) => {
        if (event.target === whatsNewRoot || event.target.closest('[data-wn-close]')) {
          whatsNewRoot.classList.add('hidden');
          try { window.localStorage.setItem('d2tool.whatsNewSeen', WHATS_NEW_VERSION); } catch (error) { /* egal */ }
        }
      });
    }
    const list = whatsNewRoot.querySelector('.wn-list');
    list.innerHTML = WHATS_NEW_ITEMS.map((item, index) =>
      '<div class="wn-item"><div class="wn-copy"><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.text) + '</small></div>' +
      '<button type="button" class="btn ghost small" data-wn-action="' + index + '">Ansehen</button></div>'
    ).join('');
    list.querySelectorAll('[data-wn-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = WHATS_NEW_ITEMS[Number(button.dataset.wnAction)];
        whatsNewRoot.classList.add('hidden');
        try { window.localStorage.setItem('d2tool.whatsNewSeen', WHATS_NEW_VERSION); } catch (error) { /* egal */ }
        if (item) whatsNewRun(item.action);
      });
    });
    whatsNewRoot.classList.remove('hidden');
  }

  // Geteiltes Loadout aus einem d2tool://-Link übernehmen.
  window.addEventListener('d2-loadout-share', (event) => {
    const detail = (event && event.detail) || {};
    const items = Array.isArray(detail.items) ? detail.items.filter((item) => item && (item.instanceId || item.hash)) : [];
    if (!items.length) {
      toast('Der Teilen-Link enthält keine Items.', 'info', 2400);
      return;
    }
    importOurLoadouts([{
      name: detail.name || 'Geteiltes Loadout',
      classType: Number(detail.classType) || 3,
      items,
      mods: Array.isArray(detail.mods) ? detail.mods : [],
      artifactPerks: Array.isArray(detail.artifactPerks) ? detail.artifactPerks : []
    }], 'aus Teilen-Link');
  });

  // ---------- Loadout-Checkliste & Materialaufwand ----------
  let checklistRoot = null;

  function loadoutChecks(id) {
    try {
      const all = JSON.parse(window.localStorage.getItem('d2tool.loadoutChecks') || '{}');
      return all && typeof all === 'object' ? (all[id] || {}) : {};
    } catch (error) {
      return {};
    }
  }

  function saveLoadoutChecks(id, checks) {
    try {
      const all = JSON.parse(window.localStorage.getItem('d2tool.loadoutChecks') || '{}') || {};
      all[id] = checks;
      window.localStorage.setItem('d2tool.loadoutChecks', JSON.stringify(all));
    } catch (error) {
      // optional
    }
  }

  // Geschätzte Materialkosten für ein Rüstungsteil von Energie 0 → 10
  // (Bungie-Werte, gerundet; dient nur der Einkaufsliste).
  const MASTERWORK_COST = { shards: 1, prisms: 10, cores: 25 };

  function loadoutShoppingList(loadout) {
    const lines = [];
    for (const item of loadout.items || []) {
      if (!item.instanceId) { lines.push(`${item.name || 'Item'}: ohne Instanz (nicht im Inventar)`); continue; }
      const found = locateItem(item.instanceId, loadout.characterId);
      if (!found || found.loc === 'unknown') lines.push(`${item.name || 'Item'}: fehlt im Inventar`);
    }
    for (const mod of loadout.mods || []) {
      if (!mod.n && !findPlugInfo(mod.h)) lines.push(`Mod ${mod.h}: keine Daten (nicht im Besitz?)`);
    }
    for (const perk of loadout.artifactPerks || []) {
      if (!perk.n && !findPlugInfo(perk.h)) lines.push(`Artefakt-Perk ${perk.h}: nicht freigeschaltet?`);
    }
    return lines;
  }

  function loadoutMaterialGap(loadout) {
    const upgrade = loadoutUpgradeSummary(loadout);
    const need = {
      shards: upgrade.unmastered * MASTERWORK_COST.shards,
      prisms: upgrade.unmastered * MASTERWORK_COST.prisms,
      cores: upgrade.unmastered * MASTERWORK_COST.cores
    };
    return {
      need,
      owned: { shards: upgrade.shards, prisms: upgrade.prisms, cores: upgrade.cores },
      missing: {
        shards: Math.max(0, need.shards - upgrade.shards),
        prisms: Math.max(0, need.prisms - upgrade.prisms),
        cores: Math.max(0, need.cores - upgrade.cores)
      }
    };
  }

  function loadoutUpgradeSummary(loadout) {
    const armor = (loadout.items || []).filter((entry) => isArmorBucket(Number(entry.bucket)));
    const live = armor.map((entry) => (entry.instanceId ? findItemByKey(entry.instanceId) : null)).filter(Boolean);
    const unmastered = live.filter((item) => !item.masterwork).length;
    const lowEnergy = live.filter((item) => Number(item.energy && item.energy.capacity) < 10).length;
    const lowList = live
      .filter((item) => Number(item.energy && item.energy.capacity) < 10)
      .map((item) => ({ name: item.name || 'Rüstung', capacity: Number(item.energy && item.energy.capacity) || 0 }));
    const materials = (data && (data.materials || data.currencies)) || [];
    const owned = (rx) => {
      const hit = materials.find((entry) => rx.test(String(entry.name || '')));
      return hit ? Number(hit.quantity) || 0 : 0;
    };
    return {
      unmastered,
      lowEnergy,
      lowList,
      shards: owned(/aufgestiegen|ascendant.*shard/i),
      prisms: owned(/prisma|prism/i),
      cores: owned(/kern|core/i),
      total: armor.length
    };
  }

  function openLoadoutChecklist(id) {
    const loadout = getLoadoutList().find((entry) => entry.id === id);
    if (!loadout) return;
    if (!checklistRoot) {
      checklistRoot = document.createElement('div');
      checklistRoot.className = 'cmd-palette hidden';
      checklistRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Loadout-Checkliste">' +
        '<div class="wn-head"><strong>Checkliste fürs Spiel</strong><button type="button" class="icon-btn" data-chk-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-body chk-body"></div>' +
        '<div class="wn-foot"><button type="button" class="btn ghost small" data-chk-copy>Als Text kopieren</button></div>' +
      '</div>';
      document.body.appendChild(checklistRoot);
      checklistRoot.addEventListener('click', (event) => {
        if (event.target === checklistRoot || event.target.closest('[data-chk-close]')) checklistRoot.classList.add('hidden');
        const copy = event.target.closest('[data-chk-copy]');
        if (copy) {
          const text = checklistAsText(String(checklistRoot.dataset.loadout || ''));
          const action = api && typeof api.copyToClipboard === 'function'
            ? api.copyToClipboard(text)
            : (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('Zwischenablage nicht verfügbar')));
          Promise.resolve(action).then(() => toast('Checkliste kopiert.', 'success', 2200)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2200));
          return;
        }
        const shopping = event.target.closest('[data-chk-copy-shopping]');
        if (shopping) {
          const loadoutId = String(checklistRoot.dataset.loadout || '');
          const loadout = getLoadoutList().find((entry) => entry.id === loadoutId);
          if (!loadout) return;
          const gap = loadoutMaterialGap(loadout);
          const lines = [
            `Einkaufsliste: ${loadout.name || 'Loadout'}`,
            ...loadoutShoppingList(loadout),
            `Material fehlt: ${gap.missing.shards} Scherben · ${gap.missing.prisms} Prismen · ${gap.missing.cores} Kerne`
          ];
          const text = lines.join('\n');
          const action = api && typeof api.copyToClipboard === 'function'
            ? api.copyToClipboard(text)
            : (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('Zwischenablage nicht verfügbar')));
          Promise.resolve(action).then(() => toast('Einkaufsliste kopiert.', 'success', 2200)).catch(() => toast('Kopieren fehlgeschlagen.', 'error', 2200));
        }
      });
      checklistRoot.addEventListener('change', (event) => {
        const box = event.target.closest('[data-chk-step]');
        if (!box) return;
        const loadoutId = String(checklistRoot.dataset.loadout || '');
        const checks = loadoutChecks(loadoutId);
        checks[box.dataset.chkStep] = box.checked;
        saveLoadoutChecks(loadoutId, checks);
      });
    }
    checklistRoot.dataset.loadout = id;
    const checks = loadoutChecks(id);
    const upgrade = loadoutUpgradeSummary(loadout);
    const step = (key, label, hint) =>
      '<label class="chk-row"><input type="checkbox" data-chk-step="' + escapeHtml(key) + '"' + (checks[key] ? ' checked' : '') + '>' +
      '<span><strong>' + escapeHtml(label) + '</strong>' + (hint ? '<small>' + escapeHtml(hint) + '</small>' : '') + '</span></label>';
    const itemRows = (loadout.items || []).map((item, index) => step('item:' + index, item.name || 'Item', 'Ausrüsten')).join('');
    const modRows = (loadout.mods || []).map((mod, index) => step('mod:' + index, mod.n || 'Mod', 'Mod stecken')).join('');
    const perkRows = (loadout.artifactPerks || []).map((perk, index) => step('perk:' + index, perk.n || 'Artefakt-Perk', 'Im Artefakt wählen')).join('');
    const subRows = (loadout.subclassPlugs || []).map((plug, index) => step('sub:' + index, plug.n || 'Subklassen-Plug', 'In der Subklasse setzen')).join('');
    const unknownMods = (loadout.mods || []).filter((mod) => !mod.n && !findPlugInfo(mod.h)).length;
    checklistRoot.querySelector('.chk-body').innerHTML =
      '<div class="chk-summary"><span>Meisterwerk offen: <b>' + upgrade.unmastered + '/' + upgrade.total + '</b></span>' +
      '<span>Energie unter 10: <b>' + upgrade.lowEnergy + '</b></span>' +
      (unknownMods ? '<span>Unbekannte Mods: <b>' + unknownMods + '</b></span>' : '') +
      '<span>Material: <b>' + upgrade.shards + '</b> Shards · <b>' + upgrade.prisms + '</b> Prismen · <b>' + upgrade.cores + '</b> Kerne</span></div>' +
      (perkRows ? '<div class="inv-tool-muted">Artefakt-Perks werden beim Anwenden geprüft (Freischaltung/Tier).</div>' : '') +
      (() => {
        const shopping = loadoutShoppingList(loadout);
        const gap = loadoutMaterialGap(loadout);
        const rows = shopping.map((line) => '<div class="chk-row"><span><strong>' + escapeHtml(line) + '</strong></span></div>').join('');
        const material = 'Material (geschätzt): ' +
          `${gap.need.shards} Shards, ${gap.need.prisms} Prismen, ${gap.need.cores} Kerne` +
          (gap.missing.shards || gap.missing.prisms || gap.missing.cores
            ? ` · es fehlen ${gap.missing.shards} Shards, ${gap.missing.prisms} Prismen, ${gap.missing.cores} Kerne`
            : ' · Bestand reicht');
        return (rows || upgrade.unmastered || gap.missing.shards || gap.missing.prisms || gap.missing.cores
          ? '<div class="cmp-sub">Was fehlt mir?</div>' + rows +
            '<div class="chk-row"><span><strong>' + escapeHtml(material) + '</strong><small>Schätzung, Bestand aus dem Snapshot</small></span></div>' +
            '<div class="inv-tool-add"><button type="button" class="btn ghost small" data-chk-copy-shopping>Liste kopieren</button></div>'
          : '');
      })() +
      (upgrade.lowList.length ? '<div class="cmp-sub">Energie-Upgrades (Kapazität → 10)</div>' +
        upgrade.lowList.map((entry) => '<div class="chk-row"><span><strong>' + escapeHtml(entry.name) + '</strong><small>' + entry.capacity + ' → 10</small></span></div>').join('') : '') +
      (itemRows ? '<div class="cmp-sub">Ausrüsten</div>' + itemRows : '') +
      (modRows ? '<div class="cmp-sub">Mods</div>' + modRows : '') +
      (perkRows ? '<div class="cmp-sub">Artefakt</div>' + perkRows : '') +
      (subRows ? '<div class="cmp-sub">Subklasse</div>' + subRows : '') +
      '<div class="inv-tool-muted">Häkchen werden pro Loadout gespeichert. Der Materialaufwand ist eine Schätzung aus dem Inventar.</div>';
    checklistRoot.classList.remove('hidden');
  }

  function checklistAsText(id) {
    const loadout = getLoadoutList().find((entry) => entry.id === id);
    if (!loadout) return '';
    const checks = loadoutChecks(id);
    const upgrade = loadoutUpgradeSummary(loadout);
    const lines = ['Loadout: ' + (loadout.name || 'Loadout'), ''];
    const add = (title, list, prefix) => {
      if (!list.length) return;
      lines.push(title + ':');
      list.forEach((entry, index) => lines.push('  [' + (checks[prefix + ':' + index] ? 'x' : ' ') + '] ' + (entry.name || entry.n || 'Eintrag')));
    };
    add('Ausrüsten', loadout.items || [], 'item');
    add('Mods', loadout.mods || [], 'mod');
    add('Artefakt', loadout.artifactPerks || [], 'perk');
    add('Subklasse', loadout.subclassPlugs || [], 'sub');
    lines.push('', 'Meisterwerk offen: ' + upgrade.unmastered + '/' + upgrade.total);
    lines.push('Energie unter 10: ' + upgrade.lowEnergy);
    lines.push('Material: ' + upgrade.shards + ' Shards · ' + upgrade.prisms + ' Prismen · ' + upgrade.cores + ' Kerne');
    return lines.join('\n');
  }

  // ---------- Offline-Warteschlange ----------
  function readQueue() {
    try {
      const list = JSON.parse(window.localStorage.getItem('d2tool.actionQueue') || '[]');
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function writeQueue(list) {
    try { window.localStorage.setItem('d2tool.actionQueue', JSON.stringify(list.slice(-10))); } catch (error) { /* egal */ }
  }

  function queueOfflineLoadout(loadoutName, characterId, items, mods, perks, subs) {
    const queue = readQueue();
    queue.push({
      loadoutName,
      characterId,
      items: (items || []).map((item) => ({ hash: item.hash, instanceId: item.instanceId, name: item.name, bucket: item.bucket })),
      mods: mods || [],
      perks: perks || [],
      subs: subs || [],
      at: Date.now()
    });
    writeQueue(queue);
  }

  window.addEventListener('d2-run-queue', async () => {
    const queue = readQueue();
    if (!queue.length) return;
    writeQueue([]);
    for (const job of queue) {
      await applyItems(job.loadoutName, job.characterId, job.items, job.mods, job.perks, job.subs);
    }
  });

  // ---------- Build-Assistent ----------
  const WIZARD_STATS = {
    gesundheit: 392767087,
    nahkampf: 4244567218,
    granate: 1735777505,
    super: 144602215,
    klasse: 1943323491,
    waffen: 2996146975
  };
  const WIZARD_ACTIVITIES = [
    { key: 'pve', label: 'PvE / Allgemein', goals: { waffen: 100, granate: 70 }, exoticMode: 'allow', hint: 'Waffen für Schaden und Nachladen, Granate für Fähigkeiten-Uptime. Gesundheit nur als Ausgleich, nicht als Ziel.' },
    { key: 'addclear', label: 'Add-Clear / Beutezug', goals: { granate: 100, super: 90 }, exoticMode: 'allow', hint: 'Granate und Super für Flächenschaden und schnelle Adds.' },
    { key: 'raid', label: 'Raid / Boss-DPS', goals: { waffen: 100, super: 100 }, exoticMode: 'allow', hint: 'Waffen und Super für Boss-Schaden; Granate als Ergänzung.' },
    { key: 'dungeon', label: 'Dungeon / Solo', goals: { waffen: 100, klasse: 100 }, exoticMode: 'allow', hint: 'Waffen und Klasse – Schaden plus Overshield für Solo-Läufe.' },
    { key: 'gm', label: 'Großmeister / Nightfall', goals: { granate: 100, super: 80 }, exoticMode: 'forbid', hint: 'Granate und Super für kontrollierten Schaden; Exoten aus, damit der Slot frei bleibt.' },
    { key: 'pvp', label: 'PvP / Schmelztiegel', goals: { waffen: 100, klasse: 100 }, exoticMode: 'allow', hint: 'Waffen für TTK-Breakpoints, Klasse für Overshield im Duell.' },
    { key: 'support', label: 'Support / Clan', goals: { klasse: 100, super: 90 }, exoticMode: 'allow', hint: 'Klasse und Super für Rift/Barrikade und häufige Supers.' },
    { key: 'melee', label: 'Nahkampf / Brawler', goals: { nahkampf: 100, waffen: 70 }, exoticMode: 'allow', hint: 'Nahkampf für Schaden und Uptime, Waffen als Grundschaden.' }
  ];
  let wizardRoot = null;

  function wizardGoals(activity) {
    const goals = {};
    for (const [key, value] of Object.entries(activity.goals || {})) {
      const hash = WIZARD_STATS[key];
      if (hash) goals[hash] = value;
    }
    return goals;
  }

  function openBuildWizard() {
    if (!wizardRoot) {
      wizardRoot = document.createElement('div');
      wizardRoot.className = 'cmd-palette hidden';
      wizardRoot.innerHTML = '<div class="cmd-box cmp-box" role="dialog" aria-modal="true" aria-label="Build-Assistent">' +
        '<div class="wn-head"><strong>Build-Assistent</strong><button type="button" class="icon-btn" data-wiz-close aria-label="Schließen">✕</button></div>' +
        '<div class="cmp-body">' +
          '<label class="chk-row" style="flex-direction:column;align-items:stretch"><strong>Klasse</strong>' +
            '<select data-wiz-class><option value="0">Titan</option><option value="1">Jäger</option><option value="2">Warlock</option></select></label>' +
          '<label class="chk-row" style="flex-direction:column;align-items:stretch;margin-top:8px"><strong>Aktivität</strong>' +
            '<select data-wiz-activity>' + WIZARD_ACTIVITIES.map((entry) => `<option value="${entry.key}">${escapeHtml(entry.label)}</option>`).join('') + '</select></label>' +
          '<div class="chk-summary" data-wiz-summary style="margin-top:10px"></div>' +
          '<div class="inv-tool-muted" style="margin-top:8px">Der Assistent setzt Ziele, Meisterwerk und Exoten-Regel und startet den Picker. Danach kannst du feinjustieren.</div>' +
          '<div class="wn-foot" style="padding:10px 0 0"><button type="button" class="btn primary small" data-wiz-start>Picker starten</button></div>' +
        '</div>' +
      '</div>';
      document.body.appendChild(wizardRoot);
      const summary = () => {
        const activity = WIZARD_ACTIVITIES.find((entry) => entry.key === wizardRoot.querySelector('[data-wiz-activity]').value) || WIZARD_ACTIVITIES[0];
        const goals = wizardGoals(activity);
        const labels = { 392767087: 'Gesundheit', 4244567218: 'Nahkampf', 1735777505: 'Granate', 144602215: 'Super', 1943323491: 'Klasse', 2996146975: 'Waffen' };
        wizardRoot.querySelector('[data-wiz-summary]').innerHTML =
          Object.entries(goals).map(([hash, value]) => `<span>${labels[hash] || 'Stat'} <b>${value}</b></span>`).join('') +
          `<span>Meisterwerk <b>an</b></span><span>Exoten <b>${activity.exoticMode === 'forbid' ? 'aus' : 'erlaubt'}</b></span>` +
          `<div class="inv-tool-muted" style="flex-basis:100%;margin-top:4px">${escapeHtml(activity.hint)}</div>`;
      };
      wizardRoot.addEventListener('change', summary);
      wizardRoot.addEventListener('click', (event) => {
        if (event.target === wizardRoot || event.target.closest('[data-wiz-close]')) wizardRoot.classList.add('hidden');
        if (!event.target.closest('[data-wiz-start]')) return;
        const activity = WIZARD_ACTIVITIES.find((entry) => entry.key === wizardRoot.querySelector('[data-wiz-activity]').value) || WIZARD_ACTIVITIES[0];
        const setup = {
          class: Number(wizardRoot.querySelector('[data-wiz-class]').value) || 0,
          goals: wizardGoals(activity),
          masterwork: true,
          exoticMode: activity.exoticMode,
          sort: 'goals'
        };
        wizardRoot.classList.add('hidden');
        showTab('tools');
        ensureTools().then(() => {
          window.dispatchEvent(new CustomEvent('d2-picker-setup', { detail: setup }));
          toast('Ziele gesetzt – Picker rechnet …', 'success', 2400);
        });
      });
      summary();
    }
    wizardRoot.classList.remove('hidden');
  }

  // ---------- Befehlspalette (Strg+K) ----------
  let paletteRoot = null;
  let paletteInput = null;
  let paletteList = null;
  let paletteIndex = 0;
  let paletteEntries = [];

  function paletteActions() {
    const actions = [
      { label: 'Inventar öffnen', hint: 'Tab', run: () => showTab('inventory') },
      { label: 'Loadout-Editor öffnen', hint: 'Tab', run: () => { showTab('loadouts'); openEditorTab(); } },
      { label: 'Werkzeuge öffnen', hint: 'Tab', run: () => showTab('tools') },
      { label: 'Werkzeug: Übersicht', hint: 'Bereich', run: () => paletteToolsView('overview') },
      { label: 'Werkzeug: Builds & Picker', hint: 'Bereich', run: () => paletteToolsView('builds') },
      { label: 'Werkzeug: Sammlung', hint: 'Bereich', run: () => paletteToolsView('collection') },
      { label: 'Werkzeug: Woche', hint: 'Bereich', run: () => paletteToolsView('week') },
      { label: 'Werkzeug: Händler', hint: 'Bereich', run: () => paletteToolsView('vendor') },
      { label: 'Inventar aktualisieren', hint: 'Aktion', run: () => { showTab('inventory'); refresh(true); } },
      { label: 'Neues Loadout erstellen', hint: 'Aktion', run: () => { showTab('loadouts'); openEditor(''); } },
      { label: 'Quellen durchsuchen', hint: 'Aktion', run: () => paletteToolsSearch('', 'collection', 'sources') },
      { label: 'Was ist neu?', hint: 'Hilfe', run: () => showWhatsNew(true) },
      { label: 'Build-Assistent', hint: 'Hilfe', run: () => openBuildWizard() },
      { label: 'Hilfe & Erklärungen', hint: 'Hilfe', run: () => window.dispatchEvent(new CustomEvent('d2-help')) }
    ];
    for (const loadout of getLoadoutList().slice(0, 12)) {
      actions.push({
        label: 'Loadout: ' + (loadout.name || 'Loadout'),
        hint: 'Loadout',
        run: () => { showTab('loadouts'); openEditor(String(loadout.id)); }
      });
    }
    return actions;
  }

  function paletteToolsView(view) {
    showTab('tools');
    window.dispatchEvent(new CustomEvent('d2-tools-view', { detail: { view } }));
  }

  function paletteToolsSearch(search, view, collection) {
    showTab('tools');
    window.dispatchEvent(new CustomEvent('d2-tools-search', { detail: { search, view, collection } }));
  }

  function paletteSearchItems(query) {
    const text = String(query || '').trim().toLowerCase();
    if (text.length < 2) return [];
    const seen = new Set();
    const hits = [];
    for (const item of allItemsPool()) {
      const name = String(item.name || '');
      if (!name || !name.toLowerCase().includes(text)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        label: name,
        hint: 'Item',
        run: () => { showTab('inventory'); paletteSetSearch('name:"' + name + '"'); }
      });
      if (hits.length >= 8) break;
    }
    return hits;
  }

  function paletteSetSearch(value) {
    const input = qs('#inventorySearch');
    if (!input) return;
    input.value = String(value || '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function paletteRender() {
    if (!paletteList || !paletteInput) return;
    const query = String(paletteInput.value || '').trim();
    const actions = paletteActions().filter((entry) => !query || entry.label.toLowerCase().includes(query.toLowerCase()));
    const operatorSearch = /(^|\s)(is:|stat:|name:|perk:)/i.test(query)
      ? [{ label: 'Im Inventar suchen: ' + query, hint: 'Suche', run: () => { showTab('inventory'); paletteSetSearch(query); } }]
      : [];
    paletteEntries = operatorSearch.concat(actions).concat(paletteSearchItems(query)).slice(0, 24);
    if (paletteIndex >= paletteEntries.length) paletteIndex = Math.max(0, paletteEntries.length - 1);
    paletteList.innerHTML = paletteEntries.length
      ? paletteEntries.map((entry, index) => {
          const cls = 'cmd-entry' + (index === paletteIndex ? ' on' : '');
          return '<button type="button" class="' + cls + '" data-cmd-index="' + index + '">' +
            '<span class="cmd-label">' + escapeHtml(entry.label) + '</span>' +
            '<span class="cmd-hint">' + escapeHtml(entry.hint || '') + '</span></button>';
        }).join('')
      : '<div class="cmd-empty">Kein Treffer.</div>';
  }

  function paletteRun(index) {
    const entry = paletteEntries[Number(index)];
    if (!entry) return;
    paletteClose();
    try { entry.run(); } catch (error) { toast(error.message || String(error), 'error', 2400); }
  }

  function paletteClose() {
    if (!paletteRoot) return;
    paletteRoot.classList.add('hidden');
    document.removeEventListener('keydown', paletteKeydown, true);
  }

  function paletteKeydown(event) {
    if (!paletteRoot || paletteRoot.classList.contains('hidden')) return;
    if (event.key === 'Escape') { event.preventDefault(); paletteClose(); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      paletteIndex = Math.min(paletteEntries.length - 1, paletteIndex + 1);
      paletteRender();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      paletteIndex = Math.max(0, paletteIndex - 1);
      paletteRender();
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); paletteRun(paletteIndex); }
  }

  function paletteOpen() {
    if (!paletteRoot) {
      paletteRoot = document.createElement('div');
      paletteRoot.className = 'cmd-palette hidden';
      paletteRoot.innerHTML = '<div class="cmd-box" role="dialog" aria-modal="true" aria-label="Befehlspalette">' +
        '<input type="search" class="cmd-input" placeholder="Springen, suchen oder Aktion ausführen …" aria-label="Befehlspalette">' +
        '<div class="cmd-list" role="listbox"></div>' +
        '<div class="cmd-foot"><span>↑↓ wählen · Enter ausführen · Esc schließen</span><span>Strg+K</span></div>' +
      '</div>';
      document.body.appendChild(paletteRoot);
      paletteInput = paletteRoot.querySelector('.cmd-input');
      paletteList = paletteRoot.querySelector('.cmd-list');
      paletteInput.addEventListener('input', () => { paletteIndex = 0; paletteRender(); });
      paletteList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-cmd-index]');
        if (button) paletteRun(button.dataset.cmdIndex);
      });
      paletteRoot.addEventListener('mousedown', (event) => { if (event.target === paletteRoot) paletteClose(); });
    }
    paletteRoot.classList.remove('hidden');
    paletteInput.value = '';
    paletteIndex = 0;
    paletteRender();
    paletteInput.focus();
    document.addEventListener('keydown', paletteKeydown, true);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const overlay = document.querySelector('.cmd-palette:not(.hidden)');
    if (!overlay) return;
    const focusables = [...overlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      if (paletteRoot && !paletteRoot.classList.contains('hidden')) {
        paletteClose();
        return;
      }
      if (isHidden()) open();
      paletteOpen();
    }
  });

  // ---------- Barrierefreiheit: Skip-Links, Live-Region, Pfeilnavigation ----------
  function setupA11y() {
    if (!document.querySelector('.skip-links')) {
      const skip = document.createElement('div');
      skip.className = 'skip-links';
      skip.innerHTML = '<button type="button" data-skip="search">Zur Suche</button><button type="button" data-skip="content">Zum Inhalt</button>';
      document.body.insertBefore(skip, document.body.firstChild);
      skip.addEventListener('click', (event) => {
        const button = event.target.closest('[data-skip]');
        if (!button) return;
        if (button.dataset.skip === 'search') {
          const input = qs('#inventorySearch');
          if (input) { input.focus(); input.select(); }
        } else {
          const target = qs('#inventoryBody') || body;
          if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }); }
        }
      });
    }
    if (!document.querySelector('#invLive')) {
      const live = document.createElement('div');
      live.id = 'invLive';
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      document.body.appendChild(live);
    }
  }

  setupA11y();

  document.addEventListener('keydown', (event) => {
    if (!isOpen() || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains('dinv-tile')) return;
    const tiles = [...(body ? body.querySelectorAll('.dinv-tile') : [])];
    const index = tiles.indexOf(active);
    if (index < 0) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 5 : -5;
    const next = tiles[Math.max(0, Math.min(tiles.length - 1, index + step))];
    if (next && next !== active) {
      event.preventDefault();
      try { next.focus({ preventScroll: true }); } catch (error) { next.focus(); }
      try { next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (error) { /* egal */ }
    }
  });

  // ---------- Event-Handler ----------
  // Controller-B (app.js sendet dieses Event): zuerst Unterdialoge
  // schließen, erst dann die Inventar-Seite verlassen.
  window.addEventListener('d2-open-loadout-editor', () => {
    if (isHidden()) return;
    showTab('loadouts');
    openEditorTab();
  });
  // Dashboard-Aktionen: Inventar mit passendem Tab/Filter öffnen.
  // Nach dem Vorladen (Spielstart/Reset) die Ansicht ohne API-Abruf
  // aus dem frischen Snapshot aktualisieren.
  if (api.onInventoryPrefetched) {
    api.onInventoryPrefetched(() => {
      if (isHidden() || loading) return;
      api.bungieInventoryCached().then((snapshot) => {
        if (!snapshot || !snapshot.ok) return;
        data = snapshot;
        setToolsData(snapshot);
        const ts = (value) => { const t = Date.parse(String(value || '')); return Number.isFinite(t) ? t : 0; };
        (data.characters || []).sort((a, b) => ts(b.lastPlayed) - ts(a.lastPlayed));
        try { renderStatus(); } catch (error) { /* egal */ }
        try { render(); } catch (error) { /* egal */ }
        try { renderLoadouts(); } catch (error) { /* egal */ }
      }).catch(() => {});
    });
  }
  // Controller: LB/RB wechselt im Loadout-Editor zwischen den Bereichen,
  // B schließt zuerst den Picker und dann den Editor.
  window.addEventListener('d2-loadout-section', (event) => {
    if (!editorTab || editorTab.classList.contains('hidden')) return;
    if (!drawerRoot || drawerRoot.classList.contains('hidden')) return;
    if (drawerSheetEl && !drawerSheetEl.classList.contains('hidden')) {
      event.preventDefault();
      return;
    }
    const sections = [...drawerRoot.querySelectorAll('.inv-dw-section')].filter((section) => !section.classList.contains('hidden'));
    if (!sections.length) return;
    const direction = Number(event.detail && event.detail.direction) < 0 ? -1 : 1;
    const current = sections.findIndex((section) => section.contains(document.activeElement));
    const index = current < 0
      ? (direction > 0 ? 0 : sections.length - 1)
      : (current + direction + sections.length) % sections.length;
    const target = sections[index];
    const focusable = target.querySelector('.inv-dw-tile[tabindex="0"], [data-dw-sock-open], [tabindex="0"], button:not(:disabled), input:not(:disabled), select:not(:disabled)');
    if (focusable) {
      try { focusable.focus({ preventScroll: true }); } catch (error) { focusable.focus(); }
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (error) { target.scrollIntoView(); }
      event.preventDefault();
    }
  });
  window.addEventListener('d2-loadout-back', (event) => {
    if (!editorTab || editorTab.classList.contains('hidden')) return;
    if (drawerSheetEl && !drawerSheetEl.classList.contains('hidden')) {
      closeSheet();
      event.preventDefault();
      return;
    }
    if (drawerRoot && !drawerRoot.classList.contains('hidden')) {
      closeEditor();
      event.preventDefault();
    }
  });

  window.addEventListener('d2-inventory-show', (event) => {
    const detail = (event && event.detail) || {};
    if (isHidden()) open();
    if (detail.tab === 'tools') {
      showTab('tools');
    } else {
      showTab('inventory');
    }
    if (detail.godrollOnly != null) {
      searchState.godrollOnly = detail.godrollOnly === true;
      if (godrollBtn) godrollBtn.classList.toggle('active', searchState.godrollOnly);
    }
    if (detail.search != null && searchInput) {
      searchInput.value = String(detail.search || '');
      try { window.localStorage.setItem('d2inv.lastSearch', searchInput.value); } catch (error) { /* egal */ }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (detail.tab !== 'tools') {
      render();
    }
    if (detail.view) {
      setTimeout(() => window.dispatchEvent(new CustomEvent('d2-tools-view', { detail: { view: detail.view } })), 40);
    }
    if (detail.postmaster) {
      setTimeout(() => openPostmaster(), 140);
    }
  });
  // Rechtsklick auf eine Kachel öffnet das Item-Popup (Kontextmenü).
  if (body) {
    body.addEventListener('contextmenu', (event) => {
      const tile = event.target.closest('[data-inv-select]');
      if (!tile) return;
      event.preventDefault();
      const kind = String(tile.dataset.invKind || '');
      const owner = String(tile.dataset.invOwner || '');
      const item = findItem(String(tile.dataset.invSelect || ''), kind, owner);
      if (!item) return;
      selectedItem = { key: String(tile.dataset.invSelect || ''), kind, item, owner };
      openPopup();
    });
  }
  window.addEventListener('d2-open-keyboard', () => {
    if (!isHidden()) openPadKeyboard();
  });
  // Tastatur-Navigation im Inventar-Grid (Pfeile, Enter).
  window.addEventListener('keydown', (event) => {
    if (isHidden()) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key || '').toLowerCase() === 'z' && (journalCanUndo() || undoAction)) {
      event.preventDefault();
      if (journalCanUndo()) {
        journalUndo().then((label) => { if (label) toast(`Rückgängig: ${label}`, 'success', 1800); });
      } else {
        const button = undoBar.querySelector('[data-undo-run]');
        if (button) button.click();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (String(event.key || '').toLowerCase() === 'y' || (event.shiftKey && String(event.key || '').toLowerCase() === 'z')) && journalCanRedo()) {
      event.preventDefault();
      journalRedo().then((label) => { if (label) toast(`Wiederhergestellt: ${label}`, 'success', 1800); });
      return;
    }
    const target = event.target;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const tiles = [...(body ? body.querySelectorAll('.dinv-tile') : [])].filter((tile) => tile.offsetParent !== null);
    if (!tiles.length) return;
    const current = target && target.closest ? target.closest('.dinv-tile') : null;
    const index = current ? tiles.indexOf(current) : -1;
    if (event.key === 'Enter' || event.key === ' ') {
      if (current) {
        event.preventDefault();
        current.click();
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (index < 0) {
      tiles[0].focus();
      return;
    }
    let columns = 1;
    if (tiles.length > 1) {
      const top = tiles[0].getBoundingClientRect().top;
      columns = tiles.filter((tile) => Math.abs(tile.getBoundingClientRect().top - top) < 8).length || 1;
    }
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : -columns;
    const next = Math.max(0, Math.min(tiles.length - 1, index + delta));
    tiles[next].focus();
    tiles[next].scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('d2-inventory-quickmenu', () => {
    if (!isHidden()) openQuickMenu();
  });
  // Controller-Schnellaktionen im Item-Popup (LB/RB/X/Y). Die
  // eigentlichen Aktionen liegen in den Popup-Buttons; hier wird nur
  // der passende Knopf ausgelöst.
  window.addEventListener('d2-inventory-quick', (event) => {
    if (isHidden()) return;
    const popup = view.querySelector('.inv-popup-backdrop.open');
    if (!popup || !event.detail) return;
    const action = String(event.detail.action || '');
    let selector = '';
    if (action === 'to-vault') selector = '[data-inv-act="to-vault"]';
    else if (action === 'to-char') selector = '[data-inv-act="to-char"]';
    else if (action === 'favorite') selector = '[data-inv-act="fav"]';
    else if (action === 'equip') selector = '[data-inv-act="equip"], [data-inv-act="equip-from-vault"]';
    else if (action === 'loadout') selector = '';
    let button = selector ? popup.querySelector(selector) : null;
    if (!button && action === 'to-vault') button = popup.querySelector('[data-inv-act="to-char"]');
    if (button) {
      event.preventDefault();
      button.click();
    }
  });
  window.addEventListener('d2-inventory-back', (event) => {
    if (isHidden()) return;
    if (quickMenu && quickMenu.classList.contains('open')) {
      closeQuickMenu();
      event.preventDefault();
      return;
    }
    if (padKeyboard && padKeyboard.classList.contains('open')) {
      padKeyboard.classList.remove('open');
      event.preventDefault();
      return;
    }
    // Bestätigungs-/Eingabe-Dialog (z. B. Loadout-Vorschau): B
    // entspricht „Abbrechen“.
    const confirmBox = view.querySelector('.inv-confirm-backdrop.open');
    if (confirmBox) {
      const cancel = confirmBox.querySelector('[data-confirm-cancel], [data-input-cancel]');
      if (cancel) cancel.click();
      else confirmBox.classList.remove('open');
      event.preventDefault();
      return;
    }
    if (view.querySelector('.inv-popup-backdrop.open')) {
      closePopup();
      event.preventDefault();
      return;
    }
    if (view.querySelector('.inv-compare-backdrop.open')) {
      closeCompare();
      event.preventDefault();
      return;
    }
    if (drawerSheetEl && !drawerSheetEl.classList.contains('hidden')) {
      closeSheet();
      event.preventDefault();
      return;
    }
    if (drawerRoot && !drawerRoot.classList.contains('hidden')) {
      closeEditor();
      event.preventDefault();
    }
  });
  if (body) {
    // Tresor-Aufklapper („Alle anzeigen“ / „Weniger anzeigen“).
    body.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-vault-toggle]');
      if (!toggle) return;
      event.preventDefault();
      const cell = toggle.closest('[data-vault-collapse]');
      if (!cell) return;
      const key = cell.dataset.vaultCollapse;
      if (expandedVaults.has(key)) expandedVaults.delete(key);
      else expandedVaults.add(key);
      persistExpandedVaults();
      applyVaultCollapse();
    });
    body.addEventListener('click', async (event) => {
      const chunkMore = event.target.closest('[data-inv-chunk-more]');
      if (chunkMore) {
        appendChunk(String(chunkMore.dataset.invChunkMore || ''));
        return;
      }
      const moreTiles = event.target.closest('[data-inv-more]');
      if (moreTiles) {
        expandedTileLists.add(String(moreTiles.dataset.invMore || ''));
        render();
        return;
      }
      const loginBtn = event.target.closest('[data-inv-login]');
      if (loginBtn) {
        loginBtn.disabled = true;
        try {
          const result = await api.bungieOAuthStart();
          if (!result || !result.ok) toast((result && result.error) || 'Anmeldung konnte nicht gestartet werden.', 'error');
          else toast('Bungie-Fenster geöffnet – nach der Autorisierung „Aktualisieren“ drücken.', 'info', 4200);
        } finally {
          loginBtn.disabled = false;
        }
        return;
      }
      const copyDiag = event.target.closest('[data-inv-copy-diag]');
      if (copyDiag && lastDiagnostics) {
        const result = await api.copyToClipboard(JSON.stringify(lastDiagnostics, null, 2));
        if (result && result.ok) toast('Diagnose kopiert.', 'success', 2000);
        return;
      }
      const copyBundle = event.target.closest('[data-inv-copy-bundle]');
      if (copyBundle) {
        const bundle = await api.diagnosticCopy();
        if (bundle && bundle.ok) {
          const copied = await api.copyToClipboard(bundle.text);
          if (copied && copied.ok) toast('Diagnose-Paket in die Zwischenablage kopiert.', 'success', 2400);
        } else {
          toast('Diagnose konnte nicht erstellt werden.', 'error', 2400);
        }
        return;
      }
      const pullBtn = event.target.closest('[data-inv-pull]');
      if (pullBtn) { pullBtn.disabled = true; await pullPostmaster(String(pullBtn.dataset.invPull || '')); return; }
      const tile = event.target.closest('[data-inv-select]');
      if (!tile) return;
      if (justDragged) { justDragged = false; return; }
      // Strg/Cmd/Shift: Mehrfachauswahl statt Popup.
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        event.preventDefault();
        const multiKey = tileKey(tile);
        if (selection.has(multiKey)) selection.delete(multiKey);
        else {
          const multiItem = findItem(String(tile.dataset.invSelect || ''), String(tile.dataset.invKind || ''), String(tile.dataset.invOwner || ''));
          if (multiItem) {
            selection.set(multiKey, {
              key: multiKey,
              kind: String(tile.dataset.invKind || ''),
              owner: String(tile.dataset.invOwner || ''),
              item: multiItem
            });
          }
        }
        updateSelectionUi();
        return;
      }
      const key = String(tile.dataset.invSelect || '');
      const kind = String(tile.dataset.invKind || '');
      const owner = String(tile.dataset.invOwner || '');
      if (selectedItem && selectedItem.key === key && selectedItem.kind === kind) { closePopup(); return; }
      const item = findItem(key, kind, owner);
      if (!item) return;
      selectedItem = { key, kind, item, owner };
      for (const marked of body.querySelectorAll('.dinv-tile.selected')) marked.classList.remove('selected');
      tile.classList.add('selected');
      openPopup();
    });
    body.addEventListener('contextmenu', (event) => {
      const tile = event.target.closest('[data-inv-select]');
      if (!tile) return;
      event.preventDefault();
      hideTooltip();
      const kind = String(tile.dataset.invKind || '');
      const owner = String(tile.dataset.invOwner || '');
      const item = findItem(String(tile.dataset.invSelect || ''), kind, owner);
      if (!item) return;
      if (kind === 'backpack') doTransfer(item, true, owner);
      else if (kind === 'vault' || kind === 'postmaster' || kind === 'equipped') {
        selectedItem = { key: String(tile.dataset.invSelect || ''), kind, item, owner };
        for (const marked of body.querySelectorAll('.dinv-tile.selected')) marked.classList.remove('selected');
        tile.classList.add('selected');
        openPopup();
      } else toast('Angelegte Items müssen im Spiel abgelegt werden.', 'info', 2400);
    });
    body.addEventListener('mouseover', (event) => {
      const tile = event.target.closest('[data-inv-select]');
      if (!tile || !tooltipEl) return;
      const item = findItem(String(tile.dataset.invSelect || ''), String(tile.dataset.invKind || ''), String(tile.dataset.invOwner || ''));
      if (!item) return;
      tooltipEl.innerHTML = tooltipHtml(item);
      positionTooltip(tile);
    });
    body.addEventListener('mouseout', (event) => {
      const tile = event.target.closest('[data-inv-select]');
      if (!tile) return;
      const to = event.relatedTarget;
      if (to && tile.contains(to)) return;
      hideTooltip();
    });
    body.addEventListener('scroll', hideTooltip, { passive: true });
    const topBtn = qs('#inventoryTopBtn');
    if (topBtn) {
      body.addEventListener('scroll', () => {
        topBtn.classList.toggle('hidden', body.scrollTop < 400);
      }, { passive: true });
      topBtn.addEventListener('click', () => {
        try { body.scrollTo({ top: 0, behavior: 'smooth' }); } catch (error) { body.scrollTop = 0; }
      });
    }
    // TV-Modus: Item-Details per Fokus statt Hover.
    body.addEventListener('focusin', (event) => {
      if (!(window.isTvMode && window.isTvMode())) return;
      const tile = event.target.closest('[data-inv-select]');
      if (!tile || !tooltipEl) return;
      const item = findItem(String(tile.dataset.invSelect || ''), String(tile.dataset.invKind || ''), String(tile.dataset.invOwner || ''));
      if (!item) return;
      tooltipEl.innerHTML = tooltipHtml(item);
      positionTooltip(tile);
    });
    body.addEventListener('focusout', (event) => {
      const tile = event.target.closest && event.target.closest('[data-inv-select]');
      if (tile) hideTooltip();
    });
  }

  if (resultBox) {
    resultBox.addEventListener('click', (event) => {
      const actionBtn = event.target.closest('[data-inv-result-action]');
      if (actionBtn) {
        const action = (resultBox._actions || [])[Number(actionBtn.dataset.invResultAction)];
        if (action && typeof action.run === 'function') {
          event.preventDefault();
          action.run();
        }
        return;
      }
      if (event.target.closest('[data-inv-result-close]')) hideResult();
    });
  }

  // Offline-Ausgang: Leiste, Detailpanel und automatischer Versand.
  async function clearOutbox() {
    const list = readOutbox();
    if (!list.length) return;
    const confirmed = typeof confirmAction === 'function'
      ? await confirmAction({
        title: 'Offline-Ausgang verwerfen?',
        lines: [`${list.length} wartende Aktion${list.length === 1 ? '' : 'en'} werden gelöscht.`],
        confirmLabel: 'Verwerfen',
        cancelLabel: 'Behalten',
        danger: true
      })
      : window.confirm('Offline-Ausgang verwerfen?');
    if (!confirmed) return;
    writeOutbox([]);
    toast('Offline-Ausgang verworfen.', 'info', 2000);
  }
  if (outboxBar) {
    qs('#inventoryOutboxRun')?.addEventListener('click', () => {
      runOutbox(true).catch(() => {});
    });
    qs('#inventoryOutboxClear')?.addEventListener('click', () => {
      clearOutbox().catch(() => {});
    });
    qs('#inventoryOutboxDetails')?.addEventListener('click', () => {
      if (!outboxPanel) return;
      outboxPanel.classList.toggle('hidden');
      if (!outboxPanel.classList.contains('hidden')) renderOutboxPanel();
    });
    qs('#inventoryOutboxClose')?.addEventListener('click', () => {
      outboxPanel?.classList.add('hidden');
    });
    qs('#inventoryOutboxRunAll')?.addEventListener('click', () => {
      runOutbox(true).catch(() => {});
    });
    qs('#inventoryOutboxClearAll')?.addEventListener('click', () => {
      clearOutbox().catch(() => {});
    });
    renderOutbox();
    renderOutboxPanel();
  }
  if (outboxPanel) {
    outboxPanel.addEventListener('click', (event) => {
      const up = event.target.closest('[data-outbox-up]');
      if (up) {
        const index = Number(up.dataset.outboxUp);
        const list = readOutbox();
        const target = index - 1;
        if (index > 0 && target >= 0) {
          const [entry] = list.splice(index, 1);
          list.splice(target, 0, entry);
          writeOutbox(list);
        }
        return;
      }
      const down = event.target.closest('[data-outbox-down]');
      if (down) {
        const index = Number(down.dataset.outboxDown);
        const list = readOutbox();
        const target = index + 1;
        if (index >= 0 && target < list.length) {
          const [entry] = list.splice(index, 1);
          list.splice(target, 0, entry);
          writeOutbox(list);
        }
        return;
      }
      const retry = event.target.closest('[data-outbox-retry]');
      if (retry) {
        runOutbox(true, String(retry.dataset.outboxRetry || '')).catch(() => {});
        return;
      }
      const remove = event.target.closest('[data-outbox-remove]');
      if (remove) {
        const id = String(remove.dataset.outboxRemove || '');
        writeOutbox(readOutbox().filter((entry) => entry.id !== id));
      }
    });
  }
  window.addEventListener('online', () => {
    renderOutbox();
    if (readOutbox().length) runOutbox(false).catch(() => {});
  });
  window.addEventListener('d2-outbox-change', () => {
    renderOutbox();
    renderOutboxPanel();
  });
  window.addEventListener('d2-outbox-send', () => {
    runOutbox(true).catch(() => {});
  });
  window.addEventListener('d2-outbox-open', () => {
    if (!outboxPanel) return;
    renderOutboxPanel();
    outboxPanel.classList.remove('hidden');
  });
  window.addEventListener('d2-loadout-queue-open', () => {
    if (!loadoutQueuePanel) return;
    renderLoadoutQueuePanel();
    loadoutQueuePanel.classList.remove('hidden');
  });
  window.addEventListener('d2-champion-audit-open', () => openChampionAudit());

  // Loadout-Warteschlange: Detailpanel, Anhalten, Wiederholen, Sortieren.
  if (loadoutQueueBar) {
    qs('#loadoutQueueDetails')?.addEventListener('click', () => {
      if (!loadoutQueuePanel) return;
      loadoutQueuePanel.classList.toggle('hidden');
      if (!loadoutQueuePanel.classList.contains('hidden')) renderLoadoutQueuePanel();
    });
    qs('#loadoutQueueClose')?.addEventListener('click', () => {
      loadoutQueuePanel?.classList.add('hidden');
    });
    qs('#loadoutQueuePause')?.addEventListener('click', () => {
      loadoutQueuePaused = !loadoutQueuePaused;
      renderLoadoutQueuePanel();
      if (!loadoutQueuePaused) processLoadoutQueue();
    });
    qs('#loadoutQueueClearDone')?.addEventListener('click', () => {
      for (let index = loadoutQueue.length - 1; index >= 0; index -= 1) {
        if (loadoutQueue[index].state === 'done' || loadoutQueue[index].state === 'failed') loadoutQueue.splice(index, 1);
      }
      renderLoadoutQueuePanel();
    });
    renderLoadoutQueuePanel();
    if (loadoutQueuePaused && loadoutQueue.some((entry) => entry.state === 'pending')) {
      showQueueBar('Warteschlange wiederhergestellt – „Fortsetzen“ drücken.', true);
    }
  }
  if (loadoutQueuePanel) {
    loadoutQueuePanel.addEventListener('click', (event) => {
      const up = event.target.closest('[data-loadout-up]');
      if (up) {
        moveLoadoutQueueEntry(Number(up.dataset.loadoutUp), -1);
        return;
      }
      const down = event.target.closest('[data-loadout-down]');
      if (down) {
        moveLoadoutQueueEntry(Number(down.dataset.loadoutDown), 1);
        return;
      }
      const retry = event.target.closest('[data-loadout-retry]');
      if (retry) {
        const entry = loadoutQueue.find((item) => item.id === retry.dataset.loadoutRetry);
        if (entry) {
          entry.state = 'pending';
          entry.error = '';
          renderLoadoutQueuePanel();
          processLoadoutQueue();
        }
        return;
      }
      const remove = event.target.closest('[data-loadout-remove]');
      if (remove) {
        const index = loadoutQueue.findIndex((item) => item.id === remove.dataset.loadoutRemove);
        if (index >= 0 && loadoutQueue[index].state !== 'running') loadoutQueue.splice(index, 1);
        renderLoadoutQueuePanel();
      }
    });
  }
  if (view) {
    view.addEventListener('click', (event) => {
      if (event.target.closest('[data-inv-new-folder]') && selectedItem) {
        const name = String(window.prompt('Neuer Ordner (Name):') || '').trim().slice(0, 40);
        if (!name) return;
        const folders = itemFolders().slice();
        const palette = ['#6b8bb5', '#4ade80', '#f87171', '#facc15', '#a78bfa', '#f472b6'];
        const folder = { id: 'f-' + Date.now().toString(36), name, color: palette[folders.length % palette.length] };
        const map = { ...(((getCfg().bungie && getCfg().bungie.itemFolders) || {})) };
        map[itemTagKey(selectedItem.item)] = folder.id;
        setConfig({ bungie: { folders: folders.concat(folder), itemFolders: map } });
        openPopup();
        return;
      }
      const button = event.target.closest('.inv-popup-action, .inv-popup-close, .inv-tag-btn, [data-inv-act="save-note"]');
      if (!button || !selectedItem) return;
      popupAction(button);
    });
    view.addEventListener('change', (event) => {
      const championSelect = event.target.closest('[data-inv-champion]');
      if (championSelect && selectedItem) {
        setChampionOverride(selectedItem.item, Number(championSelect.value) || 0);
        toast('Champion-Typ gespeichert.', 'success', 1600);
        render();
        if (backdropOpen()) openPopup();
        return;
      }
      const select = event.target.closest('[data-inv-folder]');
      if (!select || !selectedItem) return;
      setItemFolder(selectedItem.item, String(select.value || ''));
      render();
      if (backdropOpen()) openPopup();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (compareOpen()) { event.stopPropagation(); closeCompare(); }
      else if (backdropOpen()) { event.stopPropagation(); closePopup(); }
    }
  });
  attachDragHandlers();
  let searchRenderTimer = 0;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchRenderTimer);
      searchRenderTimer = setTimeout(() => {
        try {
          window.localStorage.setItem('d2inv.lastSearch', String(searchInput.value || ''));
        } catch (error) {
          // egal
        }
        renderSearchChips();
        render();
        // Kein erzwungenes scrollTop = 0: Die Suchleiste bleibt oben
        // sichtbar, waehrend der Inhalt darunter scrollt. Ein Sprung
        // nach oben beim Tippen wirkte wie selbststaendiges Scrollen.
      }, 120);
    });
  }
  if (searchChips) {
    searchChips.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-search-remove]');
      if (remove) {
        const index = Number(remove.dataset.searchRemove) || 0;
        const tokens = activeSearchTokens(searchInput && searchInput.value);
        tokens.splice(index, 1);
        if (searchInput) {
          searchInput.value = tokens.join(' ');
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        renderSearchChips();
        render();
        return;
      }
      const saveBtn = event.target.closest('[data-search-save]');
      if (saveBtn) {
        const query = String((searchInput && searchInput.value) || '').trim();
        if (!query) {
          toast('Erst eine Suche eingeben.', 'info', 1800);
          return;
        }
        const list = savedSearches();
        if (list.includes(query)) {
          toast('Suche ist bereits gemerkt.', 'info', 1600);
          return;
        }
        setSavedSearches(list.concat([query]).slice(0, 8));
        toast('Suche gemerkt.', 'success', 1600);
        return;
      }
      const chip = event.target.closest('[data-search-chip]');
      if (!chip) return;
      if (searchInput) searchInput.value = String(chip.dataset.searchChip || '');
      try {
        window.localStorage.setItem('d2inv.lastSearch', String(searchInput.value || ''));
      } catch (error) {
        // egal
      }
      renderSearchChips();
      render();
    });
    searchChips.addEventListener('contextmenu', (event) => {
      const chip = event.target.closest('[data-search-chip]');
      if (!chip) return;
      event.preventDefault();
      const query = String(chip.dataset.searchChip || '');
      setSavedSearches(savedSearches().filter((entry) => entry !== query));
      toast('Suche entfernt.', 'info', 1600);
    });
  }
  const headControls = qs('.inventory-head-controls');
  if (headControls) {
    for (const id of ((getCfg().quickActionsHidden) || [])) {
      const button = qs(`#${id}`);
      if (button) button.classList.add('hidden');
    }
    headControls.addEventListener('contextmenu', (event) => {
      const button = event.target.closest('button[id]');
      if (!button) return;
      event.preventDefault();
      button.classList.add('hidden');
      const hidden = new Set(((getCfg().quickActionsHidden) || []));
      hidden.add(button.id);
      setConfig({ quickActionsHidden: [...hidden] });
      toast('Schnellaktion ausgeblendet (Einstellungen → Zurücksetzen).', 'info', 2400);
    });
  }
  if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());
  if (closeBtn) closeBtn.addEventListener('click', () => togglePage());
  if (inventoryBtn && !window.__d2InventoryButtonHandled) inventoryBtn.addEventListener('click', () => togglePage());
  if (godrollBtn) {
    godrollBtn.addEventListener('click', () => {
      searchState.godrollOnly = !searchState.godrollOnly;
      godrollBtn.classList.toggle('active', searchState.godrollOnly);
      render();
    });
  }
  if (championAuditBtn) {
    championAuditBtn.addEventListener('click', () => {
      if (championAuditPanel && !championAuditPanel.classList.contains('hidden')) {
        championAuditPanel.classList.add('hidden');
        return;
      }
      openChampionAudit();
    });
  }
  qs('#championAuditClose')?.addEventListener('click', () => championAuditPanel?.classList.add('hidden'));
  qs('#championAuditApply')?.addEventListener('click', () => {
    applyChampionAudit(Number(qs('#championAuditType')?.value) || 1);
  });
  qs('#championAuditClear')?.addEventListener('click', () => {
    applyChampionAudit(0);
  });
  qs('#championAuditUndo')?.addEventListener('click', undoChampionAudit);
  qs('#championAuditSelectAll')?.addEventListener('change', (event) => {
    for (const input of championAuditList?.querySelectorAll('[data-champion-audit-key]') || []) {
      input.checked = event.target.checked === true;
    }
  });
  qs('#championAuditExport')?.addEventListener('click', exportChampionOverrides);
  qs('#championAuditImport')?.addEventListener('click', () => qs('#championAuditFile')?.click());
  qs('#championAuditFile')?.addEventListener('change', (event) => {
    importChampionOverrides(event.target.files && event.target.files[0]).catch(() => {});
    event.target.value = '';
  });
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', async () => {
      wishlistBtn.disabled = true;
      try {
        const result = await api.bungieWishlistRefresh();
        if (result && result.ok) {
          toast('Wunschlisten-Cache geleert – lade neu …', 'info', 2200);
          await refresh(true);
        } else {
          toast((result && result.error) || 'Wunschliste konnte nicht aktualisiert werden.', 'error');
        }
      } catch (error) {
        toast('Wunschliste konnte nicht aktualisiert werden.', 'error');
      } finally {
        wishlistBtn.disabled = false;
      }
    });
  }
  if (duplicatesBtn) duplicatesBtn.addEventListener('click', () => moveDuplicatesToVault());

  if (loadoutSaveBtn) {
    loadoutSaveBtn.addEventListener('click', () => {
      if (!data) { toast('Erst Inventar laden.', 'warning', 2000); return; }
      const saveChar = String((loadoutCharSelect && loadoutCharSelect.value) || (data.characters && data.characters[0] && data.characters[0].id) || '');
      if (!saveChar) return;
      const equipped = (data.equipped && data.equipped[saveChar]) || [];
      const items = equipped.filter((item) => item.instanceId).map((item) => ({ hash: item.hash, instanceId: item.instanceId, name: item.name, typeName: item.typeName, icon: item.icon, bucket: item.bucket }));
      if (!items.length) { toast('Keine angelegten Items zum Sichern.', 'warning', 2000); return; }
      const name = String((loadoutNameInput && loadoutNameInput.value) || '').trim() || `Loadout ${((getCfg().bungie && getCfg().bungie.loadouts) || []).length + 1}`;
      const existing = (getCfg().bungie && getCfg().bungie.loadouts) || [];
      const next = existing.filter((entry) => entry.name !== name).concat([{
        id: 'l-' + Date.now().toString(36),
        name: name.slice(0, 30),
        characterId: saveChar,
        classType: (data.characters.find((c) => c.id === saveChar) || {}).classType || 0,
        items,
        savedAt: Date.now()
      }]).slice(-10);
      setConfig({ bungie: { loadouts: next } });
      if (loadoutNameInput) loadoutNameInput.value = '';
      renderLoadouts();
      toast(`Loadout "${name}" gesichert.`, 'success', 2200);
    });
  }
  if (loadoutList) {
    loadoutList.addEventListener('click', async (event) => {
      const applyMissingBtn = event.target.closest('[data-loadout-apply-missing]');
      if (applyMissingBtn) {
        applyMissingBtn.disabled = true;
        await applyLoadout(String(applyMissingBtn.dataset.loadoutApplyMissing || ''), { missingOnly: true });
        return;
      }
      const queueBtn = event.target.closest('[data-loadout-queue]');
      if (queueBtn) { queueLoadout(String(queueBtn.dataset.loadoutQueue || '')); return; }
      const applyBtn = event.target.closest('[data-loadout-apply]');
      if (applyBtn) { applyBtn.disabled = true; await applyLoadout(applyBtn.dataset.loadoutApply); return; }
      const editBtn = event.target.closest('[data-loadout-edit]');
      if (editBtn) { openEditor(String(editBtn.dataset.loadoutEdit || '')); return; }
      const delBtn = event.target.closest('[data-loadout-delete]');
      if (delBtn) {
        const next = ((getCfg().bungie && getCfg().bungie.loadouts) || []).filter((entry) => entry.id !== delBtn.dataset.loadoutDelete);
        setConfig({ bungie: { loadouts: next } });
        renderLoadouts();
        toast('Loadout gelöscht.', 'info', 1400);
      }
    });
  }

  // Sortier-Select (Toolbar): Power / Name / Seltenheit.
  if (loadoutNameInput && loadoutNameInput.parentNode) {
    const sortSelect = document.createElement('select');
    sortSelect.className = 'inventory-sort';
    sortSelect.setAttribute('aria-label', 'Sortierung');
    sortSelect.innerHTML = `<option value="power">⇅ Power</option><option value="name">⇅ Name</option><option value="rarity">⇅ Seltenheit</option><option value="stats">⇅ Stat-Summe</option><option value="tier">⇅ Gear-Tier</option><option value="archetype">⇅ Archetyp</option>` +
      DIM.CHAR_STAT_HASHES.map((hash) => `<option value="stat:${hash}">⇅ ${DIM.STAT_LABELS[String(hash)] || 'Stat'}</option>`).join('');
    sortSelect.value = (getCfg().bungie && getCfg().bungie.itemSort) || 'power';
    sortSelect.addEventListener('change', () => {
      setConfig({ bungie: { itemSort: String(sortSelect.value || 'power') } });
      render();
    });
    loadoutNameInput.parentNode.insertBefore(sortSelect, loadoutNameInput);
    const densityBtn = document.createElement('button');
    densityBtn.type = 'button';
    densityBtn.className = 'btn ghost small';
    densityBtn.textContent = '▦ Dichte';
    densityBtn.title = 'Grid-/Listen-Dichte umschalten';
    densityBtn.addEventListener('click', () => {
      const current = (getCfg().bungie && getCfg().bungie.inventoryDensity) || 'comfortable';
      const next = current === 'compact' ? 'comfortable' : 'compact';
      setConfig({ bungie: { inventoryDensity: next } });
      densityBtn.textContent = next === 'compact' ? '▦ Kompakt' : '▦ Dichte';
      render();
    });
    sortSelect.parentNode.insertBefore(densityBtn, sortSelect.nextSibling);

    // Gespeicherte Ansichten / Smart-Filter
    const PRESET_VIEWS = [
      { id: 'preset-god', name: 'Godrolls', query: 'is:godroll' },
      { id: 'preset-near', name: 'Fast-Godrolls', query: 'is:neargodroll' },
      { id: 'preset-dupe', name: 'Duplikate', query: 'is:dupe' },
      { id: 'preset-noted', name: 'Mit Notiz', query: 'is:noted' },
      { id: 'preset-locked', name: 'Markiert', query: 'is:locked' },
      { id: 'preset-master', name: 'Meisterwerk', query: 'is:masterworked' }
    ];
    const viewsSelect = document.createElement('select');
    viewsSelect.className = 'inventory-sort';
    viewsSelect.setAttribute('aria-label', 'Gespeicherte Ansichten');
    const saveViewBtn = document.createElement('button');
    saveViewBtn.type = 'button';
    saveViewBtn.className = 'btn ghost small';
    saveViewBtn.textContent = '＋ Ansicht';
    saveViewBtn.title = 'Aktuelle Suche als Ansicht speichern';
    const deleteViewBtn = document.createElement('button');
    deleteViewBtn.type = 'button';
    deleteViewBtn.className = 'btn ghost small';
    deleteViewBtn.textContent = '−';
    deleteViewBtn.title = 'Ausgewählte eigene Ansicht löschen';
    const refreshViews = () => {
      const saved = (getCfg().bungie && getCfg().bungie.savedViews) || [];
      viewsSelect.innerHTML = `<option value="">Ansicht …</option>` +
        PRESET_VIEWS.map((view) => `<option value="p:${view.id}">${view.name}</option>`).join('') +
        saved.map((view) => `<option value="s:${view.id}">${escapeHtml(view.name)}</option>`).join('');
      viewsSelect.value = '';
    };
    const applyView = (query) => {
      if (!searchInput) return;
      searchInput.value = String(query || '');
      try { window.localStorage.setItem('d2inv.lastSearch', searchInput.value); } catch (error) { /* egal */ }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    };
    viewsSelect.addEventListener('change', () => {
      const value = String(viewsSelect.value || '');
      if (!value) return;
      if (value.startsWith('p:')) {
        const preset = PRESET_VIEWS.find((view) => view.id === value.slice(2));
        if (preset) applyView(preset.query);
      } else if (value.startsWith('s:')) {
        const saved = ((getCfg().bungie && getCfg().bungie.savedViews) || []).find((view) => view.id === value.slice(2));
        if (saved) applyView(saved.query);
      }
      viewsSelect.value = '';
    });
    saveViewBtn.addEventListener('click', () => {
      const query = String((searchInput && searchInput.value) || '').trim();
      if (!query) {
        toast('Erst eine Suche eingeben.', 'info', 1800);
        return;
      }
      const name = String(window.prompt('Name der Ansicht:', query.slice(0, 30)) || '').trim().slice(0, 40);
      if (!name) return;
      const saved = ((getCfg().bungie && getCfg().bungie.savedViews) || []).slice();
      saved.unshift({ id: 'v-' + Date.now().toString(36), name, query: query.slice(0, 120) });
      setConfig({ bungie: { savedViews: saved.slice(0, 20) } });
      refreshViews();
      toast(`Ansicht „${name}“ gespeichert.`, 'success', 2000);
    });
    deleteViewBtn.addEventListener('click', () => {
      const saved = ((getCfg().bungie && getCfg().bungie.savedViews) || []).slice();
      if (!saved.length) {
        toast('Keine eigene Ansicht gespeichert.', 'info', 1800);
        return;
      }
      const name = String(window.prompt(`Welche Ansicht löschen?\n${saved.map((view) => view.name).join(', ')}`, saved[0].name) || '').trim();
      if (!name) return;
      const next = saved.filter((view) => view.name !== name);
      if (next.length === saved.length) {
        toast('Ansicht nicht gefunden.', 'info', 1800);
        return;
      }
      setConfig({ bungie: { savedViews: next } });
      refreshViews();
      toast('Ansicht gelöscht.', 'info', 1600);
    });
    refreshViews();
    sortSelect.parentNode.insertBefore(viewsSelect, densityBtn.nextSibling);
    sortSelect.parentNode.insertBefore(saveViewBtn, viewsSelect.nextSibling);
    sortSelect.parentNode.insertBefore(deleteViewBtn, saveViewBtn.nextSibling);
    const clipBtn = document.createElement('button');
    clipBtn.type = 'button';
    clipBtn.className = 'btn ghost small';
    clipBtn.textContent = '📋 Import';
    clipBtn.title = 'DIM-Link oder Teilen-Code aus der Zwischenablage importieren';
    clipBtn.addEventListener('click', () => importClipboardLoadout());
    sortSelect.parentNode.insertBefore(clipBtn, deleteViewBtn.nextSibling);
    const undoSessionBtn = document.createElement('button');
    undoSessionBtn.type = 'button';
    undoSessionBtn.className = 'btn ghost small';
    undoSessionBtn.textContent = '↶ Session';
    undoSessionBtn.title = 'Tags der letzten Sitzung wiederherstellen';
    undoSessionBtn.addEventListener('click', () => {
      let saved = null;
      try { saved = JSON.parse(window.localStorage.getItem('d2inv.undoTags') || 'null'); } catch (error) { saved = null; }
      if (!saved || !saved.previous) {
        toast('Keine gespeicherte Tag-Aktion.', 'info', 2000);
        return;
      }
      setConfig({ bungie: { itemTags: { ...saved.previous } } });
      window.localStorage.removeItem('d2inv.undoTags');
      toast('Tags der letzten Sitzung wiederhergestellt.', 'success', 2400);
      render();
    });
    sortSelect.parentNode.insertBefore(undoSessionBtn, clipBtn.nextSibling);
  }

  // Editor-Button neben „Loadout sichern" (Toolbar).
  if (loadoutSaveBtn && loadoutSaveBtn.parentNode) {
    const buildBtn = document.createElement('button');
    buildBtn.type = 'button';
    buildBtn.className = 'btn ghost small';
    buildBtn.textContent = '🛠 Loadout bauen';
    buildBtn.addEventListener('click', () => openEditor());
    loadoutSaveBtn.parentNode.insertBefore(buildBtn, loadoutSaveBtn);
  }

  if (loadoutSaveBtn && loadoutSaveBtn.parentNode) {
    const captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.className = 'btn ghost small';
    captureBtn.textContent = 'Getragenes Set';
    captureBtn.addEventListener('click', () => captureEquippedSet());
    loadoutSaveBtn.parentNode.insertBefore(captureBtn, loadoutSaveBtn);

    const wizardBtn = document.createElement('button');
    wizardBtn.type = 'button';
    wizardBtn.className = 'btn ghost small';
    wizardBtn.textContent = 'Build-Assistent';
    wizardBtn.addEventListener('click', () => openBuildWizard());
    loadoutSaveBtn.parentNode.insertBefore(wizardBtn, captureBtn);
  }

  // Farming-Modus-Button (Toolbar).
  if (loadoutSaveBtn && loadoutSaveBtn.parentNode) {
    farmBtn = document.createElement('button');
    farmBtn.type = 'button';
    farmBtn.className = 'btn ghost small inv-toolbar-farm';
    farmBtn.textContent = '🚜 Farming';
    farmBtn.addEventListener('click', toggleFarming);
    loadoutSaveBtn.parentNode.insertBefore(farmBtn, loadoutSaveBtn);
  }

  function captureEquippedSet() {
    if (!data) {
      toast('Inventar wird geladen …', 'info', 1800);
      return;
    }
    const characterId = editorCharId || ((data.characters && data.characters[0] && data.characters[0].id) || '');
    const equipped = equippedFor(characterId);
    if (!equipped.length) {
      toast('Kein ausgerüstetes Set gefunden.', 'info', 2200);
      return;
    }
    showTab('loadouts');
    openEditor('');
    editorSlots = new Map();
    editorMods = [];
    editorSubPlugs = [];
    editorArtifact = null;
    for (const item of equipped) {
      const bucket = Number(item.bucket);
      if (bucket === DIM.B.SUBCLASS) {
        editorSubPlugs = (item.perks || []).map((perk) => ({ idx: perk.idx, hash: perk.hash, n: perk.n, i: perk.i, p: perk.p || '', d: perk.d || '' }));
        continue;
      }
      if (bucket === DIM.B.ARTIFACT) {
        editorArtifact = { hash: item.hash, name: item.name, icon: item.icon, instanceId: item.instanceId, rarity: item.rarity };
        continue;
      }
      if (DIM.WEAPON_SLOTS.some((slot) => slot.key === bucket) || DIM.ARMOR_SLOTS.some((slot) => slot.key === bucket) || bucket === DIM.B.GHOST || bucket === DIM.B.EMBLEM) {
        editorSlots.set(bucket, item);
      }
      if (!DIM.ARMOR_SLOTS.some((slot) => slot.key === bucket)) continue;
      for (const perk of item.perks || []) {
        if (!/enhancements\.v2_general/i.test(String(perk.p || ''))) continue;
        editorMods.push({
          h: perk.hash, n: perk.n, i: perk.i, p: perk.p, d: perk.d || '', s: perk.s || [],
          sb: bucket, si: Number(perk.idx), e: Number(perk.e) || 0
        });
      }
    }
    const character = ((data.characters || []).find((entry) => entry.id === characterId)) || null;
    editorCharId = characterId;
    editorName = `Getragenes Set${character ? ' ' + (DIM.CLASS_NAMES[character.classType] || '') : ''}`;
    if (drawerNameEl) drawerNameEl.value = editorName;
    renderDrawer();
    renderFooter();
    toast('Getragenes Set übernommen – Namen prüfen und speichern.', 'success', 3000);
  }

  function hideTooltipFn() { hideTooltip(); }
  function closeFn() { close(); }
  function hideResultFn() { hideResult(); }
  function renderLoadoutsFn() { renderLoadouts(); }

  return {
    isHidden, isOpen, open, close: closeFn, toggle, refresh, renderLoadouts: renderLoadoutsFn,
    queueLoadout,
    renderLoadoutQueue: renderLoadoutQueuePanel,
    openPostmaster,
    refreshWishlist: async () => {
      const result = await api.bungieWishlistRefresh();
      if (result && result.ok) await refresh(true);
      return result;
    },
    // Globale Suche (Befehlspalette): Perks und Loadouts.
    searchContent(query) {
      const needle = String(query || '').trim().toLowerCase();
      if (needle.length < 2) return [];
      const results = [];
      const seenPerks = new Set();
      for (const item of allItemsPool()) {
        for (const perk of item.perks || []) {
          const name = String((perk && perk.n) || '');
          if (!name || !name.toLowerCase().includes(needle)) continue;
          const key = name.toLowerCase();
          if (seenPerks.has(key)) continue;
          seenPerks.add(key);
          results.push({
            label: 'Perk: ' + name,
            hint: item.name || '',
            run: () => window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'inventory', search: 'perk:"' + name.replace(/"/g, '') + '"' } }))
          });
          if (results.length >= 6) break;
        }
        if (results.length >= 6) break;
      }
      for (const loadout of getLoadoutList()) {
        const name = String(loadout.name || '');
        if (!name || !name.toLowerCase().includes(needle)) continue;
        results.push({
          label: 'Loadout: ' + name,
          hint: 'anwenden oder bearbeiten',
          run: () => {
            window.dispatchEvent(new CustomEvent('d2-inventory-show', { detail: { tab: 'loadouts' } }));
            setTimeout(() => {
              const card = document.querySelector('[data-loadout-edit="' + loadout.id + '"]');
              if (card) card.click();
            }, 250);
          }
        });
        if (results.length >= 10) break;
      }
      return results;
    },
    // Für die lokale API (Stream Deck): Werkzeugseite öffnen bzw.
    // Loadout anwenden.
    openTools(view, detail) {
      showTab('tools');
      ensureTools().then((loaded) => {
        if (loaded && typeof loaded.setView === 'function') loaded.setView(view);
        if (detail && typeof detail === 'object') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('d2-tools-detail', { detail }));
          }, 160);
        }
      });
    },
    applyLoadoutById(id) {
      const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === String(id || ''));
      if (!loadout) { toast('Loadout nicht gefunden.', 'info', 2200); return; }
      if (!data) {
        toast('Inventar wird geladen – Loadout wird danach angewendet.', 'info', 2600);
        if (!loading) refresh();
        waitForInventory(15000).then((ready) => {
          if (ready) applyLoadout(loadout.id);
          else toast('Loadout kann ohne Inventar nicht angewendet werden.', 'warning', 3000);
        });
        return;
      }
      applyLoadout(loadout.id);
    },
    queueLoadoutById(id) {
      const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === String(id || ''));
      if (!loadout) { toast('Loadout nicht gefunden.', 'info', 2200); return; }
      if (!data) {
        waitForInventory(15000).then((ready) => {
          if (ready) queueLoadout(loadout.id);
          else toast('Warteschlange braucht das Inventar.', 'warning', 3000);
        });
        if (!loading) refresh();
        return;
      }
      queueLoadout(loadout.id);
    },
    applyLoadoutMissingById(id) {
      const loadout = ((getCfg().bungie && getCfg().bungie.loadouts) || []).find((entry) => entry.id === String(id || ''));
      if (!loadout) { toast('Loadout nicht gefunden.', 'info', 2200); return; }
      if (!data) {
        toast('Inventar wird geladen – fehlende Teile werden danach angelegt.', 'info', 2600);
        if (!loading) refresh();
        waitForInventory(15000).then((ready) => {
          if (ready) applyLoadout(loadout.id, { missingOnly: true });
          else toast('Loadout kann ohne Inventar nicht angewendet werden.', 'warning', 3000);
        });
        return;
      }
      applyLoadout(loadout.id, { missingOnly: true });
    },
  };
}
