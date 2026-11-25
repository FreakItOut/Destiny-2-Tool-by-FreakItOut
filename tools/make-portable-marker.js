// ============================================================
// Portabler Marker erzeugen
// ============================================================
// Legt eine leere Datei "portable" neben die portable EXE, damit
// die App beim Start portablen Modus erkennt (Daten neben der EXE
// statt in %APPDATA%).
// Aufruf: automatisch nach npm run dist / dist:portable
// ============================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

try {
  // Portable-EXE finden (Name endet auf ".exe", nicht "Setup")
  const files = fs.readdirSync(DIST).filter((f) => /\.exe$/i.test(f) && !/setup/i.test(f));
  for (const file of files) {
    const marker = path.join(DIST, 'portable');
    fs.writeFileSync(marker, 'portable', 'utf8');
    console.log(`Portabler Marker erstellt: ${marker}`);
  }
} catch (error) {
  console.warn('Portabler Marker konnte nicht erstellt werden:', error.message);
}
