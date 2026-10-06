# 兼容性

| 项目 | 当前范围 |
| --- | --- |
| 系统 | Windows 11，已实机验证 |
| 应用 | Antigravity 桌面 App 2.19.1 |
| Python | 3.10+，只用于安装、卸载、打包；不需 pip 依赖 |
| Node.js | App 自带 Node.js 运行后台；开发测试建议 Node.js 24 |
| IDE / VS Code 扩展 | 未适配；本项目面向桌面 App |
| macOS / Linux | 未适配，不能按 Windows 安装步骤使用 |
| 其他 App 版本 | 安装器会拒绝未知版本，不自动升级或降级 App |

## 插件和加载器

后台是 Antigravity 的标准插件 sidecar，安装于 `~/.gemini/config/plugins/antigravity-pulse`。
模型选择旁的嵌入状态条没有公开挂载接口，因此需要修改本地 `resources/app.asar` 的三个加载文件。安装器保留原始归档并校验 SHA256。该适配是版本相关的，不能保证应用升级后持续工作。

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

App 更新可能覆盖加载器。先执行 `python manage.py status`，再查看新版本兼容性；不要把旧版本 `app.asar` 强行复制到新版应用。
卸载器只恢复与备份记录的补丁哈希完全一致的文件。存在未知修改时拒绝覆盖，并保留插件以便排查。
备份留在 `%LOCALAPPDATA%/AntigravityPulseBackups`，不会随开源源码或 release 包分发。
