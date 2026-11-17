import { FieldValue } from 'firebase-admin/firestore';
import { gmailService } from '@/lib/gmail';
import { buildCustomEmailHtml, sendInvoiceEmail } from '@/lib/send-invoice-email';

// Actions que Mélanie peut demander. Chacune passe par deux étapes côté serveur :
//   1. prepare() vérifie la demande et décrit en clair ce qui sera fait (rien n'est exécuté) ;
//   2. run() n'est appelée qu'après confirmation d'une proposition précise, une seule fois.
// Pour ajouter une action : l'ajouter à ACTIONS, rien d'autre à brancher.

export type Prepared =
  | { ok: true; params: Record<string, unknown>; summary: string; label: string }
  | { ok: false; detail: string };

interface ActionDef {
  prepare(params: Record<string, unknown>): Promise<Prepared>;
  run(params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const fail = (detail: string): Prepared => ({ ok: false, detail });
const EMAIL = /^[^\s@<>,;"'\\]+@[^\s@<>,;"'\\]+\.[^\s@<>,;"'\\]+$/;
const INVOICE_NUMBER = /^F\d{4}-\d{4}$/;

async function findInvoice(numero: unknown) {
  if (typeof numero !== 'string' || !INVOICE_NUMBER.test(numero)) return null;
  const { adminDb } = await import('@/lib/firebase-admin');
  const snap = await adminDb.collection('invoices').where('number', '==', numero).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || doc.data().documentType !== 'INVOICE') return null;
  return { ref: doc.ref, data: doc.data() };
}

const describeInvoice = (data: any) =>
  `${data.number} (${data.clientSnapshot?.displayName ?? 'client inconnu'}, ${data.totals?.total ?? '?'} €)`;

const markInvoicePaid: ActionDef = {
  async prepare(params) {
    const invoice = await findInvoice(params.numero);
    if (!invoice) return fail('numero doit être le numéro d\'une facture existante (ex. F2026-0070)');
    const { status } = invoice.data;
    if (status === 'PAID') return fail(`la facture ${invoice.data.number} est déjà payée`);
    if (status !== 'PENDING_PAYMENT' && status !== 'ISSUED') return fail(`la facture ${invoice.data.number} ne peut pas être marquée payée (statut ${status})`);
    return {
      ok: true,
      params: { numero: invoice.data.number },
      summary: `Marquer la facture ${describeInvoice(invoice.data)} comme PAYÉE.`,
      label: `mark_invoice_paid ${invoice.data.number}`,
    };
  },
  async run(params) {
    const invoice = await findInvoice(params.numero);
    if (!invoice) throw new Error('facture introuvable');
    await invoice.ref.update({ status: 'PAID', paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { numero: params.numero, statut: 'payee' };
  },
};

const sendInvoiceMail: ActionDef = {
  async prepare(params) {
    const invoice = await findInvoice(params.numero);
    if (!invoice) return fail('numero doit être le numéro d\'une facture existante (ex. F2026-0070)');
    const { data } = invoice;
    if (data.status === 'CANCELLED' || data.status === 'CREDITED' || data.status === 'DRAFT') {
      return fail(`la facture ${data.number} ne peut pas être envoyée (statut ${data.status})`);
    }
    let message: string | undefined;
    if (params.message !== undefined) {
      if (typeof params.message !== 'string' || params.message.length > 2000) return fail('message doit être un texte de 2000 caractères maximum');
      message = params.message.trim() || undefined;
    }
    let email: string | undefined = data.clientSnapshot?.email;
    if (!email && data.clientId) {
      const { adminDb } = await import('@/lib/firebase-admin');
      const client = (await adminDb.collection('clients').doc(data.clientId).get()).data();
      email = client?.email || client?.primaryEmail;
    }
    if (!email) return fail(`aucune adresse mail enregistrée pour ${data.clientSnapshot?.displayName ?? 'ce client'}`);
    const alreadySent = data.emailSentAt?.toDate ? ` ATTENTION : cette facture a déjà été envoyée le ${data.emailSentAt.toDate().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.` : '';
    return {
      ok: true,
      params: { numero: data.number, ...(message ? { message } : {}) },
      summary: `Envoyer la facture ${describeInvoice(data)} par mail à ${email}, avec ${message ? `ce message :\n"""\n${message}\n"""` : 'le texte standard du site'}.${alreadySent}`,
      label: `send_invoice_email ${data.number}`,
    };
  },
  async run(params) {
    const { sentTo } = await sendInvoiceEmail({ number: params.numero as string, message: params.message as string | undefined });
    return { numero: params.numero, sentTo };
  },
};

const sendMail: ActionDef = {
  async prepare(params) {
    const { to, subject, body } = params;
    if (typeof to !== 'string' || !EMAIL.test(to.trim())) return fail('to doit être une seule adresse mail valide');
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 150 || /[\r\n]/.test(subject)) return fail('subject est obligatoire, sur une ligne, 150 caractères maximum');
    if (typeof body !== 'string' || !body.trim() || body.length > 5000) return fail('body est obligatoire, 5000 caractères maximum');
    return {
      ok: true,
      params: { to: to.trim(), subject: subject.trim(), body: body.trim() },
      summary: `Envoyer ce mail depuis ton Gmail.\nÀ : ${to.trim()}\nObjet : ${subject.trim()}\n"""\n${body.trim()}\n"""`,
      label: `send_mail à ${to.trim()}`,
    };
  },
  async run(params) {
    const sent = await gmailService.sendMessage({
      to: [params.to as string],
      subject: params.subject as string,
      body: { html: buildCustomEmailHtml(params.body as string) },
    });
    return { to: params.to, messageId: sent.id };
  },
};

export const ACTIONS: Record<string, ActionDef> = {
  mark_invoice_paid: markInvoicePaid,
  send_invoice_email: sendInvoiceMail,
  send_mail: sendMail,
};
