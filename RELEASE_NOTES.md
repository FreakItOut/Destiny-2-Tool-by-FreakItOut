# Destiny 2 Tool by FreakItOut 1.8.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.8.0 bringt den Feinschliff: Offline-Ausgang und Loadout-Warteschlange mit Detailpanels, HUD-Editor mit Drag & Drop und Profilen, Champion-Prüfung, Suche 2.0 und automatisierte Releases.

### Neu in 1.8.0

- **Offline-Ausgang mit Detailpanel** – Aktionen einzeln wiederholen,
  entfernen und sortieren; vor dem Senden wird der aktuelle Item-Stand geprüft.
- **Loadout-Warteschlange mit Panel** – anhalten, sortieren, wiederholen und
  erledigte Einträge aufräumen.
- **HUD-Editor** – Drag & Drop, Größe/Farbe pro Chip, Profile pro Monitor/DPI
  sowie Export/Import als JSON.
- **Champion-Prüfung** – Waffen ohne Brecher sammeln, per Bulk zuweisen und
  Overrides importieren/exportieren.
- **Suche 2.0** – Treffer im Tooltip hervorgehoben, Operator-Hilfe im Filter.
- **Release-Workflow** – Tags bauen und veröffentlichen die Assets automatisch.
- **Aufgeräumt** – Web-Einstellungsseiten entfernt, Einstellungen und HUD-Code
  werden erst bei Bedarf geladen.

### Enthalten aus 1.7.0

- Champion-Prüfung, Sticky-Köpfe, Nach-oben-Knopf, Loadout-Warteschlange,
  CSV-Export, Fokus-Dashboard, Einfach-/Erweitert-Einstellungen und SBOM.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.8.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.8.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `sbom.cdx.json` | Software-Stückliste (CycloneDX) |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.8.0.exe`).

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

Version 1.8.0 is the polish release: offline outbox and loadout queue detail panels, a HUD editor with drag & drop and profiles, champion audit, search 2.0 and automated releases.

### New in 1.8.0

- **Offline outbox with detail panel** – retry, remove and reorder actions;
  the current item state is checked before sending.
- **Loadout queue panel** – pause, reorder, retry and clear finished entries.
- **HUD editor** – drag & drop, per-chip size/colour, profiles per monitor/DPI
  and JSON export/import.
- **Champion audit** – collect weapons without a breaker, bulk assign and
  import/export overrides.
- **Search 2.0** – matches highlighted in the tooltip and operator help in the
  filter menu.
- **Release workflow** – tags build and publish the assets automatically.
- **Cleaned up** – web settings pages removed; settings and HUD code load only
  when needed.

### Included from 1.7.0

- Champion audit, sticky headers, back-to-top, loadout queue, CSV export,
  focus dashboard, simple/advanced settings and SBOM.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.8.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.8.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `sbom.cdx.json` | Software bill of materials (CycloneDX) |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.8.0.exe`).

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
