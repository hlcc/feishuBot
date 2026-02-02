import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { OpenClawMessage, OpenClawChatMessage, OpenClawChatResponse } from '../types';

type ResponseCallback = (response: OpenClawMessage) => void;

class OpenClawService {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, ResponseCallback> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnected = false;
  private messageQueue: Array<{ message: OpenClawMessage; resolve: ResponseCallback }> = [];

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(config.openclawGatewayUrl);

        // Add auth token if provided
        if (config.openclawAuthToken) {
          url.searchParams.set('token', config.openclawAuthToken);
        }

        logger.info(`Connecting to OpenClaw gateway: ${url.toString()}`);

        this.ws = new WebSocket(url.toString());

        this.ws.on('open', () => {
          logger.info('Connected to OpenClaw gateway');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.processMessageQueue();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          logger.warn('Disconnected from OpenClaw gateway');
          this.isConnected = false;
          this.attemptReconnect();
        });

        this.ws.on('error', (error: Error) => {
          logger.error('OpenClaw WebSocket error:', error.message);
          if (!this.isConnected) {
            reject(error);
          }
        });
      } catch (error) {
        logger.error('Failed to connect to OpenClaw gateway:', error);
        reject(error);
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const message: OpenClawMessage = JSON.parse(data);
      logger.debug('Received from OpenClaw:', message);

      if (message.type === 'res' && message.id) {
        const callback = this.pendingRequests.get(message.id);
        if (callback) {
          callback(message);
          this.pendingRequests.delete(message.id);
        }
      } else if (message.type === 'event') {
        logger.debug('Received event from OpenClaw:', message.event);
      }
    } catch (error) {
      logger.error('Failed to parse OpenClaw message:', error);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnection failed:', error);
      });
    }, delay);
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      if (item) {
        this.sendRequest(item.message).then(item.resolve);
      }
    }
  }

  async sendRequest(message: OpenClawMessage): Promise<OpenClawMessage> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        // Queue the message for later
        this.messageQueue.push({ message, resolve });
        return;
      }

      const id = message.id || uuidv4();
      const requestMessage = { ...message, id };

      this.pendingRequests.set(id, resolve);

      try {
        this.ws.send(JSON.stringify(requestMessage));
        logger.debug('Sent to OpenClaw:', requestMessage);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }

      // Timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000); // 60 second timeout
    });
  }

  async chat(messages: OpenClawChatMessage[], model?: string): Promise<string> {
    try {
      const request: OpenClawMessage = {
        type: 'req',
        method: 'chat.completions.create',
        params: {
          model: model || 'default',
          messages,
          stream: false,
        },
      };

      const response = await this.sendRequest(request);

      if (response.ok && response.payload) {
        const chatResponse = response.payload as OpenClawChatResponse;
        if (chatResponse.choices && chatResponse.choices.length > 0) {
          return chatResponse.choices[0].message.content;
        }
      }

      throw new Error('Invalid response from OpenClaw');
    } catch (error) {
      logger.error('Chat request failed:', error);
      throw error;
    }
  }

  async chatWithHttp(messages: OpenClawChatMessage[], model?: string): Promise<string> {
    // Alternative HTTP-based chat for OpenAI-compatible API
    const axios = (await import('axios')).default;

    const httpUrl = config.openclawGatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://');

    try {
      const response = await axios.post(
        `${httpUrl}/v1/chat/completions`,
        {
          model: model || 'default',
          messages,
          stream: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(config.openclawAuthToken && {
              Authorization: `Bearer ${config.openclawAuthToken}`,
            }),
          },
          timeout: 120000,
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }

      throw new Error('Invalid response from OpenClaw HTTP API');
    } catch (error) {
      logger.error('HTTP chat request failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

export const openclawService = new OpenClawService();
