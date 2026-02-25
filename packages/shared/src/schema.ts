import { z } from "zod";
import { isAllowedServiceCity } from "./cities.js";

// Auth
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Allowed sports (coaches pick one or many)
export const ALLOWED_SPORTS = [
  "Soccer",
  "Baseball",
  "Softball",
  "Basketball",
  "Tennis",
] as const;
export type AllowedSport = (typeof ALLOWED_SPORTS)[number];

const sportEnum = z.enum(ALLOWED_SPORTS as unknown as [string, ...string[]]);

// Coach profile: sports and serviceCities are arrays
export const coachProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  sports: z
    .array(sportEnum)
    .min(1, "Select at least one sport"),
  serviceCities: z
    .array(z.string().min(1))
    .min(1, "Select at least one service area city")
    .refine((arr) => arr.every(isAllowedServiceCity), {
      message: "Each city must be from the allowed list",
    }),
  bio: z.string().optional().default(""),
  hourlyRate: z.number().positive("Hourly rate must be positive").optional(),
  phone: z.string().max(20).optional(),
});

export const coachProfileUpdateSchema = coachProfileSchema.partial();

// Availability
export const availabilitySlotSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  recurrence: z.enum(["none", "weekly"]).optional().default("none"),
});

// Create with start + duration (backend computes endTime). Optional recurrence expansion.
export const DURATION_MINUTES_OPTIONS = [30, 45, 60, 90, 120] as const;
const durationMinutesSchema = z
  .number()
  .int()
  .min(15, "Minimum 15 minutes")
  .max(240, "Maximum 4 hours");

export const availabilitySlotCreateSchema = z.object({
  startTime: z.string().datetime(),
  durationMinutes: durationMinutesSchema,
  recurrence: z.enum(["none", "weekly"]).optional().default("none"),
  recurrenceWeeks: z.number().int().min(1).max(52).optional().default(12),
});

export const availabilitySlotUpdateSchema = availabilitySlotSchema.partial();

// Recurring availability rule (creates many slots up to endDate).
// endDate is required (YYYY-MM-DD); slots generated weekly until this date (max 2 years from first start).
export const availabilityRuleCreateSchema = z.object({
  firstStartTime: z.string().datetime(),
  durationMinutes: durationMinutesSchema,
  recurrence: z.literal("weekly"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
});

// Booking
export const bookingCreateSchema = z.object({
  coachId: z.string().uuid(),
  slotId: z.string().uuid(),
  message: z.string().max(2000).optional(),
});

export const bookingStatusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);

export const bookingUpdateSchema = z.object({
  status: bookingStatusSchema,
});

// Review
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional().default(""),
});

// Types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CoachProfile = z.infer<typeof coachProfileSchema>;
export type CoachProfileUpdate = z.infer<typeof coachProfileUpdateSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type AvailabilitySlotCreate = z.infer<typeof availabilitySlotCreateSchema>;
export type AvailabilityRuleCreate = z.infer<typeof availabilityRuleCreateSchema>;
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingUpdate = z.infer<typeof bookingUpdateSchema>;
export type Review = z.infer<typeof reviewSchema>;
