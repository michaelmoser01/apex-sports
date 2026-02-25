import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

interface DevUser {
  id: string;
  email: string;
  name: string | null;
}

interface DevLoginGateProps {
  children: React.ReactNode;
}

function fetchUsers(): Promise<DevUser[]> {
  return api<DevUser[]>("/auth/dev-users").catch(() => []);
}

export default function DevLoginGate({ children }: DevLoginGateProps) {
  const { devUser, setDevUser } = useAuth();
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSignUp, setShowSignUp] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpError, setSignUpError] = useState("");
  const [signUpLoading, setSignUpLoading] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    fetchUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError("");
    setSignUpLoading(true);
    try {
      const user = await api<DevUser>("/auth/dev-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signUpEmail.trim(), name: signUpName.trim() || undefined }),
      });
      loadUsers();
      setDevUser({ ...user, name: user.name ?? "" });
      setShowSignUp(false);
      setSignUpEmail("");
      setSignUpName("");
    } catch (err: unknown) {
      setSignUpError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSignUpLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-8">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (showSignUp || users.length === 0) {
    return (
      <div className="max-w-md mx-auto p-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {users.length === 0 ? "Create your account" : "Sign up (new account)"}
        </h2>
        <p className="text-slate-600 mb-4">
          Dev mode: create an account to continue (no password required).
        </p>
        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label htmlFor="dev-email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="dev-email"
              type="email"
              required
              value={signUpEmail}
              onChange={(e) => setSignUpEmail(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="dev-name" className="block text-sm font-medium text-slate-700 mb-1">
              Name (optional)
            </label>
            <input
              id="dev-name"
              type="text"
              value={signUpName}
              onChange={(e) => setSignUpName(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="Your name"
            />
          </div>
          {signUpError && (
            <p className="text-sm text-red-600">{signUpError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={signUpLoading}
              className="rounded-xl bg-brand-500 text-white px-4 py-2.5 font-semibold hover:bg-brand-600 disabled:opacity-50"
            >
              {signUpLoading ? "Creating…" : "Sign up"}
            </button>
            {users.length > 0 && (
              <button
                type="button"
                onClick={() => { setShowSignUp(false); setSignUpError(""); }}
                className="rounded-xl border border-slate-300 text-slate-700 px-4 py-2.5 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        {users.length > 0 && (
          <p className="mt-4 text-slate-500 text-sm">
            Already have an account?{" "}
            <button type="button" onClick={() => setShowSignUp(false)} className="text-brand-600 hover:underline font-medium">
              Sign in
            </button>
          </p>
        )}
      </div>
    );
  }

  if (!devUser) {
    return (
      <div className="max-w-md mx-auto p-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Dev Login
        </h2>
        <p className="text-slate-600 mb-4">
          Select a user to continue (Cognito not configured):
        </p>
        <select
          className="w-full p-3 border border-slate-300 rounded-lg mb-4"
          onChange={(e) => {
            const id = e.target.value;
            if (id) {
              const user = users.find((u) => u.id === id);
              if (user) setDevUser({ ...user, name: user.name ?? "" });
            }
          }}
          value=""
        >
          <option value="">-- Select user --</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email} ({u.email})
            </option>
          ))}
        </select>
        <p className="text-slate-500 text-sm">
          New user?{" "}
          <button type="button" onClick={() => setShowSignUp(true)} className="text-brand-600 hover:underline font-medium">
            Sign up
          </button>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
