import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import DevLoginGate from "./components/DevLoginGate";
import Home from "./pages/Home";
import Coaches from "./pages/Coaches";
import ForCoaches from "./pages/ForCoaches";
import CoachDetail from "./pages/CoachDetail";
import { CoachDetailErrorBoundary } from "./components/CoachDetailErrorBoundary";
import Bookings from "./pages/Bookings";
import CoachDashboard from "./pages/CoachDashboard";
import AthleteProfilePage from "./pages/AthleteProfile";
import AthleteOnboarding from "./pages/AthleteOnboarding";
import CoachOnboardingBio from "./pages/CoachOnboardingBio";
import Welcome from "./pages/Welcome";
import Join from "./pages/Join";
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

function SignUpRedirect() {
  return <Navigate to="/welcome" replace />;
}

const authenticatorFormFields = {
  signIn: {
    username: {
      label: "Email",
      placeholder: "Enter your email",
    },
  },
  signUp: {
    name: {
      label: "Name",
      placeholder: "Enter your name",
      order: 1,
    },
    username: {
      label: "Email",
      placeholder: "Enter your email",
      order: 2,
    },
    password: {
      label: "Password",
      placeholder: "Enter your password",
      order: 3,
    },
    confirm_password: {
      label: "Confirm Password",
      placeholder: "Confirm your password",
      order: 4,
    },
  },
};

function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="coaches" element={<ForCoaches />} />
        <Route path="pricing" element={<Navigate to="/coaches#pricing" replace />} />
        <Route path="find" element={<Coaches />} />
        <Route path="join/:slug" element={<Join />} />
        <Route
          path="coaches/:id"
          element={
            <CoachDetailErrorBoundary>
              <CoachDetail />
            </CoachDetailErrorBoundary>
          }
        />
        <Route
          path="bookings"
          element={
            isDevMode ? (
              <DevLoginGate>
                <Bookings />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <Bookings />
              </Authenticator>
            )
          }
        />
        <Route
          path="sign-in"
          element={
            isDevMode ? (
              <DevLoginGate>
                <Navigate to="/welcome" replace />
              </DevLoginGate>
            ) : (
              <Authenticator
                formFields={authenticatorFormFields}
                signUpAttributes={["name"]}
                initialState="signIn"
              >
                <Navigate to="/welcome" replace />
              </Authenticator>
            )
          }
        />
        <Route
          path="sign-up"
          element={
            isDevMode ? (
              <DevLoginGate>
                <SignUpRedirect />
              </DevLoginGate>
            ) : (
              <Authenticator
                formFields={authenticatorFormFields}
                signUpAttributes={["name"]}
                initialState="signUp"
              >
                <SignUpRedirect />
              </Authenticator>
            )
          }
        />
        <Route
          path="dashboard"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachDashboard />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <CoachDashboard />
              </Authenticator>
            )
          }
        />
        <Route
          path="dashboard/profile"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachDashboard />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <CoachDashboard />
              </Authenticator>
            )
          }
        />
        <Route
          path="dashboard/athletes"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachDashboard />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <CoachDashboard />
              </Authenticator>
            )
          }
        />
        <Route
          path="dashboard/agent-test"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachDashboard />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <CoachDashboard />
              </Authenticator>
            )
          }
        />
        <Route
          path="athlete/onboarding"
          element={
            isDevMode ? (
              <DevLoginGate>
                <AthleteOnboarding />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <AthleteOnboarding />
              </Authenticator>
            )
          }
        />
        <Route
          path="athlete/profile"
          element={
            isDevMode ? (
              <DevLoginGate>
                <AthleteProfilePage />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <AthleteProfilePage />
              </Authenticator>
            )
          }
        />
        <Route
          path="coach/onboarding"
          element={
            isDevMode ? (
              <DevLoginGate>
                <OnboardingLayout />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <OnboardingLayout />
              </Authenticator>
            )
          }
        >
          <Route index element={<Navigate to="/coach/onboarding/basic" replace />} />
          <Route path="basic" element={<OnboardingBasic />} />
          <Route path="about" element={<OnboardingAbout />} />
          <Route path="get-paid" element={<OnboardingGetPaid />} />
          <Route path="assistant" element={<OnboardingAssistant />} />
          <Route path="plan" element={<Outlet />}>
            <Route index element={<OnboardingPlan />} />
            <Route path="success" element={<OnboardingPlanSuccess />} />
          </Route>
        </Route>
        <Route
          path="coach/onboarding/bio"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachOnboardingBio />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <CoachOnboardingBio />
              </Authenticator>
            )
          }
        />
        <Route
          path="dashboard/availability"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachDashboard />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <CoachDashboard />
              </Authenticator>
            )
          }
        />
        <Route
          path="welcome"
          element={
            isDevMode ? (
              <DevLoginGate>
                <Welcome />
              </DevLoginGate>
            ) : (
              <Authenticator formFields={authenticatorFormFields} signUpAttributes={["name"]}>
                <Welcome />
              </Authenticator>
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider isDevMode={isDevMode}>
      <BrowserRouter>
        <Authenticator.Provider>
          <AppContent />
        </Authenticator.Provider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
