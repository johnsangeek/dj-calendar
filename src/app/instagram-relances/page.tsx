'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Client, InstagramStatus } from '@/types';
import { MessageCircle, Calendar, Filter } from 'lucide-react';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';

export default function InstagramRelancesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'due' | 'overdue'>('due');
  const [filterIgStatus, setFilterIgStatus] = useState<InstagramStatus | 'all'>('all');

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [clients, filterStatus, filterIgStatus]);

  const loadClients = async () => {
    const snapshot = await getDocs(collection(db, 'clients'));
    const clientsData = snapshot.docs
      .map(docSnapshot => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          lastIgAt: data.lastIgAt?.toDate ? data.lastIgAt.toDate() : data.lastIgAt,
          nextIgRelanceAt: data.nextIgRelanceAt?.toDate ? data.nextIgRelanceAt.toDate() : data.nextIgRelanceAt,
        } as Client;
      })
      .filter(client => client.instagramHandle); // Seulement les clients avec Instagram

    setClients(clientsData);
    setLoading(false);
  };

  const applyFilters = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = [...clients];

    // Filtre par statut Instagram
    if (filterIgStatus !== 'all') {
      filtered = filtered.filter(c => c.igStatus === filterIgStatus);
    } else {
      // Par défaut, ne montrer que DM_SENT et NO_REPLY
      filtered = filtered.filter(c => c.igStatus === 'DM_SENT' || c.igStatus === 'NO_REPLY');
    }

    // Filtre par date de relance
    if (filterStatus === 'due') {
      // À relancer aujourd'hui ou avant
      filtered = filtered.filter(c => {
        if (!c.nextIgRelanceAt) return false;
        const relanceDate = new Date(c.nextIgRelanceAt);
        relanceDate.setHours(0, 0, 0, 0);
        return relanceDate <= today;
      });
    } else if (filterStatus === 'overdue') {
      // En retard (avant aujourd'hui)
      filtered = filtered.filter(c => {
        if (!c.nextIgRelanceAt) return false;
        const relanceDate = new Date(c.nextIgRelanceAt);
        relanceDate.setHours(0, 0, 0, 0);
        return relanceDate < today;
      });
    }

    // Trier par date de relance (plus ancien en premier)
    filtered.sort((a, b) => {
      if (!a.nextIgRelanceAt) return 1;
      if (!b.nextIgRelanceAt) return -1;
      return a.nextIgRelanceAt.getTime() - b.nextIgRelanceAt.getTime();
    });

    setFilteredClients(filtered);
  };

  const getRelanceLabel = (client: Client): { text: string; color: string } => {
    if (!client.nextIgRelanceAt) {
      return { text: 'Pas de relance prévue', color: 'text-gray-600' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const relanceDate = new Date(client.nextIgRelanceAt);
    relanceDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((relanceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `En retard de ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`, color: 'text-red-600 font-semibold' };
    } else if (diffDays === 0) {
      return { text: "Aujourd'hui", color: 'text-orange-600 font-semibold' };
    } else {
      return { text: `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`, color: 'text-green-600' };
    }
  };

  const getStatusBadge = (status?: InstagramStatus) => {
    if (!status) return null;

    const config = {
      NOT_CONTACTED: { label: 'Non contacté', bg: 'bg-gray-100', text: 'text-gray-800' },
      ON_HOLD: { label: 'À réfléchir', bg: 'bg-yellow-100', text: 'text-yellow-800' },
      DM_SENT: { label: 'DM envoyé', bg: 'bg-blue-100', text: 'text-blue-800' },
      REPLIED: { label: 'Répondu', bg: 'bg-purple-100', text: 'text-purple-800' },
      NO_REPLY: { label: 'Pas de réponse', bg: 'bg-orange-100', text: 'text-orange-800' },
      IGNORED: { label: 'Ignoré', bg: 'bg-gray-100', text: 'text-gray-800' },
      BOOKED: { label: 'Booké', bg: 'bg-green-100', text: 'text-green-800' },
      NOT_INTERESTED: { label: 'Pas intéressé', bg: 'bg-red-100', text: 'text-red-800' },
    };

    const c = config[status];
    return (
      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <TopNav />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <Calendar className="w-8 h-8 text-purple-600" />
          <h1 className="text-3xl font-bold text-gray-900">Relances Instagram</h1>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filtres</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date de relance
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'due' | 'overdue')}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="all">Toutes</option>
                <option value="due">À relancer aujourd'hui</option>
                <option value="overdue">En retard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Statut Instagram
              </label>
              <select
                value={filterIgStatus}
                onChange={(e) => setFilterIgStatus(e.target.value as InstagramStatus | 'all')}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="all">DM envoyé / Pas de réponse</option>
                <option value="NOT_CONTACTED">Non contacté</option>
                <option value="DM_SENT">DM envoyé</option>
                <option value="REPLIED">Répondu</option>
                <option value="NO_REPLY">Pas de réponse</option>
                <option value="IGNORED">Ignoré</option>
                <option value="BOOKED">Booké</option>
                <option value="NOT_INTERESTED">Pas intéressé</option>
              </select>
            </div>
          </div>
        </div>

        {/* Liste des clients */}
        {loading ? (
          <div className="text-center py-12 text-gray-600">Chargement...</div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Aucune relance à faire pour le moment</p>
            <p className="text-gray-500 text-sm mt-2">
              Tous tes contacts Instagram sont à jour !
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              {filteredClients.length} client{filteredClients.length > 1 ? 's' : ''} à relancer
            </div>

            {filteredClients.map((client) => {
              const relanceLabel = getRelanceLabel(client);

              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="block bg-white rounded-2xl shadow-sm p-6 hover:shadow-lg transition-shadow border-l-4 border-purple-500"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{client.name}</h3>
                        {getStatusBadge(client.igStatus)}
                      </div>

                      <div className="flex items-center gap-2 text-purple-700 mb-2">
                        <MessageCircle className="w-4 h-4" />
                        <span className="font-medium">{client.instagramHandle}</span>
                      </div>

                      {client.professionalName && (
                        <p className="text-gray-600 text-sm mb-2">{client.professionalName}</p>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm">
                        {client.lastIgAt && (
                          <div>
                            <span className="text-gray-600">Dernier contact: </span>
                            <span className="font-medium">
                              {client.lastIgAt.toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        )}

                        {client.nextIgRelanceAt && (
                          <div>
                            <span className="text-gray-600">Relance: </span>
                            <span className={relanceLabel.color}>
                              {client.nextIgRelanceAt.toLocaleDateString('fr-FR')} ({relanceLabel.text})
                            </span>
                          </div>
                        )}
                      </div>

                      {client.igNotes && (
                        <p className="text-gray-700 text-sm mt-3 bg-gray-50 p-2 rounded">
                          {client.igNotes}
                        </p>
                      )}
                    </div>

                    <div className="ml-4">
                      <span className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors">
                        CRM →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && clients.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Aucun client Instagram</p>
            <p className="text-gray-500 text-sm mt-2">
              Ajoute des handles Instagram à tes clients pour utiliser cette fonctionnalité.
            </p>
            <Link
              href="/clients"
              className="inline-block mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Gérer les clients
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
