-- A verified X or Telegram handle on a coin. Handle and platform only. No account id, no wallet key.
create table if not exists creator_socials (
  chain text not null,
  coin text not null,
  platform text not null,
  handle text not null,
  verified_at timestamptz not null default now(),
  primary key (chain, coin, platform)
);
