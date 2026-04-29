#!/bin/bash

# Script de lancement DJ Booker Pro pour macOS
# Ce script démarre le serveur de développement et ouvre le dossier + le navigateur

echo "========================================"
echo "  DJ Booker Pro - Démarrage"
echo "========================================"
echo ""

# Obtenir le chemin du dossier du script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Tuer les processus existants sur les ports 3000-3002
echo "[1/5] Nettoyage des ports (3000-3002)..."
for port in 3000 3001 3002; do
  PID=$(lsof -ti:$port)
  if [ ! -z "$PID" ]; then
    echo "  - Arrêt du processus sur le port $port (PID: $PID)"
    kill -9 $PID 2>/dev/null
  fi
done
echo "  ✓ Ports libérés"
echo ""

# Attendre que les ports soient bien libérés
sleep 1

# Ouvrir le dossier du projet dans Finder
echo "[2/5] Ouverture du dossier du projet dans Finder..."
open .

# Attendre 1 seconde
sleep 1

# Ouvrir le navigateur sur localhost:3001
echo "[3/5] Ouverture du navigateur..."
open "http://localhost:3001"

# Attendre que le navigateur s'ouvre
sleep 1

# Lancer le serveur de développement
echo "[4/5] Démarrage du serveur de développement..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Serveur: http://localhost:3001"
echo "  Appuie sur Ctrl+C pour arrêter"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npm run dev

echo ""
echo "[5/5] Serveur arrêté"
