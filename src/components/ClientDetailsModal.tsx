'use client';

import { useState, useEffect } from 'react';
import { Client, Prestation } from '@/types';
import { X, Calendar, Euro, TrendingUp, FileText, Trash2, ArrowRight, Edit2, Save } from 'lucide-react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onPrestationDeleted?: () => void;
}

export default function ClientDetailsModal({ isOpen, onClose, client, onPrestationDeleted }: ClientDetailsModalProps) {
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [editingPrestationId, setEditingPrestationId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    amount: '',
    description: '',
    reference: '',
    invoiceNumber: ''
  });
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [prestationToTransfer, setPrestationToTransfer] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (isOpen && client) {
      loadPrestations();
      loadClients();
    }
  }, [isOpen, client]);

  const loadPrestations = async () => {
    if (!client) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, 'prestations'),
        where('clientId', '==', client.id)
      );
      const prestationsSnap = await getDocs(q);
      const prestationsData = prestationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as Prestation[];

      setPrestations(prestationsData);
    } catch (error) {
      console.error('Erreur chargement prestations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const clientsSnap = await getDocs(collection(db, 'clients'));
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

      setAllClients(clientsData.filter(c => c.id !== client?.id).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  const handleDeletePrestation = async (prestationId: string) => {
    const confirmed = confirm('Êtes-vous sûr de vouloir supprimer cette prestation ? Cette action est irréversible.');
    if (!confirmed) return;

    setDeleting(prestationId);
    try {
      await deleteDoc(doc(db, 'prestations', prestationId));

      // Recharger les prestations
      await loadPrestations();

      // Notifier le parent pour recalculer les stats
      if (onPrestationDeleted) {
        onPrestationDeleted();
      }

      alert('Prestation supprimée avec succès !');
    } catch (error) {
      console.error('Erreur suppression prestation:', error);
      alert('Erreur lors de la suppression de la prestation');
    } finally {
      setDeleting(null);
    }
  };

  const handleTransferPrestation = async (prestationId: string) => {
    if (allClients.length === 0) {
      alert('Aucun autre client disponible pour le transfert');
      return;
    }

    setPrestationToTransfer(prestationId);
    setShowTransferModal(true);
    setSearchQuery('');
  };

  const confirmTransfer = async (targetClient: Client) => {
    if (!prestationToTransfer) return;

    const confirmed = confirm(`Confirmer le transfert vers "${targetClient.name}" ?`);
    if (!confirmed) return;

    setTransferring(prestationToTransfer);
    setShowTransferModal(false);

    try {
      // 1. Transférer la prestation dans Firestore
      await updateDoc(doc(db, 'prestations', prestationToTransfer), {
        clientId: targetClient.id,
        clientName: targetClient.name,
        updatedAt: new Date()
      });

      // 2. Recharger les prestations du modal
      await loadPrestations();

      // 3. IMPORTANT: Recalculer les stats pour les deux clients (source et destination)
      setRecalculating(true);
      if (onPrestationDeleted) {
        await onPrestationDeleted();
      }
      setRecalculating(false);

      alert(`✅ Prestation transférée vers "${targetClient.name}" avec succès !\n\n📊 Les statistiques (CA, tarifs moyens, nombre de prestations) ont été recalculées.`);
    } catch (error) {
      console.error('Erreur transfert prestation:', error);
      alert('❌ Erreur lors du transfert de la prestation');
      setRecalculating(false);
    } finally {
      setTransferring(null);
      setPrestationToTransfer(null);
    }
  };

  const handleStartEdit = (prestation: Prestation) => {
    setEditingPrestationId(prestation.id);
    setEditForm({
      date: prestation.date.toISOString().split('T')[0],
      amount: prestation.amount.toString(),
      description: prestation.description || '',
      reference: prestation.reference || '',
      invoiceNumber: prestation.invoiceNumber || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingPrestationId(null);
    setEditForm({
      date: '',
      amount: '',
      description: '',
      reference: '',
      invoiceNumber: ''
    });
  };

  const handleSaveEdit = async (prestationId: string) => {
    try {
      const updatedData: any = {
        date: new Date(editForm.date),
        amount: parseFloat(editForm.amount),
        description: editForm.description.trim() || null,
        reference: editForm.reference.trim() || null,
        invoiceNumber: editForm.invoiceNumber.trim() || null,
        updatedAt: new Date()
      };

      await updateDoc(doc(db, 'prestations', prestationId), updatedData);

      // Recharger les prestations
      await loadPrestations();

      // Recalculer les stats du client
      setRecalculating(true);
      if (onPrestationDeleted) {
        await onPrestationDeleted();
      }
      setRecalculating(false);

      setEditingPrestationId(null);
      setEditForm({
        date: '',
        amount: '',
        description: '',
        reference: '',
        invoiceNumber: ''
      });

      alert('✅ Prestation modifiée avec succès !\n\n📊 Les statistiques ont été recalculées.');
    } catch (error) {
      console.error('Erreur modification prestation:', error);
      alert('❌ Erreur lors de la modification de la prestation');
      setRecalculating(false);
    }
  };

  const sortedPrestations = [...prestations].sort((a, b) => {
    if (sortBy === 'date') {
      return b.date.getTime() - a.date.getTime();
    } else {
      return b.amount - a.amount;
    }
  });

  const filteredClients = allClients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const getLifecycleBadge = () => {
    if (!client?.segmentation) return null;

    const badges = {
      actif: { label: 'Actif', color: 'bg-green-100 text-green-800' },
      en_veille: { label: 'En veille', color: 'bg-orange-100 text-orange-800' },
      a_relancer: { label: 'À relancer', color: 'bg-red-100 text-red-800' }
    };

    const badge = badges[client.segmentation.lifecycle];
    return (
      <span className={`px-2 py-1 ${badge.color} text-xs font-semibold rounded`}>
        {badge.label}
      </span>
    );
  };

  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: client.color || '#3B82F6' }}
                />
                <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
                {client.segmentation?.vip && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
                    VIP
                  </span>
                )}
                {getLifecycleBadge()}
              </div>
              {client.address && (
                <p className="text-sm text-gray-800">{client.address}</p>
              )}
              {client.notes && (
                <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-yellow-800 mb-1">📝 Notes:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-800 mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Prestations</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {client.stats?.totalPrestations || 0}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-800 mb-1">
                <Euro className="w-4 h-4" />
                <span className="text-sm">CA Total</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-800 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Tarif moyen</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {(client.stats?.averageAmount || 0).toLocaleString('fr-FR')}€
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-800 mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Inactivité</span>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {formatDaysInactive(client.stats?.daysInactive || 0)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-800">Première collaboration:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {client.stats?.firstCollaborationAt
                  ? (client.stats.firstCollaborationAt instanceof Date
                      ? client.stats.firstCollaborationAt.toLocaleDateString('fr-FR')
                      : (client.stats.firstCollaborationAt as any).toDate?.()?.toLocaleDateString('fr-FR') || 'N/A')
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-gray-800">Dernière collaboration:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {client.stats?.lastCollaborationAt
                  ? (client.stats.lastCollaborationAt instanceof Date
                      ? client.stats.lastCollaborationAt.toLocaleDateString('fr-FR')
                      : (client.stats.lastCollaborationAt as any).toDate?.()?.toLocaleDateString('fr-FR') || 'N/A')
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-gray-800">Tarif minimum:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {(client.stats?.minAmount || 0).toLocaleString('fr-FR')}€
              </span>
            </div>
            <div>
              <span className="text-gray-800">Tarif maximum:</span>
              <span className="ml-2 font-semibold text-gray-900">
                {(client.stats?.maxAmount || 0).toLocaleString('fr-FR')}€
              </span>
            </div>
          </div>
        </div>

        {/* Prestations List */}
        <div className="flex-1 overflow-y-auto p-6">
          {recalculating && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-blue-800 text-sm font-medium">Recalcul des statistiques en cours...</span>
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              Historique des prestations ({prestations.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('date')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'date'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Par date
              </button>
              <button
                onClick={() => setSortBy('amount')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'amount'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Par montant
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-700 mt-2">Chargement...</p>
            </div>
          ) : prestations.length === 0 ? (
            <div className="text-center py-8 text-gray-700">
              Aucune prestation trouvée
            </div>
          ) : (
            <div className="space-y-3">
              {sortedPrestations.map((prestation) => (
                <div
                  key={prestation.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {editingPrestationId === prestation.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                          <input
                            type="date"
                            value={editForm.date}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Montant (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="Description de la prestation"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Référence</label>
                          <input
                            type="text"
                            value={editForm.reference}
                            onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Référence"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Numéro de facture</label>
                          <input
                            type="text"
                            value={editForm.invoiceNumber}
                            onChange={(e) => setEditForm({ ...editForm, invoiceNumber: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Numéro de facture"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleSaveEdit(prestation.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">
                            {prestation.date.toLocaleDateString('fr-FR', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </span>
                          {prestation.invoiceNumber && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                              {prestation.invoiceNumber}
                            </span>
                          )}
                        </div>
                        {prestation.description && (
                          <p className="text-sm text-gray-800 mt-1">
                            {prestation.description}
                          </p>
                        )}
                        {prestation.reference && (
                          <p className="text-xs text-gray-800 mt-1">
                            Réf: {prestation.reference}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <div className="text-xl font-bold text-green-600">
                          {prestation.amount.toLocaleString('fr-FR')}€
                        </div>
                        {prestation.source === 'csv' && (
                          <span className="text-xs text-gray-600">Importé CSV</span>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleStartEdit(prestation)}
                            disabled={transferring === prestation.id || deleting === prestation.id}
                            className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors disabled:opacity-50 text-xs"
                            title="Modifier cette prestation"
                          >
                            <Edit2 className="w-3 h-3" />
                            Modifier
                          </button>
                          <button
                            onClick={() => handleTransferPrestation(prestation.id)}
                            disabled={transferring === prestation.id || deleting === prestation.id || editingPrestationId === prestation.id}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors disabled:opacity-50 text-xs"
                            title="Transférer vers un autre client"
                          >
                            <ArrowRight className="w-3 h-3" />
                            {transferring === prestation.id ? 'Transfert...' : 'Transférer'}
                          </button>
                          <button
                            onClick={() => handleDeletePrestation(prestation.id)}
                            disabled={deleting === prestation.id || transferring === prestation.id || editingPrestationId === prestation.id}
                            className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors disabled:opacity-50 text-xs"
                            title="Supprimer cette prestation"
                          >
                            <Trash2 className="w-3 h-3" />
                            {deleting === prestation.id ? 'Suppression...' : 'Supprimer'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Modal de transfert */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col m-4">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-purple-600">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Transférer la prestation</h3>
                <button
                  onClick={() => {
                    setShowTransferModal(false);
                    setPrestationToTransfer(null);
                  }}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-gray-200">
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-gray-700">
                    Aucun client trouvé
                  </div>
                ) : (
                  filteredClients.map((targetClient) => (
                    <button
                      key={targetClient.id}
                      onClick={() => confirmTransfer(targetClient)}
                      disabled={transferring === prestationToTransfer}
                      className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: targetClient.color || '#3B82F6' }}
                            />
                            <span className="font-semibold text-gray-900">
                              {targetClient.name}
                            </span>
                            {targetClient.segmentation?.vip && (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                                VIP
                              </span>
                            )}
                          </div>
                          {targetClient.address && (
                            <p className="text-sm text-gray-800 mt-1">{targetClient.address}</p>
                          )}
                          <div className="flex gap-4 text-xs text-gray-800 mt-1">
                            <span>{targetClient.stats?.totalPrestations || 0} prestations</span>
                            <span>{(targetClient.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€ CA</span>
                            <span>Moy: {(targetClient.stats?.averageAmount || 0).toLocaleString('fr-FR')}€</span>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-purple-600" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setPrestationToTransfer(null);
                }}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
