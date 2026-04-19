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

export interface IEmailProvider {
	sendInvitation(input: InvitationEmailInput): Promise<void>;
	sendVerification(input: VerificationEmailInput): Promise<void>;
}
