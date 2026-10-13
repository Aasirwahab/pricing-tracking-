-- Neon schema for DealDrop. Run in the Neon SQL Editor (or via psql).
-- user_id stores the Clerk user ID (e.g. "user_2abc..."), so it is text.
-- Ownership is enforced in the app queries (WHERE user_id = <Clerk userId>).

-- A product a user tracks (e.g. "Casio A159W-N1 silver")
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One shop's page for a product, with that shop's own price and currency
create table listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  shop text not null,
  name text not null,
  current_price numeric(10,2) not null,
  currency text not null,
  -- new | refurbished | used (extracted from the page)
  condition text not null default 'new',
  image_url text,
  -- A price the guard flagged as suspicious; accepted if seen again on the next check
  pending_price numeric(10,2),
  pending_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_product_url_unique unique (product_id, url)
);

create table price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  price numeric(10,2) not null,
  currency text not null,
  checked_at timestamptz not null default now()
);

create table user_settings (
  user_id text primary key,
  preferred_currency text not null default 'USD',
  -- "Shops in" country code (null = worldwide)
  shop_country text,
  updated_at timestamptz not null default now()
);

-- Daily USD-based exchange rates from open.er-api.com (one row per day)
create table exchange_rates (
  rate_date date primary key,
  base text not null default 'USD',
  rates jsonb not null,
  fetched_at timestamptz not null default now()
);

-- One "Find best prices" search. Searches by name or screenshot start without a
-- product (product_id is set when the user tracks the first shop).
create table discoveries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  user_id text not null,
  search_name text,
  country text,
  query text not null,
  results jsonb not null,
  -- DISCOVERY_VERSION in lib/discover.js; caches from older versions are ignored
  pipeline_version integer not null default 1,
  created_at timestamptz not null default now()
);

-- Every Jev / LLM call, for cost and latency reporting
create table ai_calls (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  model text not null,
  latency_ms integer not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12,8),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cached LLM summaries of pricing analyses, keyed by a hash of their inputs
create table price_insights (
  input_hash text primary key,
  summary text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index products_user_id_idx on products(user_id);
create index discoveries_product_created_idx on discoveries(product_id, created_at desc);
create index discoveries_user_search_idx on discoveries(user_id, lower(search_name), created_at desc);
create index ai_calls_kind_created_idx on ai_calls(kind, created_at desc);
create index listings_product_id_idx on listings(product_id);
create index price_history_listing_id_idx on price_history(listing_id);
create index price_history_checked_at_idx on price_history(checked_at desc);
