import type {
  Invoice,
  InvoiceDocumentType,
  InvoiceLineItem,
  InvoicePartySnapshot,
  InvoicePaymentTerms,
  InvoiceStatus,
  InvoiceTotals,
} from '@/types';
import {
  canCancelInvoice,
  canConvertQuoteToInvoice,
  canCreateCreditNote,
  canEditInvoice,
  canMarkAsPaid,
} from '@/lib/invoice-rules';
import { iso, toDate } from './dates';
import { paymentView, type PaymentView } from './payment';
import { asRecord, num, text } from './plain';

export interface PartyJson {
  displayName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  vatNumber: string | null;
  iban: string | null;
}

export interface VendorJson extends PartyJson {
  stageName: string | null;
  taxRate: number | null;
  codeAPE: string | null;
  legalStatus: string | null;
}

export interface LineItemJson {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate: number | null;
  taxAmount: number | null;
  serviceId: string | null;
}

export interface InvoiceJson {
  id: string;
  number: string | null;
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  clientId: string | null;
  bookingId: string | null;
  bookingIds: string[];
  clientSnapshot: PartyJson;
  vendorSnapshot: VendorJson;
  lineItems: LineItemJson[];
  totals: {
    currency: 'EUR';
    subtotal: number;
    taxRate: number | null;
    taxAmount: number;
    total: number;
    depositApplied: number;
    balanceDue: number;
  };
  currency: 'EUR';
  servicePeriod: { start: string; end: string } | null;
  servicePeriods: { start: string; end: string; label: string | null }[];
  issueDate: string | null;
  dueDate: string | null;
  paymentTerms: {
    dueDate: string | null;
    paymentMethod: string | null;
    penaltyRate: number | null;
    penaltyDescription: string | null;
  } | null;
  paymentMethod: string | null;
  payment: PaymentView;
  paidAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  source: string | null;
  issuedBy: string | null;
  creditedInvoiceId: string | null;
  convertedToInvoiceId: string | null;
  convertedFromQuoteId: string | null;
  emailSentAt: string | null;
  emailSentTo: string | null;
  legacyInvoiceNumber: string | null;
  pdfStoragePath: string | null;
  actions: {
    markAsPaid: boolean;
    convertToInvoice: boolean;
    createCreditNote: boolean;
    edit: boolean;
    cancel: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'DRAFT',
  'ISSUED',
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'CREDITED',
  'CONVERTED',
];

export function normalizeStatus(value: unknown): InvoiceStatus {
  if (typeof value === 'string' && (INVOICE_STATUSES as readonly string[]).includes(value)) {
    return value as InvoiceStatus;
  }
  if (value === 'paid') return 'PAID';
  if (value === 'cancelled') return 'CANCELLED';
  if (value) return 'ISSUED';
  return 'DRAFT';
}

export function normalizeDocumentType(data: Record<string, unknown>): InvoiceDocumentType {
  if (data.documentType === 'INVOICE' || data.documentType === 'QUOTE' || data.documentType === 'CREDIT_NOTE') {
    return data.documentType;
  }
  if (data.type === 'devis') return 'QUOTE';
  return 'INVOICE';
}

function mapLineItem(raw: unknown, index: number, fallbackTotal: number): InvoiceLineItem {
  const item = asRecord(raw);
  const quantity = num(item.quantity) ?? 1;
  const unitPrice = num(item.unitPrice) ?? fallbackTotal;
  const total = num(item.total) ?? quantity * unitPrice;
  return {
    id: text(item.id) ?? `line-${index + 1}`,
    description: text(item.description) ?? 'Prestation DJ',
    quantity,
    unitPrice,
    total,
    taxRate: num(item.taxRate),
    taxAmount: num(item.taxAmount),
    serviceId: text(item.serviceId),
  };
}

function mapParty(raw: unknown, fallbackName: string): InvoicePartySnapshot {
  const data = asRecord(raw);
  return {
    displayName: text(data.displayName) ?? text(data.clientName) ?? fallbackName,
    contactName: text(data.contactName),
    email: text(data.email),
    phone: text(data.phone),
    address: text(data.address),
    postalCode: text(data.postalCode),
    city: text(data.city),
    siret: text(data.siret),
    vatNumber: text(data.vatNumber),
    iban: text(data.iban),
  };
}

function mapVendor(raw: unknown, fallbackName: string): Invoice['vendorSnapshot'] {
  const data = asRecord(raw);
  const party = mapParty(data, fallbackName);
  return {
    ...party,
    stageName: text(data.stageName),
    taxRate: num(data.taxRate),
    logoUrl: text(data.logoUrl),
    codeAPE: text(data.codeAPE),
    legalStatus: text(data.legalStatus),
  };
}

function mapTotals(data: Record<string, unknown>): InvoiceTotals {
  const totals = asRecord(data.totals);
  const total = num(totals.total) ?? num(data.amountGross) ?? num(data.amount) ?? 0;
  const subtotal = num(totals.subtotal) ?? num(data.amountNet) ?? total;
  const taxAmount = num(totals.taxAmount) ?? num(data.amountTax) ?? 0;
  const balanceDue = num(totals.balanceDue) ?? num(data.balanceDue) ?? total;
  const depositApplied = num(totals.depositApplied) ?? num(data.depositApplied) ?? 0;
  const taxRate = num(totals.taxRate) ?? num(data.taxRate);
  return {
    currency: 'EUR',
    subtotal,
    taxRate,
    taxAmount,
    total,
    depositApplied,
    balanceDue,
  };
}

function mapPaymentTerms(raw: unknown): InvoicePaymentTerms | undefined {
  const data = asRecord(raw);
  if (Object.keys(data).length === 0) return undefined;
  const terms: InvoicePaymentTerms = {
    dueDate: toDate(data.dueDate),
    paymentMethod: text(data.paymentMethod),
    penaltyRate: num(data.penaltyRate),
    penaltyDescription: text(data.penaltyDescription),
  };
  if (!terms.dueDate && !terms.paymentMethod && terms.penaltyRate === undefined && !terms.penaltyDescription) {
    return undefined;
  }
  return terms;
}

export interface LoadedInvoice extends Invoice {
  rawSource: string | null;
}

export function firestoreToInvoice(id: string, raw: unknown): LoadedInvoice {
  const data = asRecord(raw);
  const totals = mapTotals(data);
  const documentType = normalizeDocumentType(data);
  const status = normalizeStatus(data.status);
  const lineItemsRaw = Array.isArray(data.lineItems) ? data.lineItems : [];
  const lineItems = lineItemsRaw.length > 0
    ? lineItemsRaw.map((item, index) => mapLineItem(item, index, totals.total))
    : [mapLineItem({ description: text(data.notes) ?? 'Prestation DJ', quantity: 1, unitPrice: totals.total, total: totals.total }, 0, totals.total)];

  const bookingIds = Array.isArray(data.bookingIds)
    ? data.bookingIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const servicePeriodRaw = asRecord(data.servicePeriod);
  const serviceStart = toDate(servicePeriodRaw.start);
  const serviceEnd = toDate(servicePeriodRaw.end);
  const servicePeriods = Array.isArray(data.servicePeriods)
    ? data.servicePeriods.flatMap((period) => {
        const record = asRecord(period);
        const start = toDate(record.start);
        const end = toDate(record.end);
        if (!start || !end) return [];
        return [{ start, end, label: text(record.label) }];
      })
    : undefined;

  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;

  return {
    id,
    number: text(data.number),
    documentType,
    status,
    bookingId: text(data.bookingId),
    bookingIds: bookingIds.length > 0 ? bookingIds : undefined,
    clientId: text(data.clientId),
    vendorSnapshot: mapVendor(data.vendorSnapshot, 'DJ Booker Pro'),
    clientSnapshot: mapParty(data.clientSnapshot, text(data.clientName) ?? 'Client'),
    lineItems,
    totals,
    currency: 'EUR',
    servicePeriod: serviceStart && serviceEnd ? { start: serviceStart, end: serviceEnd } : undefined,
    servicePeriods,
    issueDate: toDate(data.issueDate),
    dueDate: toDate(data.dueDate),
    paymentTerms: mapPaymentTerms(data.paymentTerms),
    paymentMethod: text(data.paymentMethod),
    issuedBy: text(data.issuedBy),
    paidAt: toDate(data.paidAt),
    cancelledAt: toDate(data.cancelledAt),
    emailSentAt: toDate(data.emailSentAt),
    emailSentTo: text(data.emailSentTo),
    creditedInvoiceId: text(data.creditedInvoiceId),
    convertedToInvoiceId: text(data.convertedToInvoiceId),
    convertedFromQuoteId: text(data.convertedFromQuoteId),
    notes: text(data.notes),
    pdfStoragePath: text(data.pdfStoragePath) ?? text(data.filename),
    createdAt,
    updatedAt,
    source: data.source === 'manual' || data.source === 'booking' ? data.source : undefined,
    legacyInvoiceNumber: text(data.invoiceNumber) ?? text(data.legacyInvoiceNumber),
    rawSource: text(data.source) ?? null,
  };
}

function partyJson(party: InvoicePartySnapshot): PartyJson {
  return {
    displayName: party.displayName,
    contactName: party.contactName ?? null,
    email: party.email ?? null,
    phone: party.phone ?? null,
    address: party.address ?? null,
    postalCode: party.postalCode ?? null,
    city: party.city ?? null,
    siret: party.siret ?? null,
    vatNumber: party.vatNumber ?? null,
    iban: party.iban ?? null,
  };
}

export function invoiceToJson(invoice: LoadedInvoice | Invoice): InvoiceJson {
  const due = invoice.dueDate ?? invoice.paymentTerms?.dueDate ?? null;
  const payment = paymentView(
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
  const bookingIds = invoice.bookingIds && invoice.bookingIds.length > 0
    ? invoice.bookingIds
    : invoice.bookingId
      ? [invoice.bookingId]
      : [];

  return {
    id: invoice.id,
    number: invoice.number ?? null,
    documentType: invoice.documentType,
    status: invoice.status,
    clientId: invoice.clientId ?? null,
    bookingId: invoice.bookingId ?? null,
    bookingIds,
    clientSnapshot: partyJson(invoice.clientSnapshot),
    vendorSnapshot: {
      ...partyJson(invoice.vendorSnapshot),
      stageName: invoice.vendorSnapshot.stageName ?? null,
      taxRate: invoice.vendorSnapshot.taxRate ?? null,
      codeAPE: invoice.vendorSnapshot.codeAPE ?? null,
      legalStatus: invoice.vendorSnapshot.legalStatus ?? null,
    },
    lineItems: invoice.lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      taxRate: item.taxRate ?? null,
      taxAmount: item.taxAmount ?? null,
      serviceId: item.serviceId ?? null,
    })),
    totals: {
      currency: 'EUR',
      subtotal: invoice.totals.subtotal,
      taxRate: invoice.totals.taxRate ?? null,
      taxAmount: invoice.totals.taxAmount,
      total: invoice.totals.total,
      depositApplied: invoice.totals.depositApplied,
      balanceDue: invoice.totals.balanceDue,
    },
    currency: 'EUR',
    servicePeriod: invoice.servicePeriod
      ? { start: invoice.servicePeriod.start.toISOString(), end: invoice.servicePeriod.end.toISOString() }
      : null,
    servicePeriods: (invoice.servicePeriods ?? []).map((period) => ({
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label ?? null,
    })),
    issueDate: iso(invoice.issueDate),
    dueDate: iso(invoice.dueDate),
    paymentTerms: invoice.paymentTerms
      ? {
          dueDate: iso(invoice.paymentTerms.dueDate),
          paymentMethod: invoice.paymentTerms.paymentMethod ?? null,
          penaltyRate: invoice.paymentTerms.penaltyRate ?? null,
          penaltyDescription: invoice.paymentTerms.penaltyDescription ?? null,
        }
      : null,
    paymentMethod: invoice.paymentMethod ?? null,
    payment,
    paidAt: iso(invoice.paidAt),
    cancelledAt: iso(invoice.cancelledAt),
    notes: invoice.notes ?? null,
    source: ('rawSource' in invoice ? invoice.rawSource : null) ?? invoice.source ?? null,
    issuedBy: invoice.issuedBy ?? null,
    creditedInvoiceId: invoice.creditedInvoiceId ?? null,
    convertedToInvoiceId: invoice.convertedToInvoiceId ?? null,
    convertedFromQuoteId: invoice.convertedFromQuoteId ?? null,
    emailSentAt: iso(invoice.emailSentAt),
    emailSentTo: invoice.emailSentTo ?? null,
    legacyInvoiceNumber: invoice.legacyInvoiceNumber ?? null,
    pdfStoragePath: invoice.pdfStoragePath ?? null,
    actions: {
      markAsPaid: canMarkAsPaid(invoice),
      convertToInvoice: canConvertQuoteToInvoice(invoice),
      createCreditNote: canCreateCreditNote(invoice),
      edit: canEditInvoice(invoice) && invoice.documentType !== 'CREDIT_NOTE',
      cancel: canCancelInvoice(invoice),
    },
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

export function documentInstant(invoice: Invoice): Date {
  return invoice.issueDate ?? invoice.createdAt;
}
