import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

export default function CoachOnboardingBio() {
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
      api("/coaches/me", {
        method: "PUT",
        body: JSON.stringify({ bio }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      navigate("/dashboard/profile", { replace: true });
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
      const response = await api<{ message: string; bioPreview: string }>(
        "/coaches/me/bio-draft",
        {
          method: "POST",
          body: JSON.stringify(
            mode === "generate" ? { mode: "generate" } : { mode: "enhance", sourceText: text }
          ),
        }
      );
      const draft = response.bioPreview?.trim();
      if (draft) {
        setPreviousBeforeAI(textBefore || null);
        setEditorText(draft);
        setError(null);
      } else {
        setError("No draft was generated. Try adding more detail and click Enhance with AI again.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
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

  const handleSaveToProfile = () => {
    const text = editorText.trim();
    if (!text) return;
    updateBioMutation.mutate(text);
  };

  if (profileLoading || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-slate-500">
          {profileLoading ? "Loading..." : "Profile not found. Create your profile first."}
        </p>
        {!profileLoading && !profile && (
          <button
            type="button"
            onClick={() => navigate("/dashboard/profile")}
            className="mt-4 text-brand-600 font-medium hover:underline"
          >
            ← Back to profile
          </button>
        )}
      </div>
    );
  }

  const canRevert = previousBeforeAI != null && !isLoading;
  const charCount = editorText.length;

  return (
    <div className="min-h-screen bg-slate-100/80 flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            Edit about
          </h1>
          <button
            type="button"
            onClick={() => navigate("/dashboard/profile")}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="px-6 pb-4 text-slate-500 text-sm">
          You can write about your years of experience, who you work with, or your coaching style. People also talk about their achievements or what makes their approach unique.
        </p>

        <div className="px-6 pb-6 space-y-4">
          {/* Text area */}
          <div>
            <textarea
              id="bio-editor"
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              placeholder="Tell us about your coaching—experience, who you work with, what makes your approach unique..."
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
                  aria-label="Write with AI"
                >
                  <span aria-hidden>◆</span> {isLoading ? "Generating…" : "Write with AI"}
                </button>
                {canRevert && (
                  <button
                    type="button"
                    onClick={handleRevert}
                    className="text-sm text-slate-500 hover:text-slate-700"
                    aria-label="Revert"
                  >
                    Revert
                  </button>
                )}
              </div>
              <span className="text-slate-400 text-sm tabular-nums">
                {charCount}/{MAX_ABOUT_CHARS}
              </span>
            </div>
          </div>

          <p className="text-slate-500 text-sm">
            Review and edit the AI draft before saving so it reflects you.
          </p>

          {error && (
            <p className="text-danger-600 text-sm" role="alert">
              {error}
            </p>
          )}

          <p className="text-slate-400 text-xs">
            Your About Me appears formatted on your profile (headings, bold, lists). You can use markdown here if you like.
          </p>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSaveToProfile}
              disabled={!editorText.trim() || updateBioMutation.isPending}
              className="px-6 py-2.5 bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all"
            >
              {updateBioMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
