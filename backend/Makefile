up:
	pm2 start pm2.config.cjs

down:
	pm2 delete pm2.config.cjs

local-up:
	set -a && source .env && set +a && bunx prisma db push && bunx prisma generate && bun run dev 