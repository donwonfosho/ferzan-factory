alter table prints add column if not exists who text not null default '';
alter table prints add column if not exists price text not null default '';

create index if not exists prints_contract_idx on prints (contract, created_at desc);

create table if not exists posts (
  id          bigserial primary key,
  contract    text not null,
  chain       text not null,
  author      text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists posts_coin_idx on posts (contract, created_at desc);
