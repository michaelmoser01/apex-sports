/**
 * Athlete profile shape used by GET /auth/me and /athletes/me.
 * Used to decide if an athlete has completed onboarding (and can be sent to coach profile).
 */
export interface AthleteProfileShape {
  displayName: string;
  serviceCity: string | null;
  sports: string[];
  [key: string]: unknown;
}

/**
 * Returns true only when the athlete has completed onboarding:
 * displayName, serviceCity, and at least one sport. Used to avoid
 * sending users with an empty/minimal profile straight to the coach.
 */
export function hasCompletedAthleteOnboarding(
  profile: AthleteProfileShape | null | undefined
): boolean {
  if (!profile) return false;
  const name = typeof profile.displayName === "string" ? profile.displayName.trim() : "";
  const city = typeof profile.serviceCity === "string" ? profile.serviceCity.trim() : "";
  const sports = Array.isArray(profile.sports) ? profile.sports : [];
  return name.length > 0 && city.length > 0 && sports.length > 0;
}
