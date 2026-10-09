# 兼容性与验证范围

| 系统 | 安装 / 后台发现 | 验证范围 |
| --- | --- | --- |
| Windows | Python / PowerShell，CIM + PID 所属监听端口 | Windows 11 / 桌面 App 2.21.1，已有实机 UI 验证；CI 生命周期与数据测试 |
| Linux | Python3 / POSIX shell，当前用户 `/proc` + TCP/TCP6 socket inode | Ubuntu CI 原生端口测试、安装生命周期、官方 2.21.1 资源与 SDK 检查；完整登录 App GUI 待用户实机验证 |
| macOS | Python3 / POSIX shell，当前用户 `ps` + `lsof` PID 所属端口 | macOS CI 原生端口测试、安装生命周期、官方 2.21.1 资源与 SDK 检查；完整登录 App GUI 待用户实机验证 |

面向 **Antigravity 桌面 App 2.21.1**，不是 Antigravity IDE、VS Code 扩展、CLI 或 iOS。
Python 3.10+ 仅用于生命周期，无 pip 依赖；后台使用宿主 Node，内嵌桥接需原生 WebSocket，建议 Node 24。Linux/macOS 架构跟随宿主，不分发平台二进制。官方系统要求见 [Antigravity 下载页](https://antigravity.google/download)。

## 安装与自定义位置

Windows：`python manage.py install` / `./install.ps1`。
Linux/macOS：`python3 manage.py install` / `sh install.sh`。
启停、状态、卸载同样使用 `python3 manage.py <action>`，或 `sh uninstall.sh`。不要使用 sudo，否则会安装到错误用户目录。

默认查找 Windows 用户安装目录、macOS `/Applications/Antigravity.app` 与 `~/Applications/Antigravity.app`、Linux `/opt/Antigravity`、`/opt/antigravity`、`/usr/share/antigravity`，以及 PATH 中启动器所在目录。
自定义安装：`python3 manage.py install --app-path '/path/to/resources/app.asar'`；安装器记住资源位置供 SDK 发现。
`AG_PULSE_APP_ASAR` 可覆盖生命周期检测位置；`AG_PULSE_PROFILE` 可在安装时指定用户配置目录并保存。
如果宿主省略 SDK 解析与语言服务器路径，可用 `ANTIGRAVITY_AGENTAPI_EXE` 指定其已安装的语言服务器，或 `AG_PULSE_APP_RESOURCES` 指定资源目录。环境变量应传给启动 App 的环境。

## 独立用户数据目录

| 内容 | Windows | Linux | macOS |
| --- | --- | --- | --- |
| App profile | `%APPDATA%/Antigravity` | `${XDG_CONFIG_HOME:-~/.config}/Antigravity` | `~/Library/Application Support/Antigravity` |
| 插件设置 | `%LOCALAPPDATA%/AntigravityPulse/settings.json` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulse/settings.json` | `~/Library/Application Support/AntigravityPulse/settings.json` |
| 备份 | `%LOCALAPPDATA%/AntigravityPulseBackups` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulseBackups` | `~/Library/Application Support/AntigravityPulseBackups` |

三系统插件均在 `~/.gemini/config/plugins/antigravity-pulse`；历史均在 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<account-hash>/<conversation-id>.json`（宿主可覆盖 data 目录）。
更新、重装、卸载保留统计数据，不保留已卸载的运行代码。设置开关保留其他插件和自定义字段。

## 上下文数值的含义

最近一次 chat model 的 `chatStartMetadata.contextWindowMetadata` 中，`estimatedTokensUsed` 是宿主估计，`maxContextTokens` 是该请求容量。已用 = used/max，剩余不小于零。
这是请求开始时的采样，非会话累计 Token，非实时流式计数。悬停卡明确注明来源、采样模型和历史恢复时间。没有容量就不显示百分比，不通过模型名称猜容量；新模型没有元数据就不沿用旧模型窗口。超过容量的估计显示真实比例并提示，进度环最大填满。压缩后允许下降。

## 更新与失败恢复

默认安装不修改 `resources/app.asar`，由用户插件中的运行时适配器通过宿主现有 loopback 调试通道挂载。每 3 秒重试端口变化、文档替换与窗口重启。只允许 loopback 主 frame，通过受限桥接传递白名单统计。后台凭据仅在内存使用，匹配当前 PID 所属 HTTP 端口。

`python[3] manage.py status` 显示运行模式与健康状态：`mounted`、`waiting-for-composer`、`reconnecting`；检查 `checkedAt` 是否新鲜，历史文件不能证明当前后台仍在运行。原生侧面板是 SDK 兼容时的回退。

未来关闭调试通道、改变 DOM、SDK 或 RPC 仍可能需要适配，不保证所有未来版本无故障。`--legacy-loader` 仅为 Windows 2.19.1 历史迁移，不用于 Linux/macOS。未知归档修改不会被覆盖。

只保存白名单统计、模型/状态，不保存正文、标题、邮箱、凭据、原始上下文或 token breakdown。账号未确认不加载其他账号数据，缺失旧元数据不能凭空重建。完整故障矩阵见 [ROBUSTNESS.md](docs/ROBUSTNESS.md)。
