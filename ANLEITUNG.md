# Destiny 2 Tool by FreakItOut — Anleitung

Ein Overlay-Tool für Destiny 2: Webseiten (light.gg, DIM, YouTube …) direkt über dem Spiel, mit Controller-Steuerung, Bungie-API-Anbindung (Hüter, Aktionen, **Inventar & Loadouts**), Notizen, Checklisten, Erinnerungen und einem Dashboard.

---

## 1. Schnellstart

1. `Destiny 2 Tool by FreakItOut Setup 1.1.0.exe` installieren **oder** die portable EXE starten.
   - **Portable**: Alle Daten (Config, Notizen, Backups, Cache) landen im `Daten`-Ordner neben der EXE — ideal für USB-Sticks.
2. In Destiny 2: *Einstellungen → Video → Fenstermodus (randlos)*. Exklusives Vollbild kann kein Overlay anzeigen (Windows-Einschränkung).
3. Im Tool `Alt+D` drücken (oder Controller) → das Overlay erscheint über dem Spiel. Erneut drücken blendet es aus.
4. `Alt+Shift+D` lässt die Maus ins Spiel durch; erneuter Druck holt sie zurück (oder automatisch nach Ablauf der eingestellten Minuten, siehe §12).

**Erster Start:** Der Begrüßungsdialog erklärt die Grundlagen. Alle Einstellungen erreichst du über ⚙-Knopf oder `Strg+K` → „Einstellungen: …".

---

## 2. Tastatur-Kürzel (komplett)

| Kürzel | Wirkung |
|---|---|
| `Alt+D` | Overlay ein-/ausblenden (ändern in Einstellungen) |
| `Alt+Shift+D` | Maus durchlassen ein/aus |
| `Alt+P` | Poststellen-Zähler ein-/ausblenden (änderbar) |
| `Alt+I` | Inventar öffnen (änderbar) |
| `Alt+1 … Alt+8` | Kategorie wechseln |
| `Strg+Q` | Zuletzt genutzte Seite wieder öffnen |
| `Strg+Tab` | Nächste Kategorie |
| `Strg+Shift+T` | Geschlossene Seite wiederherstellen |
| `Strg+F` | Seite durchsuchen (Find-in-Page) |
| `Strg+L` | Adressleiste fokussieren (URL direkt öffnen) |
| `Strg+K` | Befehlspalette |
| `Strg+M` | **Minimodus**: nur die Webseite, ohne Leisten |
| `Strg+Alt+S` | **Split-View**: zwei Seiten nebeneinander |
| `Strg+Alt+D` | Dashboard umschalten (global, im Spiel aktivierbar) |
| `Strg+Alt+1 … 8` | Kategorie aus dem Spiel öffnen (global, optional) |
| `F5` | Seite neu laden |
| `Esc` | Dialog schließen / Overlay ausblenden |
| `Strg` + Mausrad | Seite zoomen (pro Seite speicherbar) |
| `Alt` + Mausrad | Overlay-Deckkraft ändern |

---

## 3. Webseiten & Kategorien

- **Kategorien** sind Reiter (Guides, Tools, Builds, …), darunter ein Favoriten-Streifen und die Toolbar mit Navigation.
- **Eigene Seiten**: Toolbar → ⊕ oder einfach einen Link aufs Tool-Fenster ziehen (Drag&Drop). Rechtsklick auf einen Reiter oder **in einer Webseite** öffnet das Kontextmenü (Link kopieren, Link im Mini-Fenster, als eigene Seite speichern, Zoom 100 %, AdBlock-Ausnahme …).
- **Kontextmenü in Webseiten**: Rechtsklick in der Seite bietet Link-Aktionen + Seiten-Aktionen (PiP, entladen, Favorit, AdBlock, Zoom).
- **Mini-Fenster (PiP)**: 🖥-Knopf — die Seite als immer-vorn-Fensterchen.
- **Lesemodus** & **AdBlock-Ausnahmen** pro Seite (Einstellungen → Webseiten).
- **Auto-Refresh** pro Seite einstellbar; **Find-in-Page** über `Strg+F`.
- **Fehler bei einer Seite?** Die Fehlerkarte bietet „Erneut versuchen", „Im Browser öffnen" und „Details kopieren". Wiederholte Fehler landen im **Error-Radar** (Diagnose-Tab) und verfallen automatisch, wenn die Seite wieder lädt.

### Minimodus (`Strg+M` / 📥-Knopf)
Blendet Titelleiste, Reiter, Toolbar und Statuszeile aus — nur die Webseite bleibt. Rückweg: `Strg+M`, der ✕-Chip oben rechts oder die Palette. Der Zustand bleibt über Neustarts erhalten.

### Split-View (`Strg+Alt+S` / 🗀-Knopf)
Die aktuell aktive Seite wird **links gepinnt**, die nächste Auswahl öffnet **rechts** — z. B. Build-Video links, light.gg rechts. Benötigt zwei offene Seiten. Der gepinnte Frame ist vor „Andere entladen" und der Cache-Räumung geschützt.

---

## 4. Controller

Einstellungen → Controller: Belegungen (Tasten → Aktionen), Cursor-Geschwindigkeit/Kurve, Deadzone, Kalibrierung, Stick-Auswahl (bei defektem zweiten Stick fest „Linker Stick").

- **Standard-Belegung**: A = Klicken, B = Zurück/Ausblenden, X = Neu laden, Y = Präzisionsmodus, LB/RB = Kategorie, D-Pad = Navigieren/Scrollen, L3+R3 = Overlay, Guide = Overlay.
- **Inventar & Dialoge**: D-Pad navigiert zwischen Schaltflächen/Items (Fokus wird hervorgehoben), A wählt aus, B schließt zuerst Popup/Editor und dann die Seite, LB/RB wechselt zwischen Inventar und Loadout-Editor, X aktualisiert die Inventardaten. Tooltips und Perk-Erklärungen erscheinen auch mit dem Controller-Cursor. Der zweite Stick scrollt; A auf dem Suchfeld (oder „⌨ Tastatur“) öffnet die virtuelle Bildschirmtastatur.
- **Spiel mitsteuern / Anti-Cheat**: Das Tool liest XInput nur und sendet keine Eingaben an Destiny 2. Für getrennte Steuerung einen zweiten Controller wählen (Einstellungen → Controller → Overlay-Controller: Controller 2; Spiel nutzt Controller 1). Keine Kernel-Filtertreiber oder Eingabe-Hooks im Tool.
- **Schnellbedienung**: Im Item-Popup LB=Tresor, RB=Lagern, X=Favorit, Y=Anlegen; R3 öffnet das Schnellmenü. Die Bildschirmtastatur bietet Suchvorschläge. Der zweite Stick scrollt (Geschwindigkeit/Deadzone einstellbar). Die Glocke zeigt den Benachrichtigungsverlauf; der Poststellen-Zähler hat Darstellung, Refresh-Intervall und „nur bei geöffnetem Inventar“.
- **LT/RT belegbar**: Scrollen (Standard) oder jede beliebige Aktion (Klicken, PiP, Notizen, …) — eigene Dropdowns.
- **Haptik**: kurze Vibration bei Kategorie-/Seitenwechsel (Schalter).
- **Trigger-Schwelle**: ab welchem Druck LT/RT auslösen (bei Losslass-Triggerern höher stellen).
- **Test-Raum**: Einstellungen → Diagnose → Controller-Test (Sticks, Tasten, Trigger live).
- Ein Helfer-EXE (GamepadHelper) registriert globale Tasten im Spiel; bei Änderungen an den C#-Dateien wird er automatisch neu gebaut (Fingerprint-prüfsumme im Log).

---

## 5. Bungie-API

Einstellungen → Bungie:

1. **API-Key** erstellen: bungie.net anmelden → [bungie.net/de/Application](https://www.bungie.net/de/Application) → „Neue Anwendung erstellen“ → Name frei, OAuth „Nicht einsehbar“ → Erstellen → den 32-stelligen **API-Key** aus der Übersicht hier eintragen. (Dafür muss das Bungie-Profil öffentlich sichtbar sein: Profil → Privatsphäre-Einstellungen → „Verbindungsdaten/Licht“.)
2. **Bungie-Name** (z. B. `DeinName#1234`) eintragen → Hüter, Lichtlevel, aktive Aktionen und News erscheinen im Dashboard.
3. **OAuth-Anmeldung** (Client-ID + Client-Secret) — empfohlen: funktioniert auch bei privaten Profilen und schaltet **Inventar & Loadouts** frei. Die Anmeldung erneuert sich **automatisch** — dafür muss die App im Portal **„Vertraulich“** sein (nur vertrauliche Apps erhalten von Bungie einen Refresh-Token; „Öffentlich“ endet nach ca. 1 Stunde mit „Anmeldung abgelaufen“). So geht's:

   a. bungie.net → [Application-Seite](https://www.bungie.net/de/Application) → „Neue Anwendung erstellen“
   b. **Name**: frei
   c. **Website**: exakt `https://localhost` (entspricht dem Feld „Origin“ im Tool)
   d. **OAuth-Typ: „Vertraulich“** (Confidential) → Felder „OAuth Redirect-URL“ (ebenfalls `https://localhost`) und **„OAuth Client Secret“** erscheinen
   e. **Scopes**: <strong>beide</strong> Destiny-Scopes ankreuzen — „<strong>ReadDestinyInventoryAndVault</strong>" (Tresor &amp; Beutetasche <em>lesen</em>) und „<strong>MoveEquipDestinyItems</strong>" (verschieben/ausrüsten). Ohne das Lesen-Scope bleiben Tresor und Beutetasche leer!
   f. „Ich stimme zu“ → **Erstellen**
   g. Aus der Übersicht **„OAuth 2.0 Client ID“** und **„OAuth Client Secret“** kopieren und im Tool eintragen
   h. „**Anmelden …**“ → Bungie-Fenster → „Autorisieren“ — danach 🟢 im Dashboard und das Inventar-Panel (🎒) ist aktiv.

   - Ammeldestatus als Chip im Dashboard-Kopf: 🟢 angemeldet / 🔵 Key / ⚪ ohne.
   - Tokens und Client-Secret werden verschlüsselt gespeichert (Windows-DPAPI), Login-Fenster über Bungie.net.
   - **Öffentliche App** (ohne Secret): funktioniert, aber Bungie stellt dann **keinen Refresh-Token** aus — die Anmeldung endet nach ca. 1 Stunde. Das Tool weist in den Einstellungen darauf hin.
   - **Wichtig:** Scopes erst nach einer Anmeldung geändert? Einmal **ab- und neu anmelden** (Abmelden widerruft die alte Autorisierung, die neue enthält die aktuellen Scopes).
   - **Verbindung prüfen** (Einstellungen → Bungie): prüft API-Key, Client-ID, Client-Secret, Origin, Anmeldung und Scopes in einer Checkliste und sagt genau, was fehlt.
   - **Dashboard-Chip**: 🟢 dauerhaft angemeldet · 🟡 „öffentliche App“ (Anmeldung endet stündlich) · 🔵 nur API-Key · ⚪ ohne Quelle. Klick öffnet die Bungie-Einstellungen.

### Inventar & Loadouts (🎒-Knopf oder Palette)
- **DIM-artige Kachel-Ansicht**: Angelegt / Beutetasche / Tresor nebeneinander, sortiert (Waffen → Rüstung → Sonstiges), Kacheln mit Seltenheitsrahmen (Gold = Exotisch, Lila = Legendär, Blau = Selten), Power- und Mengen-Badge; angelegte Items leuchten grün.
- **Kachel anklicken** → Detailleiste über dem Grid: Name, Typ, Power, Seltenheit + Aktionen (**→ Tresor**, **→ Charakter**, **Anlegen** direkt aus der Beutetasche). Erneuter Klick hebt die Auswahl auf. **Darauf fahren** zeigt ein Overlay mit der Bungie-Beschreibung des Items.
- **Tresor/Beutetasche leer?** Drei Prüfschritte: 1) Entwicklerportal → deine App → Bearbeiten → **beide Destiny-Scopes** anhaken („ReadDestinyInventoryAndVault" + „MoveEquipDestinyItems") und **unterhalb mit „Speichern" sichern** — die App-Übersicht zeigt die Scopes danach als Kategorien (Kontrolle). 2) Im Tool **ab- und neu anmelden** (der alte Token behält die alten Scopes). 3) bungie.net → Profilbild → **Privatsphäre-Einstellungen** → „Verbindungsdaten" auf Öffentlich; ggf. im Spiel die Destiny-Privatsphäre prüfen.
- **Loadout sichern**: Charakter wählen, Name eintippen → die aktuell angelegten Items werden gespeichert (max. 10 Loadouts).
- **Loadout anlegen**: „Anlegen" zeigt zuerst ein **In-App-Modal** (Items, bereits angelegt, fehlende Items, Mods, Subklassen-Plugs) und holt dann jedes Item zurück (Transfer aus dem Tresor + Ausrüsten). Das Ergebnis erscheint als **Ergebnis-Box** im Panel (✓/✗ pro Item) statt nur als Toast — Bungie-Ablehnungen (z. B. zweites Exotic, Item bei anderem Hüter) sind dort vollständig lesbar. Danach bietet **Rückgängig** an, den vorherigen Waffen-/Rüstungsstand **inklusive Rüstungs-Mods** wiederherzustellen (bis zu 3 Schritte, auch als Toast-Aktion).
- **Suche & Filter**: Freitext plus Operatoren — `is:godroll`, `is:dupe`, `is:equipped`, `is:locked`, `is:masterworked`, `perk:"Vorpal Weapon"`, `stat:resilienz:>=20`, `power:>1990`, `slot:helm`, `class:titan`. Suchen lassen sich als **Chips merken** (☆ merken, Rechtsklick entfernt). Nicht passende Items werden **gedimmt** statt entfernt – die Anordnung bleibt stabil. **✓ Godrolls** hebt Treffer hervor, **Wunschliste** verwirft den 24-h-Cache und lädt sofort neu.
- **Mehrfachauswahl**: Strg/Cmd- oder Shift-Klick → **→ Tresor**, **Markieren**, **Vergleichen**.
- **Duplikate → Tresor**: verschiebt doppelte Items (gleicher Hash + Klasse) aus den Beutetaschen in den Tresor; die stärkste Kopie bleibt am Charakter, angelegte Items bleiben unberührt. Fehlgeschlagene Transfers lassen sich in der Ergebnisbox wiederholen.
- **Loadout-Austausch**: **Exportieren** kopiert alle Loadouts als JSON in die Zwischenablage; **Datei importieren…** liest eine JSON-Datei; **DIM-Link…** importiert `dim.gg/…` oder Loadout-URLs mit `?loadout=…` (DIM, d2armorpicker, guardian.report). Mods/Subklassen-Plugs werden übernommen.
- **Optimierer**: Stat-Prioritäten und **Mindestwerte** pro Stat; Kombinationen darunter werden verworfen.
- **Rüstung**: Stat-Summe auf Kachel/Tooltip, 100+-Werte markiert.
- **Anmelde-Banner**: Läuft die Sitzung ab, zeigt das Inventar statt nur einer Fehlermeldung den Knopf **Bungie jetzt anmelden**.
- **Hinweise**: Transfers brauchen das Scope „MoveEquipDestinyItems" in deiner App-Registrierung auf bungie.net. Der erste Inventar-Aufruf lädt einmalig die Item-Definitionen (~10 MB, danach gecacht). Während Raids/Aktivitäten verweigert Bungie Transfers teils generell.

---

## 6. Dashboard

Kategorien-Startseite (native, ohne Webview):

- **Reset/Xûr-Countdowns** (Daily/Weekly, Xûr-Status), **Hüter** mit Emblems + Licht, **Aktive Aktionen** (Milestones, Beschreibung antippen zum Ausklappen), **Bungie-News**
- **Checkliste** direkt abhakbar, **heutige Erinnerungen**, **Spielzeit** (Tage-Wochen), **meistgenutzte Seiten**, **letzte Sitzung** (wiederherstellbar)
- Öffnen per Dashboard-Knopf oder `Strg+Alt+D` aus dem Spiel.

---

## 7. Notizen & Checkliste

**Notizen** (📝-Knopf oder `Strg+K` → „Notizen öffnen"):
- Mehrere **Blätter** (Doppelklick auf den Namen = umbenennen), Auto-Save alle 5 s, Markdown-**Vorschau**
- **Ordner-Modus**: Notizen als `.md`-Dateien in einem freigewählten Ordner (Dropbox/OneDrive-synchron)
- **Suche** über alle Blätter mit Trefferliste; Treffer werden im Editor selektiert
- **Export** als Markdown-Datei; **Stoppuhr-Ergebnis** per Palette in die aktive Notiz hängen

**Checkliste** (🗸-Knopf):
- Einträge resetten automatisch jeden **Dienstag-Reset (17:00)**
- „Zurücksetzen" erzwingt den Reset manuell; **„→ Notiz"** überträgt offene Punkte als Markdown-Liste

---

## 8. Erinnerungen & Alarme

- Arten: **Einmalig / Täglich / Wöchentlich (Wochentag) / Bei Destiny-2-Start** (keine Uhrzeit nötig)
- Alarm-Toasts mit **Snooze** (5/15 Min), Windows-Toasts zeigen das Tool beim Klick
- **Ruhemodus**: Toasts stummschalten (Ausnahmen mit Kraftausdruck bleiben)
- Custom-Sound + Controller-Rumble beim Alarm einstellbar

---

## 9. Profile & Backups

- **Profile**: aktuellen Config-Stand speichern, wechseln, **exportieren/importieren** (.json für Multi-PC), **vor jedem Wechsel automatisch ein Backup** des vorherigen Stands
- **Auto-Backups** nach Zeitplan + Export/Import (Einstellungen → Diagnose)
- Tray-Rechtsklick: Profile direkt umschalten

---

## 10. Fenster & Overlay

- **Fenster-Pin** (📌): Fenstermodus „immer im Vordergrund"
- **Auto-Kompakt**, **Auto-Overlay bei Spielstart**, Overlay-Leiste **konfigurierbar** (11 Elemente ein/aus), **Deckkraft** mit `Alt`+Mausrad
- **Fenster-Heilung**: verschwundenes Fenster per Tray „Wiederherstellen"
- **Click-Through-Auto-Reset**: nach 2/5/10 Min Durchlassen automatisch zurückholen + Toast (gegen das „vergessene Durchlassen")
- **Stoppuhr**: Klick = Start/Pause, Rechtsklick = Reset; während des Laufs steht `⏱ mm:ss` im **Fenstertitel** (Alt+Tab sichtbar)
- **Poststellen-Zähler**: kleines, immer sichtbares Fenster (Einstellungen → Overlay oder Tray-Menü) mit der Anzahl der Gegenstände in der Poststelle je Charakter — gelb ab 15, rot ab 19 von 21. Position frei verschiebbar, Aktualisierung alle 90 s. Optionen: **Kompakt**, **Position sperren**, **Deckkraft**, **nur bei laufendem Destiny 2**. Klick auf die Zahl öffnet das Inventar bei der Poststelle; Rechtsklick öffnet ein Menü (Inventar, Aktualisieren, Einstellungen, Ausblenden). Im Kopf läuft der Countdown bis zum Daily-Reset. Bei 20/21 kommt eine einmalige Warnung; volle Postfächer pulsieren rot.
- **Chip-Reihenfolge**: Reset, Session, Status und Akku lassen sich in den Einstellungen per ↑/↓ umsortieren.
- **Overlay-Layouts**: Größe, Position, Deckkraft, Chip-Reihenfolge und sichtbare Elemente als Profil speichern und per Einstellungen oder Tray anwenden (max. 8).

---

## 11. Diagnose (Einstellungen → Diagnose)

- **Error-Radar**: Seiten mit Ladefehlern dieser Sitzung (auto-verfallend)
- **App-Health**: Bridge/Renderer/Helfer-Status, **Bungie-Warteschlange/Rate-Limit**; **Log-Viewer** mit Filtern
- **Support-Paket**: Diagnose exportieren (mit System-/Monitor-Infos) oder direkt in die Zwischenablage kopieren („Diagnose kopieren“ im Inventar-Fehler); Keys/Tokens sind geschwärzt
- **Netzwerk-Test**, **Hotkey-Test**, **Notify-Historie**, **Factory-Reset**

---

## 12. Troubleshooting

| Problem | Lösung |
|---|---|
| Overlay erscheint nicht | Fenstermodus (randlos) im Spiel wählen; kein exklusives Vollbild; Kürzel-Konflikt prüfen (Diagnose → Hotkey-Test) |
| „API-Key ungültig" (2101/2102) | Key neu erzeugen/eintragen; App-Typ muss „Public" sein |
| „Origin header does not match" | Einstellungen → Bungie: Origin-Feld leeren (Tool probiert automatisch beide Varianten) |
| Inventar leer / „Nicht angemeldet" | OAuth-Anmeldung durchführen (Client-ID setzen); Profil ggf. im Spiel/ auf bungie.net öffnen |
| Transfer abgelehnt | App-Scope „MoveEquipDestinyItems" fehlt; Item angelegt? Erst im Spiel ablegen; Spiel in Aktivität → Bungie blockiert generell |
| Controller wird nicht erkannt | Dongle/USB prüfen; Einstellungen → Diagnose → Controller-Test; „Defekte Achse erkennen" aktiv lassen bei Ghost-Inputs |
| Controller „spinnt" (Cursor läuft davon) | Stick-Auswahl fest auf den gesunden Stick stellen, Deadzone erhöhen, Kalibrierung durchführen |
| Portable EXE „verliert" Einstellungen | Nicht während des Laufs verschieben; Daten-Ordner neben der EXE mitkopieren |
| Leere Mini-Fenster/Weißscreen | GPU-Hardware-Deaktivierung (Diagnose) testen; nach dem Umstellen Neustart |

---

*Stand: Version 1.1.0 — öffentliche Standard-Edition.*
