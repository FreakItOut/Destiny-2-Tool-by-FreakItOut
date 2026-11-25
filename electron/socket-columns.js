'use strict';

// ============================================================
// Socket-Aufbereitung für das Item-Popup (DIM-Verhalten)
// ============================================================
// Reine Funktion (kein Electron/Manifest-Zugriff), damit die
// Zuordnung von Perk-Spalten und Mod-Sockets testbar bleibt.
//
// DIM unterscheidet über DestinySocketCategoryDefinition.categoryStyle:
//   1 = Reusable   → Perk-Socket, ALLE Optionen als Spalte
//   2 = Consumable → Mod-/Kosmetik-Socket, nur der gesteckte Plug
//   3 = Unlockable → Perk-Socket, ALLE Optionen als Spalte
//   4 = Intrinsic  → Perk-Socket, nur der gesteckte Plug
//   5 = EnergyMeter, 6 = LargePerk, 7 = Abilities, 8 = Super
//   6 = LargePerk  → Perk-Socket (Rahmen/Stat-Tier), nur gesteckt
//
// Wichtig: Diese Zahlen sind NICHT die Reihenfolge "1 Reusable,
// 2 Unlockable" — 2 ist Consumable. Eine falsche Zuordnung ließ
// Shader-/Mod-Sockets als Perk-Spalten erscheinen.

const STYLE_REUSABLE = 1;
const STYLE_CONSUMABLE = 2;
const STYLE_UNLOCKABLE = 3;
const STYLE_INTRINSIC = 4;
const STYLE_LARGEPERK = 6;

// Fallback ohne SocketCategory-Definitionen (alte Caches): bekannte
// Perk-Kategorien (IntrinsicTraits, WeaponPerks_Reusable).
const PERK_SOCKET_CATEGORIES = new Set([3956125808, 4241085061]);
const WEAPON_PERKS_CATEGORY = 4241085061;

// DIM blendet diese Mod-/Tiering-Sockets im Popup aus.
const HIDDEN_MOD_PLUG = /weapon_tiering\.plugs\.mods|crafting\.recipes|generic_all_vfx|empty\.exotic\.masterwork|weapon_damage_type/i;
// Kill-Tracker sind keine Perks (DIM: isKillTrackerSocket).
const TRACKER_PLUG = /masterworks\.trackers|kill.?tracker/i;
// Leere/Dummy-Plugs nie anzeigen.
const EMPTY_PLUG = /empty_socket|crafting\.recipes\.empty|dummy/i;

function isPerkStyle(style) {
  return style === STYLE_REUSABLE || style === STYLE_UNLOCKABLE || style === STYLE_INTRINSIC || style === STYLE_LARGEPERK;
}

function showsAllOptions(style) {
  return style === STYLE_REUSABLE || style === STYLE_UNLOCKABLE;
}

/**
 * Baut aus den Live-Sockets (Komponente 305), den Reusable Plugs
 * (310) und den Manifest-Definitionen die Popup-Daten.
 *
 * @returns {{columns: Array, mods: Array, selected: Array}}
 *   columns: [{ idx, cat, options: [{hash,n,i,p,canInsert,selected,god}] }]
 *   mods:    [{ idx, hash, n, i, p }]
 *   selected:[{ idx, hash, n, i, p }]  (alle gesteckten Plugs)
 */
function buildSocketDisplays({ sockets, reusablePlugs, socketEntries, socketTypeDefs, socketCategoryDefs, plugSetDefs, names }) {
  const columns = [];
  const mods = [];
  const selected = [];
  const resolvedNames = names || {};
  const typeDefs = socketTypeDefs || {};
  const categoryDefs = socketCategoryDefs || {};
  const entries = socketEntries || [];
  const plugSets = plugSetDefs || {};

  (sockets || []).forEach((socket, socketIndex) => {
    if (!socket) return;
    const options = [];
    const seen = new Set();
    const addOption = (hash, canInsert) => {
      const plugHash = Number(hash) || 0;
      if (!plugHash || seen.has(plugHash)) return;
      const plug = resolvedNames[String(plugHash)] || {};
      if (!plug.n) return;
      const cat = String(plug.p || '');
      if (EMPTY_PLUG.test(cat)) return;
      seen.add(plugHash);
      options.push({
        hash: plugHash,
        n: plug.n || '',
        i: plug.i || '',
        p: plug.p || '',
        d: plug.d || '',
        canInsert: canInsert !== false,
        selected: false,
        god: false
      });
    };

    const reuse = (reusablePlugs && (reusablePlugs[socketIndex] || reusablePlugs[String(socketIndex)])) || [];
    for (const option of reuse) addOption(option && option.plugItemHash, option && option.canInsert !== false);
    if (socket.plugHash) addOption(socket.plugHash, true);
    const entry = entries[socketIndex] || null;
    // DIM berücksichtigt ALLE möglichen Perks einer Socket, nicht nur
    // die aktuell gesteckte oder die Live-Reusable-Liste. Die Manifest-
    // PlugSets liefern die fehlenden Alternativen (Godroll-Matching).
    for (const rpi of (entry && entry.reusablePlugItems) || []) {
      addOption(rpi && rpi.plugItemHash, true);
    }
    const pset = Math.round(Number(entry && entry.reusablePlugSetHash) || 0);
    if (pset && plugSets[String(pset)]) {
      for (const hash of plugSets[String(pset)]) addOption(hash, true);
    }
    if (!options.length) return;

    const typeHash = Math.round(Number(entry && entry.socketTypeHash) || 0);
    const typeDef = typeHash ? typeDefs[String(typeHash)] || null : null;
    const socketCategory = typeDef ? Number(typeDef.c) || 0 : 0;
    const categoryDef = typeDef ? categoryDefs[String(socketCategory)] || null : null;
    const categoryStyle = categoryDef ? Number(categoryDef.s) : null;

    const perkSocket = categoryStyle != null
      ? isPerkStyle(categoryStyle)
      : (!typeDef || PERK_SOCKET_CATEGORIES.has(socketCategory) || socketCategory === 0);
    const showAll = categoryStyle != null
      ? showsAllOptions(categoryStyle)
      : (!typeDef || socketCategory === WEAPON_PERKS_CATEGORY);

    const selectedHash = Number(socket.plugHash) || 0;
    for (const option of options) option.selected = option.hash === selectedHash;
    const selectedPlug = options.find((option) => option.selected) || null;
    const plugInfo = selectedPlug
      ? { idx: socketIndex, hash: selectedHash, n: selectedPlug.n, i: selectedPlug.i, p: selectedPlug.p, d: selectedPlug.d }
      : null;
    if (plugInfo) selected.push(plugInfo);

    const selectedCat = selectedPlug ? String(selectedPlug.p || '') : '';
    if (selectedHash && !perkSocket) {
      // Kein Plug-Info = unbekannter/leerer Plug (z. B. Crafting-
      // Empty-Socket) → nicht als Mod aufnehmen (sonst null.hash).
      if (plugInfo && !HIDDEN_MOD_PLUG.test(selectedCat)) mods.push(plugInfo);
      return;
    }
    if (selectedHash && TRACKER_PLUG.test(selectedCat)) return;
    if (!perkSocket) return;

    if (!showAll) {
      options.length = 0;
      if (selectedPlug) options.push(selectedPlug);
    }
    if (!options.length) return;
    columns.push({ idx: socketIndex, cat: typeDef ? typeDef.p : '', options });
  });

  return { columns, mods, selected };
}

module.exports = {
  STYLE_REUSABLE,
  STYLE_CONSUMABLE,
  STYLE_UNLOCKABLE,
  STYLE_INTRINSIC,
  STYLE_LARGEPERK,
  isPerkStyle,
  showsAllOptions,
  buildSocketDisplays
};
