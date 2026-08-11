'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Client } from '@/types';
import { TopNav } from '@/components/TopNav';
import { Loader2, Check } from 'lucide-react';

export default function ClientRatesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing'>('missing');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    const snapshot = await getDocs(collection(db, 'clients'));
    const list = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as Client))
      .filter((c) => c.clientType !== 'perso')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setClients(list);
    const initialDrafts: Record<string, string> = {};
    list.forEach((c) => {
      initialDrafts[c.id] = c.defaultRate ? String(c.defaultRate) : '';
    });
    setDrafts(initialDrafts);
    setLoading(false);
  };

  const handleSave = async (clientId: string) => {
    setSavingId(clientId);
    try {
      const raw = drafts[clientId]?.trim();
      const rate = raw ? Number(raw.replace(',', '.')) : null;
      await updateDoc(doc(db, 'clients', clientId), {
        defaultRate: rate,
        updatedAt: new Date(),
      });
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, defaultRate: rate ?? undefined } : c)));
      setSavedId(clientId);
      setTimeout(() => setSavedId((id) => (id === clientId ? null : id)), 1500);
    } catch (error) {
      console.error('Erreur sauvegarde tarif:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (filter === 'missing' && (c.defaultRate || c.stats?.averageAmount)) return false;
      if (search && !(c.name || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [clients, filter, search]);

  const missingCount = clients.filter((c) => !c.defaultRate && !c.stats?.averageAmount).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Tarifs par client</h1>
          <p className="text-gray-600 mt-1">
            Définis un tarif habituel par client, sans avoir à ouvrir chaque fiche. Utilisé pour l&apos;estimation de CA et la facturation automatique.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={() => setFilter('missing')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filter === 'missing' ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Sans tarif ({missingCount})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filter === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Tous les clients ({clients.length})
          </button>
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            {filter === 'missing' ? 'Tous les clients ont déjà un tarif 🎉' : 'Aucun client trouvé.'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Moyenne historique</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Tarif habituel</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      {c.tradeName && c.tradeName !== c.name ? (
                        <div className="text-xs text-gray-500">{c.tradeName}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.stats?.averageAmount ? `${c.stats.averageAmount}€` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={drafts[c.id] ?? ''}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="ex: 300"
                          className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                        />
                        <span className="text-gray-500">€</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSave(c.id)}
                        disabled={savingId === c.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
                      >
                        {savingId === c.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : savedId === c.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : null}
                        {savingId === c.id ? 'Enregistrement...' : savedId === c.id ? 'Enregistré' : 'Enregistrer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
