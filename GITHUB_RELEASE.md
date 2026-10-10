# Antigrative Dashboard v0.6.4

## Language settings and first-use guidance

- Address [issue #6](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/6): remove the duplicate toolbar language button. Keep explicit **English / 简体中文** choices at the **bottom of context details**, near the context trigger.
- English remains the default. To help first-time Chinese users discover the setting, a small bilingual tip points to the context chip. Clicking it opens details, scrolls to the language choices and focuses them. Initial tip display does not take focus from the composer.
- Selecting either language, including the current language, completes onboarding. Closing the tip keeps the saved language. Completion persists across restarts and renderer origins; failed saves remain visible and retryable.
- Show the compact guide only in the main composer. Existing saved language choices remain intact; subagent composers do not repeat the guide.

## Current interface

<img src="https://raw.githubusercontent.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/v0.6.4/docs/assets/hero.png" width="100%" alt="v0.6.4 toolbar without the duplicate language switch">

<table><tr><td width="50%" valign="top"><img src="https://raw.githubusercontent.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/v0.6.4/docs/assets/speed.png" width="100%" alt="Generation speed details"><br><img src="https://raw.githubusercontent.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/v0.6.4/docs/assets/widget.png" width="100%" alt="Token and cache details"></td><td width="50%" valign="top"><img src="https://raw.githubusercontent.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/v0.6.4/docs/assets/context.png" width="100%" alt="Context and quota details with English and Chinese choices at the bottom"></td></tr></table>

Figures render the current production widget with illustrative host layouts and sample data.

## Native subagent controls in narrow layouts

- Reserve natural space for the native subagent label and icons. Switch to three plugin icons before the native label wraps or its SVG shrinks.
- Release the plugin's width, flex space and margins if the three icons cannot fit safely. Restore icons or full statistics when the sidebar closes and space returns.
- Preserve responsive transitions. Exclude changing width reservations from full-layout probe keys and avoid redundant class changes during dragging.

## Documentation and verification

- Refresh English/Chinese README and release artwork from the current widget source, including removal of the old rightmost language button. Document the new first-use flow.
- Include the bounded Windows CI shell-startup correction from the previous maintenance commit.
- Regression coverage includes first use, no initial focus theft, three-icon guidance, explicit English/Chinese choices, dismissal without language changes, failed-save retry, new-origin/backend persistence and native label/icon geometry.
- Windows local data, lifecycle and complete production-renderer browser regressions passed. Publication requires Windows/Linux/macOS data, lifecycle and Chromium gates and official desktop resource/SDK checks. The Windows desktop language flow and narrow-layout fixes passed local user acceptance. Signed-in Linux/macOS GUI acceptance remains separate.
- CLI rendering and metric definitions are unchanged. Local acceptance helpers, account data and private screenshots are excluded.

## Install or update

Download `antigrative-dashboard-0.6.4.zip` and `.zip.sha256`, verify the checksum and extract. Run:

```sh
python manage.py install
```

Use `python3` on Linux/macOS. Fully quit and reopen Antigravity when no task is running. Saved language settings and conversation statistics are retained. The same ZIP contains the CLI adapter; CLI users can run `python manage.py install-cli` and reopen `agy`.

## 中文摘要

采纳 Issue #6 建议，移除状态条上重复且低频的语言按钮，保留上下文详情最底部的 **English / 简体中文** 切换。

考虑到默认英文，首次中文用户可能找不到隐藏的切换入口，加入轻量双语提示；点击即可打开详情并定位到底部语言选项。提示出现时不抢输入焦点，仅在主对话显示。选择语言或关闭提示后，完成状态跨重启保存；关闭提示不会改变已有语言，保存失败允许重试。

修复侧边栏挤压子代理输入框时原生标签换行、图标缩小的问题：先为原生控件预留空间，再收缩为三个图标；连图标都放不下时释放全部插件占位，空间恢复后自动展开。保留已有过渡动画与拖动优化。

中英文 README 和本发布页演示图均使用当前源码重新渲染，移除旧版最右侧语言按钮。示意宿主及示例数据用于展示，不包含账号或对话内容。Windows 本地验收已通过；三平台自动测试作为发布门槛，Linux/macOS 登录后的实机 GUI 验收仍待单独确认。
