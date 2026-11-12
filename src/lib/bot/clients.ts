import { adminDb } from '@/lib/firebase-admin';
import { iso, toDate } from './dates';
import { BotApiError } from './errors';
import { matchesQuery, paginate, text, uniqueStrings } from './plain';
import type { CreateClientInput, ListClientsQuery, UpdateClientInput } from './schemas';

export interface ClientJson {
  id: string;
  name: string;
  professionalName: string | null;
  tradeName: string | null;
  email: string | null;
  altEmails: string[];
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  notes: string | null;
  defaultRate: number | null;
  clientType: 'pro' | 'perso' | null;
  color: string | null;
  eventAliases: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ClientRecord {
  id: string;
  name: string;
  professionalName?: string;
  tradeName?: string;
  email?: string;
  primaryEmail?: string;
  altEmails: string[];
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  siret?: string;
  notes?: string;
  defaultRate?: number;
  clientType?: 'pro' | 'perso';
  color?: string;
  eventAliases: string[];
  stats?: { averageAmount?: number };
  createdAt?: Date;
  updatedAt?: Date;
}

function cleanEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizeSiret(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) {
    throw new BotApiError('Le SIRET doit contenir 14 chiffres', 400);
  }
  return digits;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function mapClient(id: string, raw: unknown): ClientJson {
  const record = toClientRecord(id, raw);
  return {
    id: record.id,
    name: record.name,
    professionalName: record.professionalName ?? null,
    tradeName: record.tradeName ?? null,
    email: record.primaryEmail || record.email || null,
    altEmails: record.altEmails,
    phone: record.phone ?? null,
    address: record.address ?? null,
    postalCode: record.postalCode ?? null,
    city: record.city ?? null,
    siret: record.siret ?? null,
    notes: record.notes ?? null,
    defaultRate: record.defaultRate ?? null,
    clientType: record.clientType ?? null,
    color: record.color ?? null,
    eventAliases: record.eventAliases,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}

export function toClientRecord(id: string, raw: unknown): ClientRecord {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const primary = text(data.primaryEmail) ?? text(data.email);
  const altEmails = uniqueStrings(stringList(data.altEmails).map((email) => email.toLowerCase()));
  const clientType = data.clientType === 'pro' || data.clientType === 'perso' ? data.clientType : undefined;
  const defaultRate = typeof data.defaultRate === 'number' && Number.isFinite(data.defaultRate) ? data.defaultRate : undefined;
  const stats = data.stats && typeof data.stats === 'object' ? data.stats as { averageAmount?: unknown } : undefined;
  const averageAmount = typeof stats?.averageAmount === 'number' ? stats.averageAmount : undefined;
  return {
    id,
    name: text(data.name) ?? 'Client',
    professionalName: text(data.professionalName),
    tradeName: text(data.tradeName),
    email: primary,
    primaryEmail: primary,
    altEmails,
    phone: text(data.phone),
    address: text(data.address),
    postalCode: text(data.postalCode),
    city: text(data.city),
    siret: text(data.siret),
    notes: text(data.notes),
    defaultRate,
    clientType,
    color: text(data.color),
    eventAliases: uniqueStrings(stringList(data.eventAliases)),
    stats: averageAmount !== undefined ? { averageAmount } : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function normalizedEmails(primary: string | null, altEmails: string[]): string[] {
  return uniqueStrings([...(primary ? [primary] : []), ...altEmails].map((email) => email.toLowerCase()));
}

function resolvePrimary(input: { email?: string | null; primaryEmail?: string | null }): string | null {
  if (input.primaryEmail !== undefined) return cleanEmail(input.primaryEmail);
  if (input.email !== undefined) return cleanEmail(input.email);
  return null;
}

export async function listClients(query: ListClientsQuery) {
  const snap = await adminDb.collection('clients').get();
  let clients = snap.docs.map((doc) => mapClient(doc.id, doc.data()));
  if (query.q) {
    const q = query.q;
    clients = clients.filter((client) => matchesQuery(q, [
      client.id,
      client.name,
      client.professionalName,
      client.tradeName,
      client.email,
      ...client.altEmails,
      client.phone,
      client.city,
      client.address,
      client.siret,
      ...client.eventAliases,
    ]));
  }
  clients.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  return paginate(clients, query.offset ?? 0, query.limit ?? 100);
}

export async function getClient(id: string): Promise<ClientJson> {
  const snap = await adminDb.collection('clients').doc(id).get();
  if (!snap.exists) throw new BotApiError('Client introuvable', 404);
  return mapClient(snap.id, snap.data());
}

export async function loadClientRecord(id: string): Promise<ClientRecord> {
  const snap = await adminDb.collection('clients').doc(id).get();
  if (!snap.exists) throw new BotApiError('Client introuvable', 404);
  return toClientRecord(snap.id, snap.data());
}

export async function createClient(input: CreateClientInput): Promise<ClientJson> {
  const now = new Date();
  const primary = resolvePrimary(input);
  const altEmails = normalizedEmails(null, input.altEmails ?? []).filter((email) => email !== primary);
  const payload = {
    name: input.name.trim(),
    professionalName: input.professionalName?.trim() || null,
    tradeName: input.tradeName?.trim() || null,
    email: primary,
    primaryEmail: primary,
    altEmails,
    normalizedEmails: normalizedEmails(primary, altEmails),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    city: input.city?.trim() || null,
    siret: normalizeSiret(input.siret),
    notes: input.notes?.trim() || null,
    defaultRate: input.defaultRate ?? null,
    clientType: input.clientType ?? null,
    color: input.color ?? '#3B82F6',
    eventAliases: uniqueStrings(input.eventAliases ?? []),
    createdAt: now,
    updatedAt: now,
  };
  const ref = await adminDb.collection('clients').add(payload);
  const fresh = await ref.get();
  return mapClient(ref.id, fresh.data());
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<ClientJson> {
  const ref = adminDb.collection('clients').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new BotApiError('Client introuvable', 404);
  const current = toClientRecord(id, snap.data());
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.professionalName !== undefined) patch.professionalName = input.professionalName?.trim() || null;
  if (input.tradeName !== undefined) patch.tradeName = input.tradeName?.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.address !== undefined) patch.address = input.address?.trim() || null;
  if (input.postalCode !== undefined) patch.postalCode = input.postalCode?.trim() || null;
  if (input.city !== undefined) patch.city = input.city?.trim() || null;
  if (input.siret !== undefined) patch.siret = normalizeSiret(input.siret);
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.defaultRate !== undefined) patch.defaultRate = input.defaultRate;
  if (input.clientType !== undefined) patch.clientType = input.clientType;
  if (input.color !== undefined) patch.color = input.color;
  if (input.eventAliases !== undefined) patch.eventAliases = uniqueStrings(input.eventAliases);

  const emailTouched = input.email !== undefined || input.primaryEmail !== undefined;
  if (emailTouched || input.altEmails !== undefined) {
    const primary = emailTouched ? resolvePrimary(input) : (current.primaryEmail || current.email || null);
    const altEmails = uniqueStrings((input.altEmails ?? current.altEmails).map((email) => email.toLowerCase()))
      .filter((email) => email !== primary);
    patch.email = primary;
    patch.primaryEmail = primary;
    patch.altEmails = altEmails;
    patch.normalizedEmails = normalizedEmails(primary, altEmails);
  }

  await ref.update(patch);
  const fresh = await ref.get();
  return mapClient(id, fresh.data());
}
