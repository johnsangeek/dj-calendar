'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface GoogleCalendarAuthProps {
  onAuthSuccess: (tokens: any) => void;
  onAuthError: (error: string) => void;
}

export default function GoogleCalendarAuth({ onAuthSuccess, onAuthError }: GoogleCalendarAuthProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = () => {
    const tokens = localStorage.getItem('google_calendar_tokens');
    if (tokens) {
      setIsAuthenticated(true);
      onAuthSuccess(JSON.parse(tokens));
    }
  };

  const handleAuth = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Obtenir l'URL d'authentification depuis l'API
      const response = await fetch(`http://${window.location.host}/api/google-calendar/auth?action=auth-url`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la génération de l\'URL d\'authentification');
      }
      
      // Redirection directe au lieu de popup
      window.location.href = data.authUrl;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de l\'authentification';
      setError(errorMessage);
      onAuthError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('google_calendar_tokens');
    setIsAuthenticated(false);
    onAuthSuccess(null);
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-3 mb-3">
        <Calendar className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">Google Calendar</h3>
      </div>

      {isAuthenticated ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Connecté à Google Calendar</span>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-sm text-red-600 hover:text-red-700 transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connectez votre compte Google Calendar pour synchroniser automatiquement vos réservations.
          </p>
          
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            onClick={handleAuth}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                <span>Connecter Google Calendar</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
