; Stream Studio Virtual Driver Installation
; electron-builder includes this via nsis.include
; Runs customInstall macro after main app files are installed

!macro customInstall
  ; ── Install VB-Audio Virtual Cable (virtual microphone) ─────────────────────
  IfFileExists "$INSTDIR\drivers\VBCable_Setup_x64.exe" VBCableExists VBCableSkip
  VBCableExists:
    DetailPrint "Installing Stream Studio Microphone driver..."
    ; Run VB-Audio installer silently
    ExecWait '"$INSTDIR\drivers\VBCable_Setup_x64.exe" /VERYSILENT /NORESTART' $0
    DetailPrint "Microphone driver install result: $0"
    ; Small delay for driver to register
    Sleep 1500
    ; Rename the virtual cable to Stream Studio branding
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceName" "Stream Studio Microphone"
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceNameOut" "Stream Studio Speaker"
  VBCableSkip:

  ; ── Install OBS Virtual Camera ───────────────────────────────────────────────
  IfFileExists "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" OBSExists OBSSkip
  OBSExists:
    ; Only install OBS VirtualCam plugin, not the full OBS app
    ; Check if already installed first
    ReadRegStr $1 HKLM "SOFTWARE\OBSProject\VirtualCam" "Version"
    StrCmp $1 "" 0 OBSAlreadyInstalled
      DetailPrint "Installing Stream Studio Camera driver..."
      ExecWait '"$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" /VERYSILENT /NORESTART /COMPONENTS=VirtualCamera' $2
      DetailPrint "Camera driver install result: $2"
      Sleep 1000
    OBSAlreadyInstalled:
    ; Rename the virtual camera device
    WriteRegStr HKCU "SOFTWARE\OBSProject\VirtualCam" "DeviceName" "Stream Studio Camera"
  OBSSkip:

  DetailPrint "Stream Studio virtual devices ready."
!macroend

!macro customUnInstall
  ; Clean up driver files (optional — leave devices installed for user)
  Delete "$INSTDIR\drivers\VBCable_Setup_x64.exe"
  Delete "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe"
  RMDir "$INSTDIR\drivers"
!macroend
