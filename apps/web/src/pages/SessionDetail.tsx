import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  CheckCircle,
  Clock,
  Users,
  Share2,
  Lock,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { TBD_LOCATION_HELPER, TBD_LOCATION_OPTION_LABEL } from "@/lib/location";

interface Participant {
  id: string;
  athleteProfileId: string;
  /** Athlete's User id; only set when viewer is the coach (used to start a
   * direct message thread). Undefined for athlete viewers. */
  userId?: string;
  name: string | null;
  email?: string;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  attended: boolean;
  lockedPrivate: boolean;
  createdAt: string;
  completedAt: string | null;
  message: string | null;
  coachRecap: string | null;
  review: { rating: number; comment: string } | null;
  isCurrentUser: boolean;
}

interface SessionData {
  slotId: string;
  sessionStatus: string;
  inviteCode: string | null;
  lockedPrivate: boolean;
  maxCapacity: number;
  allowPrivate: boolean;
  startTime: string;
  endTime: string;
  currentPerPersonAmountCents: number | null;
  spotsRemaining: number;
  coach: {
    id: string;
    displayName: string;
    sports: string[];
    stripeOnboardingComplete: boolean;
    billingMode: string;
  };
  locationId: string | null;
  location: {
    id: string;
    name: string;
    address: string;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  participants: Participant[];
  viewerRole: "coach" | "athlete";
}

interface CoachLocationOption {
  id: string;
  name: string;
}

const DURATION_MINUTES_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180];

export default function SessionDetail() {
  const { slotId } = useParams<{ slotId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "complete" | "cancel-session" | "needs_stripe";
  } | null>(null);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, boolean>>({});

  const { data: session, isLoading, isError, error } = useQuery({
    queryKey: ["session", slotId],
    queryFn: () => api<SessionData>(`/sessions/${slotId}`),
    enabled: !!slotId,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: "confirmed" | "cancelled" }) =>
      api<{ status: string }>(`/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      if (data?.status === "confirmed") setSuccessMessage("Participant confirmed.");
      else if (data?.status === "cancelled") setSuccessMessage("Participant removed.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => setUpdateError(err.message ?? "Update failed"),
  });

  const completeMutation = useMutation({
    mutationFn: (attendance: { bookingId: string; attended: boolean }[]) =>
      api(`/sessions/${slotId}/complete`, {
        method: "POST",
        body: JSON.stringify({ attendance }),
      }),
    onSuccess: () => {
      setSuccessMessage("Session marked complete.");
      setConfirmAction(null);
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Failed to complete session");
      setConfirmAction(null);
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: () =>
      api(`/sessions/${slotId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Session cancelled.");
      setConfirmAction(null);
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Failed to cancel session");
      setConfirmAction(null);
    },
  });

  const confirmAllMutation = useMutation({
    mutationFn: () =>
      api<{ confirmed: number }>(`/sessions/${slotId}/confirm-all`, { method: "POST" }),
    onSuccess: (data) => {
      setSuccessMessage(`${data.confirmed} participant${data.confirmed === 1 ? "" : "s"} confirmed.`);
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => setUpdateError(err.message ?? "Failed to confirm all"),
  });

  const markPaidMutation = useMutation({
    mutationFn: (bookingId: string) =>
      api(`/bookings/${bookingId}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Payment marked as received.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const paymentRequestMutation = useMutation({
    mutationFn: (bookingId: string) =>
      api(`/bookings/${bookingId}/payment-request`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Payment link sent.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const messageParticipantsMutation = useMutation({
    mutationFn: () =>
      api<{ conversationId: string }>(`/messages/conversations/session/${slotId}`, { method: "POST" }),
    onSuccess: (data) => {
      navigate(`/messages/${data.conversationId}`);
    },
    onError: (err: Error) => setUpdateError(err.message ?? "Failed to start conversation"),
  });

  // Start (or resume) a 1:1 thread with a single participant — used by the
  // small message icon on each participant row. Distinct from the broadcast
  // session conversation above so coaches can DM one athlete privately.
  const directMessageMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      api<{ conversationId: string }>(`/messages/conversations/direct/${targetUserId}`, { method: "POST" }),
    onSuccess: (data) => {
      navigate(`/messages/${data.conversationId}`);
    },
    onError: (err: Error) => setUpdateError(err.message ?? "Failed to start conversation"),
  });

  // Coach-side slot edit / remove. Only meaningful when there are no active
  // participants — once anyone has booked, the appropriate destructive action
  // is "Cancel session" (which notifies athletes), not silently delete.
  const isCoachView = session?.viewerRole === "coach";
  const noActiveParticipants = (session?.participants.filter((p) => p.status !== "cancelled").length ?? 0) === 0;
  const canEditOrRemoveSlot = isCoachView && noActiveParticipants && session?.sessionStatus !== "cancelled" && session?.sessionStatus !== "completed";

  const { data: coachLocations } = useQuery({
    queryKey: ["coachLocations"],
    queryFn: () => api<CoachLocationOption[]>("/coaches/me/locations"),
    enabled: !!isCoachView,
  });

  const [isEditingSlot, setIsEditingSlot] = useState(false);
  const [editHour, setEditHour] = useState(0);
  const [editMinute, setEditMinute] = useState(0);
  const [editDuration, setEditDuration] = useState(60);
  const [editLocationId, setEditLocationId] = useState<string>("");
  const [editCapacity, setEditCapacity] = useState(1);
  const [editAllowPrivate, setEditAllowPrivate] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Hydrate edit form whenever session loads / refreshes.
  useEffect(() => {
    if (!session) return;
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    setEditHour(start.getHours());
    setEditMinute(start.getMinutes());
    setEditDuration(Math.round((end.getTime() - start.getTime()) / 60000));
    setEditLocationId(session.locationId ?? "");
    setEditCapacity(session.maxCapacity);
    setEditAllowPrivate(session.allowPrivate);
  }, [session]);

  const updateSlotMutation = useMutation({
    mutationFn: (data: { startTime?: string; durationMinutes?: number; locationId?: string | null; maxCapacity?: number; allowPrivate?: boolean }) =>
      api(`/coaches/me/availability/${slotId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      setSuccessMessage("Slot updated.");
      setIsEditingSlot(false);
      setTimeout(() => setSuccessMessage(null), 4000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (err: Error) => setUpdateError(err.message ?? "Failed to update slot"),
  });

  const removeSlotMutation = useMutation({
    mutationFn: () => api(`/coaches/me/availability/${slotId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability"] });
      navigate("/dashboard");
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Failed to remove slot");
      setConfirmRemove(false);
    },
  });

  const handleSaveEdit = () => {
    if (!session) return;
    const newStart = new Date(session.startTime);
    newStart.setHours(editHour, editMinute, 0, 0);
    updateSlotMutation.mutate({
      startTime: newStart.toISOString(),
      durationMinutes: editDuration,
      locationId: editLocationId || null,
      maxCapacity: editCapacity,
      allowPrivate: editCapacity > 1 ? editAllowPrivate : true,
    });
  };

  const editPanelOriginalValues = useMemo(() => {
    if (!session) return null;
    const s = new Date(session.startTime);
    const e = new Date(session.endTime);
    return {
      hour: s.getHours(),
      minute: s.getMinutes(),
      duration: Math.round((e.getTime() - s.getTime()) / 60000),
      locationId: session.locationId ?? "",
      capacity: session.maxCapacity,
      allowPrivate: session.allowPrivate,
    };
  }, [session]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-48" />
          <div className="h-48 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Link to="/bookings" className="text-brand-500 hover:text-brand-600 text-sm font-medium flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to bookings
        </Link>
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-xl text-danger-700">
          Something went wrong loading this session.{" "}
          {(error as Error)?.message && <span className="block mt-1 text-sm">{(error as Error).message}</span>}
        </div>
      </div>
    );
  }

  const activeParticipants = session.participants.filter((p) => p.status !== "cancelled");
  const pendingParticipants = session.participants.filter((p) => p.status === "pending");

  const slotStart = new Date(session.startTime);
  const slotEnd = new Date(session.endTime);
  const dateStr = slotStart.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const frontendUrl = window.location.origin;
  const shareUrl = session.inviteCode
    ? `${frontendUrl}/group/${session.inviteCode}`
    : `${frontendUrl}/coaches/${session.coach.id}/book?slotId=${session.slotId}`;

  const statusBadge = (status: string) => {
    const cls =
      status === "confirmed" ? "bg-success-100 text-success-700 ring-success-600/10"
      : status === "completed" ? "bg-slate-100 text-slate-700 ring-slate-600/10"
      : status === "cancelled" ? "bg-danger-100 text-danger-700 ring-danger-600/10"
      : status === "available" ? "bg-info-100 text-info-700 ring-info-600/10"
      : "bg-amber-100 text-amber-700 ring-amber-600/10";
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ring-1 ${cls}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="px-4 sm:px-6 pt-6 pb-4">
        <Link to="/bookings" className="text-brand-500 hover:text-brand-600 text-sm font-medium flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to bookings
        </Link>
      </div>

      {successMessage && (
        <div className="mx-4 sm:mx-6 mb-4 p-3 bg-success-50 border border-success-200 rounded-xl text-success-700 text-sm font-medium">
          {successMessage}
        </div>
      )}
      {updateError && (
        <div className="mx-4 sm:mx-6 mb-4 p-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm font-medium">
          {updateError}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card mx-4 sm:mx-6 overflow-hidden border border-slate-200/60">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className={`h-full transition-all duration-500 ${
              session.sessionStatus === "completed"
                ? "w-full bg-success-500"
                : session.sessionStatus === "confirmed"
                ? "w-2/3 bg-brand-500"
                : session.sessionStatus === "cancelled"
                ? "w-full bg-danger-400"
                : session.sessionStatus === "available"
                ? "w-0"
                : "w-1/3 bg-amber-400"
            }`}
          />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-6 pt-5 pb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Session &middot; {dateStr}
            </h1>
            {statusBadge(session.sessionStatus)}
            {session.lockedPrivate && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 ring-1 ring-violet-600/10">
                Private
              </span>
            )}
          </div>

          {/* Timeline */}
          <div className="flex items-center gap-2 text-xs font-medium mt-3">
            <span className={`flex items-center gap-1 ${session.sessionStatus !== "available" ? "text-brand-600" : "text-slate-400"}`}>
              <Clock className="w-3.5 h-3.5" /> Requested
            </span>
            <span className="flex-1 h-px bg-slate-200" />
            <span className={`flex items-center gap-1 ${session.sessionStatus === "confirmed" || session.sessionStatus === "completed" ? "text-brand-600" : "text-slate-400"}`}>
              <CheckCircle className="w-3.5 h-3.5" /> Confirmed
            </span>
            <span className="flex-1 h-px bg-slate-200" />
            <span className={`flex items-center gap-1 ${session.sessionStatus === "completed" ? "text-success-600" : "text-slate-400"}`}>
              <CheckCircle className="w-3.5 h-3.5" /> Complete
            </span>
          </div>
        </div>

        {/* Session details */}
        <div className="px-4 sm:px-6 py-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3 text-slate-700">
            <Calendar className="w-5 h-5 shrink-0 text-slate-400" />
            <span>{slotStart.toLocaleDateString([], { dateStyle: "medium" })}, {slotStart.toLocaleTimeString([], { timeStyle: "short" })} – {slotEnd.toLocaleTimeString([], { timeStyle: "short" })}</span>
          </div>
          {session.currentPerPersonAmountCents != null && (
            <div className="flex items-center gap-3 text-slate-700">
              <DollarSign className="w-5 h-5 shrink-0 text-slate-400" />
              <span className="font-semibold">
                ${(session.currentPerPersonAmountCents / 100).toFixed(2)}
                <span className="text-sm font-normal text-slate-500 ml-1">per person</span>
              </span>
            </div>
          )}
          <div className="flex items-start gap-3 text-slate-700">
            <MapPin className="w-5 h-5 shrink-0 text-slate-400 mt-0.5" />
            {session.location ? (
              <div>
                <p className="font-medium">{session.location.name}</p>
                <p className="text-sm text-slate-500">{session.location.address}</p>
                {session.location.notes && <p className="text-sm text-slate-500 italic">{session.location.notes}</p>}
              </div>
            ) : (
              <div>
                <p className="font-medium">Location TBD</p>
                <p className="text-sm text-slate-500">Coach will coordinate before the session.</p>
              </div>
            )}
          </div>
        </div>

        {/* Coach-only inline edit panel.
         * Only shown when the slot has no active participants — once anyone has
         * booked, edits to time/capacity/location should go through a deliberate
         * communication flow, not a silent in-place update. */}
        {canEditOrRemoveSlot && isEditingSlot && (
          <div className="px-4 sm:px-6 py-4 border-t border-slate-100 space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Edit slot</h2>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
              <div className="flex gap-2">
                <select value={editHour} onChange={(e) => setEditHour(Number(e.target.value))} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</option>
                  ))}
                </select>
                <select value={editMinute} onChange={(e) => setEditMinute(Number(e.target.value))} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={m}>{m.toString().padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
              <select value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {DURATION_MINUTES_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d >= 60 ? `${d / 60}h` : `${d}m`}{d >= 60 && d % 60 > 0 ? ` ${d % 60}m` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sd-edit-location" className="block text-xs font-medium text-slate-500 mb-1">Location</label>
              <select id="sd-edit-location" value={editLocationId} onChange={(e) => setEditLocationId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">{TBD_LOCATION_OPTION_LABEL}</option>
                {(coachLocations ?? []).map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              {editLocationId === "" && (
                <p className="text-xs text-slate-500 mt-1">{TBD_LOCATION_HELPER}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Session capacity</label>
              <select value={editCapacity} onChange={(e) => setEditCapacity(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} athlete{n !== 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
            {editCapacity > 1 && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="sd-edit-allow-private" checked={editAllowPrivate} onChange={(e) => setEditAllowPrivate(e.target.checked)} className="rounded border-slate-300" />
                <label htmlFor="sd-edit-allow-private" className="text-sm text-slate-700">Allow private booking</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditingSlot(false);
                  if (editPanelOriginalValues) {
                    setEditHour(editPanelOriginalValues.hour);
                    setEditMinute(editPanelOriginalValues.minute);
                    setEditDuration(editPanelOriginalValues.duration);
                    setEditLocationId(editPanelOriginalValues.locationId);
                    setEditCapacity(editPanelOriginalValues.capacity);
                    setEditAllowPrivate(editPanelOriginalValues.allowPrivate);
                  }
                }}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={updateSlotMutation.isPending}
                className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {updateSlotMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {/* Locked Private callout */}
        {session.lockedPrivate && (
          <div className="mx-4 sm:mx-6 mb-4 p-4 rounded-xl bg-violet-50 border border-violet-200 flex gap-3">
            <Lock className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-800">Private session</p>
              <p className="text-sm text-violet-700 mt-0.5">
                This slot is locked as a private 1-on-1 session. No other athletes can join.
              </p>
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="px-4 sm:px-6 pt-4 pb-2 border-t border-slate-200">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 min-w-0">
              <Users className="w-5 h-5 text-slate-400 shrink-0" />
              <span className="truncate">Participants ({activeParticipants.length})</span>
            </h2>
            {session.spotsRemaining > 0 && session.sessionStatus !== "cancelled" && session.sessionStatus !== "completed" && (
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(shareUrl); setSuccessMessage("Link copied!"); setTimeout(() => setSuccessMessage(null), 3000); }}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 shrink-0"
              >
                <Share2 className="w-4 h-4" /> Share
              </button>
            )}
          </div>
          {session.spotsRemaining > 0 && session.sessionStatus !== "cancelled" && session.sessionStatus !== "completed" && (
            <p className="text-xs text-brand-600 mb-3">
              {session.spotsRemaining} {session.spotsRemaining === 1 ? "spot" : "spots"} remaining — share to drop the per-person price
            </p>
          )}

          {activeParticipants.length === 0 && (
            <p className="text-sm text-slate-500 mb-4">
              No bookings yet. {session.viewerRole === "coach" && session.spotsRemaining > 0 ? "Share the link above so athletes can book this slot." : ""}
            </p>
          )}

          <div className="space-y-2 mb-4">
            {session.participants.map((p) => {
              const isCancelled = p.status === "cancelled";
              const isPaid = p.paymentStatus === "succeeded" || p.paymentStatus === "authorized" || p.paymentStatus === "paid_offline";
              const needsPayment = session.sessionStatus === "completed" &&
                (p.paymentStatus === "deferred" || p.paymentStatus === "payment_link_sent");
              const showPendingActions = p.status === "pending" && session.sessionStatus !== "completed";
              const showConfirmedActions = p.status === "confirmed" && session.sessionStatus === "confirmed";
              const hasActions = showPendingActions || showConfirmedActions || needsPayment || isPaid;

              const showCoachActions = hasActions && !isPaid && session.viewerRole === "coach";
              const showMessageIcon = session.viewerRole === "coach" && !isCancelled && !!p.userId;

              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition ${
                    isCancelled ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white"
                  }`}
                >
                  {/* Layout note: stacks vertically on mobile (action buttons
                   * become a full-width row below the name with a divider for
                   * touch clarity), but on sm+ the actions sit inline-right of
                   * the avatar/name block in a single tight row. */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar displayName={p.name ?? "?"} src={null} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900 truncate">{p.name ?? p.email ?? "Athlete"}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                          <span className={
                            p.status === "confirmed" ? "text-success-600 font-medium"
                            : p.status === "completed" ? "text-slate-600 font-medium"
                            : p.status === "cancelled" ? "text-danger-600 font-medium"
                            : "text-amber-600 font-medium"
                          }>{p.status}</span>
                          {(() => {
                            // Only surface payment subtext when it adds value:
                            // - hide entirely for pending/cancelled bookings (payment isn't relevant yet)
                            // - hide values shown elsewhere (succeeded/paid_offline are in the "Paid" pill)
                            // - hide pending/deferred (they're the default "pay after" posture)
                            if (p.status === "pending" || p.status === "cancelled") return null;
                            const label =
                              p.paymentStatus === "payment_link_sent" ? "link sent"
                              : p.paymentStatus === "authorized" ? "card on file"
                              : p.paymentStatus === "failed" ? "payment issue"
                              : p.paymentStatus === "requires_action" ? "payment issue"
                              : null;
                            return label ? <span>&middot; {label}</span> : null;
                          })()}
                        </div>
                      </div>
                      {isPaid && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-success-100 text-success-700 rounded-full shrink-0">
                          {p.paymentStatus === "paid_offline" ? "Paid (offline)" : "Paid"}
                        </span>
                      )}
                    </div>

                    {/* Per-participant action cluster (right side on desktop,
                     * full-width row below on mobile with a divider for touch
                     * clarity). */}
                    {showCoachActions && (
                      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 sm:mt-0 sm:pt-0 sm:border-0 sm:shrink-0 sm:justify-end">
                        {showPendingActions && (
                          <>
                            <button
                              type="button"
                              onClick={() => confirmMutation.mutate({ bookingId: p.id, status: "confirmed" })}
                              disabled={confirmMutation.isPending}
                              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold bg-success-100 text-success-700 rounded-lg hover:bg-success-200 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmMutation.mutate({ bookingId: p.id, status: "cancelled" })}
                              disabled={confirmMutation.isPending}
                              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium text-danger-600 hover:text-danger-700 hover:bg-danger-50 rounded-lg"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {showConfirmedActions && (
                          <>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mr-auto sm:mr-0">
                              <input
                                type="checkbox"
                                checked={attendanceOverrides[p.id] ?? p.attended}
                                onChange={(e) => setAttendanceOverrides((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                                className="rounded border-slate-300"
                              />
                              Attended
                            </label>
                            <button
                              type="button"
                              onClick={() => confirmMutation.mutate({ bookingId: p.id, status: "cancelled" })}
                              disabled={confirmMutation.isPending}
                              className="px-3 py-1.5 text-xs font-medium text-danger-600 bg-danger-50 rounded-lg hover:bg-danger-100 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </>
                        )}
                        {needsPayment && (
                          <>
                            <button
                              type="button"
                              onClick={() => markPaidMutation.mutate(p.id)}
                              disabled={markPaidMutation.isPending}
                              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                            >
                              Mark paid
                            </button>
                            <button
                              type="button"
                              onClick={() => paymentRequestMutation.mutate(p.id)}
                              disabled={paymentRequestMutation.isPending}
                              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                            >
                              Send link
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* 1:1 message icon — pinned to the far right edge of the
                     * row so it's the last thing in the line on desktop, past
                     * any action buttons. On mobile it stays right-aligned on
                     * its own short row below the name. Coach-only and only
                     * for non-cancelled bookings. */}
                    {showMessageIcon && (
                      <button
                        type="button"
                        onClick={() => directMessageMutation.mutate(p.userId!)}
                        disabled={directMessageMutation.isPending}
                        aria-label={`Message ${p.name ?? "athlete"}`}
                        title={`Message ${p.name ?? "athlete"}`}
                        className="self-end sm:self-auto sm:ml-1 shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Session-level actions */}
        {session.viewerRole === "coach" && activeParticipants.length > 0 && (
          <div className="px-4 sm:px-6 py-5 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Session actions</h2>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => messageParticipantsMutation.mutate()}
                disabled={messageParticipantsMutation.isPending}
                className="w-full sm:w-auto sm:mr-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4" />
                {messageParticipantsMutation.isPending
                  ? "Opening…"
                  : activeParticipants.length === 1
                    ? `Message ${activeParticipants[0].name?.split(" ")[0] ?? "athlete"}`
                    : `Message the group (${activeParticipants.length})`}
              </button>
              {pendingParticipants.length >= 2 && session.viewerRole === "coach" && (
                <button
                  type="button"
                  onClick={() => confirmAllMutation.mutate()}
                  disabled={confirmAllMutation.isPending}
                  className="w-full sm:w-auto bg-success-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-success-700 disabled:opacity-50"
                >
                  Confirm all
                </button>
              )}
              {session.sessionStatus === "confirmed" && (
                <button
                  onClick={() => {
                    const hasChargeableParticipant = activeParticipants.some((p) => (p.amountCents ?? 0) > 0);
                    if (hasChargeableParticipant && !session.coach.stripeOnboardingComplete) {
                      setConfirmAction({ type: "needs_stripe" });
                    } else {
                      setConfirmAction({ type: "complete" });
                    }
                  }}
                  disabled={completeMutation.isPending}
                  className="w-full sm:w-auto bg-brand-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-600 disabled:opacity-50"
                >
                  Mark complete
                </button>
              )}
              {activeParticipants.length > 0 && session.sessionStatus !== "completed" && session.sessionStatus !== "cancelled" && (
                <button
                  onClick={() => setConfirmAction({ type: "cancel-session" })}
                  className="w-full sm:w-auto bg-white border border-danger-200 text-danger-600 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-danger-50"
                >
                  Cancel session
                </button>
              )}
            </div>
          </div>
        )}

        {/* Coach actions for an empty slot — Edit / Remove. We only surface
         * these when nobody has booked yet; once there are participants the
         * destructive flow is "Cancel session" (above), which notifies them. */}
        {canEditOrRemoveSlot && !isEditingSlot && (
          <div className="px-4 sm:px-6 py-5 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Slot actions</h2>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setIsEditingSlot(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 text-sm font-semibold"
              >
                <Pencil className="w-4 h-4" />
                Edit slot
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-danger-200 text-danger-600 hover:bg-danger-50 text-sm font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                Remove slot
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm slot removal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Remove this slot?</h2>
            <p className="text-slate-600 text-sm mb-4">
              This will permanently delete this availability slot. Nobody has booked it yet, so no athletes will be notified.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="px-4 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => removeSlotMutation.mutate()}
                disabled={removeSlotMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50"
              >
                {removeSlotMutation.isPending ? "Removing…" : "Yes, remove slot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Needs Stripe modal */}
      {confirmAction && confirmAction.type === "needs_stripe" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Set up payments first</h2>
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

      {/* Confirmation modal */}
      {confirmAction && confirmAction.type !== "needs_stripe" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction.type === "complete" ? "Mark session complete?" : "Cancel entire session?"}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {confirmAction.type === "complete"
                ? "This will complete the session for all attended participants and trigger payment processing."
                : "This will cancel all participants and free the slot. Any payment holds will be released."}
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
                  if (confirmAction.type === "cancel-session") {
                    cancelSessionMutation.mutate();
                  } else {
                    const attendance = activeParticipants.map((p) => ({
                      bookingId: p.id,
                      attended: attendanceOverrides[p.id] ?? p.attended,
                    }));
                    completeMutation.mutate(attendance);
                  }
                }}
                disabled={completeMutation.isPending || cancelSessionMutation.isPending}
                className={
                  confirmAction.type === "complete"
                    ? "px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                    : "px-4 py-2 rounded-lg text-sm font-medium bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50"
                }
              >
                {confirmAction.type === "complete" ? "Mark complete" : "Yes, cancel session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
