# Destiny 2 Tool by FreakItOut 1.7.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.7.0 schließt die offenen Baustellen: Offline-Ausgang, HUD-Editor,
Dashboard-Karten in S/M/L mit Suche und PNG-Export sowie der entfernte
Alt-Web-Rest.

### Neu in 1.7.0

- **Offline-Ausgang** – fehlgeschlagene Transfers/Ausrüstungen werden lokal
  gepuffert und automatisch nach Verbindung oder per Knopf gesendet; die
  Leiste zeigt Anzahl und letzten Fehler.
- **HUD-Editor im Overlay** – Chips anordnen, ausblenden, Größe S/M/L/XL,
  Profile für Alle/PvP/Raid inklusive automatischer Aktivitätswahl.
- **Dashboard-Karten** – Größe S/M/L, Live-Suche mit Trefferzahl und
  PNG-Export der Aktivitäts-Analyse.
- **Aufgeräumt** – die unsichtbare Alt-Webseiten-Leiste und ihre Verdrahtung
  sind entfernt; Portable/Setup nutzen maximale Kompression.

### Enthalten aus 1.6.0

- Champion-Prüfung, Sticky-Köpfe, Nach-oben-Knopf, Loadout-Warteschlange,
  CSV-Export, Fokus-Dashboard, Einfach-/Erweitert-Einstellungen und SBOM.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.7.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.7.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `sbom.cdx.json` | Software-Stückliste (CycloneDX) |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.7.0.exe`).

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

Version 1.7.0 closes the open workstreams: offline outbox, HUD editor,
dashboard cards in S/M/L with search and PNG export, and the removed legacy
web shell.

### New in 1.7.0

- **Offline outbox** – failed transfers/equips are buffered locally and sent
  automatically after reconnect or via button; the bar shows the count and
  last error.
- **HUD editor in the overlay** – reorder and hide chips, size S/M/L/XL, and
  profiles for All/PvP/Raid with automatic activity selection.
- **Dashboard cards** – size S/M/L, live search with a match count and PNG
  export for the activity analytics.
- **Cleaned up** – the invisible legacy web bar and its wiring are gone;
  portable/setup builds use maximum compression.

### Included from 1.6.0

- Champion audit, sticky headers, back-to-top, loadout queue, CSV export,
  focus dashboard, simple/advanced settings and SBOM.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.7.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.7.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `sbom.cdx.json` | Software bill of materials (CycloneDX) |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.7.0.exe`).

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
