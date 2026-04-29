'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Client } from '@/types';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { WebNav } from '@/components/web/WebNav';
import { usePostalCodeLookup } from '@/hooks/usePostalCodeLookup';

export default function WebClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    primaryEmail: '',
    altEmails: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    siret: '',
    notes: '',
    color: '#3B82F6',
    profileImageUrl: '',
  });
  const [searchQuery, setSearchQuery] = useState('');

  const lookupClientCity = usePostalCodeLookup((city) => setFormData(prev => ({ ...prev, city })));

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
        email: primaryEmail,
        primaryEmail,
        altEmails,
        normalizedEmails,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      } as Client;
    });

    clientsData.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    setClients(clientsData);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const primaryEmail = formData.primaryEmail ? normalizeEmailValue(formData.primaryEmail) : null;
    const altEmails = parseEmails(formData.altEmails);
    const normalizedEmails = Array.from(new Set([...(primaryEmail ? [primaryEmail] : []), ...altEmails]));

    const payload: Record<string, unknown> = {
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      postalCode: formData.postalCode,
      city: formData.city,
      siret: formData.siret,
      notes: formData.notes,
      color: formData.color,
      profileImageUrl: formData.profileImageUrl || null,
      email: primaryEmail,
      primaryEmail,
      altEmails,
      normalizedEmails,
      updatedAt: now,
    };

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
      color: client.color || '#3B82F6',
      profileImageUrl: client.profileImageUrl || '',
    });
    setShowForm(true);
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
      color: '#3B82F6',
      profileImageUrl: '',
    });
    setEditing(null);
    setShowForm(false);
  };

  const filteredClients = clients.filter(client => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(q) ||
      (client.primaryEmail || '').toLowerCase().includes(q) ||
      (client.phone || '').includes(q) ||
      (client.address || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA] overflow-x-hidden">
      <WebNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Clients</h1>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouveau client
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full text-gray-900 bg-white shadow-sm"
          />
        </div>

        {/* Form */}
        {showForm && (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-sm p-6 border border-[#F2F2F7] mb-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editing ? 'Modifier le client' : 'Nouveau client'}
              </h2>
              <button type="button" onClick={resetForm} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="Nom du client / établissement"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email principal</label>
                <input
                  type="email"
                  value={formData.primaryEmail}
                  onChange={(e) => setFormData({ ...formData, primaryEmail: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="email@exemple.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SIRET</label>
                <input
                  type="text"
                  value={formData.siret}
                  onChange={(e) => setFormData({ ...formData, siret: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="123 456 789 00012"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Adresse</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="123 Rue de la Musique"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Code postal</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => { setFormData({ ...formData, postalCode: e.target.value }); lookupClientCity(e.target.value); }}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="13001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ville</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  placeholder="Marseille"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Emails secondaires</label>
                <textarea
                  value={formData.altEmails}
                  onChange={(e) => setFormData({ ...formData, altEmails: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  rows={2}
                  placeholder="Un email par ligne"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                  rows={2}
                  placeholder="Notes..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Couleur</label>
                <div className="flex gap-2 flex-wrap">
                  {colors.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === c.value ? 'border-gray-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Save className="w-4 h-4" />
                {editing ? 'Modifier' : 'Créer'}
              </button>
              <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300">
                Annuler
              </button>
            </div>
          </form>
        )}

        {/* Client list */}
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">Aucun client trouvé</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-4 hover:shadow-md transition-shadow"
                style={{ borderLeft: `4px solid ${client.color || '#3B82F6'}` }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-gray-900 text-lg">{client.name}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(client)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                {(client.primaryEmail || client.email) && (
                  <p className="text-sm text-gray-600 truncate">{client.primaryEmail || client.email}</p>
                )}
                {client.phone && (
                  <p className="text-sm text-gray-600">{client.phone}</p>
                )}
                {client.address && (
                  <p className="text-sm text-gray-500 truncate mt-1">{client.address}</p>
                )}
                {client.notes && (
                  <p className="text-xs text-gray-400 mt-2 truncate">{client.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
