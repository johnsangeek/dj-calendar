#!/bin/bash

PROJECT_DIR="/Users/johnsanti/DEV_LOCAL/dj-booker-pro"
APP_URL="http://localhost:3001/web"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Projet introuvable: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1

echo "========================================"
echo " DJ Booker Pro - Lancement"
echo "========================================"
echo ""

if ! command -v npm >/dev/null 2>&1; then
  echo "npm n'est pas installé. Installe Node.js puis réessaie."
  exit 1
fi

echo "[1/3] Vérification des dépendances..."
if [ ! -d "node_modules" ]; then
  echo "node_modules absent, installation en cours..."
  npm install || exit 1
fi

echo "[2/3] Ouverture de l'app dans le navigateur..."
open "$APP_URL"

echo "[3/3] Démarrage du serveur dev sur : http://localhost:3001"
echo "Appuie sur Ctrl+C pour arrêter"
echo ""

npm run dev
