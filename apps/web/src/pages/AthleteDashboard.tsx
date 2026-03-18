import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useState } from "react";
import { Heart } from "lucide-react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  Search,
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

interface MyCoach {
  coachId: string;
  displayName: string;
  sports: string[];
  avatarUrl: string | null;
  hourlyRate: string | null;
  isFavorite: boolean;
  lastBookingDate: string | null;
}

function MyCoachesCard() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["myCoaches"],
    queryFn: () => api<{ coaches: MyCoach[] }>("/athletes/me/my-coaches"),
    staleTime: 60 * 1000,
  });

  const coaches = data?.coaches ?? [];
  const COLLAPSED_LIMIT = 3;
  const showToggle = coaches.length > COLLAPSED_LIMIT;
  const visible = expanded ? coaches : coaches.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
        <h3 className="text-sm font-semibold text-gray-900">My Coaches</h3>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">Loading…</div>
      ) : coaches.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-500">Book or favorite coaches to see them here</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-50">
            {visible.map((coach) => {
              const initials = (coach.displayName || "C")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
                <li key={coach.coachId}>
                  <Link
                    to={`/coaches/${coach.coachId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    {coach.avatarUrl ? (
                      <img
                        src={coach.avatarUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover border border-gray-200 shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{coach.displayName}</p>
                      {coach.sports.length > 0 && (
                        <p className="text-xs text-gray-500 truncate">{coach.sports.join(", ")}</p>
                      )}
                    </div>
                    <FavoriteButton
                      coachProfileId={coach.coachId}
                      isFavorite={coach.isFavorite}
                      size="sm"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          {showToggle && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full px-4 py-2.5 text-xs font-medium text-indigo-600 hover:bg-gray-50 border-t border-gray-100 transition-colors"
            >
              {expanded ? "Show less" : `View all ${coaches.length} coaches`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Sidebar({
  profile,
  upcomingCount,
  completedCount,
}: {
  profile: {
    displayName: string;
    sports: string[];
    serviceCity: string | null;
    avatarUrl?: string | null;
    level: string | null;
    birthYear: number | null;
  };
  upcomingCount: number;
  completedCount: number;
}) {
  const initials = (profile.displayName || "A")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5">
          {/* Desktop: vertical / Mobile: horizontal */}
          <div className="flex items-center gap-4 lg:flex-col lg:items-center lg:text-center">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-14 w-14 lg:h-20 lg:w-20 shrink-0 rounded-full object-cover border-2 border-slate-200"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="flex h-14 w-14 lg:h-20 lg:w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-lg lg:text-2xl font-bold">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1 lg:flex-initial lg:w-full">
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900 truncate">
                {profile.displayName || "Athlete"}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 lg:justify-center">
                {profile.sports.length > 0 && (
                  <span>{profile.sports.join(", ")}</span>
                )}
                {profile.serviceCity && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {profile.serviceCity}
                  </span>
                )}
              </div>
              {(profile.level || profile.birthYear) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 lg:justify-center">
                  {profile.level && <span className="capitalize">{profile.level}</span>}
                  {profile.birthYear && <span>Born {profile.birthYear}</span>}
                </div>
              )}
            </div>
          </div>
          <Link
            to="/athlete/profile"
            className="mt-4 block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center transition-colors"
          >
            Edit Profile
          </Link>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 border-t border-gray-100">
          <div className="flex flex-col items-center gap-1 py-4 border-r border-gray-100">
            <div className="flex items-center gap-1.5 text-indigo-600">
              <Calendar className="h-4 w-4" />
              <span className="text-xl font-bold">{upcomingCount}</span>
            </div>
            <span className="text-xs text-gray-500">Upcoming</span>
          </div>
          <div className="flex flex-col items-center gap-1 py-4">
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xl font-bold">{completedCount}</span>
            </div>
            <span className="text-xs text-gray-500">Completed</span>
          </div>
        </div>
      </div>

      <MyCoachesCard />

      {/* Find a Coach CTA */}
      <Link
        to="/find"
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
      >
        <Search className="h-4 w-4" />
        Find a Coach
      </Link>
    </div>
  );
}

function UpcomingSessions({ bookings }: { bookings: AthleteBooking[] }) {
  const [showAll, setShowAll] = useState(false);
  const COLLAPSED_LIMIT = 5;

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

  const visible = showAll ? upcoming : upcoming.slice(0, COLLAPSED_LIMIT);
  const hasMore = upcoming.length > COLLAPSED_LIMIT;

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
        <>
          <ul className="divide-y divide-gray-100">
            {visible.map((b) => (
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
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full border-t border-gray-100 px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-gray-50 transition-colors"
            >
              {showAll ? "Show less" : `Show all ${upcoming.length} sessions`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PastSessions({ bookings }: { bookings: AthleteBooking[] }) {
  const [expandedRecap, setExpandedRecap] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const COLLAPSED_LIMIT = 3;

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

  const visible = showAll ? past : past.slice(0, COLLAPSED_LIMIT);
  const hasMore = past.length > COLLAPSED_LIMIT;

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
        {visible.map((b) => (
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
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full border-t border-gray-100 px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-gray-50 transition-colors"
        >
          {showAll ? "Show less" : `Show all ${past.length} sessions`}
        </button>
      )}
    </div>
  );
}

function PaymentsDueBanner({ bookings }: { bookings: AthleteBooking[] }) {
  const unpaid = bookings.filter(
    (b) =>
      b.amountCents != null &&
      b.amountCents > 0 &&
      (b.paymentStatus === "deferred" || b.paymentStatus === "payment_link_sent") &&
      (b.status === "completed" || b.paymentStatus === "payment_link_sent")
  );

  if (unpaid.length === 0) return null;

  const totalDue = unpaid.reduce((sum, b) => sum + (b.amountCents ?? 0), 0);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5 bg-amber-100/60 border-b border-amber-200">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {unpaid.length === 1 ? "Payment due" : `${unpaid.length} payments due`}
          </p>
        </div>
        <span className="text-sm font-bold text-amber-900 whitespace-nowrap">
          {formatCurrency(totalDue)}
        </span>
      </div>
      <ul className="divide-y divide-amber-100">
        {unpaid.map((b) => (
          <li
            key={b.id}
            className="flex flex-col gap-2 px-4 py-3 sm:px-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-sm min-w-0">
              <span className="font-medium text-gray-900">{b.coach.displayName}</span>
              <span className="ml-2 text-gray-500">{formatDate(b.slot.startTime)}</span>
              <span className="ml-2 font-medium text-amber-700">{formatCurrency(b.amountCents ?? 0)}</span>
            </div>
            <Link
              to={`/bookings/${b.id}`}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors whitespace-nowrap text-center"
            >
              Pay Now
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentsSection({ bookings }: { bookings: AthleteBooking[] }) {
  const [showAll, setShowAll] = useState(false);
  const COLLAPSED_LIMIT = 5;

  const paid = bookings
    .filter((b) => b.amountCents != null && b.amountCents > 0 && b.paymentStatus === "succeeded")
    .sort((a, b) => new Date(b.slot.startTime).getTime() - new Date(a.slot.startTime).getTime());

  if (paid.length === 0) return null;

  const visible = showAll ? paid : paid.slice(0, COLLAPSED_LIMIT);
  const hasMore = paid.length > COLLAPSED_LIMIT;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4 sm:px-6">
        <DollarSign className="h-5 w-5 shrink-0 text-indigo-600" />
        <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
        <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {paid.length}
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {visible.map((b) => (
          <li key={b.id} className="flex flex-col gap-1 px-4 py-3 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
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
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full border-t border-gray-100 px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-gray-50 transition-colors"
        >
          {showAll ? "Show less" : `Show all ${paid.length} payments`}
        </button>
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
  const now = new Date();
  const upcomingCount = athleteBookings.filter(
    (b) =>
      (b.status === "confirmed" || b.status === "pending") &&
      b.slot?.endTime &&
      new Date(b.slot.endTime) >= now
  ).length;
  const completedCount = athleteBookings.filter(
    (b) => b.status === "completed"
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="mb-4 sm:mb-6 text-xl sm:text-2xl font-bold text-gray-900">
        Welcome back{profile?.displayName ? `, ${profile.displayName}` : ""}
      </h1>

      <div className="lg:flex lg:gap-8">
        {/* Sidebar */}
        {profile && (
          <aside className="mb-6 lg:mb-0 lg:w-72 xl:w-80 lg:shrink-0 lg:sticky lg:top-24 lg:self-start">
            <Sidebar
              profile={profile}
              upcomingCount={upcomingCount}
              completedCount={completedCount}
            />
          </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">
          {bookingsLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 shadow-sm">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : (
            <>
              <PaymentsDueBanner bookings={athleteBookings} />
              <UpcomingSessions bookings={athleteBookings} />
              <PastSessions bookings={athleteBookings} />
              <PaymentsSection bookings={athleteBookings} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
