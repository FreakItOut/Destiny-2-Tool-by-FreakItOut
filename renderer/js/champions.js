// ============================================================
// Anti-Champion 2.0: Jede Waffe hat eine intrinsische Fähigkeit
// aus ihrem Rahmen/Archetyp. Diese Datei ist die gemeinsame Quelle
// für Inventar-Kacheln, Tooltips, Planer und API-Anzeigen.
// ============================================================

export const BREAKER_LABELS = { 1: 'Anti-Barriere', 2: 'Überladung', 3: 'Unaufhaltsam' };
export const CHAMPION_NAMES = { 1: 'Barriere', 2: 'Überladung', 3: 'Unaufhaltsam' };
export const CHAMPION_SHORT = { 1: 'B', 2: 'Ü', 3: 'U' };
export const CHAMPION_COLORS = { 1: '#7fb2ff', 2: '#f3c66a', 3: '#ff8f8f' };

export const CHAMPION_PATTERNS = [
  { key: 'Barriere' },
  { key: 'Überladung' },
  { key: 'Unaufhaltsam' }
];

function roundType(value) {
  const type = Math.round(Number(value) || 0);
  return type >= 1 && type <= 3 ? type : 0;
}

// Explizite Breaker aus Bungie-Daten (Exoten, Perks, ausgewählte Sockets).
export function explicitBreakerTypes(item) {
  const types = new Set();
  if (!item) return types;
  const add = (value) => {
    const type = roundType(value);
    if (type) types.add(type);
  };
  add(item.breakerType);
  for (const perk of item.perks || []) add(perk && perk.breakerType);
  for (const column of item.socketColumns || []) {
    for (const option of column && column.options || []) add(option && option.breakerType);
  }
  for (const plug of item.modSockets || []) add(plug && plug.breakerType);
  return types;
}

function frameText(item) {
  if (!item) return '';
  const parts = [
    item.frame,
    item.archetypeName,
    item.archetype && item.archetype.name,
    item.typeName
  ];
  for (const column of item.socketColumns || []) {
    for (const option of column && column.options || []) {
      parts.push(option && option.n, option && option.p);
    }
  }
  for (const perk of item.perks || []) parts.push(perk && perk.n, perk && perk.p);
  for (const plug of item.modSockets || []) parts.push(plug && plug.n, plug && plug.p);
  return parts.filter(Boolean).join(' ').toLocaleLowerCase('de');
}

// Anti-Champion 2.0 (Update 9.7.0): Rahmen/Archetyp bestimmt den Effekt.
// Spezialisierte Rahmen werden vor den Basisrahmen geprüft.
export function frameBreakerType(item) {
  const text = frameText(item);
  if (!text) return 0;
  if (/mikro.?raketen|micro.?missile|doppelfeuer|double.?fire|komprimierte welle|compressed.?wave|schwere salve|heavy.?burst|aggressiv|aggressive|hochenergie|high.?impact|raketenunterstützt|rocket.?assisted|wellen|wave/.test(text)) return 3;
  if (/flächenschaden|flaechenschaden|area.?denial|leichtgewicht|lightweight|schnellfeuer|rapid.?fire|vortex|streuschuss|spread.?shot|dynamische hitze|dynamic.?heat|ausgeglichene hitze|balanced.?heat|unterstützung|support/.test(text)) return 2;
  if (/präzision|praezision|precision|adaptiv|adaptive|legacy.?pr.?55|störung|stoerung|disruption|zauberer|caster/.test(text)) return 1;
  return 0;
}

function overrideKey(item) {
  return String((item && (item.instanceId || item.hash)) || '');
}

export function championOverride(item) {
  try {
    const map = JSON.parse(window.localStorage.getItem('d2tool.championOverrides') || '{}');
    const type = Math.round(Number(map[overrideKey(item)]) || 0);
    return type >= 1 && type <= 3 ? type : 0;
  } catch (error) {
    return 0;
  }
}

export function setChampionOverride(item, type) {
  try {
    const map = JSON.parse(window.localStorage.getItem('d2tool.championOverrides') || '{}');
    const key = overrideKey(item);
    const value = Math.round(Number(type) || 0);
    if (key && value >= 1 && value <= 3) map[key] = value;
    else if (key) delete map[key];
    const entries = Object.entries(map).slice(-200);
    window.localStorage.setItem('d2tool.championOverrides', JSON.stringify(Object.fromEntries(entries)));
  } catch (error) { /* egal */ }
}

// Alle Champion-Fähigkeiten einer Waffe: explizite Daten + intrinsischer
// Rahmen. Jede Waffe mit erkennbarem Rahmen liefert damit mindestens einen
// Treffer, auch ohne Mods. Eine lokale Korrektur überschreibt die Automatik.
export function championTypes(item) {
  const override = championOverride(item);
  if (override) return [override];
  const types = new Set(explicitBreakerTypes(item));
  const frame = frameBreakerType(item);
  if (frame) types.add(frame);
  return [...types].sort();
}

// Woher die Champion-Fähigkeit stammt – für Tooltip und Prüfansicht.
export function championSource(item) {
  if (championOverride(item)) return 'manuell';
  if (explicitBreakerTypes(item).size) return 'daten';
  if (frameBreakerType(item)) return 'rahmen';
  return 'keine';
}

export function championLabels(item) {
  return championTypes(item).map((type) => CHAMPION_NAMES[type]).filter(Boolean);
}
