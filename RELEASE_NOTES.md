# Destiny 2 Tool by FreakItOut 1.5.1

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.5.1 verbessert den TV-Modus im Inventar: mehr Items pro Zeile,
weniger leere Poststellen-Plätze und kompaktere Kopfbereiche.

### Neu in 1.5.1

- **TV-Inventar nutzt die volle Breite** – Kacheln füllen die Zelle per
  `auto-fill` statt nur drei fester Spalten. Dadurch sind deutlich mehr Items
  gleichzeitig sichtbar.
- **Poststelle kompakt** – im TV-Modus werden nur belegte Slots plus ein
  kleiner Puffer gerendert, nicht mehr 21 leere Plätze.
- **Kompaktere TV-Kopfzeile** – kleinere Tabs, Filter und Abstände; die
  Kacheln bleiben mit 76 px groß und fokussierbar.
- **E2E-Tests** prüfen TV-Spalten und Kachelgröße.

### Enthalten aus 1.5.0

- Fokus-Dashboard, Einfach-/Erweitert-Einstellungen, Loadout-Warteschlange
  mit Konflikterkennung, 90-Tage-Analyse und SBOM.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.5.1.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.5.1.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `sbom.cdx.json` | Software-Stückliste (CycloneDX) |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.5.1.exe`).

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

Version 1.5.1 improves the TV mode inventory: more items per row, fewer empty
postmaster slots and more compact headers.

### New in 1.5.1

- **TV inventory uses the full width** – tiles fill the cell via `auto-fill`
  instead of only three fixed columns. Many more items are visible at once.
- **Compact postmaster** – in TV mode only occupied slots plus a small buffer
  are rendered, not 21 empty slots.
- **More compact TV header** – smaller tabs, filters and gaps; tiles stay at
  76 px and remain focusable.
- **E2E tests** check TV columns and tile size.

### Included from 1.5.0

- Focus dashboard, simple/advanced settings, loadout queue with conflict
  detection, 90-day analytics and SBOM.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.5.1.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.5.1.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `sbom.cdx.json` | Software bill of materials (CycloneDX) |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.5.1.exe`).

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
