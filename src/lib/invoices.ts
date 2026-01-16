import { Booking, Client, DJInfo, Invoice, InvoiceDocumentType, InvoiceStatus } from '@/types';

export type InvoiceWritePayload = Omit<Invoice, 'id'>;

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
}: BuildInvoicePayloadOptions): InvoiceWritePayload {
  const now = new Date();
  const taxRate = vendor?.taxRate ?? 0;
  const total = booking.price;
  const subtotal = taxRate > 0 ? roundCurrency(total / (1 + taxRate / 100)) : roundCurrency(total);
  const taxAmount = roundCurrency(total - subtotal);
  const depositApplied = includeDeposit ? Math.min(booking.deposit, total) : 0;
  const balanceDue = roundCurrency(total - depositApplied);

  const vendorSnapshot = pruneUndefined({
    displayName: vendor?.commercialName || vendor?.stageName || vendor?.name || 'DJ Booker Pro',
    contactName: vendor?.name,
    email: vendor?.email,
    phone: vendor?.phone,
    address: vendor?.address,
    siret: vendor?.siret,
    vatNumber: vendor?.vatNumber,
    iban: vendor?.iban,
    stageName: vendor?.stageName,
    taxRate,
  });

  const clientSnapshot = client
    ? pruneUndefined({
        displayName: client.professionalName || client.name,
        contactName: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        siret: client.siret,
      })
    : {
        displayName: booking.clientName,
      };

  const lineItems = [
    {
      id: 'service',
      description: booking.title,
      quantity: 1,
      unitPrice: roundCurrency(total),
      total: roundCurrency(total),
      taxRate: taxRate || undefined,
      taxAmount: taxRate ? taxAmount : undefined,
    },
  ];

  const servicePeriod = {
    start: booking.start,
    end: booking.end,
  };

  const issueDate = status === 'ISSUED' ? now : undefined;
  const dueDate = documentType === 'INVOICE' ? booking.end : undefined;

  const payload: InvoiceWritePayload = {
    documentType,
    status,
    bookingId: booking.id,
    clientId: client?.id,
    vendorSnapshot,
    clientSnapshot,
    lineItems,
    totals: {
      currency: 'EUR',
      subtotal,
      taxRate: taxRate || undefined,
      taxAmount,
      total: roundCurrency(total),
      depositApplied: roundCurrency(depositApplied),
      balanceDue,
    },
    currency: 'EUR',
    servicePeriod,
    issueDate,
    dueDate,
    paymentTerms: documentType === 'INVOICE' && dueDate ? { dueDate } : undefined,
    createdAt: now,
    updatedAt: now,
    source: 'booking',
  };

  if (paymentMethod) {
    payload.paymentMethod = paymentMethod;
  }

  if (notes) {
    payload.notes = notes;
  }

  if (issuedBy) {
    payload.issuedBy = issuedBy;
  }

  return pruneUndefinedDeep(payload);
}
