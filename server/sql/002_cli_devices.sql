-- Run after 001_profiles.sql and the Better Auth database migration.
-- Plain device codes and access tokens are NEVER stored, only SHA-256 digests.
create table if not exists public.axiom_device_authorizations (
  device_code_hash char(64) primary key,
  user_code varchar(16) not null unique,
  status varchar(12) not null default 'pending' check (status in ('pending','approved','used','denied')),
  user_id text references public."user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index if not exists idx_axiom_devices_expiry on public.axiom_device_authorizations(expires_at);
create table if not exists public.axiom_cli_tokens (
  id uuid primary key,
  user_id text not null references public."user"(id) on delete cascade,
  token_hash char(64) not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz
);
create index if not exists idx_axiom_cli_tokens_user on public.axiom_cli_tokens(user_id);
alter table public.axiom_device_authorizations enable row level security;
alter table public.axiom_cli_tokens enable row level security;
revoke all on public.axiom_device_authorizations from anon, authenticated;
revoke all on public.axiom_cli_tokens from anon, authenticated;
-- The backend DB owner is the only writer. Never grant client-side write access.
