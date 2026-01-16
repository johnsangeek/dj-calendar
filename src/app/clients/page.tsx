'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Client } from '@/types';
import { Plus, Edit2, Trash2, Save, X, ArrowLeft, Inbox, Loader2 } from 'lucide-react';
import Link from 'next/link';
import ClientInbox from '@/components/ClientInbox';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    primaryEmail: '',
    altEmails: '',
    phone: '',
    address: '',
    siret: '',
    notes: '',
    color: '#3B82F6'
  });
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [unreadByClient, setUnreadByClient] = useState<Record<string, number>>({});
  const [inboxClient, setInboxClient] = useState<Client | null>(null);

  const colors = [
    { name: 'Bleu', value: '#3B82F6' },
    { name: 'Violet', value: '#8B5CF6' },
    { name: 'Rose', value: '#EC4899' },
    { name: 'Rouge', value: '#EF4444' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Jaune', value: '#EAB308' },
    { name: 'Vert', value: '#10B981' },
    { name: 'Turquoise', value: '#14B8A6' },
    { name: 'Indigo', value: '#6366F1' },
    { name: 'Gris', value: '#6B7280' },
  ];

  const normalizeEmailValue = (value: string) => value.trim().toLowerCase();

  const parseEmails = (value: string) => {
    return value
      .split(/[\n,;]/)
      .map(email => email.trim())
      .filter(Boolean)
      .map(normalizeEmailValue);
  };

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    checkGmailStatus();
  }, []);

  useEffect(() => {
    if (gmailConnected && clients.length > 0) {
      refreshBadges(clients);
    }
  }, [gmailConnected, clients]);

  const loadClients = async () => {
    const snapshot = await getDocs(collection(db, 'clients'));
    const clientsData = snapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      const primaryEmail = typeof data.primaryEmail === 'string' ? data.primaryEmail : data.email;
      const altEmails = Array.isArray(data.altEmails) ? data.altEmails.filter((item: unknown): item is string => typeof item === 'string') : [];
      const normalizedEmails = Array.isArray(data.normalizedEmails)
        ? data.normalizedEmails.filter((item: unknown): item is string => typeof item === 'string')
        : Array.from(new Set([primaryEmail, ...altEmails].filter(Boolean).map(normalizeEmailValue)));

      return {
        id: docSnapshot.id,
        ...data,
        email: primaryEmail, // legacy compatibility
        primaryEmail,
        altEmails,
        normalizedEmails,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      } as Client;
    });
    setClients(clientsData);
    setLoading(false);
  };

  const checkGmailStatus = async () => {
    try {
      const response = await fetch('/api/gmail/auth?action=status');
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setGmailConnected(Boolean(data.connected));
    } catch (error) {
      console.error('Erreur statut Gmail:', error);
    }
  };

  const refreshBadges = async (list: Client[]) => {
    if (!gmailConnected) return;
    setLoadingBadges(true);
    const unreadMap: Record<string, number> = {};
    for (const client of list) {
      const emails = client.normalizedEmails || [];
      if (!emails.length) continue;
      try {
        const response = await fetch(`/api/gmail/searchThreads?clientId=${client.id}`);
        if (!response.ok) continue;
        const data = await response.json();
        const unreadCount = Array.isArray(data.threads)
          ? data.threads.filter((thread: { unread?: boolean }) => thread.unread).length
          : 0;
        if (unreadCount > 0) {
          unreadMap[client.id] = unreadCount;
        }
      } catch (error) {
        console.error('Erreur badge Gmail:', error);
      }
    }
    setUnreadByClient(unreadMap);
    setLoadingBadges(false);
  };

  const handleOpenInbox = (client: Client) => {
    setInboxClient(client);
  };

  const handleCloseInbox = (shouldRefresh?: boolean) => {
    if (shouldRefresh && clients.length > 0) {
      refreshBadges(clients);
    }
    setInboxClient(null);
  };

  const handleThreadsSeen = (clientId: string) => {
    setUnreadByClient(prev => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  };

  const handleRefreshBadges = () => {
    if (clients.length === 0) return;
    refreshBadges(clients);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const primaryEmail = formData.primaryEmail ? normalizeEmailValue(formData.primaryEmail) : null;
    const altEmails = parseEmails(formData.altEmails);
    const normalizedEmails = Array.from(new Set([...(primaryEmail ? [primaryEmail] : []), ...altEmails]));

    const payload = {
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      siret: formData.siret,
      notes: formData.notes,
      color: formData.color,
      email: primaryEmail,
      primaryEmail,
      altEmails,
      normalizedEmails,
      updatedAt: now,
    } as Record<string, unknown>;

    if (!editing) {
      payload.createdAt = now;
    }

    if (editing) {
      await updateDoc(doc(db, 'clients', editing), payload);
    } else {
      await addDoc(collection(db, 'clients'), payload);
    }

    resetForm();
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer ce client ?')) {
      await deleteDoc(doc(db, 'clients', id));
      loadClients();
    }
  };

  const startEdit = (client: Client) => {
    setEditing(client.id);
    setFormData({
      name: client.name,
      primaryEmail: client.primaryEmail || client.email || '',
      altEmails: (client.altEmails || []).join('\n'),
      phone: client.phone || '',
      address: client.address || '',
      siret: client.siret || '',
      notes: client.notes || '',
      color: client.color || '#3B82F6'
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ name: '', primaryEmail: '', altEmails: '', phone: '', address: '', siret: '', notes: '', color: '#3B82F6' });
    setEditing(null);
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Retour au tableau de bord">
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">👥 Clients</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
            {showForm ? 'Annuler' : 'Nouveau client'}
          </button>
        </div>

        {gmailConnected ? (
          <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            <Inbox className="w-5 h-5" />
            <span>Inbox Gmail connecté. Ouvre l'icône sur un client pour voir ses emails.</span>
            <button
              onClick={handleRefreshBadges}
              className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-900"
              disabled={loadingBadges}
            >
              {loadingBadges && <Loader2 className="w-4 h-4 animate-spin" />}
              Rafraîchir
            </button>
          </div>
        ) : (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
            Connecte ton compte Gmail dans les Paramètres pour activer l'inbox par client.
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Nom *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="border rounded-lg px-4 py-2"
              />
              <input
                type="email"
                placeholder="Email principal"
                value={formData.primaryEmail}
                onChange={(e) => setFormData({ ...formData, primaryEmail: e.target.value })}
                className="border rounded-lg px-4 py-2"
              />
              <input
                type="tel"
                placeholder="Téléphone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="border rounded-lg px-4 py-2"
              />
              <input
                type="text"
                placeholder="SIRET"
                value={formData.siret}
                onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                className="border rounded-lg px-4 py-2"
              />
            </div>
            <input
              type="text"
              placeholder="Adresse"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4"
            />
            <textarea
              placeholder="Emails secondaires (un par ligne)"
              value={formData.altEmails}
              onChange={(e) => setFormData({ ...formData, altEmails: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4"
              rows={2}
            />
            <textarea
              placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4"
              rows={3}
            />
            
            {/* Sélecteur de couleur */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Couleur du client (pour le calendrier)
              </label>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    className={`w-12 h-12 rounded-lg transition-all ${
                      formData.color === color.value 
                        ? 'ring-4 ring-gray-400 ring-offset-2' 
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            
            <button
              type="submit"
              className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Save size={20} />
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </form>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-white rounded-lg shadow-md p-6 border-l-4 cursor-pointer hover:shadow-lg transition-shadow"
              style={{ borderLeftColor: client.color || '#3B82F6' }}
              onClick={() => startEdit(client)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  startEdit(client);
                }
              }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: client.color || '#3B82F6' }}
                  ></div>
                  <h3 className="text-xl font-semibold text-gray-900">{client.name}</h3>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleOpenInbox(client);
                    }}
                    disabled={!gmailConnected}
                    className={`relative p-2 rounded-lg border transition-colors ${gmailConnected ? 'border-gray-300 hover:border-blue-500 hover:bg-blue-50' : 'border-gray-200 text-gray-400 cursor-not-allowed'}`}
                    title={gmailConnected ? 'Ouvrir la boîte mail' : 'Connecte Gmail pour activer l\'inbox'}
                  >
                    <Inbox className="w-5 h-5" />
                    {gmailConnected && unreadByClient[client.id] && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadByClient[client.id]}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      startEdit(client);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(client.id);
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              {client.primaryEmail && <p className="text-gray-800">📧 {client.primaryEmail}</p>}
              {client.altEmails && client.altEmails.length > 0 && (
                <div className="text-gray-700 text-sm mt-1 space-y-1">
                  {client.altEmails.map((email) => (
                    <div key={email}>↪ {email}</div>
                  ))}
                </div>
              )}
              {client.phone && <p className="text-gray-800">📱 {client.phone}</p>}
              {client.address && <p className="text-gray-800">📍 {client.address}</p>}
              {client.siret && <p className="text-gray-800">🏢 {client.siret}</p>}
              {client.notes && <p className="text-gray-700 mt-2 text-sm">{client.notes}</p>}
            </div>
          ))}
        </div>

        {clients.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-700">
            Aucun client. Clique sur "Nouveau client" pour commencer !
          </div>
        )}
      </div>

      {inboxClient && (
        <ClientInbox
          client={inboxClient}
          onClose={handleCloseInbox}
          onThreadsSeen={handleThreadsSeen}
        />
      )}
    </div>
  );
}
