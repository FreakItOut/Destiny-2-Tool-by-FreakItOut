'use strict';

// Erzeugt eine kleine CycloneDX-SBOM aus package.json/package-lock.json.
// Aufruf: node tools/make-sbom.js
// Kein Netzwerk, keine zusätzlichen Abhängigkeiten.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

const components = [];
const packages = lock.packages || {};
for (const [location, entry] of Object.entries(packages)) {
  if (!location || location === '') continue;
  if (!entry || !entry.version) continue;
  if (!/^node_modules\//.test(location)) continue;
  const name = String(entry.name || location.replace(/^node_modules\//, ''));
  const isDev = entry.dev === true;
  components.push({
    type: 'library',
    name,
    version: String(entry.version),
    scope: isDev ? 'optional' : 'required',
    purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(String(entry.version))}`
  });
}
components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ name: 'Destiny 2 Tool by FreakItOut', version: pkg.version }],
    component: {
      type: 'application',
      name: pkg.name,
      version: pkg.version,
      purl: `pkg:npm/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`
    }
  },
  components
};

fs.mkdirSync(DIST, { recursive: true });
const target = path.join(DIST, 'sbom.cdx.json');
fs.writeFileSync(target, `${JSON.stringify(bom, null, 2)}\n`, 'utf8');
console.log(`SBOM geschrieben: ${path.relative(ROOT, target)} (${components.length} Komponenten).`);
