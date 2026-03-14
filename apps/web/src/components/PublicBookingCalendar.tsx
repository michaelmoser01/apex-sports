import { useMemo, useState, useEffect, useRef, createContext, useContext, type ReactNode } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, getDay, startOfWeek, isWithinInterval, isSameDay, startOfMonth, endOfMonth, addDays } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";

type CalendarView = "month" | "week" | "day" | "agenda" | "work_week";
const BookingCalendarViewContext = createContext<CalendarView>("month");

function BookingCalendarEvent({ event }: { event: BookingEvent }) {
  const view = useContext(BookingCalendarViewContext);
  const isTimeGrid = view === "week" || view === "day" || view === "work_week";
  return <span>{isTimeGrid ? "Available" : event.title}</span>;
}

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

export interface BookingSlot {
  id: string;
  startTime: string;
  endTime: string;
}

interface BookingEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

function slotsToEvents(
  slots: BookingSlot[],
  rangeStart: Date,
  rangeEnd: Date
): BookingEvent[] {
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
      };
    });
}

export interface PublicBookingCalendarProps {
  slots: BookingSlot[];
  onSelectSlot: (slotId: string) => void;
  rangeStart?: Date;
  rangeEnd?: Date;
  /** When set, which slot is selected for booking (used in desktop modal to highlight and show form). */
  selectedSlotId?: string | null;
  /** Desktop only: rendered in the slot modal below the time list when a slot is selected. */
  bookingFormContent?: ReactNode;
  /** Called when the desktop slot modal is closed so parent can clear selection. */
  onCloseModal?: () => void;
  /** Slot IDs where the current user has a pending request (not yet accepted) – show "Requested". */
  requestedSlotIds?: Set<string> | ReadonlySet<string>;
  /** Slot IDs where the current user has a confirmed or completed booking – show "Booked". */
  bookedSlotIds?: Set<string> | ReadonlySet<string>;
}

export function PublicBookingCalendar({
  slots,
  onSelectSlot,
  rangeStart: rangeStartProp,
  rangeEnd: rangeEndProp,
  selectedSlotId = null,
  bookingFormContent,
  onCloseModal,
  requestedSlotIds,
  bookedSlotIds,
}: PublicBookingCalendarProps) {
  const isMobile = useIsMobile();
  const [rangeStart, setRangeStart] = useState<Date>(() =>
    rangeStartProp ?? startOfMonth(new Date())
  );
  const [rangeEnd, setRangeEnd] = useState<Date>(() =>
    rangeEndProp ?? endOfMonth(new Date())
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [currentView, setCurrentView] = useState<CalendarView>("month");

  const events = useMemo(
    () => slotsToEvents(slots, rangeStart, rangeEnd),
    [slots, rangeStart, rangeEnd]
  );

  const daySlots = useMemo(() => {
    if (!selectedDay) return [];
    return events
      .filter((ev) => isSameDay(ev.start, selectedDay))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, selectedDay]);

  /** Dates (yyyy-MM-dd) that have at least one slot, for highlighting the whole day cell in month view */
  const datesWithSlots = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => set.add(format(ev.start, "yyyy-MM-dd")));
    return set;
  }, [events]);

  const dayPropGetter = useMemo(
    () => (date: Date) =>
      datesWithSlots.has(format(date, "yyyy-MM-dd")) ? { className: "rbc-day-has-slots" } : {},
    [datesWithSlots]
  );

  const handleRangeChange = (range: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(range) && range.length > 0) {
      setRangeStart(range[0]);
      setRangeEnd(range[range.length - 1]);
    } else if (!Array.isArray(range) && range.start && range.end) {
      setRangeStart(range.start);
      setRangeEnd(range.end);
    }
  };

  const handleDrillDown = (date: Date) => {
    setSelectedDay(date);
    onCloseModal?.();
  };

  const handleSelectEvent = (event: BookingEvent) => {
    setSelectedDay(event.start);
    onSelectSlot(event.id);
  };

  const handleCloseDayView = () => {
    setSelectedDay(null);
    onCloseModal?.();
  };

  const handleSlotClickFromList = (slotId: string) => {
    onSelectSlot(slotId);
  };

  const dateCellWrapper = useMemo(
    () =>
      function DateCellWrapper({
        value,
        children,
      }: {
        value: Date;
        children: React.ReactNode;
      }) {
        const handleCellClick = (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest?.(".rbc-event")) return;
          handleDrillDown(value);
        };
        return (
          <div
            className="rbc-public-date-cell"
            onClick={handleCellClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleDrillDown(value);
              }
            }}
            role="button"
            tabIndex={0}
            style={{ minHeight: "4.5rem" }}
          >
            <span className="rbc-public-date-cell-overlay" aria-hidden />
            {children}
          </div>
        );
      },
    [handleDrillDown]
  );

  const calendarWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = calendarWrapRef.current;
    if (!el) return;
    const handleWrapClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".rbc-event")) return;
      const dayBg = target.closest(".rbc-day-bg");
      if (!dayBg || !(dayBg instanceof HTMLElement)) return;
      const parent = dayBg.parentElement;
      if (!parent) return;
      const colIndex = Array.from(parent.children).indexOf(dayBg);
      const monthRow = parent.closest(".rbc-month-row");
      if (!monthRow || !monthRow.parentElement) return;
      const rowIndex = Array.from(monthRow.parentElement.children).indexOf(monthRow);
      const weekStart = startOfWeek(rangeStart, { weekStartsOn: 0 });
      const date = addDays(weekStart, rowIndex * 7 + colIndex);
      if (!isWithinInterval(date, { start: rangeStart, end: rangeEnd })) return;
      handleDrillDown(date);
    };
    el.addEventListener("click", handleWrapClick);
    return () => el.removeEventListener("click", handleWrapClick);
  }, [rangeStart, rangeEnd, handleDrillDown]);

  const showDesktopDayModal = !isMobile && selectedDay;
  const showMobileDayView = isMobile && selectedDay;

  return (
    <div className="availability-calendar booking-calendar">
      {/* Desktop: modal with day's slots + selected slot highlight + payment/book form when a slot is selected */}
      {showDesktopDayModal && (
        <div
          className="hidden sm:flex fixed inset-0 z-50 items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-day-detail-title"
        >
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <div>
                <h2
                  id="public-day-detail-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {format(selectedDay!, "EEEE, MMMM d")}
                </h2>
                <p className="text-sm text-slate-500">
                  {format(selectedDay!, "yyyy")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseDayView}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <section>
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Available times
                </h3>
                {daySlots.length === 0 ? (
                  <p className="text-slate-500 text-sm py-2">
                    No available slots this day.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {daySlots.map((ev) => {
                      const isSelected = ev.id === selectedSlotId;
                      const isRequested = requestedSlotIds?.has(ev.id);
                      const isBooked = bookedSlotIds?.has(ev.id);
                      return (
                        <li key={ev.id}>
                          <button
                            type="button"
                            onClick={() => handleSlotClickFromList(ev.id)}
                            className={`w-full text-left flex items-center gap-3 rounded-lg border px-4 py-3 transition ${
                              isSelected
                                ? "border-brand-500 bg-brand-50 text-slate-900"
                                : isBooked
                                  ? "border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50"
                                  : isRequested
                                    ? "border-amber-200 bg-amber-50/80 hover:bg-amber-50"
                                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
                            }`}
                          >
                            <span
                              className={`shrink-0 w-2 h-10 rounded-sm ${
                                isBooked ? "bg-emerald-500" : isRequested ? "bg-amber-500" : "bg-brand-500"
                              }`}
                            />
                            <span className="font-medium text-slate-800">
                              {ev.title}
                            </span>
                            {isBooked && (
                              <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                Booked
                              </span>
                            )}
                            {isRequested && !isBooked && (
                              <span className="ml-auto text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                Requested
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              {selectedSlotId && bookingFormContent && (
                <section className="pt-4 border-t border-slate-200">
                  {bookingFormContent}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {showMobileDayView ? (
        <div className="sm:hidden flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-slate-50/80">
            <button
              type="button"
              onClick={handleCloseDayView}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 touch-manipulation"
              aria-label="Back to calendar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">
                {format(selectedDay!, "EEEE, MMMM d")}
              </h2>
              <p className="text-sm text-slate-500">
                {format(selectedDay!, "yyyy")}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <section>
              <h3 className="text-sm font-medium text-slate-500 mb-2">
                Available times
              </h3>
              {daySlots.length === 0 ? (
                <p className="text-slate-500 text-sm py-2">
                  No available slots this day.
                </p>
              ) : (
                <ul className="space-y-2">
                  {daySlots.map((ev) => {
                    const isSelected = ev.id === selectedSlotId;
                    const isRequested = requestedSlotIds?.has(ev.id);
                    const isBooked = bookedSlotIds?.has(ev.id);
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => handleSlotClickFromList(ev.id)}
                          className={`w-full text-left flex items-center gap-3 rounded-lg border px-4 py-3 min-h-[48px] touch-manipulation ${
                            isSelected
                              ? "border-brand-500 bg-brand-50 text-slate-900"
                              : isBooked
                                ? "border-emerald-200 bg-emerald-50/80 active:bg-emerald-50"
                                : isRequested
                                  ? "border-amber-200 bg-amber-50/80 active:bg-amber-50"
                                  : "border-slate-200 bg-slate-50/50 active:bg-slate-100"
                          }`}
                        >
                          <span className={`shrink-0 w-2 h-10 rounded-sm ${isBooked ? "bg-emerald-500" : isRequested ? "bg-amber-500" : "bg-brand-500"}`} />
                          <span className="font-medium text-slate-800">
                            {ev.title}
                          </span>
                          {isBooked && (
                            <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                              Booked
                            </span>
                          )}
                          {isRequested && !isBooked && (
                            <span className="ml-auto text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              Requested
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {selectedSlotId && bookingFormContent && (
              <section className="pt-4 border-t border-slate-200">
                {bookingFormContent}
              </section>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={calendarWrapRef}
          className="rbc-calendar-wrap min-h-[320px] h-[50vh] sm:h-[480px] overflow-auto -mx-1 sm:mx-0 touch-manipulation"
        >
          <BookingCalendarViewContext.Provider value={currentView}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              titleAccessor="title"
              selectable={false}
              onSelectEvent={handleSelectEvent}
              onRangeChange={handleRangeChange}
              onView={(view: CalendarView) => setCurrentView(view)}
              onDrillDown={handleDrillDown}
              views={["month", "week"]}
              defaultView="month"
              components={{ event: BookingCalendarEvent, dateCellWrapper }}
              dayPropGetter={dayPropGetter}
              eventPropGetter={(event: BookingEvent) => {
                const requested = requestedSlotIds?.has(event.id);
                const booked = bookedSlotIds?.has(event.id);
                const extra = booked ? " rbc-event-booked" : requested ? " rbc-event-requested" : "";
                return { className: "rbc-event-oneoff" + extra };
              }}
            />
          </BookingCalendarViewContext.Provider>
        </div>
      )}
    </div>
  );
}
