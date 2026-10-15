# Antigrative Dashboard v0.8.6

## Fix stalled Token usage in historical/tool-heavy conversations

Address [issue #12](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/12): cache-rate eligibility previously excluded readable token counters, so usage could stay at an early value while session output and context continued updating.

- Account for normalized uncached input, cache reads, cache writes and output independently. Missing or invalid cache information no longer discards another readable component.
- Treat explicit zero-total-input tool requests as neutral samples, including missing provider labels. A zero denominator keeps the cache rate unavailable; missing data is not silently replaced with zero.
- Track per-component request coverage internally and calculate cache rates only from eligible input samples. Readable component sums may be incomplete when historical metadata is missing.
- Recover recorded input/output from old history automatically. Preserve account isolation, original cache timestamps and atomic writes; no statistics need to be deleted and conversations need not be recreated.
- Restore only the cache group when cache eligibility regresses. Retain v0.8.5 incremental/statistical-stream collection, current rate-quality reclassification, the local usage ledger and context handling.

## Post-release repository updates — 2026-10-15

The following refinements are available in the [current main branch](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/tree/main), while the version remains **v0.8.6**:

- **Compact Token/cache card:** remove repeated `≥` prefixes, calculation paragraphs and missing-request counts from the card and inline strip. Keep readable values, unavailable-value dashes and the independent usage calculation. Coverage and calculation limits are documented separately. [Change](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/commit/1575655)
- **Compact context/quota card:** retain occupancy, used/total tokens, sampled model, shared quota balances/reset times and the language controls at the bottom. Remove duplicate capacity rows, unknown compaction fields, the logged-text diagnostic breakdown and routine explanatory paragraphs. The host-reported context denominator is unchanged. [Change](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/commit/8388c13)
- **Existing usage overview retained:** keep the annual activity heatmap and model usage charts. The experimental hourly drilldown and added calendar selection highlight were withdrawn from local acceptance and are not part of these changes.

**Download scope:** the ZIP/VSIX files attached below are the original published v0.8.6 build. They have **not** been replaced and do not include these later repository refinements; that original build may still display the former coverage explanations and inequality prefixes. Use the current source with the documented installation flow to obtain the repository changes. No new tag or release was created, and local-only work under review is not included in this announcement.

## Downloads and update

- Desktop App / CLI: `antigrative-dashboard-0.8.6.zip` and `.zip.sha256`. Verify, extract, and run `python manage.py install` for App, or `python manage.py install-cli` for CLI; Linux/macOS use `python3`.
- Standalone Antigravity IDE: `antigrative-dashboard-ide-0.8.6.vsix` and `.vsix.sha256`. Install from VSIX and retain the documented debugging launch flags.

Fully quit and reopen the host after installation so the updated collector loads. Saved language preferences, conversation statistics and usage records are retained. Both App and IDE include the shared token fix; CLI accounting is unchanged.

## Verification and limits

Regression coverage includes long tool chains, explicit zero input, missing provider labels, partial/cache-only input, continued output, corrupted counters, unsafe sums, restart recovery and legacy history. Browser checks exercise both languages, App inline/panel and IDE, monthly usage, sidebar behavior, responsive layout and refresh interactions. Publication requires the existing Windows/Linux/macOS automated and official-resource gates, including the large-stream resource checks.

The reporter's original trajectory was not exported. Synthetic reproductions and automated checks establish the repaired code paths; the reporter's actual long conversation still requires an update-and-retest. Unavailable historical metadata cannot be invented.
