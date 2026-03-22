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

      {/* One column per step: [line][circle][line] so circles + labels share the same column */}
      <div className="flex w-full items-start">
        {ONBOARDING_STEPS.map((step, i) => (
          <div key={step.path} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center" aria-hidden>
              {/* Left connector / spacer — keeps circle centered in this step&apos;s column */}
              <div className="flex min-w-0 flex-1 items-center">
                {i > 0 ? (
                  <div
                    className={`h-0.5 w-full rounded-full transition-colors duration-300 ${
                      i - 1 < currentIndex ? "bg-brand-500" : "bg-slate-200"
                    }`}
                  />
                ) : (
                  <div className="h-0.5 w-full" />
                )}
              </div>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  i < currentIndex
                    ? "bg-brand-500 text-white"
                    : i === currentIndex
                      ? "bg-brand-500 text-white ring-4 ring-brand-500/20"
                      : "bg-slate-200 text-slate-400"
                }`}
              >
                {i < currentIndex ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className="flex min-w-0 flex-1 items-center">
                {i < total - 1 ? (
                  <div
                    className={`h-0.5 w-full rounded-full transition-colors duration-300 ${
                      i < currentIndex ? "bg-brand-500" : "bg-slate-200"
                    }`}
                  />
                ) : (
                  <div className="h-0.5 w-full" />
                )}
              </div>
            </div>
            {/* Label directly under this step&apos;s circle (same column) */}
            <span
              className={`mt-2 hidden max-w-full px-0.5 text-center text-xs transition-colors md:block ${
                i <= currentIndex ? "font-semibold text-slate-700" : "text-slate-400"
              }`}
            >
              {step.stepLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
