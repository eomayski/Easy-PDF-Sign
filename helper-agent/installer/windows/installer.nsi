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

Name "${APP_NAME}"
OutFile "..\..\release\easy-pdf-sign-helper-setup.exe"
InstallDir "$LOCALAPPDATA\EasyPDFSignHelper"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Bulgarian"

Section "Install"
  SetOutPath "$INSTDIR"
  File "..\..\release\${APP_EXE}"
  File "run-hidden.vbs"

  ; /f overwrites a task left over from a previous install/upgrade
  nsExec::ExecToLog 'schtasks /create /tn "${TASK_NAME}" /tr "wscript.exe \"$INSTDIR\run-hidden.vbs\"" /sc onlogon /rl limited /f'

  ; Start now so the agent is usable immediately, without logging off/on
  nsExec::ExecToLog 'wscript.exe "$INSTDIR\run-hidden.vbs"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
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
