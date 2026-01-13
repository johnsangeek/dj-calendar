import { googleCalendarService } from './google-calendar';
import { db } from './firebase';
import { collection, doc, updateDoc, getDocs, getDoc } from 'firebase/firestore';
import { Booking } from '@/types';

export class CalendarSyncService {
  private static instance: CalendarSyncService;

  static getInstance(): CalendarSyncService {
    if (!CalendarSyncService.instance) {
      CalendarSyncService.instance = new CalendarSyncService();
    }
    return CalendarSyncService.instance;
  }

  // Synchroniser une réservation vers Google Calendar
  async syncBookingToGoogle(booking: Booking): Promise<string | null> {
    try {
      const tokens = this.getStoredTokens();
      if (!tokens) {
        console.warn('Aucun token Google Calendar trouvé');
        return null;
      }

      // Configurer les tokens dans le service
      await this.configureGoogleService(tokens);

      // Créer ou mettre à jour l'événement
      let eventId = booking.sync?.googleEventId;

      if (eventId) {
        // Mettre à jour l'événement existant
        await googleCalendarService.updateEvent(eventId, booking);
        console.log('Événement mis à jour dans Google Calendar:', eventId);
      } else {
        // Créer un nouvel événement
        const event = await googleCalendarService.createEvent(booking);
        eventId = event.id;
        
        // Sauvegarder l'ID de l'événement dans Firestore
        if (eventId) {
          await this.updateBookingWithEventId(booking.id, eventId);
        }
        console.log('Nouvel événement créé dans Google Calendar:', eventId);
      }

      return eventId || null;
    } catch (error) {
      console.error('Erreur lors de la synchronisation avec Google Calendar:', error);
      throw error;
    }
  }

  // Supprimer un événement de Google Calendar
  async deleteFromGoogleCalendar(eventId: string): Promise<void> {
    try {
      const tokens = this.getStoredTokens();
      if (!tokens) {
        console.warn('Aucun token Google Calendar trouvé');
        return;
      }

      await this.configureGoogleService(tokens);
      await googleCalendarService.deleteEvent(eventId);
      console.log('Événement supprimé de Google Calendar:', eventId);
    } catch (error) {
      console.error('Erreur lors de la suppression de Google Calendar:', error);
      throw error;
    }
  }

  // Synchroniser toutes les réservations
  async syncAllBookings(): Promise<void> {
    try {
      const tokens = this.getStoredTokens();
      if (!tokens) {
        throw new Error('Non authentifié à Google Calendar');
      }

      await this.configureGoogleService(tokens);

      // Récupérer toutes les réservations depuis Firestore
      const bookingsSnapshot = await getDocs(collection(db, 'bookings'));
      const bookings = bookingsSnapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
        start: doc.data().start?.toDate ? doc.data().start.toDate() : new Date(doc.data().start),
        end: doc.data().end?.toDate ? doc.data().end.toDate() : new Date(doc.data().end),
      })) as Booking[];

      // Synchroniser chaque réservation
      for (const booking of bookings) {
        if (booking.status !== 'annulé') {
          await this.syncBookingToGoogle(booking);
        }
      }

      console.log('Synchronisation terminée');
    } catch (error) {
      console.error('Erreur lors de la synchronisation complète:', error);
      throw error;
    }
  }

  // Importer les événements de Google Calendar
  async importFromGoogleCalendar(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const tokens = this.getStoredTokens();
      if (!tokens) {
        throw new Error('Non authentifié à Google Calendar');
      }

      await this.configureGoogleService(tokens);
      return await googleCalendarService.listEvents(startDate, endDate);
    } catch (error) {
      console.error('Erreur lors de l\'import depuis Google Calendar:', error);
      throw error;
    }
  }

  // Vérifier la connexion à Google Calendar
  async checkConnection(): Promise<boolean> {
    try {
      const tokens = this.getStoredTokens();
      if (!tokens) return false;

      await this.configureGoogleService(tokens);
      
      // Tester la connexion en listant les événements prochains
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await googleCalendarService.listEvents(now, nextWeek);
      
      return true;
    } catch (error) {
      console.error('Erreur lors de la vérification de connexion:', error);
      return false;
    }
  }

  // Méthodes privées
  private getStoredTokens(): any {
    const tokens = localStorage.getItem('google_calendar_tokens');
    return tokens ? JSON.parse(tokens) : null;
  }

  private async configureGoogleService(tokens: any): Promise<void> {
    // Configurer les tokens dans le service Google Calendar
    // Note: Vous devrez peut-être adapter cette méthode selon votre implémentation
    if (tokens.refresh_token) {
      try {
        const refreshedTokens = await googleCalendarService.refreshTokens(tokens.refresh_token);
        localStorage.setItem('google_calendar_tokens', JSON.stringify(refreshedTokens));
      } catch (error) {
        console.error('Erreur lors du rafraîchissement des tokens:', error);
        throw error;
      }
    }
  }

  private async updateBookingWithEventId(bookingId: string, eventId: string): Promise<void> {
    const bookingRef = doc(db, 'bookings', bookingId);
    await updateDoc(bookingRef, {
      sync: {
        provider: 'google' as const,
        calendarId: 'primary',
        googleEventId: eventId,
        lastSyncedAt: new Date(),
        lastSyncedBy: 'app' as const,
        syncState: 'linked' as const
      },
      updatedAt: new Date()
    });
  }
}

export const calendarSyncService = CalendarSyncService.getInstance();
