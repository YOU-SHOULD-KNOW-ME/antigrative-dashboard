# Antigrative Dashboard v0.8.12

Fix the three runtime problems reported in [#22](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/22), and harden the related usage-storage paths. This maintenance release keeps the existing UI, settings and recorded statistics.

## Fixes for Issue #22

- **Finite history-import queues.** A full import now consumes a stable, bounded candidate snapshot across slices. Deleting a queued conversation, temporarily losing a discovery source or moving an old candidate beyond the discovery cap cannot leave an unreachable ID that schedules a 250 ms continuation forever. Queue entries make progress even when a read fails; unavailable records remain partial and retryable. New top-level conversations created during an import wait for the next requested pass, while delegated children may join the current queue within its budget.
- **The same explicit history gate in App and IDE.** Opening **View token usage**, or clicking its top-right circular-arrow **Refresh usage** button, requests historical synchronization. Ordinary metrics polling, ordinary card refreshes and automatic expired-quota refreshes do not start historical scans. The standalone IDE no longer bypasses this gate through `force` or a default snapshot option.
- **Synchronous ownership guards.** Collection and pagination guards use a cached boolean instead of treating an asynchronous `isOwner()` Promise as true. Marker notifications invalidate the cache promptly; periodic verification remains a fallback. Runtime boundaries still verify ownership asynchronously, concurrent checks are coalesced, and per-page guards no longer trigger ownership/settings disk reads. Superseded collectors reject late results and stop accepting new work.

## Related hardening

- Recheck collector/account validity when queued usage and history writes begin, after asynchronous work and immediately before commit. Cancel superseded writes normally and remove their temporary files. An atomic rename already handed to the operating system cannot be recalled.
- Save backfill checkpoints once per slice instead of rewriting the full journal after every conversation. Retain retry counters for histories without a local signature across restarts.
- Limit checkpoint metadata to **4,096 entries** and an **8 MiB read/write budget**. An oversized legacy `backfill-v1.json` is retained as `backfill-v1.oversized-<uuid>.json` when bounded metadata is rebuilt. This does not delete usage-ledger records or settings.
- Prevent a concurrent import from caching an older summary under a newer ledger revision. The next read can refresh the summary instead of keeping stale totals indefinitely.
- Retain partial coverage when a discovery, queue, page, memory or time budget is reached; never treat an unread or over-budget history as complete.
- Recheck file-marker generations before declaring ownership lost, avoiding false shutdown from overlapping notifications. Windows atomic marker replacement tolerates brief read locks with a bounded retry.

Current-conversation requests continue to be recorded during ordinary polling. The CLI status-line behavior is unchanged. Historical usage remains local observed consumption, not provider billing.

## Install or update

- **Antigravity App:** open context details → **⋯ → Check for updates**. Alternatively, extract `antigrative-dashboard-0.8.12.zip` and run `python manage.py install` (`python3` on Linux/macOS).
- **Standalone Antigravity IDE:** install `antigrative-dashboard-ide-0.8.12.vsix` using **Install from VSIX…**. This is separate from the App installer.
- Fully quit and reopen the corresponding host after installation. Keep using the IDE's loopback debugging launch arguments when required.
- Existing settings, language choices, `history-v1` and `usage-v1` are preserved. No manual deletion or statistics reset is required. SHA-256 files accompany both packages.

If an older updater already fails before new files are installed, use the release ZIP for a one-time manual App install. The earlier release tags remain available.

## Verification and limits

Local checks before publication:

- **Node:** 334 passed, 1 skipped.
- **Python:** 81 passed, 1 skipped (82 total).
- **IDE unit tests:** 11 passed.
- Related browser regressions passed, including the production App/IDE usage-entry refresh flow.

Tests exercise disappearing/deleted candidates, interrupted discovery, candidate-cap churn, finite continuation, retry restart recovery, bounded checkpoint migration, summary-revision races, actual App/IDE entrypoint gating and ownership takeover during queued writes. Existing history recovery, privacy and request deduplication remain covered.

Windows/Linux/macOS release gates run before assets are published. The local and browser results above do not establish signed-in native Linux/macOS GUI acceptance, every possible filesystem failure or the reporting user's exact environment. Marker notifications depend on filesystem support, so periodic verification remains necessary. The reporter's confirmation after upgrading is welcome.
