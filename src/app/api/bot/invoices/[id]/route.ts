import { NextRequest } from 'next/server';
import { botJson, handleBot, parseWith, readId, readJson } from '@/lib/bot/http';
import { getInvoice, updateInvoice } from '@/lib/bot/invoices';
import { updateDocumentSchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return handleBot(request, async () => botJson(await getInvoice(await readId(context))));
}

export async function PATCH(request: NextRequest, context: Context) {
  return handleBot(request, async () => {
    const input = parseWith(updateDocumentSchema, await readJson(request));
    return botJson(await updateInvoice(await readId(context), input));
  });
}
