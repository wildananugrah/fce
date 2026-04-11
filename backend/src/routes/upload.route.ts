import { Hono } from "hono";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function createUploadRoutes(storageProvider: IStorageProvider, bucket: string) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/upload", async (c) => {
		const workspaceId = c.get("workspaceId");
		const formData = await c.req.parseBody();
		const file = formData.file as File;

		if (!file) {
			return c.json({ error: "file is required" }, 400);
		}

		if (!ALLOWED_TYPES.includes(file.type)) {
			return c.json({ error: "File must be jpg, png, or webp" }, 400);
		}

		if (file.size > MAX_SIZE) {
			return c.json({ error: "File must be under 5MB" }, 400);
		}

		const ext = file.name.split(".").pop() || "jpg";
		const key = `reference-images/${workspaceId}/${crypto.randomUUID()}.${ext}`;
		const buffer = Buffer.from(await file.arrayBuffer());

		const url = await storageProvider.upload(bucket, key, buffer, file.type);
		return c.json({ url }, 201);
	});

	return app;
}
