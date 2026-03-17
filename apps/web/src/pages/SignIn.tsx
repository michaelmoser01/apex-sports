import { useState, useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { signIn } from "aws-amplify/auth";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { api } from "@/lib/api";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

interface DevUser {
  id: string;
  email: string;
  name: string | null;
}

function DevSignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setDevUser } = useAuth();
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSignUp, setShowSignUp] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpError, setSignUpError] = useState("");
  const [signUpLoading, setSignUpLoading] = useState(false);

  useEffect(() => {
    api<DevUser[]>("/auth/dev-users")
      .then(setUsers)
      .catch(() => [])
      .finally(() => setLoading(false));
  }, []);

  const returnTo = searchParams.get("returnTo") || "/welcome";

  const handleSelect = (user: DevUser) => {
    setDevUser({ ...user, name: user.name ?? "" });
    navigate(returnTo, { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError("");
    setSignUpLoading(true);
    try {
      const user = await api<DevUser>("/auth/dev-signup", {
        method: "POST",
        body: JSON.stringify({ email: signUpEmail.trim(), name: signUpName.trim() || undefined }),
      });
      setDevUser({ ...user, name: user.name ?? "" });
      navigate("/sign-up", { replace: true });
    } catch (err: unknown) {
      setSignUpError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSignUpLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {showSignUp ? "Create your account" : "Sign in to your account"}
          </h1>
          <p className="mt-2 text-slate-500 text-sm">Dev mode — no password required</p>
        </div>

        {showSignUp ? (
          <form onSubmit={handleSignUp} className="space-y-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div>
              <label htmlFor="dev-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input id="dev-name" type="text" value={signUpName} onChange={(e) => setSignUpName(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="Your name" />
            </div>
            <div>
              <label htmlFor="dev-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input id="dev-email" type="email" required value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="you@example.com" />
            </div>
            {signUpError && <p className="text-sm text-danger-600">{signUpError}</p>}
            <button type="submit" disabled={signUpLoading} className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all">
              {signUpLoading ? "Creating…" : "Create account"}
            </button>
            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <button type="button" onClick={() => setShowSignUp(false)} className="text-brand-600 font-semibold hover:underline">Sign in</button>
            </p>
          </form>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
            {users.length === 0 ? (
              <p className="text-slate-500 text-sm text-center">No accounts yet.</p>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelect(u)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{u.name ?? u.email}</p>
                      {u.name && <p className="text-xs text-slate-500">{u.email}</p>}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
                  </button>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-center text-sm text-slate-500">
                New user?{" "}
                <button type="button" onClick={() => setShowSignUp(true)} className="text-brand-600 font-semibold hover:underline">Create account</button>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CognitoSignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const returnTo = searchParams.get("returnTo") || "/welcome";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { nextStep } = await signIn({ username: email.trim(), password });
      if (nextStep.signInStep === "DONE") {
        navigate(returnTo, { replace: true });
      } else if (nextStep.signInStep === "CONFIRM_SIGN_UP") {
        setError("Please verify your email first. Check your inbox for a verification code.");
      } else {
        navigate(returnTo, { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "UserAlreadyAuthenticatedException") {
          navigate(returnTo, { replace: true });
          return;
        }
        if (err.name === "NotAuthorizedException") {
          setError("Incorrect email or password.");
        } else if (err.name === "UserNotFoundException") {
          setError("No account found with this email.");
        } else if (err.name === "UserNotConfirmedException") {
          setError("Please verify your email first.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in to your account</h1>
          <p className="mt-2 text-slate-500 text-sm">Welcome back to ApexSports</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition pr-10" placeholder="Enter your password" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {loading ? "Signing in…" : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Don't have an account?{" "}
          <Link to="/sign-up" className="text-brand-600 font-semibold hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  const { isDevMode, devUser } = useAuth();
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = isDevMode ? !!devUser : authStatus === "authenticated";
  const { data: currentUser, isLoading } = useCurrentUser(isAuthenticated);

  if (isAuthenticated && !isLoading && currentUser) {
    if (currentUser.signupRole === "coach" || currentUser.coachProfile) {
      return <Navigate to={currentUser.coachProfile ? "/dashboard" : "/coach/onboarding/basic"} replace />;
    }
    if (currentUser.signupRole === "athlete" || currentUser.athleteProfile) {
      return <Navigate to={currentUser.athleteProfile ? "/athlete" : "/athlete/onboarding"} replace />;
    }
    return <Navigate to="/welcome" replace />;
  }

  return isDevMode ? <DevSignIn /> : <CognitoSignIn />;
}
