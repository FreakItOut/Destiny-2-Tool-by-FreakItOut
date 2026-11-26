# Destiny 2 Tool by FreakItOut 1.12.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.12.0 entfernt den letzten Web-Rest: kein web-Stub, keine Kategorie-/Site-Daten und deutlich weniger toter Code in app.js.

### Neu in 1.12.0

- **Web-Rest entfernt** – app.js schrumpft von ~143 KB auf ~98 KB; URL-Leiste,
  Suchen, Stummschalten, Verlauf, Tab-Menü, PiP und Auto-Refresh sind weg.
- **Controller bereinigt** – keine Webview-Option mehr.
- **Einstellungen** ohne Kategorie-/Web-Quelle.
- **Dashboard** öffnet News direkt im Browser.

### Enthalten aus 1.11.0

- **Bungie-Icon-Cache** – Bilder werden einmal geladen und lokal ausgeliefert.
- **Platzhalter** – kein leeres Loch mehr, während Icons laden.
- **Render-Budget** – der erste Inventar-Render wird gemessen und in E2E
  gegen 3.000 ms geprüft.

### Enthalten aus 1.10.0

- **ODER-Suche** – mehrere Begriffe mit `OR` kombinieren.
- **Daten-Migration** – alter Installationsordner wird getestet und sicher
  nach `%APPDATA%` übernommen.
- **Lokale API/Stream Deck** – Aktionen für Offline-Ausgang, Loadout-Queue
  und Champion-Prüfung.
- **Full-Shell-Smoke** – Navigation und alle neuen Panels im echten App-Lauf.

### Enthalten aus 1.9.0

- **Config-Rettung** – letzte gültige Fassung als `config.json.bak`, automatische
  Wiederherstellung bei defekter Datei.
- **Persistente Loadout-Warteschlange** – überlebt Neustarts, bewusstes Fortsetzen.
- **Offline-Ausgang** – Konfliktvorschau, Backoff, Markieren und Mod-Sockets.
- **Suche 2.0** – Treffer im Popup/Perk, gespeicherte Suchen verwalten.
- **Champion-Prüfung** – Undo für Korrekturen.
- **HUD** – Chips direkt im Overlay ziehen, Sichtbarkeit nach PvE/PvP.
- **Dashboard** – Kartengröße pro Karte, Heute-Layout, PNG-Export.
- **Schneller Start** – englische Übersetzung lädt erst bei Bedarf.

### Enthalten aus 1.8.1

- **Setup-Updates erhalten Nutzerdaten** – die installierte Version schreibt
  immer nach `%APPDATA%\FreakItOut's Destiny 2 Tool`; Setup-Updates
  ersetzen weder Konfiguration noch verschlüsselte Tokens.
- **Automatische Übernahme** – ältere Daten aus dem Installationsordner
  werden beim Setup bzw. ersten Start einmalig übernommen.
- **Deinstallation behält die Daten** – zum vollständigen Entfernen den
  Datenordner manuell löschen.

### Enthalten aus 1.8.0

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
| `Destiny.2.Tool.by.FreakItOut.1.12.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.12.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `sbom.cdx.json` | Software-Stückliste (CycloneDX) |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.12.0.exe`).

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

Version 1.12.0 removes the last web remainder: no web stub, no category/site data and much less dead code in app.js.

### New in 1.12.0

- **Web remainder removed** – app.js shrinks from ~143 KB to ~98 KB; URL bar,
  find, mute, history, tab menu, PiP and auto-refresh are gone.
- **Controller cleaned** – no webview option anymore.
- **Settings** without a category/web provider.
- **Dashboard** opens news directly in the browser.

### Included from 1.11.0

- **Bungie icon cache** – images are downloaded once and served locally.
- **Placeholder** – no empty hole while icons load.
- **Render budget** – the first inventory render is measured and checked
  against 3,000 ms in E2E.

### Included from 1.10.0

- **OR search** – combine several terms with `OR`.
- **Data migration** – old installation data is tested and safely adopted
  into `%APPDATA%`.
- **Local API/Stream Deck** – actions for the offline outbox, loadout queue
  and champion audit.
- **Full-shell smoke** – navigation and all new panels in a real app run.

### Included from 1.9.0

- **Config recovery** – last valid copy as `config.json.bak`, automatic restore
  for a broken file.
- **Persistent loadout queue** – survives restarts, resumed deliberately.
- **Offline outbox** – conflict preview, backoff, lock and mod-socket actions.
- **Search 2.0** – matches in the popup/perks, saved-search management.
- **Champion audit** – undo for corrections.
- **HUD** – drag chips directly in the overlay, visibility by PvE/PvP.
- **Dashboard** – per-card size, Today layout, PNG export.
- **Faster start** – English dictionary loads on demand.

### Included from 1.8.1

- **Setup updates keep user data** – the installed version always writes to
  `%APPDATA%\FreakItOut's Destiny 2 Tool`; updates replace neither the
  configuration nor encrypted tokens.
- **Automatic migration** – older data from the installation folder is taken
  over once during setup or on first start.
- **Uninstall keeps the data** – delete the data folder manually to remove
  everything.

### Included from 1.8.0

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
| `Destiny.2.Tool.by.FreakItOut.1.12.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.12.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `sbom.cdx.json` | Software bill of materials (CycloneDX) |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.12.0.exe`).

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
