import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ONBOARDING_BASE } from "@/config/onboarding";
import SessionPricingEditor from "@/components/SessionPricingEditor";

interface CoachMeData {
  hourlyRate?: string | null;
  groupRates?: Record<string, number> | null;
}

export default function OnboardingPricing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hourlyRate, setHourlyRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [pendingGroupRates, setPendingGroupRates] = useState<Record<string, number> | null>(null);

  const { data: coach } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: () => api<CoachMeData>("/coaches/me"),
  });

  useEffect(() => {
    if (coach?.hourlyRate && !hourlyRate) {
      setHourlyRate(coach.hourlyRate);
    }
  }, [coach?.hourlyRate, hourlyRate]);

  const rateNum = parseFloat(hourlyRate);
  const hasValidRate = !!hourlyRate && rateNum > 0 && Number.isFinite(rateNum);

  const handleSaveGroupRates = async (rates: Record<string, number>) => {
    if (!hasValidRate) {
      setRateError("Please set your hourly rate first.");
      setPendingGroupRates(rates);
      return;
    }
    setRateError(null);
    setSaving(true);
    try {
      await api("/coaches/me", {
        method: "PUT",
        body: JSON.stringify({ hourlyRate: rateNum, groupRates: rates }),
      });
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      navigate(`${ONBOARDING_BASE}/credentials`, { replace: true });
    } catch {
      // Non-blocking
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (hasValidRate) {
      try {
        await api("/coaches/me", {
          method: "PUT",
          body: JSON.stringify({ hourlyRate: rateNum }),
        });
        queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      } catch {
        // Non-blocking
      }
    }
    navigate(`${ONBOARDING_BASE}/credentials`, { replace: true });
  };

  const effectiveRate = hasValidRate ? hourlyRate : "0";

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
        Pricing
      </h1>
      <p className="text-slate-600 mb-6">
        Set your hourly rate and optional group discounts. When you allow multiple athletes in a
        time slot, each athlete pays less as more join — encouraging group bookings and maximizing your earnings.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Hourly rate ($) <span className="text-danger-500">*</span>
        </label>
        <p className="text-xs text-slate-500 mb-2">
          This is your base rate for a 1-on-1 session. Group rates below are calculated from this.
        </p>
        <input
          type="number"
          min={1}
          step="any"
          value={hourlyRate}
          onChange={(e) => {
            setHourlyRate(e.target.value);
            setRateError(null);
          }}
          required
          className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-lg"
          placeholder="75"
        />
        {rateError && (
          <p className="text-danger-600 text-sm mt-1">{rateError}</p>
        )}
      </div>

      {hasValidRate && (
        <SessionPricingEditor
          groupRates={pendingGroupRates ?? coach?.groupRates ?? null}
          hourlyRate={effectiveRate}
          onSave={handleSaveGroupRates}
          saving={saving}
          showExplanation
          defaultEditing
          hideCancelButton
          saveLabel="Save & continue"
        />
      )}

      {!hasValidRate && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
          Enter your hourly rate above to configure group pricing.
        </div>
      )}

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={handleSkip}
          className="text-slate-500 hover:text-slate-700 text-sm font-medium"
        >
          {hasValidRate ? "Skip group pricing — I'll set this up later" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}
