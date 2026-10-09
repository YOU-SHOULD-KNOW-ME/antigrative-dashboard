# Antigrative Dashboard v0.5.1

Automatic light/dark adaptation and clearer, compact README screenshots. Windows, Linux and macOS use the same portable ZIP.

## Install / update

Download `antigrative-dashboard-0.5.1.zip` and its `.zip.sha256`, verify the checksum and extract to a permanent directory.

Windows: `python manage.py install` (or `./install.ps1`).
Linux / macOS: `python3 manage.py install` (or `sh install.sh`). No sudo.

Fully quit and reopen Antigravity when no task is running. Default installation does not modify app.asar, and per-conversation history remains in the separate user data directory.

## Changes

- Toolbar controls, all hover cards, quota menus, progress indicators and warning colors follow Antigravity's theme. The app setting takes priority over the OS; standalone previews fall back to the system theme.
- Theme changes preserve statistics, the current card, quota-group menus and language selection. A shared palette/controller supports both the inline widget and the SDK side panel.
- Updated theme code replaces the previous controller without stacking widgets or leaving old listeners running.
- README artwork is cropped closely around the real controls and cards. English and Chinese pages each display one color theme, without duplicated light/dark screenshots.

## Compatibility and verification

Targets Antigravity **desktop App 2.21.1 / 2.22.0**, Python 3.10+, and the host's bundled Node with WebSocket (Node 24 recommended). Windows desktop 2.22.0 was verified with a real conversation and accepted by the user. Official Linux/macOS resource checks use desktop 2.21.1. Not the IDE/VS Code extension or iOS. macOS means Apple computers.

Browser checks cover light/dark switching, host priority over the OS, SDK background tokens, system fallback, listener disposal, text contrast, English/Chinese and context regressions. The local change and compact screenshots were accepted by the user. Publication requires Windows/Linux/macOS tests plus official Linux/macOS desktop resource and SDK checks.

Automated native Linux/macOS checks cover process/port discovery, lifecycle, app resources and SDK loading. Full signed-in host GUI verification on those platforms still requires user machines. Current Windows UI validation and future host API/DOM limitations are described in [COMPATIBILITY.md](COMPATIBILITY.md).

No conversation content, credentials, saved user statistics, host SDK/binaries or logs are included in the release.
