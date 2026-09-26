-- Per-visitor request counts for the relay, one row per visitor, bucket and minute.
-- `key` is a salted hash of the visitor address, never the address itself.
create table if not exists relay_hits (
  key     text not null,
  minute  bigint not null,
  hits    integer not null default 0,
  primary key (key, minute)
);
