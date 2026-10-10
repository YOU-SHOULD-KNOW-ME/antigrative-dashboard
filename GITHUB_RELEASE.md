# Antigrative Dashboard v0.6.2

## Responsive motion without resize stutter

- Add a **240ms interruptible transition** between full statistics and three interactive icons. Values fade out, speed/cache/context icons move into place, and the native model name fades in after the outgoing labels clear. Icon details remain clickable throughout.
- Fix **resize-drag stutter and trailing copies**: continuing to drag no longer cancels and rebuilds animations every frame. Keep one animation clock per actual density change and crop the existing visual ribbon to current safe bounds.
- Capture visual elements only for density changes. Avoid repeatedly expanding the strip to measure it while shrinking; filter unrelated control rectangles before reading visibility styles.
- Use **12px of recovery headroom** to avoid full/icon flicker near the threshold. Content, language and native control changes can trigger fresh fit checks.
- Preserve host layout styles. Inert, accessibility-hidden visual copies never intercept input; protect native actions and immediately cancel on unsafe placement, navigation, reparenting or disposal.
- Retain full default motion, with short fades for the system reduced-motion preference. Metric polls and ordinary message scrolling do not replay transitions.
- Add browser regressions for continuous resize/translation, threshold jitter, animation-layer counts, outgoing-label cleanup and restoration of the full layout. Windows local desktop drag and transition changes passed user acceptance; publishing requires Windows/Linux/macOS automated gates. Signed-in Linux/macOS GUI acceptance remains separate.

## Includes the v0.6.1 fixes

## Subagent layout and responsive controls

- Fix [issue #5](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/5): the auxiliary pane's Git filter could be mistaken for a model selector, placing the strip over the top toolbar. Mount only beside a valid local composer; reject headers, distant toolbars and ambiguous layouts.
- Show current subagent throughput, cache and context beside its input box. Detail cards identify **current subagent statistics** and **account-wide shared quotas**. Parent values are never used as a child fallback.
- When full statistics cannot fit, keep **three interactive icons: speed gauge, token database and context ring**. Hover, click or focus for details. Language switching remains in the context card. Hide only when the icons cannot fit safely or collide with host actions; restore when space returns.
- Fix disappearance during message scrolling. A message control clipped or covered behind the composer no longer counts as a visible collision. Local composer actions and actually painted floating controls remain protected.
- Preserve host flex/min-width styles. Recheck after resizing, scrolling, DOM changes and composer replacement; dismiss details when placement is unsafe.

## Conversation switching

- Refresh immediately after parent/child navigation, independently of the previous request and polling clock.
- Reject obsolete successes and failures, including returning to the same conversation after visiting another one. Reject mismatched returned conversation IDs; discard pending work on disposal.
- Skip full conversation enumeration when the composer supplies its exact ID. Preserve queued manual refresh and rotation feedback.

## Install or update

Download `antigrative-dashboard-0.6.2.zip` and `.zip.sha256`, verify the checksum and extract. Run from the extracted directory:

```sh
python manage.py install
```

Use `python3` on Linux/macOS. Fully quit and reopen Antigravity when no task is running so the sidecar loads the new sources. Per-account conversation statistics and language preferences are retained. The same ZIP includes the existing CLI adapter; CLI users can run `python manage.py install-cli` and reopen `agy`.

## Verification and limits

- Windows Antigravity desktop **2.22.0**: real subagent metrics, auxiliary toolbar hit targets and Add menu, parent/child navigation, normal restart and reload were checked. Scroll disappearance was reproduced in a real main conversation and checked at the same position after the fix.
- Local Node tests: **88 passed, 1 platform skip**. Python lifecycle/package tests: **28 passed, 1 permission skip**. Production-renderer browser regressions passed in English/Chinese, covering icons, covered scroll controls, visible overlays, host styles, stale responses, themes and language persistence.
- Publication requires Windows/Linux/macOS data, lifecycle and Chromium regressions and the existing official desktop resource/SDK checks. Browser tests use illustrative host fixtures. **Signed-in Linux/macOS desktop GUI acceptance remains outstanding.**
- Unknown host DOM/SDK/debugging/metric changes may require maintenance. Unsupported layouts decline inline mounting; the native side panel remains available when its SDK is compatible. Arbitrary floating child windows and several simultaneous composers on one page are not promised.
- CLI behavior and documented metric limits are unchanged. No account details, conversation statistics or local test screenshots are included in this release.

## 中文摘要

v0.6.2 为完整统计与三个图标加入平滑过渡：文字淡出、图标收拢、模型名称淡入，支持反向切换且按钮始终可点击。修复拖动时逐帧重建动画造成的卡顿与残影；复用同一次过渡，仅调整安全裁剪。恢复完整数值留出 12px 余量，避免临界宽度来回闪切。默认完整动画保留，Windows 本地验收已通过。

包含 v0.6.1 的 Issue #5 子代理工具栏重叠修复，展示子代理自己的速度、缓存率和上下文，额度注明账号共享。窄窗口先保留仪表盘、数据库、上下文圆圈三个可交互图标，连图标都放不下才隐藏，拉宽后恢复；语言可在上下文详情中切换。

同时修复滚动时把输入框后面的消息按钮误判为碰撞，以及父子对话切换等待旧请求的问题。旧请求成功、失败及返回同一对话后的晚到响应都不能覆盖新数值。Windows 真实界面已验证；Linux/macOS 共用代码并运行 CI，登录后的实机 GUI 验收仍未完成。

解压后运行 `python manage.py install`（Linux/macOS 用 `python3`），无任务运行时完全退出重开 Antigravity。保留语言与对话统计；同一 ZIP 继续包含 CLI 适配器。
