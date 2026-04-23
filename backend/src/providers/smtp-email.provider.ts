import nodemailer, { type Transporter } from "nodemailer";
import type {
	IEmailProvider,
	InvitationEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export interface SmtpConfig {
	host: string;
	port: number;
	/**
	 * Implicit TLS (port 465): `true`.
	 * STARTTLS (port 587, what Mailjet/Gmail use): `false`.
	 */
	secure: boolean;
	user: string;
	pass: string;
}

/**
 * Generic SMTP email provider. Works with Mailjet (`in-v3.mailjet.com:587`),
 * Google SMTP (`smtp.gmail.com:587` — use an app password), AWS SES SMTP,
 * Mailgun SMTP, and anything else speaking SMTP. HTML templates match the
 * Resend provider verbatim so switching providers doesn't change what the
 * recipient sees.
 */
export class SmtpEmailProvider implements IEmailProvider {
	private transporter: Transporter;

	constructor(
		config: SmtpConfig,
		private from: string,
		private logger: ILogger,
	) {
		this.transporter = nodemailer.createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: { user: config.user, pass: config.pass },
		});
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

		await this.send(
			{ to: input.to, subject, html },
			{ kind: "invitation", to: input.to },
		);
	}

	async sendVerification(input: VerificationEmailInput): Promise<void> {
		const greeting = input.fullName ? `Hi ${escapeHtml(input.fullName)},` : "Hi there,";
		const subject = "Verify your email for FCE Dashboard";
		const html = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
				<h1 style="font-size: 20px; margin-bottom: 16px;">Confirm your email</h1>
				<p>${greeting}</p>
				<p>Thanks for signing up for FCE Dashboard. Click the button below to verify your email — it's how we know the address belongs to you.</p>
				<p style="margin: 24px 0;">
					<a href="${input.verifyUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify email</a>
				</p>
				<p style="color: #666; font-size: 13px;">This link expires in ${escapeHtml(input.expiryHuman)}. If the button doesn't work, paste this URL into your browser:</p>
				<p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${input.verifyUrl}" style="color: #4f46e5;">${input.verifyUrl}</a></p>
				<p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't sign up, you can safely ignore this email — no account will be activated.</p>
			</div>
		`;

		await this.send(
			{ to: input.to, subject, html },
			{ kind: "verification", to: input.to },
		);
	}

	private async send(
		payload: { to: string; subject: string; html: string },
		context: { kind: "invitation" | "verification"; to: string },
	): Promise<void> {
		try {
			const info = await this.transporter.sendMail({
				from: this.from,
				to: payload.to,
				subject: payload.subject,
				html: payload.html,
			});
			this.logger.info("SMTP accepted email", {
				kind: context.kind,
				to: context.to,
				messageId: info.messageId,
				response: info.response,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error("SMTP rejected email send", {
				kind: context.kind,
				to: context.to,
				from: this.from,
				errorMessage: msg,
			});
			throw new Error(`SMTP ${context.kind} send failed: ${msg}`);
		}
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
