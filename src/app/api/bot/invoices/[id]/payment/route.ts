import { NextRequest } from 'next/server';
import { botJson, handleBot, parseWith, readId, readJson } from '@/lib/bot/http';
import { recordPayment } from '@/lib/bot/invoices';
import { paymentSchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return handleBot(request, async () => {
    const input = parseWith(paymentSchema, await readJson(request, { allowEmpty: true }));
    return botJson(await recordPayment(await readId(context), input));
  });
}
