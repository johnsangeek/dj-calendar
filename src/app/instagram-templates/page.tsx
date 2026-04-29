'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { InstagramMessageTemplate, InstagramTemplateType } from '@/types';
import { Plus, Edit2, Trash2, Save, X, MessageCircle, Copy } from 'lucide-react';
import { TopNav } from '@/components/TopNav';

export default function InstagramTemplatesPage() {
  const [templates, setTemplates] = useState<InstagramMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    type: InstagramTemplateType;
    content: string;
  }>({
    name: '',
    type: 'CUSTOM',
    content: ''
  });

  const templateTypes: { value: InstagramTemplateType; label: string; description: string }[] = [
    { value: 'PREMIER_CONTACT', label: 'Premier contact', description: 'Message initial de prospection' },
    { value: 'RELANCE_J7', label: 'Relance J+7', description: 'Relance après 7 jours sans réponse' },
    { value: 'RELANCE_J14', label: 'Relance J+14', description: 'Relance après 14 jours sans réponse' },
    { value: 'REPONSE_FAVORABLE', label: 'Réponse favorable', description: 'Quand le client est intéressé' },
    { value: 'OPTION_BLOQUEE', label: 'Option bloquée', description: 'Pour bloquer une date en option' },
    { value: 'CUSTOM', label: 'Personnalisé', description: 'Template custom' }
  ];

  const availableVariables = [
    { name: '{{prenom}}', description: 'Prénom du contact' },
    { name: '{{etablissement}}', description: 'Nom de l\'établissement' },
    { name: '{{ville}}', description: 'Ville de l\'établissement' },
    { name: '{{date1}}', description: 'Première date proposée' },
    { name: '{{date2}}', description: 'Deuxième date proposée' },
    { name: '{{date3}}', description: 'Troisième date proposée' }
  ];

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const snapshot = await getDocs(collection(db, 'instagram_templates'));
    const templatesData = snapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      } as InstagramMessageTemplate;
    });
    setTemplates(templatesData);
    setLoading(false);
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const matches = content.match(regex);
    return matches ? Array.from(new Set(matches)) : [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const variables = extractVariables(formData.content);

    const payload = {
      name: formData.name,
      type: formData.type,
      content: formData.content,
      variables,
      isActive: true,
      updatedAt: now,
    };

    if (editing) {
      await updateDoc(doc(db, 'instagram_templates', editing), payload);
    } else {
      await addDoc(collection(db, 'instagram_templates'), {
        ...payload,
        createdAt: now
      });
    }

    loadTemplates();
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer ce template ?')) {
      await deleteDoc(doc(db, 'instagram_templates', id));
      loadTemplates();
    }
  };

  const startEdit = (template: InstagramMessageTemplate) => {
    setEditing(template.id);
    setFormData({
      name: template.name,
      type: template.type,
      content: template.content
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'CUSTOM',
      content: ''
    });
    setEditing(null);
    setShowForm(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Template copié dans le presse-papier !');
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('content-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.content;
    const before = text.substring(0, start);
    const after = text.substring(end);

    setFormData({ ...formData, content: before + variable + after });

    // Remettre le focus et positionner le curseur après la variable
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    }, 0);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <TopNav />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900">Templates Instagram</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
            {showForm ? 'Annuler' : 'Nouveau template'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 mb-8">
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Nom du template *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="border rounded-lg px-4 py-2"
              />
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as InstagramTemplateType })}
                className="border rounded-lg px-4 py-2"
              >
                {templateTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message *
              </label>
              <textarea
                id="content-textarea"
                placeholder="Tape ton message ici... Utilise les variables ci-dessous."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 w-full font-mono text-sm"
                rows={8}
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Variables disponibles (clique pour insérer)
              </label>
              <div className="flex flex-wrap gap-2">
                {availableVariables.map(v => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-sm font-mono transition-colors"
                    title={v.description}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Ces variables seront remplacées automatiquement lors de l'utilisation du template
              </p>
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
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-purple-500"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{template.name}</h3>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                    {templateTypes.find(t => t.value === template.type)?.label || template.type}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(template.content)}
                    className="text-purple-600 hover:text-purple-800"
                    title="Copier le template"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    onClick={() => startEdit(template)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{template.content}</pre>
              </div>

              {template.variables && template.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-gray-600 mr-1">Variables:</span>
                  {template.variables.map((v, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs font-mono">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {templates.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-700">
            Aucun template. Clique sur "Nouveau template" pour commencer !
          </div>
        )}
      </div>
    </div>
  );
}
