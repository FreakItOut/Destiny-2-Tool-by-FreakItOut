'use strict';
function makeItem(index) {
  return {
    hash: 100000 + (index % 500),
    instanceId: `instance-${index}`,
    name: `Testwaffe ${index % 500}`,
    typeName: index % 3 === 0 ? 'Rüstung' : 'Waffe',
    bucket: index % 3 === 0 ? 14239492 : 1498876634,
    classType: index % 4,
    power: 1900 + (index % 100),
    godRoll: index % 100 === 0,
    nearGodRoll: index % 100 === 1 ? { missing: ['Testperk'] } : null
  };
}

function buildSnapshot(count) {
  const items = Array.from({ length: count }, (_, index) => makeItem(index));
  return {
    ok: true,
    fetchedAt: Date.now(),
    characters: [{ id: 'c1', classType: 0, light: 2000, stats: {} }],
    vault: items.slice(0, Math.floor(count * 0.7)),
    backpack: { c1: items.slice(Math.floor(count * 0.7)) },
    equipped: { c1: [] },
    postmaster: { c1: [] },
    godrolls: items.filter((item) => item.godRoll).length
  };
}

function run(count) {
  const snapshot = buildSnapshot(count);
  const startJson = performance.now();
  const raw = JSON.stringify(snapshot);
  const parsed = JSON.parse(raw);
  const jsonMs = performance.now() - startJson;
  const all = [...parsed.vault, ...Object.values(parsed.backpack).flat()];
  const startSearch = performance.now();
  const matches = all.filter((item) => item.godRoll || /Testwaffe 1/.test(item.name));
  const searchMs = performance.now() - startSearch;
  const startTotal = performance.now();
  const totals = all.reduce((sum, item) => sum + (Number(item.power) || 0), 0);
  const totalMs = performance.now() - startTotal;
  return { count, bytes: Buffer.byteLength(raw), jsonMs, searchMs, totalMs, matches: matches.length, totals };
}

const results = [run(5000), run(10000)];
let failures = 0;
for (const result of results) {
  console.log(`${result.count} Items: JSON ${result.jsonMs.toFixed(1)} ms · Suche ${result.searchMs.toFixed(1)} ms · Summe ${result.totalMs.toFixed(1)} ms · ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
  if (result.jsonMs > 4000 || result.searchMs > 1500 || result.totalMs > 1000) {
    failures += 1;
    console.error(`FAIL ${result.count} Items überschreiten das Budget.`);
  }
}
if (failures) process.exit(1);
console.log('Große-Tresore-Test OK: 5.000 und 10.000 Items innerhalb des Budgets.');
