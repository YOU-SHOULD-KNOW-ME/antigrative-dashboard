<div align="center">

<img src="docs/assets/hero.png?v=0.8.0" width="100%" alt="Antigrative Dashboard v0.8.0: current speed, cache and context controls beside the input.">

# Antigrative Dashboard

Token throughput, cache hits and context usage in the model selector row. Hover over context for five-hour and weekly quotas too.<br>
Keep the summary visible. Hover for the details.

[![Version 0.8.7](https://img.shields.io/badge/version-0.8.7-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/host-Windows%20%7C%20Linux%20%7C%20macOS-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.21.1 / 2.22.0](https://img.shields.io/badge/Antigravity-2.21.1%20%2F%202.22.0-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[Preview](#preview) · [IDE](#antigravity-ide) · [CLI](#antigravity-cli-status-line) · [Install](#install) · [Enable or remove](#plug-and-unplug) · [Compatibility](#compatibility) · [FAQ](#faq) · [中文](README.zh-CN.md)

</div>

**v0.8.7 patch:** Add measured App update progress and faster usage startup; refreshed packages keep the same version and require manual reinstall for existing v0.8.7 users.

**v0.8.7:** Recover readable historical Token usage with complete pagination and retry checkpoints, remove long-chat usage-window stalls, and add hardened manual App updates. Annual heatmaps and current charts stay in place. [Release notes](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/tag/v0.8.7).

## Preview

<img src="docs/assets/responsive.png?v=0.8.0" width="100%" alt="Current three-icon layout in a narrow main chat and separate statistics beside a subagent input.">

<table>
<tr><th width="50%">Speed and cache</th><th width="50%">Context and shared quotas</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/speed.png?v=0.8.0" width="100%" alt="Current generation speed detail card"><br><img src="docs/assets/widget.png?v=0.8.0" width="100%" alt="Current token usage and cache detail card"></td>
<td width="50%" valign="top"><img src="docs/assets/context.png?v=0.8.0" width="100%" alt="Current context, five-hour and weekly quota details, with the saved-language control"></td>
</tr>
</table>

<table>
<tr><th width="50%">Daily and weekly activity</th><th width="50%">Usage by model</th></tr>
<tr>
<td width="50%"><img src="docs/assets/usage-overview.png?v=0.8.0" width="100%" alt="Current Token usage activity with daily and weekly contribution grids"></td>
<td width="50%"><img src="docs/assets/usage-details.png?v=0.8.0" width="100%" alt="Current model usage chart with day, week and month controls and theme-adapted colors"></td>
</tr>
</table>

<sub>Desktop widget screenshots with illustrative host layouts and data; these are not IDE screenshots. Main and subagent samples use separate statistics; quotas are account-wide. The 44% context sample uses the latest request-start estimate, not cumulative input. Language choices are at the bottom of context details.</sub>

**Keep working. The numbers are already there.**

| See the speed | Know your quota | Stay focused |
| --- | --- | --- |
| Weighted session TPS, last-request TPS, model and tool time, and time to first token. | Separate Gemini and Claude/GPT quota groups, with five-hour and weekly reset countdowns. | One compact strip beside the model selector. Hover for details; unused TPS stays hidden in new chats. |

### Small details that matter

- **Token usage, DSH-style.** Compact total tokens and cache hit rate; hover for uncached input, cache reads, output, and optional cache writes.
- **Context and quotas together.** A Codex-style usage percentage; hover for used/remaining fractions, tokens versus capacity, and both quota windows with reset times. Uses the host estimate for the latest request, never cumulative input tokens.
- **English or Chinese.** English by default, with one-click switching and a saved preference.
- **Language survives restarts.** The inline widget and side panel share an atomic user preference file (`AntigravityPulse/preferences.json`), independent of the host's changing local port.
- **Hover delay and instant transition.** First hover waits 250ms to prevent accidental popups; clicks and keyboard focus open immediately. Moving between metrics stays instant while a card is open or for 350ms after leaving the controls. Leaving early or replacing the conversation/composer cancels a pending popup.
- **Stable menus.** Quota-group menus stay open across polling cycles while countdowns continue ticking.
- **Actual account data.** Remaining quota comes from the account API, not an estimate based on text length. Expired windows do not automatically become 100%.
- **Conversation-aware.** Switch chats without carrying the previous chat's throughput into a new one.
- **Subagent-aware.** Show the current child's speed, cache and context beside its input box. Detail cards distinguish child statistics from shared account quotas. Navigation refreshes immediately; late results cannot overwrite another visit's data.
- **Teamwork compatibility (v0.8.1).** Keep the strip through send/stop/cancel transitions and support deeply nested static agent badges. Conversation IDs come from the current input's DOM owner when available, including switches without a URL change. Hidden/inert or deeper editors are ignored; ambiguous visible inputs/badges are not guessed. Six-level English/Chinese browser fixtures pass, including usage remount and context-to-usage language synchronization. Windows real three-level delegation was checked with independent metrics, return navigation and a generating-state screenshot; this host changed its URL at each level and rendered one composer. Same-URL/six-level DOM cases remain fixture coverage; signed-in Linux/macOS GUI checks are still pending.
- **Survives updates.** Plugin-owned runtime attachment reconnects after app updates, without modifying the application archive.
- **Persistent conversations.** TPS and cache statistics are saved separately for each conversation and account; reloads can recover saved statistics.
- **Compact-window support.** Full statistics reduce to three clickable icons (speed, cache and context) when space is limited. Hover or click for details; language switching stays available in the context card. The strip hides only if the icons cannot fit safely and restores when space returns. Message controls hidden behind the composer do not cause scroll flicker.
- **Discoverable language settings.** English is the default. A compact bilingual first-use tip beside context opens the English / 简体中文 choices at the bottom of its detail card. Choosing a language or closing the tip saves completion, so it does not return on restart. Closing the tip does not change the language; failed saves offer a retry. Subagent composers do not repeat the tip.
- **Theme adaptation.** Controls, cards and quota menus follow Antigravity's light/dark mode and custom background, card, text and accent colors, with readable text and OS fallback in standalone previews. Live changes require no restart or conversation reload.
- **Local collection.** The collector talks to loopback endpoints. It does not upload your metrics to a third-party service.

## Antigravity IDE

**v0.7.0** adds a separate VSIX for Google's own standalone IDE. Download
`antigrative-dashboard-ide-0.8.7.vsix` from the release and choose **Install from VSIX…**
in the IDE's Extensions view. No desktop App installation is required.

Fully quit the IDE, then start it with
`--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`.
Add these flags to your IDE shortcut for subsequent launches. Narrow panes show
three icons; wider panes show values. Hover/click opens the same metric details.

Windows IDE **2.5.5** has been tested with real conversations. Linux/macOS IDE
have automated coverage; signed-in GUI acceptance is still outstanding.
VS Code, Visual Studio, JetBrains, Zed and Xcode integrations are not implemented.
See [IDE installation, update, diagnostics and data cleanup](ide/README.md).

## Antigravity CLI status line

Available in **v0.6.0**: an independent adapter for the official Antigravity CLI `statusLine` interface displays context occupancy, cache read tokens, state and grouped quotas, with English/Chinese and terminal-width adaptation. Remaining quota numbers and bars are **green ≥70%, yellow ≥30% and <70%, red <30%**. Preview: `node cli/statusline.mjs --preview`; install: `python manage.py install-cli` (Linux/macOS: `python3`). Requires Node.js 20+ and a CLI supporting the interface. Version 0.8.4 prioritizes current-request cache percentage for tested CLI 1.3.2/1.3.3 Sonnet 4.6 and GPT-OSS 120B counters, plus Gemini 3.8 Flash (High) on CLI 1.3.3, with zero cache writes; unknown cases stay unavailable. CLI tok/s needs streaming-duration data absent from the documented payload. See [CLI usage and rollback](docs/CLI.md).

![Real Antigravity CLI conversation with current-request cache percentage](docs/assets/cli-conversation.png?v=0.8.4-cli-1)

<sub>Real Linux Antigravity CLI 1.3.3 session after two English replies: current-request cache share 95.7%, 13.1K cached-read tokens; account email masked. macOS signed-in interactive acceptance remains outstanding.</sub>

## Install

The commands below install the **desktop App adapter**. IDE users should use the [separate VSIX instructions above](#antigravity-ide).

Supported: **Windows, Linux and macOS; Antigravity desktop App 2.21.1 / 2.22.0; Python 3.10+**. The same release ZIP works on all three systems. No third-party pip or npm packages are needed to install or run the plugin. The sidecar uses the app's bundled Node.js runtime. See [COMPATIBILITY.md](COMPATIBILITY.md) for the per-platform verification scope.

> The inline model-row position has no public plugin mounting API. A standard Antigravity sidecar now attaches the widget through the existing local renderer debugging endpoint. Default installation does not modify `resources/app.asar`. This is unofficial; future changes to the host DOM, debugging channel, SDK or metrics API may require an adapter update. The native side panel remains a fallback.

Download the ZIP from the [latest release](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/latest), extract it to a permanent folder, or clone the repository:

```powershell
git clone https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard.git
cd antigrative-dashboard
python manage.py install
```

On Linux / macOS, use `python3 manage.py install` or `sh install.sh` (and `python3` for the lifecycle commands below). Never run the installer with sudo.

Fully quit and reopen Antigravity. Open a conversation: the strip appears beside the model selector. PowerShell users can also run `./install.ps1`.

The installer copies and enables the plugin and restores any exactly verified legacy patch during migration. The runtime discovers the current renderer port and reconnects automatically. **Keep the extracted source folder** for enable, disable, update, and uninstall commands.

<details>
<summary><strong>Ask an agent to install it</strong></summary>

```text
Install and enable Antigrative Dashboard on this computer.
Repository: https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard
1. Read README.md, COMPATIBILITY.md, docs/CLI.md and ide/README.md. Inspect the OS,
   available executables, host versions and existing dashboard configuration with
   read-only checks. Distinguish desktop App, Antigravity CLI (agy) and standalone
   Antigravity IDE. The OS alone does not identify the target.
2. Before downloading an installation package or changing settings, summarize the
   detected hosts and ask me to confirm the target: App, CLI or standalone IDE.
   If several are present, let me choose one or more; if none is identified, ask
   for its executable path. Do not guess App when I say Linux or terminal.
3. Fetch the latest stable release metadata and report its plugin version, the
   host version/path and the selected adapter. The App and CLI share a ZIP, but
   their installation commands differ. The standalone IDE uses a separate VSIX.
   Download only assets for the confirmed target and verify SHA256. Keep the
   extracted source in a permanent directory. Do not install the host itself or
   upgrade, downgrade or replace it without separate confirmation.
4. Use Python 3.10+ (python3 on Linux/macOS) and the selected instructions:
   - App: check python manage.py status, then python manage.py install.
   - CLI: check agy --version and Node.js 20+, then python manage.py install-cli.
     Do not run manage.py install. Preserve any existing statusLine using the
     documented backup/override flow. CLI cache percentage is conditional; check
     docs/CLI.md for tested models/versions and unavailable values. Do not claim
     CLI tok/s or local usage charts: they are not available through this adapter.
   - Standalone IDE: install the release VSIX through Install from VSIX... or
     ide/manage.py install --exe <verified-IDE-executable> --vsix <release-VSIX>.
     It does not require the desktop App; do not run the App installer.
5. Preserve unrelated settings and saved data. If a restart or login is needed,
   tell me first and do not forcibly interrupt running tasks. For IDE launches,
   follow its documented loopback debugging flags. For CLI, start a new session.
6. Verify the selected adapter in its real host, and report plugin/host versions,
   target, path, checks actually performed, remaining steps and how to disable or
   uninstall that adapter. Never treat installing a ZIP as proof of CLI success.
```

</details>

## Plug and unplug

### Open the App side panel

Open the right auxiliary pane using its top-right toggle, then choose **+ → Extensions → Antigrative Dashboard** in that pane's toolbar. The panel keeps speed, cache, context and quota summaries visible. Click a metric card to select its detail tab; pointer departure does not hide it. Long details scroll inside a stable frame. Arrow/Home/End keys select tabs. The Token usage window opened from the input strip is a separate view.

Fully quit and reopen the App after updating plugin code so its collector loads the new modules. A panel that was already open may still be served by the previous collector until restart.

Run these commands from the project directory:

| Action | Command | What happens |
| --- | --- | --- |
| Install or update | `python manage.py install` | Copy runtime adapter; preserve other settings and saved statistics |
| Disable | `python manage.py disable` | Disable the plugin and hide the strip on its next poll |
| Enable | `python manage.py enable` | Start the plugin and show the strip again |
| Inspect | `python manage.py status` | Check installation, enabled state, and runtime attachment health |
| Uninstall | `python manage.py uninstall` | Remove this plugin; retain saved statistics and verified legacy backups |

First installation, plugin code updates, and uninstall require a full app restart. Enable and disable do not require reinstalling or rewriting the archive. `./uninstall.ps1` runs the uninstall command.

**Recovery files stay available.** Original archives live in `%LOCALAPPDATA%/AntigravityPulseBackups/<timestamp>/`. Uninstall retains backups and diagnostic logs. If the archive has unknown modifications, the uninstaller refuses to overwrite it.

`python manage.py install --panel-only` disables inline attachment and installs only the sidecar panel. It requires native UI Extensions to be available on the account and does not provide the inline strip.

The stable internal plugin ID remains `antigravity-pulse` for compatibility with earlier installations. The public project name is **Antigrative Dashboard**.

## How the numbers work

| Metric | Definition |
| --- | --- |
| Context window | Latest request-start `estimatedTokensUsed` / `maxContextTokens`; unknown capacity stays unavailable |
| Cache hit | Cached-read tokens divided by uncached input + cache reads + cache writes; token-weighted across requests |
| Token total | Normalized total input plus output tokens, including thinking output |
| Session TPS | Sum of response tokens from valid requests divided by their total streaming duration |
| Last-request TPS | Response tokens divided by streaming duration for the latest request; uncertain or missing timing stays unavailable |
| TTFT | Average time to first token; excluded from response streaming TPS |
| Model time | TTFT plus streaming duration across requests |
| Tool time | Union of tool execution intervals; overlapping time counted once |
| Five-hour / weekly remaining | Account-provided `remainingFraction`; not a currency balance |
| Reset countdown | Account-provided `resetTime` minus the current time |

Request metrics update after requests finish, with a poll about every 2.2 seconds. This is not a per-token instantaneous speed meter. Quotas refresh every 60 seconds; countdowns tick every second.
Antigravity normalizes `inputTokens` to uncached input even for Gemini; these are not upstream prompt-token counters. Cache writes are not hits. Compact cards show readable counters and use a dash for unavailable values. Calculation notes, request-coverage counts and inequality prefixes are kept out of the card. Internally, partial/unknown coverage remains tracked: readable sums may omit missing usage and are not a complete account bill; cache hit rate includes only validated input samples, and zero input has no ratio denominator.
Thinking tokens are separate. If a model does not expose response tokens, the detail card explains the all-output fallback. Requests without valid timing do not contribute to TPS. Missing or disconnected data is labeled accordingly.

### Timing quality

Very high TPS can occur when output arrives in a batch and the recorded stream lasts only milliseconds. A short receipt window may not represent actual model generation time. The plugin checks timing quality before adding a request to session TPS; it never caps speed or invents a longer duration.

- **Excluded from TPS:** invalid token scopes, conflicting duplicate request records, multiple differing attempt usages without matching timing, and nonfinite rates. A tool-only stream is also treated as uncertain when it lasts under 1 second, follows at least 2 seconds of TTFT, and TTFT is at least 20 times its stream duration.
- **Same-model check:** with at least five otherwise eligible samples lasting 1 second or more, a short sample above `max(8 × median, median + 12 × MAD)` is excluded. The baseline uses the same model, provider and token basis; MAD is the median absolute deviation.
- **Retained samples:** ordinary short text and sustained high speeds remain eligible. A high number alone is not enough to reject a sustained sample. Uncertain requests still contribute their reported token and cache usage; excluding their rate does not delete the request.
- **Display and saved data:** an uncertain latest request shows **Timing uncertain**, without substituting the preceding request's speed. If no samples qualify, TPS is unavailable. Old saved rates await recalculation from the complete local trajectory; token/cache/context data is retained. Reloading does not restore the old unvalidated TPS.

These are conservative checks on host timing summaries, not proof of buffering. The current local API does not expose a chunk timeline, so missing server generation time cannot be reconstructed. The interface keeps the calculation basis concise; filtering rules are documented here. Desktop and standalone IDE share these rules. See [timing policy and limitations](docs/TPS.md), informed by DSH discussions [#7960](https://github.com/deepseek-ai/deepseek-harness/discussions/7960) and [#6129](https://github.com/deepseek-ai/deepseek-harness/discussions/6129).

## Saved conversation statistics

Context occupancy uses the current request's host-reported window. The compact context card shows occupancy, used/total tokens, sampled model and both quota windows with reset times. Duplicate capacity references, unknown compaction fields, diagnostic text estimates and calculation paragraphs stay out of the card. The collector still keeps separate sourced references and conservative optional transcript diagnostics; neither changes the host denominator or billed usage. See [context limits and sources](docs/CONTEXT_LIMITS.md).

Completed-request TPS, cache counts and whitelisted context estimates are saved automatically in `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<account-hash>/<conversation-id>.json`. Reloading, restarting, updating or reinstalling the plugin preserves them. Empty or regressing backend data cannot erase a useful saved sample. Saved fallbacks show their saved time in the details. A real 0% cache hit remains 0%.

Records contain whitelisted statistics and model/status only; no prompts, titles, emails or credentials. The current account must be authenticated before its saved files are loaded. Already missing timing cannot be reconstructed. To backfill all conversations still available from the local API and check restart restoration, run `node tools/check-live-history.mjs` with Antigravity open.

## Long conversations

Statistics use separate step and generator-metadata offset reads, with messages disabled for generator requests. Large text/tool payloads are streamed and discarded; updates re-read mutable tails instead of the entire conversation. The former 512 MiB response cap is removed, while projected statistics retain a measured engineering memory budget. See [collection policy, experiments and limits](docs/LONG_CONVERSATIONS.md).

## Local Token usage

Open the cache/database icon, then **View token usage**. Today and this month share a compact two-column entry. Activity shows daily/weekly contribution grids; Usage details shows model stacks by day, week or month. Chart colors follow your actual theme and accent; K/M/B summaries use at most one decimal, while tables/tooltips retain full counts.

The first-use introduction explains history import, coverage and privacy. **Got it** saves completion across restarts, language changes and theme changes. Closing the window without acknowledgment keeps the tip for next time; a failed save can be retried.

Available local conversations are imported on startup and checked every 60 seconds. New completed requests are recorded during normal polling. The local `usage-v1` ledger deduplicates requests per account and keeps only time, model, Token counters and hashed identifiers; no prompts, replies or credentials. Desktop and IDE have separate ledgers. Deleting a chat does not subtract usage already recorded. This is observed local usage, not a provider bill; missing/deleted historical data may leave gaps. Days/months use UTC+8 and weeks start Monday.

Desktop: `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/usage-v1/` (the host may override the data directory). IDE: `User/globalStorage/you-should-know-me.antigrative-dashboard-ide/usage-v1/` under its profile. Stop the plugin before deleting its ledger; available conversations will be imported again when it restarts. `history-v1` remains the separate latest-per-conversation statistics store. [Accounting, cleanup and limitations](docs/USAGE.md).

## Compatibility

Desktop verified on **Windows 11 / Antigravity App 2.21.1 and 2.22.0**, including real context readings and the combined hover card. A separate VSIX supports standalone Antigravity IDE 2.5.5 on Windows. Other editor extensions and DSH are unsupported. Linux/macOS have automated checks; full signed-in desktop/IDE GUI verification is still open. See COMPATIBILITY.md.
Repository presentation is inspired by [DSH Rail Music](https://github.com/YOU-SHOULD-KNOW-ME/dsh-rail-music); installation APIs differ. `dsh plugin add` cannot install this project.

[Full compatibility and recovery details →](COMPATIBILITY.md)

### Language

Open context details and choose **English / 简体中文** at the bottom. The first-use bilingual tip points to this setting. The desktop adapter saves an atomic user preference shared with its side panel; the IDE saves its own preference in extension global storage. Both survive restarts. This changes dashboard labels, not the host app or model name.

## FAQ

<details><summary><strong>The strip did not appear after installation.</strong></summary>

Fully quit the main app process and reopen it. Run `python manage.py status`. Inspect `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/logs/sidecar.log` and `data/integration-state.json`. Review raw host logs for local information before publishing them.

</details>

<details><summary><strong>Why is TPS missing in a new conversation?</strong></summary>

There are no request metrics yet. TPS is hidden instead of showing the previous chat's speed. It appears after a model response finishes.

</details>

<details><summary><strong>Why do Gemini and Claude/GPT have different quotas?</strong></summary>

The service returns independent groups. The default follows the selected model. Inspect another group from a quota card; an explicit label prevents confusion after manually selecting a different group.

</details>

<details><summary><strong>What happens after an Antigravity update?</strong></summary>

App updates cannot overwrite the runtime adapter in the user plugin directory. It rediscovers ports, credentials and the renderer automatically. If the inline strip is missing, inspect `python manage.py status`; use the native panel while a changed host interface is adapted. Never copy an old app archive over a newer installation. See [robustness analysis](docs/ROBUSTNESS.md).

</details>

## Development and releases

```powershell
npm test
python -m unittest discover -s tests -v
python manage.py package
```

ZIP and SHA256 files are generated in `dist/`. Packaging uses an allowlist and excludes credentials, account settings, logs, SDK caches, and application archives.
Generating README images is an optional developer task: `node tools/build-readme-assets.mjs` requires Playwright (or an absolute `PLAYWRIGHT_MODULE` path). It renders the actual widget code with illustrative metrics and produces English/Chinese assets. This is not an installation dependency.

[Development guide →](docs/DEVELOPMENT.md) · [Changelog →](CHANGELOG.md)

## License

Source is available under [MIT](LICENSE). Antigravity binaries, SDK resources, and application backups are not distributed. Product names belong to their respective owners; this project is not affiliated with or endorsed by Antigravity.

## Manual App updates

Open **context details → bottom-right ⋯ → Check for updates**. The App-only updater checks stable official Releases after a click, verifies the archive and checksum, preserves settings/usage, and offers plugin reload after installation. Installation failures retain rollback/recovery material. IDE/CLI packages are installed separately. See [verification, recovery and limitations](docs/UPDATES.md).
