import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { tokens, startDate, endDate, calendarId } = await request.json();

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

    console.log('🔍 Import depuis calendrier:', targetCalendarId);

    // Définir la plage de dates (3 mois avant et 12 mois après)
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Récupérer les événements depuis Google Calendar
    const response = await calendar.events.list({
      calendarId: targetCalendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log(`📅 ${response.data.items?.length || 0} événements trouvés dans le calendrier ${targetCalendarId}`);

    const googleEvents = response.data.items || [];
    const importedEvents = [];
    const skippedEvents = [];

    for (const event of googleEvents) {
      // Gérer les dates pour les événements "toute la journée" et les événements avec heure
      let startDate: Date;
      let endDate: Date;

      if (event.start?.dateTime && event.end?.dateTime) {
        // Événement avec heure précise
        startDate = new Date(event.start.dateTime);
        endDate = new Date(event.end.dateTime);
      } else if (event.start?.date && event.end?.date) {
        // Événement "toute la journée" - on lui attribue une plage horaire par défaut (20h - 02h)
        const dateOnly = new Date(event.start.date);
        startDate = new Date(dateOnly);
        startDate.setHours(20, 0, 0, 0); // 20h00

        endDate = new Date(dateOnly);
        endDate.setHours(26, 0, 0, 0); // 02h00 du matin (26h = 2h le lendemain)

        console.log(`📅 Événement toute la journée converti: ${event.summary} → ${startDate.toLocaleString('fr-FR')} - ${endDate.toLocaleString('fr-FR')}`);
      } else {
        console.log(`⏭️ Événement ignoré (format de date invalide): ${event.summary}`);
        skippedEvents.push({ id: event.id, title: event.summary, reason: 'Format de date invalide' });
        continue;
      }

      // Vérifier si l'événement existe déjà
      const bookingsQuery = query(
        collection(db, 'bookings'),
        where('sync.googleEventId', '==', event.id)
      );
      const existingBookings = await getDocs(bookingsQuery);

      if (!existingBookings.empty) {
        console.log(`⏭️ Événement ignoré (déjà importé): ${event.summary}`);
        skippedEvents.push({ id: event.id, title: event.summary, reason: 'Déjà importé' });
        continue;
      }

      // Créer une nouvelle réservation
      const bookingData = {
        title: event.summary || 'Sans titre',
        clientName: extractClientName(event.description ?? undefined, event.summary ?? undefined),
        start: startDate,
        end: endDate,
        location: event.location || '',
        notes: event.description || '',
        price: 0,
        deposit: 0,
        status: getStatusFromColorId(event.colorId ?? undefined) as 'option' | 'confirmé' | 'annulé' | 'terminé',
        sync: {
          provider: 'google',
          calendarId: targetCalendarId,
          googleEventId: event.id,
          etag: event.etag,
          lastSyncedAt: new Date(),
          lastSyncedBy: 'google',
          syncState: 'linked'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: 'google' as 'google' | 'app'
      };

      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      console.log(`✅ Événement importé: ${event.summary}`);
      importedEvents.push({ id: event.id, firebaseId: docRef.id, title: event.summary });
    }

    return NextResponse.json({
      success: true,
      imported: importedEvents.length,
      skipped: skippedEvents.length,
      details: {
        importedEvents,
        skippedEvents
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'importation:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'importation', details: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

function extractClientName(description?: string, summary?: string): string {
  // Si pas de description, utiliser le titre de l'événement comme nom du client
  if (!description && summary) {
    return summary;
  }

  if (!description) return 'Client Google Calendar';

  // Chercher "Client: XXX" dans la description
  const clientMatch = description.match(/Client:\s*(.+)/i);
  if (clientMatch) {
    return clientMatch[1].split('\n')[0].trim();
  }

  // Chercher des patterns courants pour extraire un nom
  // Pattern: "Nom Prénom" ou "ENTREPRISE" au début de la description
  const lines = description.split('\n').filter(line => line.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    // Si la première ligne ressemble à un nom (pas trop long, pas d'URL, etc.)
    if (firstLine.length < 50 && !firstLine.includes('http') && !firstLine.includes('@')) {
      return firstLine;
    }
  }

  // Si on a un summary (titre), l'utiliser comme nom du client
  if (summary) {
    return summary;
  }

  return 'Client Google Calendar';
}

function getStatusFromColorId(colorId?: string): string {
  const colorMap: Record<string, string> = {
    '5': 'option',     // Jaune
    '2': 'confirmé',   // Vert
    '11': 'annulé',    // Rouge
    '1': 'terminé',    // Bleu
  };
  return colorMap[colorId || '1'] || 'option';
}
