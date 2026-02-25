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
  } | null;
}

export function useCurrentUser(enable: boolean) {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api<CurrentUser>("/auth/me"),
    enabled: enable,
    staleTime: 60_000,
  });
}
