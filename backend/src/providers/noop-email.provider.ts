import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	IEmailProvider,
	InvitationEmailInput,
} from "../interfaces/providers/email.provider.interface";

/**
 * Used when RESEND_API_KEY is not configured — logs the invitation details
 * instead of sending an email so dev environments without the key still
 * function. Never use in production.
 */
export class NoopEmailProvider implements IEmailProvider {
	constructor(private logger: ILogger) {}

	async sendInvitation(input: InvitationEmailInput): Promise<void> {
		this.logger.warn("Email provider not configured — invitation NOT sent (accept URL omitted from logs)", {
			to: input.to,
			workspaceName: input.workspaceName,
		});
	}
}
