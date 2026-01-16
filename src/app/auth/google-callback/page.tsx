'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function GoogleCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const stateParam = searchParams.get('state');

      const resolveService = () => {
        if (!stateParam) return 'calendar';
        try {
          const parsed = new URLSearchParams(stateParam);
          const service = parsed.get('service');
          if (service) return service;
        } catch (err) {
          console.warn('State parse issue:', err);
        }
        if (stateParam.includes('gmail')) return 'gmail';
        if (stateParam.includes('calendar')) return 'calendar';
        return 'calendar';
      };

      const service = resolveService();

      if (error) {
        setStatus('error');
        setMessage(`Erreur ${service === 'gmail' ? 'Gmail' : 'Google'}: ${error}`);
        setTimeout(() => {
          router.push('/settings');
        }, 3000);
        return;
      }

      if (code) {
        try {
          // Échanger le code contre des tokens via l'API
          const endpoint = service === 'gmail' ? '/api/gmail/auth' : '/api/google-calendar/auth';
          const tokenResponse = await fetch(`http://${window.location.host}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
          });

          const tokenData = await tokenResponse.json();

          if (!tokenResponse.ok) {
            throw new Error(tokenData.error || "Erreur lors de l'échange du code d'authentification");
          }

          if (service === 'gmail') {
            localStorage.setItem('gmail_connected', 'true');
            setStatus('success');
            setMessage('Connexion à Gmail réussie !');
          } else {
            // Stocker les tokens Calendar côté client pour la sync existante
            localStorage.setItem('google_calendar_tokens', JSON.stringify(tokenData.tokens));
            setStatus('success');
            setMessage('Connexion à Google Calendar réussie !');
          }

          setTimeout(() => {
            router.push('/settings');
          }, 2000);

        } catch (err) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : "Erreur lors de l'authentification");
          setTimeout(() => {
            router.push('/settings');
          }, 3000);
        }
      } else {
        setStatus('error');
        setMessage("Aucun code d'authentification reçu");
        setTimeout(() => {
          router.push('/settings');
        }, 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Authentification en cours...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <p className="text-green-600 font-medium">{message}</p>
            <p className="text-sm text-gray-500 mt-2">Redirection vers les paramètres...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <p className="text-red-600 font-medium">{message}</p>
            <p className="text-sm text-gray-500 mt-2">Redirection vers les paramètres...</p>
          </>
        )}
      </div>
    </div>
  );
}
