@echo off
cd /d "%~dp0"
title LÓGOS AI Platform Launcher
echo ==============================================
echo       LÓGOS AI Platform - Startup Script
echo ==============================================

echo [0/2] Clearing legacy processes...
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul

echo [1/2] Starting Backend Services...
start "LÓGOS Backend" cmd /k "cd backend && npm run dev"
timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Interface...
start "LÓGOS Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both services have been launched in separate terminal windows.
echo - Backend: http://127.0.0.1:3008
echo - Frontend: http://localhost:5173
echo.
echo Lógos Synchronized. Welcome back, Operative.
echo.
echo Press any key to exit this launcher...
pause >nul
