export interface EmailAddress {
  address: string;
  name?: string;
}

export interface EmailThreadSummary {
  id: string;
  snippet: string;
  subject?: string;
  historyId?: string;
  messagesCount: number;
  lastUpdated: string;
  unread: boolean;
  participants: EmailAddress[];
}

export interface EmailMessage {
  id: string;
  threadId: string;
  historyId?: string;
  subject?: string;
  from?: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];
  snippet?: string;
  internalDate?: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
  headers: Record<string, string>;
  isDraft?: boolean;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailTemplateInput {
  name: string;
  category: 'prospection' | 'confirmation' | 'relance';
  content: string;
  variables: string[];
}

export interface EmailTemplate extends EmailTemplateInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftMessage {
  clientId: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
}
