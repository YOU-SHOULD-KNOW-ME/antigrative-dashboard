# 开发与验证

## 结构

```text
plugin.json                 Antigravity 插件元数据
manage.py                   安装 / 开关 / 卸载 / 打包
compat/patch-loader.py      带备份和校验的版本适配器
compat/inline-widget.cjs    与模型选择同行的 Shadow DOM 控件
compat/ipc-host.cjs         主进程到本地 sidecar 的受限桥接
sidecars/panel/client.mjs   本地 LanguageServer 查询
sidecars/panel/metrics.mjs  速率、时长与额度转换
sidecars/panel/store.mjs    请求合并、短缓存与账户切换
sidecars/panel/sdk.mjs      已安装 App SDK 的加载兼容
tests/                     生命周期验证
.github/workflows/ci.yml    Windows CI 与发行包检查
```

## 测试

```powershell
npm test
python -m unittest discover -s tests -v
python manage.py package
```

无 npm / pip 第三方依赖。Node.js 测试涵盖 TPS 加权、思考与 TTFT 分离、缺失计时、请求去重、重叠工具时间、额度边界、重置到期、账户切换、失联及分页。
Python 测试在临时目录验证安装、启停、卸载、备份恢复、未知修改拒绝和发行包排除规则，不操作用户 App。

## 本地实时预览

```powershell
node sidecars/panel/main.mjs
```

打开 `http://127.0.0.1:17891` 查看独立面板。`/toolbar-preview?new` 验证新对话同行布局，`/toolbar-preview` 会关联最近活动会话。需要 App 已启动。

## 数据边界

安装代码不携带任何账号凭据。sidecar 使用 App 注入的凭据或在本机发现运行进程，凭据只在后台内存使用。
本地 RPC 返回的会话正文不会发给控件；前端只收到数值、状态和模型名称。速率计算使用后台原始元数据，采集后不将完整轨迹落盘。
SDK 兼容器从用户已安装的应用读取所需资源并存入私有运行目录；仓库和发行包不分发 Antigravity 的二进制、SDK 源码或备份。

## 手动实机验证

首次安装后完全重启 App；新对话应只有额度，已有会话应出现 TPS。
悬停三项显示相应卡片；打开额度组菜单，等待至少三次轮询，菜单应保持打开。选择另一个组后比例和倒计时应一并切换。
执行 disable 后缩略条隐藏，enable 后恢复；uninstall 后完整重启，原始界面和无插件的安装归档应恢复。
