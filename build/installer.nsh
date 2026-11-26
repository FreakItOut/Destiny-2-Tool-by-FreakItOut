; Destiny 2 Tool – Installer-Erhalt der Nutzerdaten
;
; Frühere Installationsversionen konnten ihre Daten im Programmordner
; ("Daten") ablegen. Vor dem Löschen des alten Installationsordners werden
; sie einmalig nach %APPDATA%\FreakItOut's Destiny 2 Tool übernommen.
; Eine bereits vorhandene neuere Konfiguration wird nie überschrieben.

!include "LogicLib.nsh"

; Zielordner der Nutzerdaten. Im normalen Betrieb ist das immer
; %APPDATA%\FreakItOut's Destiny 2 Tool. Für den automatisierten
; Upgrade-Test (tools/installer-upgrade-test.js) kann ein isolierter
; Ordner über die Umgebungsvariable D2TESTAPPDATA gesetzt werden.
; Ohne diese Variable ändert sich nichts am Produktionsverhalten.
;
; Im Deinstaller-Pass (BUILD_UNINSTALLER) werden customInit/customInstall
; nicht eingebunden. Eine globale Variable wäre dort ungenutzt und löst
; die von electron-builder als Fehler behandelte NSIS-Warnung 6001 aus.
!ifndef BUILD_UNINSTALLER
  Var D2UserDataDir
!endif

!macro d2ResolveUserDataDir
  StrCpy $D2UserDataDir "$APPDATA\FreakItOut's Destiny 2 Tool"
  ReadEnvStr $0 "D2TESTAPPDATA"
  ${If} $0 != ""
    StrCpy $D2UserDataDir "$0"
  ${EndIf}
!macroend

!macro copyOldD2Data
  !insertmacro d2ResolveUserDataDir
  ${If} ${FileExists} "$INSTDIR\Daten\config.json"
    CreateDirectory "$D2UserDataDir"
    ${IfNot} ${FileExists} "$D2UserDataDir\config.json"
      CopyFiles /SILENT "$INSTDIR\Daten\config.json" "$D2UserDataDir"
      CopyFiles /SILENT "$INSTDIR\Daten\config.json" "$D2UserDataDir\config.json.bak"
      ${If} ${FileExists} "$INSTDIR\Daten\backups\*.*"
        CreateDirectory "$D2UserDataDir\backups"
        CopyFiles /SILENT "$INSTDIR\Daten\backups\*.*" "$D2UserDataDir\backups"
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
