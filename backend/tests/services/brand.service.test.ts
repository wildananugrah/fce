import { afterEach, describe, expect, it } from "bun:test";
import { BrandService } from "../../src/services/brand.service";
import { MockBrandRepository } from "../helpers/mock-brand.repository";

describe("BrandService", () => {
	const brandRepo = new MockBrandRepository();
	const brandService = new BrandService(brandRepo);

	afterEach(() => {
		brandRepo.clear();
	});

	describe("list", () => {
		it("should return brands for a workspace", async () => {
			const workspaceId = crypto.randomUUID();
			const otherWorkspaceId = crypto.randomUUID();

			await brandService.create(workspaceId, { name: "Brand A", slug: "brand-a" });
			await brandService.create(workspaceId, { name: "Brand B", slug: "brand-b" });
			await brandService.create(otherWorkspaceId, { name: "Other Brand", slug: "other-brand" });

			const brands = await brandService.list(workspaceId);
			expect(brands).toHaveLength(2);
			const slugs = brands.map((b) => b.slug);
			expect(slugs).toContain("brand-a");
			expect(slugs).toContain("brand-b");
		});
	});

	describe("create", () => {
		it("should create a brand", async () => {
			const workspaceId = crypto.randomUUID();
			const brand = await brandService.create(workspaceId, {
				name: "My Brand",
				slug: "my-brand",
				category: "tech",
				websiteUrl: "https://mybrand.com",
			});

			expect(brand.workspaceId).toBe(workspaceId);
			expect(brand.name).toBe("My Brand");
			expect(brand.slug).toBe("my-brand");
			expect(brand.category).toBe("tech");
			expect(brand.websiteUrl).toBe("https://mybrand.com");
			expect(brand.status).toBe("draft");
		});
	});

	describe("getById", () => {
		it("should return brand with brain versions", async () => {
			const workspaceId = crypto.randomUUID();
			const created = await brandService.create(workspaceId, {
				name: "Brain Brand",
				slug: "brain-brand",
			});
			await brandService.createBrainVersion(created.id, { personality: "Bold" });

			const brand = await brandService.getById(created.id);
			expect(brand.id).toBe(created.id);
			expect(brand.name).toBe("Brain Brand");
			expect(brand.brainVersions).toHaveLength(1);
			expect(brand.brainVersions[0].personality).toBe("Bold");
		});

		it("should throw 'Brand not found' when not found", async () => {
			await expect(brandService.getById("nonexistent-id")).rejects.toThrow("Brand not found");
		});
	});

	describe("createBrainVersion", () => {
		it("should create version with correct version number", async () => {
			const workspaceId = crypto.randomUUID();
			const brand = await brandService.create(workspaceId, {
				name: "Version Brand",
				slug: "version-brand",
			});

			const v1 = await brandService.createBrainVersion(brand.id, {
				personality: "Friendly",
				tone: "Casual",
			});
			expect(v1.version).toBe(1);
			expect(v1.brandId).toBe(brand.id);
			expect(v1.personality).toBe("Friendly");
			expect(v1.tone).toBe("Casual");

			const v2 = await brandService.createBrainVersion(brand.id, {
				personality: "Bold",
				tone: "Confident",
			});
			expect(v2.version).toBe(2);

			const v3 = await brandService.createBrainVersion(brand.id, { personality: "Playful" });
			expect(v3.version).toBe(3);
		});
	});
});
