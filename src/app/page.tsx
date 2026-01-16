'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Calendar, Users, FileText, MessageSquare, TrendingUp, Euro, ChevronLeft, ChevronRight, X, RefreshCw, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { Booking, Client } from '@/types';
import BookingModal from '@/components/BookingModal';

type GoogleCalendarInfo = {
  id: string;
  summary?: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
};

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
  const [showClientBookingsModal, setShowClientBookingsModal] = useState(false);
  const [selectedClientBookings, setSelectedClientBookings] = useState<Booking[]>([]);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedReplacementIds, setSelectedReplacementIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [excludeAllDayEvents, setExcludeAllDayEvents] = useState(true);
  const [excludeAnniversaryEvents, setExcludeAnniversaryEvents] = useState(true);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupSelectedIds, setCleanupSelectedIds] = useState<string[]>([]);
  const [cleanupKeywordFilter, setCleanupKeywordFilter] = useState('anniversaire, birthday, fête');
  const [cleanupSearchTerm, setCleanupSearchTerm] = useState('');
  const [isCleanupDeleting, setIsCleanupDeleting] = useState(false);
  const [cleanupCalendarFilter, setCleanupCalendarFilter] = useState<'all' | string>('all');
  const [preferredCalendarId, setPreferredCalendarId] = useState<string | null>(null);
  
  useEffect(() => {
    loadBookings();
    loadClients();
    const storedPreferredCalendar = localStorage.getItem('preferred_google_calendar_id');
    if (storedPreferredCalendar) {
      setPreferredCalendarId(storedPreferredCalendar);
    }
  }, []);

  const googleImportedBookings = useMemo(() => {
    return bookings.filter((booking) => booking.sync?.provider === 'google');
  }, [bookings]);

  const googleCalendarsForCleanup = useMemo(() => {
    const counts = new Map<string, number>();

    googleImportedBookings.forEach((booking) => {
      const calendarId = booking.sync?.calendarId || 'inconnu';
      counts.set(calendarId, (counts.get(calendarId) || 0) + 1);
    });

    const formatLabel = (calendarId: string) => {
      if (!calendarId || calendarId === 'inconnu') {
        return 'Calendrier inconnu';
      }
      const atIndex = calendarId.indexOf('@');
      if (atIndex > 0) {
        return calendarId.slice(0, atIndex);
      }
      return calendarId;
    };

    return Array.from(counts.entries()).map(([calendarId, count]) => ({
      id: calendarId,
      label: formatLabel(calendarId),
      count,
    }));
  }, [googleImportedBookings]);

  const cleanupBaseBookings = useMemo(() => {
    if (cleanupCalendarFilter === 'all') {
      return googleImportedBookings;
    }
    return googleImportedBookings.filter((booking) => booking.sync?.calendarId === cleanupCalendarFilter);
  }, [googleImportedBookings, cleanupCalendarFilter]);

  const cleanupKeywords = useMemo(() => {
    return cleanupKeywordFilter
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean);
  }, [cleanupKeywordFilter]);

  const filteredCleanupBookings = useMemo(() => {
    const search = cleanupSearchTerm.trim().toLowerCase();
    if (!search) {
      return cleanupBaseBookings;
    }

    return cleanupBaseBookings.filter((booking) => {
      const label = `${booking.title || ''} ${booking.displayName || ''} ${booking.clientName || ''} ${booking.location || ''}`.toLowerCase();
      return label.includes(search);
    });
  }, [cleanupBaseBookings, cleanupSearchTerm]);

  const isLikelyConvertedAllDay = (booking: Booking) => {
    const start = new Date(booking.start);
    const end = new Date(booking.end);
    return start.getHours() === 20 && end.getHours() === 2;
  };

  const matchesCleanupKeyword = (booking: Booking) => {
    if (cleanupKeywords.length === 0) {
      return false;
    }

    const label = `${booking.title || ''} ${booking.displayName || ''} ${booking.clientName || ''}`.toLowerCase();
    return cleanupKeywords.some((keyword) => keyword && label.includes(keyword));
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
  const revenueThisMonth = confirmedBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const activeClientsThisMonth = [...new Set(bookingsThisMonth.map(b => b.clientId).filter(Boolean))].length;
  const pendingInvoices = 0; // À implémenter avec les factures
  
  const stats = [
    { label: 'Bookings ce mois', value: bookingsThisMonth.length.toString(), icon: Calendar, color: 'bg-blue-500', type: 'bookings' as const },
    { label: 'Clients actifs', value: activeClientsThisMonth.toString(), icon: Users, color: 'bg-green-500', type: 'clients' as const },
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
    { label: 'Sync Google Calendar', href: '#', icon: RefreshCw, color: 'bg-purple-600', onClick: () => openCalendarSyncModal() },
    { label: 'Nettoyer imports Google', href: '#', icon: Trash2, color: 'bg-red-600', onClick: () => openCleanupModal() },
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
    setSelectedReplacementIds([]);
    setGeneratedMessage('');
    setShowReplacementModal(true);
  };

  const openCalendarSyncModal = async () => {
    const storedTokens = localStorage.getItem('google_calendar_tokens');

    if (!storedTokens) {
      alert('Connecte d\'abord ton compte Google Calendar dans les paramètres.');
      return;
    }

    setCalendarError(null);
    setShowCalendarModal(true);
    setCalendarLoading(true);
    setExcludeAllDayEvents(true);
    setExcludeAnniversaryEvents(true);

    try {
      const tokens = JSON.parse(storedTokens);
      const response = await fetch('/api/google-calendar/calendars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokens }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des calendriers');
      }

      const calendars: GoogleCalendarInfo[] = data.calendars || [];
      const djCalendars = calendars.filter((cal) => cal.summary?.toLowerCase().includes('dj'));
      const filteredCalendars = djCalendars.length > 0 ? djCalendars : calendars;

      setAvailableCalendars(filteredCalendars);

      if (filteredCalendars.length > 0) {
        const preferredExists = preferredCalendarId && filteredCalendars.some((cal) => cal.id === preferredCalendarId);
        const initialCalendarId = preferredExists
          ? preferredCalendarId
          : djCalendars[0]?.id || filteredCalendars[0].id;
        setSelectedCalendarId(initialCalendarId);
      } else {
        setSelectedCalendarId(null);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des calendriers:', error);
      setCalendarError(error instanceof Error ? error.message : 'Erreur lors du chargement des calendriers');
    } finally {
      setCalendarLoading(false);
    }
  };

  const openCleanupModal = () => {
    const defaultKeywords = ['anniversaire', 'birthday', 'fête'];
    setCleanupKeywordFilter(defaultKeywords.join(', '));
    setCleanupSearchTerm('');

    const filteredSource = preferredCalendarId
      ? googleImportedBookings.filter((booking) => booking.sync?.calendarId === preferredCalendarId)
      : googleImportedBookings;

    const initialSelection = filteredSource
      .filter((booking) => {
        const label = `${booking.title || ''} ${booking.displayName || ''} ${booking.clientName || ''}`.toLowerCase();
        return defaultKeywords.some((keyword) => label.includes(keyword));
      })
      .map((booking) => booking.id);

    setCleanupSelectedIds(initialSelection);
    setCleanupCalendarFilter(preferredCalendarId || 'all');
    setShowCleanupModal(true);
  };

  const closeCleanupModal = () => {
    if (isCleanupDeleting) return;
    setShowCleanupModal(false);
    setCleanupSelectedIds([]);
    setCleanupSearchTerm('');
    setCleanupKeywordFilter('anniversaire, birthday, fête');
    setCleanupCalendarFilter(preferredCalendarId || 'all');
  };

  const toggleCleanupSelection = (bookingId: string) => {
    setCleanupSelectedIds((prev) =>
      prev.includes(bookingId) ? prev.filter((id) => id !== bookingId) : [...prev, bookingId]
    );
  };

  const selectFilteredCleanup = () => {
    setCleanupSelectedIds(filteredCleanupBookings.map((booking) => booking.id));
  };

  const selectKeywordCleanup = () => {
    const matches = googleImportedBookings
      .filter((booking) => {
        const label = `${booking.title || ''} ${booking.displayName || ''} ${booking.clientName || ''}`.toLowerCase();
        return cleanupKeywords.some((keyword) => keyword && label.includes(keyword));
      })
      .map((booking) => booking.id);

    setCleanupSelectedIds(matches);
  };

  const deselectAllCleanup = () => {
    setCleanupSelectedIds([]);
  };

  const handleCleanupDelete = async () => {
    if (cleanupSelectedIds.length === 0) {
      alert('Sélectionne au moins un événement à supprimer.');
      return;
    }

    const confirmDelete = window.confirm(`Supprimer ${cleanupSelectedIds.length} événement(s) importé(s) ?`);
    if (!confirmDelete) {
      return;
    }

    setIsCleanupDeleting(true);

    try {
      await Promise.all(
        cleanupSelectedIds.map((bookingId) => deleteDoc(doc(db, 'bookings', bookingId)))
      );

      await loadBookings();
      alert(`${cleanupSelectedIds.length} événement(s) supprimé(s).`);
      setCleanupSelectedIds([]);
      setShowCleanupModal(false);
      setCleanupSearchTerm('');
    } catch (error) {
      console.error('Erreur lors de la suppression des événements importés:', error);
      alert('Erreur lors de la suppression des événements sélectionnés.');
    } finally {
      setIsCleanupDeleting(false);
    }
  };

  const handleSyncGoogleCalendar = async (calendarId?: string) => {
    const storedTokens = localStorage.getItem('google_calendar_tokens');

    if (!storedTokens) {
      alert('Connecte d\'abord ton compte Google Calendar dans les paramètres.');
      return;
    }

    setIsSyncing(true);

    try {
      const tokens = JSON.parse(storedTokens);
      const response = await fetch('/api/google-calendar/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens,
          calendarId,
          filters: {
            excludeAllDayEvents,
            excludeKeywords: excludeAnniversaryEvents ? ['anniversaire', 'anniversary', 'birthday', 'fête'] : [],
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Synchronisation réussie ! ${data.imported || 0} événement(s) importé(s). ${data.skipped || 0} ignoré(s).`);
        setShowCalendarModal(false);
        setCalendarError(null);
        if (calendarId) {
          setPreferredCalendarId(calendarId);
          localStorage.setItem('preferred_google_calendar_id', calendarId);
        }
        await loadBookings();
      } else {
        alert(`Erreur lors de la synchronisation: ${data.error || 'Erreur inconnue'}`);
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
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setIsDayBookingsOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden"
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

      {/* Calendar Selection Modal */}
      {showCalendarModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            if (!isSyncing) {
              setShowCalendarModal(false);
              setCalendarError(null);
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Sélection du calendrier</h2>
                <p className="text-sm text-gray-600 mt-1">Choisis le calendrier Google à synchroniser.</p>
              </div>
              <button
                onClick={() => {
                  if (!isSyncing) {
                    setShowCalendarModal(false);
                    setCalendarError(null);
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSyncing}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {calendarLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-600">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mb-3"></div>
                  Chargement des calendriers...
                </div>
              ) : calendarError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
                  {calendarError}
                </div>
              ) : availableCalendars.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                  Aucun calendrier trouvé. Vérifie que ton compte Google possède bien le calendrier DJ.
                </div>
              ) : (
                <div className="space-y-3">
                  {availableCalendars.map((calendar) => (
                    <label
                      key={calendar.id}
                      className={`border rounded-lg p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                        selectedCalendarId === calendar.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="google-calendar"
                        value={calendar.id}
                        checked={selectedCalendarId === calendar.id}
                        onChange={() => setSelectedCalendarId(calendar.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{calendar.summary || 'Sans titre'}</h3>
                          {calendar.primary && (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">Principal</span>
                          )}
                        </div>
                        {calendar.description && (
                          <p className="text-sm text-gray-600 mt-1">{calendar.description}</p>
                        )}
                        {calendar.backgroundColor && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            <span>Couleur :</span>
                            <span
                              className="inline-block w-4 h-4 rounded"
                              style={{ backgroundColor: calendar.backgroundColor }}
                            ></span>
                          </div>
                        )}
                      </div>
                    </label>
                  ))}

                  <div className="mt-6 border-t pt-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Filtres</h3>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={excludeAllDayEvents}
                        onChange={(e) => setExcludeAllDayEvents(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-sm text-gray-700">
                        Ignorer les événements sur toute la journée (souvent utilisés pour les anniversaires).
                      </span>
                    </label>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={excludeAnniversaryEvents}
                        onChange={(e) => setExcludeAnniversaryEvents(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-sm text-gray-700">
                        Ignorer les événements contenant les mots « anniversaire », « birthday », « fête ».
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-600">
                Les événements d'anniversaire ou des autres calendriers ne seront importés que si tu les sélectionnes.
              </p>
              <button
                onClick={() => handleSyncGoogleCalendar(selectedCalendarId || undefined)}
                disabled={!selectedCalendarId || isSyncing || calendarLoading}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? 'Synchronisation...' : 'Lancer la synchronisation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Modal */}
      {showCleanupModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeCleanupModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Nettoyer les imports Google</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {googleImportedBookings.length} événement(s) importé(s) détecté(s) via Google Calendar.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={selectKeywordCleanup}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors"
                  disabled={googleImportedBookings.length === 0}
                >
                  Mots-clés
                </button>
                <button
                  onClick={selectFilteredCleanup}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                  disabled={filteredCleanupBookings.length === 0}
                >
                  Sélection filtrée
                </button>
                <button
                  onClick={deselectAllCleanup}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  disabled={cleanupSelectedIds.length === 0}
                >
                  Tout désélectionner
                </button>
                <button
                  onClick={closeCleanupModal}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isCleanupDeleting}
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 border-b border-gray-200 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mots-clés à détecter</label>
                <input
                  type="text"
                  value={cleanupKeywordFilter}
                  onChange={(e) => setCleanupKeywordFilter(e.target.value)}
                  className="w-full rounded-lg border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  placeholder="anniversaire, birthday, fête"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Sépare les mots-clés par des virgules. Utilisés pour la sélection rapide.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filtrer par texte</label>
                <input
                  type="text"
                  value={cleanupSearchTerm}
                  onChange={(e) => setCleanupSearchTerm(e.target.value)}
                  className="w-full rounded-lg border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  placeholder="Rechercher dans les titres, clients ou lieux"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Laisse vide pour afficher tous les événements importés.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filtrer par calendrier</label>
                <select
                  value={cleanupCalendarFilter}
                  onChange={(e) => setCleanupCalendarFilter(e.target.value)}
                  className="w-full rounded-lg border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                >
                  <option value="all">Tous les calendriers</option>
                  {googleCalendarsForCleanup.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.label} ({calendar.count})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Utile si tu veux supprimer uniquement un calendrier Google (ex: primary, famille, DJ... ).
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {googleImportedBookings.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  Aucun événement importé depuis Google Calendar pour le moment.
                </div>
              ) : filteredCleanupBookings.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  Aucun événement ne correspond à ta recherche.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCleanupBookings.map((booking) => {
                    const isSelected = cleanupSelectedIds.includes(booking.id);
                    const keywordMatch = matchesCleanupKeyword(booking);
                    const convertedAllDay = isLikelyConvertedAllDay(booking);
                    const startDate = new Date(booking.start);
                    const endDate = new Date(booking.end);

                    return (
                      <label
                        key={booking.id}
                        className={`border rounded-lg p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                          isSelected ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCleanupSelection(booking.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{booking.title || 'Sans titre'}</h3>
                              <p className="text-sm text-gray-700">
                                {booking.displayName || booking.clientName || 'Client non renseigné'}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {startDate.toLocaleDateString('fr-FR', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                })}
                                {' • '}
                                {startDate.toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {' - '}
                                {endDate.toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              {booking.location && (
                                <p className="text-xs text-gray-600 mt-1">📍 {booking.location}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                                Import Google
                              </span>
                              {keywordMatch && (
                                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
                                  Mot-clé
                                </span>
                              )}
                              {convertedAllDay && (
                                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                                  Journée
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-gray-600">
                {cleanupSelectedIds.length} événement(s) sélectionné(s) sur {filteredCleanupBookings.length} affiché(s).
              </p>
              <div className="flex flex-col md:flex-row gap-2">
                <button
                  onClick={closeCleanupModal}
                  className="px-6 py-3 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                  disabled={isCleanupDeleting}
                >
                  Annuler
                </button>
                <button
                  onClick={handleCleanupDelete}
                  className="px-6 py-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={cleanupSelectedIds.length === 0 || isCleanupDeleting}
                >
                  {isCleanupDeleting ? 'Suppression...' : `Supprimer ${cleanupSelectedIds.length || ''}`}
                </button>
              </div>
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
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
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
                    const uniqueClientIds = [...new Set(bookingsThisMonth.map(b => b.clientId).filter(Boolean))];
                    const activeClientsList = clients.filter(c => uniqueClientIds.includes(c.id));

                    return activeClientsList.length === 0 ? (
                      <p className="text-gray-700 text-center py-8">Aucun client actif ce mois</p>
                    ) : (
                      activeClientsList.map((client) => {
                        const clientBookingsThisMonth = bookingsThisMonth.filter(b => b.clientId === client.id);
                        const totalRevenue = clientBookingsThisMonth.reduce((sum, b) => sum + (b.price || 0), 0);

                        return (
                          <div
                            key={client.id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedClientBookings(clientBookingsThisMonth);
                              setSelectedClientName(client.name);
                              setShowClientBookingsModal(true);
                            }}
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
                                🎵 {clientBookingsThisMonth.length} booking(s)
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
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowReplacementModal(false);
            setGeneratedMessage('');
            setSelectedReplacementIds([]);
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
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
                  <p className="text-gray-700 text-lg">Aucun booking avec le statut "Remplaçant"</p>
                  <p className="text-gray-600 text-sm mt-2">Modifiez un booking pour le marquer comme "Remplaçant"</p>
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
                      className="w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold"
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
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700">
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
              <p className="text-purple-100 mt-2">
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
    </div>
  );
}
