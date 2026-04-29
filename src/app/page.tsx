'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Users, FileText, MessageSquare, TrendingUp, Euro, ChevronLeft, ChevronRight, X, RefreshCw, Trash2, MessageCircle, Receipt } from 'lucide-react';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDocs, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Booking, Client, Invoice, DJInfo } from '@/types';
import BookingModal from '@/components/BookingModal';
import { TopNav } from '@/components/TopNav';

export default function Home() {
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
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementBookings, setReplacementBookings] = useState<Booking[]>([]);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [showClientBookingsModal, setShowClientBookingsModal] = useState(false);
  const [selectedClientBookings, setSelectedClientBookings] = useState<Booking[]>([]);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedReplacementIds, setSelectedReplacementIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [availabilityMode, setAvailabilityMode] = useState(false);
  const [selectedAvailabilityDates, setSelectedAvailabilityDates] = useState<Date[]>([]);
  const [showAvailabilityMessage, setShowAvailabilityMessage] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [draggedBooking, setDraggedBooking] = useState<Booking | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

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

  const loadInvoices = async () => {
    try {
      const invoicesSnap = await getDocs(collection(db, 'invoices'));
      const invoicesData = invoicesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
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
      console.error('Erreur lors du chargement des factures:', error);
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

  // Calculer les stats en temps réel basé sur le mois affiché
  const displayMonth = currentDate.getMonth();
  const displayYear = currentDate.getFullYear();
  
  const bookingsThisMonth = bookings.filter(b => {
    const bookingDate = new Date(b.start);
    return bookingDate.getMonth() === displayMonth && bookingDate.getFullYear() === displayYear;
  });

  const confirmedBookings = bookingsThisMonth.filter(b => b.status === 'confirmé' || b.status === 'terminé');

  // Revenus = factures payées dans le mois affiché (date de paiement réel)
  const paidInvoicesThisMonth = invoices.filter(inv => {
    if (inv.status !== 'PAID' || inv.documentType !== 'INVOICE') return false;
    const paidDate = inv.paidAt ? new Date(inv.paidAt) : null;
    if (!paidDate) return false;
    return paidDate.getMonth() === displayMonth && paidDate.getFullYear() === displayYear;
  });
  const revenueThisMonth = paidInvoicesThisMonth.reduce((sum, inv) => sum + (inv.totals?.total || 0), 0);

  // Répartition : encaissements du mois courant vs décalés (presta d'un autre mois)
  const revenueOnTime = paidInvoicesThisMonth
    .filter(inv => {
      const serviceDate = inv.servicePeriod?.start ? new Date(inv.servicePeriod.start) : null;
      if (!serviceDate) return true; // Pas de date de presta → on considère "dans le mois"
      return serviceDate.getMonth() === displayMonth && serviceDate.getFullYear() === displayYear;
    })
    .reduce((sum, inv) => sum + (inv.totals?.total || 0), 0);
  const revenueDecale = revenueThisMonth - revenueOnTime;
  const activeClientsThisMonth = [...new Set(bookingsThisMonth.map(b => b.clientId).filter(Boolean))].length;

  // Factures en attente de paiement
  const pendingPaymentInvoices = useMemo(() => {
    return invoices.filter(inv => inv.status === 'PENDING_PAYMENT');
  }, [invoices]);

  const pendingInvoices = pendingPaymentInvoices.length;
  
  const stats = [
    { label: 'Bookings ce mois', value: bookingsThisMonth.length.toString(), icon: Calendar, color: 'bg-brand-600', type: 'bookings' as const },
    { label: 'Clients actifs', value: activeClientsThisMonth.toString(), icon: Users, color: 'bg-brand-600', type: 'clients' as const },
    { label: 'Factures en attente', value: pendingInvoices.toString(), icon: FileText, color: 'bg-brand-600', type: 'invoices' as const },
    { label: 'Revenus ce mois', value: (revenueThisMonth.toLocaleString('fr-FR') + '€'), icon: Euro, color: 'bg-brand-600', type: 'revenue' as const },
  ];

  const topRecurringClients = useMemo(() => {
    const windowStart = new Date(displayYear, displayMonth - 11, 1);
    const windowEnd = new Date(displayYear, displayMonth + 1, 1);

    type ClientInsight = {
      client: Client;
      windowBookings: Booking[];
      bookingsCount12m: number;
      bookingsThisMonth: number;
      totalRevenue12m: number;
      revenueThisMonth: number;
      activeMonthsCount: number;
      avgRevenuePerActiveMonth: number;
    };

    const insights = new Map<string, {
      client: Client;
      windowBookings: Booking[];
      bookingsCount12m: number;
      bookingsThisMonth: number;
      totalRevenue12m: number;
      revenueThisMonth: number;
      activeMonths: Set<string>;
    }>();

    for (const booking of bookings) {
      if (!booking.clientId || booking.status === 'annulé') continue;

      const bookingDate = new Date(booking.start);
      if (bookingDate < windowStart || bookingDate >= windowEnd) continue;

      const client = clients.find((c) => c.id === booking.clientId);
      if (!client) continue;

      if (!insights.has(client.id)) {
        insights.set(client.id, {
          client,
          windowBookings: [],
          bookingsCount12m: 0,
          bookingsThisMonth: 0,
          totalRevenue12m: 0,
          revenueThisMonth: 0,
          activeMonths: new Set<string>(),
        });
      }

      const row = insights.get(client.id)!;
      row.windowBookings.push(booking);
      row.bookingsCount12m += 1;
      row.activeMonths.add(`${bookingDate.getFullYear()}-${bookingDate.getMonth() + 1}`);

      const isBillable = booking.status === 'confirmé' || booking.status === 'terminé';
      if (isBillable) {
        row.totalRevenue12m += booking.price || 0;
      }

      if (bookingDate.getMonth() === displayMonth && bookingDate.getFullYear() === displayYear) {
        row.bookingsThisMonth += 1;
        if (isBillable) {
          row.revenueThisMonth += booking.price || 0;
        }
      }
    }

    return Array.from(insights.values())
      .map((row): ClientInsight => {
        const activeMonthsCount = row.activeMonths.size;
        const avgRevenuePerActiveMonth = activeMonthsCount > 0
          ? Math.round(row.totalRevenue12m / activeMonthsCount)
          : 0;

        return {
          client: row.client,
          windowBookings: row.windowBookings.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
          bookingsCount12m: row.bookingsCount12m,
          bookingsThisMonth: row.bookingsThisMonth,
          totalRevenue12m: row.totalRevenue12m,
          revenueThisMonth: row.revenueThisMonth,
          activeMonthsCount,
          avgRevenuePerActiveMonth,
        };
      })
      .sort((a, b) => {
        if (b.bookingsCount12m !== a.bookingsCount12m) return b.bookingsCount12m - a.bookingsCount12m;
        if (b.avgRevenuePerActiveMonth !== a.avgRevenuePerActiveMonth) return b.avgRevenuePerActiveMonth - a.avgRevenuePerActiveMonth;
        return b.totalRevenue12m - a.totalRevenue12m;
      });
  }, [bookings, clients, displayMonth, displayYear]);

  // Calculs URSSAF
  const urssafRate = djInfo?.urssafRate ?? 25.6; // Taux BNC 2026
  const urssafAmount = Math.round(revenueThisMonth * urssafRate / 100);
  const netRevenue = revenueThisMonth - urssafAmount;
  const urssafPercentFilled = revenueThisMonth > 0 ? Math.min(100, (urssafAmount / revenueThisMonth) * 100) : 0;

  const openStatsModal = (type: 'bookings' | 'clients' | 'invoices' | 'revenue') => {
    setStatsModalType(type);
    setShowStatsModal(true);
  };

  const quickActions = [
    { label: 'Nouveau BOOKING DJ', href: '/bookings', icon: Calendar, color: 'bg-brand-600', onClick: undefined },
    { label: 'Ajouter un client', href: '/clients', icon: Users, color: 'bg-brand-600', onClick: undefined },
    { label: 'Créer une facture', href: '/invoices', icon: FileText, color: 'bg-brand-600', onClick: undefined },
    { label: 'Inbox Instagram', href: '/instagram-inbox', icon: MessageCircle, color: 'bg-brand-600', onClick: undefined },
    { label: 'Relances Instagram', href: '/instagram-relances', icon: MessageCircle, color: 'bg-brand-600', onClick: undefined },
    { label: 'Templates Instagram', href: '/instagram-templates', icon: MessageSquare, color: 'bg-brand-600', onClick: undefined },
    { label: 'Message remplaçant', href: '#', icon: MessageSquare, color: 'bg-brand-600', onClick: () => handleReplacementClick() },
    { label: 'Sync Google DJ', href: '#', icon: RefreshCw, color: 'bg-brand-600', onClick: () => handleSyncGoogleCalendar() },
  ];

  // Fonctions calendrier
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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
      new Date(year, 0, 1),   // Jour de l'an
      easterMonday,           // Lundi de Pâques
      new Date(year, 4, 1),   // Fête du travail
      new Date(year, 4, 8),   // Victoire 1945
      ascension,              // Ascension
      pentecostMonday,        // Lundi de Pentecôte
      new Date(year, 6, 14),  // Fête nationale
      new Date(year, 7, 15),  // Assomption
      new Date(year, 10, 1),  // Toussaint
      new Date(year, 10, 11), // Armistice
      new Date(year, 11, 25), // Noël
    ];

    return new Set(holidays.map(toDateKey));
  };

  const currentYearHolidays = useMemo(() => getFrenchHolidaysForYear(currentDate.getFullYear()), [currentDate]);
  const holidaysIncludingNextYear = useMemo(() => {
    const currentYear = getFrenchHolidaysForYear(currentDate.getFullYear());
    const nextYear = getFrenchHolidaysForYear(currentDate.getFullYear() + 1);
    return new Set([...currentYear, ...nextYear]);
  }, [currentDate]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    // Convertir pour commencer le lundi (0=dimanche devient 6, 1=lundi devient 0, etc.)
    const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

    const days = [];
    // Jours vides avant le début du mois
    for (let i = 0; i < adjustedStartDay; i++) {
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

  const handleDeleteBooking = async (booking: Booking) => {
    const confirmMsg = `Supprimer "${booking.title}" du ${new Date(booking.start).toLocaleDateString('fr-FR')} ?`;
    if (!confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'bookings', booking.id));
      // Mettre à jour la liste des bookings du jour
      setDayBookings((prev) => prev.filter((b) => b.id !== booking.id));
      // Recharger tous les bookings
      await loadBookings();
    } catch (error) {
      console.error('Erreur suppression booking:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleCreateInvoiceFromBooking = (booking: Booking, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Rediriger vers la page de création de facture avec le bookingId
    router.push(`/invoices?create=true&bookingId=${booking.id}`);
  };

  const handleBookingDrop = async (targetDay: number) => {
    if (!draggedBooking) return;
    setDragOverDay(null);

    const originalStart = new Date(draggedBooking.start);
    const originalEnd = new Date(draggedBooking.end);
    const newStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), targetDay,
      originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds());

    // Skip if dropped on same day
    if (newStart.getDate() === originalStart.getDate() &&
        newStart.getMonth() === originalStart.getMonth() &&
        newStart.getFullYear() === originalStart.getFullYear()) {
      setDraggedBooking(null);
      return;
    }

    const diffMs = newStart.getTime() - originalStart.getTime();
    const newEnd = new Date(originalEnd.getTime() + diffMs);

    try {
      await updateDoc(doc(db, 'bookings', draggedBooking.id), {
        start: newStart,
        end: newEnd,
        updatedAt: new Date(),
        updatedBy: 'app',
      });
      setBookings(prev => prev.map(b =>
        b.id === draggedBooking.id ? { ...b, start: newStart, end: newEnd, updatedAt: new Date() } : b
      ));
    } catch (err) {
      console.error('Error rescheduling booking:', err);
    }
    setDraggedBooking(null);
  };

  const handleDayClick = (day: number | null) => {
    if (!day) return;

    // Si en mode disponibilité, toggle la sélection de la date
    if (availabilityMode) {
      toggleDateSelection(day);
      return;
    }

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
    setSelectedReplacementIds([]);
    setGeneratedMessage('');
    setShowReplacementModal(true);
  };

  const handleSyncGoogleCalendar = async () => {
    const storedTokens = localStorage.getItem('google_calendar_tokens');

    if (!storedTokens) {
      alert('Connecte d\'abord ton compte Google Calendar dans les paramètres.');
      return;
    }

    setIsSyncing(true);
    const forcedCalendarId = '__dj__';
    console.info('[GoogleSyncUI] Start sync', {
      calendarId: forcedCalendarId,
      strictMirror: true,
    });

    try {
      const tokens = JSON.parse(storedTokens);
      const response = await fetch('/api/google-calendar/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens,
          calendarId: forcedCalendarId,
          strictMirror: true,
        }),
      });

      const data = await response.json();
      console.info('[GoogleSyncUI] Sync response', data);

      if (data?.debug?.logs?.length) {
        console.groupCollapsed(`[GoogleSyncUI] Logs serveur (${data.debug.logs.length})`);
        for (const line of data.debug.logs) {
          console.log(line);
        }
        console.groupEnd();
      }

      if (data?.details?.calendarErrors?.length) {
        console.warn('[GoogleSyncUI] Calendar errors', data.details.calendarErrors);
      }

      if (response.ok) {
        alert(
          `Synchronisation DJ (miroir strict) réussie ! ${data.imported || 0} importé(s), ${data.updated || 0} mis à jour, ${data.deleted || 0} supprimé(s), ${data.skipped || 0} ignoré(s). ${
            data?.details?.calendarErrors?.length ? `Erreurs calendriers: ${data.details.calendarErrors.length}.` : ''
          }`
        );
        await loadBookings();
      } else {
        const details = data?.details ? `\nDétail: ${data.details}` : '';
        const requestId = data?.requestId ? `\nRef: ${data.requestId}` : '';
        alert(`Erreur lors de la synchronisation: ${data.error || 'Erreur inconnue'}${details}${requestId}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la synchronisation avec Google Calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  const generateReplacementMessage = () => {
    if (selectedReplacementIds.length === 0) {
      alert('Veuillez sélectionner au moins un booking');
      return;
    }

    const selectedBookings = replacementBookings.filter(b => selectedReplacementIds.includes(b.id));

    // Grouper par client
    const bookingsByClient = selectedBookings.reduce((acc, booking) => {
      const client = clients.find(c => c.id === booking.clientId);
      const clientName = client?.name || booking.clientName || 'Client';
      if (!acc[clientName]) acc[clientName] = [];
      acc[clientName].push(booking);
      return acc;
    }, {} as Record<string, Booking[]>);

    // Générer un message par client
    const messages = Object.entries(bookingsByClient).map(([clientName, bookings]) => {
      const datesList = bookings.map(booking => {
        const date = new Date(booking.start).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        return `📅 ${date}`;
      }).join('\n');

      return `Salut ${clientName},\n\nJe ne peux pas être dispo à cette ou ces dates-là\n\n${datesList}\n\nTu veux que je te trouve quelqu'un ou tu t'en charges ?\n\nMerci !`;
    });

    setGeneratedMessage(messages.join('\n\n---\n\n'));
  };

  const toggleReplacementSelection = (bookingId: string) => {
    setSelectedReplacementIds(prev => 
      prev.includes(bookingId) 
        ? prev.filter(id => id !== bookingId)
        : [...prev, bookingId]
    );
  };

  const toggleSelectAllReplacements = () => {
    if (selectedReplacementIds.length === replacementBookings.length) {
      setSelectedReplacementIds([]);
    } else {
      setSelectedReplacementIds(replacementBookings.map(b => b.id));
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedMessage);
    alert('Message copié dans le presse-papier !');
  };

  // Fonctions pour la disponibilité
  const toggleAvailabilityMode = () => {
    if (availabilityMode) {
      // Sortir du mode disponibilité
      setSelectedAvailabilityDates([]);
    }
    setAvailabilityMode(!availabilityMode);
  };

  const toggleDateSelection = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = date.toDateString();

    const existingIndex = selectedAvailabilityDates.findIndex(d => d.toDateString() === dateStr);

    if (existingIndex >= 0) {
      // Décocher la date
      setSelectedAvailabilityDates(selectedAvailabilityDates.filter((_, i) => i !== existingIndex));
    } else {
      // Cocher la date
      setSelectedAvailabilityDates([...selectedAvailabilityDates, date]);
    }
  };

  const isDateSelected = (day: number): boolean => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = date.toDateString();
    return selectedAvailabilityDates.some(d => d.toDateString() === dateStr);
  };

  const generateAvailabilityMessage = () => {
    if (selectedAvailabilityDates.length === 0) {
      alert('Veuillez sélectionner au moins une date');
      return;
    }

    // Trier les dates
    const sortedDates = [...selectedAvailabilityDates].sort((a, b) => a.getTime() - b.getTime());

    const datesList = sortedDates.map(date => {
      const dateStr = date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      return `📅 ${dateStr}`;
    }).join('\n');

    const isSingleDate = selectedAvailabilityDates.length === 1;
    const message = isSingleDate
      ? `Salut,\n\nJ'espère que tu vas bien ! Je suis disponible à cette date si jamais tu es intéressé :\n\n${datesList}\n\nN'hésite pas à me dire si ça te convient !\n\nÀ bientôt`
      : `Salut,\n\nJ'espère que tu vas bien ! Je suis disponible à ces dates si jamais tu es intéressé :\n\n${datesList}\n\nN'hésite pas à me dire si ça te convient !\n\nÀ bientôt`;

    setAvailabilityMessage(message);
    setShowAvailabilityMessage(true);
  };

  const copyAvailabilityToClipboard = () => {
    navigator.clipboard.writeText(availabilityMessage);
    alert('Message copié dans le presse-papier !');
  };

  return (
    <div className="min-h-screen bg-apple-bg">
      <TopNav />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Tableau de bord</h1>
            <p className="text-gray-600">Bienvenue dans votre espace de gestion DJ</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/web"
              className="btn-primary flex items-center gap-2 text-sm md:text-base touch-manipulation"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden md:inline">Ouvrir l&apos;app</span>
              <span className="md:hidden">App</span>
            </Link>
            <Link
              href="/messages"
              className="btn-secondary flex items-center gap-2 text-sm md:text-base touch-manipulation"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden md:inline">Générer message</span>
              <span className="md:hidden">Message</span>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          {stats.map((stat) => (
            <button
              key={stat.label}
              onClick={() => openStatsModal(stat.type)}
              className="ui-card p-4 md:p-6 transition-all duration-300 cursor-pointer text-left hover:shadow-md"
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

        {/* Section Revenus & URSSAF */}
        {revenueThisMonth > 0 && (
          <div className="ui-card p-4 md:p-6 mb-6 md:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                <Euro className="w-5 h-5 text-brand-600" />
                Revenus & Charges - {monthNames[currentDate.getMonth()]}
              </h2>
              <Link
                href="/settings"
                className="text-xs text-brand-600 hover:text-brand-900 underline"
              >
                Modifier taux
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Total Brut */}
              <div className="ui-card p-4">
                <p className="text-sm text-gray-600 mb-1">Total Brut</p>
                <p className="text-2xl font-bold text-gray-900">{revenueThisMonth.toLocaleString('fr-FR')}€</p>
              </div>

              {/* Charges URSSAF */}
              <div className="ui-card p-4">
                <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                  À prévoir URSSAF
                  <span className="text-xs text-orange-600 font-medium">({urssafRate}%)</span>
                </p>
                <p className="text-2xl font-bold text-orange-600">-{urssafAmount.toLocaleString('fr-FR')}€</p>
              </div>

              {/* Net */}
              <div className="ui-card p-4">
                <p className="text-sm text-gray-600 mb-1">Revenu Net estimé</p>
                <p className="text-2xl font-bold text-green-600">{netRevenue.toLocaleString('fr-FR')}€</p>
              </div>
            </div>

            {/* Jauge Net/URSSAF */}
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Répartition</span>
                <span className="text-xs text-gray-500">{urssafRate}% URSSAF · {(100 - urssafRate).toFixed(1)}% Net</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${100 - urssafPercentFilled}%` }}
                />
                <div
                  className="h-full bg-orange-400 transition-all duration-500"
                  style={{ width: `${urssafPercentFilled}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-green-600 font-medium">Net : {netRevenue.toLocaleString('fr-FR')}€</span>
                <span className="text-orange-600 font-medium">URSSAF : {urssafAmount.toLocaleString('fr-FR')}€</span>
              </div>
            </div>

            {/* Jauge encaissements : dans le mois vs décalés */}
            {revenueThisMonth > 0 && (
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Encaissements</span>
                  <span className="text-xs text-gray-500">
                    {revenueDecale > 0 ? `${revenueOnTime.toLocaleString('fr-FR')}€ direct · ${revenueDecale.toLocaleString('fr-FR')}€ décalé` : 'Tout encaissé dans le mois'}
                  </span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-green-500 transition-all duration-500"
                    style={{ width: `${revenueThisMonth > 0 ? (revenueOnTime / revenueThisMonth) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-yellow-400 transition-all duration-500"
                    style={{ width: `${revenueThisMonth > 0 ? (revenueDecale / revenueThisMonth) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-green-600 font-medium">🟢 Prestations du mois : {revenueOnTime.toLocaleString('fr-FR')}€</span>
                  {revenueDecale > 0 && (
                    <span className="text-yellow-600 font-medium">🟡 Décalés : {revenueDecale.toLocaleString('fr-FR')}€</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Calendrier Mensuel */}
        <div className="ui-card p-4 md:p-6 mb-6 md:mb-8">
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

          {/* Bandeau drag en cours */}
          {draggedBooking && (
            <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-300 rounded-lg text-blue-700 text-sm text-center">
              Glisse <strong>{draggedBooking.title}</strong> sur un autre jour pour le déplacer
            </div>
          )}

          {/* Boutons mode disponibilité */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={toggleAvailabilityMode}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                availabilityMode
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {availabilityMode ? '✓ Mode disponibilité actif' : 'Sélectionner mes disponibilités'}
            </button>
            {availabilityMode && selectedAvailabilityDates.length > 0 && (
              <button
                onClick={generateAvailabilityMessage}
                className="btn-primary"
              >
                Générer message ({selectedAvailabilityDates.length} date{selectedAvailabilityDates.length > 1 ? 's' : ''})
              </button>
            )}
          </div>

          {/* En-têtes des jours - Sticky */}
          <div className="sticky top-16 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 border-b border-gray-200 shadow-md -mx-4 md:-mx-6 px-4 md:px-6">
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {dayNames.map((day, dayIndex) => (
                <div
                  key={day}
                  className={`text-center font-semibold text-xs md:text-sm py-2.5 md:py-3 leading-none ${
                    dayIndex >= 5 ? 'text-orange-700' : 'text-gray-700'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Grille du calendrier - Jours du mois */}
          <div className="grid grid-cols-7 gap-1 md:gap-2 mt-1.5">
            {getDaysInMonth(currentDate).map((day, index) => {
              const dayBookings = hasBooking(day);
              const hasMultipleBookings = dayBookings && dayBookings.length > 1;
              const isSelected = day ? isDateSelected(day) : false;
              const dateForCell = day ? new Date(currentDate.getFullYear(), currentDate.getMonth(), day) : null;
              const isWeekend = !!dateForCell && (dateForCell.getDay() === 0 || dateForCell.getDay() === 6);
              const isWeekendTone = !!dateForCell && (dateForCell.getDay() === 5 || dateForCell.getDay() === 6 || dateForCell.getDay() === 0);
              const isHoliday = !!dateForCell && currentYearHolidays.has(toDateKey(dateForCell));
              const nextDay = dateForCell ? new Date(dateForCell) : null;
              if (nextDay) nextDay.setDate(nextDay.getDate() + 1);
              const isHolidayEve = !!nextDay && !isHoliday && holidaysIncludingNextYear.has(toDateKey(nextDay));
              const dayToneStyle = isHoliday
                ? { backgroundColor: '#FEF2F2' }
                : isHolidayEve
                  ? { backgroundColor: '#FFFBEB' }
                  : isWeekendTone
                    ? { backgroundColor: '#FFF7ED' }
                    : {};

              return (
                <div
                  key={index}
                  className={
                    `
                    aspect-square flex flex-col items-center justify-center rounded-lg text-sm md:text-base p-1 relative
                    ${day ? 'hover:scale-105 cursor-pointer touch-manipulation transition-transform' : ''}
                    ${day ? 'bg-[#FCFCFD] border border-[#ECEFF3]' : ''}
                    ${isToday(day) ? 'ring-2 ring-purple-600 ring-offset-2 font-bold' : ''}
                    ${!day ? 'text-gray-300' : ''}
                    ${isSelected && availabilityMode ? 'ring-4 ring-green-500 bg-green-50' : ''}
                    ${draggedBooking && day && dragOverDay === day ? 'ring-4 ring-blue-400 scale-105' : ''}
                  `
                  }
                  style={isSelected && availabilityMode ? {
                    backgroundColor: '#dcfce7',
                    border: '3px solid #22c55e',
                  } : (draggedBooking && day && dragOverDay === day ? {
                    backgroundColor: '#dbeafe',
                    border: '2px solid #3b82f6',
                  } : dayToneStyle)}
                  onClick={() => handleDayClick(day)}
                  onDragOver={(e) => { if (draggedBooking && day) { e.preventDefault(); setDragOverDay(day); } }}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={(e) => { e.preventDefault(); if (day) handleBookingDrop(day); }}
                >
                  {isHoliday && day && (
                    <div className="absolute top-1 right-1 px-1 py-0 md:px-1.5 md:py-0.5 rounded bg-red-100 text-red-700 text-[9px] md:text-[10px] font-semibold leading-none">
                      F
                    </div>
                  )}
                  {!isHoliday && isWeekend && day && (
                    <div className="absolute top-1 right-1 px-1 py-0 md:px-1.5 md:py-0.5 rounded bg-orange-100 text-orange-700 text-[9px] md:text-[10px] font-semibold leading-none">
                      WE
                    </div>
                  )}
                  {!isHoliday && !isWeekend && isHolidayEve && day && (
                    <div className="absolute top-1 right-1 px-1 py-0 md:px-1.5 md:py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] md:text-[10px] font-semibold leading-none">
                      VF
                    </div>
                  )}
                  {availabilityMode && day && (
                    <div className="absolute top-1 left-1">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? 'bg-green-600 border-green-600'
                          : 'bg-white border-gray-400'
                      }`}>
                        {isSelected && (
                          <span className="text-white text-xs font-bold">✓</span>
                        )}
                      </div>
                    </div>
                  )}
                  <span className={`font-semibold ${isToday(day) ? 'text-brand-700' : 'text-gray-900'}`}>{day || ''}</span>
                  {hasMultipleBookings && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white" title="Plusieurs réservations"></div>
                  )}
                  {dayBookings && dayBookings.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1 w-full px-0.5">
                      {dayBookings.slice(0, 2).map((booking, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggedBooking(booking);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => { setDraggedBooking(null); setDragOverDay(null); }}
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
                            className="text-xs truncate px-1 rounded flex-1 cursor-grab active:cursor-grabbing"
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
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-200 border border-orange-300"></div>
              <span className="text-gray-600">Week-end</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-200 border border-red-300"></div>
              <span className="text-gray-600">Jour férié (France)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-200 border border-amber-300"></div>
              <span className="text-gray-600">Veille de jour férié</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="ui-card p-4 md:p-6 mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {quickActions.map((action) => 
              action.onClick ? (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  disabled={action.label === 'Sync Google Calendar' && isSyncing}
                  className={`${action.color} text-white rounded-lg p-3 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 hover:opacity-90 transition-opacity touch-manipulation min-h-[80px] md:min-h-0 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <action.icon className={`w-5 h-5 ${action.label === 'Sync Google Calendar' && isSyncing ? 'animate-spin' : ''}`} />
                  <span className="font-medium text-sm md:text-base text-center md:text-left">
                    {action.label === 'Sync Google Calendar' && isSyncing ? 'Synchro...' : action.label}
                  </span>
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
                        <p className="text-sm text-brand-600 font-medium">{booking.price.toLocaleString('fr-FR')}€</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canInvoice && (
                        <button
                          onClick={(e) => handleCreateInvoiceFromBooking(booking, e)}
                          className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
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
              <Link href="/bookings" className="text-brand-600 hover:text-brand-700 font-medium mt-2 inline-block">
                Créer un BOOKING DJ
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Day Bookings Modal */}
      {isDayBookingsOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setIsDayBookingsOpen(false)}
        >
          <div
            className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
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
              {dayBookings.map((b) => {
                const isPastEvent = new Date(b.end) < new Date();
                const canInvoice = (b.status === 'confirmé' || b.status === 'terminé') && isPastEvent;

                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    style={{ borderLeft: `6px solid ${getClientColor(b.clientId)}` }}
                  >
                    <button
                      onClick={() => {
                        setIsDayBookingsOpen(false);
                        openEditBooking(b);
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="font-semibold text-gray-900">{b.title}</div>
                      <div className="text-sm text-gray-600">
                        {b.clientName} • {new Date(b.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>

                    {canInvoice && (
                      <button
                        onClick={(e) => handleCreateInvoiceFromBooking(b, e)}
                        className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors flex-shrink-0"
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
                onClick={() => {
                  setIsDayBookingsOpen(false);
                  if (selectedDate) openCreateBookingForDate(selectedDate);
                }}
                className="w-full btn-primary"
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
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowStatsModal(false)}
        >
          <div 
            className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {statsModalType === 'bookings' && 'Bookings ce mois'}
                {statsModalType === 'clients' && 'Top clients récurrents'}
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
                  <p className="text-xs text-gray-500 mb-2">
                    Classement sur les 12 derniers mois: qui te fait le plus bosser + ce qu&apos;il rapporte.
                  </p>
                  {topRecurringClients.length === 0 ? (
                    <p className="text-gray-700 text-center py-8">Aucun client actif sur les 12 derniers mois</p>
                  ) : (
                    topRecurringClients.map((insight, index) => (
                      <div
                        key={insight.client.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedClientBookings(insight.windowBookings);
                          setSelectedClientName(insight.client.name);
                          setShowClientBookingsModal(true);
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: insight.client.color || '#3B82F6' }}
                            />
                            <h3 className="font-bold text-lg text-gray-900">
                              #{index + 1} {insight.client.name}
                            </h3>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <p className="text-gray-800">🎵 {insight.bookingsCount12m} booking(s) / 12 mois</p>
                          <p className="text-gray-800">💰 {insight.totalRevenue12m.toLocaleString('fr-FR')}€ (12 mois)</p>
                          <p className="text-gray-800">📈 Moyenne: {insight.avgRevenuePerActiveMonth.toLocaleString('fr-FR')}€ / mois actif</p>
                          <p className="text-gray-800">📅 Ce mois: {insight.bookingsThisMonth} booking(s) · {insight.revenueThisMonth.toLocaleString('fr-FR')}€</p>
                          {insight.client.email && (
                            <p className="text-gray-800">📧 {insight.client.email}</p>
                          )}
                          {insight.client.phone && (
                            <p className="text-gray-800">📱 {insight.client.phone}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Factures en attente */}
              {statsModalType === 'invoices' && (
                <div className="space-y-3">
                  {pendingPaymentInvoices.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      Aucune facture en attente de paiement
                    </p>
                  ) : (
                    pendingPaymentInvoices.map((invoice) => {
                      const client = clients.find(c => c.id === invoice.clientId);
                      return (
                        <div
                          key={invoice.id}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => {
                            setShowStatsModal(false);
                            window.location.href = '/invoices';
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-orange-600" />
                              <h3 className="font-bold text-lg text-gray-900">
                                Facture {invoice.number || invoice.id.slice(0, 8)}
                              </h3>
                            </div>
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                              En attente
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <p className="text-gray-800">
                              👤 {client?.name || 'Client inconnu'}
                            </p>
                            <p className="text-gray-800">
                              💰 {invoice.totals.total.toLocaleString('fr-FR')}€
                            </p>
                            {invoice.issueDate && (
                              <p className="text-gray-600 col-span-2">
                                📅 {new Date(invoice.issueDate).toLocaleDateString('fr-FR')}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Revenus ce mois */}
              {statsModalType === 'revenue' && (
                <div className="space-y-4">
                  <div className="ui-card p-6">
                    <p className="text-sm text-gray-600 mb-2">Revenus total ce mois</p>
                    <p className="text-4xl font-bold text-brand-600">{revenueThisMonth.toLocaleString('fr-FR')}€</p>
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
                              <p className="text-xl font-bold text-brand-600">{booking.price.toLocaleString('fr-FR')}€</p>
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
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowReplacementModal(false);
            setGeneratedMessage('');
            setSelectedReplacementIds([]);
          }}
        >
          <div 
            className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Messages Remplaçant</h2>
              <button
                onClick={() => {
                  setShowReplacementModal(false);
                  setGeneratedMessage('');
                  setSelectedReplacementIds([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {replacementBookings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-700 text-lg">Aucun booking avec le statut &quot;Remplaçant&quot;</p>
                  <p className="text-gray-600 text-sm mt-2">Modifiez un booking pour le marquer comme &quot;Remplaçant&quot;</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg text-gray-900">Sélectionnez un ou plusieurs bookings :</h3>
                    <button
                      onClick={toggleSelectAllReplacements}
                      className="px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    >
                      {selectedReplacementIds.length === replacementBookings.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  
                  <div className="grid gap-3">
                    {replacementBookings.map((booking) => {
                      const isSelected = selectedReplacementIds.includes(booking.id);
                      return (
                        <button
                          key={booking.id}
                          onClick={() => toggleReplacementSelection(booking.id)}
                          className={`border rounded-lg p-4 transition-colors text-left ${
                            isSelected 
                              ? 'bg-orange-50 border-orange-300' 
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleReplacementSelection(booking.id)}
                              className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500"
                              onClick={(e) => e.stopPropagation()}
                            />
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
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-medium text-orange-700 bg-orange-100">
                            Remplaçant
                          </span>
                        </div>
                      </button>
                      );
                    })}
                  </div>

                  {selectedReplacementIds.length > 0 && (
                    <button
                      onClick={generateReplacementMessage}
                      className="w-full btn-primary font-semibold"
                    >
                      Générer le message ({selectedReplacementIds.length} sélectionné{selectedReplacementIds.length > 1 ? 's' : ''})
                    </button>
                  )}

                  {generatedMessage && (
                    <div className="mt-6 border-t pt-6">
                      <h3 className="font-semibold text-lg text-gray-900 mb-3">Message généré :</h3>
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <pre className="whitespace-pre-wrap text-sm text-gray-900 font-sans">{generatedMessage}</pre>
                      </div>
                      <button
                        onClick={copyToClipboard}
                        className="w-full btn-secondary"
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
                  setSelectedReplacementIds([]);
                }}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Bookings Modal */}
      {showClientBookingsModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowClientBookingsModal(false)}
        >
          <div 
            className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-apple-border bg-apple-card">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  Bookings de {selectedClientName}
                </h2>
                <button
                  onClick={() => setShowClientBookingsModal(false)}
                  className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <p className="text-apple-text-muted mt-2">
                {selectedClientBookings.length} booking(s) au total
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {selectedClientBookings.length === 0 ? (
                <p className="text-gray-700 text-center py-8">Aucun booking trouvé</p>
              ) : (
                <div className="space-y-3">
                  {selectedClientBookings
                    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                    .map((booking) => {
                      const startDate = new Date(booking.start);
                      const endDate = new Date(booking.end);
                      const statusColors: Record<string, string> = {
                        'option': 'bg-yellow-100 text-yellow-700',
                        'confirmé': 'bg-green-100 text-green-700',
                        'remplaçant': 'bg-orange-100 text-orange-700',
                        'annulé': 'bg-red-100 text-red-700',
                        'terminé': 'bg-blue-100 text-blue-700',
                      };
                      const statusColor = statusColors[booking.status || 'option'] || 'bg-gray-100 text-gray-700';

                      return (
                        <div
                          key={booking.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedBooking(booking);
                            setIsBookingModalOpen(true);
                            setShowClientBookingsModal(false);
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-lg text-gray-900">
                                  {booking.displayName || 'Sans titre'}
                                </h3>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                                  {booking.status || 'option'}
                                </span>
                              </div>
                              <div className="space-y-1 text-sm text-gray-800">
                                <p>📅 {startDate.toLocaleDateString('fr-FR', { 
                                  weekday: 'long', 
                                  day: 'numeric', 
                                  month: 'long', 
                                  year: 'numeric' 
                                })}</p>
                                <p>🕐 {startDate.toLocaleTimeString('fr-FR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })} - {endDate.toLocaleTimeString('fr-FR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}</p>
                                {booking.location && (
                                  <p>📍 {booking.location}</p>
                                )}
                                {booking.price !== undefined && (
                                  <p className="font-semibold text-gray-900">💰 {booking.price}€</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowClientBookingsModal(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Message de Disponibilité */}
      {showAvailabilityMessage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowAvailabilityMessage(false)}
        >
          <div
            className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Message de Disponibilité</h2>
              <button
                onClick={() => setShowAvailabilityMessage(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 mb-2 font-semibold">
                  {selectedAvailabilityDates.length} date{selectedAvailabilityDates.length > 1 ? 's' : ''} sélectionnée{selectedAvailabilityDates.length > 1 ? 's' : ''} :
                </p>
                <div className="space-y-1">
                  {selectedAvailabilityDates
                    .sort((a, b) => a.getTime() - b.getTime())
                    .map((date, i) => (
                      <p key={i} className="text-sm text-gray-600">
                        • {date.toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    ))}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <pre className="whitespace-pre-wrap font-sans text-gray-900 text-sm leading-relaxed">
                  {availabilityMessage}
                </pre>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={copyAvailabilityToClipboard}
                className="flex-1 btn-primary font-medium"
              >
                Copier le message
              </button>
              <button
                onClick={() => {
                  setShowAvailabilityMessage(false);
                  setAvailabilityMode(false);
                  setSelectedAvailabilityDates([]);
                }}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
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
