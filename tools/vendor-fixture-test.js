'use strict';

// Prüft die Vendor-API-Fixture gegen die Erwartungen des Renderers und
// die Verschachtelung, die Bungie für Händler liefert. Die Fixture ist
// bewusst statisch, damit Vendor-Änderungen ohne Netzwerk testbar sind.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const fixturePath = path.join(__dirname, 'fixtures', 'vendor-offers.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const sales = fixture.Response && fixture.Response.sales && fixture.Response.sales.data;
const vendor = sales && sales['672118013'];
check('Vendor-Fixture hat Verkäufe', Boolean(vendor && vendor.saleItems));
check('Vendor-Fixture hat zwei Sale-Items', vendor && Object.keys(vendor.saleItems).length === 2);
check('Sale-Item enthält itemHash', Number(vendor.saleItems['0'].itemHash) === 3001);
check('Nicht verfügbares Angebot hat failureIndexes', Array.isArray(vendor.saleItems['1'].failureIndexes) && vendor.saleItems['1'].failureIndexes.length === 1);

const components = fixture.Response.itemComponents['672118013'];
check('itemComponents ist nach Vendor-Hash verschachtelt', Boolean(components.stats && components.perks && components.sockets && components.renderData));
check('Stats-Komponente liefert Werte', Number(components.stats.data['3001'].stats['155624089'].value) === 80);
check('Perks-Komponente liefert Plug-Hashes', components.perks.data['3001'].perks.some((perk) => Number(perk.plugHash) === 6111));
check('Socket-Komponente liefert Spalten', components.sockets.data['3001'].sockets[0].reusablePlugHashes.includes(6112));
check('RenderData liefert Name und Icon', components.renderData.data['3001'].name === 'Testgewehr' && /test\.png$/.test(components.renderData.data['3001'].icon));

const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
check('main.js liest saleItems', main.includes('saleItems'));
check('main.js entpackt itemComponents nach Vendor-Hash', /rawComponents\[String\(vendorHash\)\]/.test(main) || /itemComponents\[String\(hash\)\]/.test(main));
check('main.js nutzt Stats-/Socket-/ReusablePlugs-Komponenten', main.includes('statsData') && main.includes('socketsData') && main.includes('reusableData'));
check('main.js baut Perk-Spalten aus den Socket-Daten', main.includes('buildSocketDisplays') && main.includes('socketColumns'));
check('main.js verarbeitet failureIndexes', main.includes('failureIndexes'));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Vendor-Fixture-Test OK: ${checks} Prüfungen.`);
