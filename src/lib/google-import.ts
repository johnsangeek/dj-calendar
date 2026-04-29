import { google } from 'googleapis';
import { collection, addDoc, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Booking } from '@/types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
export const GOOGLE_ALL_CALENDARS_ID = '__all__';
export const GOOGLE_DJ_CALENDARS_ID = '__dj__';

export interface GoogleImportFilters {
  excludeAllDayEvents?: boolean;
  excludeKeywords?: string[];
}

export interface GoogleImportOptions {
  tokens: Record<string, unknown>;
  calendarId?: string;
  startDate?: Date;
  endDate?: Date;
  filters?: GoogleImportFilters;
  strictMirror?: boolean;
}

export interface GoogleImportResult {
  imported: number;
  updated: number;
  deleted: number;
  skipped: number;
  importedEvents: Array<{ id?: string | null; firebaseId: string; title?: string | null }>; 
  updatedEvents: Array<{ id?: string | null; firebaseId: string; title?: string | null }>;
  deletedEvents: Array<{ id?: string | null; firebaseId: string; title?: string | null }>;
  skippedEvents: Array<{ id?: string | null; title?: string | null; reason: string }>;
  calendarErrors: Array<{ calendarId: string; error: string }>;
  skipReasons: Record<string, number>;
  logs: string[];
}

interface ClientDirectoryEntry {
  id: string;
  name: string;
  normalizedAliases: string[];
}

export async function importGoogleCalendarEvents(options: GoogleImportOptions): Promise<GoogleImportResult> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Configuration Google Calendar manquante côté serveur.');
  }

  const { tokens, calendarId, startDate, endDate, filters, strictMirror = false } = options;

  if (!tokens) {
    throw new Error('Aucun token Google Calendar fourni');
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const targetCalendarId = calendarId || 'primary';
  const isStrictDjMirror = strictMirror && targetCalendarId === GOOGLE_DJ_CALENDARS_ID;
  const logs: string[] = [];
  const log = (message: string) => {
    const line = `${new Date().toISOString()} ${message}`;
    logs.push(line);
    console.log(`[GoogleImport] ${line}`);
  };

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
  log(
    `Start import | target=${targetCalendarId} | range=${start.toISOString()} -> ${end.toISOString()} | filters=${JSON.stringify(filters || {})}`
  );

  const calendarIds = await resolveCalendarIds(calendar, targetCalendarId, log);
  log(`Resolved calendars: ${calendarIds.join(', ') || '(none)'}`);
  const { eventsByCalendar, calendarErrors } = await fetchEventsByCalendars(calendar, calendarIds, start, end, log);
  if (eventsByCalendar.length === 0 && calendarErrors.length > 0) {
    throw new Error(
      `Aucun événement récupéré. Erreurs calendriers: ${calendarErrors.map((err) => `${err.calendarId}: ${err.error}`).join(' | ')}`
    );
  }
  if (strictMirror && calendarErrors.length > 0) {
    throw new Error(
      `Mode miroir strict annulé (erreurs calendriers): ${calendarErrors.map((err) => `${err.calendarId}: ${err.error}`).join(' | ')}`
    );
  }

  const importedEvents: GoogleImportResult['importedEvents'] = [];
  const updatedEvents: GoogleImportResult['updatedEvents'] = [];
  const deletedEvents: GoogleImportResult['deletedEvents'] = [];
  const skippedEvents: GoogleImportResult['skippedEvents'] = [];
  const sourceEventKeys = new Set<string>();
  const skipReasons = new Map<string, number>();
  const recordSkip = (reason: string, event: { id?: string | null; summary?: string | null }) => {
    skippedEvents.push({ id: event.id, title: event.summary, reason });
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  const clientDirectory = await loadClientDirectory();
  log(`Client directory loaded: ${clientDirectory.length} client(s)`);

  const baseExcludedKeywords = (filters?.excludeKeywords || []).map((keyword) => keyword.toLowerCase());
  const forcedDjKeywords = ['anniversaire', 'anniversary', 'birthday', 'fete', 'fête'];
  const excludeKeywords = isStrictDjMirror
    ? Array.from(new Set([...baseExcludedKeywords, ...forcedDjKeywords]))
    : baseExcludedKeywords;
  const excludeAllDayEvents = isStrictDjMirror ? true : !!filters?.excludeAllDayEvents;
  log(
    `Events fetched: ${eventsByCalendar.length} | strictMirror=${strictMirror ? 'on' : 'off'} | strictDjMirror=${isStrictDjMirror ? 'on' : 'off'}`
  );

  for (const { calendarId: sourceCalendarId, event } of eventsByCalendar) {
    const searchableText = `${event.summary || ''} ${event.description || ''}`.toLowerCase();
    const isBirthdayEventType = (event.eventType || '').toLowerCase() === 'birthday';

    if (isStrictDjMirror && isBirthdayEventType) {
      recordSkip('Anniversaire (eventType)', event);
      continue;
    }

    if (excludeKeywords.length > 0 && excludeKeywords.some((keyword) => keyword && searchableText.includes(keyword))) {
      recordSkip('Mot-clé exclu', event);
      continue;
    }

    const isAllDayEvent = !!(event.start?.date && !event.start?.dateTime);
    if (excludeAllDayEvents && isAllDayEvent) {
      recordSkip('Événement sur la journée', event);
      continue;
    }

    if (!event.id) {
      recordSkip('ID Google manquant', event);
      continue;
    }

    sourceEventKeys.add(`${sourceCalendarId}::${event.id}`);

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
      recordSkip('Format de date invalide', event);
      continue;
    }

    const extractedClientName = extractClientName(event.description ?? undefined);
    const matchedClient = resolveClientFromEvent(clientDirectory, extractedClientName);
    const clientName = matchedClient?.name || extractedClientName || 'Client Google Calendar';
    const status = getStatusFromColorId(event.colorId ?? undefined) as Booking['status'];
    const bookingsQuery = query(collection(db, 'bookings'), where('sync.googleEventId', '==', event.id));
    const existingBookings = await getDocs(bookingsQuery);
    const existingBookingDoc = existingBookings.docs.find((bookingDoc) => {
      const existingSync = (bookingDoc.data() as { sync?: { calendarId?: string } }).sync;
      return (existingSync?.calendarId || 'primary') === sourceCalendarId;
    }) || existingBookings.docs[0];

    if (existingBookingDoc) {
      const existing = existingBookingDoc.data() as Partial<Booking> & { sync?: { calendarId?: string } };
      const clientId = existing.clientId || matchedClient?.id || null;
      const clientNameValue = existing.clientName || clientName;
      const syncData = {
        provider: 'google' as const,
        calendarId: sourceCalendarId,
        googleEventId: event.id,
        ...(event.etag ? { etag: event.etag } : {}),
        lastSyncedAt: new Date(),
        lastSyncedBy: 'google' as const,
        syncState: 'linked' as const,
      };

      await updateDoc(doc(db, 'bookings', existingBookingDoc.id), {
        title: event.summary || existing.title || 'Sans titre',
        clientId,
        clientName: clientNameValue,
        displayName: event.summary || clientNameValue,
        start: startDateValue,
        end: endDateValue,
        location: event.location || '',
        notes: event.description || '',
        status,
        sync: syncData,
        updatedAt: new Date(),
        updatedBy: 'google',
      });

      updatedEvents.push({
        id: event.id,
        firebaseId: existingBookingDoc.id,
        title: event.summary,
      });
      log(`Updated booking ${existingBookingDoc.id} from event ${event.id} (${sourceCalendarId})`);
      continue;
    }

    const syncData = {
      provider: 'google' as const,
      calendarId: sourceCalendarId,
      googleEventId: event.id,
      ...(event.etag ? { etag: event.etag } : {}),
      lastSyncedAt: new Date(),
      lastSyncedBy: 'google' as const,
      syncState: 'linked' as const,
    };

    const bookingData: Omit<Booking, 'id'> = {
      title: event.summary || 'Sans titre',
      clientId: matchedClient?.id || null,
      clientName,
      displayName: event.summary || clientName,
      start: startDateValue,
      end: endDateValue,
      location: event.location || '',
      notes: event.description || '',
      price: 0,
      deposit: 0,
      status,
      sync: syncData,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'google',
    };

    const docRef = await addDoc(collection(db, 'bookings'), bookingData);
    importedEvents.push({ id: event.id, firebaseId: docRef.id, title: event.summary });
    log(`Imported booking ${docRef.id} from event ${event.id} (${sourceCalendarId})`);
  }

  if (strictMirror) {
    const sourceCalendarSet = new Set(calendarIds);
    const strictDjScope = targetCalendarId === GOOGLE_DJ_CALENDARS_ID;
    const googleBookingsSnap = await getDocs(query(collection(db, 'bookings'), where('sync.provider', '==', 'google')));

    for (const bookingDoc of googleBookingsSnap.docs) {
      const data = bookingDoc.data() as {
        title?: string;
        sync?: { calendarId?: string; googleEventId?: string };
      };

      const sync = data.sync;
      const syncCalendarId = sync?.calendarId || 'primary';
      const syncEventId = sync?.googleEventId;
      const inDjScope = sourceCalendarSet.has(syncCalendarId);

      // En miroir strict DJ: purge aussi les anciens imports Google hors scope DJ
      if (strictDjScope && !inDjScope) {
        await deleteDoc(doc(db, 'bookings', bookingDoc.id));
        deletedEvents.push({
          id: syncEventId || null,
          firebaseId: bookingDoc.id,
          title: data.title || null,
        });
        log(`Deleted booking ${bookingDoc.id} (out of DJ scope: ${syncCalendarId})`);
        continue;
      }

      // Hors scope traité: rien à faire (cas strict non-DJ éventuel)
      if (!inDjScope) continue;

      // Dans le scope DJ, un event sans ID n'est pas synchronisable -> suppression miroir
      if (!syncEventId) {
        await deleteDoc(doc(db, 'bookings', bookingDoc.id));
        deletedEvents.push({
          id: null,
          firebaseId: bookingDoc.id,
          title: data.title || null,
        });
        log(`Deleted booking ${bookingDoc.id} (missing googleEventId in DJ scope ${syncCalendarId})`);
        continue;
      }

      const key = `${syncCalendarId}::${syncEventId}`;
      if (sourceEventKeys.has(key)) continue;

      await deleteDoc(doc(db, 'bookings', bookingDoc.id));
      deletedEvents.push({
        id: syncEventId,
        firebaseId: bookingDoc.id,
        title: data.title || null,
      });
      log(`Deleted booking ${bookingDoc.id} (missing from source calendar ${syncCalendarId})`);
    }
  }

  log(
    `Done import | imported=${importedEvents.length} | updated=${updatedEvents.length} | deleted=${deletedEvents.length} | skipped=${skippedEvents.length} | calendarErrors=${calendarErrors.length}`
  );

  return {
    imported: importedEvents.length,
    updated: updatedEvents.length,
    deleted: deletedEvents.length,
    skipped: skippedEvents.length,
    importedEvents,
    updatedEvents,
    deletedEvents,
    skippedEvents,
    calendarErrors,
    skipReasons: Object.fromEntries(skipReasons.entries()),
    logs,
  };
}

async function resolveCalendarIds(
  calendar: google.calendar_v3.Calendar,
  calendarId: string,
  log: (message: string) => void
): Promise<string[]> {
  if (calendarId !== GOOGLE_ALL_CALENDARS_ID && calendarId !== GOOGLE_DJ_CALENDARS_ID) {
    return [calendarId];
  }

  log('Listing all calendars from Google Calendar API');
  const calendarList = await calendar.calendarList.list();
  const items = calendarList.data.items || [];
  const allIds = items
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (calendarId === GOOGLE_ALL_CALENDARS_ID) {
    return allIds.length > 0 ? allIds : ['primary'];
  }

  const djIds = items
    .filter((entry) => {
      const summary = (entry.summary || '').toLowerCase();
      return summary.includes('dj') && !entry.primary;
    })
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (djIds.length > 0) {
    log(`DJ calendars detected (primary excluded): ${djIds.join(', ')}`);
    return djIds;
  }

  throw new Error('Aucun calendrier DJ non-primary trouvé (nom contenant "DJ"). Renomme/crée un agenda DJ dédié puis relance la synchronisation.');
}

async function fetchEventsByCalendars(
  calendar: google.calendar_v3.Calendar,
  calendarIds: string[],
  start: Date,
  end: Date,
  log: (message: string) => void
): Promise<{
  eventsByCalendar: Array<{ calendarId: string; event: google.calendar_v3.Schema$Event }>;
  calendarErrors: Array<{ calendarId: string; error: string }>;
}> {
  const allEvents: Array<{ calendarId: string; event: google.calendar_v3.Schema$Event }> = [];
  const calendarErrors: Array<{ calendarId: string; error: string }> = [];

  for (const calendarId of calendarIds) {
    try {
      log(`Fetch events | calendar=${calendarId}`);
      let pageToken: string | undefined;
      let fetchedForCalendar = 0;
      do {
        const response: google.calendar_v3.Schema$Events = (await calendar.events.list({
          calendarId,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          showDeleted: false,
          maxResults: 2500,
          pageToken,
        })).data;

        const items = response.items || [];
        for (const event of items) {
          allEvents.push({ calendarId, event });
        }

        fetchedForCalendar += items.length;
        pageToken = response.nextPageToken || undefined;
      } while (pageToken);

      log(`Fetched ${fetchedForCalendar} event(s) for calendar=${calendarId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      calendarErrors.push({ calendarId, error: errorMessage });
      log(`ERROR fetching calendar=${calendarId} -> ${errorMessage}`);
    }
  }

  return { eventsByCalendar: allEvents, calendarErrors };
}

async function loadClientDirectory(): Promise<ClientDirectoryEntry[]> {
  const clientsSnapshot = await getDocs(collection(db, 'clients'));
  return clientsSnapshot.docs.map((clientDoc) => {
    const data = clientDoc.data() as { name?: string; professionalName?: string; eventAliases?: string[] };
    const aliases = [data.name, data.professionalName, ...(Array.isArray(data.eventAliases) ? data.eventAliases : [])]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => normalizeForMatch(value));

    return {
      id: clientDoc.id,
      name: data.name || data.professionalName || 'Client',
      normalizedAliases: Array.from(new Set(aliases)),
    };
  });
}

function resolveClientFromEvent(
  clients: ClientDirectoryEntry[],
  extractedClientName?: string
): ClientDirectoryEntry | null {
  const candidates = [extractedClientName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeForMatch(value));

  if (candidates.length === 0) return null;

  // 1) match exact alias
  for (const candidate of candidates) {
    const exact = clients.find((client) => client.normalizedAliases.includes(candidate));
    if (exact) return exact;
  }

  // 2) score by containment and token overlap
  let bestMatch: ClientDirectoryEntry | null = null;
  let bestScore = 0;

  for (const client of clients) {
    for (const alias of client.normalizedAliases) {
      if (!alias) continue;
      for (const candidate of candidates) {
        const score = scoreAliasCandidate(alias, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = client;
        }
      }
    }
  }

  return bestScore >= 0.9 ? bestMatch : null;
}

function scoreAliasCandidate(alias: string, candidate: string): number {
  if (!alias || !candidate) return 0;
  if (alias === candidate) return 1;
  if (candidate.includes(alias) || alias.includes(candidate)) {
    const ratio = Math.min(alias.length, candidate.length) / Math.max(alias.length, candidate.length);
    return Math.max(0.75, ratio);
  }

  const aliasTokens = alias.split(' ').filter(Boolean);
  const candidateTokens = candidate.split(' ').filter(Boolean);
  if (aliasTokens.length === 0 || candidateTokens.length === 0) return 0;

  let common = 0;
  for (const token of aliasTokens) {
    if (candidateTokens.includes(token)) common++;
  }

  return common / Math.max(aliasTokens.length, candidateTokens.length);
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractClientName(description?: string): string | undefined {
  if (!description) return undefined;

  const clientMatch = description.match(/Client:\s*(.+)/i);
  if (!clientMatch) return undefined;

  const rawClient = clientMatch[1].split('\n')[0].trim();
  const normalizedRaw = normalizeForMatch(rawClient);
  const isGeneric =
    normalizedRaw === 'client google calendar' ||
    normalizedRaw === 'importe de google calendar' ||
    normalizedRaw === 'importe google calendar';

  if (isGeneric || !rawClient) return undefined;
  return rawClient;
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
