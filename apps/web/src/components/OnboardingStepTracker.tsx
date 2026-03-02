import { ONBOARDING_STEPS, getOnboardingStepIndex } from "@/config/onboarding";
import { useLocation } from "react-router-dom";

interface OnboardingStepTrackerProps {
  className?: string;
}

export default function OnboardingStepTracker({ className = "" }: OnboardingStepTrackerProps) {
  const location = useLocation();
  const currentIndex = getOnboardingStepIndex(location.pathname);
  const total = ONBOARDING_STEPS.length;

  return (
    <div className={`flex flex-col items-center gap-2 w-full max-w-xl ${className}`}>
      <p className="text-sm font-medium text-slate-500">
        Step {currentIndex + 1} of {total}
      </p>
      <div className="flex gap-1.5 w-full" aria-hidden>
        {ONBOARDING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-colors flex-1 min-w-0 ${
              i <= currentIndex ? "bg-brand-500" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <div className="hidden md:flex w-full mt-0.5">
        {ONBOARDING_STEPS.map((step, i) => (
          <span
            key={step.path}
            className={`flex-1 min-w-0 text-[11px] text-center transition-colors ${
              i <= currentIndex ? "text-slate-700 font-medium" : "text-slate-400"
            }`}
          >
            {step.stepLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
