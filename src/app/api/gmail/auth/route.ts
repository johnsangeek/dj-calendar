import { NextRequest, NextResponse } from 'next/server';
import { gmailReadService, gmailService } from '@/lib/gmail';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// `account=melanie` désigne la 2e connexion (lecture + brouillons pour l'assistant) : elle exige
// d'être connecté au site. Sans `account`, c'est la connexion d'envoi des factures, comme avant.
async function pickService(request: NextRequest, account: string | null | undefined) {
  if (account !== 'melanie') return { service: gmailService };
  const email = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!email) return { error: NextResponse.json({ error: 'Connexion au site requise' }, { status: 401 }) };
  return { service: gmailReadService };
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action');
    const picked = await pickService(request, request.nextUrl.searchParams.get('account'));
    if ('error' in picked) return picked.error;
    const service = picked.service;

    if (action === 'auth-url') {
      const state = request.nextUrl.searchParams.get('state') || undefined;
      const authUrl = service.getAuthUrl(state);
      return NextResponse.json({ authUrl });
    }

    if (action === 'status') {
      const tokens = await service.loadTokens();
      return NextResponse.json({
        connected: Boolean(tokens?.access_token || tokens?.refresh_token),
        hasRefreshToken: Boolean(tokens?.refresh_token),
        scope: tokens?.scope,
        expiry: tokens?.expiry_date,
      });
    }

    if (action === 'disconnect') {
      await service.clearTokens();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    console.error('Erreur Gmail auth GET', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code, account } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Code manquant' }, { status: 400 });
    }

    const picked = await pickService(request, account);
    if ('error' in picked) return picked.error;
    await picked.service.exchangeCodeForTokens(code);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur Gmail auth POST', error);
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde des tokens' }, { status: 500 });
  }
}
