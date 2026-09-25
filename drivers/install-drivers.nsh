; Stream Studio Virtual Driver Installation
; allowElevation=true gives the installer UAC admin rights
; Both installers are Inno Setup based — silent flag is /VERYSILENT

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

  ; ── OBS VirtualCam plugin (virtual camera) ───────────────────────────────────
  ; OBS studio installer with /COMPONENTS=VirtualCamera installs ONLY the camera
  IfFileExists "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" 0 +8
    DetailPrint "Installing Stream Studio Camera driver..."
    ExecWait '"$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" /VERYSILENT /NORESTART /SUPPRESSMSGBOXES /COMPONENTS=VirtualCamera' $1
    DetailPrint "Camera driver exit code: $1"
    Sleep 2000
    ; Rename the DirectShow filter — this is what Zoom/Teams/Chrome read
    WriteRegStr HKLM "SOFTWARE\Classes\CLSID\{A3FCE0F5-3493-419F-958A-ABA1283EED7B}" "" "Stream Studio Camera"

  DetailPrint "Stream Studio drivers installed."
!macroend

!macro customUnInstall
  Delete "$INSTDIR\drivers\VBCable_Setup_x64.exe"
  Delete "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe"
  RMDir "$INSTDIR\drivers"
!macroend
