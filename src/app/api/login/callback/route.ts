import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { SESSION_COOKIE, SESSION_DAYS, allowedEmails, createSession, safeNext } from '@/lib/session';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Reçoit le code Google (depuis /auth/google-callback), vérifie l'e-mail et ouvre la session.
export async function POST(request: NextRequest) {
  try {
    const { code, nonce } = await request.json();
    const cookieNonce = request.cookies.get('dj_login_nonce')?.value;
    if (!code || !nonce || !cookieNonce || nonce !== cookieNonce) {
      return NextResponse.json({ error: 'Connexion expirée, recommence.' }, { status: 400 });
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Configuration Google manquante' }, { status: 500 });
    }

    const origin = request.nextUrl.origin;
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${origin}/auth/google-callback`);
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.id_token) return NextResponse.json({ error: 'Réponse Google invalide' }, { status: 400 });

    const ticket = await oauth2Client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email || !payload?.email_verified || !allowedEmails().includes(email)) {
      return NextResponse.json({ error: `Ce compte Google (${email ?? 'inconnu'}) n'a pas accès.` }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true, next: safeNext(request.cookies.get('dj_login_next')?.value) });
    res.cookies.set(SESSION_COOKIE, await createSession(email), {
      httpOnly: true,
      secure: origin.startsWith('https'),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
    res.cookies.delete('dj_login_nonce');
    res.cookies.delete('dj_login_next');
    return res;
  } catch (error) {
    console.error('Erreur connexion Google:', error);
    return NextResponse.json({ error: 'Erreur lors de la connexion' }, { status: 500 });
  }
}
