import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      // Network error — still show success to preserve the enumeration-resistant
      // contract from the user's perspective.
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <MailCheck size={20} className="text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-black">Check your email</h2>
            <p className="text-sm text-gray-600">
              If an account exists for <strong className="text-gray-900">{email}</strong>, we've sent a password reset link. The link expires in 1 hour.
            </p>
            <Link to="/login" className="block text-xs text-gray-500 hover:text-gray-900">
              ← Back to log in
            </Link>
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
          <h2 className="text-base font-semibold text-black mb-2">Reset your password</h2>
          <p className="text-xs text-gray-500 mb-4">
            Enter your email and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-gray-500">
            Remembered it?{" "}
            <Link to="/login" className="text-black font-medium hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
