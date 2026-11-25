const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const armor = [2996146975, 392767087, 1943323491, 1735777505, 144602215, 4244567218];
let shown = 0;
for (const [h, def] of Object.entries(d)) {
  const name = (def.displayProperties || {}).name || '';
  const pci = (def.plug || {}).plugCategoryIdentifier || '';
  if (!armor.some((a) => (def.investmentStats || []).some((s) => s.statTypeHash === a))) continue;
  if (!/enhancements|stat|tuning/i.test(pci)) continue;
  if (shown++ > 14) break;
  console.log(h, JSON.stringify(name), pci, JSON.stringify((def.investmentStats || []).filter((s) => armor.includes(s.statTypeHash))));
}
