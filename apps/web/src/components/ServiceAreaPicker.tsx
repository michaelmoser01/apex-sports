import { useState, useEffect, useRef, useCallback } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { MapPin, X, Plus } from "lucide-react";

export interface ServiceAreaItem {
  id?: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

interface ServiceAreaPickerProps {
  areas: ServiceAreaItem[];
  onChange: (areas: ServiceAreaItem[]) => void;
  /** If true, only one area is allowed (athlete mode) */
  single?: boolean;
  /** Label above the input */
  label?: string;
  /** Helper text */
  helperText?: string;
}

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];

function AreaInput({
  onAdd,
  placeholder,
}: {
  onAdd: (area: Omit<ServiceAreaItem, "id">) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [radius, setRadius] = useState(15);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      if (g) setGoogleReady(true);
    });
  }, []);

  useEffect(() => {
    if (!googleReady || !window.google || !inputRef.current || autocompleteRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["(cities)"],
      fields: ["formatted_address", "geometry", "name"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      const label = place.formatted_address ?? place.name ?? "";
      onAdd({
        label,
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        radiusMiles: radius,
      });
      if (inputRef.current) inputRef.current.value = "";
    });
    autocompleteRef.current = ac;
  }, [googleReady, onAdd, radius]);

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1 min-w-0">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder ?? "Search for a city..."}
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
        />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <label className="text-xs text-slate-500 whitespace-nowrap">Radius:</label>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>{r} mi</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AreaCard({
  area,
  onRemove,
  onRadiusChange,
}: {
  area: ServiceAreaItem;
  onRemove: () => void;
  onRadiusChange: (radius: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      if (g) setGoogleReady(true);
    });
  }, []);

  useEffect(() => {
    if (!googleReady || !window.google || !mapRef.current) return;
    const center = { lat: area.latitude, lng: area.longitude };
    // Compute a reasonable zoom based on radius (miles → approx zoom level)
    const radiusMeters = area.radiusMiles * 1609.34;
    let zoom = 10;
    if (area.radiusMiles <= 5) zoom = 11;
    else if (area.radiusMiles <= 10) zoom = 10;
    else if (area.radiusMiles <= 25) zoom = 9;
    else if (area.radiusMiles <= 50) zoom = 8;
    else zoom = 7;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        zoom,
        center,
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: "none",
        mapTypeId: "roadmap",
      });
    } else {
      mapInstanceRef.current.setCenter(center);
      mapInstanceRef.current.setZoom(zoom);
    }

    if (circleRef.current) circleRef.current.setMap(null);
    circleRef.current = new window.google.maps.Circle({
      map: mapInstanceRef.current,
      center,
      radius: radiusMeters,
      strokeColor: "#ec741a",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#ec741a",
      fillOpacity: 0.12,
    });
  }, [googleReady, area.latitude, area.longitude, area.radiusMiles]);

  return (
    <div className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 items-start">
      <div
        ref={mapRef}
        className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-200"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900 text-sm truncate">{area.label}</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-slate-400 hover:text-danger-600 shrink-0"
            aria-label="Remove"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <label className="text-xs text-slate-500">Radius:</label>
          <select
            value={area.radiusMiles}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            className="px-2 py-1 border border-slate-200 rounded text-xs bg-white"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r} miles</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function ServiceAreaPicker({
  areas,
  onChange,
  single = false,
  label,
  helperText,
}: ServiceAreaPickerProps) {
  const handleAdd = useCallback((newArea: Omit<ServiceAreaItem, "id">) => {
    if (single) {
      onChange([newArea]);
    } else {
      onChange([...areas, newArea]);
    }
  }, [areas, onChange, single]);

  const handleRemove = (index: number) => {
    onChange(areas.filter((_, i) => i !== index));
  };

  const handleRadiusChange = (index: number, radius: number) => {
    onChange(areas.map((a, i) => (i === index ? { ...a, radiusMiles: radius } : a)));
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      {helperText && (
        <p className="text-slate-500 text-xs mb-2">{helperText}</p>
      )}

      {areas.length > 0 && (
        <div className="space-y-2 mb-3">
          {areas.map((area, i) => (
            <AreaCard
              key={area.id ?? `${area.latitude}-${area.longitude}-${i}`}
              area={area}
              onRemove={() => handleRemove(i)}
              onRadiusChange={(r) => handleRadiusChange(i, r)}
            />
          ))}
        </div>
      )}

      {(!single || areas.length === 0) && (
        <AreaInput
          onAdd={handleAdd}
          placeholder={single ? "Search for your city..." : "Add a service area..."}
        />
      )}

      {!single && areas.length > 0 && (
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Type above to add another area
        </p>
      )}
    </div>
  );
}
