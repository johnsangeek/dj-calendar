import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { adminDb } from '@/lib/firebase-admin';
import { generateInvoiceHtml } from '@/lib/invoice-template';
import type { InvoiceWritePayload } from '@/lib/invoices';
import type { Booking, Client, DJInfo } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BOT_API_SECRET = process.env.BOT_API_SECRET;

function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefinedDeep(item)) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, pruneUndefinedDeep(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

function toDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

async function generateInvoiceNumberAdmin(documentType: string): Promise<string> {
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

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-bot-secret');
    if (!BOT_API_SECRET || authHeader !== BOT_API_SECRET) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId requis' }, { status: 400 });
    }

    const bookingSnap = await adminDb.collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: 'Booking introuvable' }, { status: 404 });
    }
    const bookingData = bookingSnap.data()!;
    const booking: Booking = {
      id: bookingSnap.id,
      title: bookingData.title,
      clientId: bookingData.clientId,
      clientName: bookingData.clientName,
      displayName: bookingData.displayName,
      start: toDate(bookingData.start)!,
      end: toDate(bookingData.end)!,
      location: bookingData.location,
      notes: bookingData.notes,
      price: bookingData.price || 0,
      deposit: bookingData.deposit || 0,
      status: bookingData.status,
    } as Booking;

    if (!booking.price || booking.price <= 0) {
      return NextResponse.json({ error: 'Prix non défini sur cette prestation' }, { status: 400 });
    }

    let client: Client | null = null;
    if (booking.clientId) {
      const clientSnap = await adminDb.collection('clients').doc(booking.clientId).get();
      if (clientSnap.exists) client = { id: clientSnap.id, ...clientSnap.data() } as Client;
    }

    const vendorSnap = await adminDb.collection('settings').doc('dj_info').get();
    const vendor = (vendorSnap.exists ? vendorSnap.data() : {}) as DJInfo;

    const number = await generateInvoiceNumberAdmin('INVOICE');

    const taxRate = vendor?.taxRate ?? 0;
    const isVatExempt = taxRate === 0;
    const total = booking.price;
    const subtotal = taxRate > 0 ? Number((total / (1 + taxRate / 100)).toFixed(2)) : Number(total.toFixed(2));
    const taxAmount = Number((total - subtotal).toFixed(2));
    const now = new Date();
    const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const prestationDescription = booking.title + (booking.location ? ` – ${booking.location}` : '');
    const prestationDate = booking.start.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const payload: InvoiceWritePayload = {
      number,
      documentType: 'INVOICE',
      status: 'PENDING_PAYMENT',
      bookingId: booking.id,
      clientId: client?.id,
      vendorSnapshot: {
        displayName: vendor?.commercialName || vendor?.stageName || vendor?.name || 'DJ',
        contactName: vendor?.name,
        email: vendor?.email,
        phone: vendor?.phone,
        address: vendor?.address,
        siret: vendor?.siret,
        iban: vendor?.iban,
        stageName: vendor?.stageName,
        taxRate,
        legalStatus: 'Auto-entrepreneur',
      },
      clientSnapshot: client
        ? {
            displayName: client.professionalName || client.name,
            contactName: client.name,
            email: client.email || client.primaryEmail,
            phone: client.phone,
            address: client.address,
            siret: client.siret,
          }
        : { displayName: booking.clientName },
      lineItems: [{
        id: 'service',
        description: `${prestationDescription}\nDate : ${prestationDate}`,
        quantity: 1,
        unitPrice: Number(Math.abs(total).toFixed(2)),
        total: Number(Math.abs(total).toFixed(2)),
        taxRate: taxRate || undefined,
        taxAmount: taxRate ? Math.abs(taxAmount) : undefined,
      }],
      totals: {
        currency: 'EUR',
        subtotal: Number(Math.abs(subtotal).toFixed(2)),
        taxRate: taxRate || undefined,
        taxAmount: Math.abs(taxAmount),
        total: Number(Math.abs(total).toFixed(2)),
        depositApplied: 0,
        balanceDue: Number(Math.abs(total).toFixed(2)),
      },
      currency: 'EUR',
      servicePeriod: { start: booking.start, end: booking.end },
      issueDate: now,
      dueDate,
      paymentTerms: {
        dueDate,
        paymentMethod: 'Virement bancaire',
        penaltyRate: 11.62,
        penaltyDescription: 'En cas de retard de paiement, des pénalités seront appliquées au taux légal en vigueur (taux BCE + 10 points).',
      },
      paymentMethod: 'Virement bancaire',
      notes: isVatExempt ? 'TVA non applicable – article 293B du CGI' : undefined,
      createdAt: now,
      updatedAt: now,
      source: 'bot',
    } as unknown as InvoiceWritePayload;

    const html = generateInvoiceHtml(payload, { invoiceId: 'preview' });

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    await browser.close();

    // Only persist the invoice once PDF generation has succeeded, to avoid orphan drafts.
    const invoiceRef = await adminDb.collection('invoices').add(pruneUndefinedDeep(payload) as any);

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Facture ${number}.pdf"`,
        'X-Invoice-Number': number,
        'X-Invoice-Id': invoiceRef.id,
      },
    });
  } catch (error) {
    console.error('Erreur génération facture bot:', error);
    return NextResponse.json({ error: 'Erreur lors de la génération de la facture', details: String(error) }, { status: 500 });
  }
}
