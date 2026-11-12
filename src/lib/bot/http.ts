import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { BotApiError } from './errors';

export function requireBotAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.BOT_API_SECRET;
  const authHeader = request.headers.get('x-bot-secret');
  if (!secret || authHeader !== secret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  return null;
}

export function botJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    if (issue.code === 'unrecognized_keys' && 'keys' in issue && Array.isArray(issue.keys)) {
      const keys = issue.keys.join(', ');
      return { path: path || keys, message: `Champ non reconnu : ${keys}` };
    }
    return { path, message: issue.message };
  });
}

interface SafeParser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodError };
}

export function parseWith<T>(schema: SafeParser<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

export function searchRecord(request: NextRequest): Record<string, string> {
  const record: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    if (record[key] === undefined && value !== '') record[key] = value;
  });
  return record;
}

export async function readJson(request: NextRequest, options?: { allowEmpty?: boolean }): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) {
    if (options?.allowEmpty) return {};
    throw new BotApiError('Corps JSON requis', 400);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BotApiError('Corps JSON invalide', 400);
  }
}

export async function readId(context: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await context.params;
  if (!id || id.length > 200 || id.includes('/')) {
    throw new BotApiError('Identifiant invalide', 400);
  }
  return id;
}

export async function handleBot(request: NextRequest, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  const denied = requireBotAuth(request);
  if (denied) return denied;
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: formatZodError(error) }, { status: 400 });
    }
    if (error instanceof BotApiError) {
      const body: { error: string; details?: unknown } = { error: error.message };
      if (error.details !== undefined) body.details = error.details;
      return NextResponse.json(body, { status: error.status });
    }
    console.error('Erreur API bot:', error);
    return NextResponse.json({ error: 'Erreur interne', details: String(error) }, { status: 500 });
  }
}
