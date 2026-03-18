import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";

import { api } from "@/lib/api";
import {
  getStoredInviteSlug,
  getStoredInviteCoachId,
  clearStoredInviteSlug,
} from "@/pages/Join";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { FavoriteButton } from "@/components/FavoriteButton";
import { CoachDetailMap } from "@/components/CoachDetailMap";
import { PublicBookingCalendar } from "@/components/PublicBookingCalendar";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Award,
  GraduationCap,
  Clock,
  Medal,
} from "lucide-react";

interface CoachPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

interface CoachLocation {
  id: string;
  name: string;
  address: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface ServiceArea {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

interface Credentials {
  certifications: string[];
  yearsExperience: number | null;
  playingExperience: string;
  education: string;
}

interface CoachDetail {
  id: string;
  displayName: string;
  email?: string;
  sports: string[];
  serviceCities: string[];
  serviceAreas?: ServiceArea[];
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  credentials?: Credentials;
  photos?: CoachPhoto[];
  locations?: CoachLocation[];
  availabilitySlots: {
    id: string;
    startTime: string;
    endTime: string;
    status: "available" | "booked";
    recurrence?: string;
    location: CoachLocation | null;
  }[];
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

import { StarRating } from "@/components/StarRating";

export default function CoachDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";
  const [photoLightboxIndex, setPhotoLightboxIndex] = useState<number | null>(null);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [signInPromptOpen, setSignInPromptOpen] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const connectInviteAttempted = useRef(false);
  const { data: currentUser } = useCurrentUser(isAuthenticated);

  const { data: favoriteData } = useQuery({
    queryKey: ["favoriteIds"],
    queryFn: () => api<{ ids: string[] }>("/athletes/me/favorites/ids"),
    enabled: isAuthenticated && !!currentUser?.athleteProfile,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoLightboxIndex(null);
    };
    if (photoLightboxIndex != null) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [photoLightboxIndex]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMessageModalOpen(false);
        setSignInPromptOpen(false);
        contactMutation.reset();
      }
    };
    if (messageModalOpen || signInPromptOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [messageModalOpen, signInPromptOpen]);

  useEffect(() => {
    if (!id || !isAuthenticated || connectInviteAttempted.current) return;
    const slug = getStoredInviteSlug();
    const storedCoachId = getStoredInviteCoachId();
    if (!slug || storedCoachId !== id) return;
    connectInviteAttempted.current = true;
    api("/auth/me/connect-invite", {
      method: "POST",
      body: JSON.stringify({ inviteSlug: slug }),
    })
      .then(() => clearStoredInviteSlug())
      .catch(() => {});
  }, [id, isAuthenticated]);

  const { data: coach, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["coach", id],
    queryFn: () => api<CoachDetail>(`/coaches/${id}`),
    enabled: !!id,
  });

  const isFavorited = favoriteData?.ids?.includes(coach?.id ?? "") ?? false;

  const { data: myBookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: () =>
      api<{
        asAthlete: {
          coach: { id: string };
          slot: { id: string; startTime: string; endTime: string };
          status: string;
        }[];
      }>("/bookings"),
    enabled: !!id && isAuthenticated,
  });

  const slotIdFromUrl = searchParams.get("slotId");
  useEffect(() => {
    if (!id || !coach || !slotIdFromUrl) return;
    const availabilitySlots = Array.isArray(coach.availabilitySlots) ? coach.availabilitySlots : [];
    const slot = availabilitySlots.find((s) => s?.id === slotIdFromUrl);
    if (!slot) return;
    navigate(`/coaches/${id}/book?slotId=${slotIdFromUrl}`, { replace: true });
  }, [id, coach, slotIdFromUrl, navigate]);

  /** Slot IDs where the current user has a pending request (not yet accepted) for calendar "Requested" state */
  const myRequestedSlotIds = useMemo(() => {
    if (!coach?.id || !myBookings?.asAthlete) return new Set<string>();
    return new Set(
      myBookings.asAthlete
        .filter((b) => b.coach.id === coach.id && b.status === "pending")
        .map((b) => b.slot.id)
    );
  }, [coach?.id, myBookings]);

  const contactMutation = useMutation({
    mutationFn: async (message: string) =>
      api<{ sent: boolean }>(`/coaches/${id}/contact`, {
        method: "POST",
        body: JSON.stringify({ message: message.trim() }),
      }),
    onSuccess: () => setContactMessage(""),
  });

  // All slots from API (available and booked) - filter invalid dates
  const slots = useMemo(() => {
    if (!coach) return [];
    return (Array.isArray(coach.availabilitySlots) ? coach.availabilitySlots : []).filter(
      (s) => s && typeof s.startTime === "string" && !Number.isNaN(new Date(s.startTime).getTime())
    );
  }, [coach]);

  /** Slot IDs from API that are available - source of truth for green vs grey day coloring */
  const availableSlotIds = useMemo(
    () => new Set(slots.filter((s) => s.status === "available").map((s) => s.id)),
    [slots]
  );

  /** Slot IDs from API that are booked (by anyone) - for "Booked" badge on events */
  const bookedSlotIds = useMemo(
    () => new Set(slots.filter((s) => s.status === "booked").map((s) => s.id)),
    [slots]
  );

  const locations = useMemo(() => Array.isArray(coach?.locations) ? coach.locations : [], [coach?.locations]);

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
            to="/find"
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

  const photos = Array.isArray(coach.photos) ? coach.photos : [];
  const photoUrls = (() => {
    const urls = photos.map((p) => p?.url).filter((u): u is string => typeof u === "string" && u.length > 0);
    const avatar = coach.avatarUrl && typeof coach.avatarUrl === "string" ? coach.avatarUrl : null;
    if (avatar) return [avatar, ...urls.filter((u) => u !== avatar)];
    return urls;
  })();
  const profileImageUrl = photoUrls[0] ?? null;

  const messageCoachButton = (mobileOnly = false) =>
    id && currentUser?.coachProfile?.id !== id ? (
      isAuthenticated && currentUser?.athleteProfile ? (
        <button
          type="button"
          onClick={() => setMessageModalOpen(true)}
          className={
            mobileOnly
              ? "w-full px-4 py-3 text-base font-semibold text-brand-600 hover:text-brand-700 bg-white hover:bg-brand-50 rounded-xl border-2 border-brand-500 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 touch-manipulation"
              : "w-full sm:w-auto flex-shrink-0 px-4 py-3 sm:px-3 sm:py-1.5 text-base sm:text-sm font-semibold sm:font-medium text-brand-600 hover:text-brand-700 bg-white hover:bg-brand-50 rounded-xl sm:rounded-lg border-2 sm:border border-brand-500 border-brand-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:focus:ring-offset-1 touch-manipulation"
          }
        >
          Message coach
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setSignInPromptOpen(true)}
          className={
            mobileOnly
              ? "w-full px-4 py-3 text-base font-semibold text-brand-600 hover:text-brand-700 bg-white hover:bg-brand-50 rounded-xl border-2 border-brand-500 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 touch-manipulation"
              : "w-full sm:w-auto flex-shrink-0 px-4 py-3 sm:px-3 sm:py-1.5 text-base sm:text-sm font-semibold sm:font-medium text-brand-600 hover:text-brand-700 bg-white hover:bg-brand-50 rounded-xl sm:rounded-lg border-2 sm:border border-brand-500 border-brand-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:focus:ring-offset-1 touch-manipulation"
          }
        >
          Message coach
        </button>
      )
    ) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        <Link
          to="/find"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" /> Back to find coaches
        </Link>

        <header className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start">
          {/* Photo: full width on mobile, fixed size on desktop */}
          <div className="relative w-full sm:w-auto flex justify-center sm:block sm:flex-shrink-0">
            {photoUrls.length > 0 ? (
              <button
                type="button"
                onClick={() => setPhotoLightboxIndex(0)}
                className="block w-full max-w-[280px] sm:max-w-none aspect-[4/3] sm:w-40 sm:h-40 sm:aspect-auto rounded-2xl overflow-hidden bg-slate-200 border border-slate-200 shadow-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 hover:opacity-95 transition-opacity mx-auto sm:mx-0"
                aria-label="View profile photos"
              >
                <img
                  src={photoUrls[0]}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <div
                  className={`absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-300 to-slate-400 text-white text-4xl sm:text-5xl font-bold ${profileImageUrl ? "hidden" : ""}`}
                  aria-hidden
                >
                  {(coach.displayName ?? "C").charAt(0)}
                </div>
              </button>
            ) : (
              <div className="w-full max-w-[280px] sm:max-w-none aspect-[4/3] sm:w-40 sm:h-40 sm:aspect-auto rounded-2xl overflow-hidden bg-slate-200 border border-slate-200 shadow-sm flex items-center justify-center bg-gradient-to-br from-slate-300 to-slate-400 text-white text-4xl sm:text-5xl font-bold mx-auto sm:mx-0">
                {(coach.displayName ?? "C").charAt(0)}
              </div>
            )}
            {photoUrls.length > 1 && (
              <span
                className="absolute bottom-2 right-2 sm:bottom-1.5 sm:right-1.5 flex items-center justify-center min-w-[1.75rem] h-7 sm:min-w-[1.5rem] sm:h-6 px-1.5 rounded-md bg-black/50 text-white text-xs font-medium"
                aria-hidden
              >
                +{photoUrls.length - 1}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 flex flex-col gap-3 sm:gap-1">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {coach.displayName ?? "Coach"}
                </h1>
                {coach.verified && (
                  <span className="inline-flex items-center gap-1 text-xs bg-success-100 text-success-700 px-2.5 py-1 rounded-full font-semibold ring-1 ring-success-600/10">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
              </div>
              <div className="hidden sm:flex sm:items-center sm:gap-2">
                {messageCoachButton()}
                {isAuthenticated && currentUser?.athleteProfile && coach?.id && (
                  <FavoriteButton coachProfileId={coach.id} isFavorite={isFavorited} />
                )}
              </div>
            </div>
            {Array.isArray(coach.sports) && coach.sports.length > 0 && (
              <p className="text-brand-600 font-medium text-base sm:text-lg">
                {coach.sports.join(" · ")}
              </p>
            )}
            {/* Location, rate in a compact row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 text-sm sm:text-base">
              {(coach.serviceAreas?.length ?? 0) > 0 ? (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
                  {coach.serviceAreas!.map((a) => a.label).join(", ")}
                </span>
              ) : coach.serviceCities?.length > 0 ? (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
                  {coach.serviceCities.join(", ")}
                </span>
              ) : null}
              {coach.hourlyRate != null && String(coach.hourlyRate).trim() !== "" && (
                <span className="font-semibold text-slate-900">${String(coach.hourlyRate)}/hr</span>
              )}
            </div>
            {(Number(coach.reviewCount) ?? 0) > 0 && (
              <div>
                <a
                  href="#reviews"
                  className="inline-flex items-center gap-1.5 text-slate-600 text-sm sm:text-base hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 rounded cursor-pointer touch-manipulation"
                  aria-label="View reviews"
                >
                  <StarRating rating={coach.averageRating != null ? Number(coach.averageRating) : 0} className="text-base" />
                  <span>({coach.reviewCount} reviews)</span>
                </a>
              </div>
            )}
          </div>
        </header>

        {/* Mobile only: Message coach below details, above About */}
        <div className="sm:hidden flex items-center gap-2">
          <div className="flex-1">{messageCoachButton(true)}</div>
          {isAuthenticated && currentUser?.athleteProfile && coach?.id && (
            <FavoriteButton coachProfileId={coach.id} isFavorite={isFavorited} />
          )}
        </div>

        {/* Photo lightbox: large view with prev/next and close */}
        {photoLightboxIndex != null && photoUrls.length > 0 && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
            role="dialog"
            aria-modal="true"
            aria-label="Photo gallery"
            onClick={() => setPhotoLightboxIndex(null)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPhotoLightboxIndex(null);
              }}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-8 h-8" />
            </button>
            <span className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/90 text-sm font-medium">
              {photoLightboxIndex + 1} / {photoUrls.length}
            </span>
            {photoUrls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoLightboxIndex((i) => (i === 0 ? photoUrls.length - 1 : (i ?? 0) - 1));
                  }}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="w-8 h-8 sm:w-10 sm:h-10" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoLightboxIndex((i) => (i === null ? 0 : (i + 1) % photoUrls.length));
                  }}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Next photo"
                >
                  <ChevronRight className="w-8 h-8 sm:w-10 sm:h-10" />
                </button>
              </>
            )}
            <img
              src={photoUrls[photoLightboxIndex]}
              alt=""
              className="max-w-[95vw] max-h-[85vh] w-auto h-auto object-contain"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        {/* Sign in / sign up prompt when not authenticated */}
        {signInPromptOpen && id && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-prompt-title"
            onClick={() => setSignInPromptOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="signin-prompt-title" className="text-lg font-semibold text-slate-900 mb-2">
                Sign in or sign up to message this coach
              </h2>
              <p className="text-slate-600 text-sm mb-5">
                Create an account or sign in to send a message to {coach.displayName ?? "the coach"}.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setSignInPromptOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <Link
                  to="/bookings"
                  state={{ returnTo: `/coaches/${id}` }}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
                  onClick={() => setSignInPromptOpen(false)}
                >
                  Sign in or sign up
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Message coach modal */}
        {messageModalOpen && id && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-coach-title"
            onClick={() => setMessageModalOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 id="message-coach-title" className="text-lg font-semibold text-slate-900">
                  Message coach
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setMessageModalOpen(false);
                    contactMutation.reset();
                  }}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {contactMutation.data?.sent ? (
                  <>
                    <p className="text-slate-700">
                      Message sent. The coach will get back to you by email.
                    </p>
                    <button
                      type="button"
                      onClick={() => contactMutation.reset()}
                      className="w-full px-4 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 bg-brand-50 rounded-lg border border-brand-200"
                    >
                      Send another message
                    </button>
                  </>
                ) : (
                  <>
                    <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700">
                      Your message
                    </label>
                    <textarea
                      id="contact-message"
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Ask about availability, experience, or anything else…"
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      disabled={contactMutation.isPending}
                    />
                    {contactMutation.isError && (
                      <p className="text-sm text-danger-600" role="alert">
                        {contactMutation.error instanceof Error ? contactMutation.error.message : "Failed to send message."}
                      </p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setMessageModalOpen(false);
                          contactMutation.reset();
                        }}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => contactMessage.trim() && contactMutation.mutate(contactMessage.trim())}
                        disabled={!contactMessage.trim() || contactMutation.isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:pointer-events-none rounded-lg"
                      >
                        {contactMutation.isPending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* About */}
        {(coach.bio != null && String(coach.bio).trim() !== "") && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">About</h2>
            </div>
            <div className="p-4 sm:p-6 text-slate-600 text-sm sm:text-base prose prose-slate prose-sm sm:prose-base max-w-none [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-slate-800">
              <ReactMarkdown>{String(coach.bio)}</ReactMarkdown>
            </div>
          </section>
        )}

        {/* Credentials */}
        {coach.credentials && (
          coach.credentials.yearsExperience ||
          coach.credentials.certifications?.length ||
          coach.credentials.playingExperience ||
          coach.credentials.education
        ) && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Credentials & Experience</h2>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {coach.credentials.yearsExperience != null && coach.credentials.yearsExperience > 0 && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900">{coach.credentials.yearsExperience} years of coaching experience</p>
                  </div>
                </div>
              )}
              {coach.credentials.certifications?.length > 0 && (
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900 mb-1.5">Certifications</p>
                    <div className="flex flex-wrap gap-2">
                      {coach.credentials.certifications.map((cert) => (
                        <span
                          key={cert}
                          className="text-sm bg-brand-50 text-brand-700 px-3 py-1 rounded-full font-medium border border-brand-200"
                        >
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {coach.credentials.playingExperience && (
                <div className="flex items-start gap-3">
                  <Medal className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900 mb-0.5">Playing Experience</p>
                    <p className="text-slate-600 text-sm">{coach.credentials.playingExperience}</p>
                  </div>
                </div>
              )}
              {coach.credentials.education && (
                <div className="flex items-start gap-3">
                  <GraduationCap className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900 mb-0.5">Education</p>
                    <p className="text-slate-600 text-sm">{coach.credentials.education}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Locations + map */}
        {locations.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Locations</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Where sessions take place</p>
            </div>
            <div className="p-4 sm:p-6">
              <CoachDetailMap locations={locations} />
            </div>
          </section>
        )}

        {/* Request a booking */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {slots.length === 0 ? "Availability" : "Request a booking"}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              {slots.length === 0 ? "No open slots right now." : "Pick a day and time below."}
            </p>
          </div>
          <div className="p-4 sm:p-6">
            {slots.length === 0 ? (
              <p className="text-slate-500">
                No available slots. Check back later.
              </p>
            ) : (
              <>
                <p className="text-slate-600 text-sm mb-3">
                  Click a time on the calendar to book, or click a day to see all times for that day.
                  {!isAuthenticated && (
                    <span className="block mt-1 text-slate-500">
                      You’ll sign in or create an account when you request a booking.
                    </span>
                  )}
                </p>
                <PublicBookingCalendar
                  slots={slots}
                  onSelectSlot={(slotId) => navigate(`/coaches/${id}/book?slotId=${slotId}`)}
                  availableSlotIds={availableSlotIds}
                  requestedSlotIds={isAuthenticated ? myRequestedSlotIds : undefined}
                  bookedSlotIds={bookedSlotIds}
                />
              </>
            )}
          </div>
        </section>

        {/* Reviews */}
        <section id="reviews" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Reviews</h2>
            {(Number(coach.reviewCount) ?? 0) > 0 && (
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5 inline-flex items-center gap-2">
                <StarRating rating={coach.averageRating != null ? Number(coach.averageRating) : 0} className="text-sm" />
                <span>from {coach.reviewCount} review{coach.reviewCount !== 1 ? "s" : ""}</span>
              </p>
            )}
          </div>
          <div className="p-4 sm:p-6">
            {reviews.length === 0 ? (
              <p className="text-slate-500">No reviews yet.</p>
            ) : (
              <ul className="space-y-4">
                {reviews.map((r, i) => {
                  const createdAt = r?.createdAt != null ? new Date(r.createdAt) : null;
                  const dateStr = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : "";
                  return (
                    <li
                      key={r?.id ?? `review-${i}`}
                      className="p-4 rounded-xl bg-slate-50/80 border border-slate-100"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                          <StarRating rating={typeof r?.rating === "number" ? r.rating : 0} className="text-base" />
                          {r?.athleteName && (
                            <span className="text-slate-500 font-normal">— {r.athleteName}</span>
                          )}
                        </span>
                        {dateStr && (
                          <span className="text-slate-400 text-sm">{dateStr}</span>
                        )}
                      </div>
                      {r?.comment != null && String(r.comment).trim() !== "" && (
                        <p className="text-slate-600 mt-2 leading-relaxed">{String(r.comment)}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
