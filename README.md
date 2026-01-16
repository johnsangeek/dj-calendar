## DJ Booker Pro

Application Next.js 16 pour la gestion des réservations DJ avec synchronisation Google Calendar, CRM clients et facturation.

## Démarrage local

1. Créer un fichier `.env.local` (voir `.env.example` si disponible) avec les clefs Firebase, Google OAuth et configuration Stripe si nécessaire.
2. Installer les dépendances :

```bash
npm install
```

3. Lancer le serveur :

```bash
npm run dev
```

4. Ouvrir [http://localhost:3001](http://localhost:3001) (port défini dans `package.json`).

## Progressive Web App

- Manifest généré via [src/app/manifest.ts](src/app/manifest.ts).
- Icônes disponibles dans [public/icons](public/icons).
- Service worker géré par `@ducanh2912/next-pwa` (activé en production / prévisualisation Vercel).

Pour tester en local :

```bash
NODE_ENV=production npm run build
npm run start
```

Puis vérifier l’audit PWA avec Lighthouse.

## Déploiement Vercel

1. Pousser le dépôt vers GitHub/GitLab.
2. Sur [Vercel](https://vercel.com/import), relier le repository.
3. Définir les variables d’environnement requises (Firebase, Google OAuth, Stripe) dans `Project Settings > Environment Variables`.
4. Déployer. Le service worker est généré automatiquement ; l’application est installable en tant que web app (mobile et desktop) et compatible iOS via « Ajouter à l’écran d’accueil ».

Pour les webhooks Google Calendar en pré-production, exposer l’API via un tunnel HTTPS (ngrok, Cloudflare Tunnel) et déclarer l’URL lors de l’appel à `events.watch`.
