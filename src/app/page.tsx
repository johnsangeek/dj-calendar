'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Users, FileText, MessageSquare, TrendingUp, Euro, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { Booking, Client } from '@/types';
import BookingModal from '@/components/BookingModal';

export default function Home() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 13)); // 13 janvier 2026
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDayBookingsOpen, setIsDayBookingsOpen] = useState(false);
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);
  const [dayBookingsLabel, setDayBookingsLabel] = useState('');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'bookings' | 'clients' | 'invoices' | 'revenue' | null>(null);
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementBookings, setReplacementBookings] = useState<Booking[]>([]);
  const [generatedMessage, setGeneratedMessage] = useState('');
  
  useEffect(() => {
    loadBookings();
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const clientsData = clientsSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Client, 'id'>),
      }));

      // Trier par ordre alphabétique
      (clientsData as Client[]).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

      setClients(clientsData as Client[]);
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
    }
  };

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
      
      // Correction automatique des statuts
      const now = new Date();
      const updates = [];
      
      for (const booking of bookingsData) {
        const bookingEnd = new Date(booking.end);
        
        // Mettre automatiquement les bookings passés "confirmé" en "terminé"
        if (bookingEnd < now && booking.status === 'confirmé') {
          updates.push(
            updateDoc(doc(db, 'bookings', booking.id), {
              status: 'terminé',
              updatedAt: now,
            })
          );
          booking.status = 'terminé';
        }
        
        // Corriger les bookings futurs qui sont marqués "terminé" (importés du calendrier)
        if (bookingEnd >= now && booking.status === 'terminé') {
          updates.push(
            updateDoc(doc(db, 'bookings', booking.id), {
              status: 'confirmé',
              updatedAt: now,
            })
          );
          booking.status = 'confirmé';
        }
      }
      
      if (updates.length > 0) {
        await Promise.all(updates);
        console.log(`${updates.length} bookings corrigés`);
      }
      
      setBookings(bookingsData);
    } catch (error) {
      console.error('Erreur lors du chargement des réservations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculer les stats en temps réel
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const bookingsThisMonth = bookings.filter(b => {
    const bookingDate = new Date(b.start);
    return bookingDate.getMonth() === currentMonth && bookingDate.getFullYear() === currentYear;
  });

  const confirmedBookings = bookingsThisMonth.filter(b => b.status === 'confirmé' || b.status === 'terminé');
  const revenueThisMonth = confirmedBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const activeClients = [...new Set(bookings.map(b => b.clientId).filter(Boolean))].length;
  const pendingInvoices = 0; // À implémenter avec les factures
  
  const stats = [
    { label: 'Bookings ce mois', value: bookingsThisMonth.length.toString(), icon: Calendar, color: 'bg-blue-500', type: 'bookings' as const },
    { label: 'Clients actifs', value: activeClients.toString(), icon: Users, color: 'bg-green-500', type: 'clients' as const },
    { label: 'Factures en attente', value: pendingInvoices.toString(), icon: FileText, color: 'bg-orange-500', type: 'invoices' as const },
    { label: 'Revenus ce mois', value: `${revenueThisMonth.toLocaleString('fr-FR')}€`, icon: Euro, color: 'bg-purple-500', type: 'revenue' as const },
  ];

  const openStatsModal = (type: 'bookings' | 'clients' | 'invoices' | 'revenue') => {
    setStatsModalType(type);
    setShowStatsModal(true);
  };

  const quickActions = [
    { label: 'Nouveau BOOKING DJ', href: '/bookings', icon: Calendar, color: 'bg-blue-600', onClick: undefined },
    { label: 'Ajouter un client', href: '/clients', icon: Users, color: 'bg-green-600', onClick: undefined },
    { label: 'Créer une facture', href: '/invoices', icon: FileText, color: 'bg-orange-600', onClick: undefined },
    { label: 'Message remplaçant', href: '#', icon: MessageSquare, color: 'bg-orange-500', onClick: () => handleReplacementClick() },
  ];

  // Fonctions calendrier
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Jours vides avant le début du mois
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Jours du mois
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return day === today.getDate() && 
           currentDate.getMonth() === today.getMonth() && 
           currentDate.getFullYear() === today.getFullYear();
  };

  const hasBooking = (day: number | null) => {
    if (!day) return null;
    const bookingsOnDay = bookings.filter(b => {
      const bookingDate = new Date(b.start);
      return bookingDate.getDate() === day && 
             bookingDate.getMonth() === currentDate.getMonth() &&
             bookingDate.getFullYear() === currentDate.getFullYear();
    });
    return bookingsOnDay.length > 0 ? bookingsOnDay : null;
  };

  const getBookingsForMonth = () => {
    return bookings.filter(b => {
      const bookingDate = new Date(b.start);
      return bookingDate.getMonth() === currentDate.getMonth() &&
             bookingDate.getFullYear() === currentDate.getFullYear();
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  const getClientColor = (clientId?: string) => {
    if (!clientId) return '#3B82F6';
    const client = clients.find((c) => c.id === clientId);
    return client?.color || '#3B82F6';
  };

  const getRevenueForDisplayedMonth = () => {
    const displayedMonth = currentDate.getMonth();
    const displayedYear = currentDate.getFullYear();

    const bookingsDisplayedMonth = bookings.filter((b) => {
      const bookingDate = new Date(b.start);
      return bookingDate.getMonth() === displayedMonth && bookingDate.getFullYear() === displayedYear;
    });

    const confirmedBookingsDisplayedMonth = bookingsDisplayedMonth.filter(
      (b) => b.status === 'confirmé' || b.status === 'terminé'
    );

    return confirmedBookingsDisplayedMonth.reduce((sum, b) => sum + (b.price || 0), 0);
  };

  const statusColors: Record<string, string> = {
    'option': 'bg-yellow-400',
    'confirmé': 'bg-green-500',
    'annulé': 'bg-red-500',
    'terminé': 'bg-blue-500',
    'remplaçant': 'bg-orange-500',
  };

  const statusTextColors: Record<string, string> = {
    'option': 'text-yellow-700 bg-yellow-100',
    'confirmé': 'text-green-700 bg-green-100',
    'annulé': 'text-red-700 bg-red-100',
    'terminé': 'text-blue-700 bg-blue-100',
    'remplaçant': 'text-orange-700 bg-orange-100',
  };

  const openCreateBookingForDate = (date: Date) => {
    setSelectedBooking(null);
    setSelectedDate(date);
    setIsBookingModalOpen(true);
  };

  const openEditBooking = (booking: Booking) => {
    setSelectedBooking(booking);
    setSelectedDate(null);
    setIsBookingModalOpen(true);
  };

  const handleDayClick = (day: number | null) => {
    if (!day) return;
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const bookingsOnDay = hasBooking(day) || [];

    if (bookingsOnDay.length === 0) {
      openCreateBookingForDate(date);
      return;
    }

    if (bookingsOnDay.length === 1) {
      openEditBooking(bookingsOnDay[0]);
      return;
    }

    setDayBookings(bookingsOnDay);
    setDayBookingsLabel(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    setSelectedDate(date);
    setIsDayBookingsOpen(true);
  };

  const handleSaveBooking = async (bookingData: Partial<Booking>) => {
    const now = new Date();

    // Nettoyer les valeurs undefined pour Firebase
    const cleanData = Object.fromEntries(
      Object.entries(bookingData).filter(([_, value]) => value !== undefined)
    );

    if (bookingData.id) {
      const bookingRef = doc(db, 'bookings', bookingData.id);
      await updateDoc(bookingRef, {
        ...cleanData,
        updatedAt: now,
      });
    } else {
      await addDoc(collection(db, 'bookings'), {
        ...cleanData,
        createdAt: now,
        updatedAt: now,
      });
    }

    await loadBookings();
  };

  const handleLinkAllBookings = async (clientId: string, clientName: string) => {
    const now = new Date();
    // Utiliser displayName pour matcher les événements importés
    const matchingBookings = bookings.filter(b => 
      b.displayName === clientName && !b.clientId
    );

    const updates = matchingBookings.map(booking => 
      updateDoc(doc(db, 'bookings', booking.id), {
        clientId: clientId,
        updatedAt: now,
      })
    );

    await Promise.all(updates);
    await loadBookings();
    console.log(`${matchingBookings.length} événements liés au client`);
  };

  const handleReplacementClick = () => {
    const replacements = bookings.filter(b => b.status === 'remplaçant');
    setReplacementBookings(replacements);
    setShowReplacementModal(true);
  };

  const generateReplacementMessage = (booking: Booking) => {
    const client = clients.find(c => c.id === booking.clientId);
    const clientName = client?.name || booking.clientName;
    const date = new Date(booking.start).toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
    const time = new Date(booking.start).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const message = `Salut ${clientName},\n\nJe peux pas etre dispo a cet ou ces dates la\n📅 ${date}\n⏰ ${time}\n📍 ${booking.location || 'Lieu à confirmer'}\n\nTu veux que je te trouve quelq'un ou tu t'en charge\n\nMerci !`;
    
    setGeneratedMessage(message);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedMessage);
    alert('Message copié dans le presse-papier !');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                DJ Booker Pro
              </span>
            </div>
            <div className="hidden md:flex gap-6">
              <Link href="/" className="text-purple-600 font-medium border-b-2 border-purple-600 pb-1">
                Dashboard
              </Link>
              <Link href="/bookings" className="text-gray-600 hover:text-gray-900 transition-colors">
                BOOKING DJ
              </Link>
              <Link href="/clients" className="text-gray-600 hover:text-gray-900 transition-colors">
                Clients
              </Link>
              <Link href="/crm" className="text-gray-600 hover:text-gray-900 transition-colors">
                CRM
              </Link>
              <Link href="/invoices" className="text-gray-600 hover:text-gray-900 transition-colors">
                Factures
              </Link>
              <Link href="/messages" className="text-gray-600 hover:text-gray-900 transition-colors">
                Messages
              </Link>
              <Link href="/settings" className="text-gray-600 hover:text-gray-900 transition-colors">
                Paramètres
              </Link>
            </div>
            {/* Navigation mobile */}
            <div className="flex md:hidden gap-2">
              <Link href="/bookings" className="p-2 text-gray-600 hover:text-gray-900">
                <Calendar className="w-5 h-5" />
              </Link>
              <Link href="/clients" className="p-2 text-gray-600 hover:text-gray-900">
                <Users className="w-5 h-5" />
              </Link>
              <Link href="/settings" className="p-2 text-gray-600 hover:text-gray-900">
                <MessageSquare className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Tableau de bord</h1>
            <p className="text-gray-600">Bienvenue dans votre espace de gestion DJ</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/messages"
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm md:text-base touch-manipulation"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden md:inline">Générer message</span>
              <span className="md:hidden">Message</span>
            </Link>
            <Link
              href="/demo"
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 text-sm md:text-base touch-manipulation"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden md:inline">Voir la démo</span>
              <span className="md:hidden">Démo</span>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          {stats.map((stat) => (
            <button
              key={stat.label}
              onClick={() => openStatsModal(stat.type)}
              className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer text-left"
            >
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className={`${stat.color} p-2 md:p-3 rounded-lg`}>
                  <stat.icon className="w-4 h-4 md:w-6 md:h-6 text-white" />
                </div>
                {stat.value !== '0' && stat.value !== '0€' && <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-500" />}
              </div>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs md:text-sm text-gray-600">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Calendrier Mensuel */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100 mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <p className="text-sm text-green-600 font-semibold mt-1">
                Revenus {monthNames[currentDate.getMonth()]} : {getRevenueForDisplayedMonth().toLocaleString('fr-FR')}€
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={previousMonth}
                className="p-2 md:p-3 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
              </button>
              <button
                onClick={nextMonth}
                className="p-2 md:p-3 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                aria-label="Mois suivant"
              >
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
              </button>
            </div>
          </div>

          {/* Grille du calendrier */}
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {/* En-têtes des jours */}
            {dayNames.map((day) => (
              <div key={day} className="text-center font-semibold text-gray-700 text-xs md:text-sm py-2">
                {day}
              </div>
            ))}
            
            {/* Jours du mois */}
            {getDaysInMonth(currentDate).map((day, index) => {
              const dayBookings = hasBooking(day);
              const primaryClientColor = dayBookings && dayBookings.length > 0 ? getClientColor(dayBookings[0].clientId) : null;
              const hasMultipleBookings = dayBookings && dayBookings.length > 1;

              return (
                <div
                  key={index}
                  className={
                    `
                    aspect-square flex flex-col items-center justify-center rounded-lg text-sm md:text-base p-1 relative
                    ${day ? 'hover:scale-105 cursor-pointer touch-manipulation transition-transform' : ''}
                    ${isToday(day) ? 'ring-2 ring-purple-600 ring-offset-2 font-bold' : ''}
                    ${!day ? 'text-gray-300' : ''}
                  `
                  }
                  style={primaryClientColor ? {
                    backgroundColor: `${primaryClientColor}20`,
                    border: `2px solid ${primaryClientColor}`,
                  } : {}}
                  onClick={() => handleDayClick(day)}
                >
                  <span className={`font-semibold ${isToday(day) ? 'text-purple-700' : 'text-gray-900'}`}>{day || ''}</span>
                  {hasMultipleBookings && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white" title="Plusieurs réservations"></div>
                  )}
                  {dayBookings && dayBookings.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1 w-full px-0.5">
                      {dayBookings.slice(0, 2).map((booking, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1"
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              booking.status === 'option' ? 'bg-yellow-400' :
                              booking.status === 'confirmé' ? 'bg-green-500' :
                              booking.status === 'terminé' ? 'bg-blue-500' :
                              booking.status === 'remplaçant' ? 'bg-orange-500' :
                              'bg-red-500'
                            }`}
                            title={booking.status}
                          />
                          <div
                            className="text-xs truncate px-1 rounded flex-1"
                            style={{
                              backgroundColor: getClientColor(booking.clientId),
                              color: 'white',
                              fontSize: '0.6rem',
                            }}
                            title={`${booking.displayName || booking.clientName} - ${booking.title} (${booking.status})`}
                          >
                            {booking.title || booking.displayName || booking.clientName || 'Booking'}
                          </div>
                        </div>
                      ))}
                      {dayBookings.length > 2 && (
                        <div className="text-xs text-gray-600 text-center">+{dayBookings.length - 2}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-4 text-xs md:text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-600">Confirmé</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <span className="text-gray-600">Option</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-gray-600">Remplaçant</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-gray-600">Terminé</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-gray-600">Annulé</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100 mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {quickActions.map((action) => 
              action.onClick ? (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className={`${action.color} text-white rounded-lg p-3 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-opacity touch-manipulation min-h-[80px] md:min-h-0`}
                >
                  <action.icon className="w-5 h-5" />
                  <span className="font-medium text-sm md:text-base text-center md:text-left">{action.label}</span>
                </button>
              ) : (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`${action.color} text-white rounded-lg p-3 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-opacity touch-manipulation min-h-[80px] md:min-h-0`}
                >
                  <action.icon className="w-5 h-5" />
                  <span className="font-medium text-sm md:text-base text-center md:text-left">{action.label}</span>
                </Link>
              )
            )}
          </div>
        </div>

        {/* Prochaines réservations */}
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">
            Prochaines réservations {currentDate.getMonth() === new Date().getMonth() && `- ${monthNames[currentDate.getMonth()]}`}
          </h2>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-700 mt-3">Chargement...</p>
            </div>
          ) : getBookingsForMonth().length > 0 ? (
            <div className="space-y-3">
              {getBookingsForMonth().map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-l-4"
                  style={{ borderLeftColor: getClientColor(booking.clientId) }}
                >
                  <div
                    className="p-2 rounded"
                    style={{ backgroundColor: `${getClientColor(booking.clientId)}20` }}
                  >
                    <Calendar className="w-5 h-5" style={{ color: getClientColor(booking.clientId) }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{booking.title}</p>
                    <p className="text-sm text-gray-800 font-medium">
                      {booking.displayName || booking.clientName} • {new Date(booking.start).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    {booking.price > 0 && (
                      <p className="text-sm text-purple-600 font-medium">{booking.price.toLocaleString('fr-FR')}€</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap ${statusTextColors[booking.status]}`}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune réservation pour {monthNames[currentDate.getMonth()].toLowerCase()}</p>
              <Link href="/bookings" className="text-purple-600 hover:text-purple-700 font-medium mt-2 inline-block">
                Créer un BOOKING DJ
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Day Bookings Modal */}
      {isDayBookingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">BOOKING DJ</h3>
                <p className="text-sm text-gray-600">{dayBookingsLabel}</p>
              </div>
              <button
                onClick={() => setIsDayBookingsOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-3">
              {dayBookings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setIsDayBookingsOpen(false);
                    openEditBooking(b);
                  }}
                  className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                  style={{ borderLeft: `6px solid ${getClientColor(b.clientId)}` }}
                >
                  <div className="font-semibold text-gray-900">{b.title}</div>
                  <div className="text-sm text-gray-600">
                    {b.clientName} • {new Date(b.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
              ))}

              <button
                onClick={() => {
                  setIsDayBookingsOpen(false);
                  if (selectedDate) openCreateBookingForDate(selectedDate);
                }}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Nouveau BOOKING DJ ce jour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setSelectedBooking(null);
          setSelectedDate(null);
        }}
        onSave={handleSaveBooking}
        booking={selectedBooking}
        selectedDate={selectedDate}
        clients={clients}
        allBookings={bookings}
        onLinkAllBookings={handleLinkAllBookings}
      />

      {/* Stats Detail Modal */}
      {showStatsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {statsModalType === 'bookings' && 'Bookings ce mois'}
                {statsModalType === 'clients' && 'Clients actifs'}
                {statsModalType === 'invoices' && 'Factures en attente'}
                {statsModalType === 'revenue' && 'Revenus ce mois'}
              </h2>
              <button
                onClick={() => setShowStatsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Bookings ce mois */}
              {statsModalType === 'bookings' && (
                <div className="space-y-3">
                  {bookingsThisMonth.length === 0 ? (
                    <p className="text-gray-700 text-center py-8">Aucun booking ce mois</p>
                  ) : (
                    bookingsThisMonth.map((booking) => (
                      <div
                        key={booking.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedBooking(booking);
                          setIsBookingModalOpen(true);
                          setShowStatsModal(false);
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="font-bold text-lg text-gray-900">{booking.title}</h3>
                            <p className="text-sm text-gray-900 font-medium">{booking.displayName || booking.clientName}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            booking.status === 'confirmé' ? 'bg-green-100 text-green-800' :
                            booking.status === 'option' ? 'bg-yellow-100 text-yellow-800' :
                            booking.status === 'annulé' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {booking.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <p className="text-gray-800">
                            📅 {new Date(booking.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-gray-800">
                            💰 {booking.price.toLocaleString('fr-FR')}€
                          </p>
                          {booking.location && (
                            <p className="text-gray-800">📍 {booking.location}</p>
                          )}
                          {booking.deposit > 0 && (
                            <p className="text-gray-800">💳 Acompte: {booking.deposit.toLocaleString('fr-FR')}€</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Clients actifs */}
              {statsModalType === 'clients' && (
                <div className="space-y-3">
                  {(() => {
                    const uniqueClientIds = [...new Set(bookings.map(b => b.clientId).filter(Boolean))];
                    const activeClientsList = clients.filter(c => uniqueClientIds.includes(c.id));

                    return activeClientsList.length === 0 ? (
                      <p className="text-gray-700 text-center py-8">Aucun client actif</p>
                    ) : (
                      activeClientsList.map((client) => {
                        const clientBookings = bookings.filter(b => b.clientId === client.id);
                        const totalRevenue = clientBookings.reduce((sum, b) => sum + (b.price || 0), 0);

                        return (
                          <div
                            key={client.id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: client.color || '#3B82F6' }}
                                />
                                <h3 className="font-bold text-lg text-gray-900">{client.name}</h3>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <p className="text-gray-800">
                                🎵 {clientBookings.length} booking(s)
                              </p>
                              <p className="text-gray-800">
                                💰 {totalRevenue.toLocaleString('fr-FR')}€ de CA
                              </p>
                              {client.email && (
                                <p className="text-gray-800">📧 {client.email}</p>
                              )}
                              {client.phone && (
                                <p className="text-gray-800">📱 {client.phone}</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    );
                  })()}
                </div>
              )}

              {/* Factures en attente */}
              {statsModalType === 'invoices' && (
                <div className="space-y-3">
                  <p className="text-gray-500 text-center py-8">
                    Fonctionnalité à venir - Les factures seront affichées ici
                  </p>
                </div>
              )}

              {/* Revenus ce mois */}
              {statsModalType === 'revenue' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
                    <p className="text-sm text-gray-600 mb-2">Revenus total ce mois</p>
                    <p className="text-4xl font-bold text-purple-600">{revenueThisMonth.toLocaleString('fr-FR')}€</p>
                  </div>

                  <h3 className="font-semibold text-lg text-gray-900 mt-6">Détails par booking</h3>
                  <div className="space-y-3">
                    {confirmedBookings.length === 0 ? (
                      <p className="text-gray-700 text-center py-8">Aucun revenu ce mois</p>
                    ) : (
                      confirmedBookings.map((booking) => (
                        <div
                          key={booking.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">{booking.title}</h4>
                              <p className="text-sm text-gray-900 font-medium">{booking.displayName || booking.clientName}</p>
                              <p className="text-xs text-gray-800">
                                {new Date(booking.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-purple-600">{booking.price.toLocaleString('fr-FR')}€</p>
                              {booking.deposit > 0 && (
                                <p className="text-xs text-gray-800">Acompte: {booking.deposit.toLocaleString('fr-FR')}€</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowStatsModal(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Modal */}
      {showReplacementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Messages Remplaçant</h2>
              <button
                onClick={() => {
                  setShowReplacementModal(false);
                  setGeneratedMessage('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {replacementBookings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-700 text-lg">Aucun booking avec le statut "Remplaçant"</p>
                  <p className="text-gray-600 text-sm mt-2">Modifiez un booking pour le marquer comme "Remplaçant"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg text-gray-900">Sélectionnez un booking pour générer le message :</h3>
                  
                  <div className="grid gap-3">
                    {replacementBookings.map((booking) => (
                      <button
                        key={booking.id}
                        onClick={() => generateReplacementMessage(booking)}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-orange-50 hover:border-orange-300 transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{booking.title}</h4>
                            <p className="text-sm text-gray-900 font-medium">{booking.displayName || booking.clientName}</p>
                            <p className="text-xs text-gray-800">
                              {new Date(booking.start).toLocaleDateString('fr-FR', { 
                                weekday: 'long',
                                day: 'numeric', 
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            {booking.location && (
                              <p className="text-xs text-gray-800">📍 {booking.location}</p>
                            )}
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-medium text-orange-700 bg-orange-100">
                            Remplaçant
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {generatedMessage && (
                    <div className="mt-6 border-t pt-6">
                      <h3 className="font-semibold text-lg text-gray-900 mb-3">Message généré :</h3>
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <pre className="whitespace-pre-wrap text-sm text-gray-900 font-sans">{generatedMessage}</pre>
                      </div>
                      <button
                        onClick={copyToClipboard}
                        className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        Copier le message
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowReplacementModal(false);
                  setGeneratedMessage('');
                }}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
