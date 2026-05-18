'use client';

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Download,
  FileText,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  RotateCcw,
  Search,
  Filter,
  Package,
  Clock,
  Euro,
  FileCheck,
  AlertCircle,
  X,
  Mail,
  MessageCircle,
  Eye,
} from 'lucide-react';
import { TopNav } from '@/components/TopNav';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import {
  Booking,
  Client,
  DJInfo,
  Invoice,
  InvoiceDocumentType,
  InvoiceStatus,
  InvoiceLineItem,
  CatalogService,
  ServicePackage,
} from '@/types';
import {
  buildInvoicePayload,
  InvoiceWritePayload,
  generateInvoiceNumber,
  generateInvoiceHash,
  canEditInvoice,
  canCancelInvoice,
  canMarkAsPaid,
  canCreateCreditNote,
  canConvertQuoteToInvoice,
  LEGAL_TEXTS,
  DEFAULT_PAYMENT_TERMS,
} from '@/lib/invoices';
import { generateInvoiceHtml } from '@/lib/invoice-template';

const IS_DEV = process.env.NODE_ENV === 'development';

// Supprime les valeurs undefined pour Firebase
const removeUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = removeUndefined(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object' && !(item instanceof Date)
          ? removeUndefined(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  return result as T;
};

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string | number);
};

const statusStyles: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  PENDING_PAYMENT: 'bg-orange-100 text-orange-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  CREDITED: 'bg-orange-100 text-orange-700',
  CONVERTED: 'bg-indigo-100 text-indigo-700',
};

const statusLabels: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  PENDING_PAYMENT: 'En attente',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
  CREDITED: 'Créditée',
  CONVERTED: 'Converti en facture',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

const documentTypeLabel = (type: InvoiceDocumentType) => {
  switch (type) {
    case 'QUOTE':
      return 'Devis';
    case 'CREDIT_NOTE':
      return 'Avoir';
    default:
      return 'Facture';
  }
};

const documentTypeIcon = (type: InvoiceDocumentType) => {
  switch (type) {
    case 'QUOTE':
      return '📄';
    case 'CREDIT_NOTE':
      return '🔁';
    default:
      return '💰';
  }
};

interface LineItemForm {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  serviceId?: string;
}

function getEasterDate(year: number): Date {
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
}

function getFrenchHolidays(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const easter = getEasterDate(year);
  const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
  const ascension = new Date(easter); ascension.setDate(easter.getDate() + 39);
  const pentecost = new Date(easter); pentecost.setDate(easter.getDate() + 50);
  const fixed: Array<[number, number, string]> = [
    [0, 1, "Jour de l'an"], [4, 1, 'Fête du travail'], [4, 8, 'Victoire 1945'],
    [6, 14, 'Fête nationale'], [7, 15, 'Assomption'], [10, 1, 'Toussaint'],
    [10, 11, 'Armistice'], [11, 25, 'Noël'],
  ];
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  fixed.forEach(([m, d, name]) => map.set(key(new Date(year, m, d)), name));
  map.set(key(easterMonday), 'Lundi de Pâques');
  map.set(key(ascension), 'Ascension');
  map.set(key(pentecost), 'Lundi de Pentecôte');
  return map;
}

function buildPostInvoiceMessage(payload: InvoiceWritePayload, bookings: Booking[]): string {
  const clientName = payload.clientSnapshot?.displayName || 'Bonjour';
  const number = payload.number || '';
  const total = payload.totals?.total || 0;
  const now = new Date();
  const endRange = new Date(now); endRange.setMonth(endRange.getMonth() + 2);
  const busyDays = new Set<string>();
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  bookings.forEach((b) => {
    if (b.status !== 'confirmé' && b.status !== 'terminé') return;
    const s = new Date(b.start);
    if (s >= now && s <= endRange) busyDays.add(keyOf(s));
  });
  const years = new Set<number>([now.getFullYear(), endRange.getFullYear()]);
  const holidays = new Map<string, string>();
  years.forEach((y) => { getFrenchHolidays(y).forEach((v, k) => holidays.set(k, v)); });
  const available: string[] = [];
  const cur = new Date(now); cur.setHours(0, 0, 0, 0); cur.setDate(cur.getDate() + 1);
  while (cur <= endRange) {
    const dow = cur.getDay();
    const k = keyOf(cur);
    const isWeekend = dow === 0 || dow === 6;
    const holidayName = holidays.get(k);
    if ((isWeekend || holidayName) && !busyDays.has(k)) {
      const label = cur.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      available.push(holidayName ? `• ${label} (${holidayName})` : `• ${label}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  const dispoBlock = available.length ? `Si tu veux me re-booker, voici mes prochaines dispos :\n${available.slice(0, 12).join('\n')}\n` : '';
  return `Salut ${clientName},\n\nMerci pour cette soirée ! Voici la facture n°${number} de ${total.toLocaleString('fr-FR')}€.\n\n${dispoBlock}\nÀ très vite 🎧\nJohn`;
}

function InvoicesContent() {
  const searchParams = useSearchParams();
  const bookingIdFromUrl = searchParams.get('booking');

  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorInfo, setVendorInfo] = useState<DJInfo | null>(null);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [postIssueMessage, setPostIssueMessage] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [urlBookingProcessed, setUrlBookingProcessed] = useState(false);

  // Filtres
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<InvoiceDocumentType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Formulaire
  const [formData, setFormData] = useState({
    bookingId: '',
    bookingIds: [] as string[],
    clientId: '',
    type: 'QUOTE' as InvoiceDocumentType,
    includeDeposit: false,
    notes: '',
    paymentMethod: 'Virement bancaire',
  });

  // Mode net/brut : 'brut' = prix facturé, 'net' = ce que tu gardes après URSSAF
  const [priceMode, setPriceMode] = useState<'brut' | 'net'>('brut');
  const urssafRate = vendorInfo?.urssafRate ?? 25.6;
  const netToBrut = (net: number) => Math.ceil(net / (1 - urssafRate / 100));
  const brutToNet = (brut: number) => Math.round(brut * (1 - urssafRate / 100));

  // Horaires modifiables pour la facture
  const [eventStartTime, setEventStartTime] = useState<string>('');
  const [eventEndTime, setEventEndTime] = useState<string>('');

  // Parser intelligent d'horaires (accepte 19H30, 19h30, 19:30, 1930, etc.)
  const parseTimeInput = (input: string): string => {
    if (!input.trim()) return '';

    // Nettoyer l'input
    let cleaned = input.trim().replace(/\s/g, '');

    // Format: 19H30, 19h30 → 19:30
    if (/^\d{1,2}[HhHh]\d{2}$/i.test(cleaned)) {
      cleaned = cleaned.replace(/[HhHh]/i, ':');
    }

    // Format: 19H, 19h → 19:00
    if (/^\d{1,2}[HhHh]$/i.test(cleaned)) {
      cleaned = cleaned.replace(/[HhHh]/i, ':00');
    }

    // Format: 1930 → 19:30
    if (/^\d{3,4}$/.test(cleaned)) {
      if (cleaned.length === 3) {
        cleaned = '0' + cleaned; // 230 → 0230
      }
      cleaned = cleaned.slice(0, 2) + ':' + cleaned.slice(2);
    }

    // Format: 19 → 19:00
    if (/^\d{1,2}$/.test(cleaned)) {
      cleaned = cleaned + ':00';
    }

    // Valider et formater HH:MM
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }

    return input; // Retourner l'input original si non valide
  };

  // Recherche client
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Lignes de facture
  const [lineItems, setLineItems] = useState<LineItemForm[]>([]);

  // Modals
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  // Actions sur factures existantes
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsSnap, bookingsSnap, invoicesSnap, vendorSnap, servicesSnap, packagesSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'invoices')),
        getDoc(doc(db, 'settings', 'dj_info')),
        getDocs(collection(db, 'services')),
        getDocs(collection(db, 'packages')),
      ]);

      const vendorData = vendorSnap.exists() ? (vendorSnap.data() as DJInfo) : null;
      setVendorInfo(vendorData);

      setClients(
        clientsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Client[]
      );

      setBookings(
        bookingsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          start: toDate(docSnap.data().start)!,
          end: toDate(docSnap.data().end)!,
        })) as Booking[]
      );

      setServices(
        servicesSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as CatalogService[]
      );

      setPackages(
        packagesSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as ServicePackage[]
      );

      const invoicesData = invoicesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        const totals = data.totals ?? {
          currency: 'EUR',
          subtotal: data.amountNet ?? data.amount ?? 0,
          taxRate: data.taxRate,
          taxAmount: data.amountTax ?? 0,
          total: data.amountGross ?? data.amount ?? 0,
          depositApplied: data.depositApplied ?? 0,
          balanceDue: data.balanceDue ?? data.amountGross ?? data.amount ?? 0,
        };

        const status: InvoiceStatus = data.status
          ? (['DRAFT', 'ISSUED', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'CREDITED', 'CONVERTED'].includes(data.status)
              ? data.status
              : data.status === 'paid'
                ? 'PAID'
                : data.status === 'cancelled'
                  ? 'CANCELLED'
                  : 'ISSUED')
          : 'DRAFT';

        const documentType: InvoiceDocumentType = data.documentType
          ? data.documentType
          : data.type === 'devis'
            ? 'QUOTE'
            : data.type === 'facture'
              ? 'INVOICE'
              : 'INVOICE';

        const vendorSnapshot = data.vendorSnapshot ?? {
          displayName:
            vendorData?.commercialName || vendorData?.stageName || vendorData?.name || 'DJ Booker Pro',
          contactName: vendorData?.name,
          email: vendorData?.email,
          phone: vendorData?.phone,
          address: vendorData?.address,
          postalCode: vendorData?.postalCode,
          city: vendorData?.city,
          siret: vendorData?.siret,
          vatNumber: vendorData?.vatNumber,
          stageName: vendorData?.stageName,
          taxRate: vendorData?.taxRate,
          logoUrl: vendorData?.logoUrl,
          codeAPE: vendorData?.codeAPE,
        };

        const clientSnapshot = data.clientSnapshot ?? {
          displayName: data.clientName || 'Client',
          contactName: data.clientName,
          email: data.clientEmail,
          phone: data.clientPhone,
          address: data.clientAddress,
          postalCode: data.clientPostalCode,
          city: data.clientCity,
          siret: data.clientSiret,
        };

        const lineItems =
          Array.isArray(data.lineItems) && data.lineItems.length > 0
            ? data.lineItems
            : [
                {
                  id: 'legacy-service',
                  description: data.notes || 'Prestation DJ',
                  quantity: 1,
                  unitPrice: totals.total,
                  total: totals.total,
                  taxRate: data.taxRate,
                  taxAmount: data.amountTax,
                },
              ];

        return {
          id: docSnap.id,
          number: data.number,
          documentType,
          status,
          bookingId: data.bookingId,
          clientId: data.clientId,
          vendorSnapshot,
          clientSnapshot,
          lineItems,
          totals,
          currency: totals.currency || 'EUR',
          servicePeriod: data.servicePeriod
            ? {
                start: toDate(data.servicePeriod.start)!,
                end: toDate(data.servicePeriod.end)!,
              }
            : undefined,
          issueDate: toDate(data.issueDate),
          dueDate: toDate(data.dueDate),
          paymentTerms: data.paymentTerms
            ? {
                ...data.paymentTerms,
                dueDate: toDate(data.paymentTerms.dueDate),
              }
            : undefined,
          paymentMethod: data.paymentMethod,
          issuedBy: data.issuedBy,
          paidAt: toDate(data.paidAt),
          cancelledAt: toDate(data.cancelledAt),
          creditedInvoiceId: data.creditedInvoiceId,
          notes: data.notes,
          hash: data.hash,
          pdfStoragePath: data.pdfStoragePath || data.filename,
          createdAt: toDate(data.createdAt) || new Date(),
          updatedAt: toDate(data.updatedAt) || new Date(),
          source: data.source,
          legacyInvoiceNumber: data.invoiceNumber,
        } as Invoice;
      });

      // Trier par date de création décroissante
      invoicesData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Erreur chargement factures:', error);
    } finally {
      setLoading(false);
    }
  };

  // Statistiques
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = invoices.filter((inv) => {
      const date = inv.issueDate || inv.createdAt;
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const totalThisMonth = thisMonth
      .filter((inv) => inv.documentType === 'INVOICE' && inv.status !== 'CANCELLED')
      .reduce((sum, inv) => sum + (inv.totals?.total || 0), 0);

    const paidThisMonth = thisMonth
      .filter((inv) => inv.documentType === 'INVOICE' && inv.status === 'PAID')
      .reduce((sum, inv) => sum + (inv.totals?.total || 0), 0);

    const pendingAmount = invoices
      .filter((inv) => inv.documentType === 'INVOICE' && (inv.status === 'ISSUED' || inv.status === 'PENDING_PAYMENT'))
      .reduce((sum, inv) => sum + (inv.totals?.balanceDue || inv.totals?.total || 0), 0);

    const draftsCount = invoices.filter((inv) => inv.status === 'DRAFT').length;

    return { totalThisMonth, paidThisMonth, pendingAmount, draftsCount };
  }, [invoices]);

  // Client filtré pour l'autocomplete
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 10);
    const search = clientSearch.toLowerCase();
    return clients
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(search) ||
          c.professionalName?.toLowerCase().includes(search) ||
          c.email?.toLowerCase().includes(search) ||
          c.primaryEmail?.toLowerCase().includes(search)
      )
      .slice(0, 10);
  }, [clients, clientSearch]);

  // Factures filtrées
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && inv.documentType !== typeFilter) return false;
      if (searchQuery.trim()) {
        const search = searchQuery.toLowerCase();
        const matchClient = inv.clientSnapshot?.displayName?.toLowerCase().includes(search);
        const matchNumber = inv.number?.toLowerCase().includes(search);
        if (!matchClient && !matchNumber) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, typeFilter, searchQuery]);

  // Services récents (utilisés dans les dernières factures)
  const recentServices = useMemo(() => {
    const serviceIds = new Set<string>();
    const recent: CatalogService[] = [];

    for (const inv of invoices.slice(0, 20)) {
      for (const item of inv.lineItems || []) {
        if (item.serviceId && !serviceIds.has(item.serviceId)) {
          const service = services.find((s) => s.id === item.serviceId);
          if (service) {
            serviceIds.add(item.serviceId);
            recent.push(service);
          }
        }
      }
      if (recent.length >= 5) break;
    }

    return recent;
  }, [invoices, services]);

  // Sélection booking(s)
  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === formData.bookingId),
    [bookings, formData.bookingId]
  );
  const selectedBookings = useMemo(
    () => bookings.filter((booking) => formData.bookingIds.includes(booking.id)),
    [bookings, formData.bookingIds]
  );

  // Bookings disponibles pour le client sélectionné
  const clientBookings = useMemo(() => {
    if (!formData.clientId) return [];
    return bookings
      .filter((b) => {
        if (b.clientId !== formData.clientId) return false;
        if (b.status !== 'confirmé' && b.status !== 'terminé') return false;
        // Exclure les bookings déjà facturés (sauf ceux sélectionnés dans ce formulaire)
        const alreadyInvoiced = invoices.some(
          (inv) =>
            inv.status !== 'CANCELLED' &&
            (inv.bookingId === b.id || inv.bookingIds?.includes(b.id))
        );
        if (alreadyInvoiced && !formData.bookingIds.includes(b.id)) return false;
        return true;
      })
      .sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [bookings, formData.clientId, formData.bookingIds, invoices]);

  // Client sélectionné
  const selectedClient = useMemo(() => {
    if (formData.clientId) {
      return clients.find((c) => c.id === formData.clientId);
    }
    if (selectedBookings.length > 0 && selectedBookings[0].clientId) {
      return clients.find((c) => c.id === selectedBookings[0].clientId);
    }
    if (selectedBooking?.clientId) {
      return clients.find((c) => c.id === selectedBooking.clientId);
    }
    return undefined;
  }, [clients, formData.clientId, selectedBooking, selectedBookings]);

  // Calculs des totaux pour le formulaire
  const formTotals = useMemo(() => {
    const taxRate = vendorInfo?.taxRate ?? 0;
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total, taxRate };
  }, [lineItems, vendorInfo?.taxRate]);

  // Résout un prix de ligne même quand un booking importé Google arrive à 0€.
  const resolveBookingUnitPrice = useCallback(
    (booking: Booking): number => {
      if (booking.price > 0) return booking.price;

      const linkedClient = booking.clientId ? clients.find((client) => client.id === booking.clientId) : undefined;
      const averageAmount = linkedClient?.stats?.averageAmount ?? 0;
      if (averageAmount > 0) return Math.round(averageAmount);

      const fallbackBasePrice = vendorInfo?.basePrice ?? 0;
      if (fallbackBasePrice > 0) return fallbackBasePrice;

      return 0;
    },
    [clients, vendorInfo?.basePrice]
  );

  // Helper pour créer une ligne de facturation depuis un booking
  const bookingToLineItem = (booking: Booking) => {
    const dateStr = booking.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return {
      id: `booking-${booking.id}`,
      description: `${booking.title || 'Prestation DJ'}${booking.location ? ` - ${booking.location}` : ''}\nDate : ${dateStr}`,
      quantity: 1,
      unitPrice: resolveBookingUnitPrice(booking),
    };
  };

  // Toggle un booking dans la sélection multi-bookings
  const toggleBookingSelection = useCallback(
    (booking: Booking) => {
      setFormData((prev) => {
        const isSelected = prev.bookingIds.includes(booking.id);
        const newBookingIds = isSelected
          ? prev.bookingIds.filter((id) => id !== booking.id)
          : [...prev.bookingIds, booking.id];
        return {
          ...prev,
          bookingIds: newBookingIds,
          bookingId: newBookingIds.length === 1 ? newBookingIds[0] : '',
        };
      });

      // Mettre à jour les lignes de facturation
      setLineItems((prev) => {
        const isSelected = prev.some((item) => item.id === `booking-${booking.id}`);
        if (isSelected) {
          return prev.filter((item) => item.id !== `booking-${booking.id}`);
        }
        return [...prev, bookingToLineItem(booking)];
      });

      // Horaires : seulement si un seul booking
      setFormData((prev) => {
        if (prev.bookingIds.length === 1) {
          const singleBooking = bookings.find((b) => b.id === prev.bookingIds[0]);
          if (singleBooking) {
            setEventStartTime(singleBooking.start.toTimeString().slice(0, 5));
            setEventEndTime(singleBooking.end.toTimeString().slice(0, 5));
          }
        } else {
          setEventStartTime('');
          setEventEndTime('');
        }
        return prev;
      });
    },
    [bookings]
  );

  // Pré-remplir depuis un booking (quick-create ou URL)
  const prefillFromBooking = useCallback(
    (booking: Booking) => {
      setFormData((prev) => ({
        ...prev,
        bookingId: booking.id,
        bookingIds: [booking.id],
        clientId: booking.clientId || '',
      }));

      const client = clients.find((c) => c.id === booking.clientId);
      if (client) {
        setClientSearch(client.professionalName || client.name || '');
      }

      // Initialiser les horaires depuis le booking
      if (booking.start) {
        setEventStartTime(booking.start.toTimeString().slice(0, 5));
      }
      if (booking.end) {
        setEventEndTime(booking.end.toTimeString().slice(0, 5));
      }

      // Ajouter la prestation comme ligne
      setLineItems([bookingToLineItem(booking)]);
    },
    [clients]
  );

  // Pré-remplir automatiquement depuis l'URL si ?booking=ID est présent
  useEffect(() => {
    if (bookingIdFromUrl && !loading && bookings.length > 0 && !urlBookingProcessed) {
      const booking = bookings.find((b) => b.id === bookingIdFromUrl);
      if (booking) {
        prefillFromBooking(booking);
        setShowForm(true);
        setUrlBookingProcessed(true);
      }
    }
  }, [bookingIdFromUrl, loading, bookings, urlBookingProcessed, prefillFromBooking]);

  // Ajouter un service du catalogue
  const addServiceFromCatalog = (service: CatalogService) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `service-${service.id}-${Date.now()}`,
        description: service.name + (service.description ? `\n${service.description}` : ''),
        quantity: service.defaultQty || 1,
        unitPrice: service.unitPrice,
        serviceId: service.id,
      },
    ]);
    setShowCatalogModal(false);
  };

  // Appliquer un pack
  const applyPackage = (pkg: ServicePackage) => {
    const newItems: LineItemForm[] = pkg.lines.map((line) => {
      const service = services.find((s) => s.id === line.serviceId);
      return {
        id: `pkg-${pkg.id}-${line.serviceId}-${Date.now()}`,
        description: service?.name || line.serviceName || 'Service',
        quantity: line.qty,
        unitPrice: line.overridePrice ?? service?.unitPrice ?? 0,
        serviceId: line.serviceId,
      };
    });
    setLineItems((prev) => [...prev, ...newItems]);
    setShowPackageModal(false);
  };

  // Ajouter une ligne vide
  const addEmptyLine = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        description: '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  // Supprimer une ligne
  const removeLine = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Mettre à jour une ligne
  const updateLine = (id: string, field: keyof LineItemForm, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Sélectionner un client
  const selectClient = (client: Client) => {
    setFormData((prev) => ({ ...prev, clientId: client.id }));
    setClientSearch(client.professionalName || client.name || '');
    setShowClientDropdown(false);
  };

  // Construire le payload depuis le formulaire
  const buildPayloadFromForm = (status: InvoiceStatus, number?: string): InvoiceWritePayload => {
    const now = new Date();
    const taxRate = vendorInfo?.taxRate ?? 0;
    const isVatExempt = taxRate === 0;

    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
    const total = subtotal + taxAmount;

    const vendorSnapshot = {
      displayName: vendorInfo?.commercialName || vendorInfo?.stageName || vendorInfo?.name || 'DJ Booker Pro',
      contactName: vendorInfo?.name,
      email: vendorInfo?.email,
      phone: vendorInfo?.phone,
      address: vendorInfo?.address,
      postalCode: vendorInfo?.postalCode,
      city: vendorInfo?.city,
      siret: vendorInfo?.siret,
      vatNumber: isVatExempt ? undefined : vendorInfo?.vatNumber,
      iban: vendorInfo?.iban,
      stageName: vendorInfo?.stageName,
      taxRate,
      legalStatus: 'Auto-entrepreneur',
      logoUrl: vendorInfo?.logoUrl,
      codeAPE: vendorInfo?.codeAPE,
    };

    const clientSnapshot = selectedClient
      ? {
          displayName: selectedClient.professionalName || selectedClient.name,
          contactName: selectedClient.name,
          email: selectedClient.email || selectedClient.primaryEmail,
          phone: selectedClient.phone,
          address: selectedClient.address,
          postalCode: selectedClient.postalCode,
          city: selectedClient.city,
          siret: selectedClient.siret,
        }
      : {
          displayName: clientSearch || 'Client',
        };

    const invoiceLineItems: InvoiceLineItem[] = lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
      taxRate: taxRate || undefined,
      taxAmount: taxRate > 0 ? item.quantity * item.unitPrice * (taxRate / 100) : undefined,
      serviceId: item.serviceId,
    }));

    // Construire servicePeriod(s) avec horaires modifiables
    let servicePeriod: { start: Date; end: Date } | undefined = undefined;
    let servicePeriods: { start: Date; end: Date; label?: string }[] | undefined = undefined;

    if (selectedBookings.length > 1) {
      // Multi-bookings : construire servicePeriods[]
      servicePeriods = selectedBookings
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
          label: `${b.title || 'Prestation DJ'}${b.location ? ` - ${b.location}` : ''}`,
        }));
      // servicePeriod = première date (rétro-compat)
      servicePeriod = { start: new Date(selectedBookings[0].start), end: new Date(selectedBookings[0].end) };
    } else if (selectedBookings.length === 1 || selectedBooking) {
      const booking = selectedBookings[0] || selectedBooking;
      const startDate = new Date(booking.start);
      const endDate = new Date(booking.end);

      // Si les deux champs d'horaires sont vides, mettre 00:00 pour masquer les horaires sur la facture
      if (!eventStartTime && !eventEndTime) {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
      } else {
        if (eventStartTime && /^\d{2}:\d{2}$/.test(eventStartTime)) {
          const [hours, minutes] = eventStartTime.split(':').map(Number);
          if (!isNaN(hours) && !isNaN(minutes)) {
            startDate.setHours(hours, minutes, 0, 0);
          }
        }
        if (eventEndTime && /^\d{2}:\d{2}$/.test(eventEndTime)) {
          const [hours, minutes] = eventEndTime.split(':').map(Number);
          if (!isNaN(hours) && !isNaN(minutes)) {
            endDate.setHours(hours, minutes, 0, 0);
          }
        }
        if (eventStartTime && eventEndTime && endDate <= startDate) {
          endDate.setDate(endDate.getDate() + 1);
        }
      }

      servicePeriod = { start: startDate, end: endDate };
    }

    const issueDate = status === 'ISSUED' || status === 'PENDING_PAYMENT' || status === 'PAID' ? now : undefined;
    const dueDate =
      formData.type === 'INVOICE'
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        : undefined;

    const legalNotes = isVatExempt
      ? `${LEGAL_TEXTS.vatExempt}\n\n${formData.notes || ''}`
      : formData.notes;

    return {
      number,
      documentType: formData.type,
      status,
      bookingId: formData.bookingIds.length === 1 ? formData.bookingIds[0] : (formData.bookingId || undefined),
      bookingIds: formData.bookingIds.length > 0 ? formData.bookingIds : undefined,
      clientId: formData.clientId || undefined,
      vendorSnapshot,
      clientSnapshot,
      lineItems: invoiceLineItems,
      totals: {
        currency: 'EUR',
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: taxRate || undefined,
        taxAmount: Math.round(taxAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        depositApplied: 0,
        balanceDue: Math.round(total * 100) / 100,
      },
      currency: 'EUR',
      servicePeriod,
      servicePeriods,
      issueDate,
      dueDate,
      paymentTerms:
        formData.type === 'INVOICE'
          ? {
              dueDate,
              paymentMethod: formData.paymentMethod,
              penaltyRate: 11.62,
              penaltyDescription: LEGAL_TEXTS.latePenalty,
            }
          : undefined,
      paymentMethod: formData.paymentMethod,
      notes: legalNotes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      source: formData.bookingIds.length > 0 ? 'booking' : 'manual',
    };
  };

  // Rafraîchir les infos vendeur depuis Firestore (pour toujours avoir l'adresse à jour)
  const refreshVendorInfo = async () => {
    const vendorSnap = await getDoc(doc(db, 'settings', 'dj_info'));
    if (vendorSnap.exists()) {
      const freshVendor = vendorSnap.data() as DJInfo;
      setVendorInfo(freshVendor);
      return freshVendor;
    }
    return vendorInfo;
  };

  // Sauvegarder en brouillon
  const handleSaveDraft = async () => {
    if (lineItems.length === 0) {
      alert('Ajoutez au moins une ligne à la facture');
      return;
    }
    setSavingDraft(true);
    try {
      await refreshVendorInfo();
      const payload = removeUndefined(buildPayloadFromForm('DRAFT'));
      await addDoc(collection(db, 'invoices'), payload);
      await loadData();
      resetForm();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du brouillon:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSavingDraft(false);
    }
  };

  // Aperçu de la facture sans la sauvegarder
  const handlePreview = async () => {
    if (lineItems.length === 0) {
      alert('Ajoutez au moins une ligne pour voir l\'aperçu');
      return;
    }
    let payload = buildPayloadFromForm('ISSUED', 'APERÇU');
    if (payload.vendorSnapshot.logoUrl) {
      const b64 = await imageUrlToBase64(payload.vendorSnapshot.logoUrl);
      if (b64) payload = { ...payload, vendorSnapshot: { ...payload.vendorSnapshot, logoUrl: b64 } };
    }
    const html = generateInvoiceHtml(payload, { invoiceId: 'APERÇU' });
    setPreviewHtml(html);
    setShowPreview(true);
  };

  // Convertir une URL image en base64 data URI
  const imageUrlToBase64 = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const generatePDF = async (invoiceId: string, payload: InvoiceWritePayload, _autoTriggerPrint: boolean = true) => {
    // Convertir le logo en base64 pour éviter les problèmes CORS dans html2pdf
    if (payload.vendorSnapshot.logoUrl) {
      const b64 = await imageUrlToBase64(payload.vendorSnapshot.logoUrl);
      if (b64) payload = { ...payload, vendorSnapshot: { ...payload.vendorSnapshot, logoUrl: b64 } };
    }
    const html = generateInvoiceHtml(payload, { invoiceId });
    const prefix = payload.documentType === 'QUOTE' ? 'Devis' : payload.documentType === 'CREDIT_NOTE' ? 'Avoir' : 'Facture';
    const clientName = payload.clientSnapshot?.displayName?.replace(/[/\\?%*:|"<>]/g, '') || '';
    const filename = `${prefix} ${payload.number || invoiceId}${clientName ? ` - ${clientName}` : ''}.pdf`;
    const isLite = process.env.NEXT_PUBLIC_LITE_MODE === 'true';
    const exportDir = isLite ? undefined : vendorInfo?.pdfExportDir;

    if (isLite) {
      try {
        const html2pdfMod = await import('html2pdf.js');
        const html2pdf = (html2pdfMod as { default?: unknown }).default || html2pdfMod;
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        await (html2pdf as (...args: unknown[]) => { set: (o: unknown) => { from: (e: unknown) => { save: () => Promise<void> } } })()
          .set({ filename, margin: 0, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } })
          .from(container)
          .save();
        document.body.removeChild(container);
        await updateDoc(doc(db, 'invoices', invoiceId), { pdfStoragePath: filename, updatedAt: new Date() });
        return;
      } catch (err) {
        console.error('Erreur PDF client:', err);
        alert('Erreur lors de la génération du PDF dans le navigateur.');
        return;
      }
    }

    try {
      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename, exportDir }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Erreur export');
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/pdf')) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } else {
        const data = await res.json();
        if (data?.filePath) {
          alert(`PDF sauvegardé : ${data.filePath}`);
        }
      }
    } catch (error) {
      console.error('Erreur export PDF serveur:', error);
      alert('Erreur lors de la génération du PDF. Vérifie que le serveur tourne bien.');
    }

    await updateDoc(doc(db, 'invoices', invoiceId), {
      pdfStoragePath: filename,
      updatedAt: new Date(),
    });
  };

  // Émettre le document
  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lineItems.length === 0) {
      alert('Ajoutez au moins une ligne à la facture');
      return;
    }
    setIssuing(true);
    try {
      await refreshVendorInfo();
      const number = await generateInvoiceNumber(formData.type);
      // Les factures sont directement en attente de paiement, les devis restent émis
      const status = formData.type === 'INVOICE' ? 'PENDING_PAYMENT' : 'ISSUED';
      const rawPayload = buildPayloadFromForm(status, number);
      rawPayload.hash = generateInvoiceHash(rawPayload);
      const payload = removeUndefined(rawPayload);

      const docRef = await addDoc(collection(db, 'invoices'), payload);
      await generatePDF(docRef.id, payload);
      if (formData.type === 'INVOICE') {
        setPostIssueMessage(buildPostInvoiceMessage(payload, bookings));
      }
      await loadData();
      resetForm();
    } catch (error) {
      console.error("Erreur lors de l'émission:", error);
      alert("Erreur lors de l'émission du document");
    } finally {
      setIssuing(false);
    }
  };

  // Reset formulaire
  const resetForm = () => {
    setShowForm(false);
    setFormData({
      bookingId: '',
      bookingIds: [],
      clientId: '',
      type: 'QUOTE',
      includeDeposit: false,
      notes: '',
      paymentMethod: 'Virement bancaire',
    });
    setClientSearch('');
    setLineItems([]);
    setEventStartTime('');
    setEventEndTime('');
  };

  // Actions sur factures existantes
  const handleMarkAsPaid = async (invoice: Invoice) => {
    if (!canMarkAsPaid(invoice)) return;
    setActionLoading(invoice.id);
    try {
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'PAID',
        paidAt: new Date(),
        updatedAt: new Date(),
      });
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkAsPending = async (invoice: Invoice) => {
    // Peut marquer en attente si ISSUED ou PENDING_PAYMENT déjà
    if (invoice.status !== 'ISSUED' && invoice.status !== 'PENDING_PAYMENT') return;
    setActionLoading(invoice.id);
    try {
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'PENDING_PAYMENT',
        updatedAt: new Date(),
      });
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (invoice: Invoice) => {
    if (!canCancelInvoice(invoice)) return;
    if (!confirm('Êtes-vous sûr de vouloir annuler ce document ?')) return;
    setActionLoading(invoice.id);
    try {
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      });
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert("Erreur lors de l'annulation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCreditNote = async (invoice: Invoice) => {
    if (!canCreateCreditNote(invoice)) return;
    setActionLoading(invoice.id);
    try {
      const number = await generateInvoiceNumber('CREDIT_NOTE');
      const now = new Date();

      const creditNotePayload: InvoiceWritePayload = {
        number,
        documentType: 'CREDIT_NOTE',
        status: 'ISSUED',
        bookingId: invoice.bookingId,
        clientId: invoice.clientId,
        vendorSnapshot: invoice.vendorSnapshot,
        clientSnapshot: invoice.clientSnapshot,
        lineItems: invoice.lineItems.map((item) => ({
          ...item,
          unitPrice: -Math.abs(item.unitPrice),
          total: -Math.abs(item.total),
          taxAmount: item.taxAmount ? -Math.abs(item.taxAmount) : undefined,
        })),
        totals: {
          ...invoice.totals,
          subtotal: -Math.abs(invoice.totals.subtotal),
          taxAmount: -Math.abs(invoice.totals.taxAmount),
          total: -Math.abs(invoice.totals.total),
          balanceDue: -Math.abs(invoice.totals.total),
        },
        currency: invoice.currency,
        servicePeriod: invoice.servicePeriod,
        issueDate: now,
        notes: `Avoir pour la facture ${invoice.number}`,
        creditedInvoiceId: invoice.id,
        createdAt: now,
        updatedAt: now,
        source: 'manual',
      };

      creditNotePayload.hash = generateInvoiceHash(creditNotePayload);
      const cleanedPayload = removeUndefined(creditNotePayload);

      const creditNoteRef = await addDoc(collection(db, 'invoices'), cleanedPayload);
      await generatePDF(creditNoteRef.id, cleanedPayload);

      // Marquer la facture originale comme créditée
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'CREDITED',
        creditedInvoiceId: creditNoteRef.id,
        updatedAt: now,
      });

      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert("Erreur lors de la création de l'avoir");
    } finally {
      setActionLoading(null);
    }
  };

  // Convertir un devis en facture
  const handleConvertToInvoice = async (invoice: Invoice) => {
    if (!canConvertQuoteToInvoice(invoice)) return;
    if (!confirm(`Convertir le devis ${invoice.number || ''} en facture ? Le devis sera marqué comme converti.`)) return;
    setActionLoading(invoice.id);
    try {
      const number = await generateInvoiceNumber('INVOICE');
      const now = new Date();
      const dueDate = new Date(now.getTime() + DEFAULT_PAYMENT_TERMS.dueInDays * 24 * 60 * 60 * 1000);

      const invoicePayload: InvoiceWritePayload = {
        number,
        documentType: 'INVOICE',
        status: 'PENDING_PAYMENT',
        bookingId: invoice.bookingId,
        bookingIds: invoice.bookingIds,
        clientId: invoice.clientId,
        vendorSnapshot: invoice.vendorSnapshot,
        clientSnapshot: invoice.clientSnapshot,
        lineItems: invoice.lineItems,
        totals: invoice.totals,
        currency: invoice.currency,
        servicePeriod: invoice.servicePeriod,
        servicePeriods: invoice.servicePeriods,
        issueDate: now,
        dueDate,
        paymentTerms: {
          dueDate,
          paymentMethod: invoice.paymentMethod || 'Virement bancaire',
          penaltyRate: DEFAULT_PAYMENT_TERMS.penaltyRate,
          penaltyDescription: LEGAL_TEXTS.latePenalty,
        },
        paymentMethod: invoice.paymentMethod || 'Virement bancaire',
        notes: invoice.notes
          ? `${invoice.notes}\n\nFacture issue du devis ${invoice.number || ''}`
          : `Facture issue du devis ${invoice.number || ''}`,
        convertedFromQuoteId: invoice.id,
        createdAt: now,
        updatedAt: now,
        source: invoice.source,
      };

      invoicePayload.hash = generateInvoiceHash(invoicePayload);
      const cleanedPayload = removeUndefined(invoicePayload);

      const invoiceRef = await addDoc(collection(db, 'invoices'), cleanedPayload);
      await generatePDF(invoiceRef.id, cleanedPayload);

      // Marquer le devis original comme converti
      await updateDoc(doc(db, 'invoices', invoice.id), {
        status: 'CONVERTED',
        convertedToInvoiceId: invoiceRef.id,
        updatedAt: now,
      });

      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la conversion du devis en facture');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (invoice: Invoice) => {
    if (!IS_DEV) return;
    if (!confirm('Supprimer ce document ? (Mode développement uniquement)')) return;
    setActionLoading(invoice.id);
    try {
      await deleteDoc(doc(db, 'invoices', invoice.id));
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    setActionLoading(invoice.id);
    try {
      const payload: InvoiceWritePayload = {
        number: invoice.number,
        documentType: invoice.documentType,
        status: invoice.status,
        bookingId: invoice.bookingId,
        clientId: invoice.clientId,
        vendorSnapshot: invoice.vendorSnapshot,
        clientSnapshot: invoice.clientSnapshot,
        lineItems: invoice.lineItems,
        totals: invoice.totals,
        currency: invoice.currency,
        servicePeriod: invoice.servicePeriod,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        paymentTerms: invoice.paymentTerms,
        paymentMethod: invoice.paymentMethod,
        notes: invoice.notes,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        source: invoice.source,
      };
      await generatePDF(invoice.id, payload);
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setActionLoading(null);
    }
  };

  // Numérotation des brouillons pour l'affichage
  const getDraftNumber = (invoice: Invoice): number => {
    const drafts = invoices.filter((i) => i.status === 'DRAFT').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return drafts.findIndex((d) => d.id === invoice.id) + 1;
  };

  // Envoyer par email via Gmail Compose
  const handleSendByEmail = (invoice: Invoice) => {
    const client = clients.find((c) => c.id === invoice.clientId);
    if (!client) {
      alert('Client introuvable');
      return;
    }

    const email = client.primaryEmail || client.email;
    if (!email) {
      alert('Aucun email configuré pour ce client');
      return;
    }

    const docType = documentTypeLabel(invoice.documentType);

    // Préparer le sujet
    const subject = `${docType} n°${invoice.number || invoice.id.slice(-6)}`;

    // Chercher les prochaines prestations avec ce client
    const now = new Date();
    const futureBookings = bookings
      .filter(b => b.clientId === invoice.clientId && b.start > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const nextBooking = futureBookings[0];

    // Construire le message avec mention de la prochaine date si elle existe
    let bodyLines = [
      `Bonjour ${invoice.clientSnapshot.displayName},`,
      '',
      `Veuillez trouver ci-joint ${docType.toLowerCase()} n°${invoice.number || invoice.id.slice(-6)} d'un montant de ${formatCurrency(invoice.totals.total)}.`,
    ];

    if (nextBooking) {
      const dateStr = nextBooking.start.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      bodyLines.push('');
      bodyLines.push(`On se voit pour la prochaine le ${dateStr} ! 🎵`);
    }

    bodyLines.push('');
    bodyLines.push('Merci pour votre confiance !');

    const body = bodyLines.join('\n');

    // Construire l'URL Gmail Compose avec les paramètres pré-remplis
    // Utilise le compte Gmail numéro 1 (djjohnsanti@gmail.com)
    const gmailComposeUrl = `https://mail.google.com/mail/u/1/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Ouvrir Gmail Compose
    window.open(gmailComposeUrl, '_blank');
  };

  // Envoyer par WhatsApp
  const handleSendByWhatsApp = (invoice: Invoice) => {
    const client = clients.find((c) => c.id === invoice.clientId);
    if (!client?.phone) {
      alert('Aucun numéro de téléphone pour ce client');
      return;
    }

    // Formater le numéro pour WhatsApp (format international)
    let phone = client.phone.replace(/[\s\-\(\)\.]/g, ''); // Enlever espaces, tirets, parenthèses, points

    // Si le numéro commence par +, l'enlever
    if (phone.startsWith('+')) {
      phone = phone.substring(1);
    }

    // Si le numéro commence par 0 (format français), remplacer par 33
    if (phone.startsWith('0')) {
      phone = '33' + phone.substring(1);
    }

    // Si le numéro ne commence pas par un indicatif (pas assez long), ajouter 33 par défaut
    if (phone.length === 9 || (phone.length === 10 && !phone.startsWith('33'))) {
      // Probablement un numéro français sans le 0
      if (!phone.startsWith('33')) {
        phone = '33' + phone;
      }
    }

    // Préparer le message
    const docType = documentTypeLabel(invoice.documentType);

    // Chercher les prochaines prestations avec ce client
    const now = new Date();
    const futureBookings = bookings
      .filter(b => b.clientId === invoice.clientId && b.start > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const nextBooking = futureBookings[0];

    // Construire le message avec mention de la prochaine date si elle existe
    let messageText = `Bonjour ${invoice.clientSnapshot.displayName},\n\n` +
      `Veuillez trouver ci-joint ${docType.toLowerCase()} n°${invoice.number || invoice.id.slice(-6)} d'un montant de ${formatCurrency(invoice.totals.total)}.\n\n`;

    if (nextBooking) {
      const dateStr = nextBooking.start.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      messageText += `On se voit pour la prochaine le ${dateStr} ! 🎵\n\n`;
    }

    messageText += `Merci pour votre confiance !`;

    const message = encodeURIComponent(messageText);

    // Ouvrir WhatsApp Web
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  // Services filtrés pour le catalogue
  const filteredServices = useMemo(() => {
    if (!catalogSearch.trim()) return services;
    const search = catalogSearch.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.description?.toLowerCase().includes(search) ||
        s.tags?.some((t) => t.toLowerCase().includes(search))
    );
  }, [services, catalogSearch]);

  // Marquer une prestation comme facturée en externe (ancien logiciel)
  const handleMarkInvoicedExternally = async (bookingId: string) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        invoicedExternally: true,
        updatedAt: new Date(),
      });
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, invoicedExternally: true } : b))
      );
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la mise à jour');
    }
  };

  // Marquer toutes les prestations en attente comme facturées en externe
  const handleMarkAllInvoicedExternally = async () => {
    if (!confirm(`Marquer ${bookingsToInvoice.length} prestation(s) comme déjà facturées ? Elles disparaîtront de cette liste.`)) return;
    try {
      await Promise.all(
        bookingsToInvoice.map((b) =>
          updateDoc(doc(db, 'bookings', b.id), {
            invoicedExternally: true,
            updatedAt: new Date(),
          })
        )
      );
      setBookings((prev) =>
        prev.map((b) =>
          bookingsToInvoice.some((btf) => btf.id === b.id)
            ? { ...b, invoicedExternally: true }
            : b
        )
      );
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la mise à jour');
    }
  };

  // Marquer une prestation comme annulée (pas de facture à émettre)
  const handleMarkCancelledNoInvoice = async (bookingId: string) => {
    if (!confirm("Marquer cette prestation comme annulée ? Elle disparaîtra des prestations à facturer.")) return;
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'annulé',
        updatedAt: new Date(),
      });
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'annulé', updatedAt: new Date() } : b))
      );
    } catch (error) {
      console.error('Erreur:', error);
      alert("Erreur lors de la mise à jour de l'annulation");
    }
  };

  // Bookings terminés sans facture
  const bookingsToInvoice = useMemo(() => {
    const now = new Date();
    return bookings.filter((booking) => {
      // Doit être terminé ou confirmé et dans le passé
      if (booking.status !== 'confirmé' && booking.status !== 'terminé') return false;
      if (new Date(booking.end) >= now) return false;

      // Exclure les bookings facturés en externe (ancien logiciel)
      if (booking.invoicedExternally) return false;

      // Pas déjà facturé (vérifier bookingId et bookingIds)
      const hasInvoice = invoices.some(
        (inv) =>
          inv.status !== 'CANCELLED' &&
          (inv.bookingId === booking.id || inv.bookingIds?.includes(booking.id))
      );
      return !hasInvoice;
    }).sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());
  }, [bookings, invoices]);

  return (
    <div className="min-h-screen bg-apple-bg">
      <TopNav />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Facturier</h1>
          <div className="flex gap-3">
            <Link
              href="/catalog"
              className="flex items-center gap-2 btn-secondary text-gray-700"
            >
              <Package size={18} />
              Catalogue
            </Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 btn-primary"
            >
              <Plus size={18} />
              {showForm ? 'Fermer' : 'Nouveau document'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="ui-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Euro className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ce mois</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(stats.totalThisMonth)}</p>
              </div>
            </div>
          </div>
          <div className="ui-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Encaissé</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(stats.paidThisMonth)}</p>
              </div>
            </div>
          </div>
          <div className="ui-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">En attente</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(stats.pendingAmount)}</p>
              </div>
            </div>
          </div>
          <div className="ui-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileCheck className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Brouillons</p>
                <p className="text-lg font-semibold text-gray-900">{stats.draftsCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulaire de création */}
        {showForm && (
          <div className="ui-card p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Nouveau document</h2>

            {vendorInfo === null && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
                <AlertCircle size={18} />
                Renseignez vos informations légales dans Paramètres &gt; Informations DJ avant d'émettre une facture.
              </div>
            )}

            <form onSubmit={handleGenerate}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Type de document */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type de document</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as InvoiceDocumentType })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="QUOTE">Devis</option>
                    <option value="INVOICE">Facture</option>
                  </select>
                </div>

                {/* Recherche client */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setShowClientDropdown(true);
                        setFormData({ ...formData, clientId: '' });
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="Rechercher un client..."
                      className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>
                  {showClientDropdown && filteredClients.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-apple-border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {filteredClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => selectClient(client)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-900"
                        >
                          <p className="font-medium">{client.professionalName || client.name}</p>
                          <p className="text-sm text-gray-500">{client.email || client.primaryEmail}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lier des prestations */}
                {formData.clientId && clientBookings.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prestations à facturer {formData.bookingIds.length > 0 && <span className="text-blue-600">({formData.bookingIds.length} sélectionnée{formData.bookingIds.length > 1 ? 's' : ''})</span>}
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {clientBookings.map((booking) => {
                        const isChecked = formData.bookingIds.includes(booking.id);
                        return (
                          <label
                            key={booking.id}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isChecked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleBookingSelection(booking)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {booking.title}{booking.location ? ` - ${booking.location}` : ''}
                              </p>
                              <p className="text-xs text-gray-500">
                                {booking.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-gray-700">{formatCurrency(booking.price || 0)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Horaires de l'événement (modifiables) - seulement si 1 booking */}
                {selectedBookings.length === 1 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Horaires de l'événement (optionnel)</h4>
                    <p className="text-xs text-gray-600 mb-3">
                      Modifier les horaires si nécessaire. Laisse vide pour ne pas afficher d'horaires sur la facture.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Heure de début
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 19H30, 19h30, 19:30"
                          value={eventStartTime}
                          onChange={(e) => setEventStartTime(e.target.value)}
                          onBlur={(e) => setEventStartTime(parseTimeInput(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Heure de fin
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 00H, 2H30, 2:30"
                          value={eventEndTime}
                          onChange={(e) => setEventEndTime(e.target.value)}
                          onBlur={(e) => setEventEndTime(parseTimeInput(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Tu peux taper: <strong>19H30</strong>, <strong>19h30</strong>, <strong>19:30</strong> ou même <strong>1930</strong>
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEventStartTime('');
                          setEventEndTime('');
                        }}
                        className="text-xs text-gray-600 hover:text-gray-800 underline"
                      >
                        Effacer les horaires
                      </button>
                    </div>
                  </div>
                )}

                {/* Moyen de paiement */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Moyen de paiement</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="Virement bancaire">Virement bancaire</option>
                    <option value="Chèque">Chèque</option>
                    <option value="Espèces">Espèces</option>
                    <option value="Carte bancaire">Carte bancaire</option>
                    <option value="PayPal">PayPal</option>
                  </select>
                </div>
              </div>

              {/* Lignes de facture */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Lignes</h3>
                  <div className="flex gap-2">
                    {recentServices.length > 0 && (
                      <div className="relative group">
                        <button
                          type="button"
                          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                        >
                          <Clock size={16} />
                          Récents
                        </button>
                        <div className="absolute right-0 mt-1 w-64 bg-white border border-apple-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                          {recentServices.map((service) => (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() => addServiceFromCatalog(service)}
                              className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-900"
                            >
                              <p className="font-medium">{service.name}</p>
                              <p className="text-sm text-gray-500">{formatCurrency(service.unitPrice)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPackageModal(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                    >
                      <Package size={16} />
                      Appliquer un pack
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCatalogModal(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                    >
                      <Plus size={16} />
                      Depuis catalogue
                    </button>
                    <button
                      type="button"
                      onClick={addEmptyLine}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-700"
                    >
                      <Plus size={16} />
                      Ligne libre
                    </button>
                  </div>
                </div>

                {/* Toggle Net / Brut */}
                <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 border border-apple-border rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Saisie en :</span>
                  <div className="flex bg-apple-card rounded-lg border border-apple-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPriceMode('brut')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${priceMode === 'brut' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      Brut (facturé)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceMode('net')}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${priceMode === 'net' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      Net (dans ma poche)
                    </button>
                  </div>
                  <span className="text-xs text-apple-text-muted">URSSAF : {urssafRate}%</span>
                </div>

                {lineItems.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-apple-border">
                    <p className="text-gray-500">Aucune ligne ajoutée</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Ajoutez des lignes depuis le catalogue, un pack ou manuellement
                    </p>
                  </div>
                ) : (
                  <div className="border border-apple-border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Description</th>
                          <th className="text-center px-4 py-3 text-sm font-medium text-gray-700 w-24">Qté</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-700 w-32">
                            {priceMode === 'net' ? 'Net unit.' : 'Prix unit.'}
                          </th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-700 w-32">Total</th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item) => {
                          const lineTotal = item.quantity * item.unitPrice;
                          const lineNet = brutToNet(lineTotal);
                          const displayUnitPrice = priceMode === 'net' ? brutToNet(item.unitPrice) : item.unitPrice;
                          return (
                            <tr key={item.id} className="border-t border-apple-border">
                              <td className="px-4 py-3">
                                <textarea
                                  value={item.description}
                                  onChange={(e) => updateLine(item.id, 'description', e.target.value)}
                                  rows={2}
                                  className="w-full border border-apple-border rounded px-2 py-1 text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                                  placeholder="Description de la prestation..."
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateLine(item.id, 'quantity', parseInt(e.target.value) || 1)}
                                  className="w-full border border-apple-border rounded px-2 py-1 text-center text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={displayUnitPrice}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (priceMode === 'net') {
                                      updateLine(item.id, 'unitPrice', netToBrut(val));
                                    } else {
                                      updateLine(item.id, 'unitPrice', val);
                                    }
                                  }}
                                  className={`w-full border rounded px-2 py-1 text-right text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${priceMode === 'net' ? 'border-green-300 bg-green-50 text-green-900' : 'border-apple-border text-gray-900'}`}
                                />
                                {priceMode === 'net' && (
                                  <p className="text-xs text-gray-400 text-right mt-0.5">facturé : {formatCurrency(item.unitPrice)}</p>
                                )}
                                {priceMode === 'brut' && item.unitPrice > 0 && (
                                  <p className="text-xs text-green-600 text-right mt-0.5">net : {formatCurrency(brutToNet(item.unitPrice))}</p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-medium text-gray-900">{formatCurrency(lineTotal)}</span>
                                {lineTotal > 0 && (
                                  <p className="text-xs text-green-600 mt-0.5">net : {formatCurrency(lineNet)}</p>
                                )}
                              </td>
                              <td className="px-2 py-3">
                                <button
                                  type="button"
                                  onClick={() => removeLine(item.id)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr className="border-t border-apple-border">
                          <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-600">
                            Sous-total HT
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900">
                            {formatCurrency(formTotals.subtotal)}
                          </td>
                          <td></td>
                        </tr>
                        {formTotals.taxRate > 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-600">
                              TVA ({formTotals.taxRate}%)
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900">
                              {formatCurrency(formTotals.taxAmount)}
                            </td>
                            <td></td>
                          </tr>
                        )}
                        <tr className="border-t border-gray-300">
                          <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-900">
                            Total TTC (facturé)
                          </td>
                          <td className="px-4 py-3 text-right text-lg font-bold text-gray-900">
                            {formatCurrency(formTotals.total)}
                          </td>
                          <td></td>
                        </tr>
                        <tr className="border-t border-green-200 bg-green-50">
                          <td colSpan={3} className="px-4 py-2 text-right text-sm text-green-700">
                            URSSAF ({urssafRate}%)
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-red-600">
                            -{formatCurrency(Math.round(formTotals.total * urssafRate / 100))}
                          </td>
                          <td></td>
                        </tr>
                        <tr className="bg-green-50">
                          <td colSpan={3} className="px-4 py-3 text-right font-semibold text-green-700">
                            Net dans ma poche
                          </td>
                          <td className="px-4 py-3 text-right text-lg font-bold text-green-700">
                            {formatCurrency(brutToNet(formTotals.total))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  placeholder="Notes ou conditions particulières..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              {/* Boutons */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || lineItems.length === 0}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={18} />
                  {savingDraft ? 'Enregistrement...' : 'Sauvegarder brouillon'}
                </button>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={lineItems.length === 0}
                  className="flex items-center gap-2 px-4 py-2 border border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye size={18} />
                  Aperçu
                </button>
                <button
                  type="submit"
                  disabled={issuing || lineItems.length === 0 || !vendorInfo}
                  className="flex items-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText size={18} />
                  {issuing ? 'Génération...' : `Émettre le ${formData.type === 'QUOTE' ? 'devis' : 'facture'}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filtres */}
        <div className="ui-card p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Filtres :</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'ALL')}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-brand-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="DRAFT">Brouillons</option>
                <option value="ISSUED">Émises</option>
                <option value="PAID">Payées</option>
                <option value="CANCELLED">Annulées</option>
                <option value="CREDITED">Créditées</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as InvoiceDocumentType | 'ALL')}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-brand-500"
              >
                <option value="ALL">Tous les types</option>
                <option value="QUOTE">Devis</option>
                <option value="INVOICE">Factures</option>
                <option value="CREDIT_NOTE">Avoirs</option>
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par client ou numéro..."
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bookings à facturer */}
        {bookingsToInvoice.length > 0 && (
          <div className="bg-apple-card rounded-2xl border border-apple-border shadow-apple-sm mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Prestations à facturer ({bookingsToInvoice.length})
                  </h2>
                </div>
                <button
                  onClick={handleMarkAllInvoicedExternally}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Tout marquer comme déjà facturé
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Ces prestations sont terminées ou confirmées et n&apos;ont pas encore été facturées.
              </p>

              <div className="space-y-3">
                {bookingsToInvoice.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center gap-4 p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="font-semibold text-gray-900">{booking.title}</p>
                          <span className="text-gray-400">·</span>
                          <p className="text-gray-700">{booking.displayName || booking.clientName}</p>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                          <span>
                            {new Date(booking.start).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                          {booking.price > 0 && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(booking.price)}
                              </span>
                            </>
                          )}
                          {booking.deposit > 0 && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span className="text-green-600">
                                Acompte: {formatCurrency(booking.deposit)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleMarkInvoicedExternally(booking.id)}
                          className="btn-secondary-sm whitespace-nowrap"
                          title="Déjà facturé avec un autre logiciel"
                        >
                          Déjà facturé
                        </button>
                        <button
                          onClick={() => handleMarkCancelledNoInvoice(booking.id)}
                          className="btn-danger-soft-sm whitespace-nowrap"
                          title="Marquer la soirée comme annulée (pas de facture)"
                        >
                          Soirée annulée
                        </button>
                        <button
                          onClick={() => {
                            prefillFromBooking(booking);
                            setFormData((prev) => ({ ...prev, type: 'INVOICE' }));
                            setShowForm(true);
                            setTimeout(() => {
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }, 100);
                          }}
                          className="btn-primary flex items-center gap-2 whitespace-nowrap"
                        >
                          <FileText size={16} />
                          Créer facture
                        </button>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Liste des factures */}
        <div className="bg-apple-card rounded-2xl border border-apple-border shadow-apple-sm">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Documents ({filteredInvoices.length})
            </h2>

            <div className="space-y-4">
              {filteredInvoices.map((invoice) => {
                const draftNumber = invoice.status === 'DRAFT' ? getDraftNumber(invoice) : 0;
                const isLoading = actionLoading === invoice.id;

                return (
                  <div
                    key={invoice.id}
                    className="border border-apple-border rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-lg">
                            {documentTypeIcon(invoice.documentType)}
                          </span>
                          <p className="font-semibold text-gray-900">
                            {invoice.number || (invoice.status === 'DRAFT' ? `Brouillon n°${draftNumber}` : `Doc. ${invoice.id.slice(-6)}`)}
                          </p>
                          <span className="text-gray-400">·</span>
                          <p className="text-gray-700">{invoice.clientSnapshot?.displayName}</p>
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[invoice.status]}`}
                          >
                            {statusLabels[invoice.status]}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                          <span>{documentTypeLabel(invoice.documentType)}</span>
                          <span className="text-gray-300">|</span>
                          <span>
                            {invoice.servicePeriod?.start
                              ? invoice.servicePeriod.start.toLocaleDateString('fr-FR')
                              : invoice.issueDate?.toLocaleDateString('fr-FR') ||
                                invoice.createdAt.toLocaleDateString('fr-FR')}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="font-medium text-gray-900">
                            {formatCurrency(invoice.totals?.total || 0)}
                          </span>
                        </div>

                        {invoice.notes && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-1">{invoice.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        {/* Boutons d'envoi (pour factures émises ou en attente) */}
                        {(invoice.status === 'ISSUED' || invoice.status === 'PENDING_PAYMENT') && invoice.clientId && (
                          <>
                            <button
                              onClick={() => handleSendByEmail(invoice)}
                              className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                              title="Envoyer par email"
                            >
                              <Mail size={20} />
                            </button>
                            <button
                              onClick={() => handleSendByWhatsApp(invoice)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Envoyer par WhatsApp"
                            >
                              <MessageCircle size={20} />
                            </button>
                          </>
                        )}

                        {/* Bouton marquer en attente de paiement */}
                        {(invoice.status === 'ISSUED' || invoice.status === 'PENDING_PAYMENT') && (
                          <button
                            onClick={() => handleMarkAsPending(invoice)}
                            disabled={isLoading}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Marquer en attente de paiement"
                          >
                            <Clock size={20} />
                          </button>
                        )}

                        {canMarkAsPaid(invoice) && (
                          <button
                            onClick={() => handleMarkAsPaid(invoice)}
                            disabled={isLoading}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Marquer comme payée"
                          >
                            <CheckCircle size={20} />
                          </button>
                        )}

                        {canCancelInvoice(invoice) && (
                          <button
                            onClick={() => handleCancel(invoice)}
                            disabled={isLoading}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Annuler"
                          >
                            <XCircle size={20} />
                          </button>
                        )}

                        {canCreateCreditNote(invoice) && (
                          <button
                            onClick={() => handleCreateCreditNote(invoice)}
                            disabled={isLoading}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Créer un avoir"
                          >
                            <RotateCcw size={20} />
                          </button>
                        )}

                        {canConvertQuoteToInvoice(invoice) && (
                          <button
                            onClick={() => handleConvertToInvoice(invoice)}
                            disabled={isLoading}
                            className="p-2 text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                            title="Convertir en facture"
                          >
                            <FileCheck size={20} />
                          </button>
                        )}

                        <button
                          onClick={() => handleDownloadPdf(invoice)}
                          disabled={isLoading}
                          className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Télécharger le PDF"
                        >
                          <Download size={20} />
                        </button>

                        {IS_DEV && (
                          <button
                            onClick={() => handleDelete(invoice)}
                            disabled={isLoading}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Supprimer (dev)"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!loading && filteredInvoices.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">Aucun document trouvé</p>
                  <p className="text-sm mt-1">
                    {invoices.length > 0
                      ? 'Essayez de modifier les filtres'
                      : 'Créez votre premier devis ou facture'}
                  </p>
                </div>
              )}

              {loading && (
                <div className="text-center py-12 text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-4"></div>
                  <p>Chargement des documents...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Catalogue */}
        {showCatalogModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 border-b border-apple-border">
                <h3 className="text-lg font-semibold text-gray-900">Ajouter depuis le catalogue</h3>
                <button
                  onClick={() => setShowCatalogModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="p-4 border-b border-apple-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Rechercher un service..."
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-gray-900 focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-[50vh] p-4">
                {filteredServices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package size={40} className="mx-auto mb-2 text-gray-300" />
                    <p>Aucun service trouvé</p>
                    <Link href="/catalog" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                      Gérer le catalogue
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredServices.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => addServiceFromCatalog(service)}
                        className="w-full text-left p-4 border border-apple-border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{service.name}</p>
                            {service.description && (
                              <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                            )}
                            {service.tags && service.tags.length > 0 && (
                              <div className="flex gap-1 mt-2">
                                {service.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="font-semibold text-gray-900">{formatCurrency(service.unitPrice)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Packs */}
        {showPackageModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 border-b border-apple-border">
                <h3 className="text-lg font-semibold text-gray-900">Appliquer un pack</h3>
                <button
                  onClick={() => setShowPackageModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="overflow-y-auto max-h-[60vh] p-4">
                {packages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package size={40} className="mx-auto mb-2 text-gray-300" />
                    <p>Aucun pack configuré</p>
                    <Link href="/catalog/packages" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                      Créer des packs
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {packages.map((pkg) => {
                      const totalPrice = pkg.lines.reduce((sum, line) => {
                        const service = services.find((s) => s.id === line.serviceId);
                        const price = line.overridePrice ?? service?.unitPrice ?? 0;
                        return sum + price * line.qty;
                      }, 0);

                      return (
                        <button
                          key={pkg.id}
                          onClick={() => applyPackage(pkg)}
                          className="w-full text-left p-4 border border-apple-border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-900">{pkg.name}</p>
                              {pkg.description && (
                                <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-2">
                                {pkg.lines.length} service{pkg.lines.length > 1 ? 's' : ''}
                              </p>
                            </div>
                            <p className="font-semibold text-gray-900">{formatCurrency(totalPrice)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modale Aperçu */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-apple-card rounded-xl border border-apple-border shadow-apple-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-bold text-gray-800">Aperçu du document</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <iframe
                srcDoc={previewHtml}
                className="w-full bg-white rounded-lg shadow"
                style={{ height: '800px', border: 'none' }}
                title="Aperçu facture"
              />
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-3">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {postIssueMessage && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setPostIssueMessage(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">📩 Message au client</h3>
              <button onClick={() => setPostIssueMessage(null)} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <p className="text-sm text-gray-600 mb-2">Copie-colle dans ton mail/WhatsApp :</p>
            <textarea
              value={postIssueMessage}
              onChange={(e) => setPostIssueMessage(e.target.value)}
              className="w-full h-72 p-3 border border-gray-200 rounded-lg text-sm font-mono"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(postIssueMessage);
                  alert('Copié ✅');
                }}
                className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700"
              >
                📋 Copier
              </button>
              <button
                onClick={() => {
                  const url = `https://wa.me/?text=${encodeURIComponent(postIssueMessage)}`;
                  window.open(url, '_blank');
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                WhatsApp
              </button>
              <button onClick={() => setPostIssueMessage(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F8FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    }>
      <InvoicesContent />
    </Suspense>
  );
}
