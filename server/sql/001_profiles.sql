-- Run AFTER Better Auth schema migrations against a dedicated AxiomPilotCode database.
-- Better Auth PostgreSQL uses a text-keyed public."user" table, not Supabase auth.users.
create table if not exists public.axiom_profiles (
  user_id text primary key references public."user"(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  created_at timestamptz not null default now()
);
-- Restrict direct Data API exposure: this table is reachable ONLY from our server-side SQL user.
alter table public.axiom_profiles enable row level security;
revoke all on table public.axiom_profiles from anon, authenticated;
-- Do not create public browser policies. The server-side connection owns profile operations.
-- NOTE: db connection role must have the appropriate permissions/bypass RLS;
-- using the project's dedicated DB owner in Vercel is the intended deployment.
