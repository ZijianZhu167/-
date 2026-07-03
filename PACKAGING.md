# 桌面程序打包说明

## 当前已支持

- Windows：Electron portable 单文件 `.exe`
- macOS：Electron `.dmg` / `.zip`，需要在 macOS 环境构建

## Windows 构建

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm ci
npm run dist:win
```

产物：

```text
release/Feishu Group Broadcast Bot 0.1.0.exe
```

## macOS 构建

在 macOS 上执行：

```bash
npm ci
npm run dist:mac
```

产物：

```text
release/*.dmg
release/*.zip
```

## 推荐分发方式

给 Windows 用户：

```text
Feishu Group Broadcast Bot 0.1.0.exe
```

给 macOS 用户：

```text
.dmg
```

## 使用者首次打开

首次打开后进入“设置”页面，填写：

- App ID
- App Secret
- 本地端口
- 发送间隔

保存后配置会写入系统应用数据目录，后续打开会自动读取。

## 不要随程序分发

- `.env`
- `data/*.json`
- `.runtime/`
- `node_modules/`

## 代码签名

当前构建是未签名版本。对外正式分发建议补充：

- Windows Authenticode 代码签名证书
- Apple Developer ID 签名和 notarization

否则 Windows SmartScreen 或 macOS Gatekeeper 可能提示来源未知。
