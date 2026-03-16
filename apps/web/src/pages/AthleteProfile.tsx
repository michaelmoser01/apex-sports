import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS, searchServiceCities } from "@apex-sports/shared";

interface AthleteProfile {
  id: string;
  displayName: string;
  serviceCity: string | null;
  birthYear: number | null;
  sports: string[];
  level: string | null;
  phone: string | null;
}

export default function AthleteProfilePage() {
  const queryClient = useQueryClient();
  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["athleteProfile"],
    queryFn: () => api<AthleteProfile>("/athletes/me"),
  });

  const [displayName, setDisplayName] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [sports, setSports] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [phone, setPhone] = useState("");

  const updateProfileMutation = useMutation({
    mutationFn: (data: {
      displayName: string;
      serviceCity: string;
      birthYear?: number | null;
      sports: string[];
      level?: string | null;
      phone: string;
    }) =>
      api<AthleteProfile>("/athletes/me", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athleteProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const initFromProfile = (p: AthleteProfile) => {
    setDisplayName(p.displayName ?? "");
    setServiceCity(p.serviceCity ?? "");
    setBirthYear(p.birthYear != null ? String(p.birthYear) : "");
    setSports(p.sports ?? []);
    setLevel(p.level ?? "");
    setPhone(p.phone ?? "");
  };

  if (!isLoading && profile && displayName === "" && sports.length === 0 && !serviceCity && !birthYear && !level) {
    initFromProfile(profile);
  }

  const toggleSport = (sport: string) => {
    setSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const updateCitySuggestions = (q: string) => {
    setCitySuggestions(searchServiceCities(q, 10));
    setShowCitySuggestions(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !serviceCity.trim() || sports.length === 0 || !phone.trim()) {
      return;
    }
    const year = birthYear.trim() ? Number(birthYear.trim()) : null;
    const payload: {
      displayName: string;
      serviceCity: string;
      birthYear: number | null;
      sports: string[];
      level?: string;
      phone: string;
    } = {
      displayName: displayName.trim(),
      serviceCity: serviceCity.trim(),
      birthYear: Number.isFinite(year as number) ? (year as number) : null,
      sports,
      phone: phone.trim(),
    };
    if (level.trim()) {
      payload.level = level.trim();
    }
    updateProfileMutation.mutate(payload);
  };

  if (isLoading && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading your athlete profile…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-slate-700 mb-4">Couldn&apos;t load your athlete profile.</p>
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
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Athlete profile</h1>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Home city</label>
          <p className="text-slate-500 text-xs mb-2">
            Choose the main city where you&apos;ll train or meet coaches.
          </p>
          <div className="relative">
            <input
              type="text"
              value={cityInput || serviceCity}
              onChange={(e) => {
                const value = e.target.value;
                setCityInput(value);
                updateCitySuggestions(value);
              }}
              onFocus={() => cityInput && updateCitySuggestions(cityInput)}
              onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="Start typing a city…"
              required
            />
            {showCitySuggestions && citySuggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                {citySuggestions.map((city) => (
                  <li key={city}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      onMouseDown={() => {
                        setServiceCity(city);
                        setCityInput(city);
                        setShowCitySuggestions(false);
                      }}
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

        <button
          type="submit"
          disabled={
            updateProfileMutation.isPending ||
            !displayName.trim() ||
            !serviceCity.trim() ||
            sports.length === 0 ||
            !phone.trim()
          }
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 disabled:opacity-50"
        >
          {updateProfileMutation.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

