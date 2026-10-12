-- A priced boost, held for 30 minutes. used flips in the same statement that inserts the boost.
create table if not exists boost_quotes (
  id text primary key,
  chain text not null,
  coin text not null,
  hours integer not null,
  native_raw text not null,
  expires_at timestamptz not null,
  used boolean not null default false
);
