# Antigrative Dashboard v0.2.0

A DSH-inspired inline Antigravity widget for session tok/s, five-hour and weekly quota, and reset countdowns.

## Download and install

Download `antigrative-dashboard-0.2.0.zip`, verify its matching `.zip.sha256` checksum, and extract it to a permanent directory.

```powershell
cd antigrative-dashboard
python manage.py install
```

Fully quit and reopen Antigravity. The summary lives beside the model selector; hover for detailed statistics.

## Plug and unplug

```powershell
python manage.py disable
python manage.py enable
python manage.py status
python manage.py uninstall
```

## Compatibility

Windows / Antigravity desktop App 2.19.1 / Python 3.10+. The inline position requires a local loader adapter with an integrity-checked archive backup. Compatibility after app updates is not guaranteed, and unknown archive changes are never overwritten by the uninstaller.

This release includes no account credentials, conversations, host logs, SDK cache, or Antigravity application archive.
