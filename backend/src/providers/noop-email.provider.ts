import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	IEmailProvider,
	InvitationEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";

/**
 * Used when RESEND_API_KEY is not configured — logs the email details (and
 * the verification URL, since there's no email client to copy from in dev)
 * instead of sending. Never use in production.
 */
export class NoopEmailProvider implements IEmailProvider {
	constructor(private logger: ILogger) {}

	async sendInvitation(input: InvitationEmailInput): Promise<void> {
		this.logger.warn("Email provider not configured — invitation NOT sent (accept URL omitted from logs)", {
			to: input.to,
			workspaceName: input.workspaceName,
		});
	}

	async sendVerification(input: VerificationEmailInput): Promise<void> {
		// In dev the URL IS logged so the developer can finish their own signup
		// without configuring Resend. Do not mirror this behavior in prod.
		this.logger.warn("Email provider not configured — verification URL logged for dev use", {
			to: input.to,
			verifyUrl: input.verifyUrl,
			expiryHuman: input.expiryHuman,
		});
	}
}
