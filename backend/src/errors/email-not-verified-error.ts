/**
 * Thrown by AuthService.login when the account exists and the password is
 * correct but `emailVerifiedAt` is null. The route layer catches this and
 * returns a 403 with `{ verificationRequired: true, email }` so the frontend
 * can show a "resend verification" affordance.
 */
export class EmailNotVerifiedError extends Error {
	constructor(public email: string) {
		super("Please verify your email before signing in.");
		this.name = "EmailNotVerifiedError";
	}
}
