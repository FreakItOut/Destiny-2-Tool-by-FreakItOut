# Destiny 2 Tool by FreakItOut 1.2.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.2.0 macht das Inventar auch bei vollem Tresor flüssig: Kacheln werden
nur im sichtbaren Bereich gezeichnet, große Listen laden blockweise nach, und
die Scrollposition bleibt beim Neu-Rendern stehen.

### Neu in 1.2.0

- **Inventar-Virtualisierung** – feste Kachelhöhe und `content-visibility`:
  sichtbare Kacheln werden gezeichnet, der Rest kostet kaum Rechenzeit.
  Auch bei 1.700+ Items bleibt der Aufbau schnell und die Scrollhöhe stabil.
- **Blockweises Nachladen** – vollständig aufgeklappte Tresorlisten zeigen
  zuerst 120 Kacheln. „Weitere 120 laden“ oder Scrollen holt den nächsten
  Block; der DOM bleibt klein.
- **Scrollposition bleibt** – `overflow-anchor: none` verhindert Sprünge,
  wenn Off-Screen-Zeilen beim Scrollen nachwachsen.
- **TV-Modus** – Kachel- und Rasterbreite (76 px) passen wieder zusammen;
  die feste Kachelhöhe ist auf 104 px ausgelegt.
- **Tests** – neue E2E-Prüfungen für Blockplan, 120er-Erstblock und
  Paint-Virtualisierung (477 Schritte).

### Enthalten aus 1.1.0

- Stream Deck: Verbindungs-Action, Encoder für Loadouts/Händler/Checkliste,
  Routine-Rezepte, Profil-Modus, Toggle-Icons.
- Händler-Hinweis zu Xûr (Fr–Di) und Wochen-Händlern.
- Reparierte Umlaute in App, Manifest und Property Inspector.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.2.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.2.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.2.0.exe`).

### Voraussetzungen

- Windows 10 oder 11
- Destiny 2 im **randlosen Fenstermodus** (kein exklusives Vollbild)
- Eigener Bungie-API-Key und eigene Bungie-Anmeldung (Einstellungen → Bungie).
  Im Paket sind **keine** Zugangsdaten enthalten.

### Hinweise

- Die EXEs sind **nicht signiert**. Windows SmartScreen kann beim ersten Start
  eine Warnung anzeigen.
- Die portable Version legt ihre Daten im Ordner `Daten` neben der EXE ab
  (inkl. Konfiguration und verschlüsselter Zugangsdaten). Beim Kopieren den
  `Daten`-Ordner mitnehmen.
- Prüfsummen: `SHA256SUMS.txt` herunterladen und z. B. mit
  `Get-FileHash .\Datei.exe -Algorithm SHA256` vergleichen.
- Vollständige Anleitung:
  [README](https://github.com/FreakItOut/Destiny-2-Tool-by-FreakItOut/blob/main/README.md) ·
  Änderungen:
  [CHANGELOG](https://github.com/FreakItOut/Destiny-2-Tool-by-FreakItOut/blob/main/CHANGELOG.md).

### Datenschutz

Das Repository und die Release-Pakete enthalten keine API-Keys, OAuth-Tokens,
Client-Secrets, Passwörter, Kontodaten oder Konfigurationsdateien. Alle
Zugangsdaten bleiben lokal und werden mit Windows DPAPI verschlüsselt.

---

## English

Version 1.2.0 keeps the inventory smooth even with a full vault: tiles are
painted only in the visible area, large lists load in chunks, and the scroll
position survives re-renders.

### New in 1.2.0

- **Inventory virtualization** – fixed tile height and `content-visibility`:
  visible tiles are painted, the rest costs almost nothing. Building stays
  fast and the scroll height stays stable even with 1,700+ items.
- **Chunked loading** – fully expanded vault lists render 120 tiles first.
  “Load 120 more” or scrolling appends the next chunk; the DOM stays small.
- **Scroll position preserved** – `overflow-anchor: none` prevents jumps when
  off-screen rows grow during scrolling.
- **TV mode** – tile and grid width (76 px) match again; the fixed tile height
  is 104 px.
- **Tests** – new E2E checks for the chunk plan, first 120-tile block and
  paint virtualization (477 steps).

### Included from 1.1.0

- Stream Deck: connection action, encoders for loadouts/vendors/checklist,
  routine recipes, profile mode, toggle icons.
- Vendor hint for Xûr (Fri–Tue) and weekly vendors.
- Fixed umlauts in app, manifest and property inspector.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.2.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.2.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.2.0.exe`).

### Requirements

- Windows 10 or 11
- Destiny 2 in **borderless windowed mode** (no exclusive fullscreen)
- Your own Bungie API key and your own Bungie login (Settings → Bungie).
  The package contains **no** credentials.

### Notes

- The executables are **not code-signed**. Windows SmartScreen may show a
  warning on first start.
- The portable version stores its data in the `Daten` folder next to the EXE
  (including configuration and encrypted credentials). Copy that folder along
  with the EXE.
- Checksums: download `SHA256SUMS.txt` and compare with e.g.
  `Get-FileHash .\File.exe -Algorithm SHA256`.
- Full guide:
  [README.en.md](https://github.com/FreakItOut/Destiny-2-Tool-by-FreakItOut/blob/main/README.en.md) ·
  Changes:
  [CHANGELOG.en.md](https://github.com/FreakItOut/Destiny-2-Tool-by-FreakItOut/blob/main/CHANGELOG.en.md).

### Privacy

The repository and release packages contain no API keys, OAuth tokens, client
secrets, passwords, account data or configuration files. All credentials stay
local and are encrypted with Windows DPAPI.
