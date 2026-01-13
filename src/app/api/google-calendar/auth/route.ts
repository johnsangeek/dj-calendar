import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  // Debug logs
  console.log('Google Calendar Auth API called');
  console.log('GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
  console.log('GOOGLE_CLIENT_SECRET:', GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
  console.log('REDIRECT_URI:', REDIRECT_URI);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !REDIRECT_URI) {
    return NextResponse.json(
      { 
        error: 'Configuration manquante',
        details: {
          clientId: !!GOOGLE_CLIENT_ID,
          clientSecret: !!GOOGLE_CLIENT_SECRET,
          redirectUri: REDIRECT_URI
        }
      }, 
      { status: 500 }
    );
  }

  if (action === 'auth-url') {
    // Générer l'URL d'authentification
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    return NextResponse.json({ authUrl });
  }

  return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Code manquant' }, { status: 400 });
    }

    // Échanger le code contre des tokens
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error('Erreur lors de l\'échange du code:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'authentification' },
      { status: 500 }
    );
  }
}
