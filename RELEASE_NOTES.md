# Destiny 2 Tool by FreakItOut 1.1.0

[Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Version 1.1.0 erweitert vor allem das Stream Deck und beseitigt sichtbare
Umlaut-/Encoding-Fehler.

### Neu in 1.1.0

- **Stream Deck: Verbindungs-Action** – prüft API, Token und App-Version.
- **Encoder für Loadouts, Händler und Checkliste** – drehen wählt, drücken
  wendet an/öffnet/hakt ab.
- **Routine-Rezepte** – Standard, Postfach, Woche, Händler, Raid-Prep.
- **Profil-Modus** – automatischer Wechsel nach Aktivität oder Kategorie
  (PvE/PvP/Gambit).
- **Toggle-Icons** für Overlay und Read-only.
- **Händler-Hinweis** erklärt fehlende Händler (Xûr Fr–Di, Eisenbanner/
  Prüfungen nur in ihrer Woche).
- **Umlaute repariert** – Manifest, Property Inspector, Plugin-Labels und
  App-Texte („Händler“, „Aktivität“, „Xûr“, „Größe“, „öffentlich“ …).

### Downloads

| Datei | Inhalt |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.1.0.exe` | Portable Version, keine Installation nötig |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.1.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optionales Stream-Deck-Plugin |
| `streamdeck-profile.json` | Passende Stream-Deck-Belegung |
| `SHA256SUMS.txt` | Prüfsummen aller Dateien |

GitHub ersetzt Leerzeichen in Dateinamen durch Punkte. Die Prüfsummen in
`SHA256SUMS.txt` beziehen sich auf die Originalnamen
(`Destiny 2 Tool by FreakItOut 1.1.0.exe`).

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

Version 1.1.0 focuses on Stream Deck and fixes visible umlaut/encoding issues.

### New in 1.1.0

- **Stream Deck connection action** – checks API, token and app version.
- **Encoders for loadouts, vendors and checklist** – rotate to select, press
  to apply/open/tick.
- **Routine recipes** – standard, postmaster, week, vendor, raid prep.
- **Profile mode** – automatic switching by activity or category
  (PvE/PvP/Gambit).
- **Toggle icons** for overlay and read-only.
- **Vendor hint** explains missing vendors (Xûr Fri–Tue, Iron Banner/Trials
  only in their week).
- **Umlauts fixed** – manifest, property inspector, plugin labels and app
  strings (“Händler”, “Aktivität”, “Xûr”, “Größe”, “öffentlich” …).

### Downloads

| File | Content |
| --- | --- |
| `Destiny.2.Tool.by.FreakItOut.1.1.0.exe` | Portable version, no installation required |
| `Destiny.2.Tool.by.FreakItOut.Setup.1.1.0.exe` | Installer |
| `com.freakitout.d2tool.streamDeckPlugin` | Optional Stream Deck plugin |
| `streamdeck-profile.json` | Matching Stream Deck profile |
| `SHA256SUMS.txt` | Checksums for all files |

GitHub replaces spaces in file names with dots. The checksums in
`SHA256SUMS.txt` refer to the original names
(`Destiny 2 Tool by FreakItOut 1.1.0.exe`).

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
