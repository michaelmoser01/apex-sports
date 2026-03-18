import { Link, useLocation, Navigate } from "react-router-dom";
import { getNextOnboardingStep } from "@/config/onboarding";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { startOfMonth, endOfMonth, format, isBefore } from "date-fns";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import ServiceAreaPicker, { type ServiceAreaItem } from "@/components/ServiceAreaPicker";
import ReactMarkdown from "react-markdown";
import {
  AvailabilityCalendar,
  EventDetailModal,
  type CalendarEvent,
} from "@/components/AvailabilityCalendar";
import { CoachLocations } from "@/components/CoachLocations";
import { Avatar } from "@/components/Avatar";
import {
  AlertTriangle,
  ShieldCheck,
  CreditCard,
  Calendar,
  Users,
  Star,
  ArrowRight,
  DollarSign,
  ChevronRight,
  MapPin,
  Check,
  Award,
  Clock,
  Medal,
  GraduationCap,
  Pencil,
} from "lucide-react";

interface CoachPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

interface Credentials {
  certifications: string[];
  yearsExperience: number | null;
  playingExperience: string;
  education: string;
}

interface CoachProfile {
  id: string;
  displayName: string;
  sports: string[];
  serviceCities: string[];
  serviceAreas?: ServiceAreaItem[];
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  phone?: string | null;
  photos?: CoachPhoto[];
  credentials?: Credentials;
  stripeConnectAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  assistantDisplayName?: string | null;
  assistantPhoneNumber?: string | null;
  planId?: string | null;
  billingMode?: string;
}

interface AvailabilityRule {
  id: string;
  firstStartTime: string;
  durationMinutes: number;
  recurrence: string;
  endDate: string;
  slotCount: number;
  bookingCount?: number;
  slots?: { id: string; startTime: string }[];
}

interface OneOffSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
}

interface AvailabilityResponse {
  rules: AvailabilityRule[];
  oneOffSlots: OneOffSlot[];
  bookedSlotIds?: string[];
}

function EditProfileFormInline({
  coach,
  updateProfileMutation,
  onCancel,
}: {
  coach: CoachProfile;
  updateProfileMutation: { mutate: (data: { displayName?: string; sports?: string[]; serviceCities?: string[]; hourlyRate?: number; phone?: string }) => void; isPending: boolean };
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(coach.displayName);
  const [sports, setSports] = useState<string[]>(coach.sports ?? []);
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaItem[]>(coach.serviceAreas ?? []);
  const [hourlyRate, setHourlyRate] = useState(coach.hourlyRate ?? "");
  const [phone, setPhone] = useState(coach.phone ?? "");
  const [savingAreas, setSavingAreas] = useState(false);

  const toggleSport = (sport: string) => {
    setSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sports.length === 0 || serviceAreas.length === 0) return;
    setSavingAreas(true);
    try {
      // Sync service areas: delete removed, add new, update changed
      const existingIds = new Set((coach.serviceAreas ?? []).map((a) => a.id).filter(Boolean));
      const currentIds = new Set(serviceAreas.map((a) => a.id).filter(Boolean));
      // Delete removed
      for (const oldId of existingIds) {
        if (oldId && !currentIds.has(oldId)) {
          await api(`/coaches/me/service-areas/${oldId}`, { method: "DELETE" });
        }
      }
      // Add new or update existing
      for (const area of serviceAreas) {
        if (area.id && existingIds.has(area.id)) {
          await api(`/coaches/me/service-areas/${area.id}`, {
            method: "PUT",
            body: JSON.stringify({ label: area.label, latitude: area.latitude, longitude: area.longitude, radiusMiles: area.radiusMiles }),
          });
        } else {
          await api("/coaches/me/service-areas", {
            method: "POST",
            body: JSON.stringify({ label: area.label, latitude: area.latitude, longitude: area.longitude, radiusMiles: area.radiusMiles }),
          });
        }
      }
    } catch { /* service areas save failed, continue with profile save */ }
    setSavingAreas(false);

    updateProfileMutation.mutate({
      displayName,
      sports,
      serviceCities: serviceAreas.map((a) => a.label),
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Sports (select at least one)</label>
        <div className="flex flex-wrap gap-3">
          {ALLOWED_SPORTS.map((sport) => (
            <label key={sport} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sports.includes(sport)}
                onChange={() => toggleSport(sport)}
                className="rounded border-slate-300"
              />
              <span>{sport}</span>
            </label>
          ))}
        </div>
      </div>
      <ServiceAreaPicker
        areas={serviceAreas}
        onChange={setServiceAreas}
        label="Service areas"
        helperText="Search for a city and set your travel radius."
      />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Hourly rate ($)</label>
        <input
          type="number"
          min={0}
          step={5}
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Phone (for SMS booking alerts)</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          placeholder="+1 555 123 4567"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={updateProfileMutation.isPending || savingAreas || sports.length === 0 || serviceAreas.length === 0}
          className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
        >
          {updateProfileMutation.isPending || savingAreas ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface BookingsData {
  asCoach: {
    id: string;
    athlete: { id: string; name: string | null; email: string };
    slot: { id: string; startTime: string; endTime: string };
    status: string;
    createdAt: string;
    completedAt: string | null;
    review: { rating: number; comment: string; createdAt: string } | null;
    paymentStatus: string | null;
    amountCents: number | null;
  }[];
}

function CredentialsSection({ coach }: { coach: CoachProfile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certifications, setCertifications] = useState<string[]>(coach.credentials?.certifications ?? []);
  const [certInput, setCertInput] = useState("");
  const [yearsExperience, setYearsExperience] = useState(coach.credentials?.yearsExperience?.toString() ?? "");
  const [playingExperience, setPlayingExperience] = useState(coach.credentials?.playingExperience ?? "");
  const [education, setEducation] = useState(coach.credentials?.education ?? "");

  useEffect(() => {
    setCertifications(coach.credentials?.certifications ?? []);
    setYearsExperience(coach.credentials?.yearsExperience?.toString() ?? "");
    setPlayingExperience(coach.credentials?.playingExperience ?? "");
    setEducation(coach.credentials?.education ?? "");
  }, [coach.credentials]);

  const creds = coach.credentials;
  const hasAny =
    (creds?.yearsExperience != null && creds.yearsExperience > 0) ||
    (creds?.certifications?.length ?? 0) > 0 ||
    !!creds?.playingExperience?.trim() ||
    !!creds?.education?.trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/coaches/me/credentials", {
        method: "PUT",
        body: JSON.stringify({
          certifications,
          yearsExperience: yearsExperience ? parseInt(yearsExperience, 10) : null,
          playingExperience,
          education,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      setEditing(false);
    } catch { /* save failed */ }
    setSaving(false);
  };

  const addCert = () => {
    const trimmed = certInput.trim();
    if (trimmed && !certifications.includes(trimmed)) {
      setCertifications((prev) => [...prev, trimmed]);
      setCertInput("");
    }
  };

  return (
    <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Credentials & Experience</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand-600 font-medium hover:underline inline-flex items-center gap-1"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Years of coaching experience</label>
            <input
              type="number"
              min={0}
              max={80}
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="e.g. 10"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Certifications</label>
            {certifications.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {certifications.map((cert) => (
                  <span
                    key={cert}
                    className="inline-flex items-center gap-1 text-sm bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200"
                  >
                    {cert}
                    <button
                      type="button"
                      onClick={() => setCertifications((prev) => prev.filter((c) => c !== cert))}
                      className="text-brand-400 hover:text-brand-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCert();
                  }
                }}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="e.g. USSF Licensed, NASM CPT"
              />
              <button
                type="button"
                onClick={addCert}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 font-medium"
              >
                Add
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Playing experience</label>
            <textarea
              value={playingExperience}
              onChange={(e) => setPlayingExperience(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="e.g. Played D1 soccer at UC Berkeley"
              maxLength={500}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Education</label>
            <textarea
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="e.g. BS in Sports Science, Stanford"
              maxLength={500}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setCertifications(coach.credentials?.certifications ?? []);
                setYearsExperience(coach.credentials?.yearsExperience?.toString() ?? "");
                setPlayingExperience(coach.credentials?.playingExperience ?? "");
                setEducation(coach.credentials?.education ?? "");
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : hasAny ? (
        <div className="space-y-3">
          {creds!.yearsExperience != null && creds!.yearsExperience > 0 && (
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-4 h-4 text-brand-500 shrink-0" />
              <span className="text-slate-700">{creds!.yearsExperience} years of coaching experience</span>
            </div>
          )}
          {creds!.certifications?.length > 0 && (
            <div className="flex items-start gap-2.5 text-sm">
              <Award className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1.5">
                {creds!.certifications.map((cert) => (
                  <span key={cert} className="bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-full text-xs font-medium border border-brand-200">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          )}
          {creds!.playingExperience?.trim() && (
            <div className="flex items-start gap-2.5 text-sm">
              <Medal className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
              <span className="text-slate-700">{creds!.playingExperience}</span>
            </div>
          )}
          {creds!.education?.trim() && (
            <div className="flex items-start gap-2.5 text-sm">
              <GraduationCap className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
              <span className="text-slate-700">{creds!.education}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-slate-500 text-sm">No credentials added yet. Add your experience, certifications, and education to build trust with athletes.</p>
      )}
    </section>
  );
}

interface ConnectedAthlete {
  athleteProfileId: string;
  status: string;
  createdAt: string;
  athlete: { id: string; displayName: string; sports: string[]; serviceCity: string | null; userId: string };
}

export default function CoachDashboard() {
  const location = useLocation();
  const view =
    location.pathname === "/dashboard" || location.pathname === "/dashboard/"
      ? "overview"
      : location.pathname.endsWith("/agent-test")
        ? "agentTest"
        : location.pathname.endsWith("/availability")
          ? "availability"
          : location.pathname.endsWith("/athletes")
            ? "athletes"
            : "profile";
  const queryClient = useQueryClient();
  const [removeTarget, setRemoveTarget] = useState<{ type: "rule" | "slot"; id: string; bookingCount?: number } | null>(null);
  const [calendarRange, setCalendarRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  });
  const [addOneOffModalStart, setAddOneOffModalStart] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [addOneOffError, setAddOneOffError] = useState<string | null>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photosSaved, setPhotosSaved] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photosSaveSkippedMessage, setPhotosSaveSkippedMessage] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  // Agent test harness state
  const [agentThreadId] = useState(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    try {
      const s = sessionStorage.getItem("agentTestThreadId");
      if (s) return s;
    } catch {}
    return crypto.randomUUID();
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("agentTestThreadId", agentThreadId);
    } catch {}
  }, [agentThreadId]);
  const [athleteMessages, setAthleteMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [coachMessages, setCoachMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [agentThinking, setAgentThinking] = useState<string[]>([]);
  const [athleteInput, setAthleteInput] = useState("");
  const [coachInput, setCoachInput] = useState("");

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: async () => {
      try {
        return await api<CoachProfile>("/coaches/me");
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          return { error: "Coach profile not found" };
        }
        throw err;
      }
    },
    retry: false,
  });

  const { data: availability, isLoading: availabilityLoading } = useQuery({
    queryKey: ["availability"],
    queryFn: () => api<AvailabilityResponse>("/coaches/me/availability"),
    enabled: !!profile && !("error" in profile),
  });
  const { data: coachLocations = [] } = useQuery({
    queryKey: ["coachLocations"],
    queryFn: () => api<{ id: string; name: string; address: string }[]>("/coaches/me/locations"),
    enabled: !!profile && !("error" in profile),
  });
  const rules = availability?.rules ?? [];
  const oneOffSlots = availability?.oneOffSlots ?? [];
  const bookedSlotIds = useMemo(
    () => new Set(availability?.bookedSlotIds ?? []),
    [availability?.bookedSlotIds]
  );

  const updateProfileMutation = useMutation({
    mutationFn: (data: {
      displayName?: string;
      sports?: string[];
      serviceCities?: string[];
      hourlyRate?: number;
      phone?: string;
    }) =>
      api("/coaches/me", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setEditingProfile(false);
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  const addSlotMutation = useMutation({
    mutationFn: (data: { startTime: string; durationMinutes: number; recurrence: "none" }) =>
      api("/coaches/me/availability", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setAddOneOffModalStart(null);
      setAddOneOffError(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (err: Error) => {
      setAddOneOffError(err.message ?? "Failed to add session");
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: (data: { firstStartTime: string; durationMinutes: number; recurrence: "weekly"; endDate: string }) =>
      api("/coaches/me/availability/rules", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setAddOneOffModalStart(null);
      setAddOneOffError(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (err: Error) => {
      setAddOneOffError(err.message ?? "Failed to add recurring availability");
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/coaches/me/availability/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/coaches/me/availability/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  const savePhotosMutation = useMutation({
    mutationFn: (photos: string[]) =>
      api<{ photos?: { id: string; url: string; sortOrder: number }[]; photosSaveSkipped?: boolean }>("/coaches/me", {
        method: "PUT",
        body: JSON.stringify({ photos }),
      }),
    onSuccess: (data) => {
      if (data?.photosSaveSkipped) {
        setPhotosSaved(false);
        setPhotosSaveSkippedMessage("Photos could not be saved (database update may be required). They will appear after the next deploy.");
        return;
      }
      setPhotosSaveSkippedMessage(null);
      setPhotosSaved(true);
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
    },
  });

  const setPrimaryPhotoMutation = useMutation({
    mutationFn: (photoId: string) =>
      api("/coaches/me/primary-photo", {
        method: "PATCH",
        body: JSON.stringify({ photoId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => api<{ verified: boolean }>("/coaches/me/verify", { method: "POST" }),
    onSuccess: () => {
      setShowVerifyModal(false);
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  type AgentChatResponse = {
    agentReplyToSender: string;
    toCoach: string | null;
    toAthlete: string | null;
    thinking: string[];
    toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
  };
  const agentChatMutation = useMutation({
    mutationFn: (body: { role: "athlete" | "coach"; message: string; threadId?: string; athleteId?: string }) =>
      api<AgentChatResponse>("/coaches/me/agent/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });

  const { data: inviteData } = useQuery({
    queryKey: ["coachInvite"],
    queryFn: () => api<{ slug: string; url: string }>("/coaches/me/invites"),
    enabled: !!profile && !("error" in profile),
  });
  const [editingInviteSlug, setEditingInviteSlug] = useState(false);
  const [inviteSlugInput, setInviteSlugInput] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const updateInviteMutation = useMutation({
    mutationFn: (slug: string) =>
      api<{ slug: string; url: string }>("/coaches/me/invites", {
        method: "PATCH",
        body: JSON.stringify({ slug }),
      }),
    onSuccess: () => {
      setEditingInviteSlug(false);
      setInviteSlugInput("");
      queryClient.invalidateQueries({ queryKey: ["coachInvite"] });
    },
  });

  const { data: bookingsData } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<BookingsData>("/bookings"),
    enabled: !!profile && !("error" in profile) && (view === "overview" || view === "athletes"),
  });
  const {
    data: athletesData,
    isError: athletesError,
    isLoading: athletesLoading,
    refetch: refetchAthletes,
  } = useQuery({
    queryKey: ["coachAthletes"],
    queryFn: () => api<ConnectedAthlete[]>("/coaches/me/athletes"),
    enabled: !!profile && !("error" in profile) && (view === "overview" || view === "athletes" || view === "agentTest"),
  });

  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const bookingUpdateMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: "confirmed" | "cancelled" }) => {
      setPendingBookingId(bookingId);
      await api(`/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    },
    onSuccess: () => {
      setPendingBookingId(null);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: () => {
      setPendingBookingId(null);
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

  const billingModeMutation = useMutation({
    mutationFn: async (billingMode: "upfront" | "after_session") => {
      await api("/coaches/me", { method: "PUT", body: JSON.stringify({ billingMode }) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
    },
  });

  useEffect(() => {
    if (profile && !("error" in profile) && "photos" in profile && Array.isArray(profile.photos)) {
      const urls = profile.photos.map((p) => p.url);
      setPhotoUrls(urls);
    }
  }, [profile]);

  const noProfile =
    !profileLoading &&
    (!profile || ("error" in profile && profile.error === "Coach profile not found"));

  if (profileLoading && !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-slate-700 mb-4">Couldn&apos;t load your profile.</p>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["coachProfile"] })}
          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (noProfile) {
    return <Navigate to="/coach/onboarding/basic" replace />;
  }

  const coach = profile as CoachProfile;
  const nextOnboardingStep = getNextOnboardingStep({
    hasProfile: true,
    hasBio: !!(coach.bio?.trim()),
    hasAssistant: !!(coach.assistantPhoneNumber?.trim()),
  });
  if (nextOnboardingStep) {
    return <Navigate to={nextOnboardingStep} replace />;
  }

  if (view === "overview") {
    const asCoach = bookingsData?.asCoach ?? [];
    const pending = asCoach.filter((b) => b.status === "pending");
    const now = new Date();
    const nextUp = asCoach
      .filter((b) => (b.status === "pending" || b.status === "confirmed") && new Date(b.slot.endTime) >= now)
      .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime())
      .slice(0, 5);
    const needsReview = asCoach.filter(
      (b) => b.status === "confirmed" && b.completedAt != null && b.review == null
    );
    const recentReviews = asCoach
      .filter((b) => b.review != null)
      .sort((a, b) => (b.review!.createdAt > a.review!.createdAt ? 1 : -1))
      .slice(0, 3);
    const unpaidSessions = asCoach.filter(
      (b) => b.status === "completed" &&
             (b.paymentStatus === "deferred" || b.paymentStatus === "payment_link_sent")
    );
    const unpaidTotal = unpaidSessions.reduce((sum, b) => sum + (b.amountCents ?? 0), 0);
    const athletes = athletesData ?? [];
    const recentAthletes = athletes.slice(0, 6);
    const bookingsLoading = !bookingsData && !!profile;
    const coachPhotoUrl =
      (Array.isArray(coach.photos) && coach.photos.length > 0 ? coach.photos[0].url : null) ??
      coach.avatarUrl ??
      null;

    return (
      <>
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {/* Hero welcome banner */}
        <section className="relative rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 sm:p-8 mb-6 sm:mb-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_80%_20%,rgba(236,116,26,0.12),transparent_60%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
              <Avatar
                src={coachPhotoUrl}
                displayName={coach.displayName}
                size="xl"
                className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 ring-2 ring-white/20"
              />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight truncate">
                  Hi, {coach.displayName.split(/\s+/)[0] || "Coach"}
                </h1>
                <p className="text-slate-400 text-sm sm:text-base mt-0.5">Here&apos;s what&apos;s happening.</p>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-1">
              <button
                type="button"
                onClick={() => {
                  if (inviteData?.url) {
                    navigator.clipboard.writeText(inviteData.url);
                    setInviteCopied(true);
                    setTimeout(() => setInviteCopied(false), 2500);
                  }
                }}
                disabled={!inviteData?.url}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition touch-manipulation inline-flex items-center gap-1.5 border ${
                  inviteCopied
                    ? "bg-white/25 text-white border-white/40"
                    : "bg-white/15 text-white hover:bg-white/25 border-white/20"
                }`}
              >
                {inviteCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    Invite athlete
                  </>
                )}
              </button>
              {inviteCopied && inviteData?.url && (
                <p className="text-white/90 text-xs" title={inviteData.url}>
                  Copied to clipboard: {inviteData.url.replace(/^https?:\/\/[^/]+/, "")}
                </p>
              )}
            </div>
          </div>
        </section>

        {(!coach.stripeOnboardingComplete || !coach.verified) && (
          <div className="space-y-3 mb-6 sm:mb-8">
            {!coach.stripeOnboardingComplete && (
              <section className="p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0 mt-0.5">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-amber-900 font-semibold text-sm sm:text-base">Set up payments to get paid for your sessions</p>
                    <p className="text-amber-700 text-sm mt-0.5">Connect your Stripe account so you can collect payments from athletes.</p>
                  </div>
                </div>
                <Link
                  to="/coach/setup/get-paid"
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 transition text-center touch-manipulation inline-flex items-center gap-1.5"
                >
                  Set up payments <ArrowRight className="w-4 h-4" />
                </Link>
              </section>
            )}
            {!coach.verified && (
              <section className="p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0 mt-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-amber-900 font-semibold text-sm sm:text-base">Complete your background check to appear in Find Coaches</p>
                    <p className="text-amber-700 text-sm mt-0.5">Verification is required before athletes can discover your profile.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(true)}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 transition text-center touch-manipulation inline-flex items-center gap-1.5"
                >
                  Complete verification <ArrowRight className="w-4 h-4" />
                </button>
              </section>
            )}
          </div>
        )}

        {coach.stripeOnboardingComplete && (
          <section className="mb-5 sm:mb-6 lg:mb-8 flex items-center gap-3 text-sm">
            <span className="text-slate-600 font-medium">Billing:</span>
            <button
              type="button"
              onClick={() => billingModeMutation.mutate("after_session")}
              disabled={billingModeMutation.isPending}
              className={`px-3 py-1.5 rounded-lg font-medium transition touch-manipulation ${
                coach.billingMode !== "upfront"
                  ? "bg-brand-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Bill after session
            </button>
            <button
              type="button"
              onClick={() => billingModeMutation.mutate("upfront")}
              disabled={billingModeMutation.isPending}
              className={`px-3 py-1.5 rounded-lg font-medium transition touch-manipulation ${
                coach.billingMode === "upfront"
                  ? "bg-brand-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Collect upfront
            </button>
          </section>
        )}

        {/* Grid: 1 col mobile, 2 cols desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Actions & follow-ups */}
          <section className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 border-l-4 border-l-brand-500">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-brand-500" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Actions &amp; follow-ups</h2>
              </div>
              <Link to="/bookings" className="text-brand-600 font-medium hover:underline text-sm touch-manipulation inline-flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {bookingsLoading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : (
              <div className="space-y-3">
                {pending.length === 0 && needsReview.length === 0 ? (
                  <p className="text-slate-500 text-sm">All caught up. No pending requests or follow-ups.</p>
                ) : (
                  <>
                    {pending.slice(0, 5).map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">
                            {b.athlete.name ?? b.athlete.email}
                          </p>
                          <p className="text-slate-500 text-xs sm:text-sm">
                            {new Date(b.slot.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => bookingUpdateMutation.mutate({ bookingId: b.id, status: "cancelled" })}
                            disabled={pendingBookingId === b.id}
                            className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 touch-manipulation disabled:opacity-50"
                          >
                            {pendingBookingId === b.id ? "…" : "Decline"}
                          </button>
                          <button
                            type="button"
                            onClick={() => bookingUpdateMutation.mutate({ bookingId: b.id, status: "confirmed" })}
                            disabled={pendingBookingId === b.id}
                            className="px-3 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 touch-manipulation disabled:opacity-50"
                          >
                            {pendingBookingId === b.id ? "…" : "Accept"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {needsReview.slice(0, 3).map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-amber-50/80 border border-amber-100">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">
                            {b.athlete.name ?? b.athlete.email} – session done
                          </p>
                          <p className="text-amber-700 text-xs">Leave a follow-up / review</p>
                        </div>
                        <Link
                          to="/bookings"
                          className="shrink-0 px-3 py-2 text-sm font-medium text-amber-800 bg-amber-100 rounded-lg hover:bg-amber-200 touch-manipulation"
                        >
                          View
                        </Link>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </section>

          {/* Next up */}
          <section className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 border-l-4 border-l-success-500">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-success-500" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Next up</h2>
              </div>
              <Link to="/bookings" className="text-brand-600 font-medium hover:underline text-sm touch-manipulation inline-flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {bookingsLoading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : nextUp.length === 0 ? (
              <p className="text-slate-500 text-sm">No upcoming sessions.</p>
            ) : (
              <ul className="space-y-2">
                {nextUp.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={null}
                        displayName={b.athlete.name ?? b.athlete.email ?? "?"}
                        size="sm"
                        className="shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">
                          {b.athlete.name ?? b.athlete.email}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {new Date(b.slot.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                    <Link to={`/bookings/${b.id}`} className="shrink-0 text-brand-600 font-medium text-sm hover:underline touch-manipulation">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent athletes */}
          <section className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 border-l-4 border-l-sky-500">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-500" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Recent athletes</h2>
              </div>
              <Link to="/dashboard/athletes" className="text-brand-600 font-medium hover:underline text-sm touch-manipulation inline-flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {athletesLoading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : recentAthletes.length === 0 ? (
              <p className="text-slate-500 text-sm">No connected athletes yet. Share your invite link.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {recentAthletes.map((a) => (
                  <Link
                    key={a.athleteProfileId}
                    to={`/dashboard/athletes/${a.athleteProfileId}`}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-slate-50 touch-manipulation"
                  >
                    <Avatar
                      src={null}
                      displayName={a.athlete.displayName}
                      size="md"
                      className="shrink-0"
                    />
                    <span className="text-xs sm:text-sm font-medium text-slate-900 text-center truncate w-full">
                      {a.athlete.displayName}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent reviews */}
          <section className="p-4 sm:p-6 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-0 border-l-4 border-l-amber-500">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Recent reviews</h2>
              </div>
              <Link to={`/coaches/${coach.id}`} className="text-brand-600 font-medium hover:underline text-sm touch-manipulation inline-flex items-center gap-1">
                View profile <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {bookingsLoading ? (
              <p className="text-slate-500 text-sm">Loading…</p>
            ) : recentReviews.length === 0 ? (
              <p className="text-slate-500 text-sm">No reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentReviews.map((b) => (
                  <li key={b.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar
                        src={null}
                        displayName={b.athlete.name ?? b.athlete.email ?? "?"}
                        size="sm"
                        className="shrink-0"
                      />
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {b.athlete.name ?? b.athlete.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-amber-500 text-sm" aria-hidden>
                      {"★".repeat(Math.round(b.review!.rating))}
                      {"☆".repeat(5 - Math.round(b.review!.rating))}
                    </div>
                    <p className="text-slate-600 text-xs sm:text-sm mt-1 line-clamp-2">
                      {b.review!.comment}
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      {new Date(b.review!.createdAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Unpaid sessions */}
          {unpaidSessions.length > 0 && (
            <section className="p-4 sm:p-6 bg-amber-50 rounded-2xl border-2 border-amber-300 shadow-sm min-h-0 lg:col-span-2">
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-amber-600" />
                  <h2 className="text-base sm:text-lg font-bold text-amber-900">
                    Payment due
                    <span className="ml-2 text-sm font-semibold text-amber-700">
                      ${(unpaidTotal / 100).toFixed(2)} ({unpaidSessions.length})
                    </span>
                  </h2>
                </div>
                <Link to="/bookings" className="text-brand-600 font-medium hover:underline text-sm touch-manipulation inline-flex items-center gap-1">
                  View all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="space-y-3">
                {unpaidSessions.map((b) => (
                  <div
                    key={`unpaid-${b.id}`}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-white border border-amber-200"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 text-sm truncate">
                          {b.athlete.name ?? b.athlete.email}
                        </p>
                        {b.amountCents != null && (
                          <span className="text-sm font-semibold text-amber-700">
                            ${(b.amountCents / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs">
                        {new Date(b.slot.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        b.paymentStatus === "payment_link_sent"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {b.paymentStatus === "payment_link_sent" ? "Link sent" : "Not sent"}
                      </span>
                      {coach.stripeOnboardingComplete ? (
                        <button
                          type="button"
                          onClick={() => paymentRequestMutation.mutate(b.id)}
                          disabled={paymentRequestMutation.isPending}
                          className="px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 touch-manipulation disabled:opacity-50"
                        >
                          {b.paymentStatus === "payment_link_sent" ? "Resend link" : "Send payment link"}
                        </button>
                      ) : (
                        <Link
                          to="/coach/setup/get-paid"
                          className="px-3 py-2 text-sm font-medium text-amber-800 bg-amber-100 rounded-lg hover:bg-amber-200 touch-manipulation"
                        >
                          Set up payments
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" aria-modal="true" role="dialog">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Background check</h2>
            <p className="text-slate-600 text-sm mb-6">
              This is where the background check will happen. We&apos;ll use Checkr later to run verification. For now you can mark yourself as verified.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="px-4 py-2 bg-brand-500 text-white font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition"
              >
                {verifyMutation.isPending ? "Verifying\u2026" : "Get verified"}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  if (view === "athletes") {
    const athletes = athletesData ?? [];
    const coachBookings = bookingsData?.asCoach ?? [];

    const athleteStats = new Map<string, { sessionCount: number; lastSession: string | null; nextSession: string | null }>();
    for (const b of coachBookings) {
      const apId = b.athlete.id;
      const existing = athleteStats.get(apId) ?? { sessionCount: 0, lastSession: null, nextSession: null };
      existing.sessionCount++;
      const endTime = b.slot.endTime;
      if (new Date(endTime) < new Date()) {
        if (!existing.lastSession || endTime > existing.lastSession) existing.lastSession = endTime;
      } else {
        if (!existing.nextSession || b.slot.startTime < existing.nextSession) existing.nextSession = b.slot.startTime;
      }
      athleteStats.set(apId, existing);
    }

    const sortedAthletes = [...athletes].sort((a, b) => {
      const aStats = athleteStats.get(a.athleteProfileId);
      const bStats = athleteStats.get(b.athleteProfileId);
      const aDate = aStats?.lastSession ?? aStats?.nextSession ?? a.createdAt;
      const bDate = bStats?.lastSession ?? bStats?.nextSession ?? b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Athletes</h1>
          <span className="text-sm text-slate-500">{athletes.length} connected</span>
        </div>

        {/* Invite link - compact */}
        <section id="invite-athletes" className="mb-6 p-4 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm">Invite athletes</p>
            <p className="text-slate-500 text-xs mt-0.5">Share your link so athletes can sign up and connect with you.</p>
          </div>
          {inviteData?.url ? (
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                readOnly
                value={inviteData.url}
                className="w-48 sm:w-64 px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 text-xs"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(inviteData.url)}
                className="px-3 py-1.5 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600"
              >
                Copy
              </button>
              {!editingInviteSlug ? (
                <button
                  type="button"
                  onClick={() => { setInviteSlugInput(inviteData.slug); setEditingInviteSlug(true); }}
                  className="text-slate-400 hover:text-slate-600 text-xs underline"
                >
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={inviteSlugInput}
                    onChange={(e) => setInviteSlugInput(e.target.value)}
                    placeholder="my-name"
                    className="px-2 py-1 border border-slate-300 rounded text-xs w-28"
                  />
                  <button
                    type="button"
                    onClick={() => updateInviteMutation.mutate(inviteSlugInput)}
                    disabled={updateInviteMutation.isPending || !inviteSlugInput.trim() || inviteSlugInput.trim().length < 2}
                    className="px-2 py-1 rounded bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingInviteSlug(false); setInviteSlugInput(""); }}
                    className="text-slate-400 hover:text-slate-600 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-xs">Loading…</p>
          )}
          {updateInviteMutation.isError && (
            <p className="text-danger-600 text-xs">{updateInviteMutation.error?.message ?? "Failed"}</p>
          )}
        </section>

        {athletesLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        ) : athletesError ? (
          <div className="p-6 bg-white rounded-xl border border-slate-200 text-center">
            <p className="text-slate-700 mb-2">Couldn&apos;t load your athletes.</p>
            <button type="button" onClick={() => refetchAthletes()} className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600">
              Retry
            </button>
          </div>
        ) : athletes.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-slate-200 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No connected athletes yet</p>
            <p className="text-slate-400 text-sm mt-1">Share your invite link so athletes can sign up and appear here.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sortedAthletes.map((a) => {
              const stats = athleteStats.get(a.athleteProfileId);
              return (
                <Link
                  key={a.athleteProfileId}
                  to={`/dashboard/athletes/${a.athleteProfileId}`}
                  className="group flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all"
                >
                  <Avatar
                    src={null}
                    displayName={a.athlete.displayName}
                    size="md"
                    className="shrink-0 ring-2 ring-slate-100 group-hover:ring-brand-200 transition-all"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate group-hover:text-brand-600 transition-colors">{a.athlete.displayName}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      {a.athlete.sports?.length ? (
                        <span className="text-xs text-slate-500">{a.athlete.sports.join(", ")}</span>
                      ) : null}
                      {a.athlete.serviceCity && (
                        <span className="text-xs text-slate-400 flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" /> {a.athlete.serviceCity}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {stats && stats.sessionCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="w-3 h-3" />
                          {stats.sessionCount} session{stats.sessionCount !== 1 ? "s" : ""}
                        </span>
                      ) : null}
                      {stats?.lastSession ? (
                        <span className="text-xs text-slate-400">
                          Last: {new Date(stats.lastSession).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      ) : stats?.nextSession ? (
                        <span className="text-xs text-brand-600 font-medium">
                          Next: {new Date(stats.nextSession).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Connected {new Date(a.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-brand-400 shrink-0 transition-colors" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (view === "agentTest") {
    const sendAsAthlete = async () => {
      const msg = athleteInput.trim();
      if (!msg || agentChatMutation.isPending) return;
      setAthleteInput("");
      setAthleteMessages((prev) => [...prev, { role: "user", content: msg }]);
      try {
        const res = await agentChatMutation.mutateAsync({
          role: "athlete",
          message: msg,
          threadId: agentThreadId,
          athleteId: selectedAthleteId ?? undefined,
        });
        setAgentThinking(res.thinking ?? []);
        setAthleteMessages((prev) => [...prev, { role: "assistant", content: res.agentReplyToSender }]);
        if (res.toCoach?.trim()) {
          setCoachMessages((prev) => [...prev, { role: "assistant", content: res.toCoach! }]);
        }
      } catch (e) {
        setAthleteMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
      }
    };
    const sendAsCoach = async () => {
      const msg = coachInput.trim();
      if (!msg || agentChatMutation.isPending) return;
      setCoachInput("");
      setCoachMessages((prev) => [...prev, { role: "user", content: msg }]);
      try {
        const res = await agentChatMutation.mutateAsync({
          role: "coach",
          message: msg,
          threadId: agentThreadId,
        });
        setAgentThinking(res.thinking ?? []);
        setCoachMessages((prev) => [...prev, { role: "assistant", content: res.agentReplyToSender }]);
        if (res.toAthlete?.trim()) {
          setAthleteMessages((prev) => [...prev, { role: "assistant", content: res.toAthlete! }]);
        }
      } catch (e) {
        setCoachMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
      }
    };
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Agent test harness</h1>
        <p className="text-slate-600 text-sm mb-6">
          Send messages as athlete or coach to see the assistant flow. Select which athlete is messaging to test booking. Thread: <code className="text-xs bg-slate-100 px-1 rounded">{agentThreadId.slice(0, 8)}…</code>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[480px]">
          <section className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-2">
              <h2 className="font-medium text-slate-900">Athlete chat</h2>
              <label className="text-xs text-slate-500 flex items-center gap-2">
                Messaging as:
                <select
                  value={selectedAthleteId ?? ""}
                  onChange={(e) => setSelectedAthleteId(e.target.value || null)}
                  className="text-slate-700 border border-slate-300 rounded px-2 py-1 text-sm flex-1 min-w-0"
                >
                  <option value="">Select athlete…</option>
                  {(athletesData ?? []).map((a) => (
                    <option key={a.athlete.userId} value={a.athlete.userId}>
                      {a.athlete.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {athleteMessages.length === 0 && (
                <p className="text-slate-500 text-sm">Send as athlete →</p>
              )}
              {athleteMessages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <span className="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm text-left break-words bg-slate-100 text-slate-900">{m.content}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 flex gap-2">
              <input
                type="text"
                value={athleteInput}
                onChange={(e) => setAthleteInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendAsAthlete()}
                placeholder="Message as athlete…"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={sendAsAthlete}
                disabled={agentChatMutation.isPending}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </section>
          <section className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <h2 className="px-4 py-3 border-b border-slate-200 font-medium text-slate-700 bg-slate-100">Agent thinking</h2>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {agentThinking.length === 0 && (
                <p className="text-slate-500 text-sm">Tool calls and steps appear here.</p>
              )}
              {agentThinking.map((line, i) => (
                <p key={i} className="text-xs font-mono text-slate-600">{line}</p>
              ))}
            </div>
          </section>
          <section className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h2 className="px-4 py-3 border-b border-slate-200 font-medium text-slate-900 bg-slate-50">Coach chat</h2>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {coachMessages.length === 0 && (
                <p className="text-slate-500 text-sm">Send as coach →</p>
              )}
              {coachMessages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <span className="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm text-left break-words bg-slate-100 text-slate-900">{m.content}</span>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 flex gap-2">
              <input
                type="text"
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendAsCoach()}
                placeholder="Message as coach…"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={sendAsCoach}
                disabled={agentChatMutation.isPending}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (view === "availability") {
    const handleCalendarRangeChange = (range: Date[] | { start: Date; end: Date }) => {
      if (Array.isArray(range) && range.length > 0) {
        const start = range[0];
        const end = range[range.length - 1];
        setCalendarRange({ start, end });
      } else if (!Array.isArray(range) && range.start && range.end) {
        setCalendarRange({ start: range.start, end: range.end });
      }
    };

    const handleEventRemove = (event: CalendarEvent) => {
      setSelectedEvent(null);
      if (event.resource?.type === "recurring" && event.resource.ruleId) {
        setRemoveTarget({
          type: "rule",
          id: event.resource.ruleId,
          bookingCount: event.resource.bookingCount,
        });
      } else if (event.resource?.type === "one-off" && event.resource.slotId) {
        setRemoveTarget({ type: "slot", id: event.resource.slotId });
      }
    };

    return (
      <>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-6 sm:mb-8">
          Availability
        </h1>
        <section className="mb-6 sm:mb-8">
          <CoachLocations />
        </section>
        <section className="px-4 py-4 sm:p-6 bg-white rounded-xl border border-slate-200">
          {availabilityLoading ? (
            <p className="text-slate-500">Loading...</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-500">
                Tap a date to see that day&apos;s schedule and add availability (one-time or repeat weekly).
              </p>
              <AvailabilityCalendar
                rules={rules}
                oneOffSlots={oneOffSlots}
                bookedSlotIds={bookedSlotIds}
                rangeStart={calendarRange.start}
                rangeEnd={calendarRange.end}
                onSlotClick={(start) => {
                  setAddOneOffError(null);
                  setAddOneOffModalStart(start);
                }}
                onEventClick={setSelectedEvent}
                onRangeChange={handleCalendarRangeChange}
                locations={coachLocations}
                inlineAddSlot={addOneOffModalStart}
                onCloseInlineAdd={() => {
                  setAddOneOffModalStart(null);
                  setAddOneOffError(null);
                }}
                onAddOneOff={(startTime, durationMinutes, locationId) => {
                  addSlotMutation.mutate({
                    startTime,
                    durationMinutes,
                    recurrence: "none",
                    ...(locationId && { locationId }),
                  });
                }}
                onAddRecurring={(firstStartTime, durationMinutes, endDate, locationId) => {
                  addRuleMutation.mutate({
                    firstStartTime,
                    durationMinutes,
                    recurrence: "weekly",
                    endDate,
                    ...(locationId && { locationId }),
                  });
                }}
                isAddSubmitting={addSlotMutation.isPending || addRuleMutation.isPending}
                addError={addOneOffError}
              />
              {(rules.length > 0 || oneOffSlots.length > 0) && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Summary</h3>
                  {rules.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Recurring</p>
                      <ul className="space-y-2">
                        {rules.map((rule) => {
                          const first = new Date(rule.firstStartTime);
                          const end = new Date(first.getTime() + rule.durationMinutes * 60 * 1000);
                          const day = format(first, "EEEE");
                          const timeRange = `${format(first, "h:mm a")} – ${format(end, "h:mm a")}`;
                          const endDateFormatted = format(new Date(rule.endDate + "T12:00:00"), "MMM d, yyyy");
                          return (
                            <li key={rule.id} className="flex justify-between items-center py-1.5 text-sm">
                              <span className="text-slate-700">
                                <strong>{day}s</strong> {timeRange} until {endDateFormatted}
                                <span className="text-slate-500 font-normal ml-1">({rule.slotCount} slots)</span>
                              </span>
                              <button
                                onClick={() => setRemoveTarget({ type: "rule", id: rule.id, bookingCount: rule.bookingCount ?? 0 })}
                                disabled={deleteRuleMutation.isPending}
                                className="text-danger-600 hover:underline text-sm shrink-0 ml-2"
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {oneOffSlots.length > 0 && (() => {
                    const now = new Date();
                    const upcoming = oneOffSlots
                      .filter((s) => !isBefore(new Date(s.startTime), now))
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .slice(0, 15);
                    const pastCount = oneOffSlots.length - upcoming.length;
                    return (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                          One-time slots
                          {pastCount > 0 && (
                            <span className="font-normal normal-case ml-1">
                              ({pastCount} past hidden)
                            </span>
                          )}
                        </p>
                        {upcoming.length === 0 ? (
                          <p className="text-slate-500 text-sm py-1">No upcoming one-time slots. Past slots still show on the calendar; remove from there if needed.</p>
                        ) : (
                          <>
                            <ul className="space-y-2">
                              {upcoming.map((slot) => {
                                const start = new Date(slot.startTime);
                                const end = new Date(slot.endTime);
                                const dateStr = format(start, "EEE, MMM d, yyyy");
                                const timeStr = `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
                                return (
                                  <li key={slot.id} className="flex justify-between items-center py-1.5 text-sm">
                                    <span className="text-slate-700">
                                      {dateStr} at {timeStr}
                                    </span>
                                    <button
                                      onClick={() => setRemoveTarget({ type: "slot", id: slot.id })}
                                      disabled={deleteSlotMutation.isPending}
                                      className="text-danger-600 hover:underline text-sm shrink-0 ml-2"
                                    >
                                      Remove
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            {oneOffSlots.length > 15 && upcoming.length === 15 && (
                              <p className="text-slate-500 text-xs mt-1">Showing next 15. Rest appear on the calendar.</p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              {removeTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="remove-availability-title">
                  <div className="bg-white rounded-xl shadow-lg p-6 max-w-md mx-4">
                    <h3 id="remove-availability-title" className="text-lg font-semibold text-slate-900 mb-2">
                      Remove availability?
                    </h3>
                    <p className="text-slate-600 text-sm mb-4">
                      {removeTarget.type === "rule" ? (
                        removeTarget.bookingCount !== undefined && removeTarget.bookingCount > 0 ? (
                          <>This will cancel {removeTarget.bookingCount} booking(s) and notify the affected athlete(s) by email. Continue?</>
                        ) : (
                          <>This will remove the entire recurring series. Continue?</>
                        )
                      ) : (
                        <>Remove this slot? Any existing bookings will be cancelled and athletes will be notified by email.</>
                      )}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(null)}
                        className="px-3 py-1.5 text-slate-700 hover:bg-slate-100 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (removeTarget.type === "rule") {
                            deleteRuleMutation.mutate(removeTarget.id);
                          } else {
                            deleteSlotMutation.mutate(removeTarget.id);
                          }
                        }}
                        disabled={deleteRuleMutation.isPending || deleteSlotMutation.isPending}
                        className="px-3 py-1.5 bg-danger-600 text-white rounded hover:bg-danger-700 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onRemove={() => handleEventRemove(selectedEvent)}
            isRemoving={deleteSlotMutation.isPending || deleteRuleMutation.isPending}
          />
        )}
        <p className="mt-6 text-slate-500 text-sm">
          Manage booking requests from the{" "}
          <Link to="/bookings" className="text-brand-600 hover:underline">
            Bookings
          </Link>{" "}
          page.
        </p>
      </div>
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" aria-modal="true" role="dialog">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Background check</h2>
            <p className="text-slate-600 text-sm mb-6">
              This is where the background check will happen. We&apos;ll use Chekr later to run verification. For now you can mark yourself as verified.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="px-4 py-2 bg-brand-500 text-white font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition"
              >
                {verifyMutation.isPending ? "Verifying…" : "Get verified"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">
        Profile
      </h1>

      <section className="mb-8 p-6 bg-white rounded-xl border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
          {!editingProfile && (
            <button
              type="button"
              onClick={() => setEditingProfile(true)}
              className="text-brand-600 font-medium hover:underline"
            >
              Edit profile
            </button>
          )}
        </div>
        {editingProfile ? (
          <EditProfileFormInline
            coach={coach}
            updateProfileMutation={updateProfileMutation}
            onCancel={() => setEditingProfile(false)}
          />
        ) : (
          <div className="space-y-2">
            <p>
              <span className="font-medium">Name:</span> {coach.displayName}
            </p>
            <p>
              <span className="font-medium">Sports:</span> {coach.sports?.length ? coach.sports.join(", ") : "—"}
            </p>
            <p>
              <span className="font-medium">Service areas:</span> {coach.serviceAreas?.length ? coach.serviceAreas.map((a) => `${a.label} (${a.radiusMiles} mi)`).join(", ") : coach.serviceCities?.length ? coach.serviceCities.join(", ") : "—"}
            </p>
            {coach.hourlyRate && (
              <p>
                <span className="font-medium">Rate:</span> ${coach.hourlyRate}/hr
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Profile photos
        </h2>
        <p className="text-slate-600 text-sm mb-4">
          Upload a photo or add an image URL. These appear on your public profile.
        </p>
        {uploadError && (
          <p className="text-danger-600 text-sm mb-2" role="alert">{uploadError}</p>
        )}
        {savePhotosMutation.isError && (
          <p className="text-danger-600 text-sm mb-2" role="alert">
            Failed to save photos. {savePhotosMutation.error instanceof Error ? savePhotosMutation.error.message : "Please try again."}
          </p>
        )}
        {photosSaveSkippedMessage && (
          <p className="text-amber-700 text-sm mb-2" role="alert">{photosSaveSkippedMessage}</p>
        )}
        <p className="text-slate-600 text-sm mb-2">
          Choose one photo as your main profile photo (shown as your avatar). Save any new or reordered photos first, then set the primary.
        </p>
        <div className="flex flex-wrap gap-3 mb-4">
          {photoUrls.map((url, i) => {
            const hasProfile = profile && !("error" in profile);
            const savedPhoto = hasProfile && profile.photos ? profile.photos.find((p) => p.url === url) : undefined;
            const isPrimary = hasProfile && profile.avatarUrl === url;
            return (
              <div key={savedPhoto?.id ?? i} className="relative group">
                <img
                  src={url}
                  alt=""
                  className={`h-24 w-24 object-cover rounded-lg border-2 ${isPrimary ? "border-brand-500 ring-2 ring-brand-500/30" : "border-slate-200"}`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' fill='%2394a3b8'%3E%3Crect width='96' height='96'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='10'%3EInvalid%3C/text%3E%3C/svg%3E";
                  }}
                />
                {isPrimary && (
                  <span className="absolute bottom-1 left-1 right-1 text-center text-xs font-medium bg-brand-500/90 text-white rounded py-0.5" aria-hidden>
                    Primary
                  </span>
                )}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {savedPhoto && !isPrimary && (
                    <button
                      type="button"
                      onClick={() => setPrimaryPhotoMutation.mutate(savedPhoto.id)}
                      disabled={setPrimaryPhotoMutation.isPending}
                      className="bg-slate-800/90 text-white rounded-full w-6 h-6 inline-flex items-center justify-center p-0 hover:bg-slate-700"
                      title="Set as profile photo"
                      aria-label="Set as profile photo"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0" aria-hidden><path fillRule="evenodd" d="M10 9a3 3 0 100 6 3 3 0 000-6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    </button>
                  )}
                  {savedPhoto && isPrimary && (
                    <span className="bg-brand-500/90 text-white rounded-full w-6 h-6 inline-flex items-center justify-center p-0" title="Profile photo" aria-label="Profile photo">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0" aria-hidden><path fillRule="evenodd" d="M10 9a3 3 0 100 6 3 3 0 000-6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoUrls((prev) => prev.filter((_, j) => j !== i));
                      setPhotosSaved(false);
                      setPhotosSaveSkippedMessage(null);
                    }}
                    className="bg-danger-500/90 text-white rounded-full w-6 h-6 inline-flex items-center justify-center p-0 hover:bg-danger-600"
                    aria-label="Remove photo"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 shrink-0" aria-hidden><path d="M15 5L5 15M5 5l10 10" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            id="photo-upload"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              setUploadError(null);
              setUploading(true);
              try {
                const { uploadUrl, url } = await api<{ uploadUrl: string; url: string }>(
                  "/coaches/me/photos/presign",
                  {
                    method: "POST",
                    body: JSON.stringify({ contentType: file.type || "image/jpeg" }),
                  }
                );
                const putRes = await fetch(uploadUrl, {
                  method: "PUT",
                  body: file,
                  headers: { "Content-Type": file.type || "image/jpeg" },
                });
                if (!putRes.ok) throw new Error("Upload failed");
                setPhotoUrls((prev) => [...prev, url]);
                setPhotosSaved(false);
                setPhotosSaveSkippedMessage(null);
              } catch (err) {
                setUploadError(err instanceof Error ? err.message : "Upload failed");
              } finally {
                setUploading(false);
              }
            }}
          />
          <label
            htmlFor="photo-upload"
            className={`cursor-pointer px-4 py-2 rounded-lg font-medium border border-slate-300 ${
              uploading ? "opacity-50 pointer-events-none" : "hover:bg-slate-50"
            }`}
          >
            {uploading ? "Uploading…" : "Upload photo"}
          </label>
          <input
            type="url"
            value={newPhotoUrl}
            onChange={(e) => setNewPhotoUrl(e.target.value)}
            placeholder="Or paste image URL"
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={() => {
              if (newPhotoUrl.trim()) {
                setPhotoUrls((prev) => [...prev, newPhotoUrl.trim()]);
                setNewPhotoUrl("");
                setPhotosSaved(false);
                setPhotosSaveSkippedMessage(null);
              }
            }}
            className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg font-medium hover:bg-slate-300"
          >
            Add URL
          </button>
          {!photosSaved && (
            <button
              type="button"
              onClick={() => savePhotosMutation.mutate(photoUrls)}
              disabled={savePhotosMutation.isPending}
              className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              {savePhotosMutation.isPending ? "Saving…" : "Save photos"}
            </button>
          )}
        </div>
      </section>

      <CredentialsSection coach={coach} />

      <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-900">About Me</h2>
          <Link
            to="/coach/onboarding/bio"
            className="text-brand-600 font-medium hover:underline"
          >
            Edit
          </Link>
        </div>
        {coach.bio ? (
          <div className="text-slate-600 [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-slate-800">
            <ReactMarkdown>{coach.bio}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No about section yet. Add one to help athletes get to know you.</p>
        )}
      </section>

      <p className="mt-6 text-slate-500 text-sm">
        Manage your schedule on the{" "}
        <Link to="/dashboard/availability" className="text-brand-600 hover:underline">
          Availability
        </Link>{" "}
        page. Booking requests appear on{" "}
        <Link to="/bookings" className="text-brand-600 hover:underline">
          Bookings
        </Link>.
      </p>
    </div>
    {showVerifyModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" aria-modal="true" role="dialog">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Background check</h2>
          <p className="text-slate-600 text-sm mb-6">
            This is where the background check will happen. We&apos;ll use Chekr later to run verification. For now you can mark yourself as verified.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowVerifyModal(false)}
              className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="px-4 py-2 bg-brand-500 text-white font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition"
            >
              {verifyMutation.isPending ? "Verifying…" : "Get verified"}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
