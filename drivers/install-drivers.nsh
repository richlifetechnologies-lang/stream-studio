; Stream Studio Virtual Driver Installation
; allowElevation=true gives the installer UAC admin rights.
; NOTE: OBS Studio is intentionally NOT bundled/installed.
;
; Two virtual devices are provided so calling apps (Zoom/Teams/Chrome/WhatsApp)
; can see & hear the AI output WITHOUT OBS:
;   1. "Stream Studio Camera"     - UnityCapture DirectShow filter (video)
;   2. "Stream Studio Microphone" - VB-Audio Virtual Cable (audio)
; Both are installed here and can be re-installed/repaired any time by running
;   drivers\Install-VirtualDevices.ps1   (right-click > Run with PowerShell).

!macro customInstall
  ; ── VB-Audio Virtual Cable (virtual microphone) ──────────────────────────────
  ; VBCable uses Inno Setup — correct silent flag is /VERYSILENT not /S
  IfFileExists "$INSTDIR\drivers\VBCable_Setup_x64.exe" 0 +8
    DetailPrint "Installing Stream Studio Microphone driver..."
    ExecWait '"$INSTDIR\drivers\VBCable_Setup_x64.exe" /VERYSILENT /NORESTART /SUPPRESSMSGBOXES' $0
    DetailPrint "Microphone driver exit code: $0"
    Sleep 3000
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceName"    "Stream Studio Microphone"
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceNameOut" "Stream Studio Speaker"

  ; ── Stream Studio Camera (UnityCapture DirectShow filter, verified) ─────────
  ; The PowerShell installer registers the 64-bit + 32-bit filters and VERIFIES
  ; them against the DirectShow registry, reporting real success/failure.
  ; -NoAudio because VB-Cable was just installed above.
  IfFileExists "$INSTDIR\drivers\Install-VirtualDevices.ps1" 0 +3
    DetailPrint "Registering Stream Studio Camera virtual camera..."
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\drivers\Install-VirtualDevices.ps1" -NoAudio'

  DetailPrint "Stream Studio drivers installed."
!macroend

!macro customUnInstall
  ; Unregister the virtual camera (best effort) before files are removed.
  IfFileExists "$INSTDIR\drivers\Install-VirtualDevices.ps1" 0 +2
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\drivers\Install-VirtualDevices.ps1" -Uninstall -NoAudio'
  Delete "$INSTDIR\drivers\VBCable_Setup_x64.exe"
  Delete "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe"
  RMDir /r "$INSTDIR\drivers"
!macroend
