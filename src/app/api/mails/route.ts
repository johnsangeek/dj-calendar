import { NextRequest, NextResponse } from 'next/server';
import { gmailReadService } from '@/lib/gmail';
import { badRequest, isAuthorized, logCall, parseLimit, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_QUERY_LENGTH = 100;
const READ_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/',
];
const NOT_CONNECTED = 'Connecte « Gmail pour Mélanie » dans Paramètres (lecture + brouillons).';

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const params = request.nextUrl.searchParams;
  const limit = parseLimit(params);
  if ('error' in limit) return badRequest(limit.error);
  const text = (params.get('q') || '').trim();
  if (text.length > MAX_QUERY_LENGTH) return badRequest(`q ne doit pas dépasser ${MAX_QUERY_LENGTH} caractères`);
  // Texte libre uniquement : on retire guillemets et antislash pour qu'aucun opérateur Gmail ne s'y glisse.
  const safeText = text.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();

  try {
    // 2e connexion Gmail (lecture + brouillons), distincte de celle qui envoie les factures.
    const tokens = await gmailReadService.loadTokens();
    const scopes = (tokens?.scope || '').split(/\s+/);
    if (!tokens || !READ_SCOPES.some((scope) => scopes.includes(scope))) {
      return NextResponse.json({ error: 'gmail_read_not_connected', detail: NOT_CONNECTED }, { status: 503 });
    }

    const gmail = await gmailReadService.getAuthorizedClient();
    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      maxResults: limit.value,
      ...(safeText ? { q: `(subject:"${safeText}" OR from:"${safeText}")` } : {}),
    });

    const mails = await Promise.all(
      (list.data.messages || []).map(async ({ id }) => {
        const { data } = await gmail.users.messages.get({
          userId: 'me',
          id: id as string,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject'],
        });
        const header = (name: string) => data.payload?.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? '';
        return {
          from: header('from'),
          subject: header('subject'),
          date: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null,
          snippet: data.snippet ?? '',
        };
      }),
    );

    logCall('/api/mails', mails.length);
    return NextResponse.json({ mails });
  } catch (error) {
    console.error('[melanie-api] /api/mails erreur Gmail :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'gmail_unavailable', detail: 'Gmail ne répond pas ou la connexion doit être refaite (Paramètres).' }, { status: 502 });
  }
}
