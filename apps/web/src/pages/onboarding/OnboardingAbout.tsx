import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ONBOARDING_BASE } from "@/config/onboarding";

const MAX_ABOUT_CHARS = 2600;

interface CoachProfile {
  id: string;
  displayName: string;
  sports: string[];
  serviceCities: string[];
  bio: string;
  hourlyRate: string | null;
  verified: boolean;
  avatarUrl: string | null;
  photos?: { id: string; url: string; sortOrder: number }[];
}

export default function OnboardingAbout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editorText, setEditorText] = useState("");
  const [previousBeforeAI, setPreviousBeforeAI] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPrefilled, setHasPrefilled] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: () => api<CoachProfile>("/coaches/me"),
    retry: (_, err) => (err?.message?.toLowerCase().includes("not found") ? false : true),
  });

  const updateBioMutation = useMutation({
    mutationFn: (bio: string) =>
      api("/coaches/me", { method: "PUT", body: JSON.stringify({ bio }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      navigate(`${ONBOARDING_BASE}/assistant`, { replace: true });
    },
  });

  useEffect(() => {
    if (profileLoading || !profile || hasPrefilled) return;
    setHasPrefilled(true);
    const existingBio = profile.bio?.trim();
    if (existingBio) setEditorText(existingBio);
  }, [profile, profileLoading, hasPrefilled]);

  const handleEnhanceWithAI = async () => {
    setError(null);
    setIsLoading(true);
    const textBefore = editorText;
    try {
      const text = textBefore.trim();
      const mode = text ? "enhance" : "generate";
      const response = await api<{ message: string; bioPreview: string }>("/coaches/me/bio-draft", {
        method: "POST",
        body: JSON.stringify(
          mode === "generate" ? { mode: "generate" } : { mode: "enhance", sourceText: text }
        ),
      });
      const draft = response.bioPreview?.trim();
      if (draft) {
        setPreviousBeforeAI(textBefore || null);
        setEditorText(draft);
        setError(null);
      } else {
        setError("No draft was generated. Try adding more detail and click Write with AI again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevert = () => {
    if (previousBeforeAI != null) {
      setEditorText(previousBeforeAI);
      setPreviousBeforeAI(null);
    }
  };

  const handleSave = () => {
    const text = editorText.trim();
    if (!text) return;
    updateBioMutation.mutate(text);
  };

  if (profileLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }
  if (!profile) {
    navigate(`${ONBOARDING_BASE}/basic`, { replace: true });
    return null;
  }

  const canRevert = previousBeforeAI != null && !isLoading;
  const charCount = editorText.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mb-1">About you</h1>
      <p className="text-slate-500 text-sm mb-6">
        Tell athletes about your experience, who you work with, and your coaching style. Use the AI to draft it, then edit to make it yours.
      </p>
      <div className="space-y-4">
        <div>
          <textarea
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            placeholder="Experience, philosophy, who you work with..."
            maxLength={MAX_ABOUT_CHARS}
            className="w-full min-h-[200px] px-4 py-3 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 resize-y focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            disabled={isLoading}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEnhanceWithAI}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded disabled:opacity-50"
              >
                <span aria-hidden>◆</span> {isLoading ? "Generating…" : "Write with AI"}
              </button>
              {canRevert && (
                <button type="button" onClick={handleRevert} className="text-sm text-slate-500 hover:text-slate-700">
                  Revert
                </button>
              )}
            </div>
            <span className="text-slate-400 text-sm tabular-nums">{charCount}/{MAX_ABOUT_CHARS}</span>
          </div>
        </div>
        {error && <p className="text-danger-600 text-sm" role="alert">{error}</p>}
        <p className="text-slate-400 text-xs">You can use markdown (headings, bold, lists).</p>
        <button
          type="button"
          onClick={handleSave}
          disabled={!editorText.trim() || updateBioMutation.isPending}
          className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all"
        >
          {updateBioMutation.isPending ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
