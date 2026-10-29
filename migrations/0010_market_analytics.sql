create table if not exists market_points (
  id text primary key,
  market text not null,
  submarket text not null default '',
  city text not null default '',
  year integer not null,
  quarter integer not null check (quarter between 1 and 4),
  inventory_sf double precision,
  vacancy_rate double precision,
  availability_rate double precision,
  asking_rent double precision,
  direct_rent double precision,
  leasing_sf double precision,
  absorption_sf double precision,
  under_construction_sf double precision,
  completions_sf double precision,
  sale_price_psf double precision,
  cap_rate double precision,
  sales_volume double precision,
  sales_sf double precision,
  transactions integer,
  buildings integer,
  vacant_sf double precision,
  sublet_sf double precision,
  available_sf double precision,
  notes text not null default '',
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create unique index if not exists market_points_place_period_idx
  on market_points (market, submarket, city, year, quarter);

insert into market_points (
  id, market, submarket, city, year, quarter,
  inventory_sf, vacancy_rate, availability_rate, asking_rent,
  leasing_sf, absorption_sf, under_construction_sf, sales_sf,
  notes, source
) values
  (
    'sgv-2025-3', 'San Gabriel Valley', '', '', 2025, 3,
    174612397, 5.0, 6.6, 1.29,
    3591308, 174576, 847384, 904357,
    'Q3 2025 historic comparison from the San Gabriel Valley market insight.',
    'report'
  ),
  (
    'sgv-2026-2', 'San Gabriel Valley', '', '', 2026, 2,
    175086602, 5.5, 6.5, 1.37,
    2676521, 1040469, 373029, 1267735,
    'Q2 2026 historic comparison from the San Gabriel Valley market insight.',
    'report'
  ),
  (
    'sgv-2026-3', 'San Gabriel Valley', '', '', 2026, 3,
    175268454, 5.8, 6.7, 1.40,
    1790763, -290936, 446944, 1946053,
    'Q3 2026 Market Insight, San Gabriel Valley industrial.',
    'report'
  )
on conflict (market, submarket, city, year, quarter) do nothing;
