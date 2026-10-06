# Antigrative Dashboard v0.3.0

Adds a DSH-style Token usage card with cache hit rate, plus an English-first UI with persistent Simplified Chinese switching. The inline strip now shows total tokens and cache hits alongside tok/s, five-hour quota, and weekly quota.

## Download and install

Download `antigrative-dashboard-0.3.0.zip`, verify its matching `.zip.sha256` checksum, and extract it to a permanent directory.

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

## What changed

- Token total, cache hit percentage, uncached input, cache reads, output, and optional cache writes.
- Cache totals use Antigravity normalized input counters; writes are not hits.
- English by default; click EN / 中 to switch languages.
- Quota reset text and statistics cards switch immediately, without resetting your selected quota group.

## Compatibility

Windows / Antigravity desktop App 2.19.1 / Python 3.10+. The inline position requires a local loader adapter with an integrity-checked archive backup. Compatibility after app updates is not guaranteed, and unknown archive changes are never overwritten by the uninstaller.

This release includes no account credentials, conversations, host logs, SDK cache, or Antigravity application archive.
