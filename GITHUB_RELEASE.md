# Antigrative Dashboard v0.8.9

Delegated subagent usage now contributes to the task's Token/cache summary.

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
