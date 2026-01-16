import { NextRequest, NextResponse } from 'next/server';
import { gmailService } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action');
    if (action === 'auth-url') {
      const state = request.nextUrl.searchParams.get('state') || undefined;
      const authUrl = gmailService.getAuthUrl(state);
      return NextResponse.json({ authUrl });
    }

    if (action === 'status') {
      const tokens = await gmailService.loadTokens();
      return NextResponse.json({
        connected: Boolean(tokens?.access_token || tokens?.refresh_token),
        hasRefreshToken: Boolean(tokens?.refresh_token),
        scope: tokens?.scope,
        expiry: tokens?.expiry_date,
      });
    }

    if (action === 'disconnect') {
      await gmailService.clearTokens();
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
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Code manquant' }, { status: 400 });
    }

    await gmailService.exchangeCodeForTokens(code);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur Gmail auth POST', error);
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde des tokens' }, { status: 500 });
  }
}
