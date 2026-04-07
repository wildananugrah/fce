import { afterEach, describe, expect, it } from "bun:test";
import { ProductService } from "../../src/services/product.service";
import { MockProductRepository } from "../helpers/mock-product.repository";

describe("ProductService", () => {
	const productRepo = new MockProductRepository();
	const productService = new ProductService(productRepo);

	afterEach(() => {
		productRepo.clear();
	});

	describe("list", () => {
		it("should return products for a workspace", async () => {
			const workspaceId = crypto.randomUUID();
			const otherWorkspaceId = crypto.randomUUID();
			const brandId = crypto.randomUUID();

			await productService.create(workspaceId, { brandId, name: "Product A", slug: "product-a" });
			await productService.create(workspaceId, { brandId, name: "Product B", slug: "product-b" });
			await productService.create(otherWorkspaceId, {
				brandId,
				name: "Other Product",
				slug: "other-product",
			});

			const products = await productService.list(workspaceId);
			expect(products).toHaveLength(2);
			const slugs = products.map((p) => p.slug);
			expect(slugs).toContain("product-a");
			expect(slugs).toContain("product-b");
		});
	});

	describe("create", () => {
		it("should create a product", async () => {
			const workspaceId = crypto.randomUUID();
			const brandId = crypto.randomUUID();

			const product = await productService.create(workspaceId, {
				brandId,
				name: "My Product",
				slug: "my-product",
				type: "saas",
			});

			expect(product.workspaceId).toBe(workspaceId);
			expect(product.brandId).toBe(brandId);
			expect(product.name).toBe("My Product");
			expect(product.slug).toBe("my-product");
			expect(product.type).toBe("saas");
			expect(product.status).toBe("draft");
		});
	});

	describe("getById", () => {
		it("should return product with brain versions", async () => {
			const workspaceId = crypto.randomUUID();
			const brandId = crypto.randomUUID();
			const created = await productService.create(workspaceId, {
				brandId,
				name: "Brain Product",
				slug: "brain-product",
			});
			await productService.createBrainVersion(created.id, { usp: "Unique value" });

			const product = await productService.getById(created.id);
			expect(product.id).toBe(created.id);
			expect(product.name).toBe("Brain Product");
			expect(product.brainVersions).toHaveLength(1);
			expect(product.brainVersions[0].usp).toBe("Unique value");
		});

		it("should throw 'Product not found' when not found", async () => {
			await expect(productService.getById("nonexistent-id")).rejects.toThrow("Product not found");
		});
	});

	describe("createBrainVersion", () => {
		it("should create version with correct version number", async () => {
			const workspaceId = crypto.randomUUID();
			const brandId = crypto.randomUUID();
			const product = await productService.create(workspaceId, {
				brandId,
				name: "Version Product",
				slug: "version-product",
			});

			const v1 = await productService.createBrainVersion(product.id, {
				usp: "USP v1",
				targetAudience: "Developers",
			});
			expect(v1.version).toBe(1);
			expect(v1.productId).toBe(product.id);
			expect(v1.usp).toBe("USP v1");
			expect(v1.targetAudience).toBe("Developers");

			const v2 = await productService.createBrainVersion(product.id, { usp: "USP v2" });
			expect(v2.version).toBe(2);

			const v3 = await productService.createBrainVersion(product.id, { usp: "USP v3" });
			expect(v3.version).toBe(3);
		});
	});
});
