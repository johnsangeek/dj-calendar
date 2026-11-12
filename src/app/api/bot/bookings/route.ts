import { NextRequest } from 'next/server';
import { listBookings } from '@/lib/bot/bookings';
import { botJson, handleBot, parseWith, searchRecord } from '@/lib/bot/http';
import { listBookingsQuerySchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleBot(request, async () => {
    const query = parseWith(listBookingsQuerySchema, searchRecord(request));
    return botJson(await listBookings(query));
  });
}
