# Antigrative Dashboard for Antigravity IDE

The standalone **Antigravity IDE** has a separate VSIX adapter starting with
**v0.7.0**. This targets Google's own IDE, not the Antigravity extensions in
VS Code, Visual Studio, JetBrains, Zed or Xcode. Those editor adapters are not
implemented. The desktop App and CLI retain their separate installers.

## What it shows

- Narrow Agent composer: three interactive speed, cache and context icons.
- Wide composer: numeric summaries appear when space permits.
- Too little space for even three icons: release the space to native controls.
- Hover or click for throughput, token/cache breakdown, context and account quotas.
  English / 简体中文 choices stay at the bottom of context details.
- Live statistics come from the IDE's main language server. Autocomplete, desktop
  and other-profile servers are excluded. Tool follow-up requests sharing an
  execution ID remain separate samples, so cache reads are counted correctly.
- New conversations show `—` until a sample exists; account quota is independent.
  Missing private conversation state shows unavailable rather than another chat.
- Unchanged polling does not rebuild labels or reset a scrolled card.
- Open the cache icon and **View token usage** for daily/weekly activity grids
  and day/week/month model stacks. Chart colors follow the current IDE theme,
  including custom accent and background changes. The account usage window
  remains open during composer resizing, replacement or temporary data gaps.
- Usage is backfilled from available IDE conversations, deduplicated per account
  and stored locally in `usage-v1`. Desktop and IDE maintain separate ledgers;
  this is observed local consumption, not account billing. Prompts, replies and
  credentials are not retained in this ledger.
- The cache card uses the same two-column Today / This month summary as desktop.
  First opening explains data import, local coverage and storage. **Got it** saves
  acknowledgment independently of language; changes to language/theme do not
  replay a completed introduction. Returning from the window does not pin the
  hover card with pointer focus; keyboard focus remains operable.

## Install a downloaded VSIX

Download `antigrative-dashboard-ide-0.8.10.vsix` and its `.vsix.sha256` from the
[release](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/tag/v0.8.10).
In Antigravity IDE, open Extensions, choose **Install from VSIX…** from the
Extensions menu and select the file. No desktop App installation is required.

The composer integration requires a **loopback renderer debugging endpoint**.
Fully quit the IDE normally when no task is running, then launch its executable
with these arguments:

```text
--remote-debugging-port=0 --remote-debugging-address=127.0.0.1
```

For example, Windows PowerShell (replace the path with your actual installation):

```powershell
& 'D:\Antigravity IDE\Antigravity IDE.exe' --remote-debugging-port=0 --remote-debugging-address=127.0.0.1
```

You can append the two arguments to an IDE shortcut's **Target** after the closing
quote around its executable. Keep using that shortcut after a full quit. Starting
an already-running IDE with new flags does not reconfigure its existing process.
The debugger binds to localhost only; do not expose it to the network.

## Install / launch / uninstall from the source ZIP

Download and extract `antigrative-dashboard-0.8.10.zip`, and download the VSIX to a
known location. Python 3.10+ is needed for this optional helper; it uses the IDE's
bundled runtime and needs no separately installed Node.js or third-party packages.

```powershell
python ide/manage.py install --exe 'D:\Antigravity IDE\Antigravity IDE.exe' --vsix 'C:\Downloads\antigrative-dashboard-ide-0.8.10.vsix'
python ide/manage.py launch --exe 'D:\Antigravity IDE\Antigravity IDE.exe'
python ide/manage.py uninstall --exe 'D:\Antigravity IDE\Antigravity IDE.exe'
```

Use `python3` on Linux/macOS. macOS `--exe` points to the executable inside
`Antigravity IDE.app/Contents/MacOS/Antigravity IDE`, not to the `.app` directory.
Linux `--exe` points to the actual Electron executable, not a shell wrapper.
`launch --workspace /path/to/project` optionally opens a workspace.
Developers can build their own version with `python ide/package.py`.

The extension owns the collector lifecycle. Multiple windows elect one collector
per default IDE profile; each renderer supplies its own current conversation ID.
Reloading reconnects automatically. The adapter checks PID lineage and socket
ownership before attaching to a workbench. Credentials stay in collector memory.
No proprietary app files or CSP policies are modified.

## Diagnostics and saved data

Run **Antigrative Dashboard: Show IDE Status** in the command palette.
Only recent health records are treated as current. Disable
`antigrativeDashboard.ide.enabled` or uninstall the VSIX to stop the integration.
Updates keep the extension identity, language preference and saved statistics.

Data lives under the IDE's `User/globalStorage/you-should-know-me.antigrative-dashboard-ide/`:

| System | Default base directory |
| --- | --- |
| Windows | `%APPDATA%\Antigravity IDE` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/Antigravity IDE` |
| macOS | `~/Library/Application Support/Antigravity IDE` |

Only whitelisted numeric statistics and settings are persisted, not messages,
titles or credentials. Each conversation has an updated aggregate snapshot;
there is no archive of every poll or every turn. After stopping the extension,
delete `history-v1` to clear statistics, or the extension's global-storage directory
to also reset language and first-use guidance. Uninstall does not erase history.

Historical daily/weekly/monthly consumption is stored separately in `usage-v1`.
Deleting `history-v1` does not clear those totals; deleting chats does not subtract
recorded consumption. Stop the extension, then delete `usage-v1` to clear the
ledger. Available local conversations will be backfilled again after activation.
See [usage accounting and limitations](../docs/USAGE.md).

## Verification scope

Windows 11 / **Antigravity IDE 2.5.5** (VS Code base 1.107.0) has been exercised
with real conversations, cache reads, restart/history restoration and narrow/wide
layouts. Three-platform CI runs discovery fixtures, installer/package tests and
the production widget in Chromium with enforced Trusted Types. Linux/macOS
signed-in IDE GUI acceptance remains outstanding.

This is an unofficial adapter using private DOM/RPC interfaces. Later IDE builds
may need an adapter update. Named/custom user profiles are not yet supported;
use the default profile. It is distributed on GitHub, not an editor marketplace.

## 中文快速说明

从发布页下载 IDE 专用 `.vsix`，在反重力自己的 IDE 扩展页选择「从 VSIX 安装」。
不需要先装桌面 App。完全退出 IDE 后，用带上面两个启动参数的快捷方式打开；
普通启动方式未开启连接端口时，插件无法挂载。更新后继续使用带参数的快捷方式。

窄栏显示三个图标，拉宽后显示数值；语言入口仍在上下文详情底部。
Windows IDE 2.5.5 已实机测试，Linux/macOS 的 IDE 登录界面尚待实机确认。
VS Code、Visual Studio、JetBrains、Zed、Xcode 中的 Antigravity 扩展目前尚未适配。
