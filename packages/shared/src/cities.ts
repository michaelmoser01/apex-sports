/**
 * Curated list of Bay Area cities for coach service areas and search.
 * Format: "City, CA" for consistent storage and filtering.
 */
export const BAY_AREA_CITIES: readonly string[] = [
  "Alameda, CA",
  "Albany, CA",
  "Antioch, CA",
  "Atherton, CA",
  "Belmont, CA",
  "Benicia, CA",
  "Berkeley, CA",
  "Brentwood, CA",
  "Brisbane, CA",
  "Burlingame, CA",
  "Campbell, CA",
  "Concord, CA",
  "Colma, CA",
  "Cotati, CA",
  "Cupertino, CA",
  "Daly City, CA",
  "Danville, CA",
  "Dublin, CA",
  "East Palo Alto, CA",
  "El Cerrito, CA",
  "Emeryville, CA",
  "Foster City, CA",
  "Fremont, CA",
  "Gilroy, CA",
  "Half Moon Bay, CA",
  "Hayward, CA",
  "Hercules, CA",
  "Lafayette, CA",
  "Livermore, CA",
  "Los Altos, CA",
  "Los Gatos, CA",
  "Menlo Park, CA",
  "Milpitas, CA",
  "Mill Valley, CA",
  "Millbrae, CA",
  "Morgan Hill, CA",
  "Moraga, CA",
  "Mountain View, CA",
  "Napa, CA",
  "Newark, CA",
  "Novato, CA",
  "Oakland, CA",
  "Orinda, CA",
  "Pacifica, CA",
  "Palo Alto, CA",
  "Petaluma, CA",
  "Piedmont, CA",
  "Pinole, CA",
  "Pittsburg, CA",
  "Pleasanton, CA",
  "Redwood City, CA",
  "Richmond, CA",
  "Rohnert Park, CA",
  "San Bruno, CA",
  "San Francisco, CA",
  "San Jose, CA",
  "San Leandro, CA",
  "San Mateo, CA",
  "San Pablo, CA",
  "San Rafael, CA",
  "San Ramon, CA",
  "Santa Clara, CA",
  "Santa Rosa, CA",
  "Saratoga, CA",
  "Sausalito, CA",
  "Sebastopol, CA",
  "South San Francisco, CA",
  "Sunnyvale, CA",
  "Union City, CA",
  "Vallejo, CA",
  "Walnut Creek, CA",
] as const;

/** Type for a valid Bay Area city string */
export type BayAreaCity = (typeof BAY_AREA_CITIES)[number];

/** Allowed service-area cities (same list for coach selection and search filter) */
export const ALLOWED_SERVICE_CITIES = BAY_AREA_CITIES as readonly string[];

/**
 * Returns cities that match the query (case-insensitive substring on "City" part or full string).
 * Use for autocomplete; empty string returns all (or a slice).
 */
export function searchServiceCities(query: string, limit = 20): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...BAY_AREA_CITIES].slice(0, limit);
  return BAY_AREA_CITIES.filter(
    (city) => city.toLowerCase().includes(q)
  ).slice(0, limit);
}

/** Check if a value is in the allowed list (case-sensitive exact match) */
export function isAllowedServiceCity(value: string): boolean {
  return BAY_AREA_CITIES.includes(value as BayAreaCity);
}
