#!/usr/bin/env pwsh
# Fast Equb - Start All Dev Servers
# Works on Windows PowerShell and PowerShell Core

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = "C:\Program Files\nodejs"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Fast Equb - Launching All Dev Servers" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Add Node to PATH if missing
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $env:PATH = "$NodePath;$env:PATH"
}

# Start Backend
Write-Host "[1/3] Starting Backend    -> http://localhost:3000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; npm run dev" -WindowStyle Normal

Start-Sleep -Milliseconds 1500

# Start Frontend
Write-Host "[2/3] Starting Frontend   -> http://localhost:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev" -WindowStyle Normal

Start-Sleep -Milliseconds 1000

# Start Admin
Write-Host "[3/3] Starting Admin      -> http://localhost:5174" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\admin'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  All servers launched!" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Backend :  http://localhost:3000" -ForegroundColor White
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "  Admin   :  http://localhost:5174" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Wait for servers to start then open browser
Write-Host "Opening browser in 4 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 4

Start-Process "http://localhost:5173"
Start-Sleep -Milliseconds 500
Start-Process "http://localhost:5174"

Write-Host "Done! Browsers opened. You can close this window." -ForegroundColor Green
Start-Sleep -Seconds 3
