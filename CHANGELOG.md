# Changelog

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
