# Antigrative Dashboard v0.8.7

Historical Token usage recovery, smoother usage windows, and verified manual App updates.

## Same-version patch — 2026-10-15

The existing **v0.8.7** installation assets and SHA-256 files are refreshed with:

- **Update progress:** measured download percentage/size, flowing feedback during verification/extraction/backup/installation, theme-adapted colors and a smooth completion state. The icon surface stays fixed while its glyph rotates; a completed check does not visibly reverse into a new download.
- **Reliable progress reporting:** bounded, allowlisted worker events are separate from installation success. Missing/broken feedback cannot fail an otherwise valid installation.
- **Faster usage startup:** reuse verified checkpoints for unchanged settled chats and immediately show saved totals. A first temporary history-read failure uses synchronization status; repeated failures and actual data/persistence problems retain warnings.

**Already on v0.8.7?** Download the refreshed package and reinstall manually. The updater does not offer a same-version reinstall. App: extract and run `python manage.py install`. IDE: install the refreshed VSIX and reload the IDE window. Existing settings and statistics are retained.

No new version/tag is created. The original v0.8.7 Git tag and automatic source archives remain the initial source snapshot; use the patch source commit linked on this release page or the current main branch for these changes. The App ZIP and IDE VSIX below contain the patch. CLI functionality is unchanged.

## Historical usage — PR #17

Thanks to @MrcolorH for identifying unloaded conversations missing from the host's returned list and contributing the discovery/SDK compatibility fixes.

- Discover local historical conversation IDs independently for Antigravity App and IDE. Read Token counters from the authenticated local interface; no chat-body parsing or upload.
- Read every statistics page with the existing memory, time and revision guards. Recheck earlier imports that lack a completion checkpoint, so previously incomplete records can be repaired.
- Persist per-account hashed progress/source signatures; retry failures with backoff and retain manual refresh requests while another pass is running. Continue in background batches and preserve previously recorded consumption.
- Keep one owning plugin writer. Installation does not launch a competing backfill process. Account/backend changes stop superseded reads.
- Accept official SidecarApp SDKs without the optional `close` method while retaining required-interface and loopback checks.

## Faster usage windows

- Remove whole-document native modal inertness changes that stalled opening/closing in long chats.
- Retain the existing visual layout, backdrop, Escape, keyboard focus loop/return, nested year menu and composer-replacement recovery.
- On the same local Windows conversation (~19,800 host elements), synchronous open/close handlers changed from ~1.46s/~2.02s to ~21ms/~3ms. These are handler measurements, not an end-to-end latency promise.

## Manual App updates — selected scope from PR #16

Thanks to @moumouye for proposing integrated updates. This release adopts that feature with a separate hardened implementation.

Entry: **context details → bottom-right ⋯ → Check for updates**.

- Manual checks only. Select stable Releases from the exact official repository and verify App asset identity, SHA-256, version and declared download size before replacement.
- Reject unsafe archive paths, links, duplicate normalized entries, invalid manifests and oversized extraction; coalesce concurrent installation requests.
- Coordinate lifecycle operations with OS file locks. Back up the runtime and persist recovery journals/helpers before replacement; retain materials if recovery fails or a process is interrupted.
- Poll slow checks asynchronously. A narrowly scoped TLS 1.2 compatibility retry retains CA and hostname validation; certificate failures never bypass verification.
- Retain settings and usage. After installation, **Reload plugin** restarts the plugin sidecar.

The updater targets **Antigravity App only**. It does not update the host application, IDE VSIX or CLI installation. The annual heatmap/current model charts stay; hourly views, cost estimation, component filters and unrelated PR #16 layout changes are not included. CLI functionality is unchanged.

## Downloads

- App / CLI: `antigrative-dashboard-0.8.7.zip` and `.zip.sha256`.
- Standalone Antigravity IDE: `antigrative-dashboard-ide-0.8.7.vsix` and `.vsix.sha256`.
- Use the matching installer for your host. Python 3.10+ is required for App installation/update; CLI requires Node.js 20+.

## Validation and limits

Release publication is gated on Windows/Linux/macOS verification and official Linux/macOS host-resource checks. Automated fixtures cover multi-page imports, retries/checkpoints, account/host isolation, update concurrency, interrupted recovery, UI interactions and a synthetic 20,000-element chat. Local Windows App checks preserved existing settings and recorded consumption.

macOS/Linux CI is not signed-in native GUI acceptance. Controlled process-interruption tests do not prove physical power-loss, damaged-media recovery or startup compatibility of arbitrary future releases. SHA-256 from the same release channel is not an independent publisher signature.

Details: [usage accounting](docs/USAGE.md), [update verification and recovery](docs/UPDATES.md), [full changelog](CHANGELOG.md).

---

## 中文摘要

- 修复部分历史会话没有进入 Token 统计的问题：App/IDE 分别发现旧会话，完整读取分页，补全已有漏记，保存补录进度并自动重试。
- 修复长对话中「查看用量统计」打开和关闭卡顿，保留原界面、遮罩及键盘操作。
- 新增 App 手动检查更新：上下文详情 → 右下角 ⋯ → 检查更新。加强官方包、SHA-256、版本与路径校验，并加入并发互斥、失败回滚和中断恢复。
- 保留年度热力图和现有图表；未加入小时图、费用估算和组件筛选。IDE/CLI 仍分别安装，CLI 功能不变。
- 已保存的统计和设置保留；仅能补回本机接口仍可读取的历史，这些统计不是账户账单。
