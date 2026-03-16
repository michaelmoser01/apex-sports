import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import OnboardingStepTracker from "./OnboardingStepTracker";

export default function OnboardingLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-lg py-6">
        <div className="max-w-xl mx-auto px-4">
          <OnboardingStepTracker />
        </div>
      </header>
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
