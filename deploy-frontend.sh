#!/bin/bash
set -e

REPO_DIR="/root/repo/fce"
DEPLOY_DIR="/var/www/html/fce"

echo "Building fce frontend..."
cd "$REPO_DIR/frontend"
bun install
bun run build

echo "Deploying fce frontend..."
cp -r "$REPO_DIR/frontend/dist" "$DEPLOY_DIR/dist"

echo "Done!"
