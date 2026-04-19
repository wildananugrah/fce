import jwt, { type SignOptions } from "jsonwebtoken";

export interface AccessTokenPayload {
	userId: string;
	email: string;
	isSuperadmin: boolean;
}

export interface RefreshTokenPayload {
	userId: string;
}

export function signAccessToken(
	payload: AccessTokenPayload,
	secret: string,
	expiry: string,
): string {
	return jwt.sign({ ...payload, jti: crypto.randomUUID() }, secret, {
		expiresIn: expiry,
	} as SignOptions);
}

export function signRefreshToken(
	payload: RefreshTokenPayload,
	secret: string,
	expiry: string,
): string {
	return jwt.sign(payload, secret, { expiresIn: expiry } as SignOptions);
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
	return jwt.verify(token, secret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string, secret: string): RefreshTokenPayload {
	return jwt.verify(token, secret) as RefreshTokenPayload;
}
