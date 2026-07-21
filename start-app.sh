#!/bin/bash
# Script de lancement DJ Booker Pro pour Mac
# Ce script démarre le serveur de développement et ouvre le dossier + le navigateur

echo "========================================"
echo "  DJ Booker Pro - Démarrage"
echo "========================================"
echo

# Changer vers le dossier du projet
cd "$(dirname "$0")"

# Ouvrir le dossier du projet dans Finder
echo "[1/3] Ouverture du dossier du projet..."
open .

# Attendre 1 seconde
sleep 1

# Ouvrir le navigateur sur localhost:3001
echo "[2/3] Ouverture du navigateur..."
open "http://localhost:3001"

# Lancer le serveur de développement
echo "[3/3] Démarrage du serveur..."
echo
echo "Le serveur démarre sur http://localhost:3001"
echo "Appuie sur Ctrl+C pour arrêter le serveur"
echo

npm run dev
