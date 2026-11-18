import { FieldValue } from 'firebase-admin/firestore';
import { gmailReadService, gmailService } from '@/lib/gmail';
import { buildCustomEmailHtml, sendInvoiceEmail } from '@/lib/send-invoice-email';
import { describeVenues, franchiseOf, namesClose, similarClients, type ClientLite } from '@/lib/client-match';
import { formatParis, parisDay, parseBookingDate } from '@/lib/melanie-api';
import { createClientSchema } from '@/lib/bot/schemas';
import { BotApiError } from '@/lib/bot/errors';

// Actions que Mélanie peut demander. Chacune passe par deux étapes côté serveur :
//   1. prepare() vérifie la demande et décrit en clair ce qui sera fait (rien n'est exécuté) ;
//   2. run() n'est appelée qu'après confirmation d'une proposition précise, une seule fois.
// Pour ajouter une action : l'ajouter à ACTIONS, rien d'autre à brancher.
//
// Les actions qui écrivent un mail ont un paramètre `mode` : "draft" (brouillon dans Gmail, rien n'est
// envoyé, valeur par défaut) ou "send" (envoi réel).

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
const DRAFT_SCOPES = ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'];

type Mode = 'draft' | 'send';

function parseMode(value: unknown): Mode | null {
  if (value === undefined) return 'draft';
  return value === 'draft' || value === 'send' ? value : null;
}

const modeLabel = (mode: Mode) =>
  mode === 'draft' ? 'Créer un BROUILLON dans ton Gmail (rien n\'est envoyé)' : 'ENVOYER maintenant';

/** Un brouillon passe par la 2e connexion Gmail : on vérifie qu'elle est faite avant de proposer. */
async function draftReady(): Promise<string | null> {
  const tokens = await gmailReadService.loadTokens();
  const scopes = (tokens?.scope || '').split(/\s+/);
  if (!tokens || !DRAFT_SCOPES.some((scope) => scopes.includes(scope))) {
    return 'la connexion « Gmail pour Mélanie » n\'est pas faite (Paramètres) : impossible de créer un brouillon. Utilise mode "send" ou connecte-la.';
  }
  return null;
}

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
    const mode = parseMode(params.mode);
    if (!mode) return fail('mode doit être "draft" (brouillon) ou "send" (envoi)');
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
    if (mode === 'draft') {
      const problem = await draftReady();
      if (problem) return fail(problem);
    }
    let email: string | undefined = data.clientSnapshot?.email;
    if (!email && data.clientId) {
      const { adminDb } = await import('@/lib/firebase-admin');
      const client = (await adminDb.collection('clients').doc(data.clientId).get()).data();
      email = client?.email || client?.primaryEmail;
    }
    if (!email) return fail(`aucune adresse mail enregistrée pour ${data.clientSnapshot?.displayName ?? 'ce client'}`);
    const alreadySent = mode === 'send' && data.emailSentAt?.toDate
      ? ` ATTENTION : cette facture a déjà été envoyée le ${data.emailSentAt.toDate().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}.`
      : '';
    return {
      ok: true,
      params: { numero: data.number, mode, ...(message ? { message } : {}) },
      summary: `${modeLabel(mode)} : la facture ${describeInvoice(data)} en PDF à ${email}, avec ${message ? `ce message :\n"""\n${message}\n"""` : 'le texte standard du site'}.${alreadySent}`,
      label: `send_invoice_email ${mode} ${data.number}`,
    };
  },
  async run(params) {
    const result = await sendInvoiceEmail({
      number: params.numero as string,
      message: params.message as string | undefined,
      draft: params.mode === 'draft',
    });
    return { numero: params.numero, mode: params.mode, to: result.sentTo, ...(result.draft ? { draftId: result.messageId } : {}) };
  },
};

const sendMail: ActionDef = {
  async prepare(params) {
    const { to, subject, body } = params;
    const mode = parseMode(params.mode);
    if (!mode) return fail('mode doit être "draft" (brouillon) ou "send" (envoi)');
    if (typeof to !== 'string' || !EMAIL.test(to.trim())) return fail('to doit être une seule adresse mail valide');
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 150 || /[\r\n]/.test(subject)) return fail('subject est obligatoire, sur une ligne, 150 caractères maximum');
    if (typeof body !== 'string' || !body.trim() || body.length > 5000) return fail('body est obligatoire, 5000 caractères maximum');
    if (mode === 'draft') {
      const problem = await draftReady();
      if (problem) return fail(problem);
    }
    return {
      ok: true,
      params: { to: to.trim(), subject: subject.trim(), body: body.trim(), mode },
      summary: `${modeLabel(mode)} :\nÀ : ${to.trim()}\nObjet : ${subject.trim()}\n"""\n${body.trim()}\n"""`,
      label: `send_mail ${mode} à ${to.trim()}`,
    };
  },
  async run(params) {
    const mail = { to: [params.to as string], subject: params.subject as string, body: { html: buildCustomEmailHtml(params.body as string) } };
    if (params.mode === 'draft') {
      const draft = await gmailReadService.createDraftWithAttachment(mail);
      return { mode: 'draft', to: params.to, draftId: draft.id };
    }
    const sent = await gmailService.sendMessage(mail);
    return { mode: 'send', to: params.to, messageId: sent.id };
  },
};

// ---------------------------------------------------------------- clients, prestations, factures

async function loadClientsLite(): Promise<ClientLite[]> {
  const { adminDb } = await import('@/lib/firebase-admin');
  const snap = await adminDb.collection('clients').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClientLite, 'id'>) }));
}

const describeSimilar = (list: { id: string; name: string; reason: string }[]) =>
  list.slice(0, 5).map((c) => `« ${c.name} » (id ${c.id}, ${c.reason})`).join(' ; ');

const createClientAction: ActionDef = {
  async prepare(params) {
    const { distinct, franchiseLieux, franchise: _franchise, ...fields } = params;
    if (distinct !== undefined && typeof distinct !== 'boolean') return fail('distinct doit être true ou false');
    if (franchiseLieux !== undefined && (!Array.isArray(franchiseLieux) || !franchiseLieux.length || franchiseLieux.some((l) => typeof l !== 'string' || !l.trim() || l.length > 80))) {
      return fail('franchiseLieux doit être une liste de noms de lieu (ex. ["Aix"])');
    }
    const parsed = createClientSchema.safeParse(fields);
    if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join('.') || 'params'} : ${i.message}`).join(' ; '));
    const input = parsed.data;

    const clients = await loadClientsLite();
    // Franchise (My Beers…) : une fiche par lieu. On ne crée jamais « My Beers » sans lieu, ni un lieu qui existe déjà.
    const franchise = franchiseOf(input.name, clients);
    let franchiseFields: Record<string, unknown> = {};
    if (franchise) {
      if (franchise.mentioned.length && distinct !== true) {
        return fail(`« ${franchise.brand} » est une franchise et ce lieu a déjà sa fiche : ${describeVenues(franchise.mentioned)}. Utilise cette fiche. Seule exception : une autre société sur le même lieu, à confirmer avec l'utilisateur ("distinct": true).`);
      }
      if (!franchise.mentioned.length && distinct !== true) {
        return fail(`« ${franchise.brand} » est une franchise (une fiche par lieu). Lieux déjà enregistrés : ${describeVenues(franchise.venues)}. Quel lieu ? Si c'est un NOUVEAU lieu, confirme-le avec l'utilisateur puis redemande avec "distinct": true et "franchiseLieux": ["nom du lieu"].`);
      }
      if (!franchiseLieux) return fail(`pour une fiche de la franchise « ${franchise.brand} », indique le lieu : "franchiseLieux": ["nom du lieu"]`);
      franchiseFields = { franchise: franchise.brand, franchiseLieux: (franchiseLieux as string[]).map((l) => l.trim()) };
    }

    const similar = similarClients(input.name, clients, { email: input.email ?? input.primaryEmail, siret: input.siret });
    if (similar.length && distinct !== true) {
      return fail(
        `un client ressemble déjà à « ${input.name} » : ${describeSimilar(similar)}. Utilise la fiche existante (son id). ` +
        'Si l\'utilisateur confirme que c\'est bien un AUTRE client, redemande avec "distinct": true.',
      );
    }
    const lines = [
      `Nom : ${input.name}`,
      input.professionalName && `Raison sociale : ${input.professionalName}`,
      input.email && `Mail : ${input.email}`,
      input.phone && `Téléphone : ${input.phone}`,
      [input.address, input.postalCode, input.city].filter(Boolean).join(' ') && `Adresse : ${[input.address, input.postalCode, input.city].filter(Boolean).join(' ')}`,
      input.siret && `SIRET : ${input.siret}`,
      input.defaultRate != null && `Tarif habituel : ${input.defaultRate} €`,
    ].filter(Boolean);
    return {
      ok: true,
      params: { ...fields, ...franchiseFields, ...(distinct === true ? { distinct: true } : {}) },
      summary: `CRÉER un nouveau client.\n${franchise ? `Franchise « ${franchise.brand} » : nouveau lieu ${(franchiseFields.franchiseLieux as string[]).join(' / ')}\n` : ''}${lines.join('\n')}${similar.length ? `\nAttention : ressemble à ${describeSimilar(similar)} (confirmé comme autre client).` : '\nAucun client existant ne lui ressemble.'}`,
      label: `create_client ${input.name}`,
    };
  },
  async run(params) {
    const { distinct: _distinct, franchiseLieux, franchise: _franchise, ...fields } = params;
    const { createClient } = await import('@/lib/bot/clients');
    const parsed = createClientSchema.parse(fields);
    const client = await createClient(parsed);
    if (typeof params.franchise === 'string') {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb.collection('clients').doc(client.id).update({ franchise: params.franchise, franchiseLieux });
    }
    return { clientId: client.id, nom: client.name };
  },
};

const BOOKING_STATUSES = ['confirmé', 'option'];

const createBookingAction: ActionDef = {
  async prepare(params) {
    const { title, clientId, clientName, price, deposit, location, notes, status, distinct } = params;
    if (distinct !== undefined && typeof distinct !== 'boolean') return fail('distinct doit être true ou false');
    if (typeof title !== 'string' || !title.trim() || title.length > 150) return fail('title est obligatoire (150 caractères maximum)');
    const start = parseBookingDate(params.start);
    if (!start) return fail('start est obligatoire : "AAAA-MM-JJTHH:MM" (heure de Paris) ou une date ISO avec fuseau');
    const end = params.end === undefined ? new Date(start.getTime() + 4 * 3600_000) : parseBookingDate(params.end);
    if (!end) return fail('end doit être "AAAA-MM-JJTHH:MM" (heure de Paris) ou une date ISO avec fuseau');
    if (end <= start || end.getTime() - start.getTime() > 24 * 3600_000) return fail('end doit être après start, au plus 24 h plus tard');
    const dayMs = 24 * 3600_000;
    if (start.getTime() < Date.now() - 400 * dayMs || start.getTime() > Date.now() + 800 * dayMs) return fail('start semble faux (hors de 400 jours passés / 800 jours à venir)');
    const amount = price === undefined ? 0 : price;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100_000) return fail('price doit être un nombre entre 0 et 100000');
    const advance = deposit === undefined ? 0 : deposit;
    if (typeof advance !== 'number' || !Number.isFinite(advance) || advance < 0 || advance > amount) return fail('deposit doit être un nombre entre 0 et le prix');
    if (location !== undefined && (typeof location !== 'string' || location.length > 200)) return fail('location : texte de 200 caractères maximum');
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) return fail('notes : texte de 2000 caractères maximum');
    const state = status === undefined ? 'confirmé' : status;
    if (typeof state !== 'string' || !BOOKING_STATUSES.includes(state)) return fail(`status doit être l'un de : ${BOOKING_STATUSES.join(', ')}`);

    const { adminDb } = await import('@/lib/firebase-admin');
    const clients = await loadClientsLite();
    let linked: ClientLite | undefined;
    let displayClient: string;
    if (clientId !== undefined) {
      if (typeof clientId !== 'string' || !clientId) return fail('clientId doit être un texte');
      linked = clients.find((c) => c.id === clientId);
      if (!linked) return fail('clientId ne correspond à aucun client : cherche-le avec GET /api/clients');
      displayClient = linked.name || linked.professionalName || title;
    } else {
      displayClient = typeof clientName === 'string' && clientName.trim() ? clientName.trim() : title.trim();
      const similar = similarClients(displayClient, clients);
      if (similar.length && distinct !== true) {
        return fail(
          `« ${displayClient} » ressemble à un client existant : ${describeSimilar(similar)}. Redemande avec son clientId. ` +
          'Si l\'utilisateur confirme que c\'est un autre client, redemande avec "distinct": true.',
        );
      }
    }

    // Franchise (My Beers…) : le lieu cité doit être celui de la fiche. C'est l'erreur du 19/09 (« Istres » facturé à Salon).
    const franchise = distinct === true ? null : franchiseOf(`${title} ${typeof clientName === 'string' ? clientName : ''}`, clients);
    if (franchise) {
      const places = franchise.mentioned.map((v) => v.lieux[0] ?? v.name).join(' / ');
      if (linked) {
        if (franchise.mentioned.length && !franchise.mentioned.some((v) => v.id === linked!.id)) {
          return fail(`le titre parle de « ${franchise.brand} ${places} » mais la fiche choisie est « ${displayClient} » (franchise : une fiche par lieu). Bonne fiche : ${describeVenues(franchise.mentioned)}. Corrige le clientId, ou redemande avec "distinct": true si l'utilisateur confirme.`);
        }
      } else if (franchise.mentioned.length === 1) {
        return fail(`« ${franchise.brand} » est une franchise : ce lieu a sa fiche, ${describeVenues(franchise.mentioned)}. Redemande avec ce clientId.`);
      } else {
        return fail(`« ${franchise.brand} » est une franchise (une fiche par lieu) : quel lieu ? ${describeVenues(franchise.venues)}. Redemande avec le bon clientId.`);
      }
    }

    // Même jour, même client ou même nom : probablement un doublon (c'est ce qui créait des doublons avec la synchro).
    const day = parisDay(start);
    const bookings = await adminDb.collection('bookings').where('start', '>=', new Date(start.getTime() - 36 * 3600_000)).where('start', '<=', new Date(start.getTime() + 36 * 3600_000)).get();
    const twins = bookings.docs.filter((d) => {
      const b = d.data();
      const s = b.start?.toDate?.();
      if (!s || parisDay(s) !== day || b.status === 'annulé') return false;
      return (linked && b.clientId === linked.id) || namesClose(displayClient, b.clientName || '') || namesClose(title, b.title || '');
    });
    if (twins.length && distinct !== true) {
      const list = twins.map((d) => `« ${d.data().title} » (id ${d.id})`).join(' ; ');
      return fail(`une prestation existe déjà ce jour-là : ${list}. Si l'utilisateur confirme que c'est une AUTRE prestation, redemande avec "distinct": true.`);
    }

    const normalized = {
      title: title.trim(),
      ...(linked ? { clientId: linked.id } : { clientName: displayClient }),
      start: start.toISOString(),
      end: end.toISOString(),
      price: amount,
      ...(advance ? { deposit: advance } : {}),
      ...(typeof location === 'string' && location.trim() ? { location: location.trim() } : {}),
      ...(typeof notes === 'string' && notes.trim() ? { notes: notes.trim() } : {}),
      status: state,
      ...(distinct === true ? { distinct: true } : {}),
    };
    const hours = Math.round(((end.getTime() - start.getTime()) / 3600_000) * 10) / 10;
    return {
      ok: true,
      params: normalized,
      summary: [
        `CRÉER une prestation : « ${normalized.title} »`,
        `Client : ${linked ? `fiche « ${displayClient} »` : `${displayClient} (pas de fiche client liée)`}`,
        `Quand : ${formatParis(start)} → ${formatParis(end)} (${hours} h)`,
        `Prix : ${amount} €${amount === 0 ? ' (0 € : elle ne sera pas facturée tant qu\'un prix n\'est pas fixé)' : ''}${advance ? `, acompte ${advance} €` : ''}`,
        normalized.location && `Lieu : ${normalized.location}`,
        `Statut : ${state}`,
        'Google Agenda : l\'événement est créé automatiquement dans les 5 minutes si la date est dans les 90 prochains jours (sinon dès qu\'elle entre dans cette fenêtre).',
        twins.length ? 'Attention : une prestation proche existe le même jour (confirmé comme différente).' : '',
      ].filter(Boolean).join('\n'),
      label: `create_booking ${normalized.title} ${day}`,
    };
  },
  async run(params) {
    const { adminDb } = await import('@/lib/firebase-admin');
    let clientId: string | undefined;
    let clientName = params.clientName as string | undefined;
    if (typeof params.clientId === 'string') {
      const client = (await adminDb.collection('clients').doc(params.clientId).get()).data();
      if (!client) throw new Error('client introuvable');
      clientId = params.clientId;
      clientName = client.name || client.professionalName || (params.title as string);
    }
    const ref = await adminDb.collection('bookings').add({
      title: params.title,
      ...(clientId ? { clientId } : {}),
      clientName,
      displayName: clientName,
      start: new Date(params.start as string),
      end: new Date(params.end as string),
      location: (params.location as string | undefined) ?? '',
      notes: (params.notes as string | undefined) ?? '',
      price: params.price,
      deposit: (params.deposit as number | undefined) ?? 0,
      status: params.status,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'melanie',
    });
    return { bookingId: ref.id };
  },
};

const createInvoiceFromBooking: ActionDef = {
  async prepare(params) {
    const { bookingId, status, dueInDays, notes, paymentMethod } = params;
    if (typeof bookingId !== 'string' || !bookingId.trim() || bookingId.length > 200) return fail('bookingId est obligatoire (id de la prestation)');
    const state = status === undefined ? 'ISSUED' : status;
    if (state !== 'ISSUED' && state !== 'DRAFT') return fail('status doit être "ISSUED" (facture numérotée, à payer) ou "DRAFT" (brouillon sans numéro)');
    if (dueInDays !== undefined && (typeof dueInDays !== 'number' || !Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 365)) return fail('dueInDays doit être un entier entre 0 et 365');
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 5000)) return fail('notes : texte de 5000 caractères maximum');
    if (paymentMethod !== undefined && (typeof paymentMethod !== 'string' || !paymentMethod.trim() || paymentMethod.length > 80)) return fail('paymentMethod : texte de 80 caractères maximum');

    let booking;
    try {
      const { getBooking } = await import('@/lib/bot/bookings');
      booking = await getBooking(bookingId.trim());
    } catch (error) {
      if (error instanceof BotApiError) return fail('prestation introuvable : cherche son id avec GET /api/agenda');
      throw error;
    }
    if (booking.status === 'annulé') return fail(`la prestation « ${booking.title} » est annulée : pas de facture`);
    if (booking.invoicedExternally) return fail(`la prestation « ${booking.title} » est marquée « facturée hors application » (espèces ou autre) : pas de facture`);
    const active = booking.linkedDocuments.filter((d) => d.documentType === 'INVOICE' && !['CANCELLED', 'CREDITED', 'DRAFT'].includes(d.status));
    if (active.length) return fail(`la prestation « ${booking.title} » a déjà la facture ${active.map((d) => d.number ?? d.id).join(', ')}`);
    if (!booking.start) return fail('la prestation n\'a pas de date');
    if (!booking.price || booking.price <= 0) return fail(`la prestation « ${booking.title} » est à 0 € : fixe d'abord son prix`);
    if (!booking.clientId) return fail(`la prestation « ${booking.title} » n'est liée à aucune fiche client : la facture serait sans adresse ni SIRET. Rattache-la d'abord à un client.`);

    const { getClient } = await import('@/lib/bot/clients');
    const client = await getClient(booking.clientId);
    const days = typeof dueInDays === 'number' ? dueInDays : 30;
    const future = new Date(booking.start).getTime() > Date.now();
    return {
      ok: true,
      params: {
        bookingId: booking.id,
        status: state,
        ...(typeof dueInDays === 'number' ? { dueInDays } : {}),
        ...(typeof notes === 'string' && notes.trim() ? { notes: notes.trim() } : {}),
        ...(typeof paymentMethod === 'string' ? { paymentMethod: paymentMethod.trim() } : {}),
      },
      summary: [
        state === 'ISSUED'
          ? 'CRÉER une FACTURE numérotée (le numéro est attribué à la création et ne peut plus être réutilisé).'
          : 'CRÉER un BROUILLON de facture (sans numéro, rien d\'officiel).',
        `Client : ${client.name}${client.email ? ` (${client.email})` : ' (aucun mail enregistré)'}`,
        `Prestation : « ${booking.title} » du ${formatParis(new Date(booking.start))}`,
        `Montant : ${booking.price} €`,
        state === 'ISSUED' ? `Échéance : ${days} jours. Elle apparaît comme « en attente de paiement » et le bot Telegram la suivra.` : '',
        future ? 'Attention : la prestation n\'a pas encore eu lieu.' : '',
        'Rien n\'est envoyé au client : l\'envoi par mail est une autre action.',
      ].filter(Boolean).join('\n'),
      label: `create_invoice_from_booking ${state} ${booking.id}`,
    };
  },
  async run(params) {
    const { createBillingDocument } = await import('@/lib/bot/invoices');
    const invoice = await createBillingDocument('INVOICE', {
      bookingId: params.bookingId as string,
      status: params.status as 'ISSUED' | 'DRAFT',
      ...(typeof params.dueInDays === 'number' ? { dueInDays: params.dueInDays } : {}),
      ...(typeof params.notes === 'string' ? { notes: params.notes } : {}),
      ...(typeof params.paymentMethod === 'string' ? { paymentMethod: params.paymentMethod } : {}),
    });
    return { invoiceId: invoice.id, numero: invoice.number ?? null, statut: invoice.status, avertissements: invoice.warnings };
  },
};

export const ACTIONS: Record<string, ActionDef> = {
  mark_invoice_paid: markInvoicePaid,
  send_invoice_email: sendInvoiceMail,
  resend_invoice: sendInvoiceMail, // même action : renvoyer une facture existante (brouillon ou envoi réel)
  send_mail: sendMail,
  create_client: createClientAction,
  create_booking: createBookingAction,
  create_invoice_from_booking: createInvoiceFromBooking,
};
