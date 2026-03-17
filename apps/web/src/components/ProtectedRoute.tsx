import { Navigate, useLocation } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isDevMode, devUser } = useAuth();
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const location = useLocation();

  if (!isDevMode && authStatus === "configuring") {
    return null;
  }

  const isAuthenticated = isDevMode ? !!devUser : authStatus === "authenticated";

  if (!isAuthenticated) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <>{children}</>;
}
