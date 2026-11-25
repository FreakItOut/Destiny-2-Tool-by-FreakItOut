// ============================================================
// Aktionsjournal: globales Undo/Redo
// ============================================================
// Aktionen registrieren einen Undo- und einen Redo-Schritt. Das
// Journal ist bewusst unabhängig von den Modulen; es speichert keine
// Daten, sondern nur Funktionen.

const MAX_ENTRIES = 50;
const entries = [];
const redoEntries = [];
let listeners = [];

function notify() {
  for (const listener of listeners) {
    try { listener(); } catch (error) { /* egal */ }
  }
}

export function record(label, undo, redo) {
  if (typeof undo !== 'function') return;
  entries.push({ label: String(label || 'Aktion'), undo, redo: typeof redo === 'function' ? redo : null });
  while (entries.length > MAX_ENTRIES) entries.shift();
  redoEntries.length = 0;
  notify();
}

export async function undo() {
  const entry = entries.pop();
  if (!entry) return null;
  await entry.undo();
  redoEntries.push(entry);
  notify();
  return entry.label;
}

export async function redo() {
  const entry = redoEntries.pop();
  if (!entry || !entry.redo) return null;
  await entry.redo();
  entries.push(entry);
  notify();
  return entry.label;
}

export function canUndo() {
  return entries.length > 0;
}

export function canRedo() {
  return redoEntries.length > 0;
}

export function undoLabel() {
  return entries.length ? entries[entries.length - 1].label : '';
}

export function redoLabel() {
  return redoEntries.length ? redoEntries[redoEntries.length - 1].label : '';
}

export function subscribe(listener) {
  listeners.push(listener);
  return () => { listeners = listeners.filter((entry) => entry !== listener); };
}

export function clear() {
  entries.length = 0;
  redoEntries.length = 0;
  notify();
}
