up:
	bun install && set -a && source .env && set +a && bunx prisma db push && bunx prisma generate && pm2 start pm2.config.cjs

down:
	pm2 delete pm2.config.cjs

dev-up:
	bun install && set -a && source .env && set +a && bunx prisma db push && bunx prisma generate && bun run dev 