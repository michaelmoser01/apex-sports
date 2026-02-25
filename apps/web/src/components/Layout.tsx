import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { signOut } from "aws-amplify/auth";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";

function DevLayout() {
  const { devUser, setDevUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(!!devUser);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const redirectToWelcome =
    devUser &&
    !currentUserLoading &&
    location.pathname !== "/welcome" &&
    (!currentUser || !currentUser.signupRole);
  const redirectFromWelcome =
    devUser &&
    !currentUserLoading &&
    location.pathname === "/welcome" &&
    (currentUser?.signupRole || currentUser?.coachProfile);
  const showCoachDashboard = !!currentUser?.coachProfile;

  if (redirectFromWelcome) {
    const to =
      currentUser!.signupRole === "coach" || currentUser!.coachProfile
        ? "/dashboard/profile"
        : "/coaches";
    return <Navigate to={to} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold text-slate-900 hover:text-brand-600 transition-colors">
            ApexSports
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/coaches"
              className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Find Coaches
            </Link>
            {devUser ? (
              <>
                <Link
                  to="/bookings"
                  className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                >
                  Bookings
                </Link>
                {showCoachDashboard && (
                  <>
                    <Link
                      to="/dashboard/profile"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Profile
                    </Link>
                    <Link
                      to="/dashboard/availability"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Availability
                    </Link>
                  </>
                )}
                <button
                  onClick={() => setDevUser(null)}
                  className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
                >
                  Sign out
                </button>
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
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
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
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 top-16 z-40 bg-black/20 md:hidden"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-white border-b border-slate-200 shadow-lg py-4 px-4">
              <nav className="flex flex-col gap-1">
                <Link
                  to="/coaches"
                  className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                  onClick={() => setMenuOpen(false)}
                >
                  Find Coaches
                </Link>
                {devUser ? (
                  <>
                    <Link
                      to="/bookings"
                      className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                      onClick={() => setMenuOpen(false)}
                    >
                      Bookings
                    </Link>
                    {showCoachDashboard && (
                      <>
                        <Link
                          to="/dashboard/profile"
                          className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                          onClick={() => setMenuOpen(false)}
                        >
                          Profile
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
                    <button
                      onClick={() => {
                        setDevUser(null);
                        setMenuOpen(false);
                      }}
                      className="py-3 px-3 text-left text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                    >
                      Sign out
                    </button>
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
            <Link to="/coaches" className="hover:text-slate-900 transition-colors">
              Find Coaches
            </Link>
            <Link to="/dashboard/profile" className="hover:text-slate-900 transition-colors">
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
  const location = useLocation();
  const isAuthenticated = authStatus === "authenticated";
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(isAuthenticated);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = () => {
    signOut();
  };

  const redirectToWelcome =
    isAuthenticated &&
    !currentUserLoading &&
    location.pathname !== "/welcome" &&
    (!currentUser || !currentUser.signupRole);
  const redirectFromWelcome =
    isAuthenticated &&
    !currentUserLoading &&
    location.pathname === "/welcome" &&
    (currentUser?.signupRole || currentUser?.coachProfile);
  const showCoachDashboard = !!currentUser?.coachProfile;

  if (redirectFromWelcome) {
    const to =
      currentUser!.signupRole === "coach" || currentUser!.coachProfile
        ? "/dashboard/profile"
        : "/coaches";
    return <Navigate to={to} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold text-slate-900 hover:text-brand-600 transition-colors">
            ApexSports
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/coaches"
              className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Find Coaches
            </Link>
            {authStatus === "authenticated" ? (
              <>
                <Link
                  to="/bookings"
                  className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                >
                  Bookings
                </Link>
                {showCoachDashboard && (
                  <>
                    <Link
                      to="/dashboard/profile"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Profile
                    </Link>
                    <Link
                      to="/dashboard/availability"
                      className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
                    >
                      Availability
                    </Link>
                  </>
                )}
                <button
                  onClick={handleSignOut}
                  className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
                >
                  Sign out
                </button>
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
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
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
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 top-16 z-40 bg-black/20 md:hidden"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 right-0 top-16 z-50 md:hidden bg-white border-b border-slate-200 shadow-lg py-4 px-4">
              <nav className="flex flex-col gap-1">
                <Link
                  to="/coaches"
                  className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                  onClick={() => setMenuOpen(false)}
                >
                  Find Coaches
                </Link>
                {authStatus === "authenticated" ? (
                  <>
                    <Link
                      to="/bookings"
                      className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                      onClick={() => setMenuOpen(false)}
                    >
                      Bookings
                    </Link>
                    {showCoachDashboard && (
                      <>
                        <Link
                          to="/dashboard/profile"
                          className="py-3 px-3 text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                          onClick={() => setMenuOpen(false)}
                        >
                          Profile
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
                    <button
                      onClick={() => {
                        handleSignOut();
                        setMenuOpen(false);
                      }}
                      className="py-3 px-3 text-left text-slate-700 font-medium rounded-lg hover:bg-slate-100"
                    >
                      Sign out
                    </button>
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
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
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
            <Link to="/coaches" className="hover:text-slate-900 transition-colors">
              Find Coaches
            </Link>
            <Link to="/dashboard/profile" className="hover:text-slate-900 transition-colors">
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
