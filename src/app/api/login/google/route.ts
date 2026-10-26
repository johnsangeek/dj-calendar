import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import { safeNext } from '@/lib/session';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Démarre la connexion Google (scopes openid + email seulement : aucune donnée sensible demandée).
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/login?error=config', origin));
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${origin}/auth/google-callback`);
  const url = oauth2Client.generateAuthUrl({
    scope: ['openid', 'email'],
    prompt: 'select_account',
    state: `service=login&n=${nonce}`,
  });

  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: origin.startsWith('https'), sameSite: 'lax' as const, path: '/', maxAge: 600 };
  res.cookies.set('dj_login_nonce', nonce, opts);
  res.cookies.set('dj_login_next', safeNext(request.nextUrl.searchParams.get('next')), opts);
  return res;
}
