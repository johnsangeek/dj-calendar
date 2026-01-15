'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DJInfo } from '@/types';
import { Save, ChevronLeft, Calendar, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import GoogleCalendarAuth from '@/components/GoogleCalendarAuth';

export default function SettingsPage() {
  const [djInfo, setDjInfo] = useState<DJInfo>({
    name: '',
    stageName: '',
    email: '',
    phone: '',
    address: '',
    siret: '',
    taxRate: 0,
    logoUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  
  // États pour Google Calendar
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    checkGoogleConnection();
  }, []);

  const loadSettings = async () => {
    const settingsDoc = await getDoc(doc(db, 'settings', 'dj_info'));
    if (settingsDoc.exists()) {
      setDjInfo(settingsDoc.data() as DJInfo);
    }
    setLoading(false);
  };

  const checkGoogleConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const tokens = localStorage.getItem('google_calendar_tokens');
      setIsGoogleConnected(!!tokens);
    } catch (error) {
      console.error('Erreur lors de la vérification de connexion:', error);
      setIsGoogleConnected(false);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleGoogleAuthSuccess = async (tokens: any) => {
    setIsGoogleConnected(!!tokens);
    if (tokens) {
      setMessage('Connexion à Google Calendar établie avec succès !');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleGoogleAuthError = (error: string) => {
    setMessage(`Erreur: ${error}`);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSyncAll = async () => {
    setSyncStatus('syncing');
    setMessage(null);
    
    try {
      const tokens = localStorage.getItem('google_calendar_tokens');
      if (!tokens) {
        throw new Error('Non authentifié à Google Calendar');
      }

      const response = await fetch(`http://${window.location.host}/api/google-calendar/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          tokens: JSON.parse(tokens),
          action: 'sync-all'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la synchronisation');
      }

      const successCount = data.results?.filter((r: any) => r.success).length || 0;
      const errorCount = data.results?.filter((r: any) => !r.success).length || 0;

      setSyncStatus('success');
      setMessage(`Synchronisation terminée : ${successCount} réussie(s), ${errorCount} erreur(s)`);
    } catch (error) {
      setSyncStatus('error');
      setMessage(`Erreur lors de la synchronisation: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setTimeout(() => {
        setSyncStatus('idle');
        setMessage(null);
      }, 5000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await setDoc(doc(db, 'settings', 'dj_info'), djInfo);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                DJ Booker Pro
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">⚙️ Paramètres</h1>

        {/* Messages */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            syncStatus === 'success' ? 'bg-green-50 text-green-700' : 
            syncStatus === 'error' ? 'bg-red-50 text-red-700' : 
            'bg-blue-50 text-blue-700'
          }`}>
            {syncStatus === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : syncStatus === 'error' ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Informations DJ</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Nom de scène *</label>
              <input
                type="text"
                value={djInfo.stageName || ''}
                onChange={(e) => setDjInfo({ ...djInfo, stageName: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="DJ Phoenix"
              />
              <p className="text-xs text-gray-600 mt-1">Votre nom d'artiste (ex: DJ Phoenix, MC Beats...)</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Nom / Prénom *</label>
              <input
                type="text"
                value={djInfo.name}
                onChange={(e) => setDjInfo({ ...djInfo, name: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="Jean Dupont"
              />
              <p className="text-xs text-gray-600 mt-1">Votre nom civil complet</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email *</label>
              <input
                type="email"
                value={djInfo.email}
                onChange={(e) => setDjInfo({ ...djInfo, email: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="contact@djpro.fr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Téléphone</label>
              <input
                type="tel"
                value={djInfo.phone}
                onChange={(e) => setDjInfo({ ...djInfo, phone: e.target.value })}
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="06 12 34 56 78"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">SIRET</label>
              <input
                type="text"
                value={djInfo.siret}
                onChange={(e) => setDjInfo({ ...djInfo, siret: e.target.value })}
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="123 456 789 00012"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Adresse</label>
            <input
              type="text"
              value={djInfo.address}
              onChange={(e) => setDjInfo({ ...djInfo, address: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="123 Rue de la Musique, 75001 Paris"
            />
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Taux TVA (%)</label>
            <input
              type="number"
              step="0.01"
              value={djInfo.taxRate}
              onChange={(e) => setDjInfo({ ...djInfo, taxRate: parseFloat(e.target.value) })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="20"
            />
            <p className="text-sm text-gray-500 mt-1">
              Pour les auto-entrepreneurs, mettre 0 (franchise de TVA)
            </p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Logo (URL)</label>
            <input
              type="url"
              value={djInfo.logoUrl || ''}
              onChange={(e) => setDjInfo({ ...djInfo, logoUrl: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="https://example.com/mon-logo.png"
            />
            <p className="text-sm text-gray-600 mt-1">
              URL de votre logo pour l'afficher sur les factures et documents
            </p>
          </div>

          <button
            type="submit"
            className="mt-8 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save size={20} />
            Enregistrer
          </button>

          {saved && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              ✓ Paramètres sauvegardés avec succès !
            </div>
          )}
        </form>

        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">🔄 Synchronisation Google Calendar</h2>
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Google Calendar</h3>
                <p className="text-sm text-gray-600">Synchronisez vos réservations avec Google Calendar</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isGoogleConnected && (
                <button
                  onClick={handleSyncAll}
                  disabled={syncStatus === 'syncing'}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {syncStatus === 'syncing' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Synchronisation...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Synchroniser tout</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <GoogleCalendarAuth 
            onAuthSuccess={handleGoogleAuthSuccess}
            onAuthError={handleGoogleAuthError}
          />

          {isGoogleConnected && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Connexion active</span>
              </div>
              <p className="text-sm text-green-600">
                Vos réservations seront automatiquement synchronisées avec votre calendrier Google principal.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
