-- ============================================================
-- Organizador Académico - Esquema Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Categorías personalizables (Regular 1, Sumativas, Lecturas, etc.)
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  color text not null default '#3E7C7C',
  created_at timestamptz not null default now()
);

-- Eventos: fechas de prueba, entregas, tareas, feriados, días sin clase, etc.
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  categoria_id uuid references categorias(id) on delete set null,
  titulo text not null,
  descripcion text,
  fecha date not null,
  tipo text not null check (tipo in ('evaluacion','tarea','entrega','presentacion','feriado','sin_clases','lectura','otro')),
  origen text not null default 'manual' check (origen in ('manual','imagen')),
  recurrente boolean not null default false,
  created_at timestamptz not null default now()
);

-- Archivos subidos vinculados a un evento (ej. la tarea que entregaste)
create table if not exists archivos_subidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evento_id uuid references eventos(id) on delete set null,
  nombre text not null,
  storage_path text not null,
  tipo_archivo text not null,
  plataforma text not null default 'supabase' check (plataforma in ('supabase','drive','dropbox')),
  url_externa text,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_eventos_user_fecha on eventos(user_id, fecha);
create index if not exists idx_archivos_evento on archivos_subidos(evento_id);

-- Row Level Security: cada usuario solo ve lo suyo
alter table categorias enable row level security;
alter table eventos enable row level security;
alter table archivos_subidos enable row level security;

create policy "categorias_propias" on categorias
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "eventos_propios" on eventos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "archivos_propios" on archivos_subidos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bucket de storage para archivos subidos
insert into storage.buckets (id, name, public)
values ('archivos-usuario', 'archivos-usuario', false)
on conflict (id) do nothing;

create policy "acceso_archivos_propios" on storage.objects
  for all using (bucket_id = 'archivos-usuario' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'archivos-usuario' and auth.uid()::text = (storage.foldername(name))[1]);
