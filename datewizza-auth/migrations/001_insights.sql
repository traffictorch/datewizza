-- Travel mode + distance on events (for CO2/cost calculations)
ALTER TABLE events ADD COLUMN travel_mode TEXT DEFAULT 'car';
ALTER TABLE events ADD COLUMN distance_km REAL;

-- Emission factors: how much CO2 and money per km, per mode
CREATE TABLE IF NOT EXISTS emission_factors (
  mode TEXT PRIMARY KEY,
  co2_g_per_km REAL NOT NULL,
  cost_per_km REAL NOT NULL
);

INSERT OR REPLACE INTO emission_factors (mode, co2_g_per_km, cost_per_km) VALUES
  ('walk',      0,    0),
  ('bike',      0,    0),
  ('transit',   41,   0.15),
  ('car',       170,  0.28),
  ('rideshare', 250,  0.65),
  ('flight',    255,  0.40);
