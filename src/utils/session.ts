import { ChatSession, OpenClawChatMessage } from '../types';
import { logger } from './logger';

const MAX_HISTORY_LENGTH = 20;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

class SessionManager {
  private sessions: Map<string, ChatSession> = new Map();

  private getSessionKey(chatId: string, userId: string): string {
    return `${chatId}:${userId}`;
  }

  getSession(chatId: string, userId: string): ChatSession {
    const key = this.getSessionKey(chatId, userId);
    let session = this.sessions.get(key);

    if (!session) {
      session = {
        chatId,
        userId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sessions.set(key, session);
      logger.debug(`Created new session for ${key}`);
    }

    return session;
  }

  addMessage(chatId: string, userId: string, message: OpenClawChatMessage): void {
    const session = this.getSession(chatId, userId);
    session.messages.push(message);
    session.updatedAt = new Date();

    // Trim history if too long
    if (session.messages.length > MAX_HISTORY_LENGTH) {
      session.messages = session.messages.slice(-MAX_HISTORY_LENGTH);
    }

    logger.debug(`Added message to session ${this.getSessionKey(chatId, userId)}, total: ${session.messages.length}`);
  }

  getMessages(chatId: string, userId: string): OpenClawChatMessage[] {
    return this.getSession(chatId, userId).messages;
  }

  clearSession(chatId: string, userId: string): void {
    const key = this.getSessionKey(chatId, userId);
    this.sessions.delete(key);
    logger.info(`Cleared session for ${key}`);
  }

  cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, session] of this.sessions.entries()) {
      if (now - session.updatedAt.getTime() > SESSION_TIMEOUT_MS) {
        this.sessions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired sessions`);
    }
  }
}

export const sessionManager = new SessionManager();

// Cleanup expired sessions periodically
setInterval(() => {
  sessionManager.cleanupExpiredSessions();
}, 5 * 60 * 1000); // Every 5 minutes
