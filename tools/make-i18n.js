'use strict';

// Erzeugt bzw. ergänzt renderer/js/i18n-en.js aus den sichtbaren UI-Texten.
// Aufruf: node tools/make-i18n.js
// Nutzt den öffentlichen Google-Translate-Endpunkt nur zum Erzeugen
// der statischen Übersetzungsdatei; die App selbst bleibt offline.
//
// Bereits vorhandene Übersetzungen bleiben erhalten. Es werden nur
// neue Texte und Muster ergänzt. Texte werden auch aus HTML-Strings
// im Renderer-Code extrahiert (nicht nur aus reinen String-Literalen),
// damit z. B. Karten und der Einrichtungsassistent vollständig sind.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let ts = null;
try { ts = require('typescript'); } catch (error) { ts = null; }
// TypeScript 7 (nativ) exportiert am Paket-Root keine Compiler-API mehr.
// require() wirft dort nicht, liefert aber nur Versionsinfos – dann greift
// unten der Regex-Fallback statt mit "ts.createSourceFile is not a function"
// abzubrechen.
if (ts && typeof ts.createSourceFile !== 'function') ts = null;

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'renderer', 'js', 'i18n-en.js');
const BATCH = 25;

// Feste Spielbegriffe: Google Translate macht aus „Titan“ sonst
// „Titanium“, aus „Jäger“ „hunter“ und aus „Super“ „Great“.
const TERM_OVERRIDES = {
  'Titan': 'Titan',
  'Jäger': 'Hunter',
  'Warlock': 'Warlock',
  'Beschwörer': 'Warlock',
  'Hüter': 'Guardian',
  'Super': 'Super',
  'Nahkampf': 'Melee',
  'Granate': 'Grenade',
  'Klasse': 'Class',
  'Gesundheit': 'Health',
  'Waffen': 'Weapons',
  'Gewöhnlich': 'Common',
  'Selten': 'Rare',
  'Legendär': 'Legendary',
  'Exotisch': 'Exotic'
};

// Auch in zusammengesetzten Mustern („Titan/Jäger/Warlock“) bereinigen.
function fixGameTerms(value) {
  return String(value)
    .replace(/\bTitanium\b/g, 'Titan')
    .replace(/\bSummoner\b/g, 'Warlock')
    .replace(/\bhunter\b/g, 'Hunter');
}

function decode(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCharCode(parseInt(code, 16) || 0));
}
function norm(s) {
  return decode(s).replace(/\s+/g, ' ').trim();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Erkennt Muster, die nur Platzhalter zusammensetzen, aber keinen
// Text übersetzen (z. B. "^(.+?) Set(.+?)$" => "__PH0__Set__PH1__").
// Solche Muster würden englische Texte beschädigen und werden verworfen.
function regexLiteral(source) {
  return String(source)
    .replace(/\(\?:[^)]*\)/g, ' ')
    .replace(/\(\?[:=!][^)]*\)/g, ' ')
    .replace(/\(\.\+\?\)/g, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/[\^$.*+?()[\]{}|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function targetLiteral(target) {
  return String(target).replace(/__PH\d+__/g, ' ').replace(/\s+/g, ' ').trim();
}
function patternTranslates(source, target) {
  const a = regexLiteral(source).replace(/[^A-Za-zÄÖÜäöüß]/g, '').toLowerCase();
  const b = targetLiteral(target).replace(/[^A-Za-zÄÖÜäöüß]/g, '').toLowerCase();
  if (!a || !b) return true;
  return a !== b;
}

const codeLike = /(https?:|\/\/|\bvar\(|rgba?\(|#[0-9a-f]{3,8}\b|^\.[a-z]|^[a-z-]+:|=>|\bpx\b|\bjson\b|\bdata-|\bclass=|\bhash\b|\bpath\b|\bfunction\b|^\w+\.\w+$)/i;

function looksTextual(value) {
  const text = norm(value);
  if (!text || text.length < 2 || text.length > 420) return false;
  if (!/[A-Za-zÄÖÜäöüß]/.test(text)) return false;
  if (!(/[ÄÖÜäöüß]/.test(text) || /\s/.test(text) || /^[A-ZÄÖÜ]/.test(text))) return false;
  if (codeLike.test(text)) return false;
  if (/^[a-z0-9_.-]+$/.test(text)) return false;
  return true;
}

async function translateBatch(lines) {
  const q = lines.join('\n@@\n');
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=de&tl=en&dt=t&q=' + encodeURIComponent(q);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const joined = (data && data[0] ? data[0].map((part) => part[0]).join('') : '');
      const out = joined.split('\n@@\n').map((value) => norm(value));
      if (out.length !== lines.length) return null;
      return out;
    } catch (error) {
      await sleep(900 * (attempt + 1));
    }
  }
  return null;
}

async function translateAll(lines, label) {
  const map = {};
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH);
    let translated = await translateBatch(batch);
    if (!translated) {
      translated = [];
      for (const line of batch) {
        const one = await translateBatch([line]);
        translated.push(one ? one[0] : line);
        await sleep(80);
      }
    }
    for (let j = 0; j < batch.length; j += 1) {
      const source = batch[j];
      const target = translated[j];
      if (target && target !== source) map[source] = target;
    }
    process.stdout.write(`\r${label}: ${Math.min(i + BATCH, lines.length)}/${lines.length}`);
    await sleep(150);
  }
  process.stdout.write('\n');
  return map;
}

function splitTemplate(value) {
  const parts = [];
  let index = 0;
  let last = 0;
  let count = 0;
  while (index < value.length) {
    if (value[index] === '$' && value[index + 1] === '{') {
      let depth = 1;
      let end = index + 2;
      while (end < value.length && depth > 0) {
        if (value[end] === '{') depth += 1;
        else if (value[end] === '}') depth -= 1;
        end += 1;
      }
      if (depth !== 0) return null;
      parts.push({ text: value.slice(last, index) });
      parts.push({ expr: value.slice(index + 2, end - 1) });
      last = end;
      index = end;
      count += 1;
    } else {
      index += 1;
    }
  }
  parts.push({ text: value.slice(last) });
  return { parts, count };
}

function loadExisting() {
  if (!fs.existsSync(OUT)) return { dict: {}, patterns: [] };
  try {
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(OUT, 'utf8'), context, { filename: OUT });
    return {
      dict: (context.window && context.window.__I18N_EN__) || {},
      patterns: (context.window && context.window.__I18N_PATTERNS__) || []
    };
  } catch (error) {
    console.log('Bestehende Übersetzungen nicht lesbar – wird neu erzeugt.');
    return { dict: {}, patterns: [] };
  }
}

function collectAll() {
  const statics = new Set();
  const patterns = new Map();

  const addStatic = (value) => {
    const text = norm(value);
    if (looksTextual(text)) statics.add(text);
  };

  const addPattern = (value) => {
    const raw = norm(value);
    if (!raw || raw.length > 420) return;
    if (!/[A-Za-zÄÖÜäöüß]/.test(raw)) return;
    if (codeLike.test(raw)) return;
    const split = splitTemplate(raw);
    if (!split || split.count < 1 || split.count > 3) return;
    if (!split.parts.some((part) => part.text && /[A-Za-zÄÖÜäöüß]{2,}/.test(part.text))) return;
    let tokenIndex = 0;
    let regex = '^';
    const tokenized = [];
    for (const part of split.parts) {
      if (part.expr !== undefined) {
        tokenized.push(`__PH${tokenIndex}__`);
        tokenIndex += 1;
        regex += '(.+?)';
      } else {
        tokenized.push(part.text);
        regex += escapeRegex(part.text);
      }
    }
    regex += '$';
    const source = tokenized.join('').trim();
    if (!source || source.length > 420) return;
    if (!/[A-Za-zÄÖÜäöüß]/.test(source)) return;
    patterns.set(regex, { source, regex });
  };

  const addHtmlText = (html) => {
    const cleaned = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    for (const match of cleaned.matchAll(/>([^<>]+)</g)) {
      const text = decode(match[1]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text.includes('${')) addPattern(text);
      else addStatic(text);
    }
    for (const match of cleaned.matchAll(/(?:placeholder|title|aria-label)="([^"]*)"/g)) {
      const text = decode(match[1]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text.includes('${')) addPattern(text);
      else addStatic(text);
    }
  };

  // Texte in ${...}-Ausdrücken (z. B. `... ${hasKey ? 'Text' : 'Anderer Text'}`)
  // gehören ebenfalls zur Oberfläche und werden hier mit erfasst.
  const scanCode = (code, depth) => {
    if (depth > 4) return;
    for (const match of String(code).matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      let value = match[2];
      try { value = JSON.parse('"' + value.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch (error) { /* keep */ }
      scanValue(value, depth + 1);
    }
  };

  const scanValue = (value, depth) => {
    if (depth > 4) return;
    const text = String(value).replace(/\\n/g, '\n');
    if (/<[a-z][\s\S]*>/i.test(text)) {
      addHtmlText(text);
      const split = splitTemplate(text);
      if (split) for (const part of split.parts) if (part.expr !== undefined) scanCode(part.expr, depth + 1);
      return;
    }
    if (text.includes('${')) {
      addPattern(text);
      const split = splitTemplate(text);
      if (split) for (const part of split.parts) if (part.expr !== undefined) scanCode(part.expr, depth + 1);
      return;
    }
    addStatic(text);
  };

  const htmlFiles = fs.readdirSync(path.join(ROOT, 'renderer')).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, 'renderer', name), 'utf8');
    addHtmlText(html);
  }

  for (const dir of ['renderer/js', 'renderer', 'electron']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (!name.endsWith('.js')) continue;
      if (name === 'i18n.js' || name === 'i18n-en.js') continue;
      const file = path.join(ROOT, dir, name);
      const text = fs.readFileSync(file, 'utf8');
      if (ts) {
        const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const visit = (node) => {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            scanValue(node.text, 0);
          } else if (ts.isTemplateExpression(node)) {
            scanValue(node.getText(sourceFile), 0);
          }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        continue;
      }
      for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
        let value = m[2];
        try { value = JSON.parse('"' + value.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch (error) { /* keep */ }
        scanValue(value, 0);
      }
    }
  }
  return { statics, patterns };
}

(async () => {
  const existing = loadExisting();
  const collected = collectAll();
  // Veraltete 0–200-Einträge entfernen; alle anderen vorhandenen
  // Übersetzungen bleiben erhalten (auch dynamisch erzeugte Texte).
  const OBSOLETE_TEXT = /0[–-](?:100|200)|101[–-]200|Bonus ab 101|Strich bei 100|Bonus aktiv|\/200/;
  const prunedDict = {};
  for (const [source, target] of Object.entries(existing.dict || {})) {
    if (OBSOLETE_TEXT.test(source)) continue;
    prunedDict[source] = target;
  }
  const usedPatterns = new Set([...collected.patterns.values()].map((entry) => entry.regex));
  const existingPatterns = (existing.patterns || []).filter(([source, target]) => usedPatterns.has(source) && patternTranslates(source, target));
  const newStatics = [...collected.statics].filter((text) => !(text in prunedDict));
  const newPatterns = [...collected.patterns.values()].filter((entry) => !existingPatterns.some(([regex]) => regex === entry.regex));

  console.log(`Statische Texte: ${collected.statics.size} (neu: ${newStatics.length})`);
  const translatedNew = newStatics.length ? await translateAll(newStatics, 'Übersetze neue Texte') : {};

  const dict = { ...prunedDict };
  for (const [source, target] of Object.entries(translatedNew)) {
    dict[source] = fixGameTerms(target);
  }
  for (const [source, target] of Object.entries(TERM_OVERRIDES)) {
    dict[source] = target;
  }

  console.log(`Muster: ${collected.patterns.size} (neu: ${newPatterns.length})`);
  const translatedPatterns = newPatterns.length ? await translateAll(newPatterns.map((entry) => entry.source), 'Übersetze neue Muster') : {};
  const patternOutput = [...existingPatterns];
  for (const entry of newPatterns) {
    const target = translatedPatterns[entry.source];
    if (!target || target === entry.source) continue;
    if (!patternTranslates(entry.regex, target)) continue;
    patternOutput.push([entry.regex, fixGameTerms(target)]);
  }

  const payload = `'use strict';\n// Automatisch erzeugt von tools/make-i18n.js.\nwindow.__I18N_EN__ = ${JSON.stringify(dict, null, 2)};\nwindow.__I18N_PATTERNS__ = ${JSON.stringify(patternOutput, null, 2)};\n`;
  fs.writeFileSync(OUT, payload, 'utf8');
  console.log(`Geschrieben: ${OUT} (${Object.keys(dict).length} Texte, ${patternOutput.length} Muster)`);
})();
