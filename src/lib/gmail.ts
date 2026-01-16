import { google, gmail_v1 } from 'googleapis';
import crypto from 'node:crypto';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { EmailAddress, EmailMessage, EmailThreadSummary } from '@/types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
const GMAIL_TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET;

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

const CREDENTIALS_DOC_PATH = ['gmail_credentials', 'primary'];

interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

function ensureConfig() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Configuration OAuth Google manquante');
  }
  if (!GMAIL_TOKEN_SECRET) {
    throw new Error('GMAIL_TOKEN_SECRET manquant');
  }
}

function getCryptoKey(): Buffer {
  return crypto.createHash('sha256').update(GMAIL_TOKEN_SECRET!).digest();
}

function encryptTokens(data: StoredTokens): string {
  const key = getCryptoKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptTokens(payload: string): StoredTokens {
  const key = getCryptoKey();
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}

function getOAuthClient() {
  ensureConfig();
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function headersToRecord(headers: gmail_v1.Schema$MessagePartHeader[] = []): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (header.name && header.value) {
      acc[header.name.toLowerCase()] = decodeHeaderValue(header.value);
    }
    return acc;
  }, {});
}

function decodeHeaderValue(value: string): string {
  // Gmail headers can contain RFC 2047 encoded-words like =?UTF-8?B?...?=
  return value
    .replace(/\r?\n[ \t]*/g, '')
    .split(/(?=\=\?)/)
    .map(segment => {
      const match = /^=\?([^?]+)\?([BbQq])\?([^?]+)\?=$/.exec(segment);
      if (!match) {
        return segment;
      }
      const [, charsetRaw, encodingRaw, encodedText] = match;
      const charset = charsetRaw.toLowerCase();
      const encoding = encodingRaw.toUpperCase();
      try {
        if (encoding === 'B') {
          const buffer = Buffer.from(encodedText, 'base64');
          return buffer.toString(charset as BufferEncoding);
        }
        if (encoding === 'Q') {
          const text = encodedText
            .replace(/_/g, ' ')
            .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          return Buffer.from(text, 'binary').toString(charset as BufferEncoding);
        }
      } catch (error) {
        console.warn('Header decode failed', error);
      }
      return segment;
    })
    .join('');
}

function encodeHeaderValue(value: string): string {
  if (!value) return '';
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${base64}?=`;
}

function parseAddressList(value?: string): EmailAddress[] {
  if (!value) return [];
  return value.split(',').map(item => {
    const trimmed = item.trim();
    const match = /\"?([^\"]*)\"?\s*<([^>]+)>/.exec(trimmed);
    if (match) {
      return {
        name: match[1] || undefined,
        address: match[2].toLowerCase(),
      };
    }
    return { address: trimmed.toLowerCase() };
  });
}

function decodeBody(part?: gmail_v1.Schema$MessagePart): { textBody?: string; htmlBody?: string } {
  if (!part) return {};
  const parts = part.parts || [];
  const data = part.body?.data;
  const mimeType = part.mimeType;

  const decode = (value: string) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLength);
    return Buffer.from(padded, 'base64').toString('utf8');
  };

  if (mimeType === 'text/plain' && data) {
    return { textBody: decode(data) };
  }
  if (mimeType === 'text/html' && data) {
    return { htmlBody: decode(data) };
  }

  let textBody: string | undefined;
  let htmlBody: string | undefined;

  for (const child of parts) {
    const decoded = decodeBody(child);
    if (decoded.textBody) textBody = decoded.textBody;
    if (decoded.htmlBody) htmlBody = decoded.htmlBody;
  }

  if (data && (mimeType === 'multipart/alternative' || mimeType === 'multipart/mixed')) {
    const content = decode(data);
    if (!textBody) textBody = content;
  }

  return { textBody, htmlBody };
}

function mapMessage(message: gmail_v1.Schema$Message): EmailMessage {
  const headers = headersToRecord(message.payload?.headers);
  const { textBody, htmlBody } = decodeBody(message.payload);
  const payloadParts = message.payload?.parts || [];

  return {
    id: message.id!,
    threadId: message.threadId!,
    historyId: message.historyId,
    subject: headers['subject'],
    from: parseAddressList(headers['from'])[0],
    to: parseAddressList(headers['to']),
    cc: parseAddressList(headers['cc']),
    bcc: parseAddressList(headers['bcc']),
    replyTo: parseAddressList(headers['reply-to']),
    snippet: message.snippet,
    internalDate: message.internalDate,
    textBody,
    htmlBody,
    attachments: payloadParts
      .filter(part => part.filename && part.body?.attachmentId)
      .map(part => ({
        id: part.body!.attachmentId!,
        filename: part.filename!,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body?.size || 0,
      })),
    headers,
  };
}

function mapThread(thread: gmail_v1.Schema$Thread): EmailThreadSummary {
  const messages = thread.messages || [];
  const latest = messages[messages.length - 1];
  const headers = headersToRecord(latest?.payload?.headers);
  const participants = new Map<string, EmailAddress>();

  for (const message of messages) {
    const msgHeaders = headersToRecord(message.payload?.headers);
    const all = [
      ...parseAddressList(msgHeaders['from']),
      ...parseAddressList(msgHeaders['to']),
      ...parseAddressList(msgHeaders['cc']),
    ];
    all.forEach(addr => {
      if (!participants.has(addr.address)) {
        participants.set(addr.address, addr);
      }
    });
  }

  return {
    id: thread.id!,
    snippet: latest?.snippet || '',
    subject: headers['subject'],
    historyId: thread.historyId,
    messagesCount: messages.length,
    lastUpdated: latest?.internalDate || '',
    unread: (latest?.labelIds || []).includes('UNREAD'),
    participants: Array.from(participants.values()),
  };
}

export class GmailService {
  private oauth2Client = getOAuthClient();

  getAuthUrl(state?: string) {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      prompt: 'consent',
      state,
    });
  }

  async exchangeCodeForTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    await this.saveTokens(tokens);
    return tokens;
  }

  async saveTokens(tokens: StoredTokens) {
    const [collectionName, docId] = CREDENTIALS_DOC_PATH;
    let mergedTokens: StoredTokens = { ...tokens };
    if (!tokens.refresh_token) {
      const current = await this.loadTokens();
      if (current?.refresh_token) {
        mergedTokens.refresh_token = current.refresh_token;
      }
    }
    if (!mergedTokens.expiry_date && tokens.expiry_date) {
      mergedTokens.expiry_date = tokens.expiry_date;
    }
    const encrypted = encryptTokens(mergedTokens);
    const payload = {
      version: 1,
      encrypted,
      scope: mergedTokens.scope,
      expiry_date: mergedTokens.expiry_date,
      updatedAt: new Date().toISOString(),
    };
    const ref = doc(db, collectionName, docId);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        ...payload,
      });
    }
  }

  async loadTokens(): Promise<StoredTokens | null> {
    const [collectionName, docId] = CREDENTIALS_DOC_PATH;
    const ref = doc(db, collectionName, docId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data();
    if (!data?.encrypted) return null;
    try {
      return decryptTokens(data.encrypted);
    } catch (error) {
      console.error('Erreur déchiffrement tokens Gmail', error);
      return null;
    }
  }

  async getAuthorizedClient() {
    const tokens = await this.loadTokens();
    if (!tokens) {
      throw new Error('Aucun token Gmail enregistré');
    }

    this.oauth2Client.setCredentials(tokens);

    if (!tokens.expiry_date || tokens.expiry_date <= Date.now()) {
      const refreshed = await this.oauth2Client.refreshAccessToken();
      await this.saveTokens(refreshed.credentials);
      this.oauth2Client.setCredentials(refreshed.credentials);
    }

    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async searchThreads(emails: string[], pageToken?: string) {
    if (emails.length === 0) {
      return { threads: [] as EmailThreadSummary[], nextPageToken: undefined };
    }

    const gmail = await this.getAuthorizedClient();
    const query = emails
      .map(email => `(${['from', 'to', 'cc'].map(field => `${field}:${email}`).join(' OR ')})`)
      .join(' OR ');

    const response = await gmail.users.threads.list({
      userId: 'me',
      q: query,
      pageToken,
      maxResults: 100,
    });

    const threads = (response.data.threads || []);
    if (threads.length === 0) {
      return { threads: [], nextPageToken: response.data.nextPageToken };
    }

    const fullThreads = await Promise.all(
      threads.map(async thread => {
        const full = await gmail.users.threads.get({ userId: 'me', id: thread.id! });
        return mapThread(full.data);
      })
    );

    return { threads: fullThreads, nextPageToken: response.data.nextPageToken };
  }

  async getThread(threadId: string) {
    const gmail = await this.getAuthorizedClient();
    const response = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    return (response.data.messages || []).map(mapMessage);
  }

  async sendMessage({
    to,
    cc,
    bcc,
    subject,
    body,
    threadId,
    replyTo,
  }: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: { html?: string; text?: string };
    threadId?: string;
    replyTo?: string[];
  }) {
    const gmail = await this.getAuthorizedClient();
    const lines: string[] = [];
    lines.push(`To: ${to.join(', ')}`);
    if (cc?.length) lines.push(`Cc: ${cc.join(', ')}`);
    if (bcc?.length) lines.push(`Bcc: ${bcc.join(', ')}`);
    if (replyTo?.length) lines.push(`Reply-To: ${replyTo.join(', ')}`);
    lines.push(`Subject: ${encodeHeaderValue(subject)}`);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    const content = body.html || `<pre>${body.text || ''}</pre>`;
    lines.push(content);

    const base64Message = Buffer.from(lines.join('\r\n')).toString('base64');
    const encodedMessage = base64Message.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const payload: gmail_v1.Schema$Message = {
      raw: encodedMessage,
    };

    if (threadId) {
      payload.threadId = threadId;
    }

    const response = await gmail.users.messages.send({ userId: 'me', requestBody: payload });
    return response.data;
  }

  async clearTokens() {
    const [collectionName, docId] = CREDENTIALS_DOC_PATH;
    await deleteDoc(doc(db, collectionName, docId));
  }
}

export const gmailService = new GmailService();
