import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { loadGoogleMaps } from "@/lib/googleMaps";

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export interface CoachLocationItem {
  id: string;
  name: string;
  address: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

function LocationForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: { name: string; address: string; notes: string | null; latitude: number | null; longitude: number | null };
  onSave: (data: { name: string; address: string; notes: string | null; latitude: number | null; longitude: number | null }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lat, setLat] = useState<number | null>(initial?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(initial?.longitude ?? null);
  const [googleReady, setGoogleReady] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !google) return;
      setGoogleReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!googleReady || !window.google || !addressInputRef.current) return;
    const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      types: ["address"],
      fields: ["formatted_address", "geometry"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) setAddress(place.formatted_address);
      const loc = place.geometry?.location;
      if (loc) {
        const latVal = loc.lat();
        const lngVal = loc.lng();
        setLat(latVal);
        setLng(lngVal);
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setCenter(loc);
          markerRef.current.setPosition(loc);
        }
      }
    });
    return () => {};
  }, [googleReady]);

  useEffect(() => {
    if (!googleReady || !window.google || !mapRef.current) return;
    const center: { lat: number; lng: number } = lat != null && lng != null ? { lat, lng } : { lat: 37.7749, lng: -122.4194 };
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 15,
      center,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
    });
    const marker = new window.google.maps.Marker({
      position: center,
      map,
      draggable: true,
    });
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) {
        setLat(pos.lat());
        setLng(pos.lng());
      }
    });
    mapInstanceRef.current = map;
    markerRef.current = marker;
    return () => {
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [googleReady]);

  useEffect(() => {
    if (!googleReady || lat == null || lng == null) return;
    const center = { lat, lng };
    mapInstanceRef.current?.setCenter(center);
    markerRef.current?.setPosition(center);
  }, [googleReady, lat, lng]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;
    onSave({ name: name.trim(), address: address.trim(), notes: notes.trim() || null, latitude: lat, longitude: lng });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Location name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main gym, Park courts"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
        <input
          ref={addressInputRef}
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Search or enter full address"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
          required
        />
        {!GOOGLE_MAPS_KEY && (
          <p className="text-xs text-slate-500 mt-1">Set VITE_GOOGLE_MAPS_API_KEY for address autocomplete and map.</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes for finding this spot (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Park in the back lot, ring the side door"
          rows={2}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 resize-y"
        />
      </div>
      {googleReady && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Pin location (drag to adjust)</label>
          <div ref={mapRef} className="w-full h-48 rounded-lg border border-slate-300 bg-slate-100" />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving || !name.trim() || !address.trim()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save location"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CoachLocations() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["coachLocations"],
    queryFn: () => api<CoachLocationItem[]>("/coaches/me/locations"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; address: string; notes: string | null; latitude: number | null; longitude: number | null }) =>
      api<CoachLocationItem>("/coaches/me/locations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["coachLocations"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; address: string; notes: string | null; latitude: number | null; longitude: number | null } }) =>
      api<CoachLocationItem>(`/coaches/me/locations/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["coachLocations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/coaches/me/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coachLocations"] }),
  });

  return (
    <section className="mb-12 p-6 bg-white rounded-xl border border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Locations</h2>
      <p className="text-slate-600 text-sm mb-4">
        Add places where you train or meet athletes. You can search by address and adjust the pin on the map. These appear when you set availability.
      </p>
      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading locations…</p>
      ) : (
        <>
          <ul className="space-y-2 mb-4">
            {locations.map((loc) => (
              <li key={loc.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                {editingId === loc.id ? (
                  <div className="flex-1 pr-4">
                    <LocationForm
                      initial={{ name: loc.name, address: loc.address, notes: loc.notes ?? null, latitude: loc.latitude, longitude: loc.longitude }}
                      onSave={(data) => updateMutation.mutate({ id: loc.id, data })}
                      onCancel={() => setEditingId(null)}
                      isSaving={updateMutation.isPending}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="font-medium text-slate-800">{loc.name}</span>
                      <span className="text-slate-500 text-sm block">{loc.address}</span>
                      {loc.notes && (
                        <span className="text-slate-500 text-sm block mt-0.5 italic">{loc.notes}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(loc.id)}
                        className="text-brand-600 text-sm hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(loc.id)}
                        disabled={deleteMutation.isPending}
                        className="text-danger-600 text-sm hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {adding ? (
            <div className="pt-4 border-t border-slate-200">
              <LocationForm
                onSave={(data) => createMutation.mutate(data)}
                onCancel={() => setAdding(false)}
                isSaving={createMutation.isPending}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-brand-600 font-medium hover:underline"
            >
              + Add location
            </button>
          )}
          {createMutation.isError && (
            <p className="text-danger-600 text-sm mt-2" role="alert">
              {createMutation.error instanceof Error ? createMutation.error.message : "Failed to add location."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
