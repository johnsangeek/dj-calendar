'use client';

import { useState } from 'react';
import { Client } from '@/types';
import { X, Send } from 'lucide-react';

interface EmailTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  templateType: 'vip_inactive' | 'regular_inactive' | 'gentle_reminder' | 'custom';
}

const emailTemplates = {
  vip_inactive: {
    title: 'Relance VIP inactif',
    subject: (clientName: string) => `On se retrouve bientôt ? 🎵`,
    body: (client: Client) => {
      const daysInactive = client.stats?.daysInactive || 0;
      const timeText = daysInactive > 365
        ? `plus d'un an`
        : `${Math.floor(daysInactive / 30)} mois`;

      return `Bonjour ${client.name},

Ça fait ${timeText} qu'on n'a pas travaillé ensemble !

J'espère que tout va bien de votre côté. Nous avons eu l'occasion de collaborer sur ${client.stats?.totalPrestations || 0} événements par le passé, et j'adorerais renouveler l'expérience.

Depuis notre dernière collaboration, j'ai :
• Enrichi mon catalogue musical
• Amélioré mon matériel (son et lumières)
• Développé de nouvelles formules adaptées à vos besoins

Avez-vous des projets en vue ? Je serais ravi d'échanger avec vous.

Musicalement,
John Santi - DJ Pro

P.S. En tant que client fidèle, je peux vous proposer des conditions préférentielles pour votre prochain événement 😉`;
    }
  },
  regular_inactive: {
    title: 'Relance client régulier',
    subject: (clientName: string) => `Nouveautés et disponibilités - DJ Pro`,
    body: (client: Client) => {
      return `Bonjour ${client.name},

J'espère que vous allez bien !

Depuis notre dernière collaboration, j'ai fait évoluer mes prestations et mon matériel. Je me permets de vous recontacter pour vous tenir informé de mes disponibilités.

Notre historique ensemble :
• ${client.stats?.totalPrestations || 0} prestations réalisées
• Dernière collaboration : ${client.stats?.lastCollaborationAt?.toLocaleDateString('fr-FR') || 'N/A'}

Nouveautés 2026 :
• Nouveau système son professionnel
• Éclairages LED dernière génération
• Playlist enrichie et mise à jour régulière
• Formules sur-mesure selon vos besoins

N'hésitez pas à me contacter si vous avez des événements à venir. Je serais ravi de vous accompagner à nouveau.

Cordialement,
John Santi - DJ Pro`;
    }
  },
  gentle_reminder: {
    title: 'Rappel doux',
    subject: (clientName: string) => `Des projets en vue ?`,
    body: (client: Client) => {
      return `Bonjour ${client.name},

Comment allez-vous ?

Je me permets de prendre de vos nouvelles. Nous avions eu le plaisir de collaborer il y a quelques mois, et je voulais savoir si vous aviez des projets d'événements dans les mois à venir.

Je reste à votre disposition pour toute demande de devis ou simplement pour échanger sur vos besoins.

À très bientôt j'espère !

Musicalement,
John Santi - DJ Pro`;
    }
  },
  custom: {
    title: 'Message personnalisé',
    subject: (clientName: string) => ``,
    body: (client: Client) => ``
  }
};

export default function EmailTemplateModal({ isOpen, onClose, client, templateType }: EmailTemplateModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const loadTemplate = () => {
    if (!client) return;
    const template = emailTemplates[templateType];
    setSubject(template.subject(client.name));
    setBody(template.body(client));
  };

  const handleOpen = () => {
    if (isOpen && client) {
      loadTemplate();
    }
  };

  useState(() => {
    handleOpen();
  });

  const handleSend = async () => {
    if (!client) return;

    setSending(true);

    // Simuler l'envoi (à remplacer par l'intégration avec un service d'email)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Ici, tu pourrais :
    // 1. Envoyer l'email via une API
    // 2. Sauvegarder dans un log de relances
    // 3. Mettre à jour la date de dernière relance du client

    alert(`Email envoyé à ${client.name} !\n\nSujet: ${subject}\n\n(Fonctionnalité à intégrer avec votre service d'email)`);

    setSending(false);
    onClose();
  };

  const copyToClipboard = () => {
    const fullEmail = `Sujet: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullEmail);
    alert('Email copié dans le presse-papiers !');
  };

  if (!isOpen || !client) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {emailTemplates[templateType].title}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Destinataire: <span className="font-semibold">{client.name}</span>
              {client.email && ` (${client.email})`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Stats du client */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Rappel des stats</h3>
            <div className="grid grid-cols-2 gap-4 text-sm text-blue-800">
              <div>
                <span className="font-medium">Prestations:</span> {client.stats?.totalPrestations || 0}
              </div>
              <div>
                <span className="font-medium">CA total:</span> {(client.stats?.totalRevenue || 0).toLocaleString('fr-FR')}€
              </div>
              <div>
                <span className="font-medium">Dernière collab:</span> {client.stats?.lastCollaborationAt?.toLocaleDateString('fr-FR') || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Inactif depuis:</span> {client.stats?.daysInactive || 0} jours
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sujet de l'email
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-gray-900"
              placeholder="Sujet de l'email..."
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Corps du message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={15}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent resize-none text-gray-900"
              placeholder="Votre message..."
            />
          </div>

          {/* Template selector */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                const template = emailTemplates.vip_inactive;
                setSubject(template.subject(client.name));
                setBody(template.body(client));
              }}
              className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 text-sm"
            >
              Template VIP
            </button>
            <button
              onClick={() => {
                const template = emailTemplates.regular_inactive;
                setSubject(template.subject(client.name));
                setBody(template.body(client));
              }}
              className="px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 text-sm"
            >
              Template Standard
            </button>
            <button
              onClick={() => {
                const template = emailTemplates.gentle_reminder;
                setSubject(template.subject(client.name));
                setBody(template.body(client));
              }}
              className="px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200 text-sm"
            >
              Rappel Doux
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Copier
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !subject || !body}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Envoi...' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}
