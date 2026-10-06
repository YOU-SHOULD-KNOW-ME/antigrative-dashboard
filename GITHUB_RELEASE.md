# Antigrative Dashboard v0.2.0

DSH 风格的 Antigravity 输入框小控件：会话 tok/s、5h / 周余额及重置倒计时。

## 下载和安装

下载 `antigrative-dashboard-0.2.0.zip`，校验对应 `.zip.sha256` 文件，解压到固定目录。

```powershell
cd antigrative-dashboard
python manage.py install
```

完全退出并重新打开 Antigravity。缩略信息位于模型选择同一行；悬停显示详细统计。

## 插拔命令

```powershell
python manage.py disable
python manage.py enable
python manage.py status
python manage.py uninstall
```

## 当前兼容范围

Windows / Antigravity 桌面 App 2.19.1 / Python 3.10+。内嵌位置使用本地加载器适配并保留完整归档备份；不保证 App 更新后的兼容性。未知归档修改不会被卸载器覆盖。

此发行包不含用户账号、凭据、对话、日志、SDK 缓存或 Antigravity 安装归档。
