// Feishu Channel Plugin Definition

import {
  ChannelPlugin,
  OpenClawConfig,
  FeishuChannelConfig,
  OpenClawPluginApi,
  SendTextOptions,
  SendImageOptions,
  SendFileOptions,
} from './types';
import { FeishuRuntime, getRuntime, setRuntime } from './runtime';

export function createFeishuChannel(): ChannelPlugin {
  return {
    id: 'feishu',

    meta: {
      label: 'Feishu (Lark)',
      selectionLabel: 'Feishu (WebSocket)',
      docsPath: '/channels/feishu',
      blurb: 'Connect via Feishu Enterprise Bot with WebSocket long connection',
      aliases: ['lark', 'feishu-bot'],
    },

    capabilities: {
      chatTypes: ['direct', 'group'],
      media: true,
      threads: true,
    },

    config: {
      listAccountIds(cfg: OpenClawConfig): string[] {
        const feishuConfig = cfg.channels?.feishu;
        if (feishuConfig?.appId) {
          return ['default'];
        }
        return [];
      },

      resolveAccount(cfg: OpenClawConfig, accountId?: string): FeishuChannelConfig | undefined {
        return cfg.channels?.feishu;
      },
    },

    outbound: {
      deliveryMode: 'direct',

      async sendText(options: SendTextOptions): Promise<{ ok: boolean; error?: string }> {
        const runtime = getRuntime();
        if (!runtime) {
          return { ok: false, error: 'Feishu runtime not initialized' };
        }
        return runtime.sendText(options);
      },

      async sendImage(options: SendImageOptions): Promise<{ ok: boolean; error?: string }> {
        const runtime = getRuntime();
        if (!runtime) {
          return { ok: false, error: 'Feishu runtime not initialized' };
        }
        return runtime.sendImage(options);
      },

      async sendFile(options: SendFileOptions): Promise<{ ok: boolean; error?: string }> {
        const runtime = getRuntime();
        if (!runtime) {
          return { ok: false, error: 'Feishu runtime not initialized' };
        }
        return runtime.sendFile(options);
      },
    },

    gateway: {
      async start(api: OpenClawPluginApi): Promise<void> {
        const config = api.getConfig().channels?.feishu;
        if (!config || !config.appId || !config.appSecret) {
          api.log.warn('Feishu channel not configured - missing appId or appSecret');
          return;
        }

        if (config.enabled === false) {
          api.log.info('Feishu channel is disabled');
          return;
        }

        const runtime = new FeishuRuntime(api, config);
        setRuntime(runtime);
        await runtime.start();
      },

      async stop(): Promise<void> {
        const runtime = getRuntime();
        if (runtime) {
          await runtime.stop();
          setRuntime(null);
        }
      },
    },
  };
}
