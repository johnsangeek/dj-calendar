// Session signée (HMAC-SHA256) pour la connexion Google. Utilise Web Crypto → compatible middleware (Edge) et routes Node.
export const SESSION_COOKIE = 'dj_session';
export const SESSION_DAYS = 90;

const enc = new TextEncoder();

function secret(): string {
  return process.env.SESSION_SECRET || process.env.GMAIL_TOKEN_SECRET || process.env.APP_PASSWORD || '';
}

export function allowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS || 'djjohnsanti@gmail.com';
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

async function hmacHex(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(email: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = btoa(`${email.toLowerCase()}|${exp}`);
  return `${payload}.${await hmacHex(payload)}`;
}

/** Retourne l'e-mail connecté si la session est valide, sinon null. */
export async function verifySession(value: string | undefined): Promise<string | null> {
  if (!value || !secret()) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmacHex(payload))) return null;
  try {
    const [email, exp] = atob(payload).split('|');
    if (!email || Date.now() > Number(exp)) return null;
    return allowedEmails().includes(email) ? email : null;
  } catch {
    return null;
  }
}

/** N'accepte que des chemins internes (évite une redirection ouverte). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
