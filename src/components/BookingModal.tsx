'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Client, Booking } from '@/types';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (booking: Partial<Booking>) => Promise<void>;
  booking?: Booking | null;
  selectedDate?: Date | null;
  clients: Client[];
  allBookings?: Booking[];
  onLinkAllBookings?: (clientId: string, clientName: string) => Promise<void>;
}

export default function BookingModal({ isOpen, onClose, onSave, booking, selectedDate, clients, allBookings = [], onLinkAllBookings }: BookingModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    clientId: '',
    clientName: '',
    displayName: '',
    start: '',
    end: '',
    location: '',
    notes: '',
    price: 0,
    deposit: 0,
    status: 'option' as 'option' | 'confirmé' | 'annulé' | 'terminé' | 'remplaçant',
  });
  const [linkAllSameTitle, setLinkAllSameTitle] = useState(false);

  useEffect(() => {
    if (booking) {
      // Mode édition
      setFormData({
        title: booking.title,
        clientId: booking.clientId || '',
        clientName: booking.clientName,
        displayName: booking.displayName || '',
        start: new Date(booking.start).toISOString().slice(0, 16),
        end: new Date(booking.end).toISOString().slice(0, 16),
        location: booking.location || '',
        notes: booking.notes || '',
        price: booking.price || 0,
        deposit: booking.deposit || 0,
        status: booking.status,
      });
    } else if (selectedDate) {
      // Mode création avec date présélectionnée
      const startDate = new Date(selectedDate);
      startDate.setHours(20, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(26, 0, 0, 0); // 02h00 le lendemain

      setFormData({
        title: '',
        clientId: '',
        clientName: '',
        displayName: '',
        start: startDate.toISOString().slice(0, 16),
        end: endDate.toISOString().slice(0, 16),
        location: '',
        notes: '',
        price: 0,
        deposit: 0,
        status: 'confirmé',
      });
    }
  }, [booking, selectedDate]);

  const handleClientChange = (newClientId: string) => {
    const selectedClient = clients.find(c => c.id === newClientId);
    setFormData({ ...formData, clientId: newClientId });
  };

  const handleLinkAll = async () => {
    if (onLinkAllBookings) {
      await onLinkAllBookings(linkInfo.clientId, linkInfo.clientName);
    }
    setShowLinkPrompt(false);
  };

  const handlePriceChange = (newPrice: number) => {
    setFormData({ ...formData, price: newPrice });
  };

  const handleApplyPriceToAll = async () => {
    // Cette fonction n'est plus utilisée, on peut la supprimer
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Lier tous les événements avec le même titre au client si la case est cochée
    if (linkAllSameTitle && formData.clientId && (formData.displayName || booking?.displayName)) {
      const targetDisplayName = formData.displayName || booking?.displayName;
      const matchingBookings = allBookings.filter(b => 
        b.displayName === targetDisplayName && 
        !b.clientId &&
        b.id !== booking?.id
      );
      
      if (matchingBookings.length > 0) {
        const { updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        const updates = matchingBookings.map(b =>
          updateDoc(doc(db, 'bookings', b.id), {
            clientId: formData.clientId,
            updatedAt: new Date(),
          })
        );
        
        await Promise.all(updates);
        console.log(`${matchingBookings.length} événements liés au client`);
      }
    }

    // Appliquer le prix à tous les événements du client si la case est cochée
    if (applyPriceToAll && formData.clientId && formData.price > 0) {
      const matchingBookings = allBookings.filter(b => 
        b.clientId === formData.clientId && 
        b.id !== booking?.id
      );
      
      if (matchingBookings.length > 0) {
        const { updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        const updates = matchingBookings.map(b =>
          updateDoc(doc(db, 'bookings', b.id), {
            price: formData.price,
            updatedAt: new Date(),
          })
        );
        
        await Promise.all(updates);
      }
    }

    // Sauvegarder le booking actuel
    await saveBooking();
  };

  const saveBooking = async () => {
    const selectedClient = clients.find(c => c.id === formData.clientId);

    await onSave({
      ...booking,
      title: formData.title,
      clientId: formData.clientId || undefined,
      clientName: selectedClient?.name || formData.clientName,
      displayName: formData.displayName || undefined,
      start: new Date(formData.start),
      end: new Date(formData.end),
      location: formData.location,
      notes: formData.notes,
      price: formData.price,
      deposit: formData.deposit,
      status: formData.status,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {booking ? 'Modifier la réservation' : 'Nouvelle réservation'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titre de l'événement
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client existant
              </label>
              <select
                value={formData.clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
              >
                <option value="">Sélectionner un client</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {formData.clientId && (formData.displayName || booking?.displayName) && (
                <label className="flex items-center gap-2 mt-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkAllSameTitle}
                    onChange={(e) => setLinkAllSameTitle(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <span>Lier tous les "{formData.displayName || booking?.displayName}" à ce client</span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ou nom du client
              </label>
              <input
                type="text"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                disabled={!!formData.clientId}
                placeholder="Nom du client"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de la mission (optionnel)
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
              placeholder="Ex: PAUC Handball, Mariage Jean..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Si rempli, ce nom s'affichera sur l'agenda au lieu du nom du client. Le client reste correct pour la facturation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date et heure de début
              </label>
              <input
                type="datetime-local"
                value={formData.start}
                onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date et heure de fin
              </label>
              <input
                type="datetime-local"
                value={formData.end}
                onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lieu
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
              placeholder="Adresse du lieu"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
              rows={3}
              placeholder="Notes supplémentaires..."
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix (€)
              </label>
              <input
                type="number"
                value={formData.price || ''}
                onChange={(e) => handlePriceChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                min="0"
                placeholder="0"
              />
              {formData.clientId && (
                <label className="flex items-center gap-2 mt-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyPriceToAll}
                    onChange={(e) => setApplyPriceToAll(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <span>Appliquer à toutes les prestas de ce client</span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Acompte (€)
              </label>
              <input
                type="number"
                value={formData.deposit || ''}
                onChange={(e) => setFormData({ ...formData, deposit: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                min="0"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Statut
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
              >
                <option value="option">Option</option>
                <option value="confirmé">Confirmé</option>
                <option value="remplaçant">Remplaçant</option>
                <option value="annulé">Annulé</option>
                <option value="terminé">Terminé</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              {booking ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
