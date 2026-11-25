# Modul-Aufteilung (Plan)

Stand: 21.11.2026 · Grundlage: `npm run test:modules`

## Fortschritt

- **Lazy-Loading (erledigt):** `app.js` lädt `inventory.js` erst beim ersten
  Öffnen des Inventars (`loadInventory()` + Fassade). `inventory.js` lädt
  `tools.js` erst beim ersten Öffnen der Werkzeugzentrale (`ensureTools()`).
  Beim Start werden dadurch rund 1 MB Renderer-Code nicht mehr geparst.
- **Loadout-Modell (erledigt):** `loadouts/model.js` enthält die reinen
  Funktionen für Overlay-Auswahl, Pin/Tag-Umschaltung und Suchtext; genutzt
  von `inventory.js` und `overlay-loadouts.js`.
- **Overlay-Schnellzugriff (erledigt):** eigenes Modul
  `overlay-loadouts.js` (max. 4 angeheftete Loadouts, sonst zuletzt genutzte).
- **Picker-Vorlagen (erledigt):** `picker/presets.js` enthält die neun
  Meta-Vorlagen und den Meta-Stand; `armor-math.js` bleibt die gemeinsame
  Scoring-Quelle für UI und Worker.
- **Aktionsjournal (erledigt):** `journal.js` führt globales Undo/Redo für
  Tags, Favoriten und Loadout-Anwenden; `Strg+Z`/`Strg+Y` nutzen es zuerst.
- **Virtualisierung (erledigt, leichtgewichtig):** große Inventar-Buckets
  rendern nur ein Fenster (40–80 Kacheln) und lassen sich per „weitere
  anzeigen“ erweitern; `content-visibility`/Lazy-Rows bleiben als zweite Stufe.
- **Such-Worker (erledigt):** `search-worker.js` übernimmt einfache
  Freitext-Suchen inklusive Tippfehler-Toleranz; Ergebnisse werden pro
  Datenstand gecacht, Operatoren-Suchen bleiben im Renderer.
- Nächste Schritte: `picker/picker-model.js`, `week/week.js`,
  `sources/sources.js`.

## Ist-Zustand

| Modul | Größe | Zeilen |
|---|---|---|
| `renderer/js/tools.js` | ~520 KB | ~9.000 |
| `renderer/js/inventory.js` | ~486 KB | ~9.000 |
| `renderer/js/i18n-en.js` | ~291 KB | generiert |

## Zielbild

| Neues Modul | Inhalt | Abhängigkeiten |
|---|---|---|
| `picker/picker-model.js` | Pool, Kandidaten, Scoring, Worker-Payload | `armor-math.js` |
| `picker/picker-ui.js` | Picker-Ansicht, Vorlagen, Tuning, Teilen | `picker-model.js` |
| `loadouts/editor.js` | Drawer, Slots, Mods, Energie | `db.js`, `api.js` |
| `loadouts/library.js` | Ordner, Tags, Suche, Vergleich, Checkliste | `editor.js` |
| `week/week.js` | Checkliste, Timer, Encounter, Digest | `encounter-data.js` |
| `sources/sources.js` | Quellen, Besitzquote, Routen, Suche | `loot-guides.js` |
| `collection/records.js` | Triumphs, Sammlung, Zielbrett | `db.js` |
| `diagnostics/diagnostics.js` | Overlay, Integrität, Secrets, Crash, Backup | `api.js` |

Bereits ausgelagert: `armor-math.js`, `encounter-data.js`, `picker-worker.js`, `clock.js`.

## Vorgehen

1. Reine Daten und Mathematik zuerst (keine DOM-Abhängigkeiten).
2. Danach je Bereich die Render-Funktionen verschieben, Zustand über ein
   kleines Context-Objekt (`data`, `cfg`, `toast`, `render`) übergeben.
3. Nach jedem Schritt: `node tools/check.js`, `npm run test:i18n`, E2E.
4. Erst wenn alle Bereiche grün sind, optional esbuild mit Code-Splitting.

## Messbare Ziele

- Startzeit und Speicherbedarf messen (`test:perf`).
- Render-Budget je Werkzeugseite (< 150 ms) im E2E.
- Kein Modul über 250 KB (Warnschwelle im Modulbericht).
