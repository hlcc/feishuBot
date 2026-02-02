import { config } from './utils/config';
import { logger } from './utils/logger';
import { openclawService } from './services/openclaw';
import { feishuWSClient } from './handlers/event';

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info(`Starting ${config.botName}...`);
  logger.info('='.repeat(50));

  try {
    // Connect to OpenClaw gateway
    logger.info('Connecting to OpenClaw gateway...');
    try {
      await openclawService.connect();
      logger.info('OpenClaw gateway connected');
    } catch (error) {
      logger.warn('OpenClaw WebSocket connection failed, will use HTTP API:', error);
    }

    // Start Feishu WebSocket client
    logger.info('Starting Feishu WebSocket client...');
    await feishuWSClient.start();

    logger.info('='.repeat(50));
    logger.info(`${config.botName} is now running!`);
    logger.info('Waiting for messages...');
    logger.info('='.repeat(50));

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down...');
      openclawService.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down...');
      openclawService.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
