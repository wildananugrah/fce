import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";

interface InvitationInfo {
  id: string;
  workspaceName: string;
  role: string;
  inviterName: string | null;
  inviterEmail: string;
  inviteeEmail: string;
  status: string;
  isExpired: boolean;
}

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signup, logout } = useAuth();
  const token = searchParams.get("token") ?? "";

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("Invalid invitation link.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api<InvitationInfo>(`/api/invitations/${token}`);
        setInfo(data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load invitation");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSignupAndAccept = async (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await signup(info.inviteeEmail, password, fullName || undefined, token);
      navigate("/planner");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!info) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api(`/api/invitations/${token}/accept`, { method: "POST" });
      navigate("/planner");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner />
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <CenteredCard title="Invitation unavailable">
        <p className="text-sm text-gray-600 mb-4">{loadError ?? "Invitation not found."}</p>
        <Link to="/login" className="text-sm text-indigo-600 hover:underline">Go to login</Link>
      </CenteredCard>
    );
  }

  if (info.status === "accepted") {
    return (
      <CenteredCard title="Already a member">
        <p className="text-sm text-gray-600 mb-4">You've already joined <strong>{info.workspaceName}</strong>.</p>
        <Link to="/" className="text-sm text-indigo-600 hover:underline">Go to dashboard</Link>
      </CenteredCard>
    );
  }

  if (info.status === "revoked") {
    return (
      <CenteredCard title="Invitation revoked">
        <p className="text-sm text-gray-600">This invitation has been revoked by the workspace admin.</p>
      </CenteredCard>
    );
  }

  if (info.status === "expired" || info.isExpired) {
    return (
      <CenteredCard title="Invitation expired">
        <p className="text-sm text-gray-600">
          This invitation has expired. Ask {info.inviterName ?? info.inviterEmail} to send a new one.
        </p>
      </CenteredCard>
    );
  }

  if (!user) {
    return (
      <CenteredCard title={`Join ${info.workspaceName}`}>
        <p className="text-sm text-gray-600 mb-4">
          {info.inviterName ?? info.inviterEmail} invited you to join <strong>{info.workspaceName}</strong> as a <strong>{info.role}</strong>.
        </p>
        <form onSubmit={handleSignupAndAccept} className="space-y-4">
          <Input label="Email" type="email" value={info.inviteeEmail} disabled readOnly />
          <Input label="Full name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
          {submitError && <p className="text-xs text-red-600">{submitError}</p>}
          <Button type="submit" className="w-full" loading={submitting}>Create account & join workspace</Button>
        </form>
        <p className="mt-4 text-xs text-center text-gray-500">
          Already have an account? <Link to={`/login?redirect=${encodeURIComponent(`/accept-invitation?token=${token}`)}`} className="text-indigo-600 hover:underline">Log in</Link>
        </p>
      </CenteredCard>
    );
  }

  if (user.email !== info.inviteeEmail) {
    return (
      <CenteredCard title="Wrong account">
        <p className="text-sm text-gray-600 mb-4">
          This invitation is for <strong>{info.inviteeEmail}</strong>, but you're signed in as <strong>{user.email}</strong>. Please sign out and sign in with the correct account.
        </p>
        <Button onClick={handleSignOut}>Sign out</Button>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard title={`Join ${info.workspaceName}`}>
      <p className="text-sm text-gray-600 mb-4">
        {info.inviterName ?? info.inviterEmail} invited you to join <strong>{info.workspaceName}</strong> as a <strong>{info.role}</strong>.
      </p>
      {submitError && <p className="text-xs text-red-600 mb-3">{submitError}</p>}
      <Button onClick={handleAccept} loading={submitting} className="w-full">Accept invitation</Button>
    </CenteredCard>
  );
}

function CenteredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
