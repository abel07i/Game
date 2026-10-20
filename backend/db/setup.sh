#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  FAST DERASH — Database Setup Script
#  Usage: ./db/setup.sh [--reset]
#
#  Prerequisites:
#    - PostgreSQL 14+ installed and running
#    - psql available in PATH
#    - pgcrypto extension available
#
#  Environment Variables:
#    PGHOST     (default: localhost)
#    PGPORT     (default: 5432)
#    PGUSER     (default: postgres)
#    PGPASSWORD (set your password)
# ══════════════════════════════════════════════════════════════════════════════

set -e

DB_NAME="fastderash"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════"
echo "  Fast Derash — Database Setup"
echo "═══════════════════════════════════════════════════"

# Check for --reset flag
if [ "$1" = "--reset" ]; then
    echo ""
    echo "⚠️  WARNING: This will DROP the existing database!"
    read -p "   Are you sure? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo "   Dropping database '$DB_NAME'..."
        dropdb --if-exists "$DB_NAME"
        echo "   ✅ Database dropped"
    else
        echo "   Cancelled."
        exit 0
    fi
fi

# Create database if it doesn't exist
echo ""
echo "1. Creating database '$DB_NAME'..."
createdb "$DB_NAME" 2>/dev/null && echo "   ✅ Database created" || echo "   ℹ️  Database already exists"

# Run schema migration
echo ""
echo "2. Running schema migration..."
psql -d "$DB_NAME" -f "$SCRIPT_DIR/schema.sql" -v ON_ERROR_STOP=1
echo "   ✅ Schema applied"

# Run seed data
echo ""
echo "3. Loading seed data..."
psql -d "$DB_NAME" -f "$SCRIPT_DIR/seed.sql" -v ON_ERROR_STOP=1
echo "   ✅ Seed data loaded"

# Print summary
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Database setup complete!"
echo ""
echo "  Database: $DB_NAME"
echo "  Tables:   $(psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | tr -d ' ')"
echo "  Views:    $(psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public';" | tr -d ' ')"
echo "  Functions:$(psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='public';" | tr -d ' ')"
echo ""
echo "  Connect:  psql -d $DB_NAME"
echo "═══════════════════════════════════════════════════"
