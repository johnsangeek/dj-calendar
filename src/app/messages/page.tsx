'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Copy, Check, Calendar, Sparkles, ArrowLeft } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';

type MessageType = 'disponibilite' | 'relance';

export default function MessagesPage() {
  const [messageType, setMessageType] = useState<MessageType | null>(null);
  const [step, setStep] = useState(0); // 0 = choix type, 1 = style, 2 = jours, 3 = période, 4 = résultat
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthsRange, setMonthsRange] = useState(3); // Jauge de 1 à 12 mois
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [originalMessage, setOriginalMessage] = useState('');
  const [savedMessages, setSavedMessages] = useState<{
    id: string;
    name: string;
    content: string;
    createdAt: string;
  }[]>([]);
  const SAVED_KEY = 'djbooker_saved_messages';

  const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10);
  };
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
    { id: 'lundi', name: 'Lundi', short: 'L' },
    { id: 'mardi', name: 'Mardi', short: 'M' },
    { id: 'mercredi', name: 'Mercredi', short: 'M' },
    { id: 'jeudi', name: 'Jeudi', short: 'J' },
    { id: 'vendredi', name: 'Vendredi', short: 'V' },
    { id: 'samedi', name: 'Samedi', short: 'S' },
    { id: 'dimanche', name: 'Dimanche', short: 'D' },
  ];

  useEffect(() => {
    loadTemplates();
    loadSettings();
    loadBookings();
    loadSavedMessages();
  }, []);

  const loadSavedMessages = () => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedMessages(parsed);
      }
    } catch (error) {
      console.error('Erreur chargement messages sauvegardés:', error);
    }
  };

  const persistSavedMessages = (messages: typeof savedMessages) => {
    setSavedMessages(messages);
    localStorage.setItem(SAVED_KEY, JSON.stringify(messages));
  };

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

      setTemplates(templatesData);

      if (templatesData.length === 0) {
        setTemplates(getDefaultTemplates());
      }
    } catch (error) {
      console.error('Erreur chargement templates:', error);
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
        setDjName('DJ');
        setBasePrice('500');
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
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

    const rangeEndCandidate = new Date(today);
    rangeEndCandidate.setMonth(today.getMonth() + monthsRange);
    const endDate = new Date(rangeEndCandidate.getFullYear(), rangeEndCandidate.getMonth() + 1, 0);

    let currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() + 1);

    // Parcourir toute la période sans limite de nombre de dates
    while (currentDate <= endDate) {
      const dayName = daysOfWeek[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1].id;

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
      const relanceTemplates = getRelanceTemplates();
      const randomTemplate = relanceTemplates[Math.floor(Math.random() * relanceTemplates.length)];

      const periodText = getPeriodText();
      const message = randomTemplate
        .replace('{{availability_period}}', periodText)
        .replace('{{dj_name}}', djName);

      setGeneratedMessage(message);
      setOriginalMessage(message);
      setStep(4);
      return;
    }

    const template = templates.find(t => t.style === selectedStyle);

    if (!template) {
      alert('Erreur: Template non trouvé. Veuillez réessayer.');
      return;
    }

    const datesText = generateDatesText();
    const periodText = getPeriodText();

    let message = template.content
      .replace('{{availability_dates}}', datesText)
      .replace('{{availability_period}}', periodText)
      .replace('{{dj_name}}', djName)
      .replace('{{base_price}}', basePrice);

    setGeneratedMessage(message);
    setOriginalMessage(message);
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
    setOriginalMessage('');
    setCopied(false);
  };

  const handleSaveMessage = () => {
    const content = generatedMessage.trim();
    if (!content) {
      alert('Rien à sauvegarder pour le moment.');
      return;
    }
    const defaultName = `Message du ${new Date().toLocaleString('fr-FR')}`;
    const name = prompt('Nom du message à sauvegarder ?', defaultName);
    if (!name) return;
    const entry = {
      id: generateId(),
      name,
      content,
      createdAt: new Date().toISOString()
    };
    const next = [entry, ...savedMessages];
    persistSavedMessages(next.slice(0, 50)); // limite raisonnable
  };

  const handleInsertSavedMessage = (message: string) => {
    setGeneratedMessage(message);
    setOriginalMessage(message);
    setStep(4);
    setCopied(false);
  };

  const handleDeleteSavedMessage = (id: string) => {
    const next = savedMessages.filter((item) => item.id !== id);
    persistSavedMessages(next);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Retour au tableau de bord"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Générateur de messages</h1>
              <p className="text-gray-600">Crée des messages personnalisés pour tes clients</p>
            </div>
          </div>
          {step > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(step / 4) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-600">Étape {step}/4</span>
            </div>
          )}
        </div>

        {/* Contenu principal */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Step 0: Choisir le type de message */}
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Quel type de message veux-tu générer ?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                  onClick={() => {
                    setMessageType('disponibilite');
                    setStep(1);
                  }}
                  className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8 rounded-xl hover:opacity-90 transition-opacity text-left shadow-lg group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar className="w-10 h-10" />
                    <h3 className="text-2xl font-bold text-gray-900">Message de disponibilité</h3>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Partage tes dates disponibles avec ton style personnalisé. Parfait pour répondre à une demande.
                  </p>
                </button>

                <button
                  onClick={() => {
                    setMessageType('relance');
                    setStep(2);
                  }}
                  className="bg-gradient-to-br from-purple-500 to-pink-600 text-white p-8 rounded-xl hover:opacity-90 transition-opacity text-left shadow-lg group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className="w-10 h-10" />
                    <h3 className="text-2xl font-bold text-gray-900">Message de relance</h3>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    Recontacte d'anciens clients avec un message aléatoire et sympa. Idéal pour réactiver ton réseau.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Choisir le style */}
          {step === 1 && messageType === 'disponibilite' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Choisis ton style de message</h2>
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
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Sélectionne tes disponibilités</h2>
                <p className="text-gray-600 mb-6">Quels jours es-tu disponible ?</p>
                <div className="grid grid-cols-7 gap-3">
                  {daysOfWeek.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => toggleDay(day.id)}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        selectedDays.includes(day.id)
                          ? 'border-purple-600 bg-purple-50 text-purple-700 font-semibold shadow-md'
                          : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      <div className="text-2xl font-bold">{day.short}</div>
                      <div className="text-xs mt-1">{day.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep(messageType === 'relance' ? 0 : 1)}
                  className="flex-1 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedDays.length === 0}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">Sur quelle période ?</h2>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Période de disponibilité
                      </label>
                      <span className="text-3xl font-bold text-purple-600">
                        {monthsRange} mois
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

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
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
                <div className="flex items-center gap-2 mb-6">
                  <h2 className="text-2xl font-semibold text-gray-900">Ton message est prêt !</h2>
                  <span className="text-2xl">🎉</span>
                  {messageType === 'relance' && (
                    <span className="ml-auto text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-medium">
                      Message aléatoire
                    </span>
                  )}
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-purple-50 border-2 border-purple-200 rounded-lg p-6 mb-6 shadow-sm">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ajuste le message si besoin avant de copier :
                  </label>
                  <textarea
                    value={generatedMessage}
                    onChange={(e) => {
                      setGeneratedMessage(e.target.value);
                      setCopied(false);
                    }}
                    rows={10}
                    className="w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-inner focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  {generatedMessage !== originalMessage && (
                    <button
                      onClick={() => {
                        setGeneratedMessage(originalMessage);
                        setCopied(false);
                      }}
                      className="mt-3 text-xs font-medium text-purple-700 underline hover:text-purple-900"
                    >
                      Réinitialiser vers le message généré
                    </button>
                  )}
                </div>

                <button
                  onClick={copyMessage}
                  className={`w-full py-4 rounded-lg transition-all flex items-center justify-center gap-2 font-semibold shadow-md text-lg ${
                    copied
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:scale-105'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-6 h-6" />
                      Copié dans le presse-papier !
                    </>
                  ) : (
                    <>
                      <Copy className="w-6 h-6" />
                      Copier le message
                    </>
                  )}
                </button>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSaveMessage}
                  className="flex-1 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                >
                  Sauvegarder ce message
                </button>
                <button
                  onClick={reset}
                  className="flex-1 py-3 border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium"
                >
                  Nouveau message
                </button>
              </div>

              {savedMessages.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Messages sauvegardés</h3>
                  <div className="space-y-3">
                    {savedMessages.map((item) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-800">{item.name}</h4>
                            <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('fr-FR')}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleInsertSavedMessage(item.content)}
                              className="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700 font-medium hover:bg-purple-200"
                            >
                              Insérer
                            </button>
                            <button
                              onClick={() => handleDeleteSavedMessage(item.id)}
                              className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-600 font-medium hover:bg-red-200"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                        <pre className="whitespace-pre-wrap text-xs text-gray-600">{item.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
