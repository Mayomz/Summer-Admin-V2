create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "Allow public read app state" on public.app_state;
drop policy if exists "Allow public write app state" on public.app_state;

create policy "Allow public read app state"
on public.app_state
for select
to anon
using (true);

create policy "Allow public write app state"
on public.app_state
for all
to anon
using (true)
with check (true);
