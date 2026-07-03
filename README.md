# 飞书群发机器人

这是一个飞书群消息批量发送工具。它使用企业自建应用机器人身份，把文本消息发送到机器人已加入的群。

现在支持两种形态：

- 桌面程序：打包成 Windows/macOS 可执行应用，用户不需要安装 Node.js。
- 源码运行：适合开发调试，仍可用 `npm start` 启动本地服务。

## 桌面程序使用

第一次打开程序会进入“设置”页面，需要填写：

- `App ID`：飞书自建应用的 `cli_xxx`
- `App Secret`
- 本地端口，默认 `8787`
- 发送间隔，默认 `350ms`

保存后，后续打开会自动读取上次配置。主页面右上角有“设置”按钮，可以随时调整配置。

端口修改后需要重启程序才会生效。

## 飞书前置条件

1. 在飞书开放平台创建企业自建应用，并启用机器人能力。
2. 给应用开通权限：
   - `im:message`：发送消息。
   - `im:chat:read`：同步机器人所在群列表。
3. 发布或启用应用，并把机器人拉进需要接收消息的群。

## 构建 Windows 程序

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm ci
npm run dist:win
```

产物位置：

```text
release/Feishu Group Broadcast Bot 0.1.0.exe
```

这是 portable 单文件版本，双击即可运行。

## 构建 macOS 程序

macOS 程序建议在 macOS 机器或 GitHub Actions 的 `macos-latest` 上构建：

```bash
npm ci
npm run dist:mac
```

产物在：

```text
release/
```

会生成 `.dmg` 和 `.zip`。

## 源码运行

```bash
npm install
npm start
```

打开：

```text
http://localhost:8787
```

源码运行仍可使用 `.env` 配置；桌面程序会把配置保存到系统应用数据目录。

## 使用方式

1. 点击“同步机器人所在群”，获取机器人已经加入的群。
2. 勾选目标群。
3. 填写消息内容。
4. 点击“发送”。

发送结果会保存在本机数据目录。

## 自动构建

仓库里包含 GitHub Actions 工作流：

```text
.github/workflows/build-desktop.yml
```

手动触发后会分别在 Windows 和 macOS 环境构建产物，并上传 artifacts。

## 重要限制

- 机器人必须已经在目标群里。
- 权限变更后，通常需要重新发布应用或管理员重新授权。
- 批量发送会按顺序执行，并按 `SEND_INTERVAL_MS` 控制间隔。
- 当前 Windows/macOS 产物默认未做代码签名；分发给外部用户时，系统可能提示来源未知。
