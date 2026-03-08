import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { signOut } from "aws-amplify/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { api } from "@/lib/api";
import { getStoredInviteSlug } from "@/pages/Join";

function getAvatarInitial(currentUser: { coachProfile?: { displayName: string } | null; athleteProfile?: { displayName: string } | null; name?: string | null } | null | undefined): string {
  if (!currentUser) return "U";
  const name =
    currentUser.coachProfile?.displayName ??
    currentUser.athleteProfile?.displayName ??
    currentUser.name ??
    "";
  return name.charAt(0).toUpperCase() || "U";
}

function getAvatarUrl(currentUser: { coachProfile?: { avatarUrl: string | null } | null } | null | undefined): string | null {
  return currentUser?.coachProfile?.avatarUrl ?? null;
}

function DevLayout() {
  const { devUser, setDevUser } = useAuth();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const avatarMenuRefMobile = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(!!devUser);

  const handleDevSignOut = () => {
    queryClient.clear();
    setDevUser(null);
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        avatarMenuRef.current?.contains(target) ||
        avatarMenuRefMobile.current?.contains(target)
      )
        return;
      setAvatarMenuOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [avatarMenuOpen]);

  const onAthleteOnboardingWithInvite =
    location.pathname === "/athlete/onboarding" && !!getStoredInviteSlug();
  const redirectToWelcome =
    devUser &&
    !currentUserLoading &&
    location.pathname !== "/welcome" &&
    !onAthleteOnboardingWithInvite &&
    (!currentUser || !currentUser.signupRole);
  const showCoachDashboard = !!currentUser?.coachProfile;
  const showAthleteProfile = !!currentUser?.athleteProfile;
  const signedIn = !!devUser;
  const showFindCoaches = !signedIn || (showAthleteProfile && !showCoachDashboard);
  const showForCoaches = !signedIn;
  const profileTo = showCoachDashboard ? "/dashboard/profile" : showAthleteProfile ? "/athlete/profile" : null;

  if (redirectToWelcome) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold text-slate-900 hover:text-brand-600 transition-colors">
            ApexSports
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {showFindCoaches && (
              <Link
                to="/find"
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Find Coaches
              </Link>
            )}
            {showForCoaches && (
              <Link
                to="/coaches"
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                For Coaches
              </Link>
            )}
            {devUser ? (
              <>
                {showCoachDashboard && (
                  <>
                    <Link
                      to="/dashboard"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/dashboard/availability"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Availability
                    </Link>
                  </>
                )}
                <Link
                  to="/bookings"
                  className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                >
                  Bookings
                </Link>
                {showCoachDashboard && (
                  <Link
                    to="/dashboard/athletes"
                    className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                  >
                    Athletes
                  </Link>
                )}
                <div className="relative" ref={avatarMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAvatarMenuOpen((o) => !o)}
                    className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-200 text-slate-600 font-semibold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                    aria-expanded={avatarMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                  >
                    {getAvatarUrl(currentUser) ? (
                      <img src={getAvatarUrl(currentUser)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getAvatarInitial(currentUser)
                    )}
                  </button>
                  {avatarMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-50">
                      {profileTo && (
                        <Link
                          to={profileTo}
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => setAvatarMenuOpen(false)}
                        >
                          Profile
                        </Link>
                      )}
                      {showCoachDashboard && currentUser?.coachProfile?.id && (
                        <Link
                          to={`/coaches/${currentUser.coachProfile.inviteSlug ?? currentUser.coachProfile.id}`}
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => setAvatarMenuOpen(false)}
                        >
                          View public profile
                        </Link>
                      )}
                      {showCoachDashboard && (
                        <Link
                          to="/dashboard/agent-test"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => setAvatarMenuOpen(false)}
                        >
                          Agent test
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          handleDevSignOut();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/welcome"
                className="rounded-xl bg-brand-500 text-white px-4 py-2.5 font-semibold hover:bg-brand-600 transition-colors shadow-sm"
              >
                Sign in
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            {devUser && (
              <div className="relative mr-1" ref={avatarMenuRefMobile}>
                <button
                  type="button"
                  onClick={() => setAvatarMenuOpen((o) => !o)}
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-200 text-slate-600 font-semibold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  aria-expanded={avatarMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                >
                  {getAvatarUrl(currentUser) ? (
                    <img src={getAvatarUrl(currentUser)!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getAvatarInitial(currentUser)
                  )}
                </button>
                {avatarMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-[60]">
                    {profileTo && (
                      <Link
                        to={profileTo}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => setAvatarMenuOpen(false)}
                      >
                        Profile
                      </Link>
                    )}
                    {showCoachDashboard && currentUser?.coachProfile?.id && (
                      <Link
                        to={`/coaches/${currentUser.coachProfile.inviteSlug ?? currentUser.coachProfile.id}`}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => setAvatarMenuOpen(false)}
                      >
                        View public profile
                      </Link>
                    )}
                    {showCoachDashboard && (
                      <Link
                        to="/dashboard/agent-test"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => setAvatarMenuOpen(false)}
                      >
                        Agent test
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        handleDevSignOut();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 top-16 z-40 bg-black/20 md:hidden"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-white border-b border-slate-200 shadow-lg py-4 px-4">
              <nav className="flex flex-col gap-1">
                {showFindCoaches && (
                  <Link
                    to="/find"
                    className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Find Coaches
                  </Link>
                )}
                {showForCoaches && (
                  <Link
                    to="/coaches"
                    className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    For Coaches
                  </Link>
                )}
                {devUser ? (
                  <>
                    {showCoachDashboard && (
                      <>
                        <Link
                          to="/dashboard"
                          className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                          onClick={() => setMenuOpen(false)}
                        >
                          Dashboard
                        </Link>
                        <Link
                          to="/dashboard/availability"
                          className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                          onClick={() => setMenuOpen(false)}
                        >
                          Availability
                        </Link>
                      </>
                    )}
                    <Link
                      to="/bookings"
                      className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                      onClick={() => setMenuOpen(false)}
                    >
                      Bookings
                    </Link>
                    {showCoachDashboard && (
                      <Link
                        to="/dashboard/athletes"
                        className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                        onClick={() => setMenuOpen(false)}
                      >
                        Athletes
                      </Link>
                    )}
                  </>
                ) : (
                  <Link
                    to="/welcome"
                    className="py-3 px-3 rounded-xl bg-brand-500 text-white font-semibold text-center mt-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                )}
              </nav>
            </div>
          </>
        )}
      </header>
      <main className="flex-1">
        {redirectToWelcome ? <Navigate to="/welcome" replace /> : <Outlet />}
      </main>
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="font-display font-bold text-slate-900">
            ApexSports
          </Link>
          <div className="flex gap-8 text-slate-600 text-sm">
            <Link to="/find" className="hover:text-slate-900 transition-colors">
              Find Coaches
            </Link>
            <Link to="/coaches" className="hover:text-slate-900 transition-colors">
              For Coaches
            </Link>
          </div>
          <p className="text-slate-500 text-sm">
            Verified coaches for athletes
          </p>
        </div>
      </footer>
    </div>
  );
}

function CognitoLayout() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const avatarMenuRefMobile = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isAuthenticated = authStatus === "authenticated";
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(isAuthenticated);
  const queryClient = useQueryClient();
  const setCoachRoleAttempted = useRef(false);

  const setCoachRoleMutation = useMutation({
    mutationFn: () =>
      api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole: "coach" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        avatarMenuRef.current?.contains(target) ||
        avatarMenuRefMobile.current?.contains(target)
      )
        return;
      setAvatarMenuOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [avatarMenuOpen]);

  const isOnOnboarding = location.pathname.startsWith("/coach/onboarding");
  const shouldSetCoachAndStay =
    isAuthenticated &&
    !currentUserLoading &&
    (!currentUser || !currentUser.signupRole) &&
    isOnOnboarding;
  useEffect(() => {
    if (!shouldSetCoachAndStay || setCoachRoleAttempted.current) return;
    setCoachRoleAttempted.current = true;
    setCoachRoleMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once when landing on onboarding without role
  }, [shouldSetCoachAndStay]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      queryClient.clear();
    }
  };

  const onAthleteOnboardingWithInvite =
    location.pathname === "/athlete/onboarding" && !!getStoredInviteSlug();
  const redirectToWelcome =
    isAuthenticated &&
    !currentUserLoading &&
    location.pathname !== "/welcome" &&
    !onAthleteOnboardingWithInvite &&
    (!currentUser || !currentUser.signupRole);
  const showCoachDashboard = !!currentUser?.coachProfile;
  const showAthleteProfile = !!currentUser?.athleteProfile;
  const signedIn = authStatus === "authenticated";
  const showFindCoaches = !signedIn || (showAthleteProfile && !showCoachDashboard);
  const showForCoaches = !signedIn;
  const profileTo = showCoachDashboard ? "/dashboard/profile" : showAthleteProfile ? "/athlete/profile" : null;

  if (redirectToWelcome) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold text-slate-900 hover:text-brand-600 transition-colors">
            ApexSports
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {showFindCoaches && (
              <Link
                to="/find"
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Find Coaches
              </Link>
            )}
            {showForCoaches && (
              <Link
                to="/coaches"
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                For Coaches
              </Link>
            )}
            {authStatus === "authenticated" ? (
              <>
                {showCoachDashboard && (
                  <>
                    <Link
                      to="/dashboard"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/dashboard/availability"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Availability
                    </Link>
                  </>
                )}
                <Link
                  to="/bookings"
                  className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                >
                  Bookings
                </Link>
                {showCoachDashboard && (
                  <Link
                    to="/dashboard/athletes"
                    className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                  >
                    Athletes
                  </Link>
                )}
                <div className="relative" ref={avatarMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAvatarMenuOpen((o) => !o)}
                    className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-200 text-slate-600 font-semibold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                    aria-expanded={avatarMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                  >
                    {getAvatarUrl(currentUser) ? (
                      <img src={getAvatarUrl(currentUser)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getAvatarInitial(currentUser)
                    )}
                  </button>
                  {avatarMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-50">
                      {profileTo && (
                        <Link
                          to={profileTo}
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => setAvatarMenuOpen(false)}
                        >
                          Profile
                        </Link>
                      )}
                      {showCoachDashboard && currentUser?.coachProfile?.id && (
                        <Link
                          to={`/coaches/${currentUser.coachProfile.inviteSlug ?? currentUser.coachProfile.id}`}
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => setAvatarMenuOpen(false)}
                        >
                          View public profile
                        </Link>
                      )}
                      {showCoachDashboard && (
                        <Link
                          to="/dashboard/agent-test"
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => setAvatarMenuOpen(false)}
                        >
                          Agent test
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          handleSignOut();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/welcome"
                className="rounded-xl bg-brand-500 text-white px-4 py-2.5 font-semibold hover:bg-brand-600 transition-colors shadow-sm"
              >
                Sign in
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            {authStatus === "authenticated" && (
              <div className="relative mr-1" ref={avatarMenuRefMobile}>
                <button
                  type="button"
                  onClick={() => setAvatarMenuOpen((o) => !o)}
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-200 text-slate-600 font-semibold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  aria-expanded={avatarMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                >
                  {getAvatarUrl(currentUser) ? (
                    <img src={getAvatarUrl(currentUser)!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getAvatarInitial(currentUser)
                  )}
                </button>
                {avatarMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-[60]">
                    {profileTo && (
                      <Link
                        to={profileTo}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => setAvatarMenuOpen(false)}
                      >
                        Profile
                      </Link>
                    )}
                    {showCoachDashboard && currentUser?.coachProfile?.id && (
                      <Link
                        to={`/coaches/${currentUser.coachProfile.inviteSlug ?? currentUser.coachProfile.id}`}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => setAvatarMenuOpen(false)}
                      >
                        View public profile
                      </Link>
                    )}
                    {showCoachDashboard && (
                      <Link
                        to="/dashboard/agent-test"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => setAvatarMenuOpen(false)}
                      >
                        Agent test
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        handleSignOut();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 top-16 z-40 bg-black/20 md:hidden"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-white border-b border-slate-200 shadow-lg py-4 px-4">
              <nav className="flex flex-col gap-1">
                {showFindCoaches && (
                  <Link
                    to="/find"
                    className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Find Coaches
                  </Link>
                )}
                {showForCoaches && (
                  <Link
                    to="/coaches"
                    className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    For Coaches
                  </Link>
                )}
                {authStatus === "authenticated" ? (
                  <>
                    {showCoachDashboard && (
                      <>
                        <Link
                          to="/dashboard"
                          className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                          onClick={() => setMenuOpen(false)}
                        >
                          Dashboard
                        </Link>
                        <Link
                          to="/dashboard/availability"
                          className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                          onClick={() => setMenuOpen(false)}
                        >
                          Availability
                        </Link>
                      </>
                    )}
                    <Link
                      to="/bookings"
                      className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                      onClick={() => setMenuOpen(false)}
                    >
                      Bookings
                    </Link>
                    {showCoachDashboard && (
                      <Link
                        to="/dashboard/athletes"
                        className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                        onClick={() => setMenuOpen(false)}
                      >
                        Athletes
                      </Link>
                    )}
                  </>
                ) : (
                  <Link
                    to="/welcome"
                    className="py-3 px-3 rounded-xl bg-brand-500 text-white font-semibold text-center mt-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                )}
              </nav>
            </div>
          </>
        )}
      </header>
      <main className="flex-1">
        {redirectToWelcome && !isOnOnboarding && location.pathname !== "/sign-up" ? (
          <Navigate to="/welcome" replace />
        ) : (
          <Outlet />
        )}
      </main>
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="font-display font-bold text-slate-900">
            ApexSports
          </Link>
          <div className="flex gap-8 text-slate-600 text-sm">
            <Link to="/find" className="hover:text-slate-900 transition-colors">
              Find Coaches
            </Link>
            <Link to="/coaches" className="hover:text-slate-900 transition-colors">
              For Coaches
            </Link>
          </div>
          <p className="text-slate-500 text-sm">
            Verified coaches for athletes
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function Layout() {
  const { isDevMode } = useAuth();
  return isDevMode ? <DevLayout /> : <CognitoLayout />;
}
