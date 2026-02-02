import WebSocket from 'ws';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { OpenClawMessage, OpenClawChatMessage, OpenClawChatResponse } from '../types';

type ResponseCallback = {
  resolve: (response: OpenClawMessage) => void;
  reject: (error: Error) => void;
};

class OpenClawService {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, ResponseCallback> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 3000;
  private isConnected = false;
  private isHandshakeComplete = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // ========== WebSocket Connection ==========

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(config.openclawGatewayUrl);

        if (config.openclawAuthToken) {
          url.searchParams.set('token', config.openclawAuthToken);
        }

        logger.info(`Connecting to OpenClaw gateway: ${url.toString()}`);

        this.ws = new WebSocket(url.toString());

        this.ws.on('open', () => {
          logger.info('WebSocket connected to OpenClaw gateway');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.warn(`Disconnected from OpenClaw gateway (code: ${code}, reason: ${reason.toString()})`);
          this.isConnected = false;
          this.isHandshakeComplete = false;
          this.attemptReconnect();
        });

        this.ws.on('error', (error: Error) => {
          logger.error('OpenClaw WebSocket error:', error.message);
          if (!this.isConnected) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      logger.debug('Received from OpenClaw:', JSON.stringify(message));

      // Handle challenge event - respond with connect request
      if (message.type === 'event' && message.event === 'connect.challenge') {
        this.handleChallenge(message);
        return;
      }

      // Handle hello-ok response
      if (message.type === 'res' && message.ok === true && message.id) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(message);
          this.pendingRequests.delete(message.id);
        }

        // Check if this is the connect handshake response
        if (!this.isHandshakeComplete) {
          this.isHandshakeComplete = true;
          logger.info('OpenClaw handshake complete');
        }
        return;
      }

      // Handle error responses
      if (message.type === 'res' && message.ok === false && message.id) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          pending.reject(new Error(message.error?.message || 'Unknown error'));
          this.pendingRequests.delete(message.id);
        }
        return;
      }

      // Handle other events
      if (message.type === 'event') {
        logger.debug('OpenClaw event:', message.event);
      }
    } catch (error) {
      logger.error('Failed to parse OpenClaw message:', error, 'raw:', data);
    }
  }

  private handleChallenge(message: Record<string, unknown>): void {
    logger.info('Received connect challenge, sending connect request...');

    const connectId = uuidv4();
    const connectRequest = {
      type: 'req',
      id: connectId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        client: {
          id: 'cli',
          version: '1.0.0',
          platform: process.platform,
          mode: 'cli',
        },
        ...(config.openclawAuthToken && {
          auth: { token: config.openclawAuthToken },
        }),
      },
    };

    this.pendingRequests.set(connectId, {
      resolve: (res) => {
        logger.info('Connect response:', JSON.stringify(res));
      },
      reject: (err) => {
        logger.error('Connect failed:', err.message);
      },
    });

    this.wsSend(connectRequest);
  }

  private wsSend(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      logger.debug('Sent to OpenClaw:', JSON.stringify(data));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached for OpenClaw');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

    logger.info(`Reconnecting to OpenClaw in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        logger.error('OpenClaw reconnection failed:', error.message);
      });
    }, delay);
  }

  // ========== Chat via WebSocket ==========

  async chatViaWs(messages: OpenClawChatMessage[], model?: string): Promise<string> {
    if (!this.isConnected || !this.isHandshakeComplete) {
      throw new Error('WebSocket not connected or handshake not complete');
    }

    const id = uuidv4();
    const request = {
      type: 'req',
      id,
      method: 'chat.completions.create',
      params: {
        model: model || 'openclaw:main',
        messages,
        stream: false,
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('WebSocket chat request timeout'));
      }, 120000);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          const payload = response.payload as OpenClawChatResponse;
          if (payload?.choices?.[0]?.message?.content) {
            resolve(payload.choices[0].message.content);
          } else {
            reject(new Error('Invalid WebSocket chat response'));
          }
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.wsSend(request);
    });
  }

  // ========== Chat via HTTP ==========

  async chatViaHttp(messages: OpenClawChatMessage[], model?: string): Promise<string> {
    const httpUrl = config.openclawGatewayUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');

    try {
      const response = await axios.post(
        `${httpUrl}/v1/chat/completions`,
        {
          model: model || 'openclaw:main',
          messages,
          stream: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(config.openclawAuthToken && {
              Authorization: `Bearer ${config.openclawAuthToken}`,
            }),
            'x-openclaw-agent-id': 'main',
          },
          timeout: 120000,
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }

      throw new Error('Invalid HTTP chat response');
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 405) {
        logger.error('OpenClaw HTTP chat completions endpoint is disabled. Please enable it in OpenClaw config: gateway.http.endpoints.chatCompletions.enabled = true');
        throw new Error('OpenClaw chat completions endpoint not enabled');
      }
      throw error;
    }
  }

  // ========== Chat (auto fallback) ==========

  async chat(messages: OpenClawChatMessage[], model?: string): Promise<string> {
    // Use HTTP directly (faster and more reliable)
    // WebSocket is mainly for real-time events, not chat requests
    return await this.chatViaHttp(messages, model);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.isHandshakeComplete = false;
    }
  }
}

export const openclawService = new OpenClawService();
