# Stream Deck / lokale HTTP-API

Die Stream-Deck-Anbindung ist eine normale lokale HTTP-API. Kein SDK-Zwang:
Jeder Stream-Deck-Knopf kann eine URL aufrufen. Zusätzlich liegt ein
optionales, schlankes Plugin unter `streamdeck/` bei, das die HTTP-API
verwendet (keine DLL-Injection, keine Eingriffe in Destiny 2).

## Aktivieren

1. Einstellungen → Schnittstellen → **Stream-Deck-API** aktivieren.
2. Port (Standard `7331`) und Token prüfen.
3. Optional: **Nur-Lese-Token** oder benannte Tokens für einzelne Geräte.
4. **Integrationen speichern**.
5. In Stream Deck eine **Website-/HTTP-Aktion** anlegen und die URL eintragen.

Basis-URL:

```text
http://127.0.0.1:7331
```

Token entweder als `?token=…`, als Header `X-D2-Token` oder als
`Authorization: Bearer …`. Alle Pfade funktionieren zusätzlich unter `/v1/…`
(z. B. `/v1/state`). Antworten enthalten `X-Request-Id`, `X-API-Version` und
bei Aktionen `requestId`/`durationMs`.

### Token-Rollen

| Rolle | Lesen | Aktionen | Admin (`/logs`, `/metrics`, `/tokens`) |
|---|---|---|---|
| `read` | ja | nein | nein |
| `action` | ja | ja | nein |
| `admin` | ja | ja | ja |

Der Haupt-Token ist `admin`, der Nur-Lese-Token `read`. Benannte Tokens
werden nur als SHA-256-Hash gespeichert; Haupt- und Nur-Lese-Token liegen
mit Windows `safeStorage` verschlüsselt in der Konfiguration.

### Query-Token, signierte URLs und HMAC

`X-D2-Token` oder `Authorization: Bearer` ist der Standard. `?token=…`
funktioniert weiterhin, ist aber als veraltet markiert (`Deprecation`-Header),
und lässt sich in den Einstellungen abschalten. Alternativen:

- **Signierte URL:** `/state?exp=<unix>&sig=<hmac>` – HMAC über
  `METHOD\nPATH\nquery\nEXP`, gültig bis 30 Tage, standardmäßig 24 h.
- **HMAC-Request:** `X-D2-Timestamp` + `X-D2-Signature` (HMAC über
  `METHOD\nPATH\nquery\nTIMESTAMP[\nBODY]`), Zeitfenster 120 s. HMAC-Anfragen
  haben `action`-Scope, keine Admin-Rechte.
- **LAN:** optionale IP-Allowlist und HMAC-Pflicht für Nicht-Loopback-Adressen.

Nach mehreren ungültigen Token-Versuchen wird die IP temporär gesperrt.

### Browser und CORS

Standardmäßig werden keine fremden Browser-Origins erlaubt. Erlaubte
Origins lassen sich in den Einstellungen als Komma-Liste eintragen
(`http://localhost:3000`). Eingebettete Browser-Ressourcen (`<img>`,
`fetch(..., {mode:'no-cors'})`) dürfen keine Aktionen auslösen.


## Beispiele

```text
http://127.0.0.1:7331/action/view?view=vendor&token=DEIN_TOKEN
http://127.0.0.1:7331/action/loadout?name=PvE&token=DEIN_TOKEN
http://127.0.0.1:7331/action/loadout/missing?id=LOADOUT-ID&token=DEIN_TOKEN
http://127.0.0.1:7331/action/overlay&token=DEIN_TOKEN
http://127.0.0.1:7331/action/inventory&token=DEIN_TOKEN
http://127.0.0.1:7331/action/postmaster&token=DEIN_TOKEN
http://127.0.0.1:7331/action/checklist&token=DEIN_TOKEN
http://127.0.0.1:7331/action/checklist/toggle?text=Wochenchallenges&token=DEIN_TOKEN
http://127.0.0.1:7331/action/refresh-inventory&token=DEIN_TOKEN
http://127.0.0.1:7331/action/focus&token=DEIN_TOKEN
http://127.0.0.1:7331/action/vendors?wishlist=1&token=DEIN_TOKEN
http://127.0.0.1:7331/action/batch?do=overlay/show,vendors:wishlist=1&token=DEIN_TOKEN
```

## Kurz-URLs

| Kurz | Bedeutung |
|---|---|
| `/v?view=vendor` | Werkzeugseite öffnen |
| `/l?id=LOADOUT-ID` | Loadout anwenden |
| `/o` | Overlay ein-/ausblenden |
| `/p` | Postfach öffnen |
| `/f` | Overlay fokussieren |
| `/x` | Xûr-Fenster öffnen |
| `/c` | Wochen-Checkliste öffnen |

## Live-Werte für Keys

```text
/state
/state.txt
/state.txt?lang=en
/focus
/key/postmaster
/key/vault?warnAt=900
/key/checklist
/key/week
/key/reset
/key/xur
/key/xur-wishlist
/key/focus
/key/controller
/key/activity
/key/loadout
/key/nightfall
/key/season
/key/crafting
/badge/postmaster.svg
/badge/vault.svg?warnAt=1000&theme=light&size=120
/badge/xur.svg?style=compact&label=X%C3%BBr
/items?filter=godroll&limit=20
/search?q=Gjallarhorn
/auth/status
/queue
/digest/preview
/changelog
```

`/state.txt` eignet sich für eine Textzeile, `/key/...` für einen einzelnen
Wert und `/badge/...svg` als Key-Bild. Badge-Parameter: `lang=de|en`,
`theme=dark|light`, `size=72..256`, `style=compact`, `label=…`, `warnAt=…`.
`/events` ist ein Server-Sent-Events-Stream;
`types=state,focus,overlay,postmaster,vault,checklist,xur` filtert die
Event-Typen. `Last-Event-ID` wird für Replays der letzten Events unterstützt.

`/openapi.json`, `/openapi.yaml` und `/commands.txt` liefern die aktuelle
API-Beschreibung. `docs/local-api-client.js` ist ein generierter JS-Client.

## Fortgeschritten

### ETag, Delta und Caching

`/state` und `/key/...` liefern einen `ETag`. Mit `If-None-Match` antwortet
die API mit `304` und leerem Body. `/state?delta=1` liefert nur geänderte
Felder seit der letzten Anfrage derselben IP.

### Jobs und asynchrone Aktionen

`/action/digest?async=1` und `/action/collect-postmaster?async=1` starten
einen Hintergrund-Job und antworten mit `202` und `jobId`. Status:

```text
/jobs
/jobs/{id}
POST /jobs/{id}/cancel
```

Jobs enthalten `progress`, `message` und `state` (`queued`, `running`,
`done`, `failed`, `cancelled`).

### Trockenlauf

`dryRun=1` prüft eine Aktion, ohne sie auszuführen:

```text
/action/loadout?name=PvE&dryRun=1
/action/batch?do=overlay/show,view:view=week&dryRun=1
/action/digest?dryRun=1
/action/collect-postmaster?dryRun=1
```

### Batch

`stopOnError=1` bricht beim ersten Fehler ab, `timeoutMs=1000..30000`
begrenzt jeden Schritt. Teilfehler liefern HTTP `207` und `ok:false`.

### Workflow

`POST /action/workflow` führt mehrere Schritte mit optionalen Bedingungen aus:

```json
{
  "stopOnError": true,
  "timeoutMs": 10000,
  "steps": [
    { "action": "toast", "params": { "message": "Wochenreset" } },
    { "action": "view", "params": { "view": "week" }, "if": "checklist.mustOpen" }
  ]
}
```

`if` liest einen Pfad aus `/state`; `equals` vergleicht optional exakt.

### Benannte Tokens

`/tokens` listet Tokens ohne Geheimnis. Neue Tokens:

```text
/action/tokens/create?name=StreamDeck&scope=action&days=30
/action/tokens/revoke?id=token-…
```

Der Token wird nur beim Erzeugen einmal im Klartext zurückgegeben. In den
Einstellungen gibt es dafür eine eigene Token-Verwaltung mit Kopieren und
Widerrufen. `ttl` (Sekunden) ist für Tests und kurze Sitzungen gedacht.

### Checkliste

```text
/checklist
PATCH /checklist/{id}       {"text":"…","done":true,"group":"own"}
DELETE /checklist/{id}
POST /checklist/reorder     {"ids":["c-1","c-2"]}
```

### Händler-Filter

```text
/vendors?wishlist=1&limit=20&offset=0
/vendors?vendor=Banshee&q=Waffe
```

Antworten enthalten `stale`, `ageMs`, `total`, `wishlistOnly` und pro
Angebot `wishlisted`, `owned` und `costs`.

### Diagnose

```text
/health        → ready/degraded, Checks für API, Renderer, Config, Bungie, Caches
/metrics       → Anfragen, Fehler, Aktionen, p50/p95, Status-Codes
/metrics.txt   → Prometheus-Format
/logs?tail=50  → letzte Logzeilen (Token werden maskiert)
/audit         → API-Audit-Log (Admin)
/queue         → Bungie-Queue und API-Kennzahlen
/auth/status   → OAuth-Status und Ablauf
/changelog     → API-Versionen und Deprecation-Politik
```

### Webhook

Ein allgemeiner Webhook kann Benachrichtigungen als JSON senden:

```text
POST <webhook-url>
X-D2-Event: notification
X-D2-Signature: HMAC-SHA256(secret, body)
```

Events: `notification`, `reset`, `xur`, `godroll`, `vendor`. Retry mit
Backoff, optionales HMAC-Secret. Test über `/action/webhook/test` oder
die Einstellungen.

## Aktionen

| Pfad | Parameter | Wirkung |
|---|---|---|
| `/action/view` | `view=overview\|builds\|week\|collection\|vendor` | Werkzeugseite öffnen |
| `/action/view/next` / `/action/view/prev` | – | Werkzeugseite weiter/zurück |
| `/action/loadout` | `id=` oder `name=`, `dryRun=1` | Loadout anwenden |
| `/action/loadout/missing` | `id=` oder `name=` | Nur fehlende Teile anlegen |
| `/action/loadout/next` / `/action/loadout/prev` | – | Loadout weiter/zurück |
| `/action/overlay` | – | Overlay ein-/ausblenden |
| `/action/overlay/show` | – | Overlay anzeigen |
| `/action/overlay/hide` | – | Overlay ausblenden |
| `/action/overlay/enter` | – | Overlay-Modus betreten |
| `/action/overlay/leave` | – | Overlay-Modus verlassen |
| `/action/click-through` | – | Maus-Durchlassen umschalten |
| `/action/inventory` | – | Inventar öffnen |
| `/action/postmaster` | – | Postfach im Inventar öffnen |
| `/action/dashboard` | – | Dashboard öffnen |
| `/action/settings` | `tab=` | Einstellungen öffnen |
| `/action/notes` | – | Notizen öffnen |
| `/action/focus` | – | Overlay fokussieren |
| `/action/toast` | `message=` | Meldung im Tool anzeigen |
| `/action/vendor` | `hash=`, `item=` | Händler/Angebot öffnen |
| `/action/collection` | `tab=` | Sammlung öffnen |
| `/action/week` | `filter=` | Wochenplan filtern |
| `/action/vendors` | `wishlist=1` | Händler-Wunschrolls |
| `/action/picker` | `class=0\|1\|2` | Rüstungs-Picker öffnen |
| `/action/postmaster/counter` | `on=1\|0` | Postfach-Zähler |
| `/action/xur/open` | – | Xûr-Fenster öffnen |
| `/action/xur/remind` | `on=1\|0` | Xûr-Erinnerung |
| `/action/batch` | `do=…`, `dryRun=1` oder JSON-Body (`POST`) | Mehrere Aktionen |
| `/action/webhook/test` | – | Webhook-Test senden |
| `/action/workflow` | JSON-Body (`POST`) | Workflow mit Bedingungen |
| `/action/tokens/create` | `name=`, `scope=read\|write`, `days=` | Token erzeugen |
| `/action/tokens/revoke` | `id=` | Token widerrufen |
| `/action/checklist` | `filter=` | Wochen-Checkliste öffnen |
| `/action/checklist/toggle` | `id=` oder `text=` | Punkt abhaken/öffnen |
| `/action/checklist/add` | `text=` | Punkt hinzufügen |
| `/action/checklist/reset` | – | Checkliste zurücksetzen |
| `PATCH /checklist/{id}` | JSON | Punkt bearbeiten |
| `DELETE /checklist/{id}` | – | Punkt löschen |
| `POST /checklist/reorder` | `ids` (JSON) | Reihenfolge setzen |
| `POST /jobs/{id}/cancel` | – | Job abbrechen |
| `/action/xur` | – | Xûr-Fenster öffnen |
| `/action/refresh-inventory` | – | Inventar neu laden |
| `/action/refresh-wishlist` | – | Wunschliste neu laden |
| `/action/refresh` | – | Wunschlisten-Caches leeren |
| `/action/digest` | `dryRun=1`, `async=1` | Weekly-Digest senden |
| `/action/collect-postmaster` | `dryRun=1`, `async=1` | Postfach sammeln |
| `/action/game/launch` | – | Destiny 2 starten |

## Lesende Endpunkte

| Pfad | Inhalt |
|---|---|
| `/health` | Lebenszeichen, `ready`/`degraded` (ohne Token) |
| `/manifest` | Fähigkeiten, Aktionen und Kurz-URLs |
| `/state` | Gesamtstatus (`delta`, `ETag`) |
| `/state.txt` | Gesamtstatus als Text (`lang`) |
| `/focus` | Fokus-Status |
| `/key/{name}` | Einzelwert (Text/JSON, `lang`, `warnAt`) |
| `/badge/{name}.svg` | SVG-Badge (`theme`, `size`, `style`, `label`) |
| `/events` | Server-Sent-Events (`types`) |
| `/openapi.json` | OpenAPI-Dokument |
| `/openapi.yaml` | OpenAPI als YAML |
| `/commands.txt` | Befehlsliste als Text |
| `/changelog` | API-Changelog |
| `/version` | App-Version und API-Status |
| `/status` | Spieler und Charaktere |
| `/characters` | Charaktere mit Lichtlevel |
| `/inventory` | Inventar-Kennzahlen |
| `/items` | Inventar-Items (`filter`, `q`, `limit`, `offset`) |
| `/item/{id}` | Item nach Instanz-ID oder Hash |
| `/search` | Items, Loadouts und Checkliste durchsuchen |
| `/notes` | Notizen und Notizblätter (`PATCH` zum Schreiben) |
| `/reminders` | Persönliche Erinnerungen (`POST`, `PATCH`, `DELETE`) |
| `/auth/status` | Bungie-OAuth-Status |
| `/queue` | Bungie-Queue und API-Kennzahlen |
| `/digest/preview` | Vorschau des Weekly-Digests |
| `/vendors` | Händler und Angebote (`wishlist`, `vendor`, `q`, `limit`, `offset`) |
| `/vendor/{hash}` | Angebote eines Händlers |
| `/loadouts` | Loadout-Liste |
| `/loadout?id=` | Loadout-Details |
| `/activities` | Aktuelle Aktivitäten |
| `/nightfall` | Nightfall und Modifikatoren |
| `/season` | Saison-Ziele |
| `/crafting` | Waffenbaupläne |
| `/xur` | Xûr-Status |
| `/summary` / `/dashboard` | Dashboard-Zusammenfassung |
| `/priorities` | Offene Aufgaben |
| `/weekly` | Reset und Xûr |
| `/checklist` | Checkliste mit offenen Punkten |
| `/materials` / `/currencies` | Materialien und Währungen |
| `/postmaster` | Postfach je Charakter |
| `/reset` | Daily-/Weekly-Reset |
| `/actions` | Letzte Aktionen |
| `/jobs` / `/jobs/{id}` | Hintergrund-Jobs |
| `/tokens` | Benannte Tokens (ohne Geheimnis) |
| `/metrics` | API-Kennzahlen |
| `/metrics.txt` | Prometheus-Format |
| `/audit` | API-Audit-Log (Admin) |
| `/logs` | Letzte Logzeilen |
| `/commands` | Maschinenlesbare Befehlsliste |

## Optionales Plugin

`streamdeck/com.freakitout.d2tool.sdPlugin` ist ein minimaler Client, der
die HTTP-API nutzt. Installation:

1. `com.freakitout.d2tool.streamDeckPlugin` aus `dist/` doppelklicken oder
   den Ordner nach `%AppData%\Elgato\StreamDeck\Plugins\` kopieren.
2. Falls der Ordner manuell kopiert wird: einmalig `npm install` im
   Plugin-Ordner ausführen (enthält nur `ws`).
3. In den Plugin-Einstellungen API-URL und Token eintragen. Die Verbindung
   lässt sich direkt testen; der Token wird nur als Header gesendet.

Das Plugin nutzt globale Einstellungen für URL/Token, Sprache und Theme,
abonniert `/events` (SSE) und fällt bei Problemen auf langsames Polling
zurück. Status-Keys zeigen Postfach, Tresor, Checkliste, Xûr, Fokus,
Controller, Nightfall, Saison und Crafting. Optional lässt sich ein
Badge-Bild laden und direkt testen. Der Drehregler `Status wählen`
wechselt den Status-Key; ein langer Druck kann einen zweiten API-Pfad
auslösen. Diagnosen landen in `%TEMP%\d2tool-streamdeck.log`.
`dist/streamdeck-profile.json` enthält eine Beispielbelegung als Blueprint.

Ohne Plugin funktioniert alles genauso über normale Website-/HTTP-Aktionen.

## Hinweise

- **Lesemodus:** schreibende Aktionen werden mit HTTP `403` blockiert.
- **Nur-Lese-Token:** In den Einstellungen separat erzeugbar; darf nur lesen.
- **Benannte Tokens:** eigener Name, Scope (`read`/`action`/`admin`) und optionales Ablaufdatum; nur der Hash liegt in der Konfiguration.
- **QR-Code:** wird lokal erzeugt und kodiert standardmäßig nur den Nur-Lese-Token; der Schreib-Token bleibt lokal.
- **Rate-Limit:** standardmäßig 120 Anfragen pro Minute und Token/IP (10–1000 konfigurierbar), inklusive `X-RateLimit-*`-Headern.
- **CORS/OPTIONS:** erlaubte Browser-Origins werden in den Einstellungen gepflegt; eingebettete Browser-Ressourcen dürfen keine Aktionen auslösen.
- **Idempotency-Key:** verhindert doppelte Aktionen bei Retries, inklusive Wiederholung der ursprünglichen Antwort für 10 Minuten.
- **Sicherheit:** Standardmäßig nur `127.0.0.1`. LAN nur bewusst aktivieren.
- **Browser:** Wird eine Aktion über „Website“ geöffnet, kann ein Browser-Tab
  mit JSON erscheinen. Für stille Aufrufe ein HTTP-Request-Werkzeug verwenden.
- **API-Konsole und Token-Verwaltung:** in den Einstellungen unter Schnittstellen.
- **Setup:** `docs/api-changelog.md` und `docs/stream-deck.md` beschreiben Versionen und Einrichtung.

## Neue Actions & Rezepte (1.1)

Das Plugin umfasst jetzt **30 Actions** (SDK 2) und ist versionsgleich mit der App.

### Verbindung

Die Action **Verbindung** prüft API, Token und App-Version. Sie zeigt
`OK · v1.5.5 · P1.5.5` oder `Fehler` und löst bei Fehlern einen Alarm aus.
Der Property Inspector hat zusätzlich **Testen** mit App-/Plugin-Version.

### Encoder

| Action | Drehen | Drücken |
| --- | --- | --- |
| **Loadout wählen** | Loadout auswählen | Loadout anwenden |
| **Händler wählen** | Händler auswählen | Händler öffnen |
| **Checkliste wählen** | offenen Punkt auswählen | Punkt abhaken |

Die Encoder laden ihre Liste beim Erscheinen über `/loadouts`, `/vendors`
bzw. `/checklist` und zeigen `Name + Index/Anzahl`.

### Routine-Rezepte

Die Action **Wochen-Routine** bietet im Property Inspector Rezepte:

- **Standard** – Postfach sicher sammeln, Inventar aktualisieren, Woche öffnen
- **Postfach** – sammeln + Inventar aktualisieren
- **Woche** – Inventar aktualisieren + Woche öffnen
- **Händler** – Händler mit Wunschroll-Filter + Wunschliste neu laden
- **Raid-Prep** – Inventar aktualisieren + Builds öffnen

### Profil-Modus

Unter **Profil automatisch nach Aktivität wechseln** lässt sich wählen:

- **Aktivität** – exakter Aktivitätsname (bisheriges Verhalten)
- **Kategorie** – `PvE`, `PvP` oder `Gambit` (Präfix bleibt davor)

### Toggle-Icons

**Overlay** und **Sicherheit/Read-only** zeigen ihren Zustand als farbiges
Icon (AN/AUS bzw. READ-ONLY/OFFEN), auch wenn kein Badge aktiv ist.
