; Stream Studio Virtual Driver Installation
; Requires perMachine: true so installer runs as Administrator
; This is required for WDM audio and DirectShow camera drivers

!macro customInstall
  SetShellVarContext all

  ; ── VB-Audio Virtual Cable (virtual microphone) ──────────────────────────────
  ; Requires admin rights — works because perMachine: true elevates the installer
  IfFileExists "$INSTDIR\drivers\VBCable_Setup_x64.exe" 0 VBCableSkip
    DetailPrint "Installing Stream Studio Microphone driver..."
    ExecWait '"$INSTDIR\drivers\VBCable_Setup_x64.exe" /VERYSILENT /NORESTART' $0
    DetailPrint "VBCable exit code: $0"
    Sleep 2000
    ; Rename devices — these keys are created by the VB-Audio driver
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceName"    "Stream Studio Microphone"
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceNameOut" "Stream Studio Speaker"
    ; Also rename via the audio endpoint name registry path
    WriteRegStr HKLM "SOFTWARE\VB-Audio\Cable" "DeviceName" "Stream Studio Microphone"
  VBCableSkip:

  ; ── OBS Virtual Camera (DirectShow virtual camera) ───────────────────────────
  IfFileExists "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" 0 OBSSkip
    ReadRegStr $1 HKLM "SOFTWARE\OBSProject\VirtualCam" "Version"
    StrCmp $1 "" 0 OBSAlreadyInstalled
      DetailPrint "Installing Stream Studio Camera driver..."
      ; Install only the Virtual Camera component of OBS
      ExecWait '"$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" /VERYSILENT /NORESTART /COMPONENTS="VirtualCamera"' $2
      DetailPrint "OBS VirtualCam exit code: $2"
      Sleep 1000
    OBSAlreadyInstalled:

    ; Rename the OBS Virtual Camera DirectShow filter
    ; The OBS VirtualCam DirectShow CLSID is {A3FCE0F5-3493-419F-958A-ABA1283EED7B}
    WriteRegStr HKLM "SOFTWARE\Classes\CLSID\{A3FCE0F5-3493-419F-958A-ABA1283EED7B}" "" "Stream Studio Camera"
    WriteRegStr HKCU "SOFTWARE\OBSProject\VirtualCam" "DeviceName" "Stream Studio Camera"

    ; Rename via DirectShow filter registry (FriendlyName used by apps)
    WriteRegStr HKLM "SYSTEM\CurrentControlSet\Control\MediaInterfaces\{A3FCE0F5-3493-419F-958A-ABA1283EED7B}" "" "Stream Studio Camera"

  OBSSkip:

  ; ── Run a quick PowerShell refresh so apps pick up the new device names ───────
  ; This broadcasts a WM_DEVICECHANGE message so running apps detect the new devices
  nsExec::ExecToLog 'powershell.exe -NonInteractive -WindowStyle Hidden -Command "& { $null }"'

  DetailPrint "Stream Studio virtual devices installed."
  DetailPrint "Camera: Stream Studio Camera | Microphone: Stream Studio Microphone"
  DetailPrint "Please restart your calling apps to see the new devices."
!macroend

!macro customUnInstall
  Delete "$INSTDIR\drivers\VBCable_Setup_x64.exe"
  Delete "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe"
  RMDir "$INSTDIR\drivers"
!macroend
