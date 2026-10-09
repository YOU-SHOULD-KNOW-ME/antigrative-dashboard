# Antigrative Dashboard v0.5.0

Context window occupancy joins tok/s, cache usage and quotas. The same plugin ZIP now supports Windows, Linux and macOS desktop installations.

## Install / update

Download `antigrative-dashboard-0.5.0.zip` and its `.zip.sha256`, verify the checksum and extract to a permanent directory.

Windows: `python manage.py install` (or `./install.ps1`).
Linux / macOS: `python3 manage.py install` (or `sh install.sh`). No sudo.

Fully quit and reopen Antigravity when no task is running. Default installation does not modify app.asar, and per-conversation history remains in the separate user data directory.

## New features

- **Context occupancy:** compact ring + usage percentage. Hover for used/remaining fractions, tokens/capacity, sampled model and data basis. English/Chinese labels.
- **Honest measurements:** use the host estimate at the latest request start. No invented capacity, no cumulative-token substitution, no claim of per-token streaming updates. Compaction can reduce occupancy.
- **Persistent context:** whitelisted numeric snapshots are saved per account/conversation. History fallbacks show their timestamp, and chat switching clears prior values immediately.
- **Native desktop platforms:** Windows CIM, Linux `/proc`, macOS `ps`/`lsof`; token and port must belong to the same standalone backend. Platform-native profiles/settings and SDK discovery.
- **Portable lifecycle:** POSIX scripts, custom app/profile overrides, one shared ZIP and three-OS CI. Official Linux/macOS desktop resources and embedded SDK are checked before release.

## Compatibility and verification

Targets Antigravity **desktop App 2.21.1**, Python 3.10+, and the host's bundled Node with WebSocket (Node 24 recommended). Not the IDE/VS Code extension or iOS. macOS means Apple computers.

Automated native Linux/macOS checks cover process/port discovery, lifecycle, app resources and SDK loading. Full signed-in host GUI verification on those platforms is not claimed; it requires Linux/macOS user machines. Current Windows UI validation and future host API/DOM limitations are described in [COMPATIBILITY.md](COMPATIBILITY.md).

No conversation content, credentials, saved user statistics, host SDK/binaries or logs are included in the release.
