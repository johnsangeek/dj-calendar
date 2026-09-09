import { NextRequest, NextResponse } from 'next/server';
import { gmailService } from '@/lib/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOT_API_SECRET = process.env.BOT_API_SECRET;

// One-off utility endpoint: send a plain email via the connected Gmail account, no invoice
// involved. Used for corrections/one-time messages triggered from the bot.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-bot-secret');
    if (!BOT_API_SECRET || authHeader !== BOT_API_SECRET) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { to, subject, html } = await request.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject, html requis' }, { status: 400 });
    }

    const sent = await gmailService.sendMessage({ to: [to], subject, body: { html } });
    return NextResponse.json({ success: true, messageId: sent.id });
  } catch (error) {
    console.error('Erreur envoi mail simple', error);
    return NextResponse.json({ error: 'Erreur interne', details: String(error) }, { status: 500 });
  }
}
