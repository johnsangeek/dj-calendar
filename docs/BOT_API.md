# API bot — facturation

Assistant externe (Telegram ou autre) pour gérer la facturation de DJ Booker Pro.
Toutes les routes ci-dessous exigent le même en-tête que les routes bot déjà en production.

```http
x-bot-secret: <BOT_API_SECRET>
Content-Type: application/json
```

Base : `https://dj-calendar-two.vercel.app`

Sans secret, ou si `BOT_API_SECRET` n'est pas configuré : `401 { "error": "Non autorisé" }`.

Les erreurs de validation sont des `400` :

```json
{
  "error": "Données invalides",
  "details": [{ "path": "lineItems.0.quantity", "message": "La quantité doit être supérieure à 0" }]
}
```

Un champ inconnu est refusé (`Champ non reconnu`), pour éviter qu'une typo soit ignorée.

## Conventions

- Montants en euros, nombres JSON (pas de chaînes). Arrondis au centime sur les totaux.
- Dates filtres et `paidAt` : `YYYY-MM-DD` (jour calendaire Europe/Paris, inclusif) ou ISO 8601 avec fuseau (`2026-06-15T18:00:00Z`).
- Une facture est **en retard** seulement si son échéance tombe sur un jour parisien déjà passé. Le jour même reste `unpaid` / « impayé ».
- Les listes répondent `{ "items", "total", "limit", "offset", "hasMore" }`. `limit` défaut 100, max 500.
- La recherche et les filtres se font en mémoire, comme l'écran Factures. Pas de nouvel index Firestore.
- Les numéros reprennent l'algorithme admin existant : `F2026-0001`, `D2026-0001`, `AV2026-0001`.
- Il n'y a **pas** de suppression. Une facture émise se corrige (`PATCH`) tant qu'elle n'est pas payée, s'annule, ou se contre par un avoir.
- Le PDF n'est pas régénéré par ces routes JSON. `POST /api/bot/invoice/resend` relit le document stocké et renvoie le PDF.

Le statut de paiement renvoyé par l'API est calculé. Il n'existe pas de collection `payments` : enregistrer un paiement passe la facture à `PAID` et pose `paidAt`, comme le bouton « Payée ». Le champ stocké `totals.balanceDue` n'est pas remis à zéro ; `payment.remainingAmount` vaut `0` une fois payée.

```json
"payment": {
  "status": "overdue",
  "label": "en retard",
  "remainingAmount": 450,
  "currency": "EUR",
  "dueDate": "2026-05-01T22:00:00.000Z",
  "paidAt": null
}
```

`payment.status` : `paid`, `unpaid`, `overdue`, `draft`, `cancelled`, `credited`, ou `not_applicable` (devis et avoir).

## Routes déjà en place

Ces routes ne changent pas de contrat.

### `POST /api/bot/invoice`

Crée une **facture** PDF à partir d'une prestation (`bookingId` seul, prix obligatoire, statut `PENDING_PAYMENT`) et renvoie le binaire PDF. Ce n'est pas du JSON. En-têtes de réponse : `X-Invoice-Number`, `X-Invoice-Id`.

```json
{ "bookingId": "abc123" }
```

Cette route ne crée pas de devis.

### `POST /api/bot/invoice/resend`

Régénère le PDF d'un document déjà stocké, sans nouveau numéro.

```json
{ "invoiceId": "abc123" }
```

`number` peut remplacer `invoiceId`. Réponse : PDF.

### `POST /api/bot/invoice/send-email`

Envoie le PDF par Gmail.

```json
{ "invoiceId": "abc123", "message": "Texte optionnel du mail" }
```

```json
{ "success": true, "messageId": "...", "sentTo": "client@example.com" }
```

### `POST /api/bot/gmail-send-plain`

Mail simple, sans facture.

```json
{ "to": "client@example.com", "subject": "Objet", "html": "<p>Bonjour</p>" }
```

```json
{ "success": true, "messageId": "..." }
```

## Clients

Champs d'identité utiles à la facture. Les champs Instagram existants ne sont ni lus ni écrasés.

### `GET /api/bot/clients`

Query : `q` (nom, enseigne, email, téléphone, ville, adresse, SIRET, alias), `limit`, `offset`.

```json
{
  "items": [
    {
      "id": "client123",
      "name": "Salle Pleyel",
      "professionalName": null,
      "tradeName": null,
      "email": "booker@example.com",
      "altEmails": [],
      "phone": "0600000000",
      "address": "252 rue du Faubourg Saint-Honoré",
      "postalCode": "75008",
      "city": "Paris",
      "siret": "12345678900012",
      "notes": null,
      "defaultRate": 800,
      "clientType": "pro",
      "color": "#3B82F6",
      "eventAliases": [],
      "createdAt": "2026-04-01T10:00:00.000Z",
      "updatedAt": "2026-04-01T10:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0,
  "hasMore": false
}
```

### `GET /api/bot/clients/{id}`

Même objet qu'un élément de la liste. `404` si absent.

### `POST /api/bot/clients`

`name` est requis. `email` et `primaryEmail` sont le même champ (les deux sont enregistrés, comme le formulaire). SIRET : 14 chiffres, espaces acceptés.

```json
{
  "name": "Salle Pleyel",
  "email": "booker@example.com",
  "phone": "0600000000",
  "city": "Paris",
  "siret": "123 456 789 00012",
  "defaultRate": 800,
  "clientType": "pro"
}
```

Réponse `201` : le client créé.

### `PATCH /api/bot/clients/{id}`

Uniquement les champs à changer. `null` efface un champ optionnel (`email`, `phone`, `siret`, `defaultRate`, `notes`…). Au moins un champ. Le nom vide est refusé.

```json
{ "defaultRate": 900, "city": "Lyon" }
```

Réponse `200` : le client à jour.

## Prestations

Lecture seule, pour facturer à partir d'un booking. La création de prestation reste dans l'application.

### `GET /api/bot/bookings`

Query :

| Paramètre | Rôle |
| --- | --- |
| `clientId` | Prestations de ce client |
| `status` | `option`, `confirmé`, `annulé`, `terminé`, `remplaçant` (plusieurs valeurs séparées par des virgules ; les formes sans accent sont acceptées) |
| `from`, `to` | Sur la date de début |
| `q` | Titre, client, lieu, notes |
| `invoiced` | `true` ou `false`. `true` = facture active (`ISSUED`, `PENDING_PAYMENT`, `PAID`) ou `invoicedExternally`. Un brouillon, une annulation ou un avoir ne comptent pas. |

Tri : début le plus récent d'abord.

```json
{
  "items": [
    {
      "id": "booking123",
      "title": "Soirée Pleyel",
      "clientId": "client123",
      "clientName": "Salle Pleyel",
      "displayName": null,
      "start": "2026-06-20T20:00:00.000Z",
      "end": "2026-06-21T02:00:00.000Z",
      "location": "Paris",
      "notes": null,
      "price": 800,
      "deposit": 0,
      "status": "confirmé",
      "invoicedExternally": false,
      "invoiced": false,
      "linkedDocuments": [],
      "createdAt": "2026-04-02T10:00:00.000Z",
      "updatedAt": "2026-04-02T10:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0,
  "hasMore": false
}
```

### `GET /api/bot/bookings/{id}`

Même objet. `404` : `{ "error": "Prestation introuvable" }`.

## Factures et devis

Les devis, factures et avoirs vivent dans la collection `invoices`, distingués par `documentType` : `QUOTE`, `INVOICE`, `CREDIT_NOTE`.

`actions` indique ce que les règles de l'application autorisent encore sur ce document.

### `GET /api/bot/invoices`

Query : `clientId`, `status` (`DRAFT`, `ISSUED`, `PENDING_PAYMENT`, `PAID`, `CANCELLED`, `CREDITED`, `CONVERTED`), `documentType` (`INVOICE`, `QUOTE`, `CREDIT_NOTE`), `from`, `to` (sur la date d'émission, sinon la date de création), `q`, `number` (numéro exact, y compris un ancien `legacyInvoiceNumber`), `payment` (`paid`, `unpaid`, `overdue`, `open`).

`payment=open` = impayé ou en retard. `payment=unpaid` exclut les retards.

Chaque élément a la même forme que le détail ci-dessous.

### `GET /api/bot/invoices/{id}`

```json
{
  "id": "inv123",
  "number": "F2026-0014",
  "documentType": "INVOICE",
  "status": "PENDING_PAYMENT",
  "clientId": "client123",
  "bookingId": "booking123",
  "bookingIds": ["booking123"],
  "clientSnapshot": {
    "displayName": "Salle Pleyel",
    "contactName": "Salle Pleyel",
    "email": "booker@example.com",
    "phone": null,
    "address": null,
    "postalCode": null,
    "city": "Paris",
    "siret": null,
    "vatNumber": null,
    "iban": null
  },
  "vendorSnapshot": {
    "displayName": "DJ Example",
    "contactName": "Example",
    "email": "dj@example.com",
    "phone": null,
    "address": null,
    "postalCode": null,
    "city": null,
    "siret": null,
    "vatNumber": null,
    "iban": null,
    "stageName": null,
    "taxRate": 0,
    "codeAPE": null,
    "legalStatus": "Auto-entrepreneur"
  },
  "lineItems": [
    {
      "id": "booking-booking123",
      "description": "Soirée Pleyel - Paris\nDate : samedi 20 juin 2026",
      "quantity": 1,
      "unitPrice": 800,
      "total": 800,
      "taxRate": null,
      "taxAmount": null,
      "serviceId": null
    }
  ],
  "totals": {
    "currency": "EUR",
    "subtotal": 800,
    "taxRate": null,
    "taxAmount": 0,
    "total": 800,
    "depositApplied": 0,
    "balanceDue": 800
  },
  "currency": "EUR",
  "servicePeriod": { "start": "2026-06-20T20:00:00.000Z", "end": "2026-06-21T02:00:00.000Z" },
  "servicePeriods": [],
  "issueDate": "2026-06-21T10:00:00.000Z",
  "dueDate": "2026-07-21T10:00:00.000Z",
  "paymentTerms": {
    "dueDate": "2026-07-21T10:00:00.000Z",
    "paymentMethod": "Virement bancaire",
    "penaltyRate": 11.62,
    "penaltyDescription": "En cas de retard de paiement, des pénalités seront appliquées au taux légal en vigueur (taux BCE + 10 points)."
  },
  "paymentMethod": "Virement bancaire",
  "payment": {
    "status": "unpaid",
    "label": "impayé",
    "remainingAmount": 800,
    "currency": "EUR",
    "dueDate": "2026-07-21T10:00:00.000Z",
    "paidAt": null
  },
  "paidAt": null,
  "cancelledAt": null,
  "notes": "TVA non applicable – article 293B du CGI",
  "source": "booking",
  "issuedBy": "bot",
  "creditedInvoiceId": null,
  "convertedToInvoiceId": null,
  "convertedFromQuoteId": null,
  "emailSentAt": null,
  "emailSentTo": null,
  "legacyInvoiceNumber": null,
  "pdfStoragePath": null,
  "actions": {
    "markAsPaid": true,
    "convertToInvoice": false,
    "createCreditNote": false,
    "edit": true,
    "cancel": true
  },
  "createdAt": "2026-06-21T10:00:00.000Z",
  "updatedAt": "2026-06-21T10:00:00.000Z"
}
```

`404` : `{ "error": "Document introuvable" }`.

### `POST /api/bot/quotes`

Crée un devis. Par défaut statut `ISSUED` et numéro `D…`. `status: "DRAFT"` n'attribue pas de numéro.

Corps : `clientId` et/ou `bookingId` / `bookingIds`, ou `clientName` + `lineItems`. Au moins des lignes **ou** une prestation, et un client identifiable (id, nom, ou client porté par la prestation).

```json
{
  "clientId": "client123",
  "bookingId": "booking123",
  "notes": "Valable 30 jours",
  "paymentMethod": "Virement bancaire"
}
```

Sans lignes, une ligne est construite depuis la prestation. Prix retenu, dans l'ordre : `booking.price`, puis `client.defaultRate` (tarif habituel), puis la moyenne des prestations du client, puis le tarif de base des paramètres. L'écran Factures, lui, ne consulte pas encore `defaultRate` : il passe directement de la moyenne au tarif de base. La TVA vient de `settings/dj_info`, pas du corps. Si le taux est 0, la mention « TVA non applicable – article 293B du CGI » est ajoutée aux notes.

`dueInDays` est refusé sur un devis.

Réponse `201` : le devis, plus `warnings` (tableau, éventuellement vide). Exemples : prestation annulée, déjà liée à une facture active, prix estimé.

### `POST /api/bot/invoices`

Même corps qu'un devis, plus `dueInDays` (défaut 30). Une facture émise est créée en `PENDING_PAYMENT`, comme le formulaire. Un brouillon reste `DRAFT` sans numéro.

```json
{
  "clientId": "client123",
  "lineItems": [
    { "description": "Prestation DJ", "quantity": 1, "unitPrice": 800 }
  ]
}
```

Réponse `201` : la facture, avec `warnings`.

Pour un PDF immédiat à partir d'un seul booking, la route historique `POST /api/bot/invoice` reste le bon appel. Elle exige un prix sur la prestation et ne renvoie pas de JSON.

### `PATCH /api/bot/invoices/{id}`

Corrige un document encore modifiable (`DRAFT`, `ISSUED` ou `PENDING_PAYMENT`), sauf un avoir. Le numéro, le type et l'échéance d'un document déjà émis ne changent pas.

```json
{
  "notes": "Adresse corrigée",
  "lineItems": [{ "description": "Prestation DJ", "quantity": 1, "unitPrice": 750 }],
  "bookingIds": ["booking123"]
}
```

`{ "status": "ISSUED" }` sur un brouillon l'émet : numéro, date d'émission, et pour une facture passage en `PENDING_PAYMENT` avec échéance. Un document émis ne peut pas redevenir brouillon (`409`).

Renvoyer `lineItems`, ou émettre un brouillon, recalcule les totaux avec le taux de TVA courant. Un `PATCH` qui ne touche que les notes ou le client ne change pas les montants. Les acomptes (`depositApplied`) déjà enregistrés sont conservés.

Réponse `200` : le document. `warnings` n'est présent que s'il y a quelque chose à signaler.

### `POST /api/bot/quotes/{id}/convert`

Convertit un devis `ISSUED` non déjà converti. Crée une facture `PENDING_PAYMENT` (nouveau numéro `F…`, échéance J+30) et passe le devis à `CONVERTED`.

Pas de corps. Réponse `201` :

```json
{
  "quote": { "id": "quote123", "status": "CONVERTED", "convertedToInvoiceId": "inv999" },
  "invoice": { "id": "inv999", "documentType": "INVOICE", "status": "PENDING_PAYMENT", "convertedFromQuoteId": "quote123" }
}
```

Les objets complets ont la forme du détail. `409` si le devis est un brouillon, déjà converti, ou n'est pas un devis.

### `POST /api/bot/invoices/{id}/payment`

Règlement intégral. Corps optionnel. Sans `amount`, le reste dû est soldé. Avec `amount`, il doit être égal au reste dû, sinon `400` « Paiement partiel non pris en charge ». Il n'y a pas d'échéancier ni de paiements multiples dans le modèle actuel.

```json
{ "paidAt": "2026-06-22", "paymentMethod": "Virement bancaire" }
```

Réponse `200` : la facture, `status: "PAID"`, `payment.status: "paid"`, `payment.remainingAmount: 0`.

`409` si elle est déjà payée, si c'est un devis, ou si elle n'est pas émise / en attente.

### `POST /api/bot/invoices/{id}/cancel`

Annule un document `ISSUED` ou `PENDING_PAYMENT` (facture ou devis), comme le bouton « Annuler ». Le document reste en base, `status: "CANCELLED"`. Pas de corps.

Une facture payée ne s'annule pas : `409`, il faut un avoir.

### `POST /api/bot/invoices/{id}/credit-note`

Crée un avoir `AV…` et passe la facture d'origine à `CREDITED`.

Pas de corps. Réponse `201` :

```json
{
  "creditNote": { "id": "av123", "documentType": "CREDIT_NOTE", "number": "AV2026-0003", "creditedInvoiceId": "inv123" },
  "invoice": { "id": "inv123", "status": "CREDITED", "creditedInvoiceId": "av123" }
}
```

Comme dans l'écran Factures, `creditedInvoiceId` n'a pas le même sens des deux côtés : sur l'avoir il pointe vers la facture d'origine ; sur la facture d'origine il est ensuite remplacé par l'id de l'avoir. C'est ce qui empêche un second avoir.

Règle actuelle de l'application : l'avoir n'est permis que pour une facture `ISSUED` ou `PAID`, sans avoir déjà lié. Une facture fraîchement émise est en `PENDING_PAYMENT` : elle se corrige par `PATCH` ou s'annule, elle ne prend pas d'avoir tant qu'elle n'est pas payée (ou dans l'ancien statut `ISSUED`).

## Hors périmètre

- Pas de `DELETE` sur les clients, les factures ou les devis.
- Pas de création ni de modification de prestation.
- Pas d'envoi d'email nouveau : réutiliser `send-email` et `gmail-send-plain`.
- Pas de paiement partiel, et `totals.balanceDue` n'est pas recalculé au moment du paiement.
- Le logo n'est pas renvoyé dans le JSON. Il reste dans le document Firestore et sur le PDF.
