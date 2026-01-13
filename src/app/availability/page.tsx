'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Copy, Check, Settings } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Booking } from '@/types';

const DEFAULT_TEMPLATES = [
  {
    id: 'friendly',
    name: 'Amical',
    template: `Hey ! 👋

Je voulais te partager mes disponibilités pour {period} :

{availabilities}

Si l'une de ces dates t'intéresse, n'hésite pas à me le dire !

À bientôt ! 🎵`
  },
  {
    id: 'professional',
    name: 'Professionnel',
    template: `Bonjour,

Voici mes disponibilités pour {period} :

{availabilities}

N'hésitez pas à me contacter pour toute demande de réservation.

Cordialement,
DJ [Votre Nom]`
  },
  {
    id: 'club',
    name: 'Club/Boîte',
    template: `Salut l'équipe ! 🎧

Mes dispo pour {period} :

{availabilities}

Toujours chaud pour venir mettre le feu ! 🔥

Peace !`
  },
  {
    id: 'wedding',
    name: 'Mariage/Événement',
    template: `Bonjour,

Je suis disponible pour animer votre événement aux dates suivantes ({period}) :

{availabilities}

Je reste à votre disposition pour échanger sur votre projet et vous proposer une prestation sur-mesure.

Bien cordialement,
DJ [Votre Nom]`
  }
];

export default function AvailabilityPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthsCount, setMonthsCount] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]); // 0=Dimanche, 1=Lundi, etc.
  const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_TEMPLATES[0]);
  const [customTemplate, setCustomTemplate] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadBookings = async () => {
      try {
        const bookingsSnap = await getDocs(collection(db, 'bookings'));
        const bookingsData = bookingsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            start: data.start?.toDate ? data.start.toDate() : new Date(data.start),
            end: data.end?.toDate ? data.end.toDate() : new Date(data.end),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
          } as Booking;
        });
        setBookings(bookingsData);
      } catch (error) {
        console.error('Erreur lors du chargement des réservations:', error);
      } finally {
        setLoading(false);
      }
    };

    loadBookings();
  }, []);

  const getDateRange = () => {
    const now = new Date();
    const start = new Date(now);
    let end = new Date(now);

    end.setMonth(end.getMonth() + monthsCount);

    return { start, end };
  };

  const getPeriodLabel = () => {
    const now = new Date();
    if (monthsCount === 1) {
      return `le mois de ${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
    } else {
      return `les ${monthsCount} prochains mois`;
    }
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const getAvailabilities = () => {
    const { start, end } = getDateRange();
    const occupiedDates = bookings
      .filter(b => b.status !== 'annulé')
      .map(b => new Date(b.start).toDateString());

    const availabilities: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
      const isSelectedDay = selectedDays.includes(dayOfWeek);
      const isNotOccupied = !occupiedDates.includes(current.toDateString());

      if (isSelectedDay && isNotOccupied) {
        availabilities.push(current.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }));
      }
      current.setDate(current.getDate() + 1);
    }

    return availabilities;
  };

  const generateMessage = () => {
    const availabilities = getAvailabilities();
    const template = useCustom ? customTemplate : selectedTemplate.template;

    if (availabilities.length === 0) {
      setGeneratedMessage('Aucune disponibilité trouvée pour cette période.');
      return;
    }

    const availabilityText = availabilities
      .map((date, index) => `${index + 1}. ${date}`)
      .join('\n');

    const message = template
      .replace('{period}', getPeriodLabel())
      .replace('{availabilities}', availabilityText);

    setGeneratedMessage(message);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                DJ Booker Pro
              </span>
            </div>
            <div className="flex gap-6">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/bookings" className="text-gray-600 hover:text-gray-900">
                Réservations
              </Link>
              <Link href="/clients" className="text-gray-600 hover:text-gray-900">
                Clients
              </Link>
              <Link href="/invoices" className="text-gray-600 hover:text-gray-900">
                Factures
              </Link>
              <Link href="/messages" className="text-gray-600 hover:text-gray-900">
                Messages
              </Link>
              <Link href="/availability" className="text-purple-600 font-medium border-b-2 border-purple-600">
                Disponibilités
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Générateur de messages de disponibilités</h1>
          <p className="text-gray-600">Créez des messages professionnels pour partager vos disponibilités</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration */}
          <div className="space-y-6">
            {/* Période */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                Période
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de mois : {monthsCount} mois
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    value={monthsCount}
                    onChange={(e) => setMonthsCount(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>1 mois</span>
                    <span>12 mois</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Jours de la semaine */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                Jours de la semaine
              </h2>
              <div className="grid grid-cols-7 gap-2">
                {[
                  { label: 'L', value: 1, name: 'Lundi' },
                  { label: 'M', value: 2, name: 'Mardi' },
                  { label: 'M', value: 3, name: 'Mercredi' },
                  { label: 'J', value: 4, name: 'Jeudi' },
                  { label: 'V', value: 5, name: 'Vendredi' },
                  { label: 'S', value: 6, name: 'Samedi' },
                  { label: 'D', value: 0, name: 'Dimanche' }
                ].map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`p-3 rounded-lg font-medium transition-all ${
                      selectedDays.includes(day.value)
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={day.name}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Sélectionnez les jours où vous êtes disponible
              </p>
            </div>

            {/* Templates */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-600" />
                Style de message
              </h2>
              <div className="space-y-3">
                {DEFAULT_TEMPLATES.map((template) => (
                  <label
                    key={template.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={!useCustom && selectedTemplate.id === template.id}
                      onChange={() => {
                        setUseCustom(false);
                        setSelectedTemplate(template);
                      }}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <div className="font-medium text-gray-900">{template.name}</div>
                  </label>
                ))}
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="template"
                    checked={useCustom}
                    onChange={() => setUseCustom(true)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <div className="font-medium text-gray-900">Personnalisé</div>
                </label>
              </div>

              {useCustom && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Votre template personnalisé
                  </label>
                  <textarea
                    value={customTemplate}
                    onChange={(e) => setCustomTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm text-gray-900"
                    rows={8}
                    placeholder="Utilisez {period} pour la période et {availabilities} pour la liste des dates"
                  />
                </div>
              )}
            </div>

            <button
              onClick={generateMessage}
              disabled={loading}
              className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Chargement...' : 'Générer le message'}
            </button>
          </div>

          {/* Résultat */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Message généré</h2>
              {generatedMessage && (
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      Copié !
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copier
                    </>
                  )}
                </button>
              )}
            </div>

            {generatedMessage ? (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                  {generatedMessage}
                </pre>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Configurez les paramètres et cliquez sur &quot;Générer le message&quot;</p>
              </div>
            )}

            {generatedMessage && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Astuce:</strong> Vous pouvez modifier le message généré avant de le copier.
                  N&apos;oubliez pas de remplacer [Votre Nom] par votre nom de DJ !
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
