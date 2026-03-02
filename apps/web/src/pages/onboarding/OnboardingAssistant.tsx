import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ONBOARDING_BASE } from "@/config/onboarding";

const ASSISTANT_CAPABILITIES = [
  { id: "scheduling", label: "Scheduling" },
  { id: "bookings", label: "Bookings" },
  { id: "sessionRecaps", label: "Session recaps" },
  { id: "followUps", label: "Follow-ups" },
] as const;

interface CoachProfile {
  id: string;
  displayName: string;
  phone: string | null;
  assistantDisplayName: string | null;
  assistantPhoneNumber: string | null;
  assistantCapabilities?: Record<string, boolean> | null;
}

export default function OnboardingAssistant() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [coachPhone, setCoachPhone] = useState("");
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({
    scheduling: true,
    bookings: true,
    sessionRecaps: true,
    followUps: true,
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: () => api<CoachProfile>("/coaches/me"),
    retry: false,
  });

  const setupMutation = useMutation({
    mutationFn: (data: {
      displayName: string;
      coachPhone: string;
      capabilities?: Record<string, boolean>;
    }) =>
      api<{ assistantPhoneNumber: string }>("/coaches/me/assistant", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      setAssignedNumber(data?.assistantPhoneNumber ?? "");
    },
  });

  const [assignedNumber, setAssignedNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.assistantPhoneNumber) setAssignedNumber(profile.assistantPhoneNumber);
    if (profile.assistantDisplayName) setDisplayName(profile.assistantDisplayName);
    if (profile.phone) setCoachPhone(profile.phone);
    if (profile.assistantCapabilities && typeof profile.assistantCapabilities === "object") {
      setCapabilities((prev) => ({ ...prev, ...profile.assistantCapabilities }));
    }
  }, [profile]);

  const toggleCapability = (id: string) => {
    setCapabilities((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (profileLoading || !profile) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setupMutation.mutate({
      displayName: displayName.trim(),
      coachPhone: coachPhone.trim(),
      capabilities,
    });
  };

  const handleContinue = () => navigate(`${ONBOARDING_BASE}/plan`, { replace: true });

  const hasNumber = assignedNumber || profile.assistantPhoneNumber;
  const number = assignedNumber ?? profile.assistantPhoneNumber ?? "";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Setup assistant</h1>
      <p className="text-slate-500 text-sm mb-6">
        Give your assistant a name and your phone number. We’ll create a dedicated number for your assistant (same area code when possible). Parents and athletes text this number; your assistant coordinates with you.
      </p>

      {!hasNumber ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assistant name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="e.g. Apex Assistant"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your phone number</label>
            <input
              type="tel"
              value={coachPhone}
              onChange={(e) => setCoachPhone(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="+1 555 123 4567"
            />
            <p className="text-slate-500 text-xs mt-1">For alerts. We’ll use the same area code for your assistant’s number when possible.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">What your assistant will help with</label>
            <div className="space-y-2">
              {ASSISTANT_CAPABILITIES.map(({ id, label }) => (
                <label key={id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!capabilities[id]}
                    onChange={() => toggleCapability(id)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
          {setupMutation.error && (
            <p className="text-red-600 text-sm" role="alert">
              {setupMutation.error instanceof Error ? setupMutation.error.message : "Something went wrong."}
            </p>
          )}
          <button
            type="submit"
            disabled={setupMutation.isPending || !displayName.trim() || !coachPhone.trim()}
            className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
          >
            {setupMutation.isPending ? "Creating number…" : "Get my number"}
          </button>
        </form>
      ) : (
        <>
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm font-medium text-emerald-800 mb-1">This is your assistant’s new number</p>
              <p className="text-lg font-mono text-slate-900 font-semibold">{number}</p>
              <p className="text-slate-600 text-sm mt-2">
                Parents and athletes will text this number. Your assistant handles scheduling, bookings, session recaps, and follow-ups so you can focus on coaching.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 transition mt-6"
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}
