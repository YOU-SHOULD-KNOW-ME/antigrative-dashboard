# Local Token usage

This feature supports Antigravity desktop and its standalone IDE. Each uses its own data directory and local trajectories. The CLI is unchanged.

Open the database/cache icon, then **View token usage**. Activity provides daily and weekly contribution grids. Usage details provides day, week, and month stacked bars with model filters. Both follow the existing language and host theme.

On first opening, a compact introduction explains local history import, missing/deleted history, the difference from account billing, UTC+8 date boundaries, and local-only numeric storage. **Got it** saves acknowledgment independently of language and the language tip. Closing the window does not acknowledge it. Failed saves keep the introduction visible with a retry message. The desktop and IDE store their own completion state with their other preferences. In normal use, theme/language changes do not repeat an acknowledged introduction.

Local acceptance builds can set `window.__agPulseUsageGuidePreview = true` before mounting the widget to replay the introduction after a language or theme change. This flag does not clear the ledger and is not set by the packaged collectors.

The account-level usage window stays open through composer reflows and replacement. A temporarily missing usage snapshot masks totals until data returns; changing accounts resets filters and replaces the displayed data. Closing the window restores the strip to the current composer.

The window uses a top-layer popover with dialog semantics, a backdrop and explicit keyboard/focus containment. This avoids Chromium's native modal inertness changes across an entire long chat, which can otherwise block both opening and closing. Escape, nested year menus, Tab/Shift+Tab, background pointer/scroll blocking, focus restoration and composer replacement are covered by browser regression tests. `tools/check-usage-performance.mjs` exercises a synthetic 20,000-element host without reading real conversation data.

Charts use continuous flat-color stacks, with rounded outer top corners and inset separators. Segment heights retain their exact proportions, including small values. Lightweight legends filter models on click and highlight them on hover; tooltips include model shares. Theme changes update model colors immediately.

Model colors are generated from the current host accent and actual background. An analogous hue scale and tonal variation keep stacked series harmonious; chart marks maintain at least 3:1 contrast against the background. Model colors remain consistent across filtering, charts, legends, tooltips and table rows within the current theme. Custom accent/background changes regenerate the palette immediately; provider colors are not fixed.

## Accounting

- Total = uncached input + cache reads + cache writes + output. Output already includes thinking.
- Repeated reads upsert request records. Matching request IDs across conversation records count once per account.
- Token usage is independent of TPS timing-quality exclusions.
- Request creation time determines the date. If unavailable, the matching planner step's creation time is used. Undated requests contribute only to the all-time total and are identified separately.
- Date grouping uses Asia/Shanghai and Monday-start weeks.
- Local trajectories are backfilled on startup, then checked every 60 seconds. The current conversation is also ingested during ordinary metrics polling. Manual refresh starts a backfill; the sync indicator remains until it finishes.
- History discovery uses IDs from the selected host's local `conversations/*.db` and `brain/<conversation-id>` directories as well as the API list. App and IDE roots are separate. Files only identify candidates; Token counters still come from the authenticated local API, not from parsing chat text or SQLite content. These records represent what that local host can read, not proof of the original account that created every historical file.
- Backfill uses the shared paginated reader, with its existing time and statistics-memory budgets and revision checks. An unlisted history is read until the interface returns no more steps/metadata. No partial page is marked as a complete import.
- A per-account `backfill-v1.json` checkpoint stores hashed conversation keys, source-change signatures and completion/retry state. Existing `usage-v1` records without this checkpoint are checked again, so an earlier partial import can be repaired. Database and WAL changes invalidate completion. Unchanged completed archives are skipped; failed ones retry with backoff. Manual refresh overrides both and is queued if a sync is already running.
- Collector restarts reuse checkpoints for settled histories with the same disk and host revision. Saved totals are shown while verification proceeds. A first temporary history-read failure is represented as synchronization/retry status; repeated unresolved failures, unreadable ledger files, missing Token components and persistence failures still retain their coverage diagnostics. A completed local import is not proof of provider-wide billing completeness.
- Archive work yields between conversations and continues in short batches. A single large conversation remains bounded by the reader's existing deadline; the batch interval is not a guarantee that every individual RPC finishes in that interval. Installation does not start a second ledger writer. The owning plugin process performs imports; disabling/stopping it or switching accounts/backends prevents the superseded import from continuing.
- Only available local records can be recovered. Deleted/unavailable conversations or missing usage fields may leave gaps. This is local observed usage, not the provider's billing or account-wide consumption.

## Storage and privacy

The new `usage-v1` directory is separate from `history-v1` (latest conversation statistics). It retains request time, model, Token counters and hashed request identities for historical accumulation, isolated by hashed account and conversation identifiers. It does not retain prompts, replies, account emails or credentials.

For the IDE it lives in `User/globalStorage/you-should-know-me.antigrative-dashboard-ide/usage-v1` under the IDE profile. Desktop history is not copied or mixed into IDE totals.

Deleting `usage-v1` clears this ledger, but available local trajectories will be backfilled again while the plugin is enabled. Files are written atomically; incomplete fetches do not remove previously saved requests. Unreadable files are reported and preserved.

## Verification

`node --test sidecars/panel/tests/usage.test.mjs sidecars/panel/tests/usage-backfill.test.mjs` checks persistence, deduplication, date attribution, account isolation, accounting, multi-page historical imports, repair of prior partial ledgers, source changes, restart checkpoints, retries, queued manual refreshes, ownership loss and background continuation. `tools/check-usage-ui.mjs` exercises desktop entry, both charts, model filtering/colors, polling stability, transient missing snapshots, composer hiding/replacement, language/theme, narrow layout and dismissal using explicitly synthetic fixtures that never enter the user's ledger.

The usage UI regression also verifies first-use copy in English/Chinese, acknowledgment persistence across renderer replacement, save failure/retry, normal versus local replay behavior, and hover auto-dismissal after leaving the usage window. Preferences and bridge tests cover independent acknowledgment and allowlisted writes.

Run `node tools/check-usage-ui.mjs --ide` for the same usage interactions using the IDE DOM adapter under enforced Trusted Types and its CSP. `tools/check-ide-ui.mjs` additionally exercises the native narrow composer and conversation ownership.
