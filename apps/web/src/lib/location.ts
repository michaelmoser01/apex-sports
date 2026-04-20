/**
 * Shared copy for slots/rules that have no fixed location.
 *
 * A slot with `locationId === null` is treated as "TBD" — the coach will
 * coordinate the location with the athlete before the session. Keeping the
 * labels in one place makes the coach add/edit form, the coach day view, and
 * every athlete-facing surface (booking calendar, session detail, etc.) read
 * the same way.
 */

/** Short label used in dropdown options and chips. */
export const TBD_LOCATION_LABEL = "Location TBD";

/** Sentence used as a help / sub-line under the chip on athlete surfaces. */
export const TBD_LOCATION_HELPER = "Coach will coordinate before the session.";

/** Dropdown option label for the coach add/edit forms. */
export const TBD_LOCATION_OPTION_LABEL = "TBD — coach will coordinate";
