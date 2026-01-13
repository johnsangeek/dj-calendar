import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { tokens, bookingId, action, calendarId } = await request.json();

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Utiliser le calendarId fourni ou 'primary' par défaut
    const targetCalendarId = calendarId || 'primary';

    if (action === 'sync-all') {
      // Synchroniser toutes les réservations
      const bookingsSnapshot = await getDocs(collection(db, 'bookings'));
      const bookings = bookingsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        start: data.start?.toDate ? data.start.toDate() : new Date(data.start),
        end: data.end?.toDate ? data.end.toDate() : new Date(data.end),
        status: data.status,
        title: data.title,
        clientName: data.clientName,
        notes: data.notes,
        location: data.location,
        sync: data.sync
      };
    });

      const results = [];
      for (const booking of bookings) {
        if (booking.status !== 'annulé') {
          try {
            const result = await syncBookingToGoogle(calendar, booking, targetCalendarId);
            results.push({ bookingId: booking.id, success: true, eventId: result });
          } catch (error) {
            results.push({ bookingId: booking.id, success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
          }
        }
      }

      return NextResponse.json({ results });
    } else if (action === 'sync-booking' && bookingId) {
      // Synchroniser une réservation spécifique
      const bookingDoc = await getDocs(collection(db, 'bookings'));
      const booking = bookingDoc.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(b => b.id === bookingId);

      if (!booking) {
        return NextResponse.json({ error: 'Réservation non trouvée' }, { status: 404 });
      }

      const eventId = await syncBookingToGoogle(calendar, booking, targetCalendarId);
      return NextResponse.json({ eventId });
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    console.error('Erreur lors de la synchronisation:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la synchronisation' },
      { status: 500 }
    );
  }
}

async function syncBookingToGoogle(calendar: any, booking: any, calendarId: string): Promise<string> {
  const eventData = {
    summary: booking.title,
    description: `Client: ${booking.clientName}\n${booking.notes || ''}`,
    start: {
      dateTime: booking.start.toISOString(),
      timeZone: 'Europe/Paris',
    },
    end: {
      dateTime: booking.end.toISOString(),
      timeZone: 'Europe/Paris',
    },
    location: booking.location || '',
    colorId: getColorIdForStatus(booking.status),
  };

  let eventId = booking.sync?.googleEventId;

  if (eventId) {
    // Mettre à jour l'événement existant
    await calendar.events.update({
      calendarId: calendarId,
      eventId: eventId,
      resource: eventData,
    });
  } else {
    // Créer un nouvel événement
    const event = await calendar.events.insert({
      calendarId: calendarId,
      resource: eventData,
    });
    eventId = event.data.id;

    // Sauvegarder l'ID de l'événement
    const bookingRef = doc(db, 'bookings', booking.id);
    await updateDoc(bookingRef, {
      sync: {
        provider: 'google',
        calendarId: calendarId,
        googleEventId: eventId,
        lastSyncedAt: new Date(),
        lastSyncedBy: 'app',
        syncState: 'linked'
      },
      updatedAt: new Date()
    });
  }

  return eventId;
}

function getColorIdForStatus(status: string): string {
  const colorMap: Record<string, string> = {
    'option': '5',
    'confirmé': '2',
    'annulé': '11',
    'terminé': '1',
  };
  return colorMap[status] || '1';
}
