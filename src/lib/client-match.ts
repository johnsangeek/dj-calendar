// Rapprochement tolérant de noms (équivalent TypeScript du client_matcher.py du bot Telegram) : sert à
// éviter les doublons quand Mélanie crée un client ou une prestation (« My Bears Istres » = « My Beers Istres »).
// Volontairement prudent : il propose des candidats, il ne décide jamais seul.

const STOP = new Set(['au', 'aux', 'le', 'la', 'les', 'de', 'du', 'des', 'et', 'en', 'un', 'une', 'chez', 'pour', 'sur', 'par', 'the', 'vs']);
const LEGAL = new Set(['sas', 'sarl', 'eurl', 'sasu', 'sci', 'snc', 'scop', 'association', 'asso', 'ste', 'societe']);
// Mots trop courants pour identifier un client à eux seuls
const GENERIC = new Set([
  'club', 'bar', 'restaurant', 'hotel', 'salon', 'centre', 'mairie', 'ecole', 'soiree', 'fete', 'mix', 'dj', 'set',
  'anniversaire', 'mariage', 'presta', 'prive', 'warmup', 'evenementiel', 'events', 'event', 'shatta', 'latino',
  'apero', 'b2b', 'proposition', 'proposal', 'bal', 'reggaeton', 'afro', 'possible', 'option', 'tentative', 'provence',
]);

function ascii(value: string): string {
  return (value || '').replace(/[’‘]/g, "'").normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function parseName(value: string): { tokens: string[]; compact: string } {
  const text = ascii(value);
  const compact = text.replace(/[^a-z0-9]/g, '');
  const words = text.replace(/'/g, ' ').match(/[a-z0-9]+/g) ?? [];
  const tokens = [...new Set(words.filter((w) => w.length >= 3 && !STOP.has(w) && !LEGAL.has(w)))];
  return { tokens, compact };
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Deux mots sont « le même » : identiques, à 1 faute près (2 pour les longs mots), ou collés (mybeers/beers). */
function sameToken(x: string, y: string): boolean {
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 4) return false;
  const longest = Math.max(x.length, y.length);
  if (levenshtein(x, y) <= (longest <= 8 ? 1 : 2)) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return long.includes(short) && long.length - short.length <= 2 && short.length >= 4;
}

/** Les deux intitulés désignent probablement la même chose (l'un est inclus dans l'autre, à une faute près). */
export function namesClose(a: string, b: string): boolean {
  const pa = parseName(a);
  const pb = parseName(b);
  if (!pa.compact || !pb.compact) return false;
  if (pa.compact === pb.compact) return true;
  if (Math.min(pa.compact.length, pb.compact.length) >= 6 && (pa.compact.includes(pb.compact) || pb.compact.includes(pa.compact))) return true;
  if (!pa.tokens.length || !pb.tokens.length) return false;
  const [small, big] = pa.tokens.length <= pb.tokens.length ? [pa.tokens, pb.tokens] : [pb.tokens, pa.tokens];
  if (small.every((t) => GENERIC.has(t))) return false;
  return small.every((t) => big.some((u) => sameToken(t, u)));
}

export interface ClientLite {
  id: string;
  name?: string;
  professionalName?: string | null;
  tradeName?: string | null;
  email?: string | null;
  primaryEmail?: string | null;
  altEmails?: string[] | null;
  siret?: string | null;
  eventAliases?: string[] | null;
  franchise?: string | null; // marque d'une franchise (« My Beers ») : une fiche par lieu
  franchiseLieux?: string[] | null; // façons de nommer le lieu dans l'agenda (« Istres »)
}

export interface SimilarClient {
  id: string;
  name: string;
  reason: string;
}

const norm = (v?: string | null) => (v || '').trim().toLowerCase();
const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

/** Fiches existantes qui ressemblent à ce nom / cet e-mail / ce SIRET. */
export function similarClients(name: string, clients: ClientLite[], extra: { email?: string | null; siret?: string | null } = {}): SimilarClient[] {
  const email = norm(extra.email);
  const siret = digits(extra.siret);
  const out: SimilarClient[] = [];
  for (const client of clients) {
    const label = client.name || client.professionalName || client.tradeName || client.id;
    const emails = [client.email, client.primaryEmail, ...(client.altEmails ?? [])].map(norm).filter(Boolean);
    if (email && emails.includes(email)) {
      out.push({ id: client.id, name: label, reason: 'même adresse mail' });
      continue;
    }
    if (siret.length === 14 && digits(client.siret) === siret) {
      out.push({ id: client.id, name: label, reason: 'même SIRET' });
      continue;
    }
    const aliases = [client.name, client.professionalName, client.tradeName, ...(client.eventAliases ?? [])].filter((v): v is string => !!v);
    const hit = aliases.find((alias) => namesClose(name, alias));
    if (hit) out.push({ id: client.id, name: label, reason: `nom proche de « ${hit.trim()} »` });
  }
  return out;
}

// ---------------------------------------------------------------- franchises
// Une franchise (My Beers…) = plusieurs lieux, chacun sa fiche, JAMAIS fusionnés. Le nom de la marque seul ne dit
// pas quelle fiche : c'est le lieu qui tranche.

export interface FranchiseVenue {
  id: string;
  name: string;
  lieux: string[];
}

export interface FranchiseHit {
  brand: string;
  venues: FranchiseVenue[];
  mentioned: FranchiseVenue[]; // lieux cités dans le texte
}

function mentions(textTokens: string[], phrase: string): boolean {
  const wanted = parseName(phrase).tokens;
  return wanted.length > 0 && wanted.every((t) => textTokens.some((u) => sameToken(t, u)));
}

/** Le texte parle-t-il d'une franchise connue ? Si oui : ses lieux et ceux qui sont cités. */
export function franchiseOf(text: string, clients: ClientLite[]): FranchiseHit | null {
  const textTokens = parseName(text).tokens;
  const brands = [...new Set(clients.map((c) => c.franchise).filter((b): b is string => !!b))];
  for (const brand of brands) {
    if (!mentions(textTokens, brand)) continue;
    const venues = clients
      .filter((c) => c.franchise === brand)
      .map((c) => ({ id: c.id, name: c.name || c.id, lieux: c.franchiseLieux ?? [] }));
    return { brand, venues, mentioned: venues.filter((v) => v.lieux.some((l) => mentions(textTokens, l))) };
  }
  return null;
}

export const describeVenues = (venues: FranchiseVenue[]) =>
  venues.map((v) => `${v.lieux[0] ?? v.name} → « ${v.name} » (id ${v.id})`).join(' ; ');
