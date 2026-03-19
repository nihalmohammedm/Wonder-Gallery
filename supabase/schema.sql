create extension if not exists pgcrypto;

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  drive_links text[] not null default '{}',
  drive_folder_ids text[] not null default '{}',
  common_access_pin text,
  header_image_path text,
  personal_accent_color text,
  common_accent_color text,
  drive_refresh_token text,
  drive_connected_email text,
  drive_connected_name text,
  is_public boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null,
  face_hash text,
  face_profile jsonb,
  reference_image_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  reference_image_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  title text not null,
  drive_link text not null,
  drive_file_id text not null,
  thumbnail_url text not null,
  storage_bucket text,
  storage_object_path text,
  source_mime_type text,
  drive_modified_time timestamptz,
  drive_checksum text,
  drive_file_size_bytes bigint,
  image_width integer,
  image_height integer,
  face_index jsonb,
  captured_at date,
  guest_ids uuid[] not null default '{}',
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.photo_faces (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  face_index integer not null,
  box_top integer not null,
  box_right integer not null,
  box_bottom integer not null,
  box_left integer not null,
  encoding jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.person_face_encodings (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  source text not null default 'selfie',
  source_image_path text,
  source_mime_type text,
  box_top integer not null,
  box_right integer not null,
  box_bottom integer not null,
  box_left integer not null,
  encoding jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'queued',
  gallery_id uuid references public.galleries(id) on delete cascade,
  gallery_slug text,
  photo_id uuid references public.photos(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  requested_by text,
  input jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists photos_gallery_drive_file_id_idx
  on public.photos(gallery_id, drive_file_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists galleries_set_updated_at on public.galleries;
create trigger galleries_set_updated_at
before update on public.galleries
for each row
execute procedure public.set_updated_at();

drop trigger if exists guests_set_updated_at on public.guests;
create trigger guests_set_updated_at
before update on public.guests
for each row
execute procedure public.set_updated_at();

drop trigger if exists persons_set_updated_at on public.persons;
create trigger persons_set_updated_at
before update on public.persons
for each row
execute procedure public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
before update on public.photos
for each row
execute procedure public.set_updated_at();

alter table public.galleries enable row level security;
alter table public.guests enable row level security;
alter table public.persons enable row level security;
alter table public.photos enable row level security;
alter table public.photo_faces enable row level security;
alter table public.person_face_encodings enable row level security;
alter table public.jobs enable row level security;

drop policy if exists jobs_authenticated_select on public.jobs;
create policy jobs_authenticated_select
on public.jobs
for select
to authenticated
using (true);

drop policy if exists jobs_anon_face_match_select on public.jobs;
create policy jobs_anon_face_match_select
on public.jobs
for select
to anon
using (type = 'face_match');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end
$$;
