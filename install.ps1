<#
  Patente Pro installer for Windows.

    irm https://raw.githubusercontent.com/vlntddn/application-for-vercel-/main/install.ps1 | iex

  To pass options to a script fetched this way:

    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/vlntddn/application-for-vercel-/main/install.ps1))) -Ref my-branch

  Installs into %LOCALAPPDATA%\PatentePro, adds a `patente-pro` command to
  the user PATH and creates Start Menu + Desktop shortcuts. No npm
  packages, no build step, no admin rights.
#>

[CmdletBinding()]
param(
  [string]$Ref = $(if ($env:PP_REF) { $env:PP_REF } else { 'main' }),
  [string]$Repo = $(if ($env:PP_REPO) { $env:PP_REPO } else { 'vlntddn/application-for-vercel-' }),
  [string]$Dir = $(if ($env:PP_HOME) { $env:PP_HOME } else { Join-Path $env:LOCALAPPDATA 'PatentePro' }),
  [switch]$NoDesktop
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor White }
function Warn($msg) { Write-Host "!   $msg" -ForegroundColor Red }
function Die($msg)  { Warn $msg; exit 1 }

# ---------------------------------------------------------------- Node check
Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Warn 'Node.js is not installed (version 18 or newer is required).'
  Write-Host '  Install it with:  winget install OpenJS.NodeJS.LTS'
  Write-Host '  Or download from https://nodejs.org'
  exit 1
}
$nodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 18) { Die "Node.js 18+ required, found $(& node -v)." }
Write-Host "    Node $(& node -v) - ok"

# ------------------------------------------------------------------- Download
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("patente-pro-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$src = Join-Path $tmp 'src'

try {
  Step "Downloading Patente Pro ($Ref)"
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    & git clone --depth 1 --branch $Ref --quiet "https://github.com/$Repo.git" $src
    if ($LASTEXITCODE -ne 0) { Die "Could not clone $Repo at ref '$Ref'." }
    Remove-Item (Join-Path $src '.git') -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    $zip = Join-Path $tmp 'source.zip'
    try {
      Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/zip/$Ref" -OutFile $zip -UseBasicParsing
    } catch {
      Die "Could not download $Repo at ref '$Ref': $($_.Exception.Message)"
    }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -ne 'src' } | Select-Object -First 1
    if (-not $extracted) { Die 'Archive did not contain the expected folder.' }
    Move-Item $extracted.FullName $src
  }
  if (-not (Test-Path (Join-Path $src 'server\index.js'))) {
    Die 'Download looks incomplete (server\index.js missing).'
  }

  # ------------------------------------------------- Integrity: SHA256SUMS
  # The table is part of the ref we just downloaded, so it describes exactly
  # these files. Refs that predate SHA256SUMS install without verification.
  if (Test-Path (Join-Path $src 'SHA256SUMS')) {
    Step "Verifying checksums (SHA256SUMS from $Ref)"
    $bad = @()
    foreach ($line in Get-Content (Join-Path $src 'SHA256SUMS')) {
      if (-not $line -or $line.StartsWith('#')) { continue }
      $parts = $line -split '\s+', 2
      $want = $parts[0].ToLower(); $rel = $parts[1]
      $full = Join-Path $src $rel
      if (-not (Test-Path $full)) { $bad += "missing: $rel"; continue }
      $got = (Get-FileHash $full -Algorithm SHA256).Hash.ToLower()
      if ($got -ne $want) { $bad += "mismatch: $rel" }
    }
    if ($bad.Count -gt 0) {
      Die ("Integrity check FAILED for ref '{0}': {1}" -f $Ref, ($bad -join ', '))
    }
    Write-Host '    sha256 of every listed file matches SHA256SUMS - ok'
  }
  if (-not (Test-Path (Join-Path $src 'bin\patente-pro.js'))) {
    Warn "Ref '$Ref' has no bin\patente-pro.js - it predates the desktop launcher."
    Write-Host '  Install a ref that contains it, e.g. -Ref claude/vibrant-gates-b12x31'
    exit 1
  }

  # -------------------------------------------------------------------- Install
  Step "Installing to $Dir"
  # Progress lives in %APPDATA%\PatentePro, so replacing the app folder is
  # safe. An older in-app storage\ folder is carried over just in case.
  $storageBackup = $null
  if (Test-Path (Join-Path $Dir 'storage')) {
    $storageBackup = Join-Path $tmp 'storage-backup'
    Copy-Item (Join-Path $Dir 'storage') $storageBackup -Recurse -Force
  }
  if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force }
  New-Item -ItemType Directory -Path (Split-Path $Dir -Parent) -Force | Out-Null
  Move-Item $src $Dir
  if ($storageBackup) { Copy-Item $storageBackup (Join-Path $Dir 'storage') -Recurse -Force }

  # ------------------------------------------------------------ CLI on the PATH
  $binDir = Join-Path $Dir 'bin'
  $shim = Join-Path $binDir 'patente-pro.cmd'
  @"
@echo off
node "%~dp0patente-pro.js" %*
"@ | Set-Content -Path $shim -Encoding ASCII
  Write-Host "    Command: $shim"

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$binDir", 'User')
    Write-Host '    Added to your PATH (restart the terminal to use it)'
  }

  # -------------------------------------------------------- Desktop integration
  if (-not $NoDesktop) {
    Step 'Creating shortcuts'
    $iconPath = Join-Path $Dir 'public\icons\patente-pro.ico'
    & node (Join-Path $Dir 'scripts\make-ico.js') (Join-Path $Dir 'public\icons\icon-256.png') $iconPath 2>$null | Out-Null

    $shell = New-Object -ComObject WScript.Shell
    $targets = @(
      (Join-Path ([Environment]::GetFolderPath('Programs')) 'Patente Pro.lnk'),
      (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Patente Pro.lnk')
    )
    foreach ($lnk in $targets) {
      $sc = $shell.CreateShortcut($lnk)
      # wscript + a .vbs stub keeps the console window hidden on launch.
      $sc.TargetPath = 'wscript.exe'
      $sc.Arguments = """$(Join-Path $Dir 'bin\patente-pro-silent.vbs')"""
      $sc.WorkingDirectory = $Dir
      $sc.Description = 'Italian driving theory trainer'
      if (Test-Path $iconPath) { $sc.IconLocation = $iconPath }
      $sc.Save()
      Write-Host "    $lnk"
    }

    @"
' Starts Patente Pro without showing a console window.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$Dir"
sh.Run "cmd /c """"$shim""""", 0, False
"@ | Set-Content -Path (Join-Path $binDir 'patente-pro-silent.vbs') -Encoding ASCII
  }

  Write-Host ''
  Write-Host 'Patente Pro installed.' -ForegroundColor Green
  Write-Host ''
  if (-not $NoDesktop) {
    Write-Host '  Launch it from the Start Menu or the desktop shortcut, or run:'
  }
  Write-Host '    patente-pro' -ForegroundColor White
  Write-Host ''
  Write-Host "  Update:    re-run this installer"
  Write-Host "  Uninstall: powershell -File `"$Dir\uninstall.ps1`""
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
