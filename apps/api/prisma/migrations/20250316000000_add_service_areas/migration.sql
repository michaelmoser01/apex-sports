-- CreateTable
CREATE TABLE IF NOT EXISTS "service_areas" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "radius_miles" INTEGER NOT NULL DEFAULT 15,
    "coach_profile_id" TEXT,
    "athlete_profile_id" TEXT,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (coach)
DO $$ BEGIN
ALTER TABLE "service_areas"
    ADD CONSTRAINT "service_areas_coach_profile_id_fkey"
    FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey (athlete)
DO $$ BEGIN
ALTER TABLE "service_areas"
    ADD CONSTRAINT "service_areas_athlete_profile_id_fkey"
    FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate existing coach serviceCities to service_areas using a static Bay Area geocoding lookup.
-- Each city gets a default 15-mile radius.
DO $$
DECLARE
    r RECORD;
    city_name TEXT;
    lat DECIMAL(10,7);
    lng DECIMAL(10,7);
BEGIN
    -- Only run if service_areas is empty (idempotent)
    IF EXISTS (SELECT 1 FROM service_areas LIMIT 1) THEN
        RETURN;
    END IF;

    FOR r IN SELECT id, service_cities FROM coach_profiles WHERE array_length(service_cities, 1) > 0
    LOOP
        FOREACH city_name IN ARRAY r.service_cities
        LOOP
            -- Static geocoding for Bay Area cities
            SELECT
                CASE city_name
                    WHEN 'Alameda, CA' THEN 37.7652
                    WHEN 'Albany, CA' THEN 37.8869
                    WHEN 'Antioch, CA' THEN 38.0049
                    WHEN 'Atherton, CA' THEN 37.4613
                    WHEN 'Belmont, CA' THEN 37.5202
                    WHEN 'Benicia, CA' THEN 38.0493
                    WHEN 'Berkeley, CA' THEN 37.8716
                    WHEN 'Brentwood, CA' THEN 37.9318
                    WHEN 'Brisbane, CA' THEN 37.6807
                    WHEN 'Burlingame, CA' THEN 37.5841
                    WHEN 'Campbell, CA' THEN 37.2872
                    WHEN 'Concord, CA' THEN 37.9780
                    WHEN 'Colma, CA' THEN 37.6769
                    WHEN 'Cotati, CA' THEN 38.3266
                    WHEN 'Cupertino, CA' THEN 37.3230
                    WHEN 'Daly City, CA' THEN 37.6879
                    WHEN 'Danville, CA' THEN 37.8216
                    WHEN 'Dublin, CA' THEN 37.7022
                    WHEN 'East Palo Alto, CA' THEN 37.4688
                    WHEN 'El Cerrito, CA' THEN 37.9161
                    WHEN 'Emeryville, CA' THEN 37.8313
                    WHEN 'Foster City, CA' THEN 37.5585
                    WHEN 'Fremont, CA' THEN 37.5485
                    WHEN 'Gilroy, CA' THEN 37.0058
                    WHEN 'Half Moon Bay, CA' THEN 37.4636
                    WHEN 'Hayward, CA' THEN 37.6688
                    WHEN 'Hercules, CA' THEN 38.0172
                    WHEN 'Lafayette, CA' THEN 37.8858
                    WHEN 'Livermore, CA' THEN 37.6819
                    WHEN 'Los Altos, CA' THEN 37.3852
                    WHEN 'Los Gatos, CA' THEN 37.2358
                    WHEN 'Menlo Park, CA' THEN 37.4530
                    WHEN 'Milpitas, CA' THEN 37.4323
                    WHEN 'Mill Valley, CA' THEN 37.9060
                    WHEN 'Millbrae, CA' THEN 37.5985
                    WHEN 'Morgan Hill, CA' THEN 37.1305
                    WHEN 'Moraga, CA' THEN 37.8349
                    WHEN 'Mountain View, CA' THEN 37.3861
                    WHEN 'Napa, CA' THEN 38.2975
                    WHEN 'Newark, CA' THEN 37.5296
                    WHEN 'Novato, CA' THEN 38.1074
                    WHEN 'Oakland, CA' THEN 37.8044
                    WHEN 'Orinda, CA' THEN 37.8771
                    WHEN 'Pacifica, CA' THEN 37.6138
                    WHEN 'Palo Alto, CA' THEN 37.4419
                    WHEN 'Petaluma, CA' THEN 38.2324
                    WHEN 'Piedmont, CA' THEN 37.8244
                    WHEN 'Pinole, CA' THEN 38.0044
                    WHEN 'Pittsburg, CA' THEN 38.0280
                    WHEN 'Pleasanton, CA' THEN 37.6624
                    WHEN 'Redwood City, CA' THEN 37.4852
                    WHEN 'Richmond, CA' THEN 37.9358
                    WHEN 'Rohnert Park, CA' THEN 38.3396
                    WHEN 'San Bruno, CA' THEN 37.6305
                    WHEN 'San Francisco, CA' THEN 37.7749
                    WHEN 'San Jose, CA' THEN 37.3382
                    WHEN 'San Leandro, CA' THEN 37.7249
                    WHEN 'San Mateo, CA' THEN 37.5630
                    WHEN 'San Pablo, CA' THEN 37.9622
                    WHEN 'San Rafael, CA' THEN 37.9735
                    WHEN 'San Ramon, CA' THEN 37.7799
                    WHEN 'Santa Clara, CA' THEN 37.3541
                    WHEN 'Santa Rosa, CA' THEN 38.4404
                    WHEN 'Saratoga, CA' THEN 37.2639
                    WHEN 'Sausalito, CA' THEN 37.8591
                    WHEN 'Sebastopol, CA' THEN 38.4021
                    WHEN 'South San Francisco, CA' THEN 37.6547
                    WHEN 'Sunnyvale, CA' THEN 37.3688
                    WHEN 'Union City, CA' THEN 37.5934
                    WHEN 'Vallejo, CA' THEN 38.1041
                    WHEN 'Walnut Creek, CA' THEN 37.9101
                    ELSE 37.7749
                END INTO lat;

            SELECT
                CASE city_name
                    WHEN 'Alameda, CA' THEN -122.2416
                    WHEN 'Albany, CA' THEN -122.2978
                    WHEN 'Antioch, CA' THEN -121.8058
                    WHEN 'Atherton, CA' THEN -122.1979
                    WHEN 'Belmont, CA' THEN -122.2758
                    WHEN 'Benicia, CA' THEN -122.1586
                    WHEN 'Berkeley, CA' THEN -122.2727
                    WHEN 'Brentwood, CA' THEN -121.6958
                    WHEN 'Brisbane, CA' THEN -122.3999
                    WHEN 'Burlingame, CA' THEN -122.3660
                    WHEN 'Campbell, CA' THEN -121.9500
                    WHEN 'Concord, CA' THEN -122.0311
                    WHEN 'Colma, CA' THEN -122.4516
                    WHEN 'Cotati, CA' THEN -122.7074
                    WHEN 'Cupertino, CA' THEN -122.0322
                    WHEN 'Daly City, CA' THEN -122.4702
                    WHEN 'Danville, CA' THEN -121.9999
                    WHEN 'Dublin, CA' THEN -121.9358
                    WHEN 'East Palo Alto, CA' THEN -122.1411
                    WHEN 'El Cerrito, CA' THEN -122.3111
                    WHEN 'Emeryville, CA' THEN -122.2852
                    WHEN 'Foster City, CA' THEN -122.2611
                    WHEN 'Fremont, CA' THEN -121.9886
                    WHEN 'Gilroy, CA' THEN -121.5683
                    WHEN 'Half Moon Bay, CA' THEN -122.4286
                    WHEN 'Hayward, CA' THEN -122.0808
                    WHEN 'Hercules, CA' THEN -122.2886
                    WHEN 'Lafayette, CA' THEN -122.1180
                    WHEN 'Livermore, CA' THEN -121.7680
                    WHEN 'Los Altos, CA' THEN -122.1141
                    WHEN 'Los Gatos, CA' THEN -121.9624
                    WHEN 'Menlo Park, CA' THEN -122.1817
                    WHEN 'Milpitas, CA' THEN -121.8996
                    WHEN 'Mill Valley, CA' THEN -122.5416
                    WHEN 'Millbrae, CA' THEN -122.3872
                    WHEN 'Morgan Hill, CA' THEN -121.6544
                    WHEN 'Moraga, CA' THEN -122.1297
                    WHEN 'Mountain View, CA' THEN -122.0839
                    WHEN 'Napa, CA' THEN -122.2869
                    WHEN 'Newark, CA' THEN -122.0402
                    WHEN 'Novato, CA' THEN -122.5697
                    WHEN 'Oakland, CA' THEN -122.2712
                    WHEN 'Orinda, CA' THEN -122.1797
                    WHEN 'Pacifica, CA' THEN -122.4869
                    WHEN 'Palo Alto, CA' THEN -122.1430
                    WHEN 'Petaluma, CA' THEN -122.6367
                    WHEN 'Piedmont, CA' THEN -122.2317
                    WHEN 'Pinole, CA' THEN -122.2989
                    WHEN 'Pittsburg, CA' THEN -121.8847
                    WHEN 'Pleasanton, CA' THEN -121.8747
                    WHEN 'Redwood City, CA' THEN -122.2364
                    WHEN 'Richmond, CA' THEN -122.3478
                    WHEN 'Rohnert Park, CA' THEN -122.7011
                    WHEN 'San Bruno, CA' THEN -122.4111
                    WHEN 'San Francisco, CA' THEN -122.4194
                    WHEN 'San Jose, CA' THEN -121.8863
                    WHEN 'San Leandro, CA' THEN -122.1561
                    WHEN 'San Mateo, CA' THEN -122.3255
                    WHEN 'San Pablo, CA' THEN -122.3458
                    WHEN 'San Rafael, CA' THEN -122.5311
                    WHEN 'San Ramon, CA' THEN -121.9780
                    WHEN 'Santa Clara, CA' THEN -121.9552
                    WHEN 'Santa Rosa, CA' THEN -122.7141
                    WHEN 'Saratoga, CA' THEN -122.0230
                    WHEN 'Sausalito, CA' THEN -122.4853
                    WHEN 'Sebastopol, CA' THEN -122.8239
                    WHEN 'South San Francisco, CA' THEN -122.4080
                    WHEN 'Sunnyvale, CA' THEN -122.0363
                    WHEN 'Union City, CA' THEN -122.0439
                    WHEN 'Vallejo, CA' THEN -122.2566
                    WHEN 'Walnut Creek, CA' THEN -122.0652
                    ELSE -122.4194
                END INTO lng;

            INSERT INTO service_areas (id, label, latitude, longitude, radius_miles, coach_profile_id)
            VALUES (gen_random_uuid(), city_name, lat, lng, 15, r.id);
        END LOOP;
    END LOOP;

    -- Migrate athlete serviceCity
    FOR r IN SELECT id, service_city FROM athlete_profiles WHERE service_city IS NOT NULL AND service_city != ''
    LOOP
        SELECT
            CASE r.service_city
                WHEN 'Alameda, CA' THEN 37.7652
                WHEN 'Albany, CA' THEN 37.8869
                WHEN 'Antioch, CA' THEN 38.0049
                WHEN 'Berkeley, CA' THEN 37.8716
                WHEN 'Concord, CA' THEN 37.9780
                WHEN 'Cupertino, CA' THEN 37.3230
                WHEN 'Daly City, CA' THEN 37.6879
                WHEN 'Dublin, CA' THEN 37.7022
                WHEN 'Fremont, CA' THEN 37.5485
                WHEN 'Hayward, CA' THEN 37.6688
                WHEN 'Livermore, CA' THEN 37.6819
                WHEN 'Mountain View, CA' THEN 37.3861
                WHEN 'Oakland, CA' THEN 37.8044
                WHEN 'Palo Alto, CA' THEN 37.4419
                WHEN 'Pleasanton, CA' THEN 37.6624
                WHEN 'Redwood City, CA' THEN 37.4852
                WHEN 'San Francisco, CA' THEN 37.7749
                WHEN 'San Jose, CA' THEN 37.3382
                WHEN 'San Mateo, CA' THEN 37.5630
                WHEN 'Santa Clara, CA' THEN 37.3541
                WHEN 'Sunnyvale, CA' THEN 37.3688
                WHEN 'Walnut Creek, CA' THEN 37.9101
                ELSE 37.7749
            END INTO lat;

        SELECT
            CASE r.service_city
                WHEN 'Alameda, CA' THEN -122.2416
                WHEN 'Albany, CA' THEN -122.2978
                WHEN 'Antioch, CA' THEN -121.8058
                WHEN 'Berkeley, CA' THEN -122.2727
                WHEN 'Concord, CA' THEN -122.0311
                WHEN 'Cupertino, CA' THEN -122.0322
                WHEN 'Daly City, CA' THEN -122.4702
                WHEN 'Dublin, CA' THEN -121.9358
                WHEN 'Fremont, CA' THEN -121.9886
                WHEN 'Hayward, CA' THEN -122.0808
                WHEN 'Livermore, CA' THEN -121.7680
                WHEN 'Mountain View, CA' THEN -122.0839
                WHEN 'Oakland, CA' THEN -122.2712
                WHEN 'Palo Alto, CA' THEN -122.1430
                WHEN 'Pleasanton, CA' THEN -121.8747
                WHEN 'Redwood City, CA' THEN -122.2364
                WHEN 'San Francisco, CA' THEN -122.4194
                WHEN 'San Jose, CA' THEN -121.8863
                WHEN 'San Mateo, CA' THEN -122.3255
                WHEN 'Santa Clara, CA' THEN -121.9552
                WHEN 'Sunnyvale, CA' THEN -122.0363
                WHEN 'Walnut Creek, CA' THEN -122.0652
                ELSE -122.4194
            END INTO lng;

        INSERT INTO service_areas (id, label, latitude, longitude, radius_miles, athlete_profile_id)
        VALUES (gen_random_uuid(), r.service_city, lat, lng, 15, r.id);
    END LOOP;
END $$;
