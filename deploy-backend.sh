#!/bin/bash
set -e

REPO_DIR="/root/repo/fce"
DEPLOY_DIR="/var/www/html/fce"

echo "Building database..."
cd "$REPO_DIR/backend"
bun install
bunx prisma generate
bunx prisma db push

echo "Building backend..."
cd "$REPO_DIR/backend"
bun install
make down; make up;

echo "Done!"
