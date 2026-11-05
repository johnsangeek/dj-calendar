import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { adminDb } from '@/lib/firebase-admin';
import { generateInvoiceHtml } from '@/lib/invoice-template';
import { gmailService } from '@/lib/gmail';
import type { InvoiceWritePayload } from '@/lib/invoices';

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

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Message écrit à la main (ou propre au client) : chaque ligne vide sépare un paragraphe.
function buildCustomEmailHtml(message: string) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => '<p>' + escapeHtml(p.trim()).replace(/\n/g, '<br>') + '</p>')
    .join('');
  return '<div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; line-height: 1.6;">' + paragraphs + '</div>';
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

/**
 * Generates the PDF for an existing invoice and emails it to the client via the single Gmail
 * account connected in Settings (gmailService, OAuth token in Firestore). Shared by the
 * Telegram-bot route and the web UI's "Mail" button so both always send from the same,
 * correctly-authenticated account — never a browser's currently-logged-in Gmail tab, which is
 * what the old mail.google.com/u/1/ compose-link trick depended on and silently broke on.
 */
export async function sendInvoiceEmail({ invoiceId, number, message }: { invoiceId?: string; number?: string; message?: string }) {
  if (!invoiceId && !number) {
    throw new Error('invoiceId ou number requis');
  }

  let invoiceDoc;
  if (invoiceId) {
    invoiceDoc = await adminDb.collection('invoices').doc(invoiceId).get();
  } else {
    const snap = await adminDb.collection('invoices').where('number', '==', number).limit(1).get();
    invoiceDoc = snap.docs[0];
  }

  if (!invoiceDoc || !invoiceDoc.exists) {
    throw new Error('Facture introuvable');
  }

  const payload = reviveDates(invoiceDoc.data()) as InvoiceWritePayload;
  let clientEmail = payload.clientSnapshot?.email;
  let contactFirstName = '';
  if (payload.clientId) {
    // The snapshot is frozen at invoice creation time — read the live client record for an email
    // added afterwards and for the contact's first name (so the mail greets a person, not a company).
    const clientDoc = await adminDb.collection('clients').doc(payload.clientId).get();
    const client = clientDoc.data();
    clientEmail = clientEmail || client?.email || client?.primaryEmail;
    contactFirstName = client?.contactFirstName || '';
  }
  if (!clientEmail) {
    throw new Error("Ce client n'a pas d'adresse email enregistrée");
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
  // The snapshot's contactName is often the company name ("ISTRES PROVENCE HANDBALL"): never greet that.
  const snapshotContact = payload.clientSnapshot?.contactName;
  const greetingName = contactFirstName || (snapshotContact && snapshotContact !== payload.clientSnapshot?.displayName ? snapshotContact : '');
  const emailHtml = message?.trim() ? buildCustomEmailHtml(message) : buildEmailHtml(greetingName, djDisplayName, gigDateLabel);

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

  return { messageId: sent.id, sentTo: clientEmail };
}
