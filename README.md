# Destiny 2 Tool by FreakItOut

**Deutsch** · [English](README.en.md)

Ein Desktop-Tool für Destiny 2: Dashboard, Inventar & Loadouts, Werkzeuge und
ein Overlay über dem Spiel – mit globalen Tastenkürzeln und vollständiger
Controller-Steuerung. Gebaut mit Electron, ohne Bündler und ohne
Laufzeit-Abhängigkeiten außer Electron selbst.

![Icon](assets/icon.png)

## Download

Die fertigen Windows-Builds liegen unter **Releases**:

- **`Destiny.2.Tool.by.FreakItOut.1.17.1.exe`** – portable Version, keine
  Installation nötig.
- **`Destiny.2.Tool.by.FreakItOut.Setup.1.17.1.exe`** – Installer.
- **`com.freakitout.d2tool.streamDeckPlugin`** – optionales Stream-Deck-Plugin.
- **`streamdeck-profile.json`** – passende Stream-Deck-Belegung.
- **`SHA256SUMS.txt`** – Prüfsummen aller Dateien.

GitHub ersetzt Leerzeichen in Release-Dateinamen durch Punkte; die
Prüfsummen in `SHA256SUMS.txt` beziehen sich auf die Originalnamen.

Weitere Dokumente: [Anleitung](ANLEITUNG.md) · [Changelog](CHANGELOG.md) ·
[English README](README.en.md).

Die Pakete enthalten **keine API-Keys, OAuth-Tokens, Passwörter oder
Kontodaten**. Du verwendest deinen eigenen Bungie-API-Key und meldest dich
selbst bei Bungie an. Alle Zugangsdaten bleiben lokal auf deinem PC (siehe
[Datenschutz & Zugangsdaten](#datenschutz--zugangsdaten)).

Die EXEs sind nicht signiert. Windows SmartScreen kann beim ersten Start
deshalb eine Warnung anzeigen; die Builds entstehen direkt aus diesem
Repository.

## Funktionen

- **Eigene Ansichten statt Webseiten** – Dashboard, Inventar/Loadouts und
  Werkzeugzentrale sind native Ansichten; die frühere Web-Leiste ist
  vollständig entfernt.
- **Offline-Ausgang** – Transfers und Ausrüstungswechsel, die offline oder
  durch ein Limit scheitern, werden gepuffert und automatisch nach der
  nächsten Verbindung gesendet.
- **HUD-Editor im Overlay** – Chips anordnen/ausblenden, Größe S/M/L/XL wählen
  und Profile für Alle/PvP/Raid speichern; optional automatisch nach Aktivität.
- **Karten nach Maß** – Dashboard-Karten in S/M/L, Live-Suche über alle Karten
  und PNG-Export der Aktivitäts-Analyse.
- **Fokus-Dashboard** – standardmäßig nur die wichtigsten Karten; „Alle
  anzeigen“ holt den Rest, die Wahl bleibt gespeichert.
- **Einfache Einstellungen** – alltägliche Optionen zuerst, Expertenbereiche
  (Steam Input, Sicherheit, Diagnose) hinter „Erweitert“.
- **Loadout-Warteschlange** – mehrere Loadouts nacheinander anwenden, mit
  Konflikterkennung (Exoten, Klasse, fehlende Items).
- **90-Tage-Verlauf** – die Aktivitäts-Analyse speichert tägliche Aggregate
  lokal und zeigt den längeren Trend.
- **Overlay über dem Spiel** – randloses, immer im Vordergrund liegendes
  Fenster, Größe, Position, Monitor und Deckkraft sind einstellbar.
- **Globale Tastenkürzel** – funktionieren auch, wenn Destiny 2 den Fokus
  hat. Standard: `Alt+D` für das Overlay, `Alt+Shift+D` für
  Maus-Durchlassen, `Alt+P` für den Poststellen-Zähler, `Alt+I` fürs
  Inventar (alle änderbar).
- **Controller-Steuerung** – virtueller Cursor, Klicken, Scrollen und
  Ansichtswechsel. Ein frei aufnehmbares Tastenpaar (Standard
  `L3 + R3`) blendet das Overlay ein und aus.
- **Maus-Durchlassen** – im Overlay gehen Mausklicks ans Spiel durch,
  während das Overlay sichtbar bleibt.
- **Reset- und Xur-Anzeige** – Countdown bis zum täglichen Reset (17:00 UTC)
  und Xur-Status in der Kopfzeile.
- **Tray** – das Tool läuft im Hintergrund weiter, das Overlay bleibt
  per Kürzel erreichbar.
- **Champion-Planer** – zeigt pro Hüter, welche Champions durch Waffen,
  Perks, Mods und aktive Artefakt-Perks abgedeckt sind, inklusive
  Swap-Vorschlägen aus dem Inventar.
- **Build-Lückenanalyse** – vergleicht ein gespeichertes Ziel und ein
  Loadout: fehlende Stats, Items, Mods und Champion-Abdeckung.
- **Crafting-Materialplan** – summiert alle markierten Crafting-Ziele und
  stellt den Materialbedarf dem aktuellen Bestand gegenüber.
- **Händler-Beobachtung** – beobachtete Angebote mit Preisverlauf,
  Preisänderungs-Hinweis und direktem Detail-Link.
- **Post-Game & Auto-Recap** – kompakte Karte nach einer Aktivität mit
  Loot, Zielen und Champion-Check; optional automatische Erinnerung.
- **Snapshot-Diff** – neue, entfernte, verschobene und geänderte Items
  seit dem letzten Inventar-Abruf.
- **Aktive Such-Chips** – Filterbegriffe lassen sich einzeln entfernen.
- **Aktionswarteschlange** – ausstehende Aktionen einzeln wiederholen
  oder entfernen; Bungie-Anfragen werden serialisiert.
- **Release-Pipeline** – `npm run release:all` prüft, baut und versioniert
  die App; `npm run preflight` schließt laufende App-Prozesse und prüft
  gesperrte Build-Dateien.

## Voraussetzungen

- Windows 10 oder 11 (das Overlay ist auf Windows ausgelegt).
- Destiny 2 im **randlosen Fenstermodus**. Der exklusive Vollbildmodus
  liegt über jedem anderen Fenster; dort kann Windows kein Overlay
  anzeigen. Das ist eine Einschränkung des Spielmodus, nicht des Tools.
- Für die Entwicklung: Node.js 20 oder neuer und npm.

## Installation und Start

```powershell
npm install
npm start
```

Beim ersten Start wird die Konfiguration unter

```
%APPDATA%\FreakItOut's Destiny 2 Tool\config.json
```

angelegt. Alle Änderungen werden sofort gespeichert.

Bei einer **Installation** bleiben Konfiguration, Bungie-Anmeldung, Verlauf und
Backups bei Setup-Updates erhalten. Der Installer übernimmt auch Daten aus
älteren Versionen, die noch im Installationsordner lagen. Die Deinstallation
löscht den Datenordner nicht – zum vollständigen Entfernen
`%APPDATA%\FreakItOut's Destiny 2 Tool` manuell löschen.

Weitere Befehle:

```powershell
npm run dev        # mit geöffneten Entwicklertools
npm run check      # Syntax, Dateien, Importe und HTML-IDs prüfen
npm run smoke      # automatischer Starttest inkl. Overlay-Zustandswechsel
npm run test:oauth # OAuth-Tests gegen einen lokalen Fake-Bungie-Server
npm run test:config # Persistenz von Loadouts/Favoriten/Suchen prüfen
npm run e2e        # Inventar-/Loadout-E2E in Electron
npm run test:full  # Prüfungen, OAuth, Config, Smoke und E2E
npm run icons      # Icon-Dateien neu erzeugen
npm run dist       # Windows-Installer und portable Version bauen
```

## Overlay benutzen

1. In Destiny 2 unter **Einstellungen → Video** den Fenstermodus
   **Randlos / Fenster** wählen.
2. Im Tool `Alt+D` drücken (oder die Controller-Kombination).
3. Das Overlay erscheint mittig über dem Spiel. Mit demselben Kürzel
   wird es wieder ausgeblendet.
4. `Alt+Shift+D` lässt die Maus durch das Overlay zum Spiel durch.
   Erneut drücken holt die Maus zurück.
5. Mit dem Button **Fenster** in der Overlay-Leiste geht es zurück in das
   normale Fenster.

Das Overlay bleibt beim Ausblenden im Hintergrund am Leben (nur unsichtbar
und klickdurchlässig). Nur so funktionieren die Controller-Abfrage und die
globalen Kürzel weiter, während gespielt wird.

### Poststellen-Zähler

Unter **Einstellungen → Overlay** (oder im Tray-Menü) lässt sich der
**Poststellen-Zähler** dauerhaft einblenden: ein kleines, immer im
Vordergrund liegendes Fenster mit der Anzahl der Gegenstände in der
Poststelle — je Charakter, mit Kapazität 21. Es wird gelb ab 15 und rot ab
19, damit du rechtzeitig zum Turm gehen kannst. Das Fenster ist frei
verschiebbar (Position wird gespeichert) und aktualisiert sich alle 90
Sekunden automatisch; der Knopf **Jetzt aktualisieren** holt sofort einen
neuen Stand.

Optionen: **Kompakt** (nur Zahl + Balken), **Position sperren**,
**Deckkraft** und **nur bei laufendem Destiny 2 anzeigen**. Ein Klick auf
die Zahl öffnet das Inventar bei der Poststelle, Rechtsklick öffnet ein
Menü (Inventar, Aktualisieren, Einstellungen, Ausblenden). Im Kopf steht
der Countdown bis zum Daily-Reset. Bei 20/21 kommt eine einmalige Warnung,
bei vollem Postfach pulsiert der Zähler rot.

### Overlay-Layouts

Overlay-Größe, Position, Deckkraft, Chip-Reihenfolge und sichtbare
Leisten-Elemente lassen sich als **Layout-Profil** speichern (Einstellungen
→ Overlay oder Tray → „Overlay-Layout“). Maximal 8 Profile.

### Inventar & Loadouts

- **Suche mit Operatoren:** `is:godroll`, `is:dupe`, `is:equipped`,
  `is:locked`, `is:masterworked`, `perk:"Vorpal Weapon"`,
  `stat:gesundheit:>=20`, `power:>1990`, `slot:helm`, `class:titan` – kombinierbar mit Freitext.
  Die alten Stat-Namen (`resilienz`, `disziplin`, …) werden weiter akzeptiert
  und auf die Armor-3.0-Stats (Gesundheit/Nahkampf/Granate/Super/Klasse/Waffen) gemappt.
  Suchen lassen sich als **Chips merken** (☆ merken, Rechtsklick entfernt).
  Nicht passende Items werden **gedimmt** statt entfernt – die Kacheln
  bleiben an ihrem Platz. Der Schalter **✓ Godrolls** hebt Treffer hervor,
  **Wunschliste** verwirft den 24-h-Cache und lädt sofort neu.
- **Mehrfachauswahl:** Strg/Cmd- oder Shift-Klick auf Kacheln → Sammelaktionen
  **→ Tresor**, **Markieren**, **Vergleichen**.
- **Duplikate → Tresor:** verschiebt doppelte Items aus den Beutetaschen,
  die stärkste Kopie bleibt am Charakter; Fehlschläge lassen sich wiederholen.
- **Loadout anlegen** zeigt vorher ein In-App-Modal (fehlende Items, Mods,
  Subklassen-Plugs, Artefakt-Perks), sichert den vorherigen Stand inklusive
  **Rüstungs-Mods** und bietet danach **Rückgängig** (Ergebnisbox und Toast,
  bis zu 3 Schritte). **Artefakt-Perks** werden über den jeweiligen
  Artefakt-Socket direkt über die Bungie-API gesetzt; verweist das Loadout auf
  ein anderes Saison-Artefakt, werden sie sauber übersprungen und im Ergebnis
  genannt.
- **Loadout-Austausch:** **Exportieren** kopiert alle Loadouts als JSON in die
  Zwischenablage; **Datei importieren…** liest eine JSON-Datei;
  **DIM-Link…** importiert `dim.gg/…`-Links oder Loadout-URLs mit
  `?loadout=…` (DIM, d2armorpicker, guardian.report). Mods und
  Subklassen-Plugs werden dabei übernommen.
- **Optimierer:** Stat-Prioritäten plus **Mindestwerte** pro Stat; Kombinationen
  darunter werden verworfen.
- **Rüstung:** Stat-Summe auf der Kachel und im Tooltip. Im Popup läuft der
  Statbalken auf der **Armor-3.0-Skala 0–200** mit Markierung bei 100 und
  zeigt den aktuellen Charakter-Gesamtwert; die Zahl rechts ist der Beitrag
  des Rüstungsteils. Charakterwerte im Inventar-Kopf und in den Builds nutzen
  dieselbe Skala (ab 101 greift der Bonus-Effekt); der Stat-Optimierer rechnet
  die fünf möglichen Stat-Mods (+10 je Mod) mit ein.
- **Armor-3.0-Metadaten:** Kachel-Badge für Gear-Tier (T1–T5) und Archetyp,
  Popup-Zeilen für Archetyp (Primär/Sekundär), Tertiär-Stat, Tuning-Stat und
  Rüstungs-Set inklusive aktivem 2er-/4er-Bonus.
- **Suche:** `basestat:`, `stat:total`, `basestat:total`, `tier:5`,
  `is:tier5`, `is:armor3.0`, `archetype:`, `tertiary:`, `tunedstat:`,
  `set:`, `note:`/`is:noted`, `dupe:stats`, `is:statlower`; Sortierung nach
  Power, Name, Seltenheit, **Stat-Summe**, **Gear-Tier** und **Archetyp**.
- **Vergleich & Aufräumen:** Rüstung lässt sich jetzt mit Waffen vergleichen;
  Basis-Stats mit bester/schlechterer Markierung, Warnung bei identischen
  Stats. Mehrfachauswahl kann **markieren**, **favorisieren** und „alle
  Nicht-Favoriten“ auswählen.
- **Item-Notizen:** eigene Notiz je Item im Popup; erscheint als ✎ auf der
  Kachel und ist über `note:` durchsuchbar.
- **Mods entpacken:** Mehrfachauswahl → „Mods entpacken“ nimmt Armor-/Artefakt-
  Mods per Bungie-Aktion aus den Sockets (Mods bleiben im Inventar).
- **Werkzeuge:** Set-Bonus-Check pro Charakter, Optimierer mit Fragmenten,
  Set-Boni, fehlenden Punkten bis 100/200 und echten Stat-Mod-Hashes;
  Wochenübersicht mit Xûr-Status und Kopieren-Funktion; Datenstatus mit
  Snapshot-Alter/Manifest-Version.
- **Stat-HUD:** kleines, immer sichtbares Overlay mit den sechs Stats des
  aktiven Charakters (0–200, 100er-Marke), Charakterwechsel per ‹ ›.
- **Xûr:** Godroll-/Fast-Godroll-Badges, „besser als deine beste Kopie“ und
  fehlende Währungen direkt am Angebot.
- **Barrierefreiheit:** Farbmodus für Rot/Grün-Schwäche, sichtbare
  Tastatur-Fokusringe; Oberflächen-Zoom bleibt einstellbar.
- **Sprache:** Umschalter **Deutsch/English** für die Bedienoberfläche
  (Einstellungen → Darstellung). Item-Namen und Beschreibungen bleiben in
  der Spielsprache.
- **Breakpoint-Solver & Build-Karte:** Zielwerte 100/200 pro Stat, fehlende
  Punkte, Set-Boni bevorzugen; Build als PNG-Karte oder Text teilen.
- **Masterwork-/Tuning-Planer:** zeigt Masterwork-Bonus, Tuning-Stat und
  alternative Tuning-Mods pro Rüstungsteil.
- **Rüstungs-Wunschliste:** Regeln für Archetyp, Tertiär, Tuning, Set und
  Mindest-Stats; Treffer mit `is:armorwish` und W-Badge.
- **Vault-Cleanup:** strikt schlechtere Teile, Stat-Duplikate, Teile ohne Set,
  unter T5; „Alle Treffer“ auswählen und Aktionen rückgängig machen.
- **Crafting:** offene Muster, „noch X Red Borders“ und Filter „Nur offene“.
- **Händler-Alerts:** Ada-1/Banshee-Mods inkl. Besitz und fehlender Währungen;
  Xûr-Historie mit „neu“/„nicht mehr im Angebot“.
- **Wochen-Dashboard:** Gruppierung nach GM/Nightfall, Raid, Dungeon, Trials,
  Eisenbanner, Saison; Erinnerung pro Aktivität.
- **Aktivitäts-Analyse:** KPIs für 7/30 Tage (Aktivitäten, Raids/Dungeons, GM,
  PvP, K/D, Serie, Spielzeit), 14-Tage-Balken, 12-Wochen-Heatmap, Kategorien
  und Top-Aktivitäten. Teilt sich den Abruf mit „Letzte Aktivitäten“.
- **Overlay:** Stat-HUD zeigt optional aktuelle Aktivität und Champion-Fähigkeiten.
- **Sicherheit:** verschlüsseltes Konfig-Backup (Passwort, AES-256-GCM),
  API-Status (Anfragen/429/Queue), automatischer Renderer-Neustart.
- **Barrierefreiheit:** Hoher Kontrast, Status-Symbole (✓/≈/▼/⧉) zusätzlich
  zur Farbe.
- **API-Key und Client-Secret** werden verschlüsselt gespeichert; der
  Diagnose-Export/das Kopier-Paket schwärzt alle Zugangsdaten.
- **Stream Deck:** lokale HTTP-API mit Token, Nur-Lese-/benannten Tokens,
  Kurz-URLs, Live-Keys, SVG-Badges, SSE, Jobs und optionalem Plugin;
  **30 Actions**, darunter Verbindungs-Check, Encoder für Loadouts/Händler/
  Checkliste und Routine-Rezepte; Doku unter `docs/stream-deck.md`.
- **Command Palette:** `Strg+K` sucht Befehle, Werkzeugseiten, Einstellungen
  und Schnellaktionen ohne Maus.
- **Datenstatus:** Kopfzeilen-Chip zeigt Snapshot-Alter, Offline-Stand und
  Bungie-Queue; Bungie-Fehler werden mit konkreten Lösungshinweisen angezeigt.
- **Auto-Checkliste:** Postfach leer, Tresor unter 1100 und keine offenen
  Godrolls lassen sich als automatische Wochenziele überwachen.
- **Multi-Build-Ziele & Snapshots:** mehrere Stat-Zielprofile speichern,
  vergleichen und den aktuellen Build-Stand sichern.
- **Sicherheit:** optionale Auto-Sperre nach Inaktivität, PIN-Lockout und
  bereinigte Alt-Backups; DPI-/Monitorwechsel werden automatisch geheilt.

## Tastatur

| Kürzel | Funktion |
| --- | --- |
| `Alt+D` | Overlay ein-/ausblenden (anpassbar) |
| `Alt+Shift+D` | Maus durchlassen (anpassbar) |
| `Strg+K` | Befehlspalette öffnen |
| `Strg+Alt+D` | Dashboard umschalten (global) |
| `Strg+Alt+I` | Inventar öffnen |
| `Strg+Alt+1` … `5` | Werkzeugansicht öffnen |
| `Esc` | Dialog schließen bzw. Overlay ausblenden |

## Controller

Die Belegung im Overlay:

| Taste | Funktion |
| --- | --- |
| Linker/rechter Stick | Cursor bewegen (Tooltips/Perk-Erklärungen erscheinen auch mit dem Controller) |
| A | Klicken / auswählen |
| B | Zurück: schließt zuerst Item-Popup/Loadout-Editor, dann Dialog |
| X | Aktualisieren (im Inventar: Inventar aktualisieren) |
| Y | Präzisionsmodus |
| LB / RB | Tab / Ansicht wechseln |
| Steuerkreuz | Navigieren und scrollen |
| LT / RT | Schnell scrollen |
| View | Einstellungen |
| Menu | Overlay ausblenden |
| L3 + R3 | Overlay ein-/ausblenden (aufnehmbar) |

Im **Inventar, Dashboard und in Dialogen** navigiert das Steuerkreuz
zwischen Schaltflächen und Items; das fokussierte Element wird
hervorgehoben und automatisch in den sichtbaren Bereich gescrollt.
**LB/RB** wechselt im Inventar zwischen Inventar und Loadout-Editor,
**X** aktualisiert dort die Bungie-Daten.

Der **zweite Analog-Stick** scrollt durch Inventar und Dialoge
(standardmäßig der rechte Stick, wenn links den Cursor steuert).
**A auf dem Suchfeld** oder der Knopf **⌨ Tastatur** öffnet eine
controller-bedienbare Bildschirmtastatur für die Inventar-Suche.

### Spiel steuert mit? (Anti-Cheat)
Das Tool **liest** den Controller ausschließlich über XInput und sendet
**keine Eingaben an Destiny 2** (keine Hooks, keine Injection, keine
Makros). Eine externe Overlay-App kann dem Spiel aber technisch nicht
verbieten, denselben Controller ebenfalls zu lesen. Eine wirklich
getrennte Steuerung geht anti-cheat-konform am einfachsten über einen
**zweiten Controller**: In **Einstellungen → Controller → Overlay-Controller**
z. B. „Controller 2“ wählen; das Spiel nutzt Controller 1. Das Tool
bündelt bewusst **keine** Kernel-Filtertreiber (HidHide/ViGEm) oder
Eingabe-Hooks, um die Bungie-Richtlinien nicht zu verletzen.

### Schnellbedienung & neue Extras
- **Item-Popup:** `LB` = Tresor, `RB` = auf Charakter lagern, `X` = Favorit, `Y` = anlegen – ohne Cursor.
- **R3** öffnet ein **Schnellmenü** (Tresor/Lagern/Anlegen/Favorit bzw. Loadouts/Tastatur/Aktualisieren).
- **Virtuelle Tastatur** mit Vorschlägen aus letzten Suchen und Item-Namen; `Enter`/„Fertig“ springt zum ersten Treffer.
- **Zweiter Stick** scrollt; Geschwindigkeit, Richtung und eigene Deadzone unter **Einstellungen → Controller**.
- **Glocke** in der Statusleiste: Benachrichtigungsverlauf mit manuellem Entfernen/Leeren.
- **Poststellen-Zähler:** Darstellung (hell/dunkel), Aktualisierungsintervall und „nur bei geöffnetem Inventar“.

Unter **Einstellungen → Controller** lässt sich die Kombination aufnehmen:
zwei bis drei Tasten gleichzeitig drücken. Die Live-Anzeige zeigt alle
erkannten Tasten. PlayStation-Controller werden als `A = ✕`, `B = ○`,
`X = □`, `Y = △` dargestellt.

### Controller direkt unter Windows auslesen (XInput)

Chromium liefert Gamepad-Eingaben nur an das Fenster, das gerade den
Fokus hat. Für ein Overlay über dem Spiel ist das zu unzuverlässig –
deshalb liest das Tool den Controller zusätzlich direkt über die
Windows-XInput-Schnittstelle aus (eigener Hilfsprozess, unabhängig vom
Fensterfokus).

- Beim ersten Start wird dafür ein kleines Hilfsprogramm mit dem
  C#-Compiler von Windows (`.NET Framework`) übersetzt und in
  `%APPDATA%\FreakItOut's Destiny 2 Tool\bin` abgelegt.
- Fehlt der Compiler, nutzt das Tool eine **vorkompilierte Version
  aus dem App-Paket** (Dateiname enthält den Quellcode-Fingerabdruck,
  veraltete Exemplare werden ignoriert). Erst wenn auch die fehlt,
  greift die Browser-Gamepad-API als Rückfallebene.
- Stürzt der Hilfsprozess ab, startet das Tool ihn automatisch neu
  (bis zu drei Versuche mit wachsendem Abstand).
- Abschaltbar unter **Einstellungen → Controller → Controller direkt
  unter Windows auslesen (XInput)**.

Nebenbei: **Overlay holt sich den Fensterfokus** (Einstellung
„Overlay holt sich beim Öffnen den Fensterfokus“). Das ist für
Mausklicks im Overlay nötig. Der Controller funktioniert dank der
XInput-Bridge auch ohne Fokus.

### Guide-Knopf (Xbox-Logo) und Einzel-/Kombinationstaste

Die öffentliche XInput-Schnittstelle kennt den Guide-Knopf (das
kleine Xbox-Logo in der Mitte) nicht – sie liefert nur 16 Bit für
Tasten, und die sind belegt. Deshalb liest der Helfer den Knopf über
**zwei Wege**:

1. **XInputGetStateEx** (undokumentierte Funktion, Ordinal 100):
   Windows nutzt sie selbst, um den Guide-Knopf für die Xbox Game
   Bar zu lesen. Sie meldet den Knopf als Bit 0x0400 – zuverlässig
   für jeden XInput-Controller, auch für den GameSir Nova Lite.
2. **Raw Input** (Zusatzweg): Der Helfer registriert sich für
   Gamepad- und Joystick-Geräte und liest deren HID-Reports direkt,
   falls der erste Weg nicht verfügbar sein sollte.

Funktioniert der Guide-Knopf einmal trotzdem nicht, lässt sich unter
**Einstellungen → Controller → Einzeltaste** jede beliebige Taste als
Auslöser wählen (Guide, View, Menu, LB, RB, L3, R3). Das Tool zeigt
an, welche Tasten das System tatsächlich meldet. Die
Tastenkombination (Standard L3 + R3) ist unabhängig davon immer
verfügbar, und im Notfall übernimmt automatisch die **View-Taste**.

### Rauschfilter für die Analog-Sticks

Manche Controller (günstige Xbox-360-Kopien) liefern stark
schwankende Achsenwerte – der Stick springt sporadisch auf vollen
Ausschlag und zurück, der Cursor fliegt dann wild hin und her. Der
Helfer filtert solche Ausreißer (Ruhezone, Stabilitätsprüfung und
Glättung). Unter **Einstellungen → Controller → Rauschfilter** lässt
sich die Stärke wählen: *Aus*, *Normal* oder *Stark* (für sehr
unruhige Controller).

### Trigger (L2 / R2)

Manche Controller melden im Leerlauf keine 0 bei den Triggern – der
GameSir Nova Lite meldet zum Beispiel dauerhaft 255 / 127. Das Tool
misst den Ruhewert automatisch und wertet die Trigger nur als
Bewegung relativ dazu aus. So lösen die Trigger nicht von selbst aus,
nur weil der Stick bewegt wird.


### Kalibrierung der Sticks

Unter **Einstellungen → Controller → Analog-Sticks kalibrieren** siehst
du live, welche Werte der Controller meldet (vier Balken). Mit
**„Kalibrieren starten“** lernt das Tool in fünf Schritten:

1. Stick in der Mitte loslassen (Ruheposition)
2. Ganz nach links
3. Ganz nach oben
4. Ganz nach rechts
5. Ganz nach unten

Danach wird der Weg des Sticks auf −1 bis +1 normiert – die Richtung
und der Weg stimmen dann unabhängig vom Controller. **Zurücksetzen**
stellt die Standardwerte wieder her.

Zusätzlich lassen sich **Achsen vertauschen** und **X- bzw.
Y-Achse umkehren**, falls der Controller sie gespiegelt liefert.

### Tasten belegen

Unter **Einstellungen → Controller → Tasten belegen** wird jeder
Funktion (Klicken, Zurück, Ansichtswechsel, Präzisionsmodus,
Einstellungen, Overlay ausblenden) eine beliebige Taste zugeordnet.
„Nicht belegt“ deaktiviert die Funktion.

Der Guide-/Xbox-Knopf und die Tastenkombination werden getrennt
davon eingestellt (siehe oben).

## Aufbau

```
electron/
  main.js       Fenster, Overlay-Zustand, Tray, globale Kürzel, IPC, Smoke-Test
  config.js     Standardwerte, Validierung, atomares Speichern
  preload.js    sichere Brücke (contextBridge) für die Oberfläche
  gamepad.js    Bridge zum XInput-Hilfsprozess (Controller ohne Fensterfokus)
  gamepad-helper/
    GamepadHelper.cs  C#-Helfer, liest XInput und meldet den Zustand
renderer/
  index.html    Oberfläche, Einstellungen, Hilfe
  styles.css    Destiny-inspiriertes Dark-Design inkl. Overlay-Modus
  js/
    app.js        Start, Ansichten, Overlay-Ereignisse
    dashboard.js  Kommandostand, Prioritäten und Analytik
    inventory.js  Inventar, Loadouts und Werkzeuge
    controller.js Gamepad-Abfrage, Cursor, Klick/Scroll
    settings.js   Einstellungsdialog und Aufnahme
    clock.js      Reset- und Xur-Countdown
    ui.js         Helfer (Toast, Debounce, Escaping)
    icons.js      Inline-SVG-Symbole
tools/
  make-icons.js PNG/ICO-Generator ohne externe Abhängigkeiten
  check.js      Projektprüfung
```

Alle Ansichten laufen lokal im Renderer. Es werden keine fremden
Webseiten mehr eingebettet; externe Links (z. B. Bungie-Portal oder
Discord) öffnen im Standardbrowser.

## Fehlersuche

- **Overlay ist unsichtbar:** Prüfe, ob Destiny 2 im randlosen
  Fenstermodus läuft. Im exklusiven Vollbild wird das Overlay verdeckt.
- **Kürzel reagiert nicht:** Ein anderes Programm belegt die Tastenkombination.
  Unter Einstellungen ein anderes Kürzel aufnehmen; das Tool meldet belegte
  Kombinationen.
- **Controller wird nicht erkannt:** Eine Taste drücken, damit Chromium den
  Controller meldet. Bei Steam Input gegebenenfalls den Controller-Emulationsmodus
  testen.
- **Controller reagiert im Overlay nicht:** Das Tool liest den Controller
  direkt über Windows-XInput aus (siehe oben). Sollte das nicht klappen,
  hilft der Eintrag `Gamepad-Bridge` in der Logdatei
  (`%APPDATA%\FreakItOut's Destiny 2 Tool\logs\app.log`). Bei
  „Kein C#-Compiler gefunden“ die XInput-Option in den Einstellungen
  prüfen.
- **Spiel reagiert zusätzlich auf den Controller:** Windows reicht
  XInput-Eingaben an alle Programme weiter. Destiny 2 pollt den Controller
  direkt und ignoriert ihn nur, solange das Spiel nicht im Vordergrund ist.
  Deshalb holt sich das Overlay den Fokus; im Maus-Durchlass-Modus bleibt der
  Controller beim Spiel.
- **Daten veraltet:** Im Inventar „Aktualisieren“ drücken oder das
  Dashboard-Layout neu laden. Bungie-Anmeldung und API-Key prüfen.

## Datenschutz & Zugangsdaten

- Dieses Repository enthält **keine API-Keys, OAuth-Tokens, Client-Secrets,
  Passwörter, Kontonamen oder Konfigurationsdateien**.
- API-Key, Client-Secret und OAuth-Tokens werden **verschlüsselt** auf deinem
  PC gespeichert (Windows DPAPI über `safeStorage`).
- Die Konfiguration liegt in
  `%APPDATA%\FreakItOut's Destiny 2 Tool\config.json` (portable Version:
  `Daten\config.json` neben der EXE) und ist **nicht** Teil dieses
  Repositories.
- Diagnose-Exporte und Kopier-Pakete schwärzen alle Zugangsdaten.
- Die `.gitignore` schließt `config.json`, `Daten/`, `dist/`, Logs,
  Build-Berichte und lokale Backups aus.
- Committe niemals deine eigene `config.json`, verschlüsselte Backups oder
  Logdateien. Falls doch ein Secret veröffentlicht wurde: sofort im
  Bungie-Entwicklerportal erneuern und den OAuth-Token widerrufen.

## Mitwirken

Issues und Pull Requests sind willkommen. Bitte vor einem Pull Request
mindestens

```powershell
npm run check
npm run lint
npm run test:types
npm run test:fixtures
npm run e2e
```

ausführen. Änderungen bitte fokussiert halten und keine persönlichen Daten,
echten API-Keys, Tokens oder lokalen Konfigurationsdateien einchecken.

## Rechtliches

Dieses Tool ist ein inoffizielles Community-Projekt und steht in keiner
Verbindung zu Bungie. Destiny 2 und alle zugehörigen Inhalte sind Eigentum
von Bungie, Inc.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
