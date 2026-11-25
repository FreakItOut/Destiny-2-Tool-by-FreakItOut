# Stream Deck + lokale Destiny-API

Das Tool stellt eine lokale, token-geschützte API bereit (nur `127.0.0.1`).

## Aktivieren
Einstellungen → Sicherheit → Stream-Deck-API aktivieren → Port wählen → Integrationen speichern.
Über „URL kopieren“ bekommst du eine fertige URL mit Token.

## Endpunkte
| Pfad | Inhalt |
|---|---|
| `/health` | lebt die API? |
| `/status` | Spieler + Charaktere + Licht |
| `/summary` | Poststelle, Tresor, Godrolls, Checkliste, Resets |
| `/priorities` | aktuelle Aufgabenliste |
| `/weekly` | Weekly-Reset, Xûr-Status |
| `/inventory` | Zähler aus dem letzten Snapshot |
| `/loadouts` | gespeicherte Tool-Loadouts |
| `/xur` | letzte Xûr-Daten (falls geladen) |
| `/actions` | letzte protokollierte Aktionen |

## Aktionen (Token nötig, GET oder POST)
| Pfad | Aktion |
|---|---|
| `/action/digest` | Weekly-Digest jetzt senden |
| `/action/collect-postmaster` | Poststelle einsammeln (Read-only-Modus blockt) |
| `/action/refresh` | Wunschlisten-Cache leeren |
| `/action/view?view=week` | Werkzeugseite öffnen (`overview`, `builds`, `week`, `collection`, `vendor`) |
| `/action/loadout?id=<loadoutId>` | gespeichertes Loadout anwenden (zeigt vorher die Vorschau) |
| `/action/overlay` | Overlay ein-/ausblenden |

Aktionen antworten sofort mit `202 { ok: true }` und werden in der Oberfläche ausgeführt.
`/loadout` liefert die IDs, die `/action/loadout` erwartet.

## Stream-Deck-Beispiel (Windows)
1. Neues „Website“- oder „System → Öffnen“-Kommando anlegen.
2. URL aus dem Tool einfügen, z. B.:
   `http://127.0.0.1:7331/summary?token=DEIN_TOKEN`
3. Für ein Poststellen-Widget eignet sich ein „HTTP Request“-Plugin mit JSON-Abfrage auf `postmaster`.
4. Für ein Xûr-Widget `xurActive` und `xurItems` aus `/weekly` nutzen.
5. Für Werkzeugseiten und Loadouts die Aktionen oben als URL-Kommando verwenden, z. B.
   `http://127.0.0.1:7331/action/view?view=week&token=DEIN_TOKEN`.

## Sicherheit
- Token niemals weitergeben.
- Lese-Endpunkte sind read-only und nur an `127.0.0.1` gebunden; `lan` öffnet sie bewusst im Heimnetz.
- Aktionen sind token-geschützt; der Read-only-Modus blockt schreibende Aktionen.
- Token lässt sich in den Einstellungen jederzeit neu erzeugen (Integrationen speichern).
