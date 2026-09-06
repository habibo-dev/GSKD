#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_DIR="$(mktemp -d)/autostock-smoke"

echo "Typecheck…"
npm run typecheck

echo "Lint…"
npm run lint

echo "Test de fumée (PGlite temporaire)…"
DATABASE_URL="pglite://${DB_DIR}" npx tsx scripts/smoke-test.ts

echo "Test de fumée OK."
