<#
  Stream Studio - Virtual Device Installer
  ----------------------------------------
  Registers the "Stream Studio Camera" DirectShow virtual camera (UnityCapture
  filter) for both 64-bit and 32-bit calling apps, and installs the VB-Audio
  Virtual Cable ("Stream Studio Microphone").

  Unlike the old RICHX installer, this script VERIFIES every step against the
  registry and reports real success/failure instead of printing "[OK]" blindly.

  Run manually (right-click > Run with PowerShell) or it is invoked silently by
  the Stream Studio setup. Requires Administrator; it self-elevates if needed.

  Exit codes: 0 = all requested components OK, 1 = one or more failed.
#>

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$NoAudio,
  [switch]$NoVideo,
  [string]$CameraName = "Stream Studio Camera"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Write-Step($m) { Write-Host "[ .. ] $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "[ OK ] $m" -ForegroundColor Green }
function Write-Bad($m)  { Write-Host "[FAIL] $m" -ForegroundColor Red }
function Write-Warn2($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

# ── Self-elevate to Administrator ─────────────────────────────────────────────
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Warn2 "Administrator rights required - relaunching elevated..."
  $args = @("-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`"")
  if ($Uninstall) { $args += "-Uninstall" }
  if ($NoAudio)   { $args += "-NoAudio" }
  if ($NoVideo)   { $args += "-NoVideo" }
  $p = Start-Process powershell.exe -Verb RunAs -ArgumentList $args -PassThru
  $p.WaitForExit()
  exit $p.ExitCode
}

$Root       = Split-Path -Parent $PSCommandPath
$CamDir     = Join-Path $Root "virtual-camera"
$Dll64      = Join-Path $CamDir "UnityCaptureFilter64.dll"
$Dll32      = Join-Path $CamDir "UnityCaptureFilter32.dll"
$Regsvr64   = Join-Path $env:SystemRoot "System32\regsvr32.exe"
$Regsvr32   = Join-Path $env:SystemRoot "SysWOW64\regsvr32.exe"   # 32-bit regsvr32 on 64-bit Windows
$VideoCat   = '{860BB310-5D01-11d0-BD3B-00A0C911CE86}'           # CLSID_VideoInputDeviceCategory
$Instance64 = "HKLM:\SOFTWARE\Classes\CLSID\$VideoCat\Instance"
$Instance32 = "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$VideoCat\Instance"

$exit = 0

function Test-CameraRegistered($hivePath, $name) {
  if (-not (Test-Path $hivePath)) { return $false }
  foreach ($k in Get-ChildItem $hivePath -ErrorAction SilentlyContinue) {
    $fn = (Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue).FriendlyName
    if ($fn -eq $name) { return $true }
  }
  return $false
}

# The UnityCapture DLL registers its own CLSID but does NOT add itself to the
# DirectShow video-capture category Instance list, which is what calling apps
# (Zoom/Teams/OBS/Discord) enumerate. Without that entry the camera is invisible
# no matter how many times regsvr32 "succeeds". We locate the filter CLSID by the
# DLL it loads from (name-independent) and write the category entry ourselves.
function Find-FilterClsid($dll, $hiveRoot) {
  if (-not (Test-Path $dll)) { return $null }
  $target = [System.IO.Path]::GetFullPath($dll)
  foreach ($k in Get-ChildItem $hiveRoot -ErrorAction SilentlyContinue) {
    $ip = Join-Path $k.PSPath 'InprocServer32'
    if (Test-Path $ip) {
      $v = (Get-ItemProperty $ip -ErrorAction SilentlyContinue).'(default)'
      if ($v) {
        try { if ([System.IO.Path]::GetFullPath($v) -ieq $target) { return $k.PSChildName } } catch {}
      }
    }
  }
  return $null
}

function Set-CategoryInstance($instanceHive, $clsid, $name) {
  if (-not $clsid) { return $false }
  $key = Join-Path $instanceHive $clsid
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  Set-ItemProperty -Path $key -Name '(default)'   -Value $name   -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $key -Name 'FriendlyName' -Value $name   -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $key -Name 'CLSID'        -Value $clsid  -ErrorAction SilentlyContinue
  return $true
}

function Remove-CategoryInstance($instanceHive, $name) {
  if (-not (Test-Path $instanceHive)) { return }
  foreach ($k in Get-ChildItem $instanceHive -ErrorAction SilentlyContinue) {
    $fn = (Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue).FriendlyName
    if ($fn -eq $name) { Remove-Item $k.PSPath -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Invoke-Regsvr($exe, $dll, [switch]$Remove) {
  if (-not (Test-Path $exe)) { return 127 }
  if (-not (Test-Path $dll)) { return 126 }
  $u = if ($Remove) { "/u " } else { "" }
  $arg = "/s $u/i:`"UnityCaptureName=$CameraName`" `"$dll`""
  $p = Start-Process $exe -ArgumentList $arg -Wait -PassThru -WindowStyle Hidden
  return $p.ExitCode
}

# ── VIDEO: Stream Studio Camera (UnityCapture DirectShow filter) ──────────────
if (-not $NoVideo) {
  if ($Uninstall) {
    Write-Step "Unregistering '$CameraName'..."
    Remove-CategoryInstance $Instance64 $CameraName
    Remove-CategoryInstance $Instance32 $CameraName
    [void](Invoke-Regsvr $Regsvr64 $Dll64 -Remove)
    if (Test-Path $Regsvr32) { [void](Invoke-Regsvr $Regsvr32 $Dll32 -Remove) }
    if (Test-CameraRegistered $Instance64 $CameraName) { Write-Bad "64-bit camera still present"; $exit = 1 }
    else { Write-Ok "Camera unregistered." }
  }
  else {
    if (-not (Test-Path $Dll64)) {
      Write-Bad "Missing $Dll64 - cannot register virtual camera."
      $exit = 1
    } else {
      # 64-bit (covers Zoom, Teams, Chrome, Discord, OBS, etc.)
      Write-Step "Registering 64-bit '$CameraName'..."
      $c64 = Invoke-Regsvr $Regsvr64 $Dll64
      $clsid64 = Find-FilterClsid $Dll64 'HKLM:\SOFTWARE\Classes\CLSID'
      if ($clsid64) { [void](Set-CategoryInstance $Instance64 $clsid64 $CameraName) }
      if ($clsid64 -and (Test-CameraRegistered $Instance64 $CameraName)) {
        Write-Ok "64-bit camera registered and VERIFIED in DirectShow (CLSID $clsid64)."
      } else {
        Write-Bad "64-bit registration failed (regsvr32 exit $c64, clsid $clsid64) or device not found in registry."
        $exit = 1
      }

      # 32-bit (covers older 32-bit calling apps) - best effort
      if (Test-Path $Regsvr32) {
        if (Test-Path $Dll32) {
          Write-Step "Registering 32-bit '$CameraName'..."
          $c32 = Invoke-Regsvr $Regsvr32 $Dll32
          $clsid32 = Find-FilterClsid $Dll32 'HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID'
          if ($clsid32) { [void](Set-CategoryInstance $Instance32 $clsid32 $CameraName) }
          if ($clsid32 -and (Test-CameraRegistered $Instance32 $CameraName)) {
            Write-Ok "32-bit camera registered and VERIFIED."
          } else {
            Write-Warn2 "32-bit registration incomplete (regsvr32 exit $c32, clsid $clsid32). 64-bit apps still work."
          }
        } else {
          Write-Warn2 "32-bit DLL not found; skipping 32-bit registration."
        }
      }
    }
  }
}

# ── AUDIO: VB-Audio Virtual Cable ("Stream Studio Microphone") ────────────────
if (-not $NoAudio) {
  $vbSetup = Join-Path $Root "VBCable_Setup_x64.exe"
  if (-not (Test-Path $vbSetup)) { $vbSetup = Join-Path $Root "VBCABLE_Setup_x64.exe" }

  if ($Uninstall) {
    Write-Warn2 "VB-Cable is not removed automatically (shared system audio driver)."
    Write-Host "      Uninstall it from 'Apps & features' > 'VB-CABLE Virtual Audio Device' if desired."
  }
  else {
    $already = Test-Path "HKLM:\SYSTEM\CurrentControlSet\Services\VBAudioVACMM"
    if ($already) {
      Write-Ok "VB-Cable audio driver already installed."
    } elseif (Test-Path $vbSetup) {
      Write-Step "Installing VB-Audio Virtual Cable (Stream Studio Microphone)..."
      $p = Start-Process $vbSetup -ArgumentList "/VERYSILENT","/NORESTART","/SUPPRESSMSGBOXES" -Wait -PassThru
      Start-Sleep -Seconds 3
      if (Test-Path "HKLM:\SYSTEM\CurrentControlSet\Services\VBAudioVACMM") {
        # Friendly endpoint names shown to calling apps
        $params = "HKLM:\SYSTEM\CurrentControlSet\Services\VBAudioVACMM\Parameters"
        if (Test-Path $params) {
          Set-ItemProperty $params -Name "DeviceName"    -Value "Stream Studio Microphone" -ErrorAction SilentlyContinue
          Set-ItemProperty $params -Name "DeviceNameOut" -Value "Stream Studio Speaker"    -ErrorAction SilentlyContinue
        }
        Write-Ok "Audio driver installed and VERIFIED."
      } else {
        Write-Bad "Audio driver install did not register the VBAudioVACMM service (exit $($p.ExitCode))."
        $exit = 1
      }
    } else {
      Write-Warn2 "VBCable_Setup_x64.exe not found next to this script; skipping audio."
    }
  }
}

Write-Host ""
if ($exit -eq 0) { Write-Ok "Done. Restart any calling app (Zoom/Teams/Chrome) to see the new devices." }
else             { Write-Bad "Completed with errors (exit $exit). See messages above." }
exit $exit
