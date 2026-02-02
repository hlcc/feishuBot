#!/usr/bin/env node

// OpenClaw Feishu Channel - Setup CLI

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const OPENCLAW_DIR = path.join(HOME, '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const EXTENSIONS_DIR = path.join(OPENCLAW_DIR, 'extensions');
const PLUGIN_DIR = path.resolve(import.meta.dirname, '..');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, (a) => r(a.trim())));

const log = (m: string) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const warn = (m: string) => console.log(`\x1b[33m⚠\x1b[0m ${m}`);
const err = (m: string) => console.log(`\x1b[31m✗\x1b[0m ${m}`);

function readConfig(): Record<string, any> {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
      // Strip JSON5 comments
      const clean = raw
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(clean);
    }
  } catch (e) {
    warn(`Could not parse ${OPENCLAW_CONFIG_PATH}, will create new config`);
  }
  return {};
}

function writeConfig(config: Record<string, any>): void {
  if (!fs.existsSync(OPENCLAW_DIR)) {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
  }
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function linkPlugin(): void {
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  }

  const target = path.join(EXTENSIONS_DIR, 'openclaw-channel-feishu');

  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true });
  }

  fs.symlinkSync(PLUGIN_DIR, target);
  log(`Plugin linked: ${target} -> ${PLUGIN_DIR}`);
}

async function setup(): Promise<void> {
  console.log('\n\x1b[1m🚀 OpenClaw Feishu Channel Setup\x1b[0m\n');

  // Step 1: Credentials
  console.log('\x1b[1mStep 1: Feishu App Credentials\x1b[0m');
  console.log('Create an app at: https://open.feishu.cn/app\n');

  const appId = await ask('Feishu App ID: ');
  if (!appId) { err('App ID is required'); process.exit(1); }

  const appSecret = await ask('Feishu App Secret: ');
  if (!appSecret) { err('App Secret is required'); process.exit(1); }

  // Step 2: Options
  console.log('\n\x1b[1mStep 2: Options\x1b[0m\n');
  const mentionAnswer = await ask('Require @mention in groups? (Y/n): ');
  const requireMention = mentionAnswer.toLowerCase() !== 'n';

  // Step 3: Write config (merge, not overwrite)
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

  writeConfig(config);
  log(`Updated ${OPENCLAW_CONFIG_PATH}`);

  // Step 4: Link plugin
  linkPlugin();

  // Done
  console.log('\n\x1b[1m✅ Setup Complete!\x1b[0m\n');
  console.log('Next steps:');
  console.log('  1. Feishu app permissions: im:message, im:message:send, im:resource');
  console.log('  2. Event subscription: WebSocket mode + im.message.receive_v1');
  console.log('  3. Publish the app version');
  console.log('  4. Restart OpenClaw: \x1b[36mopenclaw restart\x1b[0m\n');

  rl.close();
}

async function status(): Promise<void> {
  console.log('\n\x1b[1m📊 Feishu Channel Status\x1b[0m\n');

  const config = readConfig();
  const fc = config.channels?.feishu;

  if (fc) {
    log('Channel configured');
    console.log(`   App ID:          ${fc.appId}`);
    console.log(`   Enabled:         ${fc.enabled !== false}`);
    console.log(`   Require Mention: ${fc.requireMention !== false}`);
  } else {
    warn('Not configured. Run: npm run setup');
  }

  const link = path.join(EXTENSIONS_DIR, 'openclaw-channel-feishu');
  if (fs.existsSync(link)) {
    log('Plugin installed');
  } else {
    warn('Plugin not installed');
  }

  console.log('');
  rl.close();
}

async function uninstall(): Promise<void> {
  console.log('\n\x1b[1m🗑️  Uninstalling Feishu Channel\x1b[0m\n');

  const config = readConfig();
  if (config.channels?.feishu) {
    delete config.channels.feishu;
    writeConfig(config);
    log('Removed from OpenClaw config');
  }

  const link = path.join(EXTENSIONS_DIR, 'openclaw-channel-feishu');
  if (fs.existsSync(link)) {
    fs.rmSync(link, { recursive: true });
    log('Removed plugin link');
  }

  console.log('\x1b[32m✓ Done\x1b[0m\n');
  rl.close();
}

// Main
const cmd = process.argv[2] || 'setup';

const commands: Record<string, () => Promise<void>> = { setup, status, uninstall };

if (commands[cmd]) {
  commands[cmd]().catch(console.error);
} else {
  console.log(`\nUsage: npm run setup | npm run status | npm run uninstall\n`);
}
