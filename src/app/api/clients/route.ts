import { NextRequest, NextResponse } from 'next/server';
import { describeVenues, franchiseOf, similarClients, type ClientLite } from '@/lib/client-match';
import { BotApiError } from '@/lib/bot/errors';
import { badRequest, isAuthorized, logCall, parseLimit, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUERY_LENGTH = 100;

// Recherche de clients, pensée pour l'anti-doublon : `match` = "texte" (le mot est contenu dans la fiche)
// ou "proche" (écrit un peu différemment : « My Bears » pour « My Beers », même mail, même SIRET).
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const params = request.nextUrl.searchParams;
  const limit = parseLimit(params);
  if ('error' in limit) return badRequest(limit.error);
  const q = (params.get('q') || '').trim();
  if (q.length > MAX_QUERY_LENGTH) return badRequest(`q ne doit pas dépasser ${MAX_QUERY_LENGTH} caractères`);

  try {
    const { listClients } = await import('@/lib/bot/clients');
    const { adminDb } = await import('@/lib/firebase-admin');
    const all = await listClients({ q: q || undefined, limit: 500, offset: 0 });
    const snap = await adminDb.collection('clients').get();
    const raw = new Map(snap.docs.map((d) => [d.id, d.data()]));
    const lite: ClientLite[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClientLite, 'id'>) }));

    const shape = (client: (typeof all.items)[number], match: 'texte' | 'proche', reason?: string) => ({
      id: client.id,
      nom: client.name,
      raisonSociale: client.professionalName,
      enseigne: client.tradeName,
      email: client.email,
      telephone: client.phone,
      ville: client.city,
      siret: client.siret,
      tarifHabituel: client.defaultRate,
      type: client.clientType,
      aliasAgenda: client.eventAliases,
      franchise: raw.get(client.id)?.franchise ?? null,
      lieuxFranchise: raw.get(client.id)?.franchiseLieux ?? [],
      match,
      ...(reason ? { raison: reason } : {}),
    });

    const found = all.items.map((client) => shape(client, 'texte'));
    if (q) {
      const seen = new Set(found.map((c) => c.id));
      const full = await listClients({ limit: 500, offset: 0 });
      const byId = new Map(full.items.map((c) => [c.id, c]));
      for (const close of similarClients(q, lite)) {
        const client = byId.get(close.id);
        if (client && !seen.has(close.id)) found.push(shape(client, 'proche', close.reason));
      }
    }

    const clients = found.slice(0, limit.value);
    const franchise = q ? franchiseOf(q, lite) : null;
    logCall('/api/clients', clients.length);
    return NextResponse.json({
      clients,
      ...(franchise
        ? {
            franchise: {
              marque: franchise.brand,
              avertissement: `« ${franchise.brand} » est une franchise : une fiche par lieu, ne jamais les confondre. Lieux : ${describeVenues(franchise.venues)}.`,
              lieuxCites: franchise.mentioned.map((v) => v.id),
            },
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof BotApiError) return badRequest(error.message);
    console.error('[melanie-api] /api/clients erreur :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'server_error', detail: 'Base de données indisponible.' }, { status: 500 });
  }
}
