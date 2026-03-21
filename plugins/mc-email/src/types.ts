export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: Buffer;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  attachments?: EmailAttachment[];
  labelIds: string[];
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
  plain?: boolean;
  attachments?: { filename: string; path: string }[];
  /** When true, skip DNC check — used for system auto-replies (opt-out confirmations, blocked-sender notices). */
  bypassDnc?: boolean;
}

export interface ReplyEmailOptions {
  messageId: string;
  body: string;
}
