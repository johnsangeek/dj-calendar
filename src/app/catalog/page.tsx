'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Search,
  Tag,
  Edit2,
  Trash2,
  Check,
  X,
  Package,
  Music,
  Clock,
  Calendar,
  Euro,
} from 'lucide-react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { CatalogService, ServiceUnit } from '@/types';

const unitLabels: Record<ServiceUnit, string> = {
  prestation: 'Prestation',
  heure: 'Heure',
  jour: 'Jour',
  forfait: 'Forfait',
  pack: 'Pack',
};

const unitIcons: Record<ServiceUnit, typeof Music> = {
  prestation: Music,
  heure: Clock,
  jour: Calendar,
  forfait: Package,
  pack: Package,
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);

const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

const defaultService: Omit<CatalogService, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  unit: 'prestation',
  defaultQty: 1,
  unitPrice: 0,
  vatRate: 0,
  tags: [],
  isActive: true,
};

export default function CatalogPage() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<CatalogService | null>(null);
  const [formData, setFormData] = useState(defaultService);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    setLoading(true);
    try {
      const servicesRef = collection(db, 'services');
      const q = query(servicesRef, orderBy('name'));
      const snapshot = await getDocs(q);

      const servicesData = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          lastUsedAt: toDate(data.lastUsedAt),
          createdAt: toDate(data.createdAt) || new Date(),
          updatedAt: toDate(data.updatedAt) || new Date(),
        } as CatalogService;
      });

      setServices(servicesData);
    } catch (error) {
      console.error('Erreur chargement catalogue:', error);
    } finally {
      setLoading(false);
    }
  };

  const allTags = [...new Set(services.flatMap((s) => s.tags))].sort();

  const filteredServices = services.filter((service) => {
    if (!service.isActive) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !service.name.toLowerCase().includes(search) &&
        !service.description?.toLowerCase().includes(search) &&
        !service.tags.some((t) => t.toLowerCase().includes(search))
      ) {
        return false;
      }
    }
    if (filterTag && !service.tags.includes(filterTag)) {
      return false;
    }
    return true;
  });

  const handleEdit = (service: CatalogService) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || '',
      unit: service.unit,
      defaultQty: service.defaultQty,
      unitPrice: service.unitPrice,
      vatRate: service.vatRate,
      tags: service.tags,
      isActive: service.isActive,
    });
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingService(null);
    setFormData(defaultService);
    setShowForm(true);
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      const now = new Date();
      const payload = {
        ...formData,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        updatedAt: now,
      };

      if (editingService) {
        await updateDoc(doc(db, 'services', editingService.id), payload);
      } else {
        await addDoc(collection(db, 'services'), {
          ...payload,
          createdAt: now,
        });
      }

      await loadServices();
      setShowForm(false);
      setEditingService(null);
      setFormData(defaultService);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (service: CatalogService) => {
    if (!confirm(`Supprimer "${service.name}" du catalogue ?`)) return;

    try {
      await deleteDoc(doc(db, 'services', service.id));
      await loadServices();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Retour au tableau de bord"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Catalogue</h1>
              <p className="text-sm text-gray-600">
                Gérez vos prestations et services réutilisables
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href="/catalog/packages"
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              <Package className="w-5 h-5" />
              Packs
            </Link>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Nouvelle prestation
            </button>
          </div>
        </div>

        {/* Recherche et filtres */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher une prestation..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterTag(null)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  !filterTag
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    filterTag === tag
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Formulaire */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {editingService ? 'Modifier la prestation' : 'Nouvelle prestation'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingService(null);
                  setFormData(defaultService);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de la prestation *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Animation DJ – Match handball"
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ex: Warm-up + timeouts + aftermatch, 3h"
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unité</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value as ServiceUnit })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  >
                    {Object.entries(unitLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantité par défaut
                  </label>
                  <input
                    type="number"
                    value={formData.defaultQty}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultQty: parseInt(e.target.value) || 1 })
                    }
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prix unitaire (€)
                  </label>
                  <input
                    type="number"
                    value={formData.unitPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })
                    }
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Taux TVA (%)
                  </label>
                  <input
                    type="number"
                    value={formData.vatRate}
                    onChange={(e) =>
                      setFormData({ ...formData, vatRate: parseFloat(e.target.value) || 0 })
                    }
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">0 si micro-entrepreneur (TVA non applicable)</p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Ajouter un tag..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 hover:text-indigo-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingService(null);
                    setFormData(defaultService);
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name.trim()}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Enregistrement...' : editingService ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste des services */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              Prestations ({filteredServices.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Chargement...</div>
          ) : filteredServices.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">
                {searchTerm || filterTag
                  ? 'Aucune prestation trouvée'
                  : 'Aucune prestation dans le catalogue'}
              </p>
              {!searchTerm && !filterTag && (
                <button
                  onClick={handleCreate}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Créer votre première prestation
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredServices.map((service) => {
                const UnitIcon = unitIcons[service.unit];
                return (
                  <div
                    key={service.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <UnitIcon className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{service.name}</h3>
                            {service.description && (
                              <p className="text-sm text-gray-600">{service.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="flex items-center gap-1.5 text-gray-600">
                            <Euro className="w-4 h-4" />
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(service.unitPrice)}
                            </span>
                            <span className="text-gray-500">/ {unitLabels[service.unit].toLowerCase()}</span>
                          </span>
                          {service.vatRate > 0 && (
                            <span className="text-gray-500">TVA {service.vatRate}%</span>
                          )}
                          {service.tags.length > 0 && (
                            <div className="flex gap-1">
                              {service.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(service)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(service)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
