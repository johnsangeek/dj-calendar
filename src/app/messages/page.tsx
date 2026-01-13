'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { MessageTemplate } from '@/types';
import { MessageSquare, Plus, Copy, Edit2 } from 'lucide-react';

const DEFAULT_TEMPLATES = [
  {
    name: 'Disponibilité - Style Friendly',
    type: 'dispo',
    style: 'friendly',
    content: `Hey ! 👋

Merci pour ton message ! Je suis dispo {{availability_period}} :
{{availability_dates}}

Si ça te convient, on peut se caler un call pour discuter de ton projet !

À très vite,
DJ {{dj_name}} 🎵`
  },
  {
    name: 'Disponibilité - Style Club/Pro',
    type: 'dispo',
    style: 'club',
    content: `Salut,

Voici mes disponibilités {{availability_period}} :
{{availability_dates}}

Tarif : À partir de {{base_price}}€
Matériel pro inclus 🎧

Dispo pour en discuter !

DJ {{dj_name}}`
  },
  {
    name: 'Disponibilité - Style Amical',
    type: 'dispo',
    style: 'amical',
    content: `Salut ! 😊

Super ton message ! Je checke mon planning et voilà mes dispos {{availability_period}} :
{{availability_dates}}

Si l'une de ces dates te va, on peut se faire un appel pour parler de ton event !

Bise,
DJ {{dj_name}} ✨`
  },
  {
    name: 'Disponibilité - Style Poli/Formel',
    type: 'dispo',
    style: 'polis',
    content: `Bonjour,

Je vous remercie pour votre demande. Voici mes disponibilités {{availability_period}} :
{{availability_dates}}

Je reste à votre disposition pour échanger sur les détails de votre événement.

Cordialement,
DJ {{dj_name}}`
  },
  {
    name: 'Confirmation Booking',
    type: 'confirmation',
    content: `Bonjour {{client_name}},

Je confirme ta réservation pour le {{event_date}} à {{event_location}}.

Détails :
- Date : {{event_date}}
- Horaires : {{event_time}}
- Prix : {{event_price}}€
- Acompte versé : {{deposit}}€

N'hésite pas si tu as des questions !

À bientôt,
DJ {{dj_name}}`
  },
  {
    name: 'Rappel Paiement',
    type: 'refus',
    content: `Bonjour {{client_name}},

Je me permets de te rappeler le règlement du solde pour ta soirée du {{event_date}}.

Reste à payer : {{remaining}}€

Merci !

DJ {{dj_name}}`
  },
  {
    name: 'Devis',
    type: 'confirmation',
    content: `Bonjour {{client_name}},

Suite à ta demande, voici mon tarif pour ta soirée :

📅 Date : {{event_date}}
📍 Lieu : {{event_location}}
💰 Prix : {{event_price}}€

Le prix comprend :
- Matériel son professionnel
- Lumières d'ambiance
- Playlist personnalisée
- {{hours}}h de prestation

Acompte : 30% à la réservation

Disponible pour échanger !

DJ {{dj_name}}`
  }
];

export default function MessagesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', content: '' });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const snapshot = await getDocs(collection(db, 'message_templates'));
    if (snapshot.empty) {
      // Créer les templates par défaut
      for (const template of DEFAULT_TEMPLATES) {
        await addDoc(collection(db, 'message_templates'), {
          ...template,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      loadTemplates(); // Recharger
    } else {
      const templatesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as MessageTemplate[];
      setTemplates(templatesData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addDoc(collection(db, 'message_templates'), {
      ...formData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    setFormData({ name: '', content: '' });
    setShowForm(false);
    loadTemplates();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getVariables = (content: string) => {
    const matches = content.match(/\{\{(\w+)\}\}/g);
    return matches ? [...new Set(matches)] : [];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">📱 Messages</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
          >
            <Plus size={20} />
            Nouveau template
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 mb-8">
            <input
              type="text"
              placeholder="Nom du template"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="border rounded-lg px-4 py-2 w-full mb-4 text-gray-900"
            />
            <textarea
              placeholder="Contenu du message (utilise {{variable}} pour les champs dynamiques)"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              required
              className="border rounded-lg px-4 py-2 w-full h-64 text-gray-900"
            />
            <div className="mt-4 text-sm text-gray-600">
              <p className="font-medium mb-2">Variables disponibles :</p>
              <div className="flex flex-wrap gap-2">
                {['{{client_name}}', '{{event_date}}', '{{event_location}}', '{{event_price}}', '{{deposit}}', '{{remaining}}', '{{dj_name}}', '{{event_time}}', '{{hours}}'].map(v => (
                  <code key={v} className="bg-gray-100 px-2 py-1 rounded">{v}</code>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Créer le template
            </button>
          </form>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {templates.map((template) => (
            <div key={template.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <MessageSquare className="text-orange-600" size={24} />
                  {template.name}
                </h3>
                <button
                  onClick={() => copyToClipboard(template.content, template.id)}
                  className={`transition-colors ${
                    copied === template.id ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Copy size={20} />
                </button>
              </div>
              
              <pre className="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap font-sans">
                {template.content}
              </pre>
              
              <div className="mt-4 flex flex-wrap gap-2">
                {getVariables(template.content).map(variable => (
                  <span key={variable} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                    {variable}
                  </span>
                ))}
              </div>
              
              {copied === template.id && (
                <div className="mt-4 text-green-600 text-sm font-medium">
                  ✓ Copié dans le presse-papier !
                </div>
              )}
            </div>
          ))}
        </div>

        {templates.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Aucun template. Clique sur "Nouveau template" pour créer ton premier message !
          </div>
        )}
      </div>
    </div>
  );
}
