# Migration des Prospects

Ce script migre automatiquement tous les prospects Instagram de la collection `clients` vers la nouvelle collection `prospects`.

## Prérequis

1. **Télécharger la clé de service Firebase** :
   - Va sur [Firebase Console](https://console.firebase.google.com/)
   - Sélectionne ton projet
   - Va dans **Paramètres du projet** (⚙️ en haut à gauche) → **Comptes de service**
   - Clique sur **Générer une nouvelle clé privée**
   - Renomme le fichier téléchargé en `firebase-service-account.json`
   - Place-le à la racine du projet : `/Users/johnsanti/Downloads/dj-booker-pro/firebase-service-account.json`

2. **Installer firebase-admin** :
   ```bash
   npm install firebase-admin
   ```

## Exécution du script

```bash
cd /Users/johnsanti/Downloads/dj-booker-pro
node scripts/migrate-prospects.js
```

## Que fait le script ?

Le script identifie automatiquement les prospects selon ces critères :
- ✅ A un handle Instagram OU un Thread ID Instagram
- ❌ N'a PAS de SIRET + (email OU téléphone)
- ❌ N'a PAS le statut 'BOOKED'

Pour chaque prospect trouvé :
1. **Copie** le document vers la collection `prospects`
2. **Supprime** le document de la collection `clients`

## Sécurité

- Le script utilise des **batch writes** pour optimiser les performances
- Les opérations sont groupées par 250 (limite Firebase = 500 opérations/batch)
- Aucune donnée n'est perdue : tout est copié avant suppression

## Après la migration

Une fois la migration terminée :
- Les prospects seront dans `prospects` uniquement
- Les vrais clients resteront dans `clients`
- Tu pourras supprimer le fichier `firebase-service-account.json` (pour la sécurité)
- Tu pourras supprimer le dossier `scripts/` si tu n'en as plus besoin

## En cas de problème

Si quelque chose ne va pas, tu peux :
1. Vérifier les logs dans la console
2. Aller dans Firebase Console → Firestore Database
3. Restaurer manuellement depuis les backups Firebase (si activés)
