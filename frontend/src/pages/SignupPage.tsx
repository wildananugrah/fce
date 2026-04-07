import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(email, password, fullName || undefined);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

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
