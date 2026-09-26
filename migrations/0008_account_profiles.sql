-- Name, photo, and bio for a person. Not a wallet and not a private key.
create table if not exists account_profiles (
  id          text primary key,
  name        text not null default '',
  bio         text not null default '',
  image       text not null default '',
  updated_at  timestamptz not null default now()
);
