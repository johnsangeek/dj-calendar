'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Copy, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface MessageGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MessageGenerator({ isOpen, onClose }: MessageGeneratorProps) {
  const [step, setStep] = useState(1);
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [period, setPeriod] = useState({ type: 'days', value: 1 });
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [basePrice, setBasePrice] = useState('');
  const [djName, setDjName] = useState('');

  const styles = [
    { id: 'friendly', name: 'Friendly 😊', desc: 'Sympa et décontracté', color: 'bg-blue-500' },
    { id: 'club', name: 'Style Club 🎧', desc: 'Pro et direct', color: 'bg-purple-600' },
    { id: 'amical', name: 'Amical ✨', desc: 'Chaleureux et personnel', color: 'bg-pink-500' },
    { id: 'polis', name: 'Poli/Formel 🎩', desc: 'Professionnel et courtois', color: 'bg-gray-700' },
  ];

  const daysOfWeek = [
    { id: 'lundi', name: 'Lundi', short: 'Lun' },
    { id: 'mardi', name: 'Mardi', short: 'Mar' },
    { id: 'mercredi', name: 'Mercredi', short: 'Mer' },
    { id: 'jeudi', name: 'Jeudi', short: 'Jeu' },
    { id: 'vendredi', name: 'Vendredi', short: 'Ven' },
    { id: 'samedi', name: 'Samedi', short: 'Sam' },
    { id: 'dimanche', name: 'Dimanche', short: 'Dim' },
  ];

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadSettings();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'message_templates'));
      const templatesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter((t: any) => t.type === 'dispo');
      
      console.log('Templates chargés:', templatesData);
      setTemplates(templatesData);
      
      // Si aucun template, utiliser des templates par défaut
      if (templatesData.length === 0) {
        setTemplates(getDefaultTemplates());
      }
    } catch (error) {
      console.error('Erreur chargement templates:', error);
      // Utiliser les templates par défaut en cas d'erreur
      setTemplates(getDefaultTemplates());
    }
  };

  const getDefaultTemplates = () => {
    return [
      {
        id: 'friendly',
        name: 'Disponibilité - Style Friendly',
        type: 'dispo',
        style: 'friendly',
        content: `Hey ! 👋\n\nMerci pour ton message ! Je suis dispo {{availability_period}} :\n{{availability_dates}}\n\nSi ça te convient, on peut se caler un call pour discuter de ton projet !\n\nÀ très vite,\nDJ {{dj_name}} 🎵`
      },
      {
        id: 'club',
        name: 'Disponibilité - Style Club/Pro',
        type: 'dispo',
        style: 'club',
        content: `Salut,\n\nVoici mes disponibilités {{availability_period}} :\n{{availability_dates}}\n\nTarif : À partir de {{base_price}}€\nMatériel pro inclus 🎧\n\nDispo pour en discuter !\n\nDJ {{dj_name}}`
      },
      {
        id: 'amical',
        name: 'Disponibilité - Style Amical',
        type: 'dispo',
        style: 'amical',
        content: `Salut ! 😊\n\nSuper ton message ! Je checke mon planning et voilà mes dispos {{availability_period}} :\n{{availability_dates}}\n\nSi l'une de ces dates te va, on peut se faire un appel pour parler de ton event !\n\nBise,\nDJ {{dj_name}} ✨`
      },
      {
        id: 'polis',
        name: 'Disponibilité - Style Poli/Formel',
        type: 'dispo',
        style: 'polis',
        content: `Bonjour,\n\nJe vous remercie pour votre demande. Voici mes disponibilités {{availability_period}} :\n{{availability_dates}}\n\nJe reste à votre disposition pour échanger sur les détails de votre événement.\n\nCordialement,\nDJ {{dj_name}}`
      }
    ];
  };

  const loadSettings = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'settings'));
      if (!snapshot.empty) {
        const settings = snapshot.docs[0].data();
        setDjName(settings.name || 'DJ');
        setBasePrice(settings.basePrice || '500');
      } else {
        // Valeurs par défaut
        setDjName('DJ');
        setBasePrice('500');
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
      // Valeurs par défaut en cas d'erreur
      setDjName('DJ');
      setBasePrice('500');
    }
  };

  const toggleDay = (dayId: string) => {
    setSelectedDays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  const generateDatesText = () => {
    if (selectedDays.length === 0) return '';

    const today = new Date();
    const dates: string[] = [];
    const daysMap = daysOfWeek.reduce((acc, day) => ({ ...acc, [day.id]: day.name }), {} as Record<string, string>);

    // Calculer la période
    let endDate = new Date();
    if (period.type === 'days') {
      endDate.setDate(today.getDate() + 7 * period.value);
    } else if (period.type === 'months') {
      endDate.setMonth(today.getMonth() + period.value);
    } else if (period.type === 'year') {
      endDate.setFullYear(today.getFullYear() + 1);
    }

    // Trouver les prochaines dates correspondant aux jours sélectionnés
    let currentDate = new Date(today);
    while (currentDate <= endDate && dates.length < 10) {
      const dayName = daysOfWeek[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1].id;
      if (selectedDays.includes(dayName)) {
        const formatted = currentDate.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        });
        dates.push(`• ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}`);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates.join('\n');
  };

  const getPeriodText = () => {
    if (period.type === 'days') {
      return period.value === 1 ? 'cette semaine' : `les ${period.value} prochaines semaines`;
    } else if (period.type === 'months') {
      return period.value === 1 ? 'ce mois' : `les ${period.value} prochains mois`;
    } else {
      return 'cette année';
    }
  };

  const generateMessage = () => {
    console.log('Génération message - Style:', selectedStyle);
    console.log('Templates disponibles:', templates);
    
    const template = templates.find(t => t.style === selectedStyle);
    
    if (!template) {
      console.error('Template non trouvé pour le style:', selectedStyle);
      alert('Erreur: Template non trouvé. Veuillez réessayer.');
      return;
    }

    console.log('Template trouvé:', template);

    const datesText = generateDatesText();
    const periodText = getPeriodText();

    console.log('Dates:', datesText);
    console.log('Période:', periodText);

    let message = template.content
      .replace('{{availability_dates}}', datesText)
      .replace('{{availability_period}}', periodText)
      .replace('{{dj_name}}', djName)
      .replace('{{base_price}}', basePrice);

    console.log('Message généré:', message);

    setGeneratedMessage(message);
    setStep(4);
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setStep(1);
    setSelectedStyle('');
    setSelectedDays([]);
    setPeriod({ type: 'days', value: 1 });
    setGeneratedMessage('');
    setCopied(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 md:p-6 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Générateur de message</h2>
              <p className="text-sm text-gray-600">Étape {step}/4</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="p-4 md:p-6">
          {/* Step 1: Choisir le style */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Choisis ton style de message</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {styles.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => {
                      setSelectedStyle(style.id);
                      setStep(2);
                    }}
                    className={`${style.color} text-white p-6 rounded-xl hover:opacity-90 transition-opacity text-left shadow-lg`}
                  >
                    <h4 className="text-xl font-bold mb-2 text-white">{style.name}</h4>
                    <p className="text-sm text-white opacity-90">{style.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Sélectionner les jours */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sélectionne tes disponibilités</h3>
                <p className="text-gray-600 mb-4">Quels jours es-tu disponible ?</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {daysOfWeek.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => toggleDay(day.id)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        selectedDays.includes(day.id)
                          ? 'border-purple-600 bg-purple-50 text-purple-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      <div className="font-semibold">{day.short}</div>
                      <div className="text-xs mt-1">{day.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedDays.length === 0}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Période */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sur quelle période ?</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type de période</label>
                    <select
                      value={period.type}
                      onChange={(e) => setPeriod({ ...period, type: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    >
                      <option value="days">Semaines</option>
                      <option value="months">Mois</option>
                      <option value="year">Année</option>
                    </select>
                  </div>

                  {period.type !== 'year' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre de {period.type === 'days' ? 'semaines' : 'mois'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={period.type === 'days' ? 12 : 12}
                        value={period.value}
                        onChange={(e) => setPeriod({ ...period, value: parseInt(e.target.value) })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                      />
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      📅 Tu seras dispo <strong>{getPeriodText()}</strong> les <strong>{selectedDays.length} jour(s)</strong> sélectionné(s)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={generateMessage}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Générer le message
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Message généré */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ton message est prêt ! 🎉</h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{generatedMessage}</pre>
                </div>

                <button
                  onClick={copyMessage}
                  className={`w-full py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
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
              </div>

              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Nouveau message
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
