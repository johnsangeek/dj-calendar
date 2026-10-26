import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { safeNext } from '@/lib/session';

const ONE_YEAR = 60 * 60 * 24 * 365;

// Connexion de secours par mot de passe (APP_PASSWORD).
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') || '');
  const next = safeNext(String(form.get('next') || ''));
  const expectedPwd = process.env.APP_PASSWORD || '';
  const origin = request.nextUrl.origin;

  const a = Buffer.from(password);
  const b = Buffer.from(expectedPwd);
  const ok = expectedPwd !== '' && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.redirect(new URL('/login?error=pwd', origin), 303);
  }

  const res = NextResponse.redirect(new URL(next, origin), 303);
  res.cookies.set('dj_auth', Buffer.from(`dj:${expectedPwd}`).toString('base64'), {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
  });
  return res;
}
