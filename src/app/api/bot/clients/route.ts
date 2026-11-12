import { NextRequest } from 'next/server';
import { createClient, listClients } from '@/lib/bot/clients';
import { botJson, handleBot, parseWith, readJson, searchRecord } from '@/lib/bot/http';
import { createClientSchema, listClientsQuerySchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleBot(request, async () => {
    const query = parseWith(listClientsQuerySchema, searchRecord(request));
    return botJson(await listClients(query));
  });
}

export async function POST(request: NextRequest) {
  return handleBot(request, async () => {
    const input = parseWith(createClientSchema, await readJson(request));
    return botJson(await createClient(input), 201);
  });
}
