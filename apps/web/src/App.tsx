import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Coaches from "./pages/Coaches";
import ForCoaches from "./pages/ForCoaches";
import CoachDetail from "./pages/CoachDetail";
import CoachBook from "./pages/CoachBook";
import CoachBookingSuccess from "./pages/CoachBookingSuccess";
import { CoachDetailErrorBoundary } from "./components/CoachDetailErrorBoundary";
import Bookings from "./pages/Bookings";
import BookingDetail from "./pages/BookingDetail";
import CompleteReservedBooking from "./pages/CompleteReservedBooking";
import CoachDashboard from "./pages/CoachDashboard";
import AthleteProfilePage from "./pages/AthleteProfile";
import AthleteOnboarding from "./pages/AthleteOnboarding";
import CoachOnboardingBio from "./pages/CoachOnboardingBio";
import Welcome from "./pages/Welcome";
import Join from "./pages/Join";
import SignUpPage from "./pages/SignUp";
import SignInPage from "./pages/SignIn";
import OnboardingLayout from "./components/OnboardingLayout";
import OnboardingBasic from "./pages/onboarding/OnboardingBasic";
import OnboardingAbout from "./pages/onboarding/OnboardingAbout";
import OnboardingGetPaid from "./pages/onboarding/OnboardingGetPaid";
import OnboardingAssistant from "./pages/onboarding/OnboardingAssistant";
import OnboardingPlan, { OnboardingPlanSuccess } from "./pages/onboarding/OnboardingPlan";

const hasCognito =
  !!import.meta.env.VITE_COGNITO_USER_POOL_ID &&
  !!import.meta.env.VITE_COGNITO_CLIENT_ID;
const isDevMode = !hasCognito;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Public routes */}
        <Route index element={<Home />} />
        <Route path="coaches" element={<ForCoaches />} />
        <Route path="pricing" element={<Navigate to="/coaches#pricing" replace />} />
        <Route path="find" element={<Coaches />} />
        <Route path="join/:slug" element={<Join />} />
        <Route path="coaches/:id" element={<CoachDetailErrorBoundary><Outlet /></CoachDetailErrorBoundary>}>
          <Route index element={<CoachDetail />} />
          <Route path="book" element={<CoachBook />} />
          <Route path="booking/success" element={<CoachBookingSuccess />} />
        </Route>

        {/* Auth pages (custom, not protected) */}
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="sign-up" element={<SignUpPage />} />

        {/* Protected routes */}
        <Route path="book/:coachId/:slotId" element={<ProtectedRoute><CompleteReservedBooking /></ProtectedRoute>} />
        <Route path="bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
        <Route path="bookings/:id" element={<ProtectedRoute><BookingDetail /></ProtectedRoute>} />
        <Route path="dashboard" element={<ProtectedRoute><CoachDashboard /></ProtectedRoute>} />
        <Route path="dashboard/profile" element={<ProtectedRoute><CoachDashboard /></ProtectedRoute>} />
        <Route path="dashboard/athletes" element={<ProtectedRoute><CoachDashboard /></ProtectedRoute>} />
        <Route path="dashboard/agent-test" element={<ProtectedRoute><CoachDashboard /></ProtectedRoute>} />
        <Route path="dashboard/availability" element={<ProtectedRoute><CoachDashboard /></ProtectedRoute>} />
        <Route path="athlete/onboarding" element={<ProtectedRoute><AthleteOnboarding /></ProtectedRoute>} />
        <Route path="athlete/profile" element={<ProtectedRoute><AthleteProfilePage /></ProtectedRoute>} />
        <Route path="coach/onboarding" element={<ProtectedRoute><OnboardingLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/coach/onboarding/basic" replace />} />
          <Route path="basic" element={<OnboardingBasic />} />
          <Route path="about" element={<OnboardingAbout />} />
          <Route path="assistant" element={<OnboardingAssistant />} />
        </Route>
        <Route path="coach/onboarding/bio" element={<ProtectedRoute><CoachOnboardingBio /></ProtectedRoute>} />
        <Route path="coach/setup/get-paid" element={<ProtectedRoute><OnboardingGetPaid /></ProtectedRoute>} />
        <Route path="coach/setup/plan" element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route index element={<OnboardingPlan />} />
          <Route path="success" element={<OnboardingPlanSuccess />} />
        </Route>
        <Route path="welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider isDevMode={isDevMode}>
      <BrowserRouter>
        <ScrollToTop />
        <Authenticator.Provider>
          <AppContent />
        </Authenticator.Provider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
