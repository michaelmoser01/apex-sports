import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import { searchServiceCities } from "@apex-sports/shared";

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
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  photos?: CoachPhoto[];
  reviewCount: number;
  averageRating: number | null;
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

export default function Coaches() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sport = searchParams.get("sport") ?? "";
  const city = searchParams.get("city") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);

  const [searchInput, setSearchInput] = useState(q);
  const [cityInput, setCityInput] = useState(city);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const lastSyncedQ = useRef(q);

  useEffect(() => {
    setSearchInput(q);
    lastSyncedQ.current = q;
  }, [q]);

  useEffect(() => {
    setCityInput(city);
  }, [city]);

  const updateParams = useCallback(
    (updates: { sport?: string; city?: string; q?: string; page?: number }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (updates.sport !== undefined) {
          if (updates.sport) next.set("sport", updates.sport);
          else next.delete("sport");
        }
        if (updates.city !== undefined) {
          if (updates.city) next.set("city", updates.city);
          else next.delete("city");
        }
        if (updates.q !== undefined) {
          if (updates.q) next.set("q", updates.q);
          else next.delete("q");
        }
        if (updates.page !== undefined) {
          if (updates.page > 1) next.set("page", String(updates.page));
          else next.delete("page");
        }
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
  if (city) params.set("city", city);
  if (q) params.set("q", q);
  params.set("page", String(page));
  params.set("limit", String(DEFAULT_LIMIT));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["coaches", sport, city, q, page],
    queryFn: () => api<CoachesListResponse>(`/coaches?${params.toString()}`),
  });

  const coaches = data?.coaches ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? DEFAULT_LIMIT;
  const currentPage = data?.page ?? page;
  const hasFilters = !!(sport || city || q);
  const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, total);
  const totalPages = Math.ceil(total / limit);

  const handleSportChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    updateParams({ sport: value || undefined, page: 1 });
  };

  const handleCitySelect = (selectedCity: string) => {
    updateParams({ city: selectedCity, page: 1 });
    setCityInput(selectedCity);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
  };

  const handleCityInputChange = (value: string) => {
    setCityInput(value);
    setCitySuggestions(searchServiceCities(value, 10));
    setShowCitySuggestions(true);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: searchInput.trim() || undefined, page: 1 });
  };

  const clearFilters = () => {
    setSearchInput("");
    setCityInput("");
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Find a Coach</h1>

      <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
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
            <div className="w-48 relative">
              <label htmlFor="coach-city" className="block text-sm font-medium text-slate-700 mb-1">
                City
              </label>
              <input
                id="coach-city"
                type="text"
                value={cityInput}
                onChange={(e) => handleCityInputChange(e.target.value)}
                onFocus={() => cityInput && handleCityInputChange(cityInput)}
                onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
                placeholder="e.g. Oakland, CA"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
              {showCitySuggestions && citySuggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                  {citySuggestions.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        onMouseDown={() => handleCitySelect(c)}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
                return (
                  <Link
                    key={coach.id}
                    to={`/coaches/${coach.id}`}
                    className="block p-6 bg-white rounded-xl border border-slate-200 hover:border-brand-200 hover:shadow-md transition overflow-hidden"
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
                          <h2 className="text-lg font-semibold text-slate-900">
                            {coach.displayName}
                            {coach.verified && (
                              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                                Verified
                              </span>
                            )}
                          </h2>
                          <p className="text-brand-600 font-medium">
                            {coach.sports?.length ? coach.sports.join(", ") : "—"}
                          </p>
                          {coach.serviceCities?.length ? (
                            <p className="text-slate-500 text-sm mt-1">
                              {coach.serviceCities.join(", ")}
                            </p>
                          ) : null}
                          {coach.bio && (
                            <p className="text-slate-600 mt-2 line-clamp-2">{coach.bio}</p>
                          )}
                        </div>
                        <div className="text-right">
                          {coach.hourlyRate && (
                            <p className="font-semibold text-slate-900">
                              ${coach.hourlyRate}/hr
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
