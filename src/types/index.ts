// Feishu message types
export interface FeishuTextMessage {
  text: string;
}

export interface FeishuImageMessage {
  image_key: string;
}

export interface FeishuFileMessage {
  file_key: string;
  file_name: string;
}

export interface FeishuMessageEvent {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  create_time: string;
  chat_id: string;
  chat_type: string;
  message_type: string;
  content: string;
  mentions?: FeishuMention[];
  update_time?: string;
}

export interface FeishuMention {
  key: string;
  id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  name: string;
}

export interface FeishuSender {
  sender_id: {
    open_id: string;
    user_id?: string | null;
    union_id?: string;
  };
  sender_type: string;
  tenant_key: string;
}

export interface FeishuEventPayload {
  sender: FeishuSender;
  message: FeishuMessageEvent;
}

// OpenClaw types
export interface OpenClawMessage {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  ok?: boolean;
  payload?: unknown;
  event?: string;
}

export interface OpenClawChatRequest {
  model?: string;
  messages: OpenClawChatMessage[];
  stream?: boolean;
}

export interface OpenClawChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenClawContentPart[];
}

export interface OpenClawContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface OpenClawChatResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
}

// Session types
export interface ChatSession {
  chatId: string;
  userId: string;
  messages: OpenClawChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// Config types
export interface BotConfig {
  feishuAppId: string;
  feishuAppSecret: string;
  openclawGatewayUrl: string;
  openclawAuthToken?: string;
  botName: string;
  logLevel: string;
}
