<div align="center">

<img src="docs/assets/hero-zh.png?v=0.8.0" width="100%" alt="Antigrative Dashboard：最新版速度、缓存和上下文控件，就在输入框旁。">

# Antigrative Dashboard

模型选择旁只显示生成速率、缓存和上下文占用；悬停上下文，一并查看上下文、5 小时和周额度详情。<br>
缩略信息常驻；鼠标悬停，才展开详细统计。

[![Version 0.8.7](https://img.shields.io/badge/version-0.8.7-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/host-Windows%20%7C%20Linux%20%7C%20macOS-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.21.1 / 2.22.0](https://img.shields.io/badge/Antigravity-2.21.1%20%2F%202.22.0-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[看看效果](#看看效果) · [IDE](#antigravity-ide) · [CLI](#antigravity-cli-状态栏) · [开始安装](#安装) · [启用与停用](#可插拔) · [兼容性](#兼容性) · [常见问题](#常见问题)

</div>

**v0.8.7 补丁：** 新增 App 更新进度条并优化用量页启动。安装包已刷新、版本号不变；已安装 v0.8.7 的用户请手动重装补丁包。

**v0.8.7 更新：** 补齐可读取的历史 Token 用量，支持完整分页、失败重试和进度恢复；修复长对话中用量窗口开关卡顿，并加入经过加固的 App 手动更新。保留年度热力图和现有图表。[更新说明](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/tag/v0.8.7)。

## 看看效果

<img src="docs/assets/responsive-zh.png?v=0.8.0" width="100%" alt="最新版主对话窄窗口三图标布局，以及子代理输入框旁的独立统计。">

<table>
<tr><th width="50%">生成速度与缓存</th><th width="50%">上下文与共享额度</th></tr>
<tr>
<td width="50%" valign="top"><img src="docs/assets/speed-zh.png?v=0.8.0" width="100%" alt="最新版生成速度详情卡"><br><img src="docs/assets/widget-zh.png?v=0.8.0" width="100%" alt="最新版 Token 用量与缓存详情卡"></td>
<td width="50%" valign="top"><img src="docs/assets/context-zh.png?v=0.8.0" width="100%" alt="最新版上下文、5h 和周额度详情，以及持久化语言切换入口"></td>
</tr>
</table>

<table>
<tr><th width="50%">每日 / 每周活动</th><th width="50%">按模型统计用量</th></tr>
<tr>
<td width="50%"><img src="docs/assets/usage-overview-zh.png?v=0.8.0" width="100%" alt="最新版 Token 用量活动概览，支持每日和每周贡献图"></td>
<td width="50%"><img src="docs/assets/usage-details-zh.png?v=0.8.0" width="100%" alt="最新版模型用量柱状图，支持天周月切换和主题配色"></td>
</tr>
</table>

<sub>使用当前控件源码和示意宿主布局渲染，数值为示例。主对话与子代理统计分别展示，账号额度共享；44% 上下文读取最近请求开始时的估计值，不是累计输入。实际插件的数据来自本机 Antigravity 接口，中英文选择会保存。</sub>

**不用打开一个监控面板，继续你的对话。**

| 看见速度 | 知道余额 | 少一点打扰 |
| --- | --- | --- |
| 会话加权 TPS、最近一次请求速率、模型 / 工具用时和首 token 时间。 | Gemini 与 Claude/GPT 的独立 5h、周余额及重置倒计时。 | 缩略条与模型选择同行；悬停展开；新对话尚无请求时不显示空 TPS。 |

### 它还处理了这些细节

- **防误触悬停与快速切换。** 首次悬停等待 250 毫秒，点击或键盘聚焦立即打开；卡片展开期间，以及鼠标离开控件后的 350 毫秒内，切换指标无需等待。提前移开鼠标、切换对话或替换输入区会取消尚未打开的弹窗。
- **菜单保持稳定。** 打开额度组菜单时，轮询不会重建控件或关闭菜单，倒计时继续更新。
- **用真实数据。** 余额读取账户接口，不根据生成字数推测，不将重置到期自动改成 100%。
- **切换对话。** 统计跟随当前会话，新对话不沿用上一段对话的速率。
- **子代理独立统计。** 输入框旁显示当前子代理的 tok/s、缓存率和上下文；详情区分子代理统计和账号共享额度。父子对话切换立即刷新，旧响应不能覆盖新页面或返回同一对话后的新数值。
- **Teamwork 兼容（v0.8.1）。** 发送、停止、取消状态切换时保留控件，支持深层嵌套和无 `title`／`span` 的静态代理徽章。优先读取当前输入框所属的 DOM 会话标识，URL 不变时也能切换统计；忽略隐藏、禁用及更深层输入框，存在歧义时不随意挂载。中英文六层嵌套浏览器夹具已覆盖用量入口重新挂载和上下文至用量窗口的语言同步。Windows 真实三级委派已检查独立统计、返回主对话与生成中截图；该宿主每层改变 URL、只渲染一个输入框，URL 不变和六层 DOM 场景仍属夹具覆盖。Linux/macOS 登录后界面检查仍待完成。
- **更新后自动连接。** 适配器保存在用户插件目录，默认安装不修改 App 归档。
- **对话统计持久化。** 每个账号、每个对话分别保存 tok/s 与 cache，重新加载后可恢复。
- **适合紧凑窗口。** 完整数值放不下时先保留仪表盘、数据库和上下文圆圈三个图标，仍可悬停或点击查看详情；语言切换保留在上下文卡里。连图标都放不下或确实碰撞宿主按钮时才隐藏，拉宽后恢复。消息按钮滚到输入框后面不会再导致控件消失。
- **跟随主题配色。** 控件、悬浮卡和额度菜单跟随 Antigravity 的深浅模式及自定义背景、卡片、文字和强调色，并保持文字可读；独立预览跟随系统，切换主题无需重启或重新加载对话。
- **语言设置跨重启保留。** 中英文选择写入独立的 `AntigravityPulse/preferences.json` 用户配置，控件和侧面板共用；不依赖应用每次启动的本地端口。
- **不上传采集数据。** 后台使用本机 loopback 接口，数值留在你的电脑。

## Antigravity IDE

**v0.7.0** 新增反重力自己的独立 IDE 适配。下载发布页的
`antigrative-dashboard-ide-0.8.7.vsix`，在 IDE 扩展页选择「从 VSIX 安装」。
仅安装 IDE 的用户也可以使用，无需先装桌面 App。

完全退出 IDE 后，使用带
`--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`
参数的启动方式打开；将参数加到快捷方式目标末尾，后续继续使用该快捷方式。
窄栏显示三个可交互图标，拉宽后显示数值；悬停或点击即可查看详情。

Windows IDE **2.5.5** 已验证真实对话。Linux/macOS IDE 有自动化覆盖，登录后的
实机 GUI 验收尚未完成。VS Code、Visual Studio、JetBrains、Zed、Xcode 中的
Antigravity 扩展目前尚未兼容。详见 [IDE 安装、更新、诊断和数据清理](ide/README.md)。
上方演示图是桌面 App 控件，不是 IDE 界面截图。

## Antigravity CLI 状态栏

**v0.6.0 新增**独立的 CLI 官方状态栏适配：上下文占用、缓存读取 Token、状态、分组额度及重置倒计时，支持中英文和终端宽度适配。额度数字和进度条按剩余量显示：**≥70% 绿色、≥30% 且 <70% 黄色、<30% 红色**。预览：`node cli/statusline.mjs --preview --language zh-CN`；安装：`python manage.py install-cli`（Linux/macOS 用 `python3`）。需要 Node.js 20+ 和支持官方接口的 CLI。v0.8.1 新增当前请求缓存率：适用 CLI 1.3.2/1.3.3 的 Sonnet 4.6、GPT-OSS 120B 及 CLI 1.3.3 的 Gemini 3.8 Flash (High) 已核实口径且写入为零；未确认情况保留不可用。官方输入没有流式耗时，暂不显示 tok/s。详见 [CLI 使用及撤回](docs/CLI.md)。

![真实 Antigravity CLI 两轮对话及当前请求缓存率](docs/assets/cli-conversation-zh.png?v=0.8.4-cli-1)

<sub>Linux Antigravity CLI 1.3.3 真实中文两轮对话，当前请求缓存率 95.4%、缓存读取 13.1K；账号邮箱已遮挡。macOS 登录后的交互实机验收尚未完成。</sub>

## 安装

以下命令安装**桌面 App 适配器**；IDE 用户请使用[上方专用 VSIX 安装流程](#antigravity-ide)。

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
1. 读取 README.md、COMPATIBILITY.md、docs/CLI.md 和 ide/README.md。先用只读检查
   分析系统、可执行文件、宿主版本和已有插件配置，区分桌面 App、Antigravity CLI
   （agy）和独立 Antigravity IDE；不能仅凭系统判断安装目标。
2. 下载安装包或修改配置前，向我说明检测到哪些宿主，并让我明确确认要安装
   App、CLI 还是独立 IDE 适配。如同时安装了多个，让我选一个或多个；无法识别
   则询问可执行文件路径。不要因为我是 Linux 或在终端里就默认安装桌面端。
3. 查询最新稳定发布，说明插件版本、宿主版本和路径、选定适配器。App 与 CLI
   共用 ZIP，但安装命令不同；独立 IDE 使用单独 VSIX。只下载已确认目标需要的
   文件并校验 SHA256，将源码解压到固定目录。不要未经单独确认安装、升级、
   降级或替换 Antigravity 宿主。
4. 使用 Python 3.10+（Linux/macOS 通常用 python3），按确认的目标执行：
   - App：先 python manage.py status，再 python manage.py install。
   - CLI：检查 agy --version 和 Node.js 20+，执行 python manage.py install-cli，
     不要执行 manage.py install。已有 statusLine 按 CLI 文档备份／覆盖流程处理。
     CLI 缓存率有适用条件，按 docs/CLI.md 核对实测模型／版本及不可用情况。
     不承诺 CLI 展示 tok/s 或本地用量图表，这些不在 CLI 适配范围内。
   - 独立 IDE：通过 Install from VSIX... 安装发布版 VSIX，或使用
     ide/manage.py install --exe <已核实的IDE可执行文件> --vsix <发布版VSIX>。
     不需要桌面 App，不要执行 App 安装器。
5. 保留其他设置和已保存数据。需要重启或登录时先告知，不强制结束正在执行的
   任务。IDE 按文档保留本机回环调试启动参数；CLI 在新会话中验证。
6. 在选定的真实宿主中验证，报告插件／宿主版本、安装目标和路径、实际完成的
   检查、剩余步骤，以及该适配器的停用／卸载方法。下载 ZIP 不代表 CLI 已安装成功。
```

</details>

## 可插拔

### 打开 App 侧边栏面板

用右上角开关展开右侧辅助栏，在辅助栏顶部点击 **＋ → Extensions → Antigrative Dashboard**，即可打开插件的常驻仪表盘。速度、缓存、上下文和额度摘要持续显示；点击数据卡切换详情，鼠标移开不再隐藏。长内容在固定详情区内部滚动，也可用方向键／Home／End 选择标签页。输入框控件中打开的「用量统计」是另一个窗口。

更新插件代码后请完整退出并重新打开 App，让采集进程加载新模块；重启前已经打开的面板可能仍由旧采集进程提供页面。

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

默认英文。首次使用时，主对话上下文控件旁会出现轻量双语提示；点击后打开详情并定位到底部的 **English / 简体中文** 按钮。语言选择会保存，之后仍可随时在上下文详情底部切换。选择语言或关闭提示后不再重复引导；关闭提示不会改变已有语言，保存失败会显示提示并允许重试。子代理界面不重复显示首次引导。

缓存卡按 DSH 逻辑显示总 token、缓存命中、未缓存输入、缓存读取与输出；缓存写入非零时显示额外一行。

Antigravity 的 `inputTokens` 是未缓存输入。缓存率 = 缓存读取 ÷（未缓存输入 + 缓存读取 + 缓存写入），不是把缓存写入算作命中。总 token = 总输入 + 输出。

## 数据如何计算

| 项目 | 口径 |
| --- | --- |
| 会话 TPS | 有效请求的正文输出 token 总数 ÷ 对应流式时长总和 |
| 最近一次 TPS | 最近一次请求正文 token ÷ 流式时长；计时异常或缺失时不显示速率 |
| TTFT | 请求首 token 时间的平均值；不计入正文流式 TPS |
| 模型用时 | 请求 TTFT 与流式生成时长相加 |
| 工具用时 | 工具执行区间合并后统计，重叠时间不重复计数 |
| 5h / 周余额 | 账户返回的 `remainingFraction`；不是货币金额 |
| 重置倒计时 | 账户返回的 `resetTime` 与当前时间之差 |

统计来自已完成请求，约每 2.2 秒检查，不宣称逐 token 的即时速率。额度每 60 秒刷新，倒计时每秒走动。
思考 token 单独列出；模型未拆分正文时会标明全部输出口径。缺少有效时长的请求不会计入 TPS。失联显示不可用或明确的旧数据状态。

### 计时异常处理

输出集中到达时，宿主可能只记录到几毫秒的流式时长，导致 TPS 虚高。这个短窗口不一定代表模型实际生成所用的时间。插件会先检查计时质量，再计算会话 TPS，不给速度设上限，也不编造更长的生成时长。

- **不计入 TPS 的请求：** Token 统计范围不一致、同一请求的重复记录冲突、多次尝试的用量不同但没有各自对应的计时，以及计算结果无效。对于纯工具输出，如果流式时长不足 1 秒、TTFT 至少 2 秒，且 TTFT 至少是流式时长的 20 倍，也视为计时不可靠。
- **同模型基线检查：** 至少有 5 次时长达到 1 秒的有效采样后，若短时采样的速率超过 `max(中位数 × 8，中位数 + MAD × 12)`，则不计入 TPS。基线限定为同一模型、供应商和 Token 口径；MAD 指各采样偏离中位数的绝对值的中位数。
- **仍计入的请求：** 普通短文本请求和持续的高速度请求仍可参与统计，不因数值高就排除持续采样。异常请求的 Token 和缓存用量也完整保留；排除速率不等于删除请求或用量。
- **界面与历史恢复：** 最近一次请求计时不可靠时显示“计时异常”，不拿上一条请求的速度代替。没有有效样本时 TPS 显示不可用。旧算法保存的速率会等待完整对话数据重新计算，Token、缓存与上下文保留，重载后不会重新使用旧的未校验 TPS。

这些规则是针对宿主耗时摘要的保守判断，不代表已证实输出缓冲。当前本地接口未提供逐片段时间记录，无法恢复缺失的服务端生成时间。使用界面只保留简洁的统计方式，具体筛选规则在项目说明中解释。桌面版和独立 IDE 共用这些规则。详见[计时策略与限制](docs/TPS.md)，参考 DSH 讨论 [#7960](https://github.com/deepseek-ai/deepseek-harness/discussions/7960) 和 [#6129](https://github.com/deepseek-ai/deepseek-harness/discussions/6129)。

### 紧凑卡片的统计口径

卡片只展示可读取的数值，缺失值显示「—」，不逐项添加不等号，也不展开计算说明或缺失请求计数。后台仍保留不完整／未知覆盖标记；可读数据的合计可能缺少宿主未返回的用量，不代表完整账单。缓存率只使用可校验输入，零输入不编造百分比。正文／思考输出独立于缓存是否可用，继续计入统计。

## 对话统计持久化

上下文百分比使用当前请求的宿主窗口容量。紧凑卡片只展示占用、已用／总量、采样模型和两档额度／重置时间；重复容量参考、未知压缩字段、日志文本估算和计算说明不占据卡片。后台仍分别保存来源参考与保守诊断，不改变宿主分母或计费用量。详见[上下文口径与资料来源](docs/CONTEXT_LIMITS.md)。

已完成请求的 tok/s、cache 和数值统计自动保存到 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/history-v1/<账号哈希>/<对话ID>.json`。重载、重启、更新或重装插件都会保留。接口临时返回空数据或较少采样时，不覆盖已有有效统计；恢复值会在详情中注明保存时间。真实 0% 缓存命中率正常显示。

只保存白名单数值、模型和状态，不保存正文、标题、邮箱或凭据。确认当前账号后才读取该账号的历史。已经缺失的请求时长无法重建。打开 Antigravity 后执行 `node tools/check-live-history.mjs`，可补存当前接口仍能读取的所有历史对话，并验证重启恢复。

## 长对话采集

步骤与生成统计分开按偏移读取，生成元数据请求关闭消息正文。大段文本和工具输出流式跳过，后续刷新只重读可能变化的尾部。已移除整包 512MiB 响应限制；统计缓存仍有基于资源测试选择的工程预算，超出时明确提示，不截断后伪造完整统计。详见[采集策略、实验依据与限制](docs/LONG_CONVERSATIONS.md)。

## 本地 Token 用量统计

打开缓存 / 数据库图标，点击「查看用量统计」。入口以两列展示今日和本月用量；活动概览提供每日 / 每周贡献图，用量详情提供按模型区分的天、周、月柱状图。模型颜色跟随实际主题和强调色；K/M/B 摘要最多显示一位小数，表格与提示保留完整数值。

首次使用提示说明历史导入、统计范围与隐私。点击「知道了」后保存完成状态，重启、换语言、换主题都不会重复弹出。直接关闭窗口则保留提示；保存失败可以重试。

启动时汇总当前账号可读取的本地历史对话，此后每 60 秒检查历史；新完成请求随正常轮询记录。独立的 `usage-v1` 用量账本按账号去重，只保存时间、模型、Token 计数和哈希标识，不保存正文、回复或凭据。桌面与 IDE 账本独立。删除对话不会扣除已记录用量；这是本地已观察到的消耗，不是供应商账单，缺失或已删除的历史可能无法补齐。天、月按 UTC+8 划分，周一开始一周。

桌面路径：`~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/data/usage-v1/`（宿主可覆盖数据目录）。IDE 路径：其用户目录下的 `User/globalStorage/you-should-know-me.antigrative-dashboard-ide/usage-v1/`。清理前先停用插件；再次启用后，仍可读取的对话会重新导入。`history-v1` 继续单独保存每个对话最新的统计快照。[统计口径、清理和边界](docs/USAGE.md)。

## 兼容性

当前实机验证：**Windows 11 / Antigravity App 2.21.1、2.22.0**；2.22.0 的真实上下文读取和合并悬浮卡已验收。Linux/macOS 的完整登录界面仍需用户实机验证，自动化覆盖范围见兼容性文档。

独立 Antigravity IDE 2.5.5 提供单独 VSIX，Windows 已实机验证。其他编辑器扩展和 DSH 暂不支持。Linux/macOS 桌面版已适配原生路径、后台发现和 shell 安装器；IDE 有自动化覆盖，完整登录界面仍待实机验收，详见兼容性文档。
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

## App 手动更新

在**上下文详情 → 右下角 ⋯ → 检查更新**中手动检查稳定发行版。更新器只更新 App 插件，校验官方包与 SHA-256，保留设置和用量记录；安装完成后可重新加载插件。失败或中断时保留回滚与恢复材料。IDE 和 CLI 仍使用各自安装方式。[校验、恢复及边界说明](docs/UPDATES.md)。
