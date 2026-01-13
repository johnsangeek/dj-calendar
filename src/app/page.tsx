'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Users, FileText, MessageSquare, TrendingUp, Euro, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Booking, Client } from '@/types';
import MessageGenerator from '@/components/MessageGenerator';

export default function Home() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 13)); // 13 janvier 2026
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMessageGenerator, setShowMessageGenerator] = useState(false);
  
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
    { label: 'Réservations ce mois', value: bookingsThisMonth.length.toString(), icon: Calendar, color: 'bg-blue-500' },
    { label: 'Clients actifs', value: activeClients.toString(), icon: Users, color: 'bg-green-500' },
    { label: 'Factures en attente', value: pendingInvoices.toString(), icon: FileText, color: 'bg-orange-500' },
    { label: 'Revenus ce mois', value: `${revenueThisMonth.toLocaleString('fr-FR')}€`, icon: Euro, color: 'bg-purple-500' },
  ];

  const quickActions = [
    { label: 'Nouvelle réservation', href: '/bookings', icon: Calendar, color: 'bg-blue-600' },
    { label: 'Ajouter un client', href: '/clients', icon: Users, color: 'bg-green-600' },
    { label: 'Créer une facture', href: '/invoices', icon: FileText, color: 'bg-orange-600' },
    { label: 'Envoyer un message', href: '/messages', icon: MessageSquare, color: 'bg-purple-600' },
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
  };

  const statusTextColors: Record<string, string> = {
    'option': 'text-yellow-700 bg-yellow-100',
    'confirmé': 'text-green-700 bg-green-100',
    'annulé': 'text-red-700 bg-red-100',
    'terminé': 'text-blue-700 bg-blue-100',
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
                Réservations
              </Link>
              <Link href="/clients" className="text-gray-600 hover:text-gray-900 transition-colors">
                Clients
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
            <button
              onClick={() => setShowMessageGenerator(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm md:text-base touch-manipulation"
            >
              <Send className="w-4 h-4" />
              <span className="hidden md:inline">Générer message</span>
              <span className="md:hidden">Message</span>
            </button>
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
            <div key={stat.label} className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className={`${stat.color} p-2 md:p-3 rounded-lg`}>
                  <stat.icon className="w-4 h-4 md:w-6 md:h-6 text-white" />
                </div>
                {stat.value !== '0' && stat.value !== '0€' && <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-500" />}
              </div>
              <p className="text-xl md:text-2xl font-bold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs md:text-sm text-gray-600">{stat.label}</p>
            </div>
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
                    ${day ? 'hover:bg-gray-100 cursor-pointer touch-manipulation' : ''}
                    ${isToday(day) ? 'ring-2 ring-purple-600 ring-offset-2 font-bold' : ''}
                    ${!day ? 'text-gray-300' : ''}
                  `
                  }
                  style={primaryClientColor ? {
                    backgroundColor: `${primaryClientColor}20`,
                    border: `2px solid ${primaryClientColor}`,
                  } : {}}
                >
                  <span className={`font-semibold ${isToday(day) ? 'text-purple-700' : 'text-gray-900'}`}>{day || ''}</span>
                  {hasMultipleBookings && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white" title="Plusieurs réservations"></div>
                  )}
                  {dayBookings && dayBookings.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center max-w-full">
                      {dayBookings.slice(0, 2).map((booking, i) => (
                        <div
                          key={i}
                          className="text-xs truncate px-1 rounded"
                          style={{
                            backgroundColor: getClientColor(booking.clientId),
                            color: 'white',
                            fontSize: '0.6rem',
                            maxWidth: '100%'
                          }}
                          title={`${booking.clientName} - ${booking.title}`}
                        >
                          {booking.clientName?.split(' ')[0] || 'Client'}
                        </div>
                      ))}
                      {dayBookings.length > 2 && (
                        <div className="text-xs text-gray-600">+{dayBookings.length - 2}</div>
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
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`${action.color} text-white rounded-lg p-3 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-opacity touch-manipulation min-h-[80px] md:min-h-0`}
              >
                <action.icon className="w-5 h-5" />
                <span className="font-medium text-sm md:text-base text-center md:text-left">{action.label}</span>
              </Link>
            ))}
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
              <p className="text-gray-500 mt-3">Chargement...</p>
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
                    <p className="text-sm text-gray-600">
                      {booking.clientName} • {new Date(booking.start).toLocaleDateString('fr-FR', { 
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
                Créer une réservation
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Message Generator Modal */}
      <MessageGenerator 
        isOpen={showMessageGenerator} 
        onClose={() => setShowMessageGenerator(false)} 
      />
    </div>
  );
}
