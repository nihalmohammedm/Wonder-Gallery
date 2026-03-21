create extension if not exists pgcrypto;
create extension if not exists vector;

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
  embedding vector(128) not null,
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
  embedding vector(128) not null,
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

create index if not exists photo_faces_gallery_id_idx
  on public.photo_faces(gallery_id);

create index if not exists photo_faces_photo_id_idx
  on public.photo_faces(photo_id);

create index if not exists photo_faces_embedding_hnsw_idx
  on public.photo_faces using hnsw (embedding vector_l2_ops);

create index if not exists person_face_encodings_gallery_id_idx
  on public.person_face_encodings(gallery_id);

create index if not exists person_face_encodings_person_id_idx
  on public.person_face_encodings(person_id);

create index if not exists person_face_encodings_embedding_hnsw_idx
  on public.person_face_encodings using hnsw (embedding vector_l2_ops);

create or replace function public.gallery_photo_stats(target_gallery_id uuid)
returns table (
  photo_count bigint,
  indexed_photo_count bigint,
  face_count bigint
)
language sql
stable
as $$
  with photo_counts as (
    select count(*)::bigint as photo_count
    from public.photos
    where gallery_id = target_gallery_id
  ),
  face_counts as (
    select
      count(*)::bigint as face_count,
      count(distinct photo_id)::bigint as indexed_photo_count
    from public.photo_faces
    where gallery_id = target_gallery_id
  )
  select
    photo_counts.photo_count,
    face_counts.indexed_photo_count,
    face_counts.face_count
  from photo_counts
  cross join face_counts;
$$;

create or replace function public.match_gallery_photo_faces(
  target_gallery_id uuid,
  query_embedding vector(128),
  match_count integer default 200,
  distance_threshold double precision default 0.51
)
returns table (
  photo_id uuid,
  face_id uuid,
  face_index integer,
  distance double precision
)
language sql
stable
as $$
  with nearest_faces as (
    select
      id as face_id,
      photo_id,
      face_index,
      (embedding <-> query_embedding)::double precision as distance
    from public.photo_faces
    where gallery_id = target_gallery_id
      and embedding is not null
    order by embedding <-> query_embedding
    limit greatest(match_count, 1)
  ),
  best_per_photo as (
    select distinct on (photo_id)
      photo_id,
      face_id,
      face_index,
      distance
    from nearest_faces
    where distance <= distance_threshold
    order by photo_id, distance asc
  )
  select
    photo_id,
    face_id,
    face_index,
    distance
  from best_per_photo
  order by distance asc;
$$;

create or replace function public.match_gallery_persons(
  target_gallery_id uuid,
  query_embedding vector(128),
  match_count integer default 50,
  distance_threshold double precision default 0.51
)
returns table (
  person_id uuid,
  encoding_id uuid,
  distance double precision
)
language sql
stable
as $$
  with nearest_encodings as (
    select
      id as encoding_id,
      person_id,
      (embedding <-> query_embedding)::double precision as distance
    from public.person_face_encodings
    where gallery_id = target_gallery_id
      and embedding is not null
    order by embedding <-> query_embedding
    limit greatest(match_count, 1)
  ),
  best_per_person as (
    select distinct on (person_id)
      person_id,
      encoding_id,
      distance
    from nearest_encodings
    where distance <= distance_threshold
    order by person_id, distance asc
  )
  select
    person_id,
    encoding_id,
    distance
  from best_per_person
  order by distance asc;
$$;

create or replace function public.gallery_photo_stats_all()
returns table (
  gallery_id uuid,
  photo_count bigint,
  indexed_photo_count bigint,
  face_count bigint
)
language sql
stable
as $$
  with photo_counts as (
    select gallery_id, count(*)::bigint as photo_count
    from public.photos
    group by gallery_id
  ),
  face_counts as (
    select
      gallery_id,
      count(*)::bigint as face_count,
      count(distinct photo_id)::bigint as indexed_photo_count
    from public.photo_faces
    group by gallery_id
  )
  select
    galleries.id as gallery_id,
    coalesce(photo_counts.photo_count, 0)::bigint as photo_count,
    coalesce(face_counts.indexed_photo_count, 0)::bigint as indexed_photo_count,
    coalesce(face_counts.face_count, 0)::bigint as face_count
  from public.galleries as galleries
  left join photo_counts on photo_counts.gallery_id = galleries.id
  left join face_counts on face_counts.gallery_id = galleries.id;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger galleries_set_updated_at
before update on public.galleries
for each row
execute procedure public.set_updated_at();

create trigger persons_set_updated_at
before update on public.persons
for each row
execute procedure public.set_updated_at();

create trigger photos_set_updated_at
before update on public.photos
for each row
execute procedure public.set_updated_at();

alter table public.galleries enable row level security;
alter table public.persons enable row level security;
alter table public.photos enable row level security;
alter table public.photo_faces enable row level security;
alter table public.person_face_encodings enable row level security;
alter table public.jobs enable row level security;

create policy jobs_authenticated_select
on public.jobs
for select
to authenticated
using (true);

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
