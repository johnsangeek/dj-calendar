'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Users, FileText, TrendingUp, Euro, X, Trash2, Receipt } from 'lucide-react';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDocs, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Booking, Client, Invoice, DJInfo } from '@/types';
import BookingModal from '@/components/BookingModal';
import { WebNav } from '@/components/web/WebNav';
import { WebCalendar } from '@/components/web/WebCalendar';

export default function WebDashboard() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [djInfo, setDjInfo] = useState<DJInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDayBookingsOpen, setIsDayBookingsOpen] = useState(false);
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);
  const [dayBookingsLabel, setDayBookingsLabel] = useState('');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'bookings' | 'clients' | 'invoices' | 'revenue' | null>(null);

  useEffect(() => {
    loadBookings();
    loadClients();
    loadInvoices();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'dj_info'));
      if (settingsDoc.exists()) {
        setDjInfo(settingsDoc.data() as DJInfo);
      }
    } catch (error) {
      console.error('Erreur chargement settings:', error);
    }
  };

  const loadClients = async () => {
    try {
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const clientsData = clientsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Client, 'id'>),
      }));
      (clientsData as Client[]).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      setClients(clientsData as Client[]);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  const loadInvoices = async () => {
    try {
      const invoicesSnap = await getDocs(collection(db, 'invoices'));
      const invoicesData = invoicesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
          issueDate: data.issueDate?.toDate ? data.issueDate.toDate() : (data.issueDate ? new Date(data.issueDate) : undefined),
          dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : undefined),
          paidAt: data.paidAt?.toDate ? data.paidAt.toDate() : (data.paidAt ? new Date(data.paidAt) : undefined),
        } as Invoice;
      });
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Erreur chargement factures:', error);
    }
  };

  const loadBookings = async () => {
    try {
      const bookingsSnap = await getDocs(collection(db, 'bookings'));
      const bookingsData = bookingsSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          start: data.start?.toDate ? data.start.toDate() : new Date(data.start),
          end: data.end?.toDate ? data.end.toDate() : new Date(data.end),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        } as Booking;
      });

      const now = new Date();
      const updates = [];
      for (const booking of bookingsData) {
        const bookingEnd = new Date(booking.end);
        if (bookingEnd < now && booking.status === 'confirmé') {
          updates.push(updateDoc(doc(db, 'bookings', booking.id), { status: 'terminé', updatedAt: now }));
          booking.status = 'terminé';
        }
        if (bookingEnd >= now && booking.status === 'terminé') {
          updates.push(updateDoc(doc(db, 'bookings', booking.id), { status: 'confirmé', updatedAt: now }));
          booking.status = 'confirmé';
        }
      }
      if (updates.length > 0) await Promise.all(updates);
      setBookings(bookingsData);
    } catch (error) {
      console.error('Erreur chargement bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Stats du mois affiché
  const displayMonth = currentDate.getMonth();
  const displayYear = currentDate.getFullYear();

  const bookingsThisMonth = bookings.filter(b => {
    const d = new Date(b.start);
    return d.getMonth() === displayMonth && d.getFullYear() === displayYear;
  });
  const confirmedBookings = bookingsThisMonth.filter(b => b.status === 'confirmé' || b.status === 'terminé');
  const revenueThisMonth = confirmedBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const activeClientsThisMonth = [...new Set(bookingsThisMonth.map(b => b.clientId).filter(Boolean))].length;

  const pendingPaymentInvoices = useMemo(() => invoices.filter(inv => inv.status === 'PENDING_PAYMENT'), [invoices]);

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const stats = [
    { label: 'Bookings ce mois', value: bookingsThisMonth.length.toString(), icon: Calendar, color: 'bg-blue-500', type: 'bookings' as const },
    { label: 'Clients actifs', value: activeClientsThisMonth.toString(), icon: Users, color: 'bg-green-500', type: 'clients' as const },
    { label: 'Factures en attente', value: pendingPaymentInvoices.length.toString(), icon: FileText, color: 'bg-orange-500', type: 'invoices' as const },
    { label: 'Revenus ce mois', value: `${revenueThisMonth.toLocaleString('fr-FR')}€`, icon: Euro, color: 'bg-purple-500', type: 'revenue' as const },
  ];

  // URSSAF
  const urssafRate = djInfo?.urssafRate ?? 25.6;
  const urssafAmount = Math.round(revenueThisMonth * urssafRate / 100);
  const netRevenue = revenueThisMonth - urssafAmount;
  const urssafPercentFilled = revenueThisMonth > 0 ? Math.min(100, (urssafAmount / revenueThisMonth) * 100) : 0;

  const statusTextColors: Record<string, string> = {
    'option': 'text-yellow-700 bg-yellow-100',
    'confirmé': 'text-green-700 bg-green-100',
    'annulé': 'text-red-700 bg-red-100',
    'terminé': 'text-blue-700 bg-blue-100',
    'remplaçant': 'text-orange-700 bg-orange-100',
  };

  const getClientColor = (clientId?: string) => {
    if (!clientId) return '#3B82F6';
    const client = clients.find((c) => c.id === clientId);
    return client?.color || '#3B82F6';
  };

  const getBookingsForMonth = () => {
    return bookings.filter(b => {
      const d = new Date(b.start);
      return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  // Calendar interactions
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
    const bookingsOnDay = bookings.filter(b => {
      const d = new Date(b.start);
      return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    });

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

  const syncBookingToGoogleCalendar = async (bookingId: string) => {
    try {
      const storedTokens = localStorage.getItem('google_calendar_tokens');
      if (!storedTokens) return;
      const tokens = JSON.parse(storedTokens);
      const res = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, bookingId, action: 'sync-booking' }),
      });
      if (!res.ok) {
        console.warn('Google Calendar sync failed:', await res.text());
      }
    } catch (err) {
      console.warn('Google Calendar auto-sync error:', err);
    }
  };

  const handleSaveBooking = async (bookingData: Partial<Booking>) => {
    const now = new Date();
    const cleanData = Object.fromEntries(
      Object.entries(bookingData).filter(([, value]) => value !== undefined)
    );
    let savedId = bookingData.id;
    if (bookingData.id) {
      await updateDoc(doc(db, 'bookings', bookingData.id), { ...cleanData, updatedAt: now });
    } else {
      const docRef = await addDoc(collection(db, 'bookings'), { ...cleanData, createdAt: now, updatedAt: now });
      savedId = docRef.id;
    }
    await loadBookings();
    if (savedId) {
      syncBookingToGoogleCalendar(savedId);
    }
  };

  const handleDeleteBooking = async (booking: Booking) => {
    if (!confirm(`Supprimer "${booking.title}" du ${new Date(booking.start).toLocaleDateString('fr-FR')} ?`)) return;
    try {
      await deleteDoc(doc(db, 'bookings', booking.id));
      setDayBookings((prev) => prev.filter((b) => b.id !== booking.id));
      await loadBookings();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleCreateInvoiceFromBooking = (booking: Booking, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    router.push(`/web/invoices?create=true&bookingId=${booking.id}`);
  };

  const handleLinkAllBookings = async (clientId: string, clientName: string) => {
    const now = new Date();
    const matchingBookings = bookings.filter(b => b.displayName === clientName && !b.clientId);
    const updates = matchingBookings.map(booking =>
      updateDoc(doc(db, 'bookings', booking.id), { clientId, updatedAt: now })
    );
    await Promise.all(updates);
    await loadBookings();
  };

  const handleStatClick = (type: 'bookings' | 'clients' | 'invoices' | 'revenue') => {
    if (type === 'bookings') {
      const monthBookings = getBookingsForMonth();
      setDayBookings(monthBookings);
      setDayBookingsLabel(`${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`);
      setStatsModalType('bookings');
      setShowStatsModal(true);
    } else if (type === 'invoices') {
      router.push('/web/invoices');
    } else if (type === 'clients') {
      router.push('/web/clients');
    }
  };

  const quickActions = [
    { label: 'Nouveau booking', href: '#', icon: Calendar, color: 'bg-blue-600', onClick: () => { setSelectedBooking(null); setSelectedDate(new Date()); setIsBookingModalOpen(true); } },
    { label: 'Ajouter un client', href: '/web/clients', icon: Users, color: 'bg-green-600', onClick: undefined },
    { label: 'Créer une facture', href: '/web/invoices', icon: FileText, color: 'bg-orange-600', onClick: undefined },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <WebNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Tableau de bord</h1>
          <p className="text-gray-600">Bienvenue dans votre espace de gestion DJ</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          {stats.map((stat) => (
            <button
              key={stat.label}
              onClick={() => handleStatClick(stat.type)}
              className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-[#F2F2F7] text-left hover:shadow-md hover:border-gray-200 transition-all cursor-pointer"
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

        {/* URSSAF */}
        {revenueThisMonth > 0 && (
          <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 rounded-2xl shadow-sm p-4 md:p-6 border border-purple-100 mb-6 md:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                <Euro className="w-5 h-5 text-purple-600" />
                Revenus & Charges - {monthNames[currentDate.getMonth()]}
              </h2>
              <Link href="/web/settings" className="text-xs text-purple-600 hover:text-purple-800 underline">
                Modifier taux
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                <p className="text-sm text-gray-600 mb-1">Total Brut</p>
                <p className="text-2xl font-bold text-gray-900">{revenueThisMonth.toLocaleString('fr-FR')}€</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-orange-100 shadow-sm">
                <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  À prévoir URSSAF
                  <span className="text-xs text-orange-600 font-medium">({urssafRate}%)</span>
                </p>
                <p className="text-2xl font-bold text-orange-600">-{urssafAmount.toLocaleString('fr-FR')}€</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-green-100 shadow-sm">
                <p className="text-sm text-gray-600 mb-1">Revenu Net estimé</p>
                <p className="text-2xl font-bold text-green-600">{netRevenue.toLocaleString('fr-FR')}€</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Répartition</span>
                <span className="text-xs text-gray-500">{urssafRate}% URSSAF · {(100 - urssafRate).toFixed(1)}% Net</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500" style={{ width: `${100 - urssafPercentFilled}%` }} />
                <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500" style={{ width: `${urssafPercentFilled}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-green-600 font-medium">Net : {netRevenue.toLocaleString('fr-FR')}€</span>
                <span className="text-orange-600 font-medium">URSSAF : {urssafAmount.toLocaleString('fr-FR')}€</span>
              </div>
            </div>
          </div>
        )}

        {/* Calendar */}
        <WebCalendar
          bookings={bookings}
          clients={clients}
          currentDate={currentDate}
          onPreviousMonth={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
          onNextMonth={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
          onDayClick={handleDayClick}
          revenueForMonth={revenueThisMonth}
        />

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-[#F2F2F7] mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
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

        {/* Upcoming bookings */}
        <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-[#F2F2F7]">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">
            Prochaines réservations {currentDate.getMonth() === new Date().getMonth() && `- ${monthNames[currentDate.getMonth()]}`}
          </h2>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-700 mt-3">Chargement...</p>
            </div>
          ) : getBookingsForMonth().filter(b => b.status !== 'terminé').length > 0 ? (
            <div className="space-y-3">
              {getBookingsForMonth().filter(b => b.status !== 'terminé').map((booking) => {
                const isPastEvent = new Date(booking.end) < new Date();
                const canInvoice = booking.status === 'confirmé' && isPastEvent;
                return (
                  <div
                    key={booking.id}
                    className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-l-4"
                    style={{ borderLeftColor: getClientColor(booking.clientId) }}
                  >
                    <div className="p-2 rounded" style={{ backgroundColor: `${getClientColor(booking.clientId)}20` }}>
                      <Calendar className="w-5 h-5" style={{ color: getClientColor(booking.clientId) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{booking.title}</p>
                      <p className="text-sm text-gray-800 font-medium">
                        {booking.displayName || booking.clientName} · {new Date(booking.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {booking.price > 0 && (
                        <p className="text-sm text-purple-600 font-medium">{booking.price.toLocaleString('fr-FR')}€</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canInvoice && (
                        <button
                          onClick={(e) => handleCreateInvoiceFromBooking(booking, e)}
                          className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          title="Créer une facture"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      )}
                      <span className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap ${statusTextColors[booking.status]}`}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune réservation pour {monthNames[currentDate.getMonth()].toLowerCase()}</p>
              <button
                onClick={() => { setSelectedBooking(null); setSelectedDate(new Date()); setIsBookingModalOpen(true); }}
                className="text-purple-600 hover:text-purple-700 font-medium mt-2 inline-block"
              >
                Créer un booking
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Stats Modal - Bookings du mois */}
      {showStatsModal && statsModalType === 'bookings' && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowStatsModal(false)}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Bookings du mois</h3>
                <p className="text-sm text-gray-600">{dayBookingsLabel}</p>
              </div>
              <button onClick={() => setShowStatsModal(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto">
              {dayBookings.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Aucun booking ce mois</p>
              ) : (
                dayBookings.map((b) => {
                  const isPastEvent = new Date(b.end) < new Date();
                  const canInvoice = (b.status === 'confirmé' || b.status === 'terminé') && isPastEvent;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                      style={{ borderLeft: `6px solid ${getClientColor(b.clientId)}` }}
                    >
                      <button onClick={() => { setShowStatsModal(false); openEditBooking(b); }} className="flex-1 text-left">
                        <div className="font-semibold text-gray-900">{b.title}</div>
                        <div className="text-sm text-gray-600">
                          {b.clientName} · {new Date(b.start).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date(b.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusTextColors[b.status] || 'text-gray-700 bg-gray-100'}`}>
                            {b.status}
                          </span>
                          {b.price > 0 && <span className="text-xs text-gray-500">{b.price}€</span>}
                        </div>
                      </button>
                      {canInvoice && (
                        <button
                          onClick={(e) => { setShowStatsModal(false); handleCreateInvoiceFromBooking(b, e); }}
                          className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                          title="Créer une facture"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Day Bookings Modal */}
      {isDayBookingsOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setIsDayBookingsOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Bookings du jour</h3>
                <p className="text-sm text-gray-600">{dayBookingsLabel}</p>
              </div>
              <button onClick={() => setIsDayBookingsOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {dayBookings.map((b) => {
                const isPastEvent = new Date(b.end) < new Date();
                const canInvoice = (b.status === 'confirmé' || b.status === 'terminé') && isPastEvent;
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    style={{ borderLeft: `6px solid ${getClientColor(b.clientId)}` }}
                  >
                    <button onClick={() => { setIsDayBookingsOpen(false); openEditBooking(b); }} className="flex-1 text-left">
                      <div className="font-semibold text-gray-900">{b.title}</div>
                      <div className="text-sm text-gray-600">
                        {b.clientName} · {new Date(b.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                    {canInvoice && (
                      <button
                        onClick={(e) => handleCreateInvoiceFromBooking(b, e)}
                        className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                        title="Créer une facture"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteBooking(b)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => { setIsDayBookingsOpen(false); if (selectedDate) openCreateBookingForDate(selectedDate); }}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Nouveau booking ce jour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <BookingModal
          isOpen={isBookingModalOpen}
          onClose={() => { setIsBookingModalOpen(false); setSelectedDate(null); setSelectedBooking(null); }}
          onSave={handleSaveBooking}
          onLinkAllBookings={handleLinkAllBookings}
          booking={selectedBooking}
          selectedDate={selectedDate}
          clients={clients}
          allBookings={bookings}
        />
      )}
    </div>
  );
}
