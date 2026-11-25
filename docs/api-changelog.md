# API-Changelog

Die lokale API folgt einer eigenen Versionsnummer. Die App-Version bleibt
davon unabhängig. Aktuell: **1.5.0**.

## 1.5.0 – 24.11.2026

- **Authentifizierung:** Header/Bearer bleibt Standard; Query-Token ist
  veraltet und abschaltbar. Signierte URLs (`exp`/`sig`) und HMAC-Anfragen
  (`X-D2-Timestamp`/`X-D2-Signature`) ergänzen den Token.
- **LAN:** optionale IP-Allowlist und HMAC-Pflicht für Nicht-Loopback-Adressen.
- **Schutz:** Lockout nach wiederholten ungültigen Tokens, Rate-Limit pro
  Token, Backup-Bereinigung für alte Klartext-Tokens.
- **API:** Batch per JSON-POST, Workflow-Bedingungen (`contains`, `not`,
  `gte`, `lte`, `exists`), Item-/Checklisten-/Erinnerungs-REST, Notizen
  schreibbar, persistente Jobs/Idempotenz.
- **Diagnose:** Deep Health mit Cache-/Config-/Bungie-Checks,
  Prometheus `/metrics.txt`, Admin-Audit `/audit`.
- **Webhook:** allgemeiner Webhook mit HMAC, Event-Filter und Retry.
- **Stream Deck:** Long-Press, Sprache/Theme, Badge-Test, Diagnose-Log,
  Beispielbelegung als Blueprint.
- **Build:** SHA256SUMS, Portable-Smoke-Test, getrennte LE-appId.

## 1.4.0 – 24.11.2026

- **Scopes:** `read`, `action`, `admin` für benannte Tokens.
- **Sicherheit:** Named Tokens werden nur als SHA-256-Hash gespeichert;
  Haupt- und Nur-Lese-Token sind mit Windows `safeStorage` verschlüsselt.
- **Admin-Endpunkte:** `/logs`, `/metrics`, `/tokens`, `/actions` benötigen
  einen Admin-Token. `/jobs` benötigt `action` oder `admin`.
- **SSE:** Eventtypen, Heartbeat, `Last-Event-ID`, gemeinsamer State-Tick.
- **Jobs:** Fortschritt, Meldung und Abbruch über `POST /jobs/{id}/cancel`.
- **Batch:** `stopOnError=1`, `timeoutMs=1000..30000`, Teilfehler liefern `207`.
- **OpenAPI:** Schemas, Fehlerantworten, `/openapi.yaml`, generierter Client
  unter `docs/local-api-client.js`.
- **Neue Leseendpunkte:** `/items`, `/search`, `/notes`, `/reminders`,
  `/auth/status`, `/queue`, `/digest/preview`, `/changelog`.
- **Checkliste:** `PATCH /checklist/{id}`, `DELETE /checklist/{id}` und
  `POST /checklist/reorder`.
- **Händler:** `wishlist=1`, `vendor=`, `q=`, `limit`, `offset`, `stale`,
  Wishlist-Markierung pro Angebot und gzip für große Antworten.
- **Performance:** Inventar-Snapshot-Cache, gemeinsamer SSE-Tick,
  State-Wiederverwendung für `/state.txt`, `/key` und `/badge`.
- **HTTP-Status:** Unbekannte Pfade liefern `404`, fehlende Parameter `400`,
  nicht geladene Daten `503` statt pauschal `200`.

## 1.3.0 – 23.11.2026

- ETag/304, Delta-Abfrage, Server-Sent-Events, Jobs, `dryRun`, Workflow.
- Bearer-Auth, `/v1`, Metriken, Logs, Health `ready`/`degraded`.
- Benannte Tokens, Badge-Parameter, Manifest und optionale Datenendpunkte.

## 1.2.0 – 22.11.2026

- Kurz-URLs, `/key`, `/badge`, `/events`, `/openapi.json`, `/commands.txt`.
- Aktionen für Händler, Sammlung, Woche, Picker, Checkliste und Batch.

## Deprecation-Politik

- Alte Pfade bleiben mindestens eine Minor-Version erhalten.
- Veraltete Pfade erhalten `Deprecation`- und `Sunset`-Header.
- Breaking Changes erhöhen die API-Minor-Version und werden hier dokumentiert.
- `/v1/...` bleibt der stabile Präfix; neue Versionen laufen parallel.
