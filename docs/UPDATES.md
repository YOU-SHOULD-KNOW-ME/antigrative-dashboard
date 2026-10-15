# Manual App updates

Open the context card, choose **⋯ → Check for updates**. Checking starts only
after a click. It checks stable GitHub Releases, not commits on `main`, and does
not change the installed version merely because unpublished source has changed.

This adapter updates **Antigravity App only**. It does not install an IDE VSIX,
change a CLI status line, update Antigravity itself, or modify account settings.
Language, theme and usage data are retained. No transcript or account credential
is included in the public GitHub requests.

The update UI shows measured download bytes/percentage. Checking,
verification, extraction, backup and installation use an indeterminate bar;
they do not invent an overall percentage. The fill follows the host accent and
uses transform-only motion. A stage change does not animate a completed check
backwards into a new download. Worker progress is optional, bounded, allowlisted
metadata on stderr; the verified final result remains a separate stdout message.

## Verification before replacement

- Exact repository, stable version, App archive name and checksum asset binding.
- HTTPS host and redirect allowlist; CA and hostname verification remain enabled.
  A failed TLS handshake may retry once with TLS 1.2 for local proxy
  compatibility. Certificate verification failures never use that retry.
- Mandatory SHA-256 and exact declared byte count. Missing or invalid checksums
  stop the installation. SHA-256 detects inconsistent files; it is not an
  independent publisher signature if the release account itself is compromised.
- Bounded download, expanded size and entry count; unsafe paths, duplicate
  normalized paths, symlinks, Windows junctions, private runtime directories and
  a mismatched or incomplete manifest are rejected.
- No same-version reinstall or downgrade. A plan expires after 15 minutes and
  is checked again against the installed version before installation.

The limits are operational safeguards (64 MiB archive, 256 MiB expanded, 8,192
entries), not claims of universally safe memory limits. Exceeding them fails
before runtime replacement.

## Installation and recovery

An OS-backed lock prevents concurrent operations by the new updater and lifecycle
manager. It is released when a process exits, including forced termination.
The lock file remains on disk; its existence alone does not mean an operation is
running. Older third-party installers that ignore the lock cannot be coordinated.

The updater creates a full backup, stages the new runtime on the same filesystem,
and writes a recovery journal before replacing runtime trees. Ordinary failures
restore the previous runtime. Recovery failure retains the previous files,
backup, journal and a standalone recovery helper. A completed installation keeps
its external backup under the plugin data directory's `updates/backup-*` folder.

If an interrupted update left the App unable to start its plugin, use the saved
helper outside the replaced runtime. In PowerShell:

```powershell
$pluginTarget = Join-Path $env:USERPROFILE '.gemini/config/plugins/antigravity-pulse'
$recoveryHelper = Join-Path $env:USERPROFILE '.gemini/config/plugins/.antigravity-pulse-update-transaction/recover.py'
python $recoveryHelper recover --target $pluginTarget
```

On Linux/macOS:

```sh
python3 "$HOME/.gemini/config/plugins/.antigravity-pulse-update-transaction/recover.py" recover \
  --target "$HOME/.gemini/config/plugins/antigravity-pulse"
```

Recovery does not download or execute new release code. It restores the old
runtime from its saved snapshot. Do not delete the transaction directory while
recovery is needed. The new installer and uninstaller refuse to overwrite a
pending recovery journal.

After successful installation, **Reload plugin** restarts the plugin sidecar.
“Installed” verifies files/version; it does not claim the new runtime has already
passed a real conversation test. Unexpected future host changes, a broken future
release, power loss with filesystem corruption, or damaged/missing backup media
cannot be guaranteed recoverable by this mechanism.

## Validation scope

Windows tests force process termination before/after each of the four runtime
replacements, retry interrupted recovery, recover a missing main manifest using
the saved helper, exclude concurrent processes, and preserve synthetic user data.
Node and browser tests cover multiple install clicks, slow asynchronous checks,
expired plans, version changes, text-only release notes, reopening the dialog,
installation polling, reload, retry and both languages.

These tests do not represent macOS/Linux native acceptance or successful startup
of an arbitrary future Release. Version 0.8.7 includes this App-only updater;
installation and recovery tests use controlled packages and interruption points.
