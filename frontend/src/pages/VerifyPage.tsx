import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";

type Status = "loading" | "success" | "error";

export function VerifyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ verified: boolean; email: string }>(
          `/api/auth/verify?token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setStatus("success");
        setEmail(data.email);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4">
          {status === "loading" && (
            <>
              <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Loader2 size={20} className="text-gray-500 animate-spin" />
              </div>
              <h2 className="text-base font-semibold text-black">Verifying your email…</h2>
              <p className="text-sm text-gray-500">Hold on a second.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
              <h2 className="text-base font-semibold text-black">Email verified</h2>
              <p className="text-sm text-gray-600">
                {email ? <>Nice — <strong className="text-gray-900">{email}</strong> is verified.</> : "You're all set."}{" "}
                You can now log in.
              </p>
              <Button className="w-full" onClick={() => navigate("/login?verified=1")}>
                Go to log in
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mx-auto w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-black">Verification failed</h2>
              <p className="text-sm text-gray-600">{message}</p>
              <p className="text-xs text-gray-500">
                Open the log-in page to request a new verification email.
              </p>
              <Button variant="secondary" className="w-full" onClick={() => navigate("/login")}>
                Back to log in
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
