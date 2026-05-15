import { useState, type FormEvent } from "react";
import floochinkCircleLogo from "../assets/floochink-logo-circle.png";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import {
  Sparkles,
  Brain,
  FileText,
  Layers,
  Target,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  MailCheck,
  BarChart2,
} from "lucide-react";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none";

function LoginModal({
  isOpen,
  onClose,
  onSwitchToSignup,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup: () => void;
}) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/planner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log in to Floothink Content Engine" size="sm">
      {error && (
        <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>
      <p className="mt-4 text-xs text-center text-gray-500">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-black font-medium hover:underline"
        >
          Sign up
        </button>
      </p>
    </Modal>
  );
}

function SignupModal({
  isOpen,
  onClose,
  onSwitchToLogin,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}) {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // "Check your email" state after the signup API responds with
  // verificationRequired: true. Matches the flow in SignupPage.tsx.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState("");

  const resetPendingState = () => {
    setPendingEmail(null);
    setResentNotice("");
  };

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
      navigate("/planner");
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
      setResentNotice(
        err instanceof Error ? err.message : "Couldn't resend. Try again in a moment.",
      );
    } finally {
      setResending(false);
    }
  };

  if (pendingEmail) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={() => {
          resetPendingState();
          onClose();
        }}
        title="Check your email"
        size="sm"
      >
        <div className="text-center space-y-4">
          <div className="mx-auto w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
            <MailCheck size={20} className="text-indigo-600" />
          </div>
          <p className="text-sm text-gray-600">
            We sent a verification link to{" "}
            <strong className="text-gray-900">{pendingEmail}</strong>. Click it to finish
            setting up your account.
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
              onClick={resetPendingState}
              className="text-black font-medium hover:underline"
            >
              Sign up again
            </button>
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create your Floothink Content Engine account" size="sm">
      {error && (
        <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Full name</label>
          <input type="text" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-xs text-center text-gray-500">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-black font-medium hover:underline"
        >
          Log in
        </button>
      </p>
    </Modal>
  );
}

const FEATURES = [
  {
    icon: Brain,
    title: "Brand Brain",
    description:
      "Define your brand's DNA — personality, tone, values, and audience — and let the AI internalize it for every piece of content it creates.",
  },
  {
    icon: Sparkles,
    title: "Content Generator",
    description:
      "Generate platform-ready social media content with hooks, captions, visual direction, and hashtags — grounded in your brand voice.",
  },
  {
    icon: FileText,
    title: "Campaign Generator",
    description:
      "Upload a brief and get an AI-powered campaign plan with messaging pillars, a big idea, and ready-to-produce content topics.",
  },
  {
    icon: Layers,
    title: "Topic Library",
    description:
      "Plan and organize content topics in a calendar view. Each topic flows directly into content generation for a seamless workflow.",
  },
  {
    icon: Target,
    title: "AI Skills",
    description:
      "Plug-and-play marketing frameworks that boost content quality. Skills teach the AI the right techniques — so every output is sharper and more effective.",
  },
  {
    icon: BarChart2,
    title: "Performance Learning",
    description:
      "The platform integrates with your analytics to learn what drives engagement. Brand Brain and Product Brain evolve continuously based on real performance data.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Build your Brand & Product Brain",
    description:
      "Enter your brand's URL or fill in details manually. AI extracts your identity, tone, audience, and product positioning — forming a living knowledge base that every generation draws from.",
  },
  {
    step: "02",
    title: "Activate AI Skills",
    description:
      "Layer in marketing Skills — proven frameworks and techniques — that guide the AI to produce higher-quality, more effective content. Skills make your AI sharper and more aligned with what actually works in your niche.",
  },
  {
    step: "03",
    title: "Generate, review & publish",
    description:
      "Choose a platform and format, generate scroll-stopping content grounded in your brand voice, edit inline, approve what works, and push to your publishing workflow.",
  },
  {
    step: "04",
    title: "Learn, analyse & improve",
    description:
      "Connect your performance analytics. The platform analyses engagement, reach, and virality data to surface insights and automatically evolve your Brand Brain and Product Brain — so the AI keeps getting smarter about what content to create and what to avoid.",
  },
];

export function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const switchToSignup = () => {
    setShowLogin(false);
    setShowSignup(true);
  };

  const switchToLogin = () => {
    setShowSignup(false);
    setShowLogin(true);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={floochinkCircleLogo}
              alt="Floothink"
              className="w-8 h-8 rounded-full object-cover"
            />
            <span className="text-base font-bold text-black tracking-tight">Floothink Content Engine</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
            >
              Log in
            </button>
            <Button size="sm" onClick={() => setShowSignup(true)}>
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-24 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium mb-6">
            <Sparkles size={12} />
            AI-Powered Content Engine
          </div>
          <div className="flex justify-center mb-6">
            <img
              src={floochinkCircleLogo}
              alt="Floothink Content Engine"
              className="w-20 h-20 rounded-full object-cover shadow-md"
            />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-black tracking-tight leading-tight">
            Content that{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
              knows your brand
            </span>
            {" "}and keeps getting smarter
          </h1>
          <p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-2xl mx-auto">
            Floothink Content Engine beats other AI content tools because we make the AI{" "}
            <strong className="text-gray-700">smarter and more relevant to your brand</strong>.
            We implement Skills that boost content quality, and we continuously evolve your Brand Brain
            and Product Brain based on performance data and industry trends — so the AI knows exactly
            what content drives engagement and virality, and what to avoid.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="md" onClick={() => setShowSignup(true)}>
              Get Started Free
              <ArrowRight size={16} className="ml-2" />
            </Button>
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="text-sm font-medium text-gray-500 hover:text-black transition-colors"
            >
              Already have an account? Log in
            </button>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-black">
              Everything you need to scale content
            </h2>
            <p className="mt-3 text-sm text-gray-500 max-w-xl mx-auto">
              From brand strategy to published posts — one platform, powered by AI.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-gray-700" />
                  </div>
                  <h3 className="text-sm font-semibold text-black mb-2">{feature.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-black">How it works</h2>
            <p className="mt-3 text-sm text-gray-500">
              A continuous cycle — from brand setup to smarter AI output, guided by real performance.
            </p>
          </div>
          <div className="space-y-8">
            {STEPS.map((step, i) => (
              <div key={step.step} className="flex gap-6 items-start">
                <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 3
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                    : "bg-black text-white"
                }`}>
                  {i === 3 ? <TrendingUp size={18} /> : step.step}
                </div>
                <div className="pt-1">
                  <h3 className="text-base font-semibold text-black mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                  {i === 3 && (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      <BarChart2 size={10} /> Powered by performance analytics
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof / highlights ────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 sm:p-12">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-3xl font-bold text-black">10x</p>
                <p className="mt-1 text-xs text-gray-500">Faster content creation</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-black">100%</p>
                <p className="mt-1 text-xs text-gray-500">On-brand consistency</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-black">6+</p>
                <p className="mt-1 text-xs text-gray-500">Platforms supported</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black">
            Ready to make your AI content engine smarter?
          </h2>
          <p className="mt-4 text-sm text-gray-500 max-w-lg mx-auto">
            Join marketing teams using Floothink Content Engine to create consistent, high-quality
            content that gets better with every campaign.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="md" onClick={() => setShowSignup(true)}>
              Get Started Free
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-500" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-500" />
              Free to start
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-500" />
              Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={floochinkCircleLogo}
              alt="Floothink"
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-sm font-semibold text-black">Floothink Content Engine</span>
          </div>
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Floothink. All rights reserved.
          </p>
        </div>
      </footer>

      {/* ── Auth Modals ──────────────────────────────────────── */}
      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSwitchToSignup={switchToSignup}
      />
      <SignupModal
        isOpen={showSignup}
        onClose={() => setShowSignup(false)}
        onSwitchToLogin={switchToLogin}
      />
    </div>
  );
}
