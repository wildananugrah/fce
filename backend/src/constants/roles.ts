/**
 * RBAC role + menu constants — used by middleware, guards, and the frontend
 * (via API responses). Keep this file the single source of truth.
 */

export const WORKSPACE_ROLES = {
	ADMIN: "admin",
	MEMBER: "member",
} as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[keyof typeof WORKSPACE_ROLES];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
	return value === WORKSPACE_ROLES.ADMIN || value === WORKSPACE_ROLES.MEMBER;
}

/**
 * Menu keys the MEMBER role can be granted per-project. Frontend sidebar
 * filters against these; backend guards use `requireMenu(key)`.
 *
 * AI Skills is intentionally absent — it moved into Workspace Settings and is
 * gated by workspace role, not per-project menu.
 */
export const MENU_KEYS = [
	"brand-brain",
	"product-brain",
	"topic-generator",
	"content-generator",
	"campaign-generator",
	"topic-library",
	"content-library",
	"learning-center",
	"research-hub",
	"competitor-analyzer",
] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

export function isMenuKey(value: unknown): value is MenuKey {
	return typeof value === "string" && (MENU_KEYS as readonly string[]).includes(value);
}

/** Default menu set for a brand-new project member — empty, admins grant explicitly. */
export const DEFAULT_MEMBER_MENUS: MenuKey[] = [];

/** Menu set used by the data migration to grant every existing user every menu. */
export const ALL_MEMBER_MENUS: MenuKey[] = [...MENU_KEYS];
