-- Coins a signed-in account is watching. No wallet address and no private key.
create table if not exists watchlist (
  account text not null,
  chain text not null,
  token text not null,
  symbol text not null,
  path text not null,
  primary key (account, chain, token)
);
