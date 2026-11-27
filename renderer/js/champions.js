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

// Anti-Champion 2.0 (Update 9.7.0): Jede Waffe hat eine intrinsische
// Fähigkeit aus ihrem Rahmen/Archetyp. EINE Tabelle ist die gemeinsame
// Quelle für Inventar, Dashboard, Werkzeuge und API. Spezialrahmen
// stehen vor den Basisrahmen, damit z. B. "Compressed Wave" vor "Wave"
// und "Adaptive Burst" vor "Adaptive" greift.
export const FRAME_CHAMPION_RULES = [
  // Unaufhaltsam – Spezialrahmen
  { id: 'micro-missile', type: 3, patterns: [/micro[\s-]*missiles?/i, /mikro[\s-]*raketen/i] },
  { id: 'double-fire', type: 3, patterns: [/double[\s-]*fire/i, /doppelfeuer/i] },
  { id: 'rocket-assisted', type: 3, patterns: [/rocket[\s-]*assisted/i, /raketenunterst[üu]tzt/i] },
  { id: 'compressed-wave', type: 3, patterns: [/compressed[\s-]*wave/i, /komprimierte[\s-]*welle/i] },
  { id: 'heavy-burst', type: 3, patterns: [/heavy[\s-]*burst/i, /schwere[\s-]*salve/i] },
  { id: 'aggressive-burst', type: 3, patterns: [/aggressive[\s-]*burst/i, /aggressiver?[\s-]*stoß/i] },
  // Überladung – Support ist ausschließlich "Support AR" (kein Basis-Support)
  { id: 'support', type: 2, patterns: [/\bsupport\b/i, /\bunterstützung/i] },
  // Barriere – Spezialrahmen
  { id: 'adaptive-burst', type: 1, patterns: [/adaptive[\s-]*burst/i, /adaptiver?[\s-]*stoß/i] },
  { id: 'legacy-pr-55', type: 1, patterns: [/legacy[\s-]*pr[\s-]*55/i] },
  { id: 'disruption-sniper', type: 1, patterns: [/\bdisruption\b/i, /st[öo]rung/i] },
  { id: 'caster', type: 1, patterns: [/\bcaster\b/i, /\bzauberer/i] },
  // Basisrahmen
  { id: 'precision', type: 1, patterns: [/\bprecision\b/i, /\bpr[äa]zision/i] },
  { id: 'adaptive', type: 1, patterns: [/\badaptive\b/i, /\badaptiv/i] },
  { id: 'lightweight', type: 2, patterns: [/\blightweight\b/i, /\bleichtgewicht\b/i] },
  { id: 'rapid-fire', type: 2, patterns: [/rapid[\s-]*fire/i, /schnellfeuer/i] },
  { id: 'area-denial', type: 2, patterns: [/area[\s-]*denial/i, /fl[äa]chenschaden/i] },
  { id: 'vortex', type: 2, patterns: [/\bvortex\b/i] },
  { id: 'spread-shot', type: 2, patterns: [/spread[\s-]*shot/i, /streuschuss/i] },
  { id: 'dynamic-heat', type: 2, patterns: [/dynamic[\s-]*heat/i, /dynamische[\s-]*hitze/i] },
  { id: 'balanced-heat', type: 2, patterns: [/balanced[\s-]*heat/i, /ausgeglichene[\s-]*hitze/i] },
  { id: 'aggressive', type: 3, patterns: [/\baggressive\b/i, /\baggressiv(?:e[rnms]?)?\b/i] },
  { id: 'high-impact', type: 3, patterns: [/high[\s-]*impact/i, /hochenergie/i] },
  { id: 'wave', type: 3, patterns: [/\bwaves?\b/i, /\bwellen?(?:rahmen)?\b/i] }
];

// Quellen für den Rahmen: direkte Felder, intrinsische Socket-Optionen
// (bevorzugt die ausgewählte, sonst alle) und die ersten Perks. Bewusst
// KEINE Perk-/Socket-Beschreibungen, damit z. B. Flavor-Texte keine
// Champion-Fähigkeit vortäuschen.
function frameNameGroups(item) {
  if (!item) return [];
  const direct = [];
  const intrinsic = [];
  const perks = [];
  const push = (list, value) => {
    if (typeof value === 'string' && value.trim()) list.push(value.trim());
  };
  push(direct, item.frame);
  push(direct, item.archetypeName);
  if (item.archetype) push(direct, item.archetype.name);

  const columns = (item.socketColumns || []).filter(Boolean);
  const isIntrinsic = (column) => Number(column.idx) === 0 || /intrinsic/i.test(String(column.cat || ''));
  let intrinsicColumns = columns.filter(isIntrinsic);
  // Ohne erkennbare Intrinsic-Spalte zählt die erste Spalte als Rahmen.
  if (!intrinsicColumns.length) intrinsicColumns = columns.slice(0, 1);
  for (const column of intrinsicColumns) {
    const options = (column.options || []).filter((option) => option && option.n);
    if (!options.length) continue;
    const selected = options.filter((option) => option.selected === true);
    for (const option of (selected.length ? selected : options)) push(intrinsic, option.n);
  }

  for (const perk of (item.perks || []).slice(0, 2)) {
    if (perk) push(perks, perk.n);
  }
  return [direct, intrinsic, perks];
}

function matchFrameRule(text) {
  if (!text) return 0;
  for (const rule of FRAME_CHAMPION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return rule.type;
    }
  }
  return 0;
}

// Anti-Champion 2.0: ausschließlich Rahmen/Intrinsic bestimmt den Effekt.
// Manueller Override und explizite Bungie-Breaker haben Vorrang (siehe
// championTypes), diese Funktion liefert nur die Rahmen-Zuordnung.
export function frameBreakerType(item) {
  for (const names of frameNameGroups(item)) {
    const type = matchFrameRule(names.join(' '));
    if (type) return type;
  }
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

// Alle Champion-Fähigkeiten einer Waffe. Priorität:
// manueller Override > expliziter Bungie-Breaker > Rahmen-Tabelle.
// Unbekannt (leer) nur, wenn wirklich kein Rahmen erkannt wird.
export function championTypes(item) {
  const override = championOverride(item);
  if (override) return [override];
  const explicit = [...explicitBreakerTypes(item)].sort();
  if (explicit.length) return explicit;
  const frame = frameBreakerType(item);
  return frame ? [frame] : [];
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

// ---------- Gruppen für die Champion-Prüfung ----------
// Gruppen = Waffentyp + Rahmen. Ein Rahmen kann in den Bungie-Daten an
// verschiedenen Stellen stehen (frame, archetypeName, archetype.name)
// oder nur als Name eines Intrinsic-/Perk-Sockets vorliegen.
export function championFrameLabel(item) {
  if (!item) return '';
  const direct = [item.frame, item.archetypeName, item.archetype && item.archetype.name]
    .find((value) => typeof value === 'string' && value.trim());
  if (direct) return direct.trim();
  // Fallback: den intrinsischen Socket-/Perk-Namen nehmen, der laut
  // zentraler Tabelle einen Rahmen erkennt.
  for (const names of frameNameGroups(item)) {
    for (const name of names) {
      if (frameBreakerType({ frame: name })) return name;
    }
  }
  return '';
}

export function championGroupKey(item) {
  const type = String((item && (item.typeName || item.type)) || '').trim().toLocaleLowerCase('de');
  const frame = championFrameLabel(item).toLocaleLowerCase('de');
  return `${type || 'waffe'}|${frame}`;
}

// Vorschlag und Konfidenz einer Gruppe:
//  - explizit erkannt (Daten, Perks, Sockets oder Override) = hoch / sicher
//  - nur über den Rahmen erkannt                            = mittel / wahrscheinlich
//  - kein erkannter Brecher                                 = niedrig / unklar
export function championGroupSuggestion(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const votes = new Map();
  let hasExplicit = false;
  let hasFrame = false;
  for (const item of list) {
    if (championOverride(item) || explicitBreakerTypes(item).size) hasExplicit = true;
    else if (frameBreakerType(item)) hasFrame = true;
    for (const type of championTypes(item)) votes.set(type, (votes.get(type) || 0) + 1);
  }
  let type = 0;
  let best = 0;
  for (const [candidate, count] of votes) {
    if (count > best || (count === best && (!type || candidate < type))) {
      type = candidate;
      best = count;
    }
  }
  return {
    type,
    confidence: hasExplicit ? 'high' : hasFrame ? 'medium' : 'low',
    votes: best
  };
}
