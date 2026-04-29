# Audit Esthétique Global — DJ Booker Pro
Date: 1 avril 2026

## 1) Base visuelle actuelle
- Police principale: `SF Pro Display`, `SF Pro Text`, fallback Apple/system.
- Fond global: gris très clair via `--background: #f5f5f7`.
- Texte par défaut: sombre (`#111827`).
- Style dominant: cartes blanches, bordures fines, arrondis marqués, ombres légères.
- Navigation: logo dégradé violet/bleu + états actifs en violet.

Fichiers de base:
- `src/app/globals.css`
- `src/components/TopNav.tsx`
- `src/components/web/WebNav.tsx`

## 2) Couleurs (inventaire global repéré dans le code)
Couleurs hex les plus présentes:
- `#F2F2F7` (44 occurrences) — bordures / séparateurs Apple-like.
- `#3B82F6` (25 occurrences) — accent bleu / fallback couleur client.
- `#FAFAFA` (20 occurrences) — fond de pages.
- `#6E6E73` (13 occurrences) — texte secondaire.
- `#1A1A1E` (8 occurrences) — texte fort / titres.
- `#8B5CF6` (4 occurrences) — accent violet (clients / CTA).

Palette Tailwind dominante:
- Neutres: `bg-white`, `bg-gray-50`, `bg-gray-100`, `text-gray-900`, `text-gray-700`, `border-gray-200`, `border-gray-300`.
- Accent principal: violet/bleu (`bg-purple-600`, `bg-purple-700`, `bg-blue-600`, `text-purple-600`).
- Statuts: vert, orange, rouge, jaune (`confirmé`, `option`, `annulé`, `remplaçant`, etc.).

## 3) Volumétrie de styles (scan du code)
Typo:
- `text-sm`: 554
- `text-gray-900`: 363
- `text-gray-700`: 234
- `text-xs`: 212
- `text-white`: 163

Backgrounds:
- `bg-white`: 160
- `bg-gray-50`: 113
- `bg-gray-100`: 103
- `bg-purple-600`: 53
- `bg-gradient-to-r`: 27
- `bg-gradient-to-br`: 16

Rounding:
- `rounded-lg`: 559
- `rounded-full`: 107
- `rounded-xl`: 92
- `rounded-2xl`: 45

Shadows:
- `shadow-sm`: 98
- `shadow-lg`: 24
- `shadow-xl`: 23
- `shadow-md`: 20
- `shadow-2xl`: 6

Bordures:
- `border-gray-300`: 117
- `border-gray-200`: 87
- `border-gray-100`: 30

## 4) Zones les plus “chargées” visuellement
Fichiers avec le plus de classes de style/couleur:
- `src/app/page.tsx` (Dashboard)
- `src/app/invoices/page.tsx`
- `src/app/web/invoices/page.tsx`
- `src/app/crm/page.tsx`
- `src/app/crm/prospection/page.tsx`
- `src/app/messages/page.tsx`

Lecture: l’app a une base pro déjà solide, mais la cohérence baisse dans les pages riches (dashboard, CRM, messages, invoices) où il y a beaucoup de variantes de couleurs et de gradients.

## 5) Composants esthétiques récurrents
- Barre top sticky translucide (`bg-white/80`, `backdrop-blur-md`).
- Cartes blanches avec bordure `#F2F2F7` et `shadow-sm`.
- Modales blanches arrondies (`rounded-xl/2xl` + `shadow-xl/2xl`).
- Pills de statut colorées (vert/jaune/orange/rouge).
- Calendrier avec pastilles couleur selon statut.

## 6) Incohérences esthétiques actuelles
- Trop de couleurs d’accent simultanées selon pages (violet, bleu, indigo, orange, vert, rose).
- Dégradés parfois décoratifs (dashboard/messages/prospection) et parfois absents.
- Intensité d’ombres variable (`shadow-sm` à `shadow-2xl`) sans règle stricte.
- Mélange de tokens Tailwind + hex hardcodés au lieu d’un système central.
- Plusieurs nuances proches pour un même rôle (ex: multiples violets pour CTA).

## 7) Direction recommandée (sobre / premium)
Objectif: “moins coloré, plus classe, plus uniforme”.

Proposition de système:
1. Accent unique produit: `blue` ou `slate` (choisir 1 seul axe pour CTA et focus).
2. Statuts garder la couleur métier:
   - Confirmé: vert
   - Option: ambre
   - Annulé: rouge
   - Remplaçant: orange
3. Réduire les gradients à 1 seul usage (logo/hero), pas dans les boutons standards.
4. Limiter les ombres à 2 niveaux:
   - Card: `shadow-sm`
   - Modal: `shadow-xl`
5. Standardiser les rayons:
   - Card: `rounded-xl`
   - Inputs/boutons: `rounded-lg`
   - Pills: `rounded-full`
6. Centraliser les tokens dans un seul fichier de thème (couleurs, radius, ombres, espacements).

## 8) Kit de refonte à donner à un designer/dev
À fournir:
- Ce document.
- Les pages clés à harmoniser en priorité:
  - `src/app/page.tsx`
  - `src/app/crm/page.tsx`
  - `src/app/crm/prospection/page.tsx`
  - `src/app/messages/page.tsx`
  - `src/app/invoices/page.tsx`
- Règle cible:
  - 1 accent principal.
  - Palette neutre gris + blanc dominante.
  - Couleur vive uniquement pour statuts et actions critiques.
