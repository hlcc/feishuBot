import dotenv from 'dotenv';
import { BotConfig } from '../types';

dotenv.config();

export function loadConfig(): BotConfig {
  const requiredEnvVars = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    feishuAppId: process.env.FEISHU_APP_ID!,
    feishuAppSecret: process.env.FEISHU_APP_SECRET!,
    openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
    openclawAuthToken: process.env.OPENCLAW_AUTH_TOKEN,
    botName: process.env.BOT_NAME || 'OpenClaw Assistant',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

export const config = loadConfig();
