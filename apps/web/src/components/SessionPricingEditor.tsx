import { useState, useEffect } from "react";
import { Users } from "lucide-react";

interface SessionPricingEditorProps {
  groupRates: Record<string, number> | null;
  hourlyRate: string;
  onSave: (rates: Record<string, number>) => void;
  saving: boolean;
  maxTiers?: number;
  showExplanation?: boolean;
  /** Start in editing mode (useful for onboarding) */
  defaultEditing?: boolean;
  /** Hide the cancel button (useful for onboarding) */
  hideCancelButton?: boolean;
  /** Custom save button label */
  saveLabel?: string;
}

const MAX_GROUP_TIERS = 6;
const DEFAULT_VISIBLE_TIERS = 2; // 2 athletes, 3+ athletes

function defaultRate(baseRate: number, size: number): number {
  return Math.round(baseRate * Math.pow(0.85, size - 1));
}

export default function SessionPricingEditor({
  groupRates,
  hourlyRate,
  onSave,
  saving,
  maxTiers = MAX_GROUP_TIERS,
  showExplanation = false,
  defaultEditing = false,
  hideCancelButton = false,
  saveLabel,
}: SessionPricingEditorProps) {
  const [editing, setEditing] = useState(defaultEditing);
  const [rates, setRates] = useState<{ size: number; rate: string }[]>([]);

  const baseRate = parseFloat(hourlyRate) || 0;
  const effectiveMaxTiers = Math.min(maxTiers, MAX_GROUP_TIERS);

  useEffect(() => {
    if (groupRates && typeof groupRates === "object" && Object.keys(groupRates).length > 1) {
      const entries = Object.entries(groupRates)
        .filter(([k]) => parseInt(k) >= 2)
        .map(([k, v]) => ({ size: parseInt(k), rate: String(v) }))
        .sort((a, b) => a.size - b.size);
      if (entries.length > 0) {
        setRates(entries);
        return;
      }
    }
    // Default: 2 tiers (2 athletes, 3+ athletes)
    setRates([
      { size: 2, rate: String(defaultRate(baseRate, 2)) },
      { size: 3, rate: String(defaultRate(baseRate, 3)) },
    ]);
  }, [groupRates, baseRate]);

  const canAddTier = rates.length < effectiveMaxTiers;

  const addTier = () => {
    if (!canAddTier) return;
    setRates((prev) => {
      const newRates: { size: number; rate: string }[] = [];
      for (let i = 0; i < prev.length; i++) {
        newRates.push({ size: i + 2, rate: prev[i].rate });
      }
      newRates.push({ size: newRates.length + 2, rate: String(defaultRate(baseRate, newRates.length + 2)) });
      return newRates;
    });
  };

  const removeTier = (idx: number) => {
    if (rates.length <= DEFAULT_VISIBLE_TIERS) return;
    setRates((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      // Renumber sequentially from 2
      return updated.map((r, i) => ({ ...r, size: i + 2 }));
    });
  };

  const handleSave = () => {
    const result: Record<string, number> = { "1": baseRate };
    for (const r of rates) {
      const val = parseFloat(r.rate);
      if (r.size >= 2 && val > 0) result[String(r.size)] = val;
    }
    onSave(result);
    if (!defaultEditing) setEditing(false);
  };

  const hasGroupRates = groupRates && Object.keys(groupRates).length > 1;

  // Read-only display
  if (!editing) {
    const displayEntries = groupRates
      ? Object.entries(groupRates)
          .filter(([k]) => parseInt(k) >= 2)
          .map(([k, v]) => ({ size: parseInt(k), rate: v }))
          .sort((a, b) => a.size - b.size)
      : [];
    return (
      <section className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-500" />
            <h3 className="text-sm font-bold text-slate-900">Session Pricing</h3>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand-600 hover:text-brand-700 text-sm font-medium"
          >
            {hasGroupRates ? "Edit" : "Set up pricing"}
          </button>
        </div>
        {hasGroupRates && displayEntries.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600">
              <span>1 athlete (solo)</span>
              <span className="font-medium">${baseRate}/hr</span>
            </div>
            {displayEntries.map((entry, idx) => {
              const isLast = idx === displayEntries.length - 1;
              return (
                <div key={entry.size} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg bg-brand-50/50 text-brand-700">
                  <span>{entry.size}{isLast ? "+" : ""} athletes</span>
                  <span className="font-medium">
                    ${entry.rate}/hr each
                    {entry.rate < baseRate && (
                      <span className="text-xs text-success-600 ml-1.5">
                        ({Math.round(((baseRate - entry.rate) / baseRate) * 100)}% off)
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-800">
              <strong>No group pricing set.</strong> Athletes booking group sessions will pay the full solo rate (${baseRate}/hr).
              Set up discounted rates to encourage group bookings.
            </p>
          </div>
        )}
      </section>
    );
  }

  // Editing mode
  return (
    <section className="p-4 sm:p-5 bg-white rounded-2xl border-2 border-brand-200 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5 text-brand-500" />
        <h3 className="text-sm font-bold text-slate-900">Session Pricing</h3>
      </div>

      {showExplanation && (
        <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 mb-4">
          <p className="text-sm text-brand-800">
            When you allow multiple athletes in a session, each athlete pays a per-person rate that drops as more join.
            Set your discounted rates below — the last tier applies to any group of that size or larger.
          </p>
        </div>
      )}

      <p className="text-xs text-slate-500 mb-4">
        Set per-person rates for each group size. The last tier rate applies to that size and above.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50 text-slate-600">
          <span className="font-medium">1 athlete (solo)</span>
          <span className="font-semibold">${baseRate}/hr</span>
        </div>

        {rates.map((r, idx) => {
          const isLast = idx === rates.length - 1;
          const rateNum = parseFloat(r.rate);
          const discount = rateNum > 0 && rateNum < baseRate
            ? Math.round(((baseRate - rateNum) / baseRate) * 100)
            : 0;
          return (
            <div key={idx} className="flex items-center gap-2 px-1">
              <span className="text-sm text-slate-600 w-28 shrink-0 font-medium">
                {r.size}{isLast ? "+" : ""} athletes
              </span>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  value={r.rate}
                  onChange={(e) => {
                    const updated = [...rates];
                    updated[idx] = { ...r, rate: e.target.value };
                    setRates(updated);
                  }}
                  className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
                  min={1}
                  step={1}
                />
                <span className="text-slate-400 text-sm">/hr each</span>
              </div>
              {discount > 0 && (
                <span className="text-xs text-success-600 font-medium shrink-0">
                  {discount}% off
                </span>
              )}
              {rates.length > DEFAULT_VISIBLE_TIERS && (
                <button
                  type="button"
                  onClick={() => removeTier(idx)}
                  className="p-1 text-slate-400 hover:text-red-500 text-lg leading-none"
                  aria-label="Remove tier"
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
        <div>
          {canAddTier && (
            <button type="button" onClick={addTier} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              + Add tier
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {!hideCancelButton && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
          >
            {saving ? "Saving…" : (saveLabel ?? "Save Pricing")}
          </button>
        </div>
      </div>
    </section>
  );
}
