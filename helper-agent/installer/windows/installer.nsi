; Easy PDF Sign Helper — Windows installer
;
; Installs the pkg-built agent exe under %LOCALAPPDATA% (no admin/UAC needed),
; registers a per-user Scheduled Task that launches it hidden at logon, and
; starts it immediately so it's usable right after install without a reboot
; or logoff/logon cycle.

!include "MUI2.nsh"

!define APP_NAME "Easy PDF Sign Helper"
!define APP_EXE "easy-pdf-sign-helper.exe"
!define TASK_NAME "EasyPDFSignHelper"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyPDFSignHelper"

; Passed by build-installer.js from package.json — never edit the version here.
!ifndef VERSION
  !define VERSION "0.0.0"
!endif

Name "${APP_NAME}"
OutFile "..\..\release\easy-pdf-sign-helper-setup.exe"
InstallDir "$LOCALAPPDATA\EasyPDFSignHelper"
RequestExecutionLevel user
SetCompressor /SOLID lzma

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Easy PDF Sign"
VIAddVersionKey "LegalCopyright" "Easy PDF Sign"

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Bulgarian"

Section "Install"
  ; On an upgrade the previous agent is still running and holds the exe open,
  ; which made NSIS fail with "error opening file for writing" — and if the
  ; user chose Ignore, the old binary survived and kept reporting the old
  ; version to /health. Stop it before writing anything.
  nsExec::ExecToLog 'schtasks /end /tn "${TASK_NAME}"'
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXE}"'
  Sleep 1000

  SetOutPath "$INSTDIR"
  File "..\..\release\${APP_EXE}"
  File "run-hidden.vbs"

  ; /f overwrites a task left over from a previous install/upgrade
  nsExec::ExecToLog 'schtasks /create /tn "${TASK_NAME}" /tr "wscript.exe \"$INSTDIR\run-hidden.vbs\"" /sc onlogon /rl limited /f'

  ; Start now so the agent is usable immediately, without logging off/on
  nsExec::ExecToLog 'wscript.exe "$INSTDIR\run-hidden.vbs"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Easy PDF Sign"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXE}"'
  nsExec::ExecToLog 'schtasks /delete /tn "${TASK_NAME}" /f'

  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\run-hidden.vbs"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
