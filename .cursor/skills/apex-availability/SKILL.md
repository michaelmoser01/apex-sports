---
name: apex-availability
description: How to add or change coach availability slots (one-off and recurring) in Apex Sports: API, shared schemas, and UI (calendar, mobile day view).
---

# Apex Sports: Coach availability slots

Use this skill when implementing or changing the flow for **adding a new availability slot** (one-off or recurring) for coaches.

## API

- **Base path**: Coach routes live in `apps/api/src/routes/coaches.ts`. All availability endpoints require auth (`authMiddleware()`).

### Endpoints

| Action | Method | Path | Body (create) |
|--------|--------|------|----------------|
| List availability | GET | `/coaches/me/availability` | — |
| Add one-off slot | POST | `/coaches/me/availability` | `availabilitySlotCreateSchema` |
| Add recurring rule | POST | `/coaches/me/availability/rules` | `availabilityRuleCreateSchema` |
| Delete one-off slot | DELETE | `/coaches/me/availability/:id` | — |
| Delete recurring rule | DELETE | `/coaches/me/availability/rules/:id` | — |

### Request bodies

- **One-off slot** (`POST /me/availability`): Validate with `availabilitySlotCreateSchema` from `@apex-sports/shared`. Required: `startTime` (ISO datetime), `durationMinutes`. Optional: `locationId` (UUID). Use `recurrence: "none"` for one-off; do not use this endpoint for weekly recurrence.
- **Recurring rule** (`POST /me/availability/rules`): Validate with `availabilityRuleCreateSchema`. Required: `firstStartTime` (ISO datetime), `durationMinutes`, `recurrence: "weekly"`, `endDate` (YYYY-MM-DD). Optional: `locationId`. If `locationId` is provided, verify it belongs to the authenticated coach’s locations.

## Shared schemas

Defined in `packages/shared/src/schema.ts`:

- `availabilitySlotCreateSchema`: `startTime`, `durationMinutes`, `recurrence`, `recurrenceWeeks`, `locationId` (optional).
- `availabilityRuleCreateSchema`: `firstStartTime`, `durationMinutes`, `recurrence: "weekly"`, `endDate`, `locationId` (optional).
- `DURATION_MINUTES_OPTIONS`: use for duration dropdowns (e.g. 30, 45, 60, 90, 120 minutes).

When adding new fields to availability payloads, update these schemas and the API validation together.

## UI

### Components

- **Calendar and add form**: `apps/web/src/components/AvailabilityCalendar.tsx`
  - Renders `react-big-calendar` with month/week views.
  - **Desktop**: Tapping a date shows an inline add form above the calendar; form submits one-off or recurring via callbacks.
  - **Mobile** (viewport &lt; 640px): Tapping a date opens a **day detail** view (not the inline form). Day view shows that day’s schedule list and the add form. Back button returns to month.
- **Dashboard**: `apps/web/src/pages/CoachDashboard.tsx`
  - Fetches `/coaches/me/availability` and `/coaches/me/locations`.
  - Passes `onAddOneOff`, `onAddRecurring`, `locations`, `inlineAddSlot`, `onCloseInlineAdd`, etc. to `AvailabilityCalendar`.
  - Mutations: `addSlotMutation` (POST `/coaches/me/availability`), `addRuleMutation` (POST `/coaches/me/availability/rules`). Include `locationId` in the payload when the user selects a location.

### Adding a new slot (flow)

1. User selects a date (calendar or mobile day view).
2. User sets time, duration, optional location, and optionally “Repeat weekly” with end date.
3. On submit:
   - If recurring: call `onAddRecurring(startIso, durationMinutes, endDate, locationId)` → backend `POST /me/availability/rules`.
   - If one-off: call `onAddOneOff(startIso, durationMinutes, locationId)` → backend `POST /me/availability`.
4. On success, parent invalidates `availability` query and closes the add form (e.g. clears `inlineAddSlot`).

### Locations

- Coach locations are fetched from `GET /coaches/me/locations` and passed as `locations` to the calendar. The add form shows a location dropdown; selected `locationId` is sent with the create payload when present.

## Checklist for “add new slot” changes

- [ ] Use shared schemas for any new or changed request fields.
- [ ] Validate `locationId` against the coach’s locations when provided.
- [ ] Keep mobile day view and desktop inline form both working.
- [ ] Use `DURATION_MINUTES_OPTIONS` for duration options in the UI.
- [ ] Invalidate the availability query after create/delete so the calendar refreshes.
