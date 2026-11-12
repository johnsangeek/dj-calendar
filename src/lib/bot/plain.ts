export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefinedDeep(item)) as T;
  }
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') return value;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, pruneUndefinedDeep(entry)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

export function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  const folded = fold(query.trim());
  if (!folded) return true;
  const digits = query.replace(/\D/g, '');
  return values.some((value) => {
    if (!value) return false;
    if (fold(value).includes(folded)) return true;
    return digits.length >= 3 && value.replace(/\D/g, '').includes(digits);
  });
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function paginate<T>(items: T[], offset: number, limit: number) {
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    total: items.length,
    limit,
    offset,
    hasMore: offset + slice.length < items.length,
  };
}

export function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
