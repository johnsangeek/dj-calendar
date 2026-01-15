'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Copy, Check, Calendar, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface MessageGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

type MessageType = 'disponibilite' | 'relance';

export default function MessageGenerator({ isOpen, onClose }: MessageGeneratorProps) {
  const [messageType, setMessageType] = useState<MessageType | null>(null);
  const [step, setStep] = useState(0); // 0 = choix type, 1 = style, 2 = jours, 3 = période, 4 = résultat
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthsRange, setMonthsRange] = useState(3); // Jauge de 1 à 12 mois
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [basePrice, setBasePrice] = useState('');
  const [djName, setDjName] = useState('');
  const [bookings, setBookings] = useState<any[]>([]);

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
      loadBookings();
    }
  }, [isOpen]);

  const loadBookings = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'bookings'));
      const bookingsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          start: data.start?.toDate ? data.start.toDate() : new Date(data.start),
          end: data.end?.toDate ? data.end.toDate() : new Date(data.end),
        };
      });
      setBookings(bookingsData);
    } catch (error) {
      console.error('Erreur chargement bookings:', error);
    }
  };

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

  const getRelanceTemplates = () => {
    return [
      `Hey ! 👋\n\nÇa fait un moment qu'on s'est pas vu ! J'espère que tout roule de ton côté.\n\nJ'ai quelques dates dispo {{availability_period}}, si jamais tu as un projet qui se profile 😊\n\nDonne-moi des news !\n\nDJ {{dj_name}} 🎵`,

      `Salut ! 😊\n\nJe pensais à toi en regardant mon planning ! On a fait de super soirées ensemble et j'adorerais remettre ça.\n\nJe suis libre {{availability_period}} si tu as quelque chose qui se prépare.\n\nBise,\nDJ {{dj_name}} ✨`,

      `Hello ! 🎉\n\nLe planning se remplit doucement et je me suis dit que ça pourrait t'intéresser de caler une date avant que tout parte !\n\nDispos {{availability_period}}.\n\nÀ très vite j'espère !\nDJ {{dj_name}}`,

      `Coucou ! 👋\n\nJ'espère que tu vas bien ! Ça me ferait super plaisir de bosser à nouveau avec toi.\n\nQuelques créneaux se sont libérés {{availability_period}}, si jamais ça peut matcher avec un de tes events !\n\nHâte d'avoir de tes nouvelles,\nDJ {{dj_name}} 🎶`,

      `Salut ! 🎧\n\nLe temps passe vite ! J'ai repensé à nos dernières collabs et j'adorerais qu'on en refasse une prochainement.\n\nMon planning est ouvert {{availability_period}}.\n\nOn se fait signe ?\nDJ {{dj_name}}`,

      `Hey ! ✨\n\nComment ça va de ton côté ? J'ai quelques dates qui se sont libérées et je me suis dit direct à toi !\n\nDispo {{availability_period}} si tu veux qu'on se recale une soirée de folie 🔥\n\nBise,\nDJ {{dj_name}}`,
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

  const isDateAvailable = (date: Date) => {
    // Vérifier si cette date n'a pas déjà un booking confirmé
    return !bookings.some(booking => {
      const bookingDate = new Date(booking.start);
      return (
        bookingDate.toDateString() === date.toDateString() &&
        (booking.status === 'confirmé' || booking.status === 'terminé')
      );
    });
  };

  const generateDatesText = () => {
    if (selectedDays.length === 0) return '';

    const today = new Date();
    const dates: string[] = [];

    // Calculer la période en mois
    let endDate = new Date(today);
    endDate.setMonth(today.getMonth() + monthsRange);

    // Trouver les prochaines dates correspondant aux jours sélectionnés ET disponibles
    let currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() + 1); // Commencer demain

    // Parcourir toute la période sans limite de nombre de dates
    while (currentDate <= endDate) {
      const dayName = daysOfWeek[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1].id;

      // Vérifier si le jour est sélectionné ET disponible dans le calendrier
      if (selectedDays.includes(dayName) && isDateAvailable(currentDate)) {
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
    if (monthsRange === 1) {
      return 'ce mois';
    } else if (monthsRange === 12) {
      return "cette année";
    } else {
      return `les ${monthsRange} prochains mois`;
    }
  };

  const generateMessage = () => {
    if (messageType === 'relance') {
      // Message de relance : choisir un template aléatoire
      const relanceTemplates = getRelanceTemplates();
      const randomTemplate = relanceTemplates[Math.floor(Math.random() * relanceTemplates.length)];

      const periodText = getPeriodText();
      const message = randomTemplate
        .replace('{{availability_period}}', periodText)
        .replace('{{dj_name}}', djName);

      setGeneratedMessage(message);
      setStep(4);
      return;
    }

    // Message de disponibilité
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
    setStep(0);
    setMessageType(null);
    setSelectedStyle('');
    setSelectedDays([]);
    setMonthsRange(3);
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
          {/* Step 0: Choisir le type de message */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quel type de message veux-tu générer ?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setMessageType('disponibilite');
                    setStep(1);
                  }}
                  className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8 rounded-xl hover:opacity-90 transition-opacity text-left shadow-lg group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar className="w-8 h-8" />
                    <h4 className="text-2xl font-bold">Message de disponibilité</h4>
                  </div>
                  <p className="text-sm text-white/90">
                    Partage tes dates disponibles avec ton style personnalisé. Parfait pour répondre à une demande.
                  </p>
                </button>

                <button
                  onClick={() => {
                    setMessageType('relance');
                    setStep(2); // Skip style selection for relance
                  }}
                  className="bg-gradient-to-br from-purple-500 to-pink-600 text-white p-8 rounded-xl hover:opacity-90 transition-opacity text-left shadow-lg group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className="w-8 h-8" />
                    <h4 className="text-2xl font-bold">Message de relance</h4>
                  </div>
                  <p className="text-sm text-white/90">
                    Recontacte d'anciens clients avec un message aléatoire et sympa. Idéal pour réactiver ton réseau.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Choisir le style (uniquement pour disponibilité) */}
          {step === 1 && messageType === 'disponibilite' && (
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

          {/* Step 3: Période avec jauge visuelle */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sur quelle période ?</h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Période de disponibilité
                      </label>
                      <span className="text-2xl font-bold text-purple-600">
                        {monthsRange} {monthsRange === 1 ? 'mois' : 'mois'}
                      </span>
                    </div>

                    {/* Jauge visuelle */}
                    <div className="relative">
                      <input
                        type="range"
                        min="1"
                        max="12"
                        value={monthsRange}
                        onChange={(e) => setMonthsRange(parseInt(e.target.value))}
                        className="w-full h-3 bg-gradient-to-r from-purple-200 via-purple-400 to-purple-600 rounded-lg appearance-none cursor-pointer slider"
                        style={{
                          background: `linear-gradient(to right, #9333ea 0%, #9333ea ${((monthsRange - 1) / 11) * 100}%, #e9d5ff ${((monthsRange - 1) / 11) * 100}%, #e9d5ff 100%)`
                        }}
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-2">
                        <span>1 mois</span>
                        <span>6 mois</span>
                        <span>12 mois</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-sm text-gray-800">
                      📅 {messageType === 'disponibilite' ? 'Disponibilités' : 'Message'} <strong>{getPeriodText()}</strong>
                      {messageType === 'disponibilite' && selectedDays.length > 0 && (
                        <> pour les <strong>{selectedDays.length} jour(s)</strong> sélectionné(s)</>
                      )}
                    </p>
                    {messageType === 'disponibilite' && (
                      <p className="text-xs text-gray-600 mt-2">
                        💡 Les dates affichées seront automatiquement filtrées selon ton calendrier (réservations confirmées exclues)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(messageType === 'relance' ? 0 : 2)}
                  className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={generateMessage}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 transition-opacity font-semibold"
                >
                  ✨ Générer le message
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Message généré */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Ton message est prêt !</h3>
                  <span className="text-2xl">🎉</span>
                  {messageType === 'relance' && (
                    <span className="ml-auto text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                      Message aléatoire
                    </span>
                  )}
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-purple-50 border-2 border-purple-200 rounded-lg p-5 mb-4 shadow-sm">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">{generatedMessage}</pre>
                </div>

                <button
                  onClick={copyMessage}
                  className={`w-full py-3 rounded-lg transition-all flex items-center justify-center gap-2 font-semibold shadow-md ${
                    copied
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:scale-105'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-5 h-5" />
                      Copié dans le presse-papier !
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
                  className="flex-1 py-3 border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium"
                >
                  Nouveau message
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
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
