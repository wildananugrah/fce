import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api, ApiError } from "../services/api";
import { DEFAULT_LANDING_PAGE } from "../config/menu-flags";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Surfaced when the server says the account exists but isn't verified.
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState("");

  // When the user lands from /verify?token=... successfully, show a short
  // confirmation that they can now log in.
  const [verifiedNotice, setVerifiedNotice] = useState<string | null>(null);
  useEffect(() => {
    if (searchParams.get("verified") === "1") {
      setVerifiedNotice("Email verified — please log in.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setVerificationRequired(false);
    setLoading(true);
    try {
      await login(email, password);
      navigate(DEFAULT_LANDING_PAGE);
    } catch (err) {
      if (err instanceof ApiError && err.body.verificationRequired === true) {
        setVerificationRequired(true);
        setUnverifiedEmail((err.body.email as string) || email);
        return;
      }
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setResending(true);
    setResentNotice("");
    try {
      await api("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      setResentNotice("A fresh verification email is on its way.");
    } catch (err) {
      setResentNotice(err instanceof Error ? err.message : "Couldn't resend. Try again later.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">Log in</h2>

          {verifiedNotice && (
            <div className="mb-4 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
              {verifiedNotice}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {verificationRequired && (
            <div className="mb-4 p-3 text-xs bg-amber-50 border border-amber-200 rounded-md space-y-2">
              <p className="text-amber-900">
                Your email <strong>{unverifiedEmail}</strong> hasn&apos;t been verified yet. Check your inbox for the verification link.
              </p>
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleResend}
                  loading={resending}
                >
                  Resend verification email
                </Button>
                {resentNotice && <span className="text-amber-800">{resentNotice}</span>}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
            <Button type="submit" className="w-full" loading={loading}>Log in</Button>
          </form>
          <p className="mt-4 text-xs text-center text-gray-500">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="text-black font-medium hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
