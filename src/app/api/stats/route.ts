import { NextRequest, NextResponse } from 'next/server';
import { badRequest, isAuthorized, logCall, parisDay, parisMidnight, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERIODES = ['mois', 'annee'] as const;
const DEAD_STATUSES = new Set(['CANCELLED', 'CREDITED', 'DRAFT']);
const UNPAID_STATUSES = new Set(['PENDING_PAYMENT', 'ISSUED']);

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const euros = (value: number) => Math.round(value * 100) / 100;

/** Mois ou année civile en cours, à l'heure de Paris. */
function bounds(periode: (typeof PERIODES)[number]) {
  const [year, month] = parisDay(new Date()).split('-').map(Number);
  if (periode === 'annee') return { from: parisMidnight(`${year}-01-01`), to: parisMidnight(`${year + 1}-01-01`) };
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { from: parisMidnight(`${year}-${String(month).padStart(2, '0')}-01`), to: parisMidnight(next) };
}

// Chiffres d'affaire, impayés, meilleurs clients et ce qui reste à facturer. Lecture seule.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const periode = request.nextUrl.searchParams.get('periode') || 'mois';
  if (!(PERIODES as readonly string[]).includes(periode)) return badRequest('periode doit être "mois" ou "annee"');
  const { from, to } = bounds(periode as (typeof PERIODES)[number]);

  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const [invoiceSnap, bookingSnap] = await Promise.all([adminDb.collection('invoices').get(), adminDb.collection('bookings').get()]);
    const inPeriod = (date: Date | null) => !!date && date >= from && date < to;

    const invoices = invoiceSnap.docs.map((d) => d.data()).filter((i) => i.documentType === 'INVOICE' && !DEAD_STATUSES.has(i.status));
    const total = (i: any) => Number(i.totals?.total) || 0;

    const encaisse = invoices.filter((i) => i.status === 'PAID' && inPeriod(toDate(i.paidAt) ?? toDate(i.issueDate)));
    const emises = invoices.filter((i) => inPeriod(toDate(i.issueDate)));
    const impayees = invoices.filter((i) => UNPAID_STATUSES.has(i.status));

    const parClient = new Map<string, { total: number; factures: number }>();
    for (const i of emises) {
      const name = i.clientSnapshot?.displayName ?? 'Client inconnu';
      const entry = parClient.get(name) ?? { total: 0, factures: 0 };
      entry.total += total(i);
      entry.factures += 1;
      parClient.set(name, entry);
    }
    const topClients = [...parClient.entries()]
      .map(([client, v]) => ({ client, total: euros(v.total), factures: v.factures }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Prestations passées, hors annulées/espèces, sans facture active.
    const facturees = new Set<string>();
    for (const i of invoices) {
      if (i.bookingId) facturees.add(i.bookingId);
      for (const id of i.bookingIds ?? []) facturees.add(id);
    }
    const now = new Date();
    const aFacturer: { id: string; titre: string; client: string; date: string | null; prix: number }[] = [];
    let sansPrix = 0;
    for (const doc of bookingSnap.docs) {
      const b = doc.data();
      const end = toDate(b.end);
      if (!end || end >= now || b.status === 'annulé' || b.invoicedExternally || b.freeConfirmedAt || facturees.has(doc.id)) continue;
      const price = Number(b.price) || 0;
      if (price > 0) {
        aFacturer.push({ id: doc.id, titre: b.title ?? '', client: b.clientName ?? '', date: toDate(b.start)?.toISOString() ?? null, prix: price });
      } else {
        sansPrix += 1;
      }
    }

    logCall('/api/stats', topClients.length);
    return NextResponse.json({
      periode,
      du: from.toISOString(),
      au: to.toISOString(),
      devise: 'EUR',
      caEncaisse: { montant: euros(encaisse.reduce((s, i) => s + total(i), 0)), factures: encaisse.length },
      caFacture: { montant: euros(emises.reduce((s, i) => s + total(i), 0)), factures: emises.length },
      impaye: { montant: euros(impayees.reduce((s, i) => s + total(i), 0)), factures: impayees.length },
      topClients,
      resteAFacturer: {
        montant: euros(aFacturer.reduce((s, b) => s + b.prix, 0)),
        prestations: aFacturer.length,
        liste: aFacturer.slice(0, 10),
        sansPrixADefinir: sansPrix,
      },
    });
  } catch (error) {
    console.error('[melanie-api] /api/stats erreur :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'server_error', detail: 'Base de données indisponible.' }, { status: 500 });
  }
}
