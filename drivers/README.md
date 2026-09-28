# Stream Studio Virtual Drivers

The microphone driver is downloaded during the CI build and bundled into the Windows installer.

- `VBCable_Setup_x64.exe` — VB-Audio Virtual Cable (virtual audio device), installed silently as "Stream Studio Microphone"

OBS Studio is intentionally NOT bundled. Earlier versions downloaded the full OBS
installer and ran it silently at install time, which surprised users with an OBS
download and left a black "OBS Virtual Camera" entry in the camera picker. If you
want a virtual camera for other apps, install OBS Studio yourself and start its
virtual camera before selecting it.
