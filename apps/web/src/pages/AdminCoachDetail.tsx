import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  X,
  Trash2,
  ExternalLink,
  Calendar,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import AdminAuthGate from "@/components/AdminAuthGate";
import {
  ADMIN_KEY_STORAGE,
  adminFetch,
  clearStoredAdminKey,
  getStoredAdminKey,
  useAdminFetch,
} from "@/lib/adminApi";

interface CoachDetailKpis {
  availabilityRules: number;
  availabilitySlots: number;
  upcomingSlots: number;
  pastSlots: number;
  lastAvailabilityAt: string | null;
  bookingsPending: number;
  bookingsConfirmed: number;
  bookingsCompleted: number;
  bookingsCancelled: number;
  bookingsTotal: number;
  paymentsSucceededCents: number;
  paymentsSucceededCount: number;
  athletesActive: number;
  athletesPending: number;
  athletePendingEmailInvites: number;
  favorites: number;
  reviews: number;
  avgRating: number | null;
  messagesSent: number;
  lastBookingAt: string | null;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
  rulesAddedLast30Days: number;
  slotsAddedLast30Days: number;
}

interface AvailabilityDayPoint {
  day: string;
  rules: number;
  slots: number;
}
interface SlotsWeekPoint {
  week: string;
  count: number;
}

interface MonthlyBookingPoint {
  month: string;
  count: number;
}
interface MonthlyPaymentPoint {
  month: string;
  totalCents: number;
  count: number;
}

interface RecentBooking {
  id: string;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  completedAt: string | null;
  groupSize: number;
  athlete: { id: string; displayName: string } | null;
}

interface RecentAthlete {
  id: string;
  status: string;
  createdAt: string;
  athlete: { id: string; displayName: string } | null;
}

interface RecentPendingInvite {
  id: string;
  athleteName: string;
  athleteEmail: string;
  invitedAt: string;
  status: string;
}

interface CoachDetail {
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
  avatarUrl: string | null;
  photoCount: number;
  inviteSlug: string | null;
  inviteUrl: string | null;
  kpis: CoachDetailKpis;
  timeseries: {
    bookingsByMonth: MonthlyBookingPoint[];
    paymentsByMonth: MonthlyPaymentPoint[];
    availabilityAddedByDay: AvailabilityDayPoint[];
    slotsByWeek: SlotsWeekPoint[];
  };
  recentBookings: RecentBooking[];
  recentAthletes: RecentAthlete[];
  recentPendingInvites: RecentPendingInvite[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function KpiTile({
  label,
  value,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: "default" | "warn" | "success";
}) {
  const valueColor =
    tone === "warn" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${
        ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" || status === "confirmed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "pending"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === "cancelled" || status === "declined"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function AvailabilityActivityChart({ data }: { data: AvailabilityDayPoint[] }) {
  const days = 90;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const byDay = new Map<string, AvailabilityDayPoint>();
  for (const d of data) {
    const key = new Date(d.day).toISOString().slice(0, 10);
    byDay.set(key, d);
  }

  const series: Array<{ key: string; date: Date; rules: number; slots: number }> = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const point = byDay.get(key);
    series.push({
      key,
      date,
      rules: point?.rules ?? 0,
      slots: point?.slots ?? 0,
    });
  }

  const maxRules = Math.max(...series.map((s) => s.rules), 1);
  const totalRules = series.reduce((sum, s) => sum + s.rules, 0);
  const totalSlots = series.reduce((sum, s) => sum + s.slots, 0);
  const activeDays = series.filter((s) => s.rules > 0).length;

  return (
    <div>
      <div className="flex items-baseline gap-4 mb-3 flex-wrap text-xs">
        <span className="text-slate-500">
          <span className="font-semibold text-slate-900">{totalRules}</span> rules added
        </span>
        <span className="text-slate-500">
          <span className="font-semibold text-slate-900">{totalSlots}</span> slots created
        </span>
        <span className="text-slate-500">
          <span className="font-semibold text-slate-900">{activeDays}</span> active day{activeDays === 1 ? "" : "s"}
        </span>
        <span className="text-slate-400 ml-auto">last 90 days</span>
      </div>
      <div className="flex items-end gap-[2px] h-24 bg-slate-50 rounded p-2">
        {series.map((s) => {
          const pct = (s.rules / maxRules) * 100;
          const title = `${s.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${s.rules} rule${s.rules === 1 ? "" : "s"}${s.slots > 0 ? `, ${s.slots} slots` : ""}`;
          return (
            <div
              key={s.key}
              title={title}
              className="flex-1 flex flex-col justify-end h-full min-w-0"
            >
              <div
                className={`rounded-sm transition-all ${
                  s.rules > 0 ? "bg-brand-500/80 hover:bg-brand-600" : "bg-slate-200/60"
                }`}
                style={{ height: s.rules > 0 ? `${Math.max(pct, 8)}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span>{today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}

function SlotsByWeekChart({ data }: { data: SlotsWeekPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No upcoming availability scheduled.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0);
        const date = new Date(d.week);
        const label = `Wk of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-24 text-slate-500 font-medium">{label}</span>
            <div className="flex-1 bg-slate-100 rounded h-5 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500/70 rounded transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-slate-700">
                {d.count} slot{d.count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyBarList({
  data,
  format,
}: {
  data: Array<{ month: string; value: number; sub?: string }>;
  format: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data in the last 6 months.</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const pct = Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0);
        const date = new Date(d.month);
        const label = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-14 text-slate-500 font-medium">{label}</span>
            <div className="flex-1 bg-slate-100 rounded h-5 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-brand-500/80 rounded transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-slate-700">
                {format(d.value)}
                {d.sub && <span className="ml-1 text-slate-400 font-normal">{d.sub}</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminCoachDetail() {
  const { id } = useParams<{ id: string }>();
  const [adminKey, setAdminKey] = useState<string | null>(() => getStoredAdminKey());
  const [authError, setAuthError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refresh, unauthorized } = useAdminFetch<CoachDetail>(
    id ? `/admin/coaches/${id}` : null,
    adminKey,
  );

  useEffect(() => {
    if (unauthorized) {
      clearStoredAdminKey();
      setAdminKey(null);
      setAuthError("Invalid admin key.");
    }
  }, [unauthorized]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_KEY_STORAGE) setAdminKey(getStoredAdminKey());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleDelete = async () => {
    if (!adminKey || !data) return;
    if (!window.confirm(`Delete ${data.displayName} (${data.email})? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await adminFetch<{ deleted: boolean }>(`/admin/coaches/${data.id}`, adminKey, { method: "DELETE" });
      window.location.href = "/admin/coaches";
    } catch (err) {
      setDeleting(false);
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <AdminAuthGate adminKey={adminKey} onAuthenticated={setAdminKey} error={authError}>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-4">
            <Link
              to="/admin/coaches"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to coaches
            </Link>
          </div>

          {loading && <p className="text-slate-500 text-sm">Loading...</p>}
          {error && !unauthorized && <p className="text-red-500 text-sm">{error}</p>}

          {data && <CoachDetailView data={data} onDelete={handleDelete} deleting={deleting} onRefresh={refresh} />}
        </div>
      </div>
    </AdminAuthGate>
  );
}

function CoachDetailView({
  data,
  onDelete,
  deleting,
  onRefresh,
}: {
  data: CoachDetail;
  onDelete: () => void;
  deleting: boolean;
  onRefresh: () => void;
}) {
  const k = data.kpis;
  const days = daysSince(k.lastActivityAt);
  const staleTone: "default" | "warn" = days != null && days > 14 ? "warn" : "default";

  const bookingsMonthly = data.timeseries.bookingsByMonth.map((p) => ({
    month: p.month,
    value: p.count,
  }));
  const paymentsMonthly = data.timeseries.paymentsByMonth.map((p) => ({
    month: p.month,
    value: p.totalCents,
    sub: `· ${p.count}`,
  }));

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {data.avatarUrl ? (
              <img
                src={data.avatarUrl}
                alt={data.displayName}
                className="w-16 h-16 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold text-xl">
                {data.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{data.displayName}</h1>
              <p className="text-sm text-slate-500">{data.email}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Signed up {formatDate(data.createdAt)}
                {data.sports.length > 0 && <> &middot; {data.sports.join(", ")}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Refresh
            </button>
            {data.inviteUrl && (
              <a
                href={data.inviteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition"
              >
                Public profile <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Deleting..." : "Delete coach"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <StatusChip ok={data.hasProfile} label="Profile" />
          <StatusChip ok={data.hasBio} label="Bio" />
          <StatusChip ok={data.hasHourlyRate} label="Pricing" />
          <StatusChip ok={data.hasStripe} label="Stripe" />
          <StatusChip ok={data.isVerified} label="Visible" />
        </div>

        {days != null && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500">Last activity:</span>
            <span className={`font-medium ${days > 14 ? "text-amber-600" : "text-slate-700"}`}>
              {formatDateTime(k.lastActivityAt)} ({days} day{days === 1 ? "" : "s"} ago)
            </span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">Availability activity</h2>
          <span className="text-xs text-slate-400">when the coach adds availability</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {k.rulesAddedLast30Days > 0
            ? <><span className="font-semibold text-slate-900">{k.rulesAddedLast30Days}</span> rule{k.rulesAddedLast30Days === 1 ? "" : "s"} added in the last 30 days
              {k.slotsAddedLast30Days > 0 && <> ({k.slotsAddedLast30Days} slot{k.slotsAddedLast30Days === 1 ? "" : "s"} created)</>}</>
            : <span className="text-amber-600">No availability added in the last 30 days.</span>}
          {k.lastAvailabilityAt && <span className="text-slate-400"> Last added {formatDate(k.lastAvailabilityAt)}.</span>}
        </p>
        <AvailabilityActivityChart data={data.timeseries.availabilityAddedByDay} />
        <div className="mt-5 pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Upcoming slots by week</h3>
          <SlotsByWeekChart data={data.timeseries.slotsByWeek} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <KpiTile
          label="Availability added"
          value={k.availabilitySlots}
          sublabel={`${k.availabilityRules} rules · last ${formatDate(k.lastAvailabilityAt)}`}
          tone={staleTone}
        />
        <KpiTile
          label="Upcoming slots"
          value={k.upcomingSlots}
          sublabel={`${k.pastSlots} past`}
        />
        <KpiTile label="Booking requests" value={k.bookingsPending} sublabel="status: pending" />
        <KpiTile label="Booked sessions" value={k.bookingsConfirmed} sublabel="status: confirmed" />
        <KpiTile label="Completed sessions" value={k.bookingsCompleted} tone={k.bookingsCompleted > 0 ? "success" : "default"} />
        <KpiTile label="Cancelled / declined" value={k.bookingsCancelled} />
        <KpiTile
          label="Payments"
          value={formatCents(k.paymentsSucceededCents)}
          sublabel={`${k.paymentsSucceededCount} succeeded`}
          tone={k.paymentsSucceededCents > 0 ? "success" : "default"}
        />
        <KpiTile
          label="Athlete connections"
          value={k.athletesActive}
          sublabel={`${k.athletesPending} pending`}
        />
        <KpiTile label="Favorites" value={k.favorites} />
        <KpiTile
          label="Reviews"
          value={k.reviews}
          sublabel={k.avgRating != null ? `★ ${k.avgRating.toFixed(1)} avg` : "no ratings yet"}
        />
        <KpiTile label="Messages sent" value={k.messagesSent} sublabel={k.lastMessageAt ? `last ${formatDate(k.lastMessageAt)}` : undefined} />
        <KpiTile label="Total bookings" value={k.bookingsTotal} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">Bookings per month</h2>
            <span className="text-xs text-slate-400">(last 6 months)</span>
          </div>
          <MonthlyBarList data={bookingsMonthly} format={(n) => String(n)} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">Payments per month</h2>
            <span className="text-xs text-slate-400">(succeeded, last 6 months)</span>
          </div>
          <MonthlyBarList data={paymentsMonthly} format={formatCents} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Recent bookings</h2>
          {data.recentBookings.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No bookings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-400 uppercase">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Athlete</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentBookings.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{formatDate(b.createdAt)}</td>
                      <td className="py-2 pr-3 text-slate-700">{b.athlete?.displayName ?? "—"}</td>
                      <td className="py-2 pr-3"><BookingStatusBadge status={b.status} /></td>
                      <td className="py-2 pr-3 text-right text-slate-700">
                        {b.amountCents != null ? formatCents(b.amountCents) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Recent athlete connections</h2>
          {data.recentAthletes.length === 0 && data.recentPendingInvites.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No athlete connections yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentAthletes.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                  <div>
                    <p className="font-medium text-slate-800">{a.athlete?.displayName ?? "—"}</p>
                    <p className="text-xs text-slate-400">Connected {formatDate(a.createdAt)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    a.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>
                    {a.status}
                  </span>
                </div>
              ))}
              {data.recentPendingInvites.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm border-t border-slate-100 pt-2">
                  <div>
                    <p className="font-medium text-slate-800">{i.athleteName}</p>
                    <p className="text-xs text-slate-400">{i.athleteEmail} · invited {formatDate(i.invitedAt)}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                    invited
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-100 rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-slate-700 text-sm">Tracked externally (GA4)</h3>
            <p className="text-xs text-slate-500 mt-1">
              The following KPIs aren't logged in our database yet. They show up as <code className="px-1 bg-white rounded text-slate-700">page_view</code> events in Google Analytics
              with the <code className="px-1 bg-white rounded text-slate-700">page_path</code> dimension.
            </p>
            <ul className="text-xs text-slate-600 mt-2 space-y-1 list-disc list-inside">
              <li>
                <span className="font-medium">Coach profile visits</span> — GA <code className="px-1 bg-white rounded">/coaches/{data.inviteSlug ?? data.id}</code>
              </li>
              <li>
                <span className="font-medium">Invite link visits</span> — same path, attributed via shared link
              </li>
            </ul>
            <p className="text-xs text-slate-400 mt-2">
              First-party tracking (an `AnalyticsEvent` table + middleware) is planned for Phase 2.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
