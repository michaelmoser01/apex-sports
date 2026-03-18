import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useState } from "react";
import {
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  User,
  MapPin,
  Star,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";

interface BookingSlot {
  id: string;
  startTime: string;
  endTime: string;
  location: { name: string; address: string; notes: string | null } | null;
}

interface AthleteBooking {
  id: string;
  coach: { id: string; displayName: string; sports: string[] };
  slot: BookingSlot;
  message: string | null;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  completedAt: string | null;
  coachRecap: string | null;
  review: { rating: number; comment: string } | null;
}

interface CoachBooking {
  id: string;
  athlete: { id: string; name: string | null; email: string };
  slot: BookingSlot;
  message: string | null;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  completedAt: string | null;
  coachRecap: string | null;
  review: {
    rating: number;
    comment: string;
    createdAt: string;
  } | null;
}

interface BookingsData {
  asAthlete: AthleteBooking[];
  asCoach: CoachBooking[];
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

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
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
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 whitespace-nowrap">
        Paid {formatCurrency(amountCents)}
      </span>
    );
  if (paymentStatus === "deferred" || paymentStatus === "payment_link_sent")
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800 whitespace-nowrap">
        {formatCurrency(amountCents)} due
      </span>
    );
  if (paymentStatus === "authorized")
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 whitespace-nowrap">
        {formatCurrency(amountCents)} held
      </span>
    );
  return null;
}

function ProfileCard({
  profile,
}: {
  profile: {
    displayName: string;
    sports: string[];
    serviceCity: string | null;
    avatarUrl?: string | null;
    level: string | null;
    birthYear: number | null;
  };
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover border-2 border-slate-200"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <User className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 truncate">
              {profile.displayName || "Athlete"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              {profile.sports.length > 0 && (
                <span>{profile.sports.join(", ")}</span>
              )}
              {profile.serviceCity && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {profile.serviceCity}
                </span>
              )}
              {profile.level && <span className="capitalize">{profile.level}</span>}
              {profile.birthYear && <span>Born {profile.birthYear}</span>}
            </div>
          </div>
        </div>
        <Link
          to="/athlete/profile"
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center"
        >
          Edit Profile
        </Link>
      </div>
    </div>
  );
}

function UpcomingSessions({ bookings }: { bookings: AthleteBooking[] }) {
  const upcoming = bookings
    .filter(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        new Date(b.slot.endTime) >= new Date()
    )
    .sort(
      (a, b) =>
        new Date(a.slot.startTime).getTime() -
        new Date(b.slot.startTime).getTime()
    );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4 sm:px-6">
        <Calendar className="h-5 w-5 shrink-0 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900 min-w-0">Upcoming Sessions</h3>
        <span className="ml-auto shrink-0 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          {upcoming.length}
        </span>
      </div>
      {upcoming.length === 0 ? (
        <div className="p-4 sm:p-6 text-center text-sm text-gray-500">
          <p>No upcoming sessions.</p>
          <Link
            to="/find"
            className="mt-2 inline-block text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Find a coach
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {upcoming.map((b) => (
            <li key={b.id}>
              <Link
                to={`/bookings/${b.id}`}
                className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors sm:px-6"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {b.coach.displayName}
                    </span>
                    {statusBadge(b.status)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(b.slot.startTime)} at{" "}
                      {formatTime(b.slot.startTime)}
                    </span>
                    {b.slot.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {b.slot.location.name}
                      </span>
                    )}
                    {b.coach.sports.length > 0 && (
                      <span>{b.coach.sports[0]}</span>
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
  );
}

function PastSessions({ bookings }: { bookings: AthleteBooking[] }) {
  const [expandedRecap, setExpandedRecap] = useState<string | null>(null);

  const past = bookings
    .filter(
      (b) =>
        b.status === "completed" ||
        (b.status !== "cancelled" && new Date(b.slot.endTime) < new Date())
    )
    .sort(
      (a, b) =>
        new Date(b.slot.startTime).getTime() -
        new Date(a.slot.startTime).getTime()
    );

  if (past.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4 sm:px-6">
        <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900 min-w-0">Past Sessions</h3>
        <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {past.length}
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {past.map((b) => (
            <li key={b.id} className="px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {b.coach.displayName}
                    </span>
                    {statusBadge(b.status)}
                    {b.review && (
                      <span className="flex items-center gap-0.5 text-yellow-500">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="text-xs font-medium">
                          {b.review.rating}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {formatDate(b.slot.startTime)} at{" "}
                    {formatTime(b.slot.startTime)}
                    {b.slot.location && ` - ${b.slot.location.name}`}
                  </div>
                </div>
                <Link
                  to={`/bookings/${b.id}`}
                  className="shrink-0 text-sm text-indigo-600 hover:text-indigo-700 sm:ml-4"
                >
                  View
                </Link>
              </div>
              {b.coachRecap && (
                <div className="mt-3">
                  <button
                    onClick={() =>
                      setExpandedRecap(
                        expandedRecap === b.id ? null : b.id
                      )
                    }
                    className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Coach Recap
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
            </li>
          ))}
      </ul>
    </div>
  );
}

function PaymentsSection({ bookings }: { bookings: AthleteBooking[] }) {
  const withPayments = bookings.filter(
    (b) => b.amountCents != null && b.amountCents > 0
  );

  if (withPayments.length === 0) return null;

  const unpaid = withPayments.filter(
    (b) =>
      (b.paymentStatus === "deferred" || b.paymentStatus === "payment_link_sent") &&
      (b.status === "completed" || b.paymentStatus === "payment_link_sent")
  );
  const paid = withPayments.filter(
    (b) => b.paymentStatus === "succeeded"
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4 sm:px-6">
        <DollarSign className="h-5 w-5 shrink-0 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900">Payments</h3>
      </div>

      {unpaid.length > 0 && (
        <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
          <h4 className="mb-2 text-sm font-semibold text-orange-700">
            Payment Due
          </h4>
          <ul className="space-y-3">
            {unpaid.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm min-w-0">
                  <span className="font-medium text-gray-900">
                    {b.coach.displayName}
                  </span>
                  <span className="ml-2 text-gray-500 whitespace-nowrap">
                    {formatDate(b.slot.startTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {paymentBadge(b.paymentStatus, b.amountCents)}
                  <Link
                    to={`/bookings/${b.id}`}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
                  >
                    Pay Now
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {paid.length > 0 && (
        <div className="px-4 py-3 sm:px-6">
          <h4 className="mb-2 text-sm font-semibold text-gray-600">
            Payment History
          </h4>
          <ul className="space-y-3">
            {paid.map((b) => (
              <li key={b.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm min-w-0">
                  <span className="font-medium text-gray-900">
                    {b.coach.displayName}
                  </span>
                  <span className="ml-2 text-gray-500 whitespace-nowrap">
                    {formatDate(b.slot.startTime)}
                  </span>
                </div>
                <div className="shrink-0">{paymentBadge(b.paymentStatus, b.amountCents)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AthleteDashboard() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser(true);

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<BookingsData>("/bookings"),
    enabled: !!currentUser,
  });

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/sign-in" replace />;
  if (currentUser.signupRole !== "athlete" && !currentUser.athleteProfile) {
    return <Navigate to="/dashboard" replace />;
  }

  const profile = currentUser.athleteProfile;
  const athleteBookings = bookingsData?.asAthlete ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="mb-4 sm:mb-6 text-xl sm:text-2xl font-bold text-gray-900">
        Welcome back{profile?.displayName ? `, ${profile.displayName}` : ""}
      </h1>

      <div className="space-y-4 sm:space-y-6">
        {profile && <ProfileCard profile={profile} />}

        {bookingsLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 shadow-sm">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : (
          <>
            <UpcomingSessions bookings={athleteBookings} />
            <PastSessions bookings={athleteBookings} />
            <PaymentsSection bookings={athleteBookings} />
          </>
        )}
      </div>
    </div>
  );
}
