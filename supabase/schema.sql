create extension if not exists pgcrypto;

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  drive_link text not null,
  drive_folder_id text,
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

alter table public.galleries add column if not exists drive_refresh_token text;
alter table public.galleries add column if not exists drive_connected_email text;
alter table public.galleries add column if not exists drive_connected_name text;
alter table public.galleries add column if not exists header_image_path text;
alter table public.galleries add column if not exists common_access_pin text;
alter table public.galleries add column if not exists personal_accent_color text;
alter table public.galleries add column if not exists common_accent_color text;
alter table public.galleries add column if not exists drive_links text[] not null default '{}';
alter table public.galleries add column if not exists drive_folder_ids text[] not null default '{}';

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

alter table public.photos add column if not exists storage_bucket text;
alter table public.photos add column if not exists storage_object_path text;
alter table public.photos add column if not exists source_mime_type text;
alter table public.photos add column if not exists drive_modified_time timestamptz;
alter table public.photos add column if not exists drive_checksum text;
alter table public.photos add column if not exists drive_file_size_bytes bigint;
alter table public.photos add column if not exists image_width integer;
alter table public.photos add column if not exists image_height integer;
alter table public.photos add column if not exists face_index jsonb;
alter table public.photos add column if not exists source text not null default 'manual';
alter table public.persons add column if not exists email text;
alter table public.persons add column if not exists phone text;
alter table public.persons add column if not exists company text;

create unique index if not exists photos_gallery_drive_file_id_idx on public.photos(gallery_id, drive_file_id);

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
