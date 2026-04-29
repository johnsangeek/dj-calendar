'use client';

import { useState, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { DJInfo } from '@/types';
import { Save, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { WebNav } from '@/components/web/WebNav';
import { usePostalCodeLookup } from '@/hooks/usePostalCodeLookup';

export default function WebSettingsPage() {
  const [djInfo, setDjInfo] = useState<DJInfo>({
    name: '',
    stageName: '',
    email: '',
    phone: '',
    address: '',
    siret: '',
    iban: '',
    taxRate: 0,
    urssafRate: 25.6,
    logoUrl: ''
  });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const lookupCity = usePostalCodeLookup((city) => setDjInfo(prev => ({ ...prev, city })));

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settingsDoc = await getDoc(doc(db, 'settings', 'dj_info'));
    if (settingsDoc.exists()) {
      setDjInfo(settingsDoc.data() as DJInfo);
    }
    setLoading(false);
  };

  const notify = (type: 'success' | 'error', text: string, duration = 4000) => {
    setMessageType(type);
    setMessage(text);
    if (duration > 0) setTimeout(() => setMessage(null), duration);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await setDoc(doc(db, 'settings', 'dj_info'), djInfo);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image (PNG, JPG, etc.)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("L'image doit faire moins de 2 MB");
      return;
    }
    setUploading(true);
    try {
      const storageRef = ref(storage, `logos/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setDjInfo({ ...djInfo, logoUrl: downloadURL });
      notify('success', 'Logo uploadé avec succès !', 3000);
    } catch (error) {
      console.error('Erreur upload logo:', error);
      notify('error', "Erreur lors de l'upload du logo", 5000);
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
    <div className="min-h-screen bg-[#FAFAFA] overflow-x-hidden">
      <WebNav />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Paramètres</h1>

        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            messageType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {messageType === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
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
            <p className="text-sm text-gray-500 mt-1">Pour les auto-entrepreneurs, mettre 0 (franchise de TVA)</p>
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
            <p className="text-sm text-gray-500 mt-1">BNC 2026 : 25.6% · BIC vente : 13.1% · BIC service : 22.2% · CIPAV : 23.2%</p>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Logo</label>
            {djInfo.logoUrl && (
              <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                <p className="text-xs text-gray-600 mb-2">Logo actuel :</p>
                <img src={djInfo.logoUrl} alt="Logo" className="max-h-24 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            )}
            <div className="flex items-center gap-4">
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                  <Upload size={18} />
                  <span>{uploading ? 'Upload en cours...' : 'Uploader un logo'}</span>
                </div>
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
              </label>
              <p className="text-sm text-gray-600">PNG, JPG ou GIF (max 2 MB)</p>
            </div>
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

          <button type="submit" className="mt-8 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Save size={20} />
            Enregistrer
          </button>

          {saved && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              Paramètres sauvegardés avec succès !
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
