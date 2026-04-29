'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Client, InstagramStatus, InstagramContact } from '@/types';
import { Plus, Edit2, Trash2, Save, X, Inbox, Loader2, MessageCircle, UserCircle } from 'lucide-react';
import ClientInbox from '@/components/ClientInbox';
import { TopNav } from '@/components/TopNav';
import { usePostalCodeLookup } from '@/hooks/usePostalCodeLookup';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<{
    name: string;
    primaryEmail: string;
    altEmails: string;
    phone: string;
    address: string;
    postalCode: string;
    city: string;
    siret: string;
    notes: string;
    eventAliases: string;
    color: string;
    profileImageUrl: string;
    instagramHandle: string;
    instagramUrl: string;
    instagramThreadId: string;
    igStatus: InstagramStatus;
    igNotes: string;
    instagramContacts: InstagramContact[];
  }>({
    name: '',
    primaryEmail: '',
    altEmails: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    siret: '',
    notes: '',
    eventAliases: '',
    color: '#3B82F6',
    profileImageUrl: '',
    instagramHandle: '',
    instagramUrl: '',
    instagramThreadId: '',
    igStatus: 'NOT_CONTACTED',
    igNotes: '',
    instagramContacts: []
  });
  const lookupClientCity = usePostalCodeLookup((city) => setFormData(prev => ({ ...prev, city })));
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactFormData, setContactFormData] = useState<{
    role: 'BOOKER' | 'DA' | 'DJ' | 'ENSEIGNE' | 'PATRON' | 'AUTRE';
    name: string;
    handle: string;
    url: string;
    threadId: string;
    notes: string;
  }>({
    role: 'PATRON',
    name: '',
    handle: '',
    url: '',
    threadId: '',
    notes: ''
  });
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [unreadByClient, setUnreadByClient] = useState<Record<string, number>>({});
  const [inboxClient, setInboxClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventAliasSuggestions, setEventAliasSuggestions] = useState<string[]>([]);
  const [loadingAliasSuggestions, setLoadingAliasSuggestions] = useState(false);
  const [selectedAliasSuggestion, setSelectedAliasSuggestion] = useState('');

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

  const parseEventAliases = (value: string) => {
    return Array.from(new Set(
      value
        .split(/[\n,;]/)
        .map(alias => alias.trim())
        .filter(Boolean)
    ));
  };

  const normalizeAliasValue = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  const isGenericEventLabel = (value?: string) => {
    const n = normalizeAliasValue(value || '');
    return !n || n === 'client google calendar' || n === 'importe de google calendar' || n === 'importe google calendar' || n === 'booking';
  };

  const buildEventAliasCandidates = (booking: Record<string, unknown>) => {
    const rawValues = [booking.displayName, booking.clientName, booking.title] as Array<unknown>;
    return rawValues
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
      .filter((v) => !isGenericEventLabel(v));
  };

  const loadEventAliasSuggestions = async () => {
    setLoadingAliasSuggestions(true);
    try {
      const snapshot = await getDocs(collection(db, 'bookings'));
      const suggestionsByKey = new Map<string, string>();

      // 1) Sources booking (title/displayName/clientName)
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data() as Record<string, unknown>;
        const candidates = buildEventAliasCandidates(data);

        candidates.forEach((candidate) => {
          const normalized = normalizeAliasValue(candidate);
          if (!normalized) return;
          if (!suggestionsByKey.has(normalized)) {
            suggestionsByKey.set(normalized, candidate);
          }
        });
      });

      // 2) Sources clients existants (name/professionalName/eventAliases)
      clients.forEach((c) => {
        if (editing && c.id === editing) return;

        [c.name, c.professionalName, ...(c.eventAliases || [])]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .forEach((value) => {
            const normalized = normalizeAliasValue(value);
            if (!normalized || isGenericEventLabel(value)) return;
            if (!suggestionsByKey.has(normalized)) {
              suggestionsByKey.set(normalized, value.trim());
            }
          });
      });

      const sorted = Array.from(suggestionsByKey.values()).sort((a, b) =>
        a.localeCompare(b, 'fr', { sensitivity: 'base' })
      );
      setEventAliasSuggestions(sorted);
    } catch (error) {
      console.error('Erreur chargement suggestions aliases events:', error);
    } finally {
      setLoadingAliasSuggestions(false);
    }
  };

  const handleAddEventAliasSuggestion = (alias: string) => {
    const current = parseEventAliases(formData.eventAliases);
    const next = Array.from(new Set([...current, alias]));
    setFormData({ ...formData, eventAliases: next.join('\n') });
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

  useEffect(() => {
    if (showForm && clients.length > 0) {
      loadEventAliasSuggestions();
    }
  }, [showForm, clients]);

  const loadClients = async () => {
    const snapshot = await getDocs(collection(db, 'clients'));
    const clientsData = snapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      const primaryEmail = typeof data.primaryEmail === 'string' ? data.primaryEmail : data.email;
      const altEmails = Array.isArray(data.altEmails) ? data.altEmails.filter((item: unknown): item is string => typeof item === 'string') : [];
      const normalizedEmails = Array.isArray(data.normalizedEmails)
        ? data.normalizedEmails.filter((item: unknown): item is string => typeof item === 'string')
        : Array.from(new Set([primaryEmail, ...altEmails].filter(Boolean).map(normalizeEmailValue)));
      const eventAliases = Array.isArray(data.eventAliases)
        ? data.eventAliases.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      return {
        id: docSnapshot.id,
        ...data,
        email: primaryEmail, // legacy compatibility
        primaryEmail,
        altEmails,
        normalizedEmails,
        eventAliases,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        lastIgAt: data.lastIgAt?.toDate ? data.lastIgAt.toDate() : data.lastIgAt,
        nextIgRelanceAt: data.nextIgRelanceAt?.toDate ? data.nextIgRelanceAt.toDate() : data.nextIgRelanceAt,
      } as Client;
    });

    // Tri alphabétique par nom
    clientsData.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

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

    // Validation du Thread ID Instagram (doit être numérique)
    if (formData.instagramThreadId && !/^\d+$/.test(formData.instagramThreadId.trim())) {
      alert('Le Thread ID Instagram doit être composé uniquement de chiffres (ex: 17850011534746279)');
      return;
    }

    const now = new Date();
    const primaryEmail = formData.primaryEmail ? normalizeEmailValue(formData.primaryEmail) : null;
    const altEmails = parseEmails(formData.altEmails);
    const normalizedEmails = Array.from(new Set([...(primaryEmail ? [primaryEmail] : []), ...altEmails]));
    const eventAliases = parseEventAliases(formData.eventAliases);

    const payload = {
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      postalCode: formData.postalCode,
      city: formData.city,
      siret: formData.siret,
      notes: formData.notes,
      eventAliases,
      color: formData.color,
      profileImageUrl: formData.profileImageUrl || null,
      email: primaryEmail,
      primaryEmail,
      altEmails,
      normalizedEmails,
      instagramHandle: formData.instagramHandle || null,
      instagramUrl: formData.instagramUrl || null,
      instagramThreadId: formData.instagramThreadId || null,
      igStatus: formData.igStatus,
      igNotes: formData.igNotes || null,
      instagramContacts: formData.instagramContacts || [],
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
      postalCode: client.postalCode || '',
      city: client.city || '',
      siret: client.siret || '',
      notes: client.notes || '',
      eventAliases: (client.eventAliases || []).join('\n'),
      color: client.color || '#3B82F6',
      profileImageUrl: client.profileImageUrl || '',
      instagramHandle: client.instagramHandle || '',
      instagramUrl: client.instagramUrl || '',
      instagramThreadId: client.instagramThreadId || '',
      igStatus: client.igStatus || 'NOT_CONTACTED',
      igNotes: client.igNotes || '',
      instagramContacts: client.instagramContacts || []
    });
    setShowForm(true);

    // Scroll vers le formulaire
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      primaryEmail: '',
      altEmails: '',
      phone: '',
      address: '',
      postalCode: '',
      city: '',
      siret: '',
      notes: '',
      eventAliases: '',
      color: '#3B82F6',
      profileImageUrl: '',
      instagramHandle: '',
      instagramUrl: '',
      instagramThreadId: '',
      igStatus: 'NOT_CONTACTED',
      igNotes: '',
      instagramContacts: []
    });
    setEditing(null);
    setShowForm(false);
    resetContactForm();
  };

  const resetContactForm = () => {
    setContactFormData({
      role: 'PATRON',
      name: '',
      handle: '',
      url: '',
      threadId: '',
      notes: ''
    });
    setEditingContactId(null);
  };

  const handleAddContact = () => {
    // Validation du Thread ID (doit être numérique si renseigné)
    if (contactFormData.threadId && !/^\d+$/.test(contactFormData.threadId.trim())) {
      alert('Le Thread ID Instagram doit être composé uniquement de chiffres (ex: 17850011534746279)');
      return;
    }

    const newContact: InstagramContact = {
      id: crypto.randomUUID(),
      role: contactFormData.role,
      name: contactFormData.name || undefined,
      handle: contactFormData.handle || undefined,
      url: contactFormData.url || undefined,
      threadId: contactFormData.threadId || undefined,
      notes: contactFormData.notes || undefined,
      status: 'NOT_CONTACTED'
    };

    if (editingContactId) {
      // Modifier un contact existant
      setFormData({
        ...formData,
        instagramContacts: formData.instagramContacts.map(c =>
          c.id === editingContactId ? { ...newContact, id: editingContactId } : c
        )
      });
    } else {
      // Ajouter un nouveau contact
      setFormData({
        ...formData,
        instagramContacts: [...formData.instagramContacts, newContact]
      });
    }

    resetContactForm();
  };

  const handleEditContact = (contact: InstagramContact) => {
    setEditingContactId(contact.id);
    setContactFormData({
      role: contact.role,
      name: contact.name || '',
      handle: contact.handle || '',
      url: contact.url || '',
      threadId: contact.threadId || '',
      notes: contact.notes || ''
    });
  };

  const handleDeleteContact = (contactId: string) => {
    if (confirm('Supprimer ce contact Instagram ?')) {
      setFormData({
        ...formData,
        instagramContacts: formData.instagramContacts.filter(c => c.id !== contactId)
      });
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'PATRON': return 'Patron';
      case 'BOOKER': return 'Booker';
      case 'DA': return 'DA';
      case 'DJ': return 'DJ';
      case 'ENSEIGNE': return 'Enseigne';
      case 'AUTRE': return 'Autre';
      default: return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'PATRON': return 'bg-orange-100 text-orange-800';
      case 'BOOKER': return 'bg-brand-100 text-brand-900';
      case 'DA': return 'bg-pink-100 text-pink-800';
      case 'DJ': return 'bg-blue-100 text-blue-800';
      case 'ENSEIGNE': return 'bg-indigo-100 text-indigo-800';
      case 'AUTRE': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const currentAliasSet = new Set(parseEventAliases(formData.eventAliases).map(normalizeAliasValue));
  const filteredEventAliasSuggestions = eventAliasSuggestions.filter((alias) => !currentAliasSet.has(normalizeAliasValue(alias)));

  // Filtrer les clients selon la recherche
  const filteredClients = clients.filter((client) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const name = (client.name || '').toLowerCase();
    const professionalName = (client.professionalName || '').toLowerCase();
    const email = (client.primaryEmail || client.email || '').toLowerCase();
    const phone = (client.phone || '').toLowerCase();
    const address = (client.address || '').toLowerCase();
    const instagramHandle = (client.instagramHandle || '').toLowerCase();

    return name.includes(query) ||
           professionalName.includes(query) ||
           email.includes(query) ||
           phone.includes(query) ||
           address.includes(query) ||
           instagramHandle.includes(query);
  });

  return (
    <div className="min-h-screen bg-apple-bg">
      <TopNav />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-apple-text-main">👥 Clients</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 btn-primary"
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
            {showForm ? 'Annuler' : 'Nouveau client'}
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Rechercher un client par nom, email, téléphone, adresse ou Instagram..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
          />
          {searchQuery && (
            <p className="text-sm text-gray-600 mt-2">
              {filteredClients.length} client{filteredClients.length > 1 ? 's' : ''} trouvé{filteredClients.length > 1 ? 's' : ''}
            </p>
          )}
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
          <form ref={formRef} onSubmit={handleSubmit} className="ui-card mb-8">
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
            <div className="grid grid-cols-2 gap-4 mt-4">
              <input
                type="text"
                placeholder="13001"
                value={formData.postalCode}
                onChange={(e) => { setFormData({ ...formData, postalCode: e.target.value }); lookupClientCity(e.target.value); }}
                className="border rounded-lg px-4 py-2"
              />
              <input
                type="text"
                placeholder="Marseille"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="border rounded-lg px-4 py-2"
              />
            </div>
            <textarea
              placeholder="Emails secondaires (un par ligne)"
              value={formData.altEmails}
              onChange={(e) => setFormData({ ...formData, altEmails: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4"
              rows={2}
            />
            <textarea
              placeholder="Aliases events / lieux (un par ligne)\nEx: PAUC AIX\nEx: CLUB 3 RICHEBOIS"
              value={formData.eventAliases}
              onChange={(e) => setFormData({ ...formData, eventAliases: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4"
              rows={3}
            />
            <p className="text-xs text-gray-600 mt-1">
              Ces aliases servent au rattachement automatique: un booking PAUC AIX pourra etre rattache a GERGOM EVENTS.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-700">Suggestions events non rattaches</div>
              <div className="mt-2 flex gap-2">
                <select
                  value={selectedAliasSuggestion}
                  onChange={(e) => setSelectedAliasSuggestion(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Choisir un nom d'event detecte...</option>
                  {filteredEventAliasSuggestions.map((alias) => (
                    <option key={alias} value={alias}>{alias}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedAliasSuggestion}
                  onClick={() => {
                    handleAddEventAliasSuggestion(selectedAliasSuggestion);
                    setSelectedAliasSuggestion('');
                  }}
                  className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
              {loadingAliasSuggestions ? (
                <p className="text-xs text-gray-500 mt-2">Chargement des suggestions...</p>
              ) : filteredEventAliasSuggestions.length === 0 ? (
                <p className="text-xs text-gray-500 mt-2">Aucune suggestion en attente.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {filteredEventAliasSuggestions.slice(0, 12).map((alias) => (
                    <button
                      key={alias}
                      type="button"
                      onClick={() => handleAddEventAliasSuggestion(alias)}
                      className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-brand-300 hover:text-brand-700"
                    >
                      + {alias}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4"
              rows={3}
            />

            {/* Photo de profil */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Photo de profil (logo/avatar)
              </label>
              <div className="flex items-center gap-4">
                {formData.profileImageUrl && (
                  <div className="w-16 h-16 rounded-full overflow-hidden shadow-lg ring-2 ring-purple-200">
                    <img
                      src={formData.profileImageUrl}
                      alt="Aperçu"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <input
                  type="url"
                  placeholder="URL de l'image (colle l'URL de la photo Instagram ou autre)"
                  value={formData.profileImageUrl}
                  onChange={(e) => setFormData({ ...formData, profileImageUrl: e.target.value })}
                  className="border rounded-lg px-4 py-2 flex-1"
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">
                💡 Pour récupérer l'URL d'une photo Instagram : ouvre le profil → clic droit sur la photo → "Copier l'adresse de l'image"
              </p>
            </div>

            {/* Section Instagram CRM - Contact Principal (Legacy) */}
            <div className="mt-6 p-4 border border-apple-border rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-5 h-5 text-brand-600" />
                <h3 className="text-sm font-semibold text-brand-900 uppercase">Contact Principal (Legacy)</h3>
                <span className="text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded">Ancien système</span>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Handle Instagram (@username)"
                  value={formData.instagramHandle}
                  onChange={(e) => setFormData({ ...formData, instagramHandle: e.target.value })}
                  className="border rounded-lg px-4 py-2"
                />
                <input
                  type="url"
                  placeholder="URL Instagram"
                  value={formData.instagramUrl}
                  onChange={(e) => {
                    const url = e.target.value.trim();

                    // Auto-extraire le handle depuis l'URL (ex: instagram.com/nomclub/)
                    const handleMatch = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
                    if (handleMatch && handleMatch[1] !== 'direct') {
                      const handle = handleMatch[1];
                      const igMeLink = `https://ig.me/m/${handle}`;

                      // Mettre à jour handle, URL et igNotes avec le lien ig.me
                      const currentNotes = formData.igNotes || '';
                      let newNotes = currentNotes;

                      // Ajouter ou remplacer le lien ig.me dans les notes
                      if (currentNotes.includes('ig.me:')) {
                        newNotes = currentNotes.replace(/ig\.me:\s*https:\/\/ig\.me\/m\/[a-zA-Z0-9._]+/, `ig.me: ${igMeLink}`);
                      } else {
                        newNotes = currentNotes ? `ig.me: ${igMeLink}\n${currentNotes}` : `ig.me: ${igMeLink}`;
                      }

                      setFormData({
                        ...formData,
                        instagramUrl: url,
                        instagramHandle: handle,
                        igNotes: newNotes
                      });
                    } else {
                      setFormData({ ...formData, instagramUrl: url });
                    }
                  }}
                  className="border rounded-lg px-4 py-2"
                />
              </div>

              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Thread ID Instagram (ex: 110841490316401) ou URL complète"
                  value={formData.instagramThreadId}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    // Si c'est une URL, extraire le Thread ID
                    const threadMatch = value.match(/instagram\.com\/direct\/t\/(\d+)/);
                    if (threadMatch) {
                      setFormData({ ...formData, instagramThreadId: threadMatch[1] });
                    } else {
                      setFormData({ ...formData, instagramThreadId: value });
                    }
                  }}
                  className="border rounded-lg px-4 py-2 w-full"
                />
                <p className="text-xs text-gray-600 mt-1">
                  💡 Tu peux coller l'URL complète (ex: instagram.com/direct/t/110841490316401/) ou juste le numéro (110841490316401)
                </p>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Statut Instagram
                </label>
                <select
                  value={formData.igStatus}
                  onChange={(e) => setFormData({ ...formData, igStatus: e.target.value as InstagramStatus })}
                  className="border rounded-lg px-4 py-2 w-full"
                >
                  <option value="NOT_CONTACTED">Non contacté</option>
                  <option value="DM_SENT">DM envoyé</option>
                  <option value="REPLIED">Répondu</option>
                  <option value="NO_REPLY">Pas de réponse</option>
                  <option value="IGNORED">Ignoré</option>
                  <option value="BOOKED">Booké</option>
                  <option value="NOT_INTERESTED">Pas intéressé</option>
                </select>
              </div>

              <textarea
                placeholder="Notes Instagram (historique des messages, contexte...)"
                value={formData.igNotes}
                onChange={(e) => setFormData({ ...formData, igNotes: e.target.value })}
                className="border rounded-lg px-4 py-2 w-full mt-4"
                rows={2}
              />
            </div>

            {/* Section Multi-Contacts Instagram */}
            <div className="mt-6 p-4 border border-apple-border rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <UserCircle className="w-5 h-5 text-brand-600" />
                <h3 className="text-sm font-semibold text-brand-900 uppercase">Contacts Instagram</h3>
                <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Nouveau</span>
              </div>

              <p className="text-sm text-gray-700 mb-4">
                Ajoute plusieurs contacts Instagram (Booker, DA, Patron, Enseigne...) pour contacter différentes personnes de l'établissement.
              </p>

              {/* Liste des contacts existants */}
              {formData.instagramContacts.length > 0 && (
                <div className="space-y-2 mb-4">
                  {formData.instagramContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="bg-white border border-apple-border rounded-lg p-3 flex items-start gap-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getRoleColor(contact.role)}`}>
                            {getRoleLabel(contact.role)}
                          </span>
                          {contact.name && (
                            <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                          )}
                        </div>
                        {contact.handle && (
                          <p className="text-sm text-brand-700">@{contact.handle}</p>
                        )}
                        {contact.threadId && (
                          <p className="text-xs text-gray-600 mt-1">Thread ID: {contact.threadId}</p>
                        )}
                        {contact.notes && (
                          <p className="text-xs text-gray-600 mt-1 italic">{contact.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditContact(contact)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="Modifier"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(contact.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulaire d'ajout/édition de contact */}
              <div className="bg-white border border-apple-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  {editingContactId ? 'Modifier le contact' : 'Ajouter un contact'}
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Rôle *
                    </label>
                    <select
                      value={contactFormData.role}
                      onChange={(e) => setContactFormData({ ...contactFormData, role: e.target.value as any })}
                      className="border rounded-lg px-3 py-2 w-full text-sm"
                    >
                      <option value="PATRON">Patron / Propriétaire</option>
                      <option value="BOOKER">Booker</option>
                      <option value="DA">DA (Directeur Artistique)</option>
                      <option value="DJ">DJ</option>
                      <option value="ENSEIGNE">Enseigne (Compte officiel)</option>
                      <option value="AUTRE">Autre</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nom du contact
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Thomas - Booker"
                      value={contactFormData.name}
                      onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                      className="border rounded-lg px-3 py-2 w-full text-sm"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Handle (@username)
                      </label>
                      <input
                        type="text"
                        placeholder="@username"
                        value={contactFormData.handle}
                        onChange={(e) => setContactFormData({ ...contactFormData, handle: e.target.value })}
                        className="border rounded-lg px-3 py-2 w-full text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        URL Instagram
                      </label>
                      <input
                        type="url"
                        placeholder="instagram.com/username"
                        value={contactFormData.url}
                        onChange={(e) => {
                          const url = e.target.value.trim();
                          const handleMatch = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
                          if (handleMatch && handleMatch[1] !== 'direct') {
                            const handle = handleMatch[1];
                            const igMeLink = `https://ig.me/m/${handle}`;

                            // Ajouter ou remplacer le lien ig.me dans les notes
                            const currentNotes = contactFormData.notes || '';
                            let newNotes = currentNotes;

                            if (currentNotes.includes('ig.me:')) {
                              newNotes = currentNotes.replace(/ig\.me:\s*https:\/\/ig\.me\/m\/[a-zA-Z0-9._]+/, `ig.me: ${igMeLink}`);
                            } else {
                              newNotes = currentNotes ? `ig.me: ${igMeLink}\n${currentNotes}` : `ig.me: ${igMeLink}`;
                            }

                            if (!contactFormData.handle || contactFormData.handle.length < 2) {
                              setContactFormData({ ...contactFormData, url, handle, notes: newNotes });
                            } else {
                              setContactFormData({ ...contactFormData, url, notes: newNotes });
                            }
                          } else {
                            setContactFormData({ ...contactFormData, url });
                          }
                        }}
                        className="border rounded-lg px-3 py-2 w-full text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Thread ID (numérique)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 110841490316401 ou URL complète"
                      value={contactFormData.threadId}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        const threadMatch = value.match(/instagram\.com\/direct\/t\/(\d+)/);
                        if (threadMatch) {
                          setContactFormData({ ...contactFormData, threadId: threadMatch[1] });
                        } else {
                          setContactFormData({ ...contactFormData, threadId: value });
                        }
                      }}
                      className="border rounded-lg px-3 py-2 w-full text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Tu peux coller l'URL complète du thread ou juste le numéro
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      placeholder="Notes sur ce contact..."
                      value={contactFormData.notes}
                      onChange={(e) => setContactFormData({ ...contactFormData, notes: e.target.value })}
                      className="border rounded-lg px-3 py-2 w-full text-sm"
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddContact}
                      className="flex items-center gap-2 btn-primary text-sm font-medium"
                    >
                      <Plus size={16} />
                      {editingContactId ? 'Mettre à jour' : 'Ajouter'}
                    </button>
                    {editingContactId && (
                      <button
                        type="button"
                        onClick={resetContactForm}
                        className="flex items-center gap-2 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        <X size={16} />
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

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
              className="mt-4 btn-primary flex items-center gap-2"
            >
              <Save size={20} />
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </form>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="ui-card p-6 cursor-pointer transition-all duration-300 hover:shadow-md"
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
                  {client.profileImageUrl ? (
                    <div className="w-12 h-12 rounded-full overflow-hidden shadow-lg ring-2 ring-white">
                      <img
                        src={client.profileImageUrl}
                        alt={client.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white shadow-inner"
                      style={{ backgroundColor: client.color || '#8B5CF6' }}
                    >
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-apple-text-main leading-tight">{client.professionalName || client.name}</h3>
                    {client.professionalName && <p className="text-sm text-apple-text-muted mt-0.5">{client.name}</p>}
                  </div>
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
              {/* Divider subtil */}
              <div className="h-[1px] bg-[#F2F2F7] my-4" />

              {client.primaryEmail && <p className="text-apple-text-main text-sm font-medium">📧 {client.primaryEmail}</p>}
              {client.altEmails && client.altEmails.length > 0 && (
                <div className="text-apple-text-muted text-sm mt-1 space-y-1">
                  {client.altEmails.map((email) => (
                    <div key={email}>↪ {email}</div>
                  ))}
                </div>
              )}
              {client.phone && <p className="text-apple-text-main text-sm font-medium mt-2">📱 {client.phone}</p>}
              {client.address && <p className="text-apple-text-muted text-sm mt-2">📍 {client.address}</p>}
              {client.siret && <p className="text-apple-text-muted text-sm mt-2">🏢 {client.siret}</p>}

              {/* Instagram Info */}
              {(client.instagramHandle || (client.instagramContacts && client.instagramContacts.length > 0)) && (
                <div className="mt-3 p-2 bg-brand-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <MessageCircle className="w-4 h-4 text-brand-600" />
                    {client.instagramHandle && (
                      <span className="font-medium text-brand-900">{client.instagramHandle}</span>
                    )}
                    {client.instagramContacts && client.instagramContacts.length > 0 && (
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-brand-600" />
                        <span className="text-xs font-semibold text-brand-900">
                          {client.instagramContacts.length} contact{client.instagramContacts.length > 1 ? 's' : ''}
                        </span>
                        <div className="flex gap-1">
                          {client.instagramContacts.slice(0, 3).map((contact) => (
                            <span key={contact.id} className={`text-xs px-1.5 py-0.5 rounded ${getRoleColor(contact.role)}`}>
                              {getRoleLabel(contact.role)}
                            </span>
                          ))}
                          {client.instagramContacts.length > 3 && (
                            <span className="text-xs text-brand-600 font-semibold">+{client.instagramContacts.length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {client.igStatus && (
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-semibold ${
                        client.igStatus === 'BOOKED' ? 'bg-green-100 text-green-800' :
                        client.igStatus === 'REPLIED' ? 'bg-blue-100 text-blue-800' :
                        client.igStatus === 'DM_SENT' ? 'bg-yellow-100 text-yellow-800' :
                        client.igStatus === 'NO_REPLY' ? 'bg-orange-100 text-orange-800' :
                        client.igStatus === 'IGNORED' ? 'bg-gray-100 text-gray-800' :
                        client.igStatus === 'NOT_INTERESTED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {client.igStatus === 'NOT_CONTACTED' ? 'Non contacté' :
                         client.igStatus === 'DM_SENT' ? 'DM envoyé' :
                         client.igStatus === 'REPLIED' ? 'Répondu' :
                         client.igStatus === 'NO_REPLY' ? 'Pas de réponse' :
                         client.igStatus === 'IGNORED' ? 'Ignoré' :
                         client.igStatus === 'BOOKED' ? 'Booké' :
                         client.igStatus === 'NOT_INTERESTED' ? 'Pas intéressé' : client.igStatus}
                      </span>
                    )}
                  </div>
                  {client.lastIgAt && (
                    <p className="text-xs text-gray-600 mt-1">
                      Dernier contact : {client.lastIgAt.toLocaleDateString('fr-FR')}
                    </p>
                  )}
                  {client.nextIgRelanceAt && (
                    <div className="flex items-center gap-2 mt-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          new Date(client.nextIgRelanceAt) < new Date() ? 'bg-red-500' : 'bg-gray-300'
                        }`}
                      />
                      <p className={`text-xs font-medium ${
                        new Date(client.nextIgRelanceAt) < new Date() ? 'text-red-600' : 'text-apple-text-muted'
                      }`}>
                        {new Date(client.nextIgRelanceAt) < new Date()
                          ? 'Relance en retard'
                          : `Relance le ${client.nextIgRelanceAt.toLocaleDateString('fr-FR')}`}
                      </p>
                    </div>
                  )}
                  <Link
                    href={`/clients/${client.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 block w-full text-center btn-primary-sm text-xs font-medium"
                  >
                    CRM Instagram →
                  </Link>
                </div>
              )}

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
