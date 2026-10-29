# Long-conversation collection (v0.8.5)

## History-library scheduling (v0.8.12)

Trajectory memory budgets protect one conversation read, but they do not by
themselves make a 1000-conversation backfill cheap. Ordinary metrics polling,
quota expiry and card refreshes do not initiate history import in either App or
IDE. Opening **View token usage** or clicking its top-right **Refresh usage**
button explicitly requests it. A full import captures one bounded queue and
consumes it in count/time slices; deleted or temporarily unlisted candidates
cannot strand a 250 ms continuation. New ordinary conversations are discovered
on the next explicit pass. Unreadable candidates retain retry state and saved
statistics. Repeated pages and stalled offsets stop immediately.

Local discovery, candidates, retry state and trajectory summaries are capped.
Checkpoint metadata is saved once per slice and limited to 4,096 entries with an
8 MiB file guard. An oversized legacy checkpoint is preserved for recovery before
bounded metadata is rebuilt; numeric usage records are retained. Resource limits
report partial coverage. Cached synchronous ownership checks do not read disk per
page; asynchronous verification and cancellation guards stop superseded work at
collection and persistence boundaries. See [usage accounting](USAGE.md).

## Acquisition

Statistics collection no longer calls `GetCascadeTrajectory`. It reads a conversation summary, then uses `GetCascadeTrajectorySteps` and `GetCascadeTrajectoryGeneratorMetadata` with their distinct offset fields. Generator requests explicitly set `includeMessages: false`. All host-provided pages are collected; an empty generator page signals the end. A known step count guards against incomplete step pages. Hosts without that count require an empty terminal step page.

The installed host schema has offsets, but **no requested page-size field**. A cold step page can still contain large text/tool results. We cannot promise a fixed network page size or a body-free step interface. The incremental JSON projector validates but skips those values as they arrive. It keeps token counts, request IDs, timestamps, context estimates and the minimal planner/tool presence needed to preserve timing classification. Lower step verbosity was tested but removed tool-call markers and changed timing-reason classification, so it is not substituted for the full step semantics.

No whole-response 512 MiB ceiling remains for successful trajectory/step/metadata streams. This does not imply unlimited work: the collector retains bounded statistics and still times out stalled or excessively slow requests.

## Incremental updates and correctness

- An unchanged settled conversation reuses its statistics, checks summaries on the ordinary refresh schedule and revalidates the last request after ten seconds. This catches late metadata updates even if the summary timestamp does not change.
- An appended/running conversation refreshes the newest mutable model record and steps, plus any earlier timed tool not yet completed. A submitted user input is skipped when re-reading that turn. Missing step associations trigger a conservative metadata reload.
- Changed settled histories, rewinds and an explicit manual refresh re-read the projected statistics. Prefixes are invalidated on account or endpoint changes. Concurrent reads coalesce. Failed or inconsistent pages cannot replace the last complete cached revision.
- Request deduplication, TPS classification, cache calculations, context sampling and usage-ledger identities are unchanged. Missing values remain unavailable; no total or rate is fabricated from an incomplete page.

## Resource policy and evidence

**8 MiB of serialized projected statistics** is the per-conversation and shared LRU-cache budget. The streaming parser separately accounts for strings/containers under an 8 MiB retained-field budget. These are engineering resource budgets, not transcript size, context capacity or exact heap guarantees. Inactive cached prefixes are evicted; an over-budget conversation reports that limitation instead of silently truncating its statistics. Response parser depth and individual scalar fields are bounded. Existing idle timeouts remain 12 seconds; each RPC and acquisition pass has a 30-second wall deadline. Non-statistical/error responses retain a separate 32 MiB response budget.

This budget was selected after isolated Windows/Node.js 24 local HTTP experiments on 2026-10-13. Memory samples include the artificial HTTP server in the same process, and peak sampling is approximate. The figures are observations on this machine, not performance guarantees across platforms. In particular, the tests do not establish an optimal budget.

| Artificial records | Discarded text | Retained serialized statistics | Sampled heap increase | Cold read |
| ---: | ---: | ---: | ---: | ---: |
| 1,024 | 0 MiB | 0.49 MiB | 5.63 MiB | 97 ms |
| 1,024 | 40 MiB | 0.49 MiB | 5.26 MiB | 321 ms |
| 1,024 | 640 MiB | 0.49 MiB | 4.98 MiB | 3,188 ms |
| 8,192 | 0 MiB | 3.95 MiB | 26.89 MiB | 481 ms |
| 16,384 | 0 MiB | 7.92 MiB | 47.67 MiB | 930 ms |
| 32,768 | 0 MiB | 15.85 MiB | 95.85 MiB | 1,623 ms before applying the 8 MiB budget |

With the 8 MiB budget, the 32,768-record case is explicitly rejected, leaving no partial prefix in the cache. A 640 MiB stream succeeds without retaining its text; subsequent idle reads download no step or generator pages. This shows why transcript-size caps are a poor substitute for retained-statistics budgets.

Reproduce the resource workload in an isolated process (synthetic input; no user files/accounts read):

```sh
node --expose-gc tools/check-trajectory-resources.mjs 0 1024
node --expose-gc tools/check-trajectory-resources.mjs 40 1024
node --expose-gc tools/check-trajectory-resources.mjs 640 1024
node --expose-gc tools/check-trajectory-resources.mjs 0 8192
node --expose-gc tools/check-trajectory-resources.mjs 0 16384
node --expose-gc tools/check-trajectory-resources.mjs 0 32768 --expect-budget-rejection
```

Signed-in Windows App verification compared every metric and usage record with a full reference fetch: identical across 27 requests. The full response was 2,814,686 bytes; cold direct reads totaled about 1.90 MB including the summary, and only about 33 KB of projected JSON remained. Repeated immediate idle collection made no additional RPC. This is one real conversation, not the reporting user's original long conversation. Signed-in Linux/macOS acceptance remains outstanding.
