-- Longitude can be -180 to 180; DECIMAL(9,7) only allows ~99.99. Widen to DECIMAL(10,7).
ALTER TABLE "coach_locations" ALTER COLUMN "longitude" TYPE DECIMAL(10,7);
