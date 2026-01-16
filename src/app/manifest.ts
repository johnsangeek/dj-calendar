import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DJ Booker Pro',
    short_name: 'DJ Booker',
    description: 'Gestion des réservations DJ avec synchronisation Google Calendar.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#1d4ed8',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Calendrier',
        short_name: 'Calendrier',
        url: '/availability',
      },
      {
        name: 'Clients',
        short_name: 'Clients',
        url: '/clients',
      },
    ],
  };
}
