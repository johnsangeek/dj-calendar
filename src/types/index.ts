import type { ClientStats, ClientSegmentation } from '@/lib/client-segmentation';
export type { ClientStats, ClientSegmentation } from '@/lib/client-segmentation';

// Client
export interface Client {
  id: string;
  name: string;
  professionalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  siret?: string;
  notes?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  stats?: ClientStats;
  segmentation?: ClientSegmentation;
}

// Booking
export interface Booking {
  id: string;
  title: string;
  clientId?: string;
  clientName: string;
  displayName?: string;
  start: Date;
  end: Date;
  location?: string;
  notes?: string;
  price: number;
  deposit: number;
  status: 'option' | 'confirmé' | 'annulé' | 'terminé' | 'remplaçant';
  sync?: {
    provider: 'google';
    calendarId: string;
    googleEventId?: string;
    etag?: string;
    lastSyncedAt?: Date;
    lastSyncedBy?: 'app' | 'google';
    syncState?: 'linked' | 'pending' | 'error';
  };
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: 'app' | 'google';
}

export interface Prestation {
  id: string;
  clientId: string;
  clientName: string;
  date: Date;
  amount: number;
  source?: 'csv' | 'manual' | 'import';
  invoiceNumber?: string;
  reference?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceDocumentType = 'INVOICE' | 'QUOTE' | 'CREDIT_NOTE';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED' | 'CREDITED';

export interface InvoicePartySnapshot {
  displayName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  siret?: string;
  vatNumber?: string;
  iban?: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate?: number;
  taxAmount?: number;
}

export interface InvoiceTotals {
  currency: 'EUR';
  subtotal: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  depositApplied: number;
  balanceDue: number;
}

export interface InvoicePaymentTerms {
  dueDate?: Date;
  paymentMethod?: string;
  penaltyRate?: number;
  penaltyDescription?: string;
}

export interface Invoice {
  id: string;
  number?: string;
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  bookingId?: string;
  clientId?: string;
  vendorSnapshot: InvoicePartySnapshot & { stageName?: string; taxRate?: number };
  clientSnapshot: InvoicePartySnapshot;
  lineItems: InvoiceLineItem[];
  totals: InvoiceTotals;
  currency: 'EUR';
  servicePeriod?: { start: Date; end: Date };
  issueDate?: Date;
  dueDate?: Date;
  paymentTerms?: InvoicePaymentTerms;
  paymentMethod?: string;
  issuedBy?: string;
  paidAt?: Date;
  cancelledAt?: Date;
  creditedInvoiceId?: string;
  notes?: string;
  hash?: string;
  pdfStoragePath?: string;
  createdAt: Date;
  updatedAt: Date;
  source?: 'manual' | 'booking';
  legacyInvoiceNumber?: string;
}

// Message Template
export interface MessageTemplate {
  id: string;
  name: string;
  type: 'refus' | 'dispo' | 'confirmation';
  style?: 'friendly' | 'club' | 'amical' | 'polis';
  content: string;
  variables?: string[];
}

// DJ Info (settings)
export interface DJInfo {
  name: string; // Nom/Prénom civil
  stageName?: string; // Nom de scène (DJ name)
  commercialName?: string;
  address?: string;
  siret?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  iban?: string;
  taxRate: number;
  basePrice?: number;
  logoUrl?: string; // URL du logo
}
