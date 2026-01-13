# Configuration Google Calendar API

## Étape 1: Créer le projet Google Cloud

1. Allez sur https://console.cloud.google.com/
2. Connectez-vous avec votre compte Google
3. Créez un nouveau projet (nommez-le "dj-booker-pro" ou utilisez "dj-pro-calendar")

## Étape 2: Activer Google Calendar API

1. Dans le menu de navigation, allez à "API et services" > "Bibliothèque"
2. Cherchez "Google Calendar API"
3. Cliquez dessus puis sur "Activer"

## Étape 3: Créer les identifiants OAuth 2.0

1. Allez dans "API et services" > "Identifiants"
2. Cliquez sur "+ CRÉER DES IDENTIFIANTS" > "ID client OAuth"
3. Configurez l'écran de consentement OAuth :
   - Choisissez "Externes"
   - Nom de l'application : "DJ Booker Pro"
   - Email utilisateur : votre email
   - Email du développeur : votre email
   - Ajoutez les scopes nécessaires :
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`
4. Créez l'ID client OAuth :
   - Type d'application : "Application web"
   - Nom : "DJ Booker Pro Web"
   - URI de redirection autorisés :
     - `http://localhost:3000/auth/google-callback` (développement)
     - `https://votre-domaine.com/auth/google-callback` (production)

## Étape 4: Créer une clé API

1. Dans "Identifiants", cliquez sur "+ CRÉER DES IDENTIFIANTS" > "Clé API"
2. Copiez la clé générée
3. Restreignez la clé pour sécurité :
   - API : Google Calendar API uniquement
   - Restrictions d'application : Sites web (votre domaine)

## Étape 5: Ajouter les variables d'environnement

Ajoutez à votre fichier `.env.local` :

```bash
# Google Calendar API Configuration
NEXT_PUBLIC_GOOGLE_CLIENT_ID=votre_id_client_oauth
GOOGLE_CLIENT_SECRET=votre_secret_client_oauth
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google-callback
NEXT_PUBLIC_GOOGLE_API_KEY=votre_clé_api
```

## Étape 6: Tester l'intégration

1. Redémarrez votre serveur de développement
2. Allez dans la page `/settings`
3. Cliquez sur "Connecter Google Calendar"
4. Autorisez l'application
5. Testez la synchronisation

## Dépannage

### Erreur "redirect_uri_mismatch"
- Vérifiez que l'URI dans `.env.local` correspond exactement à celle configurée dans Google Console
- Incluez le http:// ou https:// et le port si nécessaire

### Erreur "invalid_client"
- Vérifiez que votre Client ID est correct
- Assurez-vous d'utiliser le bon type d'identifiant (OAuth 2.0, pas clé API)

### Erreur "access_denied"
- L'utilisateur a refusé l'autorisation
- Vérifiez que les scopes demandés sont corrects

### Erreur 403: Forbidden
- Vérifiez que Google Calendar API est bien activée
- Vérifiez que votre clé API a les bonnes restrictions
