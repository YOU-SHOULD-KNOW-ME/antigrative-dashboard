param([switch]$PanelOnly)
$ErrorActionPreference = 'Stop'
$pulsePython = Get-Command python -ErrorAction SilentlyContinue
if (-not $pulsePython) { throw 'Python 3.10+ is required. Install Python, then run this script again.' }
$pulseArguments = @((Join-Path $PSScriptRoot 'manage.py'), 'install')
if ($PanelOnly) { $pulseArguments += '--panel-only' }
& $pulsePython.Source @pulseArguments
if ($LASTEXITCODE -ne 0) { throw 'Antigrative Dashboard installation failed. See the error above.' }
