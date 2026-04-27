import { Hono } from "hono";
import type { IOnboardingService } from "../interfaces/services/onboarding.service.interface";

type Variables = {
	userId: string;
};

export function createOnboardingRoutes(service: IOnboardingService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET /api/users/me/onboarding — returns the current flag state.
	app.get("/", async (c) => {
		const userId = c.get("userId");
		try {
			const flags = await service.getFlags(userId);
			return c.json({ data: flags });
		} catch (e) {
			if (e instanceof Error && e.message === "User not found") {
				return c.json({ error: e.message }, 404);
			}
			throw e;
		}
	});

	// PATCH /api/users/me/onboarding — partial, additive, idempotent.
	// Body fields (all optional):
	//   welcomeSeen?: true           // first dismissal wins; later calls no-op
	//   checklistDismissed?: true    // same
	//   markCoachSeen?: string       // page key — append if not present
	app.patch("/", async (c) => {
		const userId = c.get("userId");
		const body = (await c.req.json().catch(() => ({}))) as {
			welcomeSeen?: boolean;
			checklistDismissed?: boolean;
			markCoachSeen?: string;
		};
		try {
			const flags = await service.patchFlags(userId, {
				welcomeSeen: body.welcomeSeen === true ? true : undefined,
				checklistDismissed: body.checklistDismissed === true ? true : undefined,
				markCoachSeen: typeof body.markCoachSeen === "string" ? body.markCoachSeen : undefined,
			});
			return c.json({ data: flags });
		} catch (e) {
			if (e instanceof Error && e.message === "User not found") {
				return c.json({ error: e.message }, 404);
			}
			throw e;
		}
	});

	return app;
}
