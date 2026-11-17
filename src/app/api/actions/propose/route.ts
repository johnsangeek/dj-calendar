import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ACTIONS } from '@/lib/melanie-actions';
import { badRequest, isAuthorized, logCall, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROPOSAL_TTL_MS = 10 * 60 * 1000;

// Étape 1 : décrit une action sans l'exécuter. Mélanie doit montrer `summary` à l'utilisateur,
// attendre son accord explicite, puis appeler /api/actions/confirm avec le `proposalId`.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('corps JSON attendu : { "action": "...", "params": { ... } }');
  }
  const action = ACTIONS[typeof body?.action === 'string' ? body.action : ''];
  if (!action) return badRequest(`action inconnue. Actions disponibles : ${Object.keys(ACTIONS).join(', ')}`);
  if (!body.params || typeof body.params !== 'object' || Array.isArray(body.params)) return badRequest('params doit être un objet');

  try {
    const prepared = await action.prepare(body.params);
    if (!prepared.ok) return badRequest(prepared.detail);

    const { adminDb } = await import('@/lib/firebase-admin');
    const proposalId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS);
    await adminDb.collection('melanie_proposals').doc(proposalId).set({
      action: body.action,
      params: prepared.params,
      label: prepared.label,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    logCall(`/api/actions/propose ${body.action}`, 1);
    return NextResponse.json({
      proposalId,
      summary: prepared.summary,
      expiresAt: expiresAt.toISOString(),
      next: 'Montre summary à l\'utilisateur. Appelle /api/actions/confirm UNIQUEMENT après son accord explicite.',
    });
  } catch (error) {
    console.error('[melanie-api] propose erreur :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
