# Antigrative Dashboard v0.5.2

修复主题配色、汉化兼容、语言保存和悬浮卡交互，并解决 macOS 日志路径与 Windows 后台发现问题。Windows、Linux、macOS 共用一个安装包。

## 本次解决的问题

### GitHub issues

- **[#1：macOS 无法读取统计](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/1)**：优先读取 `~/Library/Logs/Antigravity/language_server.log`，保留 profile 日志回退及 `AG_PULSE_LOG` 显式覆盖；回退端口仍校验当前进程归属，避免连接失效接口。
- **[#2：Windows 探测慢、旧后台残留](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/2)**：先筛选 standalone 进程，再用一次隐藏 netstat 快照匹配 PID 的监听端口。三平台增加原子后台所有权与启动锁；新实例接管后旧实例退出，实例专属 V4 绑定拒绝过期响应和注入，旧实例退出不会卸载新控件。
- **[#3：无法跟随自定义主题](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/3)**：强调色、控件、悬浮卡背景、菜单和文字跟随宿主实际生效的主题色。支持背景色单独变化、深浅切换以及 color-mix/OKLCH 表面色；文字对比度自动校正，移除自定义色时清理旧覆盖。仅传递白名单颜色，不传递或改写其他用户设置。
- **[#4：汉化后控件不显示](https://github.com/YOU-SHOULD-KNOW-ME/antigrative-dashboard/issues/4)**：采用提议中的 DOM 拓扑包含关系和 WAI-ARIA 语义，以可编辑输入区、稳定模型选择器和最近共同容器定位控件；不再依赖发送、录音、取消按钮的英文标签。支持深层嵌套、布局重建、隐藏候选和歧义保护。

### 其他修复

- **中英文配置重启丢失**：写入独立的原子 `preferences.json`，内嵌控件和侧面板共用。端口变化、后台重建、空浏览器缓存不再把中文恢复为英文；快速切换和旧响应不会覆盖新选择，保存失败会显示提示。
- **宿主“跳到底部”按钮遮住详情**：悬浮卡进入原生 popover 顶层，避免输入区层叠上下文造成遮挡；旧宿主保留固定定位回退。
- **点击额度组立即关闭悬浮卡**：避免点击冒泡触发宿主编辑器抢焦点，保持选择菜单与键盘交互；外部点击和 Escape 仍正常关闭。
- **切换 Claude/GPT 后出现多余文字**：删除工具栏冗余额度组标签，组选择保留在详情卡中。
- **刷新没有反馈**：点击后立即旋转并显示本地化忙碌提示；重复点击合并，后台轮询中的手动刷新排队执行，成功/失败都会复位，并支持系统“减少动态效果”。

## 安装 / 更新

下载 `antigrative-dashboard-0.5.2.zip` 与 `.zip.sha256`，核对 SHA-256 后解压至固定目录：

- Windows：`python manage.py install`，或 `./install.ps1`。
- Linux / macOS：`python3 manage.py install`，或 `sh install.sh`，无需 sudo。

在没有任务运行时完全退出并重新打开 Antigravity。默认安装不修改 `app.asar`，保留独立用户目录中的对话统计与语言设置。首次从没有后台接管保护的旧版本升级时，完全退出宿主尤为重要；新机制不会任意终止未知后台进程。

## 验证范围

- 面向 **Antigravity 桌面 App 2.21.1 / 2.22.0**；不是 IDE、VS Code 扩展或 iOS。
- 本轮修复已在 Windows 的真实 App 中验证。主题、顶层遮挡、菜单、刷新反馈、10 种汉化/布局场景及跨端口语言保存另有浏览器回归。
- 发布要求 Windows / Linux / macOS 的 Node 数据/路径/后台接管测试、Python 生命周期与 Chromium UI 测试全部通过；Linux/macOS 另检查固定官方桌面 2.21.1 资源和内嵌 SDK。
- **Linux/macOS 的本轮完整已登录 App GUI 尚未实机验收。** 路径 fixtures、CI 原生端口和浏览器示意界面不能替代真实宿主验证。宿主以后改变 DOM、调试通道、SDK 或统计协议仍可能需要适配。

不包含真实对话、凭据、用户统计、原始日志或宿主二进制。详细范围见 [COMPATIBILITY.md](COMPATIBILITY.md) 与 [鲁棒性分析](docs/ROBUSTNESS.md)。

## English summary

v0.5.2 fixes macOS log discovery (#1), slow Windows port discovery and stale sidecar ownership (#2), custom host accent/background/card/text adaptation (#3), and localized composer detection using DOM containment plus WAI-ARIA (#4). It also persists English/Chinese preferences across restarts, puts hover cards above host overlays, keeps quota-group menus open, removes redundant toolbar labels, and adds reliable refresh feedback with reduced-motion support.

One portable ZIP supports Windows, Linux and macOS. Publication is gated on three-platform data/lifecycle/Chromium regressions and official Linux/macOS resource/SDK checks. Real host acceptance for this batch was performed on Windows; signed-in macOS/Linux GUI acceptance remains outstanding.
