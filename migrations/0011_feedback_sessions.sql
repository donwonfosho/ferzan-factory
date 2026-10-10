-- Short-lived admin sessions. The token is random. The password is not stored.
create table if not exists feedback_sessions (
  token      text primary key,
  expires_at timestamptz not null
);
