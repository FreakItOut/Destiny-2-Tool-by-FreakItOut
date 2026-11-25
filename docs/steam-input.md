# Steam Input: Controller im Overlay trennen

Ziel: Destiny 2 soll keine Controller-Eingaben bekommen, während das
Overlay bedient wird. Steam Input übernimmt die Übersetzung auf
Tastatur/Maus; das Tool bleibt extern und injiziert nichts ins Spiel.

## Einrichtung

1. Destiny 2 über Steam starten.
2. Steam → Einstellungen → Controller:
   - Xbox-/PlayStation-Konfigurationsunterstützung aktivieren.
   - Bei Bedarf „Generische Gamepad-Konfigurationsunterstützung“ einschalten.
3. Destiny 2 → Eigenschaften → Controller → Steam Input aktivieren.
4. Destiny 2 → Controller-Layout bearbeiten.
5. Action Set **Spiel** als Standard lassen.
6. Action Set **Overlay** anlegen.

## Empfohlenes Overlay-Set

| Taste | Aktion |
|---|---|
| D-Pad | Pfeiltasten |
| A | Enter |
| B | Escape |
| LB / RB | Tab / Shift+Tab |
| Linker Stick | Mauszeiger (optional) |
| RT | Linksklick (optional) |
| Guide + Back | Action Set Spiel ↔ Overlay |
| Alle anderen | Keine Aktion |

Im Overlay-Set keine normalen Gamepad-Aktionen belegen. Sticks nicht als
„Joystick“ konfigurieren, sonst steuert Destiny 2 weiter.

## Bedienung

1. Overlay mit `Alt+D` oder einer Steam-Input-Taste öffnen.
2. `Guide + Back` → Set **Overlay**.
3. Controller sendet Tastatur/Maus an das fokussierte Overlay.
4. `Guide + Back` → Set **Spiel**; Destiny 2 bekommt den Controller zurück.

Im Tool unter **Einstellungen → Steam Input**:

- „Steam Input aktiv“ einschalten.
- Fokus-Wächter und Karenzzeit einstellen.
- Fokus-Status prüfen.
- Zweiten Controller für das Overlay auswählen.
- Mapping kopieren.

## Grenzen

- Funktioniert zuverlässig, wenn Destiny 2 den Controller über Steam
  Input/XInput erhält.
- Liest das Spiel den Controller an Steam vorbei, kann Steam Input die
  Eingabe nicht blockieren. Dann ist ein zweiter Controller die
  sicherste Lösung.
- Der Wechsel ist manuell. Ein automatischer Action-Set-Wechsel von
  außen würde einen Eingriff in Steam oder das Spiel erfordern.
