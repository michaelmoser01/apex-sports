import { ONBOARDING_STEPS, getOnboardingStepIndex } from "@/config/onboarding";
import { useLocation } from "react-router-dom";
import { Check } from "lucide-react";

interface OnboardingStepTrackerProps {
  className?: string;
}

export default function OnboardingStepTracker({ className = "" }: OnboardingStepTrackerProps) {
  const location = useLocation();
  const currentIndex = getOnboardingStepIndex(location.pathname);
  const total = ONBOARDING_STEPS.length;

  return (
    <div className={`flex flex-col items-center gap-3 w-full max-w-xl ${className}`}>
      <p className="text-sm font-semibold text-slate-700">
        Step {currentIndex + 1} <span className="text-slate-400 font-normal">of {total}</span>
      </p>

      {/* Connected dots progress */}
      <div className="flex items-center w-full gap-0" aria-hidden>
        {ONBOARDING_STEPS.map((_, i) => (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all duration-300 ${
                i < currentIndex
                  ? "bg-brand-500 text-white"
                  : i === currentIndex
                  ? "bg-brand-500 text-white ring-4 ring-brand-500/20"
                  : "bg-slate-200 text-slate-400"
              }`}
            >
              {i < currentIndex ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < total - 1 && (
              <div className="flex-1 h-0.5 mx-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    i < currentIndex ? "bg-brand-500" : "bg-slate-200"
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step labels - desktop only */}
      <div className="hidden md:flex w-full">
        {ONBOARDING_STEPS.map((step, i) => (
          <span
            key={step.path}
            className={`flex-1 min-w-0 text-xs text-center transition-colors ${
              i <= currentIndex ? "text-slate-700 font-semibold" : "text-slate-400"
            }`}
          >
            {step.stepLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
