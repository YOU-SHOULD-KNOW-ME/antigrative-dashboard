<div align="center">

<img src="docs/assets/hero.png" width="100%" alt="Antigrative Dashboard：速度与额度，就在模型选择旁。">

# Antigrative Dashboard

把生成速率、5 小时余额和周余额，放在模型选择的同一行。<br>
缩略信息常驻；鼠标悬停，才展开详细统计。

[![Version 0.2.0](https://img.shields.io/badge/version-0.2.0-91adff?style=flat-square&labelColor=252936)](CHANGELOG.md)
[![Windows](https://img.shields.io/badge/host-Windows-83d8b9?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![Antigravity 2.19.1](https://img.shields.io/badge/Antigravity-2.19.1-c5a0ff?style=flat-square&labelColor=252936)](COMPATIBILITY.md)
[![MIT](https://img.shields.io/badge/license-MIT-d4d9e6?style=flat-square&labelColor=252936)](LICENSE)

[看看效果](#看看效果) · [开始安装](#安装) · [启用与停用](#可插拔) · [兼容性](#兼容性) · [常见问题](#常见问题)

</div>

## 看看效果

<img src="docs/assets/widget.png" width="100%" alt="与模型选择同一行的速率、5h 余额、周余额，以及悬停展开的统计卡。">

<sub>封面和效果图使用示意数据重绘，不展示真实账户额度、账号或对话。实际插件的数据来自本机 Antigravity 接口。</sub>

**不用打开一个监控面板，继续你的对话。**

| 看见速度 | 知道余额 | 少一点打扰 |
| --- | --- | --- |
| 会话加权 TPS、最近一次请求速率、模型 / 工具用时和首 token 时间。 | Gemini 与 Claude/GPT 的独立 5h、周余额及重置倒计时。 | 缩略条与模型选择同行；悬停展开；新对话尚无请求时不显示空 TPS。 |

### 它还处理了这些细节

- **菜单保持稳定。** 打开额度组菜单时，轮询不会重建控件或关闭菜单，倒计时继续更新。
- **用真实数据。** 余额读取账户接口，不根据生成字数推测，不将重置到期自动改成 100%。
- **切换对话。** 统计跟随当前会话，新对话不沿用上一段对话的速率。
- **可拔出。** 停用隐藏控件，卸载恢复原始加载器；未知 App 修改会阻止覆盖。
- **适合紧凑窗口。** 窗口空间不足时，缩略条隐藏倒计时；完整倒计时始终在悬停卡中。
- **不上传采集数据。** 后台使用本机 loopback 接口，数值留在你的电脑。

## 安装

适用于 **Windows 的 Antigravity 桌面 App 2.19.1 + Python 3.10+**。无 pip / npm 第三方依赖，后台使用 App 自带 Node.js。完整支持范围见 [COMPATIBILITY.md](COMPATIBILITY.md)。

> 模型选择旁的内嵌位置没有公开插件挂载接口。Antigrative Dashboard 使用标准 sidecar 插件采集数据，再通过带备份的本地加载器适配嵌入界面。它会修改 `resources/app.asar` 的三个加载文件，卸载可恢复。不是官方插件，不保证其他版本或 App 更新后的兼容性。

### 手动安装

下载 [最新 Release](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/releases/latest) 的 ZIP 并解压，或克隆仓库：

```powershell
git clone https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard.git
cd antigrative-dashboard
python manage.py install
```

完全退出并重新打开 Antigravity。打开对话，模型选择右侧就会出现额度与速率条。PowerShell 用户也可以运行 `./install.ps1`。

安装器会检查版本、复制插件、备份归档、应用加载器并启用插件。不兼容时不会自动升级或替换你的 App。**保留这个源码 / 解压目录**，以便启停、升级和卸载。

<details>
<summary><strong>让 Agent 帮你安装：展开完整提示词</strong></summary>

```text
请帮我安装并启用 Antigrative Dashboard。
仓库：https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard
目标：在 Antigravity 模型选择旁显示 tok/s、5h 余额与倒计时、周余额与倒计时。

1. 读取 README.md 和 COMPATIBILITY.md，确认 Windows、Antigravity 桌面
   App 2.19.1、Python 3.10+。不要自动升级、降级或替换我的 App。
2. 将项目克隆 / 解压到固定目录，不在临时下载目录运行。
3. 用 python manage.py status 检查已有状态，再执行 python manage.py install。
   保留其他插件配置，使用自带备份和完整性校验。
4. 安装后完全重启 Antigravity；如果有任务正在执行，先告知需要重启，
   不要强制结束任务。
5. 验证新对话只显示额度，有请求的对话显示 TPS；悬停显示详情。
   打开额度组菜单等待多次轮询，确认不会被刷新关闭。
6. 报告安装结果、版本、备份位置和实机验证范围。
```

</details>

## 可插拔

在项目目录运行：

| 操作 | 命令 | 行为 |
| --- | --- | --- |
| 安装 / 更新插件 | `python manage.py install` | 备份并应用对应版本的加载器，保留其他配置 |
| 停用 | `python manage.py disable` | 关闭插件，缩略条在下一次轮询隐藏 |
| 启用 | `python manage.py enable` | 启动插件并重新显示控件 |
| 查看状态 | `python manage.py status` | 检查安装、开关和归档恢复条件 |
| 卸载 | `python manage.py uninstall` | 校验后恢复原归档，移除本插件目录 |

首次安装、更新加载器或卸载之后需要完整重启 App。启停开关不需要重装或再次修改归档。`./uninstall.ps1` 等同于卸载命令。

**恢复资料会保留。** 原始归档在 `%LOCALAPPDATA%/AntigravityPulseBackups/<时间戳>/`；卸载保留备份与诊断日志。遇到 App 升级或其他修改时，卸载器拒绝覆盖未知文件，不强行恢复旧版 App。

`python manage.py install --panel-only` 只安装原生 sidecar，不修改加载器。需要账号原生 UI Extensions 已开放；这个模式不能保证出现模型旁的缩略条。

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

## 兼容性

当前实机验证：**Windows 11 / Antigravity App 2.19.1**。

不适用于 Antigravity IDE、VS Code 扩展或 DSH；未适配 macOS / Linux。
参考 DSH Rail Music 的项目组织与文档风格，但安装接口不同，不能使用 `dsh plugin add` 安装 Antigrative Dashboard。

[完整边界与更新策略 →](COMPATIBILITY.md)

## 常见问题

<details><summary><strong>安装后没出现？</strong></summary>

确认已完全退出主进程再启动 App，不只是关闭窗口。执行 `python manage.py status`；检查 `~/.gemini/antigravity/sidecar_data/antigravity-pulse/panel/logs/sidecar.log` 和 `widget.log`。日志不要直接公开，其中宿主产生的日志可能含本机信息。

</details>

<details><summary><strong>为什么新对话没有 tok/s？</strong></summary>

还没有请求统计时刻意隐藏，防止显示旧会话速率。完成一次模型响应后出现。

</details>

<details><summary><strong>为什么 Gemini 与 Claude/GPT 的余额不同？</strong></summary>

服务端返回两个独立共享额度组。控件默认跟随当前模型；在额度卡中可以切换查看另一组，手动选择其他组时会显示组名避免混淆。

</details>

<details><summary><strong>升级 Antigravity 后怎么办？</strong></summary>

升级可能覆盖加载器，旧版适配器不能保证兼容。查看兼容性说明，不把旧归档覆盖新版应用。安装器会拒绝未知版本。

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
