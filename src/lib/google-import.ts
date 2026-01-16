import { google } from 'googleapis';
import { collection, addDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Booking } from '@/types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export interface GoogleImportFilters {
  excludeAllDayEvents?: boolean;
  excludeKeywords?: string[];
}

export interface GoogleImportOptions {
  tokens: any;
  calendarId?: string;
  startDate?: Date;
  endDate?: Date;
  filters?: GoogleImportFilters;
}

export interface GoogleImportResult {
  imported: number;
  skipped: number;
  importedEvents: Array<{ id?: string | null; firebaseId: string; title?: string | null }>; 
  skippedEvents: Array<{ id?: string | null; title?: string | null; reason: string }>;
}

export async function importGoogleCalendarEvents(options: GoogleImportOptions): Promise<GoogleImportResult> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Configuration Google Calendar manquante côté serveur.');
  }

  const { tokens, calendarId, startDate, endDate, filters } = options;

  if (!tokens) {
    throw new Error('Aucun token Google Calendar fourni');
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const targetCalendarId = calendarId || 'primary';

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: targetCalendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: false,
  });

  const googleEvents = response.data.items || [];

  const importedEvents: GoogleImportResult['importedEvents'] = [];
  const skippedEvents: GoogleImportResult['skippedEvents'] = [];

  const excludeKeywords = (filters?.excludeKeywords || []).map((keyword) => keyword.toLowerCase());
  const excludeAllDayEvents = !!filters?.excludeAllDayEvents;

  for (const event of googleEvents) {
    const summaryLower = (event.summary || '').toLowerCase();

    if (excludeKeywords.length > 0 && excludeKeywords.some((keyword) => keyword && summaryLower.includes(keyword))) {
      skippedEvents.push({ id: event.id, title: event.summary, reason: 'Mot-clé exclu' });
      continue;
    }

    const isAllDayEvent = !!(event.start?.date && !event.start?.dateTime);
    if (excludeAllDayEvents && isAllDayEvent) {
      skippedEvents.push({ id: event.id, title: event.summary, reason: 'Événement sur la journée' });
      continue;
    }

    let startDateValue: Date;
    let endDateValue: Date;

    if (event.start?.dateTime && event.end?.dateTime) {
      startDateValue = new Date(event.start.dateTime);
      endDateValue = new Date(event.end.dateTime);
    } else if (event.start?.date && event.end?.date) {
      const dateOnly = new Date(event.start.date);
      startDateValue = new Date(dateOnly);
      startDateValue.setHours(20, 0, 0, 0);

      endDateValue = new Date(dateOnly);
      endDateValue.setHours(26, 0, 0, 0);
    } else {
      skippedEvents.push({ id: event.id, title: event.summary, reason: 'Format de date invalide' });
      continue;
    }

    if (event.id) {
      const bookingsQuery = query(collection(db, 'bookings'), where('sync.googleEventId', '==', event.id));
      const existingBookings = await getDocs(bookingsQuery);
      if (!existingBookings.empty) {
        skippedEvents.push({ id: event.id, title: event.summary, reason: 'Déjà importé' });
        continue;
      }
    }

    const clientName = extractClientName(event.description ?? undefined, event.summary ?? undefined);
    const status = getStatusFromColorId(event.colorId ?? undefined) as Booking['status'];

    const bookingData: Omit<Booking, 'id'> = {
      title: event.summary || 'Sans titre',
      clientName,
      displayName: event.summary || clientName,
      start: startDateValue,
      end: endDateValue,
      location: event.location || '',
      notes: event.description || '',
      price: 0,
      deposit: 0,
      status,
      sync: {
        provider: 'google',
        calendarId: targetCalendarId,
        googleEventId: event.id || undefined,
        etag: event.etag,
        lastSyncedAt: new Date(),
        lastSyncedBy: 'google',
        syncState: 'linked',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'google',
    };

    const docRef = await addDoc(collection(db, 'bookings'), bookingData);
    importedEvents.push({ id: event.id, firebaseId: docRef.id, title: event.summary });
  }

  return {
    imported: importedEvents.length,
    skipped: skippedEvents.length,
    importedEvents,
    skippedEvents,
  };
}

function extractClientName(description?: string, summary?: string): string {
  if (!description && summary) {
    return summary;
  }

  if (!description) return 'Client Google Calendar';

  const clientMatch = description.match(/Client:\s*(.+)/i);
  if (clientMatch) {
    return clientMatch[1].split('\n')[0].trim();
  }

  const lines = description.split('\n').filter((line) => line.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length < 50 && !firstLine.includes('http') && !firstLine.includes('@')) {
      return firstLine;
    }
  }

  if (summary) {
    return summary;
  }

  return 'Client Google Calendar';
}

function getStatusFromColorId(colorId?: string): string {
  const colorMap: Record<string, string> = {
    '5': 'option',
    '2': 'confirmé',
    '11': 'annulé',
    '1': 'terminé',
  };
  return colorMap[colorId || '1'] || 'option';
}
