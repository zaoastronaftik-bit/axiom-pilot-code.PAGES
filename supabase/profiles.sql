-- AxiomPilotCode website user profiles.
-- Run this migration on a DEDICATED Supabase project, not another product database.
-- Plan changes must be performed by trusted server-side administration only.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Users can read own plan" on public.profiles;
create policy "Users can read own plan"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, plan)
  values (new.id, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists new_user_profile on auth.users;
create trigger new_user_profile
after insert on auth.users
for each row execute function public.create_user_profile();

-- Backfill existing accounts when installing on a new site-specific project.
insert into public.profiles (id, plan)
select id, 'free' from auth.users
on conflict (id) do nothing;

comment on table public.profiles is
  'AxiomPilotCode account profiles. No client-side privilege to change plans.';
