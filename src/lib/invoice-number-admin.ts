import type { InvoiceDocumentType } from '@/types';
import { adminDb } from './firebase-admin';

/**
 * Numéro chronologique côté Admin SDK.
 * Format : F2026-0001 (facture), D2026-0001 (devis), AV2026-0001 (avoir).
 * Même algorithme que la route historique POST /api/bot/invoice.
 */
export async function generateInvoiceNumberAdmin(documentType: InvoiceDocumentType): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = documentType === 'QUOTE' ? 'D' : documentType === 'CREDIT_NOTE' ? 'AV' : 'F';
  const yearPrefix = `${prefix}${year}-`;

  const snap = await adminDb
    .collection('invoices')
    .where('documentType', '==', documentType)
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  let maxNumber = 0;
  snap.docs.forEach((doc) => {
    const num = doc.data().number;
    if (typeof num === 'string' && num.startsWith(yearPrefix)) {
      const numPart = parseInt(num.replace(yearPrefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNumber) maxNumber = numPart;
    }
  });

  return `${yearPrefix}${(maxNumber + 1).toString().padStart(4, '0')}`;
}
