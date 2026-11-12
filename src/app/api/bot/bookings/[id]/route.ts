import { NextRequest } from 'next/server';
import { getBooking } from '@/lib/bot/bookings';
import { botJson, handleBot, readId } from '@/lib/bot/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return handleBot(request, async () => botJson(await getBooking(await readId(context))));
}