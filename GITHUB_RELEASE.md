# Antigrative Dashboard v0.8.16

Address [#26](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/26): Antigravity IDE 2.6.0 changed its backend process from the older `language_server_* --subclient_type ide` form to the `agy --hub` form. The old adapter entered reconnecting state before it could attach the composer controls.

## What changes

- The standalone IDE adapter recognizes both the 2.5.5 language-server form and the 2.6.0 `agy --hub` form. Process selection remains tied to the renderer-owned IDE root, uses a bounded lineage check, and rejects ordinary `agy`, LSP, stale and ambiguous multi-instance candidates.
- Renderer CDP discovery and metrics discovery are independent. The three composer controls can mount while the local metrics service is temporarily unavailable; metric requests return an offline state and retry with the existing backoff.
- Windows and POSIX process discovery, helper lineage, renderer ownership, metrics failure and mount recovery now have regression coverage.

The 2.6.0 signed-in GUI still needs confirmation on a real installation after updating the VSIX.

The v0.8.15 long-conversation safeguards remain included: an oversized conversation can be distinguished from an empty conversation, supported sessions can complete in a bounded background worker, and incomplete data is never presented as a complete total.

## What changes

- The compact strip distinguishes **Completing statistics** and **Statistics limited** from an empty conversation. Details explain the affected budget on demand. Valid last-complete statistics are retained and labelled; an incomplete prefix is never presented as a complete total. Account quotas can continue updating independently.
- On a supported host, ordinary per-conversation retained-field or serialized-statistics budget failures enqueue a background worker automatically. It streams projected records with backpressure, writes temporary statistics and indexes to local disk, and uses bounded SQLite storage for request deduplication, model-rate classification and overlapping tool times. It does not retain prompts or tool-result text. A completed, revision-checked result appears on the next normal poll without a manual refresh.
- Rate/Token/cache data for the selected conversation and recorded usage are committed only after successful reading and validation. If child-agent statistics have not been verified, the UI explicitly identifies current-agent-only values rather than displaying an old aggregate as current. Previous verified task totals are retained for recovery.
- Background work is limited to one acquisition worker per backend with bounded queues, per-record, memory and disk guards. Foreground metrics do not wait for another conversation's queued ledger import; actual responsiveness still depends on the host and disk. Failed acquisition or ledger writes preserve prior records and retry with backoff; account changes and lost ownership cancel stale work.
- When a host summary does not change, occasional low-priority revalidation catches late request metadata; manual refresh has a cooldown. It does not start a full scan every poll.
- Large usage ledgers are processed off the foreground thread. A new per-conversation SQLite ledger takes precedence for that conversation; the previous JSON file is retained. Keep the SQLite file if downgrading: older versions cannot read it and may show older totals.

## Scope and limits

The automatic disk-backed path requires a host runtime with `node:sqlite` (Node 22.13+ or equivalent; Node 24 recommended). Unsupported runtimes keep the original safeguards and show that background completion is unavailable. A permanently unavailable API, malformed records, a single over-budget field, continuously changing history or insufficient disk space can still prevent completion.

Page checkpoints cover retries within a running task; unfinished work does **not** yet resume across a full App restart. Live usage observations still waiting in memory are not a durable journal: closing before they are written may require reading their source conversations again, and deleting those conversations first can make recovery impossible. A sudden termination can leave temporary files in the plugin's `collection-jobs` directory; a scratch-space guard stops unbounded repeated allocation. CPU, RSS and all filesystem use are not guaranteed by the JavaScript and SQLite cache limits. Existing user preferences, usage files and conversation records are not reset.

Windows/Linux/macOS automated release gates cover the worker, UI and installation paths. Local synthetic tests include a page above 8 MiB, background completion while another conversation and quota requests remain responsive, mixed JSON/SQLite usage and cancellation. These tests do not establish signed-in GUI acceptance on every OS or reproduce the reporter's exact 11,846-step conversation.

[Long-conversation details](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.8.16/docs/LONG_CONVERSATIONS.md) · [Compatibility](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.8.16/COMPATIBILITY.md)

## Install or update

- **Antigravity App:** context details → **⋯ → Check for updates**, or extract `antigrative-dashboard-0.8.16.zip` and run `python manage.py install` (`python3` on Linux/macOS).
- **Standalone Antigravity IDE:** install `antigrative-dashboard-ide-0.8.16.vsix` using **Install from VSIX…**.
- Fully quit and reopen the corresponding host after updating. No statistics reset is needed. SHA-256 files accompany both packages.
- If an older App updater rejects a relocated `.gemini` junction before downloading, use the release ZIP for a one-time manual install. Keep the junction and saved data.
