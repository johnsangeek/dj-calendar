# 🎯 Guide d'utilisation du CRM DJ Booker Pro

## Vue d'ensemble

Le CRM (Customer Relationship Management) de DJ Booker Pro vous permet de gérer intelligemment votre portefeuille client et de maximiser votre chiffre d'affaires en réactivant les clients inactifs.

## 📥 Import des données CSV

### Étape 1 : Préparer vos fichiers CSV

Vous avez 2 fichiers à importer dans cet ordre :

1. **clients_dj_clean.csv** - Contient vos 25 clients avec leurs statistiques
2. **prestations_dj_clean.csv** - Contient les 276 prestations détaillées

Ces fichiers se trouvent dans : `/Users/johnsanti/Downloads/Sauvegarde FDF 2026-01-14-00h46/`

### Étape 2 : Importer les données

1. Accédez à la page **CRM** depuis le menu principal
2. Dans la section "Import CSV" en haut de la page :
   - Cliquez sur "Clients CSV" et sélectionnez `clients_dj_clean.csv`
   - Attendez la confirmation d'import (vous verrez "✅ X clients importés")
   - Cliquez sur "Prestations CSV" et sélectionnez `prestations_dj_clean.csv`
   - Attendez la confirmation d'import (vous verrez "✅ X prestations importées")
3. Si besoin, cliquez sur "Recalculer segmentations" pour mettre à jour les badges

## 🎯 Segmentation automatique des clients

Le système classe automatiquement vos clients en 4 catégories :

### 🌟 Clients VIP (à chouchouter)

**Critères automatiques :**
- ≥ 10 prestations réalisées OU
- ≥ 5000€ de CA généré OU
- Client actif (< 90 jours) avec ≥ 5 prestations

**Exemples de vos clients :**
- ISTRES PROVENCE HANDBALL : 32 prestations, 4,580€
- Gergom Events : 19 prestations, 16,308€
- ROOFTOP EMBRUN : 8 prestations, 3,700€

**Badge affiché :** 🟡 VIP

### ⚠️ Clients à relancer (inactifs > 1 an)

**Critères automatiques :**
- Dernière prestation > 365 jours (1 an)
- Ont déjà travaillé avec vous

**Exemples de vos clients :**
- YELLOW MONKEYS : 932 jours d'inactivité, 7 prestations, 2,450€
- GABRIELE REINE : 1,052 jours, 1 prestation
- TENNIS CLUB DE GRANS : 631 jours, 2 prestations

**Badge affiché :** 🔴 À relancer

**Potentiel réactivation :** Le système calcule automatiquement le CA potentiel basé sur l'historique

### 🔄 Clients en veille (90-365 jours)

**Critères automatiques :**
- Dernière prestation entre 90 et 365 jours
- Clients réguliers qui ont ralenti

**Badge affiché :** 🟠 En veille

### ✅ Clients actifs (< 90 jours)

**Critères automatiques :**
- Dernière prestation < 90 jours
- Relation commerciale en cours

**Badge affiché :** 🟢 Actif

## 📊 Dashboard CRM - Vue d'ensemble

En haut de la page CRM, vous avez une vue globale :

```
┌─────────────────────────────────────────┐
│ 📊 VUE D'ENSEMBLE                       │
├─────────────────────────────────────────┤
│ • 25 clients totaux                     │
│ • X VIP (à chouchouter)                 │
│ • X actifs (< 90 jours)                 │
│ • X à relancer (> 1 an)                 │
│ • CA total : 48,752€                    │
│ • 276 prestations réalisées             │
└─────────────────────────────────────────┘
```

## 🌟 Section "Top Clients VIP"

### Tri des clients

Utilisez les boutons en haut à droite pour trier par :
- **Prestations** (défaut) : Nombre de prestations réalisées
- **CA** : Chiffre d'affaires total généré
- **Dernière collab** : Date de la dernière collaboration

### Informations affichées

Pour chaque client VIP :
- Nom du client avec pastille de couleur
- Badges : VIP + statut (Actif/En veille/À relancer)
- Nombre de prestations
- CA total généré
- Date dernière collaboration + temps écoulé
- Fourchette de tarifs (min - max)

### Actions disponibles

- **Contacter** : Ouvre le générateur d'email avec template adapté
- **Nouveau RDV** : Crée un nouveau booking (à implémenter)
- **Stats** : Voir détails complets (à implémenter)

## ⚠️ Section "Clients à relancer" (PRIORITAIRE)

### Tri automatique par priorité

Le système calcule un score de priorité basé sur :
1. VIP ou non (priorité max)
2. Nombre de prestations historiques
3. CA historique généré
4. Temps d'inactivité

### Informations affichées

- Temps d'inactivité (jours/mois/années)
- Historique : nombre de prestations + CA
- **Potentiel réactivation** : Estimation du CA potentiel

### Actions disponibles

- **Relancer** : Ouvre le générateur d'email avec template VIP ou Standard
- **Ajouter note** : (à implémenter)
- **Relancer tous les VIP inactifs** (bouton en haut) : Action de masse

## 📧 Générateur d'emails de relance

### Templates disponibles

Le système propose 3 templates pré-remplis :

#### 1. Template VIP inactif
**Utilisé pour :** Clients VIP qui n'ont pas été contactés depuis longtemps

**Sujet :** "On se retrouve bientôt ? 🎵"

**Contenu :**
- Rappel du temps d'inactivité
- Mention des collaborations passées
- Nouveautés matériel/services
- Proposition de conditions préférentielles

#### 2. Template Standard (client régulier)
**Utilisé pour :** Clients non-VIP inactifs

**Sujet :** "Nouveautés et disponibilités - DJ Pro"

**Contenu :**
- Nouvelles prestations et matériel
- Rappel de l'historique
- Invitation à échanger

#### 3. Template Rappel doux
**Utilisé pour :** Clients en veille (90-365 jours)

**Sujet :** "Des projets en vue ?"

**Contenu :**
- Prise de nouvelles
- Message non intrusif
- Disponibilité pour échanger

### Utilisation du générateur

1. Cliquez sur un bouton "Contacter" ou "Relancer"
2. Le template s'ouvre pré-rempli avec :
   - Les stats du client (rappel)
   - Le sujet adapté
   - Le corps du message personnalisé
3. **Personnalisez** le message si besoin
4. Choisissez une action :
   - **Copier** : Copie l'email dans le presse-papiers
   - **Envoyer** : (à connecter avec votre service d'email)

### Stats du client (affichées dans le modal)

- Nombre de prestations
- CA total
- Dernière collaboration
- Jours d'inactivité

## 🔄 Workflow recommandé

### Étape 1 : Import initial
1. Importez vos 2 CSV (clients puis prestations)
2. Vérifiez que tout est bien importé dans la vue d'ensemble

### Étape 2 : Relancer les VIP inactifs (PRIORITÉ 1)
1. Allez dans "Clients à relancer"
2. Identifiez les VIP (badge jaune)
3. Cliquez sur "Relancer" pour chacun
4. Personnalisez et envoyez l'email

**Objectif :** Réactiver vos meilleurs clients

### Étape 3 : Relancer les clients réguliers inactifs (PRIORITÉ 2)
1. Dans "Clients à relancer", ciblez les non-VIP avec bon historique (5+ prestations)
2. Utilisez le template "Standard"
3. Envoyez les emails

**Objectif :** Maximiser le taux de réactivation

### Étape 4 : Rappels doux pour clients en veille (PRIORITÉ 3)
1. Allez dans "Clients en veille"
2. Cliquez sur "Rappel doux"
3. Envoyez un message non intrusif

**Objectif :** Maintenir le lien avant qu'ils ne deviennent inactifs

### Étape 5 : Chouchouter les VIP actifs
1. Dans "Top Clients VIP", vérifiez les clients actifs
2. Proposez-leur de nouveaux RDV
3. Offrez des conditions préférentielles

**Objectif :** Fidéliser vos meilleurs clients

## 📈 Indicateurs à suivre

### KPIs principaux
- **Taux de réactivation** : Nombre de clients relancés qui répondent
- **CA réactivation** : Chiffre d'affaires généré par les relances
- **Durée moyenne d'inactivité** : Avant qu'un client ne revienne

### Objectifs recommandés
- Réactiver au moins 30% des VIP inactifs dans les 3 mois
- Réactiver 20% des clients réguliers inactifs
- Maintenir les clients actifs (< 90 jours) au-dessus de 40%

## 🔮 Fonctionnalités futures (Phase 2 & 3)

### Phase 2 (à venir)
- Système de notes par client
- Historique détaillé des prestations par client
- Tracking des relances (date envoi, réponse ou non)
- Intégration avec service d'email (SendGrid, Mailgun, etc.)

### Phase 3 (bonus)
- Graphiques d'évolution du CA
- Prédictions de réactivation (IA)
- Alertes automatiques (email hebdo "X clients à relancer")
- Export/rapport PDF
- Dashboard analytics complet

## 💡 Conseils d'utilisation

### Bonnes pratiques
1. **Importez régulièrement** vos nouvelles prestations pour garder les stats à jour
2. **Personnalisez** toujours les emails générés (ne pas envoyer en brut)
3. **Suivez** vos relances dans un fichier externe en attendant le tracking intégré
4. **Priorisez** les VIP : ils représentent souvent 80% de votre CA
5. **Soyez patient** : la réactivation prend du temps (2-4 semaines)

### Erreurs à éviter
- Ne pas spammer les clients (max 1 relance/mois)
- Ne pas envoyer le même message à tous
- Ne pas oublier les clients en veille (rappel doux tous les 2 mois)
- Ne pas négliger les VIP actifs (maintenir le contact)

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez le format de vos CSV
2. Utilisez "Recalculer segmentations" si les badges sont incorrects
3. Vérifiez la console du navigateur pour les erreurs
4. Contactez le support technique

## 📝 Notes importantes

- Les données sont stockées dans **Firestore** (base de données Firebase)
- Les segmentations sont **automatiques** mais peuvent être recalculées
- Les emails ne sont **pas encore envoyés automatiquement** (copier/coller pour l'instant)
- La date actuelle de référence : **14 janvier 2026**

---

**Bon CRM et bon business ! 🎵💰**
