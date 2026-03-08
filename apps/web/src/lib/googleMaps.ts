const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function loadGoogleMaps(): Promise<typeof window.google | undefined> {
  if (typeof window === "undefined" || !GOOGLE_MAPS_KEY) return Promise.resolve(undefined);
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      const check = () => (window.google ? resolve(window.google) : setTimeout(check, 50));
      check();
      return;
    }
    (window as Window & { __googleMapsInit?: () => void }).__googleMapsInit = () => resolve(window.google);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&callback=__googleMapsInit`;
    script.async = true;
    script.onerror = () => resolve(undefined);
    document.head.appendChild(script);
  });
}
