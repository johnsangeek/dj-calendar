import { NextRequest, NextResponse } from 'next/server';
import { BotApiError } from '@/lib/bot/errors';
import { badRequest, isAuthorized, logCall, parseLimit, unauthorized } from '@/lib/melanie-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERIODES = { semaine: 7, mois: 30 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

// Prochaines prestations, de maintenant à +7 jours (semaine) ou +30 jours (mois), les plus proches d'abord.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const params = request.nextUrl.searchParams;
  const limit = parseLimit(params);
  if ('error' in limit) return badRequest(limit.error);
  const periode = params.get('periode') || 'semaine';
  if (!(periode in PERIODES)) return badRequest('periode doit être "semaine" ou "mois"');

  const from = new Date();
  const to = new Date(from.getTime() + PERIODES[periode as keyof typeof PERIODES] * DAY_MS);

  try {
    const { listBookings } = await import('@/lib/bot/bookings');
    const page = await listBookings({ from: from.toISOString(), to: to.toISOString(), limit: 500, offset: 0 });
    const prestations = page.items
      .filter((booking) => booking.status !== 'annulé')
      .sort((a, b) => new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime())
      .slice(0, limit.value)
      .map((booking) => ({
        id: booking.id,
        titre: booking.title,
        client: booking.clientName,
        clientId: booking.clientId,
        debut: booking.start,
        fin: booking.end,
        lieu: booking.location,
        prix: booking.price,
        statut: booking.status,
        facturee: booking.invoiced,
      }));

    logCall('/api/agenda', prestations.length);
    return NextResponse.json({ periode, du: from.toISOString(), au: to.toISOString(), prestations });
  } catch (error) {
    if (error instanceof BotApiError) return badRequest(error.message);
    console.error('[melanie-api] /api/agenda erreur :', String((error as Error)?.message || error).slice(0, 160));
    return NextResponse.json({ error: 'server_error', detail: 'Base de données indisponible.' }, { status: 500 });
  }
}
