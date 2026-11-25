# Mitwirken / Contributing

Danke für dein Interesse! / Thanks for your interest!

## Entwicklung / Development

Voraussetzungen: Windows 10/11, Node.js 20+, npm.

```powershell
npm install
npm start        # App starten
npm run dev      # mit DevTools
```

Vor einem Pull Request bitte mindestens ausführen:

```powershell
npm run check
npm run lint
npm run test:types
npm run test:fixtures
npm run test:oauth
npm run test:config
npm run test:plugin
npm run e2e
```

`npm run verify` führt die vollständige 47-Schritte-Prüfung aus (dauert
mehrere Minuten).

## Regeln / Guidelines

- Deutsche Oberfläche; „Überladung“ statt „Überlast“.
- Keine Eingriffe in Destiny 2: keine DLL-Injection, Hooks oder Makros.
  Controller nur über XInput, keine Kernel-Filtertreiber.
- Neue Config-Schlüssel immer in `electron/config.js` unter `DEFAULTS`
  ergänzen.
- Keine echten API-Keys, OAuth-Tokens, Client-Secrets oder
  `config.json`/`Daten/`-Dateien einchecken. `.gitignore` beachten.
- Änderungen fokussiert halten und in beiden Editionen testen, falls die
  private LE lokal vorhanden ist (`npm run sync:le` bzw. `tools/sync-le.js`).
- UI-Änderungen mit Screenshot/Describe im PR erklären.

## Stream Deck

Plugin-Quelle: `streamdeck/com.freakitout.d2tool.sdPlugin/`.
Nach Änderungen:

```powershell
npm run test:plugin
npm run test:plugin-package
```

Das Manifest muss UTF-8 ohne Mojibake sein; `npm run test:plugin` prüft
Version, Aktionen und Umlaute.

## Issues

Bitte Version, Windows-Version, Bereich (App/Inventar/Stream Deck/API),
Schritte und ggf. Logs **ohne Zugangsdaten** beilegen. Für Sicherheitslücken
siehe [SECURITY.md](SECURITY.md).
