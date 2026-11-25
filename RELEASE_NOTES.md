# Destiny 2 Tool by FreakItOut 1.3.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.3.0 erweitert das Dashboard um eine echte Aktivitäts-Analyse: KPIs,
14-Tage-Verlauf, 12-Wochen-Heatmap und Kategorien – auf Basis eines längeren
Verlaufs für alle Charaktere.

### Neu in 1.3.0

- **Aktivitäts-Analyse** – neue Dashboard-Karte mit Kennzahlen für 7 und
  30 Tage: Aktivitäten, Raids & Dungeons, Großmeister, PvP inkl. Prüfungen,
  K/D, Serie und Spielzeit.
- **14-Tage-Balken** – Aktivitäten pro Tag mit Minuten-Tooltip.
- **12-Wochen-Heatmap** – Intensität je Tag, Montag bis Sonntag; zukünftige
  Tage bleiben leer.
- **Kategorien & Top-Aktivitäten** – Verteilung auf Raid, Dungeon, Nightfall,
  GM, Prüfungen, PvP, Gambit und Sonstiges sowie die häufigsten Aktivitäten
  der letzten 30 Tage.
- **Längerer Verlauf** – Aktivitäten aller Charaktere, bis zu 100 Einträge je
  Charakter, dedupliziert und nach Datum sortiert; inklusive Modus-Kategorie
  für eine robuste Einordnung.
- **Ein Abruf für zwei Karten** – „Letzte Aktivitäten“ und Analyse teilen
  Cache und Request; „Neu laden“ aktualisiert beide.

### Enthalten aus 1.2.0

- Inventar-Virtualisierung mit festen Kachelhöhen, Paint-Virtualisierung und
  120er-Blöcken für große Tresorlisten.
- Stream Deck aus 1.1.0: Verbindungs-Action, Encoder, Rezepte, Profil-Modus.

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.3.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.3.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.3.0.exe`).

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
- Die Analyse nutzt die Aktivitäts-Historie der Bungie-API. „XP“ wird dort
  nicht je Woche ausgeliefert; die Spielzeit (Minuten) dient als belastbare
  Kennzahl.
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

Version 1.3.0 adds real activity analytics to the dashboard: KPIs, a 14-day
trend, a 12-week heatmap and categories – based on a longer history for all
characters.

### New in 1.3.0

- **Activity analytics** – new dashboard card with 7/30-day metrics:
  activities, raids & dungeons, Grandmaster, PvP incl. Trials, K/D, streak and
  play time.
- **14-day bars** – activities per day with a minutes tooltip.
- **12-week heatmap** – intensity per day, Monday to Sunday; future days stay
  empty.
- **Categories & top activities** – distribution across raid, dungeon,
  Nightfall, GM, Trials, PvP, Gambit and other, plus the most frequent
  activities of the last 30 days.
- **Longer history** – activities of all characters, up to 100 entries each,
  deduplicated and sorted by date, including the mode category for robust
  classification.
- **One fetch for two cards** – “Last activities” and analytics share cache
  and request; “Reload” refreshes both.

### Included from 1.2.0

- Inventory virtualization with fixed tile heights, paint virtualization and
  120-item chunks for large vault lists.
- Stream Deck from 1.1.0: connection action, encoders, recipes, profile mode.

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.3.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.3.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.3.0.exe`).

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
- Analytics uses the Bungie activity history. “XP” is not exposed per week
  there, so play time (minutes) is used as a reliable metric.
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
