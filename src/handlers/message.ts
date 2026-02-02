import { feishuService } from '../services/feishu';
import { openclawService } from '../services/openclaw';
import { sessionManager } from '../utils/session';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { FeishuEventPayload, OpenClawChatMessage, OpenClawContentPart } from '../types';

const COMMANDS = {
  CLEAR: '/clear',
  HELP: '/help',
  MODEL: '/model',
};

export class MessageHandler {
  async handleMessage(event: FeishuEventPayload): Promise<void> {
    const { sender, message } = event;
    const chatId = message.chat_id;
    const userId = sender.sender_id.open_id;
    const messageId = message.message_id;
    const messageType = message.message_type;

    logger.info(`Received message from ${userId} in ${chatId}, type: ${messageType}`);

    try {
      // Parse message content
      let content: string;
      let imageBase64: string | undefined;

      if (messageType === 'text') {
        const parsed = JSON.parse(message.content);
        content = parsed.text || '';

        // Handle mentions - remove bot mention from content
        if (message.mentions) {
          for (const mention of message.mentions) {
            content = content.replace(mention.key, '').trim();
          }
        }
      } else if (messageType === 'image') {
        const parsed = JSON.parse(message.content);
        const imageKey = parsed.image_key;

        // Download image and convert to base64
        const imageBuffer = await feishuService.downloadImage(messageId, imageKey);
        imageBase64 = imageBuffer.toString('base64');
        content = '[Image uploaded]';
      } else if (messageType === 'file') {
        const parsed = JSON.parse(message.content);
        await feishuService.replyText(
          messageId,
          `收到文件: ${parsed.file_name}。目前仅支持文本和图片消息的对话功能。`
        );
        return;
      } else {
        await feishuService.replyText(
          messageId,
          '暂不支持此类型的消息，请发送文本或图片。'
        );
        return;
      }

      // Handle commands
      if (content.startsWith('/')) {
        await this.handleCommand(content, chatId, userId, messageId);
        return;
      }

      // Skip empty messages
      if (!content.trim() && !imageBase64) {
        return;
      }

      // Build user message
      const userMessage: OpenClawChatMessage = {
        role: 'user',
        content: imageBase64
          ? [
              { type: 'text', text: content || '请描述这张图片' } as OpenClawContentPart,
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              } as OpenClawContentPart,
            ]
          : content,
      };

      // Add to session
      sessionManager.addMessage(chatId, userId, userMessage);

      // Get chat history
      const messages = sessionManager.getMessages(chatId, userId);

      // Add system message at the beginning
      const systemMessage: OpenClawChatMessage = {
        role: 'system',
        content: `你是 ${config.botName}，一个友好的 AI 助手。请用中文回复用户的问题，保持简洁明了。`,
      };

      const fullMessages = [systemMessage, ...messages];

      // Send typing indicator (optional - just reply with a status)
      logger.debug('Sending request to OpenClaw...');

      // Call OpenClaw
      let response: string;
      try {
        response = await openclawService.chat(fullMessages);
      } catch (error) {
        logger.error('Failed to get response from OpenClaw:', error);
        await feishuService.replyText(
          messageId,
          '抱歉，AI 服务暂时不可用，请稍后再试。'
        );
        return;
      }

      // Add assistant message to session
      const assistantMessage: OpenClawChatMessage = {
        role: 'assistant',
        content: response,
      };
      sessionManager.addMessage(chatId, userId, assistantMessage);

      // Reply to user
      if (response.length > 2000 || response.includes('```') || response.includes('**')) {
        // Use markdown card for long or formatted responses
        await feishuService.replyMarkdown(messageId, config.botName, response);
      } else {
        await feishuService.replyText(messageId, response);
      }

      logger.info(`Successfully replied to ${userId}`);
    } catch (error) {
      logger.error('Error handling message:', error);
      try {
        await feishuService.replyText(
          messageId,
          '处理消息时发生错误，请稍后重试。'
        );
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }

  private async handleCommand(
    content: string,
    chatId: string,
    userId: string,
    messageId: string
  ): Promise<void> {
    const command = content.split(' ')[0].toLowerCase();

    switch (command) {
      case COMMANDS.CLEAR:
        sessionManager.clearSession(chatId, userId);
        await feishuService.replyText(messageId, '对话历史已清除。');
        break;

      case COMMANDS.HELP:
        const helpText = `
🤖 ${config.botName} 使用帮助

**可用命令：**
• /clear - 清除对话历史
• /help - 显示此帮助信息
• /model - 查看当前模型信息

**功能：**
• 发送文字进行对话
• 发送图片进行识图对话
• 支持多轮对话，会记住上下文

**提示：**
• 在群聊中请 @机器人 发送消息
• 对话历史会在30分钟无活动后自动清除
        `.trim();
        await feishuService.replyMarkdown(messageId, '使用帮助', helpText);
        break;

      case COMMANDS.MODEL:
        await feishuService.replyText(
          messageId,
          `当前连接: OpenClaw Gateway\n地址: ${config.openclawGatewayUrl}`
        );
        break;

      default:
        await feishuService.replyText(
          messageId,
          `未知命令: ${command}\n输入 /help 查看可用命令。`
        );
    }
  }
}

export const messageHandler = new MessageHandler();
