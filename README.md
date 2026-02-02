# Feishu OpenClaw Bot

飞书机器人插件，通过飞书与 OpenClaw AI 进行对话。

## 功能特性

- ✅ 文本对话：与 AI 进行多轮对话
- ✅ 图片识别：发送图片进行识图对话
- ✅ 上下文记忆：支持多轮对话历史
- ✅ 长连接：使用 WebSocket 接收飞书事件
- ✅ 文件支持：支持上传和发送图片、文件

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制环境变量模板并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 飞书应用凭证（必填）
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# OpenClaw 配置
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=your_openclaw_token

# 机器人配置
BOT_NAME=OpenClaw Assistant
LOG_LEVEL=info
```

### 3. 飞书应用配置

1. 访问 [飞书开放平台](https://open.feishu.cn/app) 创建应用
2. 获取 App ID 和 App Secret
3. 在「事件订阅」中配置：
   - 选择「使用长连接接收事件」模式
   - 添加事件：`im.message.receive_v1`（接收消息）
4. 在「权限管理」中添加权限：
   - `im:message`（读取消息）
   - `im:message:send`（发送消息）
   - `im:resource`（读取文件资源）
5. 发布应用版本

### 4. 运行机器人

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## 使用说明

### 命令列表

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/clear` | 清除对话历史 |
| `/model` | 查看当前模型信息 |

### 对话方式

- **私聊**：直接发送消息即可
- **群聊**：需要 @机器人 后发送消息

### 支持的消息类型

- 文本消息：直接对话
- 图片消息：发送图片进行识图

## 项目结构

```
feishubot/
├── src/
│   ├── handlers/          # 事件处理器
│   │   ├── event.ts       # 飞书事件分发
│   │   └── message.ts     # 消息处理
│   ├── services/          # 服务层
│   │   ├── feishu.ts      # 飞书 API 服务
│   │   └── openclaw.ts    # OpenClaw 服务
│   ├── types/             # TypeScript 类型定义
│   │   └── index.ts
│   ├── utils/             # 工具函数
│   │   ├── config.ts      # 配置加载
│   │   ├── logger.ts      # 日志工具
│   │   └── session.ts     # 会话管理
│   └── index.ts           # 主入口
├── .env.example           # 环境变量模板
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 技术栈

- **Node.js** - 运行时环境
- **TypeScript** - 开发语言
- **@larksuiteoapi/node-sdk** - 飞书官方 SDK
- **WebSocket** - 长连接通信

## License

MIT
