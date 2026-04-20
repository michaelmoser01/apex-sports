import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useLocation, Navigate, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ChevronDown, Calendar, Star, ChevronRight, Clock, CheckCircle, XCircle, DollarSign, Users, Lock } from "lucide-react";

interface BookingBase {
  id: string;
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    maxCapacity?: number;
    location: { name: string; address: string; notes: string | null } | null;
  };
  message: string | null;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  lockedPrivate?: boolean;
  sessionType?: "private" | "group";
  participantCount?: number;
  spotsRemaining?: number;
}

interface CoachSessionParticipant {
  id: string;
  athlete: { id: string; name: string | null; email: string };
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  message: string | null;
  createdAt: string;
  completedAt: string | null;
  coachRecap: string | null;
  review: { rating: number; comment: string; createdAt: string } | null;
  lockedPrivate: boolean;
}

interface CoachSession {
  slotId: string;
  sessionType: "private" | "group";
  sessionStatus: string;
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    maxCapacity: number;
    location: { name: string; address: string; notes: string | null } | null;
  };
  participants: CoachSessionParticipant[];
}

interface BookingsData {
  asAthlete: (BookingBase & {
    coach: { id: string; displayName: string; sports: string[] };
    review: { rating: number; comment: string } | null;
  })[];
  asCoach: (BookingBase & {
    athlete: { id: string; name: string | null; email: string };
    coachRecap: string | null;
    review?: { rating: number; comment: string } | null;
  })[];
  coachSessions?: CoachSession[];
}

type TabId = "athlete" | "coach";

interface CoachProfilePayment {
  hourlyRate: string | null;
  stripeOnboardingComplete?: boolean;
  feeMode?: string;
}

function isActive(endTime: string, status: string): boolean {
  if (status === "cancelled" || status === "completed") return false;
  return new Date(endTime) >= new Date();
}

export default function Bookings() {
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("athlete");
  const [showPastAthlete, setShowPastAthlete] = useState(false);
  const [showPastCoach, setShowPastCoach] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
  const [feeModeSaving, setFeeModeSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "cancel" | "complete" | "cancel_request" | "needs_stripe";
    bookingId: string;
    slotId?: string;
    athleteName?: string;
    paymentStatus?: string | null;
  } | null>(null);

  const { data: currentUser } = useCurrentUser(true);
  const hasCoachProfile = !!currentUser?.coachProfile;

  const { data: coachProfile } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: () => api<CoachProfilePayment>("/coaches/me"),
    enabled: hasCoachProfile,
  });

  const [connectStatusSyncing, setConnectStatusSyncing] = useState(false);
  const [paymentVerifySyncing, setPaymentVerifySyncing] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (
      (params.get("connect") === "return" || params.get("connect") === "refresh") &&
      hasCoachProfile
    ) {
      setConnectStatusSyncing(true);
      api<{ stripeOnboardingComplete: boolean }>("/coaches/me/connect-status")
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
          window.history.replaceState({}, "", location.pathname);
        })
        .finally(() => setConnectStatusSyncing(false));
    }
  }, [location.search, location.pathname, hasCoachProfile, queryClient]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentSuccess = params.get("payment") === "success";
    const sessionId = params.get("session_id");
    if (paymentSuccess && sessionId) {
      setPaymentVerifySyncing(true);
      api<{ paymentStatus: string }>(`/bookings/verify-checkout-payment?session_id=${encodeURIComponent(sessionId)}`)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["bookings"] });
          setSuccessMessage("Payment confirmed.");
          setTimeout(() => setSuccessMessage(null), 5000);
        })
        .catch(() => {})
        .finally(() => {
          setPaymentVerifySyncing(false);
          window.history.replaceState({}, "", location.pathname);
        });
    }
  }, [location.search, location.pathname, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<BookingsData>("/bookings"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      slotId?: string;
      status: "confirmed" | "cancelled" | "completed";
    }) =>
      api<{ status: string }>(`/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data: { status: string }, variables) => {
      setUpdateError(null);
      setPendingUpdateId(null);
      setConfirmAction(null);
      if (data?.status === "completed" && variables.slotId) {
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        navigate(`/sessions/${variables.slotId}`);
        return;
      }
      if (data?.status === "cancelled") setSuccessMessage("Booking cancelled.");
      else if (data?.status === "confirmed") setSuccessMessage("Booking confirmed.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Update failed");
      setPendingUpdateId(null);
      setConfirmAction(null);
    },
  });

  const paymentRequestMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      await api(`/bookings/${bookingId}/payment-request`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });


  const asAthlete = data?.asAthlete ?? [];
  const asCoach = data?.asCoach ?? [];
  const coachSessions = data?.coachSessions ?? [];

  const { athleteUpcoming, athleteUnpaid, athletePast } = useMemo(() => {
    const active = asAthlete
      .filter((b) => isActive(b.slot.endTime, b.status))
      .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
    const unpaid = asAthlete.filter(
      (b) => b.status === "completed" &&
             (b.paymentStatus === "deferred" || b.paymentStatus === "payment_link_sent")
    );
    const unpaidIds = new Set(unpaid.map((b) => b.id));
    const past = asAthlete.filter((b) => !isActive(b.slot.endTime, b.status) && !unpaidIds.has(b.id));
    return { athleteUpcoming: active, athleteUnpaid: unpaid, athletePast: past };
  }, [asAthlete]);

  const { coachUpcomingSessions, coachUnpaid, coachPastSessions } = useMemo(() => {
    const isSessionActive = (s: CoachSession) => {
      if (s.sessionStatus === "cancelled" || s.sessionStatus === "completed") return false;
      return new Date(s.slot.endTime) >= new Date();
    };

    const active = coachSessions
      .filter(isSessionActive)
      .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
    const past = coachSessions
      .filter((s) => !isSessionActive(s))
      .sort((a, b) => new Date(b.slot.startTime).getTime() - new Date(a.slot.startTime).getTime());

    const unpaid = asCoach.filter(
      (b) => b.status === "completed" &&
             (b.paymentStatus === "deferred" || b.paymentStatus === "payment_link_sent")
    );

    return { coachUpcomingSessions: active, coachUnpaid: unpaid, coachPastSessions: past };
  }, [coachSessions, asCoach]);

  const tabs: { id: TabId; label: string }[] = hasCoachProfile
    ? [
        { id: "coach", label: "As Coach" },
        { id: "athlete", label: "As Athlete" },
      ]
    : [{ id: "athlete", label: "As Athlete" }];

  useEffect(() => {
    if (hasCoachProfile) setActiveTab("coach");
  }, [hasCoachProfile]);

  if (returnTo) {
    return <Navigate to={returnTo} replace />;
  }

  if (isLoading || data === undefined) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-slate-500">
          {isLoading ? "Loading bookings..." : "Unable to load bookings."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
          <Calendar className="w-5 h-5" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Bookings</h1>
      </div>

      {paymentVerifySyncing && (
        <p className="mb-4 text-slate-600 text-sm">Verifying payment…</p>
      )}

      {hasCoachProfile && coachProfile?.hourlyRate && (
        <section className="mb-6 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Payments</h2>
              {!connectStatusSyncing && coachProfile.stripeOnboardingComplete && (
                <span className="flex items-center gap-1 text-success-700 text-xs font-medium">
                  <CheckCircle className="w-3.5 h-3.5 text-success-600" />
                  Active
                </span>
              )}
            </div>
            {!connectStatusSyncing && coachProfile.stripeOnboardingComplete && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const data = await api<{ url: string }>("/coaches/me/stripe-dashboard");
                    if (data.url) window.open(data.url, "_blank");
                  } catch {
                    window.open("https://connect.stripe.com/express_login", "_blank");
                  }
                }}
                className="text-brand-600 hover:text-brand-700 text-xs font-medium hover:underline"
              >
                Stripe dashboard &rarr;
              </button>
            )}
          </div>
          {connectStatusSyncing ? (
            <p className="text-slate-500 text-sm">Checking payment setup…</p>
          ) : coachProfile.stripeOnboardingComplete ? (
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-slate-700 text-sm font-medium">Who pays processing fees?</p>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                    <button
                    type="button"
                    disabled={feeModeSaving}
                    onClick={async () => {
                      if (coachProfile.feeMode !== "coach_absorbs") return;
                      setFeeModeSaving(true);
                      try {
                        await api("/coaches/me", { method: "PUT", body: JSON.stringify({ feeMode: "pass_to_athlete" }) });
                        queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
                      } finally { setFeeModeSaving(false); }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-md transition-all disabled:opacity-50 ${
                      coachProfile.feeMode !== "coach_absorbs"
                        ? "bg-white text-slate-900 font-medium shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Athlete pays
                  </button>
                  <button
                    type="button"
                    disabled={feeModeSaving}
                    onClick={async () => {
                      if (coachProfile.feeMode === "coach_absorbs") return;
                      setFeeModeSaving(true);
                      try {
                        await api("/coaches/me", { method: "PUT", body: JSON.stringify({ feeMode: "coach_absorbs" }) });
                        queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
                      } finally { setFeeModeSaving(false); }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-md transition-all disabled:opacity-50 ${
                      coachProfile.feeMode === "coach_absorbs"
                        ? "bg-white text-slate-900 font-medium shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    I pay
                    </button>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-1.5">
                  {coachProfile.feeMode === "coach_absorbs"
                    ? "~3% is deducted from your payout. Athletes pay your exact session price."
                    : "A ~3% fee is added to the athlete's total. You keep 100% of your rate."}
                </p>
            </div>
          ) : (
            <>
              <p className="text-slate-600 text-sm mb-3">
                Connect your Stripe account to get paid when athletes book sessions.
              </p>
              <Link
                to="/coach/setup/get-paid"
                className="inline-block bg-brand-500 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-brand-600 transition-colors"
              >
                Set up payments
              </Link>
            </>
          )}
        </section>
      )}

      {tabs.length > 1 && (
        <div className="flex gap-0 border-b border-slate-200 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === tab.id
                  ? "text-brand-600"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}

      {activeTab === "athlete" && (
        <section className="mb-10 sm:mb-12">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Active bookings</h2>
          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-success-50 border border-success-200 text-success-800 text-sm" role="status">
              {successMessage}
            </div>
          )}
          {athleteUpcoming.length === 0 ? (
            <p className="text-slate-500">No active bookings.</p>
          ) : (
            <div className="space-y-5 sm:space-y-4">
              {athleteUpcoming.map((b) => (
                <div
                  key={b.id}
                  className="group p-5 sm:p-5 bg-white rounded-2xl border border-slate-200 border-l-4 border-l-brand-500 shadow-sm hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0 flex-1">
                    <Link to={`/bookings/${b.id}`} className="inline-flex items-center gap-1.5 font-bold text-slate-900 hover:text-brand-600 transition-colors">
                      {b.coach.displayName}
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-500 shrink-0" />
                    </Link>
                    <p className="text-brand-600 text-sm font-semibold mt-0.5">{b.coach.sports?.length ? b.coach.sports.join(", ") : "—"}</p>
                    <p className="text-slate-500 text-sm mt-1">
                      {new Date(b.slot.startTime).toLocaleString()}
                    </p>
                    <p className="text-slate-500 text-sm mt-0.5">{b.slot.location?.name ?? "Location TBD"}</p>
                    {b.sessionType === "group" && (
                      <p className="text-indigo-600 text-sm mt-1 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {b.participantCount ?? 0} joined{(b.spotsRemaining ?? 0) > 0 ? ` · ${b.spotsRemaining} spot${b.spotsRemaining === 1 ? "" : "s"} left` : ""}
                      </p>
                    )}
                    {b.lockedPrivate && (
                      <p className="text-slate-500 text-sm mt-1 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        Private session
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ring-1 ${
                        b.status === "confirmed"
                          ? "bg-success-100 text-success-700 ring-success-600/10"
                          : b.status === "completed"
                          ? "bg-slate-100 text-slate-700 ring-slate-600/10"
                          : b.status === "cancelled"
                          ? "bg-danger-100 text-danger-700 ring-danger-600/10"
                          : "bg-amber-100 text-amber-700 ring-amber-600/10"
                      }`}
                    >
                      {b.status === "pending" && <Clock className="w-3.5 h-3.5" />}
                      {(b.status === "confirmed" || b.status === "completed") && <CheckCircle className="w-3.5 h-3.5" />}
                      {b.status === "cancelled" && <XCircle className="w-3.5 h-3.5" />}
                      {b.status}
                    </span>
                    {b.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: "cancel_request", bookingId: b.id })}
                        disabled={pendingUpdateId != null}
                        className="text-danger-600 hover:text-danger-700 text-sm font-medium underline disabled:opacity-50"
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                </div>
                {b.status === "completed" && !b.review && (
                  <Link
                    to={`/bookings/${b.id}`}
                    className="mt-4 flex items-center gap-2 text-amber-600 hover:text-amber-700 font-medium text-sm"
                  >
                    <span className="flex gap-0.5 text-amber-400">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className="w-4 h-4 fill-current" />
                      ))}
                    </span>
                    Add a review
                  </Link>
                )}
                </div>
              ))}
            </div>
          )}

          {athleteUnpaid.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Unpaid sessions
                <span className="ml-2 text-sm font-normal text-slate-500">({athleteUnpaid.length})</span>
              </h2>
              <div className="space-y-4">
                  {athleteUnpaid.map((b) => (
                  <div
                    key={`unpaid-${b.id}`}
                    className="p-5 sm:p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 border-l-4 border-l-amber-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <Link to={`/bookings/${b.id}`} className="min-w-0 flex-1 block group">
                      <p className="font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">{b.coach.displayName}</p>
                      <p className="text-slate-600 text-sm mt-0.5">
                        {new Date(b.slot.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      <p className="text-slate-500 text-sm mt-1">{b.slot.location?.name ?? "Location TBD"}</p>
                      {b.amountCents != null && (
                        <p className="text-amber-800 font-semibold text-sm mt-2">
                          ${(b.amountCents / 100).toFixed(2)} due
                        </p>
                      )}
                    </Link>
                    <button
                      type="button"
                      onClick={() => navigate(`/bookings/${b.id}`)}
                      className="shrink-0 px-5 py-3 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 touch-manipulation shadow-sm"
                    >
                      Pay now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {athletePast.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowPastAthlete((v) => !v)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm mb-4"
              >
                <span>
                  {showPastAthlete ? "Hide" : "Show"} past or closed ({athletePast.length})
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showPastAthlete ? "rotate-180" : ""}`} />
              </button>
              {showPastAthlete && (
                <div className="space-y-5 sm:space-y-4">
                  <p className="text-slate-500 text-sm mb-1">
                    Slots that have already passed or are completed/cancelled. Pending here means the session date passed before it was confirmed or completed.
                  </p>
                  {athletePast.map((b) => (
                    <div
                      key={b.id}
                      className="p-5 sm:p-4 bg-white rounded-2xl border border-slate-200 border-l-4 border-l-slate-300 shadow-sm opacity-90 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                        <div className="min-w-0">
                          <Link to={`/bookings/${b.id}`} className="inline-flex items-center gap-1.5 font-medium text-slate-900 hover:text-brand-600 transition-colors">
                            {b.coach.displayName}
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </Link>
                          <p className="text-brand-600 text-sm">{b.coach.sports?.length ? b.coach.sports.join(", ") : "—"}</p>
                          <p className="text-slate-500 text-sm mt-1">
                            {new Date(b.slot.startTime).toLocaleString()}
                          </p>
                          {b.slot.location && (
                            <p className="text-slate-500 text-sm mt-0.5">{b.slot.location.name}</p>
                          )}
                        </div>
                        <span
                          className={`self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 shrink-0 ${
                            b.status === "confirmed"
                              ? "bg-success-100 text-success-700 ring-success-600/10"
                              : b.status === "completed"
                              ? "bg-slate-100 text-slate-700 ring-slate-600/10"
                              : b.status === "cancelled"
                              ? "bg-danger-100 text-danger-700 ring-danger-600/10"
                              : "bg-amber-100 text-amber-700 ring-amber-600/10"
                          }`}
                        >
                          {b.status === "pending" && <Clock className="w-3.5 h-3.5" />}
                          {(b.status === "confirmed" || b.status === "completed") && <CheckCircle className="w-3.5 h-3.5" />}
                          {b.status === "cancelled" && <XCircle className="w-3.5 h-3.5" />}
                          {b.status}
                        </span>
                      </div>
                      {b.status === "completed" && !b.review && (
                        <Link
                          to={`/bookings/${b.id}`}
                          className="mt-4 flex items-center gap-2 text-amber-600 hover:text-amber-700 font-medium text-sm"
                        >
                          <span className="flex gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star key={i} className="w-4 h-4 fill-current" />
                            ))}
                          </span>
                          Add a review
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "coach" && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Active bookings</h2>
          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-success-50 border border-success-200 text-success-800 text-sm" role="status">
              {successMessage}
            </div>
          )}
          {updateError && (
            <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-800 text-sm" role="alert">
              {updateError}
            </div>
          )}
          {coachUpcomingSessions.length === 0 ? (
            <p className="text-slate-500">No active bookings or pending requests.</p>
          ) : (
            <div className="space-y-5 sm:space-y-4">
              {coachUpcomingSessions.map((session) => {
                const slot = session.slot;
                const activeParticipants = session.participants.filter((p) => p.status !== "cancelled");
                const pendingCount = activeParticipants.filter((p) => p.status === "pending").length;
                const confirmedCount = activeParticipants.filter((p) => p.status === "confirmed").length;
                const isGroup = session.sessionType === "group";
                const hasPending = pendingCount > 0;
                const linkTo = `/sessions/${session.slotId}`;

                return (
                  <Link
                    key={session.slotId}
                    to={linkTo}
                    className="block group p-5 sm:p-5 bg-white rounded-2xl border border-slate-200 border-l-4 border-l-brand-500 shadow-sm hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900">
                            {new Date(slot.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                            {" · "}
                            {new Date(slot.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            {" – "}
                            {new Date(slot.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-500 shrink-0" />
                        </div>
                        <p className="text-slate-500 text-sm mt-1 ml-6">{slot.location?.name ?? "Location TBD"}</p>
                        <div className="mt-2 ml-6">
                          {isGroup ? (
                            <p className="text-sm text-slate-700 flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-indigo-500" />
                              <span className="font-medium">{activeParticipants.length} athlete{activeParticipants.length !== 1 ? "s" : ""}</span>
                              <span className="text-slate-400">—</span>
                              {pendingCount > 0 && (
                                <span className="text-amber-600 font-medium">{pendingCount} pending</span>
                              )}
                              {pendingCount > 0 && confirmedCount > 0 && (
                                <span className="text-slate-400">,</span>
                              )}
                              {confirmedCount > 0 && (
                                <span className="text-success-600 font-medium">{confirmedCount} confirmed</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-sm text-slate-700">
                              {session.participants[0]?.athlete.name ?? session.participants[0]?.athlete.email}
                            </p>
                          )}
                          {isGroup && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {activeParticipants.map((p) => (
                                <span
                                  key={p.id}
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                    p.status === "confirmed"
                                      ? "bg-success-50 text-success-700"
                                      : p.status === "pending"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    p.status === "confirmed" ? "bg-success-500" : p.status === "pending" ? "bg-amber-500" : "bg-slate-400"
                                  }`} />
                                  {p.athlete.name ?? p.athlete.email}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {hasPending ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ring-1 bg-amber-100 text-amber-700 ring-amber-600/10">
                            <Clock className="w-3.5 h-3.5" />
                            Needs review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ring-1 bg-success-100 text-success-700 ring-success-600/10">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Confirmed
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {coachUnpaid.length > 0 && (
            <div className="mt-8 p-5 sm:p-6 bg-amber-50 rounded-2xl border-2 border-amber-300">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-amber-600" />
                  Payment due
                  <span className="text-base font-semibold text-amber-700">
                    ${(coachUnpaid.reduce((s, b) => s + (b.amountCents ?? 0), 0) / 100).toFixed(2)}
                  </span>
                </h2>
                <span className="text-sm text-amber-700 font-medium">{coachUnpaid.length} session{coachUnpaid.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {coachUnpaid.map((b) => (
                  <div
                    key={`unpaid-${b.id}`}
                    className="p-4 bg-white rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link to={`/bookings/${b.id}`} className="font-medium text-slate-900 hover:text-brand-600 transition-colors">{b.athlete.name ?? b.athlete.email}</Link>
                        {b.amountCents != null && (
                          <span className="text-sm font-semibold text-amber-700">${(b.amountCents / 100).toFixed(2)}</span>
                        )}
                      </div>
                      <p className="text-slate-500 text-sm">
                        {new Date(b.slot.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      <p className="text-slate-500 text-sm mt-0.5">{b.slot.location?.name ?? "Location TBD"}</p>
                      <Link
                        to={`/bookings/${b.id}`}
                        className="text-brand-600 text-sm font-medium hover:underline mt-1 inline-block"
                      >
                        {b.coachRecap ? "View booking" : "Add session recap"}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        b.paymentStatus === "payment_link_sent"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {b.paymentStatus === "payment_link_sent" ? "Link sent" : "Not sent"}
                      </span>
                      {coachProfile?.stripeOnboardingComplete ? (
                        <button
                          type="button"
                          onClick={() => paymentRequestMutation.mutate(b.id)}
                          disabled={paymentRequestMutation.isPending}
                          className="px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 touch-manipulation disabled:opacity-50"
                        >
                          {b.paymentStatus === "payment_link_sent" ? "Resend link" : "Send payment link"}
                        </button>
                      ) : (
                        <a
                          href="/coach/setup/get-paid"
                          className="px-3 py-2 text-sm font-medium text-amber-800 bg-amber-100 rounded-lg hover:bg-amber-200 touch-manipulation"
                        >
                          Set up payments
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {coachPastSessions.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowPastCoach((v) => !v)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm mb-4"
              >
                <span>
                  {showPastCoach ? "Hide" : "Show"} past or closed ({coachPastSessions.length})
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showPastCoach ? "rotate-180" : ""}`} />
              </button>
              {showPastCoach && (
                <div className="space-y-5 sm:space-y-4">
                  <p className="text-slate-500 text-sm mb-1">
                    Slots that have already passed or are completed/cancelled. Pending here means the session date passed before it was confirmed or completed.
                  </p>
                  {coachPastSessions.map((session) => {
                    const slot = session.slot;
                    const isGroup = session.sessionType === "group";
                    const completedCount = session.participants.filter((p) => p.status === "completed").length;
                    const cancelledCount = session.participants.filter((p) => p.status === "cancelled").length;
                    const hasRecap = session.participants.some((p) => p.coachRecap);
                    const linkTo = `/sessions/${session.slotId}`;

                    return (
                      <Link
                        key={session.slotId}
                        to={linkTo}
                        className="block p-5 sm:p-4 bg-white rounded-2xl border border-slate-200 border-l-4 border-l-slate-300 opacity-90 hover:opacity-100 transition-opacity"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="font-medium text-slate-900">
                                {new Date(slot.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                                {" · "}
                                {new Date(slot.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                {" – "}
                                {new Date(slot.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                            {slot.location && (
                              <p className="text-slate-500 text-sm mt-1 ml-6">{slot.location.name}</p>
                            )}
                            <div className="mt-2 ml-6">
                              {isGroup ? (
                                <p className="text-sm text-slate-600">
                                  {session.participants.length} athlete{session.participants.length !== 1 ? "s" : ""}
                                  {completedCount > 0 && <span className="text-slate-500"> · {completedCount} completed</span>}
                                  {cancelledCount > 0 && <span className="text-slate-400"> · {cancelledCount} cancelled</span>}
                                </p>
                              ) : (
                                <p className="text-sm text-slate-600">
                                  {session.participants[0]?.athlete.name ?? session.participants[0]?.athlete.email}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${
                                completedCount > 0
                                  ? "bg-slate-100 text-slate-700 ring-slate-600/10"
                                  : cancelledCount === session.participants.length
                                  ? "bg-danger-100 text-danger-700 ring-danger-600/10"
                                  : "bg-amber-100 text-amber-700 ring-amber-600/10"
                              }`}
                            >
                              {completedCount > 0 && <CheckCircle className="w-3.5 h-3.5" />}
                              {completedCount > 0 ? "completed" : cancelledCount === session.participants.length ? "cancelled" : "expired"}
                            </span>
                            {completedCount > 0 && (
                              <span className="text-brand-600 text-sm font-medium">
                                {hasRecap ? "View session" : "Add recap"}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {confirmAction && confirmAction.type === "needs_stripe" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 mb-2">Set up payments first</h2>
            <p className="text-slate-600 text-sm mb-4">
              You need to set up your payment account before you can complete sessions. This lets you receive payments from athletes.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium text-sm"
              >
                Back
              </button>
              <Link
                to="/coach/setup/get-paid"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600"
              >
                Set up payments
              </Link>
            </div>
          </div>
        </div>
      )}
      {confirmAction && confirmAction.type !== "needs_stripe" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction.type === "complete" ? "Mark session complete?" : "Cancel booking?"}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {confirmAction.type === "complete"
                ? confirmAction.paymentStatus === "authorized" || confirmAction.paymentStatus === "pending_authorization"
                  ? "This will charge the athlete\u2019s card and transfer the session amount to you. This cannot be undone."
                  : confirmAction.paymentStatus === "deferred"
                    ? "This will mark the session as complete and automatically send a payment link to the athlete."
                    : "This will mark the session as complete."
                : confirmAction.type === "cancel_request"
                  ? "Your request will be cancelled and the slot will be released."
                  : `This will cancel the booking${confirmAction.athleteName ? ` with ${confirmAction.athleteName}` : ""}. Any payment hold will be released.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  const status = confirmAction.type === "complete" ? "completed" : "cancelled";
                  setPendingUpdateId(confirmAction.bookingId);
                  updateMutation.mutate({ id: confirmAction.bookingId, slotId: confirmAction.slotId, status });
                }}
                disabled={updateMutation.isPending}
                className={
                  confirmAction.type === "complete"
                    ? "px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                    : "px-4 py-2 rounded-lg text-sm font-medium bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50"
                }
              >
                {confirmAction.type === "complete" ? "Mark complete" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
