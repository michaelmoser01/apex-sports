import { useParams, Link, useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { api } from "@/lib/api";
import { setDeepLink } from "@/utils/deepLink";
import { CoachDetailMap } from "@/components/CoachDetailMap";
import { Users, Lock } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface SlotLocation {
  id: string;
  name: string;
  address: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CoachBookData {
  id: string;
  displayName: string;
  hourlyRate: string | null;
  groupRates?: Record<string, number> | null;
  availabilitySlots: {
    id: string;
    startTime: string;
    endTime: string;
    maxCapacity?: number;
    allowPrivate?: boolean;
    spotsRemaining?: number;
    currentHeadcount?: number;
    currentPerPersonRate?: number | null;
    isLocked?: boolean;
    location: SlotLocation | null;
  }[];
}

function interpolateRate(
  groupSize: number,
  groupRates: Record<string, number> | null | undefined,
  hourlyRate: number,
): number {
  if (!groupRates || typeof groupRates !== "object") return hourlyRate;
  const exact = groupRates[String(groupSize)];
  if (typeof exact === "number" && exact > 0) return exact;
  const defined = Object.entries(groupRates)
    .map(([k, v]) => ({ size: parseInt(k), rate: v }))
    .filter((e) => !isNaN(e.size) && typeof e.rate === "number" && e.rate > 0)
    .sort((a, b) => a.size - b.size);
  if (defined.length === 0) return hourlyRate;
  if (groupSize <= defined[0].size) return defined[0].rate;
  if (groupSize >= defined[defined.length - 1].size) return defined[defined.length - 1].rate;
  let lower = defined[0];
  let upper = defined[defined.length - 1];
  for (const d of defined) {
    if (d.size <= groupSize) lower = d;
    if (d.size >= groupSize && d.size < upper.size) upper = d;
  }
  if (lower.size === upper.size) return lower.rate;
  const fraction = (groupSize - lower.size) / (upper.size - lower.size);
  return Math.round(lower.rate + (upper.rate - lower.rate) * fraction);
}

function PricingLadder({
  groupRates,
  hourlyRate,
  currentHeadcount,
  maxCapacity,
}: {
  groupRates: Record<string, number> | null;
  hourlyRate: number;
  currentHeadcount: number;
  maxCapacity: number;
}) {
  const tiers: { size: number; rate: number }[] = [];
  for (let n = 1; n <= maxCapacity; n++) {
    const rate = interpolateRate(n, groupRates, hourlyRate);
    tiers.push({ size: n, rate });
  }
  const uniqueTiers = tiers.filter(
    (t, i) => i === 0 || t.rate !== tiers[i - 1].rate
  );

  return (
    <div className="space-y-1">
      {uniqueTiers.map((tier) => {
        const isLastTier = tier === uniqueTiers[uniqueTiers.length - 1];
        const isActive = tier.size === currentHeadcount + 1
          || (isLastTier && currentHeadcount + 1 > tier.size);
        const isPast = tier.size <= currentHeadcount && !isActive;
        const label = isLastTier && tier.size < maxCapacity
          ? `${tier.size}+`
          : String(tier.size);
        return (
          <div
            key={tier.size}
            className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${
              isActive
                ? "bg-brand-50 border border-brand-200 text-brand-800 font-medium"
                : isPast
                  ? "text-slate-400"
                  : "text-slate-600"
            }`}
          >
            <span>
              {label} {tier.size === 1 ? "athlete" : "athletes"}
              {isActive && " (you join here)"}
            </span>
            <span className="font-medium">${tier.rate}/hr each</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CoachBook() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const slotId = searchParams.get("slotId");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";

  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [lockPrivate, setLockPrivate] = useState(false);

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollToTop();
    const raf = requestAnimationFrame(() => {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    });
    return () => cancelAnimationFrame(raf);
  }, [id, slotId]);

  const { data: coach, isLoading, isError } = useQuery({
    queryKey: ["coach", id],
    queryFn: () => api<CoachBookData>(`/coaches/${id}`),
    enabled: !!id,
  });

  const { data: myBookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: () =>
      api<{
        asAthlete: {
          id: string;
          coach: { id: string };
          slot: { id: string; startTime: string; endTime: string };
          status: string;
        }[];
      }>("/bookings"),
    enabled: !!id && isAuthenticated,
  });

  useEffect(() => {
    if (isLoading || !coach) return;
    const t = setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 50);
    return () => clearTimeout(t);
  }, [id, slotId, isLoading, coach]);

  const existingBooking = useMemo(() => {
    if (!slotId || !myBookings?.asAthlete || !coach?.id) return null;
    return (
      myBookings.asAthlete.find(
        (b) => b.coach.id === coach.id && b.slot.id === slotId && ["pending", "confirmed", "completed"].includes(b.status)
      ) ?? null
    );
  }, [slotId, coach?.id, myBookings]);

  const slot = useMemo(() => {
    if (!coach || !slotId) return null;
    const fromAvailability = coach.availabilitySlots?.find((s) => s.id === slotId);
    if (fromAvailability) return fromAvailability;
    if (existingBooking?.slot)
      return {
        id: existingBooking.slot.id,
        startTime: existingBooking.slot.startTime,
        endTime: existingBooking.slot.endTime,
        location: null as SlotLocation | null,
      };
    return null;
  }, [coach?.availabilitySlots, coach?.id, slotId, existingBooking]);

  const slotMaxCapacity = (slot as { maxCapacity?: number } | null)?.maxCapacity ?? 1;
  const currentHeadcount = (slot as { currentHeadcount?: number } | null)?.currentHeadcount ?? 0;
  const spotsRemaining = (slot as { spotsRemaining?: number } | null)?.spotsRemaining ?? 1;
  const isSlotLocked = (slot as { isLocked?: boolean } | null)?.isLocked ?? false;
  const slotAllowPrivate = (slot as { allowPrivate?: boolean } | null)?.allowPrivate !== false;
  const isGroupEligible = slotMaxCapacity > 1 && spotsRemaining > 0 && !isSlotLocked;

  const privateBlocked = !slotAllowPrivate || currentHeadcount > 0;
  const privateBlockedReason = !slotAllowPrivate
    ? "Not available — this is a group-only session."
    : currentHeadcount > 0
      ? "Not available — another athlete has already signed up for this slot."
      : null;

  useEffect(() => {
    if (lockPrivate && privateBlocked) setLockPrivate(false);
  }, [privateBlocked, lockPrivate]);

  const baseRate = coach?.hourlyRate ? Number(coach.hourlyRate) : null;
  const groupRates = coach?.groupRates as Record<string, number> | null;

  const perPersonRate = useMemo(() => {
    if (!baseRate || !Number.isFinite(baseRate) || baseRate <= 0) return null;
    if (lockPrivate || !isGroupEligible) return baseRate;
    return interpolateRate(currentHeadcount + 1, groupRates, baseRate);
  }, [baseRate, groupRates, lockPrivate, isGroupEligible, currentHeadcount]);

  const bookMutation = useMutation({
    mutationFn: async ({
      coachId,
      slotId: sId,
      message,
      lockPrivate: lp,
    }: {
      coachId: string;
      slotId: string;
      message?: string;
      lockPrivate?: boolean;
    }) =>
      api<{ id: string }>("/bookings", {
        method: "POST",
        body: JSON.stringify({
          coachId,
          slotId: sId,
          ...(message?.trim() ? { message: message.trim() } : {}),
          ...(lp ? { lockPrivate: true } : {}),
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["coach", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      trackEvent("booking_requested", { coach_id: id ?? "", is_group: isGroupEligible && !lockPrivate });
      if (isGroupEligible && !lockPrivate && data?.id) {
        navigate(`/bookings/${data.id}?booked=group`, { replace: true });
      } else {
        navigate(`/coaches/${id}/booking/success`, { replace: true });
      }
    },
    onError: (err: Error) => {
      const msg = typeof err?.message === "string" ? err.message : "Something went wrong.";
      const safeMsg = msg === "[object Object]" ? "Something went wrong." : msg;
      if (safeMsg.includes("already booked") || safeMsg.includes("Slot is already booked") || safeMsg.includes("session is full"))
        setBookingError("This slot was just booked or is full. Please pick another time.");
      else if (safeMsg.includes("pending request")) setBookingError("You already have a pending request for this time.");
      else if (safeMsg.includes("Payment method required")) setBookingError("Please enter your card details above.");
      else if (safeMsg.includes("locked as a private")) setBookingError("This session has been locked as private.");
      else setBookingError(safeMsg);
    },
  });

  const handleBook = () => {
    if (!slotId || !coach) return;
    if (!isAuthenticated) {
      navigate("/bookings", { state: { returnTo: `/coaches/${id}/book?slotId=${slotId}` } });
      return;
    }
    bookMutation.mutate({ coachId: coach.id, slotId, message: bookingMessage, lockPrivate });
  };

  if (id && !slotId) {
    return <Navigate to={`/coaches/${id}`} replace />;
  }

  if (isLoading || (!coach && !isError)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (isError || !coach) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-600">Something went wrong loading this coach.</p>
        <Link to="/find" className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          ← Find coaches
        </Link>
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-600">This time is no longer available.</p>
        <Link to={`/coaches/${id}`} className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          ← Back to {coach.displayName}&apos;s profile
        </Link>
      </div>
    );
  }

  const slotStart = new Date(slot.startTime);
  const slotEnd = new Date(slot.endTime);
  const slotTimeStr =
    !Number.isNaN(slotStart.getTime()) && !Number.isNaN(slotEnd.getTime())
      ? `${format(slotStart, "EEEE, MMMM d, yyyy")} · ${format(slotStart, "h:mm a")} – ${format(slotEnd, "h:mm a")}`
      : slot.startTime;

  const alreadyBooked = existingBooking != null;

  const statusLabel =
    existingBooking?.status === "pending"
      ? "Requested"
      : existingBooking?.status === "confirmed"
        ? "Confirmed"
        : existingBooking?.status === "completed"
          ? "Completed"
          : null;

  const isConfirmedOrCompleted = existingBooking?.status === "confirmed" || existingBooking?.status === "completed";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link
          to={`/coaches/${id}`}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
        >
          ← Back to {coach.displayName}&apos;s profile
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h1 className="text-xl font-semibold text-slate-900">
              {alreadyBooked
                ? isConfirmedOrCompleted
                  ? "This session is booked"
                  : "You've requested this session"
                : "Request this session"}
            </h1>
            <p className="text-slate-600 text-sm mt-1">{slotTimeStr}</p>
            {alreadyBooked && statusLabel && (
              <p className="text-slate-700 text-sm mt-1 font-medium">
                Status:{" "}
                <span
                  className={
                    existingBooking?.status === "confirmed" || existingBooking?.status === "completed"
                      ? "text-success-600"
                      : "text-amber-600"
                  }
                >
                  {statusLabel}
                </span>
              </p>
            )}
            {!alreadyBooked && perPersonRate != null && (
              <p className="text-slate-500 text-sm mt-0.5">
                ${perPersonRate}/hr{isGroupEligible && !lockPrivate ? " per person" : ""}
                {" · You'll receive a payment link after your session."}
              </p>
            )}
          </div>

          {slot?.location ? (
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Session location</h2>
              <p className="text-slate-700 font-medium">{slot.location.name}</p>
              <p className="text-slate-600 text-sm mt-0.5">{slot.location.address}</p>
              {slot.location.notes?.trim() && (
                <p className="text-slate-500 text-sm mt-1">{slot.location.notes}</p>
              )}
              <div className="mt-3">
                <CoachDetailMap locations={[slot.location]} />
              </div>
            </div>
          ) : slot ? (
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Session location</h2>
              <p className="text-slate-700 font-medium">Location TBD</p>
              <p className="text-slate-600 text-sm mt-0.5">Coach will coordinate the location with you before the session.</p>
            </div>
          ) : null}

          <div className="p-5 sm:p-6 space-y-5">
            {!isAuthenticated && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Sign in or create an account to request this session.
                </p>
                <Link
                  to={`/sign-up?returnTo=${encodeURIComponent(`/coaches/${id}/book?slotId=${slotId}`)}`}
                  onClick={() => setDeepLink(`/coaches/${id}/book?slotId=${slotId}`)}
                  className="block w-full text-center bg-brand-500 text-white px-4 py-3 rounded-xl font-medium hover:bg-brand-600 transition-colors"
                >
                  Sign up to book
                </Link>
                <Link
                  to={`/sign-in?returnTo=${encodeURIComponent(`/coaches/${id}/book?slotId=${slotId}`)}`}
                  onClick={() => setDeepLink(`/coaches/${id}/book?slotId=${slotId}`)}
                  className="block w-full text-center border border-slate-300 text-slate-700 px-4 py-3 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to={`/coaches/${id}`}
                  className="block text-center text-sm font-medium text-slate-500 hover:text-slate-700 mt-1"
                >
                  ← Back to calendar
                </Link>
              </div>
            )}

            {isAuthenticated && alreadyBooked && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <p className="text-slate-700 text-sm">
                  {existingBooking?.status === "pending" &&
                    "You've requested this session. We'll email you when the coach accepts or declines."}
                  {existingBooking?.status === "confirmed" &&
                    "This session is confirmed. See your bookings for details and to manage it."}
                  {existingBooking?.status === "completed" &&
                    "This session is complete. You can leave a review from your bookings."}
                </p>
                <div>
                  <Link
                    to="/bookings"
                    className="inline-block text-sm font-medium text-brand-600 hover:underline"
                  >
                    View my bookings →
                  </Link>
                  <Link
                    to={`/coaches/${id}`}
                    className="inline-block ml-4 text-sm font-medium text-slate-600 hover:text-slate-800"
                  >
                    ← Back to {coach.displayName}&apos;s profile
                  </Link>
                </div>
              </div>
            )}

            {isAuthenticated && !alreadyBooked && (
              <>
                {/* Session type: Lock Private vs Join & Save */}
                {isGroupEligible && baseRate != null && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">Session type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Join & Save */}
                      {(() => {
                        const joinRate = interpolateRate(currentHeadcount + 1, groupRates, baseRate);
                        const bestRate = (() => {
                          let min = baseRate;
                          for (let n = 2; n <= slotMaxCapacity; n++) {
                            const r = interpolateRate(n, groupRates, baseRate);
                            if (r < min) min = r;
                          }
                          return min;
                        })();
                        const hasSavings = joinRate < baseRate;
                        const couldSave = bestRate < baseRate;
                        return (
                          <button
                            type="button"
                            onClick={() => setLockPrivate(false)}
                            className={`text-left rounded-xl border-2 p-4 transition ${
                              !lockPrivate
                                ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/20"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1.5">
                              <Users className="w-4.5 h-4.5 text-brand-600" />
                              <span className="font-semibold text-slate-900">Join &amp; Save</span>
                            </div>
                            <p className="text-sm text-slate-600 mb-2">
                              {hasSavings
                                ? "You're saving! Price drops more as athletes join."
                                : couldSave
                                  ? `Share to get the price as low as $${bestRate}/hr per person.`
                                  : "Join at the current group rate. Price drops as more athletes sign up."}
                            </p>
                            <div className="text-lg font-bold text-brand-700">
                              ${joinRate}/hr
                              <span className="text-sm font-normal text-slate-500 ml-1">per person</span>
                            </div>
                            {hasSavings && (
                              <p className="text-xs text-success-600 mt-1 font-medium">
                                Saving ${baseRate - joinRate}/hr vs solo rate
                              </p>
                            )}
                            {!hasSavings && couldSave && (
                              <p className="text-xs text-brand-600 mt-1">
                                Could drop to ${bestRate}/hr with more athletes
                              </p>
                            )}
                            {currentHeadcount > 0 && (
                              <p className="text-xs text-brand-600 mt-1">
                                {currentHeadcount} {currentHeadcount === 1 ? "athlete" : "athletes"} already joined
                              </p>
                            )}
                          </button>
                        );
                      })()}

                      {/* Lock Private */}
                      <button
                        type="button"
                        disabled={privateBlocked}
                        onClick={() => !privateBlocked && setLockPrivate(true)}
                        className={`text-left rounded-xl border-2 p-4 transition ${
                          privateBlocked
                            ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                            : lockPrivate
                              ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/20"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <Lock className={`w-4.5 h-4.5 ${privateBlocked ? "text-slate-400" : "text-slate-600"}`} />
                          <span className={`font-semibold ${privateBlocked ? "text-slate-400" : "text-slate-900"}`}>Lock Private</span>
                        </div>
                        {privateBlocked ? (
                          <p className="text-sm text-slate-400">
                            {privateBlockedReason}
                          </p>
                        ) : (
                          <>
                            <p className="text-sm text-slate-600 mb-2">
                              Guaranteed 1-on-1 session. No one else can join.
                            </p>
                            <div className="text-lg font-bold text-slate-800">
                              ${baseRate}/hr
                              <span className="text-sm font-normal text-slate-500 ml-1">solo rate</span>
                            </div>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Pricing ladder */}
                    {!lockPrivate && groupRates && Object.keys(groupRates).length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <h3 className="text-sm font-medium text-slate-700 mb-2">Price drops as the group fills</h3>
                        <PricingLadder
                          groupRates={groupRates}
                          hourlyRate={baseRate}
                          currentHeadcount={currentHeadcount}
                          maxCapacity={slotMaxCapacity}
                        />
                        {spotsRemaining > 1 && (
                          <p className="text-xs text-slate-500 mt-2">
                            Share this session after booking to drop the price for everyone
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="booking-message" className="block text-sm font-medium text-slate-700 mb-1">
                    Message to coach <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="booking-message"
                    value={bookingMessage}
                    onChange={(e) => setBookingMessage(e.target.value)}
                    placeholder="e.g. what you'd like to work on, experience level…"
                    maxLength={2000}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  {bookingMessage.length > 1800 && (
                    <p className="text-slate-500 text-xs mt-1">{bookingMessage.length} / 2000</p>
                  )}
                </div>

                <button
                  onClick={handleBook}
                  disabled={bookMutation.isPending}
                  className="w-full bg-brand-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
                >
                  {bookMutation.isPending
                    ? "Requesting…"
                    : lockPrivate
                      ? "Book private session"
                      : isGroupEligible
                        ? "Join this session"
                        : "Request booking"}
                </button>

                {bookingError && (
                  <p className="text-danger-700 text-sm bg-danger-50 px-3 py-2 rounded-lg border border-danger-200" role="alert">
                    {bookingError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
