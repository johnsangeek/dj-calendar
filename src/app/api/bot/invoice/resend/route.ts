import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { adminDb } from '@/lib/firebase-admin';
import { generateInvoiceHtml } from '@/lib/invoice-template';
import type { InvoiceWritePayload } from '@/lib/invoices';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BOT_API_SECRET = process.env.BOT_API_SECRET;

function toDate(value: any): any {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return value;
}

// Firestore Admin returns Timestamp instances for stored dates, but the invoice template
// expects native Date objects (it calls .toLocaleDateString() directly).
function reviveDates(payload: any): any {
  return {
    ...payload,
    issueDate: toDate(payload.issueDate),
    dueDate: toDate(payload.dueDate),
    createdAt: toDate(payload.createdAt),
    updatedAt: toDate(payload.updatedAt),
    servicePeriod: payload.servicePeriod
      ? { start: toDate(payload.servicePeriod.start), end: toDate(payload.servicePeriod.end) }
      : payload.servicePeriod,
    paymentTerms: payload.paymentTerms
      ? { ...payload.paymentTerms, dueDate: toDate(payload.paymentTerms.dueDate) }
      : payload.paymentTerms,
  };
}

// Re-renders the PDF of an already-issued invoice from its stored data, without creating
// a new invoice document or a new number — used to resend/re-attach an existing invoice
// (e.g. for a payment reminder), never to correct or replace it.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-bot-secret');
    if (!BOT_API_SECRET || authHeader !== BOT_API_SECRET) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { invoiceId, number } = await request.json();
    if (!invoiceId && !number) {
      return NextResponse.json({ error: 'invoiceId ou number requis' }, { status: 400 });
    }

    let invoiceDoc;
    if (invoiceId) {
      invoiceDoc = await adminDb.collection('invoices').doc(invoiceId).get();
    } else {
      const snap = await adminDb.collection('invoices').where('number', '==', number).limit(1).get();
      invoiceDoc = snap.docs[0];
    }

    if (!invoiceDoc || !invoiceDoc.exists) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
    }

    const payload = reviveDates(invoiceDoc.data()) as InvoiceWritePayload;
    const html = generateInvoiceHtml(payload, { invoiceId: invoiceDoc.id });

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    await browser.close();

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Facture ${payload.number}.pdf"`,
        'X-Invoice-Number': payload.number,
        'X-Invoice-Id': invoiceDoc.id,
      },
    });
  } catch (error) {
    console.error('Erreur renvoi facture bot:', error);
    return NextResponse.json({ error: 'Erreur lors de la régénération du PDF', details: String(error) }, { status: 500 });
  }
}
