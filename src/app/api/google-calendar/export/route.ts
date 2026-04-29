import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { tokens, calendarId, bookings } = await request.json();

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants' }, { status: 400 });
    }

    if (!bookings || !Array.isArray(bookings) || bookings.length === 0) {
      return NextResponse.json({ error: 'Aucun booking à exporter' }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Configuration Google Calendar manquante' }, { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const targetCalendarId = calendarId || 'primary';

    const results = [];
    const errors = [];

    for (const booking of bookings) {
      try {
        const event = {
          summary: booking.title || 'Événement sans titre',
          description: [
            booking.notes,
            `Client: ${booking.clientName}`,
            booking.price ? `Prix: ${booking.price}€` : null,
            booking.deposit ? `Acompte: ${booking.deposit}€` : null,
            `Statut: ${booking.status}`,
          ].filter(Boolean).join('\n'),
          location: booking.location || undefined,
          start: {
            dateTime: new Date(booking.start).toISOString(),
            timeZone: 'Europe/Paris',
          },
          end: {
            dateTime: new Date(booking.end).toISOString(),
            timeZone: 'Europe/Paris',
          },
          colorId: getColorIdFromStatus(booking.status),
        };

        const response = await calendar.events.insert({
          calendarId: targetCalendarId,
          requestBody: event,
        });

        results.push({
          bookingId: booking.id,
          googleEventId: response.data.id,
          title: booking.title,
          success: true,
        });
      } catch (error) {
        console.error(`Erreur export booking ${booking.id}:`, error);
        errors.push({
          bookingId: booking.id,
          title: booking.title,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    }

    return NextResponse.json({
      success: true,
      exported: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'export', details: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// Mapper les statuts vers les couleurs Google Calendar
function getColorIdFromStatus(status: string): string {
  switch (status) {
    case 'option':
      return '5'; // Jaune
    case 'confirmé':
      return '10'; // Vert
    case 'annulé':
      return '4'; // Rouge
    case 'terminé':
      return '8'; // Gris
    case 'remplaçant':
      return '9'; // Bleu
    default:
      return '1'; // Lavande (par défaut)
  }
}
