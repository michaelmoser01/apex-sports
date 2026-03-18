import { useMemo, useState, useEffect, useCallback, createContext, useContext } from "react";
import { Calendar, dateFnsLocalizer, type EventProps } from "react-big-calendar";
import { format, getDay, startOfWeek, isWithinInterval, setHours, setMinutes, isSameDay, addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { DURATION_MINUTES_OPTIONS } from "@apex-sports/shared";

type CalView = "month" | "week" | "day" | "agenda" | "work_week";
const AvailCalViewContext = createContext<CalView>("month");

function AvailCalEvent({ event }: EventProps<CalendarEvent>) {
  const view = useContext(AvailCalViewContext);
  const isTimeGrid = view === "week" || view === "day" || view === "work_week";
  if (isTimeGrid) return null;
  return <span>{event.title}</span>;
}

const SCROLL_TO_6AM = setHours(setMinutes(new Date(), 0), 6);

function eventTitle(start: Date, end: Date): string {
  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}

const localizer = dateFnsLocalizer({
  format,
  getDay,
  startOfWeek,
  locales: {},
});

const MOBILE_BREAKPOINT = 640;
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    handler();
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export interface AvailabilityRule {
  id: string;
  firstStartTime: string;
  durationMinutes: number;
  recurrence: string;
  endDate: string;
  slotCount: number;
  bookingCount?: number;
  locationId?: string;
  location?: { id: string; name: string } | null;
  /** Slot IDs with start times for mapping recurring events to actual slots */
  slots?: { id: string; startTime: string }[];
}

export interface OneOffSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  locationId?: string;
  location?: { id: string; name: string } | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    type: "one-off" | "recurring";
    slotId?: string;
    ruleId?: string;
    ruleEndDate?: string;
    bookingCount?: number;
    locationName?: string;
  };
}

function expandRulesForRange(
  rules: AvailabilityRule[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (const rule of rules) {
    const firstStart = new Date(rule.firstStartTime);
    const endDate = new Date(rule.endDate + "T23:59:59.999Z");
    const durationMs = rule.durationMinutes * 60 * 1000;
    const ruleSlots = rule.slots ?? [];
    const slotByStartTime = new Map(ruleSlots.map((s) => [new Date(s.startTime).getTime(), s.id]));

    let t = firstStart.getTime();
    while (t <= endDate.getTime()) {
      const start = new Date(t);
      const end = new Date(t + durationMs);
      if (isWithinInterval(start, { start: rangeStart, end: rangeEnd })) {
        const slotId = slotByStartTime.get(t);
        events.push({
          id: `rule-${rule.id}-${t}`,
          title: eventTitle(start, end),
          start,
          end,
          resource: {
            type: "recurring",
            slotId,
            ruleId: rule.id,
            ruleEndDate: rule.endDate,
            bookingCount: rule.bookingCount,
            locationName: rule.location?.name,
          },
        });
      }
      t += ONE_WEEK_MS;
    }
  }
  return events;
}

function oneOffSlotsToEvents(slots: OneOffSlot[], rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  return slots
    .filter((s) => {
      const start = new Date(s.startTime);
      return isWithinInterval(start, { start: rangeStart, end: rangeEnd });
    })
    .map((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return {
        id: s.id,
        title: eventTitle(start, end),
        start,
        end,
        resource: { type: "one-off" as const, slotId: s.id, locationName: s.location?.name },
      };
    });
}

export interface CoachLocationOption {
  id: string;
  name: string;
  address?: string;
}

interface AvailabilityCalendarProps {
  rules: AvailabilityRule[];
  oneOffSlots: OneOffSlot[];
  rangeStart: Date;
  rangeEnd: Date;
  onSlotClick: (start: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onRangeChange?: (range: { start: Date; end: Date } | Date[]) => void;
  /** Coach's saved locations for the location dropdown */
  locations?: CoachLocationOption[];
  /** When set, show inline add form below the calendar for this slot date */
  inlineAddSlot?: Date | null;
  onCloseInlineAdd?: () => void;
  onAddOneOff?: (startTime: string, durationMinutes: number, locationId?: string | null) => void;
  onAddRecurring?: (firstStartTime: string, durationMinutes: number, endDate: string, locationId?: string | null) => void;
  onAddBatch?: (slots: { startTime: string; durationMinutes: number; locationId?: string }[]) => void;
  onAddBatchRecurring?: (rules: { firstStartTime: string; durationMinutes: number; endDate: string; locationId?: string }[]) => void;
  isAddSubmitting?: boolean;
  addError?: string | null;
  /** Slot IDs with confirmed or completed bookings – show "Booked" indicator */
  bookedSlotIds?: Set<string> | ReadonlySet<string>;
}

const HOUR_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 7); // 7–20
const MINUTE_OPTIONS = [0, 15, 30, 45];

export function AvailabilityCalendar({
  rules,
  oneOffSlots,
  rangeStart,
  rangeEnd,
  onSlotClick,
  onEventClick,
  onRangeChange,
  locations = [],
  inlineAddSlot,
  onCloseInlineAdd,
  onAddOneOff,
  onAddRecurring,
  onAddBatch,
  onAddBatchRecurring,
  isAddSubmitting = false,
  addError,
  bookedSlotIds,
}: AvailabilityCalendarProps) {
  const isMobile = useIsMobile();
  const events = useMemo(() => {
    const recurring = expandRulesForRange(rules, rangeStart, rangeEnd);
    const oneOff = oneOffSlotsToEvents(oneOffSlots, rangeStart, rangeEnd);
    return [...recurring, ...oneOff];
  }, [rules, oneOffSlots, rangeStart, rangeEnd]);

  const [dateOverride, setDateOverride] = useState<Date | null>(null);

  useEffect(() => {
    setDateOverride(null);
  }, [inlineAddSlot]);

  const baseDate = (() => {
    const src = dateOverride ?? inlineAddSlot;
    return src ? new Date(src.getFullYear(), src.getMonth(), src.getDate()) : null;
  })();

  const goToPrevDay = useCallback(() => {
    if (baseDate) setDateOverride(addDays(baseDate, -1));
  }, [baseDate]);
  const goToNextDay = useCallback(() => {
    if (baseDate) setDateOverride(addDays(baseDate, 1));
  }, [baseDate]);
  const goToDate = useCallback((dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    if (!isNaN(d.getTime())) setDateOverride(d);
  }, []);

  const dayEvents = useMemo(() => {
    if (!baseDate) return [];
    return events
      .filter((ev) => isSameDay(ev.start, baseDate))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, baseDate]);

  const [addMode, setAddMode] = useState<"single" | "quickfill">("single");
  const [inlineTime, setInlineTime] = useState({ hour: 9, minute: 0 });
  const [inlineDuration, setInlineDuration] = useState(60);
  const [inlineLocationId, setInlineLocationId] = useState<string | "">(locations[0]?.id ?? "");
  const [inlineRecurring, setInlineRecurring] = useState(false);
  const [qfFromHour, setQfFromHour] = useState(9);
  const [qfToHour, setQfToHour] = useState(17);
  useEffect(() => {
    if (locations.length > 0 && !inlineLocationId) setInlineLocationId(locations[0].id);
  }, [locations, inlineLocationId]);
  const [inlineEndDate, setInlineEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return format(d, "yyyy-MM-dd");
  });

  const handleSelectSlot = (slotInfo: { start: Date }) => {
    const start = slotInfo.start;
    const h = start.getHours();
    const m = start.getMinutes();
    if (h !== 0 || m !== 0) setInlineTime({ hour: h, minute: m });
    onSlotClick(start);
  };

  const handleDrillDown = (date: Date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    if (h !== 0 || m !== 0) setInlineTime({ hour: h, minute: m });
    onSlotClick(date);
  };

  const handleInlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseDate || (!onAddOneOff && !onAddRecurring)) return;
    const start = setMinutes(setHours(baseDate, inlineTime.hour), inlineTime.minute);
    const startIso = start.toISOString();
    const duration = inlineDuration;
    const locationId = inlineLocationId || undefined;
    if (inlineRecurring && onAddRecurring) {
      onAddRecurring(startIso, duration, inlineEndDate, locationId);
    } else if (onAddOneOff) {
      onAddOneOff(startIso, duration, locationId);
    }
  };

  const handleQuickFillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseDate || qfFromHour >= qfToHour) return;
    const duration = inlineDuration;
    const locationId = inlineLocationId || undefined;
    const slotsToCreate: { startTime: string; durationMinutes: number; locationId?: string }[] = [];
    let hour = qfFromHour;
    while (hour + duration / 60 <= qfToHour) {
      const start = setMinutes(setHours(baseDate, hour), 0);
      slotsToCreate.push({ startTime: start.toISOString(), durationMinutes: duration, ...(locationId && { locationId }) });
      hour += duration / 60;
    }
    if (slotsToCreate.length === 0) return;
    if (inlineRecurring && onAddBatchRecurring) {
      onAddBatchRecurring(slotsToCreate.map((s) => ({ firstStartTime: s.startTime, durationMinutes: s.durationMinutes, endDate: inlineEndDate, ...(s.locationId && { locationId: s.locationId }) })));
    } else if (onAddBatch) {
      onAddBatch(slotsToCreate);
    }
  };

  const qfSlotCount = qfFromHour < qfToHour ? Math.floor((qfToHour - qfFromHour) / (inlineDuration / 60)) : 0;

  const [calView, setCalView] = useState<CalView>("week");
  const handleViewChange = useCallback((v: CalView) => setCalView(v), []);

  const showDesktopDayModal = !isMobile && inlineAddSlot && baseDate;
  const showMobileDayView = isMobile && inlineAddSlot && baseDate;

  return (
    <div className="availability-calendar">
      {/* Desktop: day-detail modal (click day or "+ more") — full day schedule + add form */}
      {showDesktopDayModal && (
        <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="day-detail-title">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <button type="button" onClick={goToPrevDay} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Previous day">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <h2 id="day-detail-title" className="text-lg font-semibold text-slate-900">{format(baseDate!, "EEEE, MMMM d")}</h2>
                  <input
                    type="date"
                    value={format(baseDate!, "yyyy-MM-dd")}
                    onChange={(e) => goToDate(e.target.value)}
                    className="text-xs text-slate-500 bg-transparent border-none p-0 text-center cursor-pointer hover:text-brand-600 focus:outline-none"
                  />
                </div>
                <button type="button" onClick={goToNextDay} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Next day">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={onCloseInlineAdd}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-6">
              <section>
                <h3 className="text-sm font-medium text-slate-500 mb-2">Schedule for this day</h3>
                {dayEvents.length === 0 ? (
                  <p className="text-slate-500 text-sm py-2">No slots yet. Add one below.</p>
                ) : (
                  <ul className="space-y-2">
                    {dayEvents.map((ev) => {
                      const slotId = ev.resource?.slotId ?? ev.id;
                      const isBooked = bookedSlotIds?.has(slotId);
                      return (
                        <li key={ev.id}>
                          <button
                            type="button"
                            onClick={() => onEventClick(ev)}
                            className="w-full text-left flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 hover:bg-slate-100"
                          >
                            <span
                              className={`shrink-0 w-2 h-10 rounded-sm ${
                                ev.resource?.type === "recurring" ? "bg-green-500" : "bg-blue-500"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-800">{ev.title}</span>
                              {ev.resource?.locationName && (
                                <span className="block text-xs text-slate-500 truncate">📍 {ev.resource.locationName}</span>
                              )}
                            </div>
                            <span className="text-slate-500 text-sm ml-auto flex items-center gap-2 shrink-0">
                              {isBooked && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                                  Booked
                                </span>
                              )}
                              {ev.resource?.type === "recurring" ? "Recurring" : "One-off"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              {(onAddOneOff || onAddRecurring) && (
                <section className="pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-700">Add availability</p>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                      <button type="button" onClick={() => setAddMode("single")} className={`px-3 py-1.5 font-medium transition-colors ${addMode === "single" ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Single</button>
                      <button type="button" onClick={() => setAddMode("quickfill")} className={`px-3 py-1.5 font-medium transition-colors ${addMode === "quickfill" ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Quick fill</button>
                    </div>
                  </div>

                  {addMode === "single" ? (
                  <form onSubmit={handleInlineSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
                        <div className="flex gap-2">
                          <select value={inlineTime.hour} onChange={(e) => setInlineTime((t) => ({ ...t, hour: Number(e.target.value) }))} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                            {HOUR_OPTIONS.map((h) => (<option key={h} value={h}>{format(setHours(new Date(2000, 0, 1), h), "h a")}</option>))}
                          </select>
                          <select value={inlineTime.minute} onChange={(e) => setInlineTime((t) => ({ ...t, minute: Number(e.target.value) }))} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                            {MINUTE_OPTIONS.map((m) => (<option key={m} value={m}>:{String(m).padStart(2, "0")}</option>))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
                        <select value={inlineDuration} onChange={(e) => setInlineDuration(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                          {DURATION_MINUTES_OPTIONS.map((m) => (<option key={m} value={m}>{m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}</option>))}
                        </select>
                      </div>
                    </div>
                    {locations.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                        <select value={inlineLocationId} onChange={(e) => setInlineLocationId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                          <option value="">No location</option>
                          {locations.map((loc) => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="desktop-inline-recurring" checked={inlineRecurring} onChange={(e) => setInlineRecurring(e.target.checked)} className="rounded border-slate-300" />
                      <label htmlFor="desktop-inline-recurring" className="text-sm text-slate-700">Repeat weekly</label>
                    </div>
                    {inlineRecurring && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm">until</span>
                        <input type="date" value={inlineEndDate} onChange={(e) => setInlineEndDate(e.target.value)} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
                      </div>
                    )}
                    {addError && <p className="text-sm text-danger-600">{addError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={isAddSubmitting} className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
                        {isAddSubmitting ? "Adding…" : "Add"}
                      </button>
                      <button type="button" onClick={onCloseInlineAdd} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    </div>
                  </form>
                  ) : (
                  <form onSubmit={handleQuickFillSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                        <select value={qfFromHour} onChange={(e) => setQfFromHour(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                          {HOUR_OPTIONS.map((h) => (<option key={h} value={h}>{format(setHours(new Date(2000, 0, 1), h), "h a")}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                        <select value={qfToHour} onChange={(e) => setQfToHour(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                          {HOUR_OPTIONS.filter((h) => h > qfFromHour).map((h) => (<option key={h} value={h}>{format(setHours(new Date(2000, 0, 1), h), "h a")}</option>))}
                          <option value={21}>9 PM</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Session length</label>
                      <select value={inlineDuration} onChange={(e) => setInlineDuration(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                        {DURATION_MINUTES_OPTIONS.map((m) => (<option key={m} value={m}>{m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}</option>))}
                      </select>
                    </div>
                    {locations.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                        <select value={inlineLocationId} onChange={(e) => setInlineLocationId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                          <option value="">No location</option>
                          {locations.map((loc) => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="desktop-qf-recurring" checked={inlineRecurring} onChange={(e) => setInlineRecurring(e.target.checked)} className="rounded border-slate-300" />
                      <label htmlFor="desktop-qf-recurring" className="text-sm text-slate-700">Repeat weekly</label>
                    </div>
                    {inlineRecurring && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm">until</span>
                        <input type="date" value={inlineEndDate} onChange={(e) => setInlineEndDate(e.target.value)} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
                      </div>
                    )}
                    {qfSlotCount > 0 && (
                      <p className="text-xs text-slate-500">
                        This will create {qfSlotCount} slot{qfSlotCount !== 1 ? "s" : ""}{inlineRecurring ? " each week" : ""}
                      </p>
                    )}
                    {addError && <p className="text-sm text-danger-600">{addError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={isAddSubmitting || qfSlotCount === 0} className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
                        {isAddSubmitting ? "Adding…" : `Add ${qfSlotCount} slot${qfSlotCount !== 1 ? "s" : ""}`}
                      </button>
                      <button type="button" onClick={onCloseInlineAdd} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    </div>
                  </form>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile: tap a day → full-day view with schedule list + add form */}
      {showMobileDayView ? (
        <div className="sm:hidden flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-slate-50/80">
            <button
              type="button"
              onClick={onCloseInlineAdd}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 touch-manipulation"
              aria-label="Back to calendar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={goToPrevDay} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 touch-manipulation" aria-label="Previous day">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 text-center">
              <h2 className="text-lg font-semibold text-slate-900">{format(baseDate!, "EEEE, MMMM d")}</h2>
              <input
                type="date"
                value={format(baseDate!, "yyyy-MM-dd")}
                onChange={(e) => goToDate(e.target.value)}
                className="text-xs text-slate-500 bg-transparent border-none p-0 text-center cursor-pointer hover:text-brand-600 focus:outline-none"
              />
            </div>
            <button type="button" onClick={goToNextDay} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 touch-manipulation" aria-label="Next day">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <section className="mb-6">
              <h3 className="text-sm font-medium text-slate-500 mb-2">Schedule for this day</h3>
              {dayEvents.length === 0 ? (
                <p className="text-slate-500 text-sm py-2">No slots yet. Add one below.</p>
              ) : (
                <ul className="space-y-2">
                  {dayEvents.map((ev) => {
                    const slotId = ev.resource?.slotId ?? ev.id;
                    const isBooked = bookedSlotIds?.has(slotId);
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => onEventClick(ev)}
                          className="w-full text-left flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 min-h-[48px] touch-manipulation active:bg-slate-100"
                        >
                          <span
                            className={`shrink-0 w-2 h-10 rounded-sm ${
                              ev.resource?.type === "recurring"
                                ? "bg-green-500"
                                : "bg-blue-500"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-slate-800">{ev.title}</span>
                            {ev.resource?.locationName && (
                              <span className="block text-xs text-slate-500 truncate">📍 {ev.resource.locationName}</span>
                            )}
                          </div>
                          <span className="text-slate-500 text-sm ml-auto flex items-center gap-2 shrink-0">
                            {isBooked && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-800">
                                Booked
                              </span>
                            )}
                            {ev.resource?.type === "recurring" ? "Recurring" : "One-off"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {(onAddOneOff || onAddRecurring) && (
              <section className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-700">Add availability</p>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                    <button type="button" onClick={() => setAddMode("single")} className={`px-3 py-1.5 font-medium transition-colors ${addMode === "single" ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Single</button>
                    <button type="button" onClick={() => setAddMode("quickfill")} className={`px-3 py-1.5 font-medium transition-colors ${addMode === "quickfill" ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Quick fill</button>
                  </div>
                </div>

                {addMode === "single" ? (
                <form onSubmit={handleInlineSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Time</label>
                    <div className="flex gap-2">
                      <select value={inlineTime.hour} onChange={(e) => setInlineTime((t) => ({ ...t, hour: Number(e.target.value) }))} className="flex-1 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                        {HOUR_OPTIONS.map((h) => (<option key={h} value={h}>{format(setHours(new Date(2000, 0, 1), h), "h a")}</option>))}
                      </select>
                      <select value={inlineTime.minute} onChange={(e) => setInlineTime((t) => ({ ...t, minute: Number(e.target.value) }))} className="flex-1 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                        {MINUTE_OPTIONS.map((m) => (<option key={m} value={m}>:{String(m).padStart(2, "0")}</option>))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
                    <select value={inlineDuration} onChange={(e) => setInlineDuration(Number(e.target.value))} className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                      {DURATION_MINUTES_OPTIONS.map((m) => (<option key={m} value={m}>{m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}</option>))}
                    </select>
                  </div>
                  {locations.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                      <select value={inlineLocationId} onChange={(e) => setInlineLocationId(e.target.value)} className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                        <option value="">No location</option>
                        {locations.map((loc) => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                    <input type="checkbox" checked={inlineRecurring} onChange={(e) => setInlineRecurring(e.target.checked)} className="w-5 h-5 rounded border-slate-300 touch-manipulation" />
                    <span className="text-base text-slate-700">Repeat weekly</span>
                  </label>
                  {inlineRecurring && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-sm">until</span>
                      <input type="date" value={inlineEndDate} onChange={(e) => setInlineEndDate(e.target.value)} className="flex-1 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation" />
                    </div>
                  )}
                  {addError && <p className="text-sm text-danger-600">{addError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={isAddSubmitting} className="flex-1 min-h-[48px] rounded-lg bg-brand-500 px-4 py-3 text-base font-medium text-white hover:bg-brand-600 disabled:opacity-50 touch-manipulation">
                      {isAddSubmitting ? "Adding…" : "Add"}
                    </button>
                    <button type="button" onClick={onCloseInlineAdd} className="flex-1 min-h-[48px] rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 touch-manipulation">Cancel</button>
                  </div>
                </form>
                ) : (
                <form onSubmit={handleQuickFillSubmit} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
                      <select value={qfFromHour} onChange={(e) => setQfFromHour(Number(e.target.value))} className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                        {HOUR_OPTIONS.map((h) => (<option key={h} value={h}>{format(setHours(new Date(2000, 0, 1), h), "h a")}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
                      <select value={qfToHour} onChange={(e) => setQfToHour(Number(e.target.value))} className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                        {HOUR_OPTIONS.filter((h) => h > qfFromHour).map((h) => (<option key={h} value={h}>{format(setHours(new Date(2000, 0, 1), h), "h a")}</option>))}
                        <option value={21}>9 PM</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Session length</label>
                    <select value={inlineDuration} onChange={(e) => setInlineDuration(Number(e.target.value))} className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                      {DURATION_MINUTES_OPTIONS.map((m) => (<option key={m} value={m}>{m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}</option>))}
                    </select>
                  </div>
                  {locations.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                      <select value={inlineLocationId} onChange={(e) => setInlineLocationId(e.target.value)} className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation">
                        <option value="">No location</option>
                        {locations.map((loc) => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                    <input type="checkbox" checked={inlineRecurring} onChange={(e) => setInlineRecurring(e.target.checked)} className="w-5 h-5 rounded border-slate-300 touch-manipulation" />
                    <span className="text-base text-slate-700">Repeat weekly</span>
                  </label>
                  {inlineRecurring && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-sm">until</span>
                      <input type="date" value={inlineEndDate} onChange={(e) => setInlineEndDate(e.target.value)} className="flex-1 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 touch-manipulation" />
                    </div>
                  )}
                  {qfSlotCount > 0 && (
                    <p className="text-xs text-slate-500">
                      This will create {qfSlotCount} slot{qfSlotCount !== 1 ? "s" : ""}{inlineRecurring ? " each week" : ""}
                    </p>
                  )}
                  {addError && <p className="text-sm text-danger-600">{addError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={isAddSubmitting || qfSlotCount === 0} className="flex-1 min-h-[48px] rounded-lg bg-brand-500 px-4 py-3 text-base font-medium text-white hover:bg-brand-600 disabled:opacity-50 touch-manipulation">
                      {isAddSubmitting ? "Adding…" : `Add ${qfSlotCount} slot${qfSlotCount !== 1 ? "s" : ""}`}
                    </button>
                    <button type="button" onClick={onCloseInlineAdd} className="flex-1 min-h-[48px] rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 touch-manipulation">Cancel</button>
                  </div>
                </form>
                )}
              </section>
            )}
          </div>
        </div>
      ) : (
        <AvailCalViewContext.Provider value={calView}>
        <div className="rbc-calendar-wrap min-h-[320px] h-[50vh] sm:h-[480px] overflow-auto -mx-1 sm:mx-0 touch-manipulation">
          <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={(event: CalendarEvent) => onEventClick(event)}
          onRangeChange={onRangeChange}
          onDrillDown={handleDrillDown}
          views={["month", "week"]}
          view={calView}
          onView={handleViewChange}
          defaultView="week"
          scrollToTime={SCROLL_TO_6AM}
          components={{ event: AvailCalEvent }}
          eventPropGetter={(event: CalendarEvent) => {
            const isRecurring = event.resource?.type === "recurring";
            const slotId = event.resource?.slotId ?? event.id;
            const isBooked = bookedSlotIds?.has(slotId);
            const classes = [
              isRecurring ? "rbc-event-recurring" : "rbc-event-oneoff",
              isBooked ? "rbc-event-booked" : "",
            ].filter(Boolean);
            return { className: classes.join(" ") };
          }}
        />
        </div>
        </AvailCalViewContext.Provider>
      )}
    </div>
  );
}

// --- Add one-off modal ---
export interface AddOneOffModalProps {
  initialStart: Date | null;
  onClose: () => void;
  onSubmit: (startTime: string, durationMinutes: number) => void;
  isPending: boolean;
  error: string | null;
}

export function AddOneOffModal({
  initialStart,
  onClose,
  onSubmit,
  isPending,
  error,
}: AddOneOffModalProps) {
  const [start, setStart] = useState(() => {
    if (!initialStart) return "";
    const d = initialStart;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [durationMinutes, setDurationMinutes] = useState(60);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = start ? new Date(start) : initialStart;
    if (!d) return;
    onSubmit(d.toISOString(), durationMinutes);
  };

  if (initialStart === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-session-title">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-lg p-6 max-w-md w-full max-h-[85vh] overflow-auto">
        <h3 id="add-session-title" className="text-lg font-semibold text-slate-900 mb-2">
          Add session
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Start</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
              className="mt-1 block w-full min-h-[44px] px-3 py-2.5 border border-slate-300 rounded-lg text-base touch-manipulation"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Duration</label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="mt-1 block w-full min-h-[44px] px-3 py-2.5 border border-slate-300 rounded-lg text-base touch-manipulation"
            >
              {DURATION_MINUTES_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 60 ? "1 hr" : m < 60 ? `${m} min` : `${m / 60} hr`}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-100 touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 min-h-[48px] rounded-lg bg-brand-500 px-4 py-3 text-base font-medium text-white hover:bg-brand-600 disabled:opacity-50 touch-manipulation"
            >
              Add session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Event detail / delete modal ---
export interface EventDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}

export function EventDetailModal({ event, onClose, onRemove, isRemoving }: EventDetailModalProps) {
  if (!event) return null;

  const isRecurring = event.resource?.type === "recurring";
  const timeRange = `${format(event.start, "PPp")} – ${format(event.end, "p")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-lg p-6 max-w-md w-full max-h-[85vh] overflow-auto">
        <h3 id="event-detail-title" className="text-lg font-semibold text-slate-900 mb-2">
          {isRecurring ? "Recurring (weekly)" : "One-off session"}
        </h3>
        <p className="text-slate-600 text-base sm:text-sm mb-1">{timeRange}</p>
        {event.resource?.locationName && (
          <p className="text-slate-600 text-sm mb-1">📍 {event.resource.locationName}</p>
        )}
        {isRecurring && event.resource?.ruleEndDate && (
          <p className="text-slate-500 text-sm mb-4">Until {event.resource.ruleEndDate}</p>
        )}
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 touch-manipulation"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className="flex-1 min-h-[48px] rounded-lg bg-danger-600 px-4 py-3 text-base font-medium text-white hover:bg-danger-700 disabled:opacity-50 touch-manipulation"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
