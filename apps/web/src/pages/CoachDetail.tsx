import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  addDays,
  isSameMonth,
  isSameDay,
  isBefore,
  format,
} from "date-fns";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";
import { BookingPaymentForm } from "@/components/BookingPaymentForm";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;

interface CoachPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

interface CoachDetail {
  id: string;
  displayName: string;
  sports: string[];
  serviceCities: string[];
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  photos?: CoachPhoto[];
  availabilitySlots: { id: string; startTime: string; endTime: string }[];
  reviews: {
    id: string;
    rating: number;
    comment: string;
    athleteName: string | null;
    createdAt: string;
  }[];
  reviewCount: number;
  averageRating: number | null;
}

const WEEK_STARTS_ON = 0; // Sunday

function getCalendarDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  const days: Date[] = [];
  let d = start;
  while (d <= end) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

export default function CoachDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingSuccess) return;
    const t = setTimeout(() => setBookingSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [bookingSuccess]);

  const { data: coach, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["coach", id],
    queryFn: () => api<CoachDetail>(`/coaches/${id}`),
    enabled: !!id,
  });

  const { data: myBookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<{ asAthlete: { coach: { id: string }; slot: { id: string }; status: string }[] }>("/bookings"),
    enabled: !!id && isAuthenticated,
  });

  const myPendingSlotIds = useMemo(() => {
    if (!id || !myBookings?.asAthlete) return new Set<string>();
    return new Set(
      myBookings.asAthlete
        .filter((b) => b.coach.id === id && b.status === "pending")
        .map((b) => b.slot.id)
    );
  }, [id, myBookings]);

  const bookMutation = useMutation({
    mutationFn: async ({
      slotId,
      message,
      paymentMethodId,
    }: {
      slotId: string;
      message?: string;
      paymentMethodId?: string;
    }) =>
      api<{ id: string; clientSecret?: string; requiresAction?: boolean }>("/bookings", {
        method: "POST",
        body: JSON.stringify({
          coachId: id,
          slotId,
          ...(message?.trim() ? { message: message.trim() } : {}),
          ...(paymentMethodId ? { payment_method: paymentMethodId } : {}),
        }),
      }),
    onSuccess: (data) => {
      if (data?.clientSecret && !needsPaymentForm) {
        setBookingError(
          "This session requires payment. Please refresh the page to see the payment form and enter your card."
        );
        return;
      }
      setSelectedSlot(null);
      setBookingMessage("");
      setBookingError(null);
      setBookingSuccess("Request sent! We'll email you when the coach responds. Your card won't be charged until the coach marks the session complete.");
      queryClient.invalidateQueries({ queryKey: ["coach", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      const msg = err.message ?? "Something went wrong.";
      if (msg.includes("already booked") || msg.includes("Slot is already booked"))
        setBookingError("This slot was just booked. Please pick another time.");
      else if (msg.includes("pending request")) setBookingError("You already have a pending request for this time.");
      else if (msg.includes("Payment method required")) setBookingError("Please enter your card details above.");
      else setBookingError(msg);
    },
  });

  // Derive slots safely (empty when no coach) so useMemo below always has valid input
  const slots = !coach
    ? []
    : Array.isArray(coach.availabilitySlots)
      ? coach.availabilitySlots.filter(
          (s) => s && typeof s.startTime === "string" && !Number.isNaN(new Date(s.startTime).getTime())
        )
      : [];

  const selectedSlotData = useMemo(() => {
    if (!selectedSlot || !slots.length) return null;
    return slots.find((s) => s.id === selectedSlot) ?? null;
  }, [selectedSlot, slots]);

  const sessionAmountCents = useMemo(() => {
    if (!coach?.hourlyRate || !selectedSlotData) return null;
    const rate = Number(coach.hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const start = new Date(selectedSlotData.startTime).getTime();
    const end = new Date(selectedSlotData.endTime).getTime();
    const hours = (end - start) / (60 * 60 * 1000);
    return Math.max(50, Math.ceil(hours * rate * 100));
  }, [coach?.hourlyRate, selectedSlotData]);

  const needsPaymentForm =
    !!coach?.hourlyRate &&
    !!stripePk &&
    !!selectedSlot &&
    !!sessionAmountCents &&
    isAuthenticated &&
    !myPendingSlotIds.has(selectedSlot);

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const slotsByDay = useMemo(() => {
    const map = new Map<string, { id: string; startTime: string; endTime: string }[]>();
    for (const slot of slots) {
      const d = new Date(slot.startTime);
      const key = format(d, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(slot);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [slots]);

  if (isLoading || (!coach && !isError)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (isError) {
    const isNotFound =
      error?.message?.toLowerCase().includes("not found") ||
      (error as Error & { status?: number })?.status === 404;
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-slate-700 font-medium">
          {isNotFound ? "Coach not found." : "Something went wrong loading this coach."}
        </p>
        {!isNotFound && error && (
          <p className="text-slate-500 text-sm mt-1">{error.message}</p>
        )}
        <div className="mt-4 flex gap-3">
          <Link
            to="/coaches"
            className="text-brand-600 hover:underline font-medium"
          >
            ← Back to coaches
          </Link>
          {!isNotFound && (
            <button
              type="button"
              onClick={() => refetch()}
              className="text-brand-600 hover:underline font-medium"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const reviews = Array.isArray(coach.reviews) ? coach.reviews : [];

  const handleBook = () => {
    if (!selectedSlot) return;
    if (!isAuthenticated) {
      navigate("/bookings", { state: { returnTo: `/coaches/${id}` }, replace: false });
      return;
    }
    bookMutation.mutate({ slotId: selectedSlot, message: bookingMessage });
  };

  const photos = Array.isArray(coach.photos) ? coach.photos : [];
  const photoUrls = (() => {
    const urls = photos.map((p) => p?.url).filter((u): u is string => typeof u === "string" && u.length > 0);
    const avatar = coach.avatarUrl && typeof coach.avatarUrl === "string" ? coach.avatarUrl : null;
    if (avatar) return [avatar, ...urls.filter((u) => u !== avatar)];
    return urls;
  })();

  const selectedDateSlots = selectedDate
    ? (slotsByDay.get(format(selectedDate, "yyyy-MM-dd")) ?? []).slice()
    : [];

  const hasAvailabilityOnDay = (day: Date) =>
    slotsByDay.has(format(day, "yyyy-MM-dd"));
  const isDayInPast = (day: Date) => isBefore(day, todayStart);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {photoUrls.length > 0 && (
        <div className="mb-8 -mx-4 sm:mx-0">
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory rounded-xl overflow-hidden">
            {photoUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="flex-shrink-0 w-full max-w-sm h-64 object-cover rounded-lg snap-start border border-slate-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {coach.displayName ?? "Coach"}
          {coach.verified && (
            <span className="ml-2 text-sm bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
              Verified
            </span>
          )}
        </h1>
        <p className="text-brand-600 font-medium">
          {Array.isArray(coach.sports) && coach.sports.length > 0 ? coach.sports.join(", ") : "—"}
        </p>
        {Array.isArray(coach.serviceCities) && coach.serviceCities.length > 0 ? (
          <p className="text-slate-500 text-sm mt-1">{coach.serviceCities.join(", ")}</p>
        ) : null}
        {coach.hourlyRate != null && String(coach.hourlyRate).trim() !== "" && (
          <p className="font-semibold text-slate-900 mt-2">
            ${String(coach.hourlyRate)}/hr
          </p>
        )}
        {(Number(coach.reviewCount) ?? 0) > 0 && (
          <p className="text-slate-600 mt-1">
            ★ {(coach.averageRating != null ? Number(coach.averageRating).toFixed(1) : "0")} ({coach.reviewCount} reviews)
          </p>
        )}
        {coach.bio != null && String(coach.bio).trim() !== "" && (
          <p className="text-slate-600 mt-4 whitespace-pre-wrap">{String(coach.bio)}</p>
        )}
      </div>

      <div className="mb-8 p-6 bg-white rounded-xl border border-slate-200">
        <h2 className="font-semibold text-slate-900 mb-4">
          {slots.length === 0 ? "Availability" : "Request a booking"}
        </h2>
        {slots.length === 0 ? (
          <p className="text-slate-500">
            No available slots. Check back later.
          </p>
        ) : (
          <>
            <p className="text-slate-600 text-sm mb-3">
              Select a day to see available times.
              {!isAuthenticated && (
                <span className="block mt-1 text-slate-500">
                  You’ll sign in or create an account when you request a booking.
                </span>
              )}
            </p>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    aria-label="Previous month"
                  >
                    ←
                  </button>
                  <span className="font-medium text-slate-900">
                    {format(calendarMonth, "MMMM yyyy")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    aria-label="Next month"
                  >
                    →
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((wd) => (
                    <div key={wd}>{wd}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const hasSlot = hasAvailabilityOnDay(day);
                    const isPast = isDayInPast(day);
                    const isCurrentMonth = isSameMonth(day, calendarMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const clickable = hasSlot && !isPast;
                    return (
                      <button
                        key={day.getTime()}
                        type="button"
                        disabled={!clickable}
                        onClick={() => clickable && setSelectedDate(day)}
                        className={`
                          aspect-square rounded-lg text-sm transition
                          ${!isCurrentMonth ? "text-slate-300" : "text-slate-900"}
                          ${isPast ? "opacity-50 cursor-not-allowed" : ""}
                          ${clickable ? "hover:bg-slate-100" : ""}
                          ${isSelected ? "bg-brand-500 text-white hover:bg-brand-600" : ""}
                          ${!isSelected && hasSlot && !isPast ? "bg-brand-100/50" : ""}
                        `}
                      >
                        {format(day, "d")}
                        {hasSlot && !isPast && (
                          <span className="block w-1 h-1 rounded-full bg-current mx-auto mt-0.5 opacity-70" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedDate && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-slate-700 font-medium mb-2">
                    {format(selectedDate, "EEEE, MMM d")}
                  </p>
                  {selectedDateSlots.length === 0 ? (
                    <p className="text-slate-500 text-sm">No times available this day.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedDateSlots.map((slot) => {
                          const start = new Date(slot.startTime);
                          const end = new Date(slot.endTime);
                          const isSlotSelected = selectedSlot === slot.id;
                          const isPendingMine = myPendingSlotIds.has(slot.id);
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => { setSelectedSlot(slot.id); setBookingSuccess(null); setBookingError(null); }}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                                isPendingMine
                                  ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                                  : isSlotSelected
                                    ? "bg-brand-500 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              –{end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </button>
                          );
                        })}
                      </div>
                      {selectedSlot && !isAuthenticated && (
                        <p className="text-slate-600 text-sm mt-2">
                          <Link
                            to="/bookings"
                            state={{ returnTo: `/coaches/${id}` }}
                            className="text-brand-600 font-medium hover:underline"
                          >
                            Sign in or create an account
                          </Link>{" "}
                          to request this booking.
                        </p>
                      )}
                      {selectedSlot && isAuthenticated && myPendingSlotIds.has(selectedSlot) && (
                        <p className="text-amber-700 text-sm mt-2 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                          You already have a pending request for this time. We’ll email you when the coach responds.
                        </p>
                      )}
                      {selectedSlot && isAuthenticated && !myPendingSlotIds.has(selectedSlot) && (
                        <>
                          <div className="mb-3">
                            <label htmlFor="booking-message" className="block text-sm font-medium text-slate-700 mb-1">
                              Message to coach <span className="text-slate-400 font-normal">(optional)</span>
                            </label>
                            <textarea
                              id="booking-message"
                              value={bookingMessage}
                              onChange={(e) => setBookingMessage(e.target.value)}
                              placeholder="e.g. what you’d like to work on, experience level…"
                              maxLength={2000}
                              rows={3}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                            />
                            {bookingMessage.length > 1800 && (
                              <p className="text-slate-500 text-xs mt-1">{bookingMessage.length} / 2000</p>
                            )}
                          </div>
                          {needsPaymentForm && stripePromise != null && sessionAmountCents ? (
                            <Elements stripe={stripePromise!}>
                              <BookingPaymentForm
                                slotId={selectedSlot}
                                message={bookingMessage}
                                amountCents={sessionAmountCents}
                                createBooking={(body) =>
                                  bookMutation.mutateAsync({
                                    slotId: body.slotId,
                                    message: body.message,
                                    paymentMethodId: body.paymentMethodId,
                                  })
                                }
                                cancelBooking={(bookingId) =>
                                  api(`/bookings/${bookingId}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ status: "cancelled" }),
                                  })
                                }
                                onSuccess={() => {
                                  setSelectedSlot(null);
                                  setBookingMessage("");
                                  setBookingError(null);
                                  queryClient.invalidateQueries({ queryKey: ["coach", id] });
                                  queryClient.invalidateQueries({ queryKey: ["bookings"] });
                                }}
                                onError={setBookingError}
                                disabled={bookMutation.isPending}
                              />
                            </Elements>
                          ) : (
                            <button
                              onClick={handleBook}
                              disabled={bookMutation.isPending}
                              className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
                            >
                              {bookMutation.isPending ? "Requesting..." : "Request Booking"}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
              {bookingSuccess && (
                <p className="text-emerald-700 text-sm mt-2 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200" role="status">
                  {bookingSuccess}
                </p>
              )}
              {bookingError && (
                <p className="text-red-700 text-sm mt-2 bg-red-50 px-3 py-2 rounded-lg border border-red-200" role="alert">
                  {bookingError}
                </p>
              )}
            </>
          )}
        </div>

      <div>
        <h2 className="font-semibold text-slate-900 mb-4">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-slate-500">No reviews yet.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r, i) => {
              const createdAt = r?.createdAt != null ? new Date(r.createdAt) : null;
              const dateStr = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : "";
              return (
                <div
                  key={r?.id ?? `review-${i}`}
                  className="p-4 bg-slate-50 rounded-lg"
                >
                  <div className="flex justify-between">
                    <span className="font-medium">
                      ★ {r?.rating ?? "—"} {r?.athleteName ? `— ${r.athleteName}` : ""}
                    </span>
                    {dateStr ? (
                      <span className="text-slate-500 text-sm">{dateStr}</span>
                    ) : null}
                  </div>
                  {r?.comment != null && String(r.comment).trim() !== "" && (
                    <p className="text-slate-600 mt-1">{String(r.comment)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
