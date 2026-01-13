import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { tokens } = await request.json();

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials(tokens);
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

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error('Erreur lors de la récupération des calendriers:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des calendriers' },
      { status: 500 }
    );
  }
}
