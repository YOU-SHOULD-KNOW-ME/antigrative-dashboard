# Antigrative Dashboard v0.8.11

Maintenance update: bound historical usage import so large conversation libraries
do not cause continuous scans or unbounded memory growth.

## Bounded history usage import

- Normal refresh processes at most 25 prioritized conversations and reports partial
  coverage; it does not scan a 1000+ conversation library indefinitely at startup.
- Full history import requires an explicit refresh and resumes in bounded slices
  with a wall-time budget.
- Local discovery is cached briefly. Candidate maps, trajectory summaries and
  retained pages are capped. Failed candidates, including delegated IDs without a
  local signature, use persistent exponential backoff.
- Repeated pagination offsets/pages stop immediately. Four focused regressions cover
  1000 synthetic conversations, retry backoff, repeated pages and full-scan resume.

Existing App users can choose **Context details → ⋯ → Check for updates** to
discover and install **v0.8.11**. The usage collector will show partial coverage
while older records remain pending. Settings, existing ledger data and the current
conversation remain available.

## Widget lifecycle fix

- Fix duplicate status strips seen after updating to Antigravity App 2.28.0:
  a disposed widget's delayed preference callback could mount an offline copy
  beside the live strip, leaving three extra icons and crowding the toolbar.
- Ignore delayed preference/layout callbacks after disposal. Before mounting,
  remove only identifiable leftover plugin strips; retain native controls.
- Add four browser lifecycle regressions to the cross-platform UI gate, covering
  delayed preferences, repeated replacement, absent/returning composers and
  orphan recovery, with working usage/context cards and native button targets.
- Windows App 2.28.0 was checked with saved conversations, Token usage, context,
  quotas and conversation switching. Linux/macOS and standalone IDE have shared
  browser/CI coverage; this patch does not claim new native GUI acceptance there.

After installation, **fully quit and reopen the
App once**: restarting only the plugin cannot remove callbacks already running
from old code. Settings and statistics are retained. Standalone IDE users should
install the matching VSIX and fully reopen the IDE.

## Updater reliability improvements

Includes the updater repairs from the previous v0.8.9 patch for
[#21](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/21).

- Fix a reproduced Windows update failure: the sidecar's parent command launcher
  can keep `sidecars/panel` locked even after Node moves its working directory.
  Windows now replaces verified public files atomically while preserving directory
  identities; the sidecar and Python worker also use a stable working directory.
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

If an older updater already fails during installation, it may still need one
manual install from `antigrative-dashboard-0.8.11.zip` using `python manage.py
install` (`python3` on Linux/macOS), then a complete App restart. A new version
number makes the update discoverable; it cannot retroactively repair an updater
that fails before the new files are installed. The existing v0.8.9 tag is retained.

Patch verification: 287 Node tests passed (1 skipped), 82 Python tests passed
(1 skipped), and 11 IDE unit tests passed locally. The new safety tests cover
1,000 synthetic histories, snapshot gating, delegated retry backoff, repeated
pages and bounded full-scan resume. The real Windows subprocess regression
upgrades 0.8.10 to 0.8.11 while the parent command launcher holds the runtime
directory. GitHub Release gates run before the assets are published.

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
  `antigrative-dashboard-0.8.11.zip` and run `python manage.py install`
  (`python3` on Linux/macOS). Completely reopen the App after a manual install.
- **Standalone IDE:** install `antigrative-dashboard-ide-0.8.11.vsix` via **Install
  from VSIX…**, then fully reopen the IDE.
- SHA-256 files are included for both packages.

## Verification and boundaries

The report's numeric example is covered by a synthetic regression:
980,101 own + 191,749 delegated = **1,171,850 tokens**. Tests cover nested/shared
children, cycles, duplicate requests, unavailable children, account/backend changes,
restart recovery, zero own usage, traversal budgets and independent ledger ingestion.

Verification includes the existing Node/Python/IDE suites and four widget
lifecycle regressions. Browser regressions cover App/IDE/panel
language switching, partial/loading/ready states, unchanged polling, use of the
selected agent's own rate/context, and long-chat usage-window behavior. Automated
Windows/Linux/macOS release gates run before publication.

The original reporter's signed-in Boost conversation was not available locally;
the exact scenario still benefits from their confirmation. Collection is bounded
and may report partial coverage when descendants cannot be read or a resource limit
is reached. See [accounting, privacy and limits](docs/USAGE.md).
