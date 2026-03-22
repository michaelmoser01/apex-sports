import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { api } from "@/lib/api";
import { setDeepLink } from "@/utils/deepLink";
import { Calendar, MapPin, Users, DollarSign, TrendingDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";

interface SessionInfo {
  id: string;
  coach: {
    id: string;
    displayName: string;
    sports: string[];
    avatarUrl: string | null;
  };
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    location: { name: string; address: string } | null;
  };
  maxCapacity: number;
  joinedCount: number;
  spotsRemaining: number;
  currentPerPersonRate: number | null;
  hourlyRate: number | null;
  groupRates: Record<string, number> | null;
  status: string;
  participants: { displayName: string; avatarUrl: string | null }[];
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
    (t, i) => i === 0 || t.rate !== tiers[i - 1].rate,
  );

  return (
    <div className="space-y-1">
      {uniqueTiers.map((tier) => {
        const isLastTier = tier === uniqueTiers[uniqueTiers.length - 1];
        const isNext = tier.size === currentHeadcount + 1
          || (isLastTier && currentHeadcount + 1 > tier.size);
        const isPast = tier.size <= currentHeadcount && !isNext;
        const label = isLastTier && tier.size < maxCapacity
          ? `${tier.size}+`
          : String(tier.size);
        return (
          <div
            key={tier.size}
            className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${
              isNext
                ? "bg-brand-50 border border-brand-200 text-brand-800 font-medium"
                : isPast
                  ? "text-slate-400 line-through"
                  : "text-slate-600"
            }`}
          >
            <span>
              {label} {tier.size === 1 ? "athlete" : "athletes"}
              {isNext && " (next to join)"}
            </span>
            <span className="font-medium">${tier.rate}/hr each</span>
          </div>
        );
      })}
    </div>
  );
}

export default function GroupInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ["group-invite", inviteCode],
    queryFn: () => api<SessionInfo>(`/bookings/group/${inviteCode}`),
    enabled: !!inviteCode,
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <p className="text-slate-500">Loading session details...</p>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <p className="text-slate-600">This invite link is invalid or has expired.</p>
        <Link to="/find" className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          Find coaches
        </Link>
      </div>
    );
  }

  const slotStart = new Date(session.slot.startTime);
  const slotEnd = new Date(session.slot.endTime);
  const dateStr = format(slotStart, "EEEE, MMMM d, yyyy");
  const timeStr = `${format(slotStart, "h:mm a")} – ${format(slotEnd, "h:mm a")}`;
  const bookingUrl = `/coaches/${session.coach.id}/book?slotId=${session.slot.id}`;

  const hasGroupRates = session.hourlyRate != null && session.groupRates != null && Object.keys(session.groupRates).length > 0;
  const nextRate = session.hourlyRate != null && session.spotsRemaining > 0
    ? interpolateRate(session.joinedCount + 1, session.groupRates, session.hourlyRate)
    : null;
  const bestRate = session.hourlyRate != null && session.maxCapacity > 1
    ? interpolateRate(session.maxCapacity, session.groupRates, session.hourlyRate)
    : null;
  const savingsMessage = bestRate != null && session.hourlyRate != null && bestRate < session.hourlyRate && session.spotsRemaining > 1
    ? `${session.spotsRemaining - 1} more ${session.spotsRemaining - 1 === 1 ? "athlete" : "athletes"} needed to unlock $${bestRate}/hr`
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 py-5 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white">
            <div className="flex items-center gap-3 mb-3">
              <Avatar displayName={session.coach.displayName} src={session.coach.avatarUrl} size="md" />
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  Session with {session.coach.displayName}
                </h1>
                <p className="text-slate-500 text-sm">{session.coach.sports.join(", ")}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              You&apos;ve been invited to join a training session!
            </p>
          </div>

          {/* Session details */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="font-medium text-slate-900">{dateStr}</p>
                <p className="text-slate-500">{timeStr} ({session.slot.durationMinutes} min)</p>
              </div>
            </div>

            {session.slot.location && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="font-medium text-slate-900">{session.slot.location.name}</p>
                  <p className="text-slate-500">{session.slot.location.address}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 text-sm">
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-slate-700">
                <span className="font-medium">{session.joinedCount}</span> of{" "}
                <span className="font-medium">{session.maxCapacity}</span> spots filled
                {session.spotsRemaining > 0 && (
                  <span className="text-success-600 ml-1">({session.spotsRemaining} left)</span>
                )}
              </p>
            </div>

            {session.currentPerPersonRate != null && (
              <div className="flex items-center gap-3 text-sm">
                <DollarSign className="w-4 h-4 text-slate-400 shrink-0" />
                <p className="text-slate-700">
                  <span className="font-medium">${nextRate ?? session.currentPerPersonRate}/hr</span> per person
                </p>
              </div>
            )}
          </div>

          {/* Pricing ladder */}
          {hasGroupRates && session.hourlyRate != null && session.maxCapacity > 1 && (
            <div className="px-5 py-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium mb-2">Price per person as more athletes join:</p>
              <PricingLadder
                groupRates={session.groupRates}
                hourlyRate={session.hourlyRate}
                currentHeadcount={session.joinedCount}
                maxCapacity={session.maxCapacity}
              />
              {savingsMessage && (
                <div className="mt-3 flex items-center gap-2 text-sm text-brand-700 bg-brand-50 px-3 py-2 rounded-lg">
                  <TrendingDown className="w-4 h-4 shrink-0" />
                  <span>{savingsMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Participants */}
          {session.participants.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium mb-2">Already joined:</p>
              <div className="flex flex-wrap gap-2">
                {session.participants.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-full">
                    <Avatar displayName={p.displayName} src={p.avatarUrl} size="sm" />
                    <span className="text-sm text-slate-700">{p.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-5 border-t border-slate-100">
            {session.spotsRemaining <= 0 ? (
              <div className="text-center">
                <p className="text-slate-600 font-medium">This session is full</p>
                <Link to={`/coaches/${session.coach.id}`} className="mt-2 inline-block text-brand-600 text-sm hover:underline">
                  View {session.coach.displayName}&apos;s other sessions →
                </Link>
              </div>
            ) : !isAuthenticated ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Sign in or create an account to join this session.</p>
                <Link
                  to={`/sign-up?returnTo=${encodeURIComponent(bookingUrl)}`}
                  onClick={() => setDeepLink(bookingUrl)}
                  className="block w-full text-center bg-brand-500 text-white px-4 py-3 rounded-xl font-medium hover:bg-brand-600 transition-colors"
                >
                  Sign up to join
                </Link>
                <Link
                  to={`/sign-in?returnTo=${encodeURIComponent(bookingUrl)}`}
                  onClick={() => setDeepLink(bookingUrl)}
                  className="block w-full text-center border border-slate-300 text-slate-700 px-4 py-3 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <Link
                  to={bookingUrl}
                  className="block w-full text-center bg-brand-500 text-white px-4 py-3 rounded-xl font-medium hover:bg-brand-600 transition-colors"
                >
                  Join this session
                </Link>
                <Link
                  to={`/coaches/${session.coach.id}`}
                  className="block text-center text-sm text-slate-500 hover:text-slate-700"
                >
                  View {session.coach.displayName}&apos;s profile
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
