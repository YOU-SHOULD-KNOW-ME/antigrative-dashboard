<div align="center">

<img src="docs/assets/hero.png?v=0.5.0-compact" width="100%" alt="Antigrative Dashboard v0.5: speed, cache and context beside the model selector.">

# Antigrative Dashboard

Token throughput, cache hits and context usage in the model selector row. Hover over context for five-hour and weekly quotas too.<br>
Keep the summary visible. Hover for the details.

[![Version 0.5.0](https://img.shields.io/badge/version-0.5.0-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/host-Windows%20%7C%20Linux%20%7C%20macOS-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.21.1 / 2.22.0](https://img.shields.io/badge/Antigravity-2.21.1%20%2F%202.22.0-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[Preview](#preview) · [Install](#install) · [Enable or remove](#plug-and-unplug) · [Compatibility](#compatibility) · [FAQ](#faq) · [中文](README.zh-CN.md)

</div>

## Preview

<img src="docs/assets/widget.png?v=0.5.0-compact" width="100%" alt="The latest three-control toolbar and its token cache hover card.">

<sub>Artwork uses illustrative data, not real account quotas or conversations. The installed widget reads metrics from your local Antigravity app. The widget defaults to English. Use the EN / 中 button to switch languages; your choice is saved.</sub>

**Keep working. The numbers are already there.**

| See the speed | Know your quota | Stay focused |
| --- | --- | --- |
| Weighted session TPS, last-request TPS, model and tool time, and time to first token. | Separate Gemini and Claude/GPT quota groups, with five-hour and weekly reset countdowns. | One compact strip beside the model selector. Hover for details; unused TPS stays hidden in new chats. |

### Small details that matter

- **Token usage, DSH-style.** Compact total tokens and cache hit rate; hover for uncached input, cache reads, output, and optional cache writes.
- **Context and quotas together.** A Codex-style usage percentage; hover for used/remaining fractions, tokens versus capacity, and both quota windows with reset times. Uses the host estimate for the latest request, never cumulative input tokens.
- **English or Chinese.** English by default, with one-click switching and a saved preference.
- **Stable menus.** Quota-group menus stay open across polling cycles while countdowns continue ticking.
- **Actual account data.** Remaining quota comes from the account API, not an estimate based on text length. Expired windows do not automatically become 100%.
- **Conversation-aware.** Switch chats without carrying the previous chat's throughput into a new one.
- **Survives updates.** Plugin-owned runtime attachment reconnects after app updates, without modifying the application archive.
- **Persistent conversations.** TPS and cache statistics are saved separately for each conversation and account; reloads can recover saved statistics.
- **Compact-window support.** Only three summary controls; quota balances and countdowns stay in the combined context hover card.
- **Local collection.** The collector talks to loopback endpoints. It does not upload your metrics to a third-party service.

### Context window

<img src="docs/assets/context.png?v=0.5.0-compact" width="100%" alt="Context usage and both five-hour and weekly quota details in one hover card">

<sub>Illustrative 44% sample. Uses the host estimate at the latest request start; capacity may be unavailable.</sub>

## Install

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
Goal: show tok/s, cache and context in the Antigravity model selector row;
hover context for its details and five-hour/weekly quotas with reset countdowns.

1. Read README.md and COMPATIBILITY.md. Verify Windows, Linux or macOS, Antigravity desktop
   (tested with App 2.21.1 / 2.22.0), and Python 3.10+. Do not upgrade, downgrade, or replace my app.
2. Clone or extract the project to a permanent directory.
3. Inspect python manage.py status, then run python manage.py install.
   Preserve other plugin settings and use the built-in backup validation.
4. Fully restart Antigravity. If a task is running, report the required
   restart and do not forcibly interrupt it.
5. Verify new-chat context entry, existing-chat TPS/cache/context, and the combined quota hover card. Leave the
   quota-group menu open across several polls and confirm it stays open.
6. Report the app version, installation result, runtime integration status, and what was
   actually verified on this machine.
```

</details>

## Plug and unplug

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
| Last-request TPS | Response tokens divided by streaming duration for the latest valid request |
| TTFT | Average time to first token; excluded from response streaming TPS |
| Model time | TTFT plus streaming duration across requests |
| Tool time | Union of tool execution intervals; overlapping time counted once |
| Five-hour / weekly remaining | Account-provided `remainingFraction`; not a currency balance |
| Reset countdown | Account-provided `resetTime` minus the current time |

Request metrics update after requests finish, with a poll about every 2.2 seconds. This is not a per-token instantaneous speed meter. Quotas refresh every 60 seconds; countdowns tick every second.
Antigravity normalizes `inputTokens` to uncached input even for Gemini; these are not upstream prompt-token counters. Cache writes are not hits. Cache details show unavailable or partial coverage when the provider counters are unsupported.
Thinking tokens are separate. If a model does not expose response tokens, the detail card explains the all-output fallback. Requests without valid timing do not contribute to TPS. Missing or disconnected data is labeled accordingly.

## Saved conversation statistics

Completed-request TPS, cache counts and whitelisted context estimates are saved automatically in `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<account-hash>/<conversation-id>.json`. Reloading, restarting, updating or reinstalling the plugin preserves them. Empty or regressing backend data cannot erase a useful saved sample. Saved fallbacks show their saved time in the details. A real 0% cache hit remains 0%.

Records contain whitelisted statistics and model/status only; no prompts, titles, emails or credentials. The current account must be authenticated before its saved files are loaded. Already missing timing cannot be reconstructed. To backfill all conversations still available from the local API and check restart restoration, run `node tools/check-live-history.mjs` with Antigravity open.

## Compatibility

Verified on **Windows 11 / Antigravity desktop App 2.21.1 and 2.22.0**, including real context readings and the combined hover card. Not an Antigravity IDE, VS Code, or DSH extension. Linux and macOS have native user paths, backend/port discovery and shell installers. Automated checks run on all three operating systems; full signed-in Linux/macOS GUI verification is still open. See COMPATIBILITY.md.
Repository presentation is inspired by [DSH Rail Music](https://github.com/YOU-SHOULD-KNOW-ME/dsh-rail-music); installation APIs differ. `dsh plugin add` cannot install this project.

[Full compatibility and recovery details →](COMPATIBILITY.md)

### Language

Click **EN** in the model row to switch to Simplified Chinese; click **中** to return to English. The sidecar panel has the same control. The selection persists in local site storage and updates other open views on the same origin. It changes dashboard labels, not the host app or model name.

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
