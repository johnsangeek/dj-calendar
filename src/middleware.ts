import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const LITE_HIDDEN_PREFIXES = [
  '/scraping',
  '/instagram-inbox',
  '/instagram-relances',
  '/instagram-templates',
  '/crm',
  '/catalog',
  '/demo',
  '/messages',
  '/web',
  '/availability',
];

export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_LITE_MODE !== 'true') return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (LITE_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.rewrite(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|manifest.webmanifest|sw.js|workbox-).*)'],
};
