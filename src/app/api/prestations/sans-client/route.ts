import { NextRequest, NextResponse } from 'next/server';
import { BotApiError } from '@/lib/bot/errors';
import { describeVenues, franchiseOf, similarClients, type ClientLite } from '@/lib/client-match';
import { badRequest, isAuthorized, logCall, parseLimit, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 120;

// Prestations qui ne sont rattachées à aucune fiche client (sans fiche, pas de facture correcte), avec le ou les
// clients probables. Mélanie s'en sert pour demander à l'utilisateur : « cette soirée-là, c'était quel client ? ».
// Sont exclues : les prestations annulées et celles marquées « espèces / hors application » (rien à facturer).
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const limit = parseLimit(request.nextUrl.searchParams);
  if ('error' in limit) return badRequest(limit.error);

  try {
    const { listBookings } = await import('@/lib/bot/bookings');
    const { adminDb } = await import('@/lib/firebase-admin');
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
    const [page, clientSnap] = await Promise.all([
      listBookings({ from: since.toISOString(), limit: 500, offset: 0 }),
      adminDb.collection('clients').get(),
    ]);
    const clients: ClientLite[] = clientSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClientLite, 'id'>) }));
    const names = new Map(clients.map((c) => [c.id, c.name || c.id]));
    const now = Date.now();

    const prestations = page.items
      .filter((b) => !b.clientId && b.status !== 'annulé' && !b.invoicedExternally)
      .sort((a, b) => new Date(b.start ?? 0).getTime() - new Date(a.start ?? 0).getTime())
      .slice(0, limit.value)
      .map((b) => {
        const label = b.title || b.clientName;
        const franchise = franchiseOf(`${b.title} ${b.clientName}`, clients);
        const probable = franchise?.mentioned.length
          ? franchise.mentioned.map((v) => ({ clientId: v.id, nom: names.get(v.id) ?? v.name, raison: `lieu « ${v.lieux[0] ?? ''} » de la franchise ${franchise.brand}` }))
          : similarClients(label, clients).slice(0, 3).map((c) => ({ clientId: c.id, nom: c.name, raison: c.reason }));
        const passee = !!b.end && new Date(b.end).getTime() < now;
        return {
          id: b.id,
          titre: b.title,
          debut: b.start,
          fin: b.end,
          lieu: b.location,
          prix: b.price,
          statut: b.status,
          passee,
          aFacturer: passee && b.price > 0 && !b.invoiced,
          clientsProbables: probable,
          ...(franchise && !franchise.mentioned.length
            ? { franchise: { marque: franchise.brand, avertissement: `« ${franchise.brand} » est une franchise : le titre ne dit pas quel lieu. Lieux : ${describeVenues(franchise.venues)}. Demande à l'utilisateur.` } }
            : {}),
        };
      });

    logCall('/api/prestations/sans-client', prestations.length);
    return NextResponse.json({ prestations });
  } catch (error) {
    if (error instanceof BotApiError) return badRequest(error.message);
    console.error('[melanie-api] /api/prestations/sans-client erreur :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'server_error', detail: 'Base de données indisponible.' }, { status: 500 });
  }
}
