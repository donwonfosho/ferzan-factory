create table if not exists coins (
  id          text primary key,
  chain       text not null,
  mode        text not null,
  name        text not null,
  symbol      text not null,
  supply      text not null,
  contract    text not null unique,
  creator     text not null,
  image       text not null default '',
  blurb       text not null default '',
  buys        integer not null default 0,
  volume_wei  text not null default '0',
  created_at  timestamptz not null default now()
);

create index if not exists coins_buys_idx on coins (buys desc, created_at desc);

create table if not exists prints (
  id          bigserial primary key,
  contract    text not null,
  side        text not null,
  native_wei  text not null,
  created_at  timestamptz not null default now()
);

create index if not exists prints_created_idx on prints (created_at desc);
