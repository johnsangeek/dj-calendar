import { Booking, Client, DJInfo, InvoiceDocumentType, InvoiceStatus } from '@/types';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_PAYMENT_TERMS, LEGAL_TEXTS, type InvoiceWritePayload } from './invoice-rules';

export type { InvoiceWritePayload } from './invoice-rules';
export {
  DEFAULT_PAYMENT_TERMS,
  LEGAL_TEXTS,
  generateInvoiceHash,
  canEditInvoice,
  canCancelInvoice,
  canMarkAsPaid,
  canCreateCreditNote,
  canConvertQuoteToInvoice,
} from './invoice-rules';

interface BuildInvoicePayloadOptions {
  booking: Booking;
  client?: Client | null;
  vendor?: DJInfo | null;
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  includeDeposit?: boolean;
  notes?: string;
  paymentMethod?: string;
  issuedBy?: string;
  number?: string;
  creditedInvoiceId?: string;
}

const roundCurrency = (value: number): number => Number(value.toFixed(2));

const pruneUndefined = <T extends Record<string, unknown>>(value: T): T => {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries) as T;
};

const pruneUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefinedDeep(item)) as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object') {
    const pruned = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .reduce<Record<string, unknown>>((acc, [key, val]) => {
        acc[key] = pruneUndefinedDeep(val);
        return acc;
      }, {});
    return pruned as T;
  }
  return value;
};

/**
 * Génère un numéro de facture unique et chronologique
 * Format: F2026-0001 (facture), D2026-0001 (devis), AV2026-0001 (avoir)
 */
export async function generateInvoiceNumber(documentType: InvoiceDocumentType): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = documentType === 'QUOTE' ? 'D' : documentType === 'CREDIT_NOTE' ? 'AV' : 'F';

  // Chercher le dernier numéro de l'année pour ce type de document
  const invoicesRef = collection(db, 'invoices');
  const q = query(
    invoicesRef,
    where('documentType', '==', documentType),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  const snapshot = await getDocs(q);

  // Trouver le plus grand numéro de cette année
  let maxNumber = 0;
  const yearPrefix = `${prefix}${year}-`;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const num = data.number;
    if (num && typeof num === 'string' && num.startsWith(yearPrefix)) {
      const numPart = parseInt(num.replace(yearPrefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNumber) {
        maxNumber = numPart;
      }
    }
  });

  const nextNumber = maxNumber + 1;
  return `${prefix}${year}-${nextNumber.toString().padStart(4, '0')}`;
}

export function buildInvoicePayload({
  booking,
  client,
  vendor,
  documentType,
  status,
  includeDeposit = false,
  notes,
  paymentMethod,
  issuedBy,
  number,
  creditedInvoiceId,
}: BuildInvoicePayloadOptions): InvoiceWritePayload {
  const now = new Date();
  const taxRate = vendor?.taxRate ?? 0;
  const isVatExempt = taxRate === 0;

  // Calcul des montants
  const total = documentType === 'CREDIT_NOTE' ? -Math.abs(booking.price) : booking.price;
  const subtotal = taxRate > 0 ? roundCurrency(total / (1 + taxRate / 100)) : roundCurrency(total);
  const taxAmount = roundCurrency(total - subtotal);
  const depositApplied = includeDeposit ? Math.min(booking.deposit, Math.abs(total)) : 0;
  const balanceDue = roundCurrency(Math.abs(total) - depositApplied);

  // Snapshot vendeur avec toutes les infos légales
  const vendorSnapshot = pruneUndefined({
    displayName: vendor?.commercialName || vendor?.stageName || vendor?.name || 'DJ Booker Pro',
    contactName: vendor?.name,
    email: vendor?.email,
    phone: vendor?.phone,
    address: vendor?.address,
    siret: vendor?.siret,
    vatNumber: isVatExempt ? undefined : vendor?.vatNumber,
    iban: vendor?.iban,
    stageName: vendor?.stageName,
    taxRate,
    legalStatus: 'Auto-entrepreneur', // À rendre configurable
    apeCode: undefined, // À ajouter dans DJInfo
  });

  // Snapshot client avec toutes les infos
  const clientSnapshot = client
    ? pruneUndefined({
        displayName: client.professionalName || client.name,
        contactName: client.name,
        email: client.email || client.primaryEmail,
        phone: client.phone,
        address: client.address,
        siret: client.siret,
      })
    : {
        displayName: booking.clientName,
      };

  // Description détaillée de la prestation
  const prestationDescription = booking.title + (booking.location ? ` – ${booking.location}` : '');
  const prestationDate = booking.start.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lineItems = [
    {
      id: 'service',
      description: `${prestationDescription}\nDate : ${prestationDate}`,
      quantity: 1,
      unitPrice: roundCurrency(Math.abs(total)),
      total: roundCurrency(Math.abs(total)),
      taxRate: taxRate || undefined,
      taxAmount: taxRate ? Math.abs(taxAmount) : undefined,
    },
  ];

  const servicePeriod = {
    start: booking.start,
    end: booking.end,
  };

  // Date d'émission et d'échéance
  const issueDate = status === 'ISSUED' || status === 'PAID' ? now : undefined;
  const dueDate = documentType === 'INVOICE'
    ? new Date(now.getTime() + DEFAULT_PAYMENT_TERMS.dueInDays * 24 * 60 * 60 * 1000)
    : undefined;

  // Conditions de paiement
  const paymentTerms = documentType === 'INVOICE' ? {
    dueDate,
    paymentMethod: paymentMethod || 'Virement bancaire',
    penaltyRate: DEFAULT_PAYMENT_TERMS.penaltyRate,
    penaltyDescription: LEGAL_TEXTS.latePenalty,
  } : undefined;

  // Notes avec mentions légales
  const legalNotes = isVatExempt
    ? `${LEGAL_TEXTS.vatExempt}\n\n${notes || ''}`
    : notes;

  const payload: InvoiceWritePayload = {
    number,
    documentType,
    status,
    bookingId: booking.id,
    clientId: client?.id,
    vendorSnapshot,
    clientSnapshot,
    lineItems,
    totals: {
      currency: 'EUR',
      subtotal: roundCurrency(Math.abs(subtotal)),
      taxRate: taxRate || undefined,
      taxAmount: Math.abs(taxAmount),
      total: roundCurrency(Math.abs(total)),
      depositApplied: roundCurrency(depositApplied),
      balanceDue,
    },
    currency: 'EUR',
    servicePeriod,
    issueDate,
    dueDate,
    paymentTerms,
    paymentMethod: paymentMethod || 'Virement bancaire',
    notes: legalNotes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    source: 'booking',
    creditedInvoiceId,
  };

  if (issuedBy) {
    payload.issuedBy = issuedBy;
  }

  return pruneUndefinedDeep(payload);
}
