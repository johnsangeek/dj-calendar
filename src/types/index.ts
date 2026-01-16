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

// Invoice
export interface Invoice {
  id: string;
  invoiceNumber: string;
  type?: 'devis' | 'facture';
  bookingId?: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientSiret?: string;
  issueDate: Date;
  dueDate?: Date;
  amount?: number;
  amountGross: number;
  taxRate: number;
  amountTax: number;
  amountNet: number;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt?: Date;
  notes?: string;
  filename?: string;
  createdAt: Date;
  updatedAt: Date;
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
  email?: string;
  phone?: string;
  iban?: string;
  taxRate: number;
  basePrice?: number;
  logoUrl?: string; // URL du logo
}
