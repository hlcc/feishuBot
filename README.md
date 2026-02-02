# OpenClaw Feishu Channel Plugin

飞书 (Lark) 消息渠道插件，用于 OpenClaw AI 网关。

## 快速开始

```bash
# 安装插件
openclaw plugins install ./path/to/openclaw-channel-feishu

# 一键配置
openclaw feishu setup
```

按提示输入飞书 App ID 和 App Secret，自动完成配置。

然后重启 OpenClaw：
```bash
openclaw restart
```

## 功能特性

- ✅ WebSocket 长连接接收飞书事件
- ✅ 支持私聊和群聊
- ✅ 支持文本、图片、文件消息
- ✅ 群聊 @提及过滤
- ✅ 消息分块发送（超长消息自动拆分）
- ✅ Markdown 卡片消息

## CLI 命令

```bash
# 交互式安装配置
openclaw feishu setup

# 查看当前状态
openclaw feishu status

# 卸载清理
openclaw feishu uninstall
```

## 手动配置

```bash
# 从本地路径安装
openclaw plugins install ./path/to/openclaw-channel-feishu

# 开发模式（热重载）
openclaw plugins install -l ./path/to/openclaw-channel-feishu
```

## 配置

在 OpenClaw 配置文件 (`~/.openclaw/openclaw.json`) 中添加：

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxxxxx",
      appSecret: "xxxxxxxxxxxxxxxx",
      dmPolicy: "open",           // open, pairing, allowlist, disabled
      groupPolicy: "open",        // open, disabled, allowlist
      requireMention: true,       // 群聊是否需要 @机器人
      textChunkLimit: 4000        // 消息分块长度
    }
  }
}
```

## 飞书应用配置

1. 访问 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用
2. 获取 App ID 和 App Secret
3. 在「事件订阅」中：
   - 选择「使用长连接接收事件」模式
   - 添加事件：`im.message.receive_v1`
4. 在「权限管理」中添加：
   - `im:message` - 读取消息
   - `im:message:send` - 发送消息
   - `im:resource` - 读取文件资源
5. 发布应用版本

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 链接到 OpenClaw 开发
openclaw plugins install -l .
```

## 项目结构

```
openclaw-channel-feishu/
├── src/
│   ├── channel/
│   │   ├── channel.ts    # Channel 插件定义
│   │   ├── runtime.ts    # WebSocket 运行时
│   │   └── types.ts      # 类型定义
│   └── index.ts          # 插件入口
├── openclaw.plugin.json  # 插件配置
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
