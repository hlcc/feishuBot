// Feishu CLI commands - registered via OpenClaw plugin API

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import JSON5 from 'json5';

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const OPENCLAW_DIR = path.join(HOME, '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const EXTENSIONS_DIR = path.join(OPENCLAW_DIR, 'extensions');

// Helper functions
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
    err(`Failed to parse ${OPENCLAW_CONFIG_PATH}: ${e}`);
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

function getPluginDir(): string {
  // When running as OpenClaw plugin, find our install path
  const possiblePaths = [
    path.join(EXTENSIONS_DIR, 'openclaw-channel-feishu'),
    path.join(EXTENSIONS_DIR, 'feishu'),
    path.resolve(import.meta.dirname, '..'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }

  return possiblePaths[possiblePaths.length - 1];
}

// CLI command handlers
export async function setupCommand(): Promise<void> {
  console.log('\n\x1b[1m🚀 OpenClaw Feishu Channel Setup\x1b[0m\n');

  // Step 1: Credentials
  console.log('\x1b[1mStep 1: Feishu App Credentials\x1b[0m');
  console.log('Create an app at: https://open.feishu.cn/app\n');

  const appId = await ask('Feishu App ID: ');
  if (!appId) { err('App ID is required'); return; }

  const appSecret = await ask('Feishu App Secret: ');
  if (!appSecret) { err('App Secret is required'); return; }

  // Step 2: Options
  console.log('\n\x1b[1mStep 2: Options\x1b[0m\n');
  const mentionAnswer = await ask('Require @mention in groups? (Y/n): ');
  const requireMention = mentionAnswer.toLowerCase() !== 'n';

  // Step 3: Write config
  console.log('\n\x1b[1mStep 3: Configuring\x1b[0m\n');

  const config = readConfig();

  if (!config.channels) config.channels = {};
  config.channels.feishu = {
    enabled: true,
    appId,
    appSecret,
    requireMention,
    dmPolicy: 'open',
    groupPolicy: 'open',
  };

  if (!config.plugins) config.plugins = { enabled: true, allow: [], entries: {} };
  if (!config.plugins.allow) config.plugins.allow = [];
  if (!config.plugins.entries) config.plugins.entries = {};

  if (!config.plugins.allow.includes('feishu')) {
    config.plugins.allow.push('feishu');
  }
  config.plugins.entries.feishu = { enabled: true };

  writeConfig(config);
  log(`Updated ${OPENCLAW_CONFIG_PATH}`);

  // Done
  console.log('\n\x1b[1m✅ Setup Complete!\x1b[0m\n');
  console.log('Next steps:');
  console.log('  1. Feishu app permissions: im:message, im:message:send, im:resource');
  console.log('  2. Event subscription: WebSocket mode + im.message.receive_v1');
  console.log('  3. Publish the app version');
  console.log('  4. Restart OpenClaw: \x1b[36mopenclaw restart\x1b[0m\n');
}

export async function statusCommand(): Promise<void> {
  console.log('\n\x1b[1m📊 Feishu Channel Status\x1b[0m\n');

  const config = readConfig();
  const fc = config.channels?.feishu;

  if (fc) {
    log('Channel configured');
    console.log(`   App ID:          ${fc.appId}`);
    console.log(`   Enabled:         ${fc.enabled !== false}`);
    console.log(`   Require Mention: ${fc.requireMention !== false}`);
  } else {
    warn('Not configured. Run: openclaw feishu setup');
  }

  const link = path.join(EXTENSIONS_DIR, 'openclaw-channel-feishu');
  const link2 = path.join(EXTENSIONS_DIR, 'feishu');
  if (fs.existsSync(link) || fs.existsSync(link2)) {
    log('Plugin installed');
  } else {
    warn('Plugin not installed');
  }

  console.log('');
}

export async function uninstallCommand(): Promise<void> {
  console.log('\n\x1b[1m🗑️  Uninstalling Feishu Channel\x1b[0m\n');

  const config = readConfig();
  if (config.channels?.feishu) {
    delete config.channels.feishu;
  }

  // Remove from plugins
  if (config.plugins?.allow) {
    config.plugins.allow = config.plugins.allow.filter((p: string) => p !== 'feishu');
  }
  if (config.plugins?.entries?.feishu) {
    delete config.plugins.entries.feishu;
  }

  writeConfig(config);
  log('Removed from OpenClaw config');

  // Remove plugin links
  for (const name of ['openclaw-channel-feishu', 'feishu']) {
    const link = path.join(EXTENSIONS_DIR, name);
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true });
      log(`Removed ${link}`);
    }
  }

  console.log('\x1b[32m✓ Done\x1b[0m\n');
}

// Commander.js interface (from OpenClaw plugin API)
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

// Register CLI commands with OpenClaw
export function registerFeishuCli(program: CommanderProgram): void {
  const feishu = program
    .command('feishu')
    .description('Feishu (Lark) channel management');

  feishu
    .command('setup')
    .description('Interactive setup for Feishu channel')
    .action(async () => {
      await setupCommand();
    });

  feishu
    .command('status')
    .description('Show Feishu channel configuration status')
    .action(async () => {
      await statusCommand();
    });

  feishu
    .command('uninstall')
    .description('Remove Feishu channel configuration')
    .action(async () => {
      await uninstallCommand();
    });
}
