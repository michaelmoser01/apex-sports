import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { signOut } from "aws-amplify/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { api } from "@/lib/api";
import { getStoredInviteSlug } from "@/pages/Join";
import { Menu, X, ChevronRight } from "lucide-react";

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

interface NavConfig {
  signedIn: boolean;
  showFindCoaches: boolean;
  showForCoaches: boolean;
  showCoachDashboard: boolean;
  profileTo: string | null;
  currentUser: ReturnType<typeof useCurrentUser>["data"];
  onSignOut: () => void;
}

function AvatarButton({
  currentUser,
  onClick,
  open,
}: {
  currentUser: NavConfig["currentUser"];
  onClick: () => void;
  open: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-200 text-slate-700 font-bold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-transform hover:scale-105"
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label="Account menu"
    >
      {getAvatarUrl(currentUser) ? (
        <img src={getAvatarUrl(currentUser)!} alt="" className="w-full h-full object-cover" />
      ) : (
        getAvatarInitial(currentUser)
      )}
    </button>
  );
}

function AvatarDropdown({
  config,
  onClose,
  className,
}: {
  config: NavConfig;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className={`py-1.5 w-48 bg-white rounded-xl border border-slate-200 shadow-xl z-50 ${className ?? ""}`}>
      {config.profileTo && (
        <Link
          to={config.profileTo}
          className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium"
          onClick={onClose}
        >
          Profile
        </Link>
      )}
      {config.showCoachDashboard && config.currentUser?.coachProfile?.id && (
        <Link
          to={`/coaches/${config.currentUser.coachProfile.inviteSlug ?? config.currentUser.coachProfile.id}`}
          className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium"
          onClick={onClose}
        >
          View public profile
        </Link>
      )}
      {config.showCoachDashboard && (
        <Link
          to="/dashboard/agent-test"
          className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium"
          onClick={onClose}
        >
          Agent test
        </Link>
      )}
      <div className="my-1 border-t border-slate-100" />
      <button
        type="button"
        onClick={() => {
          onClose();
          config.onSignOut();
        }}
        className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 font-medium"
      >
        Sign out
      </button>
    </div>
  );
}

function NavLink({ to, children, active }: { to: string; children: ReactNode; active: boolean }) {
  return (
    <Link
      to={to}
      className={`relative text-sm font-medium transition-colors py-1 ${
        active
          ? "text-brand-600"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
      <span
        className={`absolute -bottom-1 left-0 h-0.5 bg-brand-500 rounded-full transition-all duration-200 ${
          active ? "w-full" : "w-0 group-hover:w-full"
        }`}
      />
    </Link>
  );
}

function AppShell({
  config,
  children,
}: {
  config: NavConfig;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const avatarMenuRefMobile = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

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
      ) return;
      setAvatarMenuOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [avatarMenuOpen]);

  const pathname = location.pathname;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-lg supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-slate-900 hover:text-brand-600 transition-colors"
          >
            Apex<span className="text-brand-500">Sports</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {config.showFindCoaches && (
              <NavLink to="/find" active={pathname === "/find"}>
                Find Coaches
              </NavLink>
            )}
            {config.showForCoaches && (
              <NavLink to="/coaches" active={pathname === "/coaches"}>
                For Coaches
              </NavLink>
            )}
            {config.signedIn ? (
              <>
                {config.showCoachDashboard && (
                  <>
                    <NavLink to="/dashboard" active={pathname === "/dashboard"}>
                      Dashboard
                    </NavLink>
                    <NavLink to="/dashboard/availability" active={pathname === "/dashboard/availability"}>
                      Availability
                    </NavLink>
                  </>
                )}
                <NavLink to="/bookings" active={pathname.startsWith("/bookings")}>
                  Bookings
                </NavLink>
                {config.showCoachDashboard && (
                  <NavLink to="/dashboard/athletes" active={pathname === "/dashboard/athletes"}>
                    Athletes
                  </NavLink>
                )}
                <div className="relative" ref={avatarMenuRef}>
                  <AvatarButton
                    currentUser={config.currentUser}
                    onClick={() => setAvatarMenuOpen((o) => !o)}
                    open={avatarMenuOpen}
                  />
                  {avatarMenuOpen && (
                    <AvatarDropdown
                      config={config}
                      onClose={() => setAvatarMenuOpen(false)}
                      className="absolute right-0 top-full mt-2"
                    />
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/welcome"
                className="rounded-xl bg-brand-500 text-white px-5 py-2.5 text-sm font-semibold hover:bg-brand-600 hover:shadow-glow-brand transition-all"
              >
                Sign in
              </Link>
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 md:hidden">
            {config.signedIn && (
              <div className="relative" ref={avatarMenuRefMobile}>
                <AvatarButton
                  currentUser={config.currentUser}
                  onClick={() => setAvatarMenuOpen((o) => !o)}
                  open={avatarMenuOpen}
                />
                {avatarMenuOpen && (
                  <AvatarDropdown
                    config={config}
                    onClose={() => setAvatarMenuOpen(false)}
                    className="absolute right-0 top-full mt-2 z-[60]"
                  />
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 -mr-2 text-slate-600 hover:text-slate-900 rounded-lg transition-colors"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {typeof document !== "undefined" &&
        createPortal(
          <div
            className={`fixed inset-0 top-16 z-50 md:hidden ${
              menuOpen ? "pointer-events-auto" : "pointer-events-none"
            }`}
            style={{ visibility: menuOpen ? "visible" : "hidden" }}
          >
            <div
              className="absolute inset-0 bg-black"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div
              className={`absolute top-0 right-0 w-full max-w-[280px] h-full shadow-xl border-l border-slate-200 transition-transform duration-300 ${
                menuOpen ? "translate-x-0" : "translate-x-full"
              }`}
              style={{ backgroundColor: "#ffffff" }}
            >
              <nav className="flex flex-col py-4">
                {(config.showFindCoaches || config.showForCoaches) && (
                  <div className="px-4 pb-2 mb-2 border-b border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">Explore</p>
                    {config.showFindCoaches && (
                      <Link
                        to="/find"
                        className="flex items-center justify-between py-2.5 px-3 -mx-1 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                        onClick={() => setMenuOpen(false)}
                      >
                        Find Coaches <ChevronRight className="w-4 h-4 text-slate-400" />
                      </Link>
                    )}
                    {config.showForCoaches && (
                      <Link
                        to="/coaches"
                        className="flex items-center justify-between py-2.5 px-3 -mx-1 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                        onClick={() => setMenuOpen(false)}
                      >
                        For Coaches <ChevronRight className="w-4 h-4 text-slate-400" />
                      </Link>
                    )}
                  </div>
                )}
                {config.signedIn ? (
                  <div className="px-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1">Account</p>
                    {config.showCoachDashboard && (
                      <>
                        <Link
                          to="/dashboard"
                          className="flex items-center justify-between py-2.5 px-3 -mx-1 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                          onClick={() => setMenuOpen(false)}
                        >
                          Dashboard <ChevronRight className="w-4 h-4 text-slate-400" />
                        </Link>
                        <Link
                          to="/dashboard/availability"
                          className="flex items-center justify-between py-2.5 px-3 -mx-1 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                          onClick={() => setMenuOpen(false)}
                        >
                          Availability <ChevronRight className="w-4 h-4 text-slate-400" />
                        </Link>
                      </>
                    )}
                    <Link
                      to="/bookings"
                      className="flex items-center justify-between py-2.5 px-3 -mx-1 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                      onClick={() => setMenuOpen(false)}
                    >
                      Bookings <ChevronRight className="w-4 h-4 text-slate-400" />
                    </Link>
                    {config.showCoachDashboard && (
                      <Link
                        to="/dashboard/athletes"
                        className="flex items-center justify-between py-2.5 px-3 -mx-1 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                        onClick={() => setMenuOpen(false)}
                      >
                        Athletes <ChevronRight className="w-4 h-4 text-slate-400" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="px-4 pt-2">
                    <Link
                      to="/welcome"
                      className="block py-3 px-4 rounded-xl bg-brand-500 text-white font-semibold text-center text-sm hover:bg-brand-600 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                  </div>
                )}
              </nav>
            </div>
          </div>,
          document.body
        )}

      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            <div className="col-span-2 md:col-span-1">
              <Link
                to="/"
                className="font-display text-xl font-extrabold tracking-tight text-white"
              >
                Apex<span className="text-brand-500">Sports</span>
              </Link>
              <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                The platform connecting athletes with elite, verified coaches.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                Product
              </p>
              <ul className="space-y-3">
                <li>
                  <Link to="/find" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Find Coaches
                  </Link>
                </li>
                <li>
                  <Link to="/bookings" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Bookings
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                For Coaches
              </p>
              <ul className="space-y-3">
                <li>
                  <Link to="/coaches" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Get Started
                  </Link>
                </li>
                <li>
                  <Link to="/coaches#pricing" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                Company
              </p>
              <ul className="space-y-3">
                <li>
                  <span className="text-sm text-slate-500">support@getapexsports.com</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              &copy; {new Date().getFullYear()} ApexSports. All rights reserved.
            </p>
            <p className="text-xs text-slate-600">v {__BUILD_VERSION__}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DevLayout() {
  const { devUser, setDevUser } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(!!devUser);

  const handleDevSignOut = () => {
    queryClient.clear();
    setDevUser(null);
  };

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

  const navConfig: NavConfig = {
    signedIn,
    showFindCoaches,
    showForCoaches,
    showCoachDashboard,
    profileTo,
    currentUser,
    onSignOut: handleDevSignOut,
  };

  return (
    <AppShell config={navConfig}>
      {redirectToWelcome ? <Navigate to="/welcome" replace /> : <Outlet />}
    </AppShell>
  );
}

function CognitoLayout() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const navConfig: NavConfig = {
    signedIn,
    showFindCoaches,
    showForCoaches,
    showCoachDashboard,
    profileTo,
    currentUser,
    onSignOut: handleSignOut,
  };

  return (
    <AppShell config={navConfig}>
      {redirectToWelcome && !isOnOnboarding && location.pathname !== "/sign-up" ? (
        <Navigate to="/welcome" replace />
      ) : (
        <Outlet />
      )}
    </AppShell>
  );
}

export default function Layout() {
  const { isDevMode } = useAuth();
  return isDevMode ? <DevLayout /> : <CognitoLayout />;
}
