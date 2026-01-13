// Client
export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  siret?: string;
  notes?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Booking
export interface Booking {
  id: string;
  title: string;
  clientId?: string;
  clientName: string;
  start: Date;
  end: Date;
  location?: string;
  notes?: string;
  price: number;
  deposit: number;
  status: 'option' | 'confirmé' | 'annulé' | 'terminé';
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
  updatedBy: 'app' | 'google';
}

// Invoice
export interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId?: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientSiret?: string;
  issueDate: Date;
  dueDate?: Date;
  amountGross: number;
  taxRate: number;
  amountTax: number;
  amountNet: number;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt?: Date;
  notes?: string;
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
  name: string;
  commercialName?: string;
  address?: string;
  siret?: string;
  email?: string;
  phone?: string;
  iban?: string;
  taxRate: number;
  basePrice?: number;
}
