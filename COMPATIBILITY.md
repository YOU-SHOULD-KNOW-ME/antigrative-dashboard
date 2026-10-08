# 兼容性

| 项目 | 当前范围 |
| --- | --- |
| 系统 | Windows 11，已实机验证 |
| 应用 | Antigravity 桌面 App 2.21.1；旧版 2.19.1 使用历史加载器 |
| Python | 3.10+，只用于安装、卸载、打包；不需 pip 依赖 |
| Node.js | App 自带运行时；内嵌挂载要求内置 WebSocket，建议 Node.js 24 |
| IDE / VS Code 扩展 | 未适配；本项目面向桌面 App |
| macOS / Linux | 未适配，不能按 Windows 安装步骤使用 |
| 未来版本 | 自动尝试发现与连接；宿主接口变化可能需要更新插件 |

## 插件和加载器

后台是 Antigravity 的标准插件 sidecar，安装于 `~/.gemini/config/plugins/antigravity-pulse`。
模型选择旁的嵌入状态条没有公开挂载接口，现在由 sidecar 通过已有 loopback 渲染调试通道挂载。默认安装不修改 `resources/app.asar`。更新替换安装目录不会覆盖用户插件目录中的适配器。

每 3 秒检查并重连端口变化、启动文档替换和进程重启。未来关闭调试通道、改变 DOM、SDK 或 RPC 协议仍可能影响内嵌显示；原生侧面板保留采集入口。

`python manage.py status` 显示 `integrationMode` 和 `inlineIntegration`：`mounted` 为已挂载，`waiting-for-composer` 表示当前页面没有匹配输入区域，`reconnecting` 表示重试。状态包含 `checkedAt`，过期文件不能证明后台当前仍运行。

安装器不更改 Google 账号、请求代理、API 地区判定、模型和额度，也不修改功能实验开关。
它不能修复账号地区、订阅或网络问题。

## 额度和速率

- Gemini 与 Claude/GPT 返回独立额度组；同组模型共享额度。
- `remainingFraction` 是账户返回的比例；不代表金额，也不能换算成固定 token 数。
- 倒计时来自 `resetTime`，北京时间用于展示重置日期。
- TPS 是已完成请求的统计，正文 token 除以流式生成时长，再按总时长加权。
- 不把 TTFT、工具耗时或思考 token 算入正文流式 TPS。
- 如果模型未单独提供正文 token，会在详情中注明使用全部输出；没有有效时长则显示不可用。

## 更新与恢复

App 更新不会覆盖默认运行时适配器，后台重新发现端口、凭据和窗口。不要把旧版本 `app.asar` 强行复制到新版应用。
`install --legacy-loader` 显式启用旧模式，仅适配 2.19.1，仍可能被 App 更新覆盖；`--panel-only` 关闭内嵌挂载。
卸载器只恢复与备份记录的补丁哈希完全一致的文件。存在未知修改时拒绝覆盖，并保留插件以便排查。
备份留在 `%LOCALAPPDATA%/AntigravityPulseBackups`，不会随开源源码或 release 包分发。

## 会话持久化

每个账号哈希、每个对话 GUID 分别原子保存白名单统计到 sidecar 数据目录。确认当前账号后恢复；空数据或样本倒退不覆盖有效历史，真实 0% 缓存命中正常显示。更新和重装不会覆盖历史，卸载保留。恢复值在详情注明保存时间。

文件损坏、账号无法确认、从未保存且已删除的元数据无法恢复。磁盘失败时保留实时数值并显示保存提示。详见 [鲁棒性分析](docs/ROBUSTNESS.md)。
