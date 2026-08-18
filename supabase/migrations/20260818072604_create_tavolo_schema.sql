create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  recipe_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.meal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null,
  cooked_at date not null,
  rating smallint check (rating between 1 and 5),
  memo text,
  ingredient_groups jsonb not null default '[]'::jsonb,
  recipe_steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint meal_records_meal_owner_fk
    foreign key (meal_id, user_id)
    references public.meals (id, user_id)
    on delete cascade
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.meal_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, meal_id, tag_id),
  constraint meal_tags_meal_owner_fk
    foreign key (meal_id, user_id)
    references public.meals (id, user_id)
    on delete cascade,
  constraint meal_tags_tag_owner_fk
    foreign key (tag_id, user_id)
    references public.tags (id, user_id)
    on delete cascade
);

create table public.recipe_scraps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (char_length(trim(url)) > 0),
  title text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_record_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type like 'image/%'),
  byte_size bigint not null check (byte_size > 0),
  kind text not null check (kind in ('finished', 'step')),
  recipe_step_id text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint media_record_owner_fk
    foreign key (meal_record_id, user_id)
    references public.meal_records (id, user_id)
    on delete cascade,
  constraint media_step_kind_check
    check (
      (kind = 'finished' and recipe_step_id is null)
      or (kind = 'step' and recipe_step_id is not null)
    )
);

create index meal_records_user_cooked_at_idx
  on public.meal_records (user_id, cooked_at desc, created_at desc);
create index meals_user_id_idx
  on public.meals (user_id);
create index meal_records_user_meal_idx
  on public.meal_records (user_id, meal_id);
create index meal_records_meal_id_user_id_idx
  on public.meal_records (meal_id, user_id);
create index meal_tags_user_meal_idx
  on public.meal_tags (user_id, meal_id);
create index meal_tags_meal_id_user_id_idx
  on public.meal_tags (meal_id, user_id);
create index meal_tags_user_tag_idx
  on public.meal_tags (user_id, tag_id);
create index meal_tags_tag_id_user_id_idx
  on public.meal_tags (tag_id, user_id);
create index recipe_scraps_user_updated_at_idx
  on public.recipe_scraps (user_id, updated_at desc);
create index media_user_record_idx
  on public.media (user_id, meal_record_id);
create index media_meal_record_id_user_id_idx
  on public.media (meal_record_id, user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.meals,
  public.meal_records,
  public.tags,
  public.meal_tags,
  public.recipe_scraps,
  public.media
to authenticated;

alter table public.meals enable row level security;
alter table public.meal_records enable row level security;
alter table public.tags enable row level security;
alter table public.meal_tags enable row level security;
alter table public.recipe_scraps enable row level security;
alter table public.media enable row level security;

create policy "Users manage own meals"
on public.meals
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own meal records"
on public.meal_records
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own tags"
on public.tags
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own meal tags"
on public.meal_tags
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own recipe scraps"
on public.recipe_scraps
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own media metadata"
on public.media
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-media',
  'meal-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "Users read own meal media files"
on storage.objects
for select to authenticated
using (
  bucket_id = 'meal-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users upload own meal media files"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'meal-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users update own meal media files"
on storage.objects
for update to authenticated
using (
  bucket_id = 'meal-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'meal-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users delete own meal media files"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'meal-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
