import * as lark from '@larksuiteoapi/node-sdk';
import { messageHandler } from './message';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { FeishuEventPayload } from '../types';

// Event data type for Feishu events
interface FeishuEventData {
  header?: {
    event_id?: string;
    event_type?: string;
  };
  event?: unknown;
}

// Event dispatcher for Feishu WebSocket long connection
export class FeishuEventDispatcher extends lark.EventDispatcher {
  private processedEvents: Set<string> = new Set();
  private eventTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super({});

    // Register message received event
    this.register({
      'im.message.receive_v1': this.handleMessageReceive.bind(this),
    });

    // Cleanup old events periodically
    setInterval(() => {
      this.processedEvents.clear();
    }, this.eventTTL);
  }

  private async handleMessageReceive(data: FeishuEventData): Promise<void> {
    try {
      const eventId = data.header?.event_id;

      // Deduplicate events
      if (eventId && this.processedEvents.has(eventId)) {
        logger.debug(`Skipping duplicate event: ${eventId}`);
        return;
      }

      if (eventId) {
        this.processedEvents.add(eventId);
      }

      const event = data.event as FeishuEventPayload;

      if (!event || !event.message || !event.sender) {
        logger.warn('Invalid event structure:', data);
        return;
      }

      // Skip bot's own messages
      if (event.sender.sender_type === 'bot') {
        logger.debug('Skipping bot message');
        return;
      }

      // Handle the message
      await messageHandler.handleMessage(event);
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
