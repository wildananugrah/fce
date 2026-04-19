import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // "Check your email" state after a pending-verification signup.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const outcome = await signup(email, password, fullName || undefined);
      if (outcome.verificationRequired) {
        setPendingEmail(outcome.email);
        return;
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) return;
    setResending(true);
    setResentNotice("");
    try {
      await api("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail }),
      });
      setResentNotice("A fresh verification email is on its way.");
    } catch (err) {
      setResentNotice(err instanceof Error ? err.message : "Couldn't resend. Try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  if (pendingEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <MailCheck size={20} className="text-indigo-600" />
            </div>
            <h2 className="text-base font-semibold text-black">Check your email</h2>
            <p className="text-sm text-gray-600">
              We sent a verification link to <strong className="text-gray-900">{pendingEmail}</strong>. Click it to finish setting up your account.
            </p>
            <p className="text-xs text-gray-500">
              Didn&apos;t get it? Check spam, or resend below.
            </p>
            <Button variant="secondary" className="w-full" onClick={handleResend} loading={resending}>
              Resend verification email
            </Button>
            {resentNotice && <p className="text-xs text-indigo-600">{resentNotice}</p>}
            <p className="pt-2 text-xs text-center text-gray-500">
              Wrong address?{" "}
              <button
                type="button"
                onClick={() => { setPendingEmail(null); setResentNotice(""); }}
                className="text-black font-medium hover:underline"
              >
                Sign up again
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">Create account</h2>
          {error && (
            <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Full name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
            <Button type="submit" className="w-full" loading={loading}>Create account</Button>
          </form>
          <p className="mt-4 text-xs text-center text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="text-black font-medium hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
