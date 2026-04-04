import { useState, useEffect, useCallback } from "react";
import { Check, X, ChevronDown, ChevronRight, Lock } from "lucide-react";

const STORAGE_KEY = "apex-admin-key";

interface CoachRow {
  id: string;
  displayName: string;
  email: string;
  sports: string[];
  serviceCities: string[];
  createdAt: string;
  hasProfile: boolean;
  hasHourlyRate: boolean;
  hasBio: boolean;
  isVerified: boolean;
  hasStripe: boolean;
  onboardingComplete: boolean;
  bio: string | null;
  hourlyRate: string | null;
  phone: string | null;
  credentials: {
    certifications?: string[];
    yearsExperience?: number | null;
    playingExperience?: string;
    education?: string;
  } | null;
  avatarUrl: string | null;
  photoCount: number;
  reviewCount: number;
  bookingCount: number;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="w-4 h-4 text-emerald-500" />
  ) : (
    <X className="w-4 h-4 text-red-400" />
  );
}

function CoachDetailRow({ coach }: { coach: CoachRow }) {
  const creds = coach.credentials;

  return (
    <tr>
      <td colSpan={8} className="px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <div className="space-y-3">
            {coach.avatarUrl && (
              <img
                src={coach.avatarUrl}
                alt={coach.displayName}
                className="w-16 h-16 rounded-full object-cover border border-slate-200"
              />
            )}
            <Detail label="Bio" value={coach.bio} />
            <Detail label="Hourly rate" value={coach.hourlyRate ? `$${coach.hourlyRate}/hr` : null} />
            <Detail label="Phone" value={coach.phone} />
            <Detail label="Cities" value={coach.serviceCities.join(", ") || null} />
          </div>
          <div className="space-y-3">
            <Detail
              label="Certifications"
              value={creds?.certifications?.length ? creds.certifications.join(", ") : null}
            />
            <Detail
              label="Years experience"
              value={creds?.yearsExperience != null ? String(creds.yearsExperience) : null}
            />
            <Detail label="Playing experience" value={creds?.playingExperience || null} />
            <Detail label="Education" value={creds?.education || null} />
            <div className="flex gap-6 pt-1">
              <Stat label="Photos" value={coach.photoCount} />
              <Stat label="Reviews" value={coach.reviewCount} />
              <Stat label="Bookings" value={coach.bookingCount} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      {value ? (
        <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-slate-300 italic mt-0.5">Not set</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

export default function AdminCoaches() {
  const [adminKey, setAdminKey] = useState<string | null>(() => {
    try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [keyInput, setKeyInput] = useState("");
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const baseUrl = (() => {
    const url = import.meta.env.VITE_API_URL;
    if (url) return url;
    if (import.meta.env.DEV) return "/api";
    return "";
  })();

  const fetchCoaches = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    const fullUrl = `${baseUrl}/admin/coaches`;
    try {
      const res = await fetch(fullUrl, {
        headers: { "X-Admin-Key": key },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        setAdminKey(null);
        setError("Invalid admin key.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCoaches(data);
    } catch (err) {
      // #region agent log
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
      setError(`${msg} | URL: ${fullUrl} | baseUrl: ${baseUrl}`);
      // #endregion
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (adminKey) fetchCoaches(adminKey);
  }, [adminKey, fetchCoaches]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    sessionStorage.setItem(STORAGE_KEY, key);
    setAdminKey(key);
  };

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
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

  const completed = coaches.filter((c) => c.onboardingComplete).length;
  const incomplete = coaches.length - completed;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Coaches</h1>
            <p className="text-sm text-slate-500 mt-1">
              {coaches.length} total &middot;{" "}
              <span className="text-emerald-600">{completed} complete</span> &middot;{" "}
              <span className="text-amber-600">{incomplete} incomplete</span>
            </p>
          </div>
          <button
            onClick={() => { if (adminKey) fetchCoaches(adminKey); }}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            Refresh
          </button>
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {!loading && coaches.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left px-6 py-3 font-semibold text-slate-600 whitespace-nowrap">Coach</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Sports</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Signed up</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Profile</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Pricing</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Bio</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Stripe</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Visible</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((coach) => {
                  const isExpanded = expandedId === coach.id;
                  return (
                    <CoachTableRow
                      key={coach.id}
                      coach={coach}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : coach.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && coaches.length === 0 && !error && (
          <p className="text-slate-400 text-sm">No coaches found.</p>
        )}
      </div>
    </div>
  );
}

function CoachTableRow({
  coach,
  isExpanded,
  onToggle,
}: {
  coach: CoachRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const date = new Date(coach.createdAt);
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
      >
        <td className="px-6 py-3">
          <div className="flex items-center gap-2">
            <Chevron className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-slate-900 truncate">{coach.displayName}</p>
              <p className="text-xs text-slate-400 truncate">{coach.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
          {coach.sports.length ? coach.sports.join(", ") : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatted}</td>
        <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasProfile} /></td>
        <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasHourlyRate} /></td>
        <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasBio} /></td>
        <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasStripe} /></td>
        <td className="px-3 py-3 text-center"><StatusIcon ok={coach.isVerified} /></td>
      </tr>
      {isExpanded && <CoachDetailRow coach={coach} />}
    </>
  );
}
