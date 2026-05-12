import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { setStoredAdminKey } from "@/lib/adminApi";

interface AdminAuthGateProps {
  adminKey: string | null;
  onAuthenticated: (key: string) => void;
  error?: string | null;
  children: ReactNode;
}

export default function AdminAuthGate({ adminKey, onAuthenticated, error, children }: AdminAuthGateProps) {
  const [keyInput, setKeyInput] = useState("");

  if (adminKey) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    setStoredAdminKey(key);
    onAuthenticated(key);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <Lock className="w-5 h-5 text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900">Admin Access</h1>
        </div>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Admin key"
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          autoFocus
        />
        <button
          type="submit"
          className="mt-4 w-full bg-slate-900 text-white font-medium py-2.5 rounded-lg hover:bg-slate-800 transition text-sm"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
