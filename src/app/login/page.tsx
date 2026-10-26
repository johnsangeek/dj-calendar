import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Connexion — DJ Booker Pro' };

const ERRORS: Record<string, string> = {
  pwd: 'Mot de passe incorrect.',
  config: 'La connexion Google n’est pas configurée.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = '', error } = await searchParams;
  const googleHref = `/api/login/google${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-gray-900">DJ Booker Pro</h1>
        <p className="mb-6 text-center text-sm text-gray-500">Connecte-toi pour accéder à ton espace.</p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {ERRORS[error] ?? 'Connexion impossible.'}
          </p>
        )}

        <a
          href={googleHref}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-800 transition hover:bg-gray-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
            <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Se connecter avec Google
        </a>

        <details className="mt-6 text-sm text-gray-500">
          <summary className="cursor-pointer text-center">Mot de passe de secours</summary>
          <form method="post" action="/api/login/password" className="mt-3 flex gap-2">
            <input type="hidden" name="next" value={next} />
            <input
              type="password"
              name="password"
              required
              placeholder="Mot de passe"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            />
            <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 font-medium text-white">
              OK
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
