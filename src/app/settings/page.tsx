'use client';

import { useState, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { DJInfo } from '@/types';
import { Save, Calendar, RefreshCw, CheckCircle, AlertCircle, Mail, Upload } from 'lucide-react';
import GoogleCalendarAuth from '@/components/GoogleCalendarAuth';
import GmailAuth from '@/components/GmailAuth';
import { TopNav } from '@/components/TopNav';
import { usePostalCodeLookup } from '@/hooks/usePostalCodeLookup';

export default function SettingsPage() {
  const [djInfo, setDjInfo] = useState<DJInfo>({
    name: '',
    stageName: '',
    email: '',
    phone: '',
    address: '',
    siret: '',
    iban: '',
    taxRate: 0,
    urssafRate: 25.6, // Taux BNC auto-entrepreneur 2026
    logoUrl: ''
  });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  
  // États pour Google Calendar
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);

  const lookupCity = usePostalCodeLookup((city) => setDjInfo(prev => ({ ...prev, city })));

  useEffect(() => {
    loadSettings();
    checkGoogleConnection();
    checkGmailConnection();
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

  const checkGmailConnection = async () => {
    try {
      const response = await fetch('/api/gmail/auth?action=status');
      if (!response.ok) {
        throw new Error('Status Gmail indisponible');
      }
      const data = await response.json();
      setGmailConnected(Boolean(data.connected));
    } catch (error) {
      console.error('Erreur statut Gmail:', error);
      setGmailConnected(false);
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

      const response = await fetch('/api/google-calendar/sync', {
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

  const notify = (status: 'success' | 'error' | 'idle', text: string, duration = 4000) => {
    setSyncStatus(status === 'success' ? 'success' : status === 'error' ? 'error' : 'idle');
    setMessage(text);
    if (duration > 0) {
      setTimeout(() => {
        setSyncStatus('idle');
        setMessage(null);
      }, duration);
    }
  };

  const handleGmailConnected = () => {
    setGmailConnected(prev => {
      if (!prev) {
        notify('success', 'Connexion Gmail réussie !');
      }
      return true;
    });
  };

  const handleGmailDisconnected = () => {
    setGmailConnected(prev => {
      if (prev) {
        notify('success', 'Déconnexion Gmail effectuée.', 3000);
      }
      return false;
    });
  };

  const handleGmailError = (errorMessage: string) => {
    notify('error', errorMessage, 6000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérifier que c'est une image
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image (PNG, JPG, etc.)');
      return;
    }

    // Vérifier la taille (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('L\'image doit faire moins de 2 MB');
      return;
    }

    setUploading(true);
    try {
      // Upload vers Firebase Storage
      const storageRef = ref(storage, `logos/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Mettre à jour l'état
      setDjInfo({ ...djInfo, logoUrl: downloadURL });

      notify('success', 'Logo uploadé avec succès !', 3000);
    } catch (error) {
      console.error('Erreur upload logo:', error);
      notify('error', 'Erreur lors de l\'upload du logo', 5000);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <TopNav />

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

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6">
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

            <div>
              <label className="block text-sm font-medium mb-2">IBAN</label>
              <input
                type="text"
                value={djInfo.iban || ''}
                onChange={(e) => setDjInfo({ ...djInfo, iban: e.target.value })}
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="FR76 1234 5678 9012 3456 7890 123"
              />
              <p className="text-xs text-gray-600 mt-1">Coordonnées bancaires pour les factures</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Adresse</label>
            <input
              type="text"
              value={djInfo.address}
              onChange={(e) => setDjInfo({ ...djInfo, address: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="123 Rue de la Musique"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div>
              <label className="block text-sm font-medium mb-2">Code postal</label>
              <input
                type="text"
                value={djInfo.postalCode || ''}
                onChange={(e) => { setDjInfo({ ...djInfo, postalCode: e.target.value }); lookupCity(e.target.value); }}
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="13001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Ville</label>
              <input
                type="text"
                value={djInfo.city || ''}
                onChange={(e) => setDjInfo({ ...djInfo, city: e.target.value })}
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="Marseille"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Code APE / NAF</label>
            <input
              type="text"
              value={djInfo.codeAPE || ''}
              onChange={(e) => setDjInfo({ ...djInfo, codeAPE: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="9329Z"
            />
            <p className="text-sm text-gray-500 mt-1">Visible sur votre certificat INSEE ou sur procedures.inpi.fr</p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Taux TVA (%)</label>
            <input
              type="number"
              step="0.01"
              value={djInfo.taxRate}
              onChange={(e) => setDjInfo({ ...djInfo, taxRate: parseFloat(e.target.value) || 0 })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="20"
            />
            <p className="text-sm text-gray-500 mt-1">
              Pour les auto-entrepreneurs, mettre 0 (franchise de TVA)
            </p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Taux cotisations URSSAF (%)</label>
            <input
              type="number"
              step="0.1"
              value={djInfo.urssafRate ?? 25.6}
              onChange={(e) => setDjInfo({ ...djInfo, urssafRate: parseFloat(e.target.value) || 0 })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="25.6"
            />
            <p className="text-sm text-gray-500 mt-1">
              BNC 2026 : 25.6% · BIC vente : 13.1% · BIC service : 22.2% · CIPAV : 23.2%
            </p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Logo</label>

            {/* Prévisualisation du logo actuel */}
            {djInfo.logoUrl && (
              <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                <p className="text-xs text-gray-600 mb-2">Logo actuel :</p>
                <img
                  src={djInfo.logoUrl}
                  alt="Logo"
                  className="max-h-24 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* Upload de fichier */}
            <div className="flex items-center gap-4">
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                  <Upload size={18} />
                  <span>{uploading ? 'Upload en cours...' : 'Uploader un logo'}</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <p className="text-sm text-gray-600">
                PNG, JPG ou GIF (max 2 MB)
              </p>
            </div>

            {/* Ou bien URL manuelle */}
            <div className="mt-4">
              <p className="text-xs text-gray-600 mb-2">Ou entrez une URL directement :</p>
              <input
                type="url"
                value={djInfo.logoUrl || ''}
                onChange={(e) => setDjInfo({ ...djInfo, logoUrl: e.target.value })}
                className="border rounded-lg px-4 py-2 w-full text-gray-900"
                placeholder="https://example.com/mon-logo.png"
              />
            </div>
          </div>

          {/* Dossier d'export PDF */}
          <div>
            <label className="block text-sm font-medium mb-2">Dossier d'export PDF</label>
            <p className="text-xs text-gray-600 mb-2">
              Chemin du dossier où sauvegarder automatiquement les PDFs des factures.
            </p>
            <input
              type="text"
              value={djInfo.pdfExportDir || ''}
              onChange={(e) => setDjInfo({ ...djInfo, pdfExportDir: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full text-gray-900"
              placeholder="/Users/johnsanti/Documents/Factures DJ"
            />
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

        <div className="mt-8 bg-white rounded-2xl shadow-sm p-6">
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

        <div className="mt-6 bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">📬 Inbox Gmail</h2>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-rose-100 rounded-lg">
              <Mail className="w-6 h-6 text-rose-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Connexion Gmail</h3>
              <p className="text-sm text-gray-600">Active l'inbox par client pour lire et envoyer les emails directement depuis l'application.</p>
            </div>
          </div>

          <GmailAuth
            onConnected={handleGmailConnected}
            onDisconnected={handleGmailDisconnected}
            onError={handleGmailError}
          />

          {gmailConnected && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Inbox activée</span>
              </div>
              <p className="text-sm text-green-600">
                Les fiches clients affichent désormais les emails liés et permettent d'envoyer des réponses sans quitter l'app.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
