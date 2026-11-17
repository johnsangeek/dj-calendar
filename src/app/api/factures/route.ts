import { NextRequest, NextResponse } from 'next/server';
import { badRequest, isAuthorized, logCall, parseLimit, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUTS = ['impayee', 'payee', 'toutes'] as const;
const SCAN_LIMIT = 500; // le filtre par statut se fait en mémoire : pas besoin d'index Firestore

function statutOf(status: string): string {
  if (status === 'PAID') return 'payee';
  if (status === 'PENDING_PAYMENT' || status === 'ISSUED') return 'impayee';
  if (status === 'CANCELLED' || status === 'CREDITED') return 'annulee';
  return 'brouillon';
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Jour calendaire à Paris (YYYY-MM-DD), pas en UTC.
function parisDay(value: any): string | null {
  const date = toDate(value);
  return date ? date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) : null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const params = request.nextUrl.searchParams;
  const limit = parseLimit(params);
  if ('error' in limit) return badRequest(limit.error);
  const statut = params.get('statut') || 'toutes';
  if (!(STATUTS as readonly string[]).includes(statut)) {
    return badRequest(`statut doit être l'une de ces valeurs : ${STATUTS.join(', ')}`);
  }

  let snapshot;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    snapshot = await adminDb.collection('invoices').orderBy('issueDate', 'desc').limit(SCAN_LIMIT).get();
  } catch (error) {
    console.error('[melanie-api] /api/factures erreur Firestore :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'server_error', detail: 'Base de données indisponible.' }, { status: 500 });
  }
  const factures = snapshot.docs
    .map((doc) => doc.data())
    .filter((data) => data.documentType === 'INVOICE')
    .map((data) => ({
      numero: data.number ?? null,
      tiers: data.clientSnapshot?.displayName ?? data.clientSnapshot?.contactName ?? null,
      montant: data.totals?.total ?? null,
      devise: data.totals?.currency ?? data.currency ?? 'EUR',
      date: parisDay(data.issueDate),
      echeance: parisDay(data.dueDate ?? data.paymentTerms?.dueDate),
      statut: statutOf(data.status),
    }))
    .filter((facture) => statut === 'toutes' || facture.statut === statut)
    .slice(0, limit.value);

  logCall('/api/factures', factures.length);
  return NextResponse.json({ factures });
}
