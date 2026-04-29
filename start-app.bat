@echo off
REM Script de lancement DJ Booker Pro
REM Ce script démarre le serveur de développement et ouvre le dossier + le navigateur

echo ========================================
echo   DJ Booker Pro - Demarrage
echo ========================================
echo.

REM Ouvrir le dossier du projet dans l'explorateur Windows
echo [1/3] Ouverture du dossier du projet...
start "" "%~dp0"

REM Attendre 1 seconde
timeout /t 1 /nobreak >nul

REM Ouvrir le navigateur sur localhost:3000
echo [2/3] Ouverture du navigateur...
start "" "http://localhost:3001"

REM Lancer le serveur de développement
echo [3/3] Demarrage du serveur...
echo.
echo Le serveur demarre sur http://localhost:3001
echo Appuie sur Ctrl+C pour arreter le serveur
echo.

npm run dev

pause
