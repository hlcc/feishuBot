#!/usr/bin/env node

// OpenClaw Feishu Channel - Setup CLI

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';

const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '~', '.openclaw', 'openclaw.json');

interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  requireMention?: boolean;
  dmPolicy?: string;
  groupPolicy?: string;
}

interface OpenClawConfig {
  channels?: {
    feishu?: FeishuConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function log(msg: string): void {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
}

function error(msg: string): void {
  console.log(`\x1b[31m✗\x1b[0m ${msg}`);
}

function info(msg: string): void {
  console.log(`\x1b[36mℹ\x1b[0m ${msg}`);
}

function readConfig(): OpenClawConfig {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const content = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
      // Handle JSON5 comments by stripping them
      const jsonContent = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(jsonContent);
    }
  } catch (e) {
    warn(`Could not parse existing config: ${e}`);
  }
  return {};
}

function writeConfig(config: OpenClawConfig): void {
  const dir = path.dirname(OPENCLAW_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function installPlugin(): boolean {
  const pluginPath = path.resolve(__dirname, '..');

  try {
    info('Installing plugin to OpenClaw...');
    execSync(`openclaw plugins install -l "${pluginPath}"`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    // Try alternative method
    try {
      const extensionsDir = path.join(process.env.HOME || '~', '.openclaw', 'extensions');
      const targetDir = path.join(extensionsDir, 'openclaw-channel-feishu');

      if (!fs.existsSync(extensionsDir)) {
        fs.mkdirSync(extensionsDir, { recursive: true });
      }

      // Create symlink
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true });
      }
      fs.symlinkSync(pluginPath, targetDir);

      log('Plugin linked to ~/.openclaw/extensions/');
      return true;
    } catch (linkError) {
      error(`Failed to install plugin: ${linkError}`);
      return false;
    }
  }
}

async function setup(): Promise<void> {
  console.log('\n\x1b[1m🚀 OpenClaw Feishu Channel Setup\x1b[0m\n');

  // Step 1: Get Feishu credentials
  console.log('\x1b[1mStep 1: Feishu App Credentials\x1b[0m');
  console.log('Create an app at: https://open.feishu.cn/app\n');

  const appId = await question('Enter Feishu App ID: ');
  if (!appId) {
    error('App ID is required');
    process.exit(1);
  }

  const appSecret = await question('Enter Feishu App Secret: ');
  if (!appSecret) {
    error('App Secret is required');
    process.exit(1);
  }

  // Step 2: Options
  console.log('\n\x1b[1mStep 2: Channel Options\x1b[0m\n');

  const requireMentionAnswer = await question('Require @mention in group chats? (Y/n): ');
  const requireMention = requireMentionAnswer.toLowerCase() !== 'n';

  // Step 3: Update OpenClaw config
  console.log('\n\x1b[1mStep 3: Updating OpenClaw Configuration\x1b[0m\n');

  const config = readConfig();

  if (!config.channels) {
    config.channels = {};
  }

  config.channels.feishu = {
    enabled: true,
    appId,
    appSecret,
    requireMention,
    dmPolicy: 'open',
    groupPolicy: 'open',
  };

  writeConfig(config);
  log(`Updated ${OPENCLAW_CONFIG_PATH}`);

  // Step 4: Install plugin
  console.log('\n\x1b[1mStep 4: Installing Plugin\x1b[0m\n');

  const installed = installPlugin();

  // Summary
  console.log('\n\x1b[1m📋 Setup Complete!\x1b[0m\n');

  if (installed) {
    log('Plugin installed successfully');
  }
  log('Feishu channel configured');

  console.log('\n\x1b[1mNext Steps:\x1b[0m');
  console.log('1. Configure your Feishu app:');
  console.log('   - Enable "im:message" and "im:message:send" permissions');
  console.log('   - Set event subscription to WebSocket mode');
  console.log('   - Add event: im.message.receive_v1');
  console.log('   - Publish the app version');
  console.log('');
  console.log('2. Restart OpenClaw:');
  console.log('   \x1b[36mopenclaw restart\x1b[0m');
  console.log('');
  console.log('3. Send a message to your Feishu bot to test!');
  console.log('');

  rl.close();
}

async function uninstall(): Promise<void> {
  console.log('\n\x1b[1m🗑️  Uninstalling Feishu Channel\x1b[0m\n');

  // Remove from config
  const config = readConfig();
  if (config.channels?.feishu) {
    delete config.channels.feishu;
    writeConfig(config);
    log('Removed feishu from OpenClaw config');
  }

  // Remove plugin
  try {
    execSync('openclaw plugins uninstall openclaw-channel-feishu', { stdio: 'inherit' });
  } catch (e) {
    // Try manual removal
    const targetDir = path.join(process.env.HOME || '~', '.openclaw', 'extensions', 'openclaw-channel-feishu');
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true });
      log('Removed plugin from extensions');
    }
  }

  console.log('\n\x1b[32m✓ Uninstall complete\x1b[0m\n');
  rl.close();
}

async function status(): Promise<void> {
  console.log('\n\x1b[1m📊 Feishu Channel Status\x1b[0m\n');

  const config = readConfig();
  const feishuConfig = config.channels?.feishu;

  if (feishuConfig) {
    log('Feishu channel is configured');
    console.log(`   App ID: ${feishuConfig.appId}`);
    console.log(`   Enabled: ${feishuConfig.enabled !== false}`);
    console.log(`   Require Mention: ${feishuConfig.requireMention !== false}`);
    console.log(`   DM Policy: ${feishuConfig.dmPolicy || 'open'}`);
    console.log(`   Group Policy: ${feishuConfig.groupPolicy || 'open'}`);
  } else {
    warn('Feishu channel is not configured');
    console.log('   Run: npx openclaw-channel-feishu setup');
  }

  // Check plugin installation
  const extensionsDir = path.join(process.env.HOME || '~', '.openclaw', 'extensions', 'openclaw-channel-feishu');
  if (fs.existsSync(extensionsDir)) {
    log('Plugin is installed');
  } else {
    warn('Plugin is not installed');
  }

  console.log('');
  rl.close();
}

// Main
const command = process.argv[2] || 'setup';

switch (command) {
  case 'setup':
  case 'install':
    setup().catch(console.error);
    break;
  case 'uninstall':
  case 'remove':
    uninstall().catch(console.error);
    break;
  case 'status':
    status().catch(console.error);
    break;
  default:
    console.log(`
Usage: openclaw-channel-feishu <command>

Commands:
  setup      Configure and install the Feishu channel (default)
  status     Show current configuration status
  uninstall  Remove the Feishu channel

Examples:
  npx openclaw-channel-feishu setup
  npx openclaw-channel-feishu status
`);
    process.exit(0);
}
