import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { signUp, confirmSignUp, autoSignIn, signIn } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Users, ArrowRight, Eye, EyeOff } from "lucide-react";

function waitForSignIn(): Promise<void> {
  return new Promise((resolve) => {
    const cancel = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") {
        cancel();
        resolve();
      }
    });
    setTimeout(() => { cancel(); resolve(); }, 5000);
  });
}

type Role = "coach" | "athlete";
type Step = "form" | "verify";

interface DevUser {
  id: string;
  email: string;
  name: string | null;
}

function DevSignUp() {
  const navigate = useNavigate();
  const { setDevUser } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("athlete");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await api<DevUser>("/auth/dev-signup", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      setDevUser({ ...user, name: user.name ?? "" });
      await new Promise((r) => setTimeout(r, 100));
      await api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole: role }),
      });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate(role === "coach" ? "/coach/onboarding/basic" : "/athlete/onboarding", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Create your account</h1>
          <p className="mt-2 text-slate-500 text-sm">Dev mode — no password required</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <RoleSelector role={role} onChange={setRole} />
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="Your name" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="you@example.com" />
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {loading ? "Creating account…" : <><span>Create account</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/sign-in" className="text-brand-600 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function CognitoSignUp() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("athlete");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const doSignIn = async () => {
    const hubReady = waitForSignIn();
    try {
      await autoSignIn();
    } catch {
      try {
        await signIn({ username: email.trim(), password });
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "UserAlreadyAuthenticatedException")) {
          throw err;
        }
      }
    }
    await hubReady;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { nextStep } = await signUp({
        username: email.trim(),
        password,
        options: { userAttributes: { name: name.trim() }, autoSignIn: true },
      });
      if (nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        setStep("verify");
        setLoading(false);
      } else if (nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
        const hubReady = waitForSignIn();
        await autoSignIn();
        await hubReady;
        await finishSignUp();
      } else {
        setStep("verify");
        setLoading(false);
      }
    } catch (err: unknown) {
      setError(mapCognitoError(err));
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { nextStep } = await confirmSignUp({
        username: email.trim(),
        confirmationCode: code.trim(),
      });

      if (nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
        const hubReady = waitForSignIn();
        try {
          await autoSignIn();
        } catch {
          await signIn({ username: email.trim(), password });
        }
        await hubReady;
      } else {
        await doSignIn();
      }

      await finishSignUp();
    } catch (err: unknown) {
      setError(mapCognitoError(err));
      setLoading(false);
    }
  };

  const finishSignUp = async () => {
    try {
      await api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole: role }),
      });
    } catch {
      // Role may already be set if this is a retry
    }
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    navigate(
      role === "coach" ? "/coach/onboarding/basic" : "/athlete/onboarding",
      { replace: true },
    );
  };

  if (step === "verify") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Check your email</h1>
            <p className="mt-2 text-slate-500 text-sm">We sent a verification code to <strong className="text-slate-700">{email}</strong></p>
          </div>
          <form onSubmit={handleVerify} className="space-y-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1">Verification code</label>
              <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition text-center text-lg tracking-widest" placeholder="123456" />
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {loading ? "Verifying…" : <><span>Verify and continue</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Create your account</h1>
          <p className="mt-2 text-slate-500 text-sm">Get started with ApexSports</p>
        </div>
        <form onSubmit={handleSignUp} className="space-y-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <RoleSelector role={role} onChange={setRole} />
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="Your name" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition pr-10" placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
            <input id="confirm-password" type={showPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="Confirm your password" />
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {loading ? "Creating account…" : <><span>Create account</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/sign-in" className="text-brand-600 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function RoleSelector({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">I am a…</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange("coach")}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            role === "coach"
              ? "border-brand-500 bg-brand-50 shadow-sm"
              : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <Dumbbell className={`w-5 h-5 mb-2 ${role === "coach" ? "text-brand-600" : "text-slate-400"}`} />
          <p className={`font-bold text-sm ${role === "coach" ? "text-brand-700" : "text-slate-700"}`}>Coach</p>
          <p className="text-xs text-slate-500 mt-0.5">Manage athletes and sessions</p>
        </button>
        <button
          type="button"
          onClick={() => onChange("athlete")}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            role === "athlete"
              ? "border-brand-500 bg-brand-50 shadow-sm"
              : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <Users className={`w-5 h-5 mb-2 ${role === "athlete" ? "text-brand-600" : "text-slate-400"}`} />
          <p className={`font-bold text-sm ${role === "athlete" ? "text-brand-700" : "text-slate-700"}`}>Athlete</p>
          <p className="text-xs text-slate-500 mt-0.5">Find coaches and book sessions</p>
        </button>
      </div>
    </div>
  );
}

function mapCognitoError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "UsernameExistsException") return "An account with this email already exists.";
    if (err.name === "InvalidPasswordException") return "Password does not meet requirements (at least 8 characters, uppercase, lowercase, number).";
    if (err.name === "CodeMismatchException") return "Invalid verification code. Please try again.";
    if (err.name === "ExpiredCodeException") return "Verification code has expired. Please sign up again.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export default function SignUpPage() {
  const { isDevMode, devUser } = useAuth();
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = isDevMode ? !!devUser : authStatus === "authenticated";
  const { data: currentUser, isLoading } = useCurrentUser(isAuthenticated);

  if (isAuthenticated && !isLoading && currentUser) {
    if (currentUser.signupRole === "coach" || currentUser.coachProfile) {
      return <Navigate to={currentUser.coachProfile ? "/dashboard" : "/coach/onboarding/basic"} replace />;
    }
    if (currentUser.signupRole === "athlete" || currentUser.athleteProfile) {
      return <Navigate to={currentUser.athleteProfile ? "/find" : "/athlete/onboarding"} replace />;
    }
    return <Navigate to="/welcome" replace />;
  }

  return isDevMode ? <DevSignUp /> : <CognitoSignUp />;
}
