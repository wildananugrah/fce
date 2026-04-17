export interface InvitationEmailInput {
	to: string;
	workspaceName: string;
	inviterName: string;
	inviterEmail: string;
	role: string;
	acceptUrl: string;
	expiryHuman: string;
}

export interface IEmailProvider {
	sendInvitation(input: InvitationEmailInput): Promise<void>;
}
