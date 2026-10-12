-- Wallet that the site sent this quote's payment from. Empty when the visitor pastes a hash.
alter table boost_quotes add column if not exists payer text;
