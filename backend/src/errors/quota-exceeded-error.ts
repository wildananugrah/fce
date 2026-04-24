/**
 * Thrown when a user tries to create a resource beyond the quota configured
 * on their User record (maxWorkspaces, maxProjects). The route layer catches
 * this and returns 403 with { quotaExceeded: true, resource, limit, current }
 * so the frontend can show an upgrade-prompt or contact-admin message.
 */
export class QuotaExceededError extends Error {
	constructor(
		public resource: "workspaces" | "projects",
		public limit: number,
		public current: number,
	) {
		super(
			`You have reached your ${resource} limit (${current} / ${limit}). ` +
				"Ask an administrator to raise your quota.",
		);
		this.name = "QuotaExceededError";
	}
}
