'use strict';

// ============================================================
// Übersetzungs-Prüfung
// ============================================================
// Sammelt sichtbare deutsche Texte aus HTML und Renderer-Code und
// prüft, ob der Laufzeit-Übersetzer (i18n.js) dafür einen englischen
// Text oder ein Muster kennt.
//
// Aufruf: node tools/i18n-check.js
// Exit-Code 1, wenn Texte fehlen (mit Datei und Zeile).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const RENDERER = path.join(ROOT, 'renderer');

function decode(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

function norm(value) {
  return decode(value).replace(/\s+/g, ' ').trim();
}

const context = {
  window: {},
  document: {
    readyState: 'loading',
    addEventListener() {},
    documentElement: {},
    body: null
  },
  Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 },
  NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
  MutationObserver: class { observe() {} disconnect() {} },
  setTimeout,
  clearTimeout
};
vm.createContext(context);
for (const file of ['renderer/js/i18n-en.js', 'renderer/js/i18n.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}
const translate = context.window.i18n.translate;

// Strings, die nie übersetzt werden müssen.
const IGNORE = new Set([
  'de', 'en', 'DE', 'EN', 'JSON', 'PNG', 'HUD', 'API', 'URL', 'ID', 'OK',
  'D2', 'PvE', 'PvP', 'GM', 'Xûr', 'Bungie', 'Destiny 2', 'Steam', 'Discord',
  'Stream Deck', 'OAuth', 'DIM', 'LAN', 'QR'
]);
const codeLike = /(https?:|\/\/|\bvar\(|rgba?\(|#[0-9a-f]{3,8}\b|^\.[a-z]|^[a-z-]+:|=>|\$\{|\bpx\b|\bjson\b|\bdata-|\bclass=|\bhash\b|\bpath\b|\bfunction\b|^\w+\.\w+$)/i;

// Nur Texte melden, die wahrscheinlich deutsch sind. Reine englische
// oder in beiden Sprachen identische Begriffe (Dashboard, Reset,
// Power, Logs …) sind kein Übersetzungsfehler.
const germanWords = /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|kein|keine|keinen|nicht|noch|nur|und|oder|mit|für|von|vom|zum|zur|auf|aus|bei|nach|vor|über|unter|ist|sind|war|wird|werden|kann|können|muss|sollen|wenn|dann|aber|auch|schon|jetzt|hier|dort|mehr|alle|alles|etwas|bitte|wie|was|wer|wo|wann|warum|diese|dieser|dieses|dein|deine|deinen|sich|bereits|seit|gegen|ohne|um|bis|durch|hat|haben|wurde|wurden|linke|rechte|oben|unten|weiter|zurück|auswählen|anzeigen|öffnen|schließen|speichern|löschen|hinzufügen|entfernen|suchen|einrichten|ansehen|abhaken|aktualisieren|zurücksetzen|kopieren|teilen|vergleichen|anlegen|lagern|markieren)\b/i;
const germanSuffix = /(ung|heit|keit|lich|isch|ieren|ierte|schaft|weise|voll|los|bar|hilfe|filter|ansicht|auswahl|belegung|meldung|fehler|hinweis)$/i;

function interesting(value) {
  const text = norm(value);
  if (!text || text.length < 2 || text.length > 420) return false;
  if (IGNORE.has(text)) return false;
  if (!/[A-Za-zÄÖÜäöüß]/.test(text)) return false;
  if (!(/[ÄÖÜäöüß]/.test(text) || /\s/.test(text) || /^[A-ZÄÖÜ]/.test(text))) return false;
  if (codeLike.test(text)) return false;
  if (/^[);]/.test(text) || /\.(textContent|dataset|innerHTML|value|style|classList|querySelector|addEventListener)\b/.test(text)) return false;
  if (/<\/?[a-z]|[{}]|:\s*['"]|['"]\s*[).,;]|\|\||=>/.test(text)) return false;
  if (/^[a-z0-9_.-]+$/.test(text)) return false;
  const words = text.split(/\s+/);
  if (!germanWords.test(text) && !germanSuffix.test(words[words.length - 1] || '')) return false;
  return true;
}

const problems = [];

function checkText(value, file, line) {
  if (!interesting(value)) return;
  const text = norm(value);
  const translated = translate(text);
  if (translated == null) problems.push({ file, line, text });
}

function scanHtmlText(html, file, lineOffset) {
  // Textknoten
  for (const match of html.matchAll(/>([^<>]+)</g)) {
    const before = html.slice(0, match.index);
    const line = lineOffset + (before.match(/\n/g) || []).length;
    checkText(match[1], file, line);
  }
  // Attribute
  for (const match of html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) {
    const before = html.slice(0, match.index);
    const line = lineOffset + (before.match(/\n/g) || []).length;
    checkText(match[1], file, line);
  }
}

function scanHtmlFile(file) {
  const html = fs.readFileSync(file, 'utf8');
  scanHtmlText(html, path.relative(ROOT, file), 0);
}

function scanJsFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = path.relative(ROOT, file);
  for (const match of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const raw = match[2];
    const before = text.slice(0, match.index);
    const line = (before.match(/\n/g) || []).length + 1;
    let value = raw;
    try { value = JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch (error) { /* keep */ }
    value = value.replace(/\\n/g, '\n');
    if (/<[a-z][\s\S]*>/i.test(value)) {
      scanHtmlText(value, relative, line);
    } else if (!value.includes('${')) {
      checkText(value, relative, line);
    }
  }
}

scanHtmlFile(path.join(RENDERER, 'index.html'));
for (const name of fs.readdirSync(RENDERER)) {
  if (!name.endsWith('.html') || name === 'index.html') continue;
  scanHtmlFile(path.join(RENDERER, name));
}
for (const name of fs.readdirSync(path.join(RENDERER, 'js'))) {
  if (!name.endsWith('.js') || name === 'i18n.js' || name === 'i18n-en.js') continue;
  scanJsFile(path.join(RENDERER, 'js', name));
}

// Duplikate zusammenfassen.
const unique = new Map();
for (const problem of problems) {
  const key = problem.text;
  if (!unique.has(key)) unique.set(key, problem);
}
const list = [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (list.length) {
  console.log(`Fehlende Übersetzungen: ${list.length}`);
  for (const entry of list) console.log(`  ${entry.file}:${entry.line}  ${entry.text}`);
  process.exit(1);
}
console.log('Alle sichtbaren Texte sind übersetzt.');

// Hinweise für sehr lange englische Texte (können Buttons/Karten sprengen).
const dictionary = context.window.__I18N_EN__ || {};
const longTexts = Object.entries(dictionary)
  .filter(([source, target]) => typeof target === 'string' && target.length > 48 && target.length > source.length * 1.8)
  .slice(0, 10);
if (longTexts.length) {
  console.log('Layout-Hinweis: sehr lange englische Texte (auf Überlauf prüfen):');
  for (const [source, target] of longTexts) console.log(`  • ${source.slice(0, 40)} → ${target.slice(0, 70)}`);
}
