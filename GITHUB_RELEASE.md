# Antigrative Dashboard v0.8.7

## Intraday 24-Hour Activity Overview and Daily Quick-Switcher

Redesign the Activity Overview tab to provide focused, high-density intraday usage visualization without vertical scrolling or pagination.

- **Intraday 24-Hour Bar Chart**: Automatically trim idle midnight and early-morning hours while preserving intermediate rest periods as zero-height baseline intervals.
- **Stacked Component Breakdown**: Each hour bar stacks uncached input (accent), cache read (green), and output (orange) tokens. Hovering displays exact token counts, requests, component breakdown, and active models.
- **7-Day Quick-Switcher Pills**: Switch easily between recent days with a single click. Defaults to "Activity Overview" on today upon opening the dashboard.
- **Calibrated Y-Axis Scale**: Dynamic ceiling logic ensures the chart never displays redundant upper ticks (e.g. capping at 150M rather than 200M when usage is below 150M).
- **Interactive Component Filtering**: Support toggling individual token components (uncached, cache read, output) with real-time deduction from totals and estimated costs.
- **GitHub Release Auto-Detection & One-Click Updater**: Automatic background check with interactive in-dashboard banner for update notifications and seamless installation.

## Downloads and update

- Desktop App / CLI: `antigrative-dashboard-0.8.7.zip` and `.zip.sha256`. Verify, extract, and run `python manage.py install` for App, or `python manage.py install-cli` for CLI; Linux/macOS use `python3`.
- Standalone Antigravity IDE: `antigrative-dashboard-ide-0.8.7.vsix` and `.vsix.sha256`. Install from VSIX and retain the documented debugging launch flags.

Fully quit and reopen the host after installation so the updated collector loads. Saved language preferences, conversation statistics and usage records are retained.
