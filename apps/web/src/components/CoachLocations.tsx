import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { ChevronDown, ChevronUp, MapPin, Plus, Pencil, Trash2 } from "lucide-react";

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
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lat, setLat] = useState<number | null>(initial?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(initial?.longitude ?? null);
  const [googleReady, setGoogleReady] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

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
    if (autocompleteRef.current) return;
    try {
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        types: ["address"],
        fields: ["formatted_address", "geometry"],
      });
      autocompleteRef.current = ac;
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (place.formatted_address && addressInputRef.current) {
          addressInputRef.current.value = place.formatted_address;
        }
        const loc = place.geometry?.location;
        if (loc) {
          setLat(loc.lat());
          setLng(loc.lng());
        }
      });
    } catch (err) {
      console.error('Failed to initialize Places Autocomplete', err);
    }
  }, [googleReady]);

  useEffect(() => {
    if (!googleReady || !window.google || !mapRef.current || lat == null || lng == null) return;
    const center = { lat, lng };
    if (!mapInstanceRef.current) {
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
    } else {
      mapInstanceRef.current.setCenter(center);
      markerRef.current?.setPosition(center);
    }
  }, [googleReady, lat, lng]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const addressVal = addressInputRef.current?.value?.trim() ?? "";
    if (!name.trim() || !addressVal) return;
    onSave({ name: name.trim(), address: addressVal, notes: notes.trim() || null, latitude: lat, longitude: lng });
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
          defaultValue={initial?.address ?? ""}
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
      {googleReady && lat != null && lng != null && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Pin location (drag to adjust)</label>
          <div ref={mapRef} className="w-full h-48 rounded-lg border border-slate-300 bg-slate-100" />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving || !name.trim()}
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

export function CoachLocationsCompact() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<CoachLocationItem | null>(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["coachLocations"],
    queryFn: () => api<CoachLocationItem[]>("/coaches/me/locations"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; address: string; notes: string | null; latitude: number | null; longitude: number | null }) =>
      api<CoachLocationItem>("/coaches/me/locations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      setModalMode(null);
      queryClient.invalidateQueries({ queryKey: ["coachLocations"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; address: string; notes: string | null; latitude: number | null; longitude: number | null } }) =>
      api<CoachLocationItem>(`/coaches/me/locations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      setModalMode(null);
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["coachLocations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/coaches/me/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coachLocations"] }),
  });

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900">
              Locations{!isLoading && locations.length > 0 ? ` (${locations.length})` : ""}
            </span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {expanded && (
          <div className="border-t border-slate-100 px-4 py-3">
            {isLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : locations.length === 0 ? (
              <p className="text-xs text-slate-500 mb-2">No locations yet. Add one so athletes know where to meet.</p>
            ) : (
              <ul className="space-y-2 mb-3">
                {locations.map((loc) => (
                  <li key={loc.id} className="flex items-start gap-2 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{loc.name}</p>
                      <p className="text-xs text-slate-500 truncate">{loc.address}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => { setEditTarget(loc); setModalMode("edit"); }}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        aria-label="Edit location"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(loc.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1 rounded text-slate-400 hover:text-danger-600 hover:bg-slate-100 disabled:opacity-50"
                        aria-label="Delete location"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => { setEditTarget(null); setModalMode("add"); }}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add location
            </button>
          </div>
        )}
      </div>

      {modalMode && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-auto p-6 relative z-[10000]">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {modalMode === "edit" ? "Edit location" : "Add location"}
            </h3>
            <LocationForm
              initial={editTarget ? { name: editTarget.name, address: editTarget.address, notes: editTarget.notes, latitude: editTarget.latitude, longitude: editTarget.longitude } : undefined}
              onSave={(data) => {
                if (modalMode === "edit" && editTarget) {
                  updateMutation.mutate({ id: editTarget.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
              onCancel={() => { setModalMode(null); setEditTarget(null); }}
              isSaving={createMutation.isPending || updateMutation.isPending}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
