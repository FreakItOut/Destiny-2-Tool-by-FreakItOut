; Destiny 2 Tool – Installer-Erhalt der Nutzerdaten
;
; Frühere Installationsversionen konnten ihre Daten im Programmordner
; ("Daten") ablegen. Vor dem Löschen des alten Installationsordners werden
; sie einmalig nach %APPDATA%\FreakItOut's Destiny 2 Tool übernommen.
; Eine bereits vorhandene neuere Konfiguration wird nie überschrieben.

!include "LogicLib.nsh"

!macro copyOldD2Data
  ${If} ${FileExists} "$INSTDIR\Daten\config.json"
    CreateDirectory "$APPDATA\FreakItOut's Destiny 2 Tool"
    ${IfNot} ${FileExists} "$APPDATA\FreakItOut's Destiny 2 Tool\config.json"
      CopyFiles /SILENT "$INSTDIR\Daten\config.json" "$APPDATA\FreakItOut's Destiny 2 Tool"
      ${If} ${FileExists} "$INSTDIR\Daten\backups\*.*"
        CreateDirectory "$APPDATA\FreakItOut's Destiny 2 Tool\backups"
        CopyFiles /SILENT "$INSTDIR\Daten\backups\*.*" "$APPDATA\FreakItOut's Destiny 2 Tool\backups"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Läuft in .onInit, bevor der alte Installationsordner entfernt wird.
!macro customInit
  !insertmacro copyOldD2Data
!macroend

; Fallback nach der Installation (z. B. bei manuell gewähltem Zielordner).
!macro customInstall
  !insertmacro copyOldD2Data
!macroend
