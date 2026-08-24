import { NextRequest, NextResponse } from 'next/server';
import { gmailService, gmailServiceJordan } from '@/lib/gmail';

export const runtime = 'nodejs';

const BOT_API_SECRET = process.env.BOT_API_SECRET;

// Temporary debug endpoint: raw Gmail search by query string, for inspecting email formats
// (e.g. Revolut payment notifications) before designing an automated detection feature.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-bot-secret');
    if (!BOT_API_SECRET || authHeader !== BOT_API_SECRET) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { query, maxResults, account } = await request.json();
    if (!query) {
      return NextResponse.json({ error: 'query requis' }, { status: 400 });
    }

    const service = account === 'jordan' ? gmailServiceJordan : gmailService;
    const gmail = await service.getAuthorizedClient();
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults || 10,
    });

    const messages = await Promise.all(
      (list.data.messages || []).map(async (m) => {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' });
        const headers = msg.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        let bodyText = '';
        const extractText = (part: any): string => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
          if (part.parts) {
            for (const p of part.parts) {
              const t = extractText(p);
              if (t) return t;
            }
          }
          return '';
        };
        if (msg.data.payload) bodyText = extractText(msg.data.payload);

        return {
          from: getHeader('From'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: msg.data.snippet,
          bodyPreview: bodyText.slice(0, 1500),
        };
      })
    );

    return NextResponse.json({ count: messages.length, messages });
  } catch (error) {
    console.error('Erreur recherche Gmail debug', error);
    return NextResponse.json({ error: 'Erreur interne', details: String(error) }, { status: 500 });
  }
}
