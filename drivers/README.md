# Stream Studio Virtual Drivers

These driver installers are downloaded during the CI build and bundled into the Windows installer.

- `OBS-VirtualCam-Setup.exe` — OBS Virtual Camera (DirectShow virtual camera device)
- `VBCable_Setup_x64.exe` — VB-Audio Virtual Cable (virtual audio device)

Both are downloaded from their official sources during `build.yml`.
After installation, registry keys are patched to show "Stream Studio Camera" and "Stream Studio Microphone".
