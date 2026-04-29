'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Client, Booking } from '@/types';
import { Plus, Edit2, Trash2, Calendar as CalendarIcon, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { TopNav } from '@/components/TopNav';

const STATUS_COLORS = {
  'option': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'confirmé': 'bg-green-100 text-green-800 border-green-300',
  'annulé': 'bg-red-100 text-red-800 border-red-300',
  'terminé': 'bg-gray-100 text-gray-800 border-gray-300',
  'remplaçant': 'bg-orange-100 text-orange-800 border-orange-300'
} as const;

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const getFrenchHolidaysForYear = (year: number): Set<string> => {
  const easter = getEasterSunday(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  const ascension = new Date(easter);
  ascension.setDate(ascension.getDate() + 39);
  const pentecostMonday = new Date(easter);
  pentecostMonday.setDate(pentecostMonday.getDate() + 50);

  const holidays = [
    new Date(year, 0, 1),
    easterMonday,
    new Date(year, 4, 1),
    new Date(year, 4, 8),
    ascension,
    pentecostMonday,
    new Date(year, 6, 14),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 10, 11),
    new Date(year, 11, 25),
  ];

  return new Set(holidays.map(toDateKey));
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    clientId: '',
    start: '',
    end: '',
    price: 0,
    deposit: 0,
    status: 'option' as 'option' | 'confirmé' | 'annulé' | 'terminé' | 'remplaçant',
    location: '',
    notes: ''
  });

  // Disponibilités
  const [showAvailability, setShowAvailability] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['vendredi', 'samedi']);
  const [monthsRange, setMonthsRange] = useState(3);
  const [copiedType, setCopiedType] = useState<'dispo' | 'indispo' | 'all' | null>(null);

  const daysOfWeek = [
    { id: 'lundi', short: 'L', name: 'Lundi' },
    { id: 'mardi', short: 'M', name: 'Mardi' },
    { id: 'mercredi', short: 'Me', name: 'Mercredi' },
    { id: 'jeudi', short: 'J', name: 'Jeudi' },
    { id: 'vendredi', short: 'V', name: 'Vendredi' },
    { id: 'samedi', short: 'S', name: 'Samedi' },
    { id: 'dimanche', short: 'D', name: 'Dimanche' },
  ];

  const jsToFrDay = (jsDay: number) => daysOfWeek[jsDay === 0 ? 6 : jsDay - 1].id;

  const getBookingForDate = (date: Date) =>
    bookings.find((b) => {
      if (b.status !== 'confirmé' && b.status !== 'terminé' && b.status !== 'option') return false;
      const bDate = new Date(b.start);
      return bDate.toDateString() === date.toDateString();
    });

  const { availableDates, unavailableDates } = useMemo(() => {
    if (selectedDays.length === 0) return { availableDates: [] as string[], unavailableDates: [] as { date: string; label: string }[] };

    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(today.getMonth() + monthsRange);
    // Aller jusqu'à la fin du mois
    endDate.setDate(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate());

    const available: string[] = [];
    const unavailable: { date: string; label: string }[] = [];

    const current = new Date(today);
    current.setDate(current.getDate() + 1);

    while (current <= endDate) {
      const dayId = jsToFrDay(current.getDay());
      if (selectedDays.includes(dayId)) {
        const formatted = current.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
        const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);

        const booking = getBookingForDate(current);
        if (booking) {
          const label = booking.title + (booking.location ? ` - ${booking.location}` : '');
          unavailable.push({ date: capitalized, label });
        } else {
          available.push(capitalized);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return { availableDates: available, unavailableDates: unavailable };
  }, [bookings, selectedDays, monthsRange]);

  const getPeriodText = () => {
    if (monthsRange === 1) return 'le prochain mois';
    if (monthsRange === 12) return "l'année à venir";
    return `les ${monthsRange} prochains mois`;
  };

  const buildDispoText = () => {
    if (availableDates.length === 0) return '';
    return `Mes disponibilités (${getPeriodText()}) :\n${availableDates.map((d) => `• ${d}`).join('\n')}`;
  };

  const buildIndispoText = () => {
    if (unavailableDates.length === 0) return '';
    return `Mes dates réservées (${getPeriodText()}) :\n${unavailableDates.map((d) => `• ${d.date} — ${d.label}`).join('\n')}`;
  };

  const handleCopy = async (type: 'dispo' | 'indispo' | 'all') => {
    let text = '';
    if (type === 'dispo') text = buildDispoText();
    else if (type === 'indispo') text = buildIndispoText();
    else text = [buildDispoText(), buildIndispoText()].filter(Boolean).join('\n\n');

    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [bookingsSnap, clientsSnap] = await Promise.all([
      getDocs(collection(db, 'bookings')),
      getDocs(collection(db, 'clients'))
    ]);

    const bookingsData = bookingsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      start: doc.data().start?.toDate(),
      end: doc.data().end?.toDate()
    })) as Booking[];
    
    setBookings(bookingsData.sort((a, b) => a.start.getTime() - b.start.getTime()));
    setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bookingData = {
      ...formData,
      start: new Date(formData.start),
      end: new Date(formData.end),
      price: Number(formData.price),
      deposit: Number(formData.deposit),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (editing) {
      await updateDoc(doc(db, 'bookings', editing), bookingData);
    } else {
      await addDoc(collection(db, 'bookings'), bookingData);
    }

    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer ce booking ?')) {
      await deleteDoc(doc(db, 'bookings', id));
      loadData();
    }
  };

  const startEdit = (booking: Booking) => {
    setEditing(booking.id);
    setFormData({
      title: booking.title,
      clientId: booking.clientId || '',
      start: booking.start.toISOString().slice(0, 16),
      end: booking.end.toISOString().slice(0, 16),
      price: booking.price,
      deposit: booking.deposit,
      status: booking.status,
      location: booking.location || '',
      notes: booking.notes || ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      clientId: '',
      start: '',
      end: '',
      price: 0,
      deposit: 0,
      status: 'option',
      location: '',
      notes: ''
    });
    setEditing(null);
    setShowForm(false);
  };

  const groupByMonth = () => {
    const grouped: { [key: string]: Booking[] } = {};
    upcomingBookings.forEach(booking => {
      const key = booking.start.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(booking);
    });
    return grouped;
  };

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return bookings
      .filter((booking) => booking.end >= now && booking.status !== 'annulé')
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [bookings]);

  const holidaysIndex = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return new Set([
      ...getFrenchHolidaysForYear(currentYear - 1),
      ...getFrenchHolidaysForYear(currentYear),
      ...getFrenchHolidaysForYear(currentYear + 1),
      ...getFrenchHolidaysForYear(currentYear + 2),
    ]);
  }, []);

  const getMonthOccupancy = (monthBookings: Booking[]) => {
    if (monthBookings.length === 0) {
      return {
        occupiedV: 0,
        totalV: 0,
        occupiedS: 0,
        totalS: 0,
        occupiedVF: 0,
        totalVF: 0,
        occupiedJ: 0,
        totalJ: 0,
      };
    }

    const year = monthBookings[0].start.getFullYear();
    const month = monthBookings[0].start.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const vSlots = new Set<string>(); // Vendredis
    const sSlots = new Set<string>(); // Samedis
    const vfSlots = new Set<string>(); // Veilles fériées
    const jSlots = new Set<string>(); // Jeudis

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dow = date.getDay();
      const dateKey = toDateKey(date);
      const isHoliday = holidaysIndex.has(dateKey);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const isHolidayEve = holidaysIndex.has(toDateKey(nextDay));
      const isThursday = dow === 4;
      const isFriday = dow === 5;
      const isSaturday = dow === 6;

      // Logique exclusive demandée:
      // VF seule > V seule > S seule > J seul
      if (isHolidayEve) {
        vfSlots.add(dateKey);
      } else if (isFriday) {
        vSlots.add(dateKey);
      } else if (isSaturday) {
        sSlots.add(dateKey);
      } else if (isThursday && !isHoliday) {
        jSlots.add(dateKey);
      }
    }

    const bookedDates = new Set(
      monthBookings
        .filter((b) => b.status !== 'annulé')
        .map((b) => toDateKey(new Date(b.start)))
    );

    let occupiedV = 0;
    for (const dateKey of vSlots) {
      if (bookedDates.has(dateKey)) occupiedV += 1;
    }

    let occupiedS = 0;
    for (const dateKey of sSlots) {
      if (bookedDates.has(dateKey)) occupiedS += 1;
    }

    let occupiedVF = 0;
    for (const dateKey of vfSlots) {
      if (bookedDates.has(dateKey)) occupiedVF += 1;
    }

    let occupiedJ = 0;
    for (const dateKey of jSlots) {
      if (bookedDates.has(dateKey)) occupiedJ += 1;
    }

    return {
      occupiedV,
      totalV: vSlots.size,
      occupiedS,
      totalS: sSlots.size,
      occupiedVF,
      totalVF: vfSlots.size,
      occupiedJ,
      totalJ: jSlots.size,
    };
  };

  return (
    <div className="min-h-screen bg-apple-bg">
      <TopNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">📅 Bookings</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAvailability(!showAvailability)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showAvailability
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <CalendarIcon size={18} />
              Mes dispos
              {showAvailability ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={20} />
              {showForm ? 'Annuler' : 'Nouveau booking'}
            </button>
          </div>
        </div>

        {/* Section Disponibilités */}
        {showAvailability && (
          <div className="ui-card p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Disponibilités & Indisponibilités</h2>

            {/* Période */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Période</label>
                <span className="text-lg font-bold text-blue-600">{monthsRange} mois</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                value={monthsRange}
                onChange={(e) => setMonthsRange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1 mois</span>
                <span>6 mois</span>
                <span>12 mois</span>
              </div>
            </div>

            {/* Jours */}
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Jours</label>
              <div className="flex gap-2">
                {daysOfWeek.map((day) => {
                  const isSelected = selectedDays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      onClick={() =>
                        setSelectedDays((prev) =>
                          isSelected ? prev.filter((d) => d !== day.id) : [...prev, day.id]
                        )
                      }
                      className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={day.name}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Résultats en deux colonnes */}
            {selectedDays.length > 0 && (
              <>
                <div className="grid md:grid-cols-2 gap-4 mb-5">
                  {/* Disponible */}
                  <div className="border border-green-200 rounded-xl p-4 bg-green-50/50">
                    <h3 className="text-sm font-semibold text-green-700 mb-3">
                      Disponible ({availableDates.length})
                    </h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {availableDates.length > 0 ? (
                        availableDates.map((date, i) => (
                          <p key={i} className="text-sm text-gray-700">• {date}</p>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400 italic">Aucune date disponible</p>
                      )}
                    </div>
                  </div>

                  {/* Indisponible */}
                  <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
                    <h3 className="text-sm font-semibold text-red-700 mb-3">
                      Indisponible ({unavailableDates.length})
                    </h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {unavailableDates.length > 0 ? (
                        unavailableDates.map((d, i) => (
                          <p key={i} className="text-sm text-gray-700">
                            • {d.date} — <span className="text-red-600 font-medium">{d.label}</span>
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400 italic">Aucune date réservée</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Boutons copier */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleCopy('dispo')}
                    disabled={availableDates.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      copiedType === 'dispo'
                        ? 'bg-brand-600 text-white'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {copiedType === 'dispo' ? <Check size={16} /> : <Copy size={16} />}
                    {copiedType === 'dispo' ? 'Copié !' : 'Copier les dispos'}
                  </button>
                  <button
                    onClick={() => handleCopy('indispo')}
                    disabled={unavailableDates.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      copiedType === 'indispo'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {copiedType === 'indispo' ? <Check size={16} /> : <Copy size={16} />}
                    {copiedType === 'indispo' ? 'Copié !' : 'Copier les indispos'}
                  </button>
                  <button
                    onClick={() => handleCopy('all')}
                    disabled={availableDates.length === 0 && unavailableDates.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      copiedType === 'all'
                        ? 'bg-brand-600 text-white'
                        : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                    }`}
                  >
                    {copiedType === 'all' ? <Check size={16} /> : <Copy size={16} />}
                    {copiedType === 'all' ? 'Copié !' : 'Copier tout'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="ui-card p-6 mb-8">
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Titre *"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />
              
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              >
                <option value="">Sélectionner un client</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={formData.start}
                onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <input
                type="datetime-local"
                value={formData.end}
                onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <input
                type="number"
                placeholder="Prix (€)"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                required
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <input
                type="number"
                placeholder="Acompte (€)"
                value={formData.deposit}
                onChange={(e) => setFormData({ ...formData, deposit: Number(e.target.value) })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              />

              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              >
                <option value="option">Option</option>
                <option value="confirmé">Confirmé</option>
                <option value="annulé">Annulé</option>
                <option value="terminé">Terminé</option>
              </select>

              <input
                type="text"
                placeholder="Lieu"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="border rounded-lg px-4 py-2 text-gray-900"
              />
            </div>

            <textarea
              placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border rounded-lg px-4 py-2 w-full mt-4 text-gray-900"
              rows={3}
            />

            <button
              type="submit"
              className="mt-4 btn-primary"
            >
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </form>
        )}

        <div className="space-y-8">
          {Object.entries(groupByMonth()).map(([month, monthBookings]) => (
            <div key={month}>
              {(() => {
                const occupancy = getMonthOccupancy(monthBookings);
                return (
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-apple-text-main">{month}</h2>
                    <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-sm font-semibold">
                      V {occupancy.occupiedV}/{occupancy.totalV}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 text-sm font-semibold">
                      S {occupancy.occupiedS}/{occupancy.totalS}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 text-sm font-semibold">
                      VF {occupancy.occupiedVF}/{occupancy.totalVF}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 text-sm font-semibold">
                      J {occupancy.occupiedJ}/{occupancy.totalJ}
                    </span>
                  </div>
                );
              })()}
              <div className="grid md:grid-cols-2 gap-4">
                {monthBookings.map((booking) => {
                  const client = clients.find(c => c.id === booking.clientId);
                  return (
                    <div key={booking.id} className="ui-card p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-gray-900">{booking.title}</h3>
                          {client && <p className="text-gray-800 text-sm font-medium">{client.name}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(booking)}
                            className="text-brand-600 hover:text-brand-700"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(booking.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border-2 mb-3 ${STATUS_COLORS[booking.status]}`}>
                        {booking.status}
                      </div>

                      <p className="text-gray-900 font-medium mb-2">
                        📅 {booking.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-gray-800 text-sm mb-2">
                        🕐 {booking.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - {booking.end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {booking.location && <p className="text-gray-800 text-sm mb-2">📍 {booking.location}</p>}
                      <p className="text-lg font-bold text-green-600 mt-3">
                        💰 {booking.price}€ {booking.deposit > 0 && <span className="text-sm text-gray-800">(acompte: {booking.deposit}€)</span>}
                      </p>
                      {booking.notes && <p className="text-gray-700 text-sm mt-2 italic">{booking.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {upcomingBookings.length === 0 && (
          <div className="text-center py-12 text-gray-700">
            <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p>Aucun booking à venir. Clique sur &quot;Nouveau booking&quot; pour en ajouter un !</p>
          </div>
        )}
      </div>
    </div>
  );
}
