'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Client, Prestation } from '@/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { importClientsFromCSV, importPrestationsFromCSV, recalculateAllSegmentations } from '@/lib/csv-import';
import { cleanDuplicatePrestations, detectDuplicates, fixPrestationClientNames } from '@/lib/clean-duplicates';
import EmailTemplateModal from '@/components/EmailTemplateModal';
import ClientDetailsModal from '@/components/ClientDetailsModal';

type SortBy = 'prestations' | 'revenue' | 'lastCollab';
type EmailTemplateType = 'vip_inactive' | 'regular_inactive' | 'gentle_reminder' | 'custom';

export default function CRMPage() {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedClientForEmail, setSelectedClientForEmail] = useState<Client | null>(null);
  const [emailTemplateType, setEmailTemplateType] = useState<EmailTemplateType>('vip_inactive');
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('prestations');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>('');

  // Filtres pour la liste complète
  const [showAllClients, setShowAllClients] = useState(false);
  const [filterVip, setFilterVip] = useState(true);
  const [filterActif, setFilterActif] = useState(true);
  const [filterEnVeille, setFilterEnVeille] = useState(true);
  const [filterARelancer, setFilterARelancer] = useState(true);

  // Filtres de clients
  const vipClients = clients.filter(c => c.segmentation?.vip);
  const activeClients = clients.filter(c => c.segmentation?.lifecycle === 'actif');
  const dormantClients = clients.filter(c => c.segmentation?.lifecycle === 'en_veille');
  const toReactivate = clients.filter(c => c.segmentation?.lifecycle === 'a_relancer');

  // Liste filtrée pour "Tous les clients"
  const getFilteredClients = () => {
    return clients.filter(client => {
      const isVip = client.segmentation?.vip;
      const lifecycle = client.segmentation?.lifecycle;

      if (isVip && filterVip) return true;
      if (!isVip && lifecycle === 'actif' && filterActif) return true;
      if (!isVip && lifecycle === 'en_veille' && filterEnVeille) return true;
      if (!isVip && lifecycle === 'a_relancer' && filterARelancer) return true;

      return false;
    });
  };

  // Stats globales
  const totalClients = clients.length;
  const totalRevenue = clients.reduce((sum, c) => sum + (c.stats?.totalRevenue || 0), 0);
  const totalPrestations = clients.reduce((sum, c) => sum + (c.stats?.totalPrestations || 0), 0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientsSnap, prestationsSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'prestations'))
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

      setClients(clientsData);
      setPrestations(prestationsData);
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
          const dateA = a.stats?.lastCollaborationAt?.getTime() || 0;
          const dateB = b.stats?.lastCollaborationAt?.getTime() || 0;
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
    if (days < 30) return `${days} jours`;
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} mois`;
    }
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return `${years} an${years > 1 ? 's' : ''} ${months > 0 ? `${months} mois` : ''}`;
  };

  const getReactivationPotential = (client: Client): number => {
    // Estimation du potentiel = CA historique / nombre d'années inactives
    const yearsInactive = (client.stats?.daysInactive || 0) / 365;
    if (yearsInactive === 0) return 0;
    return Math.round((client.stats?.totalRevenue || 0) / yearsInactive);
  };

  const getPriorityScore = (client: Client): number => {
    // Score de priorité pour le tri des clients à relancer
    let score = 0;
    if (client.segmentation?.vip) score += 1000;
    score += (client.stats?.totalPrestations || 0) * 10;
    score += (client.stats?.totalRevenue || 0) / 100;
    score -= (client.stats?.daysInactive || 0) * 0.1; // Moins de points si inactif depuis longtemps
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
    const vipInactive = clients.filter(c => c.segmentation?.vip && c.segmentation?.lifecycle === 'a_relancer');
    if (vipInactive.length === 0) {
      alert('Aucun client VIP inactif à relancer');
      return;
    }

    const confirmed = confirm(`Vous allez envoyer un email de relance à ${vipInactive.length} clients VIP inactifs. Continuer ?`);
    if (confirmed) {
      alert('Fonctionnalité d\'envoi en masse à implémenter avec votre service d\'email');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Link href="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Retour au tableau de bord">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">CRM - Gestion Clients</h1>
        </div>
        <p className="text-gray-600 mt-2">Vue d'ensemble et segmentation de votre portefeuille client</p>
      </div>

      {/* Import Section */}
      <div className="bg-white rounded-lg shadow p-6">
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
              className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
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
              className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
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
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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

      {/* Vue d'ensemble */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Vue d'ensemble</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-3xl font-bold">{totalClients}</div>
            <div className="text-purple-200">Clients totaux</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{vipClients.length}</div>
            <div className="text-purple-200">Clients VIP</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{activeClients.length}</div>
            <div className="text-purple-200">Actifs</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{toReactivate.length}</div>
            <div className="text-purple-200">À relancer</div>
          </div>
          <div className="col-span-2">
            <div className="text-3xl font-bold">{totalRevenue.toLocaleString('fr-FR')}€</div>
            <div className="text-purple-200">CA total historique</div>
          </div>
          <div className="col-span-2">
            <div className="text-3xl font-bold">{totalPrestations}</div>
            <div className="text-purple-200">Prestations réalisées</div>
          </div>
        </div>
      </div>

      {/* Top Clients VIP */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Top Clients VIP</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('prestations')}
                className={`px-3 py-1 rounded ${sortBy === 'prestations' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Prestations
              </button>
              <button
                onClick={() => setSortBy('revenue')}
                className={`px-3 py-1 rounded ${sortBy === 'revenue' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                CA
              </button>
              <button
                onClick={() => setSortBy('lastCollab')}
                className={`px-3 py-1 rounded ${sortBy === 'lastCollab' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}
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
                      className="text-lg font-bold text-gray-900 cursor-pointer hover:text-purple-600 transition-colors"
                    >
                      {client.name}
                    </h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                      VIP
                    </span>
                    {client.segmentation?.lifecycle === 'actif' && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                        Actif
                      </span>
                    )}
                    {client.segmentation?.lifecycle === 'en_veille' && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                        En veille
                      </span>
                    )}
                    {client.segmentation?.lifecycle === 'a_relancer' && (
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
                      className="cursor-pointer hover:bg-purple-50 px-2 py-1 rounded transition-colors"
                      title="Cliquez pour voir le détail des prestations"
                    >
                      <span className="font-semibold text-purple-600">{client.stats?.totalPrestations || 0}</span> prestations
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span> CA
                    </div>
                    <div>
                      Dernière collab: <span className="font-semibold text-gray-900">
                        {client.stats?.lastCollaborationAt?.toLocaleDateString('fr-FR') || 'N/A'}
                      </span> ({formatDaysInactive(client.stats?.daysInactive || 0)})
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-gray-800">
                    Tarifs: {(client.stats?.minAmount || 0).toLocaleString('fr-FR')}€ - {(client.stats?.maxAmount || 0).toLocaleString('fr-FR')}€
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEmailModal(client, client.segmentation?.lifecycle === 'a_relancer' ? 'vip_inactive' : 'gentle_reminder')}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Contacter
                  </button>
                  <button className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700">
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
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Clients à relancer</h2>
            <button
              onClick={handleSendEmailToAllVIPInactive}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Relancer tous les VIP inactifs
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {sortByPriority(toReactivate).map(client => (
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
                      className="text-lg font-bold text-gray-900 cursor-pointer hover:text-purple-600 transition-colors"
                    >
                      {client.name}
                    </h3>
                    {client.segmentation?.vip && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                        VIP
                      </span>
                    )}
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                      Inactif depuis {formatDaysInactive(client.stats?.daysInactive || 0)}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-6 text-sm text-gray-800">
                    <div>
                      Historique: <span className="font-semibold text-gray-900">{client.stats?.totalPrestations || 0}</span> prestations, <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span>
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-green-600 font-semibold">
                    Potentiel réactivation: ~{getReactivationPotential(client).toLocaleString('fr-FR')}€
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEmailModal(client, client.segmentation?.vip ? 'vip_inactive' : 'regular_inactive')}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    Relancer
                  </button>
                  <button className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">
                    Ajouter note
                  </button>
                </div>
              </div>
            </div>
          ))}
          {toReactivate.length === 0 && (
            <div className="text-center text-gray-700 py-8">
              Aucun client à relancer
            </div>
          )}
        </div>
      </div>

      {/* Clients en veille */}
      <div className="bg-white rounded-lg shadow">
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
                    Dernière collab: {client.stats?.lastCollaborationAt?.toLocaleDateString('fr-FR') || 'N/A'} ({formatDaysInactive(client.stats?.daysInactive || 0)})
                  </div>
                </div>
                <button
                  onClick={() => openEmailModal(client, 'gentle_reminder')}
                  className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
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

      {/* Tous les clients - Section repliable avec filtres */}
      <div className="bg-white rounded-lg shadow">
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
              const lifecycle = client.segmentation?.lifecycle;

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
                          className="text-lg font-bold text-gray-900 cursor-pointer hover:text-purple-600 transition-colors"
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
                          className="cursor-pointer hover:bg-purple-50 px-2 py-1 rounded transition-colors"
                        >
                          <span className="font-semibold text-purple-600">{client.stats?.totalPrestations || 0}</span> prestations
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900">{(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€</span> CA
                        </div>
                        <div>
                          Moy: <span className="font-semibold text-gray-900">{(client.stats?.averageAmount || 0).toLocaleString('fr-FR')}€</span>
                        </div>
                        <div>
                          Dernière: {client.stats?.lastCollaborationAt?.toLocaleDateString('fr-FR') || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEmailModal(client, lifecycle === 'a_relancer' ? (isVip ? 'vip_inactive' : 'regular_inactive') : 'gentle_reminder')}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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
  );
}
