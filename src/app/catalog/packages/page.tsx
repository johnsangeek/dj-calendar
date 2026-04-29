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
  Euro,
  Layers,
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
import { CatalogService, ServicePackage, PackageLine } from '@/types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);

const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

const defaultPackage: Omit<ServicePackage, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: '',
  lines: [],
  tags: [],
  isActive: true,
};

export default function PackagesPage() {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);
  const [formData, setFormData] = useState(defaultPackage);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [packagesSnap, servicesSnap] = await Promise.all([
        getDocs(query(collection(db, 'packages'), orderBy('name'))),
        getDocs(query(collection(db, 'services'), orderBy('name'))),
      ]);

      const packagesData = packagesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          lastUsedAt: toDate(data.lastUsedAt),
          createdAt: toDate(data.createdAt) || new Date(),
          updatedAt: toDate(data.updatedAt) || new Date(),
        } as ServicePackage;
      });

      const servicesData = servicesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          lastUsedAt: toDate(data.lastUsedAt),
          createdAt: toDate(data.createdAt) || new Date(),
          updatedAt: toDate(data.updatedAt) || new Date(),
        } as CatalogService;
      });

      setPackages(packagesData);
      setServices(servicesData.filter((s) => s.isActive));
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const allTags = [...new Set(packages.flatMap((p) => p.tags))].sort();

  const filteredPackages = packages.filter((pkg) => {
    if (!pkg.isActive) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !pkg.name.toLowerCase().includes(search) &&
        !pkg.description?.toLowerCase().includes(search) &&
        !pkg.tags.some((t) => t.toLowerCase().includes(search))
      ) {
        return false;
      }
    }
    if (filterTag && !pkg.tags.includes(filterTag)) {
      return false;
    }
    return true;
  });

  const calculatePackageTotal = (lines: PackageLine[]) => {
    return lines.reduce((total, line) => {
      const service = services.find((s) => s.id === line.serviceId);
      const price = line.overridePrice ?? service?.unitPrice ?? 0;
      return total + price * line.qty;
    }, 0);
  };

  const handleEdit = (pkg: ServicePackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      lines: pkg.lines,
      tags: pkg.tags,
      isActive: pkg.isActive,
    });
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingPackage(null);
    setFormData(defaultPackage);
    setShowForm(true);
  };

  const handleAddService = () => {
    if (!selectedServiceId) return;
    const service = services.find((s) => s.id === selectedServiceId);
    if (!service) return;

    // Check si déjà dans le pack
    if (formData.lines.some((l) => l.serviceId === selectedServiceId)) {
      alert('Cette prestation est déjà dans le pack');
      return;
    }

    const newLine: PackageLine = {
      serviceId: service.id,
      serviceName: service.name,
      qty: service.defaultQty,
    };

    setFormData({ ...formData, lines: [...formData.lines, newLine] });
    setSelectedServiceId('');
  };

  const handleUpdateLine = (index: number, updates: Partial<PackageLine>) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], ...updates };
    setFormData({ ...formData, lines: newLines });
  };

  const handleRemoveLine = (index: number) => {
    setFormData({ ...formData, lines: formData.lines.filter((_, i) => i !== index) });
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
    if (!formData.name.trim() || formData.lines.length === 0) return;

    setSaving(true);
    try {
      const now = new Date();
      const payload = {
        ...formData,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        updatedAt: now,
      };

      if (editingPackage) {
        await updateDoc(doc(db, 'packages', editingPackage.id), payload);
      } else {
        await addDoc(collection(db, 'packages'), {
          ...payload,
          createdAt: now,
        });
      }

      await loadData();
      setShowForm(false);
      setEditingPackage(null);
      setFormData(defaultPackage);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pkg: ServicePackage) => {
    if (!confirm(`Supprimer le pack "${pkg.name}" ?`)) return;

    try {
      await deleteDoc(doc(db, 'packages', pkg.id));
      await loadData();
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
              href="/catalog"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Retour au catalogue"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Packs</h1>
              <p className="text-sm text-gray-600">
                Groupez vos prestations en packs réutilisables
              </p>
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            Nouveau pack
          </button>
        </div>

        {/* Recherche et filtres */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un pack..."
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
                {editingPackage ? 'Modifier le pack' : 'Nouveau pack'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingPackage(null);
                  setFormData(defaultPackage);
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
                    Nom du pack *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Pack Mariage – Standard"
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
                    placeholder="Ex: Pack complet pour mariage avec sono, éclairage et DJ"
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 resize-none"
                  />
                </div>
              </div>

              {/* Ajout de prestations */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prestations incluses *
                </label>

                {services.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      Aucune prestation dans le catalogue.{' '}
                      <Link href="/catalog" className="underline font-medium">
                        Créez d'abord des prestations
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2 mb-4">
                    <select
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    >
                      <option value="">Sélectionner une prestation...</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} – {formatCurrency(service.unitPrice)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddService}
                      disabled={!selectedServiceId}
                      className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Liste des lignes */}
                {formData.lines.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Prestation
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase w-24">
                            Qté
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                            Prix
                          </th>
                          <th className="px-4 py-2 w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {formData.lines.map((line, index) => {
                          const service = services.find((s) => s.id === line.serviceId);
                          const price = line.overridePrice ?? service?.unitPrice ?? 0;
                          return (
                            <tr key={index}>
                              <td className="px-4 py-3">
                                <span className="font-medium text-gray-900">{line.serviceName}</span>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={line.qty}
                                  onChange={(e) =>
                                    handleUpdateLine(index, { qty: parseInt(e.target.value) || 1 })
                                  }
                                  min="1"
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-center text-gray-900"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={line.overridePrice ?? service?.unitPrice ?? 0}
                                  onChange={(e) =>
                                    handleUpdateLine(index, {
                                      overridePrice: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  min="0"
                                  step="0.01"
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-right text-gray-900"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(index)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={2} className="px-4 py-3 text-right font-medium text-gray-700">
                            Total du pack :
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-indigo-600">
                            {formatCurrency(calculatePackageTotal(formData.lines))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
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

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPackage(null);
                    setFormData(defaultPackage);
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name.trim() || formData.lines.length === 0}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Enregistrement...' : editingPackage ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste des packs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              Packs ({filteredPackages.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Chargement...</div>
          ) : filteredPackages.length === 0 ? (
            <div className="p-8 text-center">
              <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">
                {searchTerm || filterTag ? 'Aucun pack trouvé' : 'Aucun pack créé'}
              </p>
              {!searchTerm && !filterTag && services.length > 0 && (
                <button
                  onClick={handleCreate}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Créer votre premier pack
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredPackages.map((pkg) => {
                const total = calculatePackageTotal(pkg.lines);
                return (
                  <div key={pkg.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <Package className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                            {pkg.description && (
                              <p className="text-sm text-gray-600">{pkg.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="ml-12 mb-2">
                          <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                            {pkg.lines.map((line, i) => (
                              <span key={i} className="flex items-center gap-1">
                                <Music className="w-3 h-3" />
                                {line.serviceName}
                                {line.qty > 1 && <span className="text-gray-400">×{line.qty}</span>}
                                {i < pkg.lines.length - 1 && <span className="text-gray-300 mx-1">•</span>}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm ml-12">
                          <span className="flex items-center gap-1.5 text-gray-600">
                            <Euro className="w-4 h-4" />
                            <span className="font-semibold text-indigo-600">
                              {formatCurrency(total)}
                            </span>
                          </span>
                          <span className="text-gray-500">
                            {pkg.lines.length} prestation{pkg.lines.length > 1 ? 's' : ''}
                          </span>
                          {pkg.tags.length > 0 && (
                            <div className="flex gap-1">
                              {pkg.tags.map((tag) => (
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
                          onClick={() => handleEdit(pkg)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(pkg)}
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
