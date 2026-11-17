import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

// API en lecture seule pour l'assistant local « Mélanie » (/api/health, /api/mails, /api/factures).
// Auth : en-tête `Authorization: Bearer <MELANIE_API_TOKEN>`. Ces routes ne passent pas par le
// middleware du site (il exclut /api), le token est donc leur seule protection.

const MIN_TOKEN_LENGTH = 24;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function digest(value: string) {
  return crypto.createHash('sha256').update(value).digest();
}

/** Token absent côté serveur, trop court ou différent de celui reçu → refusé. Comparaison à temps constant. */
export function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.MELANIE_API_TOKEN;
  if (!expected || expected.length < MIN_TOKEN_LENGTH) return false;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return false;
  return crypto.timingSafeEqual(digest(match[1].trim()), digest(expected));
}

export function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export function badRequest(detail: string) {
  return NextResponse.json({ error: 'bad_request', detail }, { status: 400 });
}

export function parseLimit(params: URLSearchParams): { value: number } | { error: string } {
  const raw = params.get('limit');
  if (raw === null || raw === '') return { value: DEFAULT_LIMIT };
  if (!/^\d+$/.test(raw)) return { error: `limit doit être un entier entre 1 et ${MAX_LIMIT}` };
  const value = Number(raw);
  if (value < 1 || value > MAX_LIMIT) return { error: `limit doit être un entier entre 1 et ${MAX_LIMIT}` };
  return { value };
}

/** Journal sans contenu : route, nombre de résultats, horodatage. */
export function logCall(route: string, count: number) {
  console.log(`[melanie-api] ${new Date().toISOString()} ${route} -> ${count} résultat(s)`);
}
