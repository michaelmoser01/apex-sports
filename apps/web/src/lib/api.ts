import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";

const DEV_USER_KEY = "dev-user-id";

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_URL;
  if (url) return url;
  if (import.meta.env.DEV) return "/api";
  return "";
};

function getDevUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (!stored) return null;
    const user = JSON.parse(stored) as { id?: string };
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = getBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const devUserId = getDevUserId();
  if (devUserId) {
    headers["X-Dev-User-Id"] = devUserId;
  } else {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // Not signed in
    }
  }

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const message = err.detail ?? err.error ?? err.message ?? res.statusText ?? "Request failed";
      throw new Error(message);
    }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Is VITE_API_URL set? (Build the web app with your API URL so requests reach the backend.)"
      );
    }
    throw new Error(text || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  if (!isJson) {
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Is VITE_API_URL set? (Build the web app with your API URL so requests reach the backend.)"
      );
    }
    throw new Error("Expected JSON response");
  }
  return res.json();
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}
