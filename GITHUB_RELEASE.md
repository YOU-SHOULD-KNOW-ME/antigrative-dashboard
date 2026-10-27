# Antigrative Dashboard v0.8.9

Delegated subagent usage now contributes to the task's Token/cache summary.

## Same-version patch — 2026-10-27

The existing **v0.8.9** App ZIP and SHA-256 assets are refreshed to address
[#21](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/21).

- Fix a reproduced Windows update failure: the running sidecar's working directory
  locked `sidecars/panel`, so version checking succeeded but installation failed.
  Both the sidecar and Python update worker now use a stable working directory.
- Find a working Python 3.10+ before starting the worker, skipping unusable Store
  aliases or older interpreters. A started installation is never run again as an
  interpreter fallback.
- Correct Windows static-proxy discovery with `NO_PROXY`-only environments and
  align network time budgets. Certificate and hostname checks remain enabled.
- Show specific, localized failure categories for permissions/file locks, Python,
  timeout, DNS, certificate trust, proxy and HTTP/connection errors.
- Retain settings/statistics, package verification, backups and transaction rollback.
  The CLI status line and IDE feature behavior are unchanged; the release still
  provides both the App ZIP and IDE VSIX with their SHA-256 files.

**Install this patch manually once:** download the refreshed
`antigrative-dashboard-0.8.9.zip`, extract it and run `python manage.py install`
(`python3` on Linux/macOS), then completely exit and reopen Antigravity. The updater
does not offer same-version reinstalls, and an older updater affected by this bug
may not be able to install its own repair.

No new version or tag is created. The original v0.8.9 Git tag and automatic source
archives retain the original release snapshot. Use the current main branch or the
patch source commit linked below for this fix; the refreshed installation ZIP
contains the patch.

Patch verification: 282 Node tests passed (1 skipped), 72 Python tests passed
(1 skipped), and 11 IDE unit tests passed locally. The real Windows subprocess
regression first reproduces the directory-lock failure and retains the original
installation, then completes verified installation from the same initial working
directory with the fix. GitHub release metadata/downloads are fixtures in that
test; a local real check request also succeeded. Cross-platform Verify gates run
before the refreshed assets are published.

## Issue #20: delegated task accounting

Thanks to @zhenglan843-jpg for the detailed report and numeric example in
[#20](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/20).

- Include the selected agent and its reachable subagents in Token totals and the
  token-weighted cache ratio. The detail card shows **Current agent** and
  **Subagents (N)** contributions. Selecting a child shows that child's subtree.
- Keep TPS, model/tool time, request/step counts, sampled model and context tied to
  the selected agent. Five-hour and weekly quotas remain account-level values.
- Discover descendants using the host's structured parent/root metadata and
  legacy/modern `invoke_subagent` result IDs. Ordinary forks are not delegation.
- Read child statistics asynchronously with the existing pagination and memory
  guards. Deduplicate conversations and requests, handle cycles, retry failures,
  and preserve known totals through incomplete responses and reloads. Unloaded
  subagent usage is unavailable rather than a fabricated zero.
- Import each agent independently into daily/monthly usage. Visiting a child after
  its parent does not count the same request again. Historical backfill discovers
  unlisted children and rechecks earlier checkpoints once.
- Project only allowlisted statistics and relationship fields; embedded prompts,
  messages and tool-result text are discarded. Settings and existing ledgers are
  retained.

The change applies to the desktop App, standalone IDE and side panel in English,
Simplified Chinese and Traditional Chinese. Single-agent conversations initiate no
additional child RPCs. The CLI status line is unchanged.

## Install or update

- **App:** context details → **⋯ → Check for updates**, or extract
  `antigrative-dashboard-0.8.9.zip` and run `python manage.py install`
  (`python3` on Linux/macOS). Completely reopen the App after a manual install.
- **Standalone IDE:** install `antigrative-dashboard-ide-0.8.9.vsix` via **Install
  from VSIX…**, then reload the IDE window.
- SHA-256 files are included for both packages.

## Verification and boundaries

The report's numeric example is covered by a synthetic regression:
980,101 own + 191,749 delegated = **1,171,850 tokens**. Tests cover nested/shared
children, cycles, duplicate requests, unavailable children, account/backend changes,
restart recovery, zero own usage, traversal budgets and independent ledger ingestion.

Local verification: 275 Node tests passed (1 skipped), 57 Python tests passed
(1 skipped), and 11 IDE unit tests passed. Browser regressions cover App/IDE/panel
language switching, partial/loading/ready states, unchanged polling, use of the
selected agent's own rate/context, and long-chat usage-window behavior. Automated
Windows/Linux/macOS release gates run before publication.

The original reporter's signed-in Boost conversation was not available locally;
the exact scenario still benefits from their confirmation. Collection is bounded
and may report partial coverage when descendants cannot be read or a resource limit
is reached. See [accounting, privacy and limits](docs/USAGE.md).
