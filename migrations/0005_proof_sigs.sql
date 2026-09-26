-- Signatures already used for profile saves and thread posts (replay guard).
-- Rows older than 15 minutes are deleted on each use; signatures expire after 5.
create table if not exists proof_sigs (
  sig         text primary key,
  created_at  timestamptz not null default now()
);
create index if not exists proof_sigs_created_at on proof_sigs (created_at);
