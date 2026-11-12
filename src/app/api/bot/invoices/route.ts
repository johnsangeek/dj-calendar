import { NextRequest } from 'next/server';
import { botJson, handleBot, parseWith, readJson, searchRecord } from '@/lib/bot/http';
import { createBillingDocument, listInvoices } from '@/lib/bot/invoices';
import { createDocumentSchema, listInvoicesQuerySchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleBot(request, async () => {
    const query = parseWith(listInvoicesQuerySchema, searchRecord(request));
    return botJson(await listInvoices(query));
  });
}

export async function POST(request: NextRequest) {
  return handleBot(request, async () => {
    const input = parseWith(createDocumentSchema, await readJson(request));
    return botJson(await createBillingDocument('INVOICE', input), 201);
  });
}
