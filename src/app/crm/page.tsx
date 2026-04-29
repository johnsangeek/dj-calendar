'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, Client, Prestation } from '@/types';
import { ArrowLeft, TrendingUp, TrendingDown, Users, Euro, Calendar, Award } from 'lucide-react';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';
import { importClientsFromCSV, importPrestationsFromCSV, recalculateAllSegmentations } from '@/lib/csv-import';
import { cleanDuplicatePrestations, detectDuplicates, fixPrestationClientNames } from '@/lib/clean-duplicates';
import EmailTemplateModal from '@/components/EmailTemplateModal';
import ClientDetailsModal from '@/components/ClientDetailsModal';

type SortBy = 'prestations' | 'revenue' | 'lastCollab';
type EmailTemplateType = 'vip_inactive' | 'regular_inactive' | 'gentle_reminder' | 'custom';

const normalizeForMatch = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const WEDDING_KEYWORDS = [
  'mariage',
  'marie',
  'maries',
  'wedding',
  'bride',
  'groom',
];

export default function CRMPage() {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedClientForEmail, setSelectedClientForEmail] = useState<Client | null>(null);
  const [emailTemplateType, setEmailTemplateType] = useState<EmailTemplateType>('vip_inactive');
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('prestations');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>('');
  const [bookingClientAssignments, setBookingClientAssignments] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);

  // Filtres pour la liste complète
  const [showAllClients, setShowAllClients] = useState(false);
  const [filterVip, setFilterVip] = useState(true);
  const [filterActif, setFilterActif] = useState(true);
  const [filterEnVeille, setFilterEnVeille] = useState(true);
  const [filterARelancer, setFilterARelancer] = useState(true);

  const collabDatesByClientId = useMemo(() => {
    const lastPastByClientId = new Map<string, Date>();
    const nextByClientId = new Map<string, Date>();
    const now = Date.now();

    const registerDate = (clientId: string | undefined, dateValue?: Date) => {
      if (!clientId || !dateValue || Number.isNaN(dateValue.getTime())) return;

      const timestamp = dateValue.getTime();
      if (timestamp <= now) {
        const existingPast = lastPastByClientId.get(clientId);
        if (!existingPast || timestamp > existingPast.getTime()) {
          lastPastByClientId.set(clientId, dateValue);
        }
        return;
      }

      const existingNext = nextByClientId.get(clientId);
      if (!existingNext || timestamp < existingNext.getTime()) {
        nextByClientId.set(clientId, dateValue);
      }
    };

    for (const prestation of prestations) {
      registerDate(prestation.clientId, prestation.date);
    }

    for (const booking of bookings) {
      if (booking.status === 'annulé') continue;
      registerDate(booking.clientId, booking.start);
    }

    return { lastPastByClientId, nextByClientId };
  }, [prestations, bookings]);

  const getEffectiveLastCollab = (client: Client): Date | undefined => {
    const lastActivity = collabDatesByClientId.lastPastByClientId.get(client.id);
    if (lastActivity) return lastActivity;

    const statsLast = client.stats?.lastCollaborationAt;
    if (statsLast && statsLast.getTime() <= Date.now()) {
      return statsLast;
    }

    return undefined;
  };

  const getNextCollab = (client: Client): Date | undefined => collabDatesByClientId.nextByClientId.get(client.id);

  const getEffectiveDaysInactive = (client: Client): number => {
    const lastDate = getEffectiveLastCollab(client);
    if (lastDate) {
      return Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
    }
    if (getNextCollab(client)) {
      return 0;
    }
    return client.stats?.daysInactive ?? Number.POSITIVE_INFINITY;
  };

  const hasRelaunchHistory = (client: Client): boolean => {
    if (getEffectiveLastCollab(client)) return true;
    if ((client.stats?.totalPrestations || 0) > 0) return true;
    if ((client.stats?.totalRevenue || 0) > 0) return true;
    return false;
  };

  const isWeddingClient = (client: Client): boolean => {
    const haystack = normalizeForMatch((client.name || '') + ' ' + (client.professionalName || '') + ' ' + (client.notes || ''));
    return WEDDING_KEYWORDS.some((keyword) => haystack.includes(keyword));
  };

  const shouldExcludeFromRelaunch = (client: Client): boolean => {
    return isWeddingClient(client) || !hasRelaunchHistory(client);
  };

  const getEffectiveLifecycle = (client: Client): 'actif' | 'en_veille' | 'a_relancer' => {
    if (getNextCollab(client)) return 'actif';
    if (shouldExcludeFromRelaunch(client)) return 'en_veille';
    const daysInactive = getEffectiveDaysInactive(client);
    if (daysInactive < 90) return 'actif';
    if (daysInactive <= 365) return 'en_veille';
    return 'a_relancer';
  };

  // Filtres de clients (activité réelle: prestations + bookings liés)
  const vipClients = clients.filter(c => c.segmentation?.vip);
  const activeClients = clients.filter(c => getEffectiveLifecycle(c) === 'actif');
  const dormantClients = clients.filter(c => getEffectiveLifecycle(c) === 'en_veille');
  const toReactivate = clients.filter(c => getEffectiveLifecycle(c) === 'a_relancer' && !shouldExcludeFromRelaunch(c));

  // Liste filtrée pour "Tous les clients"
  const getFilteredClients = () => {
    return clients.filter(client => {
      const isVip = client.segmentation?.vip;
      const lifecycle = getEffectiveLifecycle(client);

      if (isVip && filterVip) return true;
      if (!isVip && lifecycle === 'actif' && filterActif) return true;
      if (!isVip && lifecycle === 'en_veille' && filterEnVeille) return true;
      if (!isVip && lifecycle === 'a_relancer' && filterARelancer) return true;

      return false;
    });
  };

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
    [clients]
  );

  const orphanBookings = useMemo(
    () =>
      bookings
        .filter((booking) => !booking.clientId && booking.status !== 'annulé')
        .sort((a, b) => b.start.getTime() - a.start.getTime()),
    [bookings]
  );

  useEffect(() => {
    if (orphanBookings.length === 0 || clients.length === 0) {
      setBookingClientAssignments({});
      return;
    }

    const nextAssignments: Record<string, string> = {};

    orphanBookings.forEach((booking) => {
      const label = normalizeForMatch(`${booking.clientName || ''} ${booking.title || ''} ${booking.notes || ''}`);
      const exact = clients.find((client) => {
        const aliases = [client.name, client.professionalName, ...(client.eventAliases || [])]
          .map(normalizeForMatch)
          .filter(Boolean);
        return aliases.some((alias) => alias && (label.includes(alias) || alias.includes(label)));
      });
      if (exact) {
        nextAssignments[booking.id] = exact.id;
      }
    });

    setBookingClientAssignments(nextAssignments);
  }, [orphanBookings, clients]);

  // Stats globales
  const totalClients = clients.length;
  const totalRevenue = clients.reduce((sum, c) => sum + (c.stats?.totalRevenue || 0), 0);
  const totalPrestations = clients.reduce((sum, c) => sum + (c.stats?.totalPrestations || 0), 0);

  // CA année en cours vs année précédente
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  const currentYearPrestations = prestations.filter(p => p.date.getFullYear() === currentYear);
  const lastYearPrestations = prestations.filter(p => p.date.getFullYear() === lastYear);

  const currentYearRevenue = currentYearPrestations.reduce((sum, p) => sum + (p.amount || 0), 0);
  const lastYearRevenue = lastYearPrestations.reduce((sum, p) => sum + (p.amount || 0), 0);

  const revenueGrowth = lastYearRevenue > 0
    ? Math.round(((currentYearRevenue - lastYearRevenue) / lastYearRevenue) * 100)
    : 0;

  // Panier moyen
  const averageTicket = totalPrestations > 0 ? Math.round(totalRevenue / totalPrestations) : 0;
  const currentYearAverage = currentYearPrestations.length > 0
    ? Math.round(currentYearRevenue / currentYearPrestations.length)
    : 0;

  const toDateKey = (date: Date) =>
    [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

  // Compte réel des dates passées client (prestations + bookings non annulés)
  const getClientHistoricalDateCount = (client: Client): number => {
    const keys = new Set<string>();

    for (const prestation of prestations) {
      if (prestation.clientId === client.id) {
        keys.add(toDateKey(prestation.date));
      }
    }

    for (const booking of bookings) {
      if (booking.clientId === client.id && booking.status !== 'annulé' && booking.start.getTime() <= Date.now()) {
        keys.add(toDateKey(booking.start));
      }
    }

    return Math.max(keys.size, client.stats?.totalPrestations || 0);
  };

  // Clients avec qui on travaille le moins (mais qui ont déjà travaillé avec nous)
  const leastWorkedClients = [...clients]
    .filter((c) => getClientHistoricalDateCount(c) > 0 && getClientHistoricalDateCount(c) <= 3)
    .sort((a, b) => getClientHistoricalDateCount(a) - getClientHistoricalDateCount(b))
    .slice(0, 10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientsSnap, prestationsSnap, bookingsSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'prestations')),
        getDocs(collection(db, 'bookings'))
      ]);

      const clientsData = clientsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        stats: {
          ...doc.data().stats,
          firstCollaborationAt: doc.data().stats?.firstCollaborationAt?.toDate(),
          lastCollaborationAt: doc.data().stats?.lastCollaborationAt?.toDate()
        }
      })) as Client[];

      const prestationsData = prestationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as Prestation[];

      const bookingsData = bookingsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        start: doc.data().start?.toDate ? doc.data().start.toDate() : new Date(doc.data().start),
        end: doc.data().end?.toDate ? doc.data().end.toDate() : new Date(doc.data().end),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
        updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
      })) as Booking[];

      setClients(clientsData);
      setPrestations(prestationsData);
      setBookings(bookingsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortClients = (clientsList: Client[], by: SortBy): Client[] => {
    return [...clientsList].sort((a, b) => {
      switch (by) {
        case 'prestations':
          return (b.stats?.totalPrestations || 0) - (a.stats?.totalPrestations || 0);
        case 'revenue':
          return (b.stats?.totalRevenue || 0) - (a.stats?.totalRevenue || 0);
        case 'lastCollab':
          const dateA = getEffectiveLastCollab(a)?.getTime() || 0;
          const dateB = getEffectiveLastCollab(b)?.getTime() || 0;
          return dateB - dateA;
        default:
          return 0;
      }
    });
  };

  const handleImportClients = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult('');

    try {
      const content = await file.text();
      const result = await importClientsFromCSV(content);
      setImportResult(`✅ ${result.success} clients importés. ${result.errors.length > 0 ? `Erreurs: ${result.errors.join(', ')}` : ''}`);
      await loadData();
    } catch (error) {
      setImportResult(`❌ Erreur: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const handleImportPrestations = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult('');

    try {
      const content = await file.text();
      const result = await importPrestationsFromCSV(content);
      setImportResult(`✅ ${result.success} prestations importées. ${result.errors.length > 0 ? `Erreurs: ${result.errors.join(', ')}` : ''}`);
      await loadData();
    } catch (error) {
      setImportResult(`❌ Erreur: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRecalculateSegmentations = async () => {
    setImporting(true);
    try {
      const count = await recalculateAllSegmentations();
      setImportResult(`✅ ${count} clients recalculés`);
      await loadData();
    } catch (error) {
      setImportResult(`❌ Erreur: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const handleFixClientNames = async () => {
    setImporting(true);
    try {
      const result = await fixPrestationClientNames();

      if (result.fixed === 0) {
        setImportResult('✅ Tous les noms de clients sont corrects');
      } else {
        setImportResult(`✅ ${result.fixed} prestations corrigées${result.errors.length > 0 ? ` (${result.errors.length} erreurs)` : ''}`);
      }

      await loadData();
    } catch (error) {
      setImportResult(`❌ Erreur: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCleanDuplicates = async () => {
    setImporting(true);
    try {
      // D'abord détecter les doublons
      const detection = await detectDuplicates();

      if (detection.duplicates === 0) {
        setImportResult('✅ Aucun doublon détecté');
        setImporting(false);
        return;
      }

      const confirmed = confirm(
        `${detection.duplicates} doublons détectés dans ${detection.groups} groupes.\n\n` +
        `Total prestations: ${detection.total}\n` +
        `Voulez-vous supprimer les doublons ?\n\n` +
        `Cette action est irréversible.`
      );

      if (!confirmed) {
        setImporting(false);
        return;
      }

      // Nettoyer les doublons
      const result = await cleanDuplicatePrestations();
      setImportResult(`✅ ${result.deleted} doublons supprimés, ${result.kept} prestations conservées`);

      // Recharger les données et recalculer les segmentations
      await loadData();
      await handleRecalculateSegmentations();
    } catch (error) {
      setImportResult(`❌ Erreur: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const formatDaysInactive = (days: number): string => {
    if (!Number.isFinite(days) || days > 365 * 200) return 'N/A';
    if (days <= 0) return '0 jour';
    if (days < 30) return days + ' jours';
    if (days < 365) {
      const months = Math.floor(days / 30);
      return months + ' mois';
    }
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return years + ' an' + (years > 1 ? 's' : '') + ' ' + (months > 0 ? months + ' mois' : '');
  };

  const formatCollabResume = (client: Client): string => {
    const lastDate = getEffectiveLastCollab(client);
    const nextDate = getNextCollab(client);

    const lastPart = lastDate
      ? `${lastDate.toLocaleDateString('fr-FR')} (${formatDaysInactive(getEffectiveDaysInactive(client))})`
      : 'N/A';

    if (!nextDate) return lastPart;
    if (!lastDate) return `Aucune passée - Prochaine: ${nextDate.toLocaleDateString('fr-FR')}`;
    return `${lastPart} - Prochaine: ${nextDate.toLocaleDateString('fr-FR')}`;
  };

  const getReactivationMetrics = (client: Client) => {
    const totalPrestations = client.stats?.totalPrestations || 0;
    const totalRevenue = client.stats?.totalRevenue || 0;
    const averageAmount = client.stats?.averageAmount || (totalPrestations > 0 ? totalRevenue / totalPrestations : 0);
    const firstCollab = client.stats?.firstCollaborationAt;
    const lastCollab = getEffectiveLastCollab(client);

    if (totalPrestations === 0 || averageAmount <= 0) {
      return {
        potential: 0,
        averageAmount: Math.round(averageAmount),
        estimatedDatesPerYear: 0,
        methodLabel: 'Aucun historique exploitable',
      };
    }

    let estimatedDatesPerYear = 1;
    let methodLabel = 'Base minimale: 1 date/an';

    if (totalPrestations >= 2 && firstCollab && lastCollab) {
      const spanDays = Math.max(1, Math.floor((lastCollab.getTime() - firstCollab.getTime()) / (1000 * 60 * 60 * 24)));
      const spanYears = Math.max(1, spanDays / 365);
      estimatedDatesPerYear = Math.max(1, Math.round((totalPrestations / spanYears) * 10) / 10);
      methodLabel = 'Cadence historique';
    }

    const potential = Math.round(averageAmount * estimatedDatesPerYear);

    return {
      potential,
      averageAmount: Math.round(averageAmount),
      estimatedDatesPerYear,
      methodLabel,
    };
  };

  const getPriorityScore = (client: Client): number => {
    // Score de priorité pour le tri des clients à relancer
    let score = 0;
    if (client.segmentation?.vip) score += 1000;
    score += (client.stats?.totalPrestations || 0) * 10;
    score += (client.stats?.totalRevenue || 0) / 100;
    score -= getEffectiveDaysInactive(client) * 0.1; // Moins de points si inactif depuis longtemps
    return score;
  };

  const sortByPriority = (clientsList: Client[]): Client[] => {
    return [...clientsList].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  };

  const openEmailModal = (client: Client, templateType: EmailTemplateType) => {
    setSelectedClientForEmail(client);
    setEmailTemplateType(templateType);
    setEmailModalOpen(true);
  };

  const handleSendEmailToAllVIPInactive = () => {
    const vipInactive = clients.filter(c => c.segmentation?.vip && getEffectiveLifecycle(c) === 'a_relancer');
    if (vipInactive.length === 0) {
      alert('Aucun client VIP inactif à relancer');
      return;
    }

    const confirmed = confirm(`Vous allez envoyer un email de relance à ${vipInactive.length} clients VIP inactifs. Continuer ?`);
    if (confirmed) {
      alert('Fonctionnalité d\'envoi en masse à implémenter avec votre service d\'email');
    }
  };

  const handleAssignSingleBooking = async (bookingId: string) => {
    const selectedClientId = bookingClientAssignments[bookingId];
    if (!selectedClientId) return;

    const client = clients.find((c) => c.id === selectedClientId);
    if (!client) return;

    setSavingAssignments(true);
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        clientId: client.id,
        clientName: client.name,
        updatedAt: new Date(),
      });
      setImportResult(`✅ Booking rattaché à "${client.name}"`);
      await loadData();
    } catch (error) {
      console.error('Erreur rattachement booking:', error);
      setImportResult('❌ Erreur lors du rattachement du booking');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleAssignAllBookings = async () => {
    const entries = Object.entries(bookingClientAssignments).filter(([, clientId]) => Boolean(clientId));
    if (entries.length === 0) {
      alert('Aucun rattachement sélectionné.');
      return;
    }

    setSavingAssignments(true);
    try {
      await Promise.all(
        entries.map(async ([bookingId, clientId]) => {
          const client = clients.find((c) => c.id === clientId);
          if (!client) return;
          await updateDoc(doc(db, 'bookings', bookingId), {
            clientId: client.id,
            clientName: client.name,
            updatedAt: new Date(),
          });
        })
      );

      setImportResult(`✅ ${entries.length} booking(s) rattaché(s) avec succès`);
      await loadData();
    } catch (error) {
      console.error('Erreur rattachement en lot:', error);
      setImportResult('❌ Erreur lors du rattachement en lot');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleDeleteOrphanBooking = async (booking: Booking) => {
    const confirmed = confirm(
      `Supprimer ce booking ?\n\n${booking.title || 'Sans titre'} - ${booking.start.toLocaleDateString('fr-FR')}\n\nCette action est irréversible.`
    );
    if (!confirmed) return;

    setSavingAssignments(true);
    try {
      await deleteDoc(doc(db, 'bookings', booking.id));
      setImportResult('✅ Booking supprimé');
      await loadData();
    } catch (error) {
      console.error('Erreur suppression booking:', error);
      setImportResult('❌ Erreur lors de la suppression du booking');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleCreateClientFromBooking = async (booking: Booking) => {
    const suggestion = (booking.clientName || booking.title || '').trim();
    const rawName = prompt('Nom du nouveau client :', suggestion);
    if (rawName === null) return;

    const name = rawName.trim();
    if (!name) {
      alert('Le nom du client est obligatoire.');
      return;
    }

    setSavingAssignments(true);
    try {
      const now = new Date();
      const clientRef = await addDoc(collection(db, 'clients'), {
        name,
        color: '#3B82F6',
        createdAt: now,
        updatedAt: now,
      });

      await updateDoc(doc(db, 'bookings', booking.id), {
        clientId: clientRef.id,
        clientName: name,
        updatedAt: now,
      });

      setImportResult(`✅ Nouveau client "${name}" créé et booking rattaché`);
      await loadData();
    } catch (error) {
      console.error('Erreur création client depuis booking:', error);
      setImportResult('❌ Erreur lors de la création du client');
    } finally {
      setSavingAssignments(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-apple-bg">
        <TopNav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-xl text-gray-600">Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-apple-bg">
      <TopNav />
      <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Link href="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Retour au tableau de bord">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">CRM - Gestion Clients</h1>
        </div>
        <p className="text-gray-600 mt-2">Vue d&apos;ensemble et segmentation de votre portefeuille client</p>
      </div>

      {/* Import Section */}
      <div className="ui-card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Import CSV & Maintenance</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Clients CSV
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleImportClients}
              disabled={importing}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prestations CSV
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleImportPrestations}
              disabled={importing}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Corriger noms
            </label>
            <button
              onClick={handleFixClientNames}
              disabled={importing}
              className="w-full btn-primary disabled:opacity-50"
              title="Corrige les noms de clients incorrects dans les prestations"
            >
              🔧 Corriger noms
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nettoyer doublons
            </label>
            <button
              onClick={handleCleanDuplicates}
              disabled={importing}
              className="w-full btn-secondary disabled:opacity-50"
              title="Supprime les prestations en double (même client + date + montant)"
            >
              🧹 Nettoyer doublons
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recalculer
            </label>
            <button
              onClick={handleRecalculateSegmentations}
              disabled={importing}
              className="w-full btn-primary disabled:opacity-50"
            >
              Recalculer segmentations
            </button>
          </div>
        </div>
        {importResult && (
          <div className={`mt-4 p-3 rounded-lg ${importResult.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {importResult}
          </div>
        )}
      </div>

      {/* Rattachement manuel bookings -> clients */}
      <div className="ui-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Rattacher les bookings sans client</h2>
            <p className="text-sm text-gray-600 mt-1">
              Corrige ici les bookings importés qui n&apos;ont pas de client lié (clientId).
            </p>
          </div>
          <button
            onClick={handleAssignAllBookings}
            disabled={savingAssignments || orphanBookings.length === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingAssignments ? 'Sauvegarde...' : 'Rattacher tout'}
          </button>
        </div>

        {orphanBookings.length === 0 ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800 text-sm">
            ✅ Aucun booking orphelin détecté.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              {orphanBookings.length} booking(s) à rattacher.
            </p>
            <div className="max-h-[420px] overflow-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left font-semibold text-gray-700 px-3 py-2">Date</th>
                    <th className="text-left font-semibold text-gray-700 px-3 py-2">Booking</th>
                    <th className="text-left font-semibold text-gray-700 px-3 py-2">Client actuel</th>
                    <th className="text-left font-semibold text-gray-700 px-3 py-2">Client à rattacher</th>
                    <th className="text-left font-semibold text-gray-700 px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanBookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {booking.start.toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{booking.title || 'Sans titre'}</div>
                        {booking.location && (
                          <div className="text-xs text-gray-500">{booking.location}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {booking.clientName || 'Non défini'}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={bookingClientAssignments[booking.id] || ''}
                          onChange={(e) =>
                            setBookingClientAssignments((prev) => ({
                              ...prev,
                              [booking.id]: e.target.value,
                            }))
                          }
                          className="w-full min-w-[220px] border border-gray-300 rounded-md px-2 py-1"
                        >
                          <option value="">Choisir un client</option>
                          {sortedClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleAssignSingleBooking(booking.id)}
                            disabled={!bookingClientAssignments[booking.id] || savingAssignments}
                            className="btn-primary-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Rattacher
                          </button>
                          <button
                            onClick={() => handleCreateClientFromBooking(booking)}
                            disabled={savingAssignments}
                            className="btn-primary-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Nouveau client
                          </button>
                          <button
                            onClick={() => handleDeleteOrphanBooking(booking)}
                            disabled={savingAssignments}
                            className="btn-danger-soft-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Vue d'ensemble - Stats Année */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ui-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Euro className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-sm text-gray-600">CA {currentYear}</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currentYearRevenue.toLocaleString('fr-FR')}€</div>
          <div className="flex items-center gap-2 mt-2">
            {revenueGrowth >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth}% vs {lastYear}
            </span>
          </div>
        </div>

        <div className="ui-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-sm text-gray-600">Prestations {currentYear}</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currentYearPrestations.length}</div>
          <div className="text-sm text-gray-500 mt-2">
            {lastYearPrestations.length} en {lastYear}
          </div>
        </div>

        <div className="ui-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-brand-600" />
            </div>
            <div className="text-sm text-gray-600">Panier moyen</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currentYearAverage.toLocaleString('fr-FR')}€</div>
          <div className="text-sm text-gray-500 mt-2">
            {averageTicket.toLocaleString('fr-FR')}€ historique
          </div>
        </div>

        <div className="ui-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-sm text-gray-600">Clients VIP</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{vipClients.length}</div>
          <div className="text-sm text-gray-500 mt-2">
            sur {totalClients} clients
          </div>
        </div>
      </div>

      {/* Vue d'ensemble - Résumé */}
      <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-sm p-6">
        <h2 className="text-xl font-bold text-apple-text-main mb-4">Résumé historique</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-2xl font-bold">{totalClients}</div>
            <div className="text-apple-text-muted text-sm">Clients totaux</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{activeClients.length}</div>
            <div className="text-apple-text-muted text-sm">Actifs (&lt;90j)</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{dormantClients.length}</div>
            <div className="text-apple-text-muted text-sm">En veille</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{toReactivate.length}</div>
            <div className="text-apple-text-muted text-sm">À relancer</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString('fr-FR')}€</div>
            <div className="text-apple-text-muted text-sm">CA total</div>
          </div>
        </div>
      </div>

      {/* Top Clients VIP */}
      <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Top Clients VIP</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('prestations')}
                className={`px-3 py-1 rounded ${sortBy === 'prestations' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Prestations
              </button>
              <button
                onClick={() => setSortBy('revenue')}
                className={`px-3 py-1 rounded ${sortBy === 'revenue' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                CA
              </button>
              <button
                onClick={() => setSortBy('lastCollab')}
                className={`px-3 py-1 rounded ${sortBy === 'lastCollab' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Dernière collab
              </button>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {sortClients(vipClients, sortBy).map(client => (
            <div key={client.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: client.color || '#3B82F6' }}
                    />
                    <h3
                      onClick={() => {
                        setSelectedClientForDetails(client);
                        setClientDetailsOpen(true);
                      }}
                      className="text-lg font-bold text-gray-900 cursor-pointer hover:text-brand-600 transition-colors"
                    >
                      {client.name}
                    </h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                      VIP
                    </span>
                    {getEffectiveLifecycle(client) === 'actif' && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                        Actif
                      </span>
                    )}
                    {getEffectiveLifecycle(client) === 'en_veille' && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                        En veille
                      </span>
                    )}
                    {getEffectiveLifecycle(client) === 'a_relancer' && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                        À relancer
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-6 text-sm text-gray-800">
                    <div
                      onClick={() => {
                        setSelectedClientForDetails(client);
                        setClientDetailsOpen(true);
                      }}
                      className="cursor-pointer hover:bg-brand-50 px-2 py-1 rounded transition-colors"
                      title="Cliquez pour voir le détail des prestations"
                    >
                      <span className="font-semibold text-brand-600">{client.stats?.totalPrestations || 0}</span> prestations
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span> CA
                    </div>
                    <div>
                      Dernière collab: <span className="font-semibold text-gray-900">{formatCollabResume(client)}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-gray-800">
                    Tarifs: {(client.stats?.minAmount || 0).toLocaleString('fr-FR')}€ - {(client.stats?.maxAmount || 0).toLocaleString('fr-FR')}€
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEmailModal(client, getEffectiveLifecycle(client) === 'a_relancer' ? 'vip_inactive' : 'gentle_reminder')}
                    className="btn-primary-sm"
                  >
                    Contacter
                  </button>
                  <button className="btn-primary-sm">
                    Nouveau RDV
                  </button>
                </div>
              </div>
            </div>
          ))}
          {vipClients.length === 0 && (
            <div className="text-center text-gray-700 py-8">
              Aucun client VIP pour le moment
            </div>
          )}
        </div>
      </div>

      {/* Clients à relancer */}
      <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Clients à relancer</h2>
            <button
              onClick={handleSendEmailToAllVIPInactive}
              className="btn-secondary text-red-700 border-red-200/50 bg-red-50 hover:bg-red-100"
            >
              Relancer tous les VIP inactifs
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {sortByPriority(toReactivate).map(client => {
            const reactivation = getReactivationMetrics(client);
            const lastCollab = getEffectiveLastCollab(client);
            const nextCollab = getNextCollab(client);

            return (
            <div key={client.id} className="border border-red-200 rounded-lg p-4 bg-red-50 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: client.color || '#3B82F6' }}
                    />
                    <h3
                      onClick={() => {
                        setSelectedClientForDetails(client);
                        setClientDetailsOpen(true);
                      }}
                      className="text-lg font-bold text-gray-900 cursor-pointer hover:text-brand-600 transition-colors"
                    >
                      {client.name}
                    </h3>
                    {client.segmentation?.vip && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                        VIP
                      </span>
                    )}
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                      Inactif depuis {formatDaysInactive(getEffectiveDaysInactive(client))}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-6 text-sm text-gray-800">
                    <div>
                      Historique: <span className="font-semibold text-gray-900">{client.stats?.totalPrestations || 0}</span> prestations, <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-gray-800 space-y-1">
                    <div>
                      Dernière date enregistrée: <span className="font-semibold text-gray-900">{lastCollab?.toLocaleDateString('fr-FR') || 'N/A'}</span>
                    </div>
                    {nextCollab && (
                      <div>
                        Prochaine date prévue: <span className="font-semibold text-gray-900">{nextCollab.toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-green-600 font-semibold">
                    Potentiel réactivation estimé: ~{reactivation.potential.toLocaleString('fr-FR')}€
                  </div>
                  <div className="text-xs text-gray-700">
                    Calcul ({reactivation.methodLabel}): tarif moyen {reactivation.averageAmount.toLocaleString('fr-FR')}€ x rythme estimé {reactivation.estimatedDatesPerYear.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} date(s)/an.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEmailModal(client, client.segmentation?.vip ? 'vip_inactive' : 'regular_inactive')}
                    className="btn-danger-soft-sm"
                  >
                    Relancer
                  </button>
                  <button className="btn-primary-sm">
                    Ajouter note
                  </button>
                </div>
              </div>
            </div>
            );
          })}
          {toReactivate.length === 0 && (
            <div className="text-center text-gray-700 py-8">
              Aucun client à relancer
            </div>
          )}
        </div>
      </div>

      {/* Clients en veille */}
      <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-sm">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Clients en veille</h2>
        </div>
        <div className="p-6 space-y-4">
          {sortClients(dormantClients, 'lastCollab').map(client => (
            <div key={client.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: client.color || '#3B82F6' }}
                    />
                    <h3 className="text-lg font-semibold text-gray-900">{client.name}</h3>
                    {client.segmentation?.vip && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                        VIP
                      </span>
                    )}
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                      En veille
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-800">
                    Dernière collab: {formatCollabResume(client)}
                  </div>
                </div>
                <button
                  onClick={() => openEmailModal(client, 'gentle_reminder')}
                  className="btn-primary-sm"
                >
                  Rappel doux
                </button>
              </div>
            </div>
          ))}
          {dormantClients.length === 0 && (
            <div className="text-center text-gray-700 py-8">
              Aucun client en veille
            </div>
          )}
        </div>
      </div>

      {/* Clients avec qui je travaille le moins */}
      <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-sm">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Clients à développer</h2>
          <p className="text-sm text-gray-600 mt-1">Clients avec peu de prestations - potentiel de développement</p>
        </div>
        <div className="p-6 space-y-4">
          {leastWorkedClients.map(client => (
            <div key={client.id} className="border border-blue-200 rounded-lg p-4 bg-blue-50 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: client.color || '#3B82F6' }}
                    />
                    <h3
                      onClick={() => {
                        setSelectedClientForDetails(client);
                        setClientDetailsOpen(true);
                      }}
                      className="text-lg font-bold text-gray-900 cursor-pointer hover:text-brand-600 transition-colors"
                    >
                      {client.name}
                    </h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                      {getClientHistoricalDateCount(client)} prestation{getClientHistoricalDateCount(client) > 1 ? 's' : ''}
                    </span>
                    {client.segmentation?.vip && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                        VIP
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-6 text-sm text-gray-800">
                    <div>
                      CA: <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span>
                    </div>
                    <div>
                      Moy: <span className="font-semibold text-gray-900">{(client.stats?.averageAmount || 0).toLocaleString('fr-FR')}€</span>
                    </div>
                    {getEffectiveLastCollab(client) && (
                      <div>
                        Dernière: <span className="font-semibold text-gray-900">{getEffectiveLastCollab(client)?.toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEmailModal(client, 'gentle_reminder')}
                    className="btn-primary-sm"
                  >
                    Relancer
                  </button>
                </div>
              </div>
            </div>
          ))}
          {leastWorkedClients.length === 0 && (
            <div className="text-center text-gray-700 py-8">
              Aucun client à développer
            </div>
          )}
        </div>
      </div>

      {/* Tous les clients - Section repliable avec filtres */}
      <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Tous les clients ({getFilteredClients().length})</h2>
            <button
              onClick={() => setShowAllClients(!showAllClients)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {showAllClients ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          {showAllClients && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => setFilterVip(!filterVip)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterVip
                    ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                }`}
              >
                ⭐ VIP
              </button>
              <button
                onClick={() => setFilterActif(!filterActif)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterActif
                    ? 'bg-green-100 text-green-800 border-2 border-green-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                }`}
              >
                ✅ Actifs
              </button>
              <button
                onClick={() => setFilterEnVeille(!filterEnVeille)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterEnVeille
                    ? 'bg-orange-100 text-orange-800 border-2 border-orange-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                }`}
              >
                💤 En veille
              </button>
              <button
                onClick={() => setFilterARelancer(!filterARelancer)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterARelancer
                    ? 'bg-red-100 text-red-800 border-2 border-red-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                }`}
              >
                🔔 À relancer
              </button>
            </div>
          )}
        </div>

        {showAllClients && (
          <div className="p-6 space-y-3">
            {sortClients(getFilteredClients(), sortBy).map(client => {
              const isVip = client.segmentation?.vip;
              const lifecycle = getEffectiveLifecycle(client);

              let bgColor = 'bg-white';
              let borderColor = 'border-gray-200';

              if (isVip) {
                bgColor = 'bg-yellow-50';
                borderColor = 'border-yellow-200';
              } else if (lifecycle === 'actif') {
                bgColor = 'bg-green-50';
                borderColor = 'border-green-200';
              } else if (lifecycle === 'en_veille') {
                bgColor = 'bg-orange-50';
                borderColor = 'border-orange-200';
              } else if (lifecycle === 'a_relancer') {
                bgColor = 'bg-red-50';
                borderColor = 'border-red-200';
              }

              return (
                <div key={client.id} className={`border ${borderColor} rounded-lg p-4 ${bgColor} hover:shadow-md transition-shadow`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: client.color || '#3B82F6' }}
                        />
                        <h3
                          onClick={() => {
                            setSelectedClientForDetails(client);
                            setClientDetailsOpen(true);
                          }}
                          className="text-lg font-bold text-gray-900 cursor-pointer hover:text-brand-600 transition-colors"
                        >
                          {client.name}
                        </h3>
                        {isVip && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                            VIP
                          </span>
                        )}
                        {lifecycle === 'actif' && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                            Actif
                          </span>
                        )}
                        {lifecycle === 'en_veille' && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                            En veille
                          </span>
                        )}
                        {lifecycle === 'a_relancer' && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                            À relancer
                          </span>
                        )}
                      </div>
                      {client.address && (
                        <p className="text-sm text-gray-800 mb-2">{client.address}</p>
                      )}
                      <div className="flex gap-6 text-sm text-gray-800">
                        <div
                          onClick={() => {
                            setSelectedClientForDetails(client);
                            setClientDetailsOpen(true);
                          }}
                          className="cursor-pointer hover:bg-brand-50 px-2 py-1 rounded transition-colors"
                        >
                          <span className="font-semibold text-brand-600">{client.stats?.totalPrestations || 0}</span> prestations
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span> CA
                        </div>
                        <div>
                          Moy: <span className="font-semibold text-gray-900">{(client.stats?.averageAmount || 0).toLocaleString('fr-FR')}€</span>
                        </div>
                        <div>
                          Dernière: {formatCollabResume(client)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEmailModal(client, lifecycle === 'a_relancer' ? (isVip ? 'vip_inactive' : 'regular_inactive') : 'gentle_reminder')}
                        className="btn-primary-sm"
                      >
                        Contacter
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {getFilteredClients().length === 0 && (
              <div className="text-center text-gray-700 py-8">
                Aucun client ne correspond aux filtres sélectionnés
              </div>
            )}
          </div>
        )}
      </div>

      {/* Email Template Modal */}
      <EmailTemplateModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        client={selectedClientForEmail}
        templateType={emailTemplateType}
      />

      {/* Client Details Modal */}
      <ClientDetailsModal
        isOpen={clientDetailsOpen}
        onClose={() => setClientDetailsOpen(false)}
        client={selectedClientForDetails}
        onPrestationDeleted={async () => {
          // Recharger les données et recalculer les segmentations
          await loadData();
          await handleRecalculateSegmentations();
        }}
      />
      </div>
    </div>
  );
}
