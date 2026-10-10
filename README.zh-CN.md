<div align="center">

<img src="docs/assets/hero-zh.png?v=0.5.0-compact" width="100%" alt="Antigrative Dashboard v0.5：速度、缓存和上下文，就在模型选择旁。">

# Antigrative Dashboard

模型选择旁只显示生成速率、缓存和上下文占用；悬停上下文，一并查看上下文、5 小时和周额度详情。<br>
缩略信息常驻；鼠标悬停，才展开详细统计。

[![Version 0.6.2](https://img.shields.io/badge/version-0.6.2-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/host-Windows%20%7C%20Linux%20%7C%20macOS-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.21.1 / 2.22.0](https://img.shields.io/badge/Antigravity-2.21.1%20%2F%202.22.0-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[看看效果](#看看效果) · [CLI](#antigravity-cli-状态栏) · [开始安装](#安装) · [启用与停用](#可插拔) · [兼容性](#兼容性) · [常见问题](#常见问题)

</div>

**v0.6.2 更新：** 完整数值与三个图标之间加入可打断的平滑过渡，模型名称配合淡入；连续拖动不再重复重建动画，避免拖尾残影和临界宽度闪切。包含 v0.6.1 的子代理重叠、父子对话切换等待和滚动误隐藏修复（[#5](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/5)）。[完整更新说明](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/tag/v0.6.2)。

## 看看效果

<img src="docs/assets/widget-zh.png?v=0.5.1-compact" width="100%" alt="最新版三个常驻控件：速度、缓存、上下文，以及缓存悬浮卡。">

<sub>封面和效果图直接使用当前插件源码渲染，数据为示例，不展示真实账户、额度或对话。实际插件的数据来自本机 Antigravity 接口。</sub>

**不用打开一个监控面板，继续你的对话。**

| 看见速度 | 知道余额 | 少一点打扰 |
| --- | --- | --- |
| 会话加权 TPS、最近一次请求速率、模型 / 工具用时和首 token 时间。 | Gemini 与 Claude/GPT 的独立 5h、周余额及重置倒计时。 | 缩略条与模型选择同行；悬停展开；新对话尚无请求时不显示空 TPS。 |

### 它还处理了这些细节

- **菜单保持稳定。** 打开额度组菜单时，轮询不会重建控件或关闭菜单，倒计时继续更新。
- **用真实数据。** 余额读取账户接口，不根据生成字数推测，不将重置到期自动改成 100%。
- **切换对话。** 统计跟随当前会话，新对话不沿用上一段对话的速率。
- **子代理独立统计。** 输入框旁显示当前子代理的 tok/s、缓存率和上下文；详情区分子代理统计和账号共享额度。父子对话切换立即刷新，旧响应不能覆盖新页面或返回同一对话后的新数值。
- **更新后自动连接。** 适配器保存在用户插件目录，默认安装不修改 App 归档。
- **对话统计持久化。** 每个账号、每个对话分别保存 tok/s 与 cache，重新加载后可恢复。
- **适合紧凑窗口。** 完整数值放不下时先保留仪表盘、数据库和上下文圆圈三个图标，仍可悬停或点击查看详情；语言切换保留在上下文卡里。连图标都放不下或确实碰撞宿主按钮时才隐藏，拉宽后恢复。消息按钮滚到输入框后面不会再导致控件消失。
- **跟随主题配色。** 控件、悬浮卡和额度菜单跟随 Antigravity 的深浅模式及自定义背景、卡片、文字和强调色，并保持文字可读；独立预览跟随系统，切换主题无需重启或重新加载对话。
- **语言设置跨重启保留。** 中英文选择写入独立的 `AntigravityPulse/preferences.json` 用户配置，控件和侧面板共用；不依赖应用每次启动的本地端口。
- **不上传采集数据。** 后台使用本机 loopback 接口，数值留在你的电脑。

### 上下文窗口占用

<img src="docs/assets/context-zh.png?v=0.5.1-compact" width="460" alt="上下文窗口占用与 5h、周额度合并在同一张悬浮卡中">

<sub>示例为 44% 占用，非真实对话数据。实际读取宿主最近请求开始时的估计值；缺少容量会明确显示不可用。</sub>

## Antigravity CLI 状态栏

**v0.6.0 新增**独立的 CLI 官方状态栏适配：上下文占用、缓存读取 Token、状态、分组额度及重置倒计时，支持中英文和终端宽度适配。额度数字和进度条按剩余量显示：**≥70% 绿色、≥30% 且 <70% 黄色、<30% 红色**。预览：`node cli/statusline.mjs --preview --language zh-CN`；安装：`python manage.py install-cli`（Linux/macOS 用 `python3`）。需要 Node.js 20+ 和支持官方接口的 CLI。官方输入没有流式耗时，暂不显示 tok/s。详见 [CLI 使用及撤回](docs/CLI.md)。

![真实 Antigravity CLI 两轮对话及状态栏](docs/assets/cli-conversation-zh.png)

<sub>Windows Antigravity CLI 1.3.2 真实两轮对话，账号邮箱已遮挡。Linux/macOS 登录后的交互实机验收尚未完成。</sub>

## 安装

适用于 **Windows / Linux / macOS 的 Antigravity 桌面 App 2.21.1 / 2.22.0 + Python 3.10+**。三系统共用同一个 release ZIP，无 pip / npm 第三方依赖，后台使用 App 自带 Node.js。各平台完整验证范围见 [COMPATIBILITY.md](COMPATIBILITY.md)。

Linux / macOS 使用 `python3 manage.py install` 或 `sh install.sh`，启停和卸载命令同样把 `python` 换成 `python3`。无需 sudo，不修改应用归档。

> 模型选择旁的内嵌位置没有公开插件挂载接口。现在由标准 sidecar 通过已有本地渲染调试端口挂载控件，默认安装不再修改 `resources/app.asar`。未来宿主 DOM、调试通道、SDK 或统计接口改变时仍可能需要适配；原生侧面板作为备用入口。

### 手动安装

下载 [最新 Release](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/latest) 的 ZIP 并解压，或克隆仓库：

```powershell
git clone https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard.git
cd antigrative-dashboard
python manage.py install
```

完全退出并重新打开 Antigravity。打开对话，模型选择右侧就会出现额度与速率条。PowerShell 用户也可以运行 `./install.ps1`。

安装器复制并启用插件；迁移时只恢复经过完整校验的旧补丁。后台自动发现当前渲染端口并重新连接。**保留这个源码 / 解压目录**，以便启停、升级和卸载。

<details>
<summary><strong>让 Agent 帮你安装：展开完整提示词</strong></summary>

```text
请帮我安装并启用 Antigrative Dashboard。
仓库：https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard
目标：在模型选择旁显示 tok/s、缓存和上下文；悬停上下文统一查看其详情、5h 和周额度及倒计时。

1. 读取 README.md 和 COMPATIBILITY.md，确认 Windows、Linux 或 macOS、Antigravity 桌面
   App 2.21.1 / 2.22.0、Python 3.10+。不要自动升级、降级或替换我的 App。
2. 将项目克隆 / 解压到固定目录，不在临时下载目录运行。
3. 用 python manage.py status 检查已有状态，再执行 python manage.py install。
   保留其他插件配置，使用自带备份和完整性校验。
4. 安装后完全重启 Antigravity；如果有任务正在执行，先告知需要重启，
   不要强制结束任务。
5. 验证新对话的上下文入口、有请求对话的 TPS / 缓存 / 上下文；悬停上下文同时显示两种额度。
   打开额度组菜单等待多次轮询，确认不会被刷新关闭。
6. 报告安装结果、版本、运行时连接状态和实机验证范围。
```

</details>

## 可插拔

在项目目录运行：

| 操作 | 命令 | 行为 |
| --- | --- | --- |
| 安装 / 更新插件 | `python manage.py install` | 复制运行时适配器，保留其他配置和历史统计 |
| 停用 | `python manage.py disable` | 关闭插件，缩略条在下一次轮询隐藏 |
| 启用 | `python manage.py enable` | 启动插件并重新显示控件 |
| 查看状态 | `python manage.py status` | 检查安装、开关和控件连接健康状态 |
| 卸载 | `python manage.py uninstall` | 移除本插件目录，保留历史统计与旧版备份 |

首次安装、更新插件代码或卸载之后需要完整重启 App。启停开关不需要重装或再次修改归档。`./uninstall.ps1` 等同于卸载命令。

**恢复资料会保留。** 原始归档在 `%LOCALAPPDATA%/AntigravityPulseBackups/<时间戳>/`；卸载保留备份与诊断日志。遇到 App 升级或其他修改时，卸载器拒绝覆盖未知文件，不强行恢复旧版 App。

`python manage.py install --panel-only` 关闭内嵌挂载，只安装原生 sidecar 面板。需要账号原生 UI Extensions 已开放；这个模式不能保证出现模型旁的缩略条。

## 上下文窗口

状态栏显示环形占用指示与百分比；悬停查看“已用 / 剩余”比例、已用 Token 与容量、采样模型，以及 5h 和周额度余额、倒计时、重置时间。额度组选择和刷新也在同一张悬浮卡中。数值来自最近请求开始时的 `contextWindowMetadata.estimatedTokensUsed` / `maxContextTokens`，由宿主估计。不是会话累计输入量，也不是生成中的实时 Token 计数。

缺少容量时显示“容量不可用”，不按模型名称猜测上限。压缩上下文后允许占用下降；切换对话不会沿用上一个对话的数值。上下文与 tok/s、缓存统计一起按账户和对话保存，历史恢复值注明保存时间。

### 语言与缓存

默认英文。状态条的 **EN** 按钮切换中文，**中** 切回英文，选择会保存。缓存卡按 DSH 逻辑显示总 token、缓存命中、未缓存输入、缓存读取与输出；缓存写入非零时显示额外一行。

Antigravity 的 `inputTokens` 是未缓存输入。缓存率 = 缓存读取 ÷（未缓存输入 + 缓存读取 + 缓存写入），不是把缓存写入算作命中。总 token = 总输入 + 输出。

## 数据如何计算

| 项目 | 口径 |
| --- | --- |
| 会话 TPS | 有效请求的正文输出 token 总数 ÷ 对应流式时长总和 |
| 最近一次 TPS | 最近有效请求正文 token ÷ 流式时长 |
| TTFT | 请求首 token 时间的平均值；不计入正文流式 TPS |
| 模型用时 | 请求 TTFT 与流式生成时长相加 |
| 工具用时 | 工具执行区间合并后统计，重叠时间不重复计数 |
| 5h / 周余额 | 账户返回的 `remainingFraction`；不是货币金额 |
| 重置倒计时 | 账户返回的 `resetTime` 与当前时间之差 |

统计来自已完成请求，约每 2.2 秒检查，不宣称逐 token 的即时速率。额度每 60 秒刷新，倒计时每秒走动。
思考 token 单独列出；模型未拆分正文时会标明全部输出口径。缺少有效时长的请求不会计入 TPS。失联显示不可用或明确的旧数据状态。

## 对话统计持久化

已完成请求的 tok/s、cache 和数值统计自动保存到 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<账号哈希>/<对话ID>.json`。重载、重启、更新或重装插件都会保留。接口临时返回空数据或较少采样时，不覆盖已有有效统计；恢复值会在详情中注明保存时间。真实 0% 缓存命中率正常显示。

只保存白名单数值、模型和状态，不保存正文、标题、邮箱或凭据。确认当前账号后才读取该账号的历史。已经缺失的请求时长无法重建。打开 Antigravity 后执行 `node tools/check-live-history.mjs`，可补存当前接口仍能读取的所有历史对话，并验证重启恢复。

## 兼容性

当前实机验证：**Windows 11 / Antigravity App 2.21.1、2.22.0**；2.22.0 的真实上下文读取和合并悬浮卡已验收。Linux/macOS 的完整登录界面仍需用户实机验证，自动化覆盖范围见兼容性文档。

不适用于 Antigravity IDE、VS Code 扩展或 DSH。Linux / macOS 已适配原生路径、进程与端口发现、SDK 加载和 shell 安装器；三系统 CI 验证代码与生命周期，完整登录 App 的端到端验证范围见兼容性文档。
参考 DSH Rail Music 的项目组织与文档风格，但安装接口不同，不能使用 `dsh plugin add` 安装 Antigrative Dashboard。

[完整边界与更新策略 →](COMPATIBILITY.md)

## 常见问题

<details><summary><strong>安装后没出现？</strong></summary>

确认已完全退出主进程再启动 App，不只是关闭窗口。执行 `python manage.py status`；检查 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/logs/sidecar.log` 和 `data/integration-state.json`。日志不要直接公开，其中宿主产生的日志可能含本机信息。

</details>

<details><summary><strong>为什么新对话没有 tok/s？</strong></summary>

还没有请求统计时刻意隐藏，防止显示旧会话速率。完成一次模型响应后出现。

</details>

<details><summary><strong>为什么 Gemini 与 Claude/GPT 的余额不同？</strong></summary>

服务端返回两个独立共享额度组。控件默认跟随当前模型；在额度卡中可以切换查看另一组，手动选择其他组时会显示组名避免混淆。

</details>

<details><summary><strong>升级 Antigravity 后怎么办？</strong></summary>

App 更新不会覆盖用户插件目录中的适配器。后台重新发现端口、凭据和渲染窗口，并自动重连。未显示时检查 `python manage.py status`；宿主接口变化时可先用原生侧面板。不要把旧归档覆盖新版应用。详见[鲁棒性分析](docs/ROBUSTNESS.md)。

</details>

## 开发与发行

```powershell
npm test
python -m unittest discover -s tests -v
python manage.py package
```

ZIP 与 SHA256 文件输出到 `dist/`。打包使用文件白名单，不包含账号配置、凭据、日志、SDK 缓存或 App 归档。

[开发说明 →](docs/DEVELOPMENT.md) · [版本记录 →](CHANGELOG.md)

## 许可

Antigrative Dashboard 源码使用 [MIT](LICENSE) 许可证。项目不分发 Antigravity 的二进制、SDK 或 App 备份。Antigravity 名称属于其各自权利人，本项目与其无官方隶属关系。
