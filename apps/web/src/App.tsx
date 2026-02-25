import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import DevLoginGate from "./components/DevLoginGate";
import Home from "./pages/Home";
import Coaches from "./pages/Coaches";
import CoachDetail from "./pages/CoachDetail";
import { CoachDetailErrorBoundary } from "./components/CoachDetailErrorBoundary";
import Bookings from "./pages/Bookings";
import CoachDashboard from "./pages/CoachDashboard";
import Welcome from "./pages/Welcome";

const hasCognito =
  !!import.meta.env.VITE_COGNITO_USER_POOL_ID &&
  !!import.meta.env.VITE_COGNITO_CLIENT_ID;
const isDevMode = !hasCognito;

function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="coaches" element={<Coaches />} />
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
              <Authenticator signUpAttributes={["name"]}>
                <Bookings />
              </Authenticator>
            )
          }
        />
        <Route path="dashboard" element={<Navigate to="/dashboard/profile" replace />} />
        <Route
          path="dashboard/profile"
          element={
            isDevMode ? (
              <DevLoginGate>
                <CoachDashboard />
              </DevLoginGate>
            ) : (
              <Authenticator signUpAttributes={["name"]}>
                <CoachDashboard />
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
              <Authenticator signUpAttributes={["name"]}>
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
              <Authenticator signUpAttributes={["name"]}>
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
