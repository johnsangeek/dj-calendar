'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { Client, CrmLog, InstagramStatus } from '@/types';
import { MessageCircle, Search, Filter, ExternalLink, User } from 'lucide-react';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';

type ConversationItem = {
  client: Client;
  lastLog?: CrmLog;
  unreadCount: number;
  allLogs: CrmLog[];
};

export default function InstagramInboxPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<InstagramStatus | 'ALL'>('ALL');
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);

  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [conversations, searchTerm, filterStatus]);

  const loadInbox = async () => {
    try {
      // Charger tous les clients avec Instagram
      const clientsSnapshot = await getDocs(collection(db, 'clients'));
      const clients = clientsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
          lastIgAt: doc.data().lastIgAt?.toDate?.() || doc.data().lastIgAt,
          nextIgRelanceAt: doc.data().nextIgRelanceAt?.toDate?.() || doc.data().nextIgRelanceAt,
        } as Client))
        .filter(c => c.instagramHandle);

      // Charger tous les logs Instagram
      const logsQuery = query(
        collection(db, 'crm_logs'),
        where('channel', '==', 'instagram'),
        orderBy('at', 'desc')
      );
      const logsSnapshot = await getDocs(logsQuery);
      const allLogs = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        at: doc.data().at?.toDate?.() || doc.data().at,
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
      } as CrmLog));

      // Construire les conversations
      const conversationItems: ConversationItem[] = clients.map(client => {
        const clientLogs = allLogs.filter(log => log.clientId === client.id);
        const lastLog = clientLogs[0]; // Le plus récent

        // Compter les "non lus" = DM_SENT sans REPLIED après
        let unreadCount = 0;
        for (const log of clientLogs) {
          if (log.action === 'DM_SENT') {
            unreadCount++;
          } else if (log.action === 'REPLIED') {
            break; // On arrête de compter après la première réponse
          }
        }

        return {
          client,
          lastLog,
          unreadCount: client.igStatus === 'DM_SENT' || client.igStatus === 'NO_REPLY' ? 1 : 0,
          allLogs: clientLogs,
        };
      });

      // Trier par date du dernier message (plus récent en premier)
      conversationItems.sort((a, b) => {
        const dateA = a.lastLog?.at || a.client.lastIgAt || a.client.createdAt;
        const dateB = b.lastLog?.at || b.client.lastIgAt || b.client.createdAt;

        // Gérer les cas où les dates sont undefined ou invalides
        const timeA = dateA instanceof Date ? dateA.getTime() : (dateA ? new Date(dateA).getTime() : 0);
        const timeB = dateB instanceof Date ? dateB.getTime() : (dateB ? new Date(dateB).getTime() : 0);

        return timeB - timeA;
      });

      setConversations(conversationItems);
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement inbox:', error);
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...conversations];

    // Filtre par recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(conv =>
        conv.client.name.toLowerCase().includes(term) ||
        conv.client.instagramHandle?.toLowerCase().includes(term) ||
        conv.client.professionalName?.toLowerCase().includes(term)
      );
    }

    // Filtre par statut
    if (filterStatus !== 'ALL') {
      filtered = filtered.filter(conv => conv.client.igStatus === filterStatus);
    }

    setFilteredConversations(filtered);
  };

  const getStatusColor = (status?: InstagramStatus) => {
    const colors = {
      NOT_CONTACTED: 'bg-gray-100 text-gray-800',
      ON_HOLD: 'bg-yellow-100 text-yellow-800',
      DM_SENT: 'bg-blue-100 text-blue-800',
      REPLIED: 'bg-purple-100 text-purple-800',
      NO_REPLY: 'bg-orange-100 text-orange-800',
      IGNORED: 'bg-gray-100 text-gray-800',
      BOOKED: 'bg-green-100 text-green-800',
      NOT_INTERESTED: 'bg-red-100 text-red-800',
    };
    return status ? colors[status] : 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status?: InstagramStatus) => {
    const labels = {
      NOT_CONTACTED: 'Non contacté',
      ON_HOLD: 'À réfléchir',
      DM_SENT: 'DM envoyé',
      REPLIED: 'Répondu',
      NO_REPLY: 'Pas de réponse',
      IGNORED: 'Ignoré',
      BOOKED: 'Booké',
      NOT_INTERESTED: 'Pas intéressé',
    };
    return status ? labels[status] : 'Inconnu';
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'DM_SENT':
        return '📤';
      case 'REPLIED':
        return '✅';
      case 'BOOKED':
        return '📅';
      case 'STATUS_CHANGE':
        return '🔄';
      default:
        return '📝';
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      DM_SENT: 'DM envoyé',
      REPLIED: 'Client a répondu',
      BOOKED: 'Événement créé',
      STATUS_CHANGE: 'Statut changé',
      NOTE: 'Note ajoutée',
    };
    return labels[action] || action;
  };

  const openInstagramDM = (client: Client) => {
    // Priorité au Thread ID numérique si disponible
    if (client.instagramThreadId && /^\d+$/.test(client.instagramThreadId)) {
      window.open(`https://www.instagram.com/direct/t/${client.instagramThreadId}/`, '_blank');
    } else if (client.instagramHandle) {
      // Fallback vers le profil si pas de Thread ID valide
      const username = client.instagramHandle.replace('@', '');
      window.open(`https://www.instagram.com/${username}/`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-gray-600">Chargement de l'inbox...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <TopNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900">Inbox Instagram</h1>
          </div>
          <div className="text-sm text-gray-600">
            {filteredConversations.length} conversation{filteredConversations.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as InstagramStatus | 'ALL')}
                className="w-full pl-10 pr-4 py-2 border rounded-lg appearance-none"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="DM_SENT">DM envoyé</option>
                <option value="REPLIED">Répondu</option>
                <option value="NO_REPLY">Pas de réponse</option>
                <option value="IGNORED">Ignoré</option>
                <option value="BOOKED">Booké</option>
                <option value="NOT_CONTACTED">Non contacté</option>
                <option value="NOT_INTERESTED">Pas intéressé</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Liste des conversations */}
          <div className="lg:col-span-1 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">Aucune conversation trouvée</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.client.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all hover:shadow-lg border-l-4 ${
                    selectedConversation?.client.id === conv.client.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{conv.client.name}</h3>
                      <p className="text-sm text-purple-600">{conv.client.instagramHandle}</p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="bg-purple-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(conv.client.igStatus)}`}>
                      {getStatusLabel(conv.client.igStatus)}
                    </span>
                  </div>

                  {conv.lastLog && (
                    <div className="text-xs text-gray-600">
                      <span className="mr-1">{getActionIcon(conv.lastLog.action)}</span>
                      {getActionLabel(conv.lastLog.action)} •{' '}
                      {conv.lastLog.at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Détail de la conversation */}
          <div className="lg:col-span-2">
            {!selectedConversation ? (
              <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
                <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Sélectionne une conversation</p>
                <p className="text-gray-500 text-sm mt-2">
                  Choisis un client dans la liste pour voir l'historique complet
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm">
                {/* Header de la conversation */}
                <div className="border-b p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900 mb-1">
                        {selectedConversation.client.name}
                      </h2>
                      <p className="text-purple-600 font-medium mb-2">
                        {selectedConversation.client.instagramHandle}
                      </p>
                      {selectedConversation.client.professionalName && (
                        <p className="text-gray-600 text-sm">{selectedConversation.client.professionalName}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openInstagramDM(selectedConversation.client)}
                        className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                      >
                        <ExternalLink size={16} />
                        Ouvrir DM
                      </button>
                      <Link
                        href={`/clients/${selectedConversation.client.id}`}
                        className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
                      >
                        Fiche client
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedConversation.client.igStatus)}`}>
                      {getStatusLabel(selectedConversation.client.igStatus)}
                    </span>
                    {selectedConversation.client.lastIgAt && (
                      <span className="text-sm text-gray-600">
                        Dernier contact: {selectedConversation.client.lastIgAt.toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {selectedConversation.client.nextIgRelanceAt && (
                      <span className="text-sm text-purple-600 font-medium">
                        Relance: {selectedConversation.client.nextIgRelanceAt.toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>

                  {selectedConversation.client.igNotes && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-gray-800">
                        <span className="font-semibold">Note:</span> {selectedConversation.client.igNotes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Timeline des messages */}
                <div className="p-6 max-h-[calc(100vh-450px)] overflow-y-auto">
                  {selectedConversation.allLogs.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600">Aucune activité pour ce client</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedConversation.allLogs.map((log) => (
                        <div key={log.id} className="flex gap-4">
                          <div className="flex-shrink-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                              log.action === 'DM_SENT' ? 'bg-yellow-100' :
                              log.action === 'REPLIED' ? 'bg-blue-100' :
                              log.action === 'BOOKED' ? 'bg-green-100' :
                              'bg-gray-100'
                            }`}>
                              {getActionIcon(log.action)}
                            </div>
                          </div>

                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-1">
                              <div>
                                <p className="font-semibold text-gray-900">{getActionLabel(log.action)}</p>
                                <p className="text-xs text-gray-500">
                                  {log.at.toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>

                            {log.messagePreview && (
                              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-[#F2F2F7]">
                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.messagePreview}</p>
                              </div>
                            )}

                            {log.oldStatus && log.newStatus && (
                              <div className="mt-2 text-xs text-gray-600">
                                {getStatusLabel(log.oldStatus)} → {getStatusLabel(log.newStatus)}
                              </div>
                            )}

                            {log.notes && (
                              <p className="mt-2 text-sm text-gray-700">{log.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
