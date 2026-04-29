import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  const requestId = `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { tokens } = await request.json();

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants', requestId }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Configuration Google manquante', details: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET absents', requestId },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials(tokens);

    // Si le token est expiré et qu'on a un refresh_token, rafraîchir automatiquement
    let newTokens = null;
    if (tokens.expiry_date && tokens.expiry_date < Date.now() && tokens.refresh_token) {
      try {
        const refreshResponse = await oauth2Client.refreshAccessToken();
        newTokens = {
          ...tokens,
          ...refreshResponse.credentials,
          refresh_token: refreshResponse.credentials.refresh_token || tokens.refresh_token,
        };
        oauth2Client.setCredentials(newTokens);
      } catch (refreshError) {
        console.error('Erreur refresh token:', refreshError);
        return NextResponse.json(
          { error: 'Session expirée. Veuillez vous reconnecter à Google Calendar.' },
          { status: 401 }
        );
      }
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Lister tous les calendriers de l'utilisateur
    const response = await calendar.calendarList.list();

    const calendars = response.data.items?.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor
    }));

    // Retourner les nouveaux tokens si rafraîchis pour que le client les stocke
    return NextResponse.json({ calendars, newTokens, requestId });
  } catch (error: unknown) {
    console.error(`[GoogleCalendars:${requestId}] Erreur lors de la récupération des calendriers:`, error);

    // Vérifier si c'est une erreur d'authentification
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('invalid_grant') || errorMessage.includes('Token has been expired')) {
      return NextResponse.json(
        { error: 'Session expirée. Veuillez vous reconnecter à Google Calendar.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Erreur lors de la récupération des calendriers',
        details: errorMessage || 'Erreur inconnue',
        requestId,
      },
      { status: 500 }
    );
  }
}
