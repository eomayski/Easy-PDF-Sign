' Launches the helper agent without a visible console window.
' Used by the logon-triggered Scheduled Task created by the installer.
Set WshShell = CreateObject("WScript.Shell")
exeDir = Left(WScript.ScriptFullName, Len(WScript.ScriptFullName) - Len(WScript.ScriptName))
WshShell.CurrentDirectory = exeDir
WshShell.Run """" & exeDir & "easy-pdf-sign-helper.exe""", 0, False
