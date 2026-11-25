# Sicherheit / Security

## Unterstützte Versionen / Supported versions

| Version | Unterstützt |
| --- | --- |
| 1.1.x | ✅ |
| 1.0.x | ⚠️ nur Sicherheitsfixes |
| < 1.0 | ❌ |

## Sicherheitslücken melden / Reporting a vulnerability

Bitte **keine** öffentlichen Issues für Sicherheitslücken öffnen. Nutze
stattdessen **GitHub → Security → Report a vulnerability** (privater
Security Advisory) im Repository:

https://github.com/FreakItOut/Destiny-2-Tool-by-FreakItOut/security/advisories/new

Bitte angeben:

- betroffene Version und Windows-Version
- Bereich (App, lokale API, Stream-Deck-Plugin, OAuth)
- Reproduktion und Auswirkung
- ob Zugangsdaten/Token betroffen sein könnten (keine echten Secrets mitschicken)

Wir melden uns schnellstmöglich zurück. Bitte keine Details veröffentlichen,
bevor ein Fix verfügbar ist.

Please **do not** open public issues for security vulnerabilities. Use the
private GitHub security advisory link above and include the affected version,
Windows version, area (app, local API, Stream Deck plugin, OAuth), steps to
reproduce, impact and whether credentials may be affected (never send real
secrets).

## Umgang mit Zugangsdaten / Credentials

- Im Repository sind **keine** API-Keys, OAuth-Tokens, Client-Secrets,
  Passwörter oder Konfigurationsdateien enthalten.
- Zugangsdaten werden lokal mit Windows DPAPI (`safeStorage`) verschlüsselt.
- Die Konfiguration liegt unter
  `%APPDATA%\FreakItOut's Destiny 2 Tool\config.json` bzw. portable in
  `Daten\config.json` neben der EXE und ist nicht Teil des Repositories.
- Die lokale API sollte mit Token (idealerweise Nur-Lese-Token) und ohne
  LAN-Freigabe betrieben werden, wenn sie nicht benötigt wird.
- Bei Verdacht auf ein geleaktes Secret: Token im Bungie-Entwicklerportal
  erneuern, OAuth-Token widerrufen und die lokale API-Tokenliste bereinigen.

## Geltungsbereich / Scope

- Destiny 2 Tool (Electron-App, Renderer, lokale HTTP-API)
- Stream-Deck-Plugin (`com.freakitout.d2tool.sdPlugin`)
- Build-/Release-Skripte in `tools/`

Nicht im Scope: Destiny 2 selbst, Bungie-Dienste, Drittanbieter-Webseiten.
