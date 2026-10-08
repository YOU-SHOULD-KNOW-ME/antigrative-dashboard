# Antigrative Dashboard v0.4.0

App updates no longer overwrite the default inline adapter. TPS and cache statistics persist separately for every conversation and account.

## Install / update

Download `antigrative-dashboard-0.4.0.zip` and its `.zip.sha256`, verify the checksum and extract to a permanent directory.

```powershell
python manage.py install
```

Fully quit and reopen Antigravity when no task is running. Default installation no longer modifies app.asar. Exactly verified legacy patches are safely migrated. Saved statistics remain in the separate sidecar data directory.

## Changes

- Runtime attachment discovers changing renderer ports, retries missed startup injection and replaces old hooks on plugin updates.
- Current backend credentials are paired with ports owned by the standalone process, fixing stale-token 401 errors.
- Atomic per-account/per-conversation history restores TPS and cache; empty or regressing data cannot erase useful samples.
- Saved values show a timestamp; real zero cache hits stay visible. Disk errors preserve live values and show a warning.
- Quota/list failures no longer block selected-conversation collection.
- `node tools/check-live-history.mjs` backfills recoverable metadata and checks restart restoration.
- Expanded tests and documented [robustness analysis](docs/ROBUSTNESS.md).

## Compatibility

Windows / Antigravity desktop 2.21.1 / Python 3.10+. Uses native Node, with built-in WebSocket for inline attachment. Future DOM, debugging, SDK or RPC changes may still need adaptation. The native side panel remains a fallback when the host SDK supports it.

No conversations, credentials, history records, host logs, SDK cache or application archive are included.
