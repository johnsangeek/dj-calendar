'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Copy, Check, ChevronLeft, Sparkles, Edit2, Trash2, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Client } from '@/types';

interface ProspectionMessageGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  prospect: Client | null;
  onMessageCopied?: () => void;
}

type Tone = 'friendly' | 'pro' | 'decontracte' | 'formel';
type EstablishmentType = 'bar' | 'restaurant' | 'rooftop' | 'beach_club' | 'club' | 'hotel' | 'salle_reception' | 'autre';
type Context = 'ete' | 'hiver' | 'toute_annee' | 'evenement_special';

interface ProspectionTemplate {
  id: string;
  name: string;
  tone: Tone;
  type: EstablishmentType;
  context: Context;
  content: string;
  isDefault?: boolean;
}

const tones: { id: Tone; name: string; emoji: string; desc: string; color: string }[] = [
  { id: 'friendly', name: 'Friendly', emoji: '😊', desc: 'Sympa et décontracté', color: 'bg-blue-500' },
  { id: 'pro', name: 'Professionnel', emoji: '💼', desc: 'Sérieux et direct', color: 'bg-purple-600' },
  { id: 'decontracte', name: 'Décontracté', emoji: '🎵', desc: 'Cool et accessible', color: 'bg-pink-500' },
  { id: 'formel', name: 'Formel', emoji: '🎩', desc: 'Courtois et respectueux', color: 'bg-gray-700' },
];

const establishmentTypes: { id: EstablishmentType; name: string; emoji: string }[] = [
  { id: 'bar', name: 'Bar / Lounge', emoji: '🍸' },
  { id: 'restaurant', name: 'Restaurant', emoji: '🍽️' },
  { id: 'rooftop', name: 'Rooftop', emoji: '🌆' },
  { id: 'beach_club', name: 'Beach Club', emoji: '🏖️' },
  { id: 'club', name: 'Club / Discothèque', emoji: '🎧' },
  { id: 'hotel', name: 'Hôtel', emoji: '🏨' },
  { id: 'salle_reception', name: 'Salle de réception', emoji: '🎉' },
  { id: 'autre', name: 'Autre', emoji: '📍' },
];

const contexts: { id: Context; name: string; emoji: string; desc: string }[] = [
  { id: 'ete', name: 'Saison été', emoji: '☀️', desc: 'Mai - Septembre' },
  { id: 'hiver', name: 'Saison hiver', emoji: '❄️', desc: 'Octobre - Avril' },
  { id: 'toute_annee', name: 'Toute l\'année', emoji: '📅', desc: 'Collaboration régulière' },
  { id: 'evenement_special', name: 'Événement spécial', emoji: '🎊', desc: 'Soirée ponctuelle' },
];

const getDefaultTemplates = (): ProspectionTemplate[] => [
  // FRIENDLY
  {
    id: 'friendly_bar_ete',
    name: 'Friendly - Bar - Été',
    tone: 'friendly',
    type: 'bar',
    context: 'ete',
    isDefault: true,
    content: `Hey {{etablissement}} ! 👋

J'espère que vous préparez une belle saison d'été ! Je suis DJ et je serais vraiment chaud pour poser des sons chez vous cet été.

Je mix un peu de tout : house, disco, afro... toujours avec une vibe qui fait danser !

Ça vous dirait qu'on en parle ? 🎵

À très vite,
{{dj_name}}`
  },
  {
    id: 'friendly_rooftop_ete',
    name: 'Friendly - Rooftop - Été',
    tone: 'friendly',
    type: 'rooftop',
    context: 'ete',
    isDefault: true,
    content: `Salut {{etablissement}} ! ☀️

Je viens de découvrir votre rooftop et franchement, la vue a l'air incroyable ! Je suis DJ et je me suis dit que ça pourrait être super de collaborer pour cet été.

J'ai l'habitude de mixer dans ce genre d'ambiance : des sets qui accompagnent le coucher de soleil, du lounge au plus groovy pour la soirée.

Ça vous tente d'en discuter ? 🌅

{{dj_name}}`
  },
  {
    id: 'friendly_beach_ete',
    name: 'Friendly - Beach Club - Été',
    tone: 'friendly',
    type: 'beach_club',
    context: 'ete',
    isDefault: true,
    content: `Hey {{etablissement}} ! 🏖️

La saison approche et je cherche des spots sympas pour mixer cet été ! Votre beach club a l'air parfait.

Je propose des ambiances variées : deep house, tropical, afro... toujours avec le sourire et une bonne énergie.

On se fait un call pour en parler ? 🌴

{{dj_name}}`
  },
  {
    id: 'friendly_club_toute_annee',
    name: 'Friendly - Club - Toute l\'année',
    tone: 'friendly',
    type: 'club',
    context: 'toute_annee',
    isDefault: true,
    content: `Salut {{etablissement}} ! 🎧

Je suis DJ depuis plusieurs années et j'adorerais venir mixer chez vous ! J'ai checké votre programmation et j'ai l'impression qu'on pourrait bien matcher.

Je suis polyvalent : tech house, house, disco, hip-hop... je m'adapte à l'ambiance !

Vous avez des soirées ouvertes à de nouveaux DJs ? 🔥

{{dj_name}}`
  },
  // PRO
  {
    id: 'pro_restaurant_toute_annee',
    name: 'Pro - Restaurant - Toute l\'année',
    tone: 'pro',
    type: 'restaurant',
    context: 'toute_annee',
    isDefault: true,
    content: `Bonjour {{etablissement}},

Je me permets de vous contacter car je suis DJ professionnel et je propose des ambiances musicales adaptées à la restauration.

Je travaille régulièrement avec des établissements comme le vôtre pour créer une atmosphère unique qui sublime l'expérience client.

Seriez-vous disponible pour échanger sur vos besoins ?

Cordialement,
{{dj_name}}`
  },
  {
    id: 'pro_hotel_toute_annee',
    name: 'Pro - Hôtel - Toute l\'année',
    tone: 'pro',
    type: 'hotel',
    context: 'toute_annee',
    isDefault: true,
    content: `Bonjour {{etablissement}},

Je suis DJ professionnel et je propose des prestations musicales haut de gamme pour les établissements hôteliers.

Que ce soit pour vos soirées au bar, vos événements privés ou vos brunchs du dimanche, je m'adapte à l'identité de votre établissement.

Je serais ravi d'échanger sur vos projets et vos besoins.

Bien cordialement,
{{dj_name}}`
  },
  {
    id: 'pro_salle_evenement',
    name: 'Pro - Salle réception - Événement',
    tone: 'pro',
    type: 'salle_reception',
    context: 'evenement_special',
    isDefault: true,
    content: `Bonjour {{etablissement}},

Je suis DJ événementiel et je travaille régulièrement avec des salles de réception pour des mariages, anniversaires et événements corporate.

Je dispose de mon propre matériel professionnel et je m'engage à offrir une prestation de qualité adaptée à chaque événement.

Travaillez-vous avec des prestataires DJ recommandés ? Je serais intéressé pour intégrer votre carnet d'adresses.

Cordialement,
{{dj_name}}`
  },
  // DÉCONTRACTÉ
  {
    id: 'decontracte_bar_hiver',
    name: 'Décontracté - Bar - Hiver',
    tone: 'decontracte',
    type: 'bar',
    context: 'hiver',
    isDefault: true,
    content: `Yo {{etablissement}} ! 🎵

J'espère que vous passez un bon hiver ! Je suis DJ et je cherche des spots sympas pour poser des vinyles cet hiver.

Je mix pas mal de trucs : nu-disco, soul, funk... des vibes chaleureuses parfaites pour les soirées d'hiver.

Ça vous dit qu'on se fasse un café pour en parler ?

Peace,
{{dj_name}}`
  },
  {
    id: 'decontracte_autre_evenement',
    name: 'Décontracté - Autre - Événement',
    tone: 'decontracte',
    type: 'autre',
    context: 'evenement_special',
    isDefault: true,
    content: `Hello {{etablissement}} ! ✨

Je suis DJ et je cherche toujours des nouveaux lieux où poser mes platines ! Votre spot a l'air cool.

Je suis ouvert à tout type de collab : soirée one-shot, résidence, événement privé... on voit ce qui vous arrange !

Ça te dit qu'on en discute ? 🎶

{{dj_name}}`
  },
  // FORMEL
  {
    id: 'formel_hotel_ete',
    name: 'Formel - Hôtel - Été',
    tone: 'formel',
    type: 'hotel',
    context: 'ete',
    isDefault: true,
    content: `Madame, Monsieur,

Je me permets de vous adresser ma candidature en tant que DJ pour la saison estivale de votre établissement.

Fort d'une expérience significative dans l'animation musicale hôtelière, je propose des prestations élégantes et adaptées à une clientèle exigeante.

Je reste à votre entière disposition pour vous présenter mon travail et discuter de vos attentes.

Veuillez agréer l'expression de mes salutations distinguées,
{{dj_name}}`
  },
  {
    id: 'formel_restaurant_hiver',
    name: 'Formel - Restaurant - Hiver',
    tone: 'formel',
    type: 'restaurant',
    context: 'hiver',
    isDefault: true,
    content: `Madame, Monsieur,

Je souhaite vous proposer mes services de DJ pour accompagner l'ambiance de votre restaurant durant la saison hivernale.

Je privilégie une approche musicale subtile et raffinée, en accord avec l'atmosphère de votre établissement.

Je serais honoré de pouvoir échanger avec vous sur cette proposition.

Respectueusement,
{{dj_name}}`
  },
  // TEMPLATES GÉNÉRIQUES
  {
    id: 'generic_relance_ete',
    name: 'Relance Saison Été',
    tone: 'friendly',
    type: 'autre',
    context: 'ete',
    isDefault: true,
    content: `Hey {{etablissement}} ! ☀️

L'été approche à grands pas et je me disais que c'était le bon moment pour reprendre contact !

J'ai quelques dispos sympas pour la saison et je serais vraiment chaud pour bosser ensemble.

Vous avez déjà votre programmation en place ou il reste de la place ? 🎵

À très vite j'espère,
{{dj_name}}`
  },
  {
    id: 'generic_relance_hiver',
    name: 'Relance Saison Hiver',
    tone: 'friendly',
    type: 'autre',
    context: 'hiver',
    isDefault: true,
    content: `Salut {{etablissement}} ! ❄️

J'espère que vous avez passé une belle saison d'été ! La saison d'hiver démarre et je voulais reprendre contact.

Je suis dispo pour des soirées régulières ou des events ponctuels si ça vous intéresse.

On en discute ? 🎶

{{dj_name}}`
  },
  {
    id: 'generic_presentation',
    name: 'Présentation Générique',
    tone: 'pro',
    type: 'autre',
    context: 'toute_annee',
    isDefault: true,
    content: `Bonjour {{etablissement}},

Je me présente, je suis {{dj_name}}, DJ professionnel.

Je propose des prestations musicales adaptées à tous types d'établissements : bars, restaurants, clubs, hôtels, événements privés...

Je serais ravi de collaborer avec vous et de découvrir votre univers.

N'hésitez pas à me contacter pour en discuter.

Cordialement,
{{dj_name}}`
  },
  {
    id: 'generic_relance_silence',
    name: 'Relance après silence',
    tone: 'friendly',
    type: 'autre',
    context: 'toute_annee',
    isDefault: true,
    content: `Hey {{etablissement}} ! 👋

Je me permets de revenir vers vous suite à mon précédent message.

Je comprends que vous devez être très sollicités, mais je voulais juste m'assurer que mon message vous était bien parvenu !

Si jamais vous avez des besoins en DJ, je reste disponible.

Belle journée,
{{dj_name}}`
  },
];

export default function ProspectionMessageGenerator({ isOpen, onClose, prospect, onMessageCopied }: ProspectionMessageGeneratorProps) {
  const [step, setStep] = useState(1);
  const [selectedTone, setSelectedTone] = useState<Tone | null>(null);
  const [selectedType, setSelectedType] = useState<EstablishmentType | null>(null);
  const [selectedContext, setSelectedContext] = useState<Context | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [djName, setDjName] = useState('');
  const [templates, setTemplates] = useState<ProspectionTemplate[]>([]);
  const [customTemplates, setCustomTemplates] = useState<ProspectionTemplate[]>([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProspectionTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', content: '' });

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadTemplates();
      reset();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'settings'));
      if (!snapshot.empty) {
        const settings = snapshot.docs[0].data();
        setDjName(settings.stageName || settings.name || 'DJ');
      } else {
        setDjName('DJ');
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
      setDjName('DJ');
    }
  };

  const loadTemplates = () => {
    const defaults = getDefaultTemplates();
    try {
      const saved = localStorage.getItem('custom_prospection_templates');
      if (saved) {
        const custom = JSON.parse(saved) as ProspectionTemplate[];
        setCustomTemplates(custom);
        setTemplates([...defaults, ...custom]);
      } else {
        setTemplates(defaults);
      }
    } catch (error) {
      console.error('Erreur chargement templates custom:', error);
      setTemplates(defaults);
    }
  };

  const saveCustomTemplates = (newCustom: ProspectionTemplate[]) => {
    try {
      localStorage.setItem('custom_prospection_templates', JSON.stringify(newCustom));
      setCustomTemplates(newCustom);
      setTemplates([...getDefaultTemplates(), ...newCustom]);
    } catch (error) {
      console.error('Erreur sauvegarde templates:', error);
    }
  };

  const findBestTemplate = (): ProspectionTemplate | null => {
    if (!selectedTone || !selectedType || !selectedContext) return null;

    // Chercher un template exact
    let template = templates.find(
      t => t.tone === selectedTone && t.type === selectedType && t.context === selectedContext
    );

    // Si pas de match exact, chercher par tone + type
    if (!template) {
      template = templates.find(
        t => t.tone === selectedTone && t.type === selectedType
      );
    }

    // Si toujours pas, chercher par tone + context
    if (!template) {
      template = templates.find(
        t => t.tone === selectedTone && t.context === selectedContext
      );
    }

    // Fallback sur le tone seul
    if (!template) {
      template = templates.find(t => t.tone === selectedTone);
    }

    // Fallback absolu
    if (!template) {
      template = templates.find(t => t.id === 'generic_presentation');
    }

    return template || templates[0] || null;
  };

  const generateMessage = () => {
    const template = findBestTemplate();
    if (!template) {
      alert('Aucun template trouvé. Veuillez réessayer.');
      return;
    }

    const prospectName = prospect?.name || 'Établissement';
    let message = template.content
      .replace(/\{\{etablissement\}\}/g, prospectName)
      .replace(/\{\{nom\}\}/g, prospectName)
      .replace(/\{\{dj_name\}\}/g, djName);

    setGeneratedMessage(message);
    setStep(5);
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onMessageCopied?.();
  };

  const reset = () => {
    setStep(1);
    setSelectedTone(null);
    setSelectedType(null);
    setSelectedContext(null);
    setGeneratedMessage('');
    setCopied(false);
    setShowTemplateManager(false);
    setEditingTemplate(null);
    setTemplateForm({ name: '', content: '' });
  };

  const handleSaveTemplate = () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) {
      alert('Le nom et le contenu sont requis');
      return;
    }

    if (!selectedTone || !selectedType || !selectedContext) {
      alert('Veuillez sélectionner un ton, un type et un contexte');
      return;
    }

    const newTemplate: ProspectionTemplate = {
      id: editingTemplate?.id || `custom_${Date.now()}`,
      name: templateForm.name,
      tone: selectedTone,
      type: selectedType,
      context: selectedContext,
      content: templateForm.content,
      isDefault: false,
    };

    let newCustom: ProspectionTemplate[];
    if (editingTemplate) {
      newCustom = customTemplates.map(t => t.id === editingTemplate.id ? newTemplate : t);
    } else {
      newCustom = [...customTemplates, newTemplate];
    }

    saveCustomTemplates(newCustom);
    setEditingTemplate(null);
    setTemplateForm({ name: '', content: '' });
    setShowTemplateManager(false);
    alert(editingTemplate ? 'Template modifié !' : 'Template créé !');
  };

  const handleDeleteTemplate = (id: string) => {
    if (!confirm('Supprimer ce template ?')) return;
    const newCustom = customTemplates.filter(t => t.id !== id);
    saveCustomTemplates(newCustom);
  };

  const openEditTemplate = (template: ProspectionTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, content: template.content });
    setSelectedTone(template.tone);
    setSelectedType(template.type);
    setSelectedContext(template.context);
    setShowTemplateManager(true);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 md:p-6 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Message de prospection</h2>
              <p className="text-sm text-gray-600">
                {prospect ? `Pour ${prospect.name}` : 'Étape ' + step + '/5'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Step 1: Choisir le ton */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">1. Choisis le ton du message</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tones.map((tone) => (
                  <button
                    key={tone.id}
                    onClick={() => {
                      setSelectedTone(tone.id);
                      setStep(2);
                    }}
                    className={`${tone.color} text-white p-6 rounded-xl hover:opacity-90 transition-all text-left shadow-lg hover:scale-[1.02]`}
                  >
                    <h4 className="text-xl font-bold mb-2 text-white">{tone.emoji} {tone.name}</h4>
                    <p className="text-sm text-white opacity-90">{tone.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Type d'établissement */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(1)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h3 className="text-lg font-semibold text-gray-900">2. Type d'établissement</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {establishmentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setSelectedType(type.id);
                      setStep(3);
                    }}
                    className="p-4 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-center"
                  >
                    <div className="text-3xl mb-2">{type.emoji}</div>
                    <div className="text-sm font-medium text-gray-900">{type.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Contexte/Saison */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(2)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h3 className="text-lg font-semibold text-gray-900">3. Contexte / Saison</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contexts.map((ctx) => (
                  <button
                    key={ctx.id}
                    onClick={() => {
                      setSelectedContext(ctx.id);
                      setStep(4);
                    }}
                    className="p-4 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{ctx.emoji}</span>
                      <div>
                        <div className="font-semibold text-gray-900">{ctx.name}</div>
                        <div className="text-sm text-gray-600">{ctx.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Preview et personnalisation */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(3)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h3 className="text-lg font-semibold text-gray-900">4. Récapitulatif</h3>
              </div>

              {/* Résumé des choix */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-purple-700 font-medium">Ton:</span>
                  <span className="text-sm text-purple-900">{tones.find(t => t.id === selectedTone)?.emoji} {tones.find(t => t.id === selectedTone)?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-purple-700 font-medium">Type:</span>
                  <span className="text-sm text-purple-900">{establishmentTypes.find(t => t.id === selectedType)?.emoji} {establishmentTypes.find(t => t.id === selectedType)?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-purple-700 font-medium">Contexte:</span>
                  <span className="text-sm text-purple-900">{contexts.find(c => c.id === selectedContext)?.emoji} {contexts.find(c => c.id === selectedContext)?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-purple-700 font-medium">Pour:</span>
                  <span className="text-sm text-purple-900 font-semibold">{prospect?.name || 'Établissement'}</span>
                </div>
              </div>

              {/* Preview du template */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-2">Aperçu du message :</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
                  {findBestTemplate()?.content
                    .replace(/\{\{etablissement\}\}/g, prospect?.name || 'Établissement')
                    .replace(/\{\{nom\}\}/g, prospect?.name || 'Établissement')
                    .replace(/\{\{dj_name\}\}/g, djName)}
                </pre>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={generateMessage}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
                >
                  Générer le message
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Message généré */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ton message est prêt ! 🎉</h3>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{generatedMessage}</pre>
              </div>

              <button
                onClick={copyMessage}
                className={`w-full py-3 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copié !
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copier le message
                  </>
                )}
              </button>

              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                >
                  Nouveau message
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}

          {/* Template Manager */}
          {showTemplateManager && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setShowTemplateManager(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingTemplate ? 'Modifier le template' : 'Nouveau template'}
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nom du template</label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Ex: Mon template perso"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contenu du message</label>
                  <textarea
                    value={templateForm.content}
                    onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                    placeholder="Utilise {{etablissement}} et {{dj_name}} comme variables"
                    rows={8}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Variables disponibles: {"{{etablissement}}"}, {"{{dj_name}}"}
                  </p>
                </div>

                <button
                  onClick={handleSaveTemplate}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
                >
                  {editingTemplate ? 'Enregistrer les modifications' : 'Créer le template'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer avec bouton de gestion templates */}
        {step < 5 && !showTemplateManager && (
          <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
            <button
              onClick={() => {
                setShowTemplateManager(true);
                setEditingTemplate(null);
                setTemplateForm({ name: '', content: '' });
              }}
              className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800"
            >
              <Plus className="w-4 h-4" />
              Créer mon template
            </button>

            {customTemplates.length > 0 && (
              <div className="text-sm text-gray-600">
                {customTemplates.length} template(s) perso
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
