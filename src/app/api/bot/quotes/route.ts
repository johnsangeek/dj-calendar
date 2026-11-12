import { NextRequest } from 'next/server';
import { botJson, handleBot, parseWith, readJson } from '@/lib/bot/http';
import { createBillingDocument } from '@/lib/bot/invoices';
import { createDocumentSchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleBot(request, async () => {
    const input = parseWith(createDocumentSchema, await readJson(request));
    return botJson(await createBillingDocument('QUOTE', input), 201);
  });
}
