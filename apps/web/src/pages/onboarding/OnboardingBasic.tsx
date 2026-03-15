import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import { searchServiceCities } from "@apex-sports/shared";
import { ONBOARDING_BASE } from "@/config/onboarding";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function OnboardingBasic() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser(true);
  const { data: existingProfile } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: () => api<{ id: string }>("/coaches/me"),
    retry: (_, err) => (err?.message?.toLowerCase().includes("not found") ? false : true),
  });
  useEffect(() => {
    if (existingProfile?.id) navigate(`${ONBOARDING_BASE}/about`, { replace: true });
  }, [existingProfile?.id, navigate]);

  const [displayName, setDisplayName] = useState("");
  const [sports, setSports] = useState<string[]>([]);
  const [serviceCities, setServiceCities] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const namePrefilled = useRef(false);

  useEffect(() => {
    if (namePrefilled.current || currentUser?.name == null) return;
    namePrefilled.current = true;
    setDisplayName((currentUser.name ?? "").trim());
  }, [currentUser?.name]);

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
  const removeCity = (city: string) => setServiceCities((prev) => prev.filter((c) => c !== city));
  const toggleSport = (sport: string) =>
    setSports((prev) => (prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]));

  const removePhoto = (index: number) => {
    if (index < photoUrls.length) {
      setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
    } else {
      setPendingFiles((prev) => prev.filter((_, i) => i !== index - photoUrls.length));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const trimmed = displayName.trim();
    if (!trimmed || sports.length === 0 || serviceCities.length === 0 || !hourlyRate || parseFloat(hourlyRate) <= 0) return;
    setSubmitting(true);
    try {
      await api("/coaches/me", {
        method: "POST",
        body: JSON.stringify({
          displayName: trimmed,
          sports,
          serviceCities,
          bio: "",
          hourlyRate: parseFloat(hourlyRate),
        }),
      });

      const uploadedUrls: string[] = [];
      for (const file of pendingFiles) {
        const { uploadUrl, url } = await api<{ uploadUrl: string; url: string }>("/coaches/me/photos/presign", {
          method: "POST",
          body: JSON.stringify({ contentType: file.type || "image/jpeg" }),
        });
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "image/jpeg" },
        });
        if (!putRes.ok) throw new Error("Upload failed");
        uploadedUrls.push(url);
      }

      const allUrls = [...photoUrls.map((u) => u.trim()).filter(Boolean), ...uploadedUrls];
      if (allUrls.length > 0) {
        const putRes = await api<{ photos: { id: string; url: string; sortOrder: number }[] }>("/coaches/me", {
          method: "PUT",
          body: JSON.stringify({ photos: allUrls }),
        });
        const firstId = putRes?.photos?.[0]?.id;
        if (firstId) {
          await api("/coaches/me/primary-photo", {
            method: "PATCH",
            body: JSON.stringify({ photoId: firstId }),
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      navigate(`${ONBOARDING_BASE}/about`, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const allPhotoPreviews = [
    ...photoUrls.map((url) => ({ type: "url" as const, url })),
    ...pendingFiles.map((file) => ({ type: "file" as const, file })),
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Basic info</h1>
      <p className="text-slate-500 text-sm mb-6">
        Sports, rate, and where you coach. We’ve pre-filled your name from sign-up—you can change it below. Optionally add a profile photo; the first one will be your main photo.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            placeholder="e.g. John Smith"
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
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-slate-700">{sport}</span>
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
                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-sm text-slate-700"
              >
                {city}
                <button type="button" onClick={() => removeCity(city)} className="text-slate-500 hover:text-slate-700" aria-label={`Remove ${city}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              value={cityInput}
              onChange={(e) => { setCityInput(e.target.value); updateCitySuggestions(e.target.value); }}
              onFocus={() => cityInput && updateCitySuggestions(cityInput)}
              onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="Type to search cities..."
            />
            {showCitySuggestions && citySuggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                {citySuggestions.filter((c) => !serviceCities.includes(c)).map((city) => (
                  <li key={city}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700"
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Hourly rate ($) <span className="text-red-500">*</span></label>
          <input
            type="number"
            min={1}
            step="any"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            placeholder="75"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Profile photo (optional)</label>
          <p className="text-slate-500 text-xs mb-2">The first photo you add will be your main profile photo.</p>
          {allPhotoPreviews.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {allPhotoPreviews.map((item, i) => (
                <div key={i} className="relative group">
                  <img
                    src={item.type === "file" ? URL.createObjectURL(item.file) : item.url}
                    alt=""
                    className="h-20 w-20 object-cover rounded-lg border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' fill='%2394a3b8'%3E%3Crect width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='8'%3EInvalid%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  {i === 0 && (
                    <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium bg-brand-500/90 text-white rounded-b-lg py-0.5" aria-hidden>
                      Main
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0 right-0 bg-red-500/90 text-white rounded-full w-5 h-5 inline-flex items-center justify-center p-0 hover:bg-red-600 text-xs"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              id="basic-photo-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPendingFiles((prev) => [...prev, file]);
                  e.target.value = "";
                }
              }}
            />
            <label
              htmlFor="basic-photo-upload"
              className="cursor-pointer px-3 py-2 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
            >
              Upload photo
            </label>
            <input
              type="url"
              value={newPhotoUrl}
              onChange={(e) => setNewPhotoUrl(e.target.value)}
              placeholder="Or paste image URL"
              className="flex-1 min-w-[160px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => {
                if (newPhotoUrl.trim()) {
                  setPhotoUrls((prev) => [...prev, newPhotoUrl.trim()]);
                  setNewPhotoUrl("");
                }
              }}
              className="bg-slate-200 text-slate-800 px-3 py-2 rounded-lg font-medium hover:bg-slate-300 text-sm"
            >
              Add URL
            </button>
          </div>
        </div>
        {submitError && (
          <p className="text-red-600 text-sm" role="alert">
            {submitError}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !displayName.trim() || sports.length === 0 || serviceCities.length === 0 || !hourlyRate || parseFloat(hourlyRate) <= 0}
          className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
