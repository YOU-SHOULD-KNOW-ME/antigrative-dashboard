# Changelog

## 0.6.3 — 2026-10-10

- Fix a small position jump when reversing a density transition: capture the currently painted copies before the flex layout changes, and retain source metadata for outgoing labels.
- Make intermediate-frame and reversal assertions deterministic using exact WAAPI times. Tighten reversal continuity to under 1px; keep continuous dragging, rapid switching and cleanup tests on real time.
- Includes the responsive motion and resize performance improvements below. v0.6.2 publication was blocked by the macOS motion gate; its existing tag is retained unchanged.

## 0.6.2 — 2026-10-10 (not published)

- Animate responsive full-statistics / three-icon changes with a 240ms interruptible transition: fade outgoing values, move the existing icon shapes and ease the native model name back into view. Keep icon hit targets active throughout.
- Clip inert motion copies away from native composer actions; immediately cancel on unsafe placement, navigation, reparenting or disposal. Preserve host layout styles and avoid replaying motion on metric polls or scrolling alone.
- Add production-renderer browser coverage for in-flight geometry, rapid reversal, outgoing-label cleanup, native hit targets and system reduced-motion feedback. Run `npm run preview:motion` for an interactive local demonstration.
- Fix resize-drag stutter and trailing motion copies: keep one animation clock per density change, clip the existing ribbon as the composer moves, capture visual pieces only for actual transitions, and avoid probing full layout repeatedly while shrinking. Use 12px of recovery headroom to prevent density chatter; retain the complete default transition.

## 0.6.1 — 2026-10-10

- Refresh immediately on parent/subagent navigation instead of inheriting the old polling clock or waiting for its in-flight request. Guard success, failure and cleanup by navigation generation, and avoid listing every conversation when an exact ID is supplied. Preserve queued manual refresh feedback.
- Add a subagent strip inside the host's stable input box, beside its static identity badge. Display current child throughput, cache and context; label detail cards as current subagent statistics and quotas as account-wide balances.
- Reduce narrow composers to three interactive icons (speed, cache and context), hiding only when those icons cannot fit safely. Keep language switching in the context card and restore full statistics when space returns.
- Fix controls disappearing during message scrolling: clipped or covered message controls are not visible collisions. Continue reserving local composer actions and protecting actually painted floating controls.
- Clear statistics immediately on parent/child navigation and reject late or mismatched conversation responses. Add English/Chinese browser coverage for child request ownership, late responses, quota scope and narrow layouts.
- Fix inline dashboard overlap with Agent Manager / Subagent window controls (issue #5). Require a horizontal action row adjacent to its editable composer; reject app headers, distant toolbars and unsupported layouts.
- Use bounded, shrinking inline sizing without changing the host model branch or raising the strip above neighboring buttons. Clip overflowing chips, compact when space is limited and hide the strip if it still cannot fit or intersects host controls.
- Recheck geometry after resize, scroll, host layout mutations and composer replacement; close open cards when placement becomes unsafe and restore the strip when space returns. Keep detail cards in the browser top layer.
- Add browser regressions for header rejection, English/Chinese widths, real control clicks, absolute-position collisions, recovery and preservation of host styles. This shared renderer fix applies to all desktop platforms; signed-in Linux/macOS GUI acceptance remains separate.

## 0.6.0 — 2026-10-10

- Add a standalone Antigravity CLI statusLine adapter: explicit context occupancy, current cache read tokens, agent state, grouped Gemini/Claude-GPT quotas and reset countdowns.
- Prioritize key values with foreground colors and bold text; show quota numbers and bars in green at ≥70% remaining, yellow at ≥30% and <70%, red below 30%, with a textual low-balance alert.
- Give the shared quota label distinct Claude (#DA7756) and GPT (#F8FAFC) foreground colors; use the default foreground for GPT when a light-background terminal hint is supplied.
- Support English/Chinese, CJK/emoji-aware terminal widths, narrow layouts, optional details and monochrome terminals without forcing the terminal background.
- Add independent install-cli/status-cli/uninstall-cli commands, atomic settings updates, recovery of the prior status line, safe reinstall and user-directory runtime storage that survives CLI binary replacement.
- Fix Windows agy Go/CMD quote transport using a literal-path UTF-8 PowerShell encoded invocation; retain POSIX shell quoting for Linux/macOS.
- Keep Unicode installation paths from failing after a successful install on redirected Windows consoles using legacy encodings.
- Include CLI modules in the portable release package and regression suites for payload validation, color thresholds, widths, language persistence, shell transport and lifecycle restoration.
- Add a real Windows CLI 1.3.2 two-turn conversation screenshot. Signed-in Linux/macOS interactive acceptance remains outstanding.
- Omit CLI tok/s and cache hit ratios because the documented input does not establish streaming duration or the needed cache denominator; missing values remain explicit and no transcripts or new metric history are read or stored.

## 0.5.2 — 2026-10-09

- Follow the host's custom background, card and foreground colors for chips, hover cards and quota menus; derive matching controls and tracks with readable text, and restore fallback colors when host tokens disappear.
- Locate localized composers through editable WAI-ARIA roles, stable model identifiers and the nearest DOM containment boundary, independent of send/record/cancel text (issue #4).
- Scope the model label to the selected composer; reject hidden or ambiguous candidates and reattach safely after composer replacement or reparenting.
- Follow the active Antigravity primary color for context rings and context/quota bars; use whitelisted custom dark/light theme seeds as a live configuration fallback (issue #3).
- Keep small emphasized text and refresh feedback readable under custom colors, and restore the default palette when a custom color is removed or invalid.
- Show manual refresh progress with a spinning icon and localized busy state; coalesce repeated clicks, honor reduced motion and queue a forced refresh behind background polling.
- Keep the selected quota group only in the hover card; remove the extra toolbar label when manually switching away from the current model's quota group.
- Keep quota-group clicks inside the widget so the host composer cannot steal focus and close the card; preserve menu selection, keyboard activation and outside-click dismissal.
- Correct macOS language-server logs to `~/Library/Logs/Antigravity/language_server.log`, retain a profile-path fallback and support an explicit `AG_PULSE_LOG` override (issue #1).
- Filter Windows standalone processes before one native `netstat` snapshot; match listening IPv4/IPv6 sockets to exact PIDs without per-process CIM port queries (issue #2).
- Serialize sidecar ownership claims and retire superseded processes; isolate instance bindings, ignore late responses/injections and keep old shutdown from disposing a newer widget (issue #2).
- Promote inline hover cards to the browser top layer so host jump-to-bottom controls cannot cover details inside composer stacking contexts.
- Save the English/Chinese preference in an atomic, app-independent user configuration file; changing host ports, reloading or restarting no longer loses it.
- Share the preference between the inline widget and side panel, migrate existing browser choices once and protect newer selections from stale startup/polling responses.
- Report failed language writes instead of silently treating browser-only storage as a successful save.
- Gate publication on Windows, Linux and macOS data/lifecycle tests, Chromium theme/localization/preference regressions and official Linux/macOS desktop resource/SDK checks. Browser fixtures do not replace signed-in host GUI acceptance.

## 0.5.1

- Follow the Antigravity light/dark theme for toolbar chips, all hover cards, quota menus and warning states; fall back to the OS in standalone previews.
- Share one palette and theme controller between the injected widget and native SDK panel; react to host classes, background tokens and live theme changes without resetting statistics.

- Crop README screenshots around the controls and cards; show a single color theme to avoid repeated artwork.

## 0.5.0

- Consolidate context, five-hour and weekly quotas into one hover card; keep only TPS, cache and context chips in the toolbar on every platform.
- Isolate the current renderer protocol from older sidecars that survive an app update, preventing stale context schemas from replacing valid occupancy readings.
- Add a Codex-style context occupancy ring and hover card to inline and sidecar views, with used/remaining percentages and used tokens versus capacity.
- Read the host's latest request-start context estimate; never infer model capacity or equate cumulative input with context. Unknown/over-capacity data stays explicit.
- Persist only whitelisted numeric context snapshots per conversation and account; allow occupancy to shrink after compaction and clear values when switching chats.
- Add native Windows/Linux/macOS profile and settings paths, PID-owned port discovery, SDK lookup, custom installation overrides and POSIX install/uninstall scripts.
- Run lifecycle and metric tests on all three OS runners, plus Linux/macOS official desktop resource/embedded-SDK checks. Release publication requires those checks.
- Preserve the plugin-owned reconnecting adapter and app.asar integrity protections. Linux/macOS signed-in GUI verification still requires a real user session.

## 0.4.0

- Replace default app.asar patches with plugin-owned runtime attachment; reconnect after app updates and renderer startup document replacement.
- Rediscover backend credentials and validate that the selected HTTP port belongs to the current standalone process.
- Persist numeric TPS/cache statistics per account and conversation with atomic writes, account isolation, and protection against empty/regressing metadata.
- Restore saved statistics with a timestamp when historical RPC data is unavailable; preserve real zero cache hits.
- Keep conversation collection working when quota/list endpoints fail; report storage failures without discarding live metrics.
- Replace old renderer hooks after plugin code updates and expose integration health in status/panel APIs.
- Add history backfill/restart verification and a documented robustness matrix.
- Default migration/uninstall never overwrites unverified application changes. Legacy loader remains explicit opt-in.

## 0.3.0

- Add a DSH-style Token usage card: total tokens, cache hit rate, uncached input, cache reads, output, and optional cache writes.
- Show compact token totals and cache hit rate next to TPS.
- Calculate cache hits from the local Antigravity normalized counters: cached reads divided by uncached input plus cache reads and writes.
- Make English the default UI language; add persistent English / Simplified Chinese switching for inline and sidecar views.
- Translate quota cards, timers, accessibility labels, and backend error states.
- Add cache counter and language-switch regression tests.

## 0.2.0

- Package Antigrative Dashboard as a standalone MIT-licensed project.
- Add install, enable, disable, status, uninstall and release packaging commands.
- Restore the original application on uninstall using verified archive backups.
- Keep the compact widget beside the model selector and hide unused TPS in new chats.
- Keep quota menus open across polling cycles.
- Show actual Antigravity session throughput and independent model-group quotas.
- Validate support for Windows Antigravity desktop 2.19.1 only.

## 0.1.0

- Initial local collector, sidecar panel, and inline toolbar adapter.
