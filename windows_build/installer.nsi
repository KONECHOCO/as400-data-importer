; ============================================================
;  AS400 Data Importer — NSIS Installer
;  Ikonet Solutions
; ============================================================

Unicode True

; ── Include modern UI ───────────────────────────────────────
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

; ── Defines ─────────────────────────────────────────────────
!define APP_NAME        "AS400 Data Importer"
!define APP_EXE         "AS400Importer.exe"
!define APP_PUBLISHER   "Ikonet Solutions"
!define APP_VERSION     "1.0.0"
!define APP_URL         "https://ikonetsolutions.com"
!define REG_UNINSTALL   "Software\Microsoft\Windows\CurrentVersion\Uninstall\AS400Importer"
!define REG_AUTORUN     "Software\Microsoft\Windows\CurrentVersion\Run"

; ── Installer properties ────────────────────────────────────
Name            "${APP_NAME} ${APP_VERSION}"
OutFile         "AS400Importer-Setup.exe"
InstallDir      "$PROGRAMFILES64\AS400Importer"
InstallDirRegKey HKLM "${REG_UNINSTALL}" "InstallLocation"
RequestExecutionLevel admin
BrandingText    "${APP_PUBLISHER}"
ShowInstDetails show

; ── MUI Pages ───────────────────────────────────────────────
!define MUI_ICON                    "AS400Importer.ico"
!define MUI_UNICON                  "AS400Importer.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE       "Benvenuto in ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT        "Questo wizard installerà ${APP_NAME} ${APP_VERSION} sul tuo computer.$\r$\n$\r$\nL'applicazione consente di importare ed esportare dati dall'AS400 direttamente dalla tua rete aziendale.$\r$\n$\r$\nClicca Avanti per continuare."
!define MUI_FINISHPAGE_RUN          "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT     "Avvia ${APP_NAME} ora"
!define MUI_FINISHPAGE_LINK         "Visita ikonetsolutions.com"
!define MUI_FINISHPAGE_LINK_LOCATION "${APP_URL}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Italian"

; ── Helper: check Java ──────────────────────────────────────
Function CheckJava
    nsExec::ExecToStack '"java" -version'
    Pop $0
    ${If} $0 != 0
        ; Try JAVA_HOME
        ReadEnvStr $1 "JAVA_HOME"
        ${If} $1 == ""
            MessageBox MB_ICONEXCLAMATION|MB_OK \
                "Java non trovato sul sistema!$\r$\n$\r$\n\
                ${APP_NAME} richiede Java JRE 8 o superiore per$\r$\n\
                connettersi al sistema AS400.$\r$\n$\r$\n\
                COSA FARE:$\r$\n\
                1. Scarica Java da: https://www.java.com/it/download/$\r$\n\
                2. Installa Java e riavvia il PC$\r$\n\
                3. Riavvia ${APP_NAME}$\r$\n$\r$\n\
                L'applicazione sarà comunque installata ma la connessione$\r$\n\
                AS400 non funzionerà finché Java non sarà installato."
        ${EndIf}
    ${EndIf}
FunctionEnd

; ── Main installation section ───────────────────────────────
Section "Principale" SEC_MAIN
    SectionIn RO    ; required section
    SetOutPath "$INSTDIR"

    ; Copy all files from PyInstaller output
    File /r "..\dist_windows_new\AS400Importer\*"

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; ── Registry ────────────────────────────────────────────
    WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayName"          "${APP_NAME}"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayVersion"       "${APP_VERSION}"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "Publisher"            "${APP_PUBLISHER}"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "URLInfoAbout"         "${APP_URL}"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "InstallLocation"      "$INSTDIR"
    WriteRegStr   HKLM "${REG_UNINSTALL}" "UninstallString"      '"$INSTDIR\Uninstall.exe"'
    WriteRegStr   HKLM "${REG_UNINSTALL}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
    WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify"             1
    WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair"             1

    ; Estimate install size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "${REG_UNINSTALL}" "EstimatedSize" "$0"

    ; ── Shortcuts ───────────────────────────────────────────
    ; Desktop
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" \
        "$INSTDIR\${APP_EXE}" "" \
        "$INSTDIR\${APP_EXE}" 0 \
        SW_SHOWNORMAL "" "${APP_NAME}"

    ; Start Menu
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
        "$INSTDIR\${APP_EXE}" "" \
        "$INSTDIR\${APP_EXE}" 0
    CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Disinstalla.lnk" \
        "$INSTDIR\Uninstall.exe"

    ; Check Java after install
    Call CheckJava
SectionEnd

; ── Optional: autostart with Windows ───────────────────────
Section /o "Avvia automaticamente con Windows" SEC_AUTOSTART
    WriteRegStr HKCU "${REG_AUTORUN}" "AS400Importer" '"$INSTDIR\${APP_EXE}"'
SectionEnd

; ── Section descriptions ────────────────────────────────────
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_MAIN}      "File principali dell'applicazione (obbligatorio)."
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_AUTOSTART} "Avvia AS400 Data Importer automaticamente all'avvio di Windows."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ── Uninstaller ─────────────────────────────────────────────
Section "Uninstall"
    ; Stop running instance
    nsExec::ExecToStack 'taskkill /F /IM "${APP_EXE}"'
    Sleep 1000

    ; Remove files
    RMDir /r "$INSTDIR"

    ; Remove shortcuts
    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"

    ; Remove registry keys
    DeleteRegKey HKLM "${REG_UNINSTALL}"
    DeleteRegValue HKCU "${REG_AUTORUN}" "AS400Importer"

    ; Ask about user data
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "Vuoi eliminare anche il database e i dati dell'applicazione?$\r$\n$\r$\n\
        (Connessioni, operazioni, query salvate ecc.)" \
        IDNO skip_data
        RMDir /r "$LOCALAPPDATA\AS400Importer"
    skip_data:

    SetAutoClose true
SectionEnd
