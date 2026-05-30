export interface InvitationEmailInput {
	to: string;
	workspaceName: string;
	inviterName: string;
	inviterEmail: string;
	role: string;
	acceptUrl: string;
	expiryHuman: string;
}

export interface VerificationEmailInput {
	to: string;
	fullName: string | null;
	verifyUrl: string;
	expiryHuman: string;
}

export interface PasswordResetEmailInput {
	to: string;
	fullName: string | null;
	resetUrl: string;
	expiryHuman: string;
}

export interface CreditAlertEmailInput {
	to: string;
	remainingUsd: number;
	thresholdUsd: number;
}

export interface IEmailProvider {
	sendInvitation(input: InvitationEmailInput): Promise<void>;
	sendVerification(input: VerificationEmailInput): Promise<void>;
	sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;
	sendCreditAlert(input: CreditAlertEmailInput): Promise<void>;
}
