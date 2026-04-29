'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { Client, InstagramMessageTemplate, CrmLog, Booking } from '@/types';
import { ArrowLeft, MessageCircle, Copy, Send, CheckCircle, Calendar, ExternalLink, X, UserCircle } from 'lucide-react';
import Link from 'next/link';

// Templates par défaut
const defaultTemplates: InstagramMessageTemplate[] = [
  {
    id: 'default-1',
    name: 'Premier Contact Classique',
    type: 'PREMIER_CONTACT',
    content: 'Salut {{etablissement}},\n\nJ\'espère que tu vas bien ! Je suis DJ et je serais intéressé pour collaborer avec ton établissement.\n\nTu aurais des disponibilités pour en discuter ?\n\nÀ bientôt !',
    variables: ['{{etablissement}}'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'default-2',
    name: 'Approche Directe avec Dates',
    type: 'PREMIER_CONTACT',
    content: 'Hey {{etablissement}} ! 👋\n\nJe suis DJ depuis plusieurs années et j\'adorerais mixer chez vous. J\'ai des disponibilités ces prochaines semaines.\n\nÇa t\'intéresserait qu\'on en parle ?\n\nÀ très vite !',
    variables: ['{{etablissement}}'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'default-3',
    name: 'Relance Après Premier Contact',
    type: 'RELANCE_J7',
    content: 'Re {{etablissement}},\n\nJe reviens vers toi concernant ma proposition de collaboration.\n\nTu aurais un moment cette semaine pour qu\'on échange ?\n\nMerci ! 😊',
    variables: ['{{etablissement}}'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'default-4',
    name: 'Proposition Événement Spécial',
    type: 'CUSTOM',
    content: 'Salut {{etablissement}} ! 🎵\n\nJ\'ai vu que vous organisez des soirées régulièrement. Je serais super motivé pour participer à vos prochains événements.\n\nOn pourrait discuter de vos prochaines dates ?\n\nAu plaisir !',
    variables: ['{{etablissement}}'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'default-5',
    name: 'Relance Saison / Longue Absence',
    type: 'CUSTOM',
    content: 'Salut {{etablissement}} ! 😊\n\nJ\'espère que tu vas bien ! Ça fait un moment qu\'on a pas bossé ensemble et c\'était vraiment cool à l\'époque.\n\nJe pensais à toi en préparant la saison, ça te dirait qu\'on rebosse ensemble ? J\'adorerais refaire des dates chez vous !\n\nDis-moi si t\'as des dispo prochainement, ça me ferait vraiment plaisir 🙌\n\nÀ bientôt j\'espère !',
    variables: ['{{etablissement}}'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [templates, setTemplates] = useState<InstagramMessageTemplate[]>(defaultTemplates);
  const [crmLogs, setCrmLogs] = useState<CrmLog[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [eventAliasesInput, setEventAliasesInput] = useState('');
  const [savingEventAliases, setSavingEventAliases] = useState(false);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      // Charger le client
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (!clientDoc.exists()) {
        router.push('/clients');
        return;
      }

      const clientData = clientDoc.data();
      const parsedClient = {
        id: clientDoc.id,
        ...clientData,
        eventAliases: Array.isArray(clientData.eventAliases)
          ? clientData.eventAliases.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
          : [],
        createdAt: clientData.createdAt?.toDate ? clientData.createdAt.toDate() : clientData.createdAt,
        updatedAt: clientData.updatedAt?.toDate ? clientData.updatedAt.toDate() : clientData.updatedAt,
        lastIgAt: clientData.lastIgAt?.toDate ? clientData.lastIgAt.toDate() : clientData.lastIgAt,
        nextIgRelanceAt: clientData.nextIgRelanceAt?.toDate ? clientData.nextIgRelanceAt.toDate() : clientData.nextIgRelanceAt,
      } as Client;
      setClient(parsedClient);
      setEventAliasesInput((parsedClient.eventAliases || []).join('\n'));

      // Charger les templates depuis Firestore
      const templatesSnapshot = await getDocs(collection(db, 'instagram_templates'));
      const firestoreTemplates = templatesSnapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt,
          updatedAt: d.data().updatedAt?.toDate?.() || d.data().updatedAt,
        } as InstagramMessageTemplate))
        .filter(t => t.isActive);

      // Fusionner templates par défaut + templates Firestore
      setTemplates([...defaultTemplates, ...firestoreTemplates]);

      // Charger les logs CRM
      const logsQuery = query(
        collection(db, 'crm_logs'),
        where('clientId', '==', clientId),
        orderBy('at', 'desc')
      );
      const logsSnapshot = await getDocs(logsQuery);
      const logsData = logsSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        at: d.data().at?.toDate ? d.data().at.toDate() : d.data().at,
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : d.data().createdAt,
      } as CrmLog));
      setCrmLogs(logsData);

      // Charger les bookings du client
      const bookingsQuery = query(
        collection(db, 'bookings'),
        where('clientId', '==', clientId),
        orderBy('start', 'desc')
      );
      const bookingsSnapshot = await getDocs(bookingsQuery);
      const bookingsData = bookingsSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        start: d.data().start?.toDate ? d.data().start.toDate() : d.data().start,
        end: d.data().end?.toDate ? d.data().end.toDate() : d.data().end,
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : d.data().createdAt,
        updatedAt: d.data().updatedAt?.toDate ? d.data().updatedAt.toDate() : d.data().updatedAt,
      } as Booking));
      setBookings(bookingsData);

      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement:', error);
      setLoading(false);
    }
  };

  const replaceVariables = (template: string, client: Client): string => {
    let result = template;

    // Extraire le prénom du nom (premier mot)
    const prenom = client.name.split(' ')[0];

    result = result.replace(/\{\{prenom\}\}/g, prenom);
    result = result.replace(/\{\{etablissement\}\}/g, client.professionalName || client.name);
    result = result.replace(/\{\{ville\}\}/g, client.address?.split(',').pop()?.trim() || '');

    // Pour les dates, on pourrait les laisser vides ou proposer des dates futures
    result = result.replace(/\{\{date1\}\}/g, '[Date 1]');
    result = result.replace(/\{\{date2\}\}/g, '[Date 2]');
    result = result.replace(/\{\{date3\}\}/g, '[Date 3]');

    return result;
  };

  const handleCopyTemplate = () => {
    if (!client) return;

    let message = customMessage;

    if (selectedTemplate) {
      const template = templates.find(t => t.id === selectedTemplate);
      if (template) {
        message = replaceVariables(template.content, client);
      }
    }

    navigator.clipboard.writeText(message);
    alert('Message copié dans le presse-papier!\nColle-le dans Instagram.');
    setShowTemplateModal(false);
  };

  const handleMarkDmSent = async () => {
    if (!client) return;

    const now = new Date();
    const relanceDate = new Date(now);
    relanceDate.setDate(relanceDate.getDate() + 7); // Relance dans 7 jours

    await updateDoc(doc(db, 'clients', clientId), {
      igStatus: 'DM_SENT',
      lastIgAt: now,
      nextIgRelanceAt: relanceDate,
      updatedAt: now,
    });

    // Logger l'action
    await addDoc(collection(db, 'crm_logs'), {
      clientId: client.id,
      clientName: client.name,
      channel: 'instagram',
      action: 'DM_SENT',
      at: now,
      messagePreview: customMessage.substring(0, 100),
      templateUsed: selectedTemplate || null,
      oldStatus: client.igStatus,
      newStatus: 'DM_SENT',
      createdAt: now,
    });

    await loadData();
  };

  const handleMarkReplied = async () => {
    if (!client) return;

    const now = new Date();

    await updateDoc(doc(db, 'clients', clientId), {
      igStatus: 'REPLIED',
      lastIgAt: now,
      nextIgRelanceAt: null,
      updatedAt: now,
    });

    await addDoc(collection(db, 'crm_logs'), {
      clientId: client.id,
      clientName: client.name,
      channel: 'instagram',
      action: 'REPLIED',
      at: now,
      oldStatus: client.igStatus,
      newStatus: 'REPLIED',
      createdAt: now,
    });

    await loadData();
  };

  const handleMarkIgnored = async () => {
    if (!client) return;

    const now = new Date();

    await updateDoc(doc(db, 'clients', clientId), {
      igStatus: 'IGNORED',
      lastIgAt: now,
      nextIgRelanceAt: null,
      updatedAt: now,
    });

    await addDoc(collection(db, 'crm_logs'), {
      clientId: client.id,
      clientName: client.name,
      channel: 'instagram',
      action: 'STATUS_CHANGE',
      at: now,
      oldStatus: client.igStatus,
      newStatus: 'IGNORED',
      createdAt: now,
    });

    await loadData();
  };

  const parseEventAliases = (value: string) => {
    return Array.from(new Set(
      value
        .split(/[\n,;]/)
        .map((alias) => alias.trim())
        .filter(Boolean)
    ));
  };

  const handleSaveEventAliases = async () => {
    if (!client) return;
    setSavingEventAliases(true);
    try {
      const aliases = parseEventAliases(eventAliasesInput);
      await updateDoc(doc(db, 'clients', clientId), {
        eventAliases: aliases,
        updatedAt: new Date(),
      });
      setClient({ ...client, eventAliases: aliases, updatedAt: new Date() });
      alert('Aliases d\'events enregistrés ✅');
    } catch (error) {
      console.error('Erreur sauvegarde aliases events:', error);
      alert('Erreur lors de la sauvegarde des aliases d\'events');
    } finally {
      setSavingEventAliases(false);
    }
  };

  const handleCreateBooking = () => {
    // Rediriger vers la page bookings avec le client pré-sélectionné
    router.push(`/bookings?clientId=${clientId}&fromInstagram=true`);
  };

  const openInstagram = () => {
    if (client?.instagramUrl) {
      window.open(client.instagramUrl, '_blank');
    } else if (client?.instagramHandle) {
      const handle = client.instagramHandle.replace('@', '');
      window.open(`https://instagram.com/${handle}`, '_blank');
    }
  };

  const openInstagramDM = (contactId?: string) => {
    // Si un contactId est fourni, utiliser le contact multi-contact
    if (contactId && client?.instagramContacts) {
      const contact = client.instagramContacts.find(c => c.id === contactId);
      if (contact?.threadId && /^\d+$/.test(contact.threadId)) {
        window.open(`https://www.instagram.com/direct/t/${contact.threadId}/`, '_blank');
        return;
      }
    }

    // Sinon, priorité au contact sélectionné dans le modal
    if (selectedContactId && client?.instagramContacts) {
      const contact = client.instagramContacts.find(c => c.id === selectedContactId);
      if (contact?.threadId && /^\d+$/.test(contact.threadId)) {
        window.open(`https://www.instagram.com/direct/t/${contact.threadId}/`, '_blank');
        return;
      }
    }

    // Fallback legacy : utiliser le Thread ID du client principal
    if (client?.instagramThreadId) {
      window.open(`https://www.instagram.com/direct/t/${client.instagramThreadId}/`, '_blank');
    } else if (client?.instagramHandle) {
      // Fallback : ouvrir la messagerie générale (ne fonctionne pas toujours)
      window.open(`https://www.instagram.com/direct/inbox/`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/clients" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{client.name}</h1>
            {client.professionalName && (
              <p className="text-gray-600 mt-1">{client.professionalName}</p>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche - Info client */}
          <div className="lg:col-span-1 space-y-6">
            {/* Infos de base */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informations</h2>
              {client.primaryEmail && (
                <p className="text-gray-800 mb-2">📧 {client.primaryEmail}</p>
              )}
              {client.phone && (
                <p className="text-gray-800 mb-2">📱 {client.phone}</p>
              )}
              {client.address && (
                <p className="text-gray-800 mb-2">📍 {client.address}</p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Aliases events / lieux</h2>
              <p className="text-sm text-gray-600 mb-3">
                Rattache ici les noms evenements/lieux payés par ce client (ex: PAUC AIX).
              </p>
              <textarea
                value={eventAliasesInput}
                onChange={(e) => setEventAliasesInput(e.target.value)}
                placeholder={"Un alias par ligne\nPAUC AIX\nCLUB 3 RICHEBOIS"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={4}
              />
              <button
                type="button"
                onClick={handleSaveEventAliases}
                disabled={savingEventAliases}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand-600 text-white px-3 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
              >
                {savingEventAliases ? 'Enregistrement...' : 'Enregistrer aliases'}
              </button>
            </div>

            {/* Instagram Status */}
            {client.instagramHandle && (
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg shadow-md p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-purple-900">Instagram</h2>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-gray-600">Handle:</span>
                    <p className="font-medium text-purple-900">{client.instagramHandle}</p>
                  </div>

                  <div>
                    <span className="text-sm text-gray-600">Statut:</span>
                    <div className="mt-1">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
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
                    </div>
                  </div>

                  {client.lastIgAt && (
                    <div>
                      <span className="text-sm text-gray-600">Dernier contact:</span>
                      <p className="font-medium">{client.lastIgAt.toLocaleDateString('fr-FR')}</p>
                    </div>
                  )}

                  {client.nextIgRelanceAt && (
                    <div>
                      <span className="text-sm text-gray-600">Prochaine relance:</span>
                      <p className="font-medium text-purple-600">
                        {client.nextIgRelanceAt.toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}

                  {client.igNotes && (
                    <div>
                      <span className="text-sm text-gray-600">Notes:</span>
                      <p className="text-sm text-gray-800 mt-1">{client.igNotes}</p>
                    </div>
                  )}
                </div>

                {/* Boutons d'action */}
                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                  >
                    <Copy size={18} />
                    Copier un message
                  </button>

                  <button
                    onClick={() => openInstagramDM()}
                    className="w-full flex items-center justify-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600"
                  >
                    <ExternalLink size={18} />
                    Ouvrir DM Instagram
                  </button>

                  <button
                    onClick={openInstagram}
                    className="w-full flex items-center justify-center gap-2 bg-purple-400 text-white px-4 py-2 rounded-lg hover:bg-purple-500"
                  >
                    <ExternalLink size={18} />
                    Voir profil Instagram
                  </button>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={handleMarkDmSent}
                      className="flex items-center justify-center gap-1 bg-yellow-100 text-yellow-800 px-3 py-2 rounded-lg hover:bg-yellow-200 text-sm"
                    >
                      <Send size={16} />
                      DM envoyé
                    </button>

                    <button
                      onClick={handleMarkReplied}
                      className="flex items-center justify-center gap-1 bg-blue-100 text-blue-800 px-3 py-2 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      <CheckCircle size={16} />
                      Répondu
                    </button>

                    <button
                      onClick={handleMarkIgnored}
                      className="flex items-center justify-center gap-1 bg-gray-100 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      Ignoré
                    </button>

                    <button
                      onClick={handleCreateBooking}
                      className="flex items-center justify-center gap-1 bg-green-100 text-green-800 px-3 py-2 rounded-lg hover:bg-green-200 text-sm"
                    >
                      <Calendar size={16} />
                      Booker
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Contacts Instagram multiples */}
            {client.instagramContacts && client.instagramContacts.length > 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg shadow-md p-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserCircle className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-purple-900">Contacts Instagram</h2>
                  <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-semibold">
                    {client.instagramContacts.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {client.instagramContacts.map((contact) => (
                    <div key={contact.id} className="bg-white border border-purple-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            contact.role === 'PATRON' ? 'bg-orange-100 text-orange-800' :
                            contact.role === 'BOOKER' ? 'bg-purple-100 text-purple-800' :
                            contact.role === 'DA' ? 'bg-pink-100 text-pink-800' :
                            contact.role === 'DJ' ? 'bg-blue-100 text-blue-800' :
                            contact.role === 'ENSEIGNE' ? 'bg-indigo-100 text-indigo-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {contact.role === 'PATRON' ? 'Patron' :
                             contact.role === 'BOOKER' ? 'Booker' :
                             contact.role === 'DA' ? 'DA' :
                             contact.role === 'DJ' ? 'DJ' :
                             contact.role === 'ENSEIGNE' ? 'Enseigne' :
                             'Autre'}
                          </span>
                          {contact.name && (
                            <span className="text-sm font-semibold text-gray-900">{contact.name}</span>
                          )}
                        </div>
                      </div>

                      {contact.handle && (
                        <p className="text-sm text-purple-700 mb-2">@{contact.handle}</p>
                      )}

                      {contact.notes && (
                        <p className="text-xs text-gray-600 italic mb-3">{contact.notes}</p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {contact.url && (
                          <button
                            onClick={() => window.open(contact.url, '_blank')}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-xs font-medium"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Profil
                          </button>
                        )}

                        {contact.threadId && /^\d+$/.test(contact.threadId) && (
                          <button
                            onClick={() => openInstagramDM(contact.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-pink-50 text-pink-700 rounded-lg hover:bg-pink-100 transition-colors text-xs font-medium"
                          >
                            <MessageCircle className="w-3 h-3" />
                            Ouvrir DM
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setSelectedContactId(contact.id);
                            setShowTemplateModal(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-medium"
                        >
                          <Copy className="w-3 h-3" />
                          Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bookings du client */}
            {bookings.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Événements ({bookings.length})</h2>
                <div className="space-y-2">
                  {bookings.slice(0, 5).map(booking => (
                    <div key={booking.id} className="p-3 bg-gray-50 rounded-lg">
                      <p className="font-medium text-sm">{booking.title}</p>
                      <p className="text-xs text-gray-600">
                        {booking.start.toLocaleDateString('fr-FR')}
                      </p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        booking.status === 'confirmé' ? 'bg-green-100 text-green-800' :
                        booking.status === 'option' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite - Timeline CRM */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Timeline CRM</h2>

              {crmLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Aucune activité pour le moment.
                </p>
              ) : (
                <div className="space-y-4">
                  {crmLogs.map((log) => (
                    <div key={log.id} className="flex gap-4 pb-4 border-b last:border-b-0">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          log.action === 'DM_SENT' ? 'bg-yellow-100' :
                          log.action === 'REPLIED' ? 'bg-blue-100' :
                          log.action === 'BOOKED' ? 'bg-green-100' :
                          'bg-gray-100'
                        }`}>
                          {log.action === 'DM_SENT' ? <Send size={18} className="text-yellow-600" /> :
                           log.action === 'REPLIED' ? <CheckCircle size={18} className="text-blue-600" /> :
                           log.action === 'BOOKED' ? <Calendar size={18} className="text-green-600" /> :
                           <MessageCircle size={18} className="text-gray-600" />}
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {log.action === 'DM_SENT' ? 'DM envoyé' :
                               log.action === 'REPLIED' ? 'Client a répondu' :
                               log.action === 'BOOKED' ? 'Événement créé' :
                               log.action === 'STATUS_CHANGE' ? 'Changement de statut' :
                               'Note ajoutée'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {log.at.toLocaleDateString('fr-FR')} à {log.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                            {log.channel}
                          </span>
                        </div>

                        {log.messagePreview && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
                            {log.messagePreview}
                          </div>
                        )}

                        {log.oldStatus && log.newStatus && (
                          <div className="mt-2 text-xs text-gray-600">
                            {log.oldStatus} → {log.newStatus}
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
        </div>
      </div>

      {/* Modal de sélection de template */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Copier un message Instagram</h2>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Sélecteur de contact Instagram */}
                {client.instagramContacts && client.instagramContacts.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact Instagram
                    </label>
                    <select
                      value={selectedContactId || ''}
                      onChange={(e) => setSelectedContactId(e.target.value || null)}
                      className="w-full border rounded-lg px-4 py-2"
                    >
                      {client.instagramHandle && (
                        <option value="">Contact principal ({client.instagramHandle})</option>
                      )}
                      {!client.instagramHandle && (
                        <option value="">-- Sélectionner un contact --</option>
                      )}
                      {client.instagramContacts.map(contact => (
                        <option key={contact.id} value={contact.id}>
                          {contact.role === 'PATRON' ? 'Patron' :
                           contact.role === 'BOOKER' ? 'Booker' :
                           contact.role === 'DA' ? 'DA' :
                           contact.role === 'DJ' ? 'DJ' :
                           contact.role === 'ENSEIGNE' ? 'Enseigne' :
                           'Autre'}
                          {contact.name && ` - ${contact.name}`}
                          {contact.handle && ` (@${contact.handle})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Choisir un template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => {
                      setSelectedTemplate(e.target.value);
                      const template = templates.find(t => t.id === e.target.value);
                      if (template) {
                        setCustomMessage(replaceVariables(template.content, client));
                      }
                    }}
                    className="w-full border rounded-lg px-4 py-2"
                  >
                    <option value="">-- Template personnalisé --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message (personnalise si besoin)
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    className="w-full border rounded-lg px-4 py-2"
                    rows={10}
                    placeholder="Tape ton message ici ou sélectionne un template..."
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      onClick={handleCopyTemplate}
                      className="flex-1 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                    >
                      <Copy size={20} />
                      Copier le message
                    </button>
                    <button
                      onClick={() => {
                        handleCopyTemplate();
                        handleMarkDmSent();
                      }}
                      className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                    >
                      <Send size={20} />
                      Copier + Marquer envoyé
                    </button>
                  </div>

                  {/* Bouton pour ouvrir DM du contact sélectionné */}
                  {(selectedContactId || client.instagramThreadId) && (
                    <button
                      onClick={() => {
                        openInstagramDM(selectedContactId || undefined);
                      }}
                      className="w-full bg-pink-600 text-white px-6 py-3 rounded-lg hover:bg-pink-700 flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={20} />
                      Ouvrir DM Instagram
                      {selectedContactId && client.instagramContacts && (
                        <span className="text-xs opacity-80">
                          ({client.instagramContacts.find(c => c.id === selectedContactId)?.role})
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
