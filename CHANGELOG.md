# Changelog

[English version](CHANGELOG.en.md)

Alle wichtigen Änderungen an diesem Projekt. Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung an
[Semantic Versioning](https://semver.org/lang/de/).

## [1.18.2] – 2026-11-28

### Behoben

- **A löste keinen Klick aus, solange das Controller-Testfenster offen war** –
  das Testmodal blockiert absichtlich alle Eingaben, war aber nicht als
  Ursache erkennbar. Jetzt schließen **A und B das Testfenster**, und beim
  Schließen der Einstellungen wird es automatisch ausgeblendet.
  `isInputBlocked` prüft dafür echte Sichtbarkeit und das Elternmodal.
- **Combo-Aufnahme konnte Tasten dauerhaft schlucken** – neuer
  Sicherheits-Timeout (6 s) und vollständiges Aufräumen beim Schließen der
  Einstellungen; `capturing` bleibt nie hängen.
- **Klick-Zielauflösung** – A nimmt jetzt zuerst das Element unter dem Cursor,
  dann das fokussierte Element (D-Pad) und zuletzt das nächste Snap-Ziel.
  „Klick ohne Ziel“ wird im Log vermerkt; die letzte Aktion zeigt das Ziel an.
- **Smoke-Test** – der Combo-Test läuft über die XInput-Injektion statt über
  einen Browser-Gamepad-Fake und ist damit auch mit angeschlossenem Controller
  stabil.

### Technik

- Controller-Navigation auf **48**, App-Features auf **123** Prüfungen
  erweitert; E2E **564**, Vollverify **55** Schritte in STD und LE.

## [1.18.1] – 2026-11-27

### Behoben

- **Overlay öffnete sich beim Bewegen des Analogsticks** – der Guide-Knopf
  kam doppelt: `XInputGetStateEx` liefert ihn bereits, zusätzlich wurde der
  Raw-Input-Guide ausgewertet. Dessen generische HID-Heuristik deutete bei
  Xbox-Controllern ein Stick-Bit als Guide. Raw-Input ist jetzt nur noch
  Fallback, wenn `XInputGetStateEx` fehlt; die unsichere Heuristik ist
  entfernt.
- **Guide-Toggle abgesichert** – Umschalten erst ab 90 ms Haltezeit; der
  automatische View-Fallback greift nur, wenn View nicht selbst belegt ist
  oder in der Kombination vorkommt; bei Raw-Fallback wird ein Druck mit
  ausgelenktem Stick ignoriert.
- **Trigger-Aktionen** – LT/RT-Aktionen lösen nur noch bei steigender Flanke
  aus, nicht jeden Frame (kein Dauerfeuer mehr). Scrollen bleibt kontinuierlich.
- **Belegung** – tote Web-Aktionen (`sitePrev`, `siteNext`, `pip`,
  `unloadOthers`) entfernt; D-Pad-Tasten heißen jetzt eindeutig D↑, D↓, D←, D→.
- **Scrollen** – Loadout-Sheet, Champion-Prüfung, Queue, Offline-Ausgang,
  HUD-Editor, Notizen und Dashboard werden jetzt mit Stick/Trigger erreicht.

### Technik

- Neuer Gamepad-Helfer-Selbsttest (Prebuilt, `--selftest`) in CI und Release;
  Controller-Navigation auf **31**, App-Features auf **116** Prüfungen.

## [1.18.0] – 2026-11-27

### Hinzugefügt

- **Artefakt-Auswahl im Loadout-Editor** – das Artefakt-Feld öffnet jetzt
  eine Auswahl aller verfügbaren Artefakte (Backpack, ausgerüstet, Tresor,
  andere Charaktere), dedupliziert nach Artefakt und mit
  „ausgerüstet“-Markierung. Die Auswahl setzt die Referenz des Loadouts und
  übernimmt die aktuell gesteckten Perks samt Reihe.
- **Perk-Auswahl nach Reihe** – die Perk-Liste zeigt nur noch die Perks des
  gewählten Artefakts, gruppiert nach Reihe/Socket. Pro Reihe ist ein Perk
  aktiv; eine neue Auswahl ersetzt den bisherigen Perk.
- **Artefakt bearbeiten** – öffnet das Socket-Grid des gewählten Artefakts
  und wendet Perks direkt über die API an.

### Geändert

- „Vom Artefakt übernehmen“ setzt jetzt Referenz **und** die aktuell
  gesteckten Perks statt nur die Referenz.

### Behoben

- Die Perk-Liste mischte zuvor die Perks **aller** Artefakte aus Inventar und
  Tresor; dadurch erschienen überall dieselben Perks.

### Technik

- E2E auf **564** Schritte, App-Features auf **110** Prüfungen erweitert.

## [1.17.3] – 2026-11-27

### Behoben

- **Champion-Erkennung vollständig** – Bungie liefert den Anti-Champion-Effekt
  im Namen des Sandbox-Perks am Rahmen-Plug, nicht als `breakerType`:
  `[Störung] Überladung`, `[Schildbrechend] Barriere`,
  `[Taumeln] Unaufhaltsam` (englisch `[Disruption] Overload`,
  `[Shield-Piercing] Barrier`, `[Stagger] Unstoppable`). Diese Tags werden
  jetzt ausgelesen.
- **Waffen-Erkennung korrigiert** – aktuelle Manifeste führen bei Waffen keine
  Kategorie 41 mehr; erkannt wird jetzt über die Socket-Kategorien
  `WeaponPerks`/`WeaponMods`. Damit werden auch Waffen mit nur einer
  Typ-Kategorie (z. B. SMG `3954685534`) erfasst.
- **Manifest-Cache v7** – einmaliger Neuaufbau, damit die neuen Werte sicher
  ankommen.

### Technik

- Manifest-Rahmen-Test auf **53** Prüfungen erweitert.
- Gegenprüfung mit dem echten deutschen 9.7.0.6-Manifest: **3.347 von 3.347**
  echten Waffendefinitionen mit Intrinsic-Rahmen erhalten einen Champion
  (3.687 Waffendefinitionen gesamt, inklusive Crafting-Blueprints ohne Rahmen).

## [1.17.2] – 2026-11-27

### Behoben

- **Champion-Erkennung über Rahmen-Perks** – Bungie legt den
  Anti-Champion-Effekt oft als Perk am Intrinsic-Rahmen ab (z. B.
  „[Disruption] Overload“), nicht als `breakerType` am Plug. Die App liest
  jetzt zusätzlich die Perks des Rahmen-Plugs (und der Waffe); Item-Breaker
  und Item-Perks haben Vorrang vor dem Rahmen.
- **Manifest-Cache v6** – der Item-Cache wird erneut gebumpt, damit auch
  Nutzer mit bereits aufgebautem v5-Cache die neuen Perk-Breaker-Werte
  erhalten (einmaliger Neuaufbau).

### Technik

- Manifest-Rahmen-Test auf **35** Prüfungen erweitert (Plug-Perk-Breaker,
  Item-Perk-Vorrang, Cache-v6-Prüfung).

## [1.17.1] – 2026-11-27

### Behoben

- **Champion-Anzeige für alle Waffen** – der Intrinsic-Rahmen wird jetzt beim
  Manifest-Aufbau gelesen und der Anti-Champion-Typ direkt vom Rahmen-Plug
  übernommen. Damit zeigen auch Waffen im Tresor oder ältere Instanzen ohne
  Live-Socket-Daten ihren Champion.
- **Deutsche Rahmen-Namen** – „Leichtes Gehäuse“ (Lightweight) und
  „Hohe Durchschlagskraft“ / „Hohe-Durchschlagskraft-Gehäuse“ (High-Impact)
  werden jetzt korrekt zugeordnet.
- **Rahmen im Item-Popup** – die Kopfzeile zeigt den Rahmen, z. B.
  „Maschinenpistole · Leichtes Gehäuse · 508 Power · Legendär“, ebenso im
  Hover-Tooltip und Kachel-Titel.
- **Manifest-Cache** – der Item-Cache wurde auf v5 gehoben und enthält den
  Rahmen je Waffe; er wird beim ersten Inventar-Abruf nach dem Update
  einmalig neu aufgebaut.

### Technik

- Neuer Manifest-Rahmen-Test mit **26** Prüfungen; Champion-Rahmen-Test auf
  **101** Prüfungen, E2E auf **550** Schritte erweitert. CI und Release prüfen
  den Manifest-Rahmen mit.

## [1.17.0] – 2026-11-27

### Hinzugefügt

- **Artefakt-Perks in Loadouts** – Loadouts merken sich den echten
  Artefakt-Socket jedes Perks und setzen beim Anwenden alle Perks über die
  Bungie-API (`InsertSocketPlugFree`). Das Ergebnis nennt angewendete und
  übersprungene Perks (nicht freigeschaltet/Tier).
- **Saison-Artefakt-Prüfung** – verweist ein Loadout auf ein anderes Artefakt
  als das ausgerüstete, werden die Perks klar übersprungen; der Rest des
  Loadouts läuft normal weiter. Das Artefakt selbst bleibt eine
  In-Game-Entscheidung.
- **Offline-Warteschlange** – merkt sich Artefakt-Referenz und Socket-Indizes
  und wendet sie beim späteren Nachholen mit an.

### Geändert

- Editor-Hinweis und Anlege-Vorschau sprechen nicht mehr von „nur
  dokumentiert“: Artefakt-Perks gelten jetzt ausdrücklich als API-Anwendung.

### Behoben

- Der Undo-Knopf im Ergebnisdialog hängt nicht mehr am falschen Element; echte
  Loadout-Anwendungen werfen keinen `insertBefore`-Fehler mehr.

### Technik

- E2E auf **546** Schritte, App-Features auf **108** Prüfungen erweitert;
  Dialog-Baselines aktualisiert.

## [1.16.1] – 2026-11-27

### Behoben

- **Fensterknöpfe** – Immer-im-Vordergrund (Pin), Minimieren, Maximieren/
  Wiederherstellen und Schließen funktionieren wieder; ein Doppelklick auf
  die Titelleiste maximiert das Fenster. Die Handler waren beim Web-Cleanup
  in 1.12.0 verloren gegangen.
- **Reset- und Xûr-Chips** – beide Chips werden wieder mit Symbol und Wert
  gefüllt und öffnen per Klick das Dashboard bzw. die Xûr-Ansicht
  (`initClock` fehlte seit 1.12.0).
- **Champion-Erkennung** – die Anti-Champion-2.0-Tabelle (Update 9.7.0) ist
  vollständig und zentral: Support zählt zu Überladung; Precision/Adaptive,
  Lightweight/Rapid-Fire, Aggressive/High-Impact sowie alle Spezialrahmen
  (Area Denial, Wave, Caster, Vortex, Legacy PR-55, Disruption, Heavy Burst,
  Micro-Missile, Double Fire, Rocket-Assisted, Compressed Wave, Spread Shot,
  Dynamic/Balanced Heat, Adaptive Burst) werden korrekt zugeordnet.
  Explizite Bungie-Breaker und manuelle Korrekturen behalten Vorrang.

### Technik

- Neuer Champion-Rahmen-Test mit **97** Prüfungen (DE/EN, Prioritäten,
  Wortgrenzen); App-Features auf **107** Prüfungen erweitert. CI und Release
  führen den Champion-Test aus.

## [1.16.0] – 2026-11-27

### Hinzugefügt

- **Champion-Vorschläge** – die Champion-Prüfung gruppiert Waffen nach
  Waffentyp und Rahmen, zeigt einen Vorschlag samt Konfidenz (hoch, mittel,
  niedrig) und setzt per „Alle übernehmen“ den Brecher für die ganze Gruppe.
  Einzelzuweisung und Rückgängig bleiben erhalten.
- **HUD frei platzieren** – Chips lassen sich den Zonen links, Mitte oder
  rechts zuordnen; der Abstand pro Chip ist von 0 bis 32 px einstellbar und
  wirkt sofort im Overlay. HUD-Profile speichern Zonen und Abstände mit.
- **Konfiguration übertragen** – Export und Import der Einstellungen ohne
  Tokens, Secrets, API-Keys, OAuth-/Session-Werte, Webhooks, PIN-Material oder
  maschinenspezifische Pfade. Vor dem Anwenden erscheint eine Vorschau; vor
  dem Import wird automatisch eine Sicherung angelegt.

### Geändert

- Der Fokus-Chip im Overlay aktualisiert sich sofort beim Overlay-Wechsel
  statt erst beim nächsten Intervall.

### Technik

- E2E auf **539** Schritte erweitert; neuer Konfigurations-Transfer-Test mit
  **95** Prüfungen. Neue Config-Schlüssel `overlay.chipZones` und
  `overlay.chipGaps`; visuelle Referenzen aktualisiert.

## [1.15.0] – 2026-11-27

### Entfernt

- **Tote Web-Pfade in den Einstellungen** – die verbliebenen Web-/Seiten-Funktionen
  (Keep-Alive, Zoom, Dunkelmodus, Lesemodus, Blocker, Auto-Refresh,
  Fehlerradar, Kategorie-Reihenfolge, eigene Seiten) sind aus `settings.js`
  entfernt; die Datei schrumpft um rund 600 Zeilen.
- **Controller-Webview-Helfer** – Maus-/Drag-Helfer und `api.webviewInput`
  sind gelöscht. Maus, Klick, Scrollen, Snap, Buttons und Achsen bleiben
  unverändert.
- **Web-Belegungen** – `sitePrev`, `siteNext`, `pip` und `unloadOthers` sind
  aus den Controller-Belegungen entfernt.

### Hinzugefügt

- **CSV-Export** – Händlerangebote und Godroll-/Wunschlisten-Treffer lassen
  sich als CSV speichern (Semikolon, UTF-8-BOM, Datum im Dateinamen).

### Geändert

- Die Controller-Aktion `reload` heißt jetzt „Inventar aktualisieren“.

## [1.14.0] – 2026-11-27

### Hinzugefügt

- **Live-Badges für Offline-Ausgang und Loadout-Queue** – die lokale API
  liefert `/key/outbox` und `/key/loadoutqueue` sowie passende SVG-Badges;
  `/state` und `/state.txt` enthalten beide Werte. Der Renderer wird gebündelt
  mit kurzem Cache abgefragt; ohne Fenster bleibt der letzte bekannte Wert
  stehen (`—`, solange unbekannt). Stream-Deck-Plugin und Doku kennen die
  neuen Keys.
- **Installer-Upgrade-Test** – ein neuer Test kompiliert den echten
  NSIS-Übernahme-Code in einen isolierten Mini-Installer und prüft Übernahme,
  `config.json.bak`, Backups und „vorhandene neuere Config nicht überschreiben“.
  Im Release läuft zusätzlich ein echtes Setup-Upgrade in einem temporären
  Ordner; eine alte Setup-Version kann über `D2_OLD_SETUP_EXE` eingebunden
  werden.

### Geändert

- **CI und Release** führen den Upgrade-Test aus; `verify` bekam einen
  direkten Node-Schritt ohne `package.json`-Änderung.

### Technik

- Stream-Deck-API auf **110** Befehle erweitert, Installer-Upgrade-Test mit
  **20** Prüfungen.

## [1.13.0] – 2026-11-27

### Hinzugefügt

- **Konfliktlösung in der Loadout-Warteschlange** – fehlgeschlagene Einträge
  zeigen „Konflikte: Reparieren“. Die Lösung holt fehlende Teile aus Tresor
  oder Beutel, legt ein blockierendes Exot aus demselben Slot in den Tresor
  (mit sicherem Ersatz) und setzt den Eintrag anschließend wieder auf wartend.
  Nicht lösbare Fälle (mehrere Exoten, falsche Klasse) melden den Grund.
- **Globale Suche 2.0** – die Befehlspalette durchsucht zusätzlich Notizen,
  Checklisten-Punkte, Einstellungs-Tabs und alle Werkzeugseiten. Treffer
  zeigen einen Kontext-Hinweis; die Tastaturbedienung bleibt unverändert.
- **Dashboard-Layouts** – Karten lassen sich anpinnen und stehen dann vorn.
  Benannte Layouts speichern ausgeblendete Karten, Reihenfolge, Kartengrößen
  und Pins; sie lassen sich jederzeit anwenden oder löschen.

### Technik

- E2E auf **527** Schritte erweitert (Konflikt-Hinweis, Pinning, Layouts).

## [1.12.0] – 2026-11-26

### Entfernt

- **Letzter Web-Rest** – der `web`-No-op-Stub, die Kategorie-/Site-Daten und
  die dazugehörigen Funktionen (URL-Leiste, Suchen, Stummschalten, Verlauf,
  Tab-Kontextmenü, PiP, Auto-Refresh) sind aus `app.js` entfernt.
  `app.js` schrumpft dadurch von ~143 KB auf ~98 KB.
- **Controller** erhält keine `getActiveWebview`-Option mehr; die
  Webview-Pfade sind endgültig inaktiv.
- **Einstellungen** bekommen keine Kategorie-/Web-Quelle mehr; die
  verbliebenen Web-Funktionen sind reine tote Pfade ohne Daten.

### Geändert

- **Smoke-Diagnose** erwartet keine Kategorien/Tabs mehr.
- **Dashboard** öffnet News-Links direkt im Standardbrowser.
- App-Feature-Test auf **105** Prüfungen erweitert.

## [1.11.0] – 2026-11-26

### Hinzugefügt

- **Bungie-Icon-Cache** – Item-, Perk- und Händlerbilder werden einmal
  heruntergeladen und unter `%APPDATA%\...\cache\icons` zwischengespeichert.
  Ein eigener `d2icon:`-Handler liefert sie lokal aus; der Cache wird bei
  mehr als 6.000 Dateien automatisch ausgedünnt.
- **Icon-Platzhalter** – während des Ladens zeigen Bildflächen einen dezenten
  Verlauf statt eines leeren Lochs.
- **Render-Budget** – der erste Inventar-Render misst sich selbst
  (`__D2_FIRST_RENDER_MS__`, Budget 3.000 ms); der E2E-Test schlägt an, wenn
  das Budget überschritten wird.
- **Icon-Cache-Test** – prüft Schema, Redirect, CSP, Platzhalter und
  Cache-Obergrenze.

### Technik

- E2E auf **518** Schritte, App-Features auf **103** Prüfungen erweitert.

## [1.10.0] – 2026-11-26

### Hinzugefügt

- **ODER-Suche** – `Testgewehr OR Granaten-Arme` findet beide Begriffe;
  Anführungszeichen und Operatoren funktionieren weiterhin.
- **Daten-Migration als Modul** – die Übernahme alter Installationsdaten ist
  isoliert getestet (Kopie, `.bak`, keine Überschreibung, leere Quelle).
- **Lokale API/Stream Deck** – neue Aktionen `/action/outbox/open`,
  `/action/outbox/send`, `/action/loadout/queue` und
  `/action/champion-audit`.
- **Full-Shell-Smoke** – der Smoke-Test prüft zusätzlich die Panels für
  Offline-Ausgang, Loadout-Queue und Champion-Prüfung.

### Geändert

- **Release-Workflow** prüft die gebauten Prüfsummen und startet den
  Portable-Smoke bereits seit 1.9.0; die Daten-Migration ist jetzt ein
  eigener CI-Schritt.
- E2E auf **517** Schritte, App-Features auf **101** Prüfungen erweitert.

## [1.9.0] – 2026-11-26

### Hinzugefügt

- **Config-Rettung** – vor jedem Speichern wird die letzte gültige
  `config.json` als `.bak` gesichert; bei defekter Datei wird zuerst daraus
  wiederhergestellt. Der Installer legt beim Übernehmen ebenfalls eine
  `.bak` an.
- **Persistente Loadout-Warteschlange** – wartende Einträge überleben einen
  Neustart und werden bewusst mit „Fortsetzen“ wieder aufgenommen.
- **Offline-Ausgang ausgebaut** – Konfliktvorschau pro Aktion, exponentielles
  Backoff mit nächstem Versuch, sowie Markieren/Entmarkieren und Mod-Sockets
  als zusätzliche Ausgangs-Aktionen.
- **Suche 2.0** – Treffer werden auch im Item-Popup und in Perk-Namen
  hervorgehoben; gespeicherte Suchen lassen sich umbenennen, einzeln oder
  gesammelt löschen.
- **Champion-Prüfung mit Undo** – Korrekturen können mit einem Klick
  rückgängig gemacht werden.
- **HUD-Editor** – Chips lassen sich direkt in der Overlay-Leiste per
  Drag & Drop sortieren; pro Chip ist „Immer / PvE / PvP“ einstellbar.
- **Dashboard** – Kartengröße pro Karte (Alt+Rechtsklick), „Heute“-Layout und
  PNG-Export des sichtbaren Dashboards.
- **Befehlspalette** – Befehle für Ausgang senden/öffnen,
  Loadout-Warteschlange und Champion-Prüfung.

### Geändert

- **Englische Übersetzung wird erst bei Bedarf geladen** – deutscher Start
  lädt die 356-KB-Datei nicht mehr mit.
- **Release-Workflow** prüft zusätzlich die gebauten Prüfsummen und startet
  einen Portable-Smoke-Test der echten Build-Artefakte.
- Fokus im HUD-Panel, `aria-modal` und Reduced-Motion-Regeln ergänzt.

### Technik

- E2E auf **516** Schritte, App-Features auf **98** Prüfungen erweitert.
- Konfigurations-Test prüft die Wiederherstellung aus `config.json.bak`.

## [1.8.1] – 2026-11-26

### Behoben

- **Setup-Updates erhalten Nutzerdaten und Bungie-Anmeldung** – die
  installierte Version legt ihre Daten jetzt immer in
  `%APPDATA%\FreakItOut's Destiny 2 Tool` ab und nie mehr im
  Installationsordner. Dadurch ersetzen Setup-Updates weder Konfiguration
  noch verschlüsselte Tokens.
- **Automatische Übernahme alter Installationsdaten** – vorhandene
  `Daten\config.json` und Backups aus älteren Installationen werden beim
  Setup bzw. beim ersten Start einmalig nach `%APPDATA%` kopiert; eine
  vorhandene neuere Konfiguration wird nie überschrieben.
- **Deinstallation behält die Daten** – `deleteAppDataOnUninstall` ist
  ausdrücklich deaktiviert; zum vollständigen Entfernen den Datenordner
  manuell löschen.
- **Portable Erkennung unverändert** – die portable EXE nutzt weiterhin den
  Ordner `Daten` neben der EXE.
- Version **1.8.1**.

## [1.8.0] – 2026-11-26

### Hinzugefügt

- **Offline-Ausgang mit Detailpanel** – wartende Transfers und
  Ausrüstungswechsel lassen sich einzeln wiederholen, entfernen und
  sortieren. Vor dem Senden wird geprüft, ob die Aktion noch nötig ist
  (Item bereits am Ziel, nicht mehr vorhanden).
- **Loadout-Warteschlange mit Panel** – anhalten/fortsetzen, Einträge
  sortieren, fehlgeschlagene wiederholen, einzelne entfernen und erledigte
  aufräumen.
- **HUD-Editor ausgebaut** – Chips per Drag & Drop oder ↑/↓ sortieren,
  Größe und Farbe pro Chip, Profile pro Monitor/DPI, Export/Import als JSON.
- **Champion-Prüfung** – Sammelansicht aller Waffen ohne erkannten Brecher
  mit Bulk-Zuweisung sowie Import/Export der manuellen Overrides.
- **Suche 2.0** – Treffer werden im Tooltip hervorgehoben; das Filtermenü
  erklärt alle Operatoren und Beispiele.
- **Release-Workflow** – Tags vom Typ `v*` bauen Portable, Setup, Plugin,
  SBOM und Prüfsummen automatisch und hängen sie an das GitHub-Release.

### Geändert

- **Einstellungen werden erst beim Öffnen geladen** (dynamischer Import);
  die Tastenbelegung liegt in einer kleinen eigenen Datei.
- **HUD-Code ausgelagert** nach `renderer/js/overlay-hud.js`.
- **Smoke-Test** prüft jetzt die komplette Navigation
  Dashboard → Inventar → Werkzeuge und den HUD-Editor.
- **Visuelle Baselines** um Dashboard und Einstellungen erweitert.

### Entfernt

- Die versteckten Einstellungsseiten **„Webseiten“** und **„Eigene Seiten“**
  samt zugehöriger UI-Verdrahtung. Die App zeigt nur noch eigene Ansichten.

### Technik

- App-Feature-Test auf **91** Prüfungen, E2E auf **512** Schritte erweitert.

## [1.7.0] – 2026-11-26

### Hinzugefügt

- **Offline-Ausgang** – fehlgeschlagene Transfers und Ausrüstungswechsel
  werden lokal gepuffert und nach der nächsten Verbindung, beim Aktualisieren
  oder per Knopf erneut gesendet. Eine sichtbare Leiste zeigt Anzahl und
  letzte Fehlermeldung; „Jetzt senden“ und „Verwerfen“ sind direkt erreichbar.
- **HUD-Editor im Overlay** – Chips mit ↑/↓ anordnen, einzeln ausblenden,
  Größe Klein/Normal/Groß/XL wählen, Profile (Alle/PvP/Raid) speichern,
  anwenden und optional automatisch nach erkannter Aktivität umschalten.
  „Zurücksetzen“ stellt das Standardlayout wieder her.
- **Dashboard-Karten** – Größe S/M/L, Live-Filter über alle Karten mit
  Trefferzahl sowie **PNG-Export** der Aktivitäts-Analyse.
- Version **1.7.0**.

### Geändert

- Die Overlay-Chip-Reihenfolge umfasst jetzt alle Chips: Reset, Weekly,
  Stoppuhr, Session, Status, Champion, Akku, Tresor, Mini-Dashboard und Fokus.
- Die Chip-Reihenfolge in den Einstellungen listet dieselben Elemente.

### Entfernt

- Die unsichtbare Alt-Webseiten-Leiste (`#legacyBrowser`) samt ihrer
  Event-Verdrahtung, Web-Fehlerknöpfe und Tray-Seitenöffnung. Die App startet
  ohne Web-Container; der Smoke-Test erwartet keine Tabs mehr.
- Tote Web-Fokus-/Seitenpfade im Startablauf.

### Technik

- Portable- und Setup-Build mit **maximaler Kompression** und aktivem ASAR.
- App-Feature-Test auf **83** Prüfungen, E2E auf **495** Schritte erweitert.

## [1.6.0] – 2026-11-26

### Hinzugefügt

- **Champion-Prüfung** – neue Suche `is:nochamp` und Schnellfilter „Ohne
  Champion“ zeigen Waffen ohne erkannten Brecher. Tooltip/Popup nennen jetzt
  die Quelle (Item-Daten, Rahmen, manuell, keine).
- **Sticky-Charakterköpfe** – Hüter- und Tresorköpfe bleiben beim Scrollen
  sichtbar.
- **Nach-oben-Knopf** im Inventar ab 400 px Scrolltiefe.
- **Loadout-Warteschlangen-Leiste** – sichtbarer Status mit aktuellem Loadout,
  Fortschritt und übersprungenen Einträgen.
- **CSV-Export** für den 90-Tage-Aktivitätsverlauf im Analyse-Bereich.
- Version **1.6.0**.

## [1.5.6] – 2026-11-26

### Geändert

- **Kompakter Inventar-Kopf** – Titel, Untertitel und Kopfbuttons sind flacher
  (kleinere Schrift, entfernte Standard-Absätze, 26-px-Buttons). Das schafft
  eine zusätzliche Inhaltszeile, ohne die TV-Lesbarkeit zu verlieren.
- Version **1.5.6**.

## [1.5.5] – 2026-11-26

### Entfernt

- **Leere Infoboxen im Inventar** – die nie befüllte `inventoryDetail`-Leiste
  ist entfernt; leere Ergebnis-, Status- und Loadout-Leisten werden
  ausgeblendet, statt als leere Rahmen Platz zu kosten.
- Version **1.5.5**.

## [1.5.4] – 2026-11-26

### Behoben

- **Champion-Anzeige auf allen Waffen** – Waffen ohne erkannten intrinsischen
  Brecher zeigen jetzt ein neutrales „–“ mit Tooltip „Kein Champion-Brecher“
  statt gar keiner Anzeige.
- **Suche filtert standardmäßig** – der neue Schalter „Nur Treffer“ blendet
  nicht passende Kacheln und leere Zeilen aus; Tresorlisten klappen bei einer
  Suche automatisch auf. Über den Schalter lässt sich wieder auf reines
  Dimmen umstellen.
- **E2E** prüft die Treffer-Filterung und weiterhin echte Champion-Badges
  (nicht das neutrale „–“).
- Version **1.5.4**.

## [1.5.3] – 2026-11-26

### Behoben

- **Controller erreichte nicht alle Inventar-Elemente** – die Fokusnavigation
  war auf `#inventoryView` begrenzt; Titelleiste, App-Leiste und Overlay-Leiste
  lagen außerhalb. Jetzt navigiert das D-Pad über die gesamte sichtbare
  Oberfläche, während versteckte Panels weiterhin gefiltert werden.
- **E2E** prüft zusätzlich, dass Off-Screen-Kacheln im Controller-Modus
  fokussierbar bleiben.
- Version **1.5.3**.

## [1.5.2] – 2026-11-26

### Behoben

- **Overlay-Inventar war unbrauchbar** – im Overlay wird das Inventar jetzt
  opak, ohne doppelte Titel-/Status-/Legendenzeilen und mit kompakter
  Kopfzeile dargestellt. Die Overlay-Leiste schrumpft bei geöffnetem Inventar
  auf die nötigen Aktionen.
- **Mehr Items gleichzeitig** – Overlay-Kacheln sind 64 px groß und nutzen
  die volle Zellbreite (`auto-fill`), die Poststelle zeigt nur belegte Slots
  plus Puffer.
- **E2E** prüft Overlay-Spalten, Kachelgröße und ausgeblendete Leisten.
- Version **1.5.2**.

## [1.5.1] – 2026-11-26

### Behoben

- **TV-Inventar zeigt zu wenig** – Kachelreihen nutzen jetzt die volle
  Zellbreite (`auto-fill` statt drei fester Spalten), die Poststelle rendert
  nur noch belegte Slots plus kleinen Puffer statt 21 leerer Plätze, und
  Kopfzeile/Filter/Tabs sind im TV-Modus kompakter. Dadurch sind deutlich
  mehr Items gleichzeitig sichtbar.
- **E2E** prüft die TV-Spaltenzahl und die größeren TV-Kacheln.
- Version **1.5.1**.

## [1.5.0] – 2026-11-25

### Hinzugefügt

- **Dashboard-Fokusmodus** – standardmäßig nur Hüter, Prioritäten, Analyse und
  Wochen-Checkliste; „Alle anzeigen“ schaltet die restlichen Karten frei.
  Die Wahl wird gespeichert.
- **Einfach-/Erweitert-Modus in den Einstellungen** – Steam Input, Sicherheit
  und Diagnose erscheinen nur noch im Erweitert-Modus; die Overlay-Leiste
  bleibt alltagstauglich sichtbar.
- **Loadout-Warteschlange** – mehrere Loadouts nacheinander anwenden, inkl.
  Fortschritt und Überspringen blockierender Konflikte.
- **Konflikterkennung vor dem Anwenden** – mehrere Exoten, falsche Klasse und
  fehlende Items werden vor dem Anlegen gemeldet.
- **90-Tage-Aktivitätsverlauf** – tägliche Aggregate werden lokal gespeichert
  und als Verlauf im Analyse-Bereich angezeigt.
- **SBOM** – CycloneDX-Datei (`dist/sbom.cdx.json`) und Prüfsummen-Eintrag.
- **Werkzeuge-Knopf** in der App-Leiste.
- **Smoke-Test** prüft jetzt Fokusmodus und die schlanke Shell.

### Behoben

- **Kalendertage über Zeitumstellung** – Aktivitätsserien und Heatmap nutzen
  Kalendertage statt 24-Stunden-Schritte.

### Geändert

- **Kompaktere App-Leiste** ohne Beschriftung, geringere Höhe.
- **CSP** erlaubt Verbindungen nur noch zu Bungie statt zu allen HTTPS-Zielen.
- Version **1.5.0**; App-Features **77**, E2E **482**, Verify **48**.

## [1.4.0] – 2026-11-25

### Entfernt

- **Alle eingebetteten Webseiten** – Reiter, Favoriten, Kategorien,
  Seitenauswahl, Adressleiste, Find-in-Page, Webview-Fläche und die
  Seitennavigation im Overlay sind weg. Die App startet direkt im Dashboard.
- **Webseiten-Einstellungen** – „Webseiten“ und „Eigene Seiten“ sind aus der
  Einstellungsnavigation entfernt; die zugehörigen Panels werden nicht mehr
  angezeigt.
- **Minimodus, Split-View, PiP und Seiten-Zoom** inklusive der zugehörigen
  Kürzel und Palette-Befehle.
- **Webview-Unterstützung im Hauptprozess** (`webviewTag` deaktiviert,
  Frame-Quellen auf `none` begrenzt) und der `/action/mini`-Endpunkt.

### Geändert

- **Schlanke App-Leiste** mit nur noch Inventar, Checkliste, Overlay,
  Notizen, Tasten-Legende, Einstellungen und Hilfe.
- **Reset-/Xûr-Chips** öffnen Dashboard bzw. Händleransicht statt einer
  Webseite; DIM-Links öffnen im Standardbrowser.
- Version **1.4.0**; E2E **482**, App-Features **73**, Verify **48**.

## [1.3.0] – 2026-11-25

### Hinzugefügt

- **Dashboard-Analytik** – neue Karte „Aktivitäts-Analyse“ mit KPIs für
  7/30 Tage (Aktivitäten, Raids/Dungeons, Großmeister, PvP inkl. Prüfungen,
  K/D, Serie, Spielzeit), 14-Tage-Balkendiagramm, 12-Wochen-Heatmap,
  Kategorienverteilung und Top-Aktivitäten.
- **Längerer Aktivitätsverlauf** – die Bungie-Historie wird jetzt für alle
  Charaktere mit bis zu 100 Einträgen je Charakter geladen (dedupliziert,
  nach Datum sortiert) und um Modus-Typ, Aktivitätstyp und Modus-Kategorie
  ergänzt. „Letzte Aktivitäten“ zeigt weiterhin die jüngsten sechs.
- **Gemeinsamer Abruf** – Analyse und Aktivitätenliste teilen sich Cache und
  Request; „Neu laden“ aktualisiert beide Karten.
- **Tests** – neuer Analytik-Test (27 Prüfungen) und fünf E2E-Prüfungen für
  KPIs, Balken, Heatmap und Kategorien.

### Geändert

- Version **1.3.0**; E2E umfasst jetzt **482 Schritte**, App-Features **73**.

## [1.2.0] – 2026-11-25

### Hinzugefügt

- **Inventar-Virtualisierung** – Kacheln haben eine feste Höhe und werden
  nur im sichtbaren Bereich gezeichnet (`content-visibility`). Auch bei
  1.700+ Items bleibt der Aufbau schnell und die Scrollhöhe stabil.
- **Blockweises Nachladen** – vollständig aufgeklappte Tresorlisten rendern
  zuerst 120 Kacheln; „Weitere 120 laden“ und Scrollen laden den nächsten
  Block nach. Der DOM bleibt klein, die Scrollposition bleibt erhalten.
- E2E-Tests für Blockplan, 120er-Erstblock und Paint-Virtualisierung.

### Behoben

- **Scrollsprung beim Neu-Rendern** – `overflow-anchor: none` verhindert,
  dass nachwachsende Off-Screen-Zeilen die Position verschieben.
- **TV-Modus** – Kachel- und Rasterbreite (76 px) passen wieder zusammen,
  die feste Kachelhöhe ist auf 104 px ausgelegt.

### Geändert

- Version **1.2.0**; App-Feature-Test umfasst **72 Prüfungen**, E2E **477**.

## [1.1.0] – 2026-11-25

### Hinzugefügt

- **Stream Deck: Verbindungs-Action** – prüft API, Token und App-Version,
  zeigt den Status als Icon/Titel und öffnet bei Fehlern die Diagnose.
- **Stream Deck: Encoder für Loadouts, Händler und Checkliste** – drehen
  wählt, drücken wendet an/öffnet/hakt ab.
- **Stream Deck: Routine-Rezepte** – Standard, Postfach, Woche, Händler und
  Raid-Prep direkt in der Property Inspector wählen.
- **Stream Deck: Profil-Modus** – automatischer Profilwechsel nach exakter
  Aktivität oder Kategorie (PvE/PvP/Gambit).
- **Stream Deck: Toggle-Icons** – Overlay und Read-only zeigen ihren Zustand
  als farbiges Icon statt nur als Text.
- **Stream Deck: Verbindungstest** zeigt App- und Plugin-Version.
- **Händler-Seite** erklärt, warum Händler fehlen (Xûr Fr–Di, Eisenbanner/
  Prüfungen nur in ihrer Woche).

### Behoben

- **Umlaute/Mojibake** in Stream-Deck-Manifest, Property Inspector und
  Plugin-Labels („Händler“, „Aktivität“, „Xûr“, „Öffnet“, „Schließt“ …).
- **Mojibake in App-Texten** (u. a. „Größe“, „regelmäßig“, „öffentlich“)
  durch eine fehlerhafte Zeichenketten-Reparatur.
- **Versionsgleichheit** von App und Stream-Deck-Plugin wird geprüft.

### Geändert

- Version **1.1.0**; Stream Deck umfasst jetzt **30 Actions**.

## [1.0.0] – 2026-11-25

Erste öffentliche Version.

### Hinzugefügt

- **Werkzeugzentrale** mit Übersicht, Builds, Sammlung und Aufräumen, Woche
  sowie Händlern.
- **Inventar & Loadout-Editor** im DIM-Stil: Kacheln, Suche mit Operatoren,
  Filter-Chips, Mehrfachauswahl, Duplikate in den Tresor, Loadout-Import/-Export
  (JSON, DIM, d2armorpicker, guardian.report), Optimierer und Rückgängig.
- **Armor 3.0** mit Stat-Skala 0–200, Gear-Tier, Archetyp, Tertiär-/Tuning-Stat,
  Set-Boni, Masterwork-Planer und Rüstungs-Wunschliste.
- **Build-Werkzeuge**: Champion-Planer, Build-Lückenanalyse,
  Breakpoint-Solver, Build-Karte als PNG/Text, Stat-HUD.
- **Crafting- und Sammlungs-Werkzeuge**: offene Muster, Red-Border-Fortschritt,
  Materialplan, Triumph- und Sammlungsübersicht, Snapshot-Diff.
- **Händler & Xûr**: Angebote und Rolls, Kategorien, Unterhändler,
  Einkaufs-Optimierer, Preisverlauf, Beobachtungsliste und Deep-Links.
- **Dashboard** mit Hüterübersicht, Power/Infusion, Champion-Check, Triumphs,
  Sammlung/Vorrat, Bungie- und Datenstatus, Saisonzielen und letzten
  Aktivitäten.
- **Overlay** über dem Spiel inkl. Poststellen-Zähler, Overlay-Layouts,
  Stat-HUD, Post-Game-Karte und Auto-Recap.
- **Controller-Steuerung** über XInput (auch ohne Fensterfokus), virtueller
  Cursor, Schnellmenü, Bildschirmtastatur, Kalibrierung, Rauschfilter und
  frei belegbare Tasten.
- **Stream Deck & lokale API** mit Tokens, Kurz-URLs, Live-Keys, SVG-Badges,
  SSE, Jobs und optionalem Plugin.
- **Sicherheit**: verschlüsselte Zugangsdaten (Windows DPAPI), verschlüsselte
  Config-Backups (AES-256-GCM), Read-only-Modus, PIN-Sperre,
  Secret-Redaction in Diagnose-Exporten.
- **Barrierefreiheit**: Farbmodi, hoher Kontrast, Fokusringe, UI-Zoom und
  reduzierte Bewegung.

### Behoben

- **Scrollen**: Die Ansicht springt nicht mehr nach oben. Such- und
  Filterfelder, Hintergrund-Renders und verschachtelte Renders halten die
  Position zuverlässig.
- **Scroll-Glitchen**: Falsche Lazy-Paint-Höhen (`content-visibility`) und
  eine geblurrte Sticky-Leiste sorgten für springendes Layout; beides wurde
  entfernt.
- **Kleine Sprünge nach dem Scrollen**: Offene Aufklapp-Bereiche
  („Springe zu …“, Bereichsauswahl) bleiben nach einem Render offen.
- **Controller-Scrollen** funktioniert jetzt auch in der Werkzeugzentrale.
- **Händlerbilder**: Interne Unter-Regale ohne Icon/Namen werden ausgeblendet;
  fehlende Icons erhalten einen Platzhalter statt eines kaputten Bildes.
- **Letzte Aktivitäten im Dashboard**: Der Bungie-Endpunkt wird korrekt über
  `/Account/` aufgerufen; Instanz-ID, K/D/A und Modusnamen werden gelesen.
  Die Aktivitätsdefinitionen werden pro Manifest-Version auf Platte gecacht.
- **Xûr/Händlerdaten** werden robuster geladen; nicht verfügbare Händler
  erzeugen keine leeren Karten mehr.
- **Stream-Deck-API**: Aktionspfade, Jobs und Token-Verwaltung wurden
  vereinheitlicht.

### Entfernt

- **„Destiny 2 beenden“** aus Hauptfenster, Overlay, Einstellungen,
  Befehlspalette und IPC. Windows verweigert das Beenden des geschützten
  Spielprozesses; die Funktion war daher unbrauchbar. „Destiny 2 starten“
  bleibt erhalten.

### Sicherheit

- Im Repository sind **keine** API-Keys, OAuth-Tokens, Client-Secrets,
  Passwörter oder Konfigurationsdateien enthalten.
- Zugangsdaten werden ausschließlich lokal und verschlüsselt gespeichert.
- `.gitignore` schließt `config.json`, `Daten/`, `dist/`, Logs und lokale
  Backups aus.
