// OpenClaw Feishu Channel Plugin Entry Point

import { createFeishuChannel } from './src/channel/channel.js';
import { registerFeishuCli } from './src/cli.js';

/** OpenClaw Plugin API interface */
interface OpenClawPluginApi {
  registerChannel: (opts: { plugin: unknown }) => void;
  registerCli: (
    handler: (opts: { program: CommanderProgram }) => void,
    opts: { commands: string[] },
  ) => void;
  runtime: unknown;
  logger: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

interface CommanderProgram {
  command: (name: string) => CommanderCommand;
}

interface CommanderCommand {
  description: (desc: string) => CommanderCommand;
  argument: (name: string, desc?: string) => CommanderCommand;
  option: (flags: string, desc?: string) => CommanderCommand;
  action: (fn: (...args: unknown[]) => void | Promise<void>) => CommanderCommand;
  command: (name: string) => CommanderCommand;
}

/** The plugin definition for OpenClaw */
const plugin = {
  id: 'openclaw-channel-feishu',
  name: 'Feishu (Lark)',
  description: 'Feishu messaging channel plugin via WebSocket',
  configSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },

  register(api: OpenClawPluginApi) {
    api.logger.info('Registering Feishu (Lark) channel plugin');

    const channel = createFeishuChannel();
    api.registerChannel({ plugin: channel });

    // Register CLI: openclaw feishu setup/status/uninstall
    api.registerCli(
      ({ program }) => registerFeishuCli(program),
      { commands: ['feishu'] },
    );
  },
};

export default plugin;
export { plugin };

// Re-export types and utilities
export { createFeishuChannel } from './src/channel/channel.js';
export { FeishuRuntime, getRuntime } from './src/channel/runtime.js';
