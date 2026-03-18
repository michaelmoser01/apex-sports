import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { MapPin, X, Navigation } from "lucide-react";
import { StarRating } from "@/components/StarRating";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthenticator } from "@aws-amplify/ui-react";

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
  credentials?: Credentials;
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

interface AthleteServiceArea {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const SEARCH_DEBOUNCE_MS = 400;
const RADIUS_OPTIONS = [10, 25, 50, 100];

const SORT_OPTIONS = [
  { value: "best_match", label: "Best Match" },
  { value: "rating", label: "Highest Rated" },
  { value: "reviews", label: "Most Reviews" },
  { value: "price_asc", label: "Lowest Price" },
  { value: "price_desc", label: "Highest Price" },
  { value: "distance", label: "Closest" },
] as const;

export default function Coaches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sport = searchParams.get("sport") ?? "";
  const q = searchParams.get("q") ?? "";
  const lat = searchParams.get("lat") ?? "";
  const lng = searchParams.get("lng") ?? "";
  const radius = searchParams.get("radius") ?? "25";
  const sortParam = searchParams.get("sort") ?? "best_match";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);

  const [searchInput, setSearchInput] = useState(q);
  const [locationLabel, setLocationLabel] = useState("");
  const [selectedRadius, setSelectedRadius] = useState(Number(radius) || 25);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const lastSyncedQ = useRef(q);
  const locationInitialized = useRef(false);

  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";

  // Fetch athlete's saved service area for auto-location
  const { data: athleteServiceArea } = useQuery({
    queryKey: ["athlete-service-area"],
    queryFn: () => api<AthleteServiceArea | null>("/athletes/me/service-area"),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: favoriteData } = useQuery({
    queryKey: ["favoriteIds"],
    queryFn: () => api<{ ids: string[] }>("/athletes/me/favorites/ids"),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
  const favoriteIds = new Set(favoriteData?.ids ?? []);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      if (g) setGoogleReady(true);
    });
  }, []);

  // Smart location detection: profile first, browser fallback
  useEffect(() => {
    if (locationInitialized.current) return;
    if (lat && lng) {
      locationInitialized.current = true;
      return;
    }

    // Wait for athlete area query to settle before falling back to browser
    if (isAuthenticated && athleteServiceArea === undefined) return;

    if (athleteServiceArea) {
      locationInitialized.current = true;
      setLocationLabel(athleteServiceArea.label);
      if (locationInputRef.current) locationInputRef.current.value = athleteServiceArea.label;
      updateParams({
        lat: String(athleteServiceArea.latitude),
        lng: String(athleteServiceArea.longitude),
        radius: String(selectedRadius),
        page: 1,
      });
      return;
    }

    // Browser geolocation fallback
    locationInitialized.current = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationLabel("Near you");
          if (locationInputRef.current) locationInputRef.current.value = "Near you";
          updateParams({
            lat: String(pos.coords.latitude),
            lng: String(pos.coords.longitude),
            radius: String(selectedRadius),
            page: 1,
          });
        },
        () => { /* User denied or error — leave location empty */ }
      );
    }
  }, [lat, lng, isAuthenticated, athleteServiceArea]);

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
    (updates: { sport?: string; lat?: string; lng?: string; radius?: string; q?: string; sort?: string; page?: number }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, val] of Object.entries(updates)) {
          if (val !== undefined && val !== "" && val !== "0") {
            if (key === "page" && Number(val) <= 1) {
              next.delete("page");
            } else if (key === "sort" && val === "best_match") {
              next.delete("sort");
            } else {
              next.set(key, String(val));
            }
          } else {
            next.delete(key);
          }
        }
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
  if (sortParam && sortParam !== "best_match") params.set("sort", sortParam);
  params.set("page", String(page));
  params.set("limit", String(DEFAULT_LIMIT));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["coaches", sport, lat, lng, radius, q, sortParam, page],
    queryFn: () => api<CoachesListResponse>(`/coaches?${params.toString()}`),
  });

  const coaches = data?.coaches ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? DEFAULT_LIMIT;
  const currentPage = data?.page ?? page;
  const hasFilters = !!(sport || lat || q);
  const hasLocation = !!(lat && lng);
  const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, total);
  const totalPages = Math.ceil(total / limit);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: searchInput.trim() || undefined, page: 1 });
  };

  const handleRadiusChange = (newRadius: number) => {
    setSelectedRadius(newRadius);
    if (lat && lng) {
      updateParams({ radius: String(newRadius), page: 1 });
    }
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
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-6">Find a Coach</h1>

      {/* ── Sport Pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-4 px-4 scrollbar-hide">
        <button
          type="button"
          onClick={() => updateParams({ sport: "", page: 1 })}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            !sport
              ? "bg-brand-500 text-white shadow-sm"
              : "bg-white text-slate-700 border border-slate-300 hover:border-brand-300 hover:text-brand-600"
          }`}
        >
          All
        </button>
        {ALLOWED_SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => updateParams({ sport: sport === s ? "" : s, page: 1 })}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              sport === s
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-300 hover:border-brand-300 hover:text-brand-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Search & Filters ── */}
      <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          {/* Row 1: Text search */}
          <div className="flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or bio..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {/* Row 2: Location, Distance, Sort */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px] relative">
              <div className="relative">
                {locationLabel === "Near you" ? (
                  <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-500 pointer-events-none" />
                ) : (
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                )}
                <input
                  ref={locationInputRef}
                  type="text"
                  defaultValue={locationLabel}
                  placeholder="City or location..."
                  className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm"
                />
                {hasLocation && (
                  <button
                    type="button"
                    onClick={clearLocation}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear location"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <select
              value={selectedRadius}
              onChange={(e) => handleRadiusChange(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>Within {r} mi</option>
              ))}
            </select>
            <select
              value={sortParam}
              onChange={(e) => updateParams({ sort: e.target.value, page: 1 })}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {SORT_OPTIONS.filter((o) => o.value !== "distance" || hasLocation).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
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
              Clear all filters
            </button>
          </p>
        )}
      </div>

      {/* ── Results ── */}
      {isLoading ? (
        <p className="text-slate-500">Loading coaches...</p>
      ) : (
        <>
          <p className="text-slate-500 text-sm mb-4">
            {total === 0
              ? "No coaches found."
              : `Showing ${start}–${end} of ${total} coach${total === 1 ? "" : "es"}`}
          </p>
          {total === 0 && hasFilters && (
            <p className="text-slate-500 mb-6">
              Try clearing filters or searching a different location.
            </p>
          )}

          {/* ── Coach Cards ── */}
          <div className="grid gap-4">
            {coaches.map((coach) => {
              const profilePhoto = coach.avatarUrl ?? coach.photos?.[0]?.url;
              const areaLabels = coach.serviceAreas?.length
                ? coach.serviceAreas.map((a) => a.label).join(", ")
                : coach.serviceCities?.length
                  ? coach.serviceCities.join(", ")
                  : null;

              const creds = coach.credentials;
              const credBadges: string[] = [];
              if (creds?.yearsExperience != null && creds.yearsExperience > 0) {
                credBadges.push(`${creds.yearsExperience} yrs exp`);
              }
              if (creds?.certifications?.length) {
                credBadges.push(...creds.certifications.slice(0, 2 - credBadges.length));
              }

              return (
                <Link
                  key={coach.id}
                  to={`/coaches/${coach.id}`}
                  className="block p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 hover:border-brand-200 hover:shadow-md transition overflow-hidden"
                >
                  <div className="flex gap-4">
                    {/* Photo */}
                    <div className="shrink-0">
                      {profilePhoto ? (
                        <img
                          src={profilePhoto}
                          alt=""
                          className="h-20 w-20 sm:h-24 sm:w-24 object-cover rounded-xl border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-2xl font-bold">
                          {(coach.displayName ?? "C").charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                            {coach.displayName}
                            {coach.verified && (
                              <span className="ml-2 text-xs bg-success-100 text-success-700 px-2 py-0.5 rounded-full font-semibold ring-1 ring-success-600/10 align-middle">
                                Verified
                              </span>
                            )}
                          </h2>
                          <p className="text-brand-600 font-medium text-sm">
                            {coach.sports?.length ? coach.sports.join(", ") : "—"}
                          </p>
                        </div>
                        <div className="flex items-start gap-1 shrink-0">
                          {coach.hourlyRate && (
                            <p className="font-bold text-slate-900 text-lg">
                              ${coach.hourlyRate}<span className="text-sm font-normal text-slate-500">/hr</span>
                            </p>
                          )}
                          {isAuthenticated && (
                            <FavoriteButton
                              coachProfileId={coach.id}
                              isFavorite={favoriteIds.has(coach.id)}
                              size="sm"
                            />
                          )}
                        </div>
                      </div>

                      {/* Credential badges */}
                      {credBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {credBadges.map((badge) => (
                            <span
                              key={badge}
                              className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium border border-brand-200"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Playing experience / Education one-liner */}
                      {(creds?.playingExperience?.trim() || creds?.education?.trim()) && (
                        <p className="text-slate-500 text-xs mt-1 truncate hidden sm:block">
                          {[creds.playingExperience?.trim(), creds.education?.trim()].filter(Boolean).join(" · ")}
                        </p>
                      )}

                      {/* Location */}
                      {areaLabels && (
                        <p className="text-slate-500 text-xs sm:text-sm mt-1.5 flex items-center gap-1 truncate">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{areaLabels}</span>
                        </p>
                      )}

                      {/* Rating + Distance row */}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {coach.reviewCount > 0 && (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <StarRating rating={coach.averageRating ?? 0} className="text-sm" />
                            <span className="text-slate-500">
                              {coach.averageRating?.toFixed(1)} ({coach.reviewCount})
                            </span>
                          </span>
                        )}
                        {coach.distanceMiles != null && (
                          <span className="text-sm text-brand-600 font-medium">
                            {coach.distanceMiles < 1 ? "< 1" : coach.distanceMiles} mi away
                          </span>
                        )}
                      </div>

                      {/* Bio snippet */}
                      {coach.bio && (() => {
                        const plain = coach.bio
                          .replace(/#{1,6}\s*/g, "")
                          .replace(/\*\*/g, "")
                          .replace(/[-*•]\s+/g, " ")
                          .replace(/\n+/g, " ")
                          .replace(/\s{2,}/g, " ")
                          .trim();
                        if (!plain) return null;
                        const snippet = plain.length > 150 ? plain.slice(0, 150).trimEnd() + "…" : plain;
                        return (
                          <p className="text-slate-600 text-sm mt-2 line-clamp-2 hidden sm:block">
                            {snippet}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => updateParams({ page: currentPage - 1 })}
                disabled={currentPage <= 1 || isFetching}
                className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-sm disabled:opacity-50 disabled:pointer-events-none hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="text-slate-600 text-sm px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => updateParams({ page: currentPage + 1 })}
                disabled={currentPage >= totalPages || isFetching}
                className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-sm disabled:opacity-50 disabled:pointer-events-none hover:bg-slate-50"
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
