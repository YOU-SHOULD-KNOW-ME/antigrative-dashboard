# Antigrative Dashboard v0.8.8

Traditional Chinese support across App, IDE and CLI, with consistent language selection and persistent preferences.

## Traditional Chinese — PR #18

Thanks to @Lorin1470 for contributing the Traditional Chinese localization in [PR #18](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/pull/18).

- Add localized Traditional Chinese labels for speed, cache, context, shared quotas, Token usage charts, onboarding, update progress and errors.
- Keep English / 简体中文 / 繁體中文 directly available at the bottom of context details. The side panel and usage window use an explicit three-choice language menu, with keyboard navigation and Escape dismissal.
- Remember `zh-TW` through restarts and independent onboarding writes. Keep English as the first-use default and retain existing English/Simplified selections.
- CLI accepts `--language zh-TW`, or follows the saved desktop preference when no override is supplied. Preserve CJK terminal width handling and existing cache/quota behavior.

## Additional integration fixes

- Use English translation fallback rather than accidentally showing Traditional text in English. Localize unknown backend errors safely.
- Preserve the bilingual first-use discovery flow and the existing UTC+8 Token accounting boundaries. Language selection changes presentation, never recorded totals.
- Avoid redundant guide DOM writes during polling, retaining stable context-card scroll position.
- Settle rejected statistics streams immediately before closing transport. A malformed projected JSON reply can no longer leave an RPC pending when request destruction emits no further error. Add a deterministic regression and bounded test diagnostics.
- Keep the current annual heatmap, model charts, responsive icon layout and theme adaptation.

## Installation

App / CLI: download `antigrative-dashboard-0.8.8.zip` and follow the included installer instructions. Existing App users can use **Context details → ⋯ → Check for updates**.

IDE: download `antigrative-dashboard-ide-0.8.8.vsix`, install from VSIX, then reload the IDE window. CLI-only installations use `python manage.py install-cli` (`python3` on Linux/macOS), optionally with `--language zh-TW`.

Existing statistics and preferences are retained. SHA-256 files are included for both packages.

## Verification

Local Windows checks: 228 Node tests passed (1 skipped), 57 Python tests passed (1 skipped), and 11 IDE unit tests passed. Browser checks cover App/IDE usage, the sandboxed side panel, three-language selection and restart persistence, narrow layouts, update UI, and large-chat open/close performance. The local App was verified with the new Traditional Chinese choice and unchanged preferences.

Automated Windows/Linux/macOS release gates run before publication. These checks do not establish signed-in Linux/macOS GUI acceptance.
