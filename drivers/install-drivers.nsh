; Stream Studio Virtual Driver Installation
; allowElevation=true gives the installer UAC admin rights
; VBCable is Inno Setup based — silent flag is /VERYSILENT
; NOTE: OBS Studio is intentionally NOT bundled/installed. Users who want a
; virtual camera install OBS themselves; bundling it caused a silent OBS
; download at install time and a black "OBS Virtual Camera" input device.

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

  DetailPrint "Stream Studio drivers installed."
!macroend

!macro customUnInstall
  Delete "$INSTDIR\drivers\VBCable_Setup_x64.exe"
  Delete "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe"
  RMDir "$INSTDIR\drivers"
!macroend
