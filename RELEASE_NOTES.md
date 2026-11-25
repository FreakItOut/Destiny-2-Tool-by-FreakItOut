# Destiny 2 Tool by FreakItOut 1.5.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.5.0 macht die App alltagstauglicher: fokussiertes Dashboard,
einfachere Einstellungen, Loadout-Warteschlange mit Konflikterkennung und ein
längerer Aktivitätsverlauf.

### Neu in 1.5.0

- **Fokus-Dashboard** – standardmäßig nur Hüter, Prioritäten, Analyse und
  Wochen-Checkliste. „Alle anzeigen“ holt die restlichen Karten; die Wahl
  wird gespeichert.
- **Einfach-/Erweitert-Modus** – Steam Input, Sicherheit und Diagnose sind
  nur noch im Erweitert-Modus sichtbar. Die Overlay-Leiste bleibt normal
  erreichbar.
- **Loadout-Warteschlange** – mehrere Loadouts nacheinander anwenden, inkl.
  Fortschritt und automatischem Überspringen blockierender Konflikte.
- **Konflikterkennung** – mehrere Exoten, falsche Klasse und fehlende Items
  werden vor dem Anwenden gemeldet.
- **90-Tage-Verlauf** – die Aktivitäts-Analyse speichert tägliche Aggregate
  lokal und zeigt den längeren Trend.
- **SBOM** – CycloneDX-Datei für Releases (`dist/sbom.cdx.json`).
- **Werkzeuge-Knopf** direkt in der App-Leiste.
- **Sicherer:** CSP-Verbindungen nur noch zu Bungie; kompaktere Leiste.

### Enthalten aus 1.4.0

- Webseiten vollständig entfernt (native Ansichten, keine Webviews).
- Dashboard-Analytik, Inventar-Virtualisierung und Stream Deck.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.5.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.5.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `sbom.cdx.json` | Software-Stückliste (CycloneDX) |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.5.0.exe`).

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

Version 1.5.0 makes the app more usable day to day: a focused dashboard,
simpler settings, a loadout queue with conflict detection and a longer
activity history.

### New in 1.5.0

- **Focus dashboard** – only Guardian, priorities, analytics and the weekly
  checklist by default. “Show all” reveals the rest; the choice is saved.
- **Simple/advanced mode** – Steam Input, security and diagnostics only show
  in advanced mode. The overlay bar stays available normally.
- **Loadout queue** – apply multiple loadouts in sequence, with progress and
  automatic skipping of blocking conflicts.
- **Conflict detection** – multiple exotics, wrong class and missing items are
  reported before applying.
- **90-day history** – activity analytics stores daily aggregates locally and
  shows the longer trend.
- **SBOM** – CycloneDX file for releases (`dist/sbom.cdx.json`).
- **Tools button** directly in the app bar.
- **Safer:** CSP connections only to Bungie; more compact bar.

### Included from 1.4.0

- Websites fully removed (native views, no webviews).
- Dashboard analytics, inventory virtualization and Stream Deck.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.5.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.5.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `sbom.cdx.json` | Software bill of materials (CycloneDX) |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.5.0.exe`).

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
