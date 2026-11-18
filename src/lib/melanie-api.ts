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

// ---------------------------------------------------------------- dates (fuseau Europe/Paris)

const PARIS = 'Europe/Paris';

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PARIS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute'), second: pick('second') };
}

/** « 2026-12-04T21:00 » ou « 2026-12-04 21:00 » = heure de Paris ; une date ISO avec fuseau (Z, +01:00) est prise telle quelle. */
export function parseBookingDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const p = parisParts(new Date(utc));
    utc = target - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utc);
  }
  const check = parisParts(new Date(utc));
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) return null; // jour ou heure inexistants
  return new Date(utc);
}

/** Jour calendaire à Paris (YYYY-MM-DD). */
export function parisDay(date: Date): string {
  const p = parisParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** « ven. 4 déc. 2026, 21:00 » pour les résumés montrés à l'utilisateur. */
export function formatParis(date: Date): string {
  return date.toLocaleString('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Minuit (Paris) du jour calendaire YYYY-MM-DD. */
export function parisMidnight(dayKey: string): Date {
  const date = parseBookingDate(`${dayKey}T00:00`);
  if (!date) throw new Error(`jour invalide : ${dayKey}`);
  return date;
}
