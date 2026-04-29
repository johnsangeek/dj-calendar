'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Booking, Invoice } from '@/types';

export interface PendingInvoiceBooking {
  booking: Booking;
  daysSince: number; // Nombre de jours depuis la prestation
}

export function usePendingInvoices() {
  const [pendingBookings, setPendingBookings] = useState<PendingInvoiceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPendingInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Charger les bookings et les factures en parallèle
      const [bookingsSnap, invoicesSnap] = await Promise.all([
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'invoices')),
      ]);

      // Extraire les bookingIds qui ont déjà une facture (bookingId + bookingIds)
      const invoicedBookingIds = new Set<string>();
      invoicesSnap.docs.forEach((invoiceDoc) => {
        const data = invoiceDoc.data() as Partial<Invoice>;

        // Une facture annulée n'empêche pas de facturer à nouveau
        if (data.status === 'CANCELLED') return;
        // Seules les vraies factures bloquent la cloche
        if (data.documentType && data.documentType !== 'INVOICE') return;

        if (typeof data.bookingId === 'string' && data.bookingId) {
          invoicedBookingIds.add(data.bookingId);
        }
        if (Array.isArray(data.bookingIds)) {
          data.bookingIds.forEach((bookingId) => {
            if (typeof bookingId === 'string' && bookingId) {
              invoicedBookingIds.add(bookingId);
            }
          });
        }
      });

      const now = new Date();

      // Filtrer les bookings qui nécessitent une facture
      const pending: PendingInvoiceBooking[] = [];

      bookingsSnap.docs.forEach((bookingDoc) => {
        const data = bookingDoc.data();
        const start = data.start?.toDate ? data.start.toDate() : new Date(data.start);
        const end = data.end?.toDate ? data.end.toDate() : new Date(data.end);

        if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
          return;
        }

        const booking: Booking = {
          id: bookingDoc.id,
          title: data.title,
          clientId: data.clientId,
          clientName: data.clientName,
          displayName: data.displayName,
          start,
          end,
          location: data.location,
          notes: data.notes,
          price: data.price,
          deposit: data.deposit,
          status: data.status,
          sync: data.sync,
          invoicedExternally: data.invoicedExternally,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        };

        // Vérifier les conditions:
        // 1. Status = confirmé OU terminé
        // 2. Fin de prestation passée
        // 3. Pas de facture associée
        // 4. Pas marqué "déjà facturé"
        const isConfirmedOrCompleted = booking.status === 'confirmé' || booking.status === 'terminé';
        const isPast = booking.end < now;
        const hasNoInvoice = !invoicedBookingIds.has(booking.id);
        const notExternallyInvoiced = !booking.invoicedExternally;

        if (isConfirmedOrCompleted && isPast && hasNoInvoice && notExternallyInvoiced && booking.price > 0) {
          // Calculer le nombre de jours depuis la prestation
          const daysSince = Math.floor((now.getTime() - booking.end.getTime()) / (1000 * 60 * 60 * 24));

          pending.push({
            booking,
            daysSince,
          });
        }
      });

      // Trier par date décroissante (les plus récentes en premier)
      pending.sort((a, b) => b.booking.start.getTime() - a.booking.start.getTime());

      setPendingBookings(pending);
    } catch (err) {
      console.error('Erreur chargement factures en attente:', err);
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPendingInvoices();
  }, [loadPendingInvoices]);

  useEffect(() => {
    const onFocus = () => loadPendingInvoices();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPendingInvoices();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = window.setInterval(loadPendingInvoices, 60_000);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [loadPendingInvoices]);

  return {
    pendingBookings,
    count: pendingBookings.length,
    loading,
    error,
    refresh: loadPendingInvoices,
  };
}
