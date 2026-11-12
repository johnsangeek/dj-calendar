import { FieldValue } from 'firebase-admin/firestore';
import type { Booking, DJInfo, Invoice, InvoiceLineItem, InvoicePartySnapshot, InvoiceStatus } from '@/types';
import { adminDb } from '@/lib/firebase-admin';
import {
  canCancelInvoice,
  canConvertQuoteToInvoice,
  canCreateCreditNote,
  canEditInvoice,
  canMarkAsPaid,
  DEFAULT_PAYMENT_TERMS,
  generateInvoiceHash,
  LEGAL_TEXTS,
  type InvoiceWritePayload,
} from '@/lib/invoice-rules';
import { generateInvoiceNumberAdmin } from '@/lib/invoice-number-admin';
import { loadBookingsByIds } from './bookings';
import { loadClientRecord, type ClientRecord } from './clients';
import { iso, parseRangeBound, parseUserDate } from './dates';
import { BotApiError } from './errors';
import {
  documentInstant,
  firestoreToInvoice,
  invoiceToJson,
  type InvoiceJson,
  type LoadedInvoice,
} from './invoice-map';
import { assertSettlementAmount, matchesPaymentFilter, paymentView, roundCurrency } from './payment';
import { matchesQuery, paginate, pruneUndefinedDeep } from './plain';
import type { CreateDocumentInput, ListInvoicesQuery, PaymentInput, UpdateDocumentInput } from './schemas';

const DOCUMENT_STATUSES = ['DRAFT', 'ISSUED', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'CREDITED', 'CONVERTED'] as const;
const DOCUMENT_TYPES = ['INVOICE', 'QUOTE', 'CREDIT_NOTE'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const VAT_PREFIX = `${LEGAL_TEXTS.vatExempt}\n\n`;

type DocumentKind = 'INVOICE' | 'QUOTE';

function parseCsv<T extends string>(value: string | undefined, allowed: readonly T[], label: string): T[] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  const invalid = parts.filter((part) => !(allowed as readonly string[]).includes(part));
  if (invalid.length > 0) {
    throw new BotApiError(`${label} invalide : ${invalid.join(', ')}`, 400, { allowed });
  }
  return parts as T[];
}

async function loadAllInvoices(): Promise<LoadedInvoice[]> {
  const snap = await adminDb.collection('invoices').get();
  return snap.docs.map((doc) => firestoreToInvoice(doc.id, doc.data()));
}

async function loadInvoice(id: string): Promise<LoadedInvoice> {
  const snap = await adminDb.collection('invoices').doc(id).get();
  if (!snap.exists) throw new BotApiError('Document introuvable', 404);
  return firestoreToInvoice(snap.id, snap.data());
}

async function loadVendor(): Promise<DJInfo> {
  const snap = await adminDb.collection('settings').doc('dj_info').get();
  return (snap.exists ? snap.data() : {}) as DJInfo;
}

function collectBookingIds(input: { bookingId?: string; bookingIds?: string[] }): string[] {
  const ids: string[] = [];
  for (const id of input.bookingIds ?? []) {
    if (!ids.includes(id)) ids.push(id);
  }
  if (input.bookingId && !ids.includes(input.bookingId)) ids.unshift(input.bookingId);
  return ids;
}

function composeNotes(notes: string | null | undefined, vatExempt: boolean): string | undefined {
  const raw = notes ?? '';
  const withoutPrefix = raw.startsWith(VAT_PREFIX) ? raw.slice(VAT_PREFIX.length) : raw;
  const user = withoutPrefix.trim();
  if (vatExempt) return user ? `${VAT_PREFIX}${user}` : LEGAL_TEXTS.vatExempt;
  return user || undefined;
}

function buildVendorSnapshot(vendor: DJInfo): Invoice['vendorSnapshot'] {
  const taxRate = vendor.taxRate ?? 0;
  return pruneUndefinedDeep({
    displayName: vendor.commercialName || vendor.stageName || vendor.name || 'DJ Booker Pro',
    contactName: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    address: vendor.address,
    postalCode: vendor.postalCode,
    city: vendor.city,
    siret: vendor.siret,
    vatNumber: taxRate === 0 ? undefined : vendor.vatNumber,
    iban: vendor.iban,
    stageName: vendor.stageName,
    taxRate,
    legalStatus: 'Auto-entrepreneur',
    logoUrl: vendor.logoUrl,
    codeAPE: vendor.codeAPE,
  });
}

function buildClientSnapshot(client: ClientRecord, displayName?: string): InvoicePartySnapshot {
  return pruneUndefinedDeep({
    displayName: displayName || client.professionalName || client.name,
    contactName: client.name,
    email: client.email || client.primaryEmail,
    phone: client.phone,
    address: client.address,
    postalCode: client.postalCode,
    city: client.city,
    siret: client.siret,
  });
}

function lineFromInput(
  item: { description: string; quantity: number; unitPrice: number; serviceId?: string },
  index: number,
  taxRate: number,
): InvoiceLineItem {
  const total = item.quantity * item.unitPrice;
  return pruneUndefinedDeep({
    id: `line-${index + 1}`,
    description: item.description.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total,
    taxRate: taxRate > 0 ? taxRate : undefined,
    taxAmount: taxRate > 0 ? total * (taxRate / 100) : undefined,
    serviceId: item.serviceId,
  });
}

function lineFromBooking(booking: Booking, unitPrice: number, taxRate: number): InvoiceLineItem {
  const dateLabel = booking.start.toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const title = booking.title || 'Prestation DJ';
  return lineFromInput({
    description: `${title}${booking.location ? ` - ${booking.location}` : ''}\nDate : ${dateLabel}`,
    quantity: 1,
    unitPrice,
  }, 0, taxRate);
}

function computeTotals(lineItems: InvoiceLineItem[], taxRate: number, depositApplied: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + taxAmount;
  return {
    currency: 'EUR' as const,
    subtotal: roundCurrency(subtotal),
    taxRate: taxRate > 0 ? taxRate : undefined,
    taxAmount: roundCurrency(taxAmount),
    total: roundCurrency(total),
    depositApplied: roundCurrency(depositApplied),
    balanceDue: roundCurrency(Math.max(total - depositApplied, 0)),
  };
}

function resolveBookingPrice(booking: Booking, client: ClientRecord | null, vendor: DJInfo): { price: number; warning?: string } {
  if (booking.price > 0) return { price: booking.price };
  if (client?.defaultRate && client.defaultRate > 0) {
    return {
      price: client.defaultRate,
      warning: `Prix de « ${booking.title || booking.id} » repris du tarif habituel du client (${client.defaultRate} EUR) : la prestation n'a pas de prix.`,
    };
  }
  const average = client?.stats?.averageAmount ?? 0;
  if (average > 0) {
    const price = Math.round(average);
    return {
      price,
      warning: `Prix de « ${booking.title || booking.id} » estimé depuis la moyenne des prestations du client (${price} EUR).`,
    };
  }
  if (vendor.basePrice && vendor.basePrice > 0) {
    return {
      price: vendor.basePrice,
      warning: `Prix de « ${booking.title || booking.id} » repris du tarif de base des paramètres (${vendor.basePrice} EUR).`,
    };
  }
  throw new BotApiError(`Prix non défini pour la prestation « ${booking.title || booking.id} »`, 400, { bookingId: booking.id });
}

function serviceFields(bookings: Booking[]) {
  if (bookings.length === 0) return {};
  const sorted = [...bookings].sort((a, b) => a.start.getTime() - b.start.getTime());
  const servicePeriod = { start: sorted[0].start, end: sorted[0].end };
  const servicePeriods = sorted.length > 1
    ? sorted.map((booking) => ({
        start: booking.start,
        end: booking.end,
        label: `${booking.title || 'Prestation DJ'}${booking.location ? ` - ${booking.location}` : ''}`,
      }))
    : undefined;
  return { servicePeriod, servicePeriods };
}

function assertDated(bookings: Booking[]) {
  const missing = bookings.filter((booking) => booking.start.getTime() === 0 || booking.end.getTime() === 0);
  if (missing.length > 0) {
    throw new BotApiError('Une prestation n\'a pas de dates exploitables', 400, {
      bookingIds: missing.map((booking) => booking.id),
    });
  }
}

function initialStatus(kind: DocumentKind, requested?: 'DRAFT' | 'ISSUED'): InvoiceStatus {
  if (requested === 'DRAFT') return 'DRAFT';
  return kind === 'QUOTE' ? 'ISSUED' : 'PENDING_PAYMENT';
}

function activeLinks(invoices: LoadedInvoice[], bookingId: string, exceptId?: string): LoadedInvoice[] {
  return invoices.filter((invoice) => {
    if (exceptId && invoice.id === exceptId) return false;
    const linked = invoice.bookingId === bookingId || (invoice.bookingIds ?? []).includes(bookingId);
    return linked
      && invoice.documentType === 'INVOICE'
      && invoice.status !== 'CANCELLED'
      && invoice.status !== 'CREDITED'
      && invoice.status !== 'DRAFT';
  });
}

async function bookingWarnings(bookings: Booking[], exceptId?: string): Promise<string[]> {
  if (bookings.length === 0) return [];
  const invoices = await loadAllInvoices();
  const warnings: string[] = [];
  for (const booking of bookings) {
    if (booking.status === 'annulé') {
      warnings.push(`La prestation « ${booking.title || booking.id} » est annulée.`);
    }
    if (booking.invoicedExternally) {
      warnings.push(`La prestation « ${booking.title || booking.id} » est marquée comme facturée hors application.`);
    }
    for (const invoice of activeLinks(invoices, booking.id, exceptId)) {
      warnings.push(`La prestation « ${booking.title || booking.id} » est déjà liée à la facture ${invoice.number || invoice.id} (${invoice.status}).`);
    }
  }
  return warnings;
}

function withHash(payload: InvoiceWritePayload): InvoiceWritePayload {
  return { ...payload, hash: generateInvoiceHash(payload) };
}

export async function listInvoices(query: ListInvoicesQuery) {
  const statuses = parseCsv(query.status, DOCUMENT_STATUSES, 'Statut');
  const types = parseCsv(query.documentType, DOCUMENT_TYPES, 'Type de document');
  const from = query.from ? parseRangeBound(query.from, 'start') : undefined;
  const to = query.to ? parseRangeBound(query.to, 'end') : undefined;
  if (from && to && from.getTime() > to.getTime()) {
    throw new BotApiError('La date from est postérieure à to', 400);
  }

  let invoices = await loadAllInvoices();
  if (query.clientId) invoices = invoices.filter((invoice) => invoice.clientId === query.clientId);
  if (statuses) invoices = invoices.filter((invoice) => statuses.includes(invoice.status));
  if (types) invoices = invoices.filter((invoice) => types.includes(invoice.documentType));
  if (query.number) {
    invoices = invoices.filter((invoice) => invoice.number === query.number || invoice.legacyInvoiceNumber === query.number);
  }
  if (query.q) {
    const q = query.q;
    invoices = invoices.filter((invoice) => matchesQuery(q, [
      invoice.id,
      invoice.number,
      invoice.legacyInvoiceNumber,
      invoice.clientSnapshot.displayName,
      invoice.clientSnapshot.contactName,
      invoice.clientSnapshot.email,
      invoice.notes,
    ]));
  }
  if (from || to) {
    invoices = invoices.filter((invoice) => {
      const instant = documentInstant(invoice).getTime();
      if (from && instant < from.getTime()) return false;
      if (to && instant > to.getTime()) return false;
      return true;
    });
  }
  if (query.payment) {
    const payment = query.payment;
    invoices = invoices.filter((invoice) => {
      const due = invoice.dueDate ?? invoice.paymentTerms?.dueDate ?? null;
      const view = paymentView(
        {
          documentType: invoice.documentType,
          status: invoice.status,
          balanceDue: invoice.totals.balanceDue ?? invoice.totals.total,
          dueDate: due,
          paidAt: invoice.paidAt,
        },
        iso(due),
        iso(invoice.paidAt),
      );
      return matchesPaymentFilter(view.status, payment);
    });
  }

  invoices.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const page = paginate(invoices, query.offset ?? 0, query.limit ?? 100);
  return { ...page, items: page.items.map((invoice) => invoiceToJson(invoice)) };
}

export async function getInvoice(id: string): Promise<InvoiceJson> {
  return invoiceToJson(await loadInvoice(id));
}

export async function createBillingDocument(kind: DocumentKind, input: CreateDocumentInput): Promise<InvoiceJson & { warnings: string[] }> {
  if (kind === 'QUOTE' && input.dueInDays !== undefined) {
    throw new BotApiError('dueInDays ne s\'applique pas à un devis', 400);
  }

  const bookingIds = collectBookingIds(input);
  const bookings = bookingIds.length > 0 ? await loadBookingsByIds(bookingIds) : [];
  assertDated(bookings);

  let client: ClientRecord | null = input.clientId ? await loadClientRecord(input.clientId) : null;
  const warnings: string[] = [];
  if (input.clientId && input.clientName) {
    warnings.push('clientName est ignoré car clientId est fourni.');
  }

  if (!client && !input.clientName) {
    const clientIds = [...new Set(bookings.map((booking) => booking.clientId).filter((id): id is string => Boolean(id)))];
    if (clientIds.length > 1) {
      throw new BotApiError('Les prestations sélectionnées n\'appartiennent pas au même client', 400, { clientIds });
    }
    if (clientIds.length === 1) {
      client = await loadClientRecord(clientIds[0]);
    } else {
      const names = [...new Set(bookings.map((booking) => booking.clientName).filter(Boolean))];
      if (names.length > 1) {
        throw new BotApiError('Les prestations n\'ont pas le même nom de client. Indiquez clientId ou clientName.', 400);
      }
    }
  }

  const vendor = await loadVendor();
  const taxRate = vendor.taxRate ?? 0;
  const now = new Date();
  const status = initialStatus(kind, input.status);
  const sorted = [...bookings].sort((a, b) => a.start.getTime() - b.start.getTime());

  let lineItems: InvoiceLineItem[];
  if (input.lineItems && input.lineItems.length > 0) {
    lineItems = input.lineItems.map((item, index) => lineFromInput(item, index, taxRate));
  } else {
    lineItems = sorted.map((booking) => {
      const resolved = resolveBookingPrice(booking, client, vendor);
      if (resolved.warning) warnings.push(resolved.warning);
      return { ...lineFromBooking(booking, resolved.price, taxRate), id: `booking-${booking.id}` };
    });
  }

  if (client) {
    for (const booking of bookings) {
      if (booking.clientId && booking.clientId !== client.id) {
        warnings.push(`La prestation « ${booking.title || booking.id} » est rattachée à un autre client que ${client.name}.`);
      }
    }
  }

  const clientSnapshot: InvoicePartySnapshot = client
    ? buildClientSnapshot(client)
    : { displayName: input.clientName?.trim() || bookings.find((booking) => booking.clientName)?.clientName || 'Client' };

  const dueDate = kind === 'INVOICE'
    ? new Date(now.getTime() + (input.dueInDays ?? DEFAULT_PAYMENT_TERMS.dueInDays) * DAY_MS)
    : undefined;
  const paymentMethod = input.paymentMethod || (kind === 'INVOICE' ? 'Virement bancaire' : undefined);
  const number = status === 'DRAFT' ? undefined : await generateInvoiceNumberAdmin(kind);

  const payload = withHash(pruneUndefinedDeep({
    number,
    documentType: kind,
    status,
    bookingId: bookingIds.length === 1 ? bookingIds[0] : undefined,
    bookingIds: bookingIds.length > 0 ? bookingIds : undefined,
    clientId: client?.id,
    vendorSnapshot: buildVendorSnapshot(vendor),
    clientSnapshot,
    lineItems,
    totals: computeTotals(lineItems, taxRate, 0),
    currency: 'EUR' as const,
    ...serviceFields(bookings),
    issueDate: status === 'DRAFT' ? undefined : now,
    dueDate,
    paymentTerms: kind === 'INVOICE'
      ? {
          dueDate,
          paymentMethod: paymentMethod || 'Virement bancaire',
          penaltyRate: DEFAULT_PAYMENT_TERMS.penaltyRate,
          penaltyDescription: LEGAL_TEXTS.latePenalty,
        }
      : undefined,
    paymentMethod,
    notes: composeNotes(input.notes, taxRate === 0),
    issuedBy: 'bot',
    createdAt: now,
    updatedAt: now,
    source: bookingIds.length > 0 ? 'booking' as const : 'manual' as const,
  }));

  warnings.push(...await bookingWarnings(bookings));

  const ref = await adminDb.collection('invoices').add(payload);
  const fresh = await ref.get();
  return { ...invoiceToJson(firestoreToInvoice(ref.id, fresh.data())), warnings };
}

function assertEditable(invoice: Invoice) {
  if (invoice.documentType === 'CREDIT_NOTE') {
    throw new BotApiError('Un avoir ne se modifie pas', 409, { documentType: invoice.documentType });
  }
  if (canEditInvoice(invoice)) return;
  if (invoice.status === 'PAID' || invoice.status === 'CREDITED') {
    throw new BotApiError('Ce document est figé. La correction passe par un avoir, pas par une modification.', 409, {
      status: invoice.status,
    });
  }
  throw new BotApiError('Ce document ne peut pas être modifié', 409, {
    status: invoice.status,
    documentType: invoice.documentType,
  });
}

export async function updateInvoice(id: string, input: UpdateDocumentInput): Promise<InvoiceJson & { warnings?: string[] }> {
  const invoice = await loadInvoice(id);
  assertEditable(invoice);
  if (input.status === 'DRAFT' && invoice.status !== 'DRAFT') {
    throw new BotApiError('Un document émis ne peut pas repasser en brouillon', 409);
  }
  if (input.dueInDays !== undefined && invoice.documentType === 'QUOTE') {
    throw new BotApiError('dueInDays ne s\'applique pas à un devis', 400);
  }
  if (input.dueInDays !== undefined && invoice.status !== 'DRAFT') {
    throw new BotApiError('L\'échéance d\'un document déjà émis ne se modifie pas', 400);
  }
  if (input.clientName === null) {
    throw new BotApiError('Le nom affiché du client ne peut pas être vide', 400);
  }

  const issuing = input.status === 'ISSUED' && invoice.status === 'DRAFT';
  const otherKeys = Object.keys(input).filter((key) => key !== 'status');
  if (!issuing && otherKeys.length === 0) {
    return invoiceToJson(invoice);
  }

  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now };
  let clientSnapshot = invoice.clientSnapshot;
  let vendorSnapshot = invoice.vendorSnapshot;
  let lineItems = invoice.lineItems;
  let totals = invoice.totals;
  let notes = invoice.notes;
  let paymentMethod = invoice.paymentMethod;
  let paymentTerms = invoice.paymentTerms;
  let dueDate = invoice.dueDate;
  let issueDate = invoice.issueDate;
  let number = invoice.number;
  let status = invoice.status;
  let bookingId = invoice.bookingId;
  let bookingIds = invoice.bookingIds;
  let servicePeriod = invoice.servicePeriod;
  let servicePeriods = invoice.servicePeriods;
  let clientId = invoice.clientId;
  const warnings: string[] = [];

  if (input.clientId) {
    const client = await loadClientRecord(input.clientId);
    clientId = client.id;
    clientSnapshot = buildClientSnapshot(client, input.clientName ?? undefined);
    patch.clientId = client.id;
    patch.clientSnapshot = clientSnapshot;
  } else if (input.clientName) {
    clientSnapshot = { ...clientSnapshot, displayName: input.clientName };
    patch.clientSnapshot = clientSnapshot;
  }

  if (input.paymentMethod !== undefined) {
    paymentMethod = input.paymentMethod ?? undefined;
    patch.paymentMethod = input.paymentMethod === null ? FieldValue.delete() : input.paymentMethod;
    if (paymentTerms && input.paymentMethod) {
      paymentTerms = { ...paymentTerms, paymentMethod: input.paymentMethod };
      patch.paymentTerms = paymentTerms;
    }
  }

  if (input.notes !== undefined && !input.lineItems && !issuing) {
    const vatExempt = (vendorSnapshot.taxRate ?? 0) === 0;
    notes = composeNotes(input.notes, vatExempt);
    patch.notes = notes ?? FieldValue.delete();
  }

  if (input.bookingIds) {
    const uniqueIds = collectBookingIds({ bookingIds: input.bookingIds });
    const bookings = uniqueIds.length > 0 ? await loadBookingsByIds(uniqueIds) : [];
    assertDated(bookings);
    warnings.push(...await bookingWarnings(bookings, invoice.id));
    if (uniqueIds.length === 0) {
      bookingId = undefined;
      bookingIds = undefined;
      servicePeriod = undefined;
      servicePeriods = undefined;
      patch.bookingId = FieldValue.delete();
      patch.bookingIds = FieldValue.delete();
      patch.servicePeriod = FieldValue.delete();
      patch.servicePeriods = FieldValue.delete();
    } else {
      bookingIds = uniqueIds;
      bookingId = uniqueIds.length === 1 ? uniqueIds[0] : undefined;
      const periods = serviceFields(bookings);
      servicePeriod = periods.servicePeriod;
      servicePeriods = periods.servicePeriods;
      patch.bookingIds = uniqueIds;
      patch.bookingId = bookingId ?? FieldValue.delete();
      patch.servicePeriod = servicePeriod;
      patch.servicePeriods = servicePeriods ?? FieldValue.delete();
    }
  }

  const recomputeMoney = Boolean(input.lineItems) || issuing;
  if (recomputeMoney) {
    const vendor = await loadVendor();
    const taxRate = vendor.taxRate ?? 0;
    vendorSnapshot = buildVendorSnapshot(vendor);
    lineItems = input.lineItems
      ? input.lineItems.map((item, index) => lineFromInput(item, index, taxRate))
      : invoice.lineItems.map((item, index) => ({
          ...lineFromInput({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            serviceId: item.serviceId,
          }, index, taxRate),
          id: item.id,
        }));
    totals = computeTotals(lineItems, taxRate, invoice.totals.depositApplied || 0);
    notes = composeNotes(input.notes !== undefined ? input.notes : invoice.notes, taxRate === 0);
    patch.vendorSnapshot = vendorSnapshot;
    patch.lineItems = lineItems;
    patch.totals = totals;
    patch.notes = notes ?? FieldValue.delete();
  }

  if (invoice.status === 'DRAFT' && invoice.documentType === 'INVOICE' && input.dueInDays !== undefined && !issuing) {
    dueDate = new Date(now.getTime() + input.dueInDays * DAY_MS);
    paymentTerms = {
      dueDate,
      paymentMethod: paymentMethod || 'Virement bancaire',
      penaltyRate: paymentTerms?.penaltyRate ?? DEFAULT_PAYMENT_TERMS.penaltyRate,
      penaltyDescription: paymentTerms?.penaltyDescription ?? LEGAL_TEXTS.latePenalty,
    };
    patch.dueDate = dueDate;
    patch.paymentTerms = paymentTerms;
  }

  if (issuing) {
    status = invoice.documentType === 'QUOTE' ? 'ISSUED' : 'PENDING_PAYMENT';
    number = invoice.number ?? await generateInvoiceNumberAdmin(invoice.documentType === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    issueDate = invoice.issueDate ?? now;
    patch.status = status;
    patch.number = number;
    patch.issueDate = issueDate;
    if (invoice.documentType === 'INVOICE') {
      dueDate = input.dueInDays !== undefined
        ? new Date(now.getTime() + input.dueInDays * DAY_MS)
        : invoice.dueDate ?? new Date(now.getTime() + DEFAULT_PAYMENT_TERMS.dueInDays * DAY_MS);
      paymentMethod = paymentMethod || 'Virement bancaire';
      paymentTerms = {
        dueDate,
        paymentMethod,
        penaltyRate: paymentTerms?.penaltyRate ?? DEFAULT_PAYMENT_TERMS.penaltyRate,
        penaltyDescription: paymentTerms?.penaltyDescription ?? LEGAL_TEXTS.latePenalty,
      };
      patch.dueDate = dueDate;
      patch.paymentMethod = paymentMethod;
      patch.paymentTerms = paymentTerms;
    }
  }

  const hashed = withHash(pruneUndefinedDeep({
    number,
    documentType: invoice.documentType,
    status,
    bookingId,
    bookingIds,
    clientId,
    vendorSnapshot,
    clientSnapshot,
    lineItems,
    totals,
    currency: 'EUR' as const,
    servicePeriod,
    servicePeriods,
    issueDate,
    dueDate,
    paymentTerms,
    paymentMethod,
    notes,
    issuedBy: invoice.issuedBy,
    paidAt: invoice.paidAt,
    cancelledAt: invoice.cancelledAt,
    creditedInvoiceId: invoice.creditedInvoiceId,
    convertedToInvoiceId: invoice.convertedToInvoiceId,
    convertedFromQuoteId: invoice.convertedFromQuoteId,
    createdAt: invoice.createdAt,
    updatedAt: now,
    source: invoice.source,
  }));
  patch.hash = hashed.hash;
  const writePatch = pruneUndefinedDeep(patch);

  const ref = adminDb.collection('invoices').doc(id);
  const seenAt = invoice.updatedAt.getTime();
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new BotApiError('Document introuvable', 404);
    const fresh = firestoreToInvoice(id, snap.data());
    if (fresh.updatedAt.getTime() !== seenAt) {
      throw new BotApiError('Le document a été modifié entre-temps, relisez-le et réessayez', 409);
    }
    assertEditable(fresh);
    if (issuing && fresh.status !== 'DRAFT') {
      throw new BotApiError('Le document a été modifié entre-temps, relisez-le et réessayez', 409);
    }
    transaction.update(ref, writePatch);
  });

  const updated = invoiceToJson(await loadInvoice(id));
  return warnings.length > 0 ? { ...updated, warnings } : updated;
}

function assertPayable(invoice: Invoice) {
  if (invoice.status === 'PAID') {
    throw new BotApiError('Facture déjà payée', 409, { paidAt: iso(invoice.paidAt) });
  }
  if (canMarkAsPaid(invoice)) return;
  if (invoice.documentType !== 'INVOICE') {
    throw new BotApiError('Seule une facture peut être marquée comme payée', 409, { documentType: invoice.documentType });
  }
  throw new BotApiError('Seule une facture émise ou en attente de paiement peut être marquée comme payée', 409, {
    status: invoice.status,
  });
}

export async function recordPayment(id: string, input: PaymentInput): Promise<InvoiceJson> {
  const invoice = await loadInvoice(id);
  assertPayable(invoice);
  const remaining = invoice.totals.balanceDue ?? invoice.totals.total;
  assertSettlementAmount(input.amount, remaining);
  const paidAt = input.paidAt ? parseUserDate(input.paidAt) : new Date();
  const patch: Record<string, unknown> = {
    status: 'PAID',
    paidAt,
    updatedAt: new Date(),
  };
  if (input.paymentMethod) {
    patch.paymentMethod = input.paymentMethod;
    if (invoice.paymentTerms) {
      patch.paymentTerms = { ...invoice.paymentTerms, paymentMethod: input.paymentMethod };
    }
  }

  const ref = adminDb.collection('invoices').doc(id);
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new BotApiError('Document introuvable', 404);
    const fresh = firestoreToInvoice(id, snap.data());
    assertPayable(fresh);
    transaction.update(ref, patch);
  });
  return getInvoice(id);
}

function assertConvertible(invoice: Invoice) {
  if (canConvertQuoteToInvoice(invoice)) return;
  if (invoice.documentType !== 'QUOTE') {
    throw new BotApiError('Seuls les devis peuvent être convertis en facture', 409, { documentType: invoice.documentType });
  }
  if (invoice.convertedToInvoiceId || invoice.status === 'CONVERTED') {
    throw new BotApiError('Ce devis a déjà été converti en facture', 409, {
      convertedToInvoiceId: invoice.convertedToInvoiceId ?? null,
    });
  }
  throw new BotApiError('Seuls les devis au statut ISSUED peuvent être convertis', 409, {
    status: invoice.status,
    hint: 'Émettez le brouillon avec PATCH {"status":"ISSUED"}.',
  });
}

function buildConversion(quote: LoadedInvoice, number: string, now: Date): InvoiceWritePayload {
  const dueDate = new Date(now.getTime() + DEFAULT_PAYMENT_TERMS.dueInDays * DAY_MS);
  const suffix = `Facture issue du devis ${quote.number || quote.id}`;
  return withHash(pruneUndefinedDeep({
    number,
    documentType: 'INVOICE' as const,
    status: 'PENDING_PAYMENT' as const,
    bookingId: quote.bookingId,
    bookingIds: quote.bookingIds,
    clientId: quote.clientId,
    vendorSnapshot: quote.vendorSnapshot,
    clientSnapshot: quote.clientSnapshot,
    lineItems: quote.lineItems,
    totals: quote.totals,
    currency: 'EUR' as const,
    servicePeriod: quote.servicePeriod,
    servicePeriods: quote.servicePeriods,
    issueDate: now,
    dueDate,
    paymentTerms: {
      dueDate,
      paymentMethod: quote.paymentMethod || 'Virement bancaire',
      penaltyRate: DEFAULT_PAYMENT_TERMS.penaltyRate,
      penaltyDescription: LEGAL_TEXTS.latePenalty,
    },
    paymentMethod: quote.paymentMethod || 'Virement bancaire',
    notes: quote.notes ? `${quote.notes}\n\n${suffix}` : suffix,
    convertedFromQuoteId: quote.id,
    issuedBy: 'bot',
    createdAt: now,
    updatedAt: now,
    source: quote.source ?? 'manual',
  }));
}

export async function convertQuote(id: string): Promise<{ quote: InvoiceJson; invoice: InvoiceJson }> {
  const existing = await loadInvoice(id);
  assertConvertible(existing);
  const number = await generateInvoiceNumberAdmin('INVOICE');
  const quoteRef = adminDb.collection('invoices').doc(id);
  let invoiceId = '';

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(quoteRef);
    if (!snap.exists) throw new BotApiError('Devis introuvable', 404);
    const quote = firestoreToInvoice(id, snap.data());
    assertConvertible(quote);
    const now = new Date();
    const payload = buildConversion(quote, number, now);
    const invoiceRef = adminDb.collection('invoices').doc();
    transaction.set(invoiceRef, payload);
    transaction.update(quoteRef, {
      status: 'CONVERTED',
      convertedToInvoiceId: invoiceRef.id,
      updatedAt: now,
    });
    invoiceId = invoiceRef.id;
  });

  const [quote, invoice] = await Promise.all([getInvoice(id), getInvoice(invoiceId)]);
  return { quote, invoice };
}

function assertCreditable(invoice: Invoice) {
  if (canCreateCreditNote(invoice)) return;
  if (invoice.documentType !== 'INVOICE') {
    throw new BotApiError('Un avoir se crée à partir d\'une facture', 409, { documentType: invoice.documentType });
  }
  if (invoice.status === 'CREDITED' || invoice.creditedInvoiceId) {
    throw new BotApiError('Un avoir existe déjà pour cette facture', 409, {
      creditedInvoiceId: invoice.creditedInvoiceId ?? null,
    });
  }
  if (invoice.status === 'PENDING_PAYMENT' || invoice.status === 'DRAFT') {
    throw new BotApiError('Un avoir ne peut pas être émis pour cette facture', 409, {
      status: invoice.status,
      hint: 'L\'application n\'autorise l\'avoir que pour une facture au statut ISSUED ou PAID, sans avoir déjà lié. Une facture en attente de paiement se corrige par PATCH ou s\'annule ; elle ne se supprime pas.',
    });
  }
  throw new BotApiError('Un avoir ne peut pas être créé pour ce document', 409, {
    status: invoice.status,
    documentType: invoice.documentType,
  });
}

function buildCreditNote(invoice: LoadedInvoice, number: string, now: Date): InvoiceWritePayload {
  return withHash(pruneUndefinedDeep({
    number,
    documentType: 'CREDIT_NOTE' as const,
    status: 'ISSUED' as const,
    bookingId: invoice.bookingId,
    bookingIds: invoice.bookingIds,
    clientId: invoice.clientId,
    vendorSnapshot: invoice.vendorSnapshot,
    clientSnapshot: invoice.clientSnapshot,
    lineItems: invoice.lineItems.map((item) => pruneUndefinedDeep({
      ...item,
      unitPrice: -Math.abs(item.unitPrice),
      total: -Math.abs(item.total),
      taxAmount: item.taxAmount !== undefined ? -Math.abs(item.taxAmount) : undefined,
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
    servicePeriods: invoice.servicePeriods,
    issueDate: now,
    notes: `Avoir pour la facture ${invoice.number || invoice.id}`,
    creditedInvoiceId: invoice.id,
    issuedBy: 'bot',
    createdAt: now,
    updatedAt: now,
    source: 'manual' as const,
  }));
}

export async function createCreditNote(id: string): Promise<{ creditNote: InvoiceJson; invoice: InvoiceJson }> {
  const existing = await loadInvoice(id);
  assertCreditable(existing);
  const number = await generateInvoiceNumberAdmin('CREDIT_NOTE');
  const invoiceRef = adminDb.collection('invoices').doc(id);
  let creditNoteId = '';

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    if (!snap.exists) throw new BotApiError('Document introuvable', 404);
    const invoice = firestoreToInvoice(id, snap.data());
    assertCreditable(invoice);
    const now = new Date();
    const payload = buildCreditNote(invoice, number, now);
    const creditRef = adminDb.collection('invoices').doc();
    transaction.set(creditRef, payload);
    transaction.update(invoiceRef, {
      status: 'CREDITED',
      creditedInvoiceId: creditRef.id,
      updatedAt: now,
    });
    creditNoteId = creditRef.id;
  });

  const [creditNote, invoice] = await Promise.all([getInvoice(creditNoteId), getInvoice(id)]);
  return { creditNote, invoice };
}

function assertCancellable(invoice: Invoice) {
  if (canCancelInvoice(invoice)) return;
  if (invoice.status === 'PAID') {
    throw new BotApiError('Une facture payée ne s\'annule pas : créez un avoir', 409);
  }
  if (invoice.status === 'CANCELLED') {
    throw new BotApiError('Document déjà annulé', 409);
  }
  throw new BotApiError('Ce document ne peut pas être annulé', 409, {
    status: invoice.status,
    documentType: invoice.documentType,
  });
}

export async function cancelDocument(id: string): Promise<InvoiceJson> {
  const invoice = await loadInvoice(id);
  assertCancellable(invoice);
  const ref = adminDb.collection('invoices').doc(id);
  const now = new Date();
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new BotApiError('Document introuvable', 404);
    const fresh = firestoreToInvoice(id, snap.data());
    assertCancellable(fresh);
    transaction.update(ref, {
      status: 'CANCELLED',
      cancelledAt: now,
      updatedAt: now,
    });
  });
  return getInvoice(id);
}
