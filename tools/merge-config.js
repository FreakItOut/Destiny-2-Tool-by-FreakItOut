'use strict';
// Führt zwei config.json-Dateien zusammen (Loadouts, Tags, Wunschregeln).
// Aufruf: node tools/merge-config.js <ziel.json> <quelle.json> [ausgabe.json]
const fs = require('node:fs');
const path = require('node:path');

const [, , targetPath, sourcePath, outPath] = process.argv;
if (!targetPath || !sourcePath) {
  console.error('Aufruf: node tools/merge-config.js <ziel.json> <quelle.json> [ausgabe.json]');
  process.exit(1);
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const target = read(targetPath);
const source = read(sourcePath);
const conflicts = [];

target.bungie = target.bungie || {};
source.bungie = source.bungie || {};

const mergeList = (key, idKey) => {
  const list = Array.isArray(target.bungie[key]) ? target.bungie[key].slice() : [];
  for (const entry of Array.isArray(source.bungie[key]) ? source.bungie[key] : []) {
    const id = String(entry && entry[idKey] || '');
    if (!id) continue;
    if (list.some((existing) => String(existing[idKey]) === id)) {
      conflicts.push(`${key}: ${id}`);
      continue;
    }
    list.push(entry);
  }
  target.bungie[key] = list;
};

mergeList('loadouts', 'id');
mergeList('armorWishlist', 'id');
mergeList('customWishlist', 'id');

for (const key of ['favs', 'itemNotes', 'itemTags', 'itemFolders', 'savedViews']) {
  const base = target.bungie[key] && typeof target.bungie[key] === 'object' ? target.bungie[key] : {};
  const extra = source.bungie[key] && typeof source.bungie[key] === 'object' ? source.bungie[key] : {};
  target.bungie[key] = { ...base, ...extra };
}

const output = outPath || targetPath.replace(/\.json$/i, '.merged.json');
fs.writeFileSync(output, JSON.stringify(target, null, 2), 'utf8');
console.log(`Zusammengeführt: ${output}`);
console.log(`Konflikte (nicht überschrieben): ${conflicts.length ? conflicts.join(', ') : 'keine'}`);
