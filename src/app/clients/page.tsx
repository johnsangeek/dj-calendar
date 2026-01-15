'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Client } from '@/types';
import { Plus, Edit2, Trash2, Save, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    siret: '',
    notes: '',
    color: '#3B82F6'
  });

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

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const snapshot = await getDocs(collection(db, 'clients'));
    const clientsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate()
    })) as Client[];
    setClients(clientsData);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    
    if (editing) {
      await updateDoc(doc(db, 'clients', editing), {
        ...formData,
        updatedAt: now
      });
    } else {
      await addDoc(collection(db, 'clients'), {
        ...formData,
        createdAt: now,
        updatedAt: now
      });
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
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      siret: client.siret || '',
      notes: client.notes || '',
      color: client.color || '#3B82F6'
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', address: '', siret: '', notes: '', color: '#3B82F6' });
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
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
            <div key={client.id} className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderLeftColor: client.color || '#3B82F6' }}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: client.color || '#3B82F6' }}
                  ></div>
                  <h3 className="text-xl font-semibold text-gray-900">{client.name}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(client)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              {client.email && <p className="text-gray-800">📧 {client.email}</p>}
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
    </div>
  );
}
