# Antigrative Dashboard v0.6.0

## Antigravity CLI support

This release adds an independent adapter for the official Antigravity CLI `statusLine` interface. The portable ZIP includes both the desktop plugin and CLI adapter.

- Context occupancy and current cache read tokens appear first, followed by agent state.
- Gemini and Claude/GPT quotas occupy separate rows; each groups five-hour and weekly balances with reset countdowns.
- Remaining quota numbers and bars are **green at ≥70%, yellow at ≥30% and <70%, red below 30%**. Low balances also show `!` for monochrome terminals.
- The shared quota label distinguishes **Claude #DA7756** from **GPT #F8FAFC**; a supplied light-background terminal hint makes GPT use the default foreground for readability.
- English/Chinese, CJK/emoji cell widths, compact narrow layouts and optional details are supported. Only foreground colors and text weight are set; the terminal background is preserved.
- Independent installation, upgrade, status and uninstall preserve unrelated settings and restore the prior status line. Runtime files live in the user directory and survive replacement of the CLI binary.
- Windows shell transport is fixed for the real agy Go/CMD runner, with UTF-8 input/output and literal quoted paths. Linux/macOS use POSIX shell quoting.
- Unicode installation paths remain usable when a redirected Windows console uses a legacy encoding.

## Install or update

Download `antigrative-dashboard-0.6.0.zip` and its `.zip.sha256`, verify the checksum, and extract the archive. Install the official Antigravity CLI separately, using [Google's instructions](https://antigravity.google/docs/cli/install/).

Run from the extracted project directory (Node.js 20+ and Python 3.10+ required):

```sh
python manage.py install-cli
python manage.py status-cli
```

Use `python3` on Linux/macOS. Reopen `agy` after installation. To fix the language independently of the desktop preference, add `--language en` or `--language zh-CN` to `install-cli`. Restore the previous status line with `python manage.py uninstall-cli`.

Desktop users can update with `python manage.py install` (Linux/macOS: `python3`), then fully quit and reopen Antigravity when no task is running. Desktop statistics and language preferences are retained.

## Verification and limits

- Locally verified on Windows Antigravity CLI **1.3.2**, including two real signed-in replies and live context/quota status. A redacted [real screenshot and full usage guide](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/blob/v0.6.0/docs/CLI.md) are included.
- Publication requires Windows, Linux and macOS data/lifecycle/Chromium regressions and the existing official desktop resource/SDK checks. **Signed-in CLI interactive acceptance on Linux/macOS remains outstanding.** The real Windows test returned cache read 0; nonzero live cache behavior was not observed.
- CLI tok/s is omitted because the official payload has no streaming duration. Cache read is a token count, not an inferred cache hit ratio. Missing data displays `--`, and real zero values remain zero.
- The adapter reads only the current status-line input; it makes no network calls, reads no transcripts and creates no new metric history. Future incompatible host interfaces may still require adaptation.

## 中文摘要

v0.6.0 新增独立 CLI 状态栏：上下文占用、缓存读取量、状态、Gemini / Claude-GPT 分组额度与重置倒计时。额度数字与进度条按剩余量变色：**≥70% 绿色、≥30% 且 <70% 黄色、<30% 红色并附 `!`**。支持中英文、窄窗口及深浅终端背景；修复 Windows 命令传输与中文编码问题，提供独立安装、更新、状态检查和卸载还原。

解压后运行 `python manage.py install-cli`（Linux/macOS 用 `python3`），重新打开 `agy`。同一 ZIP 仍包含桌面版。Windows CLI 1.3.2 已完成真实登录后的两轮对话验证；Linux/macOS 登录后的 CLI 实机验收尚未完成。官方输入缺少流式耗时，因此暂不显示 tok/s；缓存展示读取数量，不推算命中率。
