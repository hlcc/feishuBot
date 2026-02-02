// OpenClaw Feishu Channel Plugin Entry Point

import { OpenClawPluginApi } from './channel/types';
import { createFeishuChannel } from './channel/channel';

export default function registerFeishuPlugin(api: OpenClawPluginApi): void {
  const channel = createFeishuChannel();

  api.registerChannel({ plugin: channel });

  api.log.info('Feishu channel plugin registered');
}

// Re-export types and utilities for external use
export * from './channel/types';
export { createFeishuChannel } from './channel/channel';
export { FeishuRuntime, getRuntime } from './channel/runtime';
