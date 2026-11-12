import { BotApiError } from './errors';

const PARIS = 'Europe/Paris';

export function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : undefined;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

export function formatParisDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Échue seulement si le jour calendaire parisien de l'échéance est passé. Le jour même reste « impayé ». */
export function isPastDue(due: Date, now = new Date()): boolean {
  return formatParisDate(due) < formatParisDate(now);
}

function assertDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new BotApiError(`Date invalide : ${dateKey}. Utilisez YYYY-MM-DD ou une date ISO avec fuseau.`, 400);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new BotApiError(`Date invalide : ${dateKey}`, 400);
  }
  return { year, month, day };
}

function parisParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** Minuit à Paris pour un jour calendaire YYYY-MM-DD. */
export function parisStartOfDay(dateKey: string): Date {
  const { year, month, day } = assertDateKey(dateKey);
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = parisParts(new Date(utc));
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const offset = asUtc - utc;
    utc = Date.UTC(year, month - 1, day, 0, 0, 0) - offset;
  }
  const result = new Date(utc);
  const check = parisParts(result);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== 0) {
    throw new BotApiError(`Date invalide : ${dateKey}`, 400);
  }
  return result;
}

function nextDateKey(dateKey: string): string {
  const { year, month, day } = assertDateKey(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

export function parseUserDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parisStartOfDay(value);
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BotApiError(`Date invalide : ${value}. Utilisez YYYY-MM-DD ou une date ISO avec fuseau.`, 400);
  }
  return new Date(value);
}

export function parseRangeBound(value: string, bound: 'start' | 'end'): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = parisStartOfDay(value);
    if (bound === 'start') return start;
    return new Date(parisStartOfDay(nextDateKey(value)).getTime() - 1);
  }
  return parseUserDate(value);
}

export function iso(date?: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}
