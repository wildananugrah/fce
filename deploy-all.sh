#!/bin/bash
set -e

REPO_DIR="/root/repo/fce"
DEPLOY_DIR="/var/www/html/fce"

START_TS=$(date +%s)
START_AT=$(date "+%Y-%m-%d %H:%M:%S %Z")
echo "Deploy started at: $START_AT"

# Print elapsed time on exit (success or failure)
on_exit() {
  local exit_code=$?
  local end_ts=$(date +%s)
  local end_at=$(date "+%Y-%m-%d %H:%M:%S %Z")
  local elapsed=$((end_ts - START_TS))
  local h=$((elapsed / 3600))
  local m=$(((elapsed % 3600) / 60))
  local s=$((elapsed % 60))
  printf "Deploy finished at: %s\n" "$end_at"
  printf "Elapsed: %02d:%02d:%02d (%ds)\n" "$h" "$m" "$s" "$elapsed"
  printf "Exit code: %d\n" "$exit_code"
}
trap on_exit EXIT

echo "Restart Database, Minio, Monitoring"
cd "$REPO_DIR"
make down; make up

echo "Building database..."
cd "$REPO_DIR/backend"
set -a
source .env
set +a
bun install
# Generate the Prisma client against the new schema first so the pre-push
# migration scripts below run against types matching the incoming schema.
bunx prisma generate
# Idempotent backfills that must run BEFORE `prisma db push`, because the
# new schema tightens columns that legacy rows may still violate (e.g.
# Brand.projectId NOT NULL — backfills NULLs to each workspace's Default
# project). Safe to re-run on every deploy.
# bun run scripts/migrate-rbac.ts
bunx prisma db push

echo "Building backend..."
cd "$REPO_DIR/backend"
bun install
make down; make up;

echo "Building fce frontend..."
cd "$REPO_DIR/frontend"
bun install
[ -d "$REPO_DIR/frontend/dist" ] && rm -r "$REPO_DIR/frontend/dist"
bun run build

echo "Deploying fce frontend..."
rm -rf "$DEPLOY_DIR/dist"
mkdir -p "$DEPLOY_DIR"
cp -r "$REPO_DIR/frontend/dist" "$DEPLOY_DIR/dist"

echo "Done!"
