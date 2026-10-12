-- Paid Pulse placements. The transaction hash can be used once. No wallet key.
create table if not exists boosts (
  coin_key text not null,
  chain text not null,
  tx_hash text primary key,
  paid_native text not null,
  usd_at_purchase numeric not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);

create index if not exists boosts_ends_idx on boosts (ends_at desc, starts_at desc);
