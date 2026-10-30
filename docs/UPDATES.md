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

## Relocated user directories (Issue #23)

A user-owned ancestor such as `%USERPROFILE%\.gemini` may be a Windows NTFS
junction to another disk. The updater accepts both the configured path and the
physical module path supplied by Node when they resolve to the native App plugin
installation. The plugin directory itself, runtime entries, staging and recovery
directories must still be real directories, with no redirected files inside the
managed runtime. Installation, locking and recovery use the captured physical
directory, and recheck directory identity before filesystem changes. Recovery
journals bind to that installation; a changed destination is rejected.

Older sidecars may store their data inside `sidecars/panel/data`. In that case,
update backups are placed in `.antigravity-pulse-update-backups` beside the plugin
directory, so a backup cannot recursively copy itself into its source. The actual
data directory stays in place. Transaction and backup roots cannot overlap.

Local installation-path errors now have their own localized message instead of
appearing as an invalid package. A plan older than 15 minutes or superseded by
another installation asks for a fresh check. A failed or malformed worker reply
does not automatically rerun installation or promise that old files were kept;
check again to establish the installed version before retrying.

**Existing affected installations:** v0.8.12 and earlier can reject a junction
before contacting GitHub, so a new release alone cannot repair their online
updater. Install a package containing this fix once with `python manage.py install`
(`python3` on Linux/macOS), then completely reopen Antigravity. Use the App ZIP
from **v0.8.13** or later. Keep the `.gemini` junction and saved data; removing
either is unnecessary.

`npm run test:update-process` covers a real worker started through the Windows
command launcher (or POSIX subprocess), both logical and physical relocated paths,
and runtime-local data. Synthetic homes and packages keep these checks separate
from installed software and personal records.

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

**v0.8.12** completes the history-import protections and fixes the three runtime
problems reported in [#22](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/22):

- Opening **View token usage**, or clicking the usage window's top-right circular
  arrow **Refresh usage**, requests historical synchronization. Ordinary metrics
  polling, card refreshes and expired-quota refreshes do not request backfill in
  either App or standalone IDE.
- An import consumes a stable, bounded candidate queue across slices instead of
  rebuilding its source list every 250 ms. Deleted, temporarily unlisted or
  evicted IDs cannot leave an unreachable item that schedules work forever.
  New top-level conversations wait for the next requested pass; delegated children
  may join the current queue within its budget. Each attempted item makes progress,
  and unavailable records retain retry/partial status.
- Collection guards use a synchronous cached ownership boolean. File-change
  notifications invalidate it promptly, periodic checks remain the fallback, and
  request/write boundaries verify ownership asynchronously. Per-page guards do
  not create unawaited ownership reads or repeatedly read settings files.
- Queued usage and conversation-history writes recheck ownership/account state
  when they start and before commit, removing temporary files on cancellation.
  An atomic rename already handed to the OS cannot be recalled.
- Checkpoint metadata is limited to 4,096 entries and an 8 MiB read/write budget,
  is saved once per slice, and preserves persistent retry counts across restarts.
  An oversized legacy `backfill-v1.json` is retained as
  `backfill-v1.oversized-<uuid>.json` when bounded metadata is rebuilt; this does
  not delete the per-conversation usage ledger.
- A concurrent import cannot publish an old summary as the cache for a newer
  ledger revision. Candidate, page and memory/time limits retain partial coverage
  instead of implying that every historical record was read.

Current-conversation requests continue to be recorded during ordinary polling.
The collector preserves existing usage records and settings. Usage is local
observed consumption, not provider billing.

Install **v0.8.15** through **Context details → ⋯ → Check for updates**, then fully
quit and reopen the host once. A plugin-only restart cannot revoke old callbacks
already recreated in the open page. If an older updater already fails installation,
use `antigrative-dashboard-0.8.15.zip` for a one-time manual repair; standalone IDE
users should install `antigrative-dashboard-ide-0.8.15.vsix` and reopen the IDE.
Existing release tags remain available. No statistics reset or manual deletion of
checkpoint/ledger files is required for this upgrade.

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
