export interface Message {
  id: string;
  sessionId: string;
  messageId: string;
  direction: MessageDirection;
  fromNumber: string;
  toNumber: string;
  messageType: MessageType;
  content: MessageContent;
  status: MessageStatus;
  timestamp: Date;
  createdAt: Date;
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  INTERACTIVE = 'interactive',
  TEMPLATE = 'template'
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export interface MessageContent {
  text?: string;
  media?: MediaContent;
  location?: LocationContent;
  contact?: ContactContent;
  interactive?: InteractiveContent;
  template?: TemplateContent;
}

export interface MediaContent {
  url: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
  size?: number;
}

export interface LocationContent {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

export interface ContactContent {
  displayName: string;
  vcard: string;
}

export interface InteractiveContent {
  type: 'button' | 'list';
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    media?: MediaContent;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action: ButtonAction | ListAction;
}

export interface ButtonAction {
  buttons: Array<{
    id: string;
    title: string;
  }>;
}

export interface ListAction {
  button: string;
  sections: Array<{
    title?: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}

export interface TemplateContent {
  name: string;
  language: {
    code: string;
  };
  components?: Array<{
    type: string;
    parameters?: Array<{
      type: string;
      text?: string;
      image?: MediaContent;
      document?: MediaContent;
      video?: MediaContent;
    }>;
  }>;
}

export interface SendMessageRequest {
  to: string;
  type: MessageType;
  content: MessageContent;
}

export interface SendMessageResponse {
  messageId: string;
  status: MessageStatus;
  timestamp: Date;
}