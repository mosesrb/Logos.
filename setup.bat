@echo off
cd /d "%~dp0"
title LÓGOS AI Platform Setup
echo ==============================================
echo       LÓGOS AI Platform - Setup Script
echo ==============================================
echo.
echo This script will install all necessary dependencies for LÓGOS.
echo Please ensure you have Node.js and Ollama installed before proceeding.
echo.
pause

echo.
echo [1/3] Installing Root Dependencies...
npm install

echo.
echo [2/3] Installing Backend Dependencies...
cd backend
call npm install
cd ..

echo.
echo [3/3] Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo [4/4] Launching Interactive AI Model Provisioning...
node backend/scripts/interactive_setup.js

echo.
echo ==============================================
echo       Setup Complete! Starting LÓGOS...
echo ==============================================
echo.
timeout /t 3
start start_logos.bat
exit

