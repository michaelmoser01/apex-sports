const DEEP_LINK_KEY = "apex_deep_link";

export function setDeepLink(url: string): void {
  sessionStorage.setItem(DEEP_LINK_KEY, url);
}

export function getDeepLink(): string | null {
  return sessionStorage.getItem(DEEP_LINK_KEY);
}

export function consumeDeepLink(): string | null {
  const url = sessionStorage.getItem(DEEP_LINK_KEY);
  if (url) sessionStorage.removeItem(DEEP_LINK_KEY);
  return url;
}
