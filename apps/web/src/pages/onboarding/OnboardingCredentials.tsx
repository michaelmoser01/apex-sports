import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ONBOARDING_BASE } from "@/config/onboarding";

export default function OnboardingCredentials() {
  const navigate = useNavigate();
  const [yearsExperience, setYearsExperience] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [certInput, setCertInput] = useState("");
  const [playingExperience, setPlayingExperience] = useState("");
  const [education, setEducation] = useState("");
  const [saving, setSaving] = useState(false);

  const hasAnyData = !!(
    yearsExperience ||
    certifications.length > 0 ||
    playingExperience.trim() ||
    education.trim()
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/coaches/me/credentials", {
        method: "PUT",
        body: JSON.stringify({
          certifications,
          yearsExperience: yearsExperience ? parseInt(yearsExperience, 10) : null,
          playingExperience,
          education,
        }),
      });
    } catch {
      // Non-blocking: credentials are optional
    }
    setSaving(false);
    navigate(`${ONBOARDING_BASE}/about`, { replace: true });
  };

  const handleSkip = () => {
    navigate(`${ONBOARDING_BASE}/about`, { replace: true });
  };

  const addCert = () => {
    const trimmed = certInput.trim();
    if (trimmed && !certifications.includes(trimmed)) {
      setCertifications((prev) => [...prev, trimmed]);
      setCertInput("");
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
        Credentials & Experience
      </h1>
      <p className="text-slate-600 mb-6">
        Add your coaching credentials. This helps athletes trust you and will be used to write your bio. All fields are optional.
      </p>

      <div className="space-y-5">
        {/* Years of experience */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Years of coaching experience
          </label>
          <input
            type="number"
            min={0}
            max={80}
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="e.g. 10"
          />
        </div>

        {/* Certifications */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Certifications
          </label>
          {certifications.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {certifications.map((cert) => (
                <span
                  key={cert}
                  className="inline-flex items-center gap-1 text-sm bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200"
                >
                  {cert}
                  <button
                    type="button"
                    onClick={() => setCertifications((prev) => prev.filter((c) => c !== cert))}
                    className="text-brand-400 hover:text-brand-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={certInput}
              onChange={(e) => setCertInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCert();
                }
              }}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="e.g. USSF Licensed, NASM CPT"
            />
            <button
              type="button"
              onClick={addCert}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 font-medium"
            >
              Add
            </button>
          </div>
        </div>

        {/* Playing experience */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Playing experience
          </label>
          <textarea
            value={playingExperience}
            onChange={(e) => setPlayingExperience(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            placeholder="e.g. Played D1 soccer at UC Berkeley, 3 years semi-pro"
            maxLength={500}
          />
        </div>

        {/* Education */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Education
          </label>
          <textarea
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            placeholder="e.g. BS in Kinesiology, Stanford University"
            maxLength={500}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : hasAnyData ? "Save & Continue" : "Continue"}
        </button>
        {hasAnyData && (
          <button
            type="button"
            onClick={handleSkip}
            className="px-6 py-2.5 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
