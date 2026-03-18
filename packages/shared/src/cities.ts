/**
 * @deprecated Use ServiceArea model with Google Places autocomplete instead.
 * This file is kept for backward compatibility only. All runtime consumers have been migrated.
 */
export const BAY_AREA_CITIES: readonly string[] = [];

export type BayAreaCity = string;

export const ALLOWED_SERVICE_CITIES: readonly string[] = [];

export function searchServiceCities(_query: string, _limit = 20): string[] {
  return [];
}

export function isAllowedServiceCity(_value: string): boolean {
  return true;
}
