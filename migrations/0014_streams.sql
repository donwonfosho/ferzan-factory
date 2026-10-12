-- A creator's live stream for one coin. The url is public. No wallet key.
create table if not exists streams (
  coin_key text primary key,
  url text not null,
  set_by text not null,
  set_at timestamptz not null default now()
);
