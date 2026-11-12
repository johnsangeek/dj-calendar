import type { InvoiceDocumentType, InvoiceStatus } from '@/types';
import { isPastDue } from './dates';
import { BotApiError } from './errors';

export type PaymentStatus = 'paid' | 'unpaid' | 'overdue' | 'draft' | 'cancelled' | 'credited' | 'not_applicable';

export interface PaymentView {
  status: PaymentStatus;
  label: 'payé' | 'impayé' | 'en retard' | 'brouillon' | 'annulé' | 'crédité' | 'sans objet';
  /** Reste à encaisser. Null pour un devis ou un avoir, qui ne sont pas des créances. */
  remainingAmount: number | null;
  currency: 'EUR';
  dueDate: string | null;
  paidAt: string | null;
}

const LABELS: Record<PaymentStatus, PaymentView['label']> = {
  paid: 'payé',
  unpaid: 'impayé',
  overdue: 'en retard',
  draft: 'brouillon',
  cancelled: 'annulé',
  credited: 'crédité',
  not_applicable: 'sans objet',
};

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PaymentSource {
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  balanceDue: number;
  dueDate?: Date | null;
  paidAt?: Date | null;
  now?: Date;
}

export function paymentView(source: PaymentSource, dueDateIso: string | null, paidAtIso: string | null): PaymentView {
  const base = {
    currency: 'EUR' as const,
    dueDate: dueDateIso,
    paidAt: paidAtIso,
  };

  if (source.documentType !== 'INVOICE') {
    return { ...base, status: 'not_applicable', label: LABELS.not_applicable, remainingAmount: null };
  }

  const remaining = roundCurrency(source.balanceDue);

  if (source.status === 'PAID') {
    return { ...base, status: 'paid', label: LABELS.paid, remainingAmount: 0 };
  }
  if (source.status === 'CANCELLED') {
    return { ...base, status: 'cancelled', label: LABELS.cancelled, remainingAmount: 0 };
  }
  if (source.status === 'CREDITED') {
    return { ...base, status: 'credited', label: LABELS.credited, remainingAmount: 0 };
  }
  if (source.status === 'DRAFT') {
    return { ...base, status: 'draft', label: LABELS.draft, remainingAmount: remaining };
  }

  const overdue = Boolean(source.dueDate && isPastDue(source.dueDate, source.now));
  const status: PaymentStatus = overdue ? 'overdue' : 'unpaid';
  return { ...base, status, label: LABELS[status], remainingAmount: remaining };
}

export function matchesPaymentFilter(
  status: PaymentStatus,
  filter: 'paid' | 'unpaid' | 'overdue' | 'open',
): boolean {
  if (filter === 'open') return status === 'unpaid' || status === 'overdue';
  return status === filter;
}

/**
 * L'application n'a pas de ledger de paiements : un règlement enregistre
 * status=PAID et paidAt, pour le montant total restant.
 */
export function assertSettlementAmount(amount: number | undefined, remaining: number): void {
  if (amount === undefined) return;
  const expected = roundCurrency(remaining);
  const received = roundCurrency(amount);
  if (Math.abs(expected - received) > 0.001) {
    throw new BotApiError('Paiement partiel non pris en charge', 400, {
      remainingAmount: expected,
      receivedAmount: received,
      hint: "L'application n'enregistre qu'un règlement intégral (statut PAID et paidAt). Omettez amount, ou envoyez exactement le reste dû.",
    });
  }
}
