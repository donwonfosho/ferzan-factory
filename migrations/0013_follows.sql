-- Creators a signed-in account follows. The address is public. No wallet key.
create table if not exists follows (
  account text not null,
  creator text not null,
  primary key (account, creator)
);
