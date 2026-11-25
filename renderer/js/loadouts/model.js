// ============================================================
// Loadout-Modell (rein, ohne DOM)
// ============================================================
// Ausgelagert aus inventory.js: Auswahl für den Overlay-
// Schnellzugriff, Suchtext, Pin- und Tag-Umschaltung. Alle
// Funktionen sind zustandslos und leicht testbar.

export const OVERLAY_LOADOUT_LIMIT = 4;

function asList(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && entry.id) : [];
}

function lastUsedAt(loadout, stats) {
  const id = String((loadout && loadout.id) || '');
  const entry = id && stats ? stats[id] : null;
  return Number(entry && entry.lastUsedAt) || 0;
}

// Loadouts für die Overlay-Chips: angeheftete zuerst, sonst die
// zuletzt genutzten. Liefert immer höchstens `limit` Einträge.
export function overlayLoadouts(loadouts, options = {}) {
  const limit = Math.max(1, Number(options.limit) || OVERLAY_LOADOUT_LIMIT);
  const stats = options.stats && typeof options.stats === 'object' ? options.stats : {};
  const all = asList(loadouts);
  const pinned = all.filter((entry) => entry.pinned === true);
  let items = pinned;
  if (!items.length) {
    items = all.slice().sort((a, b) => {
      const delta = lastUsedAt(b, stats) - lastUsedAt(a, stats);
      if (delta !== 0) return delta;
      return String(a.name || '').localeCompare(String(b.name || ''), 'de');
    });
  }
  return {
    items: items.slice(0, limit),
    pinned: pinned.length > 0,
    pinnedCount: pinned.length,
    total: all.length
  };
}

// Ein Loadout anheften/abheften (unveränderlich).
export function pinLoadout(loadouts, id, pinned) {
  const key = String(id || '');
  if (!key) return asList(loadouts);
  return asList(loadouts).map((entry) => (entry.id === key
    ? { ...entry, pinned: Boolean(pinned) }
    : entry));
}

// Tag eines Loadouts umschalten (PvE/PvP/GM/Raid).
export function toggleLoadoutTag(loadouts, id, key) {
  const wantedId = String(id || '');
  const wantedKey = String(key || '');
  if (!wantedId || !wantedKey) return asList(loadouts);
  return asList(loadouts).map((entry) => {
    if (entry.id !== wantedId) return entry;
    const tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
    const index = tags.indexOf(wantedKey);
    if (index >= 0) tags.splice(index, 1);
    else tags.push(wantedKey);
    return { ...entry, tags };
  });
}

// Suchtext eines Loadouts (Name, Klasse, Tags, Item-Namen).
export function loadoutSearchText(loadout, className = '') {
  const tags = (loadout && Array.isArray(loadout.tags)) ? loadout.tags.join(' ') : '';
  const items = (loadout && Array.isArray(loadout.items)) ? loadout.items.map((item) => (item && item.name) || '').join(' ') : '';
  return `${(loadout && loadout.name) || ''} ${className || ''} ${tags} ${items}`
    .toLocaleLowerCase('de')
    .replace(/\s+/g, ' ')
    .trim();
}
