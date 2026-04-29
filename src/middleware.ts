import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const LITE_HIDDEN_PREFIXES = [
  '/scraping',
  '/instagram-inbox',
  '/instagram-relances',
  '/instagram-templates',
  '/crm',
  '/demo',
  '/messages',
  '/web',
  '/availability',
];

const AUTH_COOKIE = 'dj_auth';
const ONE_YEAR = 60 * 60 * 24 * 365;

function expectedToken(): string | null {
  const pwd = process.env.APP_PASSWORD;
  if (!pwd) return null;
  return Buffer.from(`dj:${pwd}`).toString('base64');
}

export function middleware(req: NextRequest) {
  const isLite = process.env.NEXT_PUBLIC_LITE_MODE === 'true';
  const expected = expectedToken();
  const { pathname } = req.nextUrl;

  const isAuthCallback = pathname.startsWith('/auth/');

  if (expected && !isAuthCallback) {
    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    const pwd = process.env.APP_PASSWORD!;
    let ok = cookie === expected;
    if (!ok) {
      const header = req.headers.get('authorization') || '';
      const b64 = header.startsWith('Basic ') ? header.slice(6) : '';
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        const providedPwd = idx >= 0 ? decoded.slice(idx + 1) : decoded;
        ok = providedPwd === pwd;
      } catch {}
    }
    if (!ok) {
      return new NextResponse('Auth requise', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="DJ Booker"' },
      });
    }
    if (cookie !== expected) {
      const res = NextResponse.next();
      res.cookies.set(AUTH_COOKIE, expected, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ONE_YEAR,
      });
      if (isLite && LITE_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
        return NextResponse.rewrite(new URL('/', req.url), { headers: res.headers });
      }
      return res;
    }
  }

  if (isLite && LITE_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.rewrite(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|manifest.webmanifest|sw.js|workbox-).*)'],
};
