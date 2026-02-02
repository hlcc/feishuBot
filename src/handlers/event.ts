import * as lark from '@larksuiteoapi/node-sdk';
import { messageHandler } from './message';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { FeishuEventPayload, FeishuMessageEvent, FeishuSender } from '../types';

// Event data type for Feishu events (schema 2.0 format)
interface FeishuEventData {
  schema?: string;
  event_id?: string;
  event_type?: string;
  create_time?: string;
  tenant_key?: string;
  app_id?: string;
  // Direct fields in schema 2.0
  message?: FeishuMessageEvent;
  sender?: FeishuSender;
  // Nested format (schema 1.0)
  header?: {
    event_id?: string;
    event_type?: string;
  };
  event?: {
    message?: FeishuMessageEvent;
    sender?: FeishuSender;
  };
}

// Event dispatcher for Feishu WebSocket long connection
export class FeishuEventDispatcher extends lark.EventDispatcher {
  private processedEvents: Set<string> = new Set();
  private eventTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super({});

    // Register message received event
    // Use 'as any' to bypass SDK type narrowing - we handle validation at runtime
    this.register({
      'im.message.receive_v1': this.handleMessageReceive.bind(this) as any,
    });

    // Cleanup old events periodically
    setInterval(() => {
      this.processedEvents.clear();
    }, this.eventTTL);
  }

  private async handleMessageReceive(data: FeishuEventData): Promise<void> {
    try {
      logger.debug('Received event data:', JSON.stringify(data));

      // Get event_id from either schema 2.0 (top level) or schema 1.0 (header)
      const eventId = data.event_id || data.header?.event_id;

      // Deduplicate events
      if (eventId && this.processedEvents.has(eventId)) {
        logger.debug(`Skipping duplicate event: ${eventId}`);
        return;
      }

      if (eventId) {
        this.processedEvents.add(eventId);
      }

      // Extract message and sender - support both schema 2.0 (direct) and 1.0 (nested)
      const message = data.message || data.event?.message;
      const sender = data.sender || data.event?.sender;

      if (!message || !sender) {
        logger.warn('Invalid event structure - missing message or sender:', JSON.stringify(data));
        return;
      }

      // Skip bot's own messages
      if (sender.sender_type === 'bot') {
        logger.debug('Skipping bot message');
        return;
      }

      const eventPayload: FeishuEventPayload = {
        message,
        sender,
      };

      logger.info(`Processing message from ${sender.sender_id.open_id} in chat ${message.chat_id}`);

      // Handle the message
      await messageHandler.handleMessage(eventPayload);
    } catch (error) {
      logger.error('Error in handleMessageReceive:', error);
    }
  }
}

// Create WebSocket client for long connection
export class FeishuWebSocketClient {
  private wsClient: lark.WSClient;
  private eventDispatcher: lark.EventDispatcher;

  constructor(eventDispatcher: lark.EventDispatcher) {
    this.eventDispatcher = eventDispatcher;
    this.wsClient = new lark.WSClient({
      appId: config.feishuAppId,
      appSecret: config.feishuAppSecret,
      loggerLevel: lark.LoggerLevel.info,
    });
  }

  async start(): Promise<void> {
    logger.info('Starting Feishu WebSocket client...');

    try {
      await this.wsClient.start({
        eventDispatcher: this.eventDispatcher,
      });
      logger.info('Feishu WebSocket client started successfully');
    } catch (error) {
      logger.error('Failed to start Feishu WebSocket client:', error);
      throw error;
    }
  }
}

export const eventDispatcher = new FeishuEventDispatcher();
export const feishuWSClient = new FeishuWebSocketClient(eventDispatcher);
