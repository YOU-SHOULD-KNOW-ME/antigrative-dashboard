# Antigrative Dashboard v0.8.13

Fix [#23](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/23): an App installed beneath a relocated user directory, such as a Windows `.gemini` NTFS junction, could not check for or install updates and incorrectly reported a package-verification failure.

## Update reliability

- Accept both the configured installation path and Node's resolved physical module path when they identify the same native App plugin. Preserve checks against linked plugin roots and runtime entries; bind installation, locking and recovery to validated physical directories and recheck directory identity before filesystem changes.
- Give local installation-path failures their own English, Simplified Chinese and Traditional Chinese messages instead of calling them invalid packages. Raw paths, proxy credentials and worker tracebacks are not exposed in the UI.
- Ask for a fresh check when an update plan expires or another instance changes the installed version. Retry no longer repeatedly applies the old plan.
- Do not automatically repeat an installation or claim the old version was retained when a worker result is missing or malformed. Recheck to establish the installed version.
- Prevent recursive backup copying when older sidecars keep their data inside `sidecars/panel/data`. Store those backups beside the installed plugin, preserve the actual data directory and reject overlapping backup/transaction paths.

Official download-source, SHA-256, package-version and archive-path checks remain enabled. Existing settings and recorded statistics are preserved. IDE and CLI packages retain their existing runtime behavior; this release's updater fixes apply to the desktop App.

## Install or update

- **Antigravity App:** context details → **⋯ → Check for updates**. Alternatively, extract `antigrative-dashboard-0.8.13.zip` and run `python manage.py install` (`python3` on Linux/macOS).
- **Affected Junction installations:** the old updater can fail before downloading this fix. Install the release ZIP manually once, then fully quit and reopen Antigravity. Keep the `.gemini` junction, settings and statistics; no deletion or reset is needed. Subsequent updates use the repaired updater.
- **Standalone Antigravity IDE:** install `antigrative-dashboard-ide-0.8.13.vsix` using **Install from VSIX…**, then reopen the IDE. This is separate from the App installer.
- Both packages include SHA-256 files. Existing release tags remain available.

## Verification and compatibility

Local checks: **340 Node tests passed, 1 skipped; 93 Python tests passed, 1 skipped**. The Python suite includes 12 real-Junction regressions. Three-language update UI checks and three real-process upgrade scenarios passed: a normal path, a logical Junction path, and a physical path with legacy runtime-local data. Manual repair preserved the Junction, private statistics, language preferences and unrelated plugin settings in an isolated test installation.

Windows, Linux and macOS release gates run the full test, UI and packaging checks before publication. The official host-resource gate now checks **Antigravity App 2.28.2** instead of 2.21.1.

The separate report that the widget disappears on 2.28.x has **not been reproduced**. Windows App 2.28.2 displayed the locally installed widget, and repository v0.8.12 collection code read live metrics; the installed widget manifest was v0.8.9, so this is not full v0.8.12 GUI acceptance. Official-resource checks do not establish signed-in GUI compatibility for every platform or the reporter's environment. Please include OS, App versus standalone IDE, the actual loaded plugin version and whether the widget is absent or merely missing data when reporting this symptom.

[Updater behavior and recovery](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.8.13/docs/UPDATES.md) · [Compatibility scope](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.8.13/COMPATIBILITY.md)
