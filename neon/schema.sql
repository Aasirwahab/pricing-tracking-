-- Neon schema for DealDrop. Run in the Neon SQL Editor (or via psql).
-- user_id stores the Clerk user ID (e.g. "user_2abc..."), so it is text.
-- Ownership is enforced in the app queries (WHERE user_id = <Clerk userId>).

create table products (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  url text not null,
  name text not null,
  current_price numeric(10,2) not null,
  currency text not null default 'USD',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_user_url_unique unique (user_id, url)
);

create table price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price numeric(10,2) not null,
  currency text not null,
  checked_at timestamptz not null default now()
);

create index products_user_id_idx on products(user_id);
create index price_history_product_id_idx on price_history(product_id);
create index price_history_checked_at_idx on price_history(checked_at desc);
