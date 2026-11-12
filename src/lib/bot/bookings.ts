import type { Booking } from '@/types';
import { adminDb } from '@/lib/firebase-admin';
import { iso, parseRangeBound, toDate } from './dates';
import { BotApiError } from './errors';
import { firestoreToInvoice, type InvoiceJson } from './invoice-map';
import { matchesQuery, paginate, text } from './plain';
import type { ListBookingsQuery } from './schemas';

const BOOKING_STATUSES = ['option', 'confirmé', 'annulé', 'terminé', 'remplaçant'] as const;

const STATUS_ALIASES: Record<string, Booking['status']> = {
  option: 'option',
  confirme: 'confirmé',
  'confirmé': 'confirmé',
  annule: 'annulé',
  'annulé': 'annulé',
  termine: 'terminé',
  'terminé': 'terminé',
  remplacant: 'remplaçant',
  'remplaçant': 'remplaçant',
};

export interface LinkedDocument {
  id: string;
  number: string | null;
  documentType: InvoiceJson['documentType'];
  status: InvoiceJson['status'];
}

export interface BookingJson {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string;
  displayName: string | null;
  start: string | null;
  end: string | null;
  location: string | null;
  notes: string | null;
  price: number;
  deposit: number;
  status: string;
  invoicedExternally: boolean;
  invoiced: boolean;
  linkedDocuments: LinkedDocument[];
  createdAt: string | null;
  updatedAt: string | null;
}

function asBooking(id: string, raw: unknown): Booking {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const status = STATUS_ALIASES[String(data.status ?? '')] ?? 'option';
  return {
    id,
    title: text(data.title) ?? '',
    clientId: text(data.clientId),
    clientName: text(data.clientName) ?? '',
    displayName: text(data.displayName),
    start: toDate(data.start) ?? new Date(0),
    end: toDate(data.end) ?? new Date(0),
    location: text(data.location),
    notes: text(data.notes),
    price: typeof data.price === 'number' ? data.price : Number(data.price) || 0,
    deposit: typeof data.deposit === 'number' ? data.deposit : Number(data.deposit) || 0,
    status,
    invoicedExternally: data.invoicedExternally === true,
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

function rawStatus(raw: unknown): string {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return typeof data.status === 'string' ? data.status : 'option';
}

export function isActivelyInvoiced(links: LinkedDocument[], invoicedExternally: boolean): boolean {
  if (invoicedExternally) return true;
  return links.some((link) =>
    link.documentType === 'INVOICE'
    && link.status !== 'CANCELLED'
    && link.status !== 'CREDITED'
    && link.status !== 'DRAFT',
  );
}

function indexLinks(invoices: ReturnType<typeof firestoreToInvoice>[]): Map<string, LinkedDocument[]> {
  const map = new Map<string, LinkedDocument[]>();
  for (const invoice of invoices) {
    const ids = new Set<string>();
    if (invoice.bookingId) ids.add(invoice.bookingId);
    for (const bookingId of invoice.bookingIds ?? []) ids.add(bookingId);
    const link: LinkedDocument = {
      id: invoice.id,
      number: invoice.number ?? null,
      documentType: invoice.documentType,
      status: invoice.status,
    };
    for (const bookingId of ids) {
      const list = map.get(bookingId) ?? [];
      list.push(link);
      map.set(bookingId, list);
    }
  }
  return map;
}

function toJson(booking: Booking, status: string, links: LinkedDocument[]): BookingJson {
  return {
    id: booking.id,
    title: booking.title,
    clientId: booking.clientId ?? null,
    clientName: booking.clientName,
    displayName: booking.displayName ?? null,
    start: booking.start.getTime() === 0 ? null : booking.start.toISOString(),
    end: booking.end.getTime() === 0 ? null : booking.end.toISOString(),
    location: booking.location ?? null,
    notes: booking.notes ?? null,
    price: booking.price,
    deposit: booking.deposit,
    status,
    invoicedExternally: booking.invoicedExternally === true,
    invoiced: isActivelyInvoiced(links, booking.invoicedExternally === true),
    linkedDocuments: links,
    createdAt: iso(booking.createdAt),
    updatedAt: iso(booking.updatedAt),
  };
}

function parseStatuses(value: string | undefined): Booking['status'][] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  const invalid = parts.filter((part) => !STATUS_ALIASES[part]);
  if (invalid.length > 0) {
    throw new BotApiError(`Statut de prestation invalide : ${invalid.join(', ')}`, 400, {
      allowed: BOOKING_STATUSES,
    });
  }
  return parts.map((part) => STATUS_ALIASES[part]);
}

export async function loadBookingsByIds(ids: string[]): Promise<Booking[]> {
  const unique = [...new Set(ids)];
  const snaps = await Promise.all(unique.map((id) => adminDb.collection('bookings').doc(id).get()));
  const missing = snaps.filter((snap) => !snap.exists).map((snap) => snap.id);
  if (missing.length > 0) {
    throw new BotApiError('Prestation introuvable', 404, { bookingIds: missing });
  }
  return snaps.map((snap) => asBooking(snap.id, snap.data()));
}

export async function listBookings(query: ListBookingsQuery) {
  const [bookingSnap, invoiceSnap] = await Promise.all([
    adminDb.collection('bookings').get(),
    adminDb.collection('invoices').get(),
  ]);
  const links = indexLinks(invoiceSnap.docs.map((doc) => firestoreToInvoice(doc.id, doc.data())));
  const statuses = parseStatuses(query.status);
  const from = query.from ? parseRangeBound(query.from, 'start') : undefined;
  const to = query.to ? parseRangeBound(query.to, 'end') : undefined;
  if (from && to && from.getTime() > to.getTime()) {
    throw new BotApiError('La date from est postérieure à to', 400);
  }

  let bookings = bookingSnap.docs.map((doc) => {
    const booking = asBooking(doc.id, doc.data());
    return toJson(booking, rawStatus(doc.data()), links.get(doc.id) ?? []);
  });

  if (query.clientId) bookings = bookings.filter((booking) => booking.clientId === query.clientId);
  if (statuses) bookings = bookings.filter((booking) => statuses.includes(booking.status as Booking['status']));
  if (query.q) {
    const q = query.q;
    bookings = bookings.filter((booking) => matchesQuery(q, [
      booking.id,
      booking.title,
      booking.clientName,
      booking.displayName,
      booking.location,
      booking.notes,
    ]));
  }
  if (from || to) {
    bookings = bookings.filter((booking) => {
      if (!booking.start) return false;
      const start = new Date(booking.start).getTime();
      if (from && start < from.getTime()) return false;
      if (to && start > to.getTime()) return false;
      return true;
    });
  }
  if (query.invoiced === 'true') bookings = bookings.filter((booking) => booking.invoiced);
  if (query.invoiced === 'false') bookings = bookings.filter((booking) => !booking.invoiced);

  bookings.sort((a, b) => {
    const aTime = a.start ? new Date(a.start).getTime() : 0;
    const bTime = b.start ? new Date(b.start).getTime() : 0;
    return bTime - aTime || b.id.localeCompare(a.id);
  });

  return paginate(bookings, query.offset ?? 0, query.limit ?? 100);
}

export async function getBooking(id: string): Promise<BookingJson> {
  const snap = await adminDb.collection('bookings').doc(id).get();
  if (!snap.exists) throw new BotApiError('Prestation introuvable', 404);
  const invoiceSnap = await adminDb.collection('invoices').get();
  const links = indexLinks(invoiceSnap.docs.map((doc) => firestoreToInvoice(doc.id, doc.data())));
  return toJson(asBooking(snap.id, snap.data()), rawStatus(snap.data()), links.get(snap.id) ?? []);
}
