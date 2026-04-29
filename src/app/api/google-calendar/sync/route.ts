import { NextRequest, NextResponse } from 'next/server';
import { google, calendar_v3 } from 'googleapis';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

type SyncBooking = {
  id: string;
  start: Date;
  end: Date;
  status?: string;
  title?: string;
  clientName?: string;
  notes?: string;
  location?: string;
  sync?: {
    provider?: string;
    calendarId?: string;
    googleEventId?: string;
  };
};

export async function POST(request: NextRequest) {
  try {
    const { tokens, bookingId, action, calendarId } = await request.json();

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants' }, { status: 400 });
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Configuration Google manquante' }, { status: 500 });
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
      const bookings = bookingsSnapshot.docs.map((bookingDoc) => normalizeBooking(bookingDoc.id, bookingDoc.data()));

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
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) {
        return NextResponse.json({ error: 'Réservation non trouvée' }, { status: 404 });
      }

      const booking = normalizeBooking(bookingSnap.id, bookingSnap.data());
      if (booking.status === 'annulé') {
        return NextResponse.json({ skipped: true, reason: 'Réservation annulée' });
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

function normalizeBooking(id: string, data: Record<string, unknown>): SyncBooking {
  const startValue = data.start as { toDate?: () => Date } | Date | string | undefined;
  const endValue = data.end as { toDate?: () => Date } | Date | string | undefined;
  const syncValue = data.sync as SyncBooking['sync'] | undefined;

  return {
    id,
    ...data,
    start: startValue && typeof (startValue as { toDate?: () => Date }).toDate === 'function'
      ? (startValue as { toDate: () => Date }).toDate()
      : new Date(startValue as string | Date),
    end: endValue && typeof (endValue as { toDate?: () => Date }).toDate === 'function'
      ? (endValue as { toDate: () => Date }).toDate()
      : new Date(endValue as string | Date),
    sync: syncValue,
  };
}

async function syncBookingToGoogle(calendar: calendar_v3.Calendar, booking: SyncBooking, calendarId: string): Promise<string> {
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
  let effectiveCalendarId = booking.sync?.calendarId || calendarId;

  if (eventId) {
    try {
      // Mettre à jour l'événement existant
      await calendar.events.update({
        calendarId: effectiveCalendarId,
        eventId: eventId,
        requestBody: eventData,
      });
    } catch (error) {
      if (!isEventMissingError(error)) {
        throw error;
      }

      // L'événement référencé n'existe plus : on le recrée proprement
      const recreated = await calendar.events.insert({
        calendarId,
        requestBody: eventData,
      });
      eventId = recreated.data.id || '';
      effectiveCalendarId = calendarId;
    }
  } else {
    // Créer un nouvel événement
    const event = await calendar.events.insert({
      calendarId,
      requestBody: eventData,
    });
    eventId = event.data.id || '';
    effectiveCalendarId = calendarId;
  }

  if (!eventId) {
    throw new Error('Impossible de récupérer l’ID Google Event après synchronisation');
  }

  await persistSyncMetadata(booking.id, eventId, effectiveCalendarId);
  return eventId;
}

function isEventMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = (error as { code?: number }).code;
  if (maybeCode === 404 || maybeCode === 410) return true;

  const maybeResponse = (error as { response?: { status?: number } }).response;
  if (maybeResponse?.status === 404 || maybeResponse?.status === 410) return true;

  return false;
}

async function persistSyncMetadata(bookingId: string, eventId: string, calendarId: string): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  await updateDoc(bookingRef, {
    sync: {
      provider: 'google',
      calendarId,
      googleEventId: eventId,
      lastSyncedAt: new Date(),
      lastSyncedBy: 'app',
      syncState: 'linked'
    },
    updatedAt: new Date()
  });
}

function getColorIdForStatus(status: string | undefined): string {
  const colorMap: Record<string, string> = {
    'option': '5',
    'confirmé': '2',
    'annulé': '11',
    'terminé': '1',
  };
  return (status && colorMap[status]) || '1';
}
