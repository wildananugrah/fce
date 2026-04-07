#!/bin/bash
set -e

REPO_DIR="/root/repo/fce"
DEPLOY_DIR="/var/www/html/fce"

echo "Restart Database, Minio, Monitoring"
cd "$REPO_DIR"
make down; make up

echo "Building database..."
cd "$REPO_DIR/backend"
set -a
source .env
set +a
bun install
bunx prisma db push
bunx prisma generate

echo "Building backend..."
cd "$REPO_DIR/backend"
bun install
make down; make up;

echo "Done!"
