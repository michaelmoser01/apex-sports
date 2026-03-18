import { useState, useEffect, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import {
  getStoredInviteSlug,
  getStoredInviteCoachId,
  clearStoredInviteSlug,
} from "./Join";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { hasCompletedAthleteOnboarding } from "@/lib/athleteProfile";
import ServiceAreaPicker, { type ServiceAreaItem } from "@/components/ServiceAreaPicker";

interface AthleteProfile {
  id: string;
  displayName: string;
  serviceCity: string | null;
  avatarUrl: string | null;
  birthYear: number | null;
  sports: string[];
  level: string | null;
  phone: string | null;
}

export default function AthleteOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(true);

  const inviteSlug = getStoredInviteSlug();
  const inviteCoachId = getStoredInviteCoachId();
  const isAlreadyAthlete =
    currentUser?.signupRole === "athlete" || !!currentUser?.athleteProfile;
  const athleteProfileComplete = hasCompletedAthleteOnboarding(currentUser?.athleteProfile ?? null);
  const needsRole = !!inviteSlug && !currentUser?.signupRole;
  const setRoleAttempted = useRef(false);

  const setRoleMutation = useMutation({
    mutationFn: () => {
      const slug = getStoredInviteSlug();
      return api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole: "athlete", ...(slug ? { inviteSlug: slug } : {}) }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  useEffect(() => {
    if (currentUserLoading || !needsRole || setRoleAttempted.current) return;
    setRoleAttempted.current = true;
    setRoleMutation.mutate();
  }, [currentUserLoading, needsRole]);

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ["athleteProfile"],
    queryFn: () => api<AthleteProfile>("/athletes/me"),
    enabled: !needsRole && (!!currentUser?.signupRole || !!currentUser?.athleteProfile),
  });

  const { data: existingServiceArea } = useQuery({
    queryKey: ["athleteServiceArea"],
    queryFn: () => api<ServiceAreaItem | null>("/athletes/me/service-area"),
    enabled: !needsRole && (!!currentUser?.signupRole || !!currentUser?.athleteProfile),
  });

  const [displayName, setDisplayName] = useState("");
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaItem[]>([]);
  const [birthYear, setBirthYear] = useState<string>("");
  const [sports, setSports] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      displayName: string;
      birthYear?: number | null;
      sports: string[];
      level?: string | null;
      phone: string;
    }) => {
      const result = await api<AthleteProfile>("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({ ...data, serviceCity: serviceAreas[0]?.label ?? "" }),
      });
      if (serviceAreas[0]) {
        await api("/athletes/me/service-area", {
          method: "POST",
          body: JSON.stringify({
            label: serviceAreas[0].label,
            latitude: serviceAreas[0].latitude,
            longitude: serviceAreas[0].longitude,
            radiusMiles: serviceAreas[0].radiusMiles,
          }),
        });
      }
      if (pendingPhoto) {
        try {
          setPhotoUploading(true);
          const { uploadUrl, url } = await api<{ uploadUrl: string; url: string }>("/athletes/me/photo/presign", {
            method: "POST",
            body: JSON.stringify({ contentType: pendingPhoto.type || "image/jpeg" }),
          });
          const putRes = await fetch(uploadUrl, { method: "PUT", body: pendingPhoto, headers: { "Content-Type": pendingPhoto.type || "image/jpeg" } });
          if (putRes.ok) {
            await api("/athletes/me/avatar", { method: "PATCH", body: JSON.stringify({ avatarUrl: url }) });
          }
        } catch { /* photo upload failed, profile still saved */ } finally {
          setPhotoUploading(false);
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athleteProfile"] });
      queryClient.invalidateQueries({ queryKey: ["athleteServiceArea"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const coachId = getStoredInviteCoachId();
      clearStoredInviteSlug();
      navigate(coachId ? `/coaches/${coachId}` : "/athlete", { replace: true });
    },
  });

  const profileInitialized = useRef(false);
  useEffect(() => {
    if (profileInitialized.current || !profile) return;
    profileInitialized.current = true;
    setDisplayName(profile.displayName ?? "");
    setBirthYear(profile.birthYear != null ? String(profile.birthYear) : "");
    setSports(profile.sports ?? []);
    setLevel(profile.level ?? "");
    setPhone(profile.phone ?? "");
    if (profile.avatarUrl) setAvatarUrl(profile.avatarUrl);
  }, [profile]);

  const serviceAreaInitialized = useRef(false);
  useEffect(() => {
    if (serviceAreaInitialized.current || !existingServiceArea) return;
    serviceAreaInitialized.current = true;
    setServiceAreas([existingServiceArea]);
  }, [existingServiceArea]);

  const toggleSport = (sport: string) => {
    setSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || serviceAreas.length === 0 || sports.length === 0 || !phone.trim()) {
      return;
    }
    const year = birthYear.trim() ? Number(birthYear.trim()) : null;
    const payload: {
      displayName: string;
      birthYear: number | null;
      sports: string[];
      level?: string;
      phone: string;
    } = {
      displayName: displayName.trim(),
      birthYear: Number.isFinite(year as number) ? (year as number) : null,
      sports,
      phone: phone.trim(),
    };
    if (level.trim()) {
      payload.level = level.trim();
    }
    updateProfileMutation.mutate(payload);
  };

  // --- Early returns (all hooks above) ---

  if (inviteSlug && inviteCoachId && currentUserLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  const isCoach = currentUser?.signupRole === "coach" || !!currentUser?.coachProfile;
  if (!currentUserLoading && isCoach && !inviteSlug) {
    return <Navigate to="/dashboard" replace />;
  }

  if (
    inviteSlug &&
    inviteCoachId &&
    isAlreadyAthlete &&
    athleteProfileComplete &&
    !setRoleAttempted.current
  ) {
    return <Navigate to={`/coaches/${inviteCoachId}`} replace />;
  }

  const settingRole = needsRole && !currentUser?.signupRole;
  const showForm = !needsRole || !!currentUser?.signupRole;

  if (settingRole || (needsRole && !showForm)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-slate-500">Setting up your account…</p>
      </div>
    );
  }

  if (profileLoading && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-slate-700 mb-4">Couldn&apos;t load your profile.</p>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["athleteProfile"] })}
          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Set up your athlete profile</h1>
      <p className="text-slate-600 mb-8">
        Tell us a bit about you so coaches can understand your sport, level, and where you train.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Profile photo (optional)</label>
          <p className="text-slate-500 text-xs mb-2">Add a photo so coaches can recognize you.</p>
          <div className="flex items-center gap-4">
            {(pendingPhoto || avatarUrl) ? (
              <div className="relative group">
                <img
                  src={pendingPhoto ? URL.createObjectURL(pendingPhoto) : avatarUrl!}
                  alt="Profile"
                  className="h-20 w-20 object-cover rounded-full border-2 border-slate-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => { setPendingPhoto(null); setAvatarUrl(null); }}
                  className="absolute -top-1 -right-1 bg-danger-500/90 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs hover:bg-danger-600"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="h-20 w-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
            )}
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                id="athlete-photo-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setPendingPhoto(file); setAvatarUrl(null); }
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="athlete-photo-upload"
                className="cursor-pointer inline-flex items-center px-3 py-2 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
              >
                {pendingPhoto || avatarUrl ? "Change photo" : "Upload photo"}
              </label>
            </div>
          </div>
        </div>

        <ServiceAreaPicker
          areas={serviceAreas}
          onChange={setServiceAreas}
          single
          label="Home area"
          helperText="Choose the main area where you'll train or meet coaches."
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Sports</label>
          <p className="text-slate-500 text-xs mb-2">
            Pick at least one sport you&apos;re training in.
          </p>
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Phone number
          </label>
          <p className="text-slate-500 text-xs mb-2">
            We&apos;ll share this with your coach so you can coordinate sessions. Message and
            data rates may apply. By continuing, you agree to our{" "}
            <a href="#" className="underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline">
              Privacy Policy
            </a>
            .
          </p>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="e.g. 201 555 0123"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Birth year (optional)</label>
            <input
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="e.g. 2008"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Level (optional)</label>
            <input
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="e.g. Club, Varsity, Elite"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={updateProfileMutation.isPending || photoUploading || !displayName.trim() || serviceAreas.length === 0 || sports.length === 0}
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all"
        >
          {updateProfileMutation.isPending || photoUploading ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
