'use strict';

// Prüft die statischen Bungie-Fixtures gegen die Felder, die Renderer
// und lokale API erwarten. Kein Netzwerk nötig.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
}

const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/^\uFEFF/, ''));

const inventory = readFixture('inventory-snapshot.json');
check('Inventar-Fixture ok', inventory.ok === true && Array.isArray(inventory.characters));
check('Inventar-Fixture hat Vault', inventory.vault.length === 1 && inventory.vault[0].godRoll === true);
check('Inventar-Fixture hat Backpack', inventory.backpack.c1.length === 1);
check('Inventar-Fixture hat Postfach', inventory.postmaster.c1.length === 1);
check('main.js liest Snapshot-Felder', ['characters', 'vault', 'backpack', 'equipped', 'postmaster', 'godrolls'].every((key) => main.includes(key)));

const nightfall = readFixture('nightfall.json');
check('Nightfall-Fixture', nightfall.ok === true && nightfall.activity === 'Test-Nightfall' && Array.isArray(nightfall.modifiers));
check('main.js verarbeitet Nightfall-Modifikatoren', main.includes('fetchNightfallModifiers') && main.includes('modifiers'));

const season = readFixture('season.json');
check('Saison-Fixture', season.ok === true && season.completed === 2 && season.items.length === 2);
check('main.js verarbeitet Saison-Ziele', main.includes('fetchSeasonChallenges'));

const crafting = readFixture('crafting.json');
check('Crafting-Fixture', crafting.ok === true && crafting.craftables[0].pattern.completion === 5);
check('main.js verarbeitet Crafting', main.includes('fetchBungieCraftables') && main.includes('craftables'));

// Aktivitätsverlauf: Bungie liefert Stats nur unter /Account/. Mit
// /Profile/ antwortet der Server mit einer HTML-404-Seite – die
// Dashboard-Karte blieb dadurch leer.
check('Aktivitätsverlauf nutzt /Account/', /Account\/\$\{resolved\.member\.membershipId\}\/Character\/\$\{character\.characterId\}\/Stats\/Activities/.test(main));
check('Aktivitätsverlauf nutzt nicht /Profile/', !/Profile\/\$\{resolved\.member\.membershipId\}\/Character\/\$\{character\.characterId\}\/Stats\/Activities/.test(main));
check('Aktivitätsverlauf liest instanceId', main.includes('details.instanceId'));
check('Aktivitätsverlauf liest K/D/A aus values', main.includes("statValue('kills')") && main.includes("statValue('deaths')") && main.includes("statValue('assists')"));

// Händler: Das normale Icon ist aussagekräftiger als das kleine
// transparente Logo; Händler ohne Anzeigenamen sind interne
// Rotations-Buckets und werden ausgeblendet.
check('Händler-Icon bevorzugt das normale Icon', /icon: def\.i \|\| def\.sti/.test(main));
check('Händler ohne Namen werden gefiltert', /vendor\.items\.length && vendor\.name/.test(main));

if (failures) {
  console.error(`\n${failures} von ${checks} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Bungie-Fixture-Test OK: ${checks} Prüfungen.`);
