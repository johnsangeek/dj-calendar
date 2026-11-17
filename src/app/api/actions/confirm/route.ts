import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ACTIONS } from '@/lib/melanie-actions';
import { badRequest, isAuthorized, logCall, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Étape 2 : exécute exactement ce qui a été proposé (les paramètres viennent du serveur, pas de la
// requête), une seule fois, dans les 10 minutes. Le contenu des mails n'est pas conservé après coup.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('corps JSON attendu : { "proposalId": "..." }');
  }
  const proposalId = body?.proposalId;
  if (typeof proposalId !== 'string' || !/^[0-9a-f]{32}$/.test(proposalId)) return badRequest('proposalId invalide');

  const { adminDb } = await import('@/lib/firebase-admin');
  const ref = adminDb.collection('melanie_proposals').doc(proposalId);

  // Réservation atomique : deux confirmations simultanées ne peuvent pas toutes les deux exécuter.
  const claim = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'not_found' as const };
    const data = snap.data()!;
    if (data.status !== 'pending') return { error: 'already_used' as const, status: data.status };
    if (data.expiresAt.toDate().getTime() < Date.now()) {
      tx.update(ref, { status: 'expired', params: FieldValue.delete() });
      return { error: 'expired' as const };
    }
    tx.update(ref, { status: 'running' });
    return { data };
  });
  if ('error' in claim) {
    const status = claim.error === 'not_found' ? 404 : claim.error === 'expired' ? 410 : 409;
    return NextResponse.json({ error: claim.error, ...('status' in claim ? { status: claim.status } : {}) }, { status });
  }

  const { action: actionName, params, label } = claim.data;
  const action = ACTIONS[actionName];
  try {
    // L'état a pu changer depuis la proposition (facture payée entre-temps, etc.) : on revérifie.
    const prepared = await action.prepare(params);
    if (!prepared.ok) {
      await ref.update({ status: 'failed', params: FieldValue.delete(), error: prepared.detail });
      return NextResponse.json({ error: 'no_longer_valid', detail: prepared.detail }, { status: 409 });
    }
    const result = await action.run(prepared.params);
    await ref.update({ status: 'done', doneAt: FieldValue.serverTimestamp(), params: FieldValue.delete() });
    logCall(`/api/actions/confirm ${label}`, 1);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const detail = String((error as Error)?.message || error).slice(0, 160);
    console.error('[melanie-api] confirm erreur :', label, detail);
    await ref.update({ status: 'failed', params: FieldValue.delete(), error: detail });
    return NextResponse.json({ error: 'action_failed', detail: 'L\'action a échoué. Fais une nouvelle proposition pour réessayer.' }, { status: 502 });
  }
}
