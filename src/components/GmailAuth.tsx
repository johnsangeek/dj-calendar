'use client';

import { useEffect, useState } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2, LogOut } from 'lucide-react';

type Status = 'idle' | 'loading' | 'connected' | 'disconnected' | 'error';

interface GmailAuthProps {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (message: string) => void;
}

export default function GmailAuth({ onConnected, onDisconnected, onError }: GmailAuthProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setStatus('loading');
    try {
      const response = await fetch('/api/gmail/auth?action=status');
      if (!response.ok) {
        throw new Error('Impossible de vérifier la connexion Gmail');
      }
      const data = await response.json();
      if (data.connected) {
        setStatus('connected');
      } else {
        setStatus('disconnected');
      }
      setError(null);
    } catch (err) {
      console.error('Gmail status error', err);
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      setStatus('error');
      onError?.(message);
    }
  };

  const handleConnect = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/gmail/auth?action=auth-url&state=${encodeURIComponent('service=gmail')}`);
      const data = await response.json();
      if (!response.ok || !data.authUrl) {
        throw new Error(data.error || 'Impossible de générer l\'URL d\'authentification Gmail');
      }
      window.location.href = data.authUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'authentification Gmail';
      setError(message);
      setStatus('error');
      setIsProcessing(false);
      onError?.(message);
    }
  };

  const handleDisconnect = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch('/api/gmail/auth?action=disconnect');
      if (!response.ok) {
        throw new Error('Impossible de supprimer les tokens Gmail');
      }
      localStorage.removeItem('gmail_connected');
      setStatus('disconnected');
      onDisconnected?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la déconnexion Gmail';
      setError(message);
      setStatus('error');
      onError?.(message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (status === 'connected') {
      onConnected?.();
    }
  }, [status, onConnected]);

  const isConnected = status === 'connected';

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-3 mb-3">
        <Mail className="w-5 h-5 text-rose-500" />
        <h3 className="font-semibold text-gray-900">Gmail</h3>
      </div>

      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Boîte Gmail connectée</span>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Se déconnecter
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connectez Gmail pour afficher et envoyer les emails depuis chaque fiche client.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={isProcessing}
            className="w-full bg-rose-500 text-white px-4 py-2 rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                <span>Connecter Gmail</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
