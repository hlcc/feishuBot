// OpenClaw Feishu Channel Plugin Entry Point

import { createFeishuChannel } from './src/channel/channel.js';
import type { OpenClawPluginApi } from './src/channel/types.js';

export default function registerFeishuPlugin(api: OpenClawPluginApi): void {
  const channel = createFeishuChannel();

  api.registerChannel({ plugin: channel });

  api.log.info('Feishu channel plugin registered');
}

// Re-export types and utilities
export * from './src/channel/types.js';
export { createFeishuChannel } from './src/channel/channel.js';
export { FeishuRuntime, getRuntime } from './src/channel/runtime.js';
