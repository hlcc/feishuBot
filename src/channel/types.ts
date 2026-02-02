// Feishu Channel Types

export interface FeishuChannelConfig {
  enabled?: boolean;
  appId: string;
  appSecret: string;
  dmPolicy?: 'open' | 'pairing' | 'allowlist' | 'disabled';
  groupPolicy?: 'open' | 'disabled' | 'allowlist';
  requireMention?: boolean;
  textChunkLimit?: number;
}

export interface FeishuMessageEvent {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  create_time: string;
  chat_id: string;
  chat_type: string;
  message_type: string;
  content: string;
  mentions?: FeishuMention[];
  update_time?: string;
}

export interface FeishuMention {
  key: string;
  id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  name: string;
}

export interface FeishuSender {
  sender_id: {
    open_id: string;
    user_id?: string | null;
    union_id?: string;
  };
  sender_type: string;
  tenant_key: string;
}

export interface FeishuEventPayload {
  sender: FeishuSender;
  message: FeishuMessageEvent;
}

export interface FeishuEventData {
  schema?: string;
  event_id?: string;
  event_type?: string;
  create_time?: string;
  tenant_key?: string;
  app_id?: string;
  message?: FeishuMessageEvent;
  sender?: FeishuSender;
  header?: {
    event_id?: string;
    event_type?: string;
  };
  event?: {
    message?: FeishuMessageEvent;
    sender?: FeishuSender;
  };
}

// OpenClaw Plugin API types (minimal definitions)
export interface OpenClawPluginApi {
  registerChannel(options: { plugin: ChannelPlugin }): void;
  registerCli(
    handler: (opts: { program: CommanderProgram }) => void,
    opts: { commands: string[] }
  ): void;
  getConfig(): OpenClawConfig;
  log: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
  };
  runtime: {
    dispatchInboundMessage(context: InboundMessageContext): Promise<void>;
  };
}

export interface CommanderCommand {
  description(desc: string): CommanderCommand;
  argument(name: string, desc?: string): CommanderCommand;
  option(flags: string, desc?: string): CommanderCommand;
  action(fn: (...args: unknown[]) => void | Promise<void>): CommanderCommand;
  command(name: string): CommanderCommand;
}

export interface CommanderProgram {
  command(name: string): CommanderCommand;
}

export interface OpenClawConfig {
  channels?: {
    feishu?: FeishuChannelConfig;
  };
}

export interface ChannelPlugin {
  id: string;
  meta: {
    label: string;
    selectionLabel?: string;
    docsPath?: string;
    blurb?: string;
    aliases?: string[];
  };
  capabilities: {
    chatTypes: ('direct' | 'group')[];
    media?: boolean;
    threads?: boolean;
  };
  config: {
    listAccountIds(cfg: OpenClawConfig): string[];
    resolveAccount(cfg: OpenClawConfig, accountId?: string): FeishuChannelConfig | undefined;
  };
  outbound: {
    deliveryMode: 'direct' | 'queued';
    sendText(options: SendTextOptions): Promise<{ ok: boolean; error?: string }>;
    sendImage?(options: SendImageOptions): Promise<{ ok: boolean; error?: string }>;
    sendFile?(options: SendFileOptions): Promise<{ ok: boolean; error?: string }>;
  };
  gateway?: {
    start(api: OpenClawPluginApi): Promise<void>;
    stop(): Promise<void>;
  };
}

export interface SendTextOptions {
  text: string;
  chatId: string;
  replyTo?: string;
  accountId?: string;
}

export interface SendImageOptions {
  imageUrl?: string;
  imageBuffer?: Buffer;
  chatId: string;
  replyTo?: string;
  accountId?: string;
}

export interface SendFileOptions {
  fileUrl?: string;
  fileBuffer?: Buffer;
  fileName: string;
  chatId: string;
  replyTo?: string;
  accountId?: string;
}

export interface InboundMessageContext {
  channel: string;
  accountId?: string;
  chatId: string;
  chatType: 'direct' | 'group';
  senderId: string;
  senderName?: string;
  messageId: string;
  text: string;
  replyTo?: string;
  attachments?: MessageAttachment[];
  timestamp: number;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url?: string;
  buffer?: Buffer;
  name?: string;
  mimeType?: string;
}
