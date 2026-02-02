// OpenClaw 飞书 Channels 插件入口

import { channel, createChannel } from './src/channel/channel.js';
import { setFeishuRuntime } from './src/channel/runtime.js';
import { registerFeishuCli } from './src/cli.js';

/** OpenClaw 插件 API 接口 */
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

/** 插件定义 */
const plugin = {
  id: 'feishu',
  name: '飞书',
  description: '飞书 Channels 插件',
  configSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },

  register(api: OpenClawPluginApi) {
    api.logger.info('正在注册飞书 Channels 插件');
    setFeishuRuntime(api.runtime as any);
    api.registerChannel({ plugin: channel });

    // 注册 CLI: openclaw feishu setup/status/uninstall
    api.registerCli(
      ({ program }) => registerFeishuCli(program),
      { commands: ['feishu'] },
    );
  },
};

export default plugin;
export { plugin, channel, createChannel };
export { setFeishuRuntime, getFeishuRuntime } from './src/channel/runtime.js';
