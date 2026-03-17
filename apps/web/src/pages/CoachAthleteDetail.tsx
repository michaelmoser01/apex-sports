import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  FileText,
  MapPin,
  Phone,
  Star,
  User,
} from "lucide-react";

interface SlotLocation {
  name: string;
  address: string;
  notes: string | null;
}

interface AthleteBooking {
  id: string;
  slot: { startTime: string; endTime: string; location: SlotLocation | null };
  message: string | null;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  completedAt: string | null;
  coachRecap: string | null;
  review: { rating: number; comment: string; createdAt: string } | null;
}

interface AthleteDetailData {
  athlete: {
    id: string;
    displayName: string;
    sports: string[];
    serviceCity: string | null;
    level: string | null;
    birthYear: number | null;
    phone: string | null;
  };
  connection: { status: string; createdAt: string } | null;
  bookings: AthleteBooking[];
  stats: {
    totalSessions: number;
    completedSessions: number;
    totalRevenue: number;
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function paymentBadge(paymentStatus: string | null, amountCents: number | null) {
  if (!amountCents) return null;
  if (paymentStatus === "succeeded")
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        Paid ${(amountCents / 100).toFixed(2)}
      </span>
    );
  if (paymentStatus === "deferred" || paymentStatus === "payment_link_sent")
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
        ${(amountCents / 100).toFixed(2)} due
      </span>
    );
  if (paymentStatus === "authorized")
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
        ${(amountCents / 100).toFixed(2)} held
      </span>
    );
  return null;
}

export default function CoachAthleteDetail() {
  const { athleteProfileId } = useParams<{ athleteProfileId: string }>();
  const [expandedRecap, setExpandedRecap] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["coachAthleteDetail", athleteProfileId],
    queryFn: () => api<AthleteDetailData>(`/coaches/me/athletes/${athleteProfileId}`),
    enabled: !!athleteProfileId,
  });

  const paymentRequestMutation = useMutation({
    mutationFn: (bookingId: string) =>
      api(`/bookings/${bookingId}/payment-request`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachAthleteDetail", athleteProfileId] });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/dashboard/athletes" className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-sm font-medium mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to athletes
        </Link>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/dashboard/athletes" className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-sm font-medium mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to athletes
        </Link>
        <p className="text-slate-500">{error instanceof Error ? error.message : "Athlete not found."}</p>
      </div>
    );
  }

  const { athlete, connection, bookings, stats } = data;

  const unpaid = bookings.filter(
    (b) => b.status === "completed" && (b.paymentStatus === "deferred" || b.paymentStatus === "payment_link_sent")
  );
  const unpaidTotal = unpaid.reduce((s, b) => s + (b.amountCents ?? 0), 0);

  const upcoming = bookings
    .filter((b) => (b.status === "confirmed" || b.status === "pending") && new Date(b.slot.endTime) >= new Date())
    .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());

  const past = bookings
    .filter((b) => b.status === "completed" || b.status === "cancelled" || (b.status !== "pending" && b.status !== "confirmed") || new Date(b.slot.endTime) < new Date())
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => new Date(b.slot.startTime).getTime() - new Date(a.slot.startTime).getTime());

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <Link to="/dashboard/athletes" className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-sm font-medium mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to athletes
      </Link>

      <div className="space-y-6">
        {/* Profile card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shrink-0">
              <User className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{athlete.displayName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                {athlete.sports.length > 0 && <span>{athlete.sports.join(", ")}</span>}
                {athlete.serviceCity && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {athlete.serviceCity}
                  </span>
                )}
                {athlete.level && <span className="capitalize">{athlete.level}</span>}
                {athlete.birthYear && <span>Born {athlete.birthYear}</span>}
              </div>
              {athlete.phone && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
                  <Phone className="h-3.5 w-3.5" />
                  <a href={`tel:${athlete.phone}`} className="hover:text-brand-600">{athlete.phone}</a>
                </div>
              )}
              {connection && (
                <p className="mt-2 text-xs text-gray-400">
                  Connected {new Date(connection.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.totalSessions}</p>
            <p className="text-xs text-gray-500 mt-1">Total Sessions</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.completedSessions}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">
              ${(stats.totalRevenue / 100).toFixed(0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Revenue</p>
          </div>
        </div>

        {/* Unpaid sessions */}
        {unpaid.length > 0 && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-amber-600" />
                Payment due
                <span className="text-base font-semibold text-amber-700">
                  ${(unpaidTotal / 100).toFixed(2)}
                </span>
              </h2>
              <span className="text-sm text-amber-700 font-medium">{unpaid.length} session{unpaid.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-3">
              {unpaid.map((b) => (
                <div
                  key={`unpaid-${b.id}`}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-white rounded-xl border border-amber-200"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {formatDate(b.slot.startTime)}
                      </span>
                      {b.amountCents != null && (
                        <span className="text-sm font-semibold text-amber-700">
                          ${(b.amountCents / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {b.slot.location && (
                      <p className="text-xs text-gray-400 mt-0.5">{b.slot.location.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      b.paymentStatus === "payment_link_sent"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {b.paymentStatus === "payment_link_sent" ? "Link sent" : "Not sent"}
                    </span>
                    <button
                      type="button"
                      onClick={() => paymentRequestMutation.mutate(b.id)}
                      disabled={paymentRequestMutation.isPending}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {b.paymentStatus === "payment_link_sent" ? "Resend link" : "Send payment link"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming sessions */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Sessions</h2>
            <span className="ml-auto rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {upcoming.length}
            </span>
          </div>
          {upcoming.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No upcoming sessions.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/bookings/${b.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {statusBadge(b.status)}
                        {paymentBadge(b.paymentStatus, b.amountCents)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(b.slot.startTime)} at {formatTime(b.slot.startTime)}
                        </span>
                        {b.slot.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {b.slot.location.name}
                          </span>
                        )}
                        {b.amountCents != null && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" /> ${(b.amountCents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Past sessions */}
        {past.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
              <FileText className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Past Sessions</h2>
              <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {past.length}
              </span>
            </div>
            <ul className="divide-y divide-gray-100">
              {past.map((b) => (
                <li key={b.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {statusBadge(b.status)}
                        {paymentBadge(b.paymentStatus, b.amountCents)}
                        {b.review && (
                          <span className="flex items-center gap-0.5 text-yellow-500">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            <span className="text-xs font-medium">{b.review.rating}</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(b.slot.startTime)} at {formatTime(b.slot.startTime)}
                        </span>
                        {b.slot.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {b.slot.location.name}
                          </span>
                        )}
                        {b.amountCents != null && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" /> ${(b.amountCents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      to={`/bookings/${b.id}`}
                      className="ml-4 flex-shrink-0 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      View
                    </Link>
                  </div>

                  {b.coachRecap && (
                    <div className="mt-3">
                      <button
                        onClick={() => setExpandedRecap(expandedRecap === b.id ? null : b.id)}
                        className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Your Recap
                        {expandedRecap === b.id ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {expandedRecap === b.id && (
                        <div className="mt-2 rounded-lg bg-indigo-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                          {b.coachRecap}
                        </div>
                      )}
                    </div>
                  )}

                  {b.review && (
                    <div className="mt-3 rounded-lg bg-yellow-50 p-3">
                      <div className="flex items-center gap-1 text-yellow-600 mb-1">
                        {Array.from({ length: b.review.rating }, (_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </div>
                      {b.review.comment && (
                        <p className="text-sm text-gray-700">{b.review.comment}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(b.review.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
