import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export interface CoachDetailLocation {
  id: string;
  name: string;
  address: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function CoachDetailMap({ locations }: { locations: CoachDetailLocation[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const withCoords = locations.filter(
    (loc) => loc.latitude != null && loc.longitude != null && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
  );

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !google) return;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !window.google || !mapRef.current || withCoords.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 13,
      center: withCoords[0]
        ? { lat: withCoords[0].latitude!, lng: withCoords[0].longitude! }
        : { lat: 37.7749, lng: -122.4194 },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
      ],
    });
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    for (const loc of withCoords) {
      const pos = { lat: loc.latitude!, lng: loc.longitude! };
      bounds.extend(pos);
      const marker = new window.google.maps.Marker({
        position: pos,
        map,
        title: loc.name,
      });
      markersRef.current.push(marker);
    }
    if (withCoords.length > 1) map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, [mapReady, locations]);

  if (locations.length === 0) return null;

  return (
    <div className="space-y-4">
      {withCoords.length > 0 && (
        <div
          ref={mapRef}
          className="w-full h-64 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
          aria-label="Map of coach locations"
        />
      )}
      <ul className="space-y-3">
        {locations.map((loc) => (
          <li key={loc.id} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600">
              <span className="text-sm font-semibold" aria-hidden>
                📍
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{loc.name}</p>
              <p className="text-slate-600 text-sm">{loc.address}</p>
              {loc.notes && (
                <p className="text-slate-500 text-sm mt-0.5 italic">{loc.notes}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
