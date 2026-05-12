import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import AdminAuthGate from "@/components/AdminAuthGate";
import {
  ADMIN_KEY_STORAGE,
  getAdminBaseUrl,
  getStoredAdminKey,
  clearStoredAdminKey,
} from "@/lib/adminApi";

interface CoachKpis {
  availabilityRules: number;
  availabilitySlots: number;
  lastAvailabilityAt: string | null;
  bookingsPending: number;
  bookingsConfirmed: number;
  bookingsCompleted: number;
  bookingsCancelled: number;
  paymentsSucceededCents: number;
  paymentsSucceededCount: number;
  athletesActive: number;
  athletesPending: number;
  favorites: number;
  reviews: number;
  avgRating: number | null;
  lastBookingAt: string | null;
  lastActivityAt: string | null;
}

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
  avatarUrl: string | null;
  photoCount: number;
  reviewCount: number;
  bookingCount: number;
  inviteSlug: string | null;
  kpis: CoachKpis;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="w-4 h-4 text-emerald-500" />
  ) : (
    <X className="w-4 h-4 text-red-400" />
  );
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function PlatformTile({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default function AdminCoaches() {
  const [adminKey, setAdminKey] = useState<string | null>(() => getStoredAdminKey());
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = getAdminBaseUrl();

  const fetchCoaches = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/admin/coaches`, {
        headers: { "X-Admin-Key": key },
      });
      if (res.status === 401) {
        clearStoredAdminKey();
        setAdminKey(null);
        setError("Invalid admin key.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCoaches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coaches");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (adminKey) fetchCoaches(adminKey);
  }, [adminKey, fetchCoaches]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_KEY_STORAGE) setAdminKey(getStoredAdminKey());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const completed = coaches.filter((c) => c.onboardingComplete).length;
  const incomplete = coaches.length - completed;
  const totalBookings = coaches.reduce((sum, c) => sum + c.bookingCount, 0);
  const totalPaymentsCents = coaches.reduce((sum, c) => sum + c.kpis.paymentsSucceededCents, 0);

  return (
    <AdminAuthGate adminKey={adminKey} onAuthenticated={setAdminKey} error={error}>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <PlatformTile label="Total coaches" value={coaches.length} />
            <PlatformTile label="Onboarded" value={completed} sublabel={`${incomplete} incomplete`} />
            <PlatformTile label="Total bookings" value={totalBookings} />
            <PlatformTile label="Payments" value={formatCents(totalPaymentsCents)} sublabel="lifetime, succeeded" />
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
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">KPIs</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Profile</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Pricing</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Bio</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Stripe</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">Visible</th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.map((coach) => (
                    <CoachTableRow key={coach.id} coach={coach} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && coaches.length === 0 && !error && (
            <p className="text-slate-400 text-sm">No coaches found.</p>
          )}
        </div>
      </div>
    </AdminAuthGate>
  );
}

function KpiBadges({ kpis }: { kpis: CoachKpis }) {
  const items = [
    { label: "A", value: kpis.availabilitySlots, title: `${kpis.availabilitySlots} availability slots (${kpis.availabilityRules} rules)` },
    { label: "B", value: kpis.bookingsPending + kpis.bookingsConfirmed + kpis.bookingsCompleted, title: `${kpis.bookingsPending} pending · ${kpis.bookingsConfirmed} confirmed · ${kpis.bookingsCompleted} completed` },
    { label: "C", value: kpis.bookingsCompleted, title: `${kpis.bookingsCompleted} completed sessions` },
    { label: "$", value: formatCents(kpis.paymentsSucceededCents), title: `${kpis.paymentsSucceededCount} payments succeeded` },
    { label: "AT", value: kpis.athletesActive, title: `${kpis.athletesActive} active athletes · ${kpis.athletesPending} pending` },
  ];
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((it, i) => (
        <span
          key={i}
          title={it.title}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono"
        >
          <span className="text-slate-400">{it.label}</span>
          <span className="font-semibold">{it.value}</span>
        </span>
      ))}
    </div>
  );
}

function CoachTableRow({ coach }: { coach: CoachRow }) {
  const navigate = useNavigate();
  const date = new Date(coach.createdAt);
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const goToDetail = () => navigate(`/admin/coaches/${coach.id}`);

  return (
    <tr
      onClick={goToDetail}
      className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
    >
      <td className="px-6 py-3">
        <div className="min-w-0">
          <Link
            to={`/admin/coaches/${coach.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-slate-900 truncate hover:text-brand-700 hover:underline"
          >
            {coach.displayName}
          </Link>
          <p className="text-xs text-slate-400 truncate">{coach.email}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
        {coach.sports.length ? coach.sports.join(", ") : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatted}</td>
      <td className="px-4 py-3 whitespace-nowrap"><KpiBadges kpis={coach.kpis} /></td>
      <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasProfile} /></td>
      <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasHourlyRate} /></td>
      <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasBio} /></td>
      <td className="px-3 py-3 text-center"><StatusIcon ok={coach.hasStripe} /></td>
      <td className="px-3 py-3 text-center"><StatusIcon ok={coach.isVerified} /></td>
    </tr>
  );
}
