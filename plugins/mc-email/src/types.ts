export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  attachments?: {
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }[];
  labelIds: string[];
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface ReplyEmailOptions {
  messageId: string;
  body: string;
}
