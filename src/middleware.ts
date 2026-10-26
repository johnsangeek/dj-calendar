import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

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

export async function middleware(req: NextRequest) {
  const isLite = process.env.NEXT_PUBLIC_LITE_MODE === 'true';
  const expected = expectedToken();
  const { pathname } = req.nextUrl;

  const isAuthCallback = pathname.startsWith('/auth/');
  // Pages publiques : confidentialité (exigée par Google) et connexion
  const isPublicPage = pathname === '/privacy' || pathname === '/login';

  let setPasswordCookie = false;
  if (expected && !isAuthCallback && !isPublicPage) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    let ok = !!session || cookie === expected;
    if (!ok) {
      // Secours : en-tête Basic (scripts, anciens accès)
      const header = req.headers.get('authorization') || '';
      const b64 = header.startsWith('Basic ') ? header.slice(6) : '';
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        const providedPwd = idx >= 0 ? decoded.slice(idx + 1) : decoded;
        ok = providedPwd === process.env.APP_PASSWORD;
        setPasswordCookie = ok;
      } catch {}
    }
    if (!ok) {
      const wantsPage = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
      if (wantsPage) {
        const url = new URL('/login', req.url);
        if (pathname !== '/') url.searchParams.set('next', pathname + req.nextUrl.search);
        return NextResponse.redirect(url);
      }
      return new NextResponse('Auth requise', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="DJ Booker"' },
      });
    }
  }

  const hidden = isLite && LITE_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const res = hidden ? NextResponse.rewrite(new URL('/', req.url)) : NextResponse.next();
  if (setPasswordCookie && expected) {
    res.cookies.set(AUTH_COOKIE, expected, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ONE_YEAR,
    });
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|manifest.webmanifest|sw.js|workbox-).*)'],
};
