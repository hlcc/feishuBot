// 飞书机器人 CLI 命令 - 通过 OpenClaw 插件 API 注册

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import JSON5 from 'json5';

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const OPENCLAW_DIR = path.join(HOME, '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const EXTENSIONS_DIR = path.join(OPENCLAW_DIR, 'extensions');

const PLUGIN_ID = 'feishu';
const PLUGIN_DIR_NAME = 'feishu';

const log = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const warn = (m: string) => console.log(`\x1b[33m⚠\x1b[0m ${m}`);
const err = (m: string) => console.log(`\x1b[31m✗\x1b[0m ${m}`);

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function readConfig(): Record<string, any> {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
      return JSON5.parse(raw);
    }
  } catch (e) {
    err(`无法解析配置文件 ${OPENCLAW_CONFIG_PATH}: ${e}`);
    throw e;
  }
  return {};
}

function writeConfig(config: Record<string, any>): void {
  if (!fs.existsSync(OPENCLAW_DIR)) {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
  }
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function setupCommand(): Promise<void> {
  console.log('\n\x1b[1m🚀 飞书机器人配置向导\x1b[0m\n');

  console.log('\x1b[1m第一步：飞书应用凭证\x1b[0m');
  console.log('请先在飞书开放平台创建应用：https://open.feishu.cn/app\n');

  const appId = await ask('请输入 App ID: ');
  if (!appId) { err('App ID 不能为空'); return; }

  const appSecret = await ask('请输入 App Secret: ');
  if (!appSecret) { err('App Secret 不能为空'); return; }

  console.log('\n\x1b[1m第二步Channels选项\x1b[0m\n');
  const mentionAnswer = await ask('群聊中是否需要 @机器人 才响应？(Y/n): ');
  const requireMention = mentionAnswer.toLowerCase() !== 'n';

  const streamingAnswer = await ask('是否启用卡片流式回复？(y/N): ');
  const streamingEnabled = streamingAnswer.toLowerCase() === 'y';

  const voiceAnswer = await ask('是否启用语音消息识别？需要安装 ffmpeg (y/N): ');
  const voiceEnabled = voiceAnswer.toLowerCase() === 'y';

  console.log('\n\x1b[1m第三步：写入配置\x1b[0m\n');

  const config = readConfig();

  if (!config.channels) config.channels = {};
  config.channels.feishu = {
    enabled: true,
    appId,
    appSecret,
    requireMention,
    streamingEnabled,
    voiceEnabled,
    dmPolicy: 'open',
    groupPolicy: 'open',
  };

  if (!config.plugins) config.plugins = { enabled: true, allow: [], entries: {} };
  if (!config.plugins.allow) config.plugins.allow = [];
  if (!config.plugins.entries) config.plugins.entries = {};

  if (!config.plugins.allow.includes(PLUGIN_ID)) {
    config.plugins.allow.push(PLUGIN_ID);
  }
  config.plugins.entries[PLUGIN_ID] = { enabled: true };

  writeConfig(config);
  log(`已更新 ${OPENCLAW_CONFIG_PATH}`);

  console.log('\n\x1b[1m✅ 配置完成！\x1b[0m\n');
  console.log('后续步骤：');
  console.log('  1. 在飞书开放平台配置权限：im:message、im:message:send、im:resource');
  console.log('  2. 事件订阅：选择 WebSocket 模式，添加 im.message.receive_v1 事件');
  console.log('  3. 发布应用版本');
  console.log('  4. 重启 OpenClaw：\x1b[36mopenclaw gateway restart\x1b[0m\n');
}

export async function statusCommand(): Promise<void> {
  console.log('\n\x1b[1m📊 飞书Channels状态\x1b[0m\n');

  const config = readConfig();
  const fc = config.channels?.feishu;

  if (fc) {
    log('飞书Channels已配置');
    console.log(`   App ID:      ${fc.appId}`);
    console.log(`   已启用:      ${fc.enabled !== false ? '是' : '否'}`);
    console.log(`   群聊需@:     ${fc.requireMention !== false ? '是' : '否'}`);
    console.log(`   流式回复:    ${fc.streamingEnabled === true ? '是' : '否'}`);
    console.log(`   语音识别:    ${fc.voiceEnabled === true ? '是' : '否'}`);
  } else {
    warn('未配置，请运行：openclaw feishu setup');
  }

  const link = path.join(EXTENSIONS_DIR, PLUGIN_DIR_NAME);
  if (fs.existsSync(link)) {
    log('插件已安装');
  } else {
    warn('插件未安装');
  }

  console.log('');
}

export async function uninstallCommand(): Promise<void> {
  console.log('\n\x1b[1m🗑️  卸载飞书Channels\x1b[0m\n');

  const confirm = await ask('确定要卸载吗？这将删除所有飞书相关配置 (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('已取消');
    return;
  }

  const config = readConfig();

  // 删除 channels.feishu
  if (config.channels?.feishu) {
    delete config.channels.feishu;
    log('已删除 channels.feishu');
  }

  // 删除 plugins.allow 中的条目
  if (Array.isArray(config.plugins?.allow)) {
    config.plugins.allow = config.plugins.allow.filter((p: string) => p !== PLUGIN_ID);
    log('已从 plugins.allow 中移除');
  }

  // 删除 plugins.entries 中的条目
  if (config.plugins?.entries?.[PLUGIN_ID]) {
    delete config.plugins.entries[PLUGIN_ID];
    log('已删除 plugins.entries.' + PLUGIN_ID);
  }

  // 删除 plugins.installs 中的条目
  if (config.plugins?.installs?.[PLUGIN_ID]) {
    delete config.plugins.installs[PLUGIN_ID];
    log('已删除 plugins.installs.' + PLUGIN_ID);
  }

  writeConfig(config);
  log('配置文件已更新');

  // 删除插件目录
  for (const name of [PLUGIN_DIR_NAME, PLUGIN_ID]) {
    const link = path.join(EXTENSIONS_DIR, name);
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true });
      log(`已删除 ${link}`);
    }
  }

  console.log('\n\x1b[32m✓ 卸载完成\x1b[0m\n');
}

// Commander.js 接口
interface CommanderCommand {
  description: (desc: string) => CommanderCommand;
  argument: (name: string, desc?: string) => CommanderCommand;
  option: (flags: string, desc?: string) => CommanderCommand;
  action: (fn: (...args: unknown[]) => void | Promise<void>) => CommanderCommand;
  command: (name: string) => CommanderCommand;
}

interface CommanderProgram {
  command: (name: string) => CommanderCommand;
}

// 注册 CLI 命令到 OpenClaw
export function registerFeishuCli(program: CommanderProgram): void {
  const feishu = program
    .command('feishu')
    .description('飞书Channels管理');

  feishu
    .command('setup')
    .description('交互式配置飞书Channels')
    .action(async () => {
      await setupCommand();
    });

  feishu
    .command('status')
    .description('查看飞Channels配置状态')
    .action(async () => {
      await statusCommand();
    });

  feishu
    .command('uninstall')
    .description('卸载飞书Channels并清理配置')
    .action(async () => {
      await uninstallCommand();
    });
}
