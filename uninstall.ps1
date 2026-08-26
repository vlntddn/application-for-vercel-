<#
  Removes Patente Pro from Windows.
  Study progress is kept by default — pass -Purge to delete it too.
#>

[CmdletBinding()]
param(
  [string]$Dir = $(if ($env:PP_HOME) { $env:PP_HOME } else { Join-Path $env:LOCALAPPDATA 'PatentePro' }),
  [switch]$Purge
)

$ErrorActionPreference = 'SilentlyContinue'
$dataDir = Join-Path $env:APPDATA 'PatentePro'
$binDir = Join-Path $Dir 'bin'

Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Patente Pro.lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Patente Pro.lnk') -Force

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -like "*$binDir*") {
  $cleaned = ($userPath -split ';' | Where-Object { $_ -and $_ -ne $binDir }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $cleaned, 'User')
}

Remove-Item $Dir -Recurse -Force

Write-Host 'Patente Pro removed.'
if ($Purge) {
  Remove-Item $dataDir -Recurse -Force
  Write-Host "Study progress deleted ($dataDir)."
} else {
  Write-Host "Study progress kept at: $dataDir"
  Write-Host "Delete it with: powershell -File uninstall.ps1 -Purge"
}
