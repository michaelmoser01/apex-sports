import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  signupRole: string | null;
  coachProfile: {
    id: string;
    displayName: string;
    sports: string[];
    serviceCities: string[];
    bio: string;
    hourlyRate: string | null;
    verified: boolean;
    avatarUrl: string | null;
    phone: string | null;
    /** Friendly slug for public profile URL (same as invite link). Use for /coaches/:slug. */
    inviteSlug?: string | null;
  } | null;
  athleteProfile: {
    id: string;
    displayName: string;
    serviceCity: string | null;
    birthYear: number | null;
    sports: string[];
    level: string | null;
     phone: string | null;
  } | null;
}

export function useCurrentUser(enable: boolean) {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    enabled: enable,
    // Always refetch on mount so switching accounts after sign-out
    // doesn't reuse a "fresh" cached /auth/me from the prior user.
    staleTime: 0,
    refetchOnMount: "always",
  });
}
