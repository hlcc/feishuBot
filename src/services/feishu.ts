import * as lark from '@larksuiteoapi/node-sdk';
import axios from 'axios';
import FormData from 'form-data';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

class FeishuService {
  private client: lark.Client;

  constructor() {
    this.client = new lark.Client({
      appId: config.feishuAppId,
      appSecret: config.feishuAppSecret,
      disableTokenCache: false,
    });
  }

  getClient(): lark.Client {
    return this.client;
  }

  async replyText(messageId: string, text: string): Promise<void> {
    try {
      await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
      logger.debug(`Replied to message ${messageId}`);
    } catch (error) {
      logger.error('Failed to reply text message:', error);
      throw error;
    }
  }

  async sendText(chatId: string, text: string): Promise<void> {
    try {
      await this.client.im.message.create({
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
        params: {
          receive_id_type: 'chat_id',
        },
      });
      logger.debug(`Sent text to chat ${chatId}`);
    } catch (error) {
      logger.error('Failed to send text message:', error);
      throw error;
    }
  }

  async sendMarkdown(chatId: string, title: string, content: string): Promise<void> {
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
      logger.debug(`Sent markdown card to chat ${chatId}`);
    } catch (error) {
      logger.error('Failed to send markdown message:', error);
      throw error;
    }
  }

  async replyMarkdown(messageId: string, title: string, content: string): Promise<void> {
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

      await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify(card),
          msg_type: 'interactive',
        },
      });
      logger.debug(`Replied markdown card to message ${messageId}`);
    } catch (error) {
      logger.error('Failed to reply markdown message:', error);
      throw error;
    }
  }

  async uploadImage(imageBuffer: Buffer, imageType: string = 'message'): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('image_type', imageType);
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

      logger.info(`Uploaded image: ${imageKey}`);
      return imageKey;
    } catch (error) {
      logger.error('Failed to upload image:', error);
      throw error;
    }
  }

  async sendImage(chatId: string, imageKey: string): Promise<void> {
    try {
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
      logger.debug(`Sent image to chat ${chatId}`);
    } catch (error) {
      logger.error('Failed to send image:', error);
      throw error;
    }
  }

  async uploadFile(fileBuffer: Buffer, fileName: string, fileType: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file_type', this.mapFileType(fileType));
      formData.append('file_name', fileName);
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: fileType,
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

      logger.info(`Uploaded file: ${fileKey} (${fileName})`);
      return fileKey;
    } catch (error) {
      logger.error('Failed to upload file:', error);
      throw error;
    }
  }

  async sendFile(chatId: string, fileKey: string): Promise<void> {
    try {
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
      logger.debug(`Sent file to chat ${chatId}`);
    } catch (error) {
      logger.error('Failed to send file:', error);
      throw error;
    }
  }

  async downloadImage(messageId: string, imageKey: string): Promise<Buffer> {
    try {
      const tenantToken = await this.getTenantAccessToken();

      const response = await axios.get(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${imageKey}`,
        {
          headers: {
            Authorization: `Bearer ${tenantToken}`,
          },
          params: { type: 'image' },
          responseType: 'arraybuffer',
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to download image:', error);
      throw error;
    }
  }

  async downloadFile(messageId: string, fileKey: string): Promise<Buffer> {
    try {
      const tenantToken = await this.getTenantAccessToken();

      const response = await axios.get(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}`,
        {
          headers: {
            Authorization: `Bearer ${tenantToken}`,
          },
          params: { type: 'file' },
          responseType: 'arraybuffer',
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to download file:', error);
      throw error;
    }
  }

  private async getTenantAccessToken(): Promise<string> {
    const response = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        app_id: config.feishuAppId,
        app_secret: config.feishuAppSecret,
      }
    );

    return response.data.tenant_access_token;
  }

  private mapFileType(mimeType: string): string {
    if (mimeType.startsWith('audio/')) return 'opus';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'xls';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'ppt';
    if (mimeType.startsWith('video/')) return 'mp4';
    return 'stream';
  }
}

export const feishuService = new FeishuService();
