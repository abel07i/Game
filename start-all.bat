@echo off
title Fast Equb - Starting All Servers
echo ============================================
echo   Fast Equb - Launching All Dev Servers
echo ============================================
echo.

echo [1/3] Starting Backend (port 3000)...
start "Fast Equb - Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"

timeout /t 2 /nobreak >nul

echo [2/3] Starting Frontend (port 5173)...
start "Fast Equb - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 1 /nobreak >nul

echo [3/3] Starting Admin Dashboard (port 5174)...
start "Fast Equb - Admin" cmd /k "cd /d "%~dp0admin" && npm run dev"

echo.
echo ============================================
echo   All servers launched!
echo.
echo   Backend:   http://localhost:3000
echo   Frontend:  http://localhost:5173
echo   Admin:     http://localhost:5174
echo ============================================
echo.
echo Opening in browser in 4 seconds...
timeout /t 4 /nobreak >nul

start "" "http://localhost:5173"
start "" "http://localhost:5174"

echo Done! You can close this window.
timeout /t 3 /nobreak >nul
