# Destiny 2 Tool by FreakItOut 1.4.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.4.0 macht Schluss mit den eingebetteten Webseiten: Die App zeigt nur
noch Dashboard, Inventar & Loadouts und die Werkzeuge – aufgeräumter, schneller
und ohne fremde Seiten.

### Neu in 1.4.0

- **Webseiten komplett entfernt** – Reiter, Kategorien, Favoriten,
  Seitenauswahl, Adressleiste, Find-in-Page und die Webview-Fläche sind weg.
  Die App startet direkt im Dashboard.
- **Schlanke Bedienleiste** – nur noch Inventar, Checkliste, Overlay, Notizen,
  Tasten-Legende, Einstellungen und Hilfe.
- **Aufgeräumte Einstellungen** – „Webseiten“ und „Eigene Seiten“ sind aus der
  Navigation entfernt; deren Panels werden nicht mehr angezeigt.
- **Overlay ohne Seitennavigation** – keine Kategorie-/Seitenauswahl und keine
  Zurück-/Vorwärts-/Neu-laden-Knöpfe für Webseiten mehr.
- **Entfernt:** Minimodus, Split-View, Bild-in-Bild, Seiten-Zoom,
  Adressleisten- und Find-Kürzel sowie der `/action/mini`-Endpunkt.
- **Sicherer:** `webviewTag` ist deaktiviert und die CSP erlaubt keine
  eingebetteten Frames mehr.
- **Direkte Aktionen:** Reset-Chip öffnet das Dashboard, Xûr-Chip die
  Händleransicht; DIM-Links öffnen im Standardbrowser.

### Enthalten aus 1.3.0

- Dashboard-Analytik mit 7/30-Tage-KPIs, 14-Tage-Balken, 12-Wochen-Heatmap
  und Kategorien.
- Inventar-Virtualisierung mit 120er-Blöcken für große Tresorlisten.
- Stream Deck mit Verbindungs-Action, Encodern, Rezepten und Profil-Modus.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.4.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.4.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.4.0.exe`).

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

Version 1.4.0 removes the embedded websites: the app now shows only the
dashboard, inventory & loadouts and the tools – cleaner, faster and without
third-party pages.

### New in 1.4.0

- **Websites fully removed** – tabs, categories, favourites, page picker,
  address bar, find-in-page and the webview area are gone. The app starts
  directly on the dashboard.
- **Slim app bar** – only inventory, checklist, overlay, notes, key legend,
  settings and help.
- **Cleaner settings** – “Websites” and “Custom pages” are removed from the
  navigation; their panels are no longer shown.
- **Overlay without site navigation** – no category/page picker and no
  back/forward/reload buttons for websites.
- **Removed:** mini mode, split view, picture-in-picture, page zoom, address
  bar and find shortcuts, and the `/action/mini` endpoint.
- **Safer:** `webviewTag` is disabled and the CSP no longer allows embedded
  frames.
- **Direct actions:** the reset chip opens the dashboard, the Xûr chip the
  vendor view; DIM links open in the default browser.

### Included from 1.3.0

- Dashboard analytics with 7/30-day KPIs, 14-day bars, a 12-week heatmap and
  categories.
- Inventory virtualization with 120-item chunks for large vault lists.
- Stream Deck with connection action, encoders, recipes and profile mode.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.4.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.4.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.4.0.exe`).

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
