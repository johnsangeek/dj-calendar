import type { Invoice } from '@/types';

/**
 * Règles pures de facturation, partagées par l'interface et l'API bot.
 * Aucune dépendance Firebase : le module client (`invoices.ts`) les réexporte.
 */
export type InvoiceWritePayload = Omit<Invoice, 'id'>;

/**
 * Génère un hash simple pour l'intégrité du document
 */
export function generateInvoiceHash(payload: InvoiceWritePayload): string {
  const data = JSON.stringify({
    number: payload.number,
    documentType: payload.documentType,
    totals: payload.totals,
    clientSnapshot: payload.clientSnapshot,
    vendorSnapshot: payload.vendorSnapshot,
    issueDate: payload.issueDate,
  });

  // Hash simple (pour production, utiliser crypto.subtle ou bcrypt)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Textes légaux obligatoires pour les factures françaises
 */
export const LEGAL_TEXTS = {
  // TVA non applicable (auto-entrepreneur)
  vatExempt: 'TVA non applicable – article 293B du CGI',

  // Pénalités de retard
  latePenalty: 'En cas de retard de paiement, des pénalités seront appliquées au taux légal en vigueur (taux BCE + 10 points).',

  // Indemnité forfaitaire (clients pro)
  recoveryFee: 'Indemnité forfaitaire pour frais de recouvrement : 40 €',

  // Escompte
  earlyPaymentDiscount: 'Pas d\'escompte pour paiement anticipé.',

  // Archivage
  archiving: 'Facture archivée conformément aux obligations légales françaises (10 ans).',

  // Footer conforme
  footer: 'Ce document est généré conformément à la législation française en matière de facturation.',
};

/**
 * Conditions de paiement par défaut
 */
export const DEFAULT_PAYMENT_TERMS = {
  dueInDays: 30,
  penaltyRate: 11.62, // Taux légal 2024 + 10 points
  paymentMethods: ['Virement bancaire', 'Chèque', 'Espèces'],
};

/**
 * Vérifie si une facture peut être modifiée
 */
export function canEditInvoice(invoice: Invoice): boolean {
  // PAID/CANCELLED/CREDITED/CONVERTED are settled records — correct those with a credit note
  // instead of rewriting history. A wrong client/amount caught before payment is just a mistake
  // to fix in place, so DRAFT/ISSUED/PENDING_PAYMENT stay editable.
  return invoice.status === 'DRAFT' || invoice.status === 'ISSUED' || invoice.status === 'PENDING_PAYMENT';
}

/**
 * Vérifie si une facture peut être annulée
 */
export function canCancelInvoice(invoice: Invoice): boolean {
  return invoice.status === 'ISSUED' || invoice.status === 'PENDING_PAYMENT';
}

/**
 * Vérifie si une facture peut être payée
 */
export function canMarkAsPaid(invoice: Invoice): boolean {
  return (invoice.status === 'ISSUED' || invoice.status === 'PENDING_PAYMENT') && invoice.documentType === 'INVOICE';
}

/**
 * Vérifie si un avoir peut être créé pour cette facture
 */
export function canCreateCreditNote(invoice: Invoice): boolean {
  return (
    invoice.documentType === 'INVOICE' &&
    (invoice.status === 'ISSUED' || invoice.status === 'PAID') &&
    !invoice.creditedInvoiceId
  );
}

/**
 * Vérifie si un devis peut être converti en facture
 */
export function canConvertQuoteToInvoice(invoice: Invoice): boolean {
  return (
    invoice.documentType === 'QUOTE' &&
    invoice.status === 'ISSUED' &&
    !invoice.convertedToInvoiceId
  );
}
