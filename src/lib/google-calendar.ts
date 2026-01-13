import { google } from 'googleapis';

// Configuration pour Google Calendar API
const GOOGLE_CALENDAR_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI,
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
};

export class GoogleCalendarService {
  private calendar: any;
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CALENDAR_CONFIG.clientId,
      GOOGLE_CALENDAR_CONFIG.clientSecret,
      GOOGLE_CALENDAR_CONFIG.redirectUri
    );

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  // Générer l'URL d'authentification
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  // Échanger le code contre des tokens
  async exchangeCodeForTokens(code: string) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      return tokens;
    } catch (error) {
      console.error('Erreur lors de l\'échange du code:', error);
      throw error;
    }
  }

  // Rafraîchir les tokens
  async refreshTokens(refreshToken: string) {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error('Erreur lors du rafraîchissement des tokens:', error);
      throw error;
    }
  }

  // Créer un événement dans Google Calendar
  async createEvent(booking: any) {
    try {
      const event = {
        summary: booking.title,
        description: `Client: ${booking.clientName}\n${booking.description || ''}`,
        start: {
          dateTime: booking.start.toISOString(),
          timeZone: 'Europe/Paris',
        },
        end: {
          dateTime: booking.end.toISOString(),
          timeZone: 'Europe/Paris',
        },
        location: booking.location || '',
        colorId: this.getColorIdForStatus(booking.status),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 jour avant
            { method: 'popup', minutes: 60 }, // 1 heure avant
          ],
        },
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la création de l\'événement:', error);
      throw error;
    }
  }

  // Mettre à jour un événement
  async updateEvent(eventId: string, booking: any) {
    try {
      const event = {
        summary: booking.title,
        description: `Client: ${booking.clientName}\n${booking.description || ''}`,
        start: {
          dateTime: booking.start.toISOString(),
          timeZone: 'Europe/Paris',
        },
        end: {
          dateTime: booking.end.toISOString(),
          timeZone: 'Europe/Paris',
        },
        location: booking.location || '',
        colorId: this.getColorIdForStatus(booking.status),
      };

      const response = await this.calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event,
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'événement:', error);
      throw error;
    }
  }

  // Supprimer un événement
  async deleteEvent(eventId: string) {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);
      throw error;
    }
  }

  // Lister les événements
  async listEvents(startDate: Date, endDate: Date) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items;
    } catch (error) {
      console.error('Erreur lors de la récupération des événements:', error);
      throw error;
    }
  }

  // Obtenir la couleur selon le statut
  private getColorIdForStatus(status: string): string {
    const colorMap: Record<string, string> = {
      'option': '5', // Jaune
      'confirmé': '2', // Vert
      'annulé': '11', // Rouge
      'terminé': '1', // Bleu
    };
    return colorMap[status] || '1';
  }
}

export const googleCalendarService = new GoogleCalendarService();
