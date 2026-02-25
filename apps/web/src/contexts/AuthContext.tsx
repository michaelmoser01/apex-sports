import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

const DEV_USER_KEY = "dev-user-id";

export interface DevUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuthContextValue {
  isDevMode: boolean;
  devUser: DevUser | null;
  setDevUser: (user: DevUser | null) => void;
  isAuthenticated: boolean;
  userEmail: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

interface AuthProviderProps {
  children: ReactNode;
  isDevMode: boolean;
}

export function AuthProvider({ children, isDevMode }: AuthProviderProps) {
  const [devUser, setDevUserState] = useState<DevUser | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as DevUser;
    } catch {
      return null;
    }
  });

  const setDevUser = useCallback((user: DevUser | null) => {
    setDevUserState(user);
    if (user) {
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(DEV_USER_KEY);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (stored && !devUser) {
      try {
        setDevUserState(JSON.parse(stored) as DevUser);
      } catch {
        // ignore
      }
    }
  }, [devUser]);

  const value: AuthContextValue = {
    isDevMode,
    devUser,
    setDevUser,
    isAuthenticated: isDevMode ? !!devUser : false,
    userEmail: isDevMode ? (devUser?.email ?? null) : null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
