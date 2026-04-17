import { Resend } from "resend";
import type {
	IEmailProvider,
	InvitationEmailInput,
} from "../interfaces/providers/email.provider.interface";

export class ResendEmailProvider implements IEmailProvider {
	private resend: Resend;

	constructor(
		apiKey: string,
		private from: string,
	) {
		this.resend = new Resend(apiKey);
	}

	async sendInvitation(input: InvitationEmailInput): Promise<void> {
		const subject = `${input.inviterName || input.inviterEmail} invited you to join ${input.workspaceName} on FCE Dashboard`;
		const html = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
				<h1 style="font-size: 20px; margin-bottom: 16px;">You're invited to FCE Dashboard</h1>
				<p>${escapeHtml(input.inviterName || input.inviterEmail)} invited you to join the <strong>${escapeHtml(input.workspaceName)}</strong> workspace as a <strong>${escapeHtml(input.role)}</strong>.</p>
				<p style="margin: 24px 0;">
					<a href="${input.acceptUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Invitation</a>
				</p>
				<p style="color: #666; font-size: 13px;">This invitation expires in ${escapeHtml(input.expiryHuman)}. If you don't recognise this invitation, you can safely ignore this email.</p>
				<p style="color: #999; font-size: 12px; margin-top: 24px;">Inviter: ${escapeHtml(input.inviterEmail)}</p>
			</div>
		`;

		await this.resend.emails.send({
			from: this.from,
			to: input.to,
			subject,
			html,
		});
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
