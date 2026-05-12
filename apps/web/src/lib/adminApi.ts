import { useCallback, useEffect, useState } from "react";

export const ADMIN_KEY_STORAGE = "apex-admin-key";

export function getAdminBaseUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (url) return url;
  if (import.meta.env.DEV) return "/api";
  return "";
}

export function getStoredAdminKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setStoredAdminKey(key: string): void {
  try {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    // ignore
  }
}

export function clearStoredAdminKey(): void {
  try {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export interface AdminFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  unauthorized: boolean;
}

export function useAdminFetch<T>(
  path: string | null,
  adminKey: string | null,
): AdminFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [tick, setTick] = useState(0);

  const baseUrl = getAdminBaseUrl();

  useEffect(() => {
    if (!adminKey || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    fetch(`${baseUrl}${path}`, { headers: { "X-Admin-Key": adminKey } })
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) {
            setUnauthorized(true);
            setError("Unauthorized.");
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, adminKey, baseUrl, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refresh, unauthorized };
}

export async function adminFetch<T>(
  path: string,
  adminKey: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = getAdminBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "X-Admin-Key": adminKey,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
