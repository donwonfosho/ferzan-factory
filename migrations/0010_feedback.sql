-- Beta feedback and coin reports. No visitor address, no wallet, no key.
create table if not exists feedback (
  id         bigserial primary key,
  kind       text not null,
  category   text not null,
  message    text not null,
  contact    text not null default '',
  path       text not null default '',
  version    text not null default '',
  coin       text not null default '',
  created_at timestamptz not null default now()
);

-- Rate limit. `key` is a salted hash of the visitor address, never the address.
create table if not exists feedback_hits (
  key    text not null,
  hour   bigint not null,
  hits   integer not null default 0,
  primary key (key, hour)
);
