; Stream Studio Virtual Driver Installation
; Included by electron-builder NSIS installer
; Runs after the main app files are installed

!macro customInstall
  ; ── Install OBS Virtual Camera ──────────────────────────────────────────────
  DetailPrint "Installing Stream Studio Camera driver..."
  SetOutPath "$INSTDIR\drivers"
  File /nonfatal "${BUILD_RESOURCES_DIR}\..\drivers\OBS-VirtualCam-Setup.exe"
  
  ; Check if OBS Virtual Camera is already installed
  ReadRegStr $0 HKLM "SOFTWARE\OBSProject\VirtualCam" "Version"
  ${If} $0 == ""
    ; Silent install of OBS VirtualCam
    ExecWait '"$INSTDIR\drivers\OBS-VirtualCam-Setup.exe" /VERYSILENT /NORESTART /SP-' $1
    DetailPrint "Camera driver install exit code: $1"
  ${Else}
    DetailPrint "Camera driver already installed (v$0), skipping."
  ${EndIf}

  ; Rename the OBS Virtual Camera device to "Stream Studio Camera"
  WriteRegStr HKLM "SOFTWARE\Classes\CLSID\{A3FCE0F5-3493-419F-958A-ABA1283EED7B}" "" "Stream Studio Camera"
  WriteRegStr HKCU "SOFTWARE\OBSProject\VirtualCam" "DeviceName" "Stream Studio Camera"
  ; Also patch the DirectShow filter name in the registry
  WriteRegStr HKLM "SYSTEM\CurrentControlSet\Control\DeviceClasses\{65E8773D-8F56-11D0-A3B9-00A0C9223196}\##?#OBS-VirtualCam#DeviceName" "DeviceName" "Stream Studio Camera"

  ; ── Install VB-Audio Virtual Cable ──────────────────────────────────────────
  DetailPrint "Installing Stream Studio Microphone driver..."
  File /nonfatal "${BUILD_RESOURCES_DIR}\..\drivers\VBCable_Setup_x64.exe"
  
  ; Check if VB-Audio is already installed
  ReadRegStr $2 HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM" "DisplayName"
  ${If} $2 == ""
    ; Silent install of VB-Audio Virtual Cable
    ExecWait '"$INSTDIR\drivers\VBCable_Setup_x64.exe" /VERYSILENT /NORESTART' $3
    DetailPrint "Microphone driver install exit code: $3"
    ; Give driver time to register
    Sleep 2000
  ${Else}
    DetailPrint "Microphone driver already installed, skipping."
  ${EndIf}

  ; Rename VB-Audio devices to Stream Studio branding
  WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceName" "Stream Studio Microphone"
  WriteRegStr HKLM "SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters" "DeviceNameOut" "Stream Studio Speaker"

  ; Refresh device names via PowerShell (forces Windows to re-read device names)
  ExecWait 'powershell.exe -NonInteractive -WindowStyle Hidden -Command "& {Stop-Service -Name VBAudioVACMM -Force -ErrorAction SilentlyContinue; Start-Service -Name VBAudioVACMM -ErrorAction SilentlyContinue}"' 

  DetailPrint "Stream Studio virtual drivers installed successfully."
!macroend

!macro customUnInstall
  ; Remove the driver installers we copied
  Delete "$INSTDIR\drivers\OBS-VirtualCam-Setup.exe"
  Delete "$INSTDIR\drivers\VBCable_Setup_x64.exe"
  RMDir "$INSTDIR\drivers"
  
  DetailPrint "To fully uninstall virtual devices, use Windows Device Manager."
!macroend
