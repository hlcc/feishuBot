// Feishu Channel Runtime - manages the WebSocket connection and message handling

import * as lark from '@larksuiteoapi/node-sdk';
import axios from 'axios';
import FormData from 'form-data';
import {
  FeishuChannelConfig,
  FeishuEventData,
  OpenClawPluginApi,
  InboundMessageContext,
  SendTextOptions,
  SendImageOptions,
  SendFileOptions,
} from './types';

export class FeishuRuntime {
  private api: OpenClawPluginApi;
  private config: FeishuChannelConfig;
  private client: lark.Client;
  private wsClient: lark.WSClient | null = null;
  private eventDispatcher: lark.EventDispatcher;
  private processedEvents: Set<string> = new Set();
  private isRunning = false;

  constructor(api: OpenClawPluginApi, config: FeishuChannelConfig) {
    this.api = api;
    this.config = config;

    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      disableTokenCache: false,
    });

    this.eventDispatcher = new lark.EventDispatcher({});
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.eventDispatcher.register({
      'im.message.receive_v1': this.handleMessageReceive.bind(this) as any,
    });

    // Cleanup processed events periodically
    setInterval(() => {
      this.processedEvents.clear();
    }, 5 * 60 * 1000);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.api.log.info('Starting Feishu channel...');

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info,
    });

    await this.wsClient.start({
      eventDispatcher: this.eventDispatcher,
    });

    this.isRunning = true;
    this.api.log.info('Feishu channel started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.api.log.info('Stopping Feishu channel...');

    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }

    this.isRunning = false;
    this.api.log.info('Feishu channel stopped');
  }

  private async handleMessageReceive(data: FeishuEventData): Promise<void> {
    try {
      const eventId = data.event_id || data.header?.event_id;

      // Deduplicate events
      if (eventId && this.processedEvents.has(eventId)) {
        this.api.log.debug(`Skipping duplicate event: ${eventId}`);
        return;
      }

      if (eventId) {
        this.processedEvents.add(eventId);
      }

      // Extract message and sender (support both schema 2.0 and 1.0)
      const message = data.message || data.event?.message;
      const sender = data.sender || data.event?.sender;

      if (!message || !sender) {
        this.api.log.warn('Invalid event structure - missing message or sender');
        return;
      }

      // Skip bot's own messages
      if (sender.sender_type === 'bot') {
        return;
      }

      const chatType = message.chat_type === 'p2p' ? 'direct' : 'group';

      // Check group mention requirement
      if (chatType === 'group' && this.config.requireMention !== false) {
        const hasMention = message.mentions && message.mentions.length > 0;
        if (!hasMention) {
          this.api.log.debug('Ignoring group message without mention');
          return;
        }
      }

      // Parse message content
      let text = '';
      const attachments: InboundMessageContext['attachments'] = [];

      if (message.message_type === 'text') {
        const parsed = JSON.parse(message.content);
        text = parsed.text || '';

        // Remove bot mentions from content
        if (message.mentions) {
          for (const mention of message.mentions) {
            text = text.replace(mention.key, '').trim();
          }
        }
      } else if (message.message_type === 'image') {
        const parsed = JSON.parse(message.content);
        attachments.push({
          type: 'image',
          name: parsed.image_key,
        });
        text = '[Image]';
      } else if (message.message_type === 'file') {
        const parsed = JSON.parse(message.content);
        attachments.push({
          type: 'file',
          name: parsed.file_name,
        });
        text = `[File: ${parsed.file_name}]`;
      } else {
        text = `[${message.message_type}]`;
      }

      // Skip empty messages
      if (!text.trim() && attachments.length === 0) {
        return;
      }

      // Build inbound message context
      const context: InboundMessageContext = {
        channel: 'feishu',
        chatId: message.chat_id,
        chatType,
        senderId: sender.sender_id.open_id,
        messageId: message.message_id,
        text,
        replyTo: message.parent_id,
        attachments: attachments.length > 0 ? attachments : undefined,
        timestamp: parseInt(message.create_time, 10),
      };

      this.api.log.info(
        `Feishu message from ${context.senderId} in ${context.chatId}: "${text.substring(0, 50)}..."`
      );

      // Dispatch to OpenClaw runtime
      await this.api.runtime.dispatchInboundMessage(context);
    } catch (error) {
      this.api.log.error('Error handling Feishu message:', error);
    }
  }

  // ========== Outbound Methods ==========

  async sendText(options: SendTextOptions): Promise<{ ok: boolean; error?: string }> {
    try {
      const { text, chatId, replyTo } = options;
      const chunks = this.chunkText(text, this.config.textChunkLimit || 4000);

      for (const chunk of chunks) {
        if (replyTo) {
          await this.client.im.message.reply({
            path: { message_id: replyTo },
            data: {
              content: JSON.stringify({ text: chunk }),
              msg_type: 'text',
            },
          });
        } else {
          await this.client.im.message.create({
            data: {
              receive_id: chatId,
              content: JSON.stringify({ text: chunk }),
              msg_type: 'text',
            },
            params: {
              receive_id_type: 'chat_id',
            },
          });
        }
      }

      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.api.log.error('Failed to send text:', errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  async sendMarkdown(
    chatId: string,
    title: string,
    content: string,
    replyTo?: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const card = {
        elements: [
          {
            tag: 'div',
            text: {
              content,
              tag: 'lark_md',
            },
          },
        ],
        header: {
          title: {
            content: title,
            tag: 'plain_text',
          },
        },
      };

      if (replyTo) {
        await this.client.im.message.reply({
          path: { message_id: replyTo },
          data: {
            content: JSON.stringify(card),
            msg_type: 'interactive',
          },
        });
      } else {
        await this.client.im.message.create({
          data: {
            receive_id: chatId,
            content: JSON.stringify(card),
            msg_type: 'interactive',
          },
          params: {
            receive_id_type: 'chat_id',
          },
        });
      }

      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.api.log.error('Failed to send markdown:', errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  async sendImage(options: SendImageOptions): Promise<{ ok: boolean; error?: string }> {
    try {
      const { chatId, imageBuffer, replyTo } = options;

      if (!imageBuffer) {
        return { ok: false, error: 'Image buffer required' };
      }

      // Upload image
      const imageKey = await this.uploadImage(imageBuffer);

      // Send image message
      if (replyTo) {
        await this.client.im.message.reply({
          path: { message_id: replyTo },
          data: {
            content: JSON.stringify({ image_key: imageKey }),
            msg_type: 'image',
          },
        });
      } else {
        await this.client.im.message.create({
          data: {
            receive_id: chatId,
            content: JSON.stringify({ image_key: imageKey }),
            msg_type: 'image',
          },
          params: {
            receive_id_type: 'chat_id',
          },
        });
      }

      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.api.log.error('Failed to send image:', errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  async sendFile(options: SendFileOptions): Promise<{ ok: boolean; error?: string }> {
    try {
      const { chatId, fileBuffer, fileName, replyTo } = options;

      if (!fileBuffer) {
        return { ok: false, error: 'File buffer required' };
      }

      // Upload file
      const fileKey = await this.uploadFile(fileBuffer, fileName);

      // Send file message
      if (replyTo) {
        await this.client.im.message.reply({
          path: { message_id: replyTo },
          data: {
            content: JSON.stringify({ file_key: fileKey }),
            msg_type: 'file',
          },
        });
      } else {
        await this.client.im.message.create({
          data: {
            receive_id: chatId,
            content: JSON.stringify({ file_key: fileKey }),
            msg_type: 'file',
          },
          params: {
            receive_id_type: 'chat_id',
          },
        });
      }

      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.api.log.error('Failed to send file:', errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  // ========== Helper Methods ==========

  private async uploadImage(imageBuffer: Buffer): Promise<string> {
    const formData = new FormData();
    formData.append('image_type', 'message');
    formData.append('image', imageBuffer, {
      filename: 'image.png',
      contentType: 'image/png',
    });

    const tenantToken = await this.getTenantAccessToken();

    const response = await axios.post(
      'https://open.feishu.cn/open-apis/im/v1/images',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${tenantToken}`,
        },
      }
    );

    const imageKey = response.data?.data?.image_key;
    if (!imageKey) {
      throw new Error('Failed to get image_key from upload response');
    }

    return imageKey;
  }

  private async uploadFile(fileBuffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    formData.append('file_type', 'stream');
    formData.append('file_name', fileName);
    formData.append('file', fileBuffer, {
      filename: fileName,
    });

    const tenantToken = await this.getTenantAccessToken();

    const response = await axios.post(
      'https://open.feishu.cn/open-apis/im/v1/files',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${tenantToken}`,
        },
      }
    );

    const fileKey = response.data?.data?.file_key;
    if (!fileKey) {
      throw new Error('Failed to get file_key from upload response');
    }

    return fileKey;
  }

  private async getTenantAccessToken(): Promise<string> {
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }
    );

    return response.data.tenant_access_token;
  }

  private chunkText(text: string, limit: number): string[] {
    if (text.length <= limit) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= limit) {
        chunks.push(remaining);
        break;
      }

      // Try to break at newline
      let breakPoint = remaining.lastIndexOf('\n', limit);
      if (breakPoint === -1 || breakPoint < limit * 0.5) {
        // Try to break at space
        breakPoint = remaining.lastIndexOf(' ', limit);
      }
      if (breakPoint === -1 || breakPoint < limit * 0.5) {
        breakPoint = limit;
      }

      chunks.push(remaining.substring(0, breakPoint));
      remaining = remaining.substring(breakPoint).trimStart();
    }

    return chunks;
  }
}

// Singleton instance
let runtimeInstance: FeishuRuntime | null = null;

export function getRuntime(): FeishuRuntime | null {
  return runtimeInstance;
}

export function setRuntime(runtime: FeishuRuntime | null): void {
  runtimeInstance = runtime;
}
