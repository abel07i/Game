# ==============================================================================
#  FAST DERASH -- Database Setup Script (PowerShell / Windows)
#
#  Usage:
#    .\db\setup.ps1               # Create database and apply schema
#    .\db\setup.ps1 -Reset        # Drop and recreate from scratch
#
#  Prerequisites:
#    - PostgreSQL 14+ installed
#    - psql.exe in PATH (or set $env:PGBIN below)
#    - pgcrypto extension available
#
#  Configure connection:
#    $env:PGHOST = "localhost"
#    $env:PGPORT = "5432"
#    $env:PGUSER = "postgres"
#    $env:PGPASSWORD = "your_password"
# ==============================================================================

param(
    [switch]$Reset
)

$ErrorActionPreference = "Stop"
$DB_NAME = "fastderash"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if PostgreSQL is installed and in PATH
if (!(Get-Command "psql" -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "  [ERROR] PostgreSQL is not installed or 'psql' is not in your PATH." -ForegroundColor Red
    Write-Host "          Please download and install PostgreSQL from:" -ForegroundColor Yellow
    Write-Host "          https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "          After installing, restart your terminal and try again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Fast Derash -- Database Setup" -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Reset if requested
if ($Reset) {
    Write-Host "  [WARNING] This will DROP the existing database!" -ForegroundColor Red
    $confirm = Read-Host "  Are you sure? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "  Dropping database '$DB_NAME'..." -ForegroundColor Yellow
        & psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>$null
        Write-Host "  [SUCCESS] Database dropped" -ForegroundColor Green
    } else {
        Write-Host "  Cancelled." -ForegroundColor Gray
        exit 0
    }
}

# Step 1: Create database
Write-Host "1. Creating database '$DB_NAME'..." -ForegroundColor Cyan
try {
    & psql -U postgres -c "CREATE DATABASE $DB_NAME;" 2>$null
    Write-Host "   [SUCCESS] Database created" -ForegroundColor Green
} catch {
    Write-Host "   [INFO] Database already exists" -ForegroundColor Gray
}

# Step 2: Run schema
Write-Host ""
Write-Host "2. Applying schema migration..." -ForegroundColor Cyan
& psql -U postgres -d $DB_NAME -f "$SCRIPT_DIR\schema.sql" -v ON_ERROR_STOP=1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [SUCCESS] Schema applied successfully" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Schema migration failed!" -ForegroundColor Red
    exit 1
}

# Step 3: Load seed data
Write-Host ""
Write-Host "3. Loading seed data..." -ForegroundColor Cyan
& psql -U postgres -d $DB_NAME -f "$SCRIPT_DIR\seed.sql" -v ON_ERROR_STOP=1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [SUCCESS] Seed data loaded" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Seed data loading failed!" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  [SUCCESS] Database setup complete!" -ForegroundColor Green
Write-Host ""

$tableCount = & psql -U postgres -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
$viewCount  = & psql -U postgres -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public';"
$funcCount  = & psql -U postgres -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='public';"

Write-Host "  Database:  $DB_NAME" -ForegroundColor White
Write-Host "  Tables:    $($tableCount.Trim())" -ForegroundColor White
Write-Host "  Views:     $($viewCount.Trim())" -ForegroundColor White
Write-Host "  Functions: $($funcCount.Trim())" -ForegroundColor White
Write-Host ""
Write-Host "  Connect:   psql -d $DB_NAME" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
