import { describe, expect, it } from "bun:test";
import {
	signAccessToken,
	signRefreshToken,
	verifyAccessToken,
	verifyRefreshToken,
} from "../../src/utils/jwt";

const ACCESS_SECRET = "test-access-secret";
const REFRESH_SECRET = "test-refresh-secret";

describe("jwt", () => {
	it("should sign and verify an access token", () => {
		const payload = { userId: "user-1", email: "test@example.com", isSuperadmin: false };
		const token = signAccessToken(payload, ACCESS_SECRET, "15m");
		expect(token).toBeTruthy();
		const decoded = verifyAccessToken(token, ACCESS_SECRET);
		expect(decoded.userId).toBe("user-1");
		expect(decoded.email).toBe("test@example.com");
	});

	it("should sign and verify a refresh token", () => {
		const payload = { userId: "user-1" };
		const token = signRefreshToken(payload, REFRESH_SECRET, "7d");
		expect(token).toBeTruthy();
		const decoded = verifyRefreshToken(token, REFRESH_SECRET);
		expect(decoded.userId).toBe("user-1");
	});

	it("should reject token with wrong secret", () => {
		const token = signAccessToken(
			{ userId: "user-1", email: "test@example.com", isSuperadmin: false },
			ACCESS_SECRET,
			"15m",
		);
		expect(() => verifyAccessToken(token, "wrong-secret")).toThrow();
	});

	it("should reject expired token", () => {
		const token = signAccessToken(
			{ userId: "user-1", email: "test@example.com", isSuperadmin: false },
			ACCESS_SECRET,
			"0s",
		);
		expect(() => verifyAccessToken(token, ACCESS_SECRET)).toThrow();
	});
});
