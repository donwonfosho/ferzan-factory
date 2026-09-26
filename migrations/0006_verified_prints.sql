-- Trades are now read from the chain. Each print remembers its transaction and
-- log position, so the same on-chain trade can only be recorded once.
alter table prints add column if not exists tx_hash text not null default '';
alter table prints add column if not exists log_index integer not null default -1;
create unique index if not exists prints_tx_log_uidx on prints (tx_hash, log_index) where tx_hash <> '';
