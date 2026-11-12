import { NextRequest } from 'next/server';
import { getClient, updateClient } from '@/lib/bot/clients';
import { botJson, handleBot, parseWith, readId, readJson } from '@/lib/bot/http';
import { updateClientSchema } from '@/lib/bot/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return handleBot(request, async () => botJson(await getClient(await readId(context))));
}

export async function PATCH(request: NextRequest, context: Context) {
  return handleBot(request, async () => {
    const input = parseWith(updateClientSchema, await readJson(request));
    return botJson(await updateClient(await readId(context), input));
  });
}
