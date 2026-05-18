import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, ApiError } from "../services/api";
import { Button } from "../components/ui/Button";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <h2 className="text-base font-semibold text-black">Missing token</h2>
            <p className="text-sm text-gray-600">
              The reset link is incomplete. Request a new link from the forgot-password page.
            </p>
            <Link to="/forgot-password" className="block">
              <Button variant="secondary" className="w-full">
                Request a new link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      navigate("/login?passwordReset=1");
    } catch (err) {
      if (err instanceof ApiError && typeof err.body?.error === "string") {
        setError(err.body.error);
      } else {
        setError(err instanceof Error ? err.message : "Password reset failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">Set a new password</h2>

          {error && (
            <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
              {(error.toLowerCase().includes("token") ||
                error.toLowerCase().includes("expired") ||
                error.toLowerCase().includes("used")) && (
                <div className="mt-2">
                  <Link to="/forgot-password" className="text-red-800 font-medium hover:underline">
                    Request a new link →
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>New password</label>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className={labelCls}>Confirm password</label>
              <input
                type="password"
                className={inputCls}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your new password"
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Reset password
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-gray-500">
            <Link to="/login" className="text-black font-medium hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
