create table if not exists profiles (
  address     text primary key,
  name        text not null default '',
  bio         text not null default '',
  image       text not null default '',
  updated_at  timestamptz not null default now()
);
