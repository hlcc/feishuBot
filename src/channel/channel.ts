// Feishu Channel Plugin Definition

import type { PluginRuntime, OpenClawConfig, ReplyPayload } from 'openclaw/plugin-sdk';
import { createReplyPrefixContext, createTypingCallbacks } from 'openclaw/plugin-sdk';
import * as lark from '@larksuiteoapi/node-sdk';
import { getFeishuRuntime } from './runtime.js';

/** Feishu account configuration from channels.feishu */
interface FeishuAccountConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  requireMention?: boolean;
  dmPolicy?: string;
  groupPolicy?: string;
  textChunkLimit?: number;
}

interface PluginConfig {
  channels?: {
    feishu?: FeishuAccountConfig;
  };
}

/** Gateway context passed by OpenClaw */
interface GatewayContext {
  cfg: PluginConfig;
  accountId: string;
  account: FeishuAccountConfig;
  runtime: { log?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  abortSignal: AbortSignal;
  log: {
    info?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  setStatus: (status: Record<string, unknown>) => void;
}

// Active client for outbound
let activeClient: lark.Client | null = null;

/** Create the Feishu channel plugin */
export function createChannel() {
  const channel = {
    id: 'feishu',

    meta: {
      id: 'feishu',
      label: '飞书',
      selectionLabel: '飞书 (WebSocket)',
      docsPath: '/channels/feishu',
      blurb: '通过飞书企业机器人 WebSocket 长连接收发消息',
      aliases: ['feishu-bot'],
    },

    capabilities: {
      chatTypes: ['direct', 'group'] as const,
      reactions: false,
      threads: true,
      media: true,
    },

    config: {
      listAccountIds(cfg: PluginConfig): string[] {
        const feishu = cfg.channels?.feishu;
        if (feishu?.appId) return ['default'];
        return [];
      },

      resolveAccount(cfg: PluginConfig, accountId: string): FeishuAccountConfig | null {
        const feishu = cfg.channels?.feishu;
        if (!feishu) return null;
        return accountId === 'default' ? feishu : null;
      },

      isConfigured(account: FeishuAccountConfig | null): boolean {
        return Boolean(account?.appId?.trim() && account?.appSecret?.trim());
      },

      isEnabled(account: FeishuAccountConfig | null): boolean {
        return account?.enabled !== false;
      },

      unconfiguredReason(): string {
        return 'appId 和 appSecret 为必填项';
      },

      disabledReason(): string {
        return '已在配置中禁用';
      },
    },

    gateway: {
      async startAccount(ctx: GatewayContext): Promise<void> {
        const { account, accountId, log, runtime, abortSignal, setStatus } = ctx;
        const core = getFeishuRuntime();

        log.info?.('[飞书] 正在启动...');

        const appId = account.appId ?? '';
        const appSecret = account.appSecret ?? '';

        // Create Lark client for outbound
        activeClient = new lark.Client({ appId, appSecret, disableTokenCache: false });

        // Event dispatcher
        const eventDispatcher = new lark.EventDispatcher({});
        const processedEvents = new Set<string>();

        // Cleanup processed events periodically
        const cleanupInterval = setInterval(() => processedEvents.clear(), 5 * 60 * 1000);

        // Register message handler
        eventDispatcher.register({
          'im.message.receive_v1': async (data: any) => {
            try {
              const eventId = data.event_id || data.header?.event_id;
              if (eventId && processedEvents.has(eventId)) return;
              if (eventId) processedEvents.add(eventId);

              const message = data.message || data.event?.message;
              const sender = data.sender || data.event?.sender;
              if (!message || !sender) return;
              if (sender.sender_type === 'bot') return;

              const chatType = message.chat_type === 'p2p' ? 'dm' : 'group';
              const chatId = message.chat_id;
              const senderId = sender.sender_id.open_id;

              // Check group mention requirement
              if (chatType === 'group' && account.requireMention !== false) {
                if (!message.mentions || message.mentions.length === 0) return;
              }

              // Parse text
              let text = '';
              if (message.message_type === 'text') {
                const parsed = JSON.parse(message.content);
                text = parsed.text || '';
                if (message.mentions) {
                  for (const mention of message.mentions) {
                    text = text.replace(mention.key, '').trim();
                  }
                }
              } else if (message.message_type === 'image') {
                text = '[图片]';
              } else if (message.message_type === 'file') {
                const parsed = JSON.parse(message.content);
                text = `[文件: ${parsed.file_name}]`;
              } else {
                text = `[${message.message_type}]`;
              }

              if (!text.trim()) return;

              runtime.log?.(`[飞书] 收到${chatType === 'dm' ? '私聊' : '群聊'}消息: "${text.slice(0, 50)}..."`);

              // Resolve route
              const route = core.channel.routing.resolveAgentRoute({
                cfg: ctx.cfg as OpenClawConfig,
                channel: 'feishu',
                accountId,
                peer: {
                  kind: chatType === 'dm' ? 'dm' : 'group',
                  id: chatId,
                },
              });

              const sessionKey = route.sessionKey;
              const to = chatType === 'dm' ? `user:${senderId}` : `group:${chatId}`;
              const fromLabel = chatType === 'dm' ? `飞书私聊` : `飞书群 ${chatId}`;

              // Format inbound envelope
              const body = core.channel.reply.formatInboundEnvelope({
                channel: '飞书',
                from: fromLabel,
                timestamp: Date.now(),
                body: text,
                chatType,
                sender: { name: senderId, id: senderId },
              });

              // Build inbound context
              const ctxPayload = core.channel.reply.finalizeInboundContext({
                Body: body,
                RawBody: text,
                CommandBody: text,
                From: chatType === 'dm' ? `feishu:${senderId}` : `feishu:group:${chatId}`,
                To: to,
                SessionKey: sessionKey,
                AccountId: accountId,
                ChatType: chatType,
                SenderName: senderId,
                SenderId: senderId,
                Provider: 'feishu' as any,
                Surface: 'feishu' as any,
                MessageSid: message.message_id,
                CommandAuthorized: true,
                OriginatingChannel: 'feishu' as any,
                OriginatingTo: to,
              });

              // Text chunk settings
              const textLimit = core.channel.text.resolveTextChunkLimit(
                ctx.cfg as OpenClawConfig, 'feishu', accountId, { fallbackLimit: 4000 }
              );

              const prefixContext = createReplyPrefixContext({
                cfg: ctx.cfg as OpenClawConfig,
                agentId: route.agentId,
              });

              // Create reply dispatcher
              const { dispatcher, replyOptions, markDispatchIdle } =
                core.channel.reply.createReplyDispatcherWithTyping({
                  responsePrefix: prefixContext.responsePrefix,
                  responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
                  humanDelay: core.channel.reply.resolveHumanDelayConfig(
                    ctx.cfg as OpenClawConfig, route.agentId
                  ),
                  deliver: async (payload: ReplyPayload) => {
                    const replyText = payload.text ?? '';
                    if (!replyText) return;

                    const chunks = replyText.length <= textLimit
                      ? [replyText]
                      : core.channel.text.chunkMarkdownText(replyText, textLimit);

                    for (const chunk of chunks.length > 0 ? chunks : [replyText]) {
                      if (!chunk) continue;
                      try {
                        await activeClient!.im.message.create({
                          data: {
                            receive_id: chatId,
                            content: JSON.stringify({ text: chunk }),
                            msg_type: 'text',
                          },
                          params: { receive_id_type: 'chat_id' },
                        });
                        runtime.log?.(`[飞书] 已回复 ${to}`);
                      } catch (err) {
                        runtime.error?.(`[飞书] 发送失败: ${err}`);
                        throw err;
                      }
                    }
                  },
                  onError: (err: unknown, info: { kind: string }) => {
                    runtime.error?.(`[飞书] ${info.kind} 回复失败: ${String(err)}`);
                  },
                });

              // Dispatch to AI
              await core.channel.reply.dispatchReplyFromConfig({
                ctx: ctxPayload,
                cfg: ctx.cfg as OpenClawConfig,
                dispatcher,
                replyOptions,
              });
              markDispatchIdle();
            } catch (err) {
              runtime.error?.(`[飞书] 消息处理出错: ${err}`);
            }
          },
        });

        // Start WebSocket
        const wsClient = new lark.WSClient({
          appId,
          appSecret,
          loggerLevel: lark.LoggerLevel.info,
        });

        await wsClient.start({ eventDispatcher });
        setStatus({ running: true, connected: true, lastError: null });
        log.info?.('[飞书] 已连接');

        // Keep running until abort
        await new Promise<void>((resolve) => {
          abortSignal.addEventListener('abort', () => {
            clearInterval(cleanupInterval);
            wsClient.close();
            activeClient = null;
            setStatus({ running: false, connected: false });
            log.info?.('[飞书] 已断开');
            resolve();
          }, { once: true });
        });
      },

      async stopAccount(ctx: GatewayContext): Promise<void> {
        activeClient = null;
        ctx.setStatus({ running: false, connected: false });
      },
    },

    outbound: {
      deliveryMode: 'direct' as const,
      textChunkLimit: 4000,

      sendText: async ({ to, text, accountId, replyToId }: {
        to: string;
        text: string;
        accountId?: string;
        replyToId?: string;
      }) => {
        if (!activeClient) {
          return { ok: false, error: '飞书客户端未连接' };
        }

        // Parse target: group:<chatId> or user:<openId>
        const groupMatch = to.match(/^group:(.+)$/);
        const userMatch = to.match(/^user:(.+)$/);

        try {
          const chatId = groupMatch?.[1] || userMatch?.[1];
          if (!chatId) {
            return { ok: false, error: `无效的目标: ${to}` };
          }

          if (replyToId) {
            await activeClient.im.message.reply({
              path: { message_id: replyToId },
              data: {
                content: JSON.stringify({ text }),
                msg_type: 'text',
              },
            });
          } else {
            await activeClient.im.message.create({
              data: {
                receive_id: chatId,
                content: JSON.stringify({ text }),
                msg_type: 'text',
              },
              params: { receive_id_type: groupMatch ? 'chat_id' : 'open_id' },
            });
          }

          return { ok: true, channel: 'feishu', to };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        }
      },
    },
  };

  return channel;
}

export const channel = createChannel();
