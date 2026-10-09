# 开发与验证

## 结构

```text
plugin.json                 Antigravity 插件元数据
manage.py                   安装 / 开关 / 卸载 / 打包
compat/patch-loader.py      带备份和校验的版本适配器
compat/runtime-ui.mjs       默认发现、受限桥接与重连
compat/inline-widget.cjs    与模型选择同行的 Shadow DOM 控件
compat/ipc-host.cjs         主进程到本地 sidecar 的受限桥接
sidecars/panel/client.mjs   本地 LanguageServer 查询
sidecars/panel/metrics.mjs  速率、缓存、时长与额度转换
compat/i18n.cjs             两种界面共用的英文 / 中文词表
sidecars/panel/store.mjs    请求合并、短缓存与账户切换
sidecars/panel/history.mjs  按账号/对话原子保存白名单统计
sidecars/panel/sdk.mjs      已安装 App SDK 的加载兼容
tests/                     生命周期验证
.github/workflows/ci.yml    Windows/Linux/macOS CI 与发行包检查
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

安装代码不携带任何账号凭据。sidecar 发现当前 standalone 进程凭据并校验端口归属，不使用可能过期的环境凭据；凭据只在后台内存使用。
本地 RPC 返回的会话正文不会发给控件；前端只收到数值、状态和模型名称。速率计算使用后台原始元数据，采集后不将完整轨迹落盘。
SDK 兼容器从用户已安装的应用读取所需资源并存入私有运行目录；仓库和发行包不分发 Antigravity 的二进制、SDK 源码或备份。

## 手动实机验证

完整故障矩阵见 [ROBUSTNESS.md](ROBUSTNESS.md)。`node tools/check-live-history.mjs` 实机补存当前账号历史并检查重启恢复，写入本地统计，不输出正文或凭据。

首次安装后完全重启 App；新对话应只有额度，已有会话应出现 TPS、缓存与上下文。上下文缺容量应显示不可用，悬停注明请求开始时估计。
悬停三项显示相应卡片；打开额度组菜单，等待至少三次轮询，菜单应保持打开。选择另一个组后比例和倒计时应一并切换。
执行 disable 后缩略条隐藏，enable 后恢复；uninstall 后完整重启，控件消失。默认安装/更新/卸载不改原生 app.asar；迁移旧加载器才尝试经过 SHA256 校验的恢复。
