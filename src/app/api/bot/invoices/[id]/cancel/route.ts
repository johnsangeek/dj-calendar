import { NextRequest } from 'next/server';
import { botJson, handleBot, readId } from '@/lib/bot/http';
import { cancelDocument } from '@/lib/bot/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return handleBot(request, async () => botJson(await cancelDocument(await readId(context))));
}
