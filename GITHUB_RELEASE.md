# Antigrative Dashboard v0.8.14

Fix [#24](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/24): a subagent opened in the App sidebar could display the main conversation's statistics even after the widget moved to the subagent input. Full View worked because it used a different conversation-owner layout.

## Changes

- Resolve the sidebar conversation from its local message area and input. Support presentation wrappers without searching other panes or message contents. Speed, cache and context now follow the selected subagent; account quotas remain shared.
- Refresh promptly when focus moves between inputs. Keep delayed parent responses from overwriting child statistics, and preserve correct selection through subagent switches, Full View and sidebar closure.
- Fail closed when the local identity is missing, invalid, ambiguous or beyond the bounded DOM search budget. Do not substitute the main page's conversation ID.
- Keep unresolved inline requests quota-only instead of enumerating and reading the latest conversation. Standalone dashboard SDK/HTTP default selection remains unchanged.
- Bound both DOM traversal and its pending queue; skip transcript contents even for long conversations.

Existing statistics, settings and accounting rules are retained. The CLI behavior is unchanged. The shared widget's IDE path remains separate from App sidebar identity discovery.

## Install or update

- **Antigravity App:** context details → **⋯ → Check for updates**, or extract `antigrative-dashboard-0.8.14.zip` and run `python manage.py install` (`python3` on Linux/macOS).
- **Standalone Antigravity IDE:** install `antigrative-dashboard-ide-0.8.14.vsix` using **Install from VSIX…**.
- Fully quit and reopen the corresponding host after updating. No statistics reset is needed.
- If an older updater rejects a relocated `.gemini` junction before downloading, use the App ZIP for a one-time manual install. Keep the junction and saved data. Both packages include SHA-256 files.

## Verification

Local Node regression: **346 passed, 1 skipped**. English and Chinese sidebar browser fixtures use the production renderer and reproduce the original failure with the old source. They cover sibling/wrapped owners, focus changes, hidden/duplicate/invalid/missing owners, late responses, child switching, usage entry, Full View, initial loading and sidebar closure. Long-transcript and excessive-width/depth cases verify bounded ownership lookup. Existing Teamwork, subagent, widget-lifecycle and IDE browser regressions passed.

Windows/Linux/macOS automated release gates and official App 2.28.2 resource checks run before publication. Synthetic browser fixtures do not establish acceptance in the reporter's original conversation or signed-in native GUIs on every platform. The separate general 2.28.x missing-widget report is not claimed fixed by this release.

[Usage and subagent accounting](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.8.14/docs/USAGE.md) · [Compatibility](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.8.14/COMPATIBILITY.md)
