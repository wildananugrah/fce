import type { PrismaClient } from "@prisma/client";
import { createMiddleware } from "hono/factory";

export function createAdminMiddleware(prisma: PrismaClient) {
	return createMiddleware(async (c, next) => {
		const userId = c.get("userId" as any);
		const user = await prisma.user.findUnique({ where: { id: userId } });

		if (!user?.isSuperadmin) {
			return c.json({ error: "Superadmin access required" }, 403);
		}

		await next();
	});
}
