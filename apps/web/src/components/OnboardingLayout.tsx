import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import OnboardingStepTracker from "./OnboardingStepTracker";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function OnboardingLayout() {
  const { pathname } = useLocation();
  const { data: currentUser, isLoading } = useCurrentUser(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  if (!isLoading && currentUser) {
    const isCoach = currentUser.signupRole === "coach" || !!currentUser.coachProfile;
    if (!isCoach) {
      const dest = currentUser.athleteProfile ? "/athlete" : "/welcome";
      return <Navigate to={dest} replace />;
    }
  }

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
