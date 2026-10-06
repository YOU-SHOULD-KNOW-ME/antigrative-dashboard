$ErrorActionPreference = 'Stop'
$pulsePython = Get-Command python -ErrorAction SilentlyContinue
if (-not $pulsePython) { throw 'Python 3.10+ is required to restore the application safely.' }
& $pulsePython.Source (Join-Path $PSScriptRoot 'manage.py') uninstall
if ($LASTEXITCODE -ne 0) { throw 'Antigrative Dashboard uninstallation failed. Application changes were not overwritten.' }
