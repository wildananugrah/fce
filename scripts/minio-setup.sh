#!/bin/bash
# Sets up MinIO buckets with public-read access for uploaded files.
# Run this after MinIO starts (docker-compose up).
#
# Usage: bash scripts/minio-setup.sh

set -e

MINIO_HOST="${MINIO_ENDPOINT:-http://localhost:9002}"
MINIO_USER="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_PASS="${MINIO_SECRET_KEY:-minioadmin}"
ALIAS="fce-local"

# Install mc if not available
if ! command -v mc &> /dev/null; then
  echo "Installing MinIO client (mc)..."
  curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

echo "Configuring MinIO alias..."
mc alias set "$ALIAS" "$MINIO_HOST" "$MINIO_USER" "$MINIO_PASS"

# Create buckets if they don't exist
for BUCKET in fce-uploads fce-documents; do
  if mc ls "$ALIAS/$BUCKET" &> /dev/null; then
    echo "Bucket '$BUCKET' already exists."
  else
    echo "Creating bucket '$BUCKET'..."
    mc mb "$ALIAS/$BUCKET"
  fi

  echo "Setting public-read policy on '$BUCKET'..."
  mc anonymous set download "$ALIAS/$BUCKET"
done

echo "Done! MinIO buckets are ready."
