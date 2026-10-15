# Changelog

## 0.8.7 patch — 2026-10-15

- Show measured download bytes and percentage in App updates. Use animated phase feedback for checking, verification, extraction, backup and installation; settle smoothly on completion and follow the host theme. A completed check does not animate backwards into a new download, and only the glyph rotates inside its stable icon surface.
- Keep optional worker progress separate from the verified final result. Bound/allowlist progress events, prevent backwards byte counts and keep unavailable progress consumers from failing an installation.
- Reuse verified disk/host checkpoints for settled histories after collector restarts, displaying saved totals while background checks run. Treat the first temporary read failure as synchronization/retry status. Repeated unresolved reads, unreadable ledgers, missing Token components and persistence failures retain coverage warnings.
- Refresh the existing v0.8.7 App/CLI ZIP, IDE VSIX and SHA-256 assets. Version numbers remain 0.8.7; same-version updates require manual reinstall. The original Git tag/source archive is retained; the refreshed release notes identify the patch source commit.

## 0.8.7 — 2026-10-15

- Integrate [#17](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/pull/17): discover historical IDs independently from the App/IDE conversation and brain directories, then read usage from the authenticated local API. Host directories and ledgers remain separate; custom IDE storage does not disable discovery.
- Repair prior partial imports using the shared paginated statistics reader, with existing memory/deadline/revision checks. Persist hashed per-account source signatures and completion/retry checkpoints, retry failed archives with backoff, retain queued manual full refreshes and yield short background batches. Installation no longer starts a separate ledger writer; previous statistics/preferences remain intact.
- Accept official SidecarApp SDKs without the optional `close` prototype method while still checking required exports and loopback binding.
- Eliminate long-chat usage-window open/close stalls caused by native whole-document modal inertness changes. Keep a top-layer dialog, backdrop, Escape, nested year menus, keyboard focus containment/return and composer-replacement recovery. Add a synthetic 20,000-element regression.
- Adopt only the manual App update feature proposed in [#16](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/pull/16). Entry: context details → bottom-right **⋯ → Check for updates**. Checks run only after a click; IDE/CLI and the host application are not update targets.
- Harden updates with exact official asset/version/path identity, required SHA-256 and download size, bounded extraction, link/duplicate-path rejection, coalesced concurrent actions, OS-backed lifecycle locking, durable backup/journals and independent interrupted-update recovery. Slow checks poll asynchronously; a narrowly scoped TLS 1.2 retry retains certificate/hostname validation.
- Preserve the annual heatmap, current model charts and compact controls. The hourly chart, cost estimation, component filters and unrelated layout changes in #16 are not included. CLI behavior is unchanged.
- Publish App/CLI ZIP and IDE VSIX with SHA-256 files. Windows local acceptance and synthetic/browser tests do not establish macOS/Linux signed-in GUI acceptance, future-release startup, physical power-loss or damaged-media recovery. See [usage](docs/USAGE.md) and [update boundaries](docs/UPDATES.md).

## 0.8.6 — refreshed packages 2026-10-15 (initial release 2026-10-14)

- Fix [#12](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/12): count readable uncached input, cache reads/writes and output independently of cache-rate eligibility. Keep conservative coverage, valid zero-input semantics, safe sums and restart recovery without deleting saved usage.
- Simplify Token/cache cards and the inline strip: remove repeated inequality prefixes, calculation prose and coverage-count paragraphs while retaining measured values and unavailable-value dashes. Detailed limits remain in the README.
- Simplify context cards: keep host occupancy, used/total tokens, sampled model, shared quotas/reset times and bottom language controls. Remove duplicate capacity references, unknown compaction fields and logged-text diagnostic UI. Provider references never replace the host denominator.
- Include reviewed #13 IDE process ownership and validated SDK compatibility, #14 context semantics, and #15 bounded optional transcript collection/rewind identity. Transcript diagnostics remain numeric backend data; unsupported compaction/image event cases have synthetic coverage only.
- Preserve the annual activity heatmap, existing model charts, responsive composer controls, statistics/preferences and CLI accounting. The withdrawn hourly drilldown and calendar selection highlight are not included.
- Rebuild the App/CLI ZIP, IDE VSIX and matching SHA-256 files under the existing v0.8.6 release. Align its tag/source archives with the checked build snapshot. The original version number is unchanged; local-only updater/backfill work under review is excluded.

## 0.8.5 — 2026-10-13

- Replace whole-trajectory polling with independent offset reads for steps and generator metadata (`includeMessages: false`), using summaries, cached immutable prefixes and revalidated mutable tails. Incrementally validate/project returned JSON without retaining prompts, attachments or tool output. Preserve tool-only classification rather than substituting reduced verbosity that loses tool-call markers.
- Remove the provisional 512 MiB whole-response cap for statistical streams. Use an 8 MiB projected-statistics/cache budget, bounded parsing and timeouts; ordinary/error responses remain separately bounded. Local synthetic 0/40/640 MiB and 1K/8K/16K/32K-record experiments underpin the budget and document its limits in [long-conversation collection](docs/LONG_CONVERSATIONS.md).
- Preserve offsets, request deduplication, usage identities and rate/cache/context values; invalidate caches on rewinds, settled edits, account/endpoint changes and manual refresh. Periodically recheck idle tails; failed pages cannot replace complete cached revisions. Real Windows metadata/usage parity and synthetic large-page regressions pass; the reporting user's exact conversation remains untested.

## 0.8.4 — 2026-10-13

- Redesign the App side panel as a persistent dashboard: three metric cards also select detail tabs, compact quota summaries stay visible, the default speed details remain open, and long details scroll within a fixed frame. Pointer departure no longer hides selected information; arrow/Home/End keyboard selection is supported. Shared metrics, preference storage and theme adaptation are retained.
- Version panel scripts and styles together from a content hash and serve uncached resources; align the hosted iframe background with its derived theme despite the SDK's inline body background. Prevent mixing new HTML with cached older code/styles during plugin updates.

- Address [#11](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/11): serve the sidecar panel as a self-contained classic script instead of loading ESM dependencies from plugin://. Defer the entry script, wait for DOM readiness, guard missing widgets and prevent duplicate initialization. Both the SDK and standalone preview use the same bundle generator.
- Add one asynchronous, hidden and time-bounded PID-filtered Get-NetTCPConnection fallback when Windows netstat has no listener for a candidate or fails. Recognize localized listening states and try the Windows .gemini log location as a fallback, retaining process/port ownership validation and explicit log overrides.
- Add Chromium checks for ordinary and early classic-script loading, opaque sandboxed iframe execution, metrics/cache/context/quota display, language/manual refresh, automatic recovery and duplicate scripts. Windows signed-in plugin:// verification reproduces the old uninitialized module panel and confirms the restarted classic/deferred panel, matching inline metrics, language switching and manual refresh. The reporting user's machine remains a separate acceptance scope.

## 0.8.3 — 2026-10-12

- Separate App RPC/application failures from endpoint loss. Missing historical trajectories, HTTP 4xx/5xx other than credential failures, and malformed responses no longer trigger process discovery. Coalesce concurrent discovery and back off failed cold starts from 3 seconds to a maximum of 30 seconds; transport/credential failures still recover automatically with bounded scans.
- Restore the data binding subscription after Runtime domain resynchronization and release abandoned bridge requests without disabling the widget. The v0.8.2 candidate was blocked by CI before package publication; the completed fix ships in v0.8.3.
- Track top-frame navigation and default execution contexts, including reversed event ordering. If hooks exist without a trusted main context, resynchronize Runtime events on the same socket. Navigation exceptions remove the failed session's preload before reconnecting. Keep remote/iframe contexts excluded.
- Add local HTTP regressions for history errors, cold-start/auth cooldown and backend restarts, plus real Chromium/CDP delayed-composer and interrupted-navigation coverage. The reporting user's exact environment and failure remain unverified; these tests do not establish the cause of every cold-start failure.

- Isolate pending-hover cancellation from fresh pointer entry in the composer-remount browser regression; retain the cold-hover and auto-dismiss assertions.

## 0.8.1 — 2026-10-12

- Address [#9](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/9) in the App runtime adapter: retain the widget during send/stop/cancel transitions, discover static Teamwork badges without title/span assumptions, and scope visible editors/model controls to their nearest composer owner. Ignore hidden/inert and deeper nested editors; reject ambiguous anchors.
- Recreate the usage controller after a closed-dialog composer teardown, rather than reattaching a strip whose dialog was already disposed. Invalidate pending requests from that mount. Context language choices update usage-entry labels immediately and keep the usage dialog localized. Desktop/IDE browser regressions cover temporary missing composers; English/Chinese Teamwork fixtures cover main/subagent return navigation and clickable localized usage windows after remount.
- Follow the active composer's nearest `data-cascade-id` when nested navigation leaves the route unchanged. Invalid explicit IDs clear conversation statistics rather than inheriting the parent route; late responses remain isolated. Add English/Chinese production-browser regressions for six nesting levels, working controls, DOM-only navigation and ambiguity. Windows signed-in three-level delegation checks cover independent metrics, return navigation and a generating-state screenshot. That host changes the route and renders one composer, so six-level DOM and unchanged-route coverage remain browser fixtures. User acceptance and Linux/macOS GUI checks remain open.
- Prioritize current-request cache-read percentage in the CLI status line, with read tokens as secondary text. Narrow terminals retain context/cache percentages before bars, read counts and state. Keep unknown counter semantics unavailable and expose the reason in allowlisted JSON.
- Calculate percentages only for empirically tested CLI/model counter scopes with zero cache writes; explicitly zero reads with valid nonempty input show 0%. Do not use output, cumulative totals, another request's percentage or desktop history.
- Enable nonzero Gemini 3.8 Flash (High) cache percentages on CLI 1.3.3 after diagnosing a real current-request snapshot with reads greater than input. Earlier previews omitted this model even when reads were available; short artificial Gemini tests returning zero do not establish nonzero-cache support by themselves.
- Do not report busy zero-cache snapshots as completed 0% hits. Thinking/working/tool/initializing with zero reads display `Cache --` without `0 read`; available nonzero reads remain usable while busy, and idle valid zero reads still show 0%. No percentage is borrowed from previous requests. Windows and Linux CLI regressions cover both languages and separate status-line processes.

## 0.8.0 — 2026-10-11

- Make English/Chinese agent installation prompts detect the host and require target confirmation before downloads/configuration changes. Distinguish App, CLI and standalone IDE; the shared ZIP does not mean the App installer should run for CLI users.
- Add local Token usage to the desktop App and standalone IDE: daily/weekly contribution grids, day/week/month model stacks, model filtering, full-count tooltips/tables, and a compact two-column Today / This month cache-card entry. Theme-driven model colors follow custom accent/background changes.
- Keep the usage frame stable across month changes, empty data, missing snapshots, account switches and composer replacement. Use a themed year menu and aligned controls; manual refresh queues behind polling and completes a visible rotation.
- Explain local history import, UTC+8 date boundaries, coverage/billing limits and storage on first opening. Persist acknowledgment independently of language; save failures stay visible and retryable. Local replay controls are excluded from packaged collectors.
- Address [#8](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/8): pair response tokens with their own stream durations, quarantine inconsistent token/retry/duplicate scopes and suspicious brief tool-only windows, and use a same-model median/MAD baseline for short outliers. Do not cap sustained high throughput or invent generation time. Token/cache/context counts remain available.
- Recalculate legacy saved TPS from complete trajectories, retaining other statistics and protecting full coverage from partial backend responses. An unreliable latest request stays unavailable rather than borrowing an older rate.
- Fix hover cards staying open after closing usage: pointer-restored focus no longer reopens or pins a card; keyboard focus and Escape return remain supported. Desktop/IDE regressions cover the full return-and-hover flow.
- Retain usage in a separate account-scoped `usage-v1` ledger, deduplicated by hashed request identity. No prompts, replies or credentials are stored. Available local history is backfilled; deleting chats does not erase already recorded consumption. Desktop and IDE ledgers stay separate; CLI behavior is unchanged.
- Refresh English/Chinese illustrations from the current production renderer and add activity/model-chart previews. Add usage-window/onboarding coverage to the Windows/Linux/macOS CI and release gates. Signed-in Linux/macOS GUI acceptance remains outstanding.

## 0.7.0 — 2026-10-11

- Add a dedicated VSIX adapter for Google's standalone Antigravity IDE. Keep host-specific DOM/conversation discovery separate from the shared renderer; narrow panes show three icons, wide panes expose values, and native controls retain their space.
- Bind each input to its actual conversation and the IDE main language server, excluding desktop/autocomplete/other-profile sources. New or unrecognized conversations do not inherit another chat's samples.
- Prefer response/message IDs when deduplicating model requests; execution IDs shared by tool follow-ups no longer collapse valid requests or lose cache reads.
- Build fixed templates with DOM operations under existing Trusted Types policies. Avoid unchanged label/style/ARIA writes and max-height measurement oscillation so polling preserves card scroll, focus and open menus.
- Retain theme, language, first-use guide and per-account/conversation aggregate history. Gate extension activation and install helpers to Antigravity IDE; use only fresh health records.
- Add dependency-free VSIX packaging, SHA256 validation and an optional host-bundled-runtime install/launch/uninstall helper. Publish ZIP and IDE VSIX independently with checksums, after three-platform automated gates.
- Include merged PR #7 by @qwqZYLqwq: 250ms cold hover, immediate warm transitions, 120ms leave grace, 350ms warm window, guarded delayed callbacks and 16 browser regressions with deterministic macOS startup timing.
- Windows IDE 2.5.5 has real local acceptance. Linux/macOS IDE GUI acceptance remains open; other editor extensions and named/custom IDE profiles remain unsupported. Existing desktop screenshots are explicitly identified as desktop examples.

## 0.6.4 — 2026-10-10

- Address [#6](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/6): remove the duplicate toolbar language button; retain explicit English / 简体中文 choices at the bottom of context details. Add a compact bilingual first-use tip beside the context chip so users can find the setting despite the English default. Opening the tip locates and focuses the language choices without stealing focus on initial display.
- Persist guide completion independently of the renderer origin. Closing the tip keeps the current language; successfully choosing either language completes onboarding. Failed saves remain visible and retryable. Show the guide in the main composer only; existing saved language choices are retained.
- Protect native subagent labels and SVG sizes when the sidebar narrows the composer. Reserve their natural width, switch to three icons earlier, release all plugin flex space if the icons cannot fit, and restore full statistics when space returns. Avoid repeated full-layout probes and no-op class mutations during continuous dragging.
- Add first-use, dismissal, explicit language choice, save-failure retry, fresh-origin/backend persistence and native-label/icon geometry regressions.
- Refresh English/Chinese README and release artwork from the v0.6.4 widget, without the duplicate toolbar language button: full and icon layouts, separate subagent statistics, speed/cache details and combined context/quotas with language choices at the bottom. Use one color theme and compact two-column details; read the version from the manifest when regenerating images.
- Allow up to 30 seconds for the CLI shell-transport test on Windows CI, where cold CMD/PowerShell/Node startup exceeded the previous 10-second limit. Keep the exit-code and exact rendered-output assertions, with no automatic test retry. Desktop and CLI runtime behavior is unchanged.

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
