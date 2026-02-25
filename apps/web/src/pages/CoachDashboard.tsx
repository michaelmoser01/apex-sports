import { Link, useLocation, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS, DURATION_MINUTES_OPTIONS } from "@apex-sports/shared";
import { searchServiceCities } from "@apex-sports/shared";

interface CoachPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

interface CoachProfile {
  id: string;
  displayName: string;
  sports: string[];
  serviceCities: string[];
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  phone?: string | null;
  photos?: CoachPhoto[];
  stripeConnectAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
}

interface AvailabilityRule {
  id: string;
  firstStartTime: string;
  durationMinutes: number;
  recurrence: string;
  endDate: string;
  slotCount: number;
  bookingCount?: number;
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
}

function CreateProfileFormInline({
  createProfileMutation,
}: {
  createProfileMutation: { mutate: (data: { displayName: string; sports: string[]; serviceCities: string[]; bio?: string; hourlyRate?: number; phone?: string }) => void; isPending: boolean; error: Error | null };
}) {
  const [displayName, setDisplayName] = useState("");
  const [sports, setSports] = useState<string[]>([]);
  const [serviceCities, setServiceCities] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [phone, setPhone] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const updateCitySuggestions = (q: string) => {
    setCitySuggestions(searchServiceCities(q, 10));
    setShowCitySuggestions(true);
  };

  const addCity = (city: string) => {
    if (city && !serviceCities.includes(city)) {
      setServiceCities((prev) => [...prev, city]);
      setCityInput("");
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  };

  const removeCity = (city: string) => {
    setServiceCities((prev) => prev.filter((c) => c !== city));
  };

  const toggleSport = (sport: string) => {
    setSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sports.length === 0 || serviceCities.length === 0) return;
    createProfileMutation.mutate({
      displayName,
      sports,
      serviceCities,
      bio: bio || undefined,
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
          placeholder="John Smith"
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
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Service areas (cities, at least one)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {serviceCities.map((city) => (
            <span
              key={city}
              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-sm"
            >
              {city}
              <button
                type="button"
                onClick={() => removeCity(city)}
                className="text-slate-500 hover:text-slate-700"
                aria-label={`Remove ${city}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input
            type="text"
            value={cityInput}
            onChange={(e) => {
              setCityInput(e.target.value);
              updateCitySuggestions(e.target.value);
            }}
            onFocus={() => cityInput && updateCitySuggestions(cityInput)}
            onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="Type to search cities..."
          />
          {showCitySuggestions && citySuggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
              {citySuggestions
                .filter((c) => !serviceCities.includes(c))
                .map((city) => (
                  <li key={city}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={() => addCity(city)}
                    >
                      {city}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <p className="text-slate-500 text-xs mt-1">Bay Area cities. Add all areas you serve.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          placeholder="Tell athletes about your experience..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Hourly rate ($)</label>
        <input
          type="number"
          min={0}
          step={5}
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          placeholder="75"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Phone (optional, for SMS booking alerts)</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          placeholder="+1 555 123 4567"
        />
      </div>
      <button
        type="submit"
        disabled={createProfileMutation.isPending || sports.length === 0 || serviceCities.length === 0}
        className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
      >
        {createProfileMutation.isPending ? "Creating..." : "Create profile"}
      </button>
      {createProfileMutation.error != null && (
        <p className="mt-3 text-red-600 text-sm" role="alert">
          {createProfileMutation.error?.message}
        </p>
      )}
    </form>
  );
}

function EditProfileFormInline({
  coach,
  updateProfileMutation,
  onCancel,
}: {
  coach: CoachProfile;
  updateProfileMutation: { mutate: (data: { displayName?: string; sports?: string[]; serviceCities?: string[]; bio?: string; hourlyRate?: number; phone?: string }) => void; isPending: boolean };
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(coach.displayName);
  const [sports, setSports] = useState<string[]>(coach.sports ?? []);
  const [serviceCities, setServiceCities] = useState<string[]>(coach.serviceCities ?? []);
  const [bio, setBio] = useState(coach.bio ?? "");
  const [hourlyRate, setHourlyRate] = useState(coach.hourlyRate ?? "");
  const [phone, setPhone] = useState(coach.phone ?? "");
  const [cityInput, setCityInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  const updateCitySuggestions = (q: string) => {
    setCitySuggestions(searchServiceCities(q, 10));
    setShowCitySuggestions(true);
  };

  const addCity = (city: string) => {
    if (city && !serviceCities.includes(city)) {
      setServiceCities((prev) => [...prev, city]);
      setCityInput("");
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  };

  const removeCity = (city: string) => {
    setServiceCities((prev) => prev.filter((c) => c !== city));
  };

  const toggleSport = (sport: string) => {
    setSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sports.length === 0 || serviceCities.length === 0) return;
    updateProfileMutation.mutate({
      displayName,
      sports,
      serviceCities,
      bio: bio || undefined,
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
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Service areas (cities)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {serviceCities.map((city) => (
            <span
              key={city}
              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-sm"
            >
              {city}
              <button
                type="button"
                onClick={() => removeCity(city)}
                className="text-slate-500 hover:text-slate-700"
                aria-label={`Remove ${city}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input
            type="text"
            value={cityInput}
            onChange={(e) => {
              setCityInput(e.target.value);
              updateCitySuggestions(e.target.value);
            }}
            onFocus={() => cityInput && updateCitySuggestions(cityInput)}
            onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="Type to search cities..."
          />
          {showCitySuggestions && citySuggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
              {citySuggestions
                .filter((c) => !serviceCities.includes(c))
                .map((city) => (
                  <li key={city}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={() => addCity(city)}
                    >
                      {city}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </div>
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Phone (optional, for SMS booking alerts)</label>
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
          disabled={updateProfileMutation.isPending || sports.length === 0 || serviceCities.length === 0}
          className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
        >
          {updateProfileMutation.isPending ? "Saving..." : "Save"}
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

export default function CoachDashboard() {
  const location = useLocation();
  const view = location.pathname.endsWith("/availability") ? "availability" : "profile";
  const queryClient = useQueryClient();
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [addMode, setAddMode] = useState<"one-off" | "recurring" | null>(null);
  const [slotStart, setSlotStart] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [ruleFirstStart, setRuleFirstStart] = useState("");
  const [ruleEndDate, setRuleEndDate] = useState("");
  const [ruleDurationMinutes, setRuleDurationMinutes] = useState(60);
  const [removeTarget, setRemoveTarget] = useState<{ type: "rule" | "slot"; id: string; bookingCount?: number } | null>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photosSaved, setPhotosSaved] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [photosSaveSkippedMessage, setPhotosSaveSkippedMessage] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

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
  const rules = availability?.rules ?? [];
  const oneOffSlots = availability?.oneOffSlots ?? [];

  const createProfileMutation = useMutation({
    mutationFn: (data: {
      displayName: string;
      sports: string[];
      serviceCities: string[];
      bio?: string;
      hourlyRate?: number;
      phone?: string;
    }) =>
      api("/coaches/me", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: {
      displayName?: string;
      sports?: string[];
      serviceCities?: string[];
      bio?: string;
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
      setSlotStart("");
      setDurationMinutes(60);
      setShowAvailabilityForm(false);
      setAddMode(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: (data: { firstStartTime: string; durationMinutes: number; recurrence: "weekly"; endDate: string }) =>
      api("/coaches/me/availability/rules", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setRuleFirstStart("");
      setRuleEndDate("");
      setRuleDurationMinutes(60);
      setShowAvailabilityForm(false);
      setAddMode(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
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

  const connectAccountLinkMutation = useMutation({
    mutationFn: () =>
      api<{ url: string }>("/coaches/me/connect-account-link", { method: "POST" }),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
  });

  useEffect(() => {
    if (profile && !("error" in profile) && "photos" in profile && Array.isArray(profile.photos)) {
      const urls = profile.photos.map((p) => p.url);
      setPhotoUrls(urls);
    }
  }, [profile]);

  const [connectStatusSyncing, setConnectStatusSyncing] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if ((params.get("connect") === "return" || params.get("connect") === "refresh") && profile && !("error" in profile)) {
      setConnectStatusSyncing(true);
      api<{ stripeOnboardingComplete: boolean }>("/coaches/me/connect-status")
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
          window.history.replaceState({}, "", location.pathname);
        })
        .finally(() => setConnectStatusSyncing(false));
    }
  }, [location.search, location.pathname, profile, queryClient]);

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
    if (view === "availability") {
      return <Navigate to="/dashboard/profile" replace />;
    }
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">
          Create your coach profile
        </h1>
        <CreateProfileFormInline
          createProfileMutation={createProfileMutation}
        />
      </div>
    );
  }

  const coach = profile as CoachProfile;

  if (view === "availability") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">
          Availability
        </h1>
        <section className="p-6 bg-white rounded-xl border border-slate-200">
          {availabilityLoading ? (
            <p className="text-slate-500">Loading...</p>
          ) : (
            <>
              <div className="mb-6 pb-6 border-b border-slate-200">
                {showAvailabilityForm ? (
                  <div className="space-y-4">
                    {addMode === null ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          onClick={() => setAddMode("one-off")}
                          className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium"
                        >
                          One-off slot
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddMode("recurring")}
                          className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg font-medium hover:bg-slate-300"
                        >
                          Recurring (weekly)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowAvailabilityForm(false); setAddMode(null); }}
                          className="text-slate-600 px-4 py-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : addMode === "one-off" ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          addSlotMutation.mutate({
                            startTime: new Date(slotStart).toISOString(),
                            durationMinutes,
                            recurrence: "none",
                          });
                        }}
                        className="space-y-3"
                      >
                        <div className="flex flex-wrap gap-2 items-center">
                          <label className="text-sm font-medium text-slate-700">Start</label>
                          <input
                            type="datetime-local"
                            value={slotStart}
                            onChange={(e) => setSlotStart(e.target.value)}
                            required
                            className="px-3 py-2 border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <label className="text-sm font-medium text-slate-700">Duration</label>
                          <select
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(Number(e.target.value))}
                            className="px-3 py-2 border border-slate-300 rounded-lg"
                          >
                            {DURATION_MINUTES_OPTIONS.map((m) => (
                              <option key={m} value={m}>
                                {m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={addSlotMutation.isPending}
                            className="bg-brand-500 text-white px-3 py-1 rounded"
                          >
                            Add one-off
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddMode(null)}
                            className="text-slate-600"
                          >
                            Back
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          addRuleMutation.mutate({
                            firstStartTime: new Date(ruleFirstStart).toISOString(),
                            durationMinutes: ruleDurationMinutes,
                            recurrence: "weekly",
                            endDate: ruleEndDate,
                          });
                        }}
                        className="space-y-3"
                      >
                        <div className="flex flex-wrap gap-2 items-center">
                          <label className="text-sm font-medium text-slate-700">First start (date & time)</label>
                          <input
                            type="datetime-local"
                            value={ruleFirstStart}
                            onChange={(e) => setRuleFirstStart(e.target.value)}
                            required
                            className="px-3 py-2 border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <label className="text-sm font-medium text-slate-700">Duration</label>
                          <select
                            value={ruleDurationMinutes}
                            onChange={(e) => setRuleDurationMinutes(Number(e.target.value))}
                            className="px-3 py-2 border border-slate-300 rounded-lg"
                          >
                            {DURATION_MINUTES_OPTIONS.map((m) => (
                              <option key={m} value={m}>
                                {m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <label className="text-sm font-medium text-slate-700">End date (required)</label>
                          <input
                            type="date"
                            value={ruleEndDate}
                            onChange={(e) => setRuleEndDate(e.target.value)}
                            required
                            className="px-3 py-2 border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={addRuleMutation.isPending}
                            className="bg-brand-500 text-white px-3 py-1 rounded"
                          >
                            Add recurring
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddMode(null)}
                            className="text-slate-600"
                          >
                            Back
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => setShowAvailabilityForm(true)}
                      className="text-brand-600 font-medium hover:underline"
                    >
                      + Add availability
                    </button>
                    <p className="text-slate-600 text-sm mt-1">Add a single time slot or a recurring weekly series.</p>
                  </div>
                )}
              </div>
              {rules.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Recurring (weekly)</h3>
                  <div className="space-y-2">
                    {rules.map((rule) => {
                      const first = new Date(rule.firstStartTime);
                      const day = first.toLocaleDateString([], { weekday: "long" });
                      const timeRange = `${first.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(first.getTime() + rule.durationMinutes * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                      return (
                        <div
                          key={rule.id}
                          className="flex justify-between items-center py-2 border-b border-slate-100"
                        >
                          <span>
                            {day}s {timeRange} until {rule.endDate}
                            <span className="text-slate-500 text-sm ml-1">({rule.slotCount} slots)</span>
                          </span>
                          <button
                            onClick={() => setRemoveTarget({ type: "rule", id: rule.id, bookingCount: rule.bookingCount ?? 0 })}
                            disabled={deleteRuleMutation.isPending}
                            className="text-red-600 text-sm hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {oneOffSlots.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">One-off slots</h3>
                  <div className="space-y-2">
                    {oneOffSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex justify-between items-center py-2 border-b border-slate-100"
                      >
                        <span>
                          {new Date(slot.startTime).toLocaleString()} –{" "}
                          {new Date(slot.endTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          onClick={() => setRemoveTarget({ type: "slot", id: slot.id })}
                          disabled={deleteSlotMutation.isPending}
                          className="text-red-600 text-sm hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rules.length === 0 && oneOffSlots.length === 0 && (
                <p className="text-slate-500 text-sm">No availability set yet.</p>
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
                        className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
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
        <p className="mt-6 text-slate-500 text-sm">
          Manage booking requests from the{" "}
          <Link to="/bookings" className="text-brand-600 hover:underline">
            Bookings
          </Link>{" "}
          page.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">
        Profile
      </h1>

      <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
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
              <span className="font-medium">Service areas:</span> {coach.serviceCities?.length ? coach.serviceCities.join(", ") : "—"}
            </p>
            {coach.hourlyRate && (
              <p>
                <span className="font-medium">Rate:</span> ${coach.hourlyRate}/hr
              </p>
            )}
            {coach.bio && <p className="text-slate-600 mt-2">{coach.bio}</p>}
          </div>
        )}
      </section>

      {coach.hourlyRate && (
        <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Payments
          </h2>
          {connectStatusSyncing ? (
            <p className="text-slate-500 text-sm">Checking payment setup…</p>
          ) : coach.stripeOnboardingComplete ? (
            <p className="text-slate-600 text-sm flex items-center gap-2">
              <span className="text-emerald-600 font-medium">Payments set up</span>
              You’ll receive session payments after the platform fee.
            </p>
          ) : (
            <>
              <p className="text-slate-600 text-sm mb-3">
                Set up Stripe to receive payments when athletes book sessions. You’ll be charged only when you mark a session complete.
              </p>
              <button
                type="button"
                onClick={() => connectAccountLinkMutation.mutate()}
                disabled={connectAccountLinkMutation.isPending}
                className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {connectAccountLinkMutation.isPending ? "Redirecting…" : "Set up payments"}
              </button>
              {connectAccountLinkMutation.isError && (
                <p className="text-red-600 text-sm mt-2" role="alert">
                  {connectAccountLinkMutation.error instanceof Error
                    ? connectAccountLinkMutation.error.message
                    : "Failed to start setup."}
                </p>
              )}
            </>
          )}
        </section>
      )}

      <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Profile photos
        </h2>
        <p className="text-slate-600 text-sm mb-4">
          Upload a photo or add an image URL. These appear on your public profile.
        </p>
        {uploadError && (
          <p className="text-red-600 text-sm mb-2" role="alert">{uploadError}</p>
        )}
        {savePhotosMutation.isError && (
          <p className="text-red-600 text-sm mb-2" role="alert">
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
                    className="bg-red-500/90 text-white rounded-full w-6 h-6 inline-flex items-center justify-center p-0 hover:bg-red-600"
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
  );
}
