#!/bin/bash
set -e

REPO_DIR="/root/repo/fce"
DEPLOY_DIR="/var/www/html/fce"

echo "Building fce frontend..."
cd "$REPO_DIR/frontend"
bun install
[ -d "$REPO_DIR/frontend/dist" ] && rm -r "$REPO_DIR/frontend/dist"
bun run build

echo "Deploying fce frontend..."
[ -d "$DEPLOY_DIR/" ] && rm -r "$DEPLOY_DIR/"
cp -r "$REPO_DIR/frontend/dist" "$DEPLOY_DIR/dist"

echo "Done!"
