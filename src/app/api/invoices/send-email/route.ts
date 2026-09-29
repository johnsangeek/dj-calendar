import { NextRequest, NextResponse } from 'next/server';
import { sendInvoiceEmail } from '@/lib/send-invoice-email';

export const runtime = 'nodejs';
export const maxDuration = 30;

const AUTH_COOKIE = 'dj_auth';

function expectedToken(): string | null {
  const pwd = process.env.APP_PASSWORD;
  if (!pwd) return null;
  return Buffer.from(`dj:${pwd}`).toString('base64');
}

// API routes aren't covered by middleware.ts's matcher, so this checks the same app-password
// cookie/header itself instead of being wide open like /api/gmail/send.
function isAuthorized(request: NextRequest): boolean {
  const expected = expectedToken();
  if (!expected) return true; // no APP_PASSWORD configured — app-wide auth is off entirely

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === expected) return true;

  const header = request.headers.get('authorization') || '';
  const b64 = header.startsWith('Basic ') ? header.slice(6) : '';
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const providedPwd = idx >= 0 ? decoded.slice(idx + 1) : decoded;
    return providedPwd === process.env.APP_PASSWORD;
  } catch {
    return false;
  }
}

// Sends an invoice by email from the web UI's "Mail" button, using the same server-side Gmail
// connection (Settings > Gmail) as the Telegram bot — not a browser mail.google.com compose
// link, which silently used whichever Google account happened to be active in that browser tab.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const { invoiceId, number } = await request.json();
    const { messageId, sentTo } = await sendInvoiceEmail({ invoiceId, number });
    return NextResponse.json({ success: true, messageId, sentTo });
  } catch (error) {
    console.error('Erreur envoi email facture:', error);
    const message = error instanceof Error ? error.message : "Erreur lors de l'envoi de l'email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
