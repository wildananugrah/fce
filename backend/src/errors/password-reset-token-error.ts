/**
 * Thrown by AuthService.resetPassword when the supplied token is bad. The route
 * layer maps each `kind` to a 400 response with a human-friendly message.
 */
export type PasswordResetTokenErrorKind = "invalid" | "expired" | "consumed";

const MESSAGES: Record<PasswordResetTokenErrorKind, string> = {
	invalid: "Token is invalid",
	expired: "Token has expired",
	consumed: "Token has already been used",
};

export class PasswordResetTokenError extends Error {
	constructor(public kind: PasswordResetTokenErrorKind) {
		super(MESSAGES[kind]);
		this.name = "PasswordResetTokenError";
	}
}
