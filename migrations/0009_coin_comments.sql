-- Comments on Ferzan coins reuse the posts table; three reports from different wallets hide a comment.
create table if not exists comment_reports (
  post_id     bigint not null,
  reporter    text not null,
  created_at  timestamptz not null default now(),
  primary key (post_id, reporter)
);

create index if not exists posts_chain_coin_idx on posts (chain, contract, created_at desc);
create index if not exists posts_author_idx on posts (author, created_at desc);
