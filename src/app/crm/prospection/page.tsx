'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Client, InstagramStatus, CrmLog } from '@/types';
import { TopNav } from '@/components/TopNav';
import { Plus, Upload, ExternalLink, Copy, Check, UserPlus, X, MessageSquare, Clock, Edit, Trash2, Settings, FileSpreadsheet, EyeOff, Eye, MapPin } from 'lucide-react';
import Link from 'next/link';
import BulkImportModal from './bulk-import';
import ProspectionMessageGenerator from '@/components/ProspectionMessageGenerator';

type KanbanColumn = {
  id: InstagramStatus;
  title: string;
  color: string;
  bgColor: string;
};

const columns: KanbanColumn[] = [
  { id: 'NOT_CONTACTED', title: 'Inbox', color: 'text-gray-700', bgColor: 'bg-gray-50' },
  { id: 'ON_HOLD', title: 'À réfléchir', color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  { id: 'DM_SENT', title: 'Démarché', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  { id: 'REPLIED', title: 'En Discussion', color: 'text-brand-700', bgColor: 'bg-brand-50' },
  { id: 'NO_REPLY', title: 'Relancé', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  { id: 'BOOKED', title: 'Booké', color: 'text-green-700', bgColor: 'bg-green-50' },
];

// Tags de priorité pour les prospects en discussion
type ProspectTag = 'interested' | 'very_interested' | 'ghosted' | 'full' | null;

const prospectTags = [
  { id: 'very_interested', label: 'Très intéressé', color: 'bg-green-500', emoji: '🟢' },
  { id: 'interested', label: 'Intéressé mais complet', color: 'bg-orange-500', emoji: '🟠' },
  { id: 'ghosted', label: 'Ghosté', color: 'bg-red-500', emoji: '🔴' },
];

type DemarchageTemplate = {
  id: string;
  name: string;
  content: string;
  variables: string[];
};

const defaultTemplates: DemarchageTemplate[] = [
  {
    id: '1',
    name: 'Premier Contact Classique',
    content: 'Salut {{etablissement}},\n\nJ\'espère que tu vas bien ! Je suis DJ et je serais intéressé pour collaborer avec ton établissement.\n\nTu aurais des disponibilités pour en discuter ?\n\nÀ bientôt !',
    variables: ['{{etablissement}}']
  },
  {
    id: '2',
    name: 'Approche Directe avec Dates',
    content: 'Hey {{etablissement}} ! 👋\n\nJe suis DJ depuis plusieurs années et j\'adorerais mixer chez vous. J\'ai des disponibilités ces prochaines semaines.\n\nÇa t\'intéresserait qu\'on en parle ?\n\nÀ très vite !',
    variables: ['{{etablissement}}']
  },
  {
    id: '3',
    name: 'Relance Après Premier Contact',
    content: 'Re {{etablissement}},\n\nJe reviens vers toi concernant ma proposition de collaboration.\n\nTu aurais un moment cette semaine pour qu\'on échange ?\n\nMerci ! 😊',
    variables: ['{{etablissement}}']
  },
  {
    id: '4',
    name: 'Proposition Événement Spécial',
    content: 'Salut {{etablissement}} ! 🎵\n\nJ\'ai vu que vous organisez des soirées régulièrement. Je serais super motivé pour participer à vos prochains événements.\n\nOn pourrait discuter de vos prochaines dates ?\n\nAu plaisir !',
    variables: ['{{etablissement}}']
  },
  {
    id: '5',
    name: 'Relance Saison / Longue Absence',
    content: 'Salut {{etablissement}} ! 😊\n\nJ\'espère que tu vas bien ! Ça fait un moment qu\'on a pas bossé ensemble et c\'était vraiment cool à l\'époque.\n\nJe pensais à toi en préparant la saison, ça te dirait qu\'on rebosse ensemble ? J\'adorerais refaire des dates chez vous !\n\nDis-moi si t\'as des dispo prochainement, ça me ferait vraiment plaisir 🙌\n\nÀ bientôt j\'espère !',
    variables: ['{{etablissement}}']
  },
];

export default function ProspectionPage() {
  const [prospects, setProspects] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [importUrls, setImportUrls] = useState('');
  const [importing, setImporting] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Client | null>(null);
  const [convertFormData, setConvertFormData] = useState({
    email: '',
    phone: '',
    address: '',
    siret: '',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplateProspect, setSelectedTemplateProspect] = useState<Client | null>(null);
  const [templates, setTemplates] = useState<DemarchageTemplate[]>(defaultTemplates);
  const [showManageTemplatesModal, setShowManageTemplatesModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DemarchageTemplate | null>(null);
  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    content: '',
  });
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [showAdvancedGenerator, setShowAdvancedGenerator] = useState(false);
  const [generatorProspect, setGeneratorProspect] = useState<Client | null>(null);
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [excludedProspects, setExcludedProspects] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProspects();
    loadCustomTemplates();
  }, []);

  const loadCustomTemplates = () => {
    try {
      const saved = localStorage.getItem('custom_demarchage_templates');
      if (saved) {
        const customTemplates = JSON.parse(saved);
        setTemplates([...defaultTemplates, ...customTemplates]);
      }
    } catch (error) {
      console.error('Erreur chargement templates:', error);
    }
  };

  const saveCustomTemplates = (allTemplates: DemarchageTemplate[]) => {
    try {
      const customOnly = allTemplates.filter(t => !['1', '2', '3', '4', '5'].includes(t.id));
      localStorage.setItem('custom_demarchage_templates', JSON.stringify(customOnly));
    } catch (error) {
      console.error('Erreur sauvegarde templates:', error);
    }
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const matches = content.matchAll(regex);
    const vars = new Set<string>();
    for (const match of matches) {
      vars.add(`{{${match[1]}}}`);
    }
    return Array.from(vars);
  };

  const openAddTemplateModal = () => {
    setEditingTemplate(null);
    setTemplateFormData({ name: '', content: '' });
    setShowManageTemplatesModal(true);
  };

  const openEditTemplateModal = (template: DemarchageTemplate) => {
    setEditingTemplate(template);
    setTemplateFormData({ name: template.name, content: template.content });
    setShowManageTemplatesModal(true);
  };

  const handleSaveTemplate = () => {
    if (!templateFormData.name.trim() || !templateFormData.content.trim()) {
      alert('Le nom et le contenu sont requis');
      return;
    }

    const variables = extractVariables(templateFormData.content);

    if (editingTemplate) {
      // Modification
      const updated = templates.map(t =>
        t.id === editingTemplate.id
          ? { ...t, name: templateFormData.name, content: templateFormData.content, variables }
          : t
      );
      setTemplates(updated);
      saveCustomTemplates(updated);
      alert('Template modifié avec succès');
    } else {
      // Ajout
      const newTemplate: DemarchageTemplate = {
        id: `custom_${Date.now()}`,
        name: templateFormData.name,
        content: templateFormData.content,
        variables,
      };
      const updated = [...templates, newTemplate];
      setTemplates(updated);
      saveCustomTemplates(updated);
      alert('Template ajouté avec succès');
    }

    setShowManageTemplatesModal(false);
    setEditingTemplate(null);
    setTemplateFormData({ name: '', content: '' });
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (['1', '2', '3', '4', '5'].includes(templateId)) {
      alert('Impossible de supprimer un template par défaut');
      return;
    }

    if (!confirm('Supprimer ce template ?')) return;

    const updated = templates.filter(t => t.id !== templateId);
    setTemplates(updated);
    saveCustomTemplates(updated);
    alert('Template supprimé');
  };

  const loadProspects = async () => {
    try {
      const prospectsSnap = await getDocs(collection(db, 'prospects'));
      const prospectsData = prospectsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
          lastIgAt: data.lastIgAt?.toDate ? data.lastIgAt.toDate() : data.lastIgAt,
          nextIgRelanceAt: data.nextIgRelanceAt?.toDate ? data.nextIgRelanceAt.toDate() : data.nextIgRelanceAt,
        } as Client;
      });

      setProspects(prospectsData);
    } catch (error) {
      console.error('Erreur lors du chargement des prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (!importUrls.trim()) {
      alert('Veuillez coller des URLs Instagram');
      return;
    }

    setImporting(true);

    try {
      const urls = importUrls.split('\n').filter(url => url.trim());
      let imported = 0;
      let skipped = 0;

      for (const url of urls) {
        // Détecter si c'est une URL de conversation directe (ex: instagram.com/direct/t/17850011534746279/)
        const threadMatch = url.match(/instagram\.com\/direct\/t\/(\d+)/);

        if (threadMatch) {
          // C'est une URL de conversation - extraire le Thread ID
          const threadId = threadMatch[1];

          // Vérifier si existe déjà avec ce Thread ID
          const existingSnap = await getDocs(
            query(collection(db, 'prospects'), where('instagramThreadId', '==', threadId))
          );

          if (!existingSnap.empty) {
            skipped++;
            continue;
          }

          // Créer le prospect avec Thread ID (nom temporaire car on ne connaît pas le handle)
          await addDoc(collection(db, 'prospects'), {
            name: `Conversation ${threadId.slice(-6)}`,
            instagramThreadId: threadId,
            igStatus: 'NOT_CONTACTED',
            igNotes: '',
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          imported++;
        } else {
          // C'est une URL de profil classique (ex: instagram.com/nom_club/)
          const match = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
          if (!match) continue;

          const handle = match[1];

          // Vérifier si existe déjà
          const existingSnap = await getDocs(
            query(collection(db, 'prospects'), where('instagramHandle', '==', handle))
          );

          if (!existingSnap.empty) {
            skipped++;
            continue;
          }

          // Créer le prospect
          await addDoc(collection(db, 'prospects'), {
            name: handle,
            instagramHandle: handle,
            instagramUrl: url,
            igStatus: 'NOT_CONTACTED',
            igNotes: '',
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          imported++;
        }
      }

      alert(`Import terminé : ${imported} ajouté(s), ${skipped} ignoré(s) (doublons)`);
      setImportUrls('');
      setShowImportModal(false);
      await loadProspects();
    } catch (error) {
      console.error('Erreur import:', error);
      alert('Erreur lors de l\'importation');
    } finally {
      setImporting(false);
    }
  };

  const updateProspectStatus = async (prospectId: string, newStatus: InstagramStatus, oldStatus: InstagramStatus) => {
    try {
      await updateDoc(doc(db, 'prospects', prospectId), {
        igStatus: newStatus,
        lastIgAt: new Date(),
        updatedAt: new Date(),
      });

      // Log l'action
      const prospect = prospects.find(p => p.id === prospectId);
      if (prospect) {
        await addDoc(collection(db, 'crm_logs'), {
          clientId: prospectId,
          clientName: prospect.name,
          channel: 'instagram',
          action: 'STATUS_CHANGE',
          at: new Date(),
          oldStatus,
          newStatus,
          createdAt: new Date(),
        });
      }

      await loadProspects();
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      alert('Erreur lors de la mise à jour');
    }
  };

  const openTemplateModal = (prospect: Client) => {
    setSelectedTemplateProspect(prospect);
    setShowTemplateModal(true);
  };

  const openAdvancedGenerator = (prospect: Client) => {
    setGeneratorProspect(prospect);
    setShowAdvancedGenerator(true);
  };

  const applyTemplate = (template: DemarchageTemplate, prospect: Client) => {
    let message = template.content;

    // Remplacer les variables
    message = message.replace(/\{\{etablissement\}\}/g, prospect.name);
    message = message.replace(/\{\{nom\}\}/g, prospect.name);

    navigator.clipboard.writeText(message);
    setCopiedId(prospect.id);
    setTimeout(() => setCopiedId(null), 2000);
    setShowTemplateModal(false);
  };

  const openConvertModal = (prospect: Client) => {
    setSelectedProspect(prospect);
    setConvertFormData({
      email: prospect.email || prospect.primaryEmail || '',
      phone: prospect.phone || '',
      address: prospect.address || '',
      siret: prospect.siret || '',
    });
    setShowConvertModal(true);
  };

  const handleConvertToClient = async () => {
    if (!selectedProspect) return;

    if (!convertFormData.email || !convertFormData.phone) {
      alert('Email et téléphone sont requis pour convertir en client');
      return;
    }

    try {
      // Créer le client dans la collection "clients"
      const clientData = {
        name: selectedProspect.name,
        email: convertFormData.email,
        primaryEmail: convertFormData.email,
        phone: convertFormData.phone,
        address: convertFormData.address || null,
        siret: convertFormData.siret || null,
        instagramHandle: selectedProspect.instagramHandle || null,
        instagramUrl: selectedProspect.instagramUrl || null,
        instagramThreadId: selectedProspect.instagramThreadId || null,
        igStatus: 'BOOKED',
        igNotes: selectedProspect.igNotes || null,
        instagramContacts: selectedProspect.instagramContacts || [],
        profileImageUrl: selectedProspect.profileImageUrl || null,
        color: '#3B82F6',
        createdAt: selectedProspect.createdAt || new Date(),
        updatedAt: new Date(),
      };

      await addDoc(collection(db, 'clients'), clientData);

      // Supprimer le prospect de la collection "prospects"
      await deleteDoc(doc(db, 'prospects', selectedProspect.id));

      // Log la conversion
      await addDoc(collection(db, 'crm_logs'), {
        clientId: selectedProspect.id,
        clientName: selectedProspect.name,
        channel: 'instagram',
        action: 'BOOKED',
        at: new Date(),
        notes: 'Converti de prospect à client',
        createdAt: new Date(),
      });

      alert('Prospect converti en client avec succès !');
      setShowConvertModal(false);
      setSelectedProspect(null);
      await loadProspects();
    } catch (error) {
      console.error('Erreur conversion:', error);
      alert('Erreur lors de la conversion');
    }
  };

  // Fonction legacy - redirige vers la nouvelle fonction filtrée
  const getProspectsForColumn = (status: InstagramStatus) => {
    return getFilteredProspectsForColumn(status);
  };

  const handleCopyInstagramUrl = (url: string, prospectId: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(prospectId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openInstagram = (prospect: Client) => {
    const url = prospect.instagramUrl || (prospect.instagramHandle ? `https://instagram.com/${prospect.instagramHandle.replace('@', '')}` : null);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const extractIgMeFromNotes = (notes?: string | null): string | null => {
    if (!notes) return null;
    // Chercher le lien ig.me dans les notes
    const match = notes.match(/ig\.me:\s*(https:\/\/ig\.me\/m\/[a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  };

  const extractCategoryFromNotes = (notes?: string | null): string | null => {
    if (!notes) return null;
    // Chercher la catégorie dans les notes
    const match = notes.match(/Catégorie:\s*([^\n]+)/);
    return match ? match[1].trim() : null;
  };

  const getCleanBusinessName = (name: string): string => {
    // Retirer le suffixe après " - " s'il existe
    const dashIndex = name.indexOf(' - ');
    if (dashIndex > 0) {
      return name.substring(0, dashIndex).trim();
    }
    return name;
  };

  const categoryTranslations: Record<string, string> = {
    'discothèque': 'Discothèque',
    'boîte de nuit': 'Boîte de nuit',
    'beach club': 'Beach club',
    'club': 'Club',
    'bar ambiance': 'Bar ambiance',
    'salle réception': 'Salle de réception',
    'domaine mariage': 'Domaine mariage',
    'espace événementiel': 'Espace événementiel',
  };

  const translateCategory = (category: string | null): string => {
    if (!category) return '';
    const normalized = category.toLowerCase().trim();
    return categoryTranslations[normalized] || category;
  };

  // Extraire la ville depuis les notes ou le nom
  const extractCityFromProspect = (prospect: Client): string | null => {
    // Chercher dans les notes d'abord
    if (prospect.igNotes) {
      const cityMatch = prospect.igNotes.match(/Ville:\s*([^\n]+)/i);
      if (cityMatch) return cityMatch[1].trim();
    }

    // Chercher dans le nom après un tiret (ex: "Club XYZ - Marseille")
    if (prospect.name) {
      const dashMatch = prospect.name.match(/\s-\s(.+)$/);
      if (dashMatch) {
        const possibleCity = dashMatch[1].trim();
        // Vérifier si c'est une ville connue
        if (['Marseille', 'Aix-en-Provence', 'Aix', 'Salon-de-Provence', 'Salon', 'Vitrolles', 'Aubagne', 'Cassis', 'La Ciotat'].some(city =>
          possibleCity.toLowerCase().includes(city.toLowerCase())
        )) {
          return possibleCity;
        }
      }
    }

    return null;
  };

  // Obtenir la liste des villes uniques
  const getUniqueCities = (): string[] => {
    const cities = new Set<string>();
    prospects.forEach(p => {
      const city = extractCityFromProspect(p);
      if (city) cities.add(city);
    });
    return Array.from(cities).sort();
  };

  // Filtrer les prospects selon la ville et les exclusions
  const getFilteredProspectsForColumn = (status: InstagramStatus) => {
    return prospects.filter(p => {
      // Filtre par statut
      if (p.igStatus !== status) return false;

      // Filtre par exclusion
      if (excludedProspects.has(p.id)) return false;

      // Filtre par ville
      if (cityFilter !== 'all') {
        const city = extractCityFromProspect(p);
        if (!city || !city.toLowerCase().includes(cityFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  };

  const extractHandleFromUrl = (url: string): string | null => {
    if (!url || !url.trim()) return null;

    // Nettoyer l'URL
    url = url.trim();

    // Patterns pour extraire le handle Instagram
    const patterns = [
      /instagram\.com\/([a-zA-Z0-9._]+)/,  // URL complète
      /^@?([a-zA-Z0-9._]+)$/  // Handle direct (avec ou sans @)
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const handle = match[1];
        // Filtrer les pages génériques
        if (!['p', 'reel', 'stories', 'explore', 'accounts', 'direct', 'tv', 'reels'].includes(handle.toLowerCase())) {
          return handle;
        }
      }
    }

    return null;
  };

  const handleQuickAddProspect = async () => {
    if (!quickAddUrl.trim()) {
      alert('Veuillez entrer une URL Instagram');
      return;
    }

    const handle = extractHandleFromUrl(quickAddUrl);
    if (!handle) {
      alert('URL Instagram invalide. Utilisez un format comme: https://www.instagram.com/username');
      return;
    }

    if (!quickAddName.trim()) {
      alert('Veuillez entrer un nom pour le prospect');
      return;
    }

    setQuickAddLoading(true);

    try {
      const prospectData = {
        name: quickAddName.trim(),
        instagramHandle: handle,
        instagramUrl: `https://instagram.com/${handle}`,
        instagramThreadId: null,
        email: null,
        phone: null,
        address: null,
        igStatus: 'NOT_CONTACTED' as InstagramStatus,
        igNotes: `ig.me: https://ig.me/m/${handle}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await addDoc(collection(db, 'prospects'), prospectData);

      // Recharger les prospects
      await loadProspects();

      // Réinitialiser et fermer
      setQuickAddUrl('');
      setQuickAddName('');
      setShowQuickAddModal(false);

    } catch (error) {
      console.error('Erreur ajout prospect:', error);
      alert('Erreur lors de l\'ajout du prospect');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const openInstagramDM = (prospect: Client) => {
    // Priorité 1: Thread ID numérique (conversation existante)
    if (prospect.instagramThreadId && /^\d+$/.test(prospect.instagramThreadId)) {
      window.open(`https://www.instagram.com/direct/t/${prospect.instagramThreadId}/`, '_blank');
      return;
    }

    // Priorité 2: Lien ig.me depuis les notes (pour nouveaux prospects)
    const igMeUrl = extractIgMeFromNotes(prospect.igNotes);
    if (igMeUrl) {
      window.open(igMeUrl, '_blank');
      return;
    }

    // Priorité 3: Créer le lien ig.me depuis le handle
    if (prospect.instagramHandle) {
      const handle = prospect.instagramHandle.replace('@', '');
      window.open(`https://ig.me/m/${handle}`, '_blank');
      return;
    }

    // Fallback: ouvrir la messagerie générale
    window.open('https://www.instagram.com/direct/inbox/', '_blank');
  };

  const handleDeleteAllProspects = async () => {
    const confirmMessage = `⚠️ ATTENTION ⚠️\n\nTu es sur le point de supprimer TOUS les ${prospects.length} prospects de l'inbox.\n\nCette action est IRRÉVERSIBLE.\n\nÊtes-tu vraiment sûr ?`;

    if (!confirm(confirmMessage)) return;

    // Double confirmation
    const doubleConfirm = confirm(`Dernière confirmation : supprimer ${prospects.length} prospects ?`);
    if (!doubleConfirm) return;

    try {
      setLoading(true);

      // Supprimer tous les prospects par batch
      const batchSize = 500;
      let deleted = 0;

      for (let i = 0; i < prospects.length; i += batchSize) {
        const batch = prospects.slice(i, i + batchSize);

        await Promise.all(
          batch.map(prospect => deleteDoc(doc(db, 'prospects', prospect.id)))
        );

        deleted += batch.length;
        console.log(`Supprimé ${deleted}/${prospects.length} prospects...`);
      }

      alert(`✅ ${deleted} prospects supprimés avec succès !`);
      await loadProspects();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('❌ Erreur lors de la suppression des prospects');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProspect = async (prospectId: string, prospectName: string) => {
    if (!confirm(`Supprimer le prospect "${prospectName}" ?`)) return;

    try {
      await deleteDoc(doc(db, 'prospects', prospectId));
      await loadProspects();
    } catch (error) {
      console.error('Erreur suppression prospect:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Extraire le tag de priorité depuis igNotes
  const extractTagFromNotes = (notes?: string | null): ProspectTag => {
    if (!notes) return null;
    if (notes.includes('tag:very_interested')) return 'very_interested';
    if (notes.includes('tag:interested')) return 'interested';
    if (notes.includes('tag:ghosted')) return 'ghosted';
    if (notes.includes('tag:full')) return 'full';
    return null;
  };

  // Mettre à jour le tag d'un prospect
  const updateProspectTag = async (prospectId: string, tag: ProspectTag) => {
    try {
      const prospect = prospects.find(p => p.id === prospectId);
      if (!prospect) return;

      let notes = prospect.igNotes || '';

      // Retirer l'ancien tag s'il existe
      notes = notes.replace(/tag:(very_interested|interested|ghosted|full)\n?/g, '').trim();

      // Ajouter le nouveau tag si ce n'est pas null
      if (tag) {
        notes = `tag:${tag}\n${notes}`.trim();
      }

      await updateDoc(doc(db, 'prospects', prospectId), {
        igNotes: notes,
        updatedAt: new Date(),
      });

      await loadProspects();
    } catch (error) {
      console.error('Erreur mise à jour tag:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-apple-bg">
        <TopNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
            <p className="text-gray-700 mt-3">Chargement...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-apple-bg">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* En-tête */}
        <div className="mb-8">
          <div className="mb-4">
            <div className="mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Prospection Instagram</h1>
              <p className="text-gray-600 mt-1">Pipeline de vente et gestion des prospects</p>
            </div>
            <div className="-mx-4 px-4 overflow-x-auto pt-1 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max min-w-full gap-3 pl-1 pr-4 snap-x snap-mandatory">
              <button
                onClick={() => {
                  setGeneratorProspect(null);
                  setShowAdvancedGenerator(true);
                }}
                className="shrink-0 snap-start flex items-center justify-center gap-2 px-4 py-3 w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-auto whitespace-nowrap btn-primary font-medium shadow-apple-sm"
              >
                <MessageSquare className="w-5 h-5" />
                Générateur de messages
              </button>
              <button
                onClick={() => openAddTemplateModal()}
                className="shrink-0 snap-start flex items-center justify-center gap-2 px-4 py-3 w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-auto whitespace-nowrap btn-secondary font-medium shadow-apple-sm"
              >
                <Settings className="w-5 h-5" />
                Templates rapides
              </button>
              <button
                onClick={() => setShowBulkImportModal(true)}
                className="shrink-0 snap-start flex items-center justify-center gap-2 px-4 py-3 w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-auto whitespace-nowrap btn-primary font-medium shadow-apple-sm"
              >
                <FileSpreadsheet className="w-5 h-5" />
                Import CSV
              </button>
              <button
                onClick={() => setShowQuickAddModal(true)}
                className="shrink-0 snap-start flex items-center justify-center gap-2 px-4 py-3 w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-auto whitespace-nowrap btn-primary font-medium shadow-apple-sm"
              >
                <Plus className="w-5 h-5" />
                Ajout rapide
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="shrink-0 snap-start flex items-center justify-center gap-2 px-4 py-3 w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-auto whitespace-nowrap btn-primary font-medium shadow-apple-sm"
              >
                <Upload className="w-5 h-5" />
                Importer des prospects
              </button>
              {prospects.length > 0 && (
                <button
                  onClick={handleDeleteAllProspects}
                  className="shrink-0 snap-start flex items-center justify-center gap-2 px-4 py-3 w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-auto whitespace-nowrap btn-secondary font-medium text-red-700 border-red-200/50 bg-red-50 hover:bg-red-100 shadow-apple-sm"
                >
                  <Trash2 className="w-5 h-5" />
                  Vider l&apos;inbox ({prospects.length})
                </button>
              )}
            </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {columns.map(col => {
              const count = getProspectsForColumn(col.id).length;
              return (
                <div key={col.id} className={`${col.bgColor} border border-gray-200 rounded-xl p-4`}>
                  <p className={`text-sm font-medium ${col.color}`}>{col.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filtres */}
        <div className="mb-6 ui-card p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filtrer par ville
              </label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="all">Toutes les villes</option>
                {getUniqueCities().map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              {cityFilter !== 'all' && (
                <button
                  onClick={() => setCityFilter('all')}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Réinitialiser
                </button>
              )}
              {excludedProspects.size > 0 && (
                <button
                  onClick={() => setExcludedProspects(new Set())}
                  className="btn-secondary text-orange-700 border-orange-200/50 bg-orange-50 hover:bg-orange-100 flex items-center gap-2 text-sm"
                >
                  <span>Afficher les masqués ({excludedProspects.size})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="-mx-4 px-4 overflow-x-auto pt-1 pb-4 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-3 pl-1 pr-4">
          {columns.map(column => {
            const columnProspects = getProspectsForColumn(column.id);

            return (
              <div key={column.id} className="shrink-0 snap-start w-[calc((100vw-2rem-0.75rem)/2)] sm:w-[calc((100vw-2rem-1.5rem)/3)] md:w-[230px]">
                <div className={`${column.bgColor} rounded-t-lg px-2 py-1.5 border-b-2 border-gray-300`}>
                  <h3 className={`font-bold text-xs ${column.color} truncate`}>
                    {column.title} <span className="opacity-70">({columnProspects.length})</span>
                  </h3>
                </div>

                <div className="space-y-1.5 mt-1.5 min-h-[400px]">
                  {columnProspects.map(prospect => {
                    const tag = extractTagFromNotes(prospect.igNotes);
                    const borderColor = tag === 'very_interested' ? 'border-l-green-500' :
                                       tag === 'interested' ? 'border-l-orange-500' :
                                       tag === 'ghosted' ? 'border-l-red-500' :
                                       'border-l-transparent';
                    return (
                    <div
                      key={prospect.id}
                      className={`bg-apple-card rounded-lg border border-apple-border shadow-apple-sm border-l-4 ${borderColor} p-2 hover:shadow-md transition-shadow`}
                    >
                      {/* Header avec photo de profil + suppression */}
                      <div className="flex items-start gap-2 mb-2">
                        {prospect.profileImageUrl ? (
                          <img
                            src={prospect.profileImageUrl}
                            alt={prospect.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-600 font-semibold text-xs">
                              {getCleanBusinessName(prospect.name).charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h4 className="font-semibold text-sm text-gray-900 truncate flex-1">
                              {getCleanBusinessName(prospect.name)}
                            </h4>
                            {/* Bouton masquer */}
                            <button
                              onClick={() => {
                                const newExcluded = new Set(excludedProspects);
                                newExcluded.add(prospect.id);
                                setExcludedProspects(newExcluded);
                              }}
                              className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors flex-shrink-0"
                              title="Masquer temporairement"
                            >
                              <EyeOff className="w-3 h-3" />
                            </button>
                            {/* Bouton supprimer */}
                            <button
                              onClick={() => handleDeleteProspect(prospect.id, prospect.name)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {extractCategoryFromNotes(prospect.igNotes) && (
                            <p className="text-xs text-gray-500 truncate">
                              {translateCategory(extractCategoryFromNotes(prospect.igNotes))}
                            </p>
                          )}
                          {extractCityFromProspect(prospect) && (
                            <p className="text-xs text-brand-600 flex items-center gap-1 mt-0.5 truncate">
                              <MapPin className="w-3 h-3" />
                              {extractCityFromProspect(prospect)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Sélecteur de tag pour prospects en discussion */}
                      {(column.id === 'REPLIED' || column.id === 'NO_REPLY') && (
                        <div className="flex gap-1 mb-2">
                          {prospectTags.map(tagItem => {
                            const currentTag = extractTagFromNotes(prospect.igNotes);
                            const isActive = currentTag === tagItem.id;
                            return (
                              <button
                                key={tagItem.id}
                                onClick={() => updateProspectTag(prospect.id, isActive ? null : tagItem.id as ProspectTag)}
                                className={`w-5 h-5 flex items-center justify-center rounded-full text-xs transition-all ${
                                  isActive
                                    ? `${tagItem.color} ring-2 ring-offset-1 ring-gray-400`
                                    : 'bg-gray-100 hover:bg-gray-200 opacity-50 hover:opacity-100'
                                }`}
                                title={tagItem.label}
                              >
                                {tagItem.emoji}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Actions - Boutons compacts */}
                      <div className="flex flex-wrap gap-1">
                        {(prospect.instagramUrl || prospect.instagramHandle) && (
                          <button
                            onClick={() => openInstagram(prospect)}
                            className="btn-primary-sm"
                            title="Voir profil Instagram"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Bouton DM - disponible si threadId OU handle Instagram */}
                        {((prospect.instagramThreadId && /^\d+$/.test(prospect.instagramThreadId)) ||
                          extractIgMeFromNotes(prospect.igNotes) ||
                          prospect.instagramHandle) && (
                          <button
                            onClick={() => openInstagramDM(prospect)}
                            className="btn-danger-soft-sm"
                            title="Envoyer un DM"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => openTemplateModal(prospect)}
                          className="btn-primary-sm"
                          title="Template rapide"
                        >
                          {copiedId === prospect.id ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => openAdvancedGenerator(prospect)}
                          className="btn-primary-sm"
                          title="Générer un message"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>

                        {column.id !== 'BOOKED' && (
                          <button
                            onClick={() => openConvertModal(prospect)}
                            className="btn-primary-sm"
                            title="Convertir en client"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Changement de statut */}
                      {column.id !== 'BOOKED' && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <select
                            value={prospect.igStatus}
                            onChange={(e) => updateProspectStatus(prospect.id, e.target.value as InstagramStatus, prospect.igStatus || 'NOT_CONTACTED')}
                            className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-brand-500 focus:border-transparent bg-gray-50"
                          >
                            {columns.map(col => (
                              <option key={col.id} value={col.id}>{col.title}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                  })}

                  {columnProspects.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Aucun prospect
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </main>

      {/* Modal Import */}
      {showImportModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="bg-apple-card rounded-2xl border border-apple-border shadow-apple-xl max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Importer des Prospects</h2>
              <p className="text-gray-600 text-sm mt-1">
                Collez les URLs Instagram (une par ligne)
              </p>
            </div>

            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-brand-900 font-medium mb-2">💡 Deux types d&apos;URLs acceptées:</p>
                <ul className="text-xs text-brand-700 space-y-1 ml-4 list-disc">
                  <li><strong>Profil:</strong> https://www.instagram.com/nom_club/</li>
                  <li><strong>Conversation directe:</strong> https://www.instagram.com/direct/t/17850011534746279/</li>
                </ul>
              </div>

              <textarea
                value={importUrls}
                onChange={(e) => setImportUrls(e.target.value)}
                placeholder="https://www.instagram.com/nom_club1/&#10;https://www.instagram.com/direct/t/17850011534746279/&#10;https://www.instagram.com/nom_club2/&#10;..."
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none font-mono text-sm"
              />
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleBulkImport}
                disabled={importing || !importUrls.trim()}
                className="flex-1 btn-primary rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importation...' : 'Importer'}
              </button>
              <button
                onClick={() => setShowImportModal(false)}
                className="btn-secondary rounded-xl font-medium"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conversion */}
      {showConvertModal && selectedProspect && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowConvertModal(false)}
        >
          <div
            className="bg-apple-card rounded-2xl border border-apple-border shadow-apple-xl max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Convertir en Client</h2>
              <p className="text-gray-600 text-sm mt-1">
                Complétez les informations pour {selectedProspect.name}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={convertFormData.email}
                  onChange={(e) => setConvertFormData({ ...convertFormData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone *
                </label>
                <input
                  type="tel"
                  value={convertFormData.phone}
                  onChange={(e) => setConvertFormData({ ...convertFormData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse
                </label>
                <input
                  type="text"
                  value={convertFormData.address}
                  onChange={(e) => setConvertFormData({ ...convertFormData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SIRET
                </label>
                <input
                  type="text"
                  value={convertFormData.siret}
                  onChange={(e) => setConvertFormData({ ...convertFormData, siret: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleConvertToClient}
                className="flex-1 btn-primary rounded-xl font-medium"
              >
                Convertir en Client
              </button>
              <button
                onClick={() => setShowConvertModal(false)}
                className="btn-secondary rounded-xl font-medium"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sélection Template */}
      {showTemplateModal && selectedTemplateProspect && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            className="bg-apple-card rounded-2xl border border-apple-border shadow-apple-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Choisir un Template</h2>
              <p className="text-gray-600 text-sm mt-1">
                Pour <span className="font-semibold text-brand-600">{selectedTemplateProspect.name}</span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {templates.map(template => {
                  // Prévisualiser avec le nom du prospect
                  const preview = template.content.replace(/\{\{etablissement\}\}/g, selectedTemplateProspect.name);

                  return (
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-xl p-4 hover:border-brand-200 hover:shadow-apple-sm transition-all cursor-pointer"
                      onClick={() => applyTemplate(template, selectedTemplateProspect)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            applyTemplate(template, selectedTemplateProspect);
                          }}
                          className="btn-primary text-sm font-medium flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Copier
                        </button>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
                          {preview}
                        </pre>
                      </div>

                      {template.variables.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {template.variables.map((variable, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-1 bg-brand-50 text-brand-700 rounded-full font-mono"
                            >
                              {variable}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="w-full btn-secondary rounded-xl font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestion Templates */}
      {showManageTemplatesModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowManageTemplatesModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingTemplate ? 'Modifier le Template' : 'Nouveau Template'}
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                {editingTemplate
                  ? 'Modifiez votre template de démarchage'
                  : 'Créez un nouveau template de démarchage personnalisé'}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Formulaire de création/édition */}
              {(editingTemplate || !editingTemplate) && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom du template
                    </label>
                    <input
                      type="text"
                      value={templateFormData.name}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                      placeholder="Ex: Relance J+7"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contenu du message
                    </label>
                    <textarea
                      value={templateFormData.content}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, content: e.target.value })}
                      placeholder="Salut {{etablissement}},&#10;&#10;Ton message ici...&#10;&#10;Variables disponibles: {{etablissement}}, {{nom}}"
                      className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none font-sans"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Utilisez <code className="bg-gray-100 px-2 py-0.5 rounded">{'{{etablissement}}'}</code> ou <code className="bg-gray-100 px-2 py-0.5 rounded">{'{{nom}}'}</code> pour personnaliser le message
                    </p>
                  </div>

                  {/* Prévisualisation des variables détectées */}
                  {templateFormData.content && (
                    <div className="bg-brand-50 border border-brand-100 rounded-lg p-4">
                      <p className="text-sm font-medium text-brand-900 mb-2">Variables détectées:</p>
                      <div className="flex flex-wrap gap-2">
                        {extractVariables(templateFormData.content).map((variable, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-3 py-1 bg-brand-100 text-brand-900 rounded-full font-mono"
                          >
                            {variable}
                          </span>
                        ))}
                        {extractVariables(templateFormData.content).length === 0 && (
                          <span className="text-xs text-brand-600">Aucune variable détectée</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Liste des templates existants */}
              {!editingTemplate && (
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Templates existants</h3>
                  <div className="space-y-3">
                    {templates.map(template => {
                      const isDefault = ['1', '2', '3', '4', '5'].includes(template.id);
                      return (
                        <div
                          key={template.id}
                          className="border border-gray-200 rounded-lg p-4 hover:border-brand-200 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-gray-900">{template.name}</h4>
                                {isDefault && (
                                  <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                                    Par défaut
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2 mb-2">{template.content}</p>
                              {template.variables.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {template.variables.map((variable, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full font-mono"
                                    >
                                      {variable}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              {!isDefault && (
                                <>
                                  <button
                                    onClick={() => openEditTemplateModal(template)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Modifier"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTemplate(template.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleSaveTemplate}
                disabled={!templateFormData.name.trim() || !templateFormData.content.trim()}
                className="flex-1 btn-primary rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTemplate ? 'Enregistrer les modifications' : 'Ajouter le template'}
              </button>
              <button
                onClick={() => {
                  setShowManageTemplatesModal(false);
                  setEditingTemplate(null);
                  setTemplateFormData({ name: '', content: '' });
                }}
                className="btn-secondary rounded-xl font-medium"
              >
                {editingTemplate ? 'Annuler' : 'Fermer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajout Rapide */}
      {showQuickAddModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowQuickAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Ajout Rapide</h2>
              <p className="text-gray-600 text-sm mt-1">
                Ajouter un prospect avec juste une URL Instagram
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL Instagram *
                </label>
                <input
                  type="text"
                  value={quickAddUrl}
                  onChange={(e) => setQuickAddUrl(e.target.value)}
                  placeholder="https://www.instagram.com/maneoaix"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Collez l&apos;URL complète du profil Instagram
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de l&apos;établissement *
                </label>
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Ex: Maneo Club"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {quickAddUrl && extractHandleFromUrl(quickAddUrl) && (
                <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl">
                  <p className="text-sm text-brand-900 font-medium mb-2">Aperçu:</p>
                  <div className="space-y-1 text-sm text-brand-700">
                    <p>• Handle: @{extractHandleFromUrl(quickAddUrl)}</p>
                    <p>• Profil: https://instagram.com/{extractHandleFromUrl(quickAddUrl)}</p>
                    <p>• DM: https://ig.me/m/{extractHandleFromUrl(quickAddUrl)}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleQuickAddProspect}
                disabled={quickAddLoading || !quickAddUrl.trim() || !quickAddName.trim()}
                className="flex-1 btn-primary rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {quickAddLoading ? 'Ajout en cours...' : 'Ajouter le prospect'}
              </button>
              <button
                onClick={() => {
                  setShowQuickAddModal(false);
                  setQuickAddUrl('');
                  setQuickAddName('');
                }}
                className="btn-secondary rounded-xl font-medium"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import CSV */}
      {showBulkImportModal && (
        <BulkImportModal
          onClose={() => setShowBulkImportModal(false)}
          onSuccess={() => {
            setShowBulkImportModal(false);
            loadProspects();
          }}
        />
      )}

      {/* Générateur de messages avancé */}
      <ProspectionMessageGenerator
        isOpen={showAdvancedGenerator}
        onClose={() => {
          setShowAdvancedGenerator(false);
          setGeneratorProspect(null);
        }}
        prospect={generatorProspect}
        onMessageCopied={() => {
          if (generatorProspect) {
            setCopiedId(generatorProspect.id);
            setTimeout(() => setCopiedId(null), 2000);
          }
        }}
      />
    </div>
  );
}
