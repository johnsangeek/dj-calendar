import type { ClientStats, ClientSegmentation } from '@/lib/client-segmentation';
import type { EmailTemplate, EmailThreadSummary, EmailMessage, EmailAddress, DraftMessage } from './email';
export type { ClientStats, ClientSegmentation } from '@/lib/client-segmentation';
export type { EmailTemplate, EmailThreadSummary, EmailMessage, EmailAddress, DraftMessage } from './email';

// Instagram CRM Status
export type InstagramStatus =
  | 'NOT_CONTACTED'
  | 'DM_SENT'
  | 'REPLIED'
  | 'NO_REPLY'
  | 'ON_HOLD' // À réfléchir / En pause
  | 'IGNORED' // Quand on ne répond pas
  | 'BOOKED'
  | 'NOT_INTERESTED';

// Instagram Contact (pour un établissement : Booker, DA, DJ, Enseigne, Patron)
export interface InstagramContact {
  id: string;
  role: 'BOOKER' | 'DA' | 'DJ' | 'ENSEIGNE' | 'PATRON' | 'AUTRE'; // Directeur Artistique
  name?: string; // Nom du contact (ex: "Thomas - Booker")
  handle?: string; // @username
  url?: string; // URL profil
  threadId?: string; // ID numérique du thread Instagram
  status?: InstagramStatus;
  lastContactAt?: Date;
  nextRelanceAt?: Date;
  notes?: string;
  profileImageUrl?: string; // Photo de profil
}

// Client
export interface Client {
  id: string;
  name: string;
  professionalName?: string;
  email?: string; // Legacy primary email
  primaryEmail?: string;
  altEmails?: string[];
  normalizedEmails?: string[];
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  siret?: string;
  notes?: string;
  color?: string;
  profileImageUrl?: string; // Photo de profil du client (logo)
  eventAliases?: string[]; // Aliases d'events/lieux (ex: "PAUC AIX")
  // Instagram CRM fields - LEGACY (à migrer vers instagramContacts)
  instagramHandle?: string; // @username
  instagramUrl?: string; // Full URL
  instagramThreadId?: string; // ID numérique du thread Instagram (ex: 110841490316401)
  igStatus?: InstagramStatus;
  lastIgAt?: Date; // Dernière action Instagram
  nextIgRelanceAt?: Date; // Date de prochaine relance
  igNotes?: string; // Notes spécifiques Instagram
  // Nouveaux champs multi-contacts
  instagramContacts?: InstagramContact[]; // Liste des contacts Instagram
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
  invoicedExternally?: boolean;
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
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'CREDITED' | 'CONVERTED';

export interface InvoicePartySnapshot {
  displayName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
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
  serviceId?: string;
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
  bookingIds?: string[];
  clientId?: string;
  vendorSnapshot: InvoicePartySnapshot & { stageName?: string; taxRate?: number; logoUrl?: string; codeAPE?: string; legalStatus?: string };
  clientSnapshot: InvoicePartySnapshot;
  lineItems: InvoiceLineItem[];
  totals: InvoiceTotals;
  currency: 'EUR';
  servicePeriod?: { start: Date; end: Date };
  servicePeriods?: { start: Date; end: Date; label?: string }[];
  issueDate?: Date;
  dueDate?: Date;
  paymentTerms?: InvoicePaymentTerms;
  paymentMethod?: string;
  issuedBy?: string;
  paidAt?: Date;
  cancelledAt?: Date;
  creditedInvoiceId?: string;
  convertedToInvoiceId?: string;
  convertedFromQuoteId?: string;
  notes?: string;
  hash?: string;
  pdfStoragePath?: string;
  createdAt: Date;
  updatedAt: Date;
  source?: 'manual' | 'booking';
  legacyInvoiceNumber?: string;
}

// Message Template (legacy - pour refus/dispo)
export interface MessageTemplate {
  id: string;
  name: string;
  type: 'refus' | 'dispo' | 'confirmation';
  style?: 'friendly' | 'club' | 'amical' | 'polis';
  content: string;
  variables?: string[];
}

// Instagram Message Template (CRM)
export type InstagramTemplateType =
  | 'PREMIER_CONTACT'
  | 'RELANCE_J7'
  | 'RELANCE_J14'
  | 'REPONSE_FAVORABLE'
  | 'OPTION_BLOQUEE'
  | 'CUSTOM';

export interface InstagramMessageTemplate {
  id: string;
  name: string;
  type: InstagramTemplateType;
  content: string;
  // Variables supportées : {{prenom}}, {{etablissement}}, {{ville}}, {{date1}}, {{date2}}, {{date3}}
  variables: string[]; // Liste des variables trouvées dans content
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// CRM Log Action
export type CrmAction = 'DM_SENT' | 'REPLIED' | 'BOOKED' | 'NOTE' | 'STATUS_CHANGE';
export type CrmChannel = 'instagram' | 'whatsapp' | 'email' | 'phone';

export interface CrmLog {
  id: string;
  clientId: string;
  clientName: string; // Snapshot pour affichage rapide
  channel: CrmChannel;
  action: CrmAction;
  at: Date;
  messagePreview?: string; // Extrait du message envoyé (100 premiers chars)
  templateUsed?: string; // ID du template utilisé si applicable
  notes?: string;
  oldStatus?: InstagramStatus;
  newStatus?: InstagramStatus;
  createdAt: Date;
}

// DJ Info (settings)
export interface DJInfo {
  name: string; // Nom/Prénom civil
  stageName?: string; // Nom de scène (DJ name)
  commercialName?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  codeAPE?: string; // Code APE/NAF (ex: 9329Z)
  siret?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  iban?: string;
  taxRate: number;
  urssafRate?: number; // Taux URSSAF auto-entrepreneur (22.2% BIC / 25.6% BNC)
  basePrice?: number;
  logoUrl?: string; // URL du logo
  pdfExportDir?: string; // Dossier d'export des PDFs
}

// Catalogue de prestations/services
export type ServiceUnit = 'prestation' | 'heure' | 'jour' | 'forfait' | 'pack';

export interface CatalogService {
  id: string;
  name: string;
  description?: string;
  unit: ServiceUnit;
  defaultQty: number;
  unitPrice: number; // Prix TTC (ou HT si TVA applicable)
  vatRate: number; // 0 si micro-entrepreneur
  tags: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Ligne de pack (référence un service avec quantité)
export interface PackageLine {
  serviceId: string;
  serviceName: string; // Snapshot pour affichage rapide
  qty: number;
  overridePrice?: number; // Prix spécial si différent du catalogue
}

// Pack = composition de plusieurs services
export interface ServicePackage {
  id: string;
  name: string;
  description?: string;
  lines: PackageLine[];
  tags: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Ligne de facture étendue (compatible avec l'existant)
export interface InvoiceLineItemExtended extends InvoiceLineItem {
  unit?: ServiceUnit;
  serviceId?: string; // Référence au catalogue (optionnel)
  discount?: number; // Remise en %
  discountAmount?: number; // Remise en €
}
