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

## Widget lifecycle after host updates

A disposed widget could finish a delayed preference read and schedule a new
mount after its replacement had started. This left an offline icon-only copy
beside the working strip. The failure was reproduced in a browser fixture and
observed in Windows Antigravity App 2.28.0; host updates are not the only possible
trigger for this asynchronous lifecycle bug.

The widget now rejects preference/layout/mount callbacks after disposal and
cleans up identifiable leftover plugin strips before mounting. Native controls
and saved data are retained. Lifecycle regressions run in the shared UI gate.

## Bounded history usage import

Large local conversation libraries used to make the collector repeatedly build a
full candidate set and continue importing archives for a long time. A 1000+ history
library could keep the host API, disk ledger and Node heap busy even when the user
was only viewing the current conversation.

v0.8.11 changes the default behavior:

- normal refresh handles at most 25 prioritized conversations, favoring the active
  and recently modified sessions;
- full history import runs only after an explicit refresh and resumes in bounded
  slices with a wall-time budget;
- local directory discovery is cached briefly, candidate maps are capped, and
  failed candidates use persistent exponential backoff;
- trajectory summaries and pages have count/offset/progress guards, so a repeated
  host page stops quickly instead of looping;
- usage status reports partial coverage while older history remains pending.

The collector does not delete existing usage records. Full import can be continued
from the usage window's refresh action. This is local observed usage, not billing.

The widget fix is included in **v0.8.10**. The bounded history collector is
published in **v0.8.11**, which normal App update checks can discover from
v0.8.10. Install through **Context details → ⋯ → Check for updates**,
then fully quit and reopen the host once. A plugin-only restart cannot revoke
old callbacks already recreated in the open page. If an older updater already
fails installation, use the v0.8.11 release ZIP for a one-time manual repair;
standalone IDE users should use the matching VSIX. Existing v0.8.9 tags/releases
remain available, while v0.8.11 source archives contain the fix directly.

## Windows working-directory fix (Issue #21)

Windows can refuse to rename `sidecars` while the sidecar's parent `cmd.exe`
launcher has its current directory inside that tree. Moving Node alone does not
release the parent's directory handle. This produced a successful version check
followed by an installation error. Windows now atomically replaces public runtime
files while leaving directory identities intact. The sidecar and Python worker
also use the stable plugin root. The host launcher itself is not modified.

Old installations with this bug may fail before they can install the fixed
updater. Install a package containing the fix once using `python manage.py install`
and completely reopen the App. Existing language preferences and usage records
are retained. A failed old attempt does not imply data should be deleted.

Interpreter discovery checks Python 3.10+ before starting a worker. On Windows,
an unusable Store alias or old Python can fall back to `py -3` or `python3` during
this read-only check. Once an installation worker has started, a failure never
launches another installation automatically.

Network errors use short predefined messages for timeouts, DNS, certificate trust,
proxy connections and HTTP rejection. Locked/unwritable files and unavailable
Python have their own messages. Raw paths, proxy credentials, HTTP payloads and
tracebacks are not passed to the UI. Certificate/hostname verification stays on.
Windows static system proxies remain available when the environment contains only
`NO_PROXY`; explicit per-protocol environment settings still take precedence.
Checks share one 60-second network budget across the API and official-page fallback,
with a separate outer cancellation guard. This does not change system settings or
install any certificates. DNS resolution and operating-system scheduling can delay
cleanup; an installation is never killed in the middle of a filesystem swap.

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
and writes a recovery journal before replacing runtime files on Windows or runtime
trees on Linux/macOS. Windows records a validated file inventory, preserves private
data directories, removes obsolete public files, and commits the manifest last.
Recovery rejects linked/junction paths and layout conflicts before restoring any
file. Ordinary failures
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

Windows tests reproduce the full command-launcher/Node/Python chain, force process
termination before/after each runtime group and during file replacement, retry
interrupted recovery, reject junction escapes, recover a missing main manifest
using the saved helper, exclude concurrent processes, and preserve synthetic user data.
Node and browser tests cover multiple install clicks, slow asynchronous checks,
expired plans, version changes, text-only release notes, reopening the dialog,
installation polling, reload, retry and both languages.

These tests do not represent macOS/Linux native acceptance or successful startup
of an arbitrary future Release. Version 0.8.7 includes this App-only updater;
installation and recovery tests use controlled packages and interruption points.
