import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { MapPin } from "lucide-react";

interface ServiceArea {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

interface CoachPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

interface Coach {
  id: string;
  displayName: string;
  sports: string[];
  serviceCities: string[];
  serviceAreas?: ServiceArea[];
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  photos?: CoachPhoto[];
  reviewCount: number;
  averageRating: number | null;
  distanceMiles?: number;
}

interface CoachesListResponse {
  coaches: Coach[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const SEARCH_DEBOUNCE_MS = 400;
const RADIUS_OPTIONS = [10, 25, 50, 100];

export default function Coaches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sport = searchParams.get("sport") ?? "";
  const q = searchParams.get("q") ?? "";
  const lat = searchParams.get("lat") ?? "";
  const lng = searchParams.get("lng") ?? "";
  const radius = searchParams.get("radius") ?? "25";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);

  const [searchInput, setSearchInput] = useState(q);
  const [locationLabel, setLocationLabel] = useState("");
  const [selectedRadius, setSelectedRadius] = useState(Number(radius) || 25);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const lastSyncedQ = useRef(q);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      if (g) setGoogleReady(true);
    });
  }, []);

  useEffect(() => {
    if (!googleReady || !window.google || !locationInputRef.current || autocompleteRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(locationInputRef.current, {
      types: ["(cities)"],
      fields: ["formatted_address", "geometry", "name"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      const label = place.formatted_address ?? place.name ?? "";
      setLocationLabel(label);
      updateParams({
        lat: String(place.geometry.location.lat()),
        lng: String(place.geometry.location.lng()),
        radius: String(selectedRadius),
        page: 1,
      });
    });
    autocompleteRef.current = ac;
  }, [googleReady]);

  useEffect(() => {
    setSearchInput(q);
    lastSyncedQ.current = q;
  }, [q]);

  const updateParams = useCallback(
    (updates: { sport?: string; lat?: string; lng?: string; radius?: string; q?: string; page?: number }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, val] of Object.entries(updates)) {
          if (val !== undefined && val !== "" && val !== "0") {
            if (key === "page" && Number(val) <= 1) {
              next.delete("page");
            } else {
              next.set(key, String(val));
            }
          } else {
            next.delete(key);
          }
        }
        // Clean up legacy city param
        next.delete("city");
        return next;
      });
    },
    [setSearchParams]
  );

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === lastSyncedQ.current) return;
    const t = setTimeout(() => {
      lastSyncedQ.current = trimmed;
      updateParams({ q: trimmed || undefined, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, updateParams]);

  const params = new URLSearchParams();
  if (sport) params.set("sport", sport);
  if (lat && lng) {
    params.set("lat", lat);
    params.set("lng", lng);
    params.set("radius", radius);
  }
  if (q) params.set("q", q);
  params.set("page", String(page));
  params.set("limit", String(DEFAULT_LIMIT));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["coaches", sport, lat, lng, radius, q, page],
    queryFn: () => api<CoachesListResponse>(`/coaches?${params.toString()}`),
  });

  const coaches = data?.coaches ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? DEFAULT_LIMIT;
  const currentPage = data?.page ?? page;
  const hasFilters = !!(sport || lat || q);
  const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, total);
  const totalPages = Math.ceil(total / limit);

  const handleSportChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateParams({ sport: e.target.value || undefined, page: 1 });
  };

  const handleRadiusChange = (newRadius: number) => {
    setSelectedRadius(newRadius);
    if (lat && lng) {
      updateParams({ radius: String(newRadius), page: 1 });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: searchInput.trim() || undefined, page: 1 });
  };

  const clearFilters = () => {
    setSearchInput("");
    setLocationLabel("");
    if (locationInputRef.current) locationInputRef.current.value = "";
    setSearchParams(new URLSearchParams());
  };

  const clearLocation = () => {
    setLocationLabel("");
    if (locationInputRef.current) locationInputRef.current.value = "";
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("lat");
      next.delete("lng");
      next.delete("radius");
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-6">Find a Coach</h1>

      <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="coach-search" className="block text-sm font-medium text-slate-700 mb-1">
                Search name or bio
              </label>
              <input
                id="coach-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Type to search..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="w-40">
              <label htmlFor="coach-sport" className="block text-sm font-medium text-slate-700 mb-1">
                Sport
              </label>
              <select
                id="coach-sport"
                value={sport}
                onChange={handleSportChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Any</option>
                {ALLOWED_SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] relative">
              <label htmlFor="coach-location" className="block text-sm font-medium text-slate-700 mb-1">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  ref={locationInputRef}
                  id="coach-location"
                  type="text"
                  defaultValue={locationLabel}
                  placeholder="Search for a city..."
                  className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg"
                />
                {lat && (
                  <button
                    type="button"
                    onClick={clearLocation}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear location"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="w-36">
              <label htmlFor="coach-radius" className="block text-sm font-medium text-slate-700 mb-1">
                Distance
              </label>
              <select
                id="coach-radius"
                value={selectedRadius}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>Within {r} mi</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600"
            >
              Search
            </button>
          </div>
        </form>
        {hasFilters && (
          <p className="mt-2 text-sm text-slate-600">
            <button
              type="button"
              onClick={clearFilters}
              className="text-brand-600 hover:underline font-medium"
            >
              Clear filters
            </button>
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading coaches...</p>
      ) : (
        <>
          <p className="text-slate-600 mb-4">
            {total === 0
              ? "No coaches found."
              : `Showing ${start}–${end} of ${total} coach${total === 1 ? "" : "es"}.`}
          </p>
          {total === 0 && (
            <p className="text-slate-500 mb-6">
              {hasFilters
                ? "Try clearing filters or a different search."
                : "No coaches yet. Be the first to sign up!"}
            </p>
          )}

          <div className="grid gap-6">
            {coaches.length === 0 && !isFetching ? (
              !hasFilters ? (
                <p className="text-slate-500">No coaches yet. Be the first to sign up!</p>
              ) : null
            ) : (
              coaches.map((coach) => {
                const profilePhoto = coach.avatarUrl ?? coach.photos?.[0]?.url;
                const areaLabels = coach.serviceAreas?.length
                  ? coach.serviceAreas.map((a) => a.label).join(", ")
                  : coach.serviceCities?.length
                    ? coach.serviceCities.join(", ")
                    : null;
                return (
                  <Link
                    key={coach.id}
                    to={`/coaches/${coach.id}`}
                    className="block p-6 bg-white rounded-2xl border border-slate-200 hover:border-brand-200 hover:shadow-md transition overflow-hidden"
                  >
                    <div className="flex gap-4">
                      {profilePhoto && (
                        <img
                          src={profilePhoto}
                          alt=""
                          className="h-24 w-24 flex-shrink-0 object-cover rounded-lg border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0 flex justify-between items-start gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">
                            {coach.displayName}
                            {coach.verified && (
                              <span className="ml-2 text-xs bg-success-100 text-success-700 px-2.5 py-0.5 rounded-full font-semibold ring-1 ring-success-600/10">
                                Verified
                              </span>
                            )}
                          </h2>
                          <p className="text-brand-600 font-medium">
                            {coach.sports?.length ? coach.sports.join(", ") : "—"}
                          </p>
                          {areaLabels && (
                            <p className="text-slate-500 text-sm mt-1 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              {areaLabels}
                            </p>
                          )}
                          {coach.bio && (
                            <p className="text-slate-600 mt-2 line-clamp-2">
                              {coach.bio.replace(/#{1,6}\s*/g, "").replace(/\*\*/g, "").trim()}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {coach.hourlyRate && (
                            <p className="font-semibold text-slate-900">
                              ${coach.hourlyRate}/hr
                            </p>
                          )}
                          {coach.distanceMiles != null && (
                            <p className="text-sm text-brand-600 font-medium">
                              {coach.distanceMiles < 1 ? "< 1" : coach.distanceMiles} mi away
                            </p>
                          )}
                          {coach.reviewCount > 0 && (
                            <p className="text-sm text-slate-500">
                              ★ {coach.averageRating?.toFixed(1)} ({coach.reviewCount} reviews)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => updateParams({ page: currentPage - 1 })}
                disabled={currentPage <= 1 || isFetching}
                className="px-4 py-2 border border-slate-300 rounded-lg font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="text-slate-600 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => updateParams({ page: currentPage + 1 })}
                disabled={currentPage >= totalPages || isFetching}
                className="px-4 py-2 border border-slate-300 rounded-lg font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
