import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { adminDb } from '@/lib/firebase-admin';
import { generateInvoiceHtml } from '@/lib/invoice-template';
import { gmailService } from '@/lib/gmail';
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
    servicePeriods: Array.isArray(payload.servicePeriods)
      ? payload.servicePeriods.map((sp: any) => ({ ...sp, start: toDate(sp.start), end: toDate(sp.end) }))
      : payload.servicePeriods,
    paymentTerms: payload.paymentTerms
      ? { ...payload.paymentTerms, dueDate: toDate(payload.paymentTerms.dueDate) }
      : payload.paymentTerms,
  };
}

function buildEmailHtml(clientContactName: string, djDisplayName: string, gigDateLabel: string) {
  return `
    <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; line-height: 1.6;">
      <p>Salut${clientContactName ? ` ${clientContactName}` : ''},</p>
      <p>Voici la facture de ce${gigDateLabel ? ` ${gigDateLabel}` : ''} !</p>
      <p>À bientôt !</p>
      <p>${djDisplayName}</p>
    </div>
  `;
}

// Generates the PDF for an existing invoice and emails it to the client via Gmail, with a
// polite ready-made message. Triggered from the Telegram bot after the DJ confirms.
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
    let clientEmail = payload.clientSnapshot?.email;
    if (!clientEmail && payload.clientId) {
      // The snapshot is frozen at invoice creation time — fall back to the live client record
      // in case the email was added to the fiche afterwards.
      const clientDoc = await adminDb.collection('clients').doc(payload.clientId).get();
      clientEmail = clientDoc.data()?.email || clientDoc.data()?.primaryEmail;
    }
    if (!clientEmail) {
      return NextResponse.json({ error: "Ce client n'a pas d'adresse email enregistrée" }, { status: 400 });
    }

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

    const djDisplayName = payload.vendorSnapshot?.stageName || payload.vendorSnapshot?.displayName || 'DJ';
    const gigDate: Date | undefined = payload.servicePeriod?.start;
    const gigDateLabel = gigDate ? gigDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const emailHtml = buildEmailHtml(payload.clientSnapshot?.contactName || '', djDisplayName, gigDateLabel);

    const sent = await gmailService.sendMessageWithAttachment({
      to: [clientEmail],
      subject: `Facture ${payload.number} — ${djDisplayName}`,
      body: { html: emailHtml },
      attachment: {
        filename: `Facture ${payload.number}.pdf`,
        mimeType: 'application/pdf',
        data: Buffer.from(pdfBuffer).toString('base64'),
      },
    });

    await invoiceDoc.ref.update({ emailSentAt: new Date(), emailSentTo: clientEmail });

    return NextResponse.json({ success: true, messageId: sent.id, sentTo: clientEmail });
  } catch (error) {
    console.error('Erreur envoi email facture bot:', error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'email", details: String(error) }, { status: 500 });
  }
}
