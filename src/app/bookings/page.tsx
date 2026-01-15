'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Client, Booking } from '@/types';
import { Plus, Edit2, Trash2, Calendar as CalendarIcon, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const STATUS_COLORS = {
  'option': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'confirmé': 'bg-green-100 text-green-800 border-green-300',
  'annulé': 'bg-red-100 text-red-800 border-red-300',
  'terminé': 'bg-gray-100 text-gray-800 border-gray-300'
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    clientId: '',
    start: '',
    end: '',
    price: 0,
    deposit: 0,
    status: 'option' as 'option' | 'confirmé' | 'annulé' | 'terminé',
    location: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [bookingsSnap, clientsSnap] = await Promise.all([
      getDocs(collection(db, 'bookings')),
      getDocs(collection(db, 'clients'))
    ]);

    const bookingsData = bookingsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      start: doc.data().start?.toDate(),
      end: doc.data().end?.toDate()
    })) as Booking[];
    
    setBookings(bookingsData.sort((a, b) => a.start.getTime() - b.start.getTime()));
    setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bookingData = {
      ...formData,
      start: new Date(formData.start),
      end: new Date(formData.end),
      price: Number(formData.price),
      deposit: Number(formData.deposit),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (editing) {
      await updateDoc(doc(db, 'bookings', editing), bookingData);
    } else {
      await addDoc(collection(db, 'bookings'), bookingData);
    }

    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer ce booking ?')) {
      await deleteDoc(doc(db, 'bookings', id));
      loadData();
    }
  };

  const startEdit = (booking: Booking) => {
    setEditing(booking.id);
    setFormData({
      title: booking.title,
      clientId: booking.clientId || '',
      start: booking.start.toISOString().slice(0, 16),
      end: booking.end.toISOString().slice(0, 16),
      price: booking.price,
      deposit: booking.deposit,
      status: booking.status,
      location: booking.location || '',
      notes: booking.notes || ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      clientId: '',
      start: '',
      end: '',
      price: 0,
      deposit: 0,
      status: 'option',
      location: '',
      notes: ''
    });
    setEditing(null);
    setShowForm(false);
  };

  const groupByMonth = () => {
    const grouped: { [key: string]: Booking[] } = {};
    bookings.forEach(booking => {
      const key = booking.start.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(booking);
    });
    return grouped;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Retour au tableau de bord">
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">📅 Bookings</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            <Plus size={20} />
            {showForm ? 'Annuler' : 'Nouveau booking'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Titre *"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />
              
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              >
                <option value="">Sélectionner un client</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={formData.start}
                onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <input
                type="datetime-local"
                value={formData.end}
                onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <input
                type="number"
                placeholder="Prix (€)"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <input
                type="number"
                placeholder="Acompte (€)"
                value={formData.deposit}
                onChange={(e) => setFormData({ ...formData, deposit: Number(e.target.value) })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              >
                <option value="option">Option</option>
                <option value="confirmé">Confirmé</option>
                <option value="annulé">Annulé</option>
                <option value="terminé">Terminé</option>
              </select>

              <input
                type="text"
                placeholder="Lieu"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              />
            </div>

            <textarea
              placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4 text-gray-900"
              rows={3}
            />

            <button
              type="submit"
              className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </form>
        )}

        <div className="space-y-8">
          {Object.entries(groupByMonth()).map(([month, monthBookings]) => (
            <div key={month}>
              <h2 className="text-2xl font-bold mb-4 text-purple-600">{month}</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {monthBookings.map((booking) => {
                  const client = clients.find(c => c.id === booking.clientId);
                  return (
                    <div key={booking.id} className="bg-white rounded-lg shadow-md p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-gray-900">{booking.title}</h3>
                          {client && <p className="text-gray-800 text-sm font-medium">{client.name}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(booking)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(booking.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border-2 mb-3 ${STATUS_COLORS[booking.status]}`}>
                        {booking.status}
                      </div>

                      <p className="text-gray-900 font-medium mb-2">
                        📅 {booking.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-gray-800 text-sm mb-2">
                        🕐 {booking.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - {booking.end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {booking.location && <p className="text-gray-800 text-sm mb-2">📍 {booking.location}</p>}
                      <p className="text-lg font-bold text-green-600 mt-3">
                        💰 {booking.price}€ {booking.deposit > 0 && <span className="text-sm text-gray-800">(acompte: {booking.deposit}€)</span>}
                      </p>
                      {booking.notes && <p className="text-gray-700 text-sm mt-2 italic">{booking.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {bookings.length === 0 && (
          <div className="text-center py-12 text-gray-700">
            <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p>Aucun booking. Clique sur "Nouveau booking" pour commencer !</p>
          </div>
        )}
      </div>
    </div>
  );
}
