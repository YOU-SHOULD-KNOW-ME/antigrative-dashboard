# 兼容性与验证范围

| 系统 | 安装 / 后台发现 | 验证范围 |
| --- | --- | --- |
| Windows | Python / PowerShell，CIM 筛选 standalone + 单次 netstat PID 所属监听端口 | Windows 11 / 桌面 App 2.21.1、2.22.0；真实对话上下文、合并悬浮卡已实机验证并验收；CI 生命周期与数据测试 |
| Linux | Python3 / POSIX shell，当前用户 `/proc` + TCP/TCP6 socket inode | Ubuntu CI 原生端口测试、安装生命周期、官方 2.21.1 资源与 SDK 检查；完整登录 App GUI 待用户实机验证 |
| macOS | Python3 / POSIX shell，当前用户 `ps` + `lsof` PID 所属端口 | macOS CI 原生端口测试、安装生命周期、官方 2.21.1 资源与 SDK 检查；完整登录 App GUI 待用户实机验证 |

面向 **Antigravity 桌面 App 2.21.1 / 2.22.0**，不是 Antigravity IDE、VS Code 扩展、CLI 或 iOS。Linux/macOS 官方资源检查固定为 2.21.1，不等同于已验证其 2.22.0 登录界面。
Python 3.10+ 仅用于生命周期，无 pip 依赖；后台使用宿主 Node，内嵌桥接需原生 WebSocket，建议 Node 24。Linux/macOS 架构跟随宿主，不分发平台二进制。官方系统要求见 [Antigravity 下载页](https://antigravity.google/download)。

## 安装与自定义位置

Windows：`python manage.py install` / `./install.ps1`。
Linux/macOS：`python3 manage.py install` / `sh install.sh`。
启停、状态、卸载同样使用 `python3 manage.py <action>`，或 `sh uninstall.sh`。不要使用 sudo，否则会安装到错误用户目录。

默认查找 Windows 用户安装目录、macOS `/Applications/Antigravity.app` 与 `~/Applications/Antigravity.app`、Linux `/opt/Antigravity`、`/opt/antigravity`、`/usr/share/antigravity`，以及 PATH 中启动器所在目录。
自定义安装：`python3 manage.py install --app-path '/path/to/resources/app.asar'`；安装器记住资源位置供 SDK 发现。
`AG_PULSE_APP_ASAR` 可覆盖生命周期检测位置；`AG_PULSE_PROFILE` 可在安装时指定用户配置目录并保存。
如果宿主省略 SDK 解析与语言服务器路径，可用 `ANTIGRAVITY_AGENTAPI_EXE` 指定其已安装的语言服务器，或 `AG_PULSE_APP_RESOURCES` 指定资源目录。环境变量应传给启动 App 的环境。

语言服务日志：Windows/Linux 默认读取 `<profile>/logs/language_server.log`；macOS 优先读取 `~/Library/Logs/Antigravity/language_server.log`，缺失或不能匹配当前 PID 端口时回退到 profile 日志。`AG_PULSE_LOG` 可显式指定唯一日志位置。回退仍校验当前进程拥有该 HTTP 端口，不连接旧日志中的失效接口。

## 独立用户数据目录

| 内容 | Windows | Linux | macOS |
| --- | --- | --- | --- |
| App profile | `%APPDATA%/Antigravity` | `${XDG_CONFIG_HOME:-~/.config}/Antigravity` | `~/Library/Application Support/Antigravity` |
| 插件设置 | `%LOCALAPPDATA%/AntigravityPulse/settings.json` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulse/settings.json` | `~/Library/Application Support/AntigravityPulse/settings.json` |
| 语言选择 | `%LOCALAPPDATA%/AntigravityPulse/preferences.json` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulse/preferences.json` | `~/Library/Application Support/AntigravityPulse/preferences.json` |
| 备份 | `%LOCALAPPDATA%/AntigravityPulseBackups` | `${XDG_DATA_HOME:-~/.local/share}/AntigravityPulseBackups` | `~/Library/Application Support/AntigravityPulseBackups` |

三系统插件均在 `~/.gemini/config/plugins/antigravity-pulse`；历史均在 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<account-hash>/<conversation-id>.json`（宿主可覆盖 data 目录）。
更新、重装、卸载保留统计数据，不保留已卸载的运行代码。设置开关保留其他插件和自定义字段。

## 上下文数值的含义

最近一次 chat model 的 `chatStartMetadata.contextWindowMetadata` 中，`estimatedTokensUsed` 是宿主估计，`maxContextTokens` 是该请求容量。已用 = used/max，剩余不小于零。
这是请求开始时的采样，非会话累计 Token，非实时流式计数。悬停卡明确注明来源、采样模型和历史恢复时间。没有容量就不显示百分比，不通过模型名称猜容量；新模型没有元数据就不沿用旧模型窗口。超过容量的估计显示真实比例并提示，进度环最大填满。压缩后允许下降。

## 更新与失败恢复

默认安装不修改 `resources/app.asar`，由用户插件中的运行时适配器通过宿主现有 loopback 调试通道挂载。每 3 秒重试端口变化、文档替换与窗口重启。只允许 loopback 主 frame，通过受限桥接传递白名单统计。后台凭据仅在内存使用，匹配当前 PID 所属 HTTP 端口。

三系统共用同一套合并布局和 V4 桥接协议。每个宿主后台具有独立实例标识与绑定；data 目录中的 `active-sidecar.json` 由新实例原子接管，旧实例每 2 秒检测接管后解绑退出。启动接管用短期文件锁串行化，异常退出的锁可恢复；不终止无关 PID。退出时只清理自身脚本和绑定，旧请求与延迟注入不能覆盖新实例。首次从没有接管保护的旧版升级，仍应完全退出宿主并清理已确认的旧插件后台；之后新实例可自动退役旧实例。

内嵌悬浮卡通过浏览器原生 popover 顶层展示，避免输入区层叠上下文导致宿主按钮遮挡；不支持该 API 的旧宿主回退为普通固定定位。

强调色优先跟随宿主当前生效的 `--primary` / `--color-primary`；配置中的 `userSettings.customThemeSeedsDark.primary` 与 `customThemeSeedsLight.primary` 提供深浅主题回退。切换主题或强调色无需重启；上下文环、上下文与额度进度条共用主色，小字号强调文字另行保证可读对比度。后台只传递有效颜色与主题模式，不传递完整配置，也不修改宿主设置。缺失或非法颜色恢复默认配色。

背景与文字同样跟随实际生效的 `--background`、`--popover` / `--card`、`--foreground`；只保存背景 seed 时，从同色系派生卡片、菜单、控件和轨道。配置中仅白名单传递 `background`、`foregroundOverride` 色值作为回退。支持宿主的 color-mix、OKLCH 等有效不透明颜色；文字与背景过于接近时调整对比度，移除颜色后清理旧覆盖值。

v0.5.2 的发布检查在三系统分别运行 Node 数据/路径/后台接管测试、Python 生命周期测试，以及 Chromium 中的主题切换、汉化布局和跨端口语言持久化测试。浏览器使用示意宿主和示例数据；它们不能证明 Linux/macOS 的已登录 App 界面已经实机验收。Windows 本轮修复已在当前真实 App 中验证；Linux/macOS 完整 App GUI 仍待实机确认。

汉化兼容：优先用 `role="combobox"` / `role="textbox"` 与 `contenteditable="true"` 识别输入区，用模型选择器的稳定 `data-testid` 定位；沿 DOM 包含关系找输入区与工具栏的共同父容器，不依赖发送、录音或取消按钮的英文/中文文案。旧版缺少语义属性时保留原英文标识回退。隐藏或存在歧义的候选不随意挂载；宿主若同时改变这些结构或标识，仍可能需要适配。

子代理 / Agent Manager 安全布局（#5）：共同父容器还必须是输入区附近的水平 flex 操作行，应用标题栏、远离输入区的工具栏和不支持的布局不挂载。监控条使用可收缩的有限宽度，不修改宿主模型按钮的 flex 或最小宽度，也不提高条本身的层级。完整内容放不下先保留三个图标，连图标都放不下或与实际可点击控件相交才隐藏并关闭悬浮卡；滚动消息中被遮盖的按钮不算可见碰撞；窗口变宽、按钮移开后自动恢复。浏览器测试覆盖中英文、300–1100px 窗宽、绝对定位按钮、点击命中、重挂载与宿主样式保留。拒绝内嵌挂载时可使用原生侧面板（需要宿主 SDK 兼容）；不保证未知子代理布局中仍有内嵌条。

v0.6.1 子代理展示：在 `[data-testid="agent-input-box"]` 内定位唯一编辑器、发送按钮和静态子代理身份标签，校验其水平操作行与编辑器的邻近关系后挂载。标签文字允许汉化，右侧文件面板的 combobox 不作为子代理锚点。数据请求使用当前 `/c/<id>`，只接收该 ID 的统计；切换父/子会话立即清空旧值，晚到或 ID 不匹配的响应被拒绝。窄窗口先保留速度、缓存和上下文三个图标，仍可打开各自详情；语言可在上下文卡中切换，详情注明“当前子代理统计”和账号共享额度。尚不支持任意浮动子代理窗口或同一页面多个会话同时展示各自监控条。

`python[3] manage.py status` 显示运行模式与健康状态：`mounted`、`waiting-for-composer`、`reconnecting`；检查 `checkedAt` 是否新鲜，历史文件不能证明当前后台仍在运行。原生侧面板是 SDK 兼容时的回退。

未来关闭调试通道、改变 DOM、SDK 或 RPC 仍可能需要适配，不保证所有未来版本无故障。`--legacy-loader` 仅为 Windows 2.19.1 历史迁移，不用于 Linux/macOS。未知归档修改不会被覆盖。

只保存白名单统计、模型/状态，不保存正文、标题、邮箱、凭据、原始上下文或 token breakdown。账号未确认不加载其他账号数据，缺失旧元数据不能凭空重建。完整故障矩阵见 [ROBUSTNESS.md](docs/ROBUSTNESS.md)。
